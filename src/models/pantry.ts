// Pantry models: tofu, nori, peanuts, kidney beans.
//
// Conventions (see src/models/types.ts): real-world size in metres, resting on y = 0, centred on x/z.
// Every surface is a foodMat so cooking and bites work. Template materials are lazy() singletons and
// canvas textures are cached by key, so builders stay cheap when called many times.
// Materials returned by skin() / flesh() never use vertex colours (generic pieces have none);
// vertex-coloured variants are only used inside the custom builders.

import * as THREE from 'three';
import type { ModelTable, SectionOpts } from './types';
import {
  Rng,
  fbm3,
  canvasTexture,
  smoothProfile,
  latheGeometry,
  smoothNormals,
  deform,
  roundedBox,
  blobGeometry,
  merge,
  mesh,
  group,
  sitOnGround,
  paintVertices,
  lazy,
  foodMat,
  type Profile,
} from './kit';
import { getDef } from '../food/catalog';

// =============================================================================================
// Small helpers

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lin = (hex: string) => new THREE.Color(hex);
const colors = (id: string) => getDef(id).colors;

function rgba(hex: string, a = 1): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function softSpot(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** Soft blotches (wrapping horizontally). size = radius range as a fraction of the width. */
function blotches(ctx: Ctx, w: number, h: number, color: string, n: number, size: [number, number], alpha: [number, number], seed: number, ys = 1) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = r.next() * h, rx = r.range(size[0], size[1]) * w, a = r.range(alpha[0], alpha[1]);
    for (const dx of [-w, 0, w]) if (x + dx + rx > 0 && x + dx - rx < w) softSpot(ctx, x + dx, y, rx, rx * ys, color, a);
  }
}

/** Small hard dots. size = radius range in pixels. */
function dots(ctx: Ctx, w: number, h: number, color: string, n: number, size: [number, number], alpha: [number, number], seed: number) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = r.next() * h, s = r.range(size[0], size[1]);
    ctx.fillStyle = rgba(color, r.range(alpha[0], alpha[1]));
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * r.range(0.7, 1.2), r.next() * Math.PI, 0, TAU);
    ctx.fill();
  }
}

/** n well-spread points in a disc of radius R. */
function scatter(r: Rng, n: number, R: number, minD: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0], bestD = -1;
    for (let k = 0; k < 24; k++) {
      const [dx, dz] = r.disc();
      const p: [number, number] = [dx * R, dz * R];
      const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 1;
      if (d > bestD) {
        bestD = d;
        best = p;
      }
      if (d > minD) break;
    }
    pts.push(best);
  }
  return pts;
}

function place(g: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number], scale = 1): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'YXZ')), V(scale, scale, scale)));
  return g;
}

// =============================================================================================
// TOFU (block): soft off-white block, faint cheesecloth weave pressed into its skin, moist sheen.

const TOFU = colors('tofu');
const TOFU_W = 0.094, TOFU_H = 0.04, TOFU_D = 0.066;

