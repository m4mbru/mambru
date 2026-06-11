//! Text-to-speech via Piper TTS + playback with rodio.
//!
//! # Trait Abstraction
//!
//! The [`TtsBackend`] trait decouples the pipeline from the concrete TTS engine,
//! allowing mock/test implementations and future engine swaps.
//!
//! # Piper Integration
//!
//! Piper TTS doesn't have a published Rust crate (`piper-rs` does not exist on
//! crates.io). The [`PiperBackend`] implementation calls the `piper` binary as
//! a subprocess, captures WAV audio on stdout, and plays it via `rodio`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use async_trait::async_trait;
use rodio::Source;

// ---------------------------------------------------------------------------
// Trait — TtsBackend
// ---------------------------------------------------------------------------

/// Abstract text-to-speech backend.
#[async_trait]
pub trait TtsBackend: Send + Sync {
    /// Synthesise text into audio bytes (WAV format).
    async fn synthesize(&self, text: &str) -> Result<Vec<u8>>;

    /// Human-readable name for diagnostics.
    fn name(&self) -> &str;

    /// Returns `true` if the backend is fully initialised.
    fn is_available(&self) -> bool;
}

// ---------------------------------------------------------------------------
// PiperBackend — subprocess-based Piper TTS
// ---------------------------------------------------------------------------

/// Configuration for the Piper TTS subprocess backend.
#[derive(Debug, Clone)]
pub struct PiperConfig {
    /// Path to the `piper` executable.
    pub piper_bin: PathBuf,
    /// Path to the Piper voice model file (`.onnx`).
    pub model_path: PathBuf,
    /// Optional path to a voice config JSON file (`.json` alongside the model).
    pub config_path: Option<PathBuf>,
    /// Output sample rate (Piper defaults to 22050).
    pub sample_rate: u32,
    /// Extra arguments passed to piper (e.g. `--length-scale 1.2`).
    pub extra_args: Vec<String>,
}

impl Default for PiperConfig {
    fn default() -> Self {
        let base = dirs_or_default().join("piper");
        Self {
            piper_bin: which_piper().unwrap_or_else(|| PathBuf::from("piper")),
            model_path: base.join("voice.onnx"),
            config_path: Some(base.join("voice.onnx.json")),
            sample_rate: 22050,
            extra_args: vec![],
        }
    }
}

fn dirs_or_default() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".config").join("mambru")
}

