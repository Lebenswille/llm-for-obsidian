import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
} from "obsidian";
import LlmPlugin from "../main";
import { ModelPreset } from "../types";
import {
  testModelConnection,
  getApiUrlRiskWarning,
} from "../api/llm";
import { testCodexAuthState } from "../api/codex";
import { DEFAULT_SETTINGS } from "../settings";

const MODEL_PRESETS: ModelPreset[] = [
  {
    provider: "OpenAI",
    name: "gpt-4o",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "OpenAI",
    name: "gpt-4.1-mini",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "Codex",
    name: "gpt-5.4",
    apiUrl: "https://chatgpt.com/backend-api/codex/responses",
    authMode: "codex_auth",
  },
  {
    provider: "Anthropic",
    name: "claude-3-5-sonnet-latest",
    apiUrl: "https://api.anthropic.com/v1/messages",
    authMode: "api_key",
  },
  {
    provider: "Google Gemini",
    name: "gemini-2.0-flash",
    apiUrl: "https://generativelanguage.googleapis.com",
    authMode: "api_key",
  },
  {
    provider: "DeepSeek",
    name: "deepseek-chat",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "OpenRouter",
    name: "openai/gpt-4o-mini",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "Groq",
    name: "llama-3.3-70b-versatile",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "Moonshot",
    name: "moonshot-v1-8k",
    apiUrl: "https://api.moonshot.cn/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "SiliconFlow",
    name: "Qwen/Qwen2.5-72B-Instruct",
    apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
    authMode: "api_key",
  },
  {
    provider: "Ollama",
    name: "llama3.1",
    apiUrl: "http://localhost:11434/v1/chat/completions",
    authMode: "api_key",
  },
];

export class LlmSettingTab extends PluginSettingTab {
  plugin: LlmPlugin;
  saveTimer: NodeJS.Timeout | null = null;
  selectedPresetIndex: number = 0;

