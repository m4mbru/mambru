import {
  Scene,
  Group,
  Points,
  PointsMaterial,
  Mesh,
  MeshBasicMaterial,
  BufferGeometry,
  BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  Color,
  AdditiveBlending,
  DoubleSide,
  CanvasTexture,
  LinearFilter,
  RingGeometry,
  CylinderGeometry,
  SphereGeometry,
  AmbientLight,
  DirectionalLight,
} from 'three';

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
  private faceMesh: Mesh | null = null;
  private faceWire: Mesh | null = null;
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

  init(): void {
    const cyan = new Color('#1A6B7A');
    const group = new Group();

    // ─── Scene lighting for realistic materials ──────────────────
    const ambient = new AmbientLight(0x404060, 1.2);
    this.scene.add(ambient);

    const mainLight = new DirectionalLight(0xaaccff, 2.0);
    mainLight.position.set(1, 2, 3);
    this.scene.add(mainLight);

    const fillLight = new DirectionalLight(0x4488cc, 0.6);
    fillLight.position.set(-1, 0.5, -1);
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

    // ─── Female face image for hologram center ───────────────────
    function createFaceTexture(): CanvasTexture {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const x = c.getContext('2d')!;

      const cx = size * 0.45, cy = size * 0.45;

      // Glow aura
      const aura = x.createRadialGradient(cx, cy, 0, cx, cy, size * 0.55);
      aura.addColorStop(0, 'rgba(0, 255, 255, 0.08)');
      aura.addColorStop(0.7, 'rgba(0, 200, 255, 0.03)');
      aura.addColorStop(1, 'rgba(0, 255, 255, 0)');
      x.fillStyle = aura;
      x.fillRect(0, 0, size, size);

      x.strokeStyle = 'rgba(0, 255, 255, 0.55)';
      x.lineWidth = 2;
      x.lineCap = 'round';
      x.lineJoin = 'round';

      // Face oval
      x.beginPath();
      x.ellipse(cx, cy, 40, 50, 0, 0, Math.PI * 2);
      x.stroke();

      // Hair — flowing curves left side
      x.lineWidth = 2.5;
      x.strokeStyle = 'rgba(0, 255, 255, 0.5)';
      x.beginPath();
      x.moveTo(cx - 38, cy - 45);
      x.bezierCurveTo(cx - 65, cy - 25, cx - 58, cy + 25, cx - 28, cy + 42);
      x.stroke();

      // Hair right side
      x.beginPath();
      x.moveTo(cx + 38, cy - 45);
      x.bezierCurveTo(cx + 65, cy - 25, cx + 58, cy + 25, cx + 28, cy + 42);
      x.stroke();

      // Eyes
      x.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      x.lineWidth = 1.8;
      // Left
      x.beginPath();
      x.ellipse(cx - 15, cy - 8, 7, 4, 0, 0, Math.PI * 2);
      x.stroke();
      // Right
      x.beginPath();
      x.ellipse(cx + 15, cy - 8, 7, 4, 0, 0, Math.PI * 2);
      x.stroke();

      // Pupils
      x.fillStyle = 'rgba(0, 255, 255, 0.5)';
      x.beginPath(); x.arc(cx - 15, cy - 8, 1.8, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(cx + 15, cy - 8, 1.8, 0, Math.PI * 2); x.fill();

      // Nose
      x.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(cx, cy - 2);
      x.quadraticCurveTo(cx - 3, cy + 8, cx + 1, cy + 10);
      x.stroke();

      // Lips
      x.strokeStyle = 'rgba(0, 255, 255, 0.35)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(cx - 11, cy + 15);
      x.quadraticCurveTo(cx, cy + 20, cx + 11, cy + 15);
      x.stroke();

      // Neck and shoulders
      x.strokeStyle = 'rgba(0, 255, 255, 0.25)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(cx - 10, cy + 47);
      x.lineTo(cx - 8, cy + 68);
      x.moveTo(cx + 10, cy + 47);
      x.lineTo(cx + 8, cy + 68);
      x.moveTo(cx - 8, cy + 68);
      x.quadraticCurveTo(cx - 38, cy + 75, cx - 45, cy + 85);
      x.moveTo(cx + 8, cy + 68);
      x.quadraticCurveTo(cx + 38, cy + 75, cx + 45, cy + 85);
      x.stroke();

      const tex = new CanvasTexture(c);
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      return tex;
    }

    const faceTex = createFaceTexture();
    // 3D face — ellipsoid with holographic texture
    const faceGeo = new SphereGeometry(0.35, 32, 32);
    // Stretch vertically for a head shape
    const facePos = faceGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < facePos.length; i += 3) {
      facePos[i + 1] *= 1.25; // taller
      facePos[i + 2] *= 0.85; // slightly flattened front-back
    }
    faceGeo.computeVertexNormals();

    const faceMat = new MeshBasicMaterial({
      map: faceTex,
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const faceMesh = new Mesh(faceGeo, faceMat);
    faceMesh.position.z = -0.04;
    group.add(faceMesh);

    // Wireframe overlay — 3D grid lines for holographic look
    const wireMat = new MeshBasicMaterial({
      color: '#33FFFF',
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const wireMesh = new Mesh(faceGeo.clone(), wireMat);
    wireMesh.position.z = -0.04;
    wireMesh.scale.set(1.01, 1.01, 1.01);
    group.add(wireMesh);

    // Slow rotation in update
    this.faceMesh = faceMesh;
    this.faceWire = wireMesh;

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

    // ─── Centre square ──────────────────────────────────────────────
    const h = 0.1;
    const sqVerts = new Float32Array([
      -h, -h, 0,   h, -h, 0,
       h, -h, 0,   h,  h, 0,
       h,  h, 0,  -h,  h, 0,
      -h,  h, 0,  -h, -h, 0,
    ]);
    const sqGeo = new BufferGeometry();
    sqGeo.setAttribute('position', new BufferAttribute(sqVerts, 3));

    const sqMat = new LineBasicMaterial({
      color: cyan,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    ringGroup.add(new LineSegments(sqGeo, sqMat));

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
    ringGroup.add(makeRing(RING_RADIUS, 1.0, 0.003));

    // ─── Outer ring ─────────────────────────────────────────────────
    ringGroup.add(makeRing(RING2_RADIUS, 1.0, 0.003));

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
        color: cyan,
        transparent: true,
        opacity: 0.6,
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

    // ─── Cyberpunk 2-tier platform ─────────────────────────────
    const neonMagenta = '#FF0080';
    const neonCyan = '#00FFFF';
    const baseY = -0.74;
    const R = 0.58;

    const platformGroup = new Group();
    platformGroup.position.y = baseY;
    platformGroup.rotation.x = -0.18;
    group.add(platformGroup);
    this.platformGroup = platformGroup;

    // ─── Bottom tier ───────────────────────────────────────────
    const darkMetal = '#0D1117';
    const darkMetalMat = new MeshBasicMaterial({
      color: darkMetal, transparent: false, opacity: 1, side: DoubleSide,
    });
    const metalMat = new MeshBasicMaterial({
      color: '#161B22', transparent: false, opacity: 1, side: DoubleSide,
    });

    // Main bottom cylinder (thick, solid)
    const bottom = new Mesh(new CylinderGeometry(R, R, 0.05, 48), darkMetalMat);
    bottom.position.y = 0.025;
    platformGroup.add(bottom);

    // Bottom neon rim (neonMagenta)
    const botRim = new Mesh(
      new RingGeometry(R - 0.025, R + 0.005, 48),
      new MeshBasicMaterial({ color: neonMagenta, transparent: true, opacity: 0.7, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    botRim.position.y = 0.001;
    botRim.rotation.x = -Math.PI / 2;
    platformGroup.add(botRim);

    // Top neon rim of bottom tier (neonMagenta)
    const topRim = new Mesh(
      new RingGeometry(R - 0.025, R + 0.005, 48),
      new MeshBasicMaterial({ color: neonMagenta, transparent: true, opacity: 0.7, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    topRim.position.y = 0.05;
    topRim.rotation.x = -Math.PI / 2;
    platformGroup.add(topRim);

    // 8 vertical neon strips on bottom tier wall (thin glowing lines)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const buf = new Float32Array([
        Math.cos(a) * R, 0.001, Math.sin(a) * R,
        Math.cos(a) * R, 0.049, Math.sin(a) * R,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      const strip = new LineSegments(g, new LineBasicMaterial({
        color: neonMagenta, transparent: true, opacity: 0.3, blending: AdditiveBlending,
      }));
      platformGroup.add(strip);
    }

    // ─── Middle support ring ────────────────────────────────────
    const Rmid = R * 0.75;
    const midStrut = new Mesh(
      new CylinderGeometry(Rmid + 0.015, Rmid + 0.015, 0.01, 32),
      new MeshBasicMaterial({ color: '#1C2333', transparent: false, opacity: 1, side: DoubleSide })
    );
    midStrut.position.y = 0.045;
    platformGroup.add(midStrut);

    // Cyan accent ring on midStrut
    const midCyan = new Mesh(
      new RingGeometry(Rmid - 0.01, Rmid + 0.025, 48),
      new MeshBasicMaterial({ color: neonCyan, transparent: true, opacity: 0.25, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    midCyan.position.y = 0.05;
    midCyan.rotation.x = -Math.PI / 2;
    platformGroup.add(midCyan);

    // ─── Top tier ──────────────────────────────────────────────
    const R2 = R * 0.62;
    const top = new Mesh(new CylinderGeometry(R2, R2, 0.035, 36), metalMat);
    top.position.y = 0.075;
    platformGroup.add(top);

    // Top tier neon edge (neonMagenta)
    const topEdge = new Mesh(
      new RingGeometry(R2 - 0.02, R2 + 0.005, 36),
      new MeshBasicMaterial({ color: neonMagenta, transparent: true, opacity: 0.6, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    topEdge.position.y = 0.093;
    topEdge.rotation.x = -Math.PI / 2;
    platformGroup.add(topEdge);

    // Inner recess (sunken center)
    const innerR = R2 * 0.65;
    const recess = new Mesh(
      new CylinderGeometry(innerR, innerR, 0.01, 32),
      new MeshBasicMaterial({ color: '#0A0D14', transparent: false, opacity: 1, side: DoubleSide })
    );
    recess.position.y = 0.087;
    platformGroup.add(recess);

    // Neon ring inside recess (neonCyan)
    const recessNeon = new Mesh(
      new RingGeometry(innerR - 0.015, innerR + 0.005, 32),
      new MeshBasicMaterial({ color: neonCyan, transparent: true, opacity: 0.4, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    recessNeon.position.y = 0.092;
    recessNeon.rotation.x = -Math.PI / 2;
    platformGroup.add(recessNeon);

    // Grid lines in recess (radial + concentric)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const buf = new Float32Array([0, 0.092, 0, Math.cos(a) * innerR * 0.9, 0.092, Math.sin(a) * innerR * 0.9]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: neonCyan, transparent: true, opacity: 0.08, blending: AdditiveBlending,
      })));
    }
    // 3 concentric circles in recess
    for (let r = 1; r <= 3; r++) {
      const radius = (innerR * 0.9) * (r / 3);
      const pts = 24;
      const buf = new Float32Array(pts * 3 + 3);
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        buf[i * 3] = Math.cos(a) * radius;
        buf[i * 3 + 1] = 0.092;
        buf[i * 3 + 2] = Math.sin(a) * radius;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: neonCyan, transparent: true, opacity: 0.06, blending: AdditiveBlending,
      })));
    }

    // ─── Core emitter (pulsing) ─────────────────────────────────
    const emitterMat = new MeshBasicMaterial({
      color: '#FFFFFF', transparent: true, opacity: 0.6,
      side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
    });
    const emitterRing = new Mesh(new RingGeometry(innerR * 0.28, innerR * 0.35, 24), emitterMat);
    emitterRing.position.y = 0.094;
    emitterRing.rotation.x = -Math.PI / 2;
    platformGroup.add(emitterRing);
    this.emitterMat = emitterMat;

    // ─── Projector light beam ─────────────────────────────────
    const beamHeight = 0.65;
    const beamTopR = 0.75;
    const beamBottomR = 0.04;

    // Gradient texture: opaque at bottom → transparent at top
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = 2;
    gradCanvas.height = 64;
    const beamCtx = gradCanvas.getContext('2d')!;
    const beamGrad = beamCtx.createLinearGradient(0, 0, 0, 64);
    beamGrad.addColorStop(0.0, 'rgba(255,255,255,1)');
    beamGrad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    beamGrad.addColorStop(0.85, 'rgba(255,255,255,0.15)');
    beamGrad.addColorStop(1.0, 'rgba(255,255,255,0)');
    beamCtx.fillStyle = beamGrad;
    beamCtx.fillRect(0, 0, 2, 64);
    const alphaTex = new CanvasTexture(gradCanvas);

    // Main cone beam (soft, wide, fades toward top)
    const beamMat = new MeshBasicMaterial({
      color: neonCyan, transparent: true, opacity: 0.04,
      alphaMap: alphaTex, side: DoubleSide,
      blending: AdditiveBlending, depthWrite: false,
    });
    const beam = new Mesh(new CylinderGeometry(beamTopR, beamBottomR, beamHeight, 28, 1, true), beamMat);
    beam.position.y = 0.1 + beamHeight / 2;
    platformGroup.add(beam);

    // Inner brighter core beam (fades faster toward top)
    const coreAlphaTex = alphaTex.clone();
    const coreBeamMat = new MeshBasicMaterial({
      color: '#88EEFF', transparent: true, opacity: 0.03,
      alphaMap: coreAlphaTex, side: DoubleSide,
      blending: AdditiveBlending, depthWrite: false,
    });
    const coreBeam = new Mesh(new CylinderGeometry(beamTopR * 0.3, beamBottomR * 0.5, beamHeight * 0.85, 20, 1, true), coreBeamMat);
    coreBeam.position.y = 0.1 + beamHeight * 0.46;
    platformGroup.add(coreBeam);

    // 8 light rays
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const endR = beamTopR * (0.4 + Math.random() * 0.5);
      const bx = Math.cos(a);
      const bz = Math.sin(a);
      const buf = new Float32Array([
        bx * beamBottomR, 0.1, bz * beamBottomR,
        bx * endR, 0.6, bz * endR,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: neonCyan, transparent: true, opacity: 0.025,
        blending: AdditiveBlending, depthWrite: false,
      })));
    }

    // Diffuse glow ring near the top (where beam meets the figure)
    const glowRing = new Mesh(
      new RingGeometry(beamTopR * 0.2, beamTopR, 32),
      new MeshBasicMaterial({ color: neonCyan, transparent: true, opacity: 0.015, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    glowRing.position.y = 0.6;
    glowRing.rotation.x = -Math.PI / 2;
    platformGroup.add(glowRing);

    // ─── Cyberpunk details ──────────────────────────────────────
    // 6 angled struts supporting top tier
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      const buf = new Float32Array([
        cx * R * 0.85, 0.04, sz * R * 0.85,
        cx * R2 * 0.9, 0.065, sz * R2 * 0.9,
      ]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(buf, 3));
      platformGroup.add(new LineSegments(g, new LineBasicMaterial({
        color: neonMagenta, transparent: true, opacity: 0.15, blending: AdditiveBlending,
      })));
    }

    // Small data nodes around top tier edge
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const dot = new Mesh(
        new CylinderGeometry(0.006, 0.008, 0.008, 6),
        new MeshBasicMaterial({ color: neonCyan, transparent: true, opacity: 0.5, blending: AdditiveBlending })
      );
      dot.position.set(Math.cos(a) * (R2 + 0.005), 0.088, Math.sin(a) * (R2 + 0.005));
      platformGroup.add(dot);
    }

    // Floating holographic ring (orbital)
    const orbPts = 36;
    const orbBuf = new Float32Array(orbPts * 3);
    for (let i = 0; i < orbPts; i++) {
      const a = (i / orbPts) * Math.PI * 2;
      orbBuf[i * 3] = Math.cos(a) * (innerR * 0.6);
      orbBuf[i * 3 + 1] = Math.sin(a) * 0.02;
      orbBuf[i * 3 + 2] = Math.sin(a) * (innerR * 0.6);
    }
    const orbGeo = new BufferGeometry();
    orbGeo.setAttribute('position', new BufferAttribute(orbBuf, 3));
    const orbMat = new LineBasicMaterial({
      color: neonCyan, transparent: true, opacity: 0.25,
      blending: AdditiveBlending, depthWrite: false,
    });
    this.orbitalRing = new LineSegments(orbGeo, orbMat);
    this.orbitalRing.position.y = 0.11;
    platformGroup.add(this.orbitalRing);

    // ─── Dust particles (sparks in the glow) ────────────────────
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
      color: '#FF66AA', size: 0.008, transparent: true, opacity: 0.4,
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

  update(delta: number, elapsed: number): void {
    if (!this.nodeMat) return;
    this.nodeMat.opacity = 0.55 + 0.3 * Math.sin(elapsed * PULSE_SPEED);

    // Pulse cardinal sections
    const cardPulse = 0.35 + 0.25 * Math.sin(elapsed * 1.2);
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

    if (this.group) {
      this.group.rotation.z += delta * 0.03;
    }
    if (this.ringGroup) {
      this.ringGroup.rotation.z -= delta * 0.06;
    }

    // ─── Platform animations ─────────────────────────────────────
    // Emitter pulse
    if (this.emitterMat) {
      this.emitterMat.opacity = 0.35 + 0.2 * Math.sin(elapsed * 1.5);
    }

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

    // ─── 3D face rotation ────────────────────────────────────────
    if (this.faceMesh) {
      this.faceMesh.rotation.y += delta * 0.25;
    }
    if (this.faceWire) {
      this.faceWire.rotation.y += delta * 0.25;
    }
  }

  dispose(): void {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((child) => {
        if (child instanceof Points || child instanceof LineSegments || child instanceof Mesh) {
          child.geometry.dispose();
          if (child.material) {
            (child.material as PointsMaterial | LineBasicMaterial | MeshBasicMaterial).dispose();
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
    this.faceWire = null;
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