/** Tofu surfaces: 'skin' (outside, cloth weave), 'flesh' (dice), 'face' (cut slice). */
function tofuTex(kind: 'skin' | 'flesh' | 'face', bump: boolean) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = bump ? '#909090' : kind === 'skin' ? '#ece4d2' : '#f3eddf';
      ctx.fillRect(0, 0, w, h);
      if (!bump) {
        blotches(ctx, w, h, '#fbf8f0', 26, [0.08, 0.2], [0.25, 0.5], 201);
        blotches(ctx, w, h, '#e2d7c0', 22, [0.06, 0.16], [0.12, 0.28], 202);
      }
      if (kind === 'skin') {
        // cheesecloth weave: fine crossing threads, gently wavy
        const r = new Rng(203);
        const step = 7;
        for (let k = 0; k < w / step; k++) {
          ctx.strokeStyle = bump ? rgba('#ffffff', 0.45) : rgba('#d2c3a4', r.range(0.18, 0.3));
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let y = 0; y <= h; y += 16) ctx.lineTo(k * step + Math.sin(y * 0.05 + k) * 0.8, y);
          ctx.stroke();
          ctx.beginPath();
          for (let x = 0; x <= w; x += 16) ctx.lineTo(x, k * step + Math.sin(x * 0.05 + k * 1.3) * 0.8);
          ctx.stroke();
        }
        // a few deeper creases where the cloth folded
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = bump ? rgba('#000000', 0.4) : rgba('#cdbf9f', 0.35);
          ctx.lineWidth = r.range(1.5, 2.5);
          ctx.beginPath();
          const x = r.next() * w, y = r.next() * h;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + r.range(-30, 30), y + r.range(-30, 30), x + r.range(-60, 60), y + r.range(-60, 60));
          ctx.stroke();
        }
      }
      // curd pores: tiny dimples everywhere, a few bigger holes on cut faces
      dots(ctx, w, h, bump ? '#000000' : '#cfc2a6', kind === 'skin' ? 160 : 260, [0.5, 1.3], [0.3, 0.6], 204);
      dots(ctx, w, h, bump ? '#ffffff' : '#fffdf6', 120, [0.6, 1.4], [0.3, 0.6], 205);
      if (kind === 'face') {
        const r = new Rng(206);
        for (let i = 0; i < 26; i++) {
          const x = r.next() * w, y = r.next() * h, s = r.range(1.2, 3.2);
          ctx.fillStyle = bump ? rgba('#000000', 0.8) : rgba('#d2c4a6', 0.75);
          ctx.beginPath();
          ctx.ellipse(x, y, s * r.range(1, 1.8), s, r.next() * Math.PI, 0, TAU);
          ctx.fill();
        }
      }
    },
    { key: `pantry/tofu/${kind}${bump ? '-bump' : ''}`, srgb: !bump, wrap: true },
  );
}

const tofuSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: tofuTex('skin', false), bumpMap: tofuTex('skin', true), bumpScale: 0.7, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.32, flesh: TOFU.flesh, cookColor: TOFU.cooked, name: 'tofu' }),
);
const tofuFlesh = lazy(() =>
  foodMat({ color: '#ffffff', map: tofuTex('flesh', false), bumpMap: tofuTex('flesh', true), bumpScale: 0.5, roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.35, flesh: TOFU.flesh, cookColor: TOFU.cooked }),
);

function buildTofu(r: Rng): THREE.Object3D {
  const w = TOFU_W * r.range(0.96, 1.04), h = TOFU_H * r.range(0.95, 1.05), d = TOFU_D * r.range(0.96, 1.04);
  const g = roundedBox(w, h, d, 0.0055, 4);
  const sN = r.range(0, 50), sag = r.range(0.012, 0.025), skew = r.range(-0.03, 0.03);
  deform(g, (p, n) => {
    const ty = clamp((p.y + h / 2) / h); // 0 bottom .. 1 top
    // soft block: sides bulge a little low down, top slightly domed, nothing quite square
    const bulge = 1 + sag * Math.sin(Math.PI * (0.25 + 0.6 * ty)) * (1 - 0.4 * ty);
    p.x *= bulge;
    p.z *= bulge;
    if (p.y > 0) p.y += 0.0009 * (1 - (2 * p.x / w) ** 2) * (1 - (2 * p.z / d) ** 2);
    p.x += skew * p.y;
    p.addScaledVector(n, 0.00035 * fbm3(p.x * 120 + sN, p.y * 120, p.z * 120, 2));
  });
  return sitOnGround(mesh(g, tofuSkin(), { skin: true }));
}

