import {
  Scene,
  Group,
  Points,
  PointsMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  BufferGeometry,
  BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  Color,
  Vector3,
  Plane,
  AdditiveBlending,
  DoubleSide,
  CanvasTexture,
  LinearFilter,
  RingGeometry,
  CylinderGeometry,
  AmbientLight,
  DirectionalLight,
} from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { createHeadMeshGeometry } from './FemaleHead';

const NODE_COUNT = 18;
const BASE_RADIUS = 0.55;
const RADIUS_JITTER = 0.25;
const ANGLE_JITTER = 0.5;
const RING_RADIUS = 0.455;
const RING2_RADIUS = 0.48;
const RING_SEGMENTS = 40;
const CARDINAL_HALF_ANGLE = Math.PI / 5;  // 36° a cada lado (72° total)
const CARDINAL_GAP = 0.005;                // separacion de los anillos
const CARDINAL_FILL_SEGS = 20;             // subdivisiones del relleno
const MAX_CONNECT_DIST = 0.5;
const NEIGHBOR_LIMIT = 3;
const PULSE_SPEED = 0.8;

function hashRand(seed: number): number {
  let t = (seed * 0x6c8e9cf5) | 0;
  t = (t + 0x3c6ef372) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return (t ^ (t >>> 16)) >>> 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function makeGradientTex(topColor: string, bottomColor: string, height = 64): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, height);
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

export class NeuralNetwork {
  private group: Group | null = null;
  private ringGroup: Group | null = null;
  private nodeMat: PointsMaterial | null = null;
  private cardinalMats: MeshBasicMaterial[] = [];
  private scene: Scene;
  private nodePos: Float32Array | null = null;
  private connPairs: [number, number][] = [];

  // Two scanning beams
  private beamState: {
    edgeIdx: number;
    progress: number;
    phase: number;
    line: LineSegments;
  }[] = [];
  private faceMesh: Group | Mesh | Points | null = null;
  private headGroup: Group | null = null;
  private headMat: MeshStandardMaterial | null = null;
  private wireMat: MeshBasicMaterial | null = null;
  
  private headBaseY = 0;
  private headPhase = 0;
  private emitterMat: MeshBasicMaterial | null = null;
  private orbitalRing: LineSegments | null = null;
  private platformGroup: Group | null = null;
  private dustParticles: Points | null = null;
  private dustPos: Float32Array | null = null;
  private dustSpeeds: Float32Array | null = null;
  private dustOffsets: Float32Array | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    const cyan = new Color('#1A6B7A');
    const group = new Group();
    this.group = group;

    // ─── Scene lighting — subtle cool light to reveal geometry ───
    const ambient = new AmbientLight(0x446688, 0.4);
    this.scene.add(ambient);

    const mainLight = new DirectionalLight(0xccddff, 1.2);
    mainLight.position.set(1.5, 2.0, 1.5);
    this.scene.add(mainLight);

    const fillLight = new DirectionalLight(0x6688aa, 0.4);
    fillLight.position.set(-1.0, 0.3, -1.2);
    this.scene.add(fillLight);

    // ─── 18 node positions (jittered angle + radius) ───────────────
    const nodePos = new Float32Array(NODE_COUNT * 3);
    this.nodePos = nodePos;
    for (let i = 0; i < NODE_COUNT; i++) {
      const baseAngle = (i / NODE_COUNT) * Math.PI * 2;
      const h1 = hashRand(i * 7 + 1) / 0xffffffff;
      const h2 = hashRand(i * 7 + 2) / 0xffffffff;
      const angle = baseAngle + lerp(-ANGLE_JITTER, ANGLE_JITTER, h1);
      const radius = Math.max(0.08, BASE_RADIUS + lerp(-RADIUS_JITTER, RADIUS_JITTER, h2));

      nodePos[i * 3]     = Math.cos(angle) * radius;
      nodePos[i * 3 + 1] = Math.sin(angle) * radius;
      nodePos[i * 3 + 2] = 0;
    }

    // ─── Circle texture for nodes ──────────────────────────────────
    const texSize = 64;
    const tc = document.createElement('canvas');
    tc.width = texSize;
    tc.height = texSize;
    const ctx = tc.getContext('2d')!;
    const cx2 = texSize / 2, cy2 = texSize / 2, r = texSize / 2 - 1;
    const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
    ctx.fill();
    const circleTex = new CanvasTexture(tc);
    circleTex.minFilter = LinearFilter;
    circleTex.magFilter = LinearFilter;

