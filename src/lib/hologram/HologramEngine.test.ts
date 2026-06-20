/**
 * HologramEngine tests.
 *
 * Three.js is lazy-loaded via dynamic `import('three')`. We mock the 'three'
 * module at the module level so the dynamic import returns Three.js classes
 * without loading the full ~600KB library.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Points,
  PointsMaterial,
  BufferGeometry,
  BufferAttribute,
  AdditiveBlending,
  Color,
} from 'three';

// ─── Mock 'three' module (catches dynamic import) ────────────────
vi.mock('three', async (importOriginal) => {
  // Keep real Three.js classes but replace WebGLRenderer with a mock
  // so it doesn't need a real WebGL context (unavailable in jsdom).
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      render: vi.fn(),
      setPixelRatio: vi.fn(),
      dispose: vi.fn(),
      getContext: vi.fn(),
    })),
  };
});
vi.mock('./particles', () => ({
  createParticleData: vi.fn(() => {
    const geometry = new BufferGeometry();
    const pos = new Float32Array(30);
    for (let i = 0; i < 30; i++) pos[i] = Math.random() * 2 - 1;
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    const colors = new Float32Array(30);
    for (let i = 0; i < 30; i++) colors[i] = 0.5 + 0.2 * Math.random();
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const sizes = new Float32Array(10);
    for (let i = 0; i < 10; i++) sizes[i] = 1.0;
    geometry.setAttribute('size', new BufferAttribute(sizes, 1));

    return {
      geometry,
      morphTargets: {
        woman1: new Float32Array(30).fill(0),
        woman2: new Float32Array(30).fill(0.1),
        man1: new Float32Array(30).fill(-0.1),
        man2: new Float32Array(30).fill(0.05),
        sphere: new Float32Array(30).fill(0.2),
      },
      styles: ['woman1', 'woman2', 'man1', 'man2', 'sphere'],
      defaultStyle: 'woman1',
    };
  }),
  morphToStyle: vi.fn(),
  snapToStyle: vi.fn(),
}));

vi.mock('./emotions', () => ({
  applyEmotion: vi.fn(),
  blendEmotion: vi.fn(),
  getEmotionPreset: vi.fn(() => ({
    jitter: 0.01,
    hueShift: 0,
    brightness: 1.0,
    sizeMul: 1.0,
    breathSpeed: 1.0,
  })),
}));

vi.mock('./dance', () => ({
  DanceController: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    update: vi.fn(() => ({
      intensity: 0,
      sway: 0,
      bounce: 0,
      spread: 1,
      spin: 0,
      isMusic: false,
    })),
  })),
}));

vi.mock('./audioReactivity', () => ({
  computeAudioParams: vi.fn(() => ({
    brightness: 0.8,
    sizeMul: 1.0,
    jitter: 0.005,
    glow: 0,
  })),
  defaultAudioParams: vi.fn(() => ({
    brightness: 0.8,
    sizeMul: 1.0,
    jitter: 0.005,
    glow: 0,
  })),
}));

// Mock rAF/cAF for a controlled test environment
globalThis.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
});
globalThis.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});

import { HologramEngine, type HologramEngineOptions } from './HologramEngine';

describe('HologramEngine', () => {
  let canvas: HTMLCanvasElement;
  let engine: HologramEngine | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });
  });

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  describe('constructor', () => {
    it('creates an instance with given canvas', () => {
      engine = new HologramEngine(canvas);
      expect(engine).toBeInstanceOf(HologramEngine);
    });

    it('accepts custom options', () => {
      const options: HologramEngineOptions = {
        morphSpeed: 0.05,
        enableDance: false,
        enableAudioReactivity: false,
      };
      engine = new HologramEngine(canvas, options);
      expect(engine).toBeInstanceOf(HologramEngine);
    });

    it('uses defaults when no options provided', () => {
      engine = new HologramEngine(canvas);
      expect(engine).toBeInstanceOf(HologramEngine);
    });
  });

  describe('init / destroy lifecycle', () => {
    it('initializes and creates Three.js scene', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();

      // The private Three field gets set by the dynamic import
      expect((engine as any).running).toBe(true);
      expect((engine as any).scene).toBeDefined();
      expect((engine as any).scene).toBeInstanceOf(Scene);
      expect((engine as any).camera).toBeInstanceOf(PerspectiveCamera);
      // WebGLRenderer is mocked — verify shape instead of instanceof
      expect((engine as any).renderer).toHaveProperty('setSize');
      expect((engine as any).renderer).toHaveProperty('render');
      expect((engine as any).renderer).toHaveProperty('dispose');
      expect((engine as any).particles).toBeInstanceOf(Points);
      expect((engine as any).material).toBeInstanceOf(PointsMaterial);
    });

    it('is idempotent — calling init twice does not re-initialize', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();
      const scene1 = (engine as any).scene;

      await engine.init(); // second call
      const scene2 = (engine as any).scene;

      // Scene should be the same object
      expect(scene1).toBe(scene2);
    });

    it('destroy stops render loop and releases references', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();
      engine.destroy();

      expect((engine as any).running).toBe(false);
      expect((engine as any).scene).toBeNull();
      expect((engine as any).camera).toBeNull();
      expect((engine as any).renderer).toBeNull();
      expect((engine as any).particles).toBeNull();
      expect((engine as any).material).toBeNull();
      expect((engine as any).Three).toBeNull();
      expect((engine as any).animFrameId).toBeNull();
    });

    it('destroy can be called without init (graceful no-op)', () => {
      engine = new HologramEngine(canvas);
      expect(() => engine!.destroy()).not.toThrow();
    });

    it('loads three via dynamic import', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();
      expect((engine as any).Three).toBeDefined();
      // Should contain Scene from the three module
      expect((engine as any).Three.Scene).toBe(Scene);
    });

    it('adds resize listener on init and removes on destroy', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      engine = new HologramEngine(canvas);
      await engine.init();
      expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      engine.destroy();
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('setStyle / snapStyle', () => {
    it('setStyle changes current style', () => {
      engine = new HologramEngine(canvas);
      (engine as any).particleData.morphTargets.man1 = new Float32Array(30);

      engine.setStyle('man1');
      expect((engine as any).currentStyle).toBe('man1');
    });

    it('setStyle ignores unknown style', () => {
      engine = new HologramEngine(canvas);
      (engine as any).currentStyle = 'woman1';

      engine.setStyle('nonexistent' as any);
      expect((engine as any).currentStyle).toBe('woman1');
    });

    it('setStyle ignores same style (no-op)', () => {
      engine = new HologramEngine(canvas);
      (engine as any).currentStyle = 'sphere';

      engine.setStyle('sphere');
      expect((engine as any).currentStyle).toBe('sphere');
    });

    it('snapStyle calls snapToStyle when style exists', async () => {
      const { snapToStyle } = await import('./particles');
      engine = new HologramEngine(canvas);
      (engine as any).particles = new Points(new BufferGeometry(), new PointsMaterial());

      engine.snapStyle('sphere');

      expect(snapToStyle).toHaveBeenCalled();
    });
  });

  describe('setEmotion / getEmotion', () => {
    it('setEmotion changes current emotion', () => {
      engine = new HologramEngine(canvas);
      (engine as any).currentEmotion = 'neutral';

      engine.setEmotion('happy');
      expect((engine as any).currentEmotion).toBe('happy');
      expect((engine as any).emotionTransition).toBe(0);
    });

    it('setEmotion with same emotion does not reset transition', () => {
      engine = new HologramEngine(canvas);
      (engine as any).currentEmotion = 'happy';
      (engine as any).emotionTransition = 0.5;

      engine.setEmotion('happy');
      expect((engine as any).emotionTransition).toBe(0.5); // unchanged
    });

    it('getEmotion returns current emotion', () => {
      engine = new HologramEngine(canvas);
      (engine as any).currentEmotion = 'thinking';

      expect(engine.getEmotion()).toBe('thinking');
    });

    it('getEmotion defaults to neutral', () => {
      engine = new HologramEngine(canvas);
      expect(engine.getEmotion()).toBe('neutral');
    });
  });

  describe('auto quality adjustment', () => {
    it('starts with full quality level by default', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();
      expect(engine.getQualityLevel()).toBe(1);
    });

    it('starts with full quality when autoQuality is enabled', async () => {
      engine = new HologramEngine(canvas, { autoQuality: true });
      await engine.init();
      expect(engine.getQualityLevel()).toBe(1);
    });

    it('reduces quality when FPS stays below 30 for 2+ seconds', async () => {
      engine = new HologramEngine(canvas, { autoQuality: true });
      await engine.init();

      const geometry = (engine as any).particles.geometry;
      const setDrawRangeSpy = vi.spyOn(geometry, 'setDrawRange');

      // Reset lastFrameTime to align with our controlled timestamps
      (engine as any).lastFrameTime = 0;

      // Simulate frames at ~20fps (50ms between frames)
      let now = 0;
      (engine as any).loop(now);
      now += 50;

      // 80 frames at 50ms each = 4 seconds — well over the 2s threshold
      for (let i = 0; i < 80; i++) {
        (engine as any).loop(now);
        now += 50;
      }

      // Should have reduced: 10 particles * 0.75 = 7.5, floor = 7
      expect(setDrawRangeSpy).toHaveBeenCalledWith(0, 7);
      expect(engine.getQualityLevel()).toBe(0.75);
    });

    it('does not reduce quality when autoQuality is disabled', async () => {
      engine = new HologramEngine(canvas, { autoQuality: false });
      await engine.init();

      (engine as any).lastFrameTime = 0;

      let now = 0;
      (engine as any).loop(now);
      now += 50;

      for (let i = 0; i < 80; i++) {
        (engine as any).loop(now);
        now += 50;
      }

      expect(engine.getQualityLevel()).toBe(1);
    });

    it('does not reduce quality with healthy FPS (~60fps)', async () => {
      engine = new HologramEngine(canvas, { autoQuality: true });
      await engine.init();

      (engine as any).lastFrameTime = 0;

      // Simulate frames at ~60fps
      let now = 0;
      (engine as any).loop(now);
      now += 16;

      for (let i = 0; i < 300; i++) {
        (engine as any).loop(now);
        now += 16;
      }

      expect(engine.getQualityLevel()).toBe(1);
    });

    it('resets quality after FPS recovers', async () => {
      engine = new HologramEngine(canvas, { autoQuality: true });
      await engine.init();

      (engine as any).lastFrameTime = 0;

      // Phase 1: Low FPS for ~3 seconds to trigger reduction
      let now = 0;
      (engine as any).loop(now);
      now += 50;
      for (let i = 0; i < 80; i++) {
        (engine as any).loop(now);
        now += 50;
      }

      // Verify quality dropped
      expect(engine.getQualityLevel()).toBe(0.75);

      // Phase 2: Healthy FPS for recovery (recovery is 2x speed)
      for (let i = 0; i < 300; i++) {
        (engine as any).loop(now);
        now += 16;
      }

      expect(engine.getQualityLevel()).toBe(1);
    });
  });

  describe('resize', () => {
    it('resize event triggers renderer and camera update', async () => {
      engine = new HologramEngine(canvas);
      await engine.init();

      const renderer = (engine as any).renderer;
      const setSizeSpy = vi.spyOn(renderer, 'setSize');

      // Trigger resize
      Object.defineProperty(canvas, 'clientWidth', { value: 300 });
      Object.defineProperty(canvas, 'clientHeight', { value: 150 });
      window.dispatchEvent(new Event('resize'));

      expect(setSizeSpy).toHaveBeenCalledWith(300, 150, false);
    });

    it('resize without initialized engine is a no-op', () => {
      engine = new HologramEngine(canvas);
      expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
    });
  });
});
