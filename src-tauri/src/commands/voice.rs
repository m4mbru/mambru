//! Tauri IPC command handlers for the voice pipeline.
//!
//! Provides push-to-talk capture lifecycle and TTS control.
//! The commands are thin adapters that delegate to the `voice::VoicePipeline`.

use std::sync::Mutex;

use tauri::AppHandle;
use tauri::Emitter;

use crate::voice::VoicePipeline;

// ---------------------------------------------------------------------------
// Helper: acquire the pipeline from AppState
// ---------------------------------------------------------------------------

/// Convenience alias for the locked pipeline inside AppState.
type LockedPipeline<'a> = std::sync::MutexGuard<'a, crate::AppState>;

/// Emit a voice-related event to the frontend.
fn emit_event(app: &AppHandle, event: &str, payload: &str) {
    let _ = app.emit(event, payload);
}

// ---------------------------------------------------------------------------
// IPC Commands
// ---------------------------------------------------------------------------

/// Begin microphone audio capture (PTT pressed).
///
/// The caller should have verified that a microphone is available and the
/// voice pipeline is initialised. Capture continues until `stop_voice_capture`
/// is called.
#[tauri::command]
pub async fn start_voice_capture(
    app: AppHandle,
    state: tauri::State<'_, Mutex<crate::AppState>>,
) -> Result<(), String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    if app_state.voice_pipeline.is_capturing() {
        emit_event(&app, "voice:error", "Already capturing");
        return Err("already capturing".into());
    }

    if !app_state.voice_pipeline.stt_available() {
        emit_event(&app, "voice:error", "STT engine not available — no whisper model found");
        return Err("STT engine not available".into());
    }

    app_state.voice_pipeline.start_capture();
    emit_event(&app, "voice:capture-started", "Recording");

    eprintln!("[mambru] voice: capture started");
    Ok(())
}

/// Stop capture and return transcribed text.
///
/// Returns an empty string if no speech was detected.
#[tauri::command]
pub async fn stop_voice_capture(
    app: AppHandle,
    state: tauri::State<'_, Mutex<crate::AppState>>,
) -> Result<String, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    if !app_state.voice_pipeline.is_capturing() {
        emit_event(&app, "voice:error", "Not capturing");
        return Err("not capturing".into());
    }

    emit_event(&app, "voice:capture-stopped", "Transcribing");

    let text = app_state
        .voice_pipeline
        .stop_capture()
        .await
        .map_err(|e| {
            emit_event(&app, "voice:error", &format!("Transcription failed: {e}"));
            e.to_string()
        })?;

    if text.is_empty() {
        emit_event(&app, "voice:no-speech", "No speech detected");
    } else {
        emit_event(
            &app,
            "voice:transcribed",
            &format!("Transcribed: {text}"),
        );
    }

    eprintln!("[mambru] voice: capture stopped — transcribed {} chars", text.len());
    Ok(text)
}

/// Toggle TTS on/off. Returns the new state.
#[tauri::command]
pub async fn toggle_tts(
    app: AppHandle,
    state: tauri::State<'_, Mutex<crate::AppState>>,
) -> Result<bool, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    // Toggle via settings
    app_state.settings.voice.tts_enabled = !app_state.settings.voice.tts_enabled;

    // Persist the change
    if let Err(e) = app_state.settings.save() {
        eprintln!("[mambru] voice: failed to persist TTS toggle: {e}");
    }

    let new_state = app_state.settings.voice.tts_enabled;
    emit_event(
        &app,
        "voice:tts-toggled",
        if new_state { "enabled" } else { "disabled" },
    );

    eprintln!("[mambru] voice: TTS toggled to {new_state}");
    Ok(new_state)
}

/// Synthesise and play arbitrary text via TTS.
///
/// If TTS is disabled or unavailable, this is a no-op.
#[tauri::command]
pub async fn speak_text(
    app: AppHandle,
    state: tauri::State<'_, Mutex<crate::AppState>>,
    text: String,
) -> Result<(), String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;

    if !app_state.settings.voice.tts_enabled {
        emit_event(&app, "voice:tts-skipped", "TTS is disabled");
        return Ok(());
    }

    if !app_state.voice_pipeline.tts_available() {
        emit_event(&app, "voice:tts-unavailable", "TTS engine not available");
        return Ok(());
    }

    // Drop the lock before TTS (could take a while)
    drop(app_state);

    // Re-acquire for speaking.  speak() takes &self so a shared lock is fine.
    let state2 = state.lock().map_err(|e| e.to_string())?;
    state2
        .voice_pipeline
        .speak(&text)
        .map_err(|e| {
            emit_event(&app, "voice:error", &format!("TTS failed: {e}"));
            e.to_string()
        })?;

    emit_event(&app, "voice:tts-finished", "Speech complete");
    Ok(())
}

/// Get the current voice pipeline status.
#[tauri::command]
pub async fn get_voice_status(
    state: tauri::State<'_, Mutex<crate::AppState>>,
) -> Result<VoiceStatus, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    Ok(VoiceStatus {
        is_capturing: app_state.voice_pipeline.is_capturing(),
        is_speaking: app_state.voice_pipeline.is_speaking(),
        stt_available: app_state.voice_pipeline.stt_available(),
        tts_available: app_state.voice_pipeline.tts_available(),
        tts_enabled: app_state.settings.voice.tts_enabled,
    })
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct VoiceStatus {
    pub is_capturing: bool,
    pub is_speaking: bool,
    pub stt_available: bool,
    pub tts_available: bool,
    pub tts_enabled: bool,
}