/** Slice outline across the block (depth x height), y up from 0. */
function tofuSliceShape(): THREE.Shape {
  const w = TOFU_D * 0.96, h = TOFU_H * 0.96, rad = 0.0045;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + rad, 0);
  s.lineTo(w / 2 - rad, 0);
  s.quadraticCurveTo(w / 2, 0, w / 2, rad);
  s.lineTo(w / 2, h - rad);
  s.quadraticCurveTo(w / 2, h, w / 2 - rad, h);
  s.lineTo(-w / 2 + rad, h);
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - rad);
  s.lineTo(-w / 2, rad);
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + rad, 0);
  return s;
}

function tofuSection(ctx: Ctx, s: number, _o: SectionOpts) {
  // Reuse the cut-face texture's painting: creamy curd with pores and a few holes.
  const src = tofuTex('face', false).image as HTMLCanvasElement;
  ctx.drawImage(src, 0, 0, s, s);
  // a soft moist sheen
  softSpot(ctx, s * 0.38, s * 0.32, s * 0.3, s * 0.16, '#ffffff', 0.25);
}

// =============================================================================================
// NORI (none): a slightly fanned stack of dark green toasted seaweed sheets.

const NORI = colors('nori');
const NORI_W = 0.178, NORI_D = 0.162, NORI_T = 0.00055;

function noriTex(bump: boolean) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = bump ? '#808080' : '#14261a';
      ctx.fillRect(0, 0, w, h);
      if (!bump) {
        blotches(ctx, w, h, '#22402a', 46, [0.04, 0.14], [0.25, 0.5], 211);
        blotches(ctx, w, h, '#0a140d', 40, [0.04, 0.12], [0.25, 0.45], 212);
        blotches(ctx, w, h, '#2a3a2c', 20, [0.03, 0.08], [0.15, 0.3], 214);
      }
      // pressed seaweed fibres: lots of short, faint strands in every direction
      const r = new Rng(213);
      for (let i = 0; i < 3000; i++) {
        const x = r.next() * w, y = r.next() * h, a = r.next() * Math.PI, l = r.range(2, 8);
        const k = r.next();
        ctx.strokeStyle = bump ? rgba(k < 0.5 ? '#ffffff' : '#000000', 0.3) : rgba(k < 0.3 ? '#2f5a36' : k < 0.65 ? '#1d3624' : '#070d09', r.range(0.15, 0.4));
        ctx.lineWidth = r.range(0.6, 1.3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
      // very faint, slightly wobbly ribs from the bamboo drying mat
      for (let y = 9; y < h; y += r.range(18, 26)) {
        ctx.strokeStyle = bump ? rgba('#ffffff', 0.12) : rgba('#3c6444', 0.05);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + y) * 1.5);
        ctx.stroke();
      }
    },
    { key: bump ? 'pantry/nori/bump' : 'pantry/nori/sheet', srgb: !bump },
  );
}

const noriMat = lazy(() =>
  foodMat({ color: '#ffffff', map: noriTex(false), bumpMap: noriTex(true), bumpScale: 0.7, roughness: 0.4, sheen: 0.7, sheenColor: '#4e8a5c', sheenRoughness: 0.3, flesh: NORI.flesh, cookColor: NORI.cooked, cookAmount: 0.4, name: 'nori' }),
);

/** Kizami nori: a loose tangle of thin, gently curling strips. */
function noriStrips(r: Rng): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const L = r.range(0.03, 0.055), wd = r.range(0.0025, 0.004), curl = r.range(-0.004, 0.004);
    const g = new THREE.BoxGeometry(L, NORI_T, wd, 8, 1, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setY(k, pos.getY(k) + curl * Math.sin((pos.getX(k) / L + 0.5) * Math.PI * 1.5));
    g.computeVertexNormals();
    const [dx, dz] = r.disc();
    parts.push(place(g, [dx * 0.03, 0.004 + (1 - Math.hypot(dx, dz)) * 0.006 * r.next(), dz * 0.03], [r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.2, 0.2)]));
  }
  return sitOnGround(mesh(merge(parts), noriMat()));
}

