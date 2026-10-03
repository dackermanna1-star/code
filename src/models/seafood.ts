// Seafood models: salmon fillet, whole fish, shrimp, crab.

import * as THREE from 'three';
import type { ModelTable, SectionOpts } from './types';
import { getDef } from '../food/catalog';
import {
  Rng,
  rng,
  fbm3,
  canvasTexture,
  smoothProfile,
  deform,
  noisify,
  smoothNormals,
  sweepGeometry,
  curveThrough,
  mesh,
  sitOnGround,
  skinMesh,
  lazy,
  foodMat,
  type Profile,
} from './kit';
import { TAU, sstep, clamp01, rgba, mixHex, wrapped, mottleT, specksT, streaks, bumpTexture, repeated, setUV, slabGeometry } from './meat';

function colors(id: string) {
  return getDef(id).colors;
}

function tex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, wrap = false) {
  return canvasTexture(w, h, draw, { key, wrap });
}

/** Make every triangle of an indexed geometry face +Y on average (flip winding if needed). */
function faceUp(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    sum += b.sub(a).cross(c.sub(a)).y;
  }
  if (sum < 0) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) {
      const tmp = arr[t + 1];
      arr[t + 1] = arr[t + 2];
      arr[t + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** A grid surface p(s, t) for s, t in 0..1 (fins, tail fans). UV = (s, t). */
function gridSurface(f: (s: number, t: number) => THREE.Vector3, ns: number, nt: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= ns; i++)
    for (let j = 0; j <= nt; j++) {
      const p = f(i / ns, j / nt);
      pos.push(p.x, p.y, p.z);
      uv.push(i / ns, j / nt);
    }
  const row = nt + 1;
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nt; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return faceUp(g);
}

// =============================================================================================
// SALMON - thick fillet: orange flesh with white fat lines, silver skin underneath
// =============================================================================================

const SALMON = { flesh: '#f68a57', deep: '#ee7444', light: '#fbab7c', fat: '#fde6d4', skin: '#a9b2b8', skinDark: '#5f6b75' };
const SAL_L = 0.09; // half length
const SAL_W = 0.041; // half width at the head end

function salmonHalfWidth(x: number): number {
  const u = clamp01((x + SAL_L) / (2 * SAL_L));
  return SAL_W * (1 - 0.48 * Math.pow(u, 1.5));
}

/** Polar outline of the fillet, solved numerically from a superellipse with a tapering width. */
function salmonOutline(r: Rng) {
  const n = 2.5;
  const k1 = r.range(0.01, 0.025), p1 = r.range(0, TAU);
  const cache = new Map<number, number>();
  return (a: number) => {
    const key = Math.round(a * 1e4);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const ca = Math.cos(a), sa = Math.sin(a);
    let lo = 0, hi = SAL_L * 1.2;
    for (let i = 0; i < 28; i++) {
      const R = (lo + hi) / 2;
      const x = R * ca, z = R * sa;
      // belly side (-z) a little straighter
      const w = salmonHalfWidth(x) * (z < 0 ? 0.92 : 1);
      const f = Math.pow(Math.abs(x) / SAL_L, n) + Math.pow(Math.abs(z) / w, n);
      if (f > 1) hi = R;
      else lo = R;
    }
    const R = lo * (1 + k1 * Math.sin(3 * a + p1));
    cache.set(key, R);
    return R;
  };
}

function salmonThickness(x: number, z: number): number {
  const u = clamp01((x + SAL_L) / (2 * SAL_L));
  const w = salmonHalfWidth(x);
  const across = z / w;
  return 0.03 * (1 - 0.55 * Math.pow(u, 1.3)) * (1 - 0.32 * across * across) * (1 - 0.18 * Math.max(0, -across)) + 0.003;
}

/** Fat lines: curved chevrons across the fillet. u along the fillet (canvas x), v across (canvas y). */
function paintSalmonFlesh(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, lines = 16) {
  const r = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SALMON.deep);
  g.addColorStop(0.55, SALMON.flesh);
  g.addColorStop(1, SALMON.light);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  mottleT(ctx, w, h, SALMON.deep, r, 30, [w * 0.03, w * 0.08], [0.15, 0.3]);
  mottleT(ctx, w, h, SALMON.light, r, 30, [w * 0.03, w * 0.08], [0.15, 0.3]);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = -1; i <= lines + 1; i++) {
    const x0 = ((i + r.range(-0.15, 0.15)) / lines) * w;
    const bow = w * r.range(0.025, 0.05);
    const lw = h * r.range(0.012, 0.022);
    // chevron: bulges towards +u in the middle (along the lateral line)
    const pts: [number, number][] = [];
    for (let k = 0; k <= 16; k++) {
      const v = k / 16;
      const x = x0 + bow * Math.sin(Math.PI * v) + w * 0.01 * Math.sin(v * 9 + i);
      pts.push([x, v * h]);
    }
    for (const [k, al] of [
      [2.6, 0.22],
      [1, 0.85],
    ]) {
      ctx.strokeStyle = rgba(SALMON.fat, al);
      ctx.beginPath();
      pts.forEach(([x, y], j) => {
        ctx.lineWidth = lw * k * (0.6 + 0.4 * Math.sin((Math.PI * j) / 16));
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.restore();
  // faint lengthwise lateral line
  ctx.fillStyle = rgba('#f0a27c', 0.35);
  ctx.fillRect(0, h * 0.48, w, h * 0.02);
}

const salmonTex = lazy(() => tex('salmon-top', 512, 256, (ctx, w, h) => paintSalmonFlesh(ctx, w, h, 17)));

const salmonMats = {
  top: lazy(() => {
    const c = colors('salmon');
    return foodMat({ color: '#ffffff', map: salmonTex(), roughness: 0.34, flesh: c.flesh, cookColor: c.cooked, name: 'salmon' });
  }),
  skinSide: lazy(() => {
    const map = tex('salmon-skin', 256, 256, (ctx, w, h) => {
      const r = rng(23);
      ctx.fillStyle = SALMON.skin;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, '#c8d0d6', r, 40, [w * 0.05, w * 0.12], [0.3, 0.5]);
      mottleT(ctx, w, h, SALMON.skinDark, r, 26, [w * 0.04, w * 0.1], [0.15, 0.3]);
      specksT(ctx, w, h, '#3c4650', r, 160, [0.8, 2.2], 0.6);
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.3, metalness: 0.35, flesh: colors('salmon').flesh, cookColor: '#7a4a2a', name: 'salmon-skin' });
  }),
  skin: lazy(() => {
    // tileable striped flesh for generic pieces
    const c = colors('salmon');
    const map = tex('salmon-skin-tile', 256, 256, (ctx, w, h) => paintSalmonFlesh(ctx, w, h, 29, 6), true);
    return foodMat({ color: '#ffffff', map, roughness: 0.36, flesh: c.flesh, cookColor: c.cooked, name: 'salmon-tile' });
  }),
  flesh: lazy(() => {
    const c = colors('salmon');
    const map = tex('salmon-flesh', 256, 256, (ctx, w, h) => {
      const r = rng(31);
      ctx.fillStyle = c.flesh;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, SALMON.deep, r, 24, [w * 0.05, w * 0.12], [0.15, 0.3]);
      streaks(ctx, r, { count: 10, x: [0, w], y: [0, h], steps: [8, 16], step: w * 0.03, width: [1.5, 3], color: SALMON.fat, alpha: [0.5, 0.8], dir: Math.PI / 2, dirJitter: 0.2, turn: 0.1, branch: 0, soft: 1.5, wrap: [w, h] });
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.38, flesh: c.flesh, cookColor: c.cooked, name: 'salmon-flesh' });
  }),
};

function buildSalmon(r: Rng): THREE.Object3D {
  const g = slabGeometry({
    outline: salmonOutline(r),
    thickness: salmonThickness,
    edge: 0.009,
    edgePow: 0.75,
    segments: 80,
    rings: 8,
    edgeRings: 10,
    uv: 'planar',
    split: 0.28,
  });
  noisify(g, 0.0006, 80, r.range(0, 10));
  const m = mesh(g, [salmonMats.top(), salmonMats.skinSide()]);
  m.rotation.y = r.range(-0.2, 0.2);
  return sitOnGround(m);
}

function salmonSection(ctx: CanvasRenderingContext2D, s: number) {
  // cut across the fillet: fat lines run as gentle arcs across the face
  const r = rng(37);
  ctx.fillStyle = SALMON.flesh;
  ctx.fillRect(0, 0, s, s);
  mottleT(ctx, s, s, SALMON.deep, r, 20, [s * 0.05, s * 0.14], [0.2, 0.35]);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const y0 = ((i + 0.5) / 7) * s;
    for (const [k, al] of [
      [2.4, 0.22],
      [1, 0.8],
    ]) {
      ctx.strokeStyle = rgba(SALMON.fat, al);
      ctx.lineWidth = s * 0.016 * k;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(s / 2, y0 + s * 0.12, s, y0);
      ctx.stroke();
    }
  }
  ctx.restore();
  // silver skin along the bottom
  ctx.fillStyle = SALMON.skin;
  ctx.fillRect(0, s * 0.94, s, s * 0.06);
}

