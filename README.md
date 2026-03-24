# LLM for Obsidian

`LLM for Obsidian` 是一个侧边栏聊天插件，可以在 Obsidian 中直接和大语言模型对话，并结合当前笔记、附件、PDF 和快捷提示词完成总结、翻译、问答等工作。

它的目标不是做一个独立聊天应用，而是把 LLM 能力嵌进你的知识库工作流里：

- 在右侧边栏直接提问
- 自动结合当前笔记或附加文件上下文
- 支持 Markdown / TXT / PDF
- 支持多个模型配置并快速切换
- 支持快捷 Prompt
- 支持将回复保存回笔记
- 支持查看按文件维度保存的聊天历史
- 支持 API Key 模式和 Codex Auth 模式

---

## 功能特性

### 1. 侧边栏聊天

插件会在 Obsidian 右侧打开一个聊天面板，你可以：

- 输入自由问题
- 使用快捷按钮快速发起常见任务
- 切换不同模型
- 附加文件作为上下文

### 2. 文件上下文

发送消息时，插件会尽可能结合当前上下文：

- 当前活动 Markdown 笔记
- 当前活动 PDF
- 手动附加的 Markdown / TXT / PDF 文件

对于 PDF：

- Gemini 原生接口可直接携带 PDF
- 其余模型会尽量提取 PDF 文本作为上下文发送

### 3. 快捷 Prompt

你可以在设置中维护快捷提示词：

- 新增快捷项
- 修改按钮名称
- 修改 Prompt 内容
- 删除不需要的快捷项

这些快捷项会显示在输入框上方，点击即可发送。

### 4. 多模型支持

插件支持为多个模型分别配置：

- 模型名
- API URL
- API Key
- Auth Mode

可以在聊天面板底部快速切换当前使用的模型。

### 5. 主流模型预设

设置页提供常见模型预设，可一键添加，例如：

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

### 6. Codex 支持

插件支持使用本地 `codex login` 登录态调用 Codex 模型。

适合不想手动填写 API Key，而是希望复用本地 Codex 凭据的人。

### 7. 聊天历史

聊天记录会按当前文件维度保存到本地：

- 切换不同笔记时，会加载各自的聊天历史
- 支持开始新会话
- 支持查看历史会话
- 支持删除单条历史会话

### 8. 保存回复到笔记

模型回复支持：

- 复制到剪贴板
- 直接追加到关联笔记

当当前文件是 PDF 时，插件会尝试：

- 找反向链接笔记
- 或根据 frontmatter 中的 `source`
- 再不行则退回当前打开的 Markdown 笔记

---

## 安装方式

将插件放到你的 Obsidian Vault：

```text
.obsidian/plugins/llm-for-obsidian
```

确保目录中至少包含：

- `manifest.json`
- `main.js`
- `styles.css`

如果你在本地开发，可运行：

```bash
npm install
npm run build
```

---

## 如何打开插件

启用插件后，可以通过以下方式打开：

- 左侧功能区的机器人图标
- 命令面板中的 `Open LLM Chat View`

插件会在右侧侧边栏打开聊天面板。

---

## 设置说明

设置页主要分成三部分：

### 1. General Preferences

#### System Prompt

这里可以修改默认系统提示词。

它会影响模型整体行为，比如：

- 回答风格
- 是否偏向总结
- 是否用中文输出

---

### 2. LLM for Obsidian Models

这里是模型配置区。

每个模型都可以配置：

#### Provider / Model Name

例如：

- `gpt-4o`
- `gpt-4.1-mini`
- `claude-3-5-sonnet-latest`
- `gemini-2.0-flash`
- `deepseek-chat`
- `gpt-5.4`

#### Auth Mode

支持两种模式：

- `API Key`
- `Codex Auth`

#### API URL

不同服务商对应不同地址。

例如：

- OpenAI Chat Completions:
  `https://api.openai.com/v1/chat/completions`
- Anthropic Messages:
  `https://api.anthropic.com/v1/messages`
- Gemini Native:
  `https://generativelanguage.googleapis.com`
- Codex Responses:
  `https://chatgpt.com/backend-api/codex/responses`

#### API Key

