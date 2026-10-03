// Sweets models: chocolate bar (half unwrapped: crinkled foil + paper sleeve), marshmallows
// (+ big puffed "popped" ones), chunky chocolate-chip cookie, pink glazed donut, swirl lollipop
// and a pile of gummy bears.
//
// Cookie and donut halves / wedges / chunks are real angular slices of the same seeded model (body
// lathe, glaze shell, chips & sprinkles in range) with exact cut faces painted by `sectionV`.

import * as THREE from 'three';
import type { ModelTable } from './types';
import type { FoodState } from '../food/types';
import { getDef } from '../food/catalog';
import {
  type Rng,
  type Profile,
  rng,
  foodMat,
  lazy,
  canvasTexture,
  latheGeometry,
  smoothProfile,
  smoothNormals,
  noisify,
  merge,
  mesh,
  group,
  sitOnGround,
  fbm3,
  paintVertices,
  bumpNoiseTexture,
  roundedBox,
} from './kit';
import { paramSurface, flipWinding, sectionVMaterial, drawTex, tfbm, tnoise, sstep, clamp01, rgb, setc, mixc, mulc, pixelTex } from './bakery';
import { mottleT, specksT, rgba } from './meat';
import { revolve, fillet } from './containers';

// =============================================================================================
// Local helpers
// =============================================================================================

const TAU = Math.PI * 2;
const FONT = '"Trebuchet MS", "Verdana", "DejaVu Sans", sans-serif';
const colors = (id: string) => getDef(id).colors;
type V3 = [number, number, number];

const matCache = new Map<string, THREE.Material>();
function cmat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

function packMat(key: string, p: Parameters<typeof foodMat>[0]): THREE.Material {
  return cmat('pack:' + key, () => foodMat({ ...p, food: false, cookAmount: 0, name: key }));
}

function vcol(g: THREE.BufferGeometry, hex: string | THREE.Color): THREE.BufferGeometry {
  const c = typeof hex === 'string' ? new THREE.Color(hex) : hex;
  return paintVertices(g, () => c);
}

function placed(g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scale: number | V3 = 1): THREE.BufferGeometry {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), s);
  return g.clone().applyMatrix4(m);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function blob(ctx: CanvasRenderingContext2D, r: Rng, x: number, y: number, size: number, n = 6) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = r.range(0, size * 0.55);
    const rr = size * r.range(0.35, 0.6);
    ctx.moveTo(x + Math.cos(a) * d + rr, y + Math.sin(a) * d);
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, TAU);
  }
  ctx.fill();
}

const SPRINKLES = ['#ff5fa8', '#ffd23f', '#5fd3ff', '#8fe07a', '#b48cff', '#ffffff', '#ff8a4a'];
const sprinkleMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, flesh: '#ff9ac8', cookColor: '#a0603a', name: 'sprinkles' }));
const sprinkleGeo = lazy(() => new THREE.CylinderGeometry(0.00085, 0.00085, 0.0046, 5, 1));

/** Sprinkles lying on random vertices of a surface (normal.y >= minNy, optional filter). */
function sprinklesOn(src: THREE.BufferGeometry, r: Rng, n: number, minNy: number, accept?: (p: THREE.Vector3, i: number) => boolean): THREE.BufferGeometry | null {
  const pos = src.attributes.position as THREE.BufferAttribute;
  const nor = src.attributes.normal as THREE.BufferAttribute;
  const parts: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const used: THREE.Vector3[] = [];
  for (let k = 0, tries = 0; k < n && tries < n * 50; tries++) {
    const i = Math.floor(r.next() * pos.count);
    p.fromBufferAttribute(pos, i);
    nv.fromBufferAttribute(nor, i).normalize();
    if (nv.y < minNy || (accept && !accept(p, i))) continue;
    if (used.some((q) => q.distanceToSquared(p) < 0.0035 * 0.0035)) continue;
    used.push(p.clone());
    const a = Math.abs(nv.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(nv, a).normalize();
    const t2 = new THREE.Vector3().crossVectors(nv, t1);
    const ang = r.range(0, TAU);
    const tan = t1.multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
    const q = new THREE.Quaternion().setFromUnitVectors(Y, tan);
    const m = new THREE.Matrix4().compose(p.clone().addScaledVector(nv, 0.0006), q, new THREE.Vector3(1, r.range(0.8, 1.15), 1));
    parts.push(vcol(sprinkleGeo().clone().applyMatrix4(m), r.pick(SPRINKLES)));
    k++;
  }
  return parts.length ? merge(parts) : null;
}

interface RRing {
  a: number[];
  b: number[];
  na: number[];
  nb: number[];
  s: number[];
  P: number;
  top: [number, number];
}

/**
 * Rounded-rectangle ring in an (a, b) plane (a right, b up), half sizes hw / hh, corner radius
 * rc. Starts at the bottom centre heading +a (counter-clockwise), samples include both ends.
 */
function rrRing(hw: number, hh: number, rc: number, nW: number, nH: number, nC: number): RRing {
  const a: number[] = [], b: number[] = [], na: number[] = [], nb: number[] = [], s: number[] = [];
  let acc = 0;
  const top: [number, number] = [0, 0];
  const iw = hw - rc, ih = hh - rc;
  const line = (a0: number, b0: number, a1: number, b1: number, n: number, nx: number, ny: number) => {
    const len = Math.hypot(a1 - a0, b1 - b0);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      a.push(a0 + (a1 - a0) * t);
      b.push(b0 + (b1 - b0) * t);
      na.push(nx);
      nb.push(ny);
      s.push(acc + len * t);
    }
    acc += len;
  };
  const corner = (ca: number, cb: number, t0: number, n: number) => {
    const len = (Math.PI / 2) * rc;
    for (let i = 0; i < n; i++) {
      const t = t0 + (Math.PI / 2) * (i / n);
      a.push(ca + Math.cos(t) * rc);
      b.push(cb + Math.sin(t) * rc);
      na.push(Math.cos(t));
      nb.push(Math.sin(t));
      s.push(acc + len * (i / n));
    }
    acc += len;
  };
  line(0, -hh, iw, -hh, Math.max(1, Math.ceil(nW / 2)), 0, -1);
  corner(iw, -ih, -Math.PI / 2, nC);
  line(hw, -ih, hw, ih, nH, 1, 0);
  corner(iw, ih, 0, nC);
  top[0] = acc;
  line(iw, hh, -iw, hh, nW, 0, 1);
  top[1] = acc;
  corner(-iw, ih, Math.PI / 2, nC);
  line(-hw, ih, -hw, -ih, nH, -1, 0);
  corner(-iw, -ih, Math.PI, nC);
  line(-iw, -hh, 0, -hh, Math.max(1, Math.ceil(nW / 2)), 0, -1);
  a.push(a[0]);
  b.push(b[0]);
  na.push(na[0]);
  nb.push(nb[0]);
  s.push(acc);
  return { a, b, na, nb, s, P: acc, top };
}

// =============================================================================================
// CHOCOLATE: a segmented bar, crinkled gold foil torn open, paper sleeve on the other half
// =============================================================================================

const CHOC = colors('chocolate');
const BAR_W = 0.132, BAR_D = 0.064, BAR_BASE = 0.0034, BAR_T = 0.0102;
const BAR_NX = 6, BAR_NZ = 3;
const PITCH_X = BAR_W / BAR_NX, PITCH_Z = BAR_D / BAR_NZ;

const chocoTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = CHOC.skin;
      ctx.fillRect(0, 0, w, h);
      const r = rng(5);
      mottleT(ctx, w, h, '#7a4528', r, 26, [w * 0.06, w * 0.18], [0.3, 0.5]);
      mottleT(ctx, w, h, '#5a2f17', r, 22, [w * 0.05, w * 0.14], [0.2, 0.4]);
    },
    { key: 'sweets/chocolate', wrap: true },
  ),
);
const chocoMat = lazy(() =>
  foodMat({ color: '#ffffff', map: chocoTex(), roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.28, flesh: CHOC.flesh, cookColor: CHOC.cooked, name: 'chocolate' }),
);
const chocoFleshMat = lazy(() => foodMat({ color: '#ffffff', map: chocoTex(), roughness: 0.42, flesh: CHOC.flesh, cookColor: CHOC.cooked, name: 'chocolate-flesh' }));

const segmentGeo = lazy(() => {
  const bev = 0.0021, bt = 0.0021;
  const w = PITCH_X - 0.0021 - 2 * bev, d = PITCH_Z - 0.0021 - 2 * bev;
  const pts = fillet([[0, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [0, -d / 2]], 0.0008, 2);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = BAR_T - 0.0025 - 2 * bt;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bev, bevelSegments: 2, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.0025 + bt, 0);
  // planar uv
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 18 + pos.getY(i) * 9, pos.getZ(i) * 18);
  g.computeVertexNormals();
  return g;
});

const foilMat = lazy(() =>
  packMat('choco-foil', {
    color: '#ffffff',
    map: canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#e9c25a';
        ctx.fillRect(0, 0, w, h);
        const r = rng(8);
        mottleT(ctx, w, h, '#fff0b0', r, 30, [w * 0.05, w * 0.14], [0.3, 0.6]);
        mottleT(ctx, w, h, '#b98a2a', r, 24, [w * 0.04, w * 0.12], [0.2, 0.4]);
      },
      { key: 'sweets/foil', wrap: true },
    ),
    roughness: 0.24,
    metalness: 0.85,
    flatShading: true,
    flesh: '#e2bb55',
  }),
);

/** Sleeve label: canvas x runs along the bar (+x), canvas y around the ring (top face band). */
function chocoSleeveTex(ring: RRing, len: number) {
  const W = 384, H = 1024;
  return canvasTexture(
    W,
    H,
    (ctx) => {
      ctx.fillStyle = '#e8506a';
      ctx.fillRect(0, 0, W, H);
      const r = rng(4);
      mottleT(ctx, W, H, '#f06a80', r, 30, [20, 60], [0.2, 0.35]);
      // the ring's v (s / P) is canvas y measured from the bottom
      const Y = (s: number) => H * (1 - s / ring.P);
      const y0 = Y(ring.top[1]), y1 = Y(ring.top[0]); // top face band (y0 < y1)
      const kx = W / len, ky = H / ring.P; // px per metre
      // gold stripes along the edges of the top face
      ctx.fillStyle = '#f6cf6a';
      ctx.fillRect(0, y0 + 0.003 * ky, W, 0.0022 * ky);
      ctx.fillRect(0, y1 - 0.0052 * ky, W, 0.0022 * ky);
      // chocolate drips from the top edge (back side) of the label
      ctx.fillStyle = '#6b3a1f';
      const dripTop = y0 + 0.0065 * ky;
      ctx.fillRect(0, y0 + 0.0052 * ky, W, 0.0016 * ky);
      for (let x = 6; x < W; x += r.range(14, 30)) {
        const dl = r.range(0.003, 0.009) * ky, dw = r.range(5, 9);
        ctx.beginPath();
        ctx.moveTo(x - dw, dripTop - 2);
        ctx.lineTo(x - dw * 0.6, dripTop + dl);
        ctx.arc(x, dripTop + dl, dw * 0.6, Math.PI, 0, true);
        ctx.lineTo(x + dw, dripTop - 2);
        ctx.fill();
      }
      // brand text (reads along the bar)
      const cy = (y0 + y1) / 2 + 0.004 * ky;
      ctx.save();
      ctx.translate(W * 0.5, cy);
      ctx.scale(1, ky / kx);
      ctx.fillStyle = '#fff3dc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(0.0118 * kx)}px ${FONT}`;
      ctx.fillText('CHOCO', 0, 0);
      ctx.font = `bold ${Math.round(0.0042 * kx)}px ${FONT}`;
      ctx.fillStyle = '#f6cf6a';
      ctx.fillText('★ MILK ★', 0, 0.0098 * kx);
      ctx.restore();
    },
    { key: 'sweets/choco-sleeve' },
  );
}

function buildChocolate(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  const x0 = -BAR_W / 2;
  // exposed part of the bar: base plate + chamfered segments
  const xFoil = x0 + PITCH_X * r.range(3.25, 3.55);
  const xPaper = xFoil + r.range(0.011, 0.015);
  const base = roundedBox(BAR_W, BAR_BASE, BAR_D, 0.0012, 2);
  base.translate(0, BAR_BASE / 2, 0);
  const segs: THREE.BufferGeometry[] = [base];
  for (let i = 0; i < BAR_NX; i++) {
    const cx = x0 + PITCH_X * (i + 0.5);
    if (cx - PITCH_X / 2 > xFoil + 0.001) continue;
    for (let j = 0; j < BAR_NZ; j++) segs.push(placed(segmentGeo(), [cx, 0, -BAR_D / 2 + PITCH_Z * (j + 0.5)]));
  }
  g.add(mesh(merge(segs), chocoMat(), { name: 'chocolate' }));
  // crinkled foil, torn open on the left
  const yc = BAR_T / 2;
  const fr = rrRing(BAR_D / 2 + 0.0007, BAR_T / 2 + 0.0007, 0.0017, 14, 3, 3);
  const nf = fr.a.length - 1;
  const xEnd = BAR_W / 2 + 0.0008;
  const seed = r.range(0, 40);
  const tear = (i: number) => {
    const u = fr.s[i] / fr.P;
    return xFoil + 0.0035 * Math.abs(Math.sin(u * 37 + seed)) + 0.003 * fbm3(u * 9 + seed, seed, 0.5, 2) + (fr.nb[i] > 0.5 ? 0.002 : 0);
  };
  const nx = 10;
  const foil = paramSurface(nf, nx, (_u, v, out, i) => {
    const x = tear(i === nf ? 0 : i) * (1 - v) + xEnd * v;
    const cr = fbm3(x * 260 + seed, fr.a[i] * 260, fr.b[i] * 260, 2) * 0.00045 + Math.abs(Math.sin(x * 900 + fr.a[i] * 300)) * 0.00018;
    const k = sstep(xEnd, xEnd - 0.004, x);
    out.set(x, yc + fr.b[i] + fr.nb[i] * cr * k, fr.a[i] + fr.na[i] * cr * k);
  });
  const fuv = foil.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 3, fuv.getY(i) * 2);
  g.add(mesh(foil, foilMat(), { name: 'foil' }));
  // a torn flap of foil curling up from the top edge
  const fz = r.range(-0.012, 0.012), fw = r.range(0.018, 0.026), fl = r.range(0.014, 0.02);
  const flap = paramSurface(6, 6, (u, v, out) => {
    const zz = fz - fw / 2 + fw * u;
    const ang = 0.35 + v * 1.25; // bends up and back over the bar
    const rr = fl * v;
    const cr = fbm3(u * 6 + seed, v * 6, seed, 2) * 0.0012;
    out.set(xFoil + 0.002 - Math.sin(ang) * rr * 0.55 + cr * 0.3, BAR_T + 0.0007 + (1 - Math.cos(ang)) * rr * 0.9 + rr * 0.25 + cr, zz + cr * 0.5);
  });
  g.add(mesh(flap, foilMat()));
  // paper sleeve
  const pr = rrRing(BAR_D / 2 + 0.0016, BAR_T / 2 + 0.0016, 0.0024, 10, 2, 3);
  const np = pr.a.length - 1;
  const pEnd = BAR_W / 2 + 0.0016;
  const len = pEnd - xPaper;
  const sleeve = paramSurface(np, 4, (_u, v, out, i) => out.set(xPaper + len * v, yc + pr.b[i], pr.a[i]));
  const suv = sleeve.attributes.uv as THREE.BufferAttribute;
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= np; i++) suv.setXY(j * (np + 1) + i, j / 4, pr.s[i] / pr.P);
  // end cap (fan) facing +x
  const cap: number[] = [];
  for (let i = 0; i < np; i++) cap.push(pEnd, yc, 0, pEnd, yc + pr.b[i], pr.a[i], pEnd, yc + pr.b[i + 1], pr.a[i + 1]);
  const capG = new THREE.BufferGeometry();
  capG.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  capG.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((cap.length / 3) * 2).fill(0.5), 2));
  capG.computeVertexNormals();
  const sleeveMat = cmat('choco-sleeve', () => foodMat({ color: '#ffffff', map: chocoSleeveTex(pr, len), roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35, food: false, cookAmount: 0, flesh: '#f4e8dc', name: 'choco-sleeve' }));
  g.add(mesh(merge([sleeve, capG]), sleeveMat, { name: 'sleeve' }));
  g.rotation.y = r.range(-0.3, 0.3);
  return sitOnGround(g);
}

