import { ModelConfig, Shortcut } from "./types";

export interface LlmSettings {
	model: string;
	models: ModelConfig[];
	systemPrompt: string;
	pdfNoteTemplate: string;
	shortcuts: Shortcut[];
}

export const DEFAULT_SETTINGS: LlmSettings = {
	model: "gpt-4o",
	models: [
		{
			name: "gpt-4o",
			apiUrl: "https://api.openai.com/v1/chat/completions",
			apiKey: "",
			authMode: "api_key",
		},
	],
	systemPrompt:
		"You are a helpful assistant integrated into an Obsidian side panel. You have access to the user's current open document or context in Obsidian. Answer their question based on the context. If they have selected specific text, focus on that text.",
	pdfNoteTemplate: `---
source: \${sourceLink}
Date: \${createdAt}
base: "[[Inbox.base]]"
Category:
aliases:
tags:
  - llm-generated
  - pdf-note
---
# \${pdfName}
--- LLM \${label} ---
\${content}`,
	shortcuts: [
		{
			label: "Summarize",
			prompt: "Summarize the document in 3-5 bullet points.",
		},
		{ label: "Key Points", prompt: "List the key points." },
		{
			label: "Translate",
			prompt: "请将文段或选中内容精准翻译成容易理解的中文。",
		},
	],
};
