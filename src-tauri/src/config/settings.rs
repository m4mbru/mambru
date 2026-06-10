use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Configuration model — maps 1:1 to `~/.config/mambru/settings.toml`
// ---------------------------------------------------------------------------

/// Top-level settings document.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct Settings {
    pub provider: ProviderSettings,
    pub voice: VoiceConfig,
    pub appearance: AppearanceConfig,
    pub personality: PersonalityConfig,
    pub search: SearchConfig,
}

/// Active provider selection and per-provider endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct ProviderSettings {
    /// Which provider is currently active: `"ollama"`, `"openai"`, or `"anthropic"`.
    pub active: String,

    pub openai: ProviderEndpoint,
    pub anthropic: ProviderEndpoint,
    pub ollama: OllamaEndpoint,
}

/// A generic provider endpoint with an API key, base URL, and model name.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct ProviderEndpoint {
    /// Never serialised when empty (keys are sensitive and should be
    /// git-ignored; this just avoids writing empty strings to the file).
    #[serde(skip_serializing_if = "String::is_empty")]
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

/// Ollama-specific endpoint (no API key required for local connections).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct OllamaEndpoint {
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct VoiceConfig {
    pub enabled: bool,
    pub ptt_key: String,
    pub tts_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct AppearanceConfig {
    /// `"dark"` or `"light"`.
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct PersonalityConfig {
    /// One of `"default"`, `"professional"`, `"custom"`.
    pub preset: String,
    /// Free-form system prompt override (only used when `preset == "custom"`).
    #[serde(default)]
    pub custom_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct SearchConfig {
    /// `"tavily"` or `"serpapi"`.
    pub provider: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub api_key: String,
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: ProviderSettings {
                active: "ollama".into(),
                openai: ProviderEndpoint {
                    api_key: String::new(),
                    base_url: "https://api.openai.com/v1".into(),
                    model: "gpt-4o".into(),
                },
                anthropic: ProviderEndpoint {
                    api_key: String::new(),
                    base_url: "https://api.anthropic.com/v1".into(),
                    model: "claude-sonnet-4-20250514".into(),
                },
                ollama: OllamaEndpoint {
                    base_url: "http://localhost:11434".into(),
                    model: "llama3".into(),
                },
            },
            voice: VoiceConfig {
                enabled: true,
                ptt_key: "V".into(),
                tts_enabled: true,
            },
            appearance: AppearanceConfig {
                theme: "dark".into(),
            },
            personality: PersonalityConfig {
                preset: "default".into(),
                custom_prompt: String::new(),
            },
            search: SearchConfig {
                provider: "tavily".into(),
                api_key: String::new(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/// Resolve the config directory (`~/.config/mambru` on both Unix and Windows).
fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".config").join("mambru")
}

/// Full path to the settings file.
fn settings_path() -> PathBuf {
    config_dir().join("settings.toml")
}

impl Settings {
    /// Load settings from disk. Returns `None` if the file doesn't exist
    /// or can't be parsed (the caller should fall back to `Default`).
    pub fn load() -> Option<Self> {
        let path = settings_path();
        if !path.exists() {
            return None;
        }
        let raw = fs::read_to_string(&path).ok()?;
        toml::from_str(&raw)
            .inspect_err(|e| {
                eprintln!(
                    "[mambru] WARNING: failed to parse settings at {}: {e}",
                    path.display()
                );
            })
            .ok()
    }

    /// Save settings to disk, creating the config directory if needed.
    pub fn save(&self) -> Result<()> {
        let dir = config_dir();
        fs::create_dir_all(&dir)
            .with_context(|| format!("failed to create config directory `{}`", dir.display()))?;

        let path = settings_path();
        let raw = toml::to_string_pretty(self)
            .context("failed to serialise settings to TOML")?;
        fs::write(&path, &raw)
            .with_context(|| format!("failed to write settings to `{}`", path.display()))?;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings_valid_toml() {
        let settings = Settings::default();
        let toml_str = toml::to_string_pretty(&settings).expect("should serialise");
        let deserialised: Settings = toml::from_str(&toml_str).expect("should round-trip");
        assert_eq!(deserialised.provider.active, "ollama");
        assert_eq!(deserialised.voice.ptt_key, "V");
        assert_eq!(deserialised.appearance.theme, "dark");
    }

    #[test]
    fn test_api_keys_not_serialised_when_empty() {
        let settings = Settings::default();
        let toml_str = toml::to_string_pretty(&settings).expect("should serialise");
        assert!(!toml_str.contains("api_key"), "empty api_key should be skipped");
    }

    #[test]
    fn test_custom_prompt_defaults_to_empty() {
        let settings = Settings {
            personality: PersonalityConfig {
                preset: "custom".into(),
                custom_prompt: String::new(),
            },
            ..Default::default()
        };
        assert!(settings.personality.custom_prompt.is_empty());
    }

    // ── Expanded tests ────────────────────────────────────────────────

    #[test]
    fn test_load_from_valid_toml() {
        let toml_str = r#"
            [provider]
            active = "openai"
            [provider.openai]
            api_key = "sk-test"
            base_url = "https://api.openai.com/v1"
            model = "gpt-4"
            [provider.anthropic]
            api_key = ""
            base_url = "https://api.anthropic.com/v1"
            model = "claude-sonnet-4-20250514"
            [provider.ollama]
            base_url = "http://localhost:11434"
            model = "llama3"
            [voice]
            enabled = true
            ptt_key = "Space"
            tts_enabled = false
            [appearance]
            theme = "light"
            [personality]
            preset = "professional"
            custom_prompt = ""
            [search]
            provider = "tavily"
            api_key = "sk-search"
        "#;
        let settings: Settings = toml::from_str(toml_str).expect("should parse valid TOML");
        assert_eq!(settings.provider.active, "openai");
        assert_eq!(settings.voice.tts_enabled, false);
        assert_eq!(settings.voice.ptt_key, "Space");
        assert_eq!(settings.appearance.theme, "light");
        assert_eq!(settings.personality.preset, "professional");
        assert_eq!(settings.search.provider, "tavily");
        assert_eq!(settings.search.api_key, "sk-search");
    }

    #[test]
    fn test_load_from_invalid_toml_errors() {
        let toml_str = r#"
            [provider]
            active = "openai"
            bad_field = "oops"
        "#;
        let result: Result<Settings, _> = toml::from_str(toml_str);
        assert!(result.is_err(), "missing required fields should error");
    }

    #[test]
    fn test_save_and_load_round_trip() {
        let settings = Settings::default();
        let toml_str = toml::to_string_pretty(&settings).expect("should serialise");
        let deserialized: Settings = toml::from_str(&toml_str).expect("should deserialise");

        assert_eq!(deserialized.provider.active, settings.provider.active);
        assert_eq!(deserialized.voice.enabled, settings.voice.enabled);
        assert_eq!(deserialized.voice.ptt_key, settings.voice.ptt_key);
        assert_eq!(deserialized.appearance.theme, settings.appearance.theme);
        assert_eq!(deserialized.personality.preset, settings.personality.preset);
        assert_eq!(deserialized.search.provider, settings.search.provider);

        // API keys should round-trip correctly when present
        let mut custom = settings.clone();
        custom.provider.openai.api_key = "sk-test-key".into();
        custom.search.api_key = "search-key".into();
        let toml_str2 = toml::to_string_pretty(&custom).expect("should serialise");
        let deserialized2: Settings = toml::from_str(&toml_str2).expect("should deserialise");
        assert_eq!(deserialized2.provider.openai.api_key, "sk-test-key");
        assert_eq!(deserialized2.search.api_key, "search-key");
    }

    #[test]
    fn test_all_fields_present_in_toml_output() {
        let settings = Settings::default();
        let toml_str = toml::to_string_pretty(&settings).expect("should serialise");

        // Verify all top-level sections are present
        assert!(toml_str.contains("[provider]"), "TOML should contain [provider]");
        assert!(toml_str.contains("[voice]"), "TOML should contain [voice]");
        assert!(toml_str.contains("[appearance]"), "TOML should contain [appearance]");
        assert!(toml_str.contains("[personality]"), "TOML should contain [personality]");
        assert!(toml_str.contains("[search]"), "TOML should contain [search]");
        assert!(toml_str.contains("[provider.openai]"), "TOML should contain [provider.openai]");
        assert!(toml_str.contains("[provider.anthropic]"), "TOML should contain [provider.anthropic]");
        assert!(toml_str.contains("[provider.ollama]"), "TOML should contain [provider.ollama]");
    }

    #[test]
    fn test_missing_fields_default_to_defaults_on_deserialize() {
        // Minimal TOML with only required fields
        let toml_str = r#"
            [provider]
            active = "ollama"
            [provider.openai]
            api_key = ""
            base_url = ""
            model = ""
            [provider.anthropic]
            api_key = ""
            base_url = ""
            model = ""
            [provider.ollama]
            base_url = ""
            model = ""
            [voice]
            enabled = false
            ptt_key = ""
            tts_enabled = false
            [appearance]
            theme = ""
            [personality]
            preset = ""
            custom_prompt = ""
            [search]
            provider = ""
            api_key = ""
        "#;
        let settings: Settings = toml::from_str(toml_str).expect("should parse minimal TOML");
        // Fields that have defaults in Rust should not be set
        assert_eq!(settings.provider.active, "ollama");
        assert_eq!(settings.appearance.theme, "");
        assert_eq!(settings.personality.preset, "");
    }

    #[test]
    fn test_settings_implements_clone() {
        let a = Settings::default();
        let b = a.clone();
        assert_eq!(a.provider.active, b.provider.active);
        assert_eq!(a.voice.ptt_key, b.voice.ptt_key);
        assert_eq!(a.appearance.theme, b.appearance.theme);
    }
}
