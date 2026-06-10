//! Speech-to-text via whisper.cpp bindings.
//!
//! Uses `whisper-rs` for local transcription with quantized models (tiny/base).
//! Language auto-detection or explicit `es` / `en`.
//!
//! # Trait Abstraction
//!
//! The [`SttBackend`] trait decouples the pipeline from the concrete
//! implementation, making it testable and swappable if whisper-rs API changes.

use std::path::Path;

use anyhow::{Context, Result};
use async_trait::async_trait;

// ---------------------------------------------------------------------------
// Trait — SttBackend
// ---------------------------------------------------------------------------

/// Abstract speech-to-text backend.
#[async_trait]
pub trait SttBackend: Send + Sync {
    /// Transcribe a buffer of mono f32 PCM samples at 16 kHz.
    /// Returns the transcribed text.
    async fn transcribe(&self, audio: Vec<f32>) -> Result<String>;

    /// Human-readable name for logging / diagnostics.
    fn name(&self) -> &str;

    /// Returns `true` if the backend is fully initialised and usable.
    fn is_available(&self) -> bool;
}

// ---------------------------------------------------------------------------
// WhisperBackend — real whisper.cpp implementation
// ---------------------------------------------------------------------------

/// Configuration for the whisper.cpp transcription engine.
#[derive(Debug, Clone)]
pub struct WhisperConfig {
    /// Path to the GGML model file (e.g. `ggml-tiny.bin`).
    pub model_path: std::path::PathBuf,

    /// Language code (`"es"`, `"en"`, or `None` for auto-detect).
    pub language: Option<String>,

    /// Number of CPU threads to use.
    pub n_threads: u32,
}

impl Default for WhisperConfig {
    fn default() -> Self {
        Self {
            // ~/.config/mambru/whisper/models/ by convention
            model_path: dirs_or_default().join("whisper").join("models"),
            language: None,
            n_threads: 4,
        }
    }
}

/// Returns the best guess for the config directory.
fn dirs_or_default() -> std::path::PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    std::path::PathBuf::from(home).join(".config").join("mambru")
}

/// Real STT backend using whisper.cpp (via `whisper-rs`).
pub struct WhisperBackend {
    /// Path to the GGML model file — stored as String so it's Send+Sync.
    model_path_str: String,
    config: WhisperConfig,
    available: bool,
}

impl WhisperBackend {
    /// Load the whisper model from the given path.
    ///
    /// # Errors
    ///
    /// Returns an error if the model file doesn't exist or can't be loaded.
    pub fn new(model_path: &Path) -> Result<Self> {
        if !model_path.exists() {
            anyhow::bail!(
                "whisper model not found at `{}` — voice transcription unavailable",
                model_path.display()
            );
        }

        let model_path_str = model_path.to_str().unwrap_or("").to_string();

        let config = WhisperConfig {
            model_path: model_path.to_path_buf(),
            ..Default::default()
        };

        Ok(Self {
            model_path_str,
            config,
            available: true,
        })
    }

    /// Try to load the model from the default config directory.
    pub fn try_default() -> Self {
        let config = WhisperConfig::default();
        let model_file = find_model_file(&config.model_path);

        match model_file.and_then(|p| Self::new(&p).ok()) {
            Some(engine) => engine,
            None => {
                // Return a "dead" backend — transcribe will always error
                // with a helpful message.
                Self {
                    model_path_str: config.model_path.to_string_lossy().to_string(),
                    config,
                    available: false,
                }
            }
        }
    }

    fn run_transcription(&self, audio: &[f32]) -> Result<String> {
        let mut params = whisper_rs::FullParams::new(
            whisper_rs::SamplingStrategy::Greedy { best_of: 1 },
        );

        params.set_n_threads(self.config.n_threads);
        if let Some(ref lang) = self.config.language {
            params.set_language(Some(lang))?;
        } else {
            params.set_detect_language(true);
        }

        // Run inference (blocking — called from async context)
        let mut state = self
            .ctx
            .create_state()
            .context("failed to create whisper state")?;

        state
            .full(params, audio)
            .context("whisper transcription failed")?;

        let n_segments = state
            .full_n_segments()
            .context("failed to get segment count")?;

        let mut text = String::new();
        for i in 0..n_segments {
            let segment = state
                .full_get_segment_text(i)
                .context("failed to get segment text")?;
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(&segment);
        }

        Ok(text.trim().to_string())
    }
}

fn find_model_file(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    for entry in std::fs::read_dir(dir).ok()? {
        let path = entry.ok()?.path();
        if let Some(ext) = path.extension() {
            if ext == "bin" || ext == "ggml" {
                return Some(path);
            }
        }
        // Also match files starting with "ggml-" that have no extension
        if let Some(name) = path.file_name()?.to_str() {
            if name.starts_with("ggml-") && path.extension().is_none() {
                return Some(path);
            }
        }
    }
    None
}

