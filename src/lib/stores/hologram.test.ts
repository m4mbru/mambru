import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  hologram,
  setHologramEnabled,
  setHologramStyle,
  setHologramSize,
  setHologramPosition,
  setHologramEmotion,
  setHologramDancing,
  setEngineReady,
  resetHologram,
} from './hologram';

describe('hologram store', () => {
  beforeEach(() => {
    resetHologram();
  });

  it('starts with default state', () => {
    const state = get(hologram);
    expect(state.enabled).toBe(true);
    expect(state.style).toBe('sphere');
    expect(state.size).toBe(200);
    expect(state.position).toBe('floating');
    expect(state.emotion).toBe('neutral');
    expect(state.emotionConfidence).toBe(1.0);
    expect(state.isDancing).toBe(false);
    expect(state.engineReady).toBe(false);
  });

  it('sets enabled state', () => {
    setHologramEnabled(false);
    expect(get(hologram).enabled).toBe(false);

    setHologramEnabled(true);
    expect(get(hologram).enabled).toBe(true);
  });

  it('sets style', () => {
    setHologramStyle('woman1');
    expect(get(hologram).style).toBe('woman1');

    setHologramStyle('sphere');
    expect(get(hologram).style).toBe('sphere');
  });

  it('sets size within valid range', () => {
    setHologramSize(300);
    expect(get(hologram).size).toBe(300);

    setHologramSize(100);
    expect(get(hologram).size).toBe(100);

    setHologramSize(400);
    expect(get(hologram).size).toBe(400);
  });

  it('clamps size to 100–400 range', () => {
    setHologramSize(50);
    expect(get(hologram).size).toBe(100);

    setHologramSize(999);
    expect(get(hologram).size).toBe(400);
  });

  it('sets position', () => {
    setHologramPosition('minimal');
    expect(get(hologram).position).toBe('minimal');

    setHologramPosition('panel');
    expect(get(hologram).position).toBe('panel');
  });

  it('sets emotion and confidence', () => {
    setHologramEmotion('happy', 0.85);
    const state = get(hologram);
    expect(state.emotion).toBe('happy');
    expect(state.emotionConfidence).toBe(0.85);

    setHologramEmotion('sad', 0.6);
    expect(get(hologram).emotion).toBe('sad');
    expect(get(hologram).emotionConfidence).toBe(0.6);
  });

  it('sets dancing state', () => {
    setHologramDancing(true);
    expect(get(hologram).isDancing).toBe(true);

    setHologramDancing(false);
    expect(get(hologram).isDancing).toBe(false);
  });

  it('sets engine ready state', () => {
    setEngineReady(true);
    expect(get(hologram).engineReady).toBe(true);

    setEngineReady(false);
    expect(get(hologram).engineReady).toBe(false);
  });

  it('resetHologram returns to initial state', () => {
    setHologramEnabled(false);
    setHologramStyle('man1');
    setHologramSize(350);
    setHologramPosition('panel');
    setHologramEmotion('happy', 0.9);
    setHologramDancing(true);
    setEngineReady(true);

    resetHologram();

    const state = get(hologram);
    expect(state.enabled).toBe(true);
    expect(state.style).toBe('sphere');
    expect(state.size).toBe(200);
    expect(state.position).toBe('floating');
    expect(state.emotion).toBe('neutral');
    expect(state.emotionConfidence).toBe(1.0);
    expect(state.isDancing).toBe(false);
    expect(state.engineReady).toBe(false);
  });

  it('maintains other fields when updating a single field', () => {
    setHologramStyle('woman2');
    setHologramSize(300);
    setHologramEmotion('thinking', 0.7);

    // Now change only enabled
    setHologramEnabled(false);

    const state = get(hologram);
    expect(state.style).toBe('woman2'); // unchanged
    expect(state.size).toBe(300); // unchanged
    expect(state.emotion).toBe('thinking'); // unchanged
    expect(state.emotionConfidence).toBe(0.7); // unchanged
    expect(state.enabled).toBe(false); // updated
  });
});