    // ─── Load STL bust model (realistic, from MakerWorld) ──────
    // Falls back to procedural head if STL fails to load.
    let headGeo: BufferGeometry;
    try {
      headGeo = await this.loadStlGeometry('/models/busto-humano.stl');
    } catch (err) {
      console.warn('Failed to load STL bust, using procedural head', err);
      headGeo = createHeadMeshGeometry(36, 30);
      headGeo.computeVertexNormals();
    }

    // Holographic bust — self-illuminated with subtle light revealing contours
    const headMat = new MeshStandardMaterial({
      color: 0x3a6a8a,
      emissive: 0x33ddff,
      emissiveIntensity: 0.18,
      roughness: 0.40,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
      side: DoubleSide,
    });
    this.headMat = headMat;
    const headMesh = new Mesh(headGeo, headMat);

    // Holographic wireframe overlay for that retro sci-fi look
    const wireMat = new MeshBasicMaterial({
      color: 0x226699,
      transparent: true,
      opacity: 0.06,
      blending: AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    this.wireMat = wireMat;
    const wireMesh = new Mesh(headGeo.clone(), wireMat);

    const bust = new Group();
    bust.add(headMesh);
    bust.add(wireMesh);
    bust.position.set(0, 0.04, 0.0);
    bust.scale.set(1, 1, 1);
    this.headGroup = bust;
    group.add(bust);

    // Floating animation state
    this.headBaseY = 0.04;
    this.headPhase = Math.random() * Math.PI * 2;
    this.faceMesh = bust;

    // ─── Nodes ──────────────────────────────────────────────────────
    const nodeColors = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      nodeColors[i * 3]     = cyan.r;
      nodeColors[i * 3 + 1] = cyan.g;
      nodeColors[i * 3 + 2] = cyan.b;
    }

    const nodeGeo = new BufferGeometry();
    nodeGeo.setAttribute('position', new BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute('color',   new BufferAttribute(nodeColors, 3));

    this.nodeMat = new PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: circleTex,
    });

    group.add(new Points(nodeGeo, this.nodeMat));

    // ─── Ring assembly (rotates independently) ─────────────────────
    const ringGroup = new Group();
    this.ringGroup = ringGroup;

    // ─── Centre square (removed — was causing visual noise) ─────