// =============================================================================================
// FISH - a cute whole fish lying on its side along X
// =============================================================================================

const FISH = { back: '#4d7593', flank: '#9cbcd0', belly: '#eef3f3', line: '#5f84a0', fin: '#86a9c0', finEdge: '#cfe0ea', ray: '#5e8098' };
const FISH_LEN = 0.205; // body (nose -> tail root); the tail fin adds ~0.075
/** Dorso-ventral half height of the body at x (0 = nose). */
function fishHz(x: number): number {
  const t = clamp01(x / FISH_LEN);
  const nose = Math.sqrt(sstep(0, 0.16, t)) * 0.92 + 0.08 * sstep(0, 0.02, t);
  const body = 0.04 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85);
  const ped = 0.0105 * sstep(0.62, 0.97, t);
  return Math.max(body * nose, ped) * (t >= 1 ? 0 : 1) + 0.0001;
}
/** Half thickness (vertical when lying on its side). */
function fishHy(x: number): number {
  const t = clamp01(x / FISH_LEN);
  return fishHz(x) * (0.56 - 0.16 * sstep(0.55, 1, t));
}

function fishBodyGeometry(r: Rng): THREE.BufferGeometry {
  const rings = 64, segs = 40;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const end = FISH_LEN + 0.008;
  const xs: number[] = [];
  for (let i = 0; i <= rings; i++) xs.push((end * (1 - Math.cos((Math.PI * i) / rings))) / 2);
  const ph = r.range(0, 10);
  for (const x of xs) {
    let hz = fishHz(Math.min(x, FISH_LEN * 0.999));
    let hy = fishHy(Math.min(x, FISH_LEN * 0.999));
    if (x > FISH_LEN * 0.999) {
      const k = Math.sqrt(Math.max(0, 1 - ((x - FISH_LEN) / 0.008) ** 2));
      hz *= k;
      hy *= k;
    }
    const yc = fishHy(Math.min(x, FISH_LEN * 0.98)) * 0.96;
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * TAU;
      // fuller belly, keeled back
      const c = Math.cos(th), s = Math.sin(th);
      const belly = c < 0 ? 1 + 0.08 * Math.min(1, -c) * sstep(0.1, 0.4, x / FISH_LEN) * (1 - sstep(0.55, 0.8, x / FISH_LEN)) : 1;
      const z = hz * c * belly;
      const y = yc + hy * s * (s < 0 ? 0.92 : 1);
      pos.push(x, y, z);
      uv.push(j / segs, x / end);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // flatten the resting flank a touch and add a hint of the gill-cover bulge
  deform(g, (p) => {
    if (p.y < 0.002) p.y = 0.002 - (0.002 - p.y) * 0.5;
    const gill = Math.exp(-(((p.x - 0.048) / 0.012) ** 2));
    p.y += 0.0012 * gill * (p.y > fishHy(p.x) * 0.9 ? 1 : 0);
  });
  noisify(g, 0.0003, 90, ph);
  return g;
}

/** Body skin painted around (u: 0 dorsal, .25 top flank, .5 belly, .75 bottom flank) x along (v). */
function paintFishSkin(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(51);
  // v (canvas y) runs nose (bottom, v=0) -> tail (top, v=1) because of flipY; paint per u column
  const img = ctx.createImageData(w, h);
  const back = new THREE.Color(FISH.back), flank = new THREE.Color(FISH.flank), belly = new THREE.Color(FISH.belly);
  const c = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const v = 1 - y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // 0 at dorsal edge, 1 at belly
      const d = Math.min(1, Math.abs(u - 0) * 2, Math.abs(u - 1) * 2);
      const n = fbm3(u * 14, v * 22, 3.1, 2);
      const dd = clamp01(d + n * 0.06 + 0.04 * Math.sin(v * 30));
      if (dd < 0.42) c.copy(back).lerp(flank, sstep(0.12, 0.42, dd));
      else c.copy(flank).lerp(belly, sstep(0.5, 0.82, dd));
      // head a little darker on top
      if (v < 0.22) c.lerp(back, 0.12 * (1 - sstep(0.12, 0.22, v)) * (1 - dd));
      const i = (y * w + x) * 4;
      img.data[i] = c.r * 255;
      img.data[i + 1] = c.g * 255;
      img.data[i + 2] = c.b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // lateral lines (both flanks)
  for (const u0 of [0.25, 0.75]) {
    ctx.strokeStyle = rgba(FISH.line, 0.55);
    ctx.lineWidth = w * 0.006;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const v = 0.24 + (k / 30) * 0.7;
      const x = (u0 + (u0 < 0.5 ? -1 : 1) * 0.05 * Math.sin(Math.PI * (k / 30))) * w;
      k === 0 ? ctx.moveTo(x, (1 - v) * h) : ctx.lineTo(x, (1 - v) * h);
    }
    ctx.stroke();
  }
  // gill cover arc
  for (const [ua, ub] of [
    [0.04, 0.46],
    [0.54, 0.96],
  ]) {
    ctx.strokeStyle = rgba('#6c8ea8', 0.6);
    ctx.lineWidth = w * 0.01;
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) {
      const u = ua + (ub - ua) * (k / 20);
      const v = 0.215 + 0.03 * Math.sin(Math.PI * (k / 20));
      k === 0 ? ctx.moveTo(u * w, (1 - v) * h) : ctx.lineTo(u * w, (1 - v) * h);
    }
    ctx.stroke();
  }
  // a few cute spots on the back half
  for (let i = 0; i < 26; i++) {
    const u = r.next() < 0.5 ? r.range(0.06, 0.2) : r.range(0.8, 0.94);
    const v = r.range(0.28, 0.85);
    ctx.fillStyle = rgba('#3f6582', r.range(0.25, 0.45));
    ctx.beginPath();
    ctx.arc(u * w, (1 - v) * h, w * r.range(0.006, 0.011), 0, TAU);
    ctx.fill();
  }
  // mouth: a small dark smile near the nose on both flanks
  for (const u0 of [0.2, 0.8]) {
    ctx.strokeStyle = rgba('#3a4f60', 0.7);
    ctx.lineWidth = w * 0.008;
    ctx.beginPath();
    ctx.arc(u0 * w, (1 - 0.012) * h, w * 0.04, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

const fishScaleBump = lazy(() =>
  bumpTexture('fish-scales', 128, 128, (ctx, w, h) => {
    // overlapping scale arcs
    const n = 8;
    for (let row = 0; row < n + 1; row++)
      for (let col = 0; col < n + 1; col++) {
        const x = ((col + (row % 2) * 0.5) / n) * w, y = (row / n) * h;
        wrapped(w, h, x, y, w / n, (xx, yy) => {
          const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, (w / n) * 0.75);
          g.addColorStop(0, 'rgba(255,255,255,0.35)');
          g.addColorStop(0.85, 'rgba(255,255,255,0.05)');
          g.addColorStop(1, 'rgba(0,0,0,0.35)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(xx, yy, (w / n) * 0.75, 0, TAU);
          ctx.fill();
        });
      }
  }),
);

const fishMats = {
  skin: lazy(() => {
    const c = colors('fish');
    const map = tex('fish-skin', 256, 256, paintFishSkin);
    return foodMat({ color: '#ffffff', map, bumpMap: repeated(fishScaleBump(), 'fish-scales-x', 10, 14), bumpScale: 0.6, roughness: 0.3, metalness: 0.28, flesh: c.flesh, cookColor: c.cooked, name: 'fish-skin' });
  }),
  fin: lazy(() => {
    const c = colors('fish');
    const map = tex('fish-fin', 128, 128, (ctx, w, h) => {
      // u along the fin base (canvas x), v outwards (canvas y bottom -> top)
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, FISH.fin);
      g.addColorStop(0.8, FISH.finEdge);
      g.addColorStop(1, '#e4eef3');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(FISH.ray, 0.55);
      ctx.lineWidth = 1.6;
      for (let i = 0; i <= 12; i++) {
        const x = (i / 12) * w;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + (i / 12 - 0.5) * w * 0.15, h * 0.06);
        ctx.stroke();
      }
    });
    return foodMat({ color: '#ffffff', map, roughness: 0.35, metalness: 0.1, flesh: FISH.fin, cookColor: c.cooked, cookAmount: 0.8, name: 'fish-fin' });
  }),
  eyeWhite: lazy(() => foodMat({ color: '#fbfbf7', roughness: 0.2, clearcoat: 1, flesh: '#fbfbf7', cookColor: '#e8e2d0', cookAmount: 0.15, name: 'fish-eye' })),
  pupil: lazy(() => foodMat({ color: '#1b2430', roughness: 0.12, clearcoat: 1, flesh: '#1b2430', cookColor: '#d8d4c8', cookAmount: 0.7, name: 'fish-pupil' })),
  flesh: lazy(() => {
    const c = colors('fish');
    const map = tex('fish-flesh', 256, 256, (ctx, w, h) => {
      const r = rng(61);
      ctx.fillStyle = c.flesh;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, '#efe2d2', r, 30, [w * 0.05, w * 0.14], [0.3, 0.5]);
      streaks(ctx, r, { count: 14, x: [0, w], y: [0, h], steps: [10, 20], step: w * 0.03, width: [1, 2], color: '#e2d3c2', alpha: [0.4, 0.7], dir: Math.PI / 2, dirJitter: 0.15, turn: 0.08, branch: 0, wrap: [w, h] });
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.45, flesh: c.flesh, cookColor: c.cooked, name: 'fish-flesh' });
  }),
};

