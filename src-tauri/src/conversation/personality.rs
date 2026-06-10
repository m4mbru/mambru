use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Personality presets
// ---------------------------------------------------------------------------

/// Mambru's base system prompt — humorous, sarcastic, helpful.
const BASE_PROMPT: &str = "\
You are Mambru, a versatile desktop assistant. You are helpful, knowledgeable, \
and have a sharp sense of humour. You love sarcasm, wordplay, and pop-culture \
references, but you never cross into being rude or offensive. Your primary goal \
is to help the user get things done — whether that's writing code, answering \
questions, searching the web, or controlling their computer. You speak \
concisely, avoid unnecessary fluff, and always keep the user's best interests \
in mind. When the user writes in Spanish, you reply in Spanish with a warm \
Rioplatense vibe.";

/// Straightforward, no-nonsense alternative.
const PROFESSIONAL_PROMPT: &str = "\
You are Mambru, a professional desktop assistant. You provide clear, accurate, \
and well-structured responses. You avoid jokes, sarcasm, and informal language. \
Focus on being concise, precise, and helpful.";

/// The three presets the personality editor exposes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Preset {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "professional")]
    Professional,
    #[serde(rename = "custom")]
    Custom,
}

impl Preset {
    /// Parse a preset name from the settings file.
    pub fn from_str(s: &str) -> Self {
        match s {
            "professional" => Preset::Professional,
            "custom" => Preset::Custom,
            _ => Preset::Default,
        }
    }

    /// Return the system prompt for this preset.
    pub fn system_prompt(&self, custom_prompt: &str) -> String {
        match self {
            Preset::Default => BASE_PROMPT.to_string(),
            Preset::Professional => PROFESSIONAL_PROMPT.to_string(),
            Preset::Custom => {
                if custom_prompt.is_empty() {
                    BASE_PROMPT.to_string()
                } else {
                    custom_prompt.to_string()
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Personality manager — bridges Settings → system prompt
// ---------------------------------------------------------------------------

/// Resolves the active system prompt from a preset name and optional custom
/// prompt string.
pub fn resolve_system_prompt(preset_name: &str, custom_prompt: &str) -> String {
    let preset = Preset::from_str(preset_name);
    preset.system_prompt(custom_prompt)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_preset_returns_base() {
        let prompt = Preset::Default.system_prompt("");
        assert_eq!(prompt, BASE_PROMPT);
    }

    #[test]
    fn test_professional_preset_returns_professional() {
        let prompt = Preset::Professional.system_prompt("");
        assert_eq!(prompt, PROFESSIONAL_PROMPT);
    }

    #[test]
    fn test_custom_preset_with_content() {
        let custom = "You are a test bot.".to_string();
        let prompt = Preset::Custom.system_prompt(&custom);
        assert_eq!(prompt, "You are a test bot.");
    }

    #[test]
    fn test_custom_preset_falls_back_to_default_when_empty() {
        let prompt = Preset::Custom.system_prompt("");
        assert_eq!(prompt, BASE_PROMPT);
    }

    #[test]
    fn test_resolve_system_prompt_by_name() {
        assert_eq!(
            resolve_system_prompt("default", ""),
            BASE_PROMPT
        );
        assert_eq!(
            resolve_system_prompt("professional", ""),
            PROFESSIONAL_PROMPT
        );
        assert_eq!(
            resolve_system_prompt("custom", "Custom prompt"),
            "Custom prompt"
        );
    }

    #[test]
    fn test_unknown_preset_defaults_to_default() {
        assert_eq!(Preset::from_str("unknown"), Preset::Default);
        assert_eq!(Preset::from_str("default"), Preset::Default);
        assert_eq!(Preset::from_str("professional"), Preset::Professional);
        assert_eq!(Preset::from_str("custom"), Preset::Custom);
    }

    #[test]
    fn test_base_prompt_not_offensive() {
        let bad_words = ["fuck", "shit", "damn", "ass", "bastard", "bitch"];
        for w in &bad_words {
            assert!(
                !BASE_PROMPT.contains(*w),
                "base prompt should not contain '{w}'"
            );
        }
    }
}
