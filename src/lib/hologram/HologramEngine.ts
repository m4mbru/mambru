/**
 * HologramEngine — Three.js particle avatar engine.
 *
 * Lazy-loaded via dynamic `import('three')`. Manages:
 * - Scene, camera, renderer lifecycle
 * - Particle system (Points) with morphable styles
 *
 * Usage:
 * ```ts
 * const engine = new HologramEngine(canvas);
 * await engine.init();
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

// ─── Types ───────────────────────────────────────────────────────────

export interface HologramEngineOptions {
  /** Canvas pixel density (default: devicePixelRatio). */
  pixelRatio?: number;
  /** Morph transition speed (0–1, default: 0.03). */
  morphSpeed?: number;
  /** Optional per-frame callback (delta, elapsed). */
  onUpdate?: (delta: number, elapsed: number) => void;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_OPTIONS: HologramEngineOptions = {
  pixelRatio: undefined,
  morphSpeed: 0.03,
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
  private animFrameId: number | null = null;
  private startTime = 0;
  private running = false;

  // FPS monitor
  private frameTimes: number[] = [];
  private smoothedFps = 60;
  private lowFpsSince = 0;
  private highFpsSince = 0;
  private originalParticleSize = 0.025;
  particleScale = 1.0;

  constructor(canvas: HTMLCanvasElement, options?: HologramEngineOptions) {
    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
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
    this.camera.position.set(0, 0.1, 2.4);

    // Renderer
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.localClippingEnabled = true;

    const pixelRatio = this.options.pixelRatio ?? devicePixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);

    // Particle material
    this.originalParticleSize = 0.02;
    this.material = new T.PointsMaterial({
      size: this.originalParticleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      blending: T.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // Particle system
    this.particles = new T.Points(this.particleData.geometry, this.material);
    this.scene.add(this.particles);

    // Start loop
    this.running = true;
    this.startTime = performance.now();
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
      this.adjustMaterialForStyle(style);
    }
    // Show particles when switching to a particle style
    if (this.particles) this.particles.visible = true;
  }

  /** Hide or show the particle system (used when switching to STL models). */
  setParticlesVisible(visible: boolean): void {
    if (this.particles) this.particles.visible = visible;
  }

  /** Immediately snap to a style (no morph animation). */
  snapStyle(style: ParticleStyle): void {
    const targets = this.particleData.morphTargets;
    if (targets[style] && this.particles) {
      this.currentStyle = style;
      snapToStyle(this.particleData.geometry, targets[style]);
      this.adjustMaterialForStyle(style);
    }
  }

  /** Bump opacity & size for defined styles like 'head' so they're actually visible. */
  private adjustMaterialForStyle(style: ParticleStyle): void {
    if (!this.material) return;
    if (style === 'head') {
      this.material.opacity = 0.6;
      this.material.size = this.originalParticleSize * 2.5;
    } else {
      this.material.opacity = 0.15;
      this.material.size = this.originalParticleSize;
    }
  }

  // ─── FPS Monitor ────────────────────────────────────────────────

  private updateFps(now: number): void {
    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && this.frameTimes[0] < now - 1000) {
      this.frameTimes.shift();
    }
    this.smoothedFps = this.frameTimes.length;

    if (this.smoothedFps < 30) {
      if (this.lowFpsSince === 0) {
        this.lowFpsSince = now;
      } else if (now - this.lowFpsSince > 2000) {
        this.particleScale = 0.75;
        if (this.material) this.material.size = this.originalParticleSize * this.particleScale;
      }
    } else {
      this.lowFpsSince = 0;
    }

    if (this.smoothedFps > 55) {
      if (this.highFpsSince === 0) {
        this.highFpsSince = now;
      } else if (now - this.highFpsSince > 5000 && this.particleScale < 1.0) {
        this.particleScale = 1.0;
        if (this.material) this.material.size = this.originalParticleSize * this.particleScale;
      }
    } else {
      this.highFpsSince = 0;
    }
  }

  getFps(): number {
    return this.smoothedFps;
  }

  // ─── Render Loop ─────────────────────────────────────────────────

  private loop = (now: number): void => {
    if (!this.running) return;

    this.animFrameId = requestAnimationFrame(this.loop);

    this.updateFps(now);

    const delta = 0.016;
    const elapsed = (now - this.startTime) / 1000;

    this.options.onUpdate?.(delta, elapsed);

    const T = this.Three;
    if (!T || !this.particles || !this.renderer || !this.scene || !this.camera) return;

    const targetPos = this.particleData.morphTargets[this.currentStyle];
    morphToStyle(this.particleData.geometry, targetPos, this.options.morphSpeed ?? 0.03);

    if (this.particles) {
      this.particles.rotation.y += delta * 0.08;
      this.particles.position.y = Math.sin(elapsed * 0.5) * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  };

  getScene(): Scene | null {
    return this.scene;
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
