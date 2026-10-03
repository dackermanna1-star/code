// Dairy & egg models: egg (raw cracked puddle, boiled halves / slices / chopped, peeled), milk
// carton, cheese wedge (real carved holes), mozzarella ball, butter block in half-opened paper,
// yogurt cup with a peeled-back lid, cream carton and a strawberry ice cream cone.
//
// Packaging (cartons, cup, lid, paper) uses foodMat({ food: false, cookAmount: 0 }) except the
// milk / cream cartons, which stand for the liquid itself and only brown a little.

import * as THREE from 'three';
import type { ModelTable, SectionOpts } from './types';
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
  roundedBox,
  paintVertices,
  profileRadiusAt,
  bumpNoiseTexture,
} from './kit';
import { pixelTex, paramSurface, flipWinding, tfbm, tnoise, sstep, clamp01, rgb, setc, mixc, mulc } from './bakery';
import { mottleT, specksT, rgba, mixHex, slabGeometry } from './meat';
import { revolve, fillet } from './containers';

// =============================================================================================
// Local helpers
// =============================================================================================

const TAU = Math.PI * 2;
const FONT = '"Trebuchet MS", "Verdana", "DejaVu Sans", sans-serif';
const colors = (id: string) => getDef(id).colors;
type V2 = [number, number];
type V3 = [number, number, number];

const matCache = new Map<string, THREE.Material>();
function cmat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

/** Non-food packaging material (never browns, burns or takes sauce). */
function packMat(key: string, p: Parameters<typeof foodMat>[0]): THREE.Material {
  return cmat('pack:' + key, () => foodMat({ ...p, food: false, cookAmount: 0, name: key }));
}

function vcol(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  return paintVertices(g, () => c);
}

/** Clone with a baked position / euler rotation / scale. */
function placed(g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scale: number | V3 = 1): THREE.BufferGeometry {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), s);
  return g.clone().applyMatrix4(m);
}

/** Replace the v of a lathe's UVs with a function of height (keeps u, so the seam stays closed). */
function uvVByHeight(g: THREE.BufferGeometry, fn: (y: number) => number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setY(i, fn(pos.getY(i)));
  uv.needsUpdate = true;
  return g;
}

/** Soft blob of colour on a canvas. */
function softDot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Organic blob (cow spot / fruit chunk) made of a few overlapping circles. */
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

/** A cute strawberry (canvas units, ~h tall, centred). */
function drawStrawberry(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = h * 0.86;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.bezierCurveTo(-w * 0.5, h * 0.25, -w * 0.62, -h * 0.25, -w * 0.3, -h * 0.36);
  ctx.bezierCurveTo(-w * 0.12, -h * 0.42, w * 0.12, -h * 0.42, w * 0.3, -h * 0.36);
  ctx.bezierCurveTo(w * 0.62, -h * 0.25, w * 0.5, h * 0.25, 0, h * 0.5);
  const g = ctx.createRadialGradient(-w * 0.15, -h * 0.12, h * 0.05, 0, 0, h * 0.6);
  g.addColorStop(0, '#ff6b7f');
  g.addColorStop(1, '#e02a46');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#ffe58a';
  for (let row = 0; row < 4; row++)
    for (let k = -2; k <= 2; k++) {
      const sx = k * w * 0.16 + (row % 2) * w * 0.08, sy = -h * 0.18 + row * h * 0.16;
      if (Math.abs(sx) > w * (0.42 - row * 0.07)) continue;
      ellipse(ctx, sx, sy, h * 0.02, h * 0.032);
      ctx.fill();
    }
  // leaves
  ctx.fillStyle = '#5fbf5a';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.55;
    ctx.save();
    ctx.translate(0, -h * 0.36);
    ctx.rotate(a + Math.PI / 2);
    ellipse(ctx, 0, -h * 0.1, h * 0.06, h * 0.13);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#4a9a44';
  ctx.fillRect(-h * 0.02, -h * 0.58, h * 0.04, h * 0.16);
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ellipse(ctx, -w * 0.22, -h * 0.12, h * 0.05, h * 0.1, 0.4);
  ctx.fill();
  ctx.restore();
}

// =============================================================================================
// EGG
// =============================================================================================

const EGG = colors('egg');
const EGG_H = 0.058;
const EGG_R = 0.0216;

/** Upright egg: blunt end at the bottom (y = 0), pointier top. */
function eggProfile(H: number, R: number, k: number, n = 30): Profile {
  const pts: Profile = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    pts.push([Math.max(0.0001, R * Math.sin(t) * (1 + k * Math.cos(t))), (H / 2) * (1 - Math.cos(t))]);
  }
  return pts;
}
const EGG_PROFILE = eggProfile(EGG_H, EGG_R, 0.12);

const EGG_TINTS = ['#f3dcbb', '#f7e9d6', '#ecd0a6'];
const eggShellMat = (i: number) =>
  cmat('egg-shell-' + i, () => {
    const tint = EGG_TINTS[i];
    const map = canvasTexture(
      512,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);
        const r = rng(11 + i);
        mottleT(ctx, w, h, '#fffaf2', r, 46, [w * 0.03, w * 0.08], [0.16, 0.3], 2);
        mottleT(ctx, w, h, mixHex(tint, '#c99a6a', 0.45), r, 40, [w * 0.025, w * 0.07], [0.06, 0.13], 2);
        specksT(ctx, w, h, '#b0835a', r, 90, [0.5, 1.1], 0.26, 1.8);
        specksT(ctx, w, h, '#8f6040', r, 18, [0.7, 1.4], 0.28, 1.8);
      },
      { key: 'dairy/egg-shell-' + i, wrap: true },
    );
    return foodMat({ color: '#ffffff', map, bumpMap: bumpNoiseTexture('dairy/egg-bump', 70), bumpScale: 0.18, roughness: 0.52, flesh: EGG.flesh, cookColor: '#c99a62', cookAmount: 0.6, name: 'egg-shell' });
  });

const eggWhiteTex = lazy(() =>
  canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbfaf4';
      ctx.fillRect(0, 0, w, h);
      const r = rng(4);
      mottleT(ctx, w, h, '#ffffff', r, 30, [w * 0.05, w * 0.14], [0.3, 0.5]);
      mottleT(ctx, w, h, '#ece9dc', r, 24, [w * 0.04, w * 0.12], [0.12, 0.25]);
    },
    { key: 'dairy/egg-white', wrap: true },
  ),
);
/** Shiny cooked egg white (peeled egg, outside of boiled halves / slices). */
const eggWhiteMat = lazy(() =>
  foodMat({ color: '#ffffff', map: eggWhiteTex(), roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: '#ffffff', sheenRoughness: 0.5, flesh: '#fdfcf6', cookColor: '#d9ae6a', cookAmount: 0.8, name: 'egg-white' }),
);
const eggYolkCookedMat = lazy(() => foodMat({ color: '#fcc63a', roughness: 0.7, flesh: '#fcc63a', cookColor: '#d99a2a', cookAmount: 0.5, name: 'egg-yolk-cooked' }));

const eggGeo = lazy(() => smoothNormals(latheGeometry(EGG_PROFILE, 40)));

/** Lay an upright egg-like mesh on its side (pointy end towards +x, slightly raised). */
function lieDown(m: THREE.Object3D, r: Rng): THREE.Group {
  m.rotation.z = -Math.PI / 2 + r.range(0.02, 0.07);
  const yaw = new THREE.Group();
  yaw.add(m);
  yaw.rotation.y = 0.35 + r.range(-0.5, 0.5);
  return yaw;
}

function buildEgg(r: Rng): THREE.Object3D {
  const s = r.range(0.96, 1.04);
  const m = mesh(eggGeo(), eggShellMat(r.int(0, EGG_TINTS.length - 1)), { skin: true, name: 'egg' });
  m.scale.set(s, s * r.range(0.97, 1.04), s);
  return sitOnGround(lieDown(m, r));
}

const peeledEggGeo = lazy(() => {
  const g = latheGeometry(EGG_PROFILE.map(([rr, y]) => [rr * 0.97, y * 0.975] as [number, number]), 40);
  return noisify(g, 0.00025, 260, 3);
});

function buildPeeledEgg(r: Rng): THREE.Object3D {
  const m = mesh(peeledEggGeo(), eggWhiteMat(), { name: 'egg-peeled' });
  const s = r.range(0.97, 1.03);
  m.scale.setScalar(s);
  return sitOnGround(lieDown(m, r));
}

/** Slice disc of a boiled egg: white ring + crumbly yolk. */
function eggSection(ctx: CanvasRenderingContext2D, s: number) {
  const R = s / 2;
  const g = ctx.createRadialGradient(R, R, R * 0.55, R, R, R);
  g.addColorStop(0, '#fdfdf8');
  g.addColorStop(0.85, '#f9f8f1');
  g.addColorStop(1, '#eceadf');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(R, R, R, 0, TAU);
  ctx.fill();
  eggYolkDisc(ctx, R, R * 1.02, R * 0.58, 7);
}

function eggYolkDisc(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, seed: number) {
  // a faint shadow ring in the white, then the yolk
  softDot(ctx, x, y, rad * 1.18, rad * 1.18, '#e9e2c8', 0.5);
  const yg = ctx.createRadialGradient(x - rad * 0.2, y - rad * 0.25, rad * 0.1, x, y, rad);
  yg.addColorStop(0, '#ffdc68');
  yg.addColorStop(0.65, '#fcc63a');
  yg.addColorStop(1, '#f3ae26');
  ctx.fillStyle = yg;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  const r = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.97, 0, TAU);
  ctx.clip();
  for (let i = 0; i < 70; i++) {
    const [dx, dy] = r.disc();
    softDot(ctx, x + dx * rad, y + dy * rad, rad * r.range(0.04, 0.1), rad * r.range(0.04, 0.1), r.next() < 0.5 ? '#ffe68f' : '#e8a020', r.range(0.25, 0.5));
  }
  ctx.restore();
  ctx.lineWidth = Math.max(1, rad * 0.04);
  ctx.strokeStyle = 'rgba(214,140,30,0.45)';
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.stroke();
}