    // ─── Helper: create a ring Mesh (thick) ─────────────────────────
    function makeRing(radius: number, opacity: number, thickness = 0.005, color: Color = cyan): Mesh {
      const geo = new RingGeometry(radius - thickness, radius + thickness, RING_SEGMENTS);
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
      });
      return new Mesh(geo, mat);
    }

    // ─── Inner ring ─────────────────────────────────────────────────
    ringGroup.add(makeRing(RING_RADIUS, 1.0, 0.003, new Color('#33ccdd')));

    // ─── Outer ring ─────────────────────────────────────────────────
    ringGroup.add(makeRing(RING2_RADIUS, 1.0, 0.003, new Color('#33ccdd')));

    // ─── 4 cardinal sections between rings (pill shape) ──────────
    const dirAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // N, E, S, W
    const cr1 = RING_RADIUS + CARDINAL_GAP + 0.0035;
    const cr2 = RING2_RADIUS - CARDINAL_GAP - 0.0035;
    const ha = CARDINAL_HALF_ANGLE;
    const segs = CARDINAL_FILL_SEGS;
    const triCount = segs * 2;
    const idxBuf = new Uint16Array(triCount * 3);

    this.cardinalMats = [];

    for (let d = 0; d < 4; d++) {
      const base = dirAngles[d];
      const pos: number[] = [];

      // Pill shape: angular width tapers at the edges via cosine
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const widthFactor = 0.3 + 0.7 * (1 + Math.cos(t * 2 * Math.PI - Math.PI)) / 2;
        const angle = base + (t - 0.5) * 2 * ha * widthFactor;
        pos.push(cr1 * Math.cos(angle), cr1 * Math.sin(angle), 0);
      }
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const widthFactor = 0.3 + 0.7 * (1 + Math.cos(t * 2 * Math.PI - Math.PI)) / 2;
        const angle = base + (t - 0.5) * 2 * ha * widthFactor;
        pos.push(cr2 * Math.cos(angle), cr2 * Math.sin(angle), 0);
      }

      for (let i = 0; i < segs; i++) {
        const a = i;
        const b = i + 1;
        const c = segs + 1 + i + 1;
        const d2 = segs + 1 + i;
        const ti = i * 6;
        idxBuf[ti]     = a;
        idxBuf[ti + 1] = b;
        idxBuf[ti + 2] = c;
        idxBuf[ti + 3] = a;
        idxBuf[ti + 4] = c;
        idxBuf[ti + 5] = d2;
      }

      const fillGeo = new BufferGeometry();
      fillGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      fillGeo.setIndex(new BufferAttribute(idxBuf.slice(0, triCount * 3), 1));

      const cardinalMat = new MeshBasicMaterial({
        color: new Color('#33ccdd'),
        transparent: true,
        opacity: 1.0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
      });
      this.cardinalMats.push(cardinalMat);
      ringGroup.add(new Mesh(fillGeo, cardinalMat));
    }

    group.add(ringGroup);

    // ─── Radial spokes ──────────────────────────────────────────────
    const spokePairs: number[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const idx = i * 3;
      spokePairs.push(0, 0, 0);
      spokePairs.push(nodePos[idx], nodePos[idx + 1], nodePos[idx + 2]);
    }

    const spokeGeo = new BufferGeometry();
    spokeGeo.setAttribute('position', new BufferAttribute(new Float32Array(spokePairs), 3));
    const spokeMat = new LineBasicMaterial({
      color: cyan,
      transparent: true,
      opacity: 0.15,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    group.add(new LineSegments(spokeGeo, spokeMat));

    // ─── Proximity connections ──────────────────────────────────────
    const connSet = new Set<string>();
    const connBuf: number[] = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const ix = i * 3;
      const xi = nodePos[ix];
      const yi = nodePos[ix + 1];
      const zi = nodePos[ix + 2];

      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < NODE_COUNT; j++) {
        if (j === i) continue;
        const jx = j * 3;
        const dx = xi - nodePos[jx];
        const dy = yi - nodePos[jx + 1];
        const dz = zi - nodePos[jx + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < MAX_CONNECT_DIST) {
          dists.push({ j, d });
        }
      }

      dists.sort((a, b) => a.d - b.d);
      const take = Math.min(dists.length, NEIGHBOR_LIMIT);

      for (let k = 0; k < take; k++) {
        const j = dists[k].j;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (connSet.has(key)) continue;
        connSet.add(key);
        this.connPairs.push([i, j]);

        const jx = j * 3;
        connBuf.push(
          nodePos[ix], nodePos[ix + 1], nodePos[ix + 2],
          nodePos[jx], nodePos[jx + 1], nodePos[jx + 2],
        );
      }
    }

    if (connBuf.length > 0) {
      const connGeo = new BufferGeometry();
      connGeo.setAttribute('position', new BufferAttribute(new Float32Array(connBuf), 3));
      const connMat = new LineBasicMaterial({
        color: cyan,
        transparent: true,
        opacity: 0.4,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      group.add(new LineSegments(connGeo, connMat));
    }

    // ─── Two scanning beams (center → along connections) ───────
    function makeBeam(): { line: LineSegments } {
      const lineBuf = new Float32Array(6);
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new BufferAttribute(lineBuf, 3));
      const lineMat = new LineBasicMaterial({
        color: cyan,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const line = new LineSegments(lineGeo, lineMat);
      group.add(line);
      return { line };
    }

    // Each beam starts at a different edge, spread across the graph
    const numBeams = 5;
    const edgeCount = this.connPairs.length;
    const step = Math.max(1, Math.floor(edgeCount / numBeams));
    this.beamState = Array.from({ length: numBeams }, (_, i) => ({
      edgeIdx: Math.min(i * step, edgeCount - 1),
      progress: 0, // start from center
      phase: 0,
      ...makeBeam(),
    }));

    // ─── Realistic white/gray 2-tier platform ──────────────────
    const baseY = -0.74;
    const R = 0.58;

    const platformGroup = new Group();
    platformGroup.position.y = baseY;
    platformGroup.rotation.x = -0.18;
    // Add directly to scene so platform stays static (doesn't rotate with head group)
    this.scene.add(platformGroup);
    this.platformGroup = platformGroup;

    // ─── Bottom tier ───────────────────────────────────────────
    const lightGray = '#E8E8E8';
    const midGray = '#C0C0C0';
    const shadowGray = '#606060';

    // Gradient texture for cylinder walls — top lighter, bottom darker (ambient occlusion)
    const bodyGrad = makeGradientTex('#E2E2E2', '#AEAEAE');

    const bodyMat = new MeshStandardMaterial({
      color: '#D8D8D8', map: bodyGrad, roughness: 0.5, metalness: 0.35,
      side: DoubleSide,
    });
    const topMat = new MeshStandardMaterial({
      color: lightGray, roughness: 0.45, metalness: 0.25,
      side: DoubleSide,
    });
    const shadowMat = new MeshBasicMaterial({
      color: shadowGray, side: DoubleSide,
    });

    // Main bottom cylinder — side wall with gradient
    const bottomSide = new Mesh(new CylinderGeometry(R + 0.005, R + 0.005, 0.05, 48, 1, true), bodyMat);
    bottomSide.position.y = 0.025;
    platformGroup.add(bottomSide);

    // Bottom tier top surface (lighter)
    const bottomTop = new Mesh(
      new RingGeometry(0.01, R, 48),
      topMat
    );
    bottomTop.position.y = 0.05;
    bottomTop.rotation.x = -Math.PI / 2;
    platformGroup.add(bottomTop);

    // Bottom edge bevel (dark shadow line)
    const botEdge = new Mesh(
      new RingGeometry(R - 0.006, R + 0.003, 48),
      shadowMat
    );
    botEdge.position.y = 0.001;
    botEdge.rotation.x = -Math.PI / 2;
    platformGroup.add(botEdge);

    // Top edge bevel (transition ring from side to top surface)
    const topEdgeBevel = new Mesh(
      new RingGeometry(R - 0.01, R + 0.005, 48),
      new MeshStandardMaterial({ color: '#C8C8C8', roughness: 0.5, metalness: 0.3, side: DoubleSide })
    );
    topEdgeBevel.position.y = 0.049;
    topEdgeBevel.rotation.x = -Math.PI / 2;
    platformGroup.add(topEdgeBevel);

    // Panel lines + vent slits on the side (12 vertical — every 3rd is a vent)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const isVent = i % 3 === 0;
      const lineR = R + 0.006;
      const yBot = 0.002 + (isVent ? 0.004 : 0);
      const yTop = 0.048 - (isVent ? 0.004 : 0);
      const buf = new Float32Array([
        Math.cos(a) * lineR, yBot, Math.sin(a) * lineR,
        Math.cos(a) * lineR, yTop, Math.sin(a) * lineR,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: isVent ? '#606060' : '#A0A0A0', transparent: true, opacity: isVent ? 0.4 : 0.25,
      })));
    }

    // ─── Middle support ring ────────────────────────────────────
    const Rmid = R * 0.75;
    const midStrutMat = new MeshStandardMaterial({
      color: midGray, roughness: 0.5, metalness: 0.3, side: DoubleSide,
    });
    const midStrut = new Mesh(
      new CylinderGeometry(Rmid + 0.015, Rmid + 0.015, 0.012, 32, 1, true),
      midStrutMat
    );
    midStrut.position.y = 0.045;
    platformGroup.add(midStrut);

    // Dark shadow under the middle ring (ambient occlusion)
    const midShadow = new Mesh(
      new RingGeometry(Rmid - 0.02, Rmid + 0.025, 32),
      new MeshBasicMaterial({ color: '#505050', transparent: true, opacity: 0.6, side: DoubleSide })
    );
    midShadow.position.y = 0.041;
    midShadow.rotation.x = -Math.PI / 2;
    platformGroup.add(midShadow);

    // Thin highlight ring on top of middle support
    const midHighlight = new Mesh(
      new RingGeometry(Rmid + 0.005, Rmid + 0.025, 32),
      new MeshStandardMaterial({ color: '#E0E0E0', roughness: 0.4, metalness: 0.3, side: DoubleSide })
    );
    midHighlight.position.y = 0.051;
    midHighlight.rotation.x = -Math.PI / 2;
    platformGroup.add(midHighlight);

    // ─── Top tier ──────────────────────────────────────────────
    const R2 = R * 0.62;
    const topWallGrad = makeGradientTex('#CCCCCC', '#B0B0B0');
    const topWallMat = new MeshStandardMaterial({
      color: '#C0C0C0', map: topWallGrad, roughness: 0.4, metalness: 0.3,
      side: DoubleSide,
    });
    const topWall = new Mesh(new CylinderGeometry(R2, R2, 0.035, 36, 1, true), topWallMat);
    topWall.position.y = 0.075;
    platformGroup.add(topWall);

    // Top tier surface (bright white-gray, machined feel)
    const topSurfaceMat = new MeshStandardMaterial({
      color: '#F0F0F0', roughness: 0.35, metalness: 0.25, side: DoubleSide,
    });
    const topSurface = new Mesh(
      new RingGeometry(0.01, R2, 36),
      topSurfaceMat
    );
    topSurface.position.y = 0.093;
    topSurface.rotation.x = -Math.PI / 2;
    platformGroup.add(topSurface);

    // Top edge highlight (bright rim)
    const topHighlight = new Mesh(
      new RingGeometry(R2 - 0.005, R2 + 0.003, 36),
      new MeshStandardMaterial({
        color: '#FFFFFF', roughness: 0.2, metalness: 0.5, side: DoubleSide,
      })
    );
    topHighlight.position.y = 0.094;
    topHighlight.rotation.x = -Math.PI / 2;
    platformGroup.add(topHighlight);

    // Outer edge bevel on top surface (transition ring)
    const outerBevel = new Mesh(
      new RingGeometry(R2 - 0.015, R2 - 0.003, 36),
      new MeshStandardMaterial({ color: '#E0E0E0', roughness: 0.4, metalness: 0.3, side: DoubleSide })
    );
    outerBevel.position.y = 0.092;
    outerBevel.rotation.x = -Math.PI / 2;
    platformGroup.add(outerBevel);

    // Inner recess (sunken center) — darker wall for depth
    const innerR = R2 * 0.65;
    const recessMat = new MeshStandardMaterial({
      color: '#505050', roughness: 0.8, metalness: 0.2, side: DoubleSide,
    });
    const recess = new Mesh(
      new CylinderGeometry(innerR, innerR, 0.012, 32, 1, true),
      recessMat
    );
    recess.position.y = 0.087;
    platformGroup.add(recess);

    // Recess floor (deep shadow)
    const recessFloorMat = new MeshStandardMaterial({
      color: '#383838', roughness: 0.9, metalness: 0.1, side: DoubleSide,
    });
    const recessFloor = new Mesh(
      new RingGeometry(0.01, innerR, 32),
      recessFloorMat
    );
    recessFloor.position.y = 0.092;
    recessFloor.rotation.x = -Math.PI / 2;
    platformGroup.add(recessFloor);

    // Subtle grid lines in recess (very faint white-gray)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const buf = new Float32Array([0, 0.093, 0, Math.cos(a) * innerR * 0.85, 0.093, Math.sin(a) * innerR * 0.85]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: '#808080', transparent: true, opacity: 0.12,
      })));
    }
    // 3 concentric circles in recess
    for (let r = 1; r <= 3; r++) {
      const radius = (innerR * 0.85) * (r / 3);
      const pts = 24;
      const buf = new Float32Array(pts * 3 + 3);
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        buf[i * 3] = Math.cos(a) * radius;
        buf[i * 3 + 1] = 0.093;
        buf[i * 3 + 2] = Math.sin(a) * radius;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: '#707070', transparent: true, opacity: 0.08 + 0.04 * (r % 2),
      })));
    }
    // Radial alignment marks in recess (12 tiny tick lines)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inner = innerR * 0.75;
      const outer = innerR * 0.85;
      const buf = new Float32Array([
        Math.cos(a) * inner, 0.093, Math.sin(a) * inner,
        Math.cos(a) * outer, 0.093, Math.sin(a) * outer,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: '#606060', transparent: true, opacity: 0.12,
      })));
    }

    // ─── Core emitter (white, subtle) ──────────────────────────
    const emitterMat = new MeshBasicMaterial({
      color: '#FFFFFF', transparent: true, opacity: 0.5,
      side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
    });
    const emitterRing = new Mesh(new RingGeometry(innerR * 0.25, innerR * 0.32, 24), emitterMat);
    emitterRing.position.y = 0.094;
    emitterRing.rotation.x = -Math.PI / 2;
    platformGroup.add(emitterRing);
    this.emitterMat = emitterMat;

    // ─── Light beam (wide cone, diffused from base to top) ─────────
    const beamH = 0.35;
    const beamBotR = 0.02;    // base sale angosto
    const beamTopR = 0.80;    // se expande bien abierto al centro de la figura

    // 3. Wireframe cage — 12 vertical lines forming a cone boundary
    const cageSegments = 12;
    for (let i = 0; i < cageSegments; i++) {
      const a = (i / cageSegments) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      const buf = new Float32Array([
        cx * beamBotR, 0.1, sz * beamBotR,
        cx * beamTopR, 0.1 + beamH, sz * beamTopR,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: '#FFFFFF', transparent: true, opacity: 0.06,
        blending: AdditiveBlending, depthWrite: false,
      })));
    }

    // 4. Gradient glow mesh (semi-transparent cone filling the beam volume)
    const glowVerts: number[] = [];
    const glowIdx: number[] = [];
    const glowSegs = 24;
    for (let i = 0; i <= glowSegs; i++) {
      const a = (i / glowSegs) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      // Bottom ring
      glowVerts.push(cx * beamBotR, 0.1, sz * beamBotR);
      // Top ring (offset by glowSegs+1)
      glowVerts.push(cx * beamTopR, 0.1 + beamH, sz * beamTopR);
    }
    for (let i = 0; i < glowSegs; i++) {
      const b = i * 2;
      const t = b + 1;
      const bNext = (i + 1) * 2;
      const tNext = bNext + 1;
      glowIdx.push(b, t, bNext);
      glowIdx.push(t, tNext, bNext);
    }
    // UVs: 0 en base (opaco), 1 en tope (transparente)
    const glowUvs: number[] = [];
    for (let i = 0; i <= glowSegs; i++) {
      const u = i / glowSegs;
      glowUvs.push(u, 0);  // bottom ring → UV.y = 0
      glowUvs.push(u, 1);  // top ring → UV.y = 1
    }
    const glowGeo = new BufferGeometry();
    glowGeo.setAttribute('position', new BufferAttribute(new Float32Array(glowVerts), 3));
    glowGeo.setAttribute('uv', new BufferAttribute(new Float32Array(glowUvs), 2));
    glowGeo.setIndex(glowIdx);
    glowGeo.computeVertexNormals();

    // Gradient texture: black (transparent) arriba, white (opaco) abajo
    const alphaTex = makeGradientTex('#000000', '#ffffff', 128);
    const glowMat = new MeshBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.12,
      alphaMap: alphaTex,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const glowMesh = new Mesh(glowGeo, glowMat);
    platformGroup.add(glowMesh);

    // (anillos eliminados — solo glow volumétrico)


    // ─── Platform details (gray tones) ──────────────────────────
    // 6 angled struts supporting top tier (cylinder meshes for real volume)
    const strutMat = new MeshStandardMaterial({
      color: '#A0A0A0', roughness: 0.6, metalness: 0.4,
    });
    const startY = 0.04;
    const endY = 0.065;
    const dy = endY - startY;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      const x1 = cx * R * 0.85;
      const z1 = sz * R * 0.85;
      const x2 = cx * R2 * 0.9;
      const z2 = sz * R2 * 0.9;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const len = Math.sqrt(dist * dist + dy * dy);
      const strut = new Mesh(new CylinderGeometry(0.005, 0.005, len, 6), strutMat);
      strut.position.set((x1 + x2) / 2, (startY + endY) / 2, (z1 + z2) / 2);
      const dir = new Vector3(dx, dy, dz).normalize();
      strut.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      platformGroup.add(strut);
    }

    // Small screws on top surface ring (between outer edge and recess)
    const screwMat = new MeshStandardMaterial({
      color: '#B8B8B8', roughness: 0.25, metalness: 0.7,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const screwR = (R2 + innerR) / 2;
      const screw = new Mesh(
        new CylinderGeometry(0.008, 0.01, 0.003, 8),
        screwMat
      );
      screw.position.set(Math.cos(a) * screwR, 0.0945, Math.sin(a) * screwR);
      platformGroup.add(screw);
    }

    // Small metallic pins around top tier edge
    const pinMat = new MeshStandardMaterial({
      color: '#D0D0D0', roughness: 0.3, metalness: 0.6,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const dot = new Mesh(
        new CylinderGeometry(0.005, 0.007, 0.006, 6),
        pinMat
      );
      dot.position.set(Math.cos(a) * (R2 + 0.005), 0.088, Math.sin(a) * (R2 + 0.005));
      platformGroup.add(dot);
    }

    // ─── Dust particles (floating motes in the light) ──────────
    const DUST_COUNT = 60;
    const dustPos = new Float32Array(DUST_COUNT * 3);
    const dustSpeeds = new Float32Array(DUST_COUNT);
    const dustOffsets = new Float32Array(DUST_COUNT * 2);
    for (let i = 0; i < DUST_COUNT; i++) {
      const t = Math.random();
      const yPos = t * 0.4;
      const radius = 0.02 + t * innerR * 0.5;
      const angle = Math.random() * Math.PI * 2;
      dustPos[i * 3] = Math.cos(angle) * radius;
      dustPos[i * 3 + 1] = yPos;
      dustPos[i * 3 + 2] = Math.sin(angle) * radius;
      dustSpeeds[i] = 0.04 + Math.random() * 0.08;
      dustOffsets[i * 2] = Math.random() * Math.PI * 2;
      dustOffsets[i * 2 + 1] = 0.3 + Math.random() * 0.5;
    }
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
    const dustMat = new PointsMaterial({
      color: '#FFFFFF', size: 0.006, transparent: true, opacity: 0.25,
      blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.dustParticles = new Points(dustGeo, dustMat);
    this.dustParticles.position.y = 0.005;
    platformGroup.add(this.dustParticles);
    this.dustPos = dustPos;
    this.dustSpeeds = dustSpeeds;
    this.dustOffsets = dustOffsets;

    this.scene.add(group);
  }

  /** Load an STL, rotate Z-up → Y-up, center XZ, scale, and return geometry. */
  private async loadStlGeometry(url: string): Promise<BufferGeometry> {
    const loader = new STLLoader();
    const geo = await loader.loadAsync(url);

    // STL uses Z-up (3D printing convention), Three.js uses Y-up.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      pos.setXYZ(i, x, z, -y);
    }
    pos.needsUpdate = true;

    // Auto-scale & center X/Z. Keep Y offset so the head sits at the right height.
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = maxDim > 0 ? 0.85 / maxDim : 1;
    const scaledTopY = box.max.y * targetScale;
    const yOffset = 0.38 - scaledTopY;

    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i,
        (pos.getX(i) - center.x) * targetScale,
        pos.getY(i) * targetScale + yOffset,
        (pos.getZ(i) - center.z) * targetScale,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** Switch the STL model at runtime — replaces the bust mesh.
   *  @param url  Path to the STL file.
   *  @param clipBottomY  If set, clips geometry below this Y (world space) using a clipping plane.
   */
  async setModel(url: string, clipBottomY?: number): Promise<void> {
    if (!this.headGroup || !this.headMat || !this.wireMat) return;

    try {
      const geo = await this.loadStlGeometry(url);

      // Remove old meshes from the head group
      while (this.headGroup.children.length > 0) {
        const child = this.headGroup.children[0];
        if (child instanceof Mesh) {
          child.geometry.dispose();
        }
        this.headGroup.remove(child);
      }

      // Build meshes — clone materials when we need clipping so other models stay unclipped
      if (clipBottomY !== undefined) {
        // Keep everything above clipBottomY, clip below
        const clipPlane = new Plane(new Vector3(0, 1, 0), -clipBottomY);
        const clipHeadMat = this.headMat.clone();
        clipHeadMat.clippingPlanes = [clipPlane];
        clipHeadMat.clipShadows = true;
        const clipWireMat = this.wireMat.clone();
        clipWireMat.clippingPlanes = [clipPlane];
        clipWireMat.clipShadows = true;

        const headMesh = new Mesh(geo, clipHeadMat);
        const wireMesh = new Mesh(geo.clone(), clipWireMat);
        this.headGroup.add(headMesh);
        this.headGroup.add(wireMesh);
      } else {
        const headMesh = new Mesh(geo, this.headMat);
        const wireMesh = new Mesh(geo.clone(), this.wireMat);
        this.headGroup.add(headMesh);
        this.headGroup.add(wireMesh);
      }
    } catch (err) {
      console.warn(`Failed to load model: ${url}`, err);
    }
  }

  /** Remove the current STL model from the head group (leaves the group empty).
   *  Call this when switching to a non-STL style like sphere particles. */
  clearModel(): void {
    if (!this.headGroup) return;
    while (this.headGroup.children.length > 0) {
      const child = this.headGroup.children[0];
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
      this.headGroup.remove(child);
    }
  }

  update(delta: number, elapsed: number): void {
    if (!this.nodeMat) return;
    this.nodeMat.opacity = 0.55 + 0.3 * Math.sin(elapsed * PULSE_SPEED);

    // Pulse cardinal sections
    const cardPulse = 0.55 + 0.30 * Math.sin(elapsed * 1.2);
    for (const m of this.cardinalMats) {
      m.opacity = cardPulse;
    }

    // ─── Two scanning beams (center → along connections) ────────
    if (this.nodePos && this.beamState.length > 0 && this.connPairs.length > 0) {
      const np = this.nodePos;
      const edges = this.connPairs;
      const speed = 0.5; // edges per second

      for (const beam of this.beamState) {
        beam.progress += delta * speed;

        if (beam.phase === 0) {
          // Phase 0: traveling from center (0,0,0) to the starting node of current edge
          const [ai] = edges[beam.edgeIdx];
          const sx = 0, sy = 0, sz = 0;
          const tx = np[ai * 3], ty = np[ai * 3 + 1], tz = np[ai * 3 + 2];

          if (beam.progress >= 1.0) {
            beam.progress = 0;
            beam.phase = 1;
          }

          const t = Math.min(beam.progress, 1.0);
          const bpos = (beam.line.geometry.attributes.position as BufferAttribute).array as Float32Array;
          bpos[0] = sx; bpos[1] = sy; bpos[2] = sz;
          bpos[3] = sx + (tx - sx) * t;
          bpos[4] = sy + (ty - sy) * t;
          bpos[5] = sz + (tz - sz) * t;
          beam.line.geometry.attributes.position.needsUpdate = true;
        } else {
          // Phase 1: traveling along edges
          if (beam.progress >= 1.0) {
            beam.progress = 0;
            beam.edgeIdx = (beam.edgeIdx + 1) % edges.length;
          }

          const t = beam.progress;
          const [ai, bi] = edges[beam.edgeIdx];
          const sx = np[ai * 3], sy = np[ai * 3 + 1], sz = np[ai * 3 + 2];
          const tx = sx + (np[bi * 3] - sx) * t;
          const ty = sy + (np[bi * 3 + 1] - sy) * t;
          const tz = sz + (np[bi * 3 + 2] - sz) * t;

          const bpos = (beam.line.geometry.attributes.position as BufferAttribute).array as Float32Array;
          bpos[0] = sx; bpos[1] = sy; bpos[2] = sz;
          bpos[3] = tx; bpos[4] = ty; bpos[5] = tz;
          beam.line.geometry.attributes.position.needsUpdate = true;
        }
      }
    }

    if (this.ringGroup) {
      // Rings gently counter-rotate for visual depth
      this.ringGroup.rotation.z -= delta * 0.06;
    }

    // ─── Platform animations ─────────────────────────────────────
    // Emitter pulse
    if (this.emitterMat) {
      this.emitterMat.opacity = 0.35 + 0.2 * Math.sin(elapsed * 1.5);
    }

    // ─── Holographic head — static ──────────────────────────────
    // (Material values are set at creation; no runtime pulse needed.)

    // Platform gentle breathing
    if (this.platformGroup) {
      this.platformGroup.position.y = -0.74 + 0.005 * Math.sin(elapsed * 0.4);
    }

    // Orbital ring rotation
    if (this.orbitalRing) {
      this.orbitalRing.rotation.y += delta * 0.3;
    }

    // ─── Floating dust particles ─────────────────────────────────
    if (this.dustParticles && this.dustPos && this.dustSpeeds && this.dustOffsets) {
      const dp = this.dustPos;
      const ds = this.dustSpeeds;
      const doff = this.dustOffsets;
      const count = dp.length / 3;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        dp[i3 + 1] += delta * ds[i];
        dp[i3] += Math.sin(elapsed * doff[i * 2] + i) * delta * 0.01;
        dp[i3 + 2] += Math.cos(elapsed * doff[i * 2 + 1] + i) * delta * 0.01;
        if (dp[i3 + 1] > 0.55) {
          const t = Math.random();
          dp[i3 + 1] = 0;
          const radius = 0.48 + t * 0.22;
          const angle = Math.random() * Math.PI * 2;
          const rOff = (Math.random() - 0.5) * 0.3;
          dp[i3] = Math.cos(angle) * (radius + rOff * radius);
          dp[i3 + 2] = Math.sin(angle) * (radius + rOff * radius);
        }
      }
      this.dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    // ─── Head floating animation ─────────────────────────────────
    if (this.faceMesh) {
      // Gentle vertical bob + subtle sway — like the HUD cards
      const floatY = Math.sin(elapsed * 0.6 + this.headPhase) * 0.025;
      const floatX = Math.sin(elapsed * 0.3 + this.headPhase * 1.3) * 0.01;
      const floatTilt = Math.sin(elapsed * 0.4 + this.headPhase * 0.7) * 0.02;
      this.faceMesh.position.y = this.headBaseY + floatY;
      this.faceMesh.position.x = floatX;
      this.faceMesh.rotation.z = floatTilt;
    }
  }

  dispose(): void {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((child) => {
        if (child instanceof Points || child instanceof LineSegments || child instanceof Mesh) {
          child.geometry.dispose();
          if (child.material) {
            (child.material as PointsMaterial | LineBasicMaterial | MeshBasicMaterial | MeshStandardMaterial).dispose();
          }
        }
      });
      this.group = null;
    }
    this.ringGroup = null;
    this.nodeMat = null;
    this.cardinalMats = [];
    this.connPairs = [];
    this.beamState = [];
    this.faceMesh = null;
    this.emitterMat = null;
    this.orbitalRing = null;
    this.platformGroup = null;
    this.dustParticles = null;
    this.dustPos = null;
    this.dustSpeeds = null;
    this.dustOffsets = null;
    this.nodePos = null;
  }
}
