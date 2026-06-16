/**
 * FemaleHead — Structured particle surface forming a female head profile.
 *
 * Uses Fibonacci sphere distribution for uniform particle placement
 * on a parametric head surface. Head radius varies by latitude to
 * create a recognizable profile: wide cheekbones, narrow chin, dome crown.
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';

const SCALE = 0.45;
const PHI = Math.PI * (3 - Math.sqrt(5)); // golden angle

/**
 * Head radius profile by latitude (0=top, 1=bottom).
 * Exported so particles.ts can reuse the same profile.
 */
export function headRadius(normalized: number): number {
  if (normalized < 0.12) {
    const t = normalized / 0.12;
    return 0.65 * t;
  }
  if (normalized < 0.30) {
    const t = (normalized - 0.12) / 0.18;
    return 0.65 + 0.30 * Math.sin(t * Math.PI * 0.5);
  }
  if (normalized < 0.48) {
    const t = (normalized - 0.30) / 0.18;
    return 0.95 - 0.03 * t;
  }
  if (normalized < 0.65) {
    const t = (normalized - 0.48) / 0.17;
    return 0.92 - 0.30 * t;
  }
  if (normalized < 0.78) {
    const t = (normalized - 0.65) / 0.13;
    return 0.62 - 0.27 * t;
  }
  if (normalized < 0.88) {
    const t = (normalized - 0.78) / 0.10;
    return 0.35 - 0.12 * t;
  }
  const t = (normalized - 0.88) / 0.12;
  return 0.23 * (1 - t * 0.4);
}

/** Generate only positions (no colors) for use as a morph target in particles.ts. */
export function generateFemaleHeadPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtLat = Math.sqrt(1 - y * y);
    const theta = PHI * i;
    const lat = Math.acos(y);
    const normalized = lat / Math.PI;
    const frontness = Math.cos(theta);

    const profile = headRadius(normalized);
    const zFlat = 0.50 + 0.15 * (1 - normalized);

    // ── Nose bridge: wider angular range, more prominent ──
    let noseBump = 0;
    if (frontness > 0.3 && normalized > 0.28 && normalized < 0.52) {
      const nt = (normalized - 0.28) / 0.24;
      noseBump = 0.14 * Math.sin(nt * Math.PI);
      // Nose tip is sharper
      if (normalized > 0.40 && normalized < 0.52) {
        const tip = (normalized - 0.40) / 0.12;
        noseBump *= 0.7 + 0.3 * (1 - tip);
      }
    }

    // ── Eye sockets: indentations beside the nose bridge ──
    let eyeIndent = 0;
    if (frontness > -0.2 && frontness < 0.2 && normalized > 0.26 && normalized < 0.38) {
      const sideOffset = Math.abs(Math.sin(theta)); // left or right
      if (sideOffset > 0.15) {
        const et = (normalized - 0.26) / 0.12;
        const depth = 0.06 * Math.sin(et * Math.PI) * Math.min(1, (sideOffset - 0.15) * 4);
        eyeIndent = -depth;
      }
    }

    // ── Chin bump ──
    let chinBump = 0;
    if (frontness > 0.3 && normalized > 0.62 && normalized < 0.78) {
      const ct = (normalized - 0.62) / 0.16;
      chinBump = 0.06 * Math.sin(ct * Math.PI);
    }

    // ── Forehead slope: slight backward angle ──
    let foreheadAngle = 0;
    if (frontness > 0.3 && normalized > 0.08 && normalized < 0.25) {
      const ft = (normalized - 0.08) / 0.17;
      foreheadAngle = -0.03 * Math.sin(ft * Math.PI);
    }

    const noise = 0.98 + 0.04 * Math.random();
    const r = profile * noise;

    const px = r * radiusAtLat * Math.cos(theta) * SCALE;
    const py = y * SCALE;
    const pz = r * radiusAtLat * Math.sin(theta) * SCALE * zFlat;
    const bumpZ = (noseBump + chinBump + eyeIndent + foreheadAngle) * SCALE;

    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz + bumpZ;
  }

  return positions;
}

/**
 * Generate a 3D mesh geometry of a stylized human head with clear
 * facial features. Uses a radial-profile construction at each height
 * level — the cross-section interpolates between front/face radius,
 * side radius, and back/occiput radius, creating a naturally
 * asymmetric head silhouette.
 *
 * Facial features are applied as explicit large-scale displacements
 * (nose: conical wedge, eye sockets: deep pits, chin: forward ledge,
 *  mouth: horizontal crease, cheeks: lateral bulge).
 *
 * The style is deliberately geometric/exaggerated so features read
 * clearly on a holographic display with no textures.
 */
