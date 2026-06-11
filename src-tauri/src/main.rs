// Suppress console window in release builds — Tauri is a GUI app.
// Debug builds keep the console for logging during development.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Pre-declare all backend modules (stubs populated in later phases)
mod commands;
mod config;
mod conversation;
mod llm;
mod security;
mod tools;
mod voice;

#[cfg(test)]
mod integration_tests;

use std::collections::HashMap;
use tokio::sync::Mutex;

use llm::provider::{LLMProvider, Message};

use crate::commands::tools::PendingExecution;
use crate::tools::commands::matcher::CommandMatcher;
use crate::tools::commands::Command;

/// Shared application state accessible from Tauri IPC handlers.
///
/// Holds the active settings, the current LLM provider, the in-memory
/// conversation manager, the voice pipeline, the command registry and
/// matcher, and any pending command executions — all behind `Mutex`
/// for thread-safe access.
pub struct AppState {
    pub settings: config::settings::Settings,
    pub provider: Box<dyn LLMProvider>,
    pub conversation_history: conversation::ConversationManager,
    pub voice_pipeline: voice::VoicePipeline,

    /// The list of user-defined custom commands (loaded from commands.toml).
    pub command_list: Vec<Command>,
    /// Compiled regex matcher for the current command list.
    pub command_matcher: CommandMatcher,
    /// Commands awaiting user confirmation (Medium / Dangerous risk).
    pub pending_executions: HashMap<String, PendingExecution>,
}

// ---------------------------------------------------------------------------
// AppState helpers — called from IPC command handlers
// ---------------------------------------------------------------------------

impl AppState {
    fn new(settings: config::settings::Settings) -> Self {
        let provider = llm::create_provider(&settings);
        let history = conversation::ConversationManager::new(None);

        // Initialise voice pipeline — falls back to mock backends if
        // whisper / Piper models are not found at startup.
        let vad = voice::VadEngine::default().expect("VAD engine init");
        let stt = voice::create_stt_engine(None);
        let tts = voice::create_tts_engine();
        let voice_pipeline = voice::VoicePipeline::new(vad, stt, tts);

        // Load user-defined commands from disk
        let command_list = tools::commands::registry::CommandRegistry::load()
            .all()
            .to_vec();
        let command_matcher = CommandMatcher::new(&command_list);

        Self {
            settings,
            provider,
            conversation_history: history,
            voice_pipeline,
            command_list,
            command_matcher,
            pending_executions: HashMap::new(),
        }
    }

    /// Recreate the provider when settings change.
    fn update_settings(&mut self, settings: config::settings::Settings) {
        self.settings = settings;
        self.provider = llm::create_provider(&self.settings);
    }

    /// Rebuild the command matcher after adding / removing / editing commands.
    fn rebuild_matcher(&mut self) {
        self.command_matcher = CommandMatcher::new(&self.command_list);
    }

    // -- Settings access ------------------------------------------------

    fn settings(&self) -> &config::settings::Settings {
        &self.settings
    }

    fn settings_owned(&self) -> config::settings::Settings {
        self.settings.clone()
    }

    fn provider(&self) -> &dyn LLMProvider {
        self.provider.as_ref()
    }

    // -- Conversation helpers -------------------------------------------

    fn list_conversations(&self) -> Vec<conversation::history::ConversationSummary> {
        self.conversation_history.list()
    }

    fn has_conversation(&self, id: &str) -> bool {
        self.conversation_history.get(id).is_some()
    }

    fn get_conversation_messages(&self, id: &str) -> Option<Vec<Message>> {
        self.conversation_history
            .get(id)
            .map(|c| c.messages.clone())
    }

    fn new_conversation(&mut self, model: Option<&str>) -> String {
        self.conversation_history.create(model)
    }

    fn delete_conversation(&mut self, id: &str) -> bool {
        self.conversation_history.delete(id)
    }

    fn append_message(&mut self, conversation_id: &str, message: Message) -> bool {
        self.conversation_history
            .append_message(conversation_id, message)
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Compile-time assertion: AppState must be Send for thread-safe access
/// via Mutex<AppState> and for async Tauri command handlers.
#[allow(dead_code)]
fn _assert_appstate_is_send() {
    fn require_send<T: Send>() {}
    require_send::<crate::AppState>();
}

fn main() {
    // Load persisted settings or fall back to defaults
    let initial_settings = config::settings::Settings::load().unwrap_or_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(AppState::new(initial_settings)))
        .setup(|_app| {
            // Future phases will initialise additional services here.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::log_debug,
            commands::chat::get_history,
            commands::chat::new_conversation,
            commands::chat::delete_conversation,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::voice::start_voice_capture,
            commands::voice::stop_voice_capture,
            commands::voice::toggle_tts,
            commands::voice::speak_text,
            commands::voice::get_voice_status,
            commands::voice::check_models,
            commands::voice::start_download,
            commands::voice::start_continuous_capture,
            commands::voice::stop_continuous_capture,
            // Tools & Security (Phase 4)
            commands::tools::get_commands,
            commands::tools::save_command,
            commands::tools::delete_command,
            commands::tools::build_command,
            commands::tools::confirm_execution,
            commands::tools::search_web,
            commands::tools::execute_tool_call,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mambru");
}