/** An unwrapped piece of the bar, `cols` segments long (centred, on y = 0). */
function chocoPieceGeo(cols: number): THREE.BufferGeometry {
  const w = cols * PITCH_X;
  const base = roundedBox(w - 0.0006, BAR_BASE, BAR_D, 0.0012, 2);
  base.translate(0, BAR_BASE / 2, 0);
  const parts: THREE.BufferGeometry[] = [base];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < BAR_NZ; j++) parts.push(placed(segmentGeo(), [-w / 2 + PITCH_X * (i + 0.5), 0, -BAR_D / 2 + PITCH_Z * (j + 0.5)]));
  return merge(parts);
}

/** The bar snapped in two. */
function chocoHalves(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  const geo = chocoPieceGeo(BAR_NX / 2);
  for (const s of [-1, 1]) {
    const m = mesh(geo, chocoMat(), { name: 'chocolate' });
    m.position.set(s * (PITCH_X * 1.5 + 0.005), 0, s * r.range(0.002, 0.008));
    m.rotation.y = s * r.range(0.1, 0.25);
    g.add(m);
  }
  g.rotation.y = r.range(-0.3, 0.3);
  return sitOnGround(g);
}

/** Face of a chocolate piece: a 2 x 2 block of chamfered squares seen from above. */
function chocoSection(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#3e1d0d';
  ctx.fillRect(0, 0, s, s);
  const n = 2, cell = s / n, inset = cell * 0.05, bev = cell * 0.15;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x0 = i * cell + inset, y0 = j * cell + inset, w = cell - 2 * inset;
      const x1 = x0 + w, y1 = y0 + w;
      const quad = (pts: [number, number][], c: string) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      };
      quad([[x0, y0], [x1, y0], [x1 - bev, y0 + bev], [x0 + bev, y0 + bev]], '#8c5634');
      quad([[x0, y0], [x0 + bev, y0 + bev], [x0 + bev, y1 - bev], [x0, y1]], '#7a4628');
      quad([[x1, y0], [x1, y1], [x1 - bev, y1 - bev], [x1 - bev, y0 + bev]], '#55290f');
      quad([[x0, y1], [x0 + bev, y1 - bev], [x1 - bev, y1 - bev], [x1, y1]], '#4a230c');
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, '#74401f');
      gr.addColorStop(1, '#663619');
      ctx.fillStyle = gr;
      ctx.fillRect(x0 + bev, y0 + bev, w - 2 * bev, w - 2 * bev);
      ctx.fillStyle = 'rgba(255,220,190,0.12)';
      ctx.fillRect(x0 + bev, y0 + bev, w - 2 * bev, (w - 2 * bev) * 0.25);
    }
}

function chocoSliceShape(): THREE.Shape {
  const w = PITCH_X * 2 - 0.001, d = PITCH_Z * 2 - 0.001;
  const pts = fillet([[0, 0], [w / 2, 0], [w / 2, d], [-w / 2, d], [-w / 2, 0], [0, 0]], 0.0015, 2);
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// =============================================================================================
// MARSHMALLOWS: three plump pastel pillows (popped: big puffy ones)
// =============================================================================================

const MALLOW = colors('marshmallow');
const MALLOW_COLORS = ['#fbc8d8', '#fdf7f3', '#c9eedf', '#e2d6fa', '#ffe0c2'];
const MALLOW_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.0085, 0.0001],
    [0.0124, 0.0011],
    [0.0141, 0.0042],
    [0.0147, 0.0105],
    [0.0148, 0.0175],
    [0.0143, 0.0238],
    [0.0127, 0.0272],
    [0.009, 0.0286],
    [0.0001, 0.029],
  ],
  18,
);
const PUFF_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.013, 0.0006],
    [0.0215, 0.0045],
    [0.0252, 0.0125],
    [0.0258, 0.021],
    [0.024, 0.0305],
    [0.0185, 0.0382],
    [0.0095, 0.0422],
    [0.0001, 0.043],
  ],
  18,
);

const mallowMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    vertexColors: true,
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#eeeae8';
        ctx.fillRect(0, 0, w, h);
        const r = rng(9);
        mottleT(ctx, w, h, '#ffffff', r, 40, [w * 0.04, w * 0.12], [0.3, 0.6]);
        specksT(ctx, w, h, '#ffffff', r, 260, [0.6, 1.5], 0.9);
      },
      { key: 'sweets/mallow-sugar', wrap: true },
    ),
    roughness: 0.78,
    sheen: 0.8,
    sheenColor: '#ffffff',
    sheenRoughness: 0.55,
    flesh: MALLOW.flesh,
    cookColor: MALLOW.cooked,
    name: 'marshmallow',
  }),
);

function mallowGeometry(r: Rng, prof: Profile, color: string, puff = false): THREE.BufferGeometry {
  const g = latheGeometry(prof, 28);
  const seed = r.range(0, 50);
  const H = prof[prof.length - 1][1];
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm3(x * 90 + seed, y * 90, z * 90, 2);
    const k = 1 + n * (puff ? 0.05 : 0.025);
    pos.setXYZ(i, x * k, y + n * (puff ? 0.0012 : 0.0004) * sstep(0, H * 0.3, y), z * k);
  }
  smoothNormals(g);
  return vcol(g, color);
}

