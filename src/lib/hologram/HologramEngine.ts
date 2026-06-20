/**
 * HologramEngine — Three.js particle avatar engine.
 *
 * Lazy-loaded via dynamic `import('three')`. Manages:
 * - Scene, camera, renderer lifecycle
 * - Particle system (Points) with morphable styles
 * - Emotion expression presets
 * - Dance/music-driven animation
 * - Audio reactivity (voice level → brightness/size)
 *
 * Usage:
 * ```ts
 * const engine = new HologramEngine(canvas);
 * await engine.init();
 * engine.setEmotion('happy');
 * engine.setStyle('woman1');
 * // ... on destroy:
 * engine.destroy();
 * ```
 */

import type {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Points,
  PointsMaterial,
} from 'three';

import {
  createParticleData,
  morphToStyle,
  snapToStyle,
  type ParticleStyle,
} from './particles';
import {
  applyEmotion,
  blendEmotion,
  type Emotion,
} from './emotions';
import { DanceController, type DanceParams } from './dance';
import {
  computeAudioParams,
  defaultAudioParams,
  type AudioReactivityParams,
} from './audioReactivity';

// ─── Types ───────────────────────────────────────────────────────────

export interface HologramEngineOptions {
  /** Canvas pixel density (default: devicePixelRatio). */
  pixelRatio?: number;
  /** Enable dance/music detection (default: true). */
  enableDance?: boolean;
  /** Enable audio reactivity (default: true). */
  enableAudioReactivity?: boolean;
  /** Morph transition speed (0–1, default: 0.03). */
  morphSpeed?: number;
  /** Enable auto quality adjustment when FPS drops (default: true). */
  autoQuality?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_OPTIONS: HologramEngineOptions = {
  pixelRatio: undefined,
  enableDance: true,
  enableAudioReactivity: true,
  morphSpeed: 0.03,
  autoQuality: true,
};

// ─── Engine ──────────────────────────────────────────────────────────

export class HologramEngine {
  private canvas: HTMLCanvasElement;
  private options: HologramEngineOptions;

  // Three.js objects (set after async init)
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private renderer: WebGLRenderer | null = null;
  private particles: Points | null = null;
  private material: PointsMaterial | null = null;
  private Three: typeof import('three') | null = null;

  // State
  private particleData = createParticleData();
  private currentStyle: ParticleStyle = 'woman1';
  private currentEmotion: Emotion = 'neutral';
  private previousEmotion: Emotion = 'neutral';
  private emotionTransition = 1; // 1 = fully transitioned
  private animFrameId: number | null = null;
  private startTime = 0;
  private running = false;

  // FPS tracking and auto-quality
  private lastFrameTime = 0;
  private fpsTimestamps: number[] = [];
  private lowFpsDuration = 0;
  private qualityLevel = 1; // 1 = full, lower = reduced
  private readonly FPS_HISTORY_LENGTH = 30;
  private readonly LOW_FPS_THRESHOLD = 30;
  private readonly LOW_FPS_DURATION_THRESHOLD = 2;
  private readonly QUALITY_REDUCTION_FACTOR = 0.75;

  // Sub-controllers
  private dance: DanceController;
  private audioParams: AudioReactivityParams = defaultAudioParams();

  constructor(canvas: HTMLCanvasElement, options?: HologramEngineOptions) {
    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.dance = new DanceController();
  }

  /** Initialize Three.js scene and start the render loop. */
  async init(): Promise<void> {
    if (this.running) return;

    // Dynamic import — Three.js is ~600KB, lazy loaded
    this.Three = await import('three');
    const T = this.Three;

    // Scene
    this.scene = new T.Scene();
    this.scene.background = null; // transparent

    // Camera
    const aspect = this.canvas.width / this.canvas.height || 1;
    this.camera = new T.PerspectiveCamera(45, aspect, 0.1, 10);
    this.camera.position.set(0, 0, 2.2);

    // Renderer
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });

    const pixelRatio = this.options.pixelRatio ?? devicePixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);

    // Particle material
    this.material = new T.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: T.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // Particle system
    this.particles = new T.Points(this.particleData.geometry, this.material);
    this.scene.add(this.particles);

    // Start dance controller
    if (this.options.enableDance) {
      this.dance.start();
    }

    // Start loop
    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.loop(performance.now());

    // Handle resize
    window.addEventListener('resize', this.onResize);
  }

  /** Destroy the engine and release all resources. */
  destroy(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    window.removeEventListener('resize', this.onResize);
    this.dance.stop();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    // Release Three.js references
    this.scene = null;
    this.camera = null;
    this.particles = null;
    this.material = null;
    this.Three = null;
  }

  // ─── Style ───────────────────────────────────────────────────────

  /** Set the particle silhouette style. Morphs smoothly. */
  setStyle(style: ParticleStyle): void {
    const targets = this.particleData.morphTargets;
    if (targets[style] && style !== this.currentStyle) {
      this.currentStyle = style;
    }
  }

  /** Immediately snap to a style (no morph animation). */
  snapStyle(style: ParticleStyle): void {
    const targets = this.particleData.morphTargets;
    if (targets[style] && this.particles) {
      this.currentStyle = style;
      snapToStyle(this.particleData.geometry, targets[style]);
    }
  }

  // ─── Emotion ─────────────────────────────────────────────────────

  /** Set the current emotion. Smoothly transitions from previous. */
  setEmotion(emotion: Emotion): void {
    if (emotion !== this.currentEmotion) {
      this.previousEmotion = this.currentEmotion;
      this.currentEmotion = emotion;
      this.emotionTransition = 0;
    }
  }

  /** Get the current emotion. */
  getEmotion(): Emotion {
    return this.currentEmotion;
  }

  // ─── Render Loop ─────────────────────────────────────────────────

  private loop = (now: number): void => {
    if (!this.running) return;

    this.animFrameId = requestAnimationFrame(this.loop);

    // Real delta from rAF timestamps (capped at 100ms to avoid spiral on tab switch)
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    const elapsed = (now - this.startTime) / 1000;

    const T = this.Three;
    if (!T || !this.particles || !this.renderer || !this.scene || !this.camera) return;

    // 1. Style morph
    const targetPos = this.particleData.morphTargets[this.currentStyle];
    morphToStyle(this.particleData.geometry, targetPos, this.options.morphSpeed ?? 0.03);

    // 2. Emotion expression
    if (this.emotionTransition < 1) {
      this.emotionTransition = Math.min(1, this.emotionTransition + 0.03);
      blendEmotion(
        this.particleData.geometry,
        this.previousEmotion,
        this.currentEmotion,
        this.emotionTransition,
        elapsed,
      );
    } else {
      applyEmotion(this.particleData.geometry, this.currentEmotion, elapsed);
    }

    // 3. Audio reactivity
    if (this.options.enableAudioReactivity) {
      this.audioParams = computeAudioParams(this.audioParams);
      if (this.material) {
        this.material.size = 0.025 * this.audioParams.sizeMul;
      }
    }

    // 4. Dance
    if (this.options.enableDance) {
      const dance = this.dance.update(delta);

      // Apply dance transforms
      if (dance.intensity > 0.05) {
        this.applyDance(dance, elapsed);
      }
    }

    // 5. Auto quality adjustment (after dance/emotion, before render)
    if (this.options.autoQuality && this.particles) {
      this.updateAutoQuality(delta, now);
    }

    // 6. Slow ambient rotation
    if (this.particles) {
      this.particles.rotation.y += delta * 0.15;
      // Gentle floating
      this.particles.position.y = Math.sin(elapsed * 0.5) * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  };

  /** Apply dance parameters as particle group transforms. */
  private applyDance(dance: DanceParams, elapsed: number): void {
    if (!this.particles) return;

    // Body sway (use elapsed for smooth oscillation)
    this.particles.rotation.z = dance.sway * 0.5;
    this.particles.rotation.x = Math.sin(elapsed * 2.5) * dance.sway * 0.15;

    // Bounce (set absolute, not relative — avoids position drift)
    const baseY = Math.sin(elapsed * 0.5) * 0.02;
    this.particles.position.y = baseY + dance.bounce * 0.08;

    // Spread (scale)
    const spreadScale = 1 + (dance.spread - 1) * 0.4;
    this.particles.scale.set(spreadScale, spreadScale, spreadScale);

    // Extra spin on top of ambient rotation
    if (dance.spin > 0.05) {
      this.particles.rotation.y += 0.015 * dance.spin;
    }

    // Pulse material size
    if (this.material) {
      const baseSize = 0.025 * this.audioParams.sizeMul;
      this.material.size = baseSize * (1 + dance.bounce * 1.2);
    }
  }

  // ─── Public accessors ────────────────────────────────────────────

  /** Get the current quality level (1 = full, 0.75 = reduced). */
  getQualityLevel(): number {
    return this.qualityLevel;
  }

  // ─── Auto quality ────────────────────────────────────────────────

  /** Update FPS tracking and adjust quality if needed. */
  private updateAutoQuality(delta: number, now: number): void {
    // Track FPS history
    this.fpsTimestamps.push(now);
    while (this.fpsTimestamps.length > this.FPS_HISTORY_LENGTH) {
      this.fpsTimestamps.shift();
    }

    const avgFps = this.getAverageFps();

    if (avgFps < this.LOW_FPS_THRESHOLD && avgFps > 0) {
      this.lowFpsDuration += delta;
    } else {
      // Recover twice as fast as we degrade
      this.lowFpsDuration = Math.max(0, this.lowFpsDuration - delta * 2);
    }

    if (this.lowFpsDuration >= this.LOW_FPS_DURATION_THRESHOLD) {
      this.setQualityLevel(this.QUALITY_REDUCTION_FACTOR);
    } else if (
      this.lowFpsDuration < this.LOW_FPS_DURATION_THRESHOLD * 0.5 &&
      this.qualityLevel < 1
    ) {
      this.setQualityLevel(1);
    }
  }

  /** Compute average FPS over the tracked history window. */
  private getAverageFps(): number {
    if (this.fpsTimestamps.length < 2) return 60;
    const windowMs =
      this.fpsTimestamps[this.fpsTimestamps.length - 1] - this.fpsTimestamps[0];
    const avgDelta = windowMs / (this.fpsTimestamps.length - 1) / 1000;
    return avgDelta > 0 ? 1 / avgDelta : 60;
  }

  /** Apply a quality level: adjust draw range and disable glow when reduced. */
  private setQualityLevel(level: number): void {
    if (level === this.qualityLevel) return;
    this.qualityLevel = level;

    if (this.particles?.geometry) {
      const posAttr = this.particles.geometry.attributes.position;
      if (posAttr) {
        const totalParticles = posAttr.count;
        const drawCount = Math.floor(totalParticles * level);
        this.particles.geometry.setDrawRange(0, drawCount);
      }
    }

    // When quality is reduced, disable glow/bloom effects
    if (level < 1) {
      this.audioParams.glow = 0;
    }
  }

  // ─── Resize ──────────────────────────────────────────────────────

  private onResize = (): void => {
    if (!this.renderer || !this.camera) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
