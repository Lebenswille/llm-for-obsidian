import { ItemView, WorkspaceLeaf, Notice, MarkdownView, TFile, MarkdownRenderer, App, FuzzySuggestModal } from 'obsidian';
import LlmPlugin from './main';
import { callLlmApi, ChatMessage, FileAttachment } from './llmClient';

export const CHAT_VIEW_TYPE = 'llm-chat-view';

export class ChatView extends ItemView {
    plugin: LlmPlugin;
    messages: ChatMessage[] = [];
    attachedFiles: TFile[] = [];
    chatContainer: HTMLElement;
    attachmentsDiv: HTMLElement;
    textarea: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    historyBtn: HTMLButtonElement;

    typingBubble: HTMLElement | null = null;
    currentHistoryPath: string | null = null;
    activeSessionIndex: number | null = null;
    historyCache: Map<string, Array<{timestamp: number, messages: ChatMessage[], attached: string[]}>> = new Map();
    floatingMenuEl: HTMLElement | null = null;
    private readonly maxPdfPages = 100;

    constructor(leaf: WorkspaceLeaf, plugin: LlmPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return CHAT_VIEW_TYPE; }
    getDisplayText() { return 'LLM Assistant'; }
    getIcon() { return 'bot'; }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('llm-chat-wrapper');

        // Header
        const headerContainer = container.createDiv({ cls: 'llm-header' });
        headerContainer.createEl('h3', { text: 'LLM Assistant', cls: 'llm-header-title' });
        
        const headerButtons = headerContainer.createDiv({ cls: 'llm-header-btns' });

        const addBtn = headerButtons.createEl('button', { text: 'New', cls: 'llm-header-btn', title: 'Start new conversation' });
        addBtn.addEventListener('click', () => this.createNewSession());

        this.historyBtn = headerButtons.createEl('button', { text: 'History', cls: 'llm-header-btn llm-history-trigger', title: 'View past conversations' });
        this.historyBtn.addEventListener('click', () => this.showHistoryExplorer());

        // Chat History Container
        this.chatContainer = container.createDiv({ cls: 'chat-history' });
        this.renderWelcomeScreen();

        // Attachments Area
        this.attachmentsDiv = container.createDiv({ cls: 'llm-attachments' });

        // Shortcuts
        const suggestionsContainer = container.createDiv({ cls: 'llm-shortcuts' });
        const shortcuts = (this.plugin.settings.shortcuts || []).filter(shortcut => shortcut.prompt?.trim());
        shortcuts.forEach(s => {
            const btn = suggestionsContainer.createEl('button', { text: s.label?.trim() || 'Prompt', cls: 'llm-shortcut-btn' });
            btn.addEventListener('click', async () => {
                if (this.sendButton && this.sendButton.disabled) return;
                this.textarea.value = '';
                await this.handleSend(s.prompt, this.plugin.settings.model);
            });
        });

        // Input Area
        const inputContainer = container.createDiv({ cls: 'chat-input-container' });
        this.textarea = inputContainer.createEl('textarea', { 
            cls: 'chat-input', 
            attr: { placeholder: 'Ask anything...' } 
        });
        this.textarea.addEventListener('input', () => {
            this.textarea.style.height = 'auto';
            this.textarea.style.height = this.textarea.scrollHeight + 'px';
        });

        const controlsDiv = inputContainer.createDiv({ cls: 'chat-controls' });
        const leftControls = controlsDiv.createDiv({ cls: 'chat-controls-left' });
        const rightControls = controlsDiv.createDiv({ cls: 'chat-controls-right' });

