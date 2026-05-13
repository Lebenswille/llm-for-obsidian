import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  MarkdownRenderer,
  Notice,
  FuzzySuggestModal,
  Modal,
} from "obsidian";
import LlmPlugin from "../main";
import { Message, ChatSession } from "../types";
import { callLlmApi, getApiUrlRiskWarning } from "../api/llm";
import { DEFAULT_SETTINGS } from "../settings";

export const CHAT_VIEW_TYPE = "llm-chat-view";

export class ChatView extends ItemView {
  plugin: LlmPlugin;
  messages: Message[] = [];
  attachedFiles: TFile[] = [];
  typingBubble: HTMLElement | null = null;
  currentHistoryPath: string | null = null;
  activeSessionIndex: number | null = null;
  historyCache: Map<string, ChatSession[]> = new Map();
  floatingMenuEl: HTMLElement | null = null;
  maxPdfPages = 100;

  chatContainer!: HTMLElement;
  attachmentsDiv!: HTMLElement;
  textarea!: HTMLTextAreaElement;
  sendButton!: HTMLElement;
  historyBtn!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: LlmPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText() {
    return "LLM Assistant";
  }

  getIcon() {
    return "bot";
  }

  async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		
    container.addClass("llm-chat-wrapper");

    // Header
    const headerContainer = container.createDiv({ cls: "llm-header" });
    headerContainer.createEl("h3", {
      text: "LLM Assistant",
      cls: "llm-header-title",
    });

    const headerButtons = headerContainer.createDiv({ cls: "llm-header-btns" });

    const addBtn = headerButtons.createEl("button", {
      text: "New",
      cls: "llm-header-btn",
      title: "Start new conversation",
    });
    addBtn.addEventListener("click", () => this.createNewSession());

    this.historyBtn = headerButtons.createEl("button", {
      text: "History",
      cls: "llm-header-btn llm-history-trigger",
      title: "View past conversations",
    });
    this.historyBtn.addEventListener("click", () =>
      this.showHistoryExplorer()
    );

    this.chatContainer = container.createDiv({ cls: "chat-history" });
    this.renderWelcomeScreen();

    this.attachmentsDiv = container.createDiv({ cls: "llm-attachments" });

    // Quick prompts
    const suggestionsContainer = container.createDiv({
      cls: "llm-shortcuts",
    });
    const shortcuts = (this.plugin.settings.shortcuts || []).filter(
      (shortcut) => shortcut.prompt?.trim()
    );
    shortcuts.forEach((s) => {
      const btn = suggestionsContainer.createEl("button", {
        text: (s.label || "Prompt").trim(),
        cls: "llm-shortcut-btn",
      });
      btn.addEventListener("click", async () => {
        if (
          this.sendButton &&
          (this.sendButton as HTMLButtonElement).disabled
        )
          return;
        this.textarea.value = "";
        await this.handleSend(s.prompt, this.plugin.settings.model);
      });
    });

    // Input area
    const inputContainer = container.createDiv({
      cls: "chat-input-container",
    });
    this.textarea = inputContainer.createEl("textarea", {
      cls: "chat-input",
      attr: { placeholder: "Ask anything..." },
    });
    this.textarea.addEventListener("input", () => {
      this.textarea.style.height = "auto";
      this.textarea.style.height = this.textarea.scrollHeight + "px";
    });

    const controlsDiv = inputContainer.createDiv({ cls: "chat-controls" });
    const leftControls = controlsDiv.createDiv({ cls: "chat-controls-left" });
    const rightControls = controlsDiv.createDiv({
      cls: "chat-controls-right",
    });

    // Attach button
    const attachButton = leftControls.createEl("button", {
      cls: "llm-minimal-btn",
      title: "Attach file",
      attr: { "aria-label": "Attach file" },
    });
    attachButton.addEventListener("click", () => {
      this.handleAttachFile();
    });

