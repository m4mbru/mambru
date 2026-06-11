//! Voice pipeline — capture → VAD → STT → TTS → playback.
//!
//! # Architecture
//!
//! The pipeline is driven by push-to-talk (v1). The user holds a key while
//! speaking; `feed_audio` buffers 100ms chunks through VAD for silence
//! trimming. On key release (`stop_capture`) the accumulated audio is
//! transcribed via the STT backend. The result is returned as text so the
//! frontend can inject it into the chat flow.
//!
//! TTS is separate — `speak()` / `speak_async()` synthesise and play audio
//! from any text (typically the LLM response).
//!
//! # Submodules
//!
//! - `vad` — WebRTC VAD for silence detection
//! - `stt` — Speech-to-text (whisper.cpp / mock)
//! - `tts` — Text-to-speech (Piper / mock) + rodio playback

pub(crate) mod download;
mod stt;
mod tts;
mod vad;

pub use stt::{
    create_stt_engine, MockSttBackend, SttBackend,
};
pub use tts::{
    create_tts_engine, AudioOutput, MockTtsBackend, TtsBackend,
};
pub use vad::{chunk_into_frames, VadConfig, VadEngine};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// VoicePipeline
// ---------------------------------------------------------------------------

/// Orchestrator for the voice capture → transcribe → speak pipeline.
pub struct VoicePipeline {
    /// Voice activity detection (silence trimming during capture).
    vad: VadEngine,

    /// Speech-to-text engine.
    stt: Box<dyn SttBackend>,

    /// Text-to-speech engine.
    tts: Box<dyn TtsBackend>,

    /// Audio output for playback.
    audio: Option<AudioOutput>,

    /// Buffer accumulating audio chunks during PTT capture.
    capture_buffer: Vec<f32>,

    /// Whether capture is currently active.
    is_capturing: AtomicBool,

    /// Whether TTS is currently speaking.
    is_speaking: AtomicBool,

    /// VAD config (for chunking).
    vad_config: VadConfig,

    /// Whether continuous capture is running.
    continuous_active: AtomicBool,

    /// Signal to stop the continuous capture thread.
    continuous_stop: Arc<AtomicBool>,
}