        const attachButton = leftControls.createEl('button', { cls: 'llm-minimal-btn', title: 'Attach file', attr: { 'aria-label': 'Attach file' } });
        attachButton.addEventListener('click', () => {
            const activeFile = this.app.workspace.getActiveFile();
            let autoAttached = false;
            
            if (activeFile && activeFile.extension === 'md') {
                const cache = this.app.metadataCache.getFileCache(activeFile);
                const source = cache?.frontmatter?.source;
                if (source && typeof source === 'string') {
                    const cleanPath = source.replace(/\[\[|\]\]/g, '').split('|')[0].trim();
                    const sourceFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, activeFile.path);
                    if (sourceFile && !this.attachedFiles.find(f => f.path === sourceFile.path)) {
                        this.attachedFiles.push(sourceFile);
                        this.renderAttachments();
                        new Notice(`Added source: ${sourceFile.name}`);
                        autoAttached = true;
                    }
                }
            } else if (activeFile && activeFile.extension === 'pdf') {
                if (!this.attachedFiles.find(f => f.path === activeFile.path)) {
                    this.attachedFiles.push(activeFile);
                    this.renderAttachments();
                    new Notice(`Added current PDF: ${activeFile.name}`);
                    autoAttached = true;
                }
            }
            
            if (!autoAttached) {
                new FileSuggestModal(this.app, (file) => {
                    if (!this.attachedFiles.find(f => f.path === file.path)) {
                        this.attachedFiles.push(file);
                        this.renderAttachments();
                    }
                }).open();
            }
        });

        const modelPill = leftControls.createDiv({ cls: 'llm-model-pill' });
        const modelSelectWrap = modelPill.createDiv({ cls: 'llm-model-select-wrap' });
        const modelSelect = modelSelectWrap.createEl('select', { cls: 'llm-minimal-dropdown', attr: { 'aria-label': 'Select model' } });
        const models = this.plugin.settings.models || [];
        for (const m of models) {
            modelSelect.createEl('option', { value: m.name, text: m.name });
        }
        modelSelect.value = this.plugin.settings.model;
        modelSelect.addEventListener('change', async () => {
            this.plugin.settings.model = modelSelect.value;
            await this.plugin.saveSettings();
        });

        this.sendButton = rightControls.createEl('button', { text: '➔', cls: 'llm-rounded-send', title: 'Send message' });
        this.sendButton.addEventListener('click', async () => {
            const text = this.textarea.value.trim();
            if (!text) return;
            this.textarea.value = '';
            this.textarea.style.height = 'auto';
            await this.handleSend(text, modelSelect.value);
        });

        this.textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (e.isComposing) return;
                e.preventDefault();
                const text = this.textarea.value.trim();
                if (!text) return;
                this.textarea.value = '';
                this.textarea.style.height = 'auto';
                await this.handleSend(text, modelSelect.value);
            }
        });

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.switchHistory()));
        this.setupSelectionMenu();

        this.loadHistoryFromFile().then(() => {
            const initialFile = this.app.workspace.getActiveFile();
            if (initialFile) {
                this.currentHistoryPath = initialFile.path;
                this.loadActiveSession(initialFile);
            }
        });
    }

    async loadHistoryFromFile() {
        try {
            const dataPath = `${this.plugin.manifest.dir}/llm-history.json`;
            if (await this.app.vault.adapter.exists(dataPath)) {
                this.historyCache = new Map(Object.entries(JSON.parse(await this.app.vault.adapter.read(dataPath))));
            }
        } catch (e) {}
    }

    async saveHistoryToFile() {
        try {
            const dataPath = `${this.plugin.manifest.dir}/llm-history.json`;
            await this.app.vault.adapter.write(dataPath, JSON.stringify(Object.fromEntries(this.historyCache), null, 2));
        } catch (e) {}
    }

    loadActiveSession(file: TFile) {
        const sessions = this.historyCache.get(file.path);
        if (sessions && sessions.length > 0) {
            this.activeSessionIndex = sessions.length - 1;
            const last = sessions[this.activeSessionIndex];
            this.messages = [...last.messages];
            this.attachedFiles = last.attached.map(p => this.app.vault.getAbstractFileByPath(p)).filter(f => f instanceof TFile) as TFile[];
        } else {
            this.messages = [];
            this.attachedFiles = [];
            this.activeSessionIndex = null;
        }
        if (file.extension === 'pdf' && !this.attachedFiles.find(f => f.path === file.path)) {
            this.attachedFiles.push(file);
            if (this.activeSessionIndex === null) {
                this.activeSessionIndex = 0;
                this.historyCache.set(file.path, [{ timestamp: Date.now(), messages: [], attached: [file.path] }]);
            }
        }
        this.renderHistory();
        this.renderAttachments();
    }

    createNewSession() {
        if (!this.currentHistoryPath) return;
        const current = this.historyCache.get(this.currentHistoryPath) || [];
        if (this.activeSessionIndex !== null && current[this.activeSessionIndex]) {
            current[this.activeSessionIndex].messages = [...this.messages];
            current[this.activeSessionIndex].attached = this.attachedFiles.map(f => f.path);
        }
        current.push({ timestamp: Date.now(), messages: [], attached: [] });
        this.historyCache.set(this.currentHistoryPath, current);
        this.activeSessionIndex = current.length - 1;
        this.messages = [];
        this.attachedFiles = [];
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'pdf') {
            this.attachedFiles.push(activeFile);
            current[this.activeSessionIndex].attached = [activeFile.path];
        }
        this.renderHistory();
        this.renderAttachments();
        this.saveHistoryToFile();
        new Notice("Started new conversation");
    }

    setupSelectionMenu() {
        this.registerDomEvent(this.contentEl, 'mouseup', () => {
            setTimeout(() => {
                const selection = window.getSelection();
                const text = selection?.toString().trim();
                if (this.floatingMenuEl) { this.floatingMenuEl.remove(); this.floatingMenuEl = null; }
                if (!text || text.length < 3) return;
                const range = selection?.getRangeAt(0);
                const rect = range?.getBoundingClientRect();
                if (!rect) return;
                this.floatingMenuEl = document.body.createDiv({ cls: 'llm-floating-menu' });
                this.floatingMenuEl.style.left = `${rect.left + (rect.width/2) - 60}px`;
                this.floatingMenuEl.style.top = `${rect.top - 50}px`;
                const addBtn = (t: string, cb: any) => {
                    const b = this.floatingMenuEl!.createEl('button', { cls: 'llm-floating-btn', text: t });
                    b.addEventListener('mousedown', (ev) => { ev.preventDefault(); cb(); this.floatingMenuEl?.remove(); this.floatingMenuEl = null; });
                };
                addBtn('➕ Insert', async () => {
                    await this.appendToAssociatedNote(text, 'Extract');
                });
                addBtn('💬 Ask', () => {
                    this.textarea.value = `Regarding: "${text.substring(0, 80)}..."\n\n`;
                    this.textarea.focus(); this.textarea.style.height = 'auto'; this.textarea.style.height = this.textarea.scrollHeight + 'px';
                });
                addBtn('📝 New Note', async () => {
                    await this.appendToAssociatedNote(text, 'Extract');
                });
            }, 50);
        });
        this.registerDomEvent(window, 'mousedown', (e) => {
            if (this.floatingMenuEl && !this.floatingMenuEl.contains(e.target as Node)) {
                this.floatingMenuEl.remove(); this.floatingMenuEl = null;
            }
        });
    }

    async appendToAssociatedNote(content: string, label: string) {
        let targetFile: TFile | null = null;
        const activeFile = this.app.vault.getAbstractFileByPath(this.currentHistoryPath || "");
        const createFallbackNoteForPdf = activeFile instanceof TFile && activeFile.extension === 'pdf';
        
        if (activeFile instanceof TFile) {
            if (activeFile.extension === 'md') {
                targetFile = activeFile;
            } else if (activeFile.extension === 'pdf') {
                // 1. Try backlinks first
                const metadataCache = this.app.metadataCache as any;
                const backlinks = metadataCache.getBacklinksForFile(activeFile);
                if (backlinks && backlinks.data) {
                    const paths = Object.keys(backlinks.data);
                    if (paths.length > 0) {
                        const f = this.app.vault.getAbstractFileByPath(paths[0]);
                        if (f instanceof TFile) targetFile = f;
                    }
                }

                // 2. Scan frontmatter 'source' if backlog fails (more accurate for your setup)
                if (!targetFile) {
                    const mdFiles = this.app.vault.getMarkdownFiles();
                    for (const mdFile of mdFiles) {
                        const cache = this.app.metadataCache.getFileCache(mdFile);
                        const source = cache?.frontmatter?.source;
                        // Match either exact path or wikilink style
                        if (source === this.currentHistoryPath || source === `[[${activeFile.name}]]` || source === `[[${activeFile.path.replace(/\.[^/.]+$/, "")}]]`) {
                            targetFile = mdFile;
                            break;
                        }
                    }
                }
            }
        }

        // Fallback: use current markdown leaf if it exists
        if (!targetFile) {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) targetFile = (leaves[0].view as MarkdownView).file;
        }

        if (!targetFile && createFallbackNoteForPdf && activeFile instanceof TFile) {
            targetFile = await this.createAssociatedNoteForPdf(activeFile, content, label);
            new Notice(`Created note for ${activeFile.name}`);
            return;
        }

        if (targetFile) {
            const oldContent = await this.app.vault.read(targetFile);
            const newContent = oldContent + `\n\n--- LLM ${label} ---\n` + content + '\n';
            await this.app.vault.modify(targetFile, newContent);
            new Notice(`Appended ${label} to ${targetFile.name}`);
        } else {
            new Notice('No target note found to append content');
        }
    }

    buildPdfNotePath(pdfFile: TFile) {
        const baseName = pdfFile.basename.replace(/[\\/:*?"<>|]/g, '-').trim() || 'PDF Note';
        return `inbox/${baseName}.md`;
    }

    async getAvailableRootNotePath(basePath: string): Promise<string> {
        let candidate = basePath;
        let counter = 2;

        while (await this.app.vault.adapter.exists(candidate)) {
            const baseName = candidate.replace(/\.md$/i, '');
            candidate = `${baseName} ${counter}.md`;
            counter += 1;
        }

        return candidate;
    }

    async createAssociatedNoteForPdf(pdfFile: TFile, content: string, label: string): Promise<TFile> {
        const sourceLink = `"[[${pdfFile.path}]]"`;
        const notePath = await this.getAvailableRootNotePath(this.buildPdfNotePath(pdfFile));
        const createdAt = new Date().toISOString();
        const noteContent =
`---
source: ${sourceLink}
Date: ${createdAt}
base: "[[Inbox.base]]"
Category:
aliases:
tags:
  - llm-generated
  - pdf-note
---

# ${pdfFile.basename}

--- LLM ${label} ---
${content}
`;
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
        if (activePath) { this.currentHistoryPath = activePath; this.loadActiveSession(activeFile!); }
        else { this.currentHistoryPath = null; this.activeSessionIndex = null; this.renderHistory(); this.renderAttachments(); }
    }

    showHistoryExplorer() {
        if (!this.currentHistoryPath) return;
        const sessions = this.historyCache.get(this.currentHistoryPath) || [];
        const overlay = this.containerEl.createDiv({ cls: 'llm-history-overlay' });
        const overlayHeader = overlay.createDiv({ cls: 'llm-history-overlay-header' });
        overlayHeader.createDiv({ text: 'Conversation History', cls: 'llm-history-overlay-title' });
        overlayHeader.createEl('button', { text: 'Close', cls: 'llm-history-close-btn' }).addEventListener('click', () => overlay.remove());
        const listContainer = overlay.createDiv({ cls: 'llm-history-list' });
        sessions.slice().reverse().forEach((s, revIdx) => {
            const actualIdx = sessions.length - 1 - revIdx;
            const item = listContainer.createDiv({ cls: 'llm-history-item' });
            const itemCopy = item.createDiv({ cls: 'llm-history-item-copy' });
            itemCopy.createDiv({ text: new Date(s.timestamp).toLocaleString(), cls: 'llm-history-item-time' });
            itemCopy.createDiv({ text: s.messages.find(m => m.role === 'user')?.content.substring(0, 64) || 'New Conversation', cls: 'llm-history-item-title' });
            const del = item.createEl('button', { text: 'Delete', cls: 'llm-history-delete-btn' });
            del.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (confirm("Delete?")) {
                    sessions.splice(actualIdx, 1);
                    this.historyCache.set(this.currentHistoryPath!, sessions);
                    this.saveHistoryToFile();
                    overlay.remove();
                    this.showHistoryExplorer();
                }
            });
            item.addEventListener('click', () => {
                this.activeSessionIndex = actualIdx; this.messages = [...s.messages];
                this.attachedFiles = s.attached.map(p => this.app.vault.getAbstractFileByPath(p)).filter(f => f instanceof TFile) as TFile[];
                this.renderHistory(); this.renderAttachments(); overlay.remove();
            });
        });
    }

    renderHistory() {
        this.chatContainer.empty();
        if (!this.messages || this.messages.filter(m => m.role !== 'system').length === 0) this.renderWelcomeScreen();
        else this.messages.forEach(msg => { if (msg.role !== 'system') this.addMessage(msg.role, msg.content, true); });
    }

    renderAttachments() {
        this.attachmentsDiv.empty();
        this.attachedFiles.forEach((file, index) => {
            const tag = this.attachmentsDiv.createDiv({ cls: 'llm-attachment-tag' });
            tag.createSpan({ text: file.name });
            tag.createSpan({ text: '×', cls: 'llm-attachment-remove' }).addEventListener('click', () => {
                this.attachedFiles.splice(index, 1); this.renderAttachments();
            });
        });
    }

    renderWelcomeScreen() {
        this.chatContainer.empty();
        const welcome = this.chatContainer.createDiv({ cls: 'llm-welcome' });
        welcome.createDiv({ text: 'AI', cls: 'llm-welcome-icon' });
        const textWrapper = welcome.createDiv({ cls: 'llm-welcome-text-wrapper' });
        textWrapper.createDiv({ text: 'Ready to work with your vault', cls: 'llm-welcome-title' });
        textWrapper.createDiv({ text: 'Ask about the current note, attach source material, or save useful outputs back into Obsidian.', cls: 'llm-welcome-body' });
        const list = textWrapper.createEl('ul', { cls: 'llm-welcome-list' });
        list.createEl('li', { text: 'Ask questions about your current note or PDF' });
        list.createEl('li', { text: 'Select chat text to save or insert into notes' });
        list.createEl('li', { text: 'Use shortcuts for quick translations & summaries' });
        list.createEl('li', { text: 'Append responses directly to your source content' });
    }

    async handleSend(text: string, selectedModel: string = '') {
        this.addMessage('user', text);
        this.setLoading(true);
        const config = this.plugin.settings.models.find(m => m.name === (selectedModel || this.plugin.settings.model)) || this.plugin.settings.models[0];
        try {
            if (!config) throw new Error('No model configured. Please add a model in settings.');

            let contextText = '';
            const files = [...this.attachedFiles];
            const active = this.app.workspace.getActiveFile();
            if (active && !files.find(f => f.path === active.path)) files.push(active);
            const isGemini = config.apiUrl.includes('generativelanguage');
            const isAnthropic = config.apiUrl.includes('api.anthropic.com');
            const isOfficialOpenAI = config.apiUrl.includes('api.openai.com');
            const nativeAttachments: FileAttachment[] = [];
            for (const file of files) {
                if (file.extension === 'pdf') {
                    const buffer = await this.app.vault.readBinary(file);
                    if (isGemini || isAnthropic || isOfficialOpenAI) {
                        nativeAttachments.push({ name: file.name, mimeType: 'application/pdf', data: this.arrayBufferToBase64(buffer) });
                    }
                    const pdfjs = (window as any).pdfjsLib;
                    if (pdfjs) {
                        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
                        for (let i = 1; i <= Math.min(pdf.numPages, this.maxPdfPages); i++) {
                            contextText += (await (await pdf.getPage(i)).getTextContent()).items.map((it: any) => it.str).join(' ') + '\n';
                        }
                    }
                } else if (file.extension === 'md' || file.extension === 'txt') contextText += await this.app.vault.read(file) + '\n';
            }
            const apiMsgs = this.buildApiMessages(text, contextText);
            const res = await callLlmApi(
                config.apiUrl,
                config.apiKey,
                selectedModel || this.plugin.settings.model,
                apiMsgs,
                nativeAttachments,
                config.authMode || 'api_key'
            );
            this.addMessage('assistant', res);
        } catch (error: any) {
            this.addMessage('assistant', `**Error:** ${error.message}`);
        } finally {
            this.persistCurrentSession();
            await this.saveHistoryToFile();
            this.setLoading(false);
        }
    }

    buildApiMessages(latestUserText: string, contextText: string): ChatMessage[] {
        const contextBlock = contextText.trim()
            ? `\n\nContext from attached/current files:\n---\n${contextText.trim()}\n---`
            : '';

        return [
            { role: 'system', content: this.plugin.settings.systemPrompt },
            ...this.messages.map((message, index) => {
                if (
                    message.role === 'user' &&
                    message.content === latestUserText &&
                    index === this.messages.length - 1 &&
                    contextBlock
                ) {
                    return { ...message, content: `${message.content}${contextBlock}` };
                }
                return { ...message };
            })
        ];
    }

    persistCurrentSession() {
        if (!this.currentHistoryPath) return;

        const sessions = this.historyCache.get(this.currentHistoryPath) || [];
        if (this.activeSessionIndex === null) {
            sessions.push({
                timestamp: Date.now(),
                messages: [...this.messages],
                attached: this.attachedFiles.map(f => f.path)
            });
            this.activeSessionIndex = sessions.length - 1;
        } else if (sessions[this.activeSessionIndex]) {
            sessions[this.activeSessionIndex].messages = [...this.messages];
            sessions[this.activeSessionIndex].attached = this.attachedFiles.map(f => f.path);
        }

        this.historyCache.set(this.currentHistoryPath, sessions);
    }

    addMessage(role: 'user' | 'assistant', content: string, skipPush: boolean = false) {
        if (this.chatContainer.querySelector('.llm-welcome')) this.chatContainer.empty();
        if (!skipPush) this.messages.push({ role, content });
        const wrap = this.chatContainer.createDiv({ cls: `llm-bubble-wrapper ${role}` });
        const bubble = wrap.createDiv({ cls: `llm-bubble ${role}` });
        if (role === 'user') bubble.innerText = content;
        else {
            MarkdownRenderer.render(this.app, content, bubble, '', this);
            const actions = wrap.createDiv({ cls: 'llm-bubble-actions' });
            actions.createEl('button', { text: 'Copy' }).addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                new Notice('Copied to clipboard');
            });
            actions.createEl('button', { text: 'Save' }).addEventListener('click', async () => {
                await this.appendToAssociatedNote(content, 'Response');
            });
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    setLoading(loading: boolean) {
        this.textarea.disabled = loading; this.sendButton.disabled = loading;
        if (loading) {
            this.typingBubble = this.chatContainer.createDiv({ cls: 'llm-bubble-wrapper assistant' });
            this.typingBubble.createDiv({ cls: 'llm-bubble assistant' }).innerHTML = '<div class="llm-typing-indicator"><span>.</span><span>.</span><span>.</span></div>';
        } else if (this.typingBubble) { this.typingBubble.remove(); this.typingBubble = null; this.textarea.focus(); }
    }

    async onClose() {
        this.floatingMenuEl?.remove();
        this.floatingMenuEl = null;
    }
    arrayBufferToBase64(buffer: ArrayBuffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        return window.btoa(binary);
    }
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
    onChoose: (file: TFile) => void;
    constructor(app: App, onChoose: (file: TFile) => void) { super(app); this.onChoose = onChoose; }
    getItems(): TFile[] { return this.app.vault.getFiles(); }
    getItemText(file: TFile): string { return file.path; }
    onChooseItem(file: TFile): void { this.onChoose(file); }
}