export function createHeadMeshGeometry(
  radialSegments = 40,
  heightSegments = 34,
): BufferGeometry {
  const S = 0.42;
  const positions: number[] = [];
  const indices: number[] = [];

  // ── Height profile keyframes ──────────────────────────────
  // At each v, defines [faceR, sideR, backR] as fraction of base scale.
  // faceR = Z-depth at front (smaller = flatter face)
  // sideR = width at sides
  // backR = Z-depth at back (larger = more occiput bulge)
  const profile: Array<{ v: number; face: number; side: number; back: number }> = [
    { v: 0.00, face: 0.55, side: 0.50, back: 0.55 },   // crown
    { v: 0.10, face: 0.75, side: 0.80, back: 0.85 },   // upper cranium
    { v: 0.20, face: 0.78, side: 0.95, back: 1.00 },   // mid cranium
    { v: 0.30, face: 0.65, side: 1.05, back: 1.05 },   // brow
    { v: 0.40, face: 0.58, side: 1.08, back: 1.05 },   // eyes (face flat, cheeks wide)
    { v: 0.50, face: 0.62, side: 1.02, back: 1.00 },   // nose
    { v: 0.58, face: 0.55, side: 0.95, back: 0.98 },   // mouth
    { v: 0.66, face: 0.48, side: 0.82, back: 0.88 },   // chin/jaw
    { v: 0.75, face: 0.40, side: 0.65, back: 0.68 },   // under jaw
    { v: 0.85, face: 0.38, side: 0.52, back: 0.55 },   // upper neck
    { v: 1.00, face: 0.38, side: 0.48, back: 0.50 },   // lower neck
  ];

  function getRadius(v: number, phi: number): number {
    // Interpolate keyframes for this height
    let fR = 0.5, sR = 0.5, bR = 0.5;
    for (let k = 0; k < profile.length - 1; k++) {
      const a = profile[k];
      const b = profile[k + 1];
      if (v >= a.v && v <= b.v) {
        const t = (v - a.v) / (b.v - a.v);
        // Smoothstep for organic blend
        const s = t * t * (3 - 2 * t);
        fR = a.face + (b.face - a.face) * s;
        sR = a.side + (b.side - a.side) * s;
        bR = a.back + (b.back - a.back) * s;
        break;
      }
    }

    // Map phi to quadrants and interpolate
    // 0=front, PI/2=side, PI=back, 3PI/2=side, 2PI=front
    const u = phi / (Math.PI * 2); // 0..1
    if (u < 0.25) {
      // front -> side
      const t = u / 0.25;
      return fR + (sR - fR) * (t * t * (3 - 2 * t));
    } else if (u < 0.5) {
      // side -> back
      const t = (u - 0.25) / 0.25;
      return sR + (bR - sR) * (t * t * (3 - 2 * t));
    } else if (u < 0.75) {
      // back -> side
      const t = (u - 0.5) / 0.25;
      return bR + (sR - bR) * (t * t * (3 - 2 * t));
    } else {
      // side -> front
      const t = (u - 0.75) / 0.25;
      return sR + (fR - sR) * (t * t * (3 - 2 * t));
    }
  }

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments;

    // Map v to spherical theta, but don't go all the way to PI
    // so the neck stays open (cylinder) instead of converging to a point
    const theta = v * Math.PI * 0.82;
    const yBase = Math.cos(theta) * S;
    const rLat = Math.sin(theta);
    const vNorm = v; // 0 top, 1 bottom, for feature targeting

    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const phi = u * Math.PI * 2;
      const cx = Math.cos(phi);  // frontness: +1 front, -1 back
      const sz = Math.sin(phi);
      const frontness = cx;
      const sideAbs = Math.abs(sz);

      // ── Base radius from profile ──────────────────────────
      const baseR = getRadius(vNorm, phi);

      // Convert to Cartesian using spherical projection
      let px = sz * baseR * rLat * S;
      let py = yBase;
      let pz = cx * baseR * rLat * S;

      // ── Facial features ────────────────────────────────────
      // All applied as Z (depth) and X (width) displacements
      // on the front hemisphere only.
      // Values are deliberately strong for stylized readability.

      // -- Forehead: sloping backward --
      if (frontness > 0.1 && vNorm > 0.08 && vNorm < 0.26) {
        const ft = (vNorm - 0.08) / 0.18;
        pz -= 0.09 * Math.sin(ft * Math.PI) * S;
      }

      // -- Brow ridge --
      if (frontness > 0.1 && vNorm > 0.24 && vNorm < 0.34) {
        const bt = (vNorm - 0.24) / 0.10;
        pz += 0.055 * Math.sin(bt * Math.PI) * S;
      }

      // -- EYE SOCKETS: deep pits on either side of nose --
      if (vNorm > 0.28 && vNorm < 0.44 && sideAbs > 0.18 && Math.abs(frontness) < 0.35) {
        const et = (vNorm - 0.28) / 0.16;
        let depth = 0.14 * Math.sin(et * Math.PI);
        // Taper at inner edge (near nose)
        if (sideAbs < 0.30) depth *= (sideAbs - 0.18) / 0.12;
        // Taper at outer edge
        if (sideAbs > 0.55) depth *= 1 - (sideAbs - 0.55) / 0.30;
        pz -= depth * S;
        // Narrow the face width at eye sockets
        px *= (1 - depth * 0.5);
      }

      // -- NOSE: conical wedge at center --
      if (frontness > 0.30 && vNorm > 0.32 && vNorm < 0.60) {
        const nt = (vNorm - 0.32) / 0.28;
        const noseProfile = Math.sin(nt * Math.PI);
        // Nose tip passes 0.50 for sharper peak
        let noseStr = noseProfile;
        if (vNorm > 0.48 && vNorm < 0.60) {
          const tipT = (vNorm - 0.48) / 0.12;
          noseStr *= 0.8 + 0.2 * (1 - tipT);
        }
        // Lateral falloff: narrow wedge
        const noseWidth = 1 - Math.min(1, sideAbs * 3.5);
        const lateral = Math.max(0, noseWidth);

        pz += 0.22 * noseStr * lateral * S;

        // Narrow bridge
        if (sideAbs < 0.25) {
          px *= (1 - 0.30 * noseStr * (1 - sideAbs / 0.25));
        }
      }

      // -- Nostril hint: slight bulge at base sides --
      if (frontness > 0.30 && vNorm > 0.52 && vNorm < 0.60 && sideAbs > 0.08 && sideAbs < 0.22) {
        const nst = (vNorm - 0.52) / 0.08;
        pz += 0.02 * Math.sin(nst * Math.PI) * S;
      }

      // -- CHEEKBONES: lateral bulge below eyes --
      if (vNorm > 0.38 && vNorm < 0.54) {
        const cheekT = (vNorm - 0.38) / 0.16;
        const cheekStr = 0.10 * Math.sin(cheekT * Math.PI);
        // Only at sides (not front, not back)
        if (sideAbs > 0.35 && sideAbs < 0.90 && Math.abs(frontness) < 0.60) {
          px += Math.sign(sz || 1) * cheekStr * S * (1 - Math.abs(frontness) / 0.60);
        }
      }

      // -- MOUTH: horizontal crease --
      if (frontness > 0.15 && vNorm > 0.54 && vNorm < 0.64) {
        const mt = (vNorm - 0.54) / 0.10;
        const mouthDepth = 0.035 * Math.sin(mt * Math.PI);
        // Wider than nose, narrower than face
        if (sideAbs < 0.45) {
          pz -= mouthDepth * S * (1 - sideAbs / 0.45);
        }
      }

      // -- CHIN: forward ledge at lower face --
      if (frontness > 0.20 && vNorm > 0.64 && vNorm < 0.83) {
        const ct = (vNorm - 0.64) / 0.19;
        const chinStr = 0.12 * Math.sin(ct * Math.PI);
        pz += chinStr * S;
        // Slight downward pull
        py -= 0.04 * Math.sin(ct * Math.PI) * S;
      }

      // -- NECK: cylindrical toward bottom --
      // Override accumulated facial deformations — the neck area
      // should blend smoothly to a uniform cylinder
      if (vNorm > 0.82) {
        const nt = (vNorm - 0.82) / 0.18;
        // Blend face profile toward uniform neck radius
        const blend = nt * nt; // 0 at v=0.82, 1 at v=1.0
        const uniformR = 0.38 + 0.05 * getRadius(vNorm, phi);
        const neckR = baseR * (1 - blend) + uniformR * blend;
        px = sz * neckR * rLat * S;
        py = yBase;
        pz = cx * neckR * rLat * S;
      }

      positions.push(px, py, pz);
    }
  }

  // Build triangles
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * (radialSegments + 1) + i;
      const b = a + radialSegments + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Legacy: returns positions + colors. Kept for backward compat. */
export function createFemaleHeadData(): {
  positions: Float32Array;
  colors: Float32Array;
} {
  const count = 8000;
  const positions = generateFemaleHeadPositions(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const pz = positions[i * 3 + 2];
    const depth = pz / (SCALE * 0.6) + 0.5;
    const clampedDepth = Math.max(0.2, Math.min(1, depth));

    colors[i * 3]     = 0.25 + 0.50 * clampedDepth;
    colors[i * 3 + 1] = 0.45 + 0.45 * clampedDepth;
    colors[i * 3 + 2] = 0.65 + 0.35 * clampedDepth;
  }

  return { positions, colors };
}