impl VoicePipeline {
    /// Create a new pipeline with the given engines.
    pub fn new(vad: VadEngine, stt: Box<dyn SttBackend>, tts: Box<dyn TtsBackend>) -> Self {
        let vad_config = vad.config().clone();

        // Audio output may fail (no device) — that's OK, TTS just won't play.
        let audio = AudioOutput::new().ok();

        Self {
            vad,
            stt,
            tts,
            audio,
            capture_buffer: Vec::with_capacity(16_000 * 30), // ~30s pre-alloc
            is_capturing: AtomicBool::new(false),
            is_speaking: AtomicBool::new(false),
            vad_config,
            continuous_active: AtomicBool::new(false),
            continuous_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Create a pipeline with default/mock engines (useful for testing).
    pub fn with_mocks() -> Self {
        Self::new(
            VadEngine::default().expect("default VAD engine"),
            Box::new(MockSttBackend::new()),
            Box::new(MockTtsBackend::new()),
        )
    }

    // -- Capture lifecycle ------------------------------------------------

    /// Begin audio capture. Clears any previous buffer.
    ///
    /// Note: we deliberately do NOT call `self.vad.reset()` here.
    /// WebRTC VAD's `reset()` resets the internal noise floor estimate,
    /// which causes the first ~3 frames (90ms at 16kHz) to be classified
    /// as silence even for full-scale speech — making voice capture fail
    /// in aggressive mode. Carrying VAD state between captures is safe
    /// and avoids this false-silence startup issue.
    pub fn start_capture(&mut self) {
        self.capture_buffer.clear();
        self.is_capturing.store(true, Ordering::SeqCst);
    }

    /// Feed a 100ms audio chunk into the pipeline.
    ///
    /// VAD trims silence: only speech-containing frames are kept.
    /// If `feed_audio` is called while not capturing, the chunk is ignored.
    ///
    /// Returns `Ok(None)` during capture, `Ok(Some(text))` if speech ended
    /// and transcription was triggered (not used in v1 — we transcribe on
    /// stop_capture).
    pub fn feed_audio(&mut self, chunk: &[f32]) -> Result<Option<String>> {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return Ok(None);
        }

        // Chunk into VAD frames and check each frame
        let frames = chunk_into_frames(chunk, self.vad_config.sample_rate, self.vad_config.frame_ms);

        for frame in frames {
            if self.vad.is_speech(&frame) {
                // Speech detected — keep this frame
                self.capture_buffer.extend_from_slice(&frame);
            }
            // Silence frames are dropped (trimmed)
        }

        Ok(None) // V1: no mid-capture transcription
    }

    /// Stop capture and transcribe the accumulated audio.
    ///
    /// Returns the transcribed text, or an empty string if no speech was
    /// detected (buffer is empty after silence trimming).
    pub async fn stop_capture(&mut self) -> Result<String> {
        self.is_capturing.store(false, Ordering::SeqCst);

        let audio = std::mem::take(&mut self.capture_buffer);

        if audio.len() < self.vad_config.sample_rate as usize / 10 {
            // Less than 100ms of speech — likely noise or key tap
            return Ok(String::new());
        }

        eprintln!(
            "[mambru] voice: transcribing {}ms of audio",
            audio.len() * 1000 / self.vad_config.sample_rate as usize
        );

        let text = self.stt.transcribe(audio).await?;

        Ok(text)
    }

    // -- Continuous capture -------------------------------------------------

    /// Start continuous (always-listening) capture in a background thread.
    ///
    /// Captures 100ms audio chunks, detects speech vs silence via RMS energy,
    /// and on speech-end sends the audio through a channel for transcription.
    pub async fn start_continuous_capture(&mut self, app: &AppHandle) -> Result<()> {
        if self.continuous_active.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.continuous_stop.store(false, Ordering::SeqCst);
        self.continuous_active.store(true, Ordering::SeqCst);

        let stop = self.continuous_stop.clone();
        let sample_rate = 16_000u32;
        let app_handle = app.clone();

        tokio::spawn(async move {
            eprintln!("[mambru] voice: continuous capture thread started");

            let device = cpal::default_host().input_devices().ok()
                .and_then(|mut devs| devs.find(|d| d.name().is_ok()));
            let stream_config = cpal::StreamConfig {
                channels: 1,
                sample_rate: cpal::SampleRate(sample_rate),
                buffer_size: cpal::BufferSize::Fixed(1600),
            };

            use std::sync::mpsc;
            let (tx, rx) = mpsc::channel::<Vec<f32>>();

            let stop_for_callback = Arc::clone(&stop);

            let input_stream = device.and_then(|dev| {
                dev.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if !stop_for_callback.load(Ordering::SeqCst) {
                            let _ = tx.send(data.to_vec());
                        }
                    },
                    |err| eprintln!("[mambru] voice: capture error: {err}"),
                    None,
                ).ok()
            });

            let Some(_stream) = input_stream else {
                eprintln!("[mambru] voice: failed to open input stream");
                return;
            };

            let mut speech_buf: Vec<f32> = Vec::new();
            let mut silence_ms: u32 = 0;

            loop {
                if stop.load(Ordering::SeqCst) {
                    break;
                }

                let chunk = match rx.recv_timeout(std::time::Duration::from_millis(150)) {
                    Ok(c) => c,
                    Err(_) => {
                        if !speech_buf.is_empty() {
                            silence_ms += 100;
                            if silence_ms >= 800 {
                                let audio = std::mem::take(&mut speech_buf);
                                silence_ms = 0;
                                if audio.len() >= sample_rate as usize / 10 {
                                    // Emit raw audio — frontend or main thread will transcribe
                                    let len = audio.len();
                                    eprintln!("[mambru] voice: continuous speech segment ({} samples)", len);
                                    // For v1, emit an event to notify the frontend
                                    let _ = app_handle.emit("voice:continuous-segment", &format!("{}", audio.len()));
                                }
                            }
                        }
                        continue;
                    }
                };

                // Simple RMS energy detection for VAD
                let rms: f32 = (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt();
                let is_speech = rms > 0.02;

                if is_speech {
                    speech_buf.extend_from_slice(&chunk);
                    silence_ms = 0;
                } else if !speech_buf.is_empty() {
                    silence_ms += 100;
                }
            }

            eprintln!("[mambru] voice: continuous capture thread stopped");
        });

        Ok(())
    }

    /// Stop continuous capture.
    pub fn stop_continuous_capture(&mut self) {
        self.continuous_stop.store(true, Ordering::SeqCst);
        self.continuous_active.store(false, Ordering::SeqCst);
    }

    pub fn is_continuous_active(&self) -> bool {
        self.continuous_active.load(Ordering::SeqCst)
    }

    // -- TTS --------------------------------------------------------------

