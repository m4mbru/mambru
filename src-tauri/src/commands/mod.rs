//! Tauri IPC command handlers (UI ↔ backend bridge).
//!
//! Each submodule exposes `#[tauri::command]` functions that Svelte calls
//! via `invoke()`. The handlers are thin adapters that delegate to the
//! appropriate domain module (`llm`, `config`, `voice`, `tools`, etc.).
//!
//! # Submodules
//!
//! - `chat` — `send_message`, `get_history`, `new_conversation`, `delete_conversation`
//! - `settings` — `get_settings`, `set_settings`
//! - `voice` — `start_voice_capture`, `stop_voice_capture`, `toggle_tts`, `speak_text`
//! - `tools` — `get_commands`, `save_command`, `delete_command`, `build_command`, `confirm_execution`, `search_web`, `execute_tool_call`

pub mod chat;
pub mod settings;
pub mod tools;
pub mod voice;
