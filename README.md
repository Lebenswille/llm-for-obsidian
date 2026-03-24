[中文](README.zh-CN.md) | English

# LLM for Obsidian

An Obsidian sidebar assistant for chatting with LLMs using your current note, attached files, and PDFs.

## Overview

`LLM for Obsidian` brings LLM workflows directly into your vault instead of forcing you to leave Obsidian for a separate chat app.

It is designed for note-centric work:

- Ask questions about the current note or PDF
- Attach Markdown, text, and PDF files as context
- Switch between multiple model providers
- Save replies back into notes
- Reuse quick prompts
- Keep per-file conversation history
- Support both API Key auth and Codex Auth

## Features

- Sidebar chat panel in Obsidian
- Context-aware chatting with current note and attachments
- Markdown / TXT / PDF support
- Quick prompt buttons with settings-page management
- Multi-model configuration and switching
- Provider presets for mainstream models
- Codex support via local `codex login`
- Conversation history grouped by active file
- Save assistant output back into notes
- Auto-create inbox notes for standalone PDFs

## Installation

Place the plugin under:

```text
.obsidian/plugins/llm-for-obsidian
```

Required runtime files:

- `manifest.json`
- `main.js`
- `styles.css`

For local development:

```bash
npm install
npm run build
```

## Getting Started

1. Enable the plugin in Obsidian.
2. Open the chat panel from the ribbon icon or command palette.
3. Configure at least one model in settings.
4. Open a note or PDF.
5. Ask a question, use a quick prompt, or attach extra files.

## Model Setup

### Supported styles

- OpenAI-compatible chat completions
- Anthropic native messages API
- Gemini native API
- Codex responses API

### Built-in presets

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- OpenRouter
- Groq
- Moonshot
- SiliconFlow
- Ollama
- Codex

### Per-model settings

- `Provider / Model Name`
- `Auth Mode`
- `API URL`
- `API Key`
- `Test`

### Auth Mode

#### `API Key`

Use this for standard hosted providers such as OpenAI-compatible, Anthropic, Gemini, DeepSeek, OpenRouter, Groq, Moonshot, SiliconFlow, and others.

#### `Codex Auth`

Use your local Codex login credentials from:

```text
~/.codex/auth.json
```

Recommended Codex config:

- Model: `gpt-5.4`
- Auth Mode: `Codex Auth`
- API URL: `https://chatgpt.com/backend-api/codex/responses`

This is useful when you want to reuse your local Codex login instead of manually entering an API key.

## Using Codex

1. Run:

```bash
codex login
```

2. Add a model in plugin settings.
3. Set `Auth Mode` to `Codex Auth`.
4. Use `gpt-5.4` or another supported Codex model name.
5. Click `Test` to verify the local auth state and model connection.

## Quick Prompts

Quick prompts appear above the input box and can be managed in settings.

Each prompt has:

- Button label
- Prompt body

## Saving Replies

Assistant messages support:

- `Copy`
- `Save`

When saving from a normal note, content is appended to that note.

When saving from a PDF:

- The plugin first tries to find an associated Markdown note
- If none exists, it creates a new note in `inbox/`

The new note includes frontmatter like:

```yaml
source: "[[path/to/file.pdf]]"
Date: 2026-03-24T19:50:51.668Z
base: "[[Inbox.base]]"
Category:
aliases:
tags:
  - llm-generated
  - pdf-note
```

## History

Conversation history is stored locally per active file.

You can:

- Start a new session
- Open file-specific history
- Switch between sessions
- Delete old sessions

## Data Files

The plugin stores local runtime data inside its folder.

### Important files

- `data.json`: plugin settings
- `llm-history.json`: saved chat history

### Notes

- Deleting `data.json` resets settings
- Deleting `llm-history.json` clears chat history

## Connection Testing

Each model has a `Test` button in settings.

- `API Key` mode sends a minimal test request
- `Codex Auth` mode verifies local auth and then tests the model connection

## Known Limitations

- Codex Auth is mainly intended for desktop environments
- Different providers may return different error formats
- PDF extraction quality depends on provider and runtime capabilities
- Rate limits and quota errors depend on the upstream model provider

## Common Issues

### `429`

Usually means:

- too many requests
- quota exhausted
- model access not available

### Codex errors

Make sure:

```bash
codex login
```

has completed successfully and `~/.codex/auth.json` exists.

## Development

Main source files:

- `src/main.ts`
- `src/ChatView.ts`
- `src/llmClient.ts`
- `styles.css`

Build:

```bash
npm run build
```

## Acknowledgements

Thanks to [`llm-for-zotero`](https://github.com/yilewang/llm-for-zotero) and its developers for providing the basic template and inspiration that made this vibe-coding build possible.

## License

MIT
