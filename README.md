> Note: This plugin is vibe coded.

[English](README.md) | [中文](README.zh-CN.md)

# Note Copilot

An Obsidian sidebar AI assistant that integrates with your notes, attachments, and PDFs for Q&A, summarization, translation, and organization.

## Introduction

`Note Copilot` aims not to be a standalone chat tool, but to embed LLM capabilities directly into your Obsidian workflow.

It is suitable for:
- Asking questions about current notes or PDFs.
- Attaching Markdown / TXT / PDF context to the model.
- Quickly switching between multiple models.
- Saving responses back to your notes.
- Using shortcut prompts.
- Persistent chat history per file.
- Support for both API Key and Codex Auth.

## Features

- Sidebar chat panel in Obsidian.
- Automatically includes context from current notes and attachments.
- Supports Markdown / TXT / PDF files.
- Native PDF input for OpenAI, Anthropic, and Gemini.
- Custom Shortcut Prompts, manageable in settings.
- Multi-model configuration and quick switching.
- Built-in presets for major models.
- Codex support via local `codex login`.
- Chat history saved by file.
- Direct "Save to note" functionality.
- Automatic creation of inbox notes in `inbox/` for standalone PDFs.

## Installation

Place the plugin in:
```text
.obsidian/plugins/note-copilot
```

At minimum, you need:
- `manifest.json`
- `main.js`
- `styles.css`

For local development:
```bash
npm install
npm run build
```

## Quick Start

1. Enable the plugin in Obsidian.
2. Open the chat panel via the sidebar icon or command palette.
3. Configure at least one model in settings.
4. Open a note or PDF.
5. Enter your question or use a Shortcut Prompt.

## Model Configuration

### Supported API Types
- OpenAI-compatible chat completions
- Anthropic native messages API
- Gemini native API
- Codex responses API

### PDF Handling
- OpenAI, Anthropic, and Gemini support native PDF input.
- Other providers fallback to extracting text from the PDF as context.
- PDF text extraction depends on PDF.js in the environment and provider performance.

### Built-in Presets
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

### Configuration Options per Model
- `Provider / Model Name`
- `Auth Mode`
- `API URL`
- `API Key`
- `Test` button

### Authentication Modes

#### `API Key`
For most standard model providers like OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Groq, Moonshot, SiliconFlow, etc.

#### `Codex Auth`
Uses local Codex login credentials from:
```text
~/.codex/auth.json
```

Recommended Codex config:
- Model: `gpt-5.4`
- Auth Mode: `Codex Auth`
- API URL: `https://chatgpt.com/backend-api/codex/responses`

Ideal for reusing local Codex login status without manual API keys.

## Using Codex

1. Run:
   ```bash
   codex login
   ```
2. Add a new model in plugin settings.
3. Set `Auth Mode` to `Codex Auth`.
4. Set model name (e.g., `gpt-5.4`).
5. Click `Test` to verify connectivity.

## Shortcut Prompts

Shortcut Prompts appear above the input box and can be managed in settings. Each entry includes a button name and prompt content.

## Saving Responses

Assistant responses support:
- `Copy`
- `Save`

For regular notes, content is appended to the original note.
For PDFs:
- The plugin first tries to find an associated Markdown note.
- If not found, a new note is created under `inbox/`.

New notes automatically include `source`, `Date`, `base`, `Category`, `aliases`, and default tags.

## Chat History

History is saved per file. You can:
- Start a new session.
- View current file history.
- Switch between or delete old sessions.

## Data Files

The plugin saves data locally in its directory:
- `data.json`: Plugin settings.
- `llm-history.json`: Chat history.

Note: Deleting these files will reset settings or clear history.

## Model Testing

Each model configuration has a `Test` button:
- `API Key` mode sends a minimal test request.
- `Codex Auth` mode checks local login status before testing the model.

## Known Limitations
- `Codex Auth` is primarily for desktop environments.
- Error formats vary by provider.
- PDF extraction quality depends on environment and provider capabilities.
- Quotas and rate limits are determined by the upstream provider.

## FAQ

### `429` Error
Usually means rate limiting, insufficient quota, or lack of model permissions.

### Codex Errors
Ensure `codex login` was successful and `~/.codex/auth.json` exists.

## Development
Main source files:

- `src/main.ts`
- `src/ui/chat-view.ts`
- `src/api/llm.ts`
- `styles.css`

Build command:
```bash
npm run build
```

## Credits
Special thanks to [`llm-for-zotero`](https://github.com/yilewang/llm-for-zotero) and its developers for providing the base template and inspiration for this vibe coding project.

## License
MIT
