<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { voice, setRecording, setTranscription, setError } from '../stores/voice';
  import { conversation } from '../stores/conversation';
  import { startCapture, stopCapture, getVoiceStatus, toggleTts } from '../api/voice';
  import {
    listenForCaptureStarted,
    listenForCaptureStopped,
    listenForTranscribed,
    listenForVoiceError,
    listenForNoSpeech,
    listenForTtsToggled,
  } from '../api/voice';

  // ── State ───────────────────────────────────────────────────────────────

  let pttPressed = false;
  let audioLevel = 0;
  let animationFrameId: number | null = null;
  let unlisteners: Array<() => void> = [];

  // ── Keyboard PTT support ────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    const target = e.target as HTMLElement;
    // Don't trigger if user is typing in an input/textarea
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const $voice: any = {};
    const unsub = voice.subscribe((v) => Object.assign($voice, v))();
    unsub();

    if (e.key.toUpperCase() === $voice.pttKey?.toUpperCase() && $voice.sttAvailable && !$voice.isRecording) {
      e.preventDefault();
      startPttCapture();
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    const $voice: any = {};
    const unsub = voice.subscribe((v) => Object.assign($voice, v))();
    unsub();

    if (e.key.toUpperCase() === $voice.pttKey?.toUpperCase() && pttPressed) {
      e.preventDefault();
      stopPttCapture();
    }
  }

  // ── PTT actions ─────────────────────────────────────────────────────────

  async function startPttCapture() {
    try {
      await startCapture();
      pttPressed = true;
      setRecording(true);
    } catch (err) {
      setError(String(err));
      pttPressed = false;
    }
  }

  async function stopPttCapture() {
    if (!pttPressed) return;
    pttPressed = false;
    setRecording(false);
    try {
      const text = await stopCapture();
      if (text && text.trim()) {
        setTranscription(text);
        // If we have an active conversation, append the transcribed text as user message
        conversation.appendMessage({ role: 'user', content: text });
      }
    } catch (err) {
      setError(String(err));
    }
  }

  // ── TTS toggle ──────────────────────────────────────────────────────────

  async function handleTtsToggle() {
    try {
      const newState = await toggleTts();
      voice.update((s) => ({ ...s, ttsEnabled: newState }));
    } catch (err) {
      console.error('[VoiceControls] TTS toggle failed:', err);
    }
  }

  // ── Mouse-based PTT ─────────────────────────────────────────────────────

  function handleMouseDown() {
    const $voice: any = {};
    const unsub = voice.subscribe((v) => Object.assign($voice, v))();
    unsub();
    if ($voice.sttAvailable && !$voice.isRecording) {
      startPttCapture();
    }
  }

  function handleMouseUp() {
    if (pttPressed) {
      stopPttCapture();
    }
  }

  // ── Simulate audio level while recording ─────────────────────────────────

  function simulateAudioLevel() {
    if (!pttPressed) {
      audioLevel = 0;
      return;
    }
    audioLevel = 0.2 + Math.random() * 0.6; // 0.2 - 0.8 range for visual effect
    animationFrameId = requestAnimationFrame(simulateAudioLevel);
  }

  $: if (pttPressed) {
    cancelAnimationFrame(animationFrameId!);
    simulateAudioLevel();
  } else {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    audioLevel = 0;
  }

  // ── Livecycle ───────────────────────────────────────────────────────────

  onMount(async () => {
    // Load voice status from backend
    try {
      const status = await getVoiceStatus();
      voice.update((s) => ({
        ...s,
        sttAvailable: status.stt_available,
        ttsAvailable: status.tts_available,
        ttsEnabled: status.tts_enabled,
        isRecording: status.is_capturing,
        isSpeaking: status.is_speaking,
      }));
    } catch (_) {
      // Backend not available or voice not initialised — use defaults
    }

    // Register global keyboard listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Listen for voice events
    const unlisteners = await Promise.all([
      listenForCaptureStarted(() => {}),
      listenForCaptureStopped(() => {}),
      listenForTranscribed((text) => {
        setTranscription(text);
      }),
      listenForNoSpeech(() => {
        setError('No speech detected');
      }),
      listenForVoiceError((err) => {
        setError(err);
      }),
      listenForTtsToggled(() => {}),
    ]);
    unlisteners.forEach((fn) => unlisteners.push(fn));
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    unlisteners.forEach((fn) => fn());
  });
</script>

<div class="voice-controls" role="toolbar" aria-label="Voice controls">
  <!-- TTS toggle -->
  <button
    class="voice-btn tts-btn"
    on:click={handleTtsToggle}
    disabled={!$voice.ttsAvailable}
    title={$voice.ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
    aria-pressed={$voice.ttsEnabled}
  >
    {#if $voice.ttsEnabled}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    {/if}
  </button>

  <!-- Push-to-talk button -->
  <button
    class="voice-btn ptt-btn"
    class:recording={$voice.isRecording}
    class:disabled={!$voice.sttAvailable}
    on:mousedown={handleMouseDown}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    disabled={!$voice.sttAvailable}
    title={
      $voice.isRecording
        ? 'Release to send'
        : !$voice.sttAvailable
          ? 'Voice input unavailable'
          : 'Hold to record (V)'
    }
  >
    {#if $voice.isRecording}
      <!-- Recording indicator -->
      <div class="recording-indicator">
        <span class="pulse-dot"></span>
        <span class="recording-text">Recording</span>
      </div>
    {:else}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      <span class="ptt-label">Hold to talk</span>
    {/if}
  </button>

  <!-- Audio level indicator -->
  {#if $voice.isRecording}
    <div class="audio-level-bar" role="progressbar" aria-label="Audio level" aria-valuenow={Math.round(audioLevel * 100)}>
      <div class="audio-level-fill" style="height: {audioLevel * 100}%"></div>
    </div>
  {/if}

  <!-- Error indicator -->
  {#if $voice.error}
    <div class="voice-error" role="alert">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span>{$voice.error}</span>
    </div>
  {/if}
</div>

<style>
  .voice-controls {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
  }

  .voice-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
    line-height: 1;
  }

  .voice-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
    border-color: var(--color-border-focus);
  }

  .voice-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tts-btn[aria-pressed='true'] {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  /* ── PTT Button ─────────────────────────────── */

  .ptt-btn {
    min-width: 120px;
    justify-content: center;
    padding: var(--space-sm) var(--space-md);
  }

  .ptt-btn.recording {
    background: var(--color-danger-bg);
    border-color: var(--color-danger);
    color: var(--color-danger);
    animation: pulse-border 1s ease-in-out infinite;
  }

  .ptt-btn.disabled {
    opacity: 0.5;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: var(--color-danger); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.4); }
    50% { border-color: var(--color-danger); box-shadow: 0 0 0 6px rgba(255, 107, 107, 0); }
  }

  .ptt-label {
    font-size: var(--font-size-xs);
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-danger);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  .recording-text {
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  /* ── Audio Level Bar ────────────────────────── */

  .audio-level-bar {
    width: 4px;
    height: 32px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
    overflow: hidden;
    position: relative;
  }

  .audio-level-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, var(--color-accent), var(--color-primary));
    border-radius: var(--radius-sm);
    transition: height 80ms ease;
  }

  /* ── Error ──────────────────────────────────── */

  .voice-error {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-danger-bg);
    color: var(--color-danger);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    max-width: 200px;
  }

  .voice-error span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