/** Torn little flakes of nori. */
function noriFlakes(r: Rng): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  scatter(r, 34, 0.03, 0.006).forEach(([x, z]) => {
    const s = r.range(0.006, 0.012);
    parts.push(place(new THREE.BoxGeometry(s, NORI_T, s * r.range(0.6, 1.2)), [x, 0.002 + r.range(0, 0.003), z], [r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3)]));
  });
  return sitOnGround(mesh(merge(parts), noriMat()));
}

function buildNori(r: Rng): THREE.Object3D {
  const n = 6;
  const sN = r.range(0, 50);
  const ca = r.range(0, TAU), cx = Math.cos(ca), cz = Math.sin(ca);
  // one shared gentle wave so the stacked sheets stay parallel
  const wave = (x: number, z: number) => 0.0012 * fbm3(x * 14 + sN, z * 14, 0.5, 2);
  const sheets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(NORI_W, NORI_T, NORI_D, 12, 1, 11);
    g.rotateY(r.range(-0.05, 0.05) + (i - n / 2) * 0.012);
    g.translate(r.range(-0.003, 0.003) + i * 0.0014, NORI_T / 2 + i * (NORI_T + 0.0005), r.range(-0.003, 0.003) - i * 0.001);
    const top = i === n - 1;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      // the top sheet lifts at one corner, as if just peeled off the stack
      const c = (x * cx + z * cz) / (Math.hypot(NORI_W, NORI_D) / 2);
      const lift = top ? 0.02 * sstep(0.4, 1, c) ** 2 : 0;
      pos.setY(k, pos.getY(k) + wave(x, z) + lift);
    }
    g.computeVertexNormals();
    sheets.push(g);
  }
  return sitOnGround(mesh(merge(sheets), noriMat()));
}

// =============================================================================================
// NUTS (bunch): a little pile of peanuts in their netted shells plus a few shelled ones
// (red papery skins and pale split halves). Piece = one peanut.

const NUTS = colors('nuts');
const PEANUT_L = 0.036;
const PEANUT_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0], [0.0042, 0.0011], [0.0066, 0.0038], [0.0077, 0.0078], [0.0075, 0.0118], [0.0064, 0.0162], [0.0059, 0.0184], [0.0063, 0.0206],
    [0.0073, 0.0244], [0.0076, 0.0282], [0.0068, 0.0318], [0.0047, 0.0345], [0.002, 0.0358], [0.0001, PEANUT_L],
  ],
  22,
);

/** Netted shell: u around, v along. Raised net of ridges over shallow pits, smoother at the ends. */
function shellTex(bump: boolean) {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = bump ? '#4a4a4a' : '#c4945a';
      ctx.fillRect(0, 0, w, h);
      if (!bump) {
        blotches(ctx, w, h, '#d6aa70', 16, [0.08, 0.2], [0.25, 0.45], 221);
        blotches(ctx, w, h, '#a87a44', 10, [0.06, 0.14], [0.15, 0.3], 222);
      }
      const r = new Rng(223);
      const cols = 10, rows = 9, cw = w / cols, rh = h / rows;
      const ridgeX = (i: number, y: number) => i * cw + Math.sin(y * 0.11 + i * 1.7) * 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = bump ? '#e8e8e8' : '#e6c58e';
      // longitudinal ridges (wrap at the seam)
      for (let i = 0; i <= cols; i++) {
        ctx.lineWidth = r.range(2.2, 3.2);
        ctx.beginPath();
        for (let y = 0; y <= h; y += 4) ctx.lineTo(ridgeX(i, y), y);
        ctx.stroke();
      }
      // cross links between neighbouring ridges
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const y0 = (j + r.range(0.1, 0.9)) * rh, y1 = y0 + r.range(-4, 4);
          ctx.lineWidth = r.range(1.6, 2.6);
          ctx.beginPath();
          ctx.moveTo(ridgeX(i, y0), y0);
          ctx.lineTo(ridgeX(i + 1, y1), y1);
          ctx.stroke();
        }
      // both ends are smoother
      for (const [y0, y1] of [[0, h * 0.1], [h, h * 0.9]]) {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, bump ? '#a0a0a0' : '#d4a86c');
        g.addColorStop(1, bump ? 'rgba(160,160,160,0)' : 'rgba(212,168,108,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
      }
      if (!bump) dots(ctx, w, h, '#7a5228', 26, [0.4, 0.9], [0.3, 0.55], 224);
    },
    { key: bump ? 'pantry/nuts/shell-bump' : 'pantry/nuts/shell', srgb: !bump, wrap: true },
  );
}

