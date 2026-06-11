import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ─────────────────────────────────────────────────────────────────

export interface VoiceStatus {
  is_capturing: boolean;
  is_speaking: boolean;
  stt_available: boolean;
  tts_available: boolean;
  tts_enabled: boolean;
}

export type VoiceEventCallback = (payload: string) => void;

// ── IPC wrappers ──────────────────────────────────────────────────────────

/**
 * Start microphone capture (push-to-talk pressed).
 * The backend will begin buffering audio and trimming silence via VAD.
 */
export async function startCapture(): Promise<void> {
  return invoke('start_voice_capture');
}

/**
 * Stop capture and transcribe the accumulated audio.
 * @returns The transcribed text (empty string if no speech detected).
 */
export async function stopCapture(): Promise<string> {
  return invoke('stop_voice_capture');
}

/**
 * Toggle TTS on/off.
 * @returns The new TTS enabled state.
 */
export async function toggleTts(): Promise<boolean> {
  return invoke('toggle_tts');
}

/**
 * Synthesise and play the given text via TTS.
 * @param text The text to speak aloud.
 */
export async function speakText(text: string): Promise<void> {
  return invoke('speak_text', { text });
}

/**
 * Get the current voice pipeline status.
 */
export async function getVoiceStatus(): Promise<VoiceStatus> {
  return invoke('get_voice_status');
}

// ── Continuous capture ─────────────────────────────────────────────────

/**
 * Start always-listening continuous capture with VAD auto-transcribe.
 */
export async function startContinuousCapture(): Promise<void> {
  return invoke('start_continuous_capture');
}

/**
 * Stop continuous capture mode.
 */
export async function stopContinuousCapture(): Promise<void> {
  return invoke('stop_continuous_capture');
}

// ── Event listeners ───────────────────────────────────────────────────────

/**
 * Listen for voice capture started events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForCaptureStarted(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:capture-started', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for voice capture stopped events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForCaptureStopped(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:capture-stopped', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for transcribed text events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForTranscribed(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:transcribed', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for no-speech events (silence during capture).
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForNoSpeech(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:no-speech', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for TTS toggle events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForTtsToggled(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:tts-toggled', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for TTS finished events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForTtsFinished(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:tts-finished', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for voice error events.
 * Returns an `UnlistenFn` to stop listening.
 */
export function listenForVoiceError(
  callback: VoiceEventCallback,
): Promise<UnlistenFn> {
  return listen<string>('voice:error', (event) => {
    callback(event.payload);
  });
}

export interface EmotionPayload {
  emotion: string;
  confidence: number;
}

export type EmotionCallback = (payload: EmotionPayload) => void;

/**
 * Listen for hologram emotion events from the backend.
 */
export function listenForHoloEmotion(
  callback: EmotionCallback,
): Promise<UnlistenFn> {
  return listen<EmotionPayload>('holo:emotion', (event) => {
    callback(event.payload);
  });
}
