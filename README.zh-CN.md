> 说明：这个插件是 vibe coded 的。

中文 | [English](README.md)

# LLM for Obsidian

一个 Obsidian 侧边栏 AI 助手，可结合当前笔记、附件和 PDF 进行问答、总结、翻译与整理。

## 项目简介

`LLM for Obsidian` 的目标不是做一个独立聊天工具，而是把大模型能力直接嵌入 Obsidian 工作流。

它适合：

- 围绕当前笔记或 PDF 提问
- 为模型附加 Markdown / TXT / PDF 上下文
- 快速切换多个模型
- 将回复保存回笔记
- 使用快捷提示词
- 按文件维度保留聊天历史
- 同时支持 API Key 和 Codex Auth

## 功能特性

- Obsidian 右侧边栏聊天面板
- 自动结合当前笔记与附件上下文
- 支持 Markdown / TXT / PDF
- OpenAI、Anthropic、Gemini 支持原生 PDF 输入
- 支持快捷 Prompt，并可在设置页维护
- 支持多模型配置和快速切换
- 内置主流模型预设
- 支持通过本地 `codex login` 使用 Codex
- 按当前文件保存聊天历史
- 支持将回复直接保存回笔记
- PDF 无关联笔记时自动在 `inbox/` 新建收件箱笔记

## 安装方式

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

## 快速开始

1. 在 Obsidian 中启用插件。
2. 通过侧边图标或命令面板打开聊天面板。
3. 在设置中配置至少一个模型。
4. 打开一个笔记或 PDF。
5. 输入问题，或直接使用快捷 Prompt。

## 模型配置

### 支持的接口类型

- OpenAI-compatible chat completions
- Anthropic native messages API
- Gemini native API
- Codex responses API

### PDF 处理方式

- OpenAI、Anthropic、Gemini 支持原生 PDF 输入
- 其他 provider 会回退为提取 PDF 文本后作为上下文发送
- 当前 PDF 文本提取仍依赖运行环境中的 PDF.js 能力和上游 provider 表现

### 内置模型预设

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

### 单模型可配置项

- `Provider / Model Name`
- `Auth Mode`
- `API URL`
- `API Key`
- `Test`

### 鉴权模式

#### `API Key`

适用于绝大多数普通模型服务商，例如 OpenAI-compatible、Anthropic、Gemini、DeepSeek、OpenRouter、Groq、Moonshot、SiliconFlow 等。

#### `Codex Auth`

使用本地 Codex 登录凭据：

```text
~/.codex/auth.json
```

推荐 Codex 配置：

- 模型：`gpt-5.4`
- 鉴权模式：`Codex Auth`
- API URL：`https://chatgpt.com/backend-api/codex/responses`

适合希望复用本地 Codex 登录态，而不是手动填写 API Key 的场景。

## 使用 Codex

1. 先执行：

```bash
codex login
```

2. 在插件设置中新增模型。
3. 将 `Auth Mode` 设为 `Codex Auth`。
4. 模型名填如 `gpt-5.4`。
5. 点击 `Test` 验证本地登录态和模型连通性。

## 快捷提示词

快捷 Prompt 会显示在输入框上方，并可在设置中维护。

每个快捷项包含：

- 按钮名称
- Prompt 内容

## 保存回复

助手回复支持：

- `Copy`
- `Save`

如果当前是普通笔记，内容会追加到原笔记中。

如果当前是 PDF：

- 插件会先尝试找到关联 Markdown 笔记
- 如果找不到，就会在 `inbox/` 下自动新建一篇笔记

新建笔记会自动带上 `source`、`Date`、`base`、`Category`、`aliases` 和默认标签。

## 聊天历史

聊天记录会按当前文件分别保存。

你可以：

- 新建会话
- 查看当前文件历史
- 切换旧会话
- 删除旧会话

## 数据文件

插件运行时会在目录里保存本地数据。

### 重要文件

- `data.json`：插件设置
- `llm-history.json`：聊天历史

### 说明

- 删除 `data.json` 会重置设置
- 删除 `llm-history.json` 会清空聊天历史

## 模型测试

每个模型配置卡片都带有 `Test` 按钮：

- `API Key` 模式会发送最小测试请求
- `Codex Auth` 模式会先检查本地登录态，再测试模型本身

## 已知限制

- `Codex Auth` 主要适用于桌面环境
- 不同 provider 的报错格式不同
- PDF 提取效果依赖运行环境和 provider 能力
- 额度和频率限制由上游模型服务商决定

## 常见问题

### `429`

通常表示：

- 请求过快
- 额度不足
- 当前账号没有该模型权限

### Codex 报错

请优先确认本地已成功执行：

```bash
codex login
```

并且存在 `~/.codex/auth.json`。

## 开发说明

主要源码文件：

- `src/main.ts`
- `src/ui/chat-view.ts`
- `src/api/llm.ts`
- `styles.css`

构建命令：

```bash
npm run build
```

## 致谢

感谢 [`llm-for-zotero`](https://github.com/yilewang/llm-for-zotero) 及其开发者，提供了这次 vibe coding 所基于的基础模板和灵感。

## License

MIT
