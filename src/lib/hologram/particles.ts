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

import { BufferGeometry, BufferAttribute } from 'three';

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

/** Generate random points within a female silhouette (hourglass shape). */
function generateWomanSilhouette(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random(); // 0–1 vertical
    const y = (t - 0.5) * 2; // -1..1
    const absY = Math.abs(y);

    // Hourglass profile: narrow waist, wider hips/shoulders
    let radius = 0.35;
    if (absY < 0.2) {
      // Head
      radius = 0.15 * (1 - absY / 0.2);
    } else if (absY < 0.5) {
      // Torso — narrow at waist (y ≈ 0.3)
      const waistT = (absY - 0.2) / 0.3;
      radius = 0.15 + 0.25 * (1 - waistT) + 0.05 * Math.sin(waistT * Math.PI);
    } else if (absY < 0.75) {
      // Hips
      const hipT = (absY - 0.5) / 0.25;
      radius = 0.15 + 0.25 * (1 - Math.abs(hipT - 0.5) * 0.6);
    } else {
      // Legs
      const legT = (absY - 0.75) / 0.25;
      radius = 0.12 * (1 - legT);
    }

    // Add noise for organic feel
    const noise = 0.6 + 0.4 * Math.random();
    const angle = Math.random() * Math.PI * 2;
    const r = radius * noise * 0.9;

    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(angle) * r * 0.3; // Flatten on Z
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

/** Generate a slightly different woman silhouette for woman2. */
function generateWomanSilhouette2(count: number): Float32Array {
  const base = generateWomanSilhouette(count);
  // Shift some weight to one hip for a subtle pose difference
  for (let i = 0; i < count; i++) {
    const y = base[i * 3 + 1];
    const absY = Math.abs(y);
    if (absY > 0.2 && absY < 0.6) {
      base[i * 3] += 0.05 * Math.sin(y * Math.PI * 2);
    }
  }
  return base;
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

  // Per-particle base colors (random pastel)
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const hue = 0.5 + 0.2 * Math.random(); // cyan-blue range
    colors[i * 3] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(hue * Math.PI * 2));
    colors[i * 3 + 1] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((hue + 0.33) * Math.PI * 2));
    colors[i * 3 + 2] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((hue + 0.67) * Math.PI * 2));
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  (geometry.attributes.color as BufferAttribute).setUsage('DynamicDraw');

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