function mallowPiece(r: Rng, i: number): THREE.Object3D {
  const g = mallowGeometry(r, MALLOW_PROFILE, MALLOW_COLORS[i % 3]);
  const m = mesh(g, mallowMat(), { name: 'marshmallow' });
  m.rotation.y = r.range(0, TAU);
  return sitOnGround(group(m));
}

function buildMarshmallows(r: Rng, puff = false): THREE.Object3D {
  const prof = puff ? PUFF_PROFILE : MALLOW_PROFILE;
  const R = Math.max(...prof.map((p) => p[0]));
  const H = prof[prof.length - 1][1];
  const third = MALLOW_COLORS[r.int(2, MALLOW_COLORS.length - 1)];
  const cols = [MALLOW_COLORS[0], MALLOW_COLORS[1], third];
  if (r.next() < 0.5) cols.reverse();
  const g = new THREE.Group();
  if (!puff) {
    // two standing side by side, one lying across their tops
    for (let k = 0; k < 2; k++) {
      const m = mesh(mallowGeometry(r, prof, cols[k]), mallowMat());
      m.position.set((k ? 1 : -1) * R * 1.02, 0, r.range(-0.002, 0.002));
      m.rotation.set(r.range(-0.03, 0.03), r.range(0, TAU), r.range(-0.03, 0.03));
      g.add(m);
    }
    const top = mesh(mallowGeometry(r, prof, cols[2]), mallowMat());
    top.rotation.set(0, 0, Math.PI / 2 + r.range(-0.12, 0.12));
    top.position.set(H / 2 + r.range(-0.003, 0.003), H + R * 0.9, r.range(-0.003, 0.003));
    const holder = new THREE.Group();
    holder.add(top);
    holder.rotation.y = r.range(-0.4, 0.4);
    g.add(holder);
  } else {
    const spots: V3[] = [[-R * 0.95, 0, R * 0.35], [R * 0.95, 0, R * 0.25], [0.0, 0, -R * 1.25]];
    spots.forEach((p, k) => {
      const m = mesh(mallowGeometry(r, prof, cols[k], true), mallowMat());
      m.position.set(p[0] + r.range(-0.002, 0.002), 0, p[2] + r.range(-0.002, 0.002));
      m.rotation.set(r.range(-0.08, 0.08), r.range(0, TAU), r.range(-0.08, 0.08));
      g.add(m);
    });
  }
  g.rotation.y = r.range(-0.3, 0.3);
  return sitOnGround(g);
}

/** Angle a inside the arc th0 -> th1 (radians, th1 > th0), with a margin. */
function angIn(a: number, th0: number, th1: number, margin = 0): boolean {
  const d = (((a - th0 - margin) % TAU) + TAU) % TAU;
  return d <= th1 - th0 - 2 * margin;
}

/**
 * Flat cut face of a lathe body at angle th: polygon points (r, y) placed on the plane at that
 * angle, facing out of a wedge that spans [th, ...] (start) or [..., th] (end).
 * UVs follow the sectionV convention: u = (r + R) / 2R, v = y / H.
 */
function sideFace(pts: [number, number][], th: number, end: boolean, R: number, H: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const sn = Math.sin(th), cs = Math.cos(th);
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i), Y = pos.getY(i);
    pos.setXYZ(i, X * sn, Y, X * cs);
    uv.setXY(i, (X + R) / (2 * R), Y / H);
    nor.setXYZ(i, end ? cs : -cs, 0, end ? -sn : sn);
  }
  if (end) flipWinding(g);
  return g;
}

/** n wedges of a round item, pushed apart a little. */
function fanWedges(make: (th0: number, th1: number) => THREE.Object3D, n: number, r: Rng, gap: number): THREE.Group {
  const g = new THREE.Group();
  const start = r.range(0, TAU), d = TAU / n;
  for (let k = 0; k < n; k++) {
    const th0 = start + k * d, m = th0 + d / 2;
    const w = make(th0, th0 + d);
    w.position.set(Math.sin(m) * gap, 0, Math.cos(m) * gap);
    g.add(w);
  }
  return g;
}

/** Chunks: `count` pieces of 1/n each, recentred (rc = distance of a piece's middle from the axis), heaped. */
function heapWedges(make: (th0: number, th1: number) => THREE.Object3D, n: number, count: number, r: Rng, rc: number, radius: number, scale: number): THREE.Group {
  const g = new THREE.Group();
  const start = r.range(0, TAU), d = TAU / n;
  const spots: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const th0 = start + k * d, m = th0 + d / 2;
    const w = make(th0, th0 + d);
    w.position.set(-Math.sin(m) * rc, 0, -Math.cos(m) * rc);
    const inner = new THREE.Group();
    inner.add(w);
    inner.scale.setScalar(scale * r.range(0.85, 1.08));
    inner.rotation.y = r.range(0, TAU);
    let best: [number, number] = [0, 0];
    for (let t = 0; t < 30; t++) {
      const [dx, dz] = r.disc();
      best = [dx * radius, dz * radius];
      if (spots.every((q) => Math.hypot(q[0] - best[0], q[1] - best[1]) > radius * 0.62)) break;
    }
    spots.push(best);
    const wrap = new THREE.Group();
    wrap.position.set(best[0], 0, best[1]);
    wrap.rotation.set(r.range(-0.12, 0.12), 0, r.range(-0.12, 0.12));
    wrap.add(inner);
    g.add(wrap);
  }
  return g;
}

// =============================================================================================
// COOKIE: chunky chocolate-chip cookie
// =============================================================================================

const COOKIE = colors('cookie');
const CK_R = 0.045;
const COOKIE_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.03, 0],
    [0.0402, 0.0006],
    [0.0443, 0.0028],
    [0.0452, 0.0058],
    [0.0445, 0.0088],
    [0.0412, 0.0113],
    [0.034, 0.0129],
    [0.022, 0.0139],
    [0.01, 0.0144],
    [0.0001, 0.0146],
  ],
  18,
);

const cookieTex = lazy(() =>
  pixelTex(
    'sweets/cookie-top',
    512,
    512,
    (u, v, col, b) => {
      const x = (u - 0.5) * 2, z = (v - 0.5) * 2;
      const rho = Math.hypot(x, z) / 0.87; // planar uvs span 1.15 x radius
      const n = tfbm(u, v, 10, 10, 3, 4);
      // crackle: thin ridges of a warped cell pattern
      const wu = u + tfbm(u, v, 6, 6, 9, 2) * 0.03, wv = v + tfbm(u, v, 6, 6, 11, 2) * 0.03;
      const c1 = Math.abs(tnoise(wu, wv, 9, 9, 21)), c2 = Math.abs(tnoise(wu, wv, 17, 17, 22));
      const crack = Math.max(sstep(0.07, 0.0, c1), sstep(0.05, 0.0, c2) * 0.6) * sstep(0.95, 0.6, rho);
      setc(col, rgb('#e4ad62'));
      mixc(col, rgb('#f0c47e'), sstep(0.7, 0.1, rho) * 0.55);
      mixc(col, rgb('#b8743a'), sstep(0.72, 1.0, rho) * 0.75);
      mixc(col, rgb('#c98a46'), Math.max(0, n) * 0.5);
      mixc(col, rgb('#a8642c'), crack * 0.7);
      mulc(col, 1 + tnoise(u, v, 96, 96, 5) * 0.05);
      b[0] = 0.55 + n * 0.25 - crack * 0.4;
    },
    {
      bump: true,
      post: (ctx, w, h) => {
        speckleDots(ctx, w, h, '#8a4f22', 140, 7);
        speckleDots(ctx, w, h, '#fbe0a8', 80, 8);
      },
    },
  ),
);

