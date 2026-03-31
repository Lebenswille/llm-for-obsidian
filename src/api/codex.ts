import { requestUrl } from "obsidian";
import {
  CodexAuthState,
  CodexAuthResult,
  CodexTestResult,
} from "../types";

const CODEX_REFRESH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export async function resolveCodexAuthState(): Promise<CodexAuthResult> {
  const authPath = resolveCodexAuthPath();
  const auth = await loadCodexAuthJson(authPath);
  const accessToken = (auth?.tokens?.access_token || "").trim() || "";
  const refreshToken = (auth?.tokens?.refresh_token || "").trim() || "";

  if (accessToken) {
    return { accessToken, refreshToken, authPath };
  }

  if (refreshToken) {
    const refreshedToken = await refreshCodexAccessToken(
      refreshToken,
      authPath
    );
    return { accessToken: refreshedToken, refreshToken, authPath };
  }

  throw new Error(
    "Codex auth token not found. Please run `codex login` and ensure ~/.codex/auth.json is available."
  );
}

export async function testCodexAuthState(): Promise<CodexTestResult> {
  const authPath = resolveCodexAuthPath();
  const auth = await loadCodexAuthJson(authPath);
  const accessToken = (auth?.tokens?.access_token || "").trim() || "";
  const refreshToken = (auth?.tokens?.refresh_token || "").trim() || "";

  if (accessToken) {
    return {
      authPath,
      tokenSource: "access_token",
      lastRefresh: auth?.last_refresh,
    };
  }

  if (refreshToken) {
    await refreshCodexAccessToken(refreshToken, authPath);
    const refreshed = await loadCodexAuthJson(authPath);
    return {
      authPath,
      tokenSource: "refresh_token",
      lastRefresh: refreshed?.last_refresh,
    };
  }

  throw new Error(
    "No Codex token found in ~/.codex/auth.json. Run `codex login` first."
  );
}

function resolveCodexAuthPath(): string {
  const codexHome = getProcessEnvValue("CODEX_HOME");
  if (codexHome) {
    return joinPath(codexHome, "auth.json");
  }

  const homeDir =
    getProcessEnvValue("HOME") ||
    getProcessEnvValue("USERPROFILE") ||
    getOsHomeDir();

  if (!homeDir) {
    throw new Error("Unable to resolve home directory for Codex auth.");
  }

  return joinPath(homeDir, ".codex", "auth.json");
}

async function loadCodexAuthJson(
  authPath: string
): Promise<CodexAuthState | null> {
  try {
    const raw = await readUtf8File(authPath);
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export async function refreshCodexAccessToken(
  refreshToken: string,
  authPath: string
): Promise<string> {
  const response = await requestUrl({
    url: CODEX_REFRESH_TOKEN_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    throw: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      response.text ||
        `Codex token refresh failed, status ${response.status}`
    );
  }

  const nextAccessToken =
    typeof response.json?.access_token === "string"
      ? response.json.access_token.trim()
      : "";
  const nextRefreshToken =
    typeof response.json?.refresh_token === "string"
      ? response.json.refresh_token.trim()
      : refreshToken;

  if (!nextAccessToken) {
    throw new Error("Codex token refresh returned empty access token");
  }

  const current = await loadCodexAuthJson(authPath);
  await ensureDir(getParentPath(authPath));

  await writeUtf8File(
    authPath,
    `${JSON.stringify(
      {
        ...(current || {}),
        tokens: {
          ...(current?.tokens || {}),
          access_token: nextAccessToken,
          refresh_token: nextRefreshToken,
        },
        last_refresh: new Date().toISOString(),
      },
      null,
      2
    )}
`
  );

  return nextAccessToken;
}

function getNodeRequire(): unknown {
  const globalRequire = (globalThis as unknown).require;
  return typeof globalRequire === "function" ? globalRequire : null;
}

function getProcessEnvValue(key: string): string {
  return (((globalThis as unknown).process?.env?.[key] || "") as string).trim() || "";
}

function getOsHomeDir(): string {
  try {
    const req = getNodeRequire();
    if (!req) return "";
    const os = req("os");
    return typeof os.homedir === "function"
      ? (os.homedir() as string).trim()
      : "";
  } catch (_error) {
    return "";
  }
}

function joinPath(...parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part!.replace(/[\\/]+$/, "")
        : part!.replace(/^[\\/]+|[\\/]+$/g, "")
    )
    .join("/");
}

function getParentPath(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const lastSlash = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\")
  );
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

async function readUtf8File(filePath: string): Promise<string> {
  const req = getNodeRequire();
  if (!req) {
    throw new Error("Node file APIs are unavailable in this environment.");
  }

  const fs = req("fs");
  if (!fs.promises?.readFile) {
    throw new Error("fs.promises.readFile is unavailable in this environment.");
  }

  return fs.promises.readFile(filePath, "utf-8");
}

async function writeUtf8File(
  filePath: string,
  content: string
): Promise<void> {
  const req = getNodeRequire();
  if (!req) {
    throw new Error("Node file APIs are unavailable in this environment.");
  }

  const fs = req("fs");
  if (!fs.promises?.writeFile) {
    throw new Error(
      "fs.promises.writeFile is unavailable in this environment."
    );
  }

  await fs.promises.writeFile(filePath, content, "utf-8");
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!dirPath) return;

  const req = getNodeRequire();
  if (!req) {
    throw new Error("Node file APIs are unavailable in this environment.");
  }

  const fs = req("fs");
  if (!fs.promises?.mkdir) {
    throw new Error("fs.promises.mkdir is unavailable in this environment.");
  }

  await fs.promises.mkdir(dirPath, { recursive: true });
}
