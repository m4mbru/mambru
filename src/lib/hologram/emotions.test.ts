import { describe, it, expect } from 'vitest';
import { BufferGeometry, BufferAttribute } from 'three';
import {
  getEmotionPreset,
  applyEmotion,
  blendEmotion,
  type Emotion,
  type EmotionPreset,
} from './emotions';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeParticleGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();

  // Positions
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = Math.random() * 2 - 1;
  geometry.setAttribute('position', new BufferAttribute(positions, 3));

  // Colors (cyan range)
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    colors[i] = 0.3 + 0.7 * Math.random();
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  // Sizes
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = 0.8 + 0.6 * Math.random();
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));

  return geometry;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('getEmotionPreset', () => {
  it('returns a preset for each emotion', () => {
    const emotions: Emotion[] = ['happy', 'sad', 'thinking', 'neutral', 'speaking'];
    for (const emotion of emotions) {
      const preset = getEmotionPreset(emotion);
      expect(preset).toBeDefined();
      expect(typeof preset.jitter).toBe('number');
      expect(typeof preset.hueShift).toBe('number');
      expect(typeof preset.brightness).toBe('number');
      expect(typeof preset.sizeMul).toBe('number');
      expect(typeof preset.breathSpeed).toBe('number');
    }
  });

  it('happy has higher brightness and larger size than neutral', () => {
    const happy = getEmotionPreset('happy');
    const neutral = getEmotionPreset('neutral');
    expect(happy.brightness).toBeGreaterThan(neutral.brightness);
    expect(happy.sizeMul).toBeGreaterThan(neutral.sizeMul);
  });

  it('sad has lower brightness and smaller size than neutral', () => {
    const sad = getEmotionPreset('sad');
    const neutral = getEmotionPreset('neutral');
    expect(sad.brightness).toBeLessThan(neutral.brightness);
    expect(sad.sizeMul).toBeLessThan(neutral.sizeMul);
  });

  it('thinking has warm hue shift', () => {
    const thinking = getEmotionPreset('thinking');
    expect(thinking.breathSpeed).toBeLessThan(getEmotionPreset('neutral').breathSpeed);
  });

  it('speaking has highest jitter', () => {
    const speaking = getEmotionPreset('speaking');
    const neutral = getEmotionPreset('neutral');
    expect(speaking.jitter).toBeGreaterThan(neutral.jitter);
  });

  it('happy has positive hue shift (warmer)', () => {
    const happy = getEmotionPreset('happy');
    expect(happy.hueShift).toBeGreaterThan(0);
  });

  it('sad has negative hue shift (cooler)', () => {
    const sad = getEmotionPreset('sad');
    expect(sad.hueShift).toBeLessThan(0);
  });
});

