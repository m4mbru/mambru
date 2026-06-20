import { describe, it, expect } from 'vitest';
import { BufferGeometry, BufferAttribute } from 'three';
import {
  createParticleData,
  morphToStyle,
  snapToStyle,
  type ParticleStyle,
} from './particles';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeMockGeometry(positionCount: number): BufferGeometry {
  const pos = new Float32Array(positionCount * 3);
  for (let i = 0; i < positionCount * 3; i++) {
    pos[i] = Math.random() * 2 - 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  return geometry;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('createParticleData', () => {
  it('creates geometry with position, color, and size attributes', () => {
    const data = createParticleData();

    expect(data.geometry).toBeInstanceOf(BufferGeometry);
    expect(data.geometry.attributes.position).toBeDefined();
    expect(data.geometry.attributes.color).toBeDefined();
    expect(data.geometry.attributes.size).toBeDefined();
  });

  it('creates 6000 particles', () => {
    const data = createParticleData();
    const pos = data.geometry.attributes.position.array as Float32Array;
    expect(pos.length).toBe(6000 * 3);
  });

  it('has morph targets for all 5 styles', () => {
    const styles: ParticleStyle[] = ['woman1', 'woman2', 'man1', 'man2', 'sphere'];
    const data = createParticleData();

    for (const style of styles) {
      expect(data.morphTargets[style]).toBeDefined();
      expect(data.morphTargets[style].length).toBe(6000 * 3);
    }
  });

  it('has all 5 styles listed', () => {
    const data = createParticleData();
    expect(data.styles).toEqual(['woman1', 'woman2', 'man1', 'man2', 'sphere']);
  });

  it('defaults to woman1 style', () => {
    const data = createParticleData();
    expect(data.defaultStyle).toBe('woman1');
  });

  it('generates different positions for each style', () => {
    const data = createParticleData();
    // Compare woman1 vs sphere (they should be very different)
    const woman1 = data.morphTargets.woman1;
    const sphere = data.morphTargets.sphere;
    let diffCount = 0;
    for (let i = 0; i < woman1.length; i++) {
      if (Math.abs(woman1[i] - sphere[i]) > 0.01) diffCount++;
    }
    // At least 90% of particles should differ
    expect(diffCount).toBeGreaterThan(woman1.length * 0.9);
  });

  it('woman2 differs from woman1', () => {
    const data = createParticleData();
    const woman1 = data.morphTargets.woman1;
    const woman2 = data.morphTargets.woman2;
    let diffCount = 0;
    for (let i = 0; i < woman1.length; i++) {
      if (Math.abs(woman1[i] - woman2[i]) > 0.01) diffCount++;
    }
    // Some particles should differ due to the hip offset
    expect(diffCount).toBeGreaterThan(0);
  });

  it('man2 differs from man1', () => {
    const data = createParticleData();
    const man1 = data.morphTargets.man1;
    const man2 = data.morphTargets.man2;
    let diffCount = 0;
    for (let i = 0; i < man1.length; i++) {
      if (Math.abs(man1[i] - man2[i]) > 0.01) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });
});

describe('morphToStyle', () => {
  it('lerps positions toward target', () => {
    const count = 100;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    // Set all target positions to 0.5
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    const initial = new Float32Array(geometry.attributes.position.array as Float32Array);
    morphToStyle(geometry, target, 1.0); // progress=1, clamped to 0.05 per frame

    const current = geometry.attributes.position.array as Float32Array;
    let moved = false;
    for (let i = 0; i < count * 3; i++) {
      if (Math.abs(current[i] - initial[i]) > 0.001) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  it('never overshoots target positions', () => {
    const count = 100;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    // Apply morph many times (simulating many frames)
    for (let frame = 0; frame < 200; frame++) {
      morphToStyle(geometry, target, 0.05);
    }

    const current = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count * 3; i++) {
      expect(current[i]).toBeCloseTo(target[i], 5);
    }
  });

  it('marks position attribute as needing update', () => {
    const count = 10;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    geometry.attributes.position.needsUpdate = false;
    morphToStyle(geometry, target, 0.03);
    expect(geometry.attributes.position.needsUpdate).toBe(true);
  });

  it('handles small progress correctly', () => {
    const count = 100;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    const initial = new Float32Array(geometry.attributes.position.array as Float32Array);
    morphToStyle(geometry, target, 0.01);

    const current = geometry.attributes.position.array as Float32Array;
    let anyChanged = false;
    for (let i = 0; i < count * 3; i++) {
      if (Math.abs(current[i] - initial[i]) > 0) {
        anyChanged = true;
        break;
      }
    }
    expect(anyChanged).toBe(true);
  });
});

describe('snapToStyle', () => {
  it('immediately sets positions to target', () => {
    const count = 100;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.42;

    snapToStyle(geometry, target);

    const current = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count * 3; i++) {
      expect(current[i]).toBe(0.42);
    }
  });

  it('marks position attribute as needing update', () => {
    const count = 10;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    geometry.attributes.position.needsUpdate = false;
    snapToStyle(geometry, target);
    expect(geometry.attributes.position.needsUpdate).toBe(true);
  });

  it('does not change position count', () => {
    const count = 100;
    const geometry = makeMockGeometry(count);
    const target = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) target[i] = 0.5;

    snapToStyle(geometry, target);

    const pos = geometry.attributes.position.array as Float32Array;
    expect(pos.length).toBe(count * 3);
  });
});
