use std::sync::Mutex;

use tauri::State;

use crate::config::settings::Settings;
use crate::AppState;

// ---------------------------------------------------------------------------
// Settings IPC commands
// ---------------------------------------------------------------------------

/// Load current settings from the shared state.
#[tauri::command]
pub async fn get_settings(
    state: State<'_, Mutex<AppState>>,
) -> Result<Settings, String> {
    let state_lock = state.lock().map_err(|e| e.to_string())?;
    Ok(state_lock.settings_owned())
}

/// Persist new settings to disk and update the active LLM provider.
#[tauri::command]
pub async fn set_settings(
    state: State<'_, Mutex<AppState>>,
    settings: Settings,
) -> Result<(), String> {
    // Save to disk
    settings.save().map_err(|e| e.to_string())?;

    // Update in-memory state and reconfigure the provider
    let mut state_lock = state.lock().map_err(|e| e.to_string())?;
    state_lock.update_settings(settings);
    Ok(())
}
