import { writable, type Writable } from 'svelte/store';

// ── Types ─────────────────────────────────────────────────────────────────

export type HologramStyle = 'woman1' | 'woman2' | 'man1' | 'man2' | 'sphere';
export type HologramPosition = 'floating' | 'minimal' | 'panel';
export type HologramEmotion = 'happy' | 'sad' | 'thinking' | 'neutral' | 'speaking';

export interface HologramState {
  /** Whether the hologram is enabled. */
  enabled: boolean;
  /** Active style preset. */
  style: HologramStyle;
  /** Canvas dimension (100-400px). */
  size: number;
  /** Widget position mode. */
  position: HologramPosition;
  /** Current emotion expression. */
  emotion: HologramEmotion;
  /** Emotion confidence (0-1). */
  emotionConfidence: number;
  /** Whether the avatar is in dance mode. */
  isDancing: boolean;
  /** Whether Three.js has been loaded. */
  engineReady: boolean;
}

// ── Defaults ──────────────────────────────────────────────────────────────

const initialState: HologramState = {
  enabled: true,
  style: 'sphere',
  size: 200,
  position: 'floating',
  emotion: 'neutral',
  emotionConfidence: 1.0,
  isDancing: false,
  engineReady: false,
};

// ── Store ─────────────────────────────────────────────────────────────────

export const hologram: Writable<HologramState> = writable<HologramState>(initialState);

// ── Actions ───────────────────────────────────────────────────────────────

export function setHologramEnabled(enabled: boolean): void {
  hologram.update((s) => ({ ...s, enabled }));
}

export function setHologramStyle(style: HologramStyle): void {
  hologram.update((s) => ({ ...s, style }));
}

export function setHologramSize(size: number): void {
  hologram.update((s) => ({ ...s, size: Math.max(100, Math.min(400, size)) }));
}

export function setHologramPosition(position: HologramPosition): void {
  hologram.update((s) => ({ ...s, position }));
}

export function setHologramEmotion(emotion: HologramEmotion, confidence: number): void {
  hologram.update((s) => ({ ...s, emotion, emotionConfidence: confidence }));
}

export function setHologramDancing(dancing: boolean): void {
  hologram.update((s) => ({ ...s, isDancing: dancing }));
}

export function setEngineReady(ready: boolean): void {
  hologram.update((s) => ({ ...s, engineReady: ready }));
}
