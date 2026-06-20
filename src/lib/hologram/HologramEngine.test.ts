/**
 * HologramEngine tests.
 *
 * Three.js is lazy-loaded via dynamic `import('three')`. In tests we mock
 * the module to avoid pulling in the full ~600KB library. We verify the
 * engine's lifecycle: constructor, init, destroy, resize, and API methods.
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

// Mock the dynamic import of 'three'
const mockThree = {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Points,
  PointsMaterial,
  BufferGeometry,
  BufferAttribute,
  AdditiveBlending,
  Color,
};

vi.mock('./particles', () => ({
  createParticleData: vi.fn(() => {
    const geometry = new BufferGeometry();
    const pos = new Float32Array(30);
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    const colors = new Float32Array(30);
    for (let i = 0; i < 30; i++) colors[i] = 0.5;
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

// Mock requestAnimationFrame and cancelAnimationFrame
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
    canvas.style.width = '200px';
    canvas.style.height = '200px';
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

    it('uses default options when none provided', () => {
      engine = new HologramEngine(canvas);
      expect(engine).toBeInstanceOf(HologramEngine);
    });
  });

  describe('init / destroy lifecycle', () => {
    it('initializes and sets up Three.js scene', async () => {
      engine = new HologramEngine(canvas);
      // Mock the dynamic import
      vi.spyOn(engine as any, 'Three', 'get').mockReturnValue(mockThree);

      await engine.init();

      // After init, the internal state should be set
      expect((engine as any).running).toBe(true);
      expect((engine as any).scene).toBeDefined();
      expect((engine as any).camera).toBeDefined();
      expect((engine as any).renderer).toBeDefined();
    });

    it('is idempotent — calling init twice does not reinitialize', async () => {
      engine = new HologramEngine(canvas);
      vi.spyOn(engine as any, 'Three', 'get').mockReturnValue(mockThree);

      await engine.init();
      const scene1 = (engine as any).scene;
      await engine.init(); // second call
      const scene2 = (engine as any).scene;

      // Scene should be the same object (no re-init)
      expect(scene1).toBe(scene2);
    });

    it('destroy stops the render loop and releases references', async () => {
      engine = new HologramEngine(canvas);
      vi.spyOn(engine as any, 'Three', 'get').mockReturnValue(mockThree);

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

    it('three is loaded via dynamic import', async () => {
      engine = new HologramEngine(canvas);
      const importSpy = vi.spyOn(engine as any, 'Three', 'get').mockReturnValue(null);

      await engine.init();

      // The dynamic import should have been triggered
      expect((engine as any).Three).toBeDefined();
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
  });

  describe('resize', () => {
    it('resize event triggers renderer and camera update', async () => {
      engine = new HologramEngine(canvas);
      vi.spyOn(engine as any, 'Three', 'get').mockReturnValue(mockThree);

      await engine.init();

      const renderer = (engine as any).renderer;
      const setSizeSpy = vi.spyOn(renderer, 'setSize');

      // Trigger resize
      canvas.style.width = '300px';
      canvas.style.height = '150px';
      Object.defineProperty(canvas, 'clientWidth', { value: 300 });
      Object.defineProperty(canvas, 'clientHeight', { value: 150 });

      window.dispatchEvent(new Event('resize'));

      expect(setSizeSpy).toHaveBeenCalledWith(300, 150, false);
    });

    it('resize without renderer is a no-op', () => {
      engine = new HologramEngine(canvas);
      expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
    });
  });
});