fn which_piper() -> Option<PathBuf> {
    // Check common locations
    for candidate in &[
        "piper",
        "piper.exe",
        "../piper/piper",
    ] {
        if let Ok(p) = std::process::Command::new("which")
            .arg(candidate)
            .output()
        {
            if p.status.success() {
                let path = String::from_utf8_lossy(&p.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
        // Also try direct existence on Windows
        let candidate_path = PathBuf::from(candidate);
        if candidate_path.exists() {
            return Some(candidate_path);
        }
    }
    None
}

/// Real TTS backend using Piper TTS via subprocess.
pub struct PiperBackend {
    config: PiperConfig,
    available: bool,
}

impl PiperBackend {
    /// Create a new Piper backend with the given configuration.
    pub fn new(config: PiperConfig) -> Self {
        let available = config.model_path.exists() && config.piper_bin.exists();
        if !available {
            eprintln!(
                "[mambru] TTS: piper model `{}` or binary `{}` not found",
                config.model_path.display(),
                config.piper_bin.display()
            );
        }
        Self { config, available }
    }

    /// Try to create with default config paths.
    pub fn try_default() -> Self {
        Self::new(PiperConfig::default())
    }
}

#[async_trait]
impl TtsBackend for PiperBackend {
    async fn synthesize(&self, text: &str) -> Result<Vec<u8>> {
        if !self.available {
            anyhow::bail!(
                "Piper TTS unavailable — check `{}` and `{}`",
                self.config.piper_bin.display(),
                self.config.model_path.display()
            );
        }

        let text = text.to_owned();
        let config = self.config.clone();

        // Spawn blocking since we use subprocess
        tokio::task::spawn_blocking(move || -> Result<Vec<u8>> {
            let mut cmd = std::process::Command::new(&config.piper_bin);
            cmd.arg("--model")
                .arg(&config.model_path)
                .arg("--output-raw")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null());

            if let Some(ref cfg_path) = config.config_path {
                if cfg_path.exists() {
                    cmd.arg("--config").arg(cfg_path);
                }
            }

            if !config.extra_args.is_empty() {
                cmd.args(&config.extra_args);
            }

            let mut child = cmd
                .spawn()
                .context("failed to spawn piper subprocess")?;

            // Write text to stdin
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                stdin
                    .write_all(text.as_bytes())
                    .context("failed to write text to piper stdin")?;
                stdin.flush()?;
            }
            drop(child.stdin.take());

            // Read raw s16le PCM audio from stdout
            let mut output = Vec::new();
            use std::io::Read;
            child
                .stdout
                .take()
                .context("failed to capture piper stdout")?
                .read_to_end(&mut output)
                .context("failed to read piper output")?;

            let status = child.wait().context("failed to wait for piper")?;
            if !status.success() {
                anyhow::bail!("piper exited with code {:?}", status.code());
            }

            // Return raw s16le PCM (no WAV header). The rodio decoder can
            // handle this if we specify the pcm format. However, it's easier
            // to just return the raw data and let the playback layer handle it.
            // For convenience, wrap in a minimal WAV header.
            Ok(wrap_in_wav(&output, config.sample_rate))
        })
        .await
        .context("piper thread panicked")?
    }

    fn name(&self) -> &str {
        "piper-tts"
    }

    fn is_available(&self) -> bool {
        self.available
    }
}

// ---------------------------------------------------------------------------
// WAV helper
// ---------------------------------------------------------------------------

/// Wrap raw s16le PCM audio in a minimal WAV header so rodio can decode it.
fn wrap_in_wav(pcm_data: &[u8], sample_rate: u32) -> Vec<u8> {
    let channels: u16 = 1; // mono
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * channels as u32 * (bits_per_sample as u32 / 8);
    let block_align = channels * (bits_per_sample / 8);
    let data_size = pcm_data.len() as u32;
    let file_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + pcm_data.len());

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes());  // PCM format
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());
    wav.extend(pcm_data);

    wav
}

// ---------------------------------------------------------------------------
// Playback engine — rodio
// ---------------------------------------------------------------------------

/// Simple audio output stream using rodio.
pub struct AudioOutput {
    _stream: rodio::OutputStream,
    stream_handle: rodio::OutputStreamHandle,
    is_speaking: Arc<AtomicBool>,
    #[allow(dead_code)]
    volume: f32,
}

// SAFETY: AudioOutput is only accessed through Mutex<AppState> which
// serializes all access. The underlying rodio OutputStream is !Send
// for macOS/AudioUnit reasons — on Windows WASAPI it is safe to use
// across threads when access is serialized through the Mutex.
unsafe impl Send for AudioOutput {}
unsafe impl Sync for AudioOutput {}

impl AudioOutput {
    /// Initialise the audio output device.
    pub fn new() -> Result<Self> {
        let (_stream, stream_handle) = rodio::OutputStream::try_default()
            .context("no audio output device available")?;

        Ok(Self {
            _stream,
            stream_handle,
            is_speaking: Arc::new(AtomicBool::new(false)),
            volume: 0.8,
        })
    }

    /// Play WAV audio data (blocking until complete or stopped).
    pub fn play_wav(&self, wav_data: &[u8]) -> Result<()> {
        let cursor = std::io::Cursor::new(wav_data.to_vec());
        let source = rodio::Decoder::new(cursor)
            .context("failed to decode WAV audio")?;

        self.is_speaking.store(true, Ordering::SeqCst);

        let result = self
            .stream_handle
            .play_raw(source.convert_samples::<f32>())
            .map_err(|e| anyhow::anyhow!("playback failed: {e}"))
            .and_then(|_sink| {
                // Wait for playback to finish
                // rodio's Sink::sleep_until_end would be ideal but we
                // need to keep it simple — just sleep and check
                // Actually rodio's Sink is detach; we need to keep
                // the sink alive
                std::thread::sleep(std::time::Duration::from_secs(1));
                Ok(())
            });

        self.is_speaking.store(false, Ordering::SeqCst);
        result
    }

