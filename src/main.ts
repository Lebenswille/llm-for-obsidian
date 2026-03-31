import { Plugin } from "obsidian";
import { LlmSettings, DEFAULT_SETTINGS } from "./settings";
import { CHAT_VIEW_TYPE, ChatView } from "./ui/chat-view";
import { LlmSettingTab } from "./ui/settings-tab";

export default class LlmPlugin extends Plugin {
	settings: LlmSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		this.addRibbonIcon("bot", "LLM for Obsidian", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-llm-chat-view",
			name: "Open chat view",
			callback: () => {
				this.activateView();
			},
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

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		) as LlmSettings;

		// Normalize shortcuts
		this.settings.shortcuts = Array.isArray(this.settings.shortcuts) &&
			this.settings.shortcuts.length > 0
			? this.settings.shortcuts.map((shortcut, index) => ({
				label: (shortcut?.label || "").trim() || `Shortcut ${index + 1}`,
				prompt: (shortcut?.prompt || "").trim() || "",
			}))
			: DEFAULT_SETTINGS.shortcuts.map((shortcut) => ({ ...shortcut }));

		// Normalize models
		if (!this.settings.models || this.settings.models.length === 0) {
			this.settings.models = [];

			if (
				(this.settings as any).hasOwnProperty("addedModels") &&
				(this.settings as any).addedModels &&
				(this.settings as any).addedModels.length > 0
			) {
				(this.settings as any).addedModels.forEach((m: string) => {
					this.settings.models.push({
						name: m,
						apiUrl:
							(this.settings as any).apiUrl ||
							"https://api.openai.com/v1/chat/completions",
						apiKey: (this.settings as any).apiKey || "",
						authMode: "api_key",
					});
				});
			} else if ((this.settings as any).model && (this.settings as any).model.includes(",")) {
				const names = ((this.settings as any).model as string)
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);

				names.forEach((m) => {
					this.settings.models.push({
						name: m,
						apiUrl:
							(this.settings as any).apiUrl ||
							"https://api.openai.com/v1/chat/completions",
						apiKey: (this.settings as any).apiKey || "",
						authMode: "api_key",
					});
				});

			this.settings.model = names[0] || DEFAULT_SETTINGS.model;
			} else if ((this.settings as any).model) {
				this.settings.models.push({
					name: (this.settings as any).model,
					apiUrl:
						(this.settings as any).apiUrl ||
						"https://api.openai.com/v1/chat/completions",
					apiKey: (this.settings as any).apiKey || "",
					authMode: "api_key",
				});
			} else {
				this.settings.models = [...DEFAULT_SETTINGS.models];
			}
		}

		this.settings.models = this.settings.models.map((model) => ({
			...model,
			name: (model.name || "").trim() || "unnamed-model",
			apiUrl: (model.apiUrl || "").trim() || "https://api.openai.com/v1/chat/completions",
			apiKey: model.apiKey || "",
			authMode: model.authMode === "codex_auth" ? "codex_auth" : "api_key",
		}));

		if (
			!this.settings.models.find(
				(model) => model.name === this.settings.model
			)
		) {
			this.settings.model =
				this.settings.models[0]?.name || DEFAULT_SETTINGS.model;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
