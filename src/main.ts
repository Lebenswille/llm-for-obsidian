import { Plugin, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { ChatView, CHAT_VIEW_TYPE } from './ChatView';
import { testCodexAuthState, testModelConnection } from './llmClient';

interface LlmModelConfig {
	name: string;
	apiUrl: string;
	apiKey: string;
	authMode?: 'api_key' | 'codex_auth';
}

interface ShortcutConfig {
	label: string;
	prompt: string;
}

interface ModelPreset {
	provider: string;
	name: string;
	apiUrl: string;
	authMode?: 'api_key' | 'codex_auth';
}

interface LlmPluginSettings {
	apiKey?: string; // legacy
	apiUrl?: string; // legacy
	addedModels?: string[]; // legacy
	model: string;
	models: LlmModelConfig[];
	systemPrompt: string;
	shortcuts: ShortcutConfig[];
}

const DEFAULT_SETTINGS: LlmPluginSettings = {
	model: 'gpt-4o',
	models: [
		{ name: 'gpt-4o', apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', authMode: 'api_key' }
	],
	systemPrompt: "You are a helpful assistant integrated into an Obsidian side panel. You have access to the user's current open document or context in Obsidian. Answer their question based on the context. If they have selected specific text, focus on that text.",
	shortcuts: [
		{ label: 'Summarize', prompt: 'Summarize the document in 3-5 bullet points.' },
		{ label: 'Key Points', prompt: 'List the key points.' },
		{ label: 'Translate', prompt: '请将文段或选中内容精准翻译成容易理解的中文。' }
	]
}

const MODEL_PRESETS: ModelPreset[] = [
	{ provider: 'OpenAI', name: 'gpt-4o', apiUrl: 'https://api.openai.com/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'OpenAI', name: 'gpt-4.1-mini', apiUrl: 'https://api.openai.com/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'Codex', name: 'gpt-5.4', apiUrl: 'https://chatgpt.com/backend-api/codex/responses', authMode: 'codex_auth' },
	{ provider: 'Anthropic', name: 'claude-3-5-sonnet-latest', apiUrl: 'https://api.anthropic.com/v1/messages', authMode: 'api_key' },
	{ provider: 'Google Gemini', name: 'gemini-2.0-flash', apiUrl: 'https://generativelanguage.googleapis.com', authMode: 'api_key' },
	{ provider: 'DeepSeek', name: 'deepseek-chat', apiUrl: 'https://api.deepseek.com/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'OpenRouter', name: 'openai/gpt-4o-mini', apiUrl: 'https://openrouter.ai/api/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'Groq', name: 'llama-3.3-70b-versatile', apiUrl: 'https://api.groq.com/openai/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'Moonshot', name: 'moonshot-v1-8k', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'SiliconFlow', name: 'Qwen/Qwen2.5-72B-Instruct', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', authMode: 'api_key' },
	{ provider: 'Ollama', name: 'llama3.1', apiUrl: 'http://localhost:11434/v1/chat/completions', authMode: 'api_key' }
];

export default class LlmPlugin extends Plugin {
	settings: LlmPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf) => new ChatView(leaf, this)
		);

		this.addRibbonIcon('bot', 'Open LLM Assistant', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-llm-chat-view',
			name: 'Open LLM Chat View',
			callback: () => {
				this.activateView();
			}
		});

        this.addSettingTab(new LlmSettingTab(this.app, this));
	}

	async onunload() {
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
            }
		}

		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.shortcuts = Array.isArray(this.settings.shortcuts) && this.settings.shortcuts.length > 0
			? this.settings.shortcuts.map((shortcut, index) => ({
				label: shortcut?.label?.trim() || `Shortcut ${index + 1}`,
				prompt: shortcut?.prompt?.trim() || ''
			}))
			: DEFAULT_SETTINGS.shortcuts.map((shortcut) => ({ ...shortcut }));
		
		// Migration
		if (!this.settings.models || this.settings.models.length === 0) {
			this.settings.models = [];
			if (this.settings.addedModels && this.settings.addedModels.length > 0) {
				this.settings.addedModels.forEach(m => {
					this.settings.models.push({
						name: m,
						apiUrl: this.settings.apiUrl || 'https://api.openai.com/v1/chat/completions',
						apiKey: this.settings.apiKey || '',
						authMode: 'api_key'
					});
				});
			} else if (this.settings.model && this.settings.model.includes(',')) {
				const names = this.settings.model.split(',').map(s => s.trim()).filter(Boolean);
				names.forEach(m => {
					this.settings.models.push({
						name: m,
						apiUrl: this.settings.apiUrl || 'https://api.openai.com/v1/chat/completions',
						apiKey: this.settings.apiKey || '',
						authMode: 'api_key'
					});
				});
				this.settings.model = names[0];
			} else if (this.settings.model) {
				this.settings.models.push({
					name: this.settings.model,
					apiUrl: this.settings.apiUrl || 'https://api.openai.com/v1/chat/completions',
					apiKey: this.settings.apiKey || '',
					authMode: 'api_key'
				});
			} else {
				this.settings.models = [...DEFAULT_SETTINGS.models];
			}
		}

		this.settings.models = this.settings.models.map((model) => ({
			...model,
			name: model.name?.trim() || 'unnamed-model',
			apiUrl: model.apiUrl?.trim() || 'https://api.openai.com/v1/chat/completions',
			apiKey: model.apiKey || '',
			authMode: model.authMode === 'codex_auth' ? 'codex_auth' : 'api_key'
		}));

		if (!this.settings.models.find((model) => model.name === this.settings.model)) {
			this.settings.model = this.settings.models[0]?.name || DEFAULT_SETTINGS.model;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LlmSettingTab extends PluginSettingTab {
	plugin: LlmPlugin;
	saveTimer: number | null = null;
	selectedPresetIndex = 0;

	constructor(app: App, plugin: LlmPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'General Preferences' });

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('Customize the default instructions given to the selected model.')
				.addTextArea(text => {
					text.inputEl.style.width = '100%';
					text.inputEl.rows = 4;
					text.setValue(this.plugin.settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt)
						.onChange(async (value) => {
							this.plugin.settings.systemPrompt = value.trim() || DEFAULT_SETTINGS.systemPrompt;
							this.scheduleSave();
						});
				});

		containerEl.createEl('h2', { text: 'LLM for Obsidian Models' });

		new Setting(containerEl)
			.setName('Popular Model Presets')
			.setDesc('Quickly add a mainstream provider/model preset, then fine-tune it below if needed.')
			.addDropdown(dropdown => {
				MODEL_PRESETS.forEach((preset, index) => {
					dropdown.addOption(String(index), `${preset.provider} · ${preset.name}`);
				});
				dropdown.setValue(String(this.selectedPresetIndex));
				dropdown.onChange((value) => {
					this.selectedPresetIndex = Number(value);
				});
			})
			.addButton(btn => btn
				.setButtonText('Add Preset')
				.setCta()
				.onClick(async () => {
					const preset = MODEL_PRESETS[this.selectedPresetIndex];
					if (!preset) {
						return;
					}

					this.plugin.settings.models.push({
						name: this.getUniqueModelName(preset.name),
						apiUrl: preset.apiUrl,
						apiKey: '',
						authMode: preset.authMode || 'api_key'
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		this.plugin.settings.models.forEach((m, index) => {
			const div = containerEl.createDiv({ cls: 'model-config-box' });
			div.style.border = '1px solid var(--background-modifier-border)';
			div.style.padding = '10px';
			div.style.marginBottom = '15px';
			div.style.borderRadius = '5px';

			new Setting(div)
				.setName(`Model Configuration`)
				.setHeading()
				.addButton(btn => btn
					.setButtonText('Remove Model')
					.setWarning()
					.setDisabled(this.plugin.settings.models.length <= 1)
					.onClick(async () => {
						if (this.plugin.settings.models.length <= 1) {
							return;
						}
						this.plugin.settings.models.splice(index, 1);
						if (this.plugin.settings.model === m.name && this.plugin.settings.models.length > 0) {
							this.plugin.settings.model = this.plugin.settings.models[0].name;
						}
						await this.plugin.saveSettings();
						this.display();
					}));

			new Setting(div)
				.setName(`Provider / Model Name`)
				.setDesc('e.g. gpt-4o, deepseek-chat')
				.addText(text => text
					.setValue(m.name)
					.onChange(async (value) => {
						if (this.plugin.settings.model === m.name) {
							this.plugin.settings.model = value;
						}
						m.name = value;
						this.scheduleSave();
					}));

			new Setting(div)
				.setName('Auth Mode')
				.setDesc('Use API key auth for standard providers, or Codex auth to reuse local `codex login` credentials.')
				.addDropdown(dropdown => {
					dropdown.addOption('api_key', 'API Key');
					dropdown.addOption('codex_auth', 'Codex Auth');
					dropdown.setValue(m.authMode || 'api_key');
					dropdown.onChange(async (value: 'api_key' | 'codex_auth') => {
						m.authMode = value;
						if (value === 'codex_auth' && !m.apiUrl.trim()) {
							m.apiUrl = 'https://chatgpt.com/backend-api/codex/responses';
						}
						if (value === 'codex_auth' && m.apiUrl.includes('/chat/completions')) {
							m.apiUrl = 'https://chatgpt.com/backend-api/codex/responses';
						}
						await this.plugin.saveSettings();
						this.display();
					});
				})
				.addButton(btn => {
					btn.setButtonText('Test');
					btn.onClick(async () => {
						const modelName = m.name.trim();
						if (!modelName) {
							new Notice('Please enter a model name before testing.', 6000);
							return;
						}

						btn.setDisabled(true);
						btn.setButtonText('Testing...');
						try {
							if (m.authMode === 'codex_auth') {
								const authResult = await testCodexAuthState();
								const sourceLabel = authResult.tokenSource === 'access_token'
									? 'access token'
									: 'refresh token';
								const refreshLabel = authResult.lastRefresh
									? ` Last refresh: ${new Date(authResult.lastRefresh).toLocaleString()}.`
									: '';
								new Notice(`Codex auth OK. Read ${sourceLabel} from ${authResult.authPath}.${refreshLabel}`, 6000);
							} else if (!m.apiKey.trim()) {
								new Notice('Please enter an API Key before testing this model.', 7000);
								return;
							}

							const result = await testModelConnection({
								apiUrl: m.apiUrl,
								apiKey: m.apiKey,
								model: modelName,
								authMode: m.authMode || 'api_key'
							});
							new Notice(`Model test OK for ${modelName}. Response preview: ${result.preview}`, 8000);
						} catch (error: any) {
							new Notice(`Model test failed for ${modelName}: ${error.message}`, 10000);
						} finally {
							btn.setButtonText('Test');
							btn.setDisabled(false);
						}
					});
				});

			new Setting(div)
				.setName(`API URL`)
				.setDesc(m.authMode === 'codex_auth'
					? 'Codex auth usually uses https://chatgpt.com/backend-api/codex/responses'
					: '')
				.addText(text => text
					.setPlaceholder('https://api.example.com/v1')
					.setValue(m.apiUrl)
					.onChange(async (value) => {
						m.apiUrl = value;
						this.scheduleSave();
					}));

			new Setting(div)
				.setName(`API Key`)
				.setDesc(m.authMode === 'codex_auth'
					? 'Not needed in Codex auth mode. The plugin will read ~/.codex/auth.json from your local codex login.'
					: '')
				.addText(text => {
					text.inputEl.type = 'password';
					text.setDisabled(m.authMode === 'codex_auth');
					text.setValue(m.apiKey).onChange(async (value) => {
						m.apiKey = value;
						this.scheduleSave();
					});
				});
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('Add Another Model')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.models.push({
						name: 'new-model',
						apiUrl: 'https://api.openai.com/v1/chat/completions',
						apiKey: '',
						authMode: 'api_key'
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		containerEl.createEl('h2', { text: 'Quick Prompts' });
		containerEl.createEl('p', {
			text: 'Manage the shortcut buttons shown above the chat input.',
			cls: 'setting-item-description'
		});

		this.plugin.settings.shortcuts.forEach((shortcut, index) => {
			const div = containerEl.createDiv({ cls: 'model-config-box' });
			div.style.border = '1px solid var(--background-modifier-border)';
			div.style.padding = '10px';
			div.style.marginBottom = '15px';
			div.style.borderRadius = '5px';

			new Setting(div)
				.setName(`Quick Prompt ${index + 1}`)
				.setHeading();

			new Setting(div)
				.setName('Button Label')
				.setDesc('Short text shown on the shortcut button.')
				.addText(text => text
					.setValue(shortcut.label)
					.onChange((value) => {
						shortcut.label = value.trim() || `Shortcut ${index + 1}`;
						this.scheduleSave();
					}));

			new Setting(div)
				.setName('Prompt')
				.setDesc('Message sent when the shortcut is clicked.')
				.addTextArea(text => {
					text.inputEl.style.width = '100%';
					text.inputEl.rows = 3;
					text.setValue(shortcut.prompt)
						.onChange((value) => {
							shortcut.prompt = value.trim();
							this.scheduleSave();
						});
				})
				.addButton(btn => btn
					.setButtonText('Remove Prompt')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.shortcuts.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('Add Quick Prompt')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.shortcuts.push({
						label: 'New Prompt',
						prompt: 'Write your prompt here.'
					});
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private scheduleSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}

		this.saveTimer = window.setTimeout(() => {
			this.plugin.saveSettings();
			this.saveTimer = null;
		}, 250);
	}

	private getUniqueModelName(baseName: string) {
		const existingNames = new Set(this.plugin.settings.models.map(model => model.name));
		if (!existingNames.has(baseName)) {
			return baseName;
		}

		let suffix = 2;
		while (existingNames.has(`${baseName} (${suffix})`)) {
			suffix += 1;
		}

		return `${baseName} (${suffix})`;
	}
}
