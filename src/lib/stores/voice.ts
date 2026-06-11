import { writable, derived, type Writable } from 'svelte/store';

// ── Types ─────────────────────────────────────────────────────────────────

export interface VoiceState {
  /** Whether the microphone is currently capturing audio. */
  isRecording: boolean;
  /** Whether TTS is currently playing audio. */
  isSpeaking: boolean;
  /** The configured push-to-talk key. */
  pttKey: string;
  /** Whether TTS is enabled in settings. */
  ttsEnabled: boolean;
  /** Whether the STT engine (whisper) is available. */
  sttAvailable: boolean;
  /** Whether the TTS engine (Piper) is available. */
  ttsAvailable: boolean;
  /** The last transcribed text (empty string initially). */
  lastTranscription: string;
  /** Any voice-related error message (empty string if none). */
  error: string;
  /** Whether continuous capture mode is active. */
  continuousMode: boolean;
}

// ── Store ─────────────────────────────────────────────────────────────────

const initialState: VoiceState = {
  isRecording: false,
  isSpeaking: false,
  pttKey: 'V',
  ttsEnabled: true,
  sttAvailable: false,
  ttsAvailable: false,
  lastTranscription: '',
  error: '',
  continuousMode: true,
};

/**
 * Reactive voice state store.
 *
 * The frontend reads this store to drive the recording indicator,
 * PTT button behaviour, and TTS status.
 */
export const voice: Writable<VoiceState> = writable<VoiceState>(initialState);

// ── Derived stores ────────────────────────────────────────────────────────

/** True when the voice pipeline is fully functional (STT + TTS available). */
export const voiceFullyAvailable = derived(voice, ($v) => {
  return $v.sttAvailable;
});

/** True when the user can initiate a PTT capture. */
export const canRecord = derived(voice, ($v) => {
  return !$v.isRecording && $v.sttAvailable;
});

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Reset the voice store to its initial state.
 */
export function resetVoice(): void {
  voice.set(initialState);
}

/**
 * Update recording state.
 */
export function setRecording(recording: boolean): void {
  voice.update((s) => ({ ...s, isRecording: recording }));
}

/**
 * Update speaking state.
 */
export function setSpeaking(speaking: boolean): void {
  voice.update((s) => ({ ...s, isSpeaking: speaking }));
}

/**
 * Update TTS enabled state.
 */
export function setTtsEnabled(enabled: boolean): void {
  voice.update((s) => ({ ...s, ttsEnabled: enabled }));
}

/**
 * Set the last transcription.
 */
export function setTranscription(text: string): void {
  voice.update((s) => ({ ...s, lastTranscription: text }));
}

/**
 * Set the error message.
 */
export function setError(error: string): void {
  voice.update((s) => ({ ...s, error }));
}

/**
 * Update availability flags from backend status.
 */
export function updateAvailability(
  sttAvail: boolean,
  ttsAvail: boolean,
): void {
  voice.update((s) => ({
    ...s,
    sttAvailable: sttAvail,
    ttsAvailable: ttsAvail,
  }));
}

/**
 * Toggle between continuous and PTT capture mode.
 */
export function setContinuousMode(enabled: boolean): void {
  voice.update((s) => ({ ...s, continuousMode: enabled }));
}
