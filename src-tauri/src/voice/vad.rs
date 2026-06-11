//! Voice Activity Detection — silence trimming using WebRTC VAD.
//!
//! Replaces Silero VAD (no published `silero-vad-rs` crate) with the
//! battle-tested `webrtc-vad` crate for silence detection during PTT capture.
//!
//! # Design
//!
//! - Processes audio in 30ms frames at 16 kHz mono (480 samples per frame).
//! - Input `f32` samples are converted to `i16` for the WebRTC VAD engine.
//! - The threshold is configurable via `VadConfig`.

use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::Result;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Parameters that control VAD behaviour.
#[derive(Debug, Clone)]
pub struct VadConfig {
    /// Aggressiveness mode (0=Normal, 1=Low, 2=Aggressive, 3=VeryAggressive).
    /// Higher values reduce false positives but may miss quiet speech.
    pub mode: u8,

    /// Probability threshold (0.0 – 1.0).  Not used directly by `webrtc-vad`
    /// (which returns bool), but kept as a config knob for potential future
    /// Silero integration.
    pub threshold: f32,

    /// Sample rate in Hz. Must be 8000, 16000, 32000, or 48000.
    pub sample_rate: u32,

    /// Frame duration in ms. Must be 10, 20, or 30.
    pub frame_ms: u8,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            mode: 2,                       // Aggressive — good for silence trimming
            threshold: 0.5,
            sample_rate: 16_000,
            frame_ms: 30,
        }
    }
}

// ---------------------------------------------------------------------------
// VadEngine
// ---------------------------------------------------------------------------

/// Wraps the WebRTC VAD module for silence detection.
pub struct VadEngine {
    inner: webrtc_vad::Vad,
    config: VadConfig,
    frame_samples: usize,
    enabled: AtomicBool,
}

impl VadEngine {
    /// Create a new VAD engine with the given configuration.
    pub fn new(config: VadConfig) -> Result<Self> {
        let sample_rate = match config.sample_rate {
            8000 => webrtc_vad::SampleRate::Rate8kHz,
            16000 => webrtc_vad::SampleRate::Rate16kHz,
            32000 => webrtc_vad::SampleRate::Rate32kHz,
            48000 => webrtc_vad::SampleRate::Rate48kHz,
            _ => anyhow::bail!("unsupported sample rate for VAD: {}", config.sample_rate),
        };

        let mut inner = webrtc_vad::Vad::new_with_rate(sample_rate);
        let mode = match config.mode {
            0 => webrtc_vad::VadMode::Quality,
            1 => webrtc_vad::VadMode::LowBitrate,
            2 => webrtc_vad::VadMode::Aggressive,
            3 => webrtc_vad::VadMode::VeryAggressive,
            _ => anyhow::bail!("invalid VAD aggressiveness mode: {}", config.mode),
        };
        inner.set_mode(mode);

        let frame_samples = (config.sample_rate as usize)
            * (config.frame_ms as usize)
            / 1000;

        Ok(Self {
            inner,
            config,
            frame_samples,
            enabled: AtomicBool::new(true),
        })
    }

    /// Create with default configuration.
    pub fn default() -> Result<Self> {
        Self::new(VadConfig::default())
    }

    /// Returns `true` if the audio chunk contains speech.
    ///
    /// `audio_chunk` must be mono f32 samples at the configured sample rate.
    /// The chunk should be exactly `frame_samples` long (30ms by default).
    pub fn is_speech(&mut self, audio_chunk: &[f32]) -> bool {
        if !self.enabled.load(Ordering::Relaxed) {
            return false; // VAD disabled — treat everything as non-speech
        }

        // Convert f32 → i16 (WebRTC VAD expects PCM i16)
        let frame: Vec<i16> = audio_chunk
            .iter()
            .map(|&s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();

        // Pad or truncate to the expected frame size
        let frame = if frame.len() != self.frame_samples {
            let mut buf = vec![0i16; self.frame_samples];
            let copy_len = frame.len().min(self.frame_samples);
            buf[..copy_len].copy_from_slice(&frame[..copy_len]);
            buf
        } else {
            frame
        };

        self.inner.is_voice_segment(&frame).unwrap_or(false)
    }

    /// Reset VAD internal state (call between capture sessions).
    pub fn reset(&mut self) {
        // `webrtc-vad` 0.4 has a built-in `reset()` that clears state
        // while keeping the sample rate and mode configuration.
        self.inner.reset();
    }

    /// Enable or disable VAD processing.
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn config(&self) -> &VadConfig {
        &self.config
    }

    /// Returns the expected frame size in samples.
    pub fn frame_samples(&self) -> usize {
        self.frame_samples
    }
}

// ---------------------------------------------------------------------------
// Safety: Send + Sync for VadEngine
// ---------------------------------------------------------------------------

// webrtc_vad::Vad wraps a raw `*mut Fvad` pointer and does not implement
// Send / Sync.  All public methods on VadEngine that touch the inner Vad
// take `&mut self`, so Rust's borrow checker already guarantees exclusive
// access at compile time — concurrent calls are a compile error.  The only
// method taking `&self` (`set_enabled`) touches only an AtomicBool and
// never the inner Vad, so adding Send + Sync here is sound.
unsafe impl Send for VadEngine {}
unsafe impl Sync for VadEngine {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert a slice of f32 audio (mono, [-1.0, 1.0]) into a Vec of 30ms frames
/// at the given sample rate. Each frame is ready for `VadEngine::is_speech()`.
pub fn chunk_into_frames(audio: &[f32], sample_rate: u32, frame_ms: u8) -> Vec<Vec<f32>> {
    let frame_len = (sample_rate as usize) * (frame_ms as usize) / 1000;
    if frame_len == 0 {
        return Vec::new();
    }
    audio
        .chunks(frame_len)
        .map(|c| c.to_vec())
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies the engine can be created with defaults and doesn't panic
    /// on synthetic audio (all zeros = silence).
    #[test]
    fn test_vad_silence_on_zeros() {
        let mut engine = VadEngine::default().unwrap();
        let frame_size = engine.frame_samples();
        let silence = vec![0.0f32; frame_size];
        // All zeros should NOT be speech (quiet audio)
        assert!(!engine.is_speech(&silence), "zeros should be silence");
    }

    /// Verify that full-scale audio is classified as speech.
    #[test]
    fn test_vad_speech_on_loud_signal() {
        let mut engine = VadEngine::default().unwrap();
        let frame_size = engine.frame_samples();
        // Generate a 440 Hz tone at full scale
        let tone: Vec<f32> = (0..frame_size)
            .map(|i| {
                let t = i as f32 / 16_000.0;
                (2.0 * std::f32::consts::PI * 440.0 * t).sin()
            })
            .collect();
        assert!(
            engine.is_speech(&tone),
            "440 Hz tone should be detected as speech"
        );
    }

    #[test]
    fn test_chunk_into_frames() {
        let audio = vec![0.0f32; 960]; // 60ms at 16kHz
        let frames = chunk_into_frames(&audio, 16_000, 30);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].len(), 480);
        assert_eq!(frames[1].len(), 480);
    }
}