/** Red papery kernel skin (spherical UV): fine darker veins over a rosy brown. */
const kernelTex = () =>
  canvasTexture(
    128,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#93492f';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#b0623e', 14, [0.06, 0.14], [0.25, 0.45], 231, 2);
      blotches(ctx, w, h, '#6a2e1c', 10, [0.05, 0.12], [0.2, 0.35], 232, 2);
      const r = new Rng(233);
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = rgba('#5a2414', r.range(0.35, 0.6));
        ctx.lineWidth = r.range(0.6, 1.1);
        ctx.beginPath();
        let x = r.next() * w, y = r.next() * h;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) ctx.lineTo((x += r.range(4, 10)), (y += r.range(-3, 3)));
        ctx.stroke();
      }
    },
    { key: 'pantry/nuts/kernel', wrap: true },
  );

const shellMat = lazy(() =>
  foodMat({ color: '#ffffff', map: shellTex(false), bumpMap: shellTex(true), bumpScale: 1.6, roughness: 0.86, flesh: NUTS.flesh, cookColor: NUTS.cooked, name: 'peanut-shell' }),
);
const kernelMat = lazy(() =>
  foodMat({ color: '#ffffff', map: kernelTex(), roughness: 0.45, sheen: 0.35, sheenColor: '#ffc8a8', flesh: NUTS.flesh, cookColor: NUTS.cooked }),
);
const nutMatV = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.55, sheen: 0.25, sheenColor: '#fff0d0', flesh: NUTS.flesh, cookColor: NUTS.cooked }));
const nutFlesh = lazy(() => foodMat({ color: NUTS.flesh, roughness: 0.55, flesh: NUTS.flesh, cookColor: NUTS.cooked }));

/** Peanut in its shell, lying along X and centred on the origin. */
function peanutShell(r: Rng): THREE.BufferGeometry {
  const g = latheGeometry(PEANUT_PROFILE, 16);
  smoothNormals(g);
  const sN = r.range(0, 50), bend = r.range(-0.0022, 0.0022), beak = r.range(0.0006, 0.0014) * (r.next() < 0.5 ? -1 : 1);
  deform(g, (p) => {
    const t = p.y / PEANUT_L;
    const k = 1 + 0.07 * fbm3(p.x * 300 + sN, p.y * 220, p.z * 300, 2);
    p.x *= k;
    p.z *= k;
    p.z += bend * Math.sin(Math.PI * t) + beak * sstep(0.84, 1, t) ** 2;
  });
  g.rotateZ(-Math.PI / 2);
  g.translate(-PEANUT_L / 2, 0, 0);
  const s = r.range(0.88, 1.08);
  g.scale(s, s, s);
  return g;
}

/** Shelled kernel (red skin), or a pale split half (flat face down), centred, lying along X. */
function peanutKernel(r: Rng, split: boolean): THREE.BufferGeometry {
  const g = blobGeometry(0.0046, { detail: 2, amp: 0.00016, seed: r.range(0, 20), scale: [1.5, 0.95, 1.0] });
  if (split) {
    deform(g, (p) => {
      if (p.y < 0) p.y *= 0.1;
    });
    const cream = lin('#efd49c'), face = lin('#f6e3b6'), germ = lin('#d9a85c');
    paintVertices(g, (p) => (p.y < 0.0004 ? face.clone().lerp(germ, sstep(0.004, 0.0062, p.x) * 0.8) : cream.clone().lerp(lin('#e2bd7a'), clamp(1 - p.y / 0.004))));
  }
  const s = r.range(0.9, 1.08);
  g.scale(s, s, s);
  return g;
}

