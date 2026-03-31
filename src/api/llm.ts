import { requestUrl } from "obsidian";
import {
  Attachment,
  Message,
  CodexRequestParams,
  CodexRequestResponse,
  ModelTestParams,
  ModelTestResult,
} from "../types";
import {
  resolveCodexAuthState,
  refreshCodexAccessToken,
} from "./codex";

const DEFAULT_CODEX_API_BASE =
  "https://chatgpt.com/backend-api/codex/responses";
const CODEX_REFRESH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const TRUSTED_API_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.deepseek.com",
  "openrouter.ai",
  "api.groq.com",
  "api.moonshot.cn",
  "api.siliconflow.cn",
  "chatgpt.com",
  "localhost",
  "127.0.0.1",
]);

export async function callLlmApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  attachments: Attachment[] = [],
  authMode: "api_key" | "codex_auth" = "api_key"
): Promise<string> {
  if (!apiUrl) {
    throw new Error("API URL is empty. Please configure it in settings.");
  }
  if (authMode !== "codex_auth" && !apiKey) {
    throw new Error("API Key is empty. Please configure it in settings.");
  }

  const isGoogleGemini = apiUrl.includes("generativelanguage.googleapis.com");
  const isAnthropic = apiUrl.includes("api.anthropic.com");
  const isOfficialOpenAI = isOfficialOpenAiApiUrl(apiUrl);
  const isCodexResponses =
    authMode === "codex_auth" ||
    apiUrl.includes("chatgpt.com/backend-api/codex/responses");

  if (isCodexResponses) {
    const auth = await resolveCodexAuthState();
    let response = await postCodexRequest({
      apiUrl,
      model,
      messages,
      token: auth.accessToken,
    });

    if (response.status === 401 && auth.refreshToken) {
      const refreshedToken = await refreshCodexAccessToken(
        auth.refreshToken,
        auth.authPath
      );
      response = await postCodexRequest({
        apiUrl,
        model,
        messages,
        token: refreshedToken,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        response.text || `Codex request failed, status ${response.status}`
      );
    }

    if (
      typeof response.text === "string" &&
      (response.text.includes("data:") || response.text.includes("event:"))
    ) {
      return extractCodexTextFromSSE(response.text);
    }

    try {
      return extractCodexText(JSON.parse(response.text));
    } catch (_error) {
      throw new Error(
        response.text ||
          "Invalid non-streaming response format from Codex"
      );
    }
  } else if (isGoogleGemini) {
    return handleGoogleGeminiApi(
      apiUrl,
      apiKey,
      model,
      messages,
      attachments
    );
  } else if (isAnthropic) {
    return handleAnthropicApi(apiUrl, apiKey, model, messages, attachments);
  } else {
    return handleOpenAiCompatibleApi(
      apiUrl,
      apiKey,
      model,
      messages,
      attachments,
      isOfficialOpenAI
    );
  }
}

async function handleGoogleGeminiApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  attachments: Attachment[]
): Promise<string> {
  let finalUrl = apiUrl.trim().replace(/\/$/, "");
  if (!finalUrl.includes("/models/")) {
    finalUrl += `/v1beta/models/${model}:generateContent`;
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m, index) => {
    const parts: any[] = [{ text: m.content }];
    if (
      m.role === "user" &&
      index === chatMsgs.length - 1 &&
      attachments.length > 0
    ) {
      attachments.forEach((att) => {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.data,
          },
        });
      });
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const payload: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4000,
    },
  };

  if (systemMsg) {
    payload.system_instruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  try {
    const response = await requestUrl({
      url: finalUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      throw: true,
    });

    if (
      response.json &&
      response.json.candidates &&
      response.json.candidates.length > 0
    ) {
      const parts = response.json.candidates[0].content.parts;
      return parts.map((p: any) => p.text).join("");
    } else {
      throw new Error(response.json?.error?.message || "Invalid response from Google API");
    }
  } catch (e: any) {
    console.error("Gemini API Error:", e);
    throw new Error(e.message || "Gemini Request Failed");
  }
}

async function handleAnthropicApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  attachments: Attachment[]
): Promise<string> {
  let finalUrl = apiUrl.trim();
  if (!finalUrl.endsWith("/v1/messages")) {
    finalUrl = finalUrl.replace(/\/$/, "") + "/v1/messages";
  }

  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);

  const chatMessages = buildAnthropicMessages(messages, attachments);

  const payload: any = {
    model,
    messages: chatMessages,
    max_tokens: 4000,
  };

  if (systemMessages.length > 0) {
    payload.system = systemMessages.join("\n\n");
  }

  try {
    const response = await requestUrl({
      url: finalUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      throw: true,
    });

    if (response.json && Array.isArray(response.json.content)) {
      return response.json.content
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("");
    } else {
      throw new Error(
        response.json?.error?.message || "Invalid response from Anthropic API"
      );
    }
  } catch (e: any) {
    console.error("Anthropic API Error:", e);
    throw new Error(e.message || "Anthropic Request Failed");
  }
}

async function handleOpenAiCompatibleApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  attachments: Attachment[],
  isOfficialOpenAI: boolean
): Promise<string> {
  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const payload: any = isOfficialOpenAI
    ? {
        model,
        messages: buildOpenAiChatMessages(messages, attachments),
        temperature: 0.7,
      }
    : {
        model,
        messages,
        temperature: 0.7,
      };

  let finalUrl = apiUrl.trim();
  if (!finalUrl.endsWith("/chat/completions")) {
    finalUrl = finalUrl.replace(/\/$/, "") + "/chat/completions";
  }

  try {
    const response = await requestUrl({
      url: finalUrl,
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify(payload),
      throw: true,
    });

    if (
      response.json &&
      response.json.choices &&
      response.json.choices.length > 0
    ) {
      return response.json.choices[0].message.content;
    } else {
      throw new Error("Invalid response format from API");
    }
  } catch (e: any) {
    console.error("LLM API Error:", e);
    throw new Error(e.message || "API Request Failed");
  }
}