function speckleDots(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, n: number, seed: number) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = r.range(0.3, 0.7);
    ellipse(ctx, r.next() * w, r.next() * h, r.range(0.8, 2), r.range(0.6, 1.4), r.range(0, 3));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const cookieMat = lazy(() => {
  const t = cookieTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 3, roughness: 0.72, flesh: COOKIE.flesh, cookColor: COOKIE.cooked, name: 'cookie' });
});
const cookieFleshMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: drawTex(
      'sweets/cookie-crumb',
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#e6bd7c';
        ctx.fillRect(0, 0, w, h);
        const r = rng(3);
        mottleT(ctx, w, h, '#f2d098', r, 30, [w * 0.04, w * 0.12], [0.3, 0.5]);
        mottleT(ctx, w, h, '#c8904c', r, 26, [w * 0.03, w * 0.1], [0.2, 0.4]);
        ctx.fillStyle = '#4a2614';
        for (let i = 0; i < 6; i++) blob(ctx, r, r.next() * w, r.next() * h, r.range(5, 9), 4);
      },
      { wrap: true },
    ),
    roughness: 0.8,
    flesh: COOKIE.flesh,
    cookColor: COOKIE.cooked,
    name: 'cookie-crumb',
  }),
);
const chipMat = lazy(() => foodMat({ color: '#43230f', roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, flesh: '#3a1d0c', cookColor: '#1e0f08', name: 'choc-chip' }));
const chipGeo = lazy(() => noisify(new THREE.IcosahedronGeometry(1, 1), 0.16, 1.6, 2));

/** Top height of the cookie profile at radius rr (upper surface). */
function cookieTopY(rr: number): number {
  const top = COOKIE_PROFILE.filter(([, y]) => y > 0.0058);
  for (let i = 1; i < top.length; i++) {
    const [r0, y0] = top[i - 1], [r1, y1] = top[i];
    if ((rr <= r0 && rr >= r1) || (rr >= r0 && rr <= r1)) return y0 + ((y1 - y0) * (rr - r0)) / (r1 - r0 || 1);
  }
  return 0.0146;
}

interface CookieShape {
  seed: number;
  ph: number;
  chips: { p: V3; rot: V3; s: V3; a: number }[];
}

function cookieShape(r: Rng): CookieShape {
  const seed = r.range(0, 40), ph = r.range(0, TAU);
  const chips: CookieShape['chips'] = [];
  const n = r.int(10, 13);
  for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
    const edge = k < 3;
    const rr = edge ? CK_R * r.range(0.88, 0.95) : Math.sqrt(r.next()) * CK_R * 0.82;
    const a = r.range(0, TAU);
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    if (chips.some((c) => Math.hypot(c.p[0] - x, c.p[2] - z) < 0.0105)) continue;
    const sz = r.range(0.0034, 0.0048);
    const y = edge ? r.range(0.006, 0.009) : cookieTopY(rr) - sz * 0.25;
    chips.push({ p: [x, y, z], rot: [r.range(0, 3), r.range(0, 3), r.range(0, 3)], s: [sz * r.range(1, 1.25), sz * r.range(0.7, 0.9), sz], a });
    k++;
  }
  return { seed, ph, chips };
}

function cookieMap(c: CookieShape) {
  return (_j: number, th: number, rr: number, y: number): [number, number] => {
    const k = 1 + 0.035 * fbm3(Math.cos(th) * 1.5 + c.seed, Math.sin(th) * 1.5, c.seed * 0.2, 2) + 0.012 * Math.sin(5 * th + c.ph);
    const bump = 0.0011 * fbm3(Math.sin(th) * rr * 110 + c.seed, Math.cos(th) * rr * 110, 3, 2) * sstep(0.008, 0.012, y);
    return [rr * k, y + bump];
  };
}

/** The cookie between angles th0..th1 (whole when the arc is a full turn), with exact cut faces. */
function cookieWedge(c: CookieShape, th0: number, th1: number): THREE.Group {
  const span = th1 - th0;
  const full = span >= TAU - 1e-6;
  const map = cookieMap(c);
  const g = new THREE.Group();
  const body = revolve(COOKIE_PROFILE, { segments: Math.max(4, Math.round((44 * span) / TAU)), phiStart: th0, phiLength: span, uv: 'planar', map });
  g.add(mesh(body, cookieMat(), { skin: true, name: 'cookie' }));
  if (!full) {
    const R = Math.max(...COOKIE_PROFILE.map((p) => p[0])), H = COOKIE_PROFILE[COOKIE_PROFILE.length - 1][1];
    const face = (th: number) => COOKIE_PROFILE.map(([rr, y], j) => map(j, th, rr, y));
    g.add(mesh(merge([sideFace(face(th0), th0, false, R, H), sideFace(face(th1), th1, true, R, H)]), cookieFaceMat(), { name: 'cookie-cut' }));
  }
  const chips = c.chips.filter((ch) => full || angIn(ch.a, th0, th1, 0.06)).map((ch) => placed(chipGeo(), ch.p, ch.rot, ch.s));
  if (chips.length) g.add(mesh(smoothNormals(merge(chips)), chipMat(), { name: 'chips' }));
  return g;
}

function cookieObject(r: Rng): THREE.Group {
  return cookieWedge(cookieShape(r), 0, TAU);
}

function buildCookie(r: Rng): THREE.Object3D {
  const g = cookieObject(r);
  g.rotation.y = r.range(0, TAU);
  return sitOnGround(group(g));
}

/** Crumb with chocolate chunks (canvas x = -R..R, y = top..bottom). */
function cookieSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#e8c184';
  ctx.fillRect(0, 0, w, h);
  const r = rng(13);
  mottleT(ctx, w, h, '#f4d69e', r, 40, [w * 0.02, w * 0.06], [0.4, 0.6]);
  mottleT(ctx, w, h, '#c99350', r, 30, [w * 0.015, w * 0.05], [0.25, 0.45]);
  // air pockets
  for (let i = 0; i < 40; i++) {
    const x = r.next() * w, y = r.range(0.15, 0.9) * h;
    ctx.fillStyle = rgba('#b97e3e', 0.45);
    ellipse(ctx, x, y, r.range(1.2, 3.5), r.range(0.8, 2));
    ctx.fill();
  }
  // baked crust along the top and bottom (follows the face profile)
  const R = Math.max(...COOKIE_PROFILE.map((p) => p[0]));
  const H = COOKIE_PROFILE[COOKIE_PROFILE.length - 1][1];
  for (let px = 0; px < w; px += 2) {
    const rr = Math.abs((px / w) * 2 - 1) * R;
    const topY = Math.min(H, cookieTopY(rr));
    const yTop = h * (1 - topY / H);
    const gr = ctx.createLinearGradient(0, yTop, 0, yTop + h * 0.22);
    gr.addColorStop(0, 'rgba(176,108,48,0.95)');
    gr.addColorStop(1, 'rgba(176,108,48,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(px, yTop - 2, 2, h * 0.22);
  }
  const gb = ctx.createLinearGradient(0, h, 0, h * 0.8);
  gb.addColorStop(0, 'rgba(170,100,45,0.9)');
  gb.addColorStop(1, 'rgba(170,100,45,0)');
  ctx.fillStyle = gb;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  // chocolate chunks
  for (let i = 0; i < 9; i++) {
    const x = r.range(0.06, 0.94) * w, y = r.range(0.3, 0.75) * h, s = r.range(5, 9);
    ctx.fillStyle = '#3c1e0e';
    blob(ctx, r, x, y, s, 5);
    ctx.fillStyle = 'rgba(120,70,40,0.6)';
    blob(ctx, r, x - s * 0.2, y - s * 0.25, s * 0.35, 3);
  }
}