  constructor(app: App, plugin: LlmPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LLM Assistant Settings" });

    new Setting(containerEl)
      .setName("System Prompt")
      .setDesc(
        "Customize the default instructions given to the selected model."
      )
      .addTextArea((text) => {
        text.inputEl.style.width = "100%";
        text.inputEl.rows = 4;
        text
          .setValue(
            this.plugin.settings.systemPrompt ||
              DEFAULT_SETTINGS.systemPrompt
          )
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt =
              value.trim() || DEFAULT_SETTINGS.systemPrompt;
            this.scheduleSave();
          });
      });

    new Setting(containerEl)
      .setName("PDF Note Template")
      .setDesc(
        "Customize the template for new notes created from PDFs. Available placeholders: ${sourceLink}, ${createdAt}, ${pdfName}, ${label}, ${content}"
      )
      .addTextArea((text) => {
        text.inputEl.style.width = "100%";
        text.inputEl.rows = 8;
        text
          .setValue(
            this.plugin.settings.pdfNoteTemplate ||
              DEFAULT_SETTINGS.pdfNoteTemplate
          )
          .onChange(async (value) => {
            this.plugin.settings.pdfNoteTemplate =
              value.trim() || DEFAULT_SETTINGS.pdfNoteTemplate;
            this.scheduleSave();
          });
      });

    ;

    new Setting(containerEl)
      .setName("Popular Model Presets")
      .setDesc(
        "Quickly add a mainstream provider/model preset, then fine-tune it below if needed."
      )
      .addDropdown((dropdown) => {
        MODEL_PRESETS.forEach((preset, index) => {
          dropdown.addOption(
            String(index),
            `${preset.provider} · ${preset.name}`
          );
        });
        dropdown.setValue(String(this.selectedPresetIndex));
        dropdown.onChange((value) => {
          this.selectedPresetIndex = Number(value);
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText("Add Preset")
          .setCta()
          .onClick(async () => {
            const preset = MODEL_PRESETS[this.selectedPresetIndex];
            if (!preset) {
              return;
            }

            this.plugin.settings.models.push({
              name: this.getUniqueModelName(preset.name),
              apiUrl: preset.apiUrl,
              apiKey: "",
              authMode: preset.authMode || "api_key",
            });

            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Model configurations
    this.plugin.settings.models.forEach((m, index) => {
      const div = containerEl.createDiv({ cls: "model-config-box" });
      div.style.border = "1px solid var(--background-modifier-border)";
      div.style.padding = "10px";
      div.style.marginBottom = "15px";
      div.style.borderRadius = "5px";

      new Setting(div)
        .setName("Model Configuration")
        .setHeading()
        .addButton((btn) =>
          btn
            .setButtonText("Remove Model")
            .setWarning()
            .setDisabled(this.plugin.settings.models.length <= 1)
            .onClick(async () => {
              if (this.plugin.settings.models.length <= 1) {
                return;
              }

              this.plugin.settings.models.splice(index, 1);

              if (
                this.plugin.settings.model === m.name &&
                this.plugin.settings.models.length > 0
              ) {
                const firstModel = this.plugin.settings.models[0];
                if (firstModel) {
                  this.plugin.settings.model = firstModel.name;
                }
              }

              await this.plugin.saveSettings();
              this.display();
            })
        );

      new Setting(div)
        .setName("Provider / Model Name")
        .setDesc("e.g. gpt-4o, deepseek-chat")
        .addText((text) =>
          text.setValue(m.name).onChange(async (value) => {
            if (this.plugin.settings.model === m.name) {
              this.plugin.settings.model = value;
            }
            m.name = value;
            this.scheduleSave();
          })
        );

      new Setting(div)
        .setName("Auth Mode")
        .setDesc(
          "Use API key auth for standard providers, or Codex auth to reuse local `codex login` credentials."
        )
        .addDropdown((dropdown) => {
          dropdown.addOption("api_key", "API Key");
          dropdown.addOption("codex_auth", "Codex Auth");
          dropdown.setValue(m.authMode || "api_key");
          dropdown.onChange(async (value: string) => {
            m.authMode = value as any;

            if (value === "codex_auth" && !m.apiUrl.trim()) {
              m.apiUrl = "https://chatgpt.com/backend-api/codex/responses";
            }

            if (
              value === "codex_auth" &&
              m.apiUrl.includes("/chat/completions")
            ) {
              m.apiUrl = "https://chatgpt.com/backend-api/codex/responses";
            }

            await this.plugin.saveSettings();
            this.display();
          });
        })
        .addButton((btn) => {
          btn.setButtonText("Test");

          btn.onClick(async () => {
            const modelName = m.name.trim();

            if (!modelName) {
              new Notice(
                "Please enter a model name before testing.",
                6000
              );
              return;
            }

            const apiUrlWarning = getApiUrlRiskWarning(m.apiUrl);
            if (
              apiUrlWarning &&
              !confirm(
                `${apiUrlWarning}
Do you want to test this endpoint anyway?`
              )
            ) {
              return;
            }

            btn.setDisabled(true);
            btn.setButtonText("Testing...");

            try {
              if (m.authMode === "codex_auth") {
                const authResult = await testCodexAuthState();
                const sourceLabel =
                  authResult.tokenSource === "access_token"
                    ? "access token"
                    : "refresh token";
                const refreshLabel = authResult.lastRefresh
                  ? ` Last refresh: ${new Date(
                      authResult.lastRefresh
                    ).toLocaleString()}.`
                  : "";

                new Notice(
                  `Codex auth OK. Read ${sourceLabel} from ${authResult.authPath}.${refreshLabel}`,
                  6000
                );
              } else if (!m.apiKey.trim()) {
                new Notice(
                  "Please enter an API Key before testing this model.",
                  7000
                );
                return;
              }

              const result = await testModelConnection({
                apiUrl: m.apiUrl,
                apiKey: m.apiKey,
                model: modelName,
                authMode: m.authMode || "api_key",
              });

              new Notice(
                `Model test OK for ${modelName}. Response preview: ${result.preview}`,
                8000
              );
            } catch (error: unknown) {
              new Notice(
                `Model test failed for ${modelName}: ${(error as any).message}`,
                10000
              );
            } finally {
              btn.setButtonText("Test");
              btn.setDisabled(false);
            }
          });
        });

      new Setting(div)
        .setName("API URL")
        .setDesc(
          m.authMode === "codex_auth"
            ? "Codex auth usually uses https://chatgpt.com/backend-api/codex/responses"
            : ""
        )
        .addText((text) =>
          text
            .setPlaceholder("https://api.example.com/v1")
            .setValue(m.apiUrl)
            .onChange(async (value) => {
              m.apiUrl = value;

              const warning = getApiUrlRiskWarning(value);
              if (warning) {
                new Notice(
                  "Warning: custom API URL may expose your note content and API key to an untrusted service.",
                  8000
                );
              }

              this.scheduleSave();
            })
        );

      new Setting(div)
        .setName("API Key")
        .setDesc(
          m.authMode === "codex_auth"
            ? "Not needed in Codex auth mode. The plugin will read ~/.codex/auth.json from your local codex login."
            : ""
        )
        .addText((text) => {
          text.inputEl.type = "password";
          text.setDisabled(m.authMode === "codex_auth");
          text.setValue(m.apiKey).onChange(async (value) => {
            m.apiKey = value;
            this.scheduleSave();
          });
        });
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add Another Model")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.models.push({
            name: "new-model",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            apiKey: "",
            authMode: "api_key",
          });

          await this.plugin.saveSettings();
          this.display();
        })
    );

    new Setting(containerEl).setName("Quick Prompts").setHeading();
    containerEl.createEl("p", {
      text: "Manage the shortcut buttons shown above the chat input.",
      cls: "setting-item-description",
    });

    this.plugin.settings.shortcuts.forEach((shortcut, index) => {
      const div = containerEl.createDiv({ cls: "model-config-box" });
      div.style.border = "1px solid var(--background-modifier-border)";
      div.style.padding = "10px";
      div.style.marginBottom = "15px";
      div.style.borderRadius = "5px";

      new Setting(div)
        .setName(`Quick Prompt ${index + 1}`)
        .setHeading();

      new Setting(div)
        .setName("Button Label")
        .setDesc("Short text shown on the shortcut button.")
        .addText((text) =>
          text.setValue(shortcut.label).onChange((value) => {
            shortcut.label =
              value.trim() || `Shortcut ${index + 1}`;
            this.scheduleSave();
          })
        );

      new Setting(div)
        .setName("Prompt")
        .setDesc("Message sent when the shortcut is clicked.")
        .addTextArea((text) => {
          text.inputEl.style.width = "100%";
          text.inputEl.rows = 3;
          text.setValue(shortcut.prompt).onChange((value) => {
            shortcut.prompt = value.trim();
            this.scheduleSave();
          });
        })
        .addButton((btn) =>
          btn
            .setButtonText("Remove Prompt")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.shortcuts.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add Quick Prompt")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.shortcuts.push({
            label: "New Prompt",
            prompt: "Write your prompt here.",
          });

          await this.plugin.saveSettings();
          this.display();
        })
    );
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }

    this.saveTimer = window.setTimeout(() => {
      this.plugin.saveSettings();
      this.saveTimer = null;
    }, 250) as unknown as NodeJS.Timeout;
  }

  private getUniqueModelName(baseName: string): string {
    const existingNames = new Set(
      this.plugin.settings.models.map((model) => model.name)
    );

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