/** Lengthwise face of a halved boiled egg (canvas x = -R..R, y = top..bottom). */
function eggSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#f9f8f1';
  ctx.fillRect(0, 0, w, h);
  // white, slightly darker towards the outline
  const R = Math.max(...EGG_PROFILE.map((p) => p[0]));
  for (let py = 0; py < h; py += 2) {
    const y = EGG_H * (1 - py / h);
    const rr = profileRadiusAt(EGG_PROFILE, y) / R;
    const half = (w / 2) * rr;
    const g = ctx.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    g.addColorStop(0, '#ebe9dd');
    g.addColorStop(0.12, '#fbfbf6');
    g.addColorStop(0.88, '#fbfbf6');
    g.addColorStop(1, '#ebe9dd');
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - half, py, half * 2, 2);
  }
  const k = w / (2 * R); // px per metre (isotropic)
  eggYolkDisc(ctx, w / 2, h * (1 - 0.45), 0.0122 * k, 9);
}

/** Raw egg out of its shell: a glossy pale puddle with a domed yolk. */
const rawWhiteMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, flesh: '#f8f5ea', cookColor: '#fffdf6', name: 'egg-raw-white' }),
);
const rawYolkMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, flesh: '#ffc040', cookColor: '#f6be4a', name: 'egg-raw-yolk' }),
);

function crackedEgg(r: Rng): THREE.Object3D {
  const seed = r.range(0, 50);
  const yx = r.range(-0.007, 0.007), yz = r.range(-0.006, 0.006);
  const R0 = r.range(0.042, 0.047);
  const lobes = r.int(3, 5);
  const ph = r.range(0, TAU);
  const outline = (a: number) => R0 * (1 + 0.09 * Math.sin(lobes * a + ph) + 0.1 * fbm3(Math.cos(a) * 1.2 + seed, Math.sin(a) * 1.2, seed * 0.3, 2));
  const thick = (x: number, z: number) => {
    const d = Math.hypot(x - yx, z - yz);
    return 0.0026 + 0.0042 * sstep(0.027, 0.009, d);
  };
  const white = slabGeometry({ outline, thickness: thick, edge: 0.0035, edgePow: 0.6, segments: 60, rings: 9, edgeRings: 6, uv: 'polar' });
  const cThin = new THREE.Color('#e9e2cd'), cThick = new THREE.Color('#fcfaf3');
  paintVertices(white, (p) => cThin.clone().lerp(cThick, sstep(0.032, 0.012, Math.hypot(p.x - yx, p.z - yz))));
  const yr = r.range(0.0138, 0.0152);
  const yolk = new THREE.SphereGeometry(yr, 30, 14, 0, TAU, 0, Math.PI / 2);
  yolk.scale(1, 0.8, 1);
  const cTop = new THREE.Color('#ffc534'), cBase = new THREE.Color('#ff9a0e');
  paintVertices(yolk, (p) => cBase.clone().lerp(cTop, sstep(0, yr * 0.75, p.y)));
  yolk.translate(yx, thick(yx, yz) - 0.0018, yz);
  return sitOnGround(group(mesh(white, rawWhiteMat(), { name: 'egg-white' }), mesh(yolk, rawYolkMat(), { name: 'egg-yolk' })));
}

/** Chopped boiled egg: shiny white chunks and crumbly yolk bits. */
function choppedEgg(r: Rng): THREE.Object3D {
  const whites: THREE.BufferGeometry[] = [];
  const yolks: THREE.BufferGeometry[] = [];
  const chunk = roundedBox(1, 1, 1, 0.3, 1);
  const crumb = noisify(new THREE.IcosahedronGeometry(1, 1), 0.12, 2.2, 4);
  const R = 0.024;
  const n = 17;
  for (let i = 0; i < n; i++) {
    const [dx, dz] = r.disc();
    const d = Math.hypot(dx, dz);
    const s = r.range(0.0085, 0.0125);
    const layer = i > n * 0.7 ? 1 : 0;
    whites.push(placed(chunk, [dx * R, s * 0.42 + layer * 0.006 + (1 - d) * 0.003, dz * R], [r.range(-0.4, 0.4), r.range(0, TAU), r.range(-0.4, 0.4)], [s * r.range(0.8, 1.2), s * r.range(0.6, 0.85), s * r.range(0.8, 1.15)]));
  }
  for (let i = 0; i < 11; i++) {
    const [dx, dz] = r.disc();
    const s = r.range(0.0032, 0.0055);
    yolks.push(placed(crumb, [dx * R * 0.85, 0.006 + r.range(0, 0.007), dz * R * 0.85], [r.range(0, 3), r.range(0, 3), r.range(0, 3)], [s, s * 0.8, s]));
  }
  return sitOnGround(group(mesh(merge(whites), eggWhiteMat()), mesh(merge(yolks), eggYolkCookedMat())));
}

// =============================================================================================
// CARTONS (milk, cream): retro gable-top cartons with a canvas-painted label
// =============================================================================================

interface Ring {
  x: number[];
  z: number[];
  s: number[]; // arc length
  P: number; // perimeter
  sFront: number;
  sLeft: number;
  sRight: number;
}

/**
 * Rounded rectangle ring (half sizes a along x, b along z, corner radius rc), starting at the
 * middle of the back face and running so the front face (+z) goes left -> right (-x -> +x).
 */
function cartonRing(a: number, b: number, rc: number): Ring {
  const x: number[] = [], z: number[] = [], s: number[] = [];
  let acc = 0;
  const marks: Record<string, number> = {};
  const line = (x0: number, z0: number, x1: number, z1: number, n: number, name?: string) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (name) marks[name] = acc + len / 2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      x.push(x0 + (x1 - x0) * t);
      z.push(z0 + (z1 - z0) * t);
      s.push(acc + len * t);
    }
    acc += len;
  };
  const corner = (cx: number, cz: number, a0: number, a1: number, n: number) => {
    const len = Math.abs(a1 - a0) * rc;
    for (let i = 0; i < n; i++) {
      const ang = a0 + (a1 - a0) * (i / n);
      x.push(cx + Math.cos(ang) * rc);
      z.push(cz + Math.sin(ang) * rc);
      s.push(acc + len * (i / n));
    }
    acc += len;
  };
  const ia = a - rc, ib = b - rc, nc = 5;
  line(0, -b, -ia, -b, 2);
  corner(-ia, -ib, -Math.PI / 2, -Math.PI, nc);
  line(-a, -ib, -a, ib, 4, 'left');
  corner(-ia, ib, Math.PI, Math.PI / 2, nc);
  line(-ia, b, ia, b, 4, 'front');
  corner(ia, ib, Math.PI / 2, 0, nc);
  line(a, ib, a, -ib, 4, 'right');
  corner(ia, -ib, 0, -Math.PI / 2, nc);
  line(ia, -b, 0, -b, 2);
  x.push(x[0]);
  z.push(z[0]);
  s.push(acc);
  return { x, z, s, P: acc, sFront: marks.front, sLeft: marks.left, sRight: marks.right };
}

interface CartonSpec {
  key: string;
  a: number;
  b: number;
  rc: number;
  bodyH: number;
  roofH: number;
  finH: number;
  tex: [number, number];
  vBody: number;
  cookAmount: number;
  paint: (ctx: CanvasRenderingContext2D, L: CartonLayout) => void;
}

interface CartonLayout {
  W: number;
  H: number;
  ring: Ring;
  bodyH: number;
  vBody: number;
  /** Canvas px for a body position (arc length s, height y). */
  X: (s: number) => number;
  Y: (y: number) => number;
  /** Px per metre along s and along the body height. */
  kx: number;
  ky: number;
  roofPx: number;
}

function cartonLayout(spec: CartonSpec, ring: Ring): CartonLayout {
  const [W, H] = spec.tex;
  const kx = W / ring.P, ky = (H * spec.vBody) / spec.bodyH;
  return { W, H, ring, bodyH: spec.bodyH, vBody: spec.vBody, kx, ky, X: (s) => s * kx, Y: (y) => H - y * ky, roofPx: H * (1 - spec.vBody) };
}

/** Run `draw` in a millimetre frame centred on (s, y) of the carton body (y down on the canvas). */
function mmFrame(ctx: CanvasRenderingContext2D, L: CartonLayout, s: number, y: number, draw: () => void) {
  ctx.save();
  ctx.translate(L.X(s), L.Y(y));
  ctx.scale(L.kx / 1000, L.ky / 1000);
  draw();
  ctx.restore();
}

const cartonCache = new Map<string, { body: THREE.BufferGeometry; mat: THREE.Material }>();

function cartonParts(spec: CartonSpec) {
  const hit = cartonCache.get(spec.key);
  if (hit) return hit;
  const ring = cartonRing(spec.a, spec.b, spec.rc);
  const L = cartonLayout(spec, ring);
  const n = ring.x.length - 1;
  // body rows: rounded bottom edge, straight sides
  const rows: [number, number][] = [[0, 0.93], [0.0011, 0.975], [0.003, 0.997], [0.006, 1], [spec.bodyH * 0.5, 1], [spec.bodyH, 1]];
  const body = paramSurface(n, rows.length - 1, (_u, _v, out, i, j) => out.set(ring.x[i] * rows[j][1], rows[j][0], ring.z[i] * rows[j][1]), true);
  const roofRows = 5;
  const roof = paramSurface(n, roofRows, (_u, _v, out, i, j) => {
    const t = j / roofRows;
    out.set(ring.x[i] * (1 - 0.04 * t), spec.bodyH + spec.roofH * t, ring.z[i] * (1 - t * 0.985));
  }, true);
  const setRingUV = (g: THREE.BufferGeometry, v: (j: number) => number, nv: number) => {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= n; i++) uv.setXY(j * (n + 1) + i, ring.s[i] / ring.P, v(j));
    uv.needsUpdate = true;
  };
  setRingUV(body, (j) => (rows[j][0] / spec.bodyH) * spec.vBody, rows.length - 1);
  setRingUV(roof, (j) => spec.vBody + (1 - spec.vBody) * (j / roofRows) * 0.97, roofRows);
  // bottom cap (fan, facing down)
  const cap: number[] = [];
  const capUV: number[] = [];
  for (let i = 0; i < n; i++) {
    cap.push(0, 0, 0, ring.x[i + 1] * 0.93, 0, ring.z[i + 1] * 0.93, ring.x[i] * 0.93, 0, ring.z[i] * 0.93);
    capUV.push(0.5, 0.02, 0.5, 0.02, 0.5, 0.02);
  }
  const capG = new THREE.BufferGeometry();
  capG.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  capG.setAttribute('uv', new THREE.Float32BufferAttribute(capUV, 2));
  capG.computeVertexNormals();
  // sealed fin on the ridge (samples the plain patch in the canvas corner)
  const finT = 0.0042;
  const fin = roundedBox(spec.a * 2 * 0.95, spec.finH, finT, finT * 0.45, 2);
  fin.translate(0, spec.bodyH + spec.roofH + spec.finH / 2 - 0.0022, 0);
  const fuv = fin.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, 3 / L.W, 1 - 3 / L.H);
  const geo = merge([body, roof, capG, fin]);
  const tex = canvasTexture(L.W, L.H, (ctx) => spec.paint(ctx, L), { key: 'dairy/carton-' + spec.key });
  const mat = foodMat({ color: '#ffffff', map: tex, roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.35, flesh: '#f6f2e8', cookColor: '#b08a5a', cookAmount: spec.cookAmount, name: 'carton-' + spec.key });
  const res = { body: geo, mat };
  cartonCache.set(spec.key, res);
  return res;
}