const cookieFaceMat = lazy(() => sectionVMaterial('sweets/cookie-face', cookieSectionV, 0.0146 / (2 * 0.0452), COOKIE.flesh, COOKIE.cooked ?? '#7a4a1a', 0.8));

/** Halves / quarters / chunks: real wedges of one cookie (chips stay where they were). */
function cookieCut(r: Rng, n: number, chunks = 0): THREE.Object3D {
  const c = cookieShape(r);
  const make = (a: number, b: number) => cookieWedge(c, a, b);
  return sitOnGround(chunks ? heapWedges(make, n, chunks, r, CK_R * 0.5, 0.026, 0.75) : fanWedges(make, n, r, n === 2 ? 0.006 : 0.0045));
}

function cookiePile(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  const spots: [number, number, number, number, number][] = [
    [-0.024, 0, -0.006, 0.04, 0.02],
    [0.022, 0, 0.004, -0.03, -0.02],
    [0.0, 0.0105, 0.004, 0.08, 0.06],
  ];
  for (const [x, y, z, rx, rz] of spots) {
    const c = cookieObject(r);
    c.scale.setScalar(0.72);
    c.position.set(x + r.range(-0.002, 0.002), y, z + r.range(-0.002, 0.002));
    c.rotation.set(rx, r.range(0, TAU), rz);
    g.add(c);
  }
  return sitOnGround(g);
}

// =============================================================================================
// DONUT: pink glaze with sprinkles
// =============================================================================================

const DONUT = colors('donut');
const DN_RM = 0.0355, DN_A = 0.0195, DN_B = 0.0175;

function donutPoint(phi: number): [number, number] {
  const s = Math.sin(phi), c = Math.cos(phi);
  const ys = Math.sign(s) * Math.pow(Math.abs(s), s < 0 ? 0.62 : 0.85);
  const xs = Math.sign(c) * Math.pow(Math.abs(c), 0.85);
  return [DN_RM + DN_A * xs, DN_B + DN_B * ys];
}

/** Closed loop (ring), counter-clockwise from the bottom: outer side, top, inner side. */
const DONUT_PROFILE: Profile = (() => {
  const pts: Profile = [];
  const n = 32;
  for (let i = 0; i <= n; i++) pts.push(donutPoint(-Math.PI / 2 + (i / n) * TAU));
  pts[n] = [pts[0][0], pts[0][1]];
  return pts;
})();

const donutTex = lazy(() =>
  canvasTexture(
    64,
    256,
    (ctx, w, h) => {
      // v (canvas bottom -> top) runs bottom -> outer equator -> top -> inner equator -> bottom
      const g = ctx.createLinearGradient(0, h, 0, 0);
      const stops: [number, string][] = [
        [0, '#c9853c'],
        [0.17, '#d99a4a'],
        [0.25, '#f2d29a'],
        [0.33, '#d99a4a'],
        [0.5, '#c88638'],
        [0.67, '#d99a4a'],
        [0.75, '#f0cf96'],
        [0.83, '#d99a4a'],
        [1, '#c9853c'],
      ];
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = rng(7);
      mottleT(ctx, w, h, '#e8b46a', r, 30, [w * 0.1, w * 0.3], [0.2, 0.4], 0.5);
      specksT(ctx, w, h, '#a8682c', r, 60, [0.5, 1], 0.3);
    },
    { key: 'sweets/donut-body', wrap: true },
  ),
);
const donutMat = lazy(() => foodMat({ color: '#ffffff', map: donutTex(), bumpMap: bumpNoiseTexture('sweets/donut-bump', 30), bumpScale: 0.8, roughness: 0.62, sheen: 0.3, sheenColor: '#ffe7c2', flesh: DONUT.flesh, cookColor: DONUT.cooked, name: 'donut' }));
const glazeMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.07, flesh: DONUT.flesh, cookColor: '#b8607a', name: 'donut-glaze' }));

const donutBodyGeo = lazy(() => smoothNormals(latheGeometry(DONUT_PROFILE, 44)));

interface DonutShape {
  ph: number;
  ph2: number;
  seed: number;
  drips: [number, number, number][];
}

function donutShape(r: Rng): DonutShape {
  return {
    ph: r.range(0, TAU),
    ph2: r.range(0, TAU),
    seed: r.range(0, 30),
    drips: Array.from({ length: 7 }, () => [r.range(0, TAU), r.range(0.15, 0.4), r.range(0.12, 0.25)] as [number, number, number]),
  };
}

/** The donut between angles th0..th1 (whole for a full turn): body, drippy glaze shell, sprinkles, cut faces. */
function donutWedge(p: DonutShape, th0: number, th1: number, r: Rng): THREE.Group {
  const span = th1 - th0;
  const full = span >= TAU - 1e-6;
  const g = new THREE.Group();
  const body = full ? donutBodyGeo() : smoothNormals(latheGeometry(DONUT_PROFILE, Math.max(4, Math.round((44 * span) / TAU)), th0, span));
  g.add(mesh(body, donutMat(), { skin: true, name: 'donut' }));
  const lo = (th: number) => {
    let d = 0.08 + 0.07 * Math.sin(th * 5 + p.ph);
    for (const [c, depth, wid] of p.drips) {
      const dd = Math.atan2(Math.sin(th - c), Math.cos(th - c)) / wid;
      d -= depth * Math.exp(-dd * dd * 2.5);
    }
    return d;
  };
  const hi = (th: number) => Math.PI - 0.42 + 0.12 * Math.sin(th * 4 + p.ph2);
  const nT = Math.max(4, Math.round((64 * span) / TAU)), nS = 12;
  const glaze = paramSurface(nT, nS, (u, v, out) => {
    const th = full && u === 1 ? th0 : th0 + span * u;
    const phi = lo(th) + (hi(th) - lo(th)) * v;
    const [pr, py] = donutPoint(phi);
    const e = 1e-3;
    const [ar, ay] = donutPoint(phi - e), [br, by] = donutPoint(phi + e);
    let nr = by - ay, ny = -(br - ar);
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    const t = 0.0017 * (0.45 + 0.55 * Math.pow(Math.sin(Math.PI * v), 0.4)) * (1 + 0.15 * fbm3(Math.cos(th) * 2 + p.seed, v * 3, 0, 2));
    const rr = pr + nr * t, yy = py + ny * t;
    out.set(Math.sin(th) * rr, yy, Math.cos(th) * rr);
  }, true);
  const cHi = new THREE.Color('#ff9fc2'), cLo = new THREE.Color('#ef7aa6');
  paintVertices(glaze, (q) => cLo.clone().lerp(cHi, sstep(DN_B * 1.4, DN_B * 2.05, q.y)));
  g.add(mesh(glaze, glazeMat(), { name: 'glaze' }));
  const spr = sprinklesOn(glaze, r, Math.round((46 * span) / TAU), 0.45, (q) => {
    const rr = Math.hypot(q.x, q.z);
    return rr > DN_RM - DN_A * 0.55 && rr < DN_RM + DN_A * 0.8 && (full || angIn(Math.atan2(q.x, q.z), th0, th1, 0.06));
  });
  if (spr) g.add(mesh(spr, sprinkleMat(), { name: 'sprinkles' }));
  if (!full) {
    const R = DN_RM + DN_A, H = 2 * DN_B;
    const loop = DONUT_PROFILE.slice(0, -1);
    g.add(mesh(merge([sideFace(loop, th0, false, R, H), sideFace(loop, th1, true, R, H)]), donutFaceMat(), { name: 'donut-cut' }));
  }
  return g;
}