/** Fin lying on the board: base along a polyline on the body edge, sweeping outwards (in XZ) and drooping. */
function finGeom(base: (s: number) => THREE.Vector3, outward: (s: number) => THREE.Vector3, len: (s: number) => number, droop: number, ns = 12, nt = 6): THREE.BufferGeometry {
  return gridSurface(
    (s, t) => {
      const b = base(s);
      const o = outward(s);
      const L = len(s);
      const p = b.clone().addScaledVector(o, L * t);
      p.y = Math.max(0.0015, b.y - droop * Math.pow(t, 1.4) + 0.0015 * Math.sin(s * 40) * t);
      return p;
    },
    ns,
    nt,
  );
}

function buildFish(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  const body = fishBodyGeometry(r);
  root.add(skinMesh(mesh(body, fishMats.skin())));
  const fin = fishMats.fin();
  const edgeY = (x: number) => fishHy(x) * 0.96;
  // tail fin: forked fan spreading flat behind the body
  const tail = gridSurface(
    (s, t) => {
      // s across the fan (-1..1), t outwards from the root
      const across = s * 2 - 1;
      const fork = 1 - 0.38 * Math.exp(-((across / 0.42) ** 2)) * t; // notch in the middle
      const spread = 0.009 + 0.04 * Math.pow(t, 0.8);
      const x = FISH_LEN - 0.006 + t * 0.075 * fork + 0.012 * across * across * t;
      const z = across * spread;
      const y = Math.max(0.0015, edgeY(FISH_LEN * 0.97) * (1 - t * 0.85) + 0.0012 * Math.sin(across * 9) * t);
      return new THREE.Vector3(x, y, z);
    },
    14,
    8,
  );
  root.add(mesh(tail, fin));
  // dorsal fin along the back (+z edge), anal fin under the belly (-z edge)
  const dorsal = finGeom(
    (s) => {
      const x = 0.07 + s * 0.085;
      return new THREE.Vector3(x, edgeY(x), fishHz(x) - 0.002);
    },
    (s) => new THREE.Vector3(0.25 + s * 0.3, 0, 1).normalize(),
    (s) => 0.024 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.7)), 0.7) + 0.002,
    0.006,
  );
  root.add(mesh(dorsal, fin));
  const anal = finGeom(
    (s) => {
      const x = 0.135 + s * 0.04;
      return new THREE.Vector3(x, edgeY(x), -fishHz(x) + 0.002);
    },
    (s) => new THREE.Vector3(0.4 + s * 0.3, 0, -1).normalize(),
    (s) => 0.014 * Math.sin(Math.PI * Math.pow(s, 0.8)) + 0.002,
    0.004,
    8,
    5,
  );
  root.add(mesh(anal, fin));
  const pelvic = finGeom(
    (s) => {
      const x = 0.085 + s * 0.02;
      return new THREE.Vector3(x, edgeY(x), -fishHz(x) + 0.002);
    },
    () => new THREE.Vector3(0.7, 0, -1).normalize(),
    (s) => 0.014 * Math.sin(Math.PI * Math.pow(s, 0.6)) + 0.002,
    0.004,
    6,
    5,
  );
  root.add(mesh(pelvic, fin));
  // pectoral fin lying on the upper flank behind the gill
  const pect = gridSurface(
    (s, t) => {
      const across = s * 2 - 1;
      const x = 0.058 + t * 0.03 + across * 0.004;
      const z = 0.004 + across * 0.007 * (0.4 + t) - t * 0.004;
      const hz = fishHz(x), hy = fishHy(x);
      const yc = fishHy(x) * 0.96;
      const zz = Math.max(-0.99, Math.min(0.99, z / hz));
      const y = yc + hy * Math.sqrt(1 - zz * zz) + 0.0015 + t * 0.0025;
      return new THREE.Vector3(x, y, z);
    },
    6,
    6,
  );
  root.add(mesh(pect, fin));
  // eye: white with a big glossy pupil and a highlight
  const ex = 0.026, ez = 0.008;
  const ehz = fishHz(ex), ehy = fishHy(ex);
  const eyeY = fishHy(ex) * 0.96 + ehy * Math.sqrt(1 - (ez / ehz) ** 2);
  const white = new THREE.SphereGeometry(0.0078, 20, 14);
  white.scale(1, 0.55, 1);
  root.add(mesh(white, fishMats.eyeWhite(), { pos: [ex, eyeY - 0.0005, ez] }));
  const pupil = new THREE.SphereGeometry(0.0052, 18, 12);
  pupil.scale(1, 0.55, 1);
  root.add(mesh(pupil, fishMats.pupil(), { pos: [ex + 0.0006, eyeY + 0.0018, ez + 0.0004] }));
  const hl = new THREE.SphereGeometry(0.0016, 10, 8);
  root.add(mesh(hl, fishMats.eyeWhite(), { pos: [ex - 0.0012, eyeY + 0.0036, ez + 0.0018] }));
  // centre the whole fish (nose at -x)
  root.position.x = -0.14;
  const outer = new THREE.Group();
  outer.add(root);
  outer.rotation.y = r.range(-0.15, 0.15);
  return sitOnGround(outer);
}

