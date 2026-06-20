/**
 * Emotion expression presets for the holographic avatar.
 *
 * Each emotion maps to a visual "expression" — per-particle offsets,
 * color shifts, and size changes applied by HologramEngine during the
 * animation loop.
 */

import { BufferGeometry, BufferAttribute, Color } from 'three';

// ─── Types ───────────────────────────────────────────────────────────

export type Emotion = 'happy' | 'sad' | 'thinking' | 'neutral' | 'speaking';

export interface EmotionPreset {
  /** Per-particle position offset amplitude (applied as time-varying sine). */
  jitter: number;
  /** Color tint as HSL hue shift (degrees). */
  hueShift: number;
  /** Brightness multiplier (0–2). */
  brightness: number;
  /** Particle size multiplier. */
  sizeMul: number;
  /** Speed of the breathing/twitching animation. */
  breathSpeed: number;
}

// ─── Presets ─────────────────────────────────────────────────────────

const presets: Record<Emotion, EmotionPreset> = {
  happy: {
    jitter: 0.015,
    hueShift: 30,   // warmer (golden)
    brightness: 1.3,
    sizeMul: 1.2,
    breathSpeed: 1.5,
  },
  sad: {
    jitter: 0.005,
    hueShift: -20,  // cooler (blue)
    brightness: 0.6,
    sizeMul: 0.8,
    breathSpeed: 0.5,
  },
  thinking: {
    jitter: 0.008,
    hueShift: -10,  // slight cool
    brightness: 0.9,
    sizeMul: 0.9,
    breathSpeed: 0.3,
  },
  neutral: {
    jitter: 0.01,
    hueShift: 0,
    brightness: 1.0,
    sizeMul: 1.0,
    breathSpeed: 1.0,
  },
  speaking: {
    jitter: 0.025,
    hueShift: 10,   // slight warm
    brightness: 1.2,
    sizeMul: 1.1,
    breathSpeed: 2.5,
  },
};

export function getEmotionPreset(emotion: Emotion): EmotionPreset {
  return presets[emotion];
}

// ─── Application ─────────────────────────────────────────────────────

const _tmpColor = new Color();

/**
 * Apply emotion expression to particle geometry for the current frame.
 * Mutates `color` and `size` attributes in-place.
 *
 * @param geometry  - particle BufferGeometry
 * @param emotion   - current emotion
 * @param t         - time in seconds (for breathing/twitching)
 * @param intensity - 0..1 blend toward full expression
 */
export function applyEmotion(
  geometry: BufferGeometry,
  emotion: Emotion,
  t: number,
  intensity: number = 1,
): void {
  const preset = presets[emotion];
  const colorAttr = geometry.attributes.color;
  const sizeAttr = geometry.attributes.size;

  if (!colorAttr || !sizeAttr) return;

  const colors = colorAttr.array as Float32Array;
  const sizes = sizeAttr.array as Float32Array;
  const count = sizes.length;

  // Breathing oscillation
  const breath = 1 + 0.05 * Math.sin(t * preset.breathSpeed * 2);

  for (let i = 0; i < count; i++) {
    // Base hue from stored RGB → shift
    _tmpColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    const hsl = { h: 0, s: 0, l: 0 };
    _tmpColor.getHSL(hsl);

    // Shift hue toward preset
    hsl.h += (preset.hueShift / 360) * intensity;
    // Scale lightness
    hsl.l *= (1 + (preset.brightness - 1) * intensity);
    // Clamp
    hsl.l = Math.max(0.1, Math.min(0.9, hsl.l));

    _tmpColor.setHSL(hsl.h, hsl.s, hsl.l);
    colors[i * 3] = _tmpColor.r;
    colors[i * 3 + 1] = _tmpColor.g;
    colors[i * 3 + 2] = _tmpColor.b;

    // Size modulation
    sizes[i] = (0.8 + 0.6 * Math.random()) * (1 + (preset.sizeMul - 1) * intensity) * breath;
  }

  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
}

/**
 * Smoothly transition between two emotion presets.
 * Called each frame during transitions.
 */
export function blendEmotion(
  geometry: BufferGeometry,
  from: Emotion,
  to: Emotion,
  progress: number, // 0–1
  t: number,
): void {
  const fromP = presets[from];
  const toP = presets[to];

  // Blend preset values
  const blended: EmotionPreset = {
    jitter: fromP.jitter + (toP.jitter - fromP.jitter) * progress,
    hueShift: fromP.hueShift + (toP.hueShift - fromP.hueShift) * progress,
    brightness: fromP.brightness + (toP.brightness - fromP.brightness) * progress,
    sizeMul: fromP.sizeMul + (toP.sizeMul - fromP.sizeMul) * progress,
    breathSpeed: fromP.breathSpeed + (toP.breathSpeed - fromP.breathSpeed) * progress,
  };

  const colorAttr = geometry.attributes.color;
  const sizeAttr = geometry.attributes.size;
  if (!colorAttr || !sizeAttr) return;

  const colors = colorAttr.array as Float32Array;
  const sizes = sizeAttr.array as Float32Array;
  const count = sizes.length;
  const breath = 1 + 0.05 * Math.sin(t * blended.breathSpeed * 2);

  for (let i = 0; i < count; i++) {
    _tmpColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    const hsl = { h: 0, s: 0, l: 0 };
    _tmpColor.getHSL(hsl);

    hsl.h += (blended.hueShift / 360);
    hsl.l *= blended.brightness;
    hsl.l = Math.max(0.1, Math.min(0.9, hsl.l));
    _tmpColor.setHSL(hsl.h, hsl.s, hsl.l);

    colors[i * 3] = _tmpColor.r;
    colors[i * 3 + 1] = _tmpColor.g;
    colors[i * 3 + 2] = _tmpColor.b;

    sizes[i] = (0.8 + 0.6 * Math.random()) * blended.sizeMul * breath;
  }

  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
}