function buildAnthropicMessages(messages: Message[], attachments: Attachment[]) {
  const pdfAttachments = attachments.filter(
    (attachment) => attachment.mimeType === "application/pdf"
  );
  const lastUserIndex = findLastUserMessageIndex(messages);

  return messages
    .filter((message) => message.role !== "system")
    .map((message, index) => {
      const content: any[] = [];

      if (
        message.role === "user" &&
        index === lastUserIndex &&
        pdfAttachments.length > 0
      ) {
        for (const attachment of pdfAttachments) {
          content.push({
            type: "document",
            source: {
              type: "base64",
              media_type: attachment.mimeType,
              data: attachment.data,
            },
          });
        }
      }

      content.push({
        type: "text",
        text: message.content,
      });

      return {
        role: message.role,
        content,
      };
    });
}

function buildOpenAiChatMessages(messages: Message[], attachments: Attachment[]) {
  const pdfAttachments = attachments.filter(
    (attachment) => attachment.mimeType === "application/pdf"
  );
  const lastUserIndex = findLastUserMessageIndex(messages);

  return messages.map((message, index) => {
    if (
      message.role !== "user" ||
      index !== lastUserIndex ||
      pdfAttachments.length === 0
    ) {
      return message;
    }

    const content: any[] = pdfAttachments.map((attachment) => ({
      type: "file",
      file: {
        filename: attachment.name,
        file_data: `data:${attachment.mimeType};base64,${attachment.data}`,
      },
    }));

    content.push({
      type: "text",
      text: message.content,
    });

    return {
      role: message.role,
      content,
    };
  });
}

function findLastUserMessageIndex(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const msg = messages[index];
    if (msg && msg.role === "user") return index;
  }
  return -1;
}

export async function postCodexRequest(
  params: CodexRequestParams
): Promise<CodexRequestResponse> {
  const finalUrl = normalizeCodexApiUrl(params.apiUrl);
  const payload = buildCodexPayload(params.model, params.messages);

  const response = await requestUrl({
    url: finalUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(payload),
    throw: false,
  });

  return {
    status: response.status,
    text: response.text,
  };
}

function buildCodexPayload(model: string, messages: Message[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      type: "message",
      role: message.role,
      content: message.content,
    }));

  return {
    model,
    input,
    ...(instructions ? { instructions } : {}),
    store: false,
    stream: true,
  };
}

function extractCodexText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (
        (part?.type === "output_text" || part?.type === "text") &&
        typeof part?.text === "string"
      ) {
        parts.push(part.text);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("");
  }

  throw new Error("Invalid response format from Codex");
}

function extractCodexTextFromSSE(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const parts: string[] = [];
  let completedText = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const parsed = JSON.parse(payload);

      if (typeof parsed.delta === "string" && parsed.delta) {
        parts.push(parsed.delta);
      }

      if (typeof parsed.response?.output_text === "string" && parsed.response.output_text) {
        completedText = parsed.response.output_text;
      }

      if (!completedText) {
        const output = Array.isArray(parsed.response?.output)
          ? parsed.response.output
          : [];
        for (const item of output) {
          const content = Array.isArray(item?.content) ? item.content : [];
          for (const part of content) {
            if (
              (part?.type === "output_text" || part?.type === "text") &&
              typeof part?.text === "string"
            ) {
              completedText += part.text;
            }
          }
        }
      }
    } catch (_error) {
      continue;
    }
  }

  const text = (completedText || parts.join("")).trim();
  if (!text) {
    throw new Error("Invalid streaming response format from Codex");
  }

  return text;
}

function normalizeCodexApiUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  return trimmed || DEFAULT_CODEX_API_BASE;
}

export function isOfficialOpenAiApiUrl(apiUrl: string): boolean {
  return apiUrl.includes("api.openai.com");
}

export function isLikelyTrustedApiUrl(apiUrl: string): boolean {
  const trimmed = (apiUrl || "").trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    if (TRUSTED_API_HOSTS.has(hostname)) return true;
    if (
      hostname.endsWith(".openai.com") ||
      hostname.endsWith(".anthropic.com") ||
      hostname.endsWith(".googleapis.com")
    )
      return true;
    if (hostname.endsWith(".local")) return true;

    return false;
  } catch (_error) {
    return false;
  }
}

export function getApiUrlRiskWarning(apiUrl: string): string {
  const trimmed = (apiUrl || "").trim();
  if (!trimmed || isLikelyTrustedApiUrl(trimmed)) return "";

  return `This API URL is not a built-in provider or localhost:
${trimmed}
Sending a request may expose your prompt, attached note or PDF content, and API key to that service.`;
}

export async function testModelConnection(
  params: ModelTestParams
): Promise<ModelTestResult> {
  const response = await callLlmApi(
    params.apiUrl,
    params.apiKey,
    params.model,
    [
      {
        role: "system",
        content: "You are a connection test. Reply with only: OK",
      },
      {
        role: "user",
        content: "Reply with only: OK",
      },
    ],
    [],
    params.authMode || "api_key"
  );

  return {
    preview: response.trim().slice(0, 120) || "(empty response)",
  };
}