const fishProfile: Profile = (() => {
  const out: Profile = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const x = (FISH_LEN * (1 - Math.cos((Math.PI * i) / n))) / 2;
    const rr = i === 0 || i === n ? 0.0001 : Math.sqrt(fishHz(x) * fishHy(x)) * 1.15;
    out.push([rr, x]);
  }
  return out;
})();

function fishSection(ctx: CanvasRenderingContext2D, s: number, opts: SectionOpts) {
  const c = colors('fish');
  const cx = s / 2, cy = s / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, s / 2, 0, TAU);
  ctx.clip();
  ctx.fillStyle = c.flesh;
  ctx.fillRect(0, 0, s, s);
  // flaky muscle rings (myomeres) around the spine
  for (let i = 1; i <= 5; i++) {
    const rr = (s / 2) * (i / 5.6);
    for (const [k, al] of [
      [2.5, 0.2],
      [1, 0.5],
    ]) {
      ctx.strokeStyle = rgba('#e3d3bf', al);
      ctx.lineWidth = s * 0.012 * k;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 1.05, 0, 0, TAU);
      ctx.stroke();
    }
  }
  // the four quadrant seams
  ctx.strokeStyle = rgba('#e0cfb8', 0.6);
  ctx.lineWidth = s * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s / 2);
  ctx.lineTo(cx, cy + s / 2);
  ctx.moveTo(cx - s / 2, cy);
  ctx.lineTo(cx + s / 2, cy);
  ctx.stroke();
  // backbone
  ctx.fillStyle = '#d9d2c4';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.045, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#efe9de';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.025, 0, TAU);
  ctx.fill();
  if (!opts.peeled) {
    // silver skin ring, darker on the back
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, FISH.back);
    g.addColorStop(0.5, FISH.flank);
    g.addColorStop(1, FISH.belly);
    ctx.strokeStyle = g;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, s / 2 - s * 0.035, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