当使用 `API Key` 模式时需要填写。

如果使用 `Codex Auth`，这里可以留空。

#### Test

每个模型都有 `Test` 按钮：

- `API Key` 模式会发起一次最小测试请求
- `Codex Auth` 模式会先检查本地登录态，再测试模型连接

---

### 3. Popular Model Presets

可通过下拉快速添加主流模型预设，然后再微调配置。

---

### 4. Quick Prompts

用于管理聊天面板中的快捷按钮。

每个快捷项包含：

- `Button Label`
- `Prompt`

---

## Codex Auth 使用方法

如果你想使用 `gpt-5.4` 等 Codex 模型：

### 1. 本地登录 Codex

先在终端执行：

```bash
codex login
```

成功后，本地会生成：

```text
~/.codex/auth.json
```

### 2. 在插件中添加 Codex 模型

推荐配置：

- Model Name: `gpt-5.4`
- Auth Mode: `Codex Auth`
- API URL: `https://chatgpt.com/backend-api/codex/responses`

### 3. 点击 Test

如果登录态正常，插件会提示测试成功。

---

## 支持的接口类型

当前插件主要支持三类接口：

### OpenAI-Compatible

适用于：

- OpenAI
- DeepSeek
- OpenRouter
- Groq
- Moonshot
- SiliconFlow
- Ollama

默认按 `chat/completions` 方式调用。

### Anthropic Native

按 `v1/messages` 协议调用。

### Gemini Native

按 Gemini 原生接口调用，并支持原生 PDF 附件。

### Codex Responses

按 Codex responses 流式接口调用，并复用本地 Codex 登录态。

---

## 使用方式

### 基本问答

1. 打开一个笔记
2. 打开 LLM 面板
3. 输入问题
4. 选择模型
5. 点击发送

### 使用快捷 Prompt

点击输入框上方的快捷按钮，例如：

- `Summarize`
- `Key Points`
- `Translate`

### 附加文件

点击输入框左下角的 `+`：

- 如果当前是 PDF，会优先附加当前 PDF
- 如果当前笔记 frontmatter 中存在 `source`，会尝试自动附加源文件
- 否则会弹出文件选择框

### 保存回复

在助手回复上方可看到：

- `Copy`
- `Save`

`Save` 会把回复追加到关联笔记中。

### 新建会话

点击顶部 `New` 按钮即可在当前文件下新建一个独立会话。

### 查看历史

点击顶部 `History` 查看当前文件的历史聊天记录。

---

## 数据存储

插件会在目录内保存一些本地数据：

- `data.json`
  插件配置
- `llm-history.json`
  聊天历史

说明：

- 删除 `data.json` 会重置插件设置
- 删除 `llm-history.json` 会清空聊天历史

---

## 已知限制

### 1. Codex Auth 更适合桌面环境

因为它依赖本地 `codex login` 产生的凭据文件。

### 2. 不同 provider 的限制不同

不同模型平台可能会出现：

- 401 鉴权失败
- 403 权限不足
- 404 模型不存在
- 429 频率或额度限制

### 3. PDF 提取依赖环境

非 Gemini 模式下，PDF 文本提取依赖运行环境中可用的 PDF 解析能力。

---

## 常见问题

### 出现 `429`

通常表示：

- 请求频率过高
- 额度不足
- 模型权限不可用

请检查：

- API Key
- 账户额度
- provider 控制台
- 模型名是否正确

### Codex 出现登录相关报错

请确认：

```bash
codex login
```

已经执行成功，并且本地存在：

```text
~/.codex/auth.json
```

### 模型测试失败

请优先检查：

- Model Name
- API URL
- API Key / Codex Auth
- 该模型是否真的在当前 provider 可用

---

## 适合的使用场景

这个插件尤其适合：

- 阅读论文时对 PDF 提问
- 总结笔记内容
- 将笔记翻译成中文
- 对当前知识库做上下文问答
- 把模型回复直接整理回 Obsidian

---

## 开发

本地开发常用命令：

```bash
npm install
npm run build
```

源码主要位于：

- `src/main.ts`
- `src/ChatView.ts`
- `src/llmClient.ts`
- `styles.css`

---

## License

MIT