    // Model selector
    const modelPill = leftControls.createDiv({ cls: "llm-model-pill" });
    const modelSelectWrap = modelPill.createDiv({
      cls: "llm-model-select-wrap",
    });
    const modelSelect = modelSelectWrap.createEl("select", {
      cls: "llm-minimal-dropdown",
      attr: { "aria-label": "Select model" },
    });
    const models = this.plugin.settings.models || [];
    for (const m of models) {
      modelSelect.createEl("option", { value: m.name, text: m.name });
    }
    modelSelect.value = this.plugin.settings.model;
    modelSelect.addEventListener("change", async () => {
      this.plugin.settings.model = modelSelect.value;
      await this.plugin.saveSettings();
    });

    // Send button
    this.sendButton = rightControls.createEl("button", {
      text: "⤴",
      cls: "llm-rounded-send",
      title: "Send message",
    });
    (this.sendButton as HTMLButtonElement).addEventListener("click", async () => {
      const text = this.textarea.value.trim();
      if (!text) return;
      this.textarea.value = "";
      this.textarea.style.height = "auto";
      await this.handleSend(text, modelSelect.value);
    });

    this.textarea.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if ((e as any).isComposing) return;
        e.preventDefault();
        const text = this.textarea.value.trim();
        if (!text) return;
        this.textarea.value = "";
        this.textarea.style.height = "auto";
        await this.handleSend(text, modelSelect.value);
      }
    });

    // Setup listeners
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.switchHistory()
      )
    );
    this.setupSelectionMenu();

    // Load history
    this.loadHistoryFromFile().then(() => {
      const initialFile = this.app.workspace.getActiveFile();
      if (initialFile) {
        this.currentHistoryPath = initialFile.path;
        this.loadActiveSession(initialFile);
      }
    });
  }

  async handleAttachFile() {
    const activeFile = this.app.workspace.getActiveFile();
    let autoAttached = false;

    if (activeFile && activeFile.extension === "md") {
      const cache = this.app.metadataCache.getFileCache(activeFile);
      const source = cache?.frontmatter?.source as string | undefined;

      if (source && typeof source === "string" && source.length > 0) {
        const sourceString: string = source;
        const temp1 = sourceString.replace(/\[\[|\]\]/g, "");
        const temp2 = temp1.split("|");
        const cleanPath = (temp2[0] || "").trim();
        const sourceFile = this.app.metadataCache.getFirstLinkpathDest(
          cleanPath,
          activeFile.path
        );

        if (
          sourceFile &&
          !this.attachedFiles.find((f) => f.path === sourceFile.path)
        ) {
          this.attachedFiles.push(sourceFile);
          this.renderAttachments();
          new Notice(`Added source: ${sourceFile.name}`);
          autoAttached = true;
        }
      }
    } else if (activeFile && activeFile.extension === "pdf") {
      if (!this.attachedFiles.find((f) => f.path === activeFile.path)) {
        this.attachedFiles.push(activeFile);
        this.renderAttachments();
        new Notice(`Added current PDF: ${activeFile.name}`);
        autoAttached = true;
      }
    }

    if (!autoAttached) {
      new FileSuggestModal(this.app, (file) => {
        if (!this.attachedFiles.find((f) => f.path === file.path)) {
          this.attachedFiles.push(file);
          this.renderAttachments();
        }
      }).open();
    }
  }

  setupSelectionMenu() {
    this.registerDomEvent(this.contentEl, "mouseup", () => {
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || "";

        if (this.floatingMenuEl) {
          this.floatingMenuEl.remove();
          this.floatingMenuEl = null;
        }

        if (!text || text.length < 3) return;

        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (!rect) return;

        this.floatingMenuEl = document.body.createDiv({
          cls: "llm-floating-menu",
        });
        this.floatingMenuEl.style.left = `${rect.left + rect.width / 2 - 60}px`;
        this.floatingMenuEl.style.top = `${rect.top - 50}px`;

        const addBtn = (label: string, cb: () => void) => {
          const b = this.floatingMenuEl!.createEl("button", {
            cls: "llm-floating-btn",
            text: label,
          });
          b.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            cb();
            this.floatingMenuEl?.remove();
            this.floatingMenuEl = null;
          });
        };

        addBtn("💾 Save", async () => {
          await this.appendToAssociatedNote(text, "Extract");
        });

        addBtn("💬 Ask", () => {
          this.textarea.value = `Regarding: "${text.substring(0, 80)}..."
`;
          this.textarea.focus();
          this.textarea.style.height = "auto";
          this.textarea.style.height = this.textarea.scrollHeight + "px";
        });
      }, 50);
    });

    this.registerDomEvent(window, "mousedown", (e) => {
      if (
        this.floatingMenuEl &&
        !this.floatingMenuEl.contains(e.target as Node)
      ) {
        this.floatingMenuEl.remove();
        this.floatingMenuEl = null;
      }
    });
  }

  async loadHistoryFromFile() {
    try {
      const dataPath = `${this.plugin.manifest.dir}/llm-history.json`;
      if (await this.app.vault.adapter.exists(dataPath)) {
        const data = await this.app.vault.adapter.read(dataPath);
        this.historyCache = new Map(Object.entries(JSON.parse(data)));
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }

  async saveHistoryToFile() {
    try {
      const dataPath = `${this.plugin.manifest.dir}/llm-history.json`;
      await this.app.vault.adapter.write(
        dataPath,
        JSON.stringify(Object.fromEntries(this.historyCache), null, 2)
      );
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }

  loadActiveSession(file: TFile) {
    const sessions = this.historyCache.get(file.path);

    if (sessions && sessions.length > 0) {
      this.activeSessionIndex = sessions.length - 1;
      const last = sessions[this.activeSessionIndex];
      if (last) {
        this.messages = [...last.messages];
        this.attachedFiles = last.attached
          .map((p) => this.app.vault.getAbstractFileByPath(p))
          .filter((f) => f instanceof TFile);
      }
    } else {
      this.messages = [];
      this.attachedFiles = [];
      this.activeSessionIndex = null;
    }

    if (
      file.extension === "pdf" &&
      !this.attachedFiles.find((f) => f.path === file.path)
    ) {
      this.attachedFiles.push(file);
      if (this.activeSessionIndex === null) {
        this.activeSessionIndex = 0;
        this.historyCache.set(file.path, [
          { timestamp: Date.now(), messages: [], attached: [file.path] },
        ]);
      }
    }

    this.renderHistory();
    this.renderAttachments();
  }

  createNewSession() {
    if (!this.currentHistoryPath) return;

    const current = this.historyCache.get(this.currentHistoryPath) || [];

    if (this.activeSessionIndex !== null && current[this.activeSessionIndex]) {
      const session = current[this.activeSessionIndex];
      if (session) {
        session.messages = [...this.messages];
        session.attached = this.attachedFiles.map((f) => f.path);
      }
    }

    current.push({
      timestamp: Date.now(),
      messages: [],
      attached: [],
    });

    this.historyCache.set(this.currentHistoryPath, current);
    this.activeSessionIndex = current.length - 1;
    this.messages = [];
    this.attachedFiles = [];

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension === "pdf") {
      this.attachedFiles.push(activeFile);
      const session = current[this.activeSessionIndex];
      if (session) {
        session.attached = [activeFile.path];
      }
    }

    this.renderHistory();
    this.renderAttachments();
    this.saveHistoryToFile();
    new Notice("Started new conversation");
  }

  renderHistory() {
    this.chatContainer.empty();

    const visibleMessages = this.messages.filter((m) => m.role !== "system");

    if (!this.messages || visibleMessages.length === 0) {
      this.renderWelcomeScreen();
    } else {
      visibleMessages.forEach((msg) => {
        this.addMessage(msg.role as "user" | "assistant", msg.content, true);
      });
    }
  }

  renderWelcomeScreen() {
    this.chatContainer.empty();
    const welcome = this.chatContainer.createDiv({ cls: "llm-welcome" });
    welcome.createDiv({ text: "AI", cls: "llm-welcome-icon" });

    const textWrapper = welcome.createDiv({ cls: "llm-welcome-text-wrapper" });
    textWrapper.createDiv({
      text: "Ready to work with your vault",
      cls: "llm-welcome-title",
    });
    textWrapper.createDiv({
      text: "Ask about the current note, attach source material, or save useful outputs back into Obsidian.",
      cls: "llm-welcome-body",
    });

    const list = textWrapper.createEl("ul", { cls: "llm-welcome-list" });
    list.createEl("li", {
      text: "Ask questions about your current note or PDF",
    });
    list.createEl("li", {
      text: "Select chat text to save or insert into notes",
    });
    list.createEl("li", { text: "Use shortcuts for quick translations & summaries" });
    list.createEl("li", {
      text: "Append responses directly to your source content",
    });
  }

  renderAttachments() {
    this.attachmentsDiv.empty();
    this.attachedFiles.forEach((file, index) => {
      const tag = this.attachmentsDiv.createDiv({ cls: "llm-attachment-tag" });
      tag.createSpan({ text: file.name });
      tag.createSpan({ text: "×", cls: "llm-attachment-remove" }).addEventListener(
        "click",
        () => {
          this.attachedFiles.splice(index, 1);
          this.renderAttachments();
        }
      );
    });
  }

  async handleSend(text: string, selectedModel: string = "") {
    this.addMessage("user", text);
    this.setLoading(true);

    const config =
      this.plugin.settings.models.find(
        (m) => m.name === (selectedModel || this.plugin.settings.model)
      ) || this.plugin.settings.models[0];

    try {
      if (!config) {
        throw new Error("No model configured. Please add a model in settings.");
      }

      const apiUrlWarning = getApiUrlRiskWarning(config.apiUrl);
      if (
        apiUrlWarning &&
        !confirm(
          `${apiUrlWarning}
Do you want to continue?`
        )
      ) {
        this.messages.pop();
        this.chatContainer.lastElementChild?.remove();
        return;
      }

      let contextText = "";
      const files = [...this.attachedFiles];
      const active = this.app.workspace.getActiveFile();
      if (active && !files.find((f) => f.path === active.path)) {
        files.push(active);
      }

      const isGemini = config.apiUrl.includes("generativelanguage");
      const isAnthropic = config.apiUrl.includes("api.anthropic.com");
      const isOfficialOpenAI = config.apiUrl.includes("api.openai.com");

      const nativeAttachments: any[] = [];

      for (const file of files) {
        if (file.extension === "pdf") {
          const buffer = await this.app.vault.readBinary(file);

          if (isGemini || isAnthropic || isOfficialOpenAI) {
            nativeAttachments.push({
              name: file.name,
              mimeType: "application/pdf",
              data: this.arrayBufferToBase64(buffer),
            });
          }

          const pdfjs = (window as any).pdfjsLib;
          if (pdfjs) {
            try {
              const pdf = await pdfjs.getDocument({
                data: new Uint8Array(buffer),
              }).promise;

              for (let i = 1; i <= Math.min(pdf.numPages, this.maxPdfPages); i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                contextText +=
                  textContent.items.map((it: any) => it.str).join(" ") + "\n";
              }
            } catch (e) {
              console.error("PDF parsing error:", e);
            }
          }
        } else if (
          file.extension === "md" ||
          file.extension === "txt"
        ) {
          contextText += (await this.app.vault.read(file)) + "\n";
        }
      }

      const apiMsgs = this.buildApiMessages(text, contextText);
      const res = await callLlmApi(
        config.apiUrl,
        config.apiKey,
        selectedModel || this.plugin.settings.model,
        apiMsgs,
        nativeAttachments,
        config.authMode || "api_key"
      );

      this.addMessage("assistant", res);
    } catch (error: any) {
      this.addMessage("assistant", `**Error:** ${error.message}`);
    } finally {
      this.persistCurrentSession();
      await this.saveHistoryToFile();
      this.setLoading(false);
    }
  }

  buildApiMessages(latestUserText: string, contextText: string): Message[] {
    const contextBlock = contextText.trim()
      ? `
Context from attached/current files:
---
${contextText.trim()}
---`
      : "";

    return [
      {
        role: "system",
        content: this.plugin.settings.systemPrompt,
      },
      ...this.messages.map((message, index) => {
        if (
          message.role === "user" &&
          message.content === latestUserText &&
          index === this.messages.length - 1 &&
          contextBlock
        ) {
          return { ...message, content: `${message.content}${contextBlock}` };
        }
        return { ...message };
      }),
    ];
  }

  persistCurrentSession() {
    if (!this.currentHistoryPath) return;

    const sessions = this.historyCache.get(this.currentHistoryPath) || [];

    if (this.activeSessionIndex === null) {
      sessions.push({
        timestamp: Date.now(),
        messages: [...this.messages],
        attached: this.attachedFiles.map((f) => f.path),
      });
      this.activeSessionIndex = sessions.length - 1;
    } else if (sessions[this.activeSessionIndex]) {
      const session = sessions[this.activeSessionIndex];
      if (session) {
        session.messages = [...this.messages];
        session.attached = this.attachedFiles.map((f) => f.path);
      }
    }

    this.historyCache.set(this.currentHistoryPath, sessions);
  }

  addMessage(
    role: "user" | "assistant",
    content: string,
    skipPush: boolean = false
  ) {
    if (this.chatContainer.querySelector(".llm-welcome")) {
      this.chatContainer.empty();
    }

    if (!skipPush) {
      this.messages.push({ role, content });
    }

    const wrap = this.chatContainer.createDiv({
      cls: `llm-bubble-wrapper ${role}`,
    });
    const bubble = wrap.createDiv({ cls: `llm-bubble ${role}` });

    if (role === "user") {
      bubble.innerText = content;
    } else {
      MarkdownRenderer.render(this.app, content, bubble, "", this);
    }

    const actions = wrap.createDiv({ cls: "llm-bubble-actions" });

    actions.createEl("button", { text: "📋 Copy" }).addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      new Notice("Copied to clipboard");
    });

    actions
      .createEl("button", { text: "💾 Save" })
      .addEventListener("click", async () => {
        await this.appendToAssociatedNote(
          content,
          role === "user" ? "Query" : "Response"
        );
      });

    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  setLoading(loading: boolean) {
    this.textarea.disabled = loading;
    (this.sendButton as HTMLButtonElement).disabled = loading;

    if (loading) {
      this.typingBubble = this.chatContainer.createDiv({
        cls: "llm-bubble-wrapper assistant",
      });
      this.typingBubble.createDiv({
        cls: "llm-bubble assistant",
      }).innerHTML =
        '<div class="llm-typing-indicator"><span>.</span><span>.</span><span>.</span></div>';
    } else if (this.typingBubble) {
      this.typingBubble.remove();
      this.typingBubble = null;
      this.textarea.focus();
    }
  }

  async appendToAssociatedNote(
    content: string,
    label: string
  ) {
    try {
      let candidates: TFile[] = [];
      let currentPath = this.currentHistoryPath;
      let activeFile: TFile | null = null;
      
      const abstFile = this.app.vault.getAbstractFileByPath(
        currentPath || ""
      );
      if (abstFile instanceof TFile) {
        activeFile = abstFile;
      }

      if (!activeFile && this.attachedFiles && this.attachedFiles.length > 0) {
        activeFile = this.attachedFiles[0] || null;
      }

      if (activeFile instanceof TFile) {
        if (activeFile.extension === "md") {
          candidates.push(activeFile);
        } else if (activeFile.extension === "pdf") {
          const metadataCache = this.app.metadataCache;
          const backlinks = (metadataCache as any).getBacklinksForFile?.(
            activeFile
          );

          if (backlinks && backlinks.data) {
            for (const path of Object.keys(backlinks.data)) {
              const f = this.app.vault.getAbstractFileByPath(path);
              if (f instanceof TFile) candidates.push(f);
            }
          }

          const mdFiles = this.app.vault.getMarkdownFiles();
          const cleanPath = activeFile.path.replace(/\\/g, "/").trim();
          const cleanName = activeFile.name.trim();
          const cleanBase = activeFile.basename.trim();
          const cleanPathNoExt = cleanPath.replace(/\.[^/.]+$/, "");

          for (const mdFile of mdFiles) {
            const cache = this.app.metadataCache.getFileCache(mdFile);
            const source = cache?.frontmatter?.source as string | undefined;

            if (source && typeof source === "string" && source.length > 0) {
              const sourceString: string = source;
              const temp1 = sourceString.replace(/[\[\]"']/g, "");
              const temp2 = temp1.split("|");
              const cleanSource = ((temp2[0] || "").trim()).replace(/\\/g, "/");

              if (
                cleanSource === cleanPath ||
                cleanSource === cleanName ||
                cleanSource === cleanBase ||
                cleanSource === cleanPathNoExt ||
                cleanSource === currentPath
              ) {
                candidates.push(mdFile);
              }
            }
          }

          const defaultPath = this.buildPdfNotePath(activeFile);
          const defFile = this.app.vault.getAbstractFileByPath(defaultPath);
          if (defFile instanceof TFile) {
            candidates.push(defFile);
          }
        }
      }

      // Remove duplicates
      const uniquePaths = new Set<string>();
      const filteredCandidates: TFile[] = [];
      for (const f of candidates) {
        const normalizedPath = f.path.toLowerCase();
        if (!uniquePaths.has(normalizedPath)) {
          uniquePaths.add(normalizedPath);
          filteredCandidates.push(f);
        }
      }
      candidates = filteredCandidates;

      const doAppend = async (file: TFile) => {
        const oldContent = await this.app.vault.read(file);
        const newContent = oldContent + `
--- LLM ${label} ---
${content}
`;
        await this.app.vault.modify(file, newContent);
        new Notice(`Appended ${label} to ${file.name}`);
      };

      if (candidates.length === 1) {
        const candidate = candidates[0];
        if (candidate) {
          await doAppend(candidate);
        }
      } else if (candidates.length > 1) {
        new NoteSelectionModal(this.app, candidates, async (file) => {
          await doAppend(file);
        }).open();
      } else if (activeFile instanceof TFile) {
        new ConfirmModal(
          this.app,
          `No associated note found for "${activeFile.name}". Create a new one?`,
          async () => {
            try {
              const newNote = await this.createAssociatedNoteForPdf(
                activeFile,
                content,
                label
              );
              new Notice(`Created and appended to ${newNote.name}`);
            } catch (err: unknown) {
              new Notice(`Failed to create note: ${(err as any).message}`);
            }
          }
        ).open();
      } else {
        new Notice("No active file or context found to create a note.");
      }
    } catch (e: unknown) {
      console.error("LLM Assistant Error:", e);
      new Notice(
        `Error: ${(e as any).message || "Failed to append note"}`
      );
    }
  }

  buildPdfNotePath(pdfFile: TFile): string {
    const baseName = pdfFile.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim() || "PDF Note";
    return `inbox/${baseName}.md`;
  }

  async getAvailableRootNotePath(basePath: string): Promise<string> {
    if (!(await this.app.vault.adapter.exists(basePath))) {
      return basePath;
    }

    const baseWithoutExt = basePath.replace(/\.md$/i, "");
    let counter = 2;

    while (
      await this.app.vault.adapter.exists(`${baseWithoutExt} ${counter}.md`)
    ) {
      counter += 1;
    }

    return `${baseWithoutExt} ${counter}.md`;
  }

  async createAssociatedNoteForPdf(
    pdfFile: TFile,
    content: string,
    label: string
  ): Promise<TFile> {
    const parentPath = "inbox";

    if (!(await this.app.vault.adapter.exists(parentPath))) {
      await this.app.vault.createFolder(parentPath);
    }

    const sourceLink = `"[[${pdfFile.path}]]"`;
    const notePath = await this.getAvailableRootNotePath(
      this.buildPdfNotePath(pdfFile)
    );
    const createdAt = new Date().toISOString();
    const pdfName = pdfFile.basename;
    const template =
      this.plugin.settings.pdfNoteTemplate ||
      DEFAULT_SETTINGS.pdfNoteTemplate;

    const noteContent = template
      .replace(/\$\{sourceLink\}/g, sourceLink)
      .replace(/\$\{createdAt\}/g, createdAt)
      .replace(/\$\{pdfName\}/g, pdfName)
      .replace(/\$\{label\}/g, label)
      .replace(/\$\{content\}/g, content);

    const note = await this.app.vault.create(notePath, noteContent);
    await this.app.workspace.getLeaf(true).openFile(note);

    return note;
  }

  switchHistory() {
    const activeFile = this.app.workspace.getActiveFile();
    const activePath = activeFile ? activeFile.path : null;

    if (this.currentHistoryPath === activePath) return;

    if (this.currentHistoryPath && this.messages.length > 0) {
      this.persistCurrentSession();
      this.saveHistoryToFile();
    }

    if (activePath) {
      this.currentHistoryPath = activePath;
      this.loadActiveSession(activeFile!);
    } else {
      this.currentHistoryPath = null;
      this.activeSessionIndex = null;
      this.renderHistory();
      this.renderAttachments();
    }
  }

  showHistoryExplorer() {
    if (!this.currentHistoryPath) return;

    const sessions = this.historyCache.get(this.currentHistoryPath) || [];

    const overlay = this.containerEl.createDiv({
      cls: "llm-history-overlay",
    });

    const overlayHeader = overlay.createDiv({
      cls: "llm-history-overlay-header",
    });
    overlayHeader.createDiv({
      text: "Conversation History",
      cls: "llm-history-overlay-title",
    });
    overlayHeader
      .createEl("button", { text: "Close", cls: "llm-history-close-btn" })
      .addEventListener("click", () => overlay.remove());

    const listContainer = overlay.createDiv({ cls: "llm-history-list" });

    sessions.slice().reverse().forEach((s, revIdx) => {
      const actualIdx = sessions.length - 1 - revIdx;

      const item = listContainer.createDiv({ cls: "llm-history-item" });

      const itemCopy = item.createDiv({ cls: "llm-history-item-copy" });
      itemCopy.createDiv({
        text: new Date(s.timestamp).toLocaleString(),
        cls: "llm-history-item-time",
      });
      itemCopy.createDiv({
        text:
          s.messages.find((m) => m.role === "user")?.content.substring(0, 64) ||
          "New Conversation",
        cls: "llm-history-item-title",
      });

      const del = item.createEl("button", {
        text: "Delete",
        cls: "llm-history-delete-btn",
      });
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (confirm("Delete?")) {
          sessions.splice(actualIdx, 1);
          this.historyCache.set(this.currentHistoryPath!, sessions);
          this.saveHistoryToFile();
          overlay.remove();
          this.showHistoryExplorer();
        }
      });

      item.addEventListener("click", () => {
        this.activeSessionIndex = actualIdx;
        this.messages = [...s.messages];
        this.attachedFiles = s.attached
          .map((p) => this.app.vault.getAbstractFileByPath(p))
          .filter((f) => f instanceof TFile);
        this.renderHistory();
        this.renderAttachments();
        overlay.remove();
      });
    });
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 32768;
    let binary = "";

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return window.btoa(binary);
  }

  async onClose() {
    this.floatingMenuEl?.remove();
    this.floatingMenuEl = null;
  }
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
  onChoose: (file: TFile) => void;

  constructor(app: any, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile) {
    this.onChoose(file);
  }
}

class NoteSelectionModal extends FuzzySuggestModal<TFile> {
  items: TFile[];
  onChoose: (file: TFile) => void;

  constructor(app: any, items: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.setPlaceholder(
      "Multiple associated notes found. Choose one to append content:"
    );
  }

  getItems(): TFile[] {
    return this.items;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile) {
    this.onChoose(file);
  }
}

class ConfirmModal extends Modal {
  message: string;
  onConfirm: () => void;

  constructor(app: any, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Confirm Action" });
    contentEl.createEl("p", { text: this.message });

    const btnContainer = contentEl.createDiv({
      cls: "llm-modal-btns",
    });
    btnContainer.style.display = "flex";
    btnContainer.style.justifyContent = "flex-end";
    btnContainer.style.gap = "10px";
    btnContainer.style.marginTop = "20px";

    const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const confirmBtn = btnContainer.createEl("button", {
      text: "Confirm",
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