// =============================================================================================
// SHRIMP - three curled, segmented shrimp with tail fans and little legs
// =============================================================================================

const SHRIMP = { shell: '#eaa69a', band: '#d98a80', light: '#f6cfc3', tail: '#e57b6a', tailTip: '#b84d42', leg: '#e9a597' };

const shrimpMats = {
  shell: lazy(() => {
    const c = colors('shrimp');
    const map = tex('shrimp-shell', 128, 256, (ctx, w, h) => {
      // u around (canvas x), v along the body (canvas y: top = tail end because of flipY)
      const r = rng(71);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, SHRIMP.light);
      g.addColorStop(0.5, SHRIMP.shell);
      g.addColorStop(1, SHRIMP.light);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, '#f9ddd4', r, 30, [w * 0.05, w * 0.15], [0.2, 0.4]);
      // segment bands: darker leading edge, lighter overlap
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const y0 = (1 - (0.1 + (i / segs) * 0.82)) * h;
        const gg = ctx.createLinearGradient(0, y0 - h * 0.05, 0, y0 + h * 0.02);
        gg.addColorStop(0, rgba(SHRIMP.band, 0));
        gg.addColorStop(0.75, rgba(SHRIMP.band, 0.75));
        gg.addColorStop(1, rgba('#fbe3da', 0.7));
        ctx.fillStyle = gg;
        ctx.fillRect(0, y0 - h * 0.05, w, h * 0.07);
      }
      specksT(ctx, w, h, '#c97a70', r, 60, [0.5, 1.2], 0.35);
    });
    return foodMat({ color: '#ffffff', map, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.35, flesh: c.flesh, cookColor: c.cooked, name: 'shrimp' });
  }),
  tail: lazy(() => {
    const c = colors('shrimp');
    const map = tex('shrimp-tail', 64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, SHRIMP.shell);
      g.addColorStop(0.55, SHRIMP.tail);
      g.addColorStop(1, SHRIMP.tailTip);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba('#c46a5c', 0.5);
      ctx.lineWidth = 1.2;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo((i / 6) * w, h);
        ctx.lineTo((i / 6) * w, h * 0.1);
        ctx.stroke();
      }
    });
    return foodMat({ color: '#ffffff', map, roughness: 0.32, flesh: SHRIMP.tail, cookColor: '#e8502c', name: 'shrimp-tail' });
  }),
  leg: lazy(() => foodMat({ color: SHRIMP.leg, roughness: 0.4, flesh: SHRIMP.leg, cookColor: '#f08a5a', name: 'shrimp-leg' })),
  flesh: lazy(() => {
    const c = colors('shrimp');
    const map = tex('shrimp-flesh', 128, 128, (ctx, w, h) => {
      const r = rng(73);
      ctx.fillStyle = c.flesh;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, '#f8dcd2', r, 16, [w * 0.08, w * 0.2], [0.4, 0.6]);
      mottleT(ctx, w, h, '#eaa090', r, 14, [w * 0.06, w * 0.15], [0.2, 0.35]);
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.4, flesh: c.flesh, cookColor: c.cooked, name: 'shrimp-flesh' });
  }),
};