function buildCarton(spec: CartonSpec, r: Rng): THREE.Object3D {
  const { body, mat } = cartonParts(spec);
  const m = mesh(body, mat, { name: spec.key + '-carton' });
  m.rotation.y = r.range(-0.35, 0.25);
  return sitOnGround(group(m));
}

const COW_INK = '#3b3f58';

function drawCow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COW_INK;
  ctx.lineWidth = 1.1;
  for (const s of [-1, 1]) {
    // horns
    ctx.fillStyle = '#f6e2b4';
    ellipse(ctx, s * 6.2, -12.6, 1.8, 3.4, s * 0.45);
    ctx.fill();
    ctx.stroke();
    // ears
    ctx.save();
    ctx.translate(s * 12.2, -6.5);
    ctx.rotate(s * 0.45);
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, 0, 0, 5.4, 3.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f7a1bf';
    ellipse(ctx, s * 0.6, 0, 3.1, 1.6);
    ctx.fill();
    ctx.restore();
  }
  // head
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, 0, -2.5, 10.8, 11.8);
  ctx.fill();
  ctx.save();
  ellipse(ctx, 0, -2.5, 10.8, 11.8);
  ctx.clip();
  ctx.fillStyle = COW_INK;
  ellipse(ctx, 8.5, -10, 6, 5.2, 0.4);
  ctx.fill();
  ellipse(ctx, -9.5, -1, 3.2, 4.4, 0.2);
  ctx.fill();
  ctx.restore();
  ellipse(ctx, 0, -2.5, 10.8, 11.8);
  ctx.stroke();
  // eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = COW_INK;
    ellipse(ctx, s * 4.3, -4.6, 1.45, 1.95);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, s * 4.3 - 0.45, -5.2, 0.5, 0.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(247,140,170,0.55)';
    ellipse(ctx, s * 7.4, 0.2, 2.1, 1.4);
    ctx.fill();
  }
  // snout
  ctx.fillStyle = '#f9bccc';
  ellipse(ctx, 0, 5.2, 8.6, 5.6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d97b97';
  ellipse(ctx, -3.1, 4.6, 1.15, 1.6, 0.2);
  ctx.fill();
  ellipse(ctx, 3.1, 4.6, 1.15, 1.6, -0.2);
  ctx.fill();
  ctx.strokeStyle = '#c86a86';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 6.6, 2.4, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function paintScallops(ctx: CanvasRenderingContext2D, W: number, yTop: number, yEdge: number, color: string, period: number, amp: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, yTop);
  ctx.lineTo(W, yTop);
  ctx.lineTo(W, yEdge);
  const n = Math.max(1, Math.round(W / period));
  const p = W / n;
  for (let i = n; i > 0; i--) {
    const x0 = i * p, x1 = (i - 1) * p;
    ctx.quadraticCurveTo((x0 + x1) / 2, yEdge + amp * 2, x1, yEdge);
  }
  ctx.closePath();
  ctx.fill();
}

function paintMilk(ctx: CanvasRenderingContext2D, L: CartonLayout) {
  const { W, H, ring } = L;
  const top = L.roofPx;
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(0, top, W, H - top);
  const r = rng(77);
  mottleT(ctx, W, H, '#ffffff', r, 30, [20, 60], [0.2, 0.4]);
  // cow spots on the sides & back (leave the front label clear)
  ctx.fillStyle = COW_INK;
  const frontHalf = (ring.sFront - ring.sLeft) * 0.42;
  for (let i = 0; i < 26; i++) {
    const s = r.range(0, ring.P);
    if (Math.abs(s - ring.sFront) < frontHalf + 0.012) continue;
    const y = r.range(0.022, L.bodyH - 0.03);
    blob(ctx, r, L.X(s), L.Y(y), r.range(0.006, 0.011) * L.kx, 6);
  }
  // blue band with a scalloped edge under the roof, thin stripe at the bottom
  paintScallops(ctx, W, top - 2, L.Y(L.bodyH - 0.017), '#7fbbe8', 0.014 * L.kx, 0.0022 * L.ky);
  ctx.fillStyle = '#7fbbe8';
  ctx.fillRect(0, L.Y(0.013), W, (0.0045) * L.ky);
  ctx.fillStyle = '#ff8a74';
  ctx.fillRect(0, L.Y(0.0175), W, 0.0018 * L.ky);
  // front label
  mmFrame(ctx, L, ring.sFront, L.bodyH * 0.47, () => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#7fbbe8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-25, -33, 50, 66, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8f4fc';
    ellipse(ctx, 0, -9, 19, 18);
    ctx.fill();
    drawCow(ctx, 0, -7.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3d7fc4';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('MILK', 0, 19.5);
    ctx.fillStyle = '#ff7a66';
    ctx.font = `bold 4.4px ${FONT}`;
    ctx.fillText('FRESH  •  CREAMY', 0, 28);
  });
  // small badge on the sides
  for (const s of [ring.sLeft, ring.sRight]) {
    mmFrame(ctx, L, s, L.bodyH * 0.3, () => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#7fbbe8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3d7fc4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold 6px ${FONT}`;
      ctx.fillText('1L', 0, 0.5);
    });
  }
  // roof: sky blue with white polka dots
  ctx.fillStyle = '#8fcbf0';
  ctx.fillRect(0, 0, W, top);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const dot = 0.0042 * L.kx;
  for (let row = 0; row < 4; row++)
    for (let x = (row % 2) * dot * 2.2; x < W; x += dot * 4.4) {
      ctx.beginPath();
      ctx.arc(x, top * (0.15 + row * 0.24), dot * 0.55, 0, TAU);
      ctx.fill();
    }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 6, 6);
}

function paintCream(ctx: CanvasRenderingContext2D, L: CartonLayout) {
  const { W, H, ring } = L;
  const top = L.roofPx;
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, top, W, H - top);
  const r = rng(31);
  // tiny pink hearts / dots pattern on the sides & back
  const frontHalf = (ring.sFront - ring.sLeft) * 0.42;
  ctx.fillStyle = '#f7a1bf';
  const step = 0.009;
  for (let s = step / 2; s < ring.P; s += step)
    for (let y = 0.018; y < L.bodyH - 0.02; y += step) {
      const ss = s + ((Math.round(y / step) % 2) * step) / 2;
      if (Math.abs(ss - ring.sFront) < frontHalf + 0.006) continue;
      ctx.beginPath();
      ctx.arc(L.X(ss), L.Y(y), 0.0012 * L.kx, 0, TAU);
      ctx.fill();
    }
  void r;
  paintScallops(ctx, W, top - 2, L.Y(L.bodyH - 0.014), '#ffd36e', 0.012 * L.kx, 0.002 * L.ky);
  ctx.fillStyle = '#ff8a74';
  ctx.fillRect(0, L.Y(0.011), W, 0.004 * L.ky);
  mmFrame(ctx, L, ring.sFront, L.bodyH * 0.45, () => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ff8a74';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-19.5, -24, 39, 48, 8);
    ctx.fill();
    ctx.stroke();
    // a pink plate with a cream dollop
    ctx.fillStyle = '#ffd9e4';
    ellipse(ctx, 0, -6, 13.5, 12.5);
    ctx.fill();
    ctx.strokeStyle = '#d8b9a6';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = '#ffffff';
    const tiers: [number, number, number][] = [[0, 1.5, 10], [0, -3, 7.8], [0, -7, 5.6]];
    for (const [tx, ty, tw] of tiers) {
      ellipse(ctx, tx, ty, tw, 3.2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-3.5, -9);
    ctx.quadraticCurveTo(0, -15.5, 2.8, -13.6);
    ctx.quadraticCurveTo(2, -11, 3.5, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8435f';
    ctx.beginPath();
    ctx.arc(0.5, -15.2, 2.1, 0, TAU);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff7a66';
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillText('CREAM', 0, 13.5);
    ctx.fillStyle = '#e0a83a';
    ctx.font = `bold 3.4px ${FONT}`;
    ctx.fillText('DOUBLE  •  RICH', 0, 19.8);
  });
  // roof: butter yellow with white dots
  ctx.fillStyle = '#ffd36e';
  ctx.fillRect(0, 0, W, top);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const dot = 0.0034 * L.kx;
  for (let row = 0; row < 4; row++)
    for (let x = (row % 2) * dot * 2; x < W; x += dot * 4) {
      ctx.beginPath();
      ctx.arc(x, top * (0.15 + row * 0.24), dot * 0.5, 0, TAU);
      ctx.fill();
    }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 6, 6);
}

const MILK_SPEC: CartonSpec = {
  key: 'milk',
  a: 0.0355,
  b: 0.0355,
  rc: 0.0055,
  bodyH: 0.148,
  roofH: 0.034,
  finH: 0.014,
  tex: [1024, 768],
  vBody: 0.78,
  cookAmount: 0.15,
  paint: paintMilk,
};

const CREAM_SPEC: CartonSpec = {
  key: 'cream',
  a: 0.027,
  b: 0.027,
  rc: 0.0045,
  bodyH: 0.088,
  roofH: 0.026,
  finH: 0.011,
  tex: [512, 512],
  vBody: 0.78,
  cookAmount: 0.15,
  paint: paintCream,
};

// =============================================================================================
// CHEESE: a wedge with real carved holes (spheres subtracted from the faces)
// =============================================================================================

const CHEESE = colors('cheese');
const CH_L = 0.112; // tip to rind
const CH_H = 0.06;
const CH_B = 0.43; // half angle
const CH_RIND = 0.0022;

interface FacePlane {
  o: THREE.Vector3;
  n: THREE.Vector3; // outward
  ex: THREE.Vector3;
  ey: THREE.Vector3;
  poly: V2[];
}