interface Capsule {
  a: THREE.Vector2;
  b: THREE.Vector2;
  r: number;
}
function segDist(c: Capsule, d: Capsule): number {
  let m = Infinity;
  for (let i = 0; i <= 4; i++) {
    const p = c.a.clone().lerp(c.b, i / 4);
    for (let j = 0; j <= 4; j++) m = Math.min(m, p.distanceTo(d.a.clone().lerp(d.b, j / 4)));
  }
  return m;
}

function buildNuts(r: Rng): THREE.Object3D {
  const shells: THREE.BufferGeometry[] = [], kernels: THREE.BufferGeometry[] = [], halves: THREE.BufferGeometry[] = [];
  const caps: Capsule[] = [];
  const tryPlace = (R: number, half: number, rad: number, minGap: number, others: Capsule[]): [number, number, number] | null => {
    for (let k = 0; k < 60; k++) {
      const [dx, dz] = r.disc(), yaw = r.range(0, TAU);
      const c = V(dx * R, 0, dz * R), dir = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const cap: Capsule = { a: new THREE.Vector2(c.x - dir.x * half, c.z - dir.z * half), b: new THREE.Vector2(c.x + dir.x * half, c.z + dir.z * half), r: rad };
      if (others.every((o) => segDist(o, cap) > o.r + rad - minGap)) {
        others.push(cap);
        return [c.x, c.z, yaw];
      }
    }
    return null;
  };
  // bottom layer of shells
  for (let i = 0; i < 5; i++) {
    const at = tryPlace(0.024, 0.012, 0.0076, 0.0012, caps);
    if (at) shells.push(place(peanutShell(r), [at[0], 0.0074, at[1]], [r.range(0, TAU), at[2], 0]));
  }
  // one or two resting on top
  const upper: Capsule[] = [];
  for (let i = 0; i < 2; i++) {
    const at = tryPlace(0.012, 0.012, 0.0076, 0, upper);
    if (at) shells.push(place(peanutShell(r), [at[0], 0.0074 + 0.0125, at[1]], [r.range(0, TAU), at[2], r.range(-0.25, 0.25)]));
  }
  // shelled ones around the edge of the pile
  for (let i = 0; i < 6; i++) {
    const at = tryPlace(0.04, 0.0045, 0.0048, 0.0004, caps);
    if (!at) continue;
    const split = i % 3 === 2;
    if (split) halves.push(place(peanutKernel(r, true), [at[0], 0.0002, at[1]], [r.next() < 0.5 ? 0 : Math.PI, at[2], 0]));
    else kernels.push(place(peanutKernel(r, false), [at[0], 0.0044, at[1]], [r.range(0, TAU), at[2], 0]));
  }
  const g = group(mesh(merge(shells), shellMat()));
  if (kernels.length) g.add(mesh(merge(kernels), kernelMat()));
  if (halves.length) g.add(mesh(merge(halves), nutMatV()));
  return sitOnGround(g);
}

/** One peanut: in its shell, a red-skinned kernel, or a pale split half. */
function nutPiece(r: Rng, i: number): THREE.Object3D {
  const yaw = r.range(0, TAU);
  if (i % 3 === 0) return sitOnGround(mesh(place(peanutShell(r), [0, 0, 0], [r.range(0, TAU), yaw, 0]), shellMat()));
  if (i % 3 === 1) return sitOnGround(mesh(place(peanutKernel(r, false), [0, 0, 0], [r.range(0, TAU), yaw, 0]), kernelMat()));
  return sitOnGround(mesh(place(peanutKernel(r, true), [0, 0, 0], [r.next() < 0.5 ? 0 : Math.PI, yaw, 0]), nutMatV()));
}

