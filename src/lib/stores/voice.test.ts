import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  voice,
  voiceFullyAvailable,
  canRecord,
  resetVoice,
  setRecording,
  setSpeaking,
  setTtsEnabled,
  setTranscription,
  setError,
  updateAvailability,
  setContinuousMode,
  setEmotion,
} from './voice';

describe('voice store', () => {
  beforeEach(() => {
    resetVoice();
  });

  it('starts with default state', () => {
    const state = get(voice);
    expect(state.isRecording).toBe(false);
    expect(state.isSpeaking).toBe(false);
    expect(state.pttKey).toBe('V');
    expect(state.ttsEnabled).toBe(true);
    expect(state.sttAvailable).toBe(false);
    expect(state.ttsAvailable).toBe(false);
    expect(state.lastTranscription).toBe('');
    expect(state.error).toBe('');
    expect(state.continuousMode).toBe(true);
    expect(state.audioLevel).toBe(0);
    expect(state.emotion).toBe('neutral');
  });

  it('sets recording state', () => {
    setRecording(true);
    expect(get(voice).isRecording).toBe(true);

    setRecording(false);
    expect(get(voice).isRecording).toBe(false);
  });

  it('sets speaking state', () => {
    setSpeaking(true);
    expect(get(voice).isSpeaking).toBe(true);

    setSpeaking(false);
    expect(get(voice).isSpeaking).toBe(false);
  });

  it('sets TTS enabled state', () => {
    setTtsEnabled(false);
    expect(get(voice).ttsEnabled).toBe(false);

    setTtsEnabled(true);
    expect(get(voice).ttsEnabled).toBe(true);
  });

  it('sets transcription text', () => {
    setTranscription('hello world');
    expect(get(voice).lastTranscription).toBe('hello world');

    setTranscription('');
    expect(get(voice).lastTranscription).toBe('');
  });

  it('sets error message', () => {
    setError('Microphone not available');
    expect(get(voice).error).toBe('Microphone not available');

    setError('');
    expect(get(voice).error).toBe('');
  });

  it('updates availability flags', () => {
    updateAvailability(true, false);
    const state = get(voice);
    expect(state.sttAvailable).toBe(true);
    expect(state.ttsAvailable).toBe(false);

    updateAvailability(false, true);
    const state2 = get(voice);
    expect(state2.sttAvailable).toBe(false);
    expect(state2.ttsAvailable).toBe(true);
  });

  it('derived store voiceFullyAvailable returns true only when STT is available', () => {
    expect(get(voiceFullyAvailable)).toBe(false);

    updateAvailability(true, false);
    expect(get(voiceFullyAvailable)).toBe(true);

    updateAvailability(false, false);
    expect(get(voiceFullyAvailable)).toBe(false);
  });

  it('derived store canRecord returns true when not recording and STT available', () => {
    expect(get(canRecord)).toBe(false);

    setRecording(true);
    updateAvailability(true, false);
    expect(get(canRecord)).toBe(false);

    setRecording(false);
    expect(get(canRecord)).toBe(true);
  });

  it('resetVoice returns to initial state', () => {
    setRecording(true);
    setSpeaking(true);
    setTtsEnabled(false);
    setTranscription('test');
    setError('error');
    updateAvailability(true, true);

    resetVoice();

    const state = get(voice);
    expect(state.isRecording).toBe(false);
    expect(state.isSpeaking).toBe(false);
    expect(state.ttsEnabled).toBe(true);
    expect(state.lastTranscription).toBe('');
    expect(state.error).toBe('');
    expect(state.sttAvailable).toBe(false);
    expect(state.ttsAvailable).toBe(false);
  });

  it('maintains other fields when updating a single field', () => {
    setRecording(true);
    setSpeaking(true);

    const state = get(voice);
    expect(state.isRecording).toBe(true);
    expect(state.isSpeaking).toBe(true);
    expect(state.pttKey).toBe('V'); // unchanged default
  });

  it('sets continuous mode', () => {
    setContinuousMode(false);
    expect(get(voice).continuousMode).toBe(false);

    setContinuousMode(true);
    expect(get(voice).continuousMode).toBe(true);
  });

  it('sets emotion state', () => {
    setEmotion('happy');
    expect(get(voice).emotion).toBe('happy');

    setEmotion('sad');
    expect(get(voice).emotion).toBe('sad');
  });

  it('resetVoice clears emotion and continuousMode', () => {
    setEmotion('happy');
    setContinuousMode(false);

    resetVoice();

    const state = get(voice);
    expect(state.emotion).toBe('neutral');
    expect(state.continuousMode).toBe(true);
    expect(state.audioLevel).toBe(0);
  });
});
