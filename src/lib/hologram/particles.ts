/**
 * Particle geometry and morph targets for the holographic avatar.
 *
 * Each "style" is a different set of vertex positions forming a silhouette
 * (woman, man, sphere, etc.). Morphing between styles lerps each particle
 * from its current position to the target.
 *
 * ~6000 particles per avatar. The humanoid silhouettes are generated
 * procedurally from parametric equations (no external mesh required).
 */

import { BufferGeometry, BufferAttribute, DynamicDrawUsage } from 'three';

// ─── Types ───────────────────────────────────────────────────────────

export type ParticleStyle = 'woman1' | 'woman2' | 'man1' | 'man2' | 'sphere';

export interface MorphTarget {
  name: string;
  positions: Float32Array;
}

export interface ParticleData {
  geometry: BufferGeometry;
  morphTargets: Record<ParticleStyle, Float32Array>;
  styles: ParticleStyle[];
  defaultStyle: ParticleStyle;
}

// ─── Constants ────────────────────────────────────────────────────────

const PARTICLE_COUNT = 6000;

// ─── Generators ──────────────────────────────────────────────────────

/** Minimal placeholder — tiny subtle ring, no distracting shape. */
function generateWomanSilhouette(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.01 + 0.02 * Math.random();
    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  return pos;
}

/** Generate random points within a male silhouette (broader shoulders). */
function generateManSilhouette(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const y = (t - 0.5) * 2;
    const absY = Math.abs(y);

    let radius = 0.35;
    if (absY < 0.2) {
      radius = 0.16 * (1 - absY / 0.2);
    } else if (absY < 0.45) {
      // Broader shoulders
      const shT = (absY - 0.2) / 0.25;
      radius = 0.16 + 0.35 * (1 - shT * 0.5);
    } else if (absY < 0.7) {
      // Taper to waist
      const wT = (absY - 0.45) / 0.25;
      radius = 0.16 + 0.30 * (1 - wT * 0.7);
    } else {
      radius = 0.14 * (1 - (absY - 0.7) / 0.3);
    }

    const noise = 0.6 + 0.4 * Math.random();
    const angle = Math.random() * Math.PI * 2;
    const r = radius * noise * 0.9;

    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(angle) * r * 0.3;
  }
  return pos;
}

/** Generate a sphere of particles. */
function generateSphere(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.5 * Math.cbrt(Math.random()); // uniform volume distribution

    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return pos;
}

/** Minimal placeholder — same tiny ring. */
function generateWomanSilhouette2(count: number): Float32Array {
  return generateWomanSilhouette(count);
}

/** Generate a slightly different man silhouette for man2. */
function generateManSilhouette2(count: number): Float32Array {
  const base = generateManSilhouette(count);
  // Slightly wider stance
  for (let i = 0; i < count; i++) {
    const y = base[i * 3 + 1];
    if (y < -0.6) {
      base[i * 3] *= 1.3;
    }
  }
  return base;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createParticleData(): ParticleData {
  const defaultPos = generateWomanSilhouette(PARTICLE_COUNT);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(defaultPos, 3));

  // Per-particle colors: bright cyan — always visible
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const bright = 0.6 + 0.4 * Math.random();
    colors[i * 3] = 0.5 * bright;
    colors[i * 3 + 1] = 0.7 * bright;
    colors[i * 3 + 2] = 1.0 * bright;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  (geometry.attributes.color as BufferAttribute).setUsage(DynamicDrawUsage);

  // Per-particle size variation
  const sizes = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    sizes[i] = 0.8 + 0.6 * Math.random();
  }
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));

  const morphTargets: Record<ParticleStyle, Float32Array> = {
    woman1: defaultPos,
    woman2: generateWomanSilhouette2(PARTICLE_COUNT),
    man1: generateManSilhouette(PARTICLE_COUNT),
    man2: generateManSilhouette2(PARTICLE_COUNT),
    sphere: generateSphere(PARTICLE_COUNT),
  };

  return {
    geometry,
    morphTargets,
    styles: ['woman1', 'woman2', 'man1', 'man2', 'sphere'],
    defaultStyle: 'woman1',
  };
}

/** Lerp particle positions toward a target style. Mutates geometry in-place. */
export function morphToStyle(
  geometry: BufferGeometry,
  target: Float32Array,
  progress: number, // 0–1
): void {
  const pos = geometry.attributes.position.array as Float32Array;
  const len = pos.length;
  for (let i = 0; i < len; i++) {
    pos[i] += (target[i] - pos[i]) * Math.min(progress, 0.05);
  }
  geometry.attributes.position.needsUpdate = true;
}

/** Immediately snap to target positions. */
export function snapToStyle(
  geometry: BufferGeometry,
  target: Float32Array,
): void {
  const pos = geometry.attributes.position.array as Float32Array;
  pos.set(target);
  geometry.attributes.position.needsUpdate = true;
}
