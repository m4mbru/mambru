/**
 * Audio reactivity bridge — maps microphone audio level to particle
 * visual properties (brightness, size, jitter).
 *
 * Listens to the voice store's `audioLevel` (0–1) and computes
 * smoothed visual parameters for HologramEngine.
 */

import { get } from 'svelte/store';
import { voice } from '../stores/voice';

// ─── Types ───────────────────────────────────────────────────────────

export interface AudioReactivityParams {
  /** Particle brightness multiplier (0–2). */
  brightness: number;
  /** Particle size multiplier. */
  sizeMul: number;
  /** Jitter / twitch amplitude. */
  jitter: number;
  /** Glow intensity (0–1). */
  glow: number;
}

// ─── Smoothing ───────────────────────────────────────────────────────

const SMOOTH_FACTOR = 0.15;

/** Read the current audio level from the voice store and return smoothed params. */
export function computeAudioParams(
  prev: AudioReactivityParams,
): AudioReactivityParams {
  const level = get(voice).audioLevel ?? 0;
  const clamped = Math.max(0, Math.min(1, level));

  // Map level to visual parameters
  const target: AudioReactivityParams = {
    brightness: 0.8 + clamped * 0.8,
    sizeMul: 1.0 + clamped * 0.4,
    jitter: 0.005 + clamped * 0.025,
    glow: clamped * 1.2,
  };

  // Exponential smoothing
  return {
    brightness: prev.brightness + (target.brightness - prev.brightness) * SMOOTH_FACTOR,
    sizeMul: prev.sizeMul + (target.sizeMul - prev.sizeMul) * SMOOTH_FACTOR,
    jitter: prev.jitter + (target.jitter - prev.jitter) * SMOOTH_FACTOR,
    glow: prev.glow + (target.glow - prev.glow) * SMOOTH_FACTOR,
  };
}

/** Default / idle params. */
export function defaultAudioParams(): AudioReactivityParams {
  return {
    brightness: 0.8,
    sizeMul: 1.0,
    jitter: 0.005,
    glow: 0,
  };
}