#[async_trait]
impl SttBackend for WhisperBackend {
    async fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        if !self.available {
            anyhow::bail!(
                "whisper model not available — check `{}`",
                self.config.model_path.display()
            );
        }

        // WhisperContext is !Send, so we cannot move it into spawn_blocking.
        // Instead, store the model path and load the context fresh inside
        // the blocking thread.  This is suboptimal (model reload each call)
        // but correct.  A future optimisation can use a dedicated thread
        // that holds the context and communicates via channels.
        let model_path = self.model_path_str.clone();
        let audio_clone = audio;

        tokio::task::spawn_blocking(move || -> Result<String> {
            let ctx = whisper_rs::WhisperContext::new(&model_path)
                .map_err(|e| anyhow::anyhow!("failed to load whisper model: {e}"))?;
            let mut state = ctx
                .create_state()
                .map_err(|e| anyhow::anyhow!("failed to create state: {e}"))?;

            let mut params = whisper_rs::FullParams::new(
                whisper_rs::SamplingStrategy::Greedy { best_of: 1 },
            );
            params.set_n_threads(4);

            state
                .full(params, &audio_clone)
                .map_err(|e| anyhow::anyhow!("transcription failed: {e}"))?;

            let n = state
                .full_n_segments()
                .map_err(|e| anyhow::anyhow!("segment count failed: {e}"))?;

            let mut out = String::new();
            for i in 0..n {
                let seg = state
                    .full_get_segment_text(i)
                    .map_err(|e| anyhow::anyhow!("segment {i} failed: {e}"))?;
                if !out.is_empty() {
                    out.push(' ');
                }
                out.push_str(&seg);
            }
            Ok(out.trim().to_string())
        })
        .await
        .context("transcription thread panicked")?
    }

    fn name(&self) -> &str {
        "whisper.cpp"
    }

    fn is_available(&self) -> bool {
        self.available
    }
}

// ---------------------------------------------------------------------------
// MockSttBackend — for testing / when no model is present
// ---------------------------------------------------------------------------

/// A mock STT backend that returns a fixed response or echoes the audio
/// length as a placeholder. Useful for frontend development and integration
/// tests without a real whisper model.
pub struct MockSttBackend {
    /// If `Some`, return this text regardless of input.
    pub fixed_response: Option<String>,
    /// If `true`, simulate a processing delay (in ms).
    pub simulated_delay_ms: u64,
}

impl MockSttBackend {
    pub fn new() -> Self {
        Self {
            fixed_response: None,
            simulated_delay_ms: 0,
        }
    }

    /// Create a backend that always returns the given text.
    pub fn with_response(text: &str) -> Self {
        Self {
            fixed_response: Some(text.to_string()),
            simulated_delay_ms: 0,
        }
    }
}

#[async_trait]
impl SttBackend for MockSttBackend {
    async fn transcribe(&self, _audio: Vec<f32>) -> Result<String> {
        if self.simulated_delay_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.simulated_delay_ms)).await;
        }
        Ok(self
            .fixed_response
            .clone()
            .unwrap_or_else(|| "[mock transcription]".to_string()))
    }

    fn name(&self) -> &str {
        "mock-stt"
    }

    fn is_available(&self) -> bool {
        true
    }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/// Try to create a real WhisperBackend; fall back to MockSttBackend.
pub fn create_stt_engine(model_dir: Option<&Path>) -> Box<dyn SttBackend> {
    let dir = model_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| WhisperConfig::default().model_path);

    match find_model_file(&dir) {
        Some(model_path) => match WhisperBackend::new(&model_path) {
            Ok(engine) => {
                eprintln!("[mambru] STT: loaded whisper model from {}", model_path.display());
                Box::new(engine)
            }
            Err(e) => {
                eprintln!("[mambru] STT: {e} — falling back to mock backend");
                Box::new(MockSttBackend::new())
            }
        },
        None => {
            eprintln!(
                "[mambru] STT: no model found in `{}` — using mock backend",
                dir.display()
            );
            Box::new(MockSttBackend::new())
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_stt_returns_fixed() {
        let engine = MockSttBackend::with_response("hola mundo");
        let result = engine.transcribe(vec![0.0f32; 16000]).await.unwrap();
        assert_eq!(result, "hola mundo");
    }

    #[tokio::test]
    async fn test_mock_stt_default() {
        let engine = MockSttBackend::new();
        let result = engine.transcribe(vec![0.0f32; 16000]).await.unwrap();
        assert!(result.contains("mock"));
    }

    #[tokio::test]
    async fn test_create_stt_fallback() {
        // With a non-existent directory, it should return a mock backend.
        let engine = create_stt_engine(Some(Path::new("/nonexistent/path")));
        assert_eq!(engine.name(), "mock-stt");
        assert!(engine.is_available());
    }
}