/** Chopped peanuts: angular cream chunks, a few with red skin. */
function choppedNuts(r: Rng): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  const cream = ['#ecd09a', '#e4c286', '#f2dcae', '#dcb478'].map(lin), skin = lin('#93492f');
  scatter(r, 40, 0.028, 0.006).forEach(([x, z]) => {
    const s = r.range(0.0022, 0.0036);
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(r.range(0.8, 1.4), r.range(0.55, 0.9), r.range(0.8, 1.3));
    const c = r.next() < 0.18 ? skin.clone().lerp(cream[0], r.range(0, 0.3)) : cream[r.int(0, cream.length - 1)].clone();
    paintVertices(g, () => c);
    const d = Math.hypot(x, z) / 0.028;
    place(g, [x, s * 0.6 + (1 - d) * 0.006 * r.next(), z], [r.range(0, TAU), r.range(0, TAU), r.range(0, TAU)]);
    parts.push(g);
  });
  return sitOnGround(mesh(merge(parts), nutMatV()));
}

// =============================================================================================
// BEANS (bunch): a heap of glossy red kidney beans, each with its little white eye.
// Piece = one bean; diced = split beans showing the pale inside.

const BEANS = colors('beans');
const BEAN_L = 0.0166, BEAN_W = 0.0094, BEAN_T = 0.0074;

/** Kidney bean along X: lies flat (thickness along Y), concave side (with the eye) towards -Z. */
const beanTemplate = lazy(() => {
  const g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 12, 8);
  deform(g, (p) => {
    const x = (p.x * BEAN_L) / 2, y = (p.y * BEAN_T) / 2, z = (p.z * BEAN_W) / 2;
    const u = x / (BEAN_L / 2);
    // bend into a kidney, ends a little fuller than the waist
    const full = 1 + 0.1 * u * u;
    p.set(x, y * full, z * full + 0.0017 * (1 - u * u) - 0.00085);
  });
  return g;
});

/** Bean skin on the sphere UVs: the hilum (eye) sits at u = 0.75, v = 0.5 (concave side). */
const beanTex = () =>
  canvasTexture(
    128,
    64,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#6e1a22');
      g.addColorStop(0.5, '#86232a');
      g.addColorStop(1, '#6e1a22');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, '#a8383e', 18, [0.05, 0.12], [0.18, 0.35], 241, 1.6);
      blotches(ctx, w, h, '#4e0f16', 14, [0.05, 0.1], [0.15, 0.3], 242, 1.6);
      const r = new Rng(243);
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = rgba('#a33a40', r.range(0.2, 0.35));
        ctx.lineWidth = r.range(0.6, 1.2);
        ctx.beginPath();
        const y = r.next() * h;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + r.range(-6, 6), w * 0.6, y + r.range(-6, 6), w, y + r.range(-4, 4));
        ctx.stroke();
      }
      // the eye
      softSpot(ctx, w * 0.75, h * 0.5, w * 0.06, h * 0.11, '#d8a0a0', 0.5);
      ctx.fillStyle = '#f3ebdc';
      ctx.beginPath();
      ctx.ellipse(w * 0.75, h * 0.5, w * 0.032, h * 0.075, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#b89c88', 0.9);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(w * 0.725, h * 0.5);
      ctx.lineTo(w * 0.775, h * 0.5);
      ctx.stroke();
    },
    { key: 'pantry/beans/skin', wrap: true },
  );

const beanMat = lazy(() =>
  foodMat({ color: '#ffffff', map: beanTex(), roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.1, flesh: BEANS.flesh, cookColor: BEANS.cooked, name: 'kidney-bean' }),
);
const beanMatV = lazy(() =>
  foodMat({ color: '#ffffff', map: beanTex(), vertexColors: true, roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.1, flesh: BEANS.flesh, cookColor: BEANS.cooked }),
);
const beanHalfMat = lazy(() =>
  foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, flesh: BEANS.flesh, cookColor: BEANS.cooked }),
);
const beanFlesh = lazy(() => foodMat({ color: BEANS.flesh, roughness: 0.55, flesh: BEANS.flesh, cookColor: BEANS.cooked }));

