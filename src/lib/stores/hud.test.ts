import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hudState, expandPanel, collapsePanel } from './hud';
import { get } from 'svelte/store';

describe('HudState store', () => {
  beforeEach(() => {
    hudState.set({ mode: 'orbital', activePanel: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in orbital mode with no active panel', () => {
    const state = get(hudState);
    expect(state.mode).toBe('orbital');
    expect(state.activePanel).toBeNull();
  });

  describe('expandPanel', () => {
    it('transitions from orbital to expanding then expanded', () => {
      expandPanel('chat');

      // Immediately after calling — should be expanding
      let state = get(hudState);
      expect(state.mode).toBe('expanding');
      expect(state.activePanel).toBe('chat');

      // After 300ms — should become expanded
      vi.advanceTimersByTime(300);
      state = get(hudState);
      expect(state.mode).toBe('expanded');
      expect(state.activePanel).toBe('chat');
    });

    it('only sets collapsing when expandPanel called on already-expanded panel (UI calls collapsePanel for toggle)', () => {
      expandPanel('chat');
      vi.advanceTimersByTime(300);
      expect(get(hudState).mode).toBe('expanded');

      // expandPanel on same panel sets collapsing but doesn't schedule return
      expandPanel('chat');
      expect(get(hudState).mode).toBe('collapsing');

      // No auto-return — stays collapsing (UI calls collapsePanel for proper toggle)
      vi.advanceTimersByTime(250);
      expect(get(hudState).mode).toBe('collapsing');
    });

    it('expands a different panel without collapsing the current one', () => {
      expandPanel('chat');
      vi.advanceTimersByTime(300);
      expect(get(hudState).activePanel).toBe('chat');

      expandPanel('settings');
      expect(get(hudState).mode).toBe('expanding');
      expect(get(hudState).activePanel).toBe('settings');

      vi.advanceTimersByTime(300);
      expect(get(hudState).mode).toBe('expanded');
      expect(get(hudState).activePanel).toBe('settings');
    });
  });

  describe('collapsePanel', () => {
    it('collapses an expanded panel back to orbital', () => {
      expandPanel('chat');
      vi.advanceTimersByTime(300);
      expect(get(hudState).mode).toBe('expanded');

      collapsePanel();
      expect(get(hudState).mode).toBe('collapsing');

      vi.advanceTimersByTime(250);
      const state = get(hudState);
      expect(state.mode).toBe('orbital');
      expect(state.activePanel).toBeNull();
    });

    it('does nothing if already orbital', () => {
      collapsePanel();
      expect(get(hudState).mode).toBe('orbital');

      vi.advanceTimersByTime(250);
      expect(get(hudState).mode).toBe('orbital');
    });

    it('does nothing if already collapsing', () => {
      expandPanel('chat');
      vi.advanceTimersByTime(300);

      collapsePanel();
      expect(get(hudState).mode).toBe('collapsing');

      // Call collapse again while already collapsing
      collapsePanel();
      expect(get(hudState).mode).toBe('collapsing'); // stays collapsing
    });
  });
});
