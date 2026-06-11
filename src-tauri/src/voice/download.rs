//! Model download management — whisper and Piper model discovery and download.
//!
//! Scans local paths for existing model files, streams downloads from remote
//! URLs with progress events. Piper models are distributed as individual
//! `.onnx` + `.onnx.json` files (not archives).
//!
//! # IPC Commands
//!
//! - `check_models` — scan `{app_data_dir}/models/` for existing models
//! - `start_download` — download a model with streaming progress events

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

/// Log a message to both stderr and a rotating log file in the app data dir.
fn log_download(app: &AppHandle, msg: &str) {
    eprintln!("[mambru] {msg}");
    let log_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let log_path = log_dir.join("mambru-download.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let now = chrono::Local::now().format("%H:%M:%S");
        let _ = writeln!(f, "[{now}] {msg}");
    }
}

// ---------------------------------------------------------------------------
// Types — shared with frontend via Serialize
// ---------------------------------------------------------------------------

/// Which model family to check / download.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModelKind {
    Whisper,
    Piper,
}

/// The state of a single model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelState {
    Missing,
    Downloading { bytes: u64, total: u64 },
    Ready,
    Failed(String),
}

/// Payload for `model:progress` events.
#[derive(Debug, Clone, Serialize)]
pub struct ModelProgressPayload {
    pub name: String,
    pub bytes: u64,
    pub total: u64,
}

/// Payload for `model:done` events.
#[derive(Debug, Clone, Serialize)]
pub struct ModelDonePayload {
    pub name: String,
    pub success: bool,
}

// ---------------------------------------------------------------------------
// Download URLs
// ---------------------------------------------------------------------------

/// URL for the whisper.cpp base model (redirects to signed S3, ~150MB).
const WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

/// Piper ONNX model (voice data) — en_US-lessac-medium (~63MB).
const PIPER_ONNX_URL: &str =
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx";

/// Piper ONNX JSON config (phoneme map, voice metadata, ~5KB).
const PIPER_JSON_URL: &str =
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json";

// ---------------------------------------------------------------------------
// Download guard (one download at a time)
// ---------------------------------------------------------------------------

static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn models_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir is always available")
        .join("models")
}

fn whisper_model_path(app: &AppHandle) -> PathBuf {
    models_dir(app).join("whisper").join("ggml-base.bin")
}

fn piper_onnx_path(app: &AppHandle) -> PathBuf {
    models_dir(app).join("piper").join("voice.onnx")
}

fn piper_json_path(app: &AppHandle) -> PathBuf {
    models_dir(app).join("piper").join("voice.onnx.json")
}

// ---------------------------------------------------------------------------
// IPC Commands
// ---------------------------------------------------------------------------

/// Scan `{app_data_dir}/models/` and report which models are ready or missing.
pub async fn check_models(app: AppHandle) -> Result<HashMap<ModelKind, ModelState>, String> {
    let mut result = HashMap::new();

    // Whisper: check ggml-base.bin
    if whisper_model_path(&app).exists() {
        result.insert(ModelKind::Whisper, ModelState::Ready);
    } else {
        result.insert(ModelKind::Whisper, ModelState::Missing);
    }

    // Piper: check voice.onnx + voice.onnx.json
    let onnx_ok = piper_onnx_path(&app).exists();
    let json_ok = piper_json_path(&app).exists();
    if onnx_ok && json_ok {
        result.insert(ModelKind::Piper, ModelState::Ready);
    } else {
        result.insert(ModelKind::Piper, ModelState::Missing);
    }

    let wh_path = whisper_model_path(&app);
    let piper_path = piper_onnx_path(&app);
    log_download(
        &app,
        &format!(
            "check_models — Whisper({}): exists={}, Piper({}): onnx_exists={}, json_exists={}",
            wh_path.display(),
            wh_path.exists(),
            piper_path.display(),
            onnx_ok,
            json_ok,
        ),
    );

    Ok(result)
}