/** One curled shrimp lying on its side, curl in the XZ plane, centred roughly on the origin. */
function shrimpGeometry(r: Rng): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry; legs: THREE.BufferGeometry[] } {
  const curl = r.range(1.15, 1.35) * Math.PI;
  const R0 = 0.021 * r.range(0.95, 1.05);
  const th0 = 0.0092 * r.range(0.95, 1.05);
  const y = th0 * 0.92;
  const pts: [number, number, number][] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * curl;
    const rr = R0 * (1 - 0.32 * t);
    pts.push([Math.cos(a) * rr, y - t * 0.0035, Math.sin(a) * rr]);
  }
  const curve = curveThrough(pts);
  const segs = 7;
  const radius = (t: number) => {
    const base = th0 * (1 - 0.6 * Math.pow(t, 1.15)) * (0.82 + 0.18 * sstep(0, 0.12, t));
    // shell segments: soft ridges
    const f = (t * segs * 1.12 + 0.2) % 1;
    return base * (1 + 0.06 * sstep(0.0, 0.25, f) * (1 - sstep(0.65, 1, f)));
  };
  const body = sweepGeometry(curve, { radius, radialSegments: 16, tubularSegments: 56, caps: 'round' });
  // tail fan at the end, splayed flat
  const end = curve.getPoint(1);
  const tan = curve.getTangent(1).setY(0).normalize();
  const side = new THREE.Vector3(-tan.z, 0, tan.x);
  const tail = gridSurface(
    (s, t) => {
      const across = s * 2 - 1;
      const lobes = 1 - 0.25 * Math.abs(Math.sin(across * Math.PI * 1.5));
      const L = 0.016 * lobes;
      const wdt = 0.002 + 0.0085 * Math.pow(t, 0.7);
      const p = end.clone().addScaledVector(tan, -0.002 + t * L).addScaledVector(side, across * wdt);
      p.y = Math.max(0.0012, end.y - 0.003 * t);
      return p;
    },
    10,
    6,
  );
  // little swimmeret legs on the inner (belly) side of the curl
  const legs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const t = 0.18 + i * 0.12;
    const p = curve.getPoint(t);
    const inward = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    const rr = radius(t);
    const a = p.clone().addScaledVector(inward, rr * 0.75);
    a.y = Math.max(0.002, a.y - rr * 0.3);
    const b = a.clone().addScaledVector(inward, 0.006).add(new THREE.Vector3(0, -0.001, 0));
    b.y = Math.max(0.0012, b.y);
    const mid = a.clone().lerp(b, 0.5).addScaledVector(curve.getTangent(t), -0.0015);
    legs.push(sweepGeometry(curveThrough([a.toArray() as [number, number, number], mid.toArray() as [number, number, number], b.toArray() as [number, number, number]]), { radius: (tt) => 0.0011 * (1 - 0.6 * tt), radialSegments: 5, tubularSegments: 5 }));
  }
  // two antennae from the head end curling outwards
  const head = curve.getPoint(0);
  const ht = curve.getTangent(0).negate().setY(0).normalize();
  const hs = new THREE.Vector3(-ht.z, 0, ht.x);
  for (const sgn of [-1, 1]) {
    const p0 = head.clone().addScaledVector(ht, th0 * 0.6).addScaledVector(hs, sgn * 0.002);
    const p1 = p0.clone().addScaledVector(ht, 0.012).addScaledVector(hs, sgn * 0.006);
    const p2 = p1.clone().addScaledVector(ht, 0.01).addScaledVector(hs, sgn * 0.014);
    p1.y = Math.max(0.002, p1.y - 0.002);
    p2.y = 0.0015;
    legs.push(sweepGeometry(curveThrough([p0.toArray() as [number, number, number], p1.toArray() as [number, number, number], p2.toArray() as [number, number, number]]), { radius: (tt) => 0.0008 * (1 - 0.5 * tt), radialSegments: 5, tubularSegments: 10 }));
  }
  return { body, tail, legs };
}

function shrimpObject(r: Rng): THREE.Group {
  const { body, tail, legs } = shrimpGeometry(r);
  const g = new THREE.Group();
  g.add(skinMesh(mesh(body, shrimpMats.shell())));
  g.add(mesh(tail, shrimpMats.tail()));
  for (const l of legs) g.add(mesh(l, shrimpMats.leg()));
  return g;
}

function buildShrimp(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  const spots: [number, number, number, number][] = [
    [-0.017, 0, 0.008, 0.4],
    [0.019, 0, 0.004, 2.6],
    [0.0, 0.011, -0.012, 4.4],
  ];
  spots.forEach(([x, y, z, rot], i) => {
    const s = shrimpObject(rng(r.int(1, 99999) + i));
    s.position.set(x, y, z);
    s.rotation.y = rot + r.range(-0.2, 0.2);
    if (y > 0) s.rotation.x = r.range(-0.12, -0.05);
    root.add(s);
  });
  return sitOnGround(root);
}

// =============================================================================================
// CRAB - a round, cute red crab with big claws and spindly legs
// =============================================================================================

const CRAB = { shell: '#e2552f', top: '#d9472a', light: '#f39a72', under: '#f6c2a0', tip: '#3f2620', eye: '#1c1c22' };