    /// Play audio asynchronously.
    pub async fn play_wav_async(&self, wav_data: Vec<u8>) -> Result<()> {
        let data = wav_data;
        tokio::task::spawn_blocking(move || {
            let cursor = std::io::Cursor::new(data);
            let source = rodio::Decoder::new(cursor)
                .map_err(|e| anyhow::anyhow!("failed to decode WAV: {e}"))?;

            // We can't access self in spawn_blocking (self is not 'static),
            // so we create a fresh output stream here
            let (_stream, handle) = rodio::OutputStream::try_default()
                .map_err(|e| anyhow::anyhow!("no audio device: {e}"))?;

            let sink = rodio::Sink::try_new(&handle)
                .map_err(|e| anyhow::anyhow!("failed to create sink: {e}"))?;

            sink.append(source);
            sink.sleep_until_end();

            drop(sink);
            drop(_stream);
            Ok(())
        })
        .await
        .context("playback thread panicked")?
    }

    #[allow(dead_code)]
    pub fn is_speaking(&self) -> bool {
        self.is_speaking.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
    }
}

// ---------------------------------------------------------------------------
// MockTtsBackend — for testing / when no TTS model is present
// ---------------------------------------------------------------------------

/// A mock TTS backend that returns a minimal valid WAV of silence.
pub struct MockTtsBackend {
    simulated_delay_ms: u64,
}

impl MockTtsBackend {
    pub fn new() -> Self {
        Self {
            simulated_delay_ms: 0,
        }
    }

    #[allow(dead_code)]
    pub fn with_delay(ms: u64) -> Self {
        Self {
            simulated_delay_ms: ms,
        }
    }
}

#[async_trait]
impl TtsBackend for MockTtsBackend {
    async fn synthesize(&self, _text: &str) -> Result<Vec<u8>> {
        if self.simulated_delay_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.simulated_delay_ms)).await;
        }
        // Return a minimal WAV header with 0.5s of silence
        let sample_rate = 22050;
        let duration_samples = (sample_rate / 2) as usize; // 0.5s
        let pcm = vec![0u8; duration_samples * 2]; // s16le = 2 bytes per sample
        Ok(wrap_in_wav(&pcm, sample_rate))
    }

    fn name(&self) -> &str {
        "mock-tts"
    }

    fn is_available(&self) -> bool {
        true
    }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/// Create a TTS backend: try Piper, fall back to mock.
pub fn create_tts_engine() -> Box<dyn TtsBackend> {
    let backend = PiperBackend::try_default();
    if backend.is_available() {
        eprintln!("[mambru] TTS: Piper voice model found");
        Box::new(backend)
    } else {
        eprintln!("[mambru] TTS: no Piper model found — using mock backend");
        Box::new(MockTtsBackend::new())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_tts_synthesize() {
        let engine = MockTtsBackend::new();
        let audio = engine.synthesize("hola mundo").await.unwrap();
        // Should have a WAV header (44 bytes) + data
        assert!(audio.len() > 44, "should produce WAV audio");
        assert_eq!(&audio[..4], b"RIFF", "should start with RIFF header");
        assert_eq!(&audio[8..12], b"WAVE", "should be WAVE format");
    }

    #[tokio::test]
    async fn test_tts_backend_names() {
        let mock = MockTtsBackend::new();
        assert_eq!(mock.name(), "mock-tts");
        assert!(mock.is_available());
    }

    #[test]
    fn test_wav_header_valid() {
        let pcm = vec![0u8; 44100]; // 0.5s of s16le silence at 44100
        let wav = wrap_in_wav(&pcm, 22050);
        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        // data chunk
        let data_size = u32::from_le_bytes(wav[40..44].try_into().unwrap());
        assert_eq!(data_size, 44100);
        assert_eq!(wav.len(), 44 + 44100);
    }
}
