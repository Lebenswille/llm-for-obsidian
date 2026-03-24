# LLM for Obsidian

An Obsidian sidebar assistant for chatting with LLMs using your current note, attached files, and PDFs.

一个 Obsidian 侧边栏 AI 助手，可结合当前笔记、附件和 PDF 进行问答、总结、翻译与整理。

## Overview | 项目简介

`LLM for Obsidian` brings LLM workflows directly into your vault instead of forcing you to leave Obsidian for a separate chat app.

It is designed for note-centric work:

- Ask questions about the current note or PDF
- Attach Markdown, text, and PDF files as context
- Switch between multiple model providers
- Save replies back into notes
- Reuse quick prompts
- Keep per-file conversation history
- Support both API Key auth and Codex Auth

`LLM for Obsidian` 的目标不是做一个独立聊天工具，而是把大模型能力直接嵌入 Obsidian 工作流。

它适合：

- 围绕当前笔记或 PDF 提问
- 为模型附加 Markdown / TXT / PDF 上下文
- 快速切换多个模型
- 将回复保存回笔记
- 使用快捷提示词
- 按文件维度保留聊天历史
- 同时支持 API Key 和 Codex Auth

## Features | 功能特性

### English

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

### 中文

- Obsidian 右侧边栏聊天面板
- 自动结合当前笔记与附件上下文
- 支持 Markdown / TXT / PDF
- 支持快捷 Prompt，并可在设置页维护
- 支持多模型配置和快速切换
- 内置主流模型预设
- 支持通过本地 `codex login` 使用 Codex
- 按当前文件保存聊天历史
- 支持将回复直接保存回笔记
- PDF 无关联笔记时自动在 `inbox/` 新建收件箱笔记

## Installation | 安装方式

### English

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

### 中文

将插件放到：

```text
.obsidian/plugins/llm-for-obsidian
```

运行时至少需要：

- `manifest.json`
- `main.js`
- `styles.css`

本地开发可执行：

```bash
npm install
npm run build
```

## Getting Started | 快速开始

### English

1. Enable the plugin in Obsidian.
2. Open the chat panel from the ribbon icon or command palette.
3. Configure at least one model in settings.
4. Open a note or PDF.
5. Ask a question, use a quick prompt, or attach extra files.

### 中文

1. 在 Obsidian 中启用插件。
2. 通过侧边图标或命令面板打开聊天面板。
3. 在设置中配置至少一个模型。
4. 打开一个笔记或 PDF。
5. 输入问题，或直接使用快捷 Prompt。

## Model Setup | 模型配置

### Supported styles | 支持的接口类型

- OpenAI-compatible chat completions
- Anthropic native messages API
- Gemini native API
- Codex responses API

### Built-in presets | 内置模型预设

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

### Per-model settings | 单模型可配置项

- `Provider / Model Name`
- `Auth Mode`
- `API URL`
- `API Key`
- `Test`

### Auth Mode | 鉴权模式

#### `API Key`

Use this for standard hosted providers such as OpenAI-compatible, Anthropic, Gemini, DeepSeek, OpenRouter, Groq, Moonshot, SiliconFlow, and others.

适用于绝大多数普通模型服务商。

#### `Codex Auth`

Use your local Codex login credentials from:

```text
~/.codex/auth.json
```

Recommended Codex config:

- Model: `gpt-5.4`
- Auth Mode: `Codex Auth`
- API URL: `https://chatgpt.com/backend-api/codex/responses`

适合希望复用本地 Codex 登录态，而不是手动填写 API Key 的场景。

## Using Codex | 使用 Codex

### English

1. Run:

```bash
codex login
```

2. Add a model in plugin settings.
3. Set `Auth Mode` to `Codex Auth`.
4. Use `gpt-5.4` or another supported Codex model name.
5. Click `Test` to verify the local auth state and model connection.

### 中文

1. 先执行：

```bash
codex login
```

2. 在插件设置中新增模型。
3. 将 `Auth Mode` 设为 `Codex Auth`。
4. 模型名填如 `gpt-5.4`。
5. 点击 `Test` 验证本地登录态和模型连通性。

## Quick Prompts | 快捷提示词

Quick prompts appear above the input box and can be managed in settings.

Each prompt has:

- Button label
- Prompt body

快捷 Prompt 会显示在输入框上方，并可在设置中维护。

每个快捷项包含：

- 按钮名称
- Prompt 内容

## Saving Replies | 保存回复

### English

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

### 中文

助手回复支持：

- `Copy`
- `Save`

如果当前是普通笔记，内容会追加到原笔记中。

如果当前是 PDF：

- 插件会先尝试找到关联 Markdown 笔记
- 如果找不到，就会在 `inbox/` 下自动新建一篇笔记

新建笔记会自动带上 `source`、`Date`、`base`、`Category`、`aliases` 和默认标签。

## History | 聊天历史

Conversation history is stored locally per active file.

You can:

- Start a new session
- Open file-specific history
- Switch between sessions
- Delete old sessions

聊天记录会按当前文件分别保存。

你可以：

- 新建会话
- 查看当前文件历史
- 切换旧会话
- 删除旧会话

## Data Files | 数据文件

The plugin stores local runtime data inside its folder.

### Important files

- `data.json`: plugin settings
- `llm-history.json`: saved chat history

### Notes

- Deleting `data.json` resets settings
- Deleting `llm-history.json` clears chat history

插件运行时会在目录里保存本地数据：

- `data.json`：插件设置
- `llm-history.json`：聊天历史

删除它们不会破坏代码，但会丢失对应数据。

## Connection Testing | 模型测试

Each model has a `Test` button in settings.

- `API Key` mode sends a minimal test request
- `Codex Auth` mode verifies local auth and then tests the model connection

每个模型配置卡片都带有 `Test` 按钮：

- `API Key` 模式会发送最小测试请求
- `Codex Auth` 模式会先检查本地登录态，再测试模型本身

## Known Limitations | 已知限制

### English

- Codex Auth is mainly intended for desktop environments
- Different providers may return different error formats
- PDF extraction quality depends on provider and runtime capabilities
- Rate limits and quota errors depend on the upstream model provider

### 中文

- Codex Auth 主要适用于桌面环境
- 不同 provider 的报错格式不同
- PDF 提取效果依赖运行环境和 provider 能力
- 额度和频率限制由上游模型服务商决定

## Common Issues | 常见问题

### `429`

Usually means:

- too many requests
- quota exhausted
- model access not available

通常表示：

- 请求过快
- 额度不足
- 当前账号没有该模型权限

### Codex errors

Make sure:

```bash
codex login
```

has completed successfully and `~/.codex/auth.json` exists.

如果 Codex 报错，请优先确认本地已成功执行：

```bash
codex login
```

并且存在 `~/.codex/auth.json`。

## Development | 开发说明

Main source files:

- `src/main.ts`
- `src/ChatView.ts`
- `src/llmClient.ts`
- `styles.css`

Build:

```bash
npm run build
```

主要源码文件：

- `src/main.ts`
- `src/ChatView.ts`
- `src/llmClient.ts`
- `styles.css`

构建命令：

```bash
npm run build
```

## License

MIT