const crabMats = {
  shell: lazy(() => {
    const c = colors('crab');
    const map = tex('crab-shell', 256, 256, (ctx, w, h) => {
      const r = rng(81);
      ctx.fillStyle = CRAB.shell;
      ctx.fillRect(0, 0, w, h);
      mottleT(ctx, w, h, CRAB.top, r, 40, [w * 0.04, w * 0.12], [0.3, 0.5]);
      mottleT(ctx, w, h, CRAB.light, r, 30, [w * 0.03, w * 0.08], [0.2, 0.4]);
      specksT(ctx, w, h, '#f7b48e', r, 120, [0.8, 2.4], 0.5);
      specksT(ctx, w, h, '#b8361f', r, 80, [0.6, 1.6], 0.4);
    }, true);
    return foodMat({ color: '#ffffff', map, bumpMap: bumpTexture('crab-bump', 128, 128, (ctx, w, h) => {
      const r = rng(83);
      for (let i = 0; i < 160; i++) {
        const x = r.next() * w, y = r.next() * h, s = r.range(1.5, 4);
        wrapped(w, h, x, y, s, (xx, yy) => {
          const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, s);
          g.addColorStop(0, 'rgba(255,255,255,0.5)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(xx - s, yy - s, s * 2, s * 2);
        });
      }
    }), bumpScale: 0.8, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3, flesh: c.flesh, cookColor: c.cooked, cookAmount: 0.6, name: 'crab-shell' });
  }),
  under: lazy(() => foodMat({ color: CRAB.under, roughness: 0.45, flesh: colors('crab').flesh, cookColor: '#e8905a', cookAmount: 0.6, name: 'crab-under' })),
  tip: lazy(() => foodMat({ color: CRAB.tip, roughness: 0.3, clearcoat: 0.6, flesh: colors('crab').flesh, cookColor: '#2a1a14', cookAmount: 0.3, name: 'crab-tip' })),
  eyeWhite: lazy(() => foodMat({ color: '#ffffff', roughness: 0.2, clearcoat: 1, flesh: '#ffffff', cookAmount: 0.1, name: 'crab-eye' })),
  pupil: lazy(() => foodMat({ color: CRAB.eye, roughness: 0.1, clearcoat: 1, flesh: CRAB.eye, cookAmount: 0.1, name: 'crab-pupil' })),
  meat: lazy(() => {
    const c = colors('crab');
    const map = tex('crab-meat', 128, 128, (ctx, w, h) => {
      const r = rng(85);
      ctx.fillStyle = c.flesh;
      ctx.fillRect(0, 0, w, h);
      streaks(ctx, r, { count: 40, x: [0, w], y: [0, h], steps: [6, 14], step: 5, width: [1, 2.4], color: '#f3dcd2', alpha: [0.5, 0.8], dir: Math.PI / 2, dirJitter: 0.2, turn: 0.1, branch: 0, wrap: [w, h] });
      // pinkish-orange tint on one side like real crab sticks
      mottleT(ctx, w, h, '#f6b9a0', r, 10, [w * 0.08, w * 0.2], [0.2, 0.4]);
    }, true);
    return foodMat({ color: '#ffffff', map, roughness: 0.55, flesh: c.flesh, cookColor: '#f2c8a8', cookAmount: 0.5, name: 'crab-meat' });
  }),
};

/** A tapering leg (or arm) through points, with a darker tip. */
function crabLimb(pts: [number, number, number][], r0: number, r1: number, segs = 20): THREE.BufferGeometry {
  return sweepGeometry(curveThrough(pts), {
    radius: (t) => (r0 + (r1 - r0) * t) * (1 + 0.12 * Math.sin(t * Math.PI * (pts.length - 1)) ** 8),
    radialSegments: 10,
    tubularSegments: segs,
    caps: 'round',
  });
}

/** Big claw ("hand" + two fingers). Built pointing along +x from the wrist at the origin. */
function crabClaw(r: Rng, scale: number, open: number): { hand: THREE.BufferGeometry; fingers: THREE.BufferGeometry; tips: THREE.BufferGeometry } {
  const hand = new THREE.SphereGeometry(0.016, 24, 16);
  deform(hand, (p) => {
    p.x *= 1.45;
    p.y *= 0.85;
    p.z *= 1.0;
    // swell towards the fingers
    p.z *= 1 + 0.12 * sstep(-0.02, 0.02, p.x);
  });
  hand.translate(0.02, 0, 0);
  noisify(hand, 0.0006, 120, r.range(0, 9));
  const finger = (sgn: number) => {
    const a = (sgn * open) / 2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const ang = a - sgn * 0.55 * t * t; // curl back towards each other
      const len = 0.03 * t;
      pts.push([0.036 + Math.cos(ang) * len, 0, sgn * 0.006 + Math.sin(ang) * len]);
    }
    return sweepGeometry(curveThrough(pts), { radius: (t) => 0.0075 * (1 - 0.82 * t), radialSegments: 12, tubularSegments: 16, caps: 'round' });
  };
  const fA = finger(1), fB = finger(-1);
  // dark tips: short cones over the last third of each finger
  const tipOf = (sgn: number) => {
    const a = (sgn * open) / 2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 3; i++) {
      const t = 0.68 + (i / 3) * 0.34;
      const ang = a - sgn * 0.55 * t * t;
      const len = 0.03 * t;
      pts.push([0.036 + Math.cos(ang) * len, 0, sgn * 0.006 + Math.sin(ang) * len]);
    }
    return sweepGeometry(curveThrough(pts), { radius: (t) => 0.0075 * (1 - 0.82 * (0.68 + 0.34 * t)) * 1.06, radialSegments: 10, tubularSegments: 8, caps: 'round' });
  };
  const s = scale;
  const fingers = mergeGeoms([fA, fB]);
  const tips = mergeGeoms([tipOf(1), tipOf(-1)]);
  for (const g of [hand, fingers, tips]) g.scale(s, s, s);
  return { hand, fingers, tips };
}