function buildBeans(r: Rng): THREE.Object3D {
  const tpl = beanTemplate();
  const parts: THREE.BufferGeometry[] = [];
  const layers = [
    { n: 15, R: 0.031, y: BEAN_T / 2, tilt: 0.25 },
    { n: 9, R: 0.02, y: BEAN_T / 2 + 0.006, tilt: 0.4 },
    { n: 4, R: 0.01, y: BEAN_T / 2 + 0.0118, tilt: 0.45 },
  ];
  for (const L of layers)
    for (const [x, z] of scatter(r, L.n, L.R, 0.0105)) {
      const g = tpl.clone();
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(r.range(0.82, 1.06));
      tint.g *= r.range(0.9, 1.05);
      paintVertices(g, () => tint);
      parts.push(place(g, [x, L.y + r.range(-0.0004, 0.001), z], [r.range(-L.tilt, L.tilt), r.range(0, TAU), r.range(-L.tilt, L.tilt)], r.range(0.92, 1.08)));
    }
  return sitOnGround(mesh(merge(parts), beanMatV()));
}

function beanPiece(r: Rng): THREE.Object3D {
  const g = place(beanTemplate().clone(), [0, 0, 0], [r.range(-0.15, 0.15), r.range(0, TAU), r.range(-0.15, 0.15)], r.range(0.92, 1.08));
  return sitOnGround(mesh(g, beanMat()));
}

/** Split beans: red backs and creamy flat insides, scattered in a heap. */
function beanHalves(r: Rng): THREE.Object3D {
  const red = lin('#7e1f26'), redL = lin('#9a2c32'), inside = lin('#ecd6ba'), core = lin('#dcbf9e');
  const parts: THREE.BufferGeometry[] = [];
  scatter(r, 22, 0.03, 0.0098).forEach(([x, z], i) => {
    const g = beanTemplate().clone();
    deform(g, (p) => {
      if (p.y < 0) p.y *= 0.16;
    });
    paintVertices(g, (p) => (p.y < 0.0002 ? inside.clone().lerp(core, clamp(1 - Math.abs(p.x) / (BEAN_L * 0.4))) : red.clone().lerp(redL, clamp(p.y / (BEAN_T * 0.5)))));
    const faceUp = r.next() < 0.4;
    parts.push(place(g, [x, (faceUp ? BEAN_T * 0.52 : 0) + (i > 17 ? 0.004 : 0), z], [(faceUp ? Math.PI : 0) + r.range(-0.2, 0.2), r.range(0, TAU), r.range(-0.2, 0.2)], r.range(0.92, 1.06)));
  });
  return sitOnGround(mesh(merge(parts), beanHalfMat()));
}

// =============================================================================================
// Table

export const MODELS: ModelTable = {
  tofu: {
    build: buildTofu,
    skin: tofuSkin,
    flesh: tofuFlesh,
    sliceShape: tofuSliceShape,
    section: tofuSection,
  },
  nori: {
    build: buildNori,
    skin: noriMat,
    flesh: noriMat,
    // nori is never knife-cut in the game ('none'), but scissors-style forms keep it sensible
    forms: {
      sliced: (r) => noriStrips(r),
      shredded: (r) => noriStrips(r),
      strips: (r) => noriStrips(r),
      diced: (r) => noriFlakes(r),
      minced: (r) => noriFlakes(r),
      pieces: (r) => noriFlakes(r),
    },
  },
  nuts: {
    build: buildNuts,
    piece: nutPiece,
    skin: shellMat,
    flesh: nutFlesh,
    forms: { diced: (r) => choppedNuts(r) },
  },
  beans: {
    build: buildBeans,
    piece: (r) => beanPiece(r),
    skin: beanMat,
    flesh: beanFlesh,
    forms: { diced: (r) => beanHalves(r) },
  },
};