/// Start downloading a model in the background.
///
/// Emits `model:progress` (ModelProgressPayload) and `model:done`
/// (ModelDonePayload) events to the frontend.
pub async fn start_download(app: AppHandle, kind: ModelKind) -> Result<(), String> {
    // Reject if a download is already in flight
    if DOWNLOAD_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        return Err("A download is already in progress".into());
    }

    let app_clone = app.clone();
    tokio::spawn(async move {
        log_download(&app_clone, &format!("download starting: {kind:?}"));
        let result = download_model(&app_clone, &kind).await;
        match &result {
            Ok(()) => log_download(&app_clone, &format!("download complete: {kind:?}")),
            Err(e) => {
                log_download(&app_clone, &format!("download FAILED: {kind:?} — {e}"));
                let _ = app_clone.emit(
                    "model:done",
                    ModelDonePayload {
                        name: format!("{kind:?}"),
                        success: false,
                    },
                );
            }
        }
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Internal download logic
// ---------------------------------------------------------------------------

/// Helper: stream a single URL to a temp file, emit progress events, then
/// atomically rename `.tmp` to `final_path`.
async fn stream_to_file(
    app: &AppHandle,
    url: &str,
    temp_path: &std::path::Path,
    final_path: &std::path::Path,
    display_name: &str,
) -> Result<(), String> {
    log_download(app, &format!("HTTP GET {url}"));

    let client = reqwest::ClientBuilder::new()
        .user_agent("Mambru/0.1.0")
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;

    log_download(app, &format!("HTTP response: {} ({} bytes)", response.status(), response.content_length().unwrap_or(0)));

    if !response.status().is_success() {
        return Err(format!(
            "server returned {} for {}",
            response.status(),
            url
        ));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(temp_path)
        .await
        .map_err(|e| format!("failed to create temp file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write error: {e}"))?;
        downloaded += chunk.len() as u64;

        let _ = app.emit(
            "model:progress",
            ModelProgressPayload {
                name: display_name.to_string(),
                bytes: downloaded,
                total,
            },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("flush error: {e}"))?;
    drop(file);

    log_download(app, &format!("downloaded {downloaded} bytes, renaming {display_name}"));

    // Atomic rename
    std::fs::rename(temp_path, final_path)
        .map_err(|e| format!("rename failed: {e}"))?;

    log_download(app, &format!("rename OK: {display_name}"));

    Ok(())
}

/// Perform the actual download (streaming) and file placement.
/// Runs inside a `tokio::spawn` future.
async fn download_model(app: &AppHandle, kind: &ModelKind) -> Result<(), String> {
    match kind {
        ModelKind::Whisper => {
            let dir = models_dir(app).join("whisper");
            tokio::fs::create_dir_all(&dir)
                .await
                .map_err(|e| format!("failed to create whisper dir: {e}"))?;

            let tmp = dir.join("ggml-base.bin.tmp");
            let fin = dir.join("ggml-base.bin");

            stream_to_file(app, WHISPER_MODEL_URL, &tmp, &fin, "whisper").await?;
        }
        ModelKind::Piper => {
            let piper_dir = models_dir(app).join("piper");
            tokio::fs::create_dir_all(&piper_dir)
                .await
                .map_err(|e| format!("failed to create piper dir: {e}"))?;

            // Download both files to .tmp first, then rename atomically so a
            // partial failure never leaves stale .onnx without matching .json.
            let onnx_tmp = piper_dir.join("voice.onnx.tmp");
            let onnx_fin = piper_dir.join("voice.onnx");
            let json_tmp = piper_dir.join("voice.onnx.json.tmp");
            let json_fin = piper_dir.join("voice.onnx.json");

            // 1. Download .onnx (large ~63 MB)
            stream_to_file(app, PIPER_ONNX_URL, &onnx_tmp, &onnx_fin, "piper").await?;

            // 2. Download .onnx.json (small ~5 KB)
            stream_to_file(app, PIPER_JSON_URL, &json_tmp, &json_fin, "piper").await?;
        }
    }

    let _ = app.emit(
        "model:done",
        ModelDonePayload {
            name: format!("{kind:?}"),
            success: true,
        },
    );

    Ok(())
}