function donutObject(r: Rng): THREE.Group {
  return donutWedge(donutShape(r), 0, TAU, r);
}

function buildDonut(r: Rng): THREE.Object3D {
  const g = donutObject(r);
  g.rotation.y = r.range(0, TAU);
  return sitOnGround(group(g));
}

/** Cut face of the ring: fluffy crumb, golden crust, a band of pink glaze on top. */
function donutSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.createImageData(w, h);
  const R = DN_RM + DN_A, H = 2 * DN_B;
  const crumb = rgb('#f7e2b8'), crumbD = rgb('#e8c58c'), crust = rgb('#d0903f'), glaze = rgb('#f585ae');
  const col = [0, 0, 0];
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const x = ((px + 0.5) / w) * 2 - 1;
      const rr = Math.abs(x) * R, y = H * (1 - (py + 0.5) / h);
      const qx = (rr - DN_RM) / DN_A, qy = (y - DN_B) / DN_B;
      const q = Math.hypot(qx, qy);
      const phi = Math.atan2(qy, qx);
      const n = tnoise(px / w, py / h, 32, 8, 3) * 0.5 + tnoise(px / w, py / h, 64, 16, 4) * 0.5;
      setc(col, crumb);
      mixc(col, crumbD, clamp01(n * 0.8 + 0.2) * 0.6);
      // little air holes
      if (n > 0.55) mulc(col, 0.86);
      mixc(col, crust, sstep(0.78, 0.92, q));
      const glazed = phi > 0.12 && phi < Math.PI - 0.45;
      if (glazed) mixc(col, glaze, sstep(0.86, 0.94, q));
      const i = (py * w + px) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

const donutFaceMat = lazy(() => sectionVMaterial('sweets/donut-face', donutSectionV, (2 * DN_B) / (2 * (DN_RM + DN_A)), DONUT.flesh, DONUT.cooked ?? '#7a4a1a', 0.7));

function donutCut(r: Rng, n: number, chunks = 0): THREE.Object3D {
  const p = donutShape(r);
  const make = (a: number, b: number) => donutWedge(p, a, b, r);
  return sitOnGround(chunks ? heapWedges(make, n, chunks, r, DN_RM, 0.03, 0.85) : fanWedges(make, n, r, n === 2 ? 0.007 : 0.005));
}

// =============================================================================================
// LOLLIPOP: a glossy rainbow swirl on a paper stick with a ribbon
// =============================================================================================

const CANDY = colors('candy');
const LP_R = 0.029, LP_T = 0.011;
const LOLLY_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.018, 0.0002],
    [0.0252, 0.0012],
    [0.0284, 0.0035],
    [0.029, 0.0055],
    [0.0284, 0.0075],
    [0.0252, 0.0098],
    [0.018, 0.0108],
    [0.0001, 0.011],
  ],
  16,
);

const SWIRL = [rgb('#f04aa0'), rgb('#fff4fa'), rgb('#ffd23f'), rgb('#fff4fa'), rgb('#4fc8e8'), rgb('#fff4fa'), rgb('#7edc8a'), rgb('#fff4fa')];
const swirlTex = lazy(() =>
  pixelTex('sweets/lolly-swirl', 512, 512, (u, v, col) => {
    const x = (u - 0.5) * 2, z = (v - 0.5) * 2;
    const rho = Math.hypot(x, z) / 0.87;
    const a = Math.atan2(z, x);
    const t = (a / TAU) * 4 + rho * 2.2;
    const k = ((t % 1) + 1) % 1;
    const band = Math.floor((((t * 2) % SWIRL.length) + SWIRL.length) % SWIRL.length);
    const f = ((t * 2) % 1 + 1) % 1;
    const c0 = SWIRL[band], c1 = SWIRL[(band + 1) % SWIRL.length];
    setc(col, c0);
    mixc(col, c1, sstep(0.86, 1, f));
    // a little sugary sparkle + soft centre
    mulc(col, 1 + 0.04 * tnoise(u, v, 128, 128, 2));
    mixc(col, rgb('#fff6fb'), sstep(0.12, 0, rho) * 0.8);
    void k;
  }).map,
);
const lollyMat = lazy(() =>
  foodMat({ color: '#ffffff', map: swirlTex(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, emissive: '#3a1028', emissiveIntensity: 0.25, flesh: CANDY.flesh, cookColor: CANDY.cooked, name: 'lollipop' }),
);
const stickMat = lazy(() => packMat('lolly-stick', { color: '#fbf8f1', roughness: 0.6, flesh: '#f4efe4' }));
const ribbonMat = lazy(() => packMat('lolly-ribbon', { color: '#8fd5c3', roughness: 0.42, sheen: 0.8, sheenColor: '#e6fff6', sheenRoughness: 0.4, flesh: '#7cc6b2' }));

function buildLollipop(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  const disc = revolve(LOLLY_PROFILE, { segments: 56, uv: 'planar' });
  disc.rotateY(r.range(0, TAU));
  g.add(mesh(disc, lollyMat(), { name: 'lollipop' }));
  const L = 0.08, sr = 0.0021;
  const stick = new THREE.CylinderGeometry(sr, sr, L, 10, 1);
  stick.rotateZ(Math.PI / 2);
  stick.translate(LP_R - 0.012 + L / 2, sr + 0.0002, 0);
  g.add(mesh(stick, stickMat(), { name: 'stick' }));
  // ribbon bow where the stick meets the candy
  const bx = LP_R + 0.0065, by = sr + 0.0004;
  const loop = new THREE.TorusGeometry(0.0042, 0.0013, 6, 16);
  loop.scale(1, 1, 0.55);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(placed(loop, [bx, by + 0.001, s * 0.0046], [Math.PI / 2 - 0.25, s * 0.3, 0]));
    const tail = roundedBox(0.0026, 0.0009, 0.009, 0.0004, 1);
    parts.push(placed(tail, [bx + 0.004, 0.00045, s * 0.0045], [0, s * 0.55, 0]));
  }
  parts.push(placed(new THREE.SphereGeometry(0.0024, 10, 8), [bx, by + 0.0008, 0], [0, 0, 0], [1, 0.8, 1]));
  g.add(mesh(merge(parts), ribbonMat(), { name: 'ribbon' }));
  g.rotation.y = -0.5 + r.range(-0.4, 0.4);
  return sitOnGround(g);
}