function mergeGeoms(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // all sweeps share attributes (position, uv, normal, index)
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

function buildCrab(r: Rng): THREE.Object3D {
  const root = new THREE.Group();
  const lift = 0.016; // body clearance
  // --- carapace: wide smooth dome, crab faces +z (the viewer)
  const shell = new THREE.SphereGeometry(1, 48, 28);
  deform(shell, (p) => {
    const a = Math.atan2(p.z, p.x);
    // gently scalloped front rim
    const front = sstep(0.1, 0.9, p.z);
    const scallop = 1 + 0.03 * front * Math.cos(a * 9) * sstep(-0.2, 0.2, -Math.abs(p.y) + 0.2);
    let x = p.x * 0.062 * scallop;
    let z = p.z * 0.046 * scallop * (p.z > 0 ? 1.05 : 1);
    let y = p.y > 0 ? p.y * 0.03 : p.y * 0.012;
    // a soft ridge line across the back, and a slight dip in the middle front
    y -= 0.003 * Math.exp(-((p.x / 0.25) ** 2)) * sstep(0.3, 0.9, p.z) * (p.y > 0 ? 1 : 0);
    p.set(x, y, z);
  });
  noisify(shell, 0.0006, 90, r.range(0, 9));
  const shellM = mesh(shell, crabMats.shell(), { pos: [0, lift + 0.012, 0] });
  root.add(skinMesh(shellM));
  // pale belly plate
  const belly = new THREE.SphereGeometry(1, 32, 12, 0, TAU, Math.PI / 2, Math.PI / 2);
  belly.scale(0.052, 0.01, 0.038);
  root.add(mesh(belly, crabMats.under(), { pos: [0, lift + 0.011, 0] }));

  // --- eyes on little stalks
  for (const sx of [-1, 1]) {
    const stalk = crabLimb([[sx * 0.014, lift + 0.032, 0.03], [sx * 0.016, lift + 0.042, 0.036], [sx * 0.017, lift + 0.049, 0.038]], 0.003, 0.0025, 8);
    root.add(mesh(stalk, crabMats.shell()));
    root.add(mesh(new THREE.SphereGeometry(0.0072, 20, 14), crabMats.eyeWhite(), { pos: [sx * 0.017, lift + 0.054, 0.039] }));
    root.add(mesh(new THREE.SphereGeometry(0.0042, 16, 12), crabMats.pupil(), { pos: [sx * 0.0175, lift + 0.0555, 0.0445] }));
    root.add(mesh(new THREE.SphereGeometry(0.0013, 8, 6), crabMats.eyeWhite(), { pos: [sx * 0.016, lift + 0.0575, 0.0478] }));
  }

  // --- walking legs: 4 per side, knee up, tip on the ground
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const az = 0.018 - i * 0.014; // attach z
      const fan = (i - 1.5) * 0.32; // spread back/forward
      const dirx = Math.cos(fan) * sx, dirz = Math.sin(fan) * -1;
      const p0: [number, number, number] = [sx * 0.05, lift + 0.01, az];
      const p1: [number, number, number] = [sx * 0.05 + dirx * 0.026, lift + 0.024 - i * 0.001, az + dirz * 0.026];
      const p2: [number, number, number] = [sx * 0.05 + dirx * 0.05, lift + 0.008, az + dirz * 0.05];
      const p3: [number, number, number] = [sx * 0.05 + dirx * 0.062, 0.0012, az + dirz * 0.062];
      const leg = crabLimb([p0, p1, p2, p3], 0.0055 - i * 0.0003, 0.0016, 26);
      root.add(mesh(leg, crabMats.shell()));
    }
  }

  // --- claws: arm from the front corner, big claw resting forward
  for (const sx of [-1, 1]) {
    const arm = crabLimb([[sx * 0.04, lift + 0.012, 0.03], [sx * 0.058, lift + 0.016, 0.05], [sx * 0.05, lift + 0.01, 0.068]], 0.0075, 0.006, 16);
    root.add(mesh(arm, crabMats.shell()));
    const { hand, fingers, tips } = crabClaw(r, 1.0, 0.5 + r.range(-0.1, 0.15));
    const g = new THREE.Group();
    g.add(mesh(hand, crabMats.shell()), mesh(fingers, crabMats.shell()), mesh(tips, crabMats.tip()));
    g.position.set(sx * 0.048, lift + 0.006, 0.066);
    g.rotation.y = -Math.PI / 2 + sx * 0.75; // point forward & inward
    g.rotation.x = 0;
    g.rotation.z = 0.12;
    root.add(g);
  }
  const outer = new THREE.Group();
  outer.add(root);
  outer.rotation.y = r.range(-0.15, 0.15);
  return sitOnGround(outer);
}

/** One natural crab piece: a claw (even) or a leg segment (odd), with white meat showing. */
function crabPiece(r: Rng, i: number): THREE.Object3D {
  const g = new THREE.Group();
  if (i % 2 === 0) {
    const { hand, fingers, tips } = crabClaw(r, 1.0, 0.45);
    g.add(mesh(hand, crabMats.shell()), mesh(fingers, crabMats.shell()), mesh(tips, crabMats.tip()));
    // cracked wrist showing meat
    const meat = new THREE.SphereGeometry(0.0095, 16, 10);
    meat.scale(0.6, 1, 1);
    g.add(mesh(meat, crabMats.meat(), { pos: [-0.001, 0, 0] }));
    g.rotation.y = r.range(0, TAU);
  } else {
    const len = r.range(0.04, 0.05);
    const leg = crabLimb([[0, 0, 0], [len * 0.5, 0.002, 0.003], [len, 0, 0]], 0.0055, 0.0045, 14);
    g.add(mesh(leg, crabMats.shell()));
    for (const x of [0, len]) {
      const cap = new THREE.SphereGeometry(0.0048, 12, 8);
      cap.scale(0.5, 1, 1);
      g.add(mesh(cap, crabMats.meat(), { pos: [x + (x ? 0.001 : -0.001), 0, 0] }));
    }
    g.rotation.y = r.range(0, TAU);
  }
  return sitOnGround(g);
}

// =============================================================================================
// Table
// =============================================================================================

export const MODELS: ModelTable = {
  salmon: {
    build: buildSalmon,
    skin: salmonMats.skin,
    flesh: salmonMats.flesh,
    section: (ctx, s) => salmonSection(ctx, s),
  },
  fish: {
    build: buildFish,
    profile: fishProfile,
    skin: fishMats.skin,
    flesh: fishMats.flesh,
    section: fishSection,
  },
  shrimp: {
    build: buildShrimp,
    piece: (r) => sitOnGround(shrimpObject(r)),
    skin: shrimpMats.shell,
    flesh: shrimpMats.flesh,
  },
  crab: {
    build: buildCrab,
    piece: crabPiece,
    skin: crabMats.shell,
    flesh: crabMats.meat,
  },
};

void smoothProfile;
void smoothNormals;
void setUV;
void mixHex;