    /// Synthesise and play text (blocking).
    pub fn speak(&self, text: &str) -> Result<()> {
        if !self.tts.is_available() {
            eprintln!("[mambru] TTS: unavailable, skipping speech");
            return Ok(());
        }

        self.is_speaking.store(true, Ordering::SeqCst);

        // We need a Tokio runtime to call the async synthesize.  Use
        // tokio::runtime::Handle if one is active, otherwise create a
        // temporary runtime.
        let audio = match tokio::runtime::Handle::try_current() {
            Ok(handle) => handle
                .block_on(self.tts.synthesize(text))
                .context("TTS synthesis failed")?,
            Err(_) => {
                // No runtime — create a one-shot
                let rt = tokio::runtime::Runtime::new()
                    .context("failed to create tokio runtime for TTS")?;
                rt.block_on(self.tts.synthesize(text))
                    .context("TTS synthesis failed")?
            }
        };

        // Play via rodio
        if let Some(ref output) = self.audio {
            output.play_wav(&audio)?;
        }

        self.is_speaking.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Synthesise and play text (async).
    pub async fn speak_async(&self, text: &str) -> Result<()> {
        if !self.tts.is_available() {
            eprintln!("[mambru] TTS: unavailable, skipping speech");
            return Ok(());
        }

        self.is_speaking.store(true, Ordering::SeqCst);

        let audio = self
            .tts
            .synthesize(text)
            .await
            .context("TTS synthesis failed")?;

        if let Some(ref output) = self.audio {
            output.play_wav_async(audio).await?;
        }

        self.is_speaking.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Stop any ongoing TTS playback.
    pub fn stop_speaking(&self) {
        self.is_speaking.store(false, Ordering::SeqCst);
        // rodio doesn't support cancel without keeping a Sink reference.
        // For v1 this is a best-effort signal.  Future phases can hold
        // an Arc<Mutex<Option<Sink>>> for true cancellation.
    }

    // -- Status queries ---------------------------------------------------

    pub fn is_capturing(&self) -> bool {
        self.is_capturing.load(Ordering::SeqCst)
    }

    pub fn is_speaking(&self) -> bool {
        self.is_speaking.load(Ordering::SeqCst)
    }

    pub fn stt_available(&self) -> bool {
        self.stt.is_available()
    }

    pub fn tts_available(&self) -> bool {
        self.tts.is_available()
    }

    pub fn audio_available(&self) -> bool {
        self.audio.is_some()
    }

    /// Access the STT backend (for reconfiguration etc.).
    pub fn stt_backend(&self) -> &dyn SttBackend {
        self.stt.as_ref()
    }

    /// Access the TTS backend.
    pub fn tts_backend(&self) -> &dyn TtsBackend {
        self.tts.as_ref()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Integration smoke test: feed synthetic audio through the pipeline
    /// with mock backends and verify it doesn't crash.
    #[tokio::test]
    async fn test_pipeline_smoke() {
        let mut pipeline = VoicePipeline::with_mocks();

        // Start capture
        pipeline.start_capture();
        assert!(pipeline.is_capturing());

        // Feed frequency-swept audio (200→2000Hz chirp) that webrtc-vad
        // continuously detects as speech, unlike a steady pure tone which the
        // aggressive-mode noise floor estimator learns in ~3 frames.
        let sample_rate = 16_000;
        let chirp_duration_ms = 400;
        let chirp_samples = sample_rate * chirp_duration_ms / 1000;
        let chunk: Vec<f32> = (0..chirp_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                let freq = 200.0 + (t / 0.4) * 1800.0; // 200→2000Hz over 400ms
                (2.0 * std::f32::consts::PI * freq * t).sin()
            })
            .collect();

        let result = pipeline.feed_audio(&chunk).unwrap();
        assert!(result.is_none()); // No mid-capture transcription

        // Stop and transcribe
        let text = pipeline.stop_capture().await.unwrap();
        assert!(!text.is_empty(), "should return mock transcription");

        assert!(!pipeline.is_capturing());
    }

    /// Verify that silence-only capture returns empty string.
    #[tokio::test]
    async fn test_pipeline_silence_is_empty() {
        let mut pipeline = VoicePipeline::with_mocks();

        pipeline.start_capture();
        // Feed silence (all zeros, VAD will drop everything)
        pipeline.feed_audio(&[0.0f32; 1600]).unwrap();
        let text = pipeline.stop_capture().await.unwrap();
        assert_eq!(text, "", "silence should produce empty text");
    }

    #[tokio::test]
    async fn test_speak_no_crash() {
        let pipeline = VoicePipeline::with_mocks();
        // speak_async with mock TTS should not crash
        pipeline.speak_async("hello world").await.unwrap();
    }
}