// =============================================================================================
// GUMMY BEARS: bright, glossy, translucent-looking
// =============================================================================================

const GUMMY_COLORS = ['#f0453a', '#ff8a1e', '#ffd21e', '#4ccf4a', '#ff5fa8', '#b065f0', '#e8335e'];

const gummyMat = (hex: string) =>
  cmat('gummy:' + hex, () => {
    const c = new THREE.Color(hex);
    const glow = c.clone().multiplyScalar(0.45);
    return foodMat({
      color: hex,
      vertexColors: true,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: '#' + glow.getHexString(),
      emissiveIntensity: 0.55,
      flesh: hex,
      cookColor: '#' + c.clone().multiplyScalar(0.55).getHexString(),
      name: 'gummy',
    });
  });

/** Same gummy look without vertex colours (generic cut forms build plain geometry). */
const gummyPlainMat = lazy(() => {
  const c = new THREE.Color(GUMMY_COLORS[0]);
  return foodMat({ color: GUMMY_COLORS[0], roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#' + c.clone().multiplyScalar(0.45).getHexString(), emissiveIntensity: 0.55, flesh: GUMMY_COLORS[0], cookColor: '#' + c.clone().multiplyScalar(0.55).getHexString(), name: 'gummy' });
});

/** One bear standing up (y), facing +z; overlapping soft ellipsoids merged into one mesh. */
const bearGeo = lazy(() => {
  const parts: THREE.BufferGeometry[] = [];
  const ell = (c: V3, rad: V3, ws: number, hs: number, shade: number, rot: V3 = [0, 0, 0]) => {
    const s = new THREE.SphereGeometry(1, ws, hs);
    parts.push(vcol(placed(s, c, rot, rad), new THREE.Color(shade, shade, shade)));
  };
  ell([0, 0.0074, 0], [0.0058, 0.0069, 0.0037], 14, 10, 0.84); // belly
  ell([0, 0.0153, 0.0002], [0.0052, 0.0046, 0.0036], 14, 10, 0.9); // head
  for (const s of [-1, 1]) {
    ell([s * 0.0037, 0.0192, -0.0003], [0.0019, 0.0018, 0.0012], 8, 6, 1); // ears
    ell([s * 0.0053, 0.0099, 0.0008], [0.0018, 0.0027, 0.0017], 8, 6, 1, [0, 0, s * 0.6]); // arms
    ell([s * 0.0032, 0.0026, 0.0009], [0.0024, 0.0023, 0.0019], 8, 6, 1); // feet
  }
  ell([0, 0.0142, 0.0029], [0.002, 0.0016, 0.0012], 8, 6, 1); // snout
  const g = merge(parts);
  g.computeBoundingBox();
  return g;
});

function bear(hex: string): THREE.Mesh {
  return mesh(bearGeo(), gummyMat(hex), { name: 'gummy' });
}

function gummyPiece(r: Rng, i: number): THREE.Object3D {
  const m = bear(GUMMY_COLORS[i % (GUMMY_COLORS.length - 1)]);
  m.rotation.set(-Math.PI / 2 + r.range(-0.1, 0.1), 0, r.range(0, TAU));
  return sitOnGround(group(m));
}

function buildGummies(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  const start = r.int(0, GUMMY_COLORS.length - 1);
  const pick = (k: number) => GUMMY_COLORS[(start + k * 3) % GUMMY_COLORS.length];
  const T = 0.0041; // half thickness of a lying bear
  // bottom layer: lying on their backs / fronts around the middle
  const ring: [number, number][] = [[0, 0], [0.016, 0.005], [-0.015, 0.009], [0.004, -0.017], [-0.013, -0.012], [0.016, -0.013]];
  ring.forEach(([x, z], k) => {
    const m = bear(pick(k));
    const back = r.next() < 0.7;
    m.rotation.set(back ? -Math.PI / 2 : Math.PI / 2, 0, 0);
    const h = new THREE.Group();
    h.add(m);
    h.rotation.set(r.range(-0.06, 0.06), r.range(0, TAU), r.range(-0.06, 0.06));
    h.position.set(x + r.range(-0.002, 0.002), T, z + r.range(-0.002, 0.002));
    g.add(h);
  });
  // a few on top, tilted
  const tops: V3[] = [[-0.006, T * 2.5, 0.004], [0.008, T * 2.6, -0.005], [0.0, T * 3.9, 0.0]];
  tops.forEach(([x, y, z], k) => {
    const m = bear(pick(6 + k));
    m.rotation.set(-Math.PI / 2, 0, 0);
    const h = new THREE.Group();
    h.add(m);
    h.rotation.set(r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3));
    h.position.set(x, y, z);
    g.add(h);
  });
  return sitOnGround(g);
}

// =============================================================================================
// Table
// =============================================================================================

export const MODELS: ModelTable = {
  chocolate: {
    build: buildChocolate,
    sliceShape: chocoSliceShape,
    section: (ctx, s) => chocoSection(ctx, s),
    skin: chocoMat,
    flesh: chocoFleshMat,
    forms: { halved: (r) => chocoHalves(r) },
  },
  marshmallow: {
    build: (r) => buildMarshmallows(r),
    piece: mallowPiece,
    skin: lazy(() => foodMat({ color: '#fde3ea', roughness: 0.8, sheen: 0.7, sheenColor: '#ffffff', flesh: MALLOW.flesh, cookColor: MALLOW.cooked })),
    flesh: lazy(() => foodMat({ color: '#fffafb', roughness: 0.8, sheen: 0.6, sheenColor: '#ffffff', flesh: MALLOW.flesh, cookColor: MALLOW.cooked })),
    variant: (state: FoodState, r: Rng) => (state.form === 'popped' ? buildMarshmallows(r, true) : null),
  },
  cookie: {
    build: buildCookie,
    profile: COOKIE_PROFILE,
    sectionV: (ctx, w, h) => cookieSectionV(ctx, w, h),
    skin: cookieMat,
    flesh: cookieFleshMat,
    forms: {
      pieces: (r) => cookiePile(r),
      halved: (r) => cookieCut(r, 2),
      sliced: (r) => cookieCut(r, 4),
      diced: (r) => cookieCut(r, 8, 7),
    },
  },
  donut: {
    build: buildDonut,
    profile: DONUT_PROFILE,
    sectionV: (ctx, w, h) => donutSectionV(ctx, w, h),
    skin: donutMat,
    flesh: lazy(() => foodMat({ color: DONUT.flesh, roughness: 0.75, flesh: DONUT.flesh, cookColor: DONUT.cooked })),
    forms: {
      halved: (r) => donutCut(r, 2),
      sliced: (r) => donutCut(r, 4),
      diced: (r) => donutCut(r, 9, 7),
    },
  },
  candy: {
    build: buildLollipop,
    skin: lollyMat,
    flesh: lollyMat,
  },
  gummy: {
    build: buildGummies,
    piece: gummyPiece,
    skin: gummyPlainMat,
    flesh: gummyPlainMat,
  },
};