function cheeseFaces(): FacePlane[] {
  const cb = Math.cos(CH_B), sb = Math.sin(CH_B);
  const Li = CH_L - CH_RIND;
  const arc: V2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = -CH_B + (2 * CH_B * i) / 18;
    arc.push([Li * Math.cos(t), Li * Math.sin(t)]);
  }
  const sector: V2[] = [[0, 0], ...arc];
  const rect: V2[] = [[0, 0], [Li, 0], [Li, CH_H], [0, CH_H]];
  const up = new THREE.Vector3(0, 1, 0);
  return [
    { o: new THREE.Vector3(0, CH_H, 0), n: up.clone(), ex: new THREE.Vector3(1, 0, 0), ey: new THREE.Vector3(0, 0, 1), poly: sector },
    { o: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(0, -1, 0), ex: new THREE.Vector3(1, 0, 0), ey: new THREE.Vector3(0, 0, 1), poly: sector },
    { o: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(-sb, 0, cb), ex: new THREE.Vector3(cb, 0, sb), ey: up.clone(), poly: rect },
    { o: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(-sb, 0, -cb), ex: new THREE.Vector3(cb, 0, -sb), ey: up.clone(), poly: rect },
  ];
}

interface Disk {
  x: number;
  y: number;
  r: number;
}

function pointInPoly(x: number, y: number, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(x: number, y: number, poly: V2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const t = clamp01(((x - ax) * dx + (y - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

function densify(poly: V2[], step: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

const inDisk = (p: V2, d: Disk) => (p[0] - d.x) ** 2 + (p[1] - d.y) ** 2 < d.r * d.r;

/** Point where the segment p (outside) -> q (inside) enters the disk. */
function enterDisk(p: V2, q: V2, d: Disk): V2 {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const fx = p[0] - d.x, fy = p[1] - d.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - d.r * d.r;
  const disc = Math.max(0, B * B - 4 * A * C);
  const t = clamp01((-B - Math.sqrt(disc)) / (2 * A));
  return [p[0] + dx * t, p[1] + dy * t];
}

/** Subtract disks that cross the outline of a (dense) polygon: the outline follows their arcs. */
function carve(poly: V2[], disks: Disk[]): V2[] {
  const n = poly.length;
  const start = poly.findIndex((p) => !disks.some((d) => inDisk(p, d)));
  if (start < 0) return poly;
  const out: V2[] = [];
  let k = 0;
  while (k < n) {
    const p = poly[(start + k) % n];
    out.push(p);
    const q = poly[(start + k + 1) % n];
    const d = k + 1 < n ? disks.find((dd) => inDisk(q, dd)) : undefined;
    if (!d) {
      k++;
      continue;
    }
    const E = enterDisk(p, q, d);
    let m = k + 1;
    while (m < n && inDisk(poly[(start + m) % n], d)) m++;
    const b = poly[(start + m) % n], a = poly[(start + m - 1) % n];
    const F = enterDisk(b, a, d);
    const aE = Math.atan2(E[1] - d.y, E[0] - d.x), aF = Math.atan2(F[1] - d.y, F[0] - d.x);
    let delta = (((aF - aE) % TAU) + TAU) % TAU;
    const mid = aE + delta / 2;
    if (!pointInPoly(d.x + Math.cos(mid) * d.r, d.y + Math.sin(mid) * d.r, poly)) delta -= TAU;
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / 0.2));
    for (let s = 0; s <= steps; s++) {
      const ang = aE + (delta * s) / steps;
      out.push([d.x + Math.cos(ang) * d.r, d.y + Math.sin(ang) * d.r]);
    }
    k = m;
  }
  return out;
}

/** Planar face (polygon with holes / notches) placed on a 3D plane, outward normal, planar UVs. */
function planarFace(f: FacePlane, holes: Disk[], notches: Disk[], uvScale: number): THREE.BufferGeometry {
  const outline = notches.length ? carve(densify(f.poly, 0.0012), notches) : f.poly;
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) {
    const path = new THREE.Path();
    const K = Math.max(14, Math.round(h.r * 2600));
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * TAU;
      if (k === 0) path.moveTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r);
      else path.lineTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r);
    }
    shape.holes.push(path);
  }
  const g = new THREE.ShapeGeometry(shape);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i), Y = pos.getY(i);
    P.copy(f.o).addScaledVector(f.ex, X).addScaledVector(f.ey, Y);
    pos.setXYZ(i, P.x, P.y, P.z);
    uv.setXY(i, X / uvScale + f.o.y * 3, Y / uvScale);
    nor.setXYZ(i, f.n.x, f.n.y, f.n.z);
  }
  if (new THREE.Vector3().crossVectors(f.ex, f.ey).dot(f.n) < 0) flipWinding(g);
  return g;
}

/** Inside of a spherical hole: the part of the sphere inside all face half-spaces, facing inwards. */
function holeBowl(c: THREE.Vector3, rad: number, faces: FacePlane[]): THREE.BufferGeometry {
  const sph = new THREE.SphereGeometry(rad, Math.max(12, Math.round(rad * 1900)), Math.max(8, Math.round(rad * 1300))).toNonIndexed();
  const src = sph.attributes.position.array as Float32Array;
  const out: number[] = [];
  const clip = (poly: THREE.Vector3[], f: FacePlane): THREE.Vector3[] => {
    const res: THREE.Vector3[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = f.n.dot(a) - f.n.dot(f.o), db = f.n.dot(b) - f.n.dot(f.o);
      if (da <= 0) res.push(a);
      if (da <= 0 !== db <= 0) res.push(a.clone().lerp(b, da / (da - db)));
    }
    return res;
  };
  const open = new THREE.Vector3();
  for (const f of faces) if (Math.abs(f.n.dot(c) - f.n.dot(f.o)) < rad) open.add(f.n);
  open.normalize();
  for (let t = 0; t < src.length; t += 9) {
    let poly = [0, 3, 6].map((k) => new THREE.Vector3(src[t + k] + c.x, src[t + k + 1] + c.y, src[t + k + 2] + c.z));
    for (const f of faces) {
      poly = clip(poly, f);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    for (let k = 1; k < poly.length - 1; k++) {
      for (const p of [poly[0], poly[k + 1], poly[k]]) out.push(p.x, p.y, p.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const cnt = out.length / 3;
  const nor = new Float32Array(cnt * 3), colA = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
  const deep = new THREE.Color('#e7a92f'), lit = new THREE.Color('#f9d35c');
  const tmp = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    const nx = (c.x - out[i * 3]) / rad, ny = (c.y - out[i * 3 + 1]) / rad, nz = (c.z - out[i * 3 + 2]) / rad;
    nor[i * 3] = nx;
    nor[i * 3 + 1] = ny;
    nor[i * 3 + 2] = nz;
    const k = clamp01(nx * open.x + ny * open.y + nz * open.z);
    tmp.copy(deep).lerp(lit, 0.25 + 0.75 * k);
    colA[i * 3] = tmp.r;
    colA[i * 3 + 1] = tmp.g;
    colA[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

interface Hole {
  c: THREE.Vector3;
  r: number;
}

function cheeseHoles(r: Rng): Hole[] {
  const cb = Math.cos(CH_B), sb = Math.sin(CH_B);
  const dA = new THREE.Vector3(cb, 0, sb), dB = new THREE.Vector3(cb, 0, -sb);
  const nA = new THREE.Vector3(-sb, 0, cb), nB = new THREE.Vector3(-sb, 0, -cb);
  const out: Hole[] = [];
  const tryAdd = (c: THREE.Vector3, rad: number): boolean => {
    const rho = Math.hypot(c.x, c.z);
    if (rho + rad > CH_L - CH_RIND - 0.0035) return false;
    if (c.y - rad < 0.0035) return false;
    if (rho < rad * 2.3 + 0.01) return false;
    if (out.some((h) => h.c.distanceTo(c) < h.r + rad + 0.003)) return false;
    out.push({ c, r: rad });
    return true;
  };
  const place = (count: number, make: () => [THREE.Vector3, number]) => {
    for (let k = 0, n = 0; k < 60 && n < count; k++) {
      const [c, rad] = make();
      if (tryAdd(c, rad)) n++;
    }
  };
  // edge notches first (the classic cartoon bites out of the edges)
  place(2, () => {
    const rad = r.range(0.0055, 0.0085);
    const rho = r.range(0.035, CH_L - 0.02);
    return [dA.clone().multiplyScalar(rho).add(new THREE.Vector3(0, CH_H - r.range(-0.001, 0.0015), 0)).addScaledVector(nA, -r.range(0, 0.0015)), rad];
  });
  place(1, () => {
    const rad = r.range(0.0055, 0.008);
    return [dA.clone().multiplyScalar(r.range(0.05, CH_L - 0.02)).add(new THREE.Vector3(0, r.range(0.012, CH_H - 0.015), 0)).addScaledVector(nA, r.range(-0.002, 0.001)), rad];
  });
  // front side face
  place(4, () => {
    const rad = r.range(0.0035, 0.0085);
    return [dA.clone().multiplyScalar(r.range(0.025, CH_L)).add(new THREE.Vector3(0, r.range(0.008, CH_H - 0.006), 0)).addScaledVector(nA, rad * r.range(-0.3, 0.25)), rad];
  });
  // top face
  place(3, () => {
    const rad = r.range(0.004, 0.0085);
    const rho = r.range(0.03, CH_L), t = r.range(-CH_B * 0.75, CH_B * 0.75);
    return [new THREE.Vector3(Math.cos(t) * rho, CH_H + rad * r.range(-0.3, 0.25), Math.sin(t) * rho), rad];
  });
  // back side face (mostly hidden) + top-back edge
  place(2, () => {
    const rad = r.range(0.004, 0.008);
    return [dB.clone().multiplyScalar(r.range(0.03, CH_L)).add(new THREE.Vector3(0, r.range(0.01, CH_H), 0)).addScaledVector(nB, rad * r.range(-0.3, 0.2)), rad];
  });
  return out;
}

const cheeseFleshTex = lazy(() =>
  canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = CHEESE.flesh;
      ctx.fillRect(0, 0, w, h);
      const r = rng(21);
      mottleT(ctx, w, h, '#fde69a', r, 40, [w * 0.05, w * 0.16], [0.25, 0.45]);
      mottleT(ctx, w, h, '#efbf45', r, 30, [w * 0.04, w * 0.12], [0.12, 0.25]);
      // tiny pinholes
      for (let i = 0; i < 26; i++) {
        const x = r.next() * w, y = r.next() * h, s = r.range(1.2, 3);
        softDot(ctx, x, y + s * 0.3, s * 1.4, s * 1.2, '#fff0b8', 0.5);
        ctx.fillStyle = rgba('#d99c2c', 0.6);
        ellipse(ctx, x, y, s, s * 0.8);
        ctx.fill();
      }
      specksT(ctx, w, h, '#fff2c0', r, 60, [0.6, 1.3], 0.35);
    },
    { key: 'dairy/cheese-flesh', wrap: true },
  ),
);
const cheeseFleshMat = lazy(() =>
  foodMat({ color: '#ffffff', map: cheeseFleshTex(), roughness: 0.5, sheen: 0.3, sheenColor: '#fff4c4', sheenRoughness: 0.6, flesh: CHEESE.flesh, cookColor: CHEESE.cooked, name: 'cheese' }),
);
const cheeseFaceMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, map: cheeseFleshTex(), roughness: 0.5, sheen: 0.3, sheenColor: '#fff4c4', sheenRoughness: 0.6, flesh: CHEESE.flesh, cookColor: CHEESE.cooked, name: 'cheese-faces' }),
);
const cheeseRindMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#efb23c';
        ctx.fillRect(0, 0, w, h);
        const r = rng(3);
        mottleT(ctx, w, h, '#f6c75a', r, 30, [w * 0.06, w * 0.18], [0.3, 0.5]);
        mottleT(ctx, w, h, '#d8962a', r, 24, [w * 0.04, w * 0.12], [0.15, 0.3]);
        specksT(ctx, w, h, '#c6862a', r, 40, [0.5, 1.2], 0.4);
      },
      { key: 'dairy/cheese-rind', wrap: true },
    ),
    roughness: 0.4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    flesh: CHEESE.flesh,
    cookColor: CHEESE.cooked,
    name: 'cheese-rind',
  }),
);
const cheeseHoleMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.55, flesh: CHEESE.flesh, cookColor: CHEESE.cooked, name: 'cheese-hole' }));

