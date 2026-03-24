import { requestUrl } from 'obsidian';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface FileAttachment {
    name: string;
    mimeType: string;
    data: string; // base64
}

type AuthMode = 'api_key' | 'codex_auth';

interface CodexAuthJson {
    tokens?: {
        access_token?: string;
        refresh_token?: string;
    };
    last_refresh?: string;
}

const DEFAULT_CODEX_API_BASE = 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export async function callLlmApi(
    apiUrl: string, 
    apiKey: string, 
    model: string, 
    messages: ChatMessage[],
    attachments: FileAttachment[] = [],
    authMode: AuthMode = 'api_key'
): Promise<string> {
    if (!apiUrl) throw new Error('API URL is empty. Please configure it in settings.');
    if (authMode !== 'codex_auth' && !apiKey) throw new Error('API Key is empty. Please configure it in settings.');

    const isGoogleGemini = apiUrl.includes('generativelanguage.googleapis.com');
    const isAnthropic = apiUrl.includes('api.anthropic.com');
    const isCodexResponses = authMode === 'codex_auth' || apiUrl.includes('chatgpt.com/backend-api/codex/responses');

    if (isCodexResponses) {
        const auth = await resolveCodexAuthState();
        let response = await postCodexRequest({
            apiUrl,
            model,
            messages,
            token: auth.accessToken
        });

        if (response.status === 401 && auth.refreshToken) {
            const refreshedToken = await refreshCodexAccessToken(auth.refreshToken, auth.authPath);
            response = await postCodexRequest({
                apiUrl,
                model,
                messages,
                token: refreshedToken
            });
        }

        if (response.status < 200 || response.status >= 300) {
            throw new Error(response.text || `Codex request failed, status ${response.status}`);
        }

        if (typeof response.text === 'string' && (response.text.includes('data:') || response.text.includes('event:'))) {
            return extractCodexTextFromSSE(response.text);
        }

        try {
            return extractCodexText(JSON.parse(response.text));
        } catch (_error) {
            throw new Error(response.text || 'Invalid non-streaming response format from Codex');
        }
    } else if (isGoogleGemini) {
        // Handle Google Gemini API with Native PDF support
        let finalUrl = apiUrl.trim().replace(/\/$/, '');
        if (!finalUrl.includes('/models/')) {
            finalUrl += `/v1beta/models/${model}:generateContent?key=${apiKey}`;
        } else if (!finalUrl.includes('?key=')) {
            finalUrl += `?key=${apiKey}`;
        }

        const systemMsg = messages.find(m => m.role === 'system');
        const chatMsgs = messages.filter(m => m.role !== 'system');

        const contents = chatMsgs.map((m, index) => {
            const parts: any[] = [{ text: m.content }];
            
            // For the VERY LAST user message, attach all native files
            if (m.role === 'user' && index === chatMsgs.length - 1 && attachments.length > 0) {
                attachments.forEach(att => {
                    parts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: att.data
                        }
                    });
                });
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        const payload: any = {
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000
            }
        };

        if (systemMsg) {
            payload.system_instruction = {
                parts: [{ text: systemMsg.content }]
            };
        }

        try {
            const response = await requestUrl({
                url: finalUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                throw: true
            });

            if (response.json && response.json.candidates && response.json.candidates.length > 0) {
                const parts = response.json.candidates[0].content.parts;
                return parts.map((p: any) => p.text).join('');
            } else {
                throw new Error(response.json?.error?.message || 'Invalid response from Google API');
            }
        } catch (e: any) {
            console.error('Gemini API Error:', e);
            throw new Error(e.message || 'Gemini Request Failed');
        }
    } else if (isAnthropic) {
        let finalUrl = apiUrl.trim();
        if (!finalUrl.endsWith('/v1/messages')) {
            finalUrl = finalUrl.replace(/\/$/, '') + '/v1/messages';
        }

        const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content.trim()).filter(Boolean);
        const chatMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role,
                content: [{ type: 'text', text: m.content }]
            }));

        const payload: any = {
            model,
            messages: chatMessages,
            max_tokens: 4000
        };

        if (systemMessages.length > 0) {
            payload.system = systemMessages.join('\n\n');
        }

        try {
            const response = await requestUrl({
                url: finalUrl,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(payload),
                throw: true
            });

            if (response.json && Array.isArray(response.json.content)) {
                return response.json.content
                    .filter((part: any) => part.type === 'text')
                    .map((part: any) => part.text)
                    .join('');
            } else {
                throw new Error(response.json?.error?.message || 'Invalid response from Anthropic API');
            }
        } catch (e: any) {
            console.error('Anthropic API Error:', e);
            throw new Error(e.message || 'Anthropic Request Failed');
        }
    } else {
        // Handle OpenAI-compatible API
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        const payload = {
            model,
            messages,
            temperature: 0.7
        };

        let finalUrl = apiUrl.trim();
        if (!finalUrl.endsWith('/chat/completions')) {
            finalUrl = finalUrl.replace(/\/$/, '') + '/chat/completions';
        }

        try {
            const response = await requestUrl({
                url: finalUrl,
                method: 'POST',
                headers: defaultHeaders,
                body: JSON.stringify(payload),
                throw: true
            });

            if (response.json && response.json.choices && response.json.choices.length > 0) {
                return response.json.choices[0].message.content;
            } else {
                throw new Error('Invalid response format from API');
            }
        } catch (e: any) {
            console.error('LLM API Error:', e);
            throw new Error(e.message || 'API Request Failed');
        }
    }
}

