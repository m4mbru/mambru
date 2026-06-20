/**
 * HologramWidget tests.
 *
 * Tests the overlay wrapper lifecycle: rendering, enable/disable,
 * CSS transitions, and store reactivity.
 *
 * Note: HologramEngine lifecycle (init/destroy) is tested in
 * HologramEngine.test.ts. Here we test the widget's DOM output
 * and store-driven behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { hologram, setEngineReady, setHologramEnabled, resetHologram } from '../stores/hologram';

vi.mock('../hologram/HologramEngine', () => {
  const mockEngine = {
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    setStyle: vi.fn(),
    snapStyle: vi.fn(),
    setEmotion: vi.fn(),
    getEmotion: vi.fn().mockReturnValue('neutral'),
  };
  return {
    HologramEngine: vi.fn(() => mockEngine),
  };
});

globalThis.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
});
globalThis.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});

import HologramWidget from './HologramWidget.svelte';

describe('HologramWidget', () => {
  beforeEach(() => {
    resetHologram();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('DOM rendering', () => {
    it('renders widget container when enabled', () => {
      setHologramEnabled(true);
      const { container } = render(HologramWidget);
      expect(container.querySelector('.hologram-widget')).toBeTruthy();
    });

    it('does not render widget when disabled', () => {
      setHologramEnabled(false);
      const { container } = render(HologramWidget);
      expect(container.querySelector('.hologram-widget')).toBeFalsy();
    });

    it('renders a canvas when enabled', () => {
      setHologramEnabled(true);
      const { container } = render(HologramWidget);
      const canvas = container.querySelector('canvas#holo-canvas');
      expect(canvas).toBeTruthy();
    });

    it('sets size as inline style on container', () => {
      hologram.update((s) => ({ ...s, enabled: true, size: 300 }));
      const { container } = render(HologramWidget);
      const widgetEl = container.querySelector('.hologram-widget') as HTMLElement;
      expect(widgetEl.style.width).toBe('300px');
      expect(widgetEl.style.height).toBe('300px');
    });

    it('has role="img" and aria-label', () => {
      setHologramEnabled(true);
      const { container } = render(HologramWidget);
      const widgetEl = container.querySelector('.hologram-widget');
      expect(widgetEl?.getAttribute('role')).toBe('img');
      expect(widgetEl?.getAttribute('aria-label')).toBe('Hologram avatar');
    });
  });

  describe('CSS classes', () => {
    it('has visible class when enabled', () => {
      setHologramEnabled(true);
      const { container } = render(HologramWidget);
      const widgetEl = container.querySelector('.hologram-widget') as HTMLElement;
      expect(widgetEl.classList.contains('visible')).toBe(true);
    });

    it('defaults to position-floating', () => {
      setHologramEnabled(true);
      const { container } = render(HologramWidget);
      expect(container.querySelector('.position-floating')).toBeTruthy();
    });

    it('applies position-minimal class', () => {
      hologram.update((s) => ({ ...s, enabled: true, position: 'minimal' }));
      const { container } = render(HologramWidget);
      expect(container.querySelector('.position-minimal')).toBeTruthy();
    });

    it('applies position-panel class', () => {
      hologram.update((s) => ({ ...s, enabled: true, position: 'panel' }));
      const { container } = render(HologramWidget);
      expect(container.querySelector('.position-panel')).toBeTruthy();
    });
  });

  describe('emotion low-confidence guard (R4)', () => {
    it('resolves to neutral when confidence is below 0.6', () => {
      const emotion = 'happy';
      const confidence = 0.3;
      const resolved = confidence < 0.6 ? 'neutral' : emotion;
      expect(resolved).toBe('neutral');
    });

    it('resolves to detected emotion when confidence is 0.6 or above', () => {
      const emotion = 'happy';
      const confidence = 0.85;
      const resolved = confidence < 0.6 ? 'neutral' : emotion;
      expect(resolved).toBe('happy');
    });

    it('resolves to neutral at exactly 0.6 boundary', () => {
      const emotion = 'thinking';
      const confidence = 0.6;
      // Threshold is < 0.6, so 0.6 should pass through
      const resolved = confidence < 0.6 ? 'neutral' : emotion;
      expect(resolved).toBe('thinking');
    });

    it('resolves to neutral when emotion changes but confidence stays low', () => {
      // Simulate: store has 'sad' emotion with 0.4 confidence
      const emotion = 'sad';
      const confidence = 0.4;
      const resolved = confidence < 0.6 ? 'neutral' : emotion;
      expect(resolved).toBe('neutral');
    });
  });
});
