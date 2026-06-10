//! Conversation management.
//!
//! Maintains an in-memory message list and persists history as JSON files
//! on disk so conversations survive restarts. Also manages system prompts
//! and personality presets.
//!
//! # Submodules
//!
//! - `history` — [`ConversationManager`] with CRUD + JSON persistence
//! - `personality` — [`Preset`] enum, system prompt resolution

pub mod history;
pub mod personality;

pub use history::ConversationManager;
pub use personality::resolve_system_prompt;
