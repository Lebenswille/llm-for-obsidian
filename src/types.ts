import { TFile } from "obsidian";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string;
}

export interface ModelConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  authMode: "api_key" | "codex_auth";
}

export interface Shortcut {
  label: string;
  prompt: string;
}

export interface ChatSession {
  timestamp: number;
  messages: Message[];
  attached: string[];
}

export interface CodexAuthState {
  tokens?: {
    access_token?: string;
    refresh_token?: string;
  };
  last_refresh?: string;
}

export interface CodexAuthResult {
  accessToken: string;
  refreshToken: string;
  authPath: string;
}

export interface CodexTestResult {
  authPath: string;
  tokenSource: "access_token" | "refresh_token";
  lastRefresh?: string;
}

export interface ModelTestParams {
  apiUrl: string;
  apiKey: string;
  model: string;
  authMode?: "api_key" | "codex_auth";
}

export interface ModelTestResult {
  preview: string;
}

export interface CodexRequestParams {
  apiUrl: string;
  model: string;
  messages: Message[];
  token: string;
}

export interface CodexRequestResponse {
  status: number;
  text: string;
}

export interface CodexPayload {
  model: string;
  input: { type: string; role: string; content: string }[];
  instructions?: string;
  store: boolean;
  stream: boolean;
}

export interface ModelPreset {
  provider: string;
  name: string;
  apiUrl: string;
  authMode: "api_key" | "codex_auth";
}

export interface GoogleGeminiMessage {
  role: string;
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

export interface AnthropicContent {
  type: string;
  source?: {
    type: string;
    media_type: string;
    data: string;
  };
  text?: string;
}