/** Rind: the curved back plus a thin trim along the outer edge of the top / bottom / sides. */
function cheeseRindGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 20;
  const Li = CH_L - CH_RIND;
  // back (cylinder patch)
  const back = paramSurface(n, 2, (u, v, out) => {
    const t = -CH_B + 2 * CH_B * u;
    out.set(Math.cos(t) * CH_L, v * CH_H, Math.sin(t) * CH_L);
  });
  parts.push(back);
  // top / bottom trims (annular strips)
  for (const top of [true, false]) {
    const g = paramSurface(n, 1, (u, v, out) => {
      const t = -CH_B + 2 * CH_B * u;
      const rr = Li + CH_RIND * v;
      out.set(Math.cos(t) * rr, top ? CH_H : 0, Math.sin(t) * rr);
    }, !top);
    parts.push(g);
  }
  // side trims
  for (const s of [1, -1]) {
    const cb = Math.cos(CH_B), sb = Math.sin(CH_B) * s;
    const g = paramSurface(1, 1, (u, v, out) => {
      const rr = Li + CH_RIND * u;
      out.set(cb * rr, v * CH_H, sb * rr);
    }, s < 0);
    parts.push(g);
  }
  const g = merge(parts);
  // planar-ish uvs for the rind texture
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, Math.atan2(pos.getZ(i), pos.getX(i)) * 2, pos.getY(i) * 12);
  return g;
}

function buildCheese(r: Rng): THREE.Object3D {
  const faces = cheeseFaces();
  const holes = cheeseHoles(r);
  const faceGeos: THREE.BufferGeometry[] = [];
  for (const f of faces) {
    const inner: Disk[] = [], notch: Disk[] = [];
    for (const h of holes) {
      const d = f.n.dot(h.c) - f.n.dot(f.o);
      if (Math.abs(d) >= h.r) continue;
      const rel = h.c.clone().sub(f.o);
      const disk: Disk = { x: rel.dot(f.ex), y: rel.dot(f.ey), r: Math.sqrt(h.r * h.r - d * d) * 0.97 };
      const edge = distToPoly(disk.x, disk.y, f.poly);
      const inside = pointInPoly(disk.x, disk.y, f.poly);
      if (inside && edge > disk.r + 0.0008) inner.push(disk);
      else if (edge < disk.r) notch.push(disk);
    }
    // top face a touch lighter than the cut sides so the edges read under soft light
    faceGeos.push(vcol(planarFace(f, inner, notch, 0.07), f.n.y > 0.5 ? '#ffffff' : '#f3e4cc'));
  }
  const bowls = holes.map((h) => holeBowl(h.c, h.r, faces));
  const g = new THREE.Group();
  g.add(mesh(merge(faceGeos), cheeseFaceMat(), { name: 'cheese' }));
  if (bowls.length) g.add(mesh(merge(bowls), cheeseHoleMat(), { name: 'cheese-holes' }));
  g.add(mesh(cheeseRindGeometry(), cheeseRindMat(), { skin: true, name: 'cheese-rind' }));
  g.rotation.y = 0.55 + r.range(-0.15, 0.15);
  return sitOnGround(g);
}

/** Paint a shaded cheese hole (lit from the top-left). */
function paintHole(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number) {
  const g = ctx.createRadialGradient(x + rad * 0.25, y + rad * 0.3, rad * 0.1, x, y, rad);
  g.addColorStop(0, '#f7cf58');
  g.addColorStop(0.7, '#eab43c');
  g.addColorStop(1, '#d99a2a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.clip();
  ctx.fillStyle = 'rgba(190,120,20,0.35)';
  ctx.beginPath();
  ctx.arc(x + rad * 0.35, y + rad * 0.35, rad, 0, TAU);
  ctx.arc(x, y, rad * 1.2, 0, TAU, true);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,240,180,0.8)';
  ctx.lineWidth = Math.max(1, rad * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.98, 0.1 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function cheeseSection(ctx: CanvasRenderingContext2D, s: number, o: SectionOpts) {
  ctx.drawImage(cheeseFleshTex().image as CanvasImageSource, 0, 0, s, s);
  const r = rng(17);
  const pts: [number, number, number][] = [];
  for (let k = 0; k < 60 && pts.length < 7; k++) {
    const x = r.range(0.15, 0.85) * s, y = r.range(0.2, 0.85) * s, rad = r.range(0.04, 0.085) * s;
    if (pts.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + rad + s * 0.03)) continue;
    pts.push([x, y, rad]);
  }
  for (const [x, y, rad] of pts) paintHole(ctx, x, y, rad);
  if (!o.peeled) {
    ctx.fillStyle = '#efb23c';
    ctx.fillRect(0, s * 0.955, s, s * 0.045);
  }
}

function cheeseSliceShape(): THREE.Shape {
  const w = 0.072, h = 0.086;
  const pts = fillet([[0, 0], [w / 2, 0], [0, h], [-w / 2, 0], [0, 0]], 0.0045, 3);
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// =============================================================================================
// MOZZARELLA: a soft, glossy white ball with a pinched knot
// =============================================================================================

const MOZZ = colors('mozzarella');
const MOZZ_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0],
    [0.016, 0.0006],
    [0.0262, 0.004],
    [0.0326, 0.012],
    [0.0346, 0.0222],
    [0.0336, 0.032],
    [0.0292, 0.0418],
    [0.0214, 0.0492],
    [0.0116, 0.0538],
    [0.0046, 0.0556],
    [0.0001, 0.056],
  ],
  26,
);
const MOZZ_H = 0.056;

const mozzTex = lazy(() =>
  canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf9f1';
      ctx.fillRect(0, 0, w, h);
      const r = rng(8);
      mottleT(ctx, w, h, '#ffffff', r, 30, [w * 0.05, w * 0.15], [0.35, 0.6]);
      mottleT(ctx, w, h, '#efeadb', r, 26, [w * 0.04, w * 0.12], [0.15, 0.3]);
      // stretched-curd streaks running towards the knot
      ctx.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const x = r.next() * w, y0 = r.range(0, h * 0.7), len = r.range(h * 0.15, h * 0.45);
        ctx.strokeStyle = rgba(r.next() < 0.5 ? '#ffffff' : '#e8e3d2', r.range(0.25, 0.5));
        ctx.lineWidth = r.range(0.8, 2.2);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + r.range(-6, 6), y0 + len * 0.5, x + r.range(-4, 4), y0 + len);
        ctx.stroke();
      }
    },
    { key: 'dairy/mozzarella', wrap: true },
  ),
);
const mozzMat = lazy(() =>
  foodMat({ color: '#ffffff', map: mozzTex(), roughness: 0.24, clearcoat: 0.85, clearcoatRoughness: 0.16, sheen: 0.6, sheenColor: '#ffffff', sheenRoughness: 0.5, flesh: MOZZ.flesh, cookColor: MOZZ.cooked, name: 'mozzarella' }),
);
const mozzFleshMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#fdfbf3';
        ctx.fillRect(0, 0, w, h);
        const r = rng(14);
        mottleT(ctx, w, h, '#f1ecdc', r, 26, [w * 0.05, w * 0.14], [0.2, 0.4]);
        specksT(ctx, w, h, '#ffffff', r, 40, [0.8, 2], 0.6);
      },
      { key: 'dairy/mozzarella-flesh', wrap: true },
    ),
    roughness: 0.38,
    clearcoat: 0.3,
    flesh: MOZZ.flesh,
    cookColor: MOZZ.cooked,
    name: 'mozzarella-flesh',
  }),
);

function buildMozzarella(r: Rng): THREE.Object3D {
  const g = latheGeometry(MOZZ_PROFILE, 44);
  const ph = r.range(0, TAU), seed = r.range(0, 40);
  const folds = r.int(6, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-6) continue;
    const a = Math.atan2(z, x);
    const h = y / MOZZ_H;
    const fold = 0.035 * Math.sin(folds * a + ph) * sstep(0.86, 0.99, h);
    const wob = 0.035 * fbm3(Math.cos(a) * 1.4 + seed, h * 2.2, Math.sin(a) * 1.4, 2);
    const k = 1 + fold + wob * sstep(0.02, 0.2, h);
    pos.setXYZ(i, x * k, y + 0.0012 * sstep(0.92, 1, h) + 0.0006 * Math.sin(folds * a + ph) * sstep(0.9, 1, h), z * k);
  }
  smoothNormals(g);
  const m = mesh(g, mozzMat(), { skin: true, name: 'mozzarella' });
  m.scale.set(r.range(0.97, 1.03), r.range(0.95, 1.03), r.range(0.97, 1.03));
  m.rotation.set(r.range(-0.05, 0.05), r.range(0, TAU), r.range(-0.05, 0.05));
  return sitOnGround(group(m));
}