async function postCodexRequest(params: {
    apiUrl: string;
    model: string;
    messages: ChatMessage[];
    token: string;
}) {
    const finalUrl = normalizeCodexApiUrl(params.apiUrl);
    const payload = buildCodexPayload(params.model, params.messages);

    const response = await requestUrl({
        url: finalUrl,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${params.token}`
        },
        body: JSON.stringify(payload),
        throw: false
    });

    return {
        status: response.status,
        text: response.text
    };
}

function buildCodexPayload(model: string, messages: ChatMessage[]) {
    const instructions = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const input = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
            type: 'message',
            role: message.role,
            content: message.content
        }));

    return {
        model,
        input,
        ...(instructions ? { instructions } : {}),
        store: false,
        stream: true
    };
}

function extractCodexText(data: any): string {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
        return data.output_text;
    }

    const output = Array.isArray(data?.output) ? data.output : [];
    const parts: string[] = [];

    for (const item of output) {
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const part of content) {
            if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') {
                parts.push(part.text);
            }
        }
    }

    if (parts.length > 0) {
        return parts.join('');
    }

    throw new Error('Invalid response format from Codex');
}

function extractCodexTextFromSSE(raw: string): string {
    const lines = raw.split(/\r?\n/);
    const parts: string[] = [];
    let completedText = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
            const parsed = JSON.parse(payload) as any;

            if (typeof parsed.delta === 'string' && parsed.delta) {
                parts.push(parsed.delta);
            }

            if (typeof parsed.response?.output_text === 'string' && parsed.response.output_text) {
                completedText = parsed.response.output_text;
            }

            if (!completedText) {
                const output = Array.isArray(parsed.response?.output) ? parsed.response.output : [];
                for (const item of output) {
                    const content = Array.isArray(item?.content) ? item.content : [];
                    for (const part of content) {
                        if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') {
                            completedText += part.text;
                        }
                    }
                }
            }
        } catch (_error) {
            continue;
        }
    }

    const text = (completedText || parts.join('')).trim();
    if (!text) {
        throw new Error('Invalid streaming response format from Codex');
    }

    return text;
}

function normalizeCodexApiUrl(apiUrl: string): string {
    const trimmed = apiUrl.trim();
    return trimmed || DEFAULT_CODEX_API_BASE;
}

async function resolveCodexAuthState() {
    const authPath = resolveCodexAuthPath();
    const auth = await loadCodexAuthJson(authPath);
    const accessToken = auth?.tokens?.access_token?.trim() || '';
    const refreshToken = auth?.tokens?.refresh_token?.trim() || '';

    if (accessToken) {
        return { accessToken, refreshToken, authPath };
    }

    if (refreshToken) {
        const refreshedToken = await refreshCodexAccessToken(refreshToken, authPath);
        return { accessToken: refreshedToken, refreshToken, authPath };
    }

    throw new Error('Codex auth token not found. Please run `codex login` and ensure ~/.codex/auth.json is available.');
}

export async function testCodexAuthState(): Promise<{
    authPath: string;
    tokenSource: 'access_token' | 'refresh_token';
    lastRefresh?: string;
}> {
    const authPath = resolveCodexAuthPath();
    const auth = await loadCodexAuthJson(authPath);
    const accessToken = auth?.tokens?.access_token?.trim() || '';
    const refreshToken = auth?.tokens?.refresh_token?.trim() || '';

    if (accessToken) {
        return {
            authPath,
            tokenSource: 'access_token',
            lastRefresh: auth?.last_refresh
        };
    }

    if (refreshToken) {
        await refreshCodexAccessToken(refreshToken, authPath);
        const refreshed = await loadCodexAuthJson(authPath);
        return {
            authPath,
            tokenSource: 'refresh_token',
            lastRefresh: refreshed?.last_refresh
        };
    }

    throw new Error('No Codex token found in ~/.codex/auth.json. Run `codex login` first.');
}

export async function testModelConnection(params: {
    apiUrl: string;
    apiKey: string;
    model: string;
    authMode?: AuthMode;
}): Promise<{ preview: string }> {
    const response = await callLlmApi(
        params.apiUrl,
        params.apiKey,
        params.model,
        [
            {
                role: 'system',
                content: 'You are a connection test. Reply with only: OK'
            },
            {
                role: 'user',
                content: 'Reply with only: OK'
            }
        ],
        [],
        params.authMode || 'api_key'
    );

    return {
        preview: response.trim().slice(0, 120) || '(empty response)'
    };
}

function resolveCodexAuthPath(): string {
    const codexHome = getProcessEnvValue('CODEX_HOME');
    if (codexHome) {
        return joinPath(codexHome, 'auth.json');
    }

    const homeDir = getProcessEnvValue('HOME') || getProcessEnvValue('USERPROFILE') || getOsHomeDir();
    if (!homeDir) {
        throw new Error('Unable to resolve home directory for Codex auth.');
    }

    return joinPath(homeDir, '.codex', 'auth.json');
}

async function loadCodexAuthJson(authPath: string): Promise<CodexAuthJson | null> {
    try {
        const raw = await readUtf8File(authPath);
        if (!raw.trim()) return null;
        return JSON.parse(raw) as CodexAuthJson;
    } catch (_error) {
        return null;
    }
}

async function refreshCodexAccessToken(refreshToken: string, authPath: string): Promise<string> {
    const response = await requestUrl({
        url: CODEX_REFRESH_TOKEN_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: CODEX_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }),
        throw: false
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(response.text || `Codex token refresh failed, status ${response.status}`);
    }

    const nextAccessToken = typeof response.json?.access_token === 'string' ? response.json.access_token.trim() : '';
    const nextRefreshToken = typeof response.json?.refresh_token === 'string' ? response.json.refresh_token.trim() : refreshToken;

    if (!nextAccessToken) {
        throw new Error('Codex token refresh returned empty access token');
    }

    const current = await loadCodexAuthJson(authPath);
    await ensureDir(getParentPath(authPath));
    await writeUtf8File(authPath, `${JSON.stringify({
        ...(current || {}),
        tokens: {
            ...(current?.tokens || {}),
            access_token: nextAccessToken,
            refresh_token: nextRefreshToken
        },
        last_refresh: new Date().toISOString()
    }, null, 2)}\n`);

    return nextAccessToken;
}

function getNodeRequire() {
    const globalRequire = (globalThis as typeof globalThis & { require?: (id: string) => any }).require;
    return typeof globalRequire === 'function' ? globalRequire : null;
}

function getProcessEnvValue(key: string): string {
    const proc = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
    return proc?.env?.[key]?.trim() || '';
}

function getOsHomeDir(): string {
    try {
        const req = getNodeRequire();
        if (!req) return '';
        const os = req('os') as { homedir?: () => string };
        return typeof os.homedir === 'function' ? os.homedir().trim() : '';
    } catch (_error) {
        return '';
    }
}

function joinPath(...parts: string[]) {
    return parts
        .filter(Boolean)
        .map((part, index) => index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, ''))
        .join('/');
}

function getParentPath(filePath: string) {
    const normalized = filePath.replace(/[\\/]+$/, '');
    const lastSlash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

async function readUtf8File(filePath: string): Promise<string> {
    const req = getNodeRequire();
    if (!req) {
        throw new Error('Node file APIs are unavailable in this environment.');
    }
    const fs = req('fs') as { promises?: { readFile?: (path: string, encoding: string) => Promise<string> } };
    if (!fs.promises?.readFile) {
        throw new Error('fs.promises.readFile is unavailable in this environment.');
    }
    return fs.promises.readFile(filePath, 'utf-8');
}

async function writeUtf8File(filePath: string, content: string): Promise<void> {
    const req = getNodeRequire();
    if (!req) {
        throw new Error('Node file APIs are unavailable in this environment.');
    }
    const fs = req('fs') as { promises?: { writeFile?: (path: string, content: string, encoding: string) => Promise<void> } };
    if (!fs.promises?.writeFile) {
        throw new Error('fs.promises.writeFile is unavailable in this environment.');
    }
    await fs.promises.writeFile(filePath, content, 'utf-8');
}

async function ensureDir(dirPath: string): Promise<void> {
    if (!dirPath) return;
    const req = getNodeRequire();
    if (!req) {
        throw new Error('Node file APIs are unavailable in this environment.');
    }
    const fs = req('fs') as { promises?: { mkdir?: (path: string, options: { recursive: boolean }) => Promise<void> } };
    if (!fs.promises?.mkdir) {
        throw new Error('fs.promises.mkdir is unavailable in this environment.');
    }
    await fs.promises.mkdir(dirPath, { recursive: true });
}