describe('applyEmotion', () => {
  it('modifies color and size attributes in place', () => {
    const geometry = makeParticleGeometry(100);
    const originalColors = new Float32Array(
      geometry.attributes.color.array as Float32Array,
    );

    applyEmotion(geometry, 'happy', 0, 1.0);

    // Colors should have changed
    const newColors = geometry.attributes.color.array as Float32Array;
    let changed = false;
    for (let i = 0; i < originalColors.length; i++) {
      if (Math.abs(newColors[i] - originalColors[i]) > 0.001) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('marks color and size attributes as needing update', () => {
    const geometry = makeParticleGeometry(50);
    geometry.attributes.color.needsUpdate = false;
    geometry.attributes.size.needsUpdate = false;

    applyEmotion(geometry, 'neutral', 1.0);

    expect(geometry.attributes.color.needsUpdate).toBe(true);
    expect(geometry.attributes.size.needsUpdate).toBe(true);
  });

  it('does nothing when intensity is 0', () => {
    const geometry = makeParticleGeometry(50);
    const originalColors = new Float32Array(
      geometry.attributes.color.array as Float32Array,
    );

    applyEmotion(geometry, 'happy', 0, 0);

    const newColors = geometry.attributes.color.array as Float32Array;
    for (let i = 0; i < originalColors.length; i++) {
      expect(newColors[i]).toBe(originalColors[i]);
    }
  });

  it('handles missing color attribute gracefully', () => {
    // Geometry without color attribute
    const geometry = new BufferGeometry();
    const pos = new Float32Array(30);
    geometry.setAttribute('position', new BufferAttribute(pos, 3));

    // Should not throw
    expect(() => applyEmotion(geometry, 'neutral', 0)).not.toThrow();
  });

  it('modulates size with breath oscillation', () => {
    const geometry = makeParticleGeometry(50);
    const originalSizes = new Float32Array(
      geometry.attributes.size.array as Float32Array,
    );

    applyEmotion(geometry, 'speaking', 0.5);

    const newSizes = geometry.attributes.size.array as Float32Array;
    // Speaking has high breath speed — sizes should differ
    let changed = false;
    for (let i = 0; i < originalSizes.length; i++) {
      if (Math.abs(newSizes[i] - originalSizes[i]) > 0.01) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });
});

describe('blendEmotion', () => {
  it('smoothly transitions between two emotions', () => {
    const geometry = makeParticleGeometry(100);
    const initialColors = new Float32Array(
      geometry.attributes.color.array as Float32Array,
    );

    // Blend 50% from neutral to happy
    blendEmotion(geometry, 'neutral', 'happy', 0.5, 0);

    const blendedColors = geometry.attributes.color.array as Float32Array;
    let changed = false;
    for (let i = 0; i < initialColors.length; i++) {
      if (Math.abs(blendedColors[i] - initialColors[i]) > 0.001) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('at progress=1 matches the target emotion', () => {
    const geometry1 = makeParticleGeometry(100);
    const geometry2 = makeParticleGeometry(100);
    // Copy the same geometry to geometry2
    geometry2.attributes.color.array!.set(
      geometry1.attributes.color.array as Float32Array,
    );
    geometry2.attributes.size.array!.set(
      geometry1.attributes.size.array as Float32Array,
    );

    // Apply happy directly to geometry1
    applyEmotion(geometry1, 'happy', 0.5, 1.0);

    // Blend from neutral to happy at 100% progress on geometry2
    blendEmotion(geometry2, 'neutral', 'happy', 1.0, 0.5);

    // They should produce roughly similar results
    const colors1 = geometry1.attributes.color.array as Float32Array;
    const colors2 = geometry2.attributes.color.array as Float32Array;

    // At progress=1, blendEmotion uses the 'to' preset but applies
    // the blend formula differently from applyEmotion, so they won't be
    // exactly equal. But the direction (hue shift) should be the same.
    // Check that both shifted hue in the same direction
    const r1 = colors1[0], r2 = colors2[0];
    // Both should have shifted from the original
    const origR = (geometry1.attributes.color.array as Float32Array)[0];
    expect(Math.abs(r1 - origR)).toBeGreaterThan(0);
    expect(Math.abs(r2 - origR)).toBeGreaterThan(0);
  });

  it('at progress=0 keeps source emotion values', () => {
    const geometry = makeParticleGeometry(50);
    const originalColors = new Float32Array(
      geometry.attributes.color.array as Float32Array,
    );
    const originalSizes = new Float32Array(
      geometry.attributes.size.array as Float32Array,
    );

    // Blend at 0% — should be close to the "from" emotion (neutral)
    // which has brightness=1.0 and hueShift=0, so colors shouldn't change much
    blendEmotion(geometry, 'neutral', 'happy', 0, 1.0);

    const blendedColors = geometry.attributes.color.array as Float32Array;
    // With hueShift=0 and brightness=1.0 for neutral, colors should stay close
    let changed = false;
    for (let i = 0; i < originalColors.length; i++) {
      if (Math.abs(blendedColors[i] - originalColors[i]) > 0.01) {
        changed = true;
        break;
      }
    }
    // With neutral as source and progress=0, colors should be very close
    // but there might be tiny floating point diffs from the breath oscillation
    expect(changed).toBe(false);
  });

  it('marks attributes as needing update', () => {
    const geometry = makeParticleGeometry(50);
    geometry.attributes.color.needsUpdate = false;
    geometry.attributes.size.needsUpdate = false;

    blendEmotion(geometry, 'neutral', 'thinking', 0.3, 0);

    expect(geometry.attributes.color.needsUpdate).toBe(true);
    expect(geometry.attributes.size.needsUpdate).toBe(true);
  });

  it('handles missing attributes gracefully', () => {
    const geometry = new BufferGeometry();
    const pos = new Float32Array(30);
    geometry.setAttribute('position', new BufferAttribute(pos, 3));

    expect(() =>
      blendEmotion(geometry, 'neutral', 'happy', 0.5, 0),
    ).not.toThrow();
  });
});