function mozzSection(ctx: CanvasRenderingContext2D, s: number, o: SectionOpts) {
  const R = s / 2;
  const g = ctx.createRadialGradient(R * 0.9, R * 0.85, R * 0.1, R, R, R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.75, '#fcfaf2');
  g.addColorStop(1, '#f1ecdd');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(R, R, R, 0, TAU);
  ctx.fill();
  const r = rng(5);
  // soft milky pockets and fibres, stretched around the centre
  for (let i = 0; i < 46; i++) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * R * 0.88;
    const x = R + Math.cos(a) * d, y = R + Math.sin(a) * d;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    const len = s * r.range(0.02, 0.06), wid = s * r.range(0.004, 0.012);
    ctx.fillStyle = rgba(r.next() < 0.6 ? '#ece5d0' : '#ffffff', r.range(0.35, 0.7));
    ellipse(ctx, 0, 0, len, wid);
    ctx.fill();
    ctx.restore();
  }
  if (!o.peeled) {
    ctx.strokeStyle = rgba('#efe9d8', 0.9);
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.arc(R, R, R - s * 0.0125, 0, TAU);
    ctx.stroke();
  }
}

function mozzSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w * 0.45, h * 0.5, w * 0.05, w / 2, h / 2, w * 0.55);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.75, '#fcfaf2');
  g.addColorStop(1, '#efe9d9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(6);
  // fibres follow the ball's layers (roughly concentric, stretched upwards to the knot)
  for (let i = 0; i < 60; i++) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.85;
    const x = w / 2 + Math.cos(a) * d * w * 0.5, y = h * 0.52 + Math.sin(a) * d * h * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = rgba(r.next() < 0.6 ? '#ebe4cf' : '#ffffff', r.range(0.35, 0.7));
    ellipse(ctx, 0, 0, w * r.range(0.02, 0.06), w * r.range(0.004, 0.012));
    ctx.fill();
    ctx.restore();
  }
}

// =============================================================================================
// BUTTER: a pale block half out of its paper
// =============================================================================================

const BUTTER = colors('butter');
const BUT_L = 0.094, BUT_H = 0.03, BUT_D = 0.05;

const butterMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#fce8a6';
        ctx.fillRect(0, 0, w, h);
        const r = rng(19);
        mottleT(ctx, w, h, '#fff4cc', r, 34, [w * 0.06, w * 0.18], [0.3, 0.55]);
        mottleT(ctx, w, h, '#f5d97e', r, 26, [w * 0.05, w * 0.15], [0.12, 0.25]);
        specksT(ctx, w, h, '#fffbe6', r, 60, [0.6, 1.4], 0.35);
      },
      { key: 'dairy/butter', wrap: true },
    ),
    roughness: 0.32,
    sheen: 0.35,
    sheenColor: '#fff6d2',
    sheenRoughness: 0.5,
    flesh: BUTTER.flesh,
    cookColor: BUTTER.cooked,
    name: 'butter',
  }),
);

const paperTopTex = lazy(() =>
  canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf6e8';
      ctx.fillRect(0, 0, w, h);
      const r = rng(41);
      mottleT(ctx, w, h, '#ffffff', r, 20, [w * 0.05, w * 0.15], [0.3, 0.5]);
      // gold frame + blue ribbon
      ctx.strokeStyle = '#e8b74a';
      ctx.lineWidth = 10;
      ctx.strokeRect(22, 22, w - 44, h - 44);
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, w - 80, h - 80);
      ctx.fillStyle = '#5b8fd6';
      ctx.beginPath();
      ctx.roundRect(60, h * 0.52, w - 120, h * 0.22, 26);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.15)}px ${FONT}`;
      ctx.fillText('BUTTER', w / 2, h * 0.635);
      // little crown + clover badge
      ctx.fillStyle = '#ffd36e';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.32, h * 0.13, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#e8b74a';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const cx = w / 2, cy = h * 0.33, cw = h * 0.09;
      ctx.moveTo(cx - cw, cy + cw * 0.5);
      ctx.lineTo(cx - cw, cy - cw * 0.45);
      ctx.lineTo(cx - cw * 0.5, cy);
      ctx.lineTo(cx, cy - cw * 0.7);
      ctx.lineTo(cx + cw * 0.5, cy);
      ctx.lineTo(cx + cw, cy - cw * 0.45);
      ctx.lineTo(cx + cw, cy + cw * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5b8fd6';
      ctx.font = `bold ${Math.round(h * 0.06)}px ${FONT}`;
      ctx.fillText('CREAMY  •  SALTED', w / 2, h * 0.84);
    },
    { key: 'dairy/butter-paper-top' },
  ),
);
const paperSideTex = lazy(() =>
  canvasTexture(
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf6e8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5b8fd6';
      ctx.fillRect(0, h * 0.38, w, h * 0.24);
      ctx.fillStyle = '#e8b74a';
      ctx.fillRect(0, h * 0.28, w, h * 0.05);
      ctx.fillRect(0, h * 0.67, w, h * 0.05);
    },
    { key: 'dairy/butter-paper-side' },
  ),
);
const paperTopMat = lazy(() => packMat('butter-paper-top', { color: '#ffffff', map: paperTopTex(), roughness: 0.62, sheen: 0.3, sheenColor: '#ffffff', flesh: '#f6f0e0' }));
const paperSideMat = lazy(() => packMat('butter-paper-side', { color: '#ffffff', map: paperSideTex(), roughness: 0.62, sheen: 0.3, sheenColor: '#ffffff', flesh: '#f6f0e0' }));
const paperInsideMat = lazy(() =>
  packMat('butter-paper-inside', {
    color: '#ffffff',
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#f8f1df';
        ctx.fillRect(0, 0, w, h);
        const r = rng(6);
        mottleT(ctx, w, h, '#fffaf0', r, 30, [w * 0.05, w * 0.15], [0.3, 0.5]);
        mottleT(ctx, w, h, '#f0e2b8', r, 18, [w * 0.05, w * 0.12], [0.2, 0.4]); // greasy patches
        ctx.strokeStyle = 'rgba(232,183,74,0.55)';
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, w - 20, h - 20);
      },
      { key: 'dairy/butter-paper-inside' },
    ),
    roughness: 0.55,
    sheen: 0.3,
    sheenColor: '#ffffff',
    flesh: '#f8f1df',
  }),
);

function buildButter(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  // the block
  const block = roundedBox(BUT_L, BUT_H, BUT_D, 0.0034, 3);
  block.translate(0, BUT_H / 2 + 0.0009, 0);
  g.add(mesh(block, butterMat(), { name: 'butter' }));
  // paper sleeve over the right half
  const x0 = -0.004 + r.range(-0.004, 0.004);
  const x1 = BUT_L / 2 + 0.0014;
  const sl = roundedBox(x1 - x0, BUT_H + 0.0018, BUT_D + 0.0018, 0.0036, 2);
  sl.translate((x0 + x1) / 2, (BUT_H + 0.0018) / 2, 0);
  const side = paperSideMat(), top = paperTopMat();
  g.add(mesh(sl, [side, side, top, side, side, side], { name: 'butter-paper' }));
  // the opened part of the wrapper lying flat (crinkled, edges curling up)
  const xa = -BUT_L / 2 - 0.014, xb = x0 + 0.012;
  const zw = BUT_D / 2 + BUT_H * 0.95;
  const seed = r.range(0, 20);
  const sheet = paramSurface(18, 14, (u, v, out) => {
    const x = xa + (xb - xa) * u, z = -zw + 2 * zw * v;
    const edge = Math.abs(z) / zw;
    let y = 0.00035 + Math.max(0, fbm3(x * 70 + seed, z * 70, seed, 2)) * 0.0012;
    y += 0.0045 * sstep(0.82, 1, edge) * (0.6 + 0.4 * Math.sin(x * 120 + seed));
    y += 0.003 * sstep(0.3, 0, u) * (0.7 + 0.3 * Math.cos(z * 90));
    out.set(x, y, z);
  });
  g.add(mesh(sheet, paperInsideMat(), { name: 'butter-sheet' }));
  // a freshly cut pat leaning on the end
  const pat = roundedBox(0.0065, BUT_H * 0.94, BUT_D * 0.94, 0.0022, 2);
  const pm = mesh(pat, butterMat());
  pm.rotation.set(0, r.range(-0.25, 0.25), Math.PI / 2 - 0.09);
  pm.position.set(-BUT_L / 2 - 0.022, 0.0042, r.range(-0.004, 0.004));
  g.add(pm);
  g.rotation.y = r.range(-0.35, 0.2);
  return sitOnGround(g);
}

function butterSection(ctx: CanvasRenderingContext2D, s: number) {
  ctx.drawImage((butterMat() as THREE.MeshStandardMaterial).map!.image as CanvasImageSource, 0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,250,225,0.6)';
  ctx.lineWidth = s * 0.012;
  for (let i = 0; i < 5; i++) {
    const y = s * (0.15 + i * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y + s * 0.03);
    ctx.stroke();
  }
}

function butterSliceShape(): THREE.Shape {
  const w = BUT_D * 0.96, h = BUT_H * 0.96, rr = 0.003;
  const pts = fillet([[0, 0], [w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0], [0, 0]], rr, 3);
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// =============================================================================================
// YOGURT: plastic cup with a fruit label and a peeled-back foil lid
// =============================================================================================

const YOG = colors('yogurt');
const YC_H = 0.066, YC_RT = 0.0355, YC_RB = 0.0272;
const YC_WALL0 = 0.0024, YC_WALL1 = YC_H - 0.0036;
const ycRadiusAt = (y: number) => YC_RB + ((YC_RT - YC_RB) * (y - YC_WALL0)) / (YC_WALL1 - YC_WALL0);

const yogLabelTex = lazy(() =>
  canvasTexture(
    1024,
    320,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffe3ec');
      g.addColorStop(1, '#ffc9da');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // dots
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let row = 0; row < 7; row++)
        for (let x = (row % 2) * 18; x < w; x += 36) {
          ctx.beginPath();
          ctx.arc(x, 40 + row * 38, 4.5, 0, TAU);
          ctx.fill();
        }
      // mint band with scallops at the top, cream band at the bottom
      paintScallops(ctx, w, 0, h * 0.13, '#a9e4d2', 34, 5);
      ctx.fillStyle = '#fff6ea';
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
      ctx.fillStyle = '#f48fb1';
      ctx.fillRect(0, h * 0.88, w, h * 0.025);
      // front: strawberry + name (front of the cup is u = 0.5)
      const cx = w / 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cx - 118, h * 0.2, 236, h * 0.64, 40);
      ctx.fill();
      ctx.strokeStyle = '#f48fb1';
      ctx.lineWidth = 6;
      ctx.stroke();
      drawStrawberry(ctx, cx, h * 0.41, h * 0.3, -0.15);
      ctx.fillStyle = '#e0457b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.15)}px ${FONT}`;
      ctx.fillText('YOGURT', cx, h * 0.69);
      // little strawberries around the back
      const r = rng(9);
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * (w / 6);
        if (Math.abs(x - cx) < 170) continue;
        drawStrawberry(ctx, x + r.range(-20, 20), h * r.range(0.35, 0.65), h * 0.2, r.range(-0.4, 0.4));
      }
    },
    { key: 'dairy/yogurt-label' },
  ),
);
const yogLabelMat = lazy(() => packMat('yogurt-label', { color: '#ffffff', map: yogLabelTex(), roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.3, flesh: '#fbf8f0' }));
const yogCupMat = lazy(() => packMat('yogurt-cup', { color: '#fbfaf6', roughness: 0.32, clearcoat: 0.3, flesh: '#f4f1ea' }));
const yogLidTopMat = lazy(() =>
  packMat('yogurt-lid-top', {
    color: '#ffffff',
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#f7a1bf';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let y = 10; y < h; y += 26)
          for (let x = ((y / 26) % 2) * 13; x < w; x += 26) {
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, TAU);
            ctx.fill();
          }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.44, w * 0.4, 0, TAU);
        ctx.stroke();
        drawStrawberry(ctx, w / 2, h * 0.44, h * 0.32, 0.2);
      },
      { key: 'dairy/yogurt-lid-top' },
    ),
    roughness: 0.3,
    metalness: 0.35,
    flesh: '#d8d9de',
  }),
);
const yogLidUnderMat = lazy(() =>
  packMat('yogurt-lid-under', {
    color: '#ffffff',
    map: canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#dfe1e8';
        ctx.fillRect(0, 0, w, h);
        const r = rng(2);
        mottleT(ctx, w, h, '#f8f9fc', r, 26, [w * 0.04, w * 0.1], [0.3, 0.6]);
        mottleT(ctx, w, h, '#d3d6df', r, 16, [w * 0.03, w * 0.08], [0.1, 0.2]);
        // a little yogurt smear where it touched the cup
        ctx.fillStyle = 'rgba(253,250,242,0.9)';
        blob(ctx, r, w * 0.5, h * 0.7, w * 0.13, 6);
        ctx.fillStyle = 'rgba(247,160,190,0.7)';
        blob(ctx, r, w * 0.53, h * 0.69, w * 0.045, 3);
      },
      { key: 'dairy/yogurt-lid-under' },
    ),
    roughness: 0.34,
    metalness: 0.25,
    flesh: '#e4e6ec',
  }),
);
const yogFillMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = YOG.flesh;
        ctx.fillRect(0, 0, w, h);
        const r = rng(12);
        mottleT(ctx, w, h, '#ffffff', r, 26, [w * 0.05, w * 0.14], [0.4, 0.6]);
        // strawberry swirl
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(240,120,160,0.95)';
        ctx.lineWidth = w * 0.06;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const t = i / 80, a = t * TAU * 1.6 + 0.5, rr = w * (0.08 + 0.3 * t);
          i ? ctx.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr) : ctx.moveTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
        }
        ctx.stroke();
        ctx.fillStyle = '#e8435f';
        for (let i = 0; i < 9; i++) {
          const a = r.range(0, TAU), rr = r.range(0.05, 0.35) * w;
          blob(ctx, r, w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, w * r.range(0.025, 0.04), 4);
        }
      },
      { key: 'dairy/yogurt-fill' },
    ),
    roughness: 0.38,
    sheen: 0.4,
    sheenColor: '#ffffff',
    flesh: YOG.flesh,
    cookColor: YOG.cooked,
    name: 'yogurt',
  }),
);

