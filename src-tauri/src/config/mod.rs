//! Application configuration.
//!
//! Settings are stored as TOML in `~/.config/mambru/settings.toml` and
//! loaded at startup. The [`Settings`] struct drives every configurable
//! aspect of the application: LLM provider choice, voice pipeline,
//! appearance, personality, and search API keys.

pub mod settings;

pub use settings::*;
