//! LLM abstraction layer.
//!
//! Defines the [`LLMProvider`] trait and concrete implementations for Ollama
//! (local) and OpenAI-compatible cloud providers. Also exposes the provider
//! factory used by [`AppState`] to initialise the active provider at startup.
//!
//! # Architecture
//!
//! ```text
//! provider::LLMProvider  (trait — port)
//!   ├── ollama::OllamaProvider  (adapter — local)
//!   └── openai::CloudProvider   (adapter — cloud)
//! ```
//!
//! The factory in this module reads the active provider name from `Settings`
//! and returns the matching `Box<dyn LLMProvider>`.

pub mod provider;
pub mod ollama;
pub mod openai;

pub use provider::*;

use crate::config::settings::Settings;

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/// Create the active LLM provider based on saved settings.
///
/// Falls back to Ollama when the configured provider name is unknown.
pub fn create_provider(settings: &Settings) -> Box<dyn LLMProvider> {
    match settings.provider.active.as_str() {
        "ollama" => Box::new(ollama::OllamaProvider::new(
            settings.provider.ollama.base_url.clone(),
            settings.provider.ollama.model.clone(),
        )),
        "openai" => Box::new(openai::CloudProvider::new(
            settings.provider.openai.api_key.clone(),
            settings.provider.openai.base_url.clone(),
            settings.provider.openai.model.clone(),
        )),
        "anthropic" => Box::new(openai::CloudProvider::new(
            settings.provider.anthropic.api_key.clone(),
            settings.provider.anthropic.base_url.clone(),
            settings.provider.anthropic.model.clone(),
        )),
        // Fallback to Ollama
        _ => Box::new(ollama::OllamaProvider::new(
            "http://localhost:11434".into(),
            "llama3".into(),
        )),
    }
}