const yogCupGeo = lazy(() => {
  // labelled outer wall
  const wallProf: Profile = [];
  for (let k = 0; k <= 3; k++) {
    const y = YC_WALL0 + ((YC_WALL1 - YC_WALL0) * k) / 3;
    wallProf.push([ycRadiusAt(y), y]);
  }
  const wall = latheGeometry(wallProf, 48, Math.PI);
  uvVByHeight(wall, (y) => (y - YC_WALL0) / (YC_WALL1 - YC_WALL0));
  // plain plastic: base, rolled rim and the inside wall
  const rt = ycRadiusAt(YC_WALL1);
  const plain: Profile = [
    [0.0001, 0.0016],
    [YC_RB - 0.0032, 0.0016],
    [YC_RB - 0.0016, 0.0002],
    [YC_RB - 0.0004, 0.0004],
    [ycRadiusAt(YC_WALL0), YC_WALL0],
  ];
  const top: Profile = [
    [rt, YC_WALL1],
    [rt + 0.0006, YC_H - 0.0028],
    [rt + 0.0024, YC_H - 0.0024],
    [rt + 0.0028, YC_H - 0.0011],
    [rt + 0.0019, YC_H],
    [rt - 0.0004, YC_H],
    [rt - 0.0013, YC_H - 0.0014],
    [rt - 0.0016, YC_H - 0.009],
  ];
  const plainG = merge([latheGeometry(plain, 48), latheGeometry(top, 48)]);
  return { wall: smoothNormals(wall), plain: plainG };
});

/** Foil lid: rows of constant z (so it can fold along z), peeled back from the front. */
function yogurtLid(r: Rng): { top: THREE.BufferGeometry; under: THREE.BufferGeometry } {
  const R = YC_RT + 0.0024;
  const tabL = 0.009, tabW = 0.0065;
  const z0 = R * r.range(-0.12, 0.1);
  const rho = 0.0068, thMax = r.range(1.7, 1.95);
  const zMin = -R, zMax = R + tabL;
  const half = (z: number) => {
    const c = Math.abs(z) < R ? Math.sqrt(R * R - z * z) : 0;
    const tz = z - (R - 0.004);
    const t = tz < 0 ? 0 : z <= R + tabL - 0.004 ? tabW : tabW * Math.sqrt(Math.max(0, 1 - ((z - (R + tabL - 0.004)) / 0.004) ** 2));
    return Math.max(c, t);
  };
  const lift = r.range(0.06, 0.12);
  const bend = (x: number, z: number, out: THREE.Vector3) => {
    const yFlat = YC_H + 0.0003;
    if (z <= z0) {
      out.set(x, yFlat, z);
      return;
    }
    const s = z - z0;
    let zz: number, yy: number;
    if (s <= rho * thMax) {
      const th = s / rho;
      zz = z0 + rho * Math.sin(th);
      yy = rho * (1 - Math.cos(th));
    } else {
      const ex = s - rho * thMax;
      zz = z0 + rho * Math.sin(thMax) + Math.cos(thMax) * ex;
      yy = rho * (1 - Math.cos(thMax)) + Math.sin(thMax) * ex;
    }
    // the peeled flap cups a little across its width
    const cup = lift * (x * x) / R * sstep(0, 0.02, s);
    out.set(x, yFlat + yy + cup * Math.sin(thMax) * 0.4, zz + cup * Math.cos(thMax) * -0.4);
  };
  const nz = 24, nx = 12;
  const make = (offset: number) => {
    const g = paramSurface(nx, nz, (u, v, out) => {
      const z = zMin + (zMax - zMin) * v;
      const hw = half(z);
      const x = -hw + 2 * hw * u;
      bend(x, z, out);
    });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const z = zMin + ((zMax - zMin) * j) / nz;
        const hw = half(z);
        const x = -hw + (2 * hw * i) / nx;
        uv.setXY(j * (nx + 1) + i, 0.5 + x / (2 * R), 0.5 - z / (2 * R));
      }
    uv.needsUpdate = true;
    if (offset) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * offset, pos.getY(i) + nor.getY(i) * offset, pos.getZ(i) + nor.getZ(i) * offset);
      flipWinding(g);
      smoothNormals(g);
    }
    return g;
  };
  return { top: make(0), under: make(-0.00035) };
}

function buildYogurt(r: Rng): THREE.Object3D {
  const { wall, plain } = yogCupGeo();
  const g = new THREE.Group();
  g.add(mesh(wall, yogLabelMat(), { name: 'yogurt-cup' }));
  g.add(mesh(plain, yogCupMat()));
  // yogurt surface with a gentle spoon swirl
  const rin = ycRadiusAt(YC_WALL1) - 0.0015;
  const ys = YC_H - 0.0045;
  const ph = r.range(0, TAU);
  const surf = revolve(
    [[rin, ys], [rin * 0.85, ys], [rin * 0.6, ys], [rin * 0.3, ys], [0.0001, ys]],
    { segments: 40, uv: 'planar', map: (_j, th, rr, y) => [rr, y + 0.0011 * Math.sin(th * 2 + rr * 260 + ph) * sstep(0.002, 0.012, rr) * sstep(rin, rin * 0.75, rr)] },
  );
  g.add(mesh(surf, yogFillMat(), { name: 'yogurt' }));
  const lid = yogurtLid(r);
  const lg = group(mesh(lid.top, yogLidTopMat(), { name: 'yogurt-lid' }), mesh(lid.under, yogLidUnderMat()));
  lg.rotation.y = r.sign() * r.range(0.55, 0.95);
  g.add(lg);
  g.rotation.y = r.range(-0.4, 0.4);
  return sitOnGround(g);
}

// =============================================================================================
// ICE CREAM: waffle cone + strawberry scoop with drips and sprinkles
// =============================================================================================

const ICE = colors('ice-cream');
const CONE_H = 0.098, CONE_R = 0.0262;
const CONE_RIM = CONE_H - 0.0085;

const waffleTex = lazy(() =>
  pixelTex(
    'dairy/waffle-cone',
    512,
    512,
    (u, v, col, b) => {
      const rim = sstep(CONE_RIM / CONE_H - 0.004, CONE_RIM / CONE_H + 0.004, v);
      const N = 11, M = 10;
      const p = u * N + v * M, q = u * N - v * M;
      const fp = p - Math.floor(p), fq = q - Math.floor(q);
      const lp = Math.min(fp, 1 - fp), lq = Math.min(fq, 1 - fq);
      const groove = Math.max(sstep(0.09, 0.02, lp), sstep(0.09, 0.02, lq));
      const pillow = Math.min(lp, lq) * 2; // 0 at edges, 1 at the cell centre
      const n = tfbm(u, v, 16, 16, 7, 3);
      setc(col, rgb('#e2a65c'));
      mixc(col, rgb('#f0c27e'), sstep(0.1, 0.9, pillow) * 0.6);
      mixc(col, rgb('#b06e32'), groove * 0.85);
      mulc(col, 1 + n * 0.07 + tnoise(u, v, 128, 128, 3) * 0.03);
      // smooth rolled rim
      const rc = rgb('#ebb66c');
      mixc(col, rc, rim);
      mulc(col, 1 + rim * 0.04 * Math.sin(v * 300));
      b[0] = (1 - rim) * (0.25 + 0.55 * sstep(0, 0.6, pillow) - groove * 0.25) + rim * 0.6 + n * 0.04;
    },
    { bump: true, wrap: true },
  ),
);
const coneMat = lazy(() => {
  const t = waffleTex();
  return foodMat({ color: '#ffffff', map: t.map, bumpMap: t.bump, bumpScale: 3, roughness: 0.62, flesh: '#f0c890', cookColor: '#9a5a22', name: 'waffle-cone' });
});

