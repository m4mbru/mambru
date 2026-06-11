/**
 * Holographic Particle Avatar — barrel export.
 */

export { HologramEngine } from './HologramEngine';
export type { HologramEngineOptions } from './HologramEngine';

export { createParticleData, morphToStyle, snapToStyle } from './particles';
export type { ParticleStyle } from './particles';

export { applyEmotion, blendEmotion, getEmotionPreset } from './emotions';
export type { Emotion, EmotionPreset } from './emotions';

export { DanceController } from './dance';
export type { DanceParams, DanceControllerOptions } from './dance';

export { computeAudioParams, defaultAudioParams } from './audioReactivity';
export type { AudioReactivityParams } from './audioReactivity';