const scoopTex = lazy(() =>
  canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = ICE.skin;
      ctx.fillRect(0, 0, w, h);
      const r = rng(23);
      mottleT(ctx, w, h, '#fbd0de', r, 50, [w * 0.03, w * 0.08], [0.35, 0.6], 2);
      mottleT(ctx, w, h, '#ef9dbb', r, 40, [w * 0.025, w * 0.06], [0.2, 0.35], 2);
      // strawberry chunks
      for (let i = 0; i < 26; i++) {
        const x = r.next() * w, y = r.range(0.05, 0.95) * h, s = r.range(4, 9);
        ctx.fillStyle = rgba('#e0405e', 0.85);
        blob(ctx, r, x, y, s, 4);
        ctx.fillStyle = rgba('#ff8fa6', 0.6);
        blob(ctx, r, x - s * 0.2, y - s * 0.2, s * 0.45, 3);
      }
      specksT(ctx, w, h, '#a8243e', r, 70, [0.6, 1.2], 0.6, 1.6);
    },
    { key: 'dairy/scoop-strawberry', wrap: true },
  ),
);
const scoopMat = lazy(() =>
  foodMat({ color: '#ffffff', map: scoopTex(), bumpMap: bumpNoiseTexture('dairy/scoop-bump', 40), bumpScale: 1.2, roughness: 0.46, sheen: 0.35, sheenColor: '#ffe2ec', sheenRoughness: 0.5, flesh: '#f8c8d8', cookColor: '#c8866a', name: 'ice-cream' }),
);
const SPRINKLES = ['#ff5fa8', '#ffd23f', '#5fd3ff', '#8fe07a', '#b48cff', '#ffffff', '#ff8a4a'];
const sprinkleMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, flesh: '#ff9ac8', cookColor: '#a0603a', name: 'sprinkles' }));
const sprinkleGeo = lazy(() => new THREE.CylinderGeometry(0.00085, 0.00085, 0.0046, 5, 1));

/** Sprinkles lying on random upward-facing vertices of a geometry. */
function sprinklesOn(src: THREE.BufferGeometry, r: Rng, n: number, minNy: number, accept?: (p: THREE.Vector3) => boolean): THREE.BufferGeometry | null {
  const pos = src.attributes.position as THREE.BufferAttribute;
  const nor = src.attributes.normal as THREE.BufferAttribute;
  const parts: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
    const i = Math.floor(r.next() * pos.count);
    p.fromBufferAttribute(pos, i);
    nv.fromBufferAttribute(nor, i).normalize();
    if (nv.y < minNy || (accept && !accept(p))) continue;
    // a random tangent direction
    const a = Math.abs(nv.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(nv, a).normalize();
    const t2 = new THREE.Vector3().crossVectors(nv, t1);
    const ang = r.range(0, TAU);
    const tan = t1.multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
    const q = new THREE.Quaternion().setFromUnitVectors(Y, tan);
    const m = new THREE.Matrix4().compose(p.clone().addScaledVector(nv, 0.00055), q, new THREE.Vector3(1, r.range(0.8, 1.15), 1));
    parts.push(vcol(sprinkleGeo().clone().applyMatrix4(m), r.pick(SPRINKLES)));
    k++;
  }
  return parts.length ? merge(parts) : null;
}

const coneGeo = lazy(() => {
  const prof: Profile = [[0.0001, 0], [0.0016, 0.0005], [0.0028, 0.0026]];
  for (let k = 1; k <= 8; k++) {
    const y = 0.0026 + ((CONE_RIM - 0.0026) * k) / 8;
    prof.push([0.0028 + ((CONE_R - 0.0028) * (y - 0.0026)) / (CONE_RIM - 0.0026), y]);
  }
  prof.push([CONE_R + 0.0009, CONE_RIM + 0.0008], [CONE_R + 0.0013, CONE_H - 0.004], [CONE_R + 0.001, CONE_H - 0.0006], [CONE_R - 0.0008, CONE_H + 0.0002], [CONE_R - 0.0025, CONE_H - 0.002]);
  const g = latheGeometry(prof, 36);
  uvVByHeight(g, (y) => y / CONE_H);
  return smoothNormals(g);
});

const SCOOP_PROFILE: Profile = smoothProfile(
  [
    [0.0001, -0.003],
    [0.016, -0.003],
    [0.0236, 0.0004],
    [0.0292, 0.0036],
    [0.0318, 0.0066],
    [0.0304, 0.0104],
    [0.0322, 0.0168],
    [0.0332, 0.026],
    [0.0306, 0.0362],
    [0.0244, 0.0446],
    [0.0148, 0.0504],
    [0.0052, 0.0527],
    [0.0001, 0.053],
  ],
  30,
);

function buildIceCream(r: Rng): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(coneGeo(), coneMat(), { name: 'cone' }));
  const ph = r.range(0, TAU), seed = r.range(0, 30);
  const ruff = r.int(7, 9);
  const scoop = revolve(SCOOP_PROFILE, {
    segments: 44,
    map: (_j, th, rr, y) => {
      const skirt = Math.exp(-(((y - 0.0058) / 0.0042) ** 2));
      const lump = fbm3(Math.cos(th) * 1.6 + seed, y * 70, Math.sin(th) * 1.6, 2) * sstep(0.008, 0.03, y);
      const k = 1 + 0.075 * Math.sin(ruff * th + ph) * skirt + 0.05 * lump + 0.012 * Math.sin(th * 3 + y * 300);
      return [rr * k, y + 0.0012 * Math.sin(ruff * th + ph) * skirt];
    },
  });
  scoop.translate(0, CONE_H - 0.0045, 0);
  g.add(mesh(scoop, scoopMat(), { name: 'scoop' }));
  // drips running down the cone
  const drips: THREE.BufferGeometry[] = [];
  const nd = r.int(3, 4);
  const slope = CONE_R / CONE_H;
  for (let i = 0; i < nd; i++) {
    const phi = ph + (i / nd) * TAU + r.range(-0.4, 0.4);
    const len = r.range(0.014, 0.028);
    const prof: Profile = smoothProfile([[0.0001, 0], [0.0024, 0.0006], [0.0034, 0.0026], [0.0028, 0.0052], [0.0025, len * 0.65], [0.0044, len], [0.0001, len + 0.0026]], 12);
    const drop = latheGeometry(prof, 10);
    drop.scale(1, 1, 0.55);
    // frame: local y up the cone slant, local z along the cone normal
    const yTop = CONE_H + 0.0012;
    const yBot = yTop - len;
    const P0 = new THREE.Vector3(Math.sin(phi) * slope * yBot, yBot, Math.cos(phi) * slope * yBot);
    const P1 = new THREE.Vector3(Math.sin(phi) * slope * yTop, yTop, Math.cos(phi) * slope * yTop);
    const ty = P1.clone().sub(P0).normalize();
    const nz = new THREE.Vector3(Math.sin(phi), -slope, Math.cos(phi)).normalize();
    const tx = new THREE.Vector3().crossVectors(ty, nz).normalize();
    nz.crossVectors(tx, ty).normalize();
    const m = new THREE.Matrix4().makeBasis(tx, ty, nz);
    m.setPosition(P0.addScaledVector(nz, 0.0012));
    drips.push(drop.applyMatrix4(m));
  }
  g.add(mesh(smoothNormals(merge(drips)), scoopMat()));
  const spr = sprinklesOn(scoop, r, 34, 0.35, (p) => p.y > CONE_H + 0.016);
  if (spr) g.add(mesh(spr, sprinkleMat(), { name: 'sprinkles' }));
  g.rotation.y = r.range(0, TAU);
  return sitOnGround(g);
}

// =============================================================================================
// Table
// =============================================================================================

export const MODELS: ModelTable = {
  egg: {
    build: buildEgg,
    profile: EGG_PROFILE,
    skin: eggWhiteMat,
    flesh: eggWhiteMat,
    section: (ctx, s) => eggSection(ctx, s),
    sectionV: (ctx, w, h) => eggSectionV(ctx, w, h),
    peeled: buildPeeledEgg,
    forms: { cracked: (r) => crackedEgg(r), diced: (r) => choppedEgg(r) },
    variant: (state: FoodState, r: Rng) => (state.peeled && state.form === 'whole' ? buildPeeledEgg(r) : null),
  },
  milk: {
    build: (r) => buildCarton(MILK_SPEC, r),
    flesh: lazy(() => foodMat({ color: colors('milk').flesh, roughness: 0.3, flesh: colors('milk').flesh, cookColor: colors('milk').cooked })),
  },
  cheese: {
    build: buildCheese,
    sliceShape: cheeseSliceShape,
    section: (ctx, s, o) => cheeseSection(ctx, s, o),
    skin: cheeseRindMat,
    flesh: cheeseFleshMat,
  },
  mozzarella: {
    build: buildMozzarella,
    profile: MOZZ_PROFILE,
    section: (ctx, s, o) => mozzSection(ctx, s, o),
    sectionV: (ctx, w, h) => mozzSectionV(ctx, w, h),
    skin: mozzMat,
    flesh: mozzFleshMat,
  },
  butter: {
    build: buildButter,
    sliceShape: butterSliceShape,
    section: (ctx, s) => butterSection(ctx, s),
    skin: butterMat,
    flesh: butterMat,
  },
  yogurt: {
    build: buildYogurt,
    flesh: yogFillMat,
  },
  cream: {
    build: (r) => buildCarton(CREAM_SPEC, r),
    flesh: lazy(() => foodMat({ color: colors('cream').flesh, roughness: 0.3, flesh: colors('cream').flesh, cookColor: colors('cream').cooked })),
  },
  'ice-cream': {
    build: buildIceCream,
    skin: scoopMat,
    flesh: scoopMat,
  },
};
