import * as THREE from 'three';
import { B, BodySpec, SkeletonDef } from '../anim/skeleton';
import { Outfit } from './outfit';
import { clamp01, lerp, smoothstep } from '../core/math';
import { MeshAccum, RingSpec, W, loft, interpRows, interpW, mixW, ringPos, emitQuads, REGION, vpos } from './meshKit';

/**
 * A woman's body and what she wears over it: an hourglass torso with a bust, an open biker jacket
 * (a separate shell with lapels, a collar and real edges), a pleated skirt skinned to the thighs,
 * long wavy hair, high-heeled boots. Heights are relative to the hips bone, unscaled.
 */

const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Torso skin weights by height (shared by the body and everything worn over it). */
const TORSO_W: [number, W][] = [
  [-0.13, [[B.hips, 1]]],
  [-0.07, [[B.hips, 1]]],
  [0.0, [[B.hips, 0.85], [B.spine, 0.15]]],
  [0.07, [[B.hips, 0.35], [B.spine, 0.65]]],
  [0.14, [[B.spine, 0.85], [B.chest, 0.15]]],
  [0.21, [[B.spine, 0.5], [B.chest, 0.5]]],
  [0.29, [[B.spine, 0.15], [B.chest, 0.85]]],
  [0.36, [[B.chest, 1]]],
  [0.42, [[B.chest, 1]]],
  [0.47, [[B.chest, 0.92], [B.neck, 0.08]]],
  [0.505, [[B.chest, 0.75], [B.neck, 0.25]]],
  [0.54, [[B.chest, 0.4], [B.neck, 0.6]]],
];
export const torsoW = (y: number) => interpW(TORSO_W, y);

/** The torso texture's v at height y (the male profile's rings, evenly spaced in v). */
const TORSO_V = [-0.13, -0.07, 0.0, 0.07, 0.14, 0.21, 0.29, 0.36, 0.42, 0.47, 0.505, 0.54];
export function torsoV(y: number) {
  const n = TORSO_V.length;
  if (y <= TORSO_V[0]) return 0;
  if (y >= TORSO_V[n - 1]) return 1;
  let i = 0;
  while (i < n - 2 && TORSO_V[i + 1] < y) i++;
  return (i + (y - TORSO_V[i]) / (TORSO_V[i + 1] - TORSO_V[i])) / (n - 1);
}
/** Inverse of torsoV. */
export function torsoY(v: number) {
  const n = TORSO_V.length;
  const f = clamp01(v) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return lerp(TORSO_V[i], TORSO_V[i + 1], f - i);
}

/** Piecewise-linear lookup in [x, value] rows. */
function lin(rows: number[][], x: number) {
  if (x <= rows[0][0]) return rows[0][1];
  const n = rows.length;
  if (x >= rows[n - 1][0]) return rows[n - 1][1];
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < x) i++;
  return lerp(rows[i][1], rows[i + 1][1], (x - rows[i][0]) / (rows[i + 1][0] - rows[i][0]));
}

/** Hourglass torso: [rx, rzF, rzB, zOff] at height y (unscaled). */
export function femProfile(spec: BodySpec) {
  const hw = spec.hipsW, sh = spec.shoulders, cd = spec.chestDepth;
  const rows = [
    [-0.13, 0.088 * hw, 0.064, 0.076, -0.004],
    [-0.085, 0.138 * hw, 0.082, 0.11, -0.012],
    [-0.04, 0.158 * hw, 0.089, 0.117, -0.01],
    [0.01, 0.157 * hw, 0.089, 0.104, -0.004],
    [0.06, 0.143 * hw, 0.087, 0.09, 0.0],
    [0.11, 0.134, 0.084, 0.083, 0.004],
    [0.16, 0.128, 0.082, 0.08, 0.006],
    [0.21, 0.13, 0.084 * cd, 0.082, 0.006],
    [0.26, 0.132, 0.087 * cd, 0.085, 0.005],
    [0.31, 0.141, 0.09 * cd, 0.089, 0.004],
    [0.36, 0.149, 0.091 * cd, 0.093, 0.002],
    [0.41, 0.163 * sh, 0.087 * cd, 0.095, -0.003],
    [0.45, 0.165 * sh, 0.077, 0.091, -0.008],
    [0.485, 0.146 * sh, 0.067, 0.081, -0.012],
    [0.515, 0.11 * sh, 0.057, 0.069, -0.015],
    [0.545, 0.064, 0.049, 0.055, -0.016],
  ];
  return (y: number) => interpRows(rows, y) as [number, number, number, number];
}

/** Forward offset of the bust (unscaled) at height y, lateral offset xu, front-ness cz. */
export function bustFn(fem: number) {
  const amp = 0.04 * fem, by = 0.312, bx = 0.064;
  return (y: number, xu: number, cz: number) => {
    if (cz <= 0 || amp <= 0) return 0;
    const dy = y - by;
    const vy = Math.exp(-(dy * dy) / (dy < 0 ? 0.04 * 0.04 : 0.072 * 0.072));
    if (vy < 1e-3) return 0;
    const l1 = Math.exp(-((xu - bx) ** 2) / 0.048 ** 2), l2 = Math.exp(-((xu + bx) ** 2) / 0.048 ** 2);
    // the two lobes, bridged by the top stretched across them
    const lat = Math.max(l1, l2, 0.8 * Math.exp(-(xu * xu) / 0.06 ** 2));
    return amp * vy * lat * smoothstep(0.0, 0.4, cz);
  };
}

const PW = 2.3;
/** Ring angle (from the front centre) at which a ring of half-width rx reaches lateral offset x. */
function frontAngle(x: number, rx: number) {
  return Math.asin(Math.min(0.995, Math.pow(clamp01(x / rx), PW / 2)));
}
/** Texture u of a torso point at lateral offset xu (unscaled) at height y, on the front (`ease` for a layer over it). */
export function femFrontU(spec: BodySpec, y: number, xu: number, ease = 0) {
  const [rx] = femProfile(spec)(y);
  return 0.5 + (Math.sign(xu) * frontAngle(Math.abs(xu), rx * spec.bulk + ease)) / TAU;
}
/** How far the jacket stands off the body (unscaled): fitted, a little looser over the waist. */
export const jacketEase = (y: number) => 0.0085 + 0.011 * Math.exp(-(((y - 0.17) / 0.07) ** 2));

/** The top's scoop neckline: skin above this height at lateral offset xu. */
export const necklineY = (xu: number) => 0.405 + 0.075 * Math.min(1, (xu / 0.085) ** 2);
/** Half-width of the open jacket's front at height y; and the lapel's width beyond it. */
export const jacketOpen = (y: number) => lin([[0.09, 0.066], [0.2, 0.054], [0.29, 0.047], [0.37, 0.05], [0.43, 0.058], [0.5, 0.05]], y);
export const lapelWidth = (y: number) => lin([[0.285, 0], [0.33, 0.02], [0.38, 0.043], [0.416, 0.06], [0.428, 0.034], [0.45, 0.04], [0.48, 0.03]], y);
export const JACKET_HEM = 0.09;
export const SKIRT_TOP = 0.095;
/** The skirt's band of the torso texture: [0, SKIRT_TEX_V] (below the jacket's belt). */
export const SKIRT_TEX_V = 0.284;
export const SKIRT_HEM = -0.29;

interface FemCtx {
  s: number;
  k: number;
  hipsY: number;
  P: ReturnType<typeof femProfile>;
  bust: ReturnType<typeof bustFn>;
}
function ctx(def: SkeletonDef): FemCtx {
  return { s: def.scale, k: def.spec.bulk, hipsY: def.rest[B.hips].y, P: femProfile(def.spec), bust: bustFn(def.spec.fem) };
}

/** A ring of the body (plus `ease` m of clothing, unscaled) at height y. */
function bodyRing(c: FemCtx, y: number, ease = 0, extra: Partial<RingSpec> = {}): RingSpec {
  const { s, k } = c;
  const [rx, rzF, rzB, zo] = c.P(y);
  const kk = k;
  return {
    c: new THREE.Vector3(0, c.hipsY + y * s, zo * s),
    ax: X,
    az: Z,
    rx: (rx * kk + ease) * s,
    rzF: (rzF * kk + ease) * s,
    rzB: (rzB * kk + ease) * s,
    pw: PW,
    w: torsoW(y),
    v: torsoV(y),
    dz: (x, cz) => c.bust(y, x / (s * kk), cz) * s * kk,
    ...extra,
  };
}

const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => lerp(a, b, i / (n - 1)));

// ------------------------------------------------------------------ torso
export function buildFemTorso(m: MeshAccum, def: SkeletonDef, o: Outfit) {
  const c = ctx(def);
  const rings = range(-0.13, 0.545, 31).map((y) =>
    bodyRing(c, y, 0, {
      skin: (th) => {
        // the top's neckline shows skin (and a bare top all of it)
        if (o.top === 'bare') return 1;
        const xu = -Math.sin(th) * c.P(y)[0];
        return -Math.cos(th) > 0.3 && y > necklineY(xu) ? 1 : 0;
      },
    }),
  );
  loft(m, rings, 32, 'torso', true, false);
}

// ------------------------------------------------------------------ biker jacket
/** An open leather jacket: two front panels around the back, lapels, a collar, edges with thickness. */
export function buildLeatherJacket(m: MeshAccum, def: SkeletonDef) {
  const c = ctx(def);
  const { s } = c;
  const ease = jacketEase;
  const ys = range(JACKET_HEM, 0.5, 20);
  const [gu0, gv0, guw, gvh] = REGION.gear;
  const tmp = new THREE.Vector3();
  for (const side of [1, -1]) {
    // the panel: from its front edge around to the back centre
    const rings = ys.map((y) => {
      const r = bodyRing(c, y, ease(y));
      const a = frontAngle(jacketOpen(y) * s, r.rx);
      r.arc = side > 0 ? [Math.PI + a, TAU] : [0, Math.PI - a];
      return r;
    });
    const seg = 16;
    const grid = loft(m, rings, seg, 'torso', false, false);
    const edgeCol = side > 0 ? 0 : seg;
    const nextCol = side > 0 ? 1 : seg - 1;
    // the panel's front edge has thickness: a strip back to the top underneath
    const outer: number[] = [], inner: number[] = [];
    rings.forEach((r, j) => {
      outer.push(grid[j][edgeCol]);
      const th = side > 0 ? r.arc![0] : r.arc![1];
      const body = bodyRing(c, ys[j], -0.002);
      ringPos(body, th, tmp);
      inner.push(m.vert(tmp, gu0 + guw * 0.1, gv0 + gvh * (j / (ys.length - 1)), torsoW(ys[j]), 0));
    });
    const mid = Math.floor(ys.length / 2);
    emitQuads(m, outer.map((a, j) => [a, inner[j]]), () => vpos(m, grid[mid][nextCol], new THREE.Vector3()));
    // the hem: the panel's bottom row back to the body
    const hemOuter = grid[0];
    const hemInner = hemOuter.map((_, i) => {
      const th = rings[0].arc![0] + ((rings[0].arc![1] - rings[0].arc![0]) * i) / seg;
      ringPos(bodyRing(c, JACKET_HEM + 0.004, -0.002), th, tmp);
      return m.vert(tmp, gu0 + guw * (i / seg), gv0 + gvh * 0.95, torsoW(JACKET_HEM), 0);
    });
    const hemMid = vpos(m, hemOuter[Math.floor(seg / 2)], new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0));
    emitQuads(m, [hemOuter, hemInner], () => hemMid);

    // the lapel folded back over the panel, pointed, notched below the collar
    const lys = range(0.285, 0.48, 14);
    const lr = lys.map((y) => {
      const r = bodyRing(c, y, ease(y) + 0.0042);
      const a0 = frontAngle(jacketOpen(y) * s, r.rx);
      const a1 = frontAngle((jacketOpen(y) + lapelWidth(y)) * s, r.rx);
      r.arc = side > 0 ? [Math.PI + a0, Math.PI + Math.max(a0 + 1e-4, a1)] : [Math.PI - Math.max(a0 + 1e-4, a1), Math.PI - a0];
      return r;
    });
    const lseg = 4;
    const lg = loft(m, lr, lseg, 'torso', false, false);
    // its outer edge
    const lo: number[] = [], li: number[] = [];
    const lEdge = side > 0 ? lseg : 0;
    lr.forEach((r, j) => {
      lo.push(lg[j][lEdge]);
      const th = side > 0 ? r.arc![1] : r.arc![0];
      ringPos(bodyRing(c, lys[j], ease(lys[j]) - 0.001), th, tmp);
      li.push(m.vert(tmp, gu0 + guw * 0.3, gv0 + gvh * (j / (lys.length - 1)), torsoW(lys[j]), 0));
    });
    const lm = Math.floor(lys.length / 2);
    emitQuads(m, lo.map((a, j) => [a, li[j]]), () => vpos(m, lg[lm][side > 0 ? 0 : lseg], new THREE.Vector3()));
  }
  // the collar: stands around the back of the neck and rolls over, open at the front
  {
    const cys = range(0.465, 0.565, 6);
    const mk = (inset: number) =>
      cys.map((y, j) => {
        const t = j / (cys.length - 1);
        const r = bodyRing(c, Math.min(y, 0.545), 0.013 + 0.012 * t * t - inset, { dz: undefined });
        r.c.y = c.hipsY + y * s;
        const a = frontAngle((0.05 - 0.008 * t) * s, r.rx);
        r.arc = [Math.PI + a, 3 * Math.PI - a];
        r.v = t;
        return r;
      });
    const uOf = (th: number) => (th - Math.PI) / TAU;
    const outer = loft(m, mk(0), 24, 'gear', false, false, { uOf });
    const inner = loft(m, mk(0.005), 24, 'gear', false, false, { uOf, inward: true });
    // the rolled top edge
    const top = cys.length - 1;
    const ctr = new THREE.Vector3(0, c.hipsY + 0.4 * s, 0);
    emitQuads(m, [outer[top], inner[top]], () => ctr);
  }
}

// ------------------------------------------------------------------ skirt
/** Where a thigh is at height y (unscaled, relative to the hips bone): its centre's x and its radius (m). */
function thighAt(def: SkeletonDef, y: number) {
  const s = def.scale, k = def.spec.bulk;
  const H = def.rest[B.thighL];
  const total = def.lenThigh + def.lenShin;
  const t = (H.y - (def.rest[B.hips].y + y * s)) / total;
  let i = 0;
  while (i < FEM_LEG.length - 2 && FEM_LEG[i + 1][0] < t) i++;
  const a = FEM_LEG[i], b = FEM_LEG[i + 1];
  const f = clamp01((t - a[0]) / (b[0] - a[0]));
  const rad = lerp(a[1], b[1], f) * s * k * legHipFactor(def.spec.hipsW, t);
  return { x: H.x + lerp(a[3], b[3], f) * s, r: rad, t };
}
/** The thigh's extra girth near the hip (smooth, shared with the leg mesh). */
export const legHipFactor = (hipsW: number, t: number) => lerp(hipsW * 0.5 + 0.5, 1, smoothstep(0.15, 0.35, t));

/**
 * A tight black mini skirt: hugs the hips and wraps both thighs together (a rounded box below the
 * crotch), its lower part skinned to the thighs so it rides with every step and kick.
 */
export function buildSkirt(m: MeshAccum, def: SkeletonDef) {
  const c = ctx(def);
  const { s, k } = c;
  const seg = 48;
  const N = 13;
  const tv = SKIRT_TEX_V;
  const yJ = (def.rest[B.thighL].y - c.hipsY) / s; // the hip joints' height
  const mk = (inset: number, d0: number) => {
    const rings: RingSpec[] = [];
    for (let i = 0; i < N; i++) {
      const d = lerp(d0, 1, i / (N - 1)); // 0 at the waistband .. 1 at the hem
      const y = lerp(SKIRT_TOP, SKIRT_HEM, d);
      const th = thighAt(def, y);
      const thick = th.t >= -0.1;
      const env = thick ? th.x + th.r : 0; // both thighs' outer edge
      const torso = y > -0.13 ? c.P(y) : null;
      const zo = torso ? torso[3] : c.P(-0.13)[3];
      const ease = (0.0055 + 0.006 * d) * s - inset;
      const below = smoothstep(yJ + 0.02, yJ - 0.1, y);
      const pw = lerp(2.3, 2.9, below);
      const rx = Math.max(torso ? torso[0] * k * s : 0, env) + ease;
      let rzF = torso ? torso[1] * k * s + ease : 0;
      let rzB = torso ? torso[2] * k * s * (y < -0.085 ? 1 - (-0.085 - y) * 2.5 : 1) + ease : 0;
      if (thick) {
        // deep enough to clear each thigh's front and back at the thigh's own x
        const q = Math.pow(1 - Math.pow(Math.min(0.9, th.x / rx), pw), 1 / pw);
        rzF = Math.max(rzF, (th.r + 0.007 * s - zo * s) / q + 0.006 * s * below - inset);
        // the fabric bridges the hip crease (where a raised thigh pushes forward)
        rzF += 0.014 * s * Math.exp(-(((y - (yJ - 0.025)) / 0.06) ** 2));
        rzB = Math.max(rzB, (th.r + 0.006 * s + zo * s) / q - inset);
      }
      // below the hip joints the skirt rides on the thighs (it is pulled tight over a raised knee)
      const f = 0.97 * smoothstep(yJ + 0.1, yJ - 0.08, y);
      const wTop = torsoW(Math.max(y, -0.07));
      rings.push({
        c: new THREE.Vector3(0, c.hipsY + y * s, zo * s),
        ax: X,
        az: Z,
        rx,
        rzF,
        rzB,
        pw,
        w: (x) => {
          const b = smoothstep(-0.045 * s, 0.045 * s, x);
          return mixW([[wTop, 1 - f], [[[B.thighL, 1]], f * b], [[[B.thighR, 1]], f * (1 - b)]]);
        },
        v: tv * (1 - d),
        skin: 0,
      });
    }
    return rings;
  };
  const prevFlare = m.curFlare;
  m.curFlare = 0;
  const outerR = mk(0, 0);
  const out = loft(m, outerR, seg, 'torso', false, false);
  // the lining, from the hem up past the crotch (seen in a high kick)
  const linR = mk(0.004 * s, 0.5);
  const lin2 = loft(m, linR, seg, 'acc', false, false, { inward: true, uOf: (th) => (th / TAU) * 0.6 });
  // the hem's fold joins them
  const hemC = outerR[N - 1].c.clone().add(new THREE.Vector3(0, 0.2, 0));
  emitQuads(m, [out[N - 1], lin2[N - 1]], () => hemC);
  // the waistband's top edge back to the body
  const top = out[0];
  const bodyTop = top.map((_, i) => {
    const th = (TAU * i) / seg;
    const p = new THREE.Vector3();
    ringPos(bodyRing(c, SKIRT_TOP + 0.003, -0.002), th, p);
    return m.vert(p, REGION.torso[0] + REGION.torso[2] * (i / seg), REGION.torso[1] + REGION.torso[3] * tv, torsoW(SKIRT_TOP), 0);
  });
  const below = outerR[0].c.clone().add(new THREE.Vector3(0, -0.2, 0));
  emitQuads(m, [top, bodyTop], () => below);
  m.curFlare = prevFlare;
}

// ------------------------------------------------------------------ legs
/** A woman's leg: [t, radius, front scale, x offset] (t 0 = hip joint .. 1 = ankle). */
export const FEM_LEG: [number, number, number, number][] = [
  [-0.1, 0.07, 1.0, -0.03],
  [0.0, 0.08, 1.0, -0.012],
  [0.08, 0.084, 1.0, 0.002],
  [0.18, 0.081, 1.0, 0.004],
  [0.29, 0.073, 1.0, 0.004],
  [0.39, 0.065, 1.0, 0.002],
  [0.46, 0.058, 1.04, 0.0],
  [0.51, 0.056, 1.06, 0.0],
  [0.55, 0.057, 1.0, 0.0],
  [0.6, 0.061, 0.9, 0.0],
  [0.66, 0.064, 0.86, 0.0],
  [0.74, 0.058, 0.86, 0.0],
  [0.83, 0.046, 0.95, 0.0],
  [0.91, 0.037, 1.0, 0.0],
  [0.97, 0.034, 1.0, 0.0],
  [1.04, 0.036, 1.0, 0.0],
];
/** Where a knee-high boot's shaft starts (leg t), and its radius below. */
export const BOOT_TOP = 0.535;
const BOOT_SHAFT = [
  [0.535, 0.066], [0.6, 0.068], [0.66, 0.07], [0.74, 0.064], [0.83, 0.054], [0.91, 0.048], [0.97, 0.048], [1.04, 0.05],
];
/** The boot's shaft radius at leg t (unscaled, before bulk). */
export const bootShaft = (t: number) => lin(BOOT_SHAFT, t);
/** Extra rings of a leg in knee boots: the leg just above the top, then the boot's rolled lip. */
export const BOOT_LIP: [number, number][] = [[BOOT_TOP - 0.004, 0], [BOOT_TOP, 0.0045], [BOOT_TOP + 0.012, 0.004], [BOOT_TOP + 0.026, 0]];

// ------------------------------------------------------------------ heeled boot
/** The foot of a high-heeled boot (for a skeleton built with `heel`): pointed toe, stiletto heel. */
export function buildHeelBoot(m: MeshAccum, def: SkeletonDef, side: number) {
  const ft = side > 0 ? B.footL : B.footR;
  const to = side > 0 ? B.toeL : B.toeR;
  const sh = side > 0 ? B.shinL : B.shinR;
  const s = def.scale;
  const A = def.rest[ft];
  // [z from the ankle, half width, sole y, top y] (absolute heights at scale 1)
  const prof: number[][] = [
    [-0.05, 0.024, 0.122, 0.205],
    [-0.04, 0.033, 0.103, 0.214],
    [-0.024, 0.038, 0.092, 0.214],
    [0.0, 0.04, 0.085, 0.2],
    [0.03, 0.042, 0.07, 0.172],
    [0.06, 0.044, 0.052, 0.138],
    [0.09, 0.0455, 0.033, 0.104],
    [0.12, 0.046, 0.015, 0.078],
    [0.15, 0.045, 0.004, 0.06],
    [0.175, 0.042, 0.0, 0.05],
    [0.2, 0.035, 0.0, 0.04],
    [0.222, 0.024, 0.002, 0.03],
    [0.238, 0.01, 0.006, 0.021],
  ];
  const rings: RingSpec[] = prof.map((pp, i) => {
    const [z, hw, yb, yt] = pp;
    const hh = ((yt - yb) * s) / 2;
    const w: W = z < 0.0 ? [[ft, 0.85], [sh, 0.15]] : z < 0.1 ? [[ft, 1]] : z < 0.15 ? [[ft, 1 - (z - 0.1) / 0.05], [to, (z - 0.1) / 0.05]] : [[to, 1]];
    return {
      c: new THREE.Vector3(A.x + side * 0.003 * s, ((yb + yt) / 2) * s, A.z + z * s),
      ax: X,
      az: new THREE.Vector3(0, 1, 0),
      rx: hw * s,
      rzF: hh,
      rzB: hh,
      pw: 3.0,
      w,
      v: i / (prof.length - 1),
      skin: 0,
    };
  });
  loft(m, rings, 12, 'foot', true, true);
  // the stiletto: a slim tapering column under the heel seat
  const heel: number[][] = [
    [0.098, -0.026, 0.0135, 0.018],
    [0.075, -0.027, 0.0105, 0.0135],
    [0.05, -0.0275, 0.008, 0.0098],
    [0.025, -0.0275, 0.0062, 0.0074],
    [0.008, -0.027, 0.0054, 0.0064],
    [0.0, -0.027, 0.0056, 0.0066],
  ];
  const hr: RingSpec[] = heel.map((h, i) => ({
    c: new THREE.Vector3(A.x + side * 0.003 * s, h[0] * s, A.z + h[1] * s),
    ax: X,
    az: Z,
    rx: h[2] * s,
    rzF: h[3] * s * 0.8,
    rzB: h[3] * s,
    pw: 2.2,
    w: [[ft, 1]],
    v: 0.02 + i * 0.01,
    skin: 0,
  }));
  loft(m, hr, 8, 'foot', false, true, { uOf: () => 0.02 });
}

// ------------------------------------------------------------------ long wavy hair
/**
 * Long, wavy hair: a cap with a side part, a thick curtain down the back to the shoulder blades
 * (clumped, waved, ragged at the tips), side-swept bangs and a lock framing each side of the face.
 * `center` and the radii are the head's.
 */
export function buildLongWaveHair(m: MeshAccum, def: SkeletonDef, center: THREE.Vector3, rx: number, ry: number, rz: number) {
  const s = def.scale * def.spec.headSize;
  const [hu0, hv0, huw, hvh] = REGION.hair;
  const hairW = (h: number): W => {
    // h: metres below the head centre (negative down) at scale 1
    if (h > -0.08) return [[B.head, 1]];
    if (h > -0.17) {
      const t = (-0.08 - h) / 0.09;
      return [[B.head, 1 - 0.55 * t], [B.neck, 0.55 * t]];
    }
    const t = clamp01((-0.17 - h) / 0.2);
    return [[B.head, lerp(0.45, 0.1, t)], [B.neck, lerp(0.55, 0.12, t)], [B.chest, lerp(0.0, 0.78, t)]];
  };
  const prevSway = m.curSway;
  // ---- the cap: rounded over the crown, a side part on her left, hairline off the face
  {
    const lat2 = 12, lon2 = 28;
    const g: number[][] = [];
    for (let j = 0; j <= lat2; j++) {
      const yy = lerp(-0.25, 1, j / lat2);
      const phi = Math.acos(Math.max(-1, Math.min(1, yy)));
      const row: number[] = [];
      for (let i = 0; i <= lon2; i++) {
        const th = (i / lon2) * TAU;
        const sy = Math.sin(phi);
        const x = -Math.sin(th) * sy;
        const z = -Math.cos(th) * sy;
        const y = Math.cos(phi);
        let yy2 = y;
        // the hairline: high over the forehead, down at the temples to meet the curtain
        if (z > 0.1 && y < 0.6) {
          const line = 0.6 - 0.32 * Math.pow(Math.abs(x), 1.5);
          yy2 = lerp(y, Math.max(y, line), smoothstep(0.1, 0.7, z));
        }
        // tucked behind her left ear
        if (x > 0.5 && y < 0.3) yy2 = lerp(yy2, Math.max(yy2, 0.3), smoothstep(0.5, 0.85, x) * smoothstep(-0.45, -0.05, z));
        let rs = 1.075 + 0.035 * smoothstep(0.2, 0.9, y) * (1 - 0.5 * Math.abs(x)) + 0.03 * Math.abs(x) * smoothstep(-0.1, 0.4, y) * smoothstep(-0.3, 0.2, -z);
        // the part: a shallow groove on her left
        rs -= 0.022 * Math.exp(-(((x - 0.32) / 0.07) ** 2)) * smoothstep(0.4, 0.85, y) * smoothstep(-0.2, 0.4, z);
        // waves breaking the silhouette over the back and sides
        rs += 0.018 * Math.sin(th * 9 + y * 5) * smoothstep(0.5, -0.2, y);
        const p = new THREE.Vector3(center.x + x * rx * rs, center.y + yy2 * ry * rs, center.z + z * rz * rs);
        row.push(m.vert(p, hu0 + huw * (i / lon2), hv0 + hvh * (0.55 + 0.45 * (j / lat2)), [[B.head, 1]], 0));
      }
      g.push(row);
    }
    emitQuads(m, g, () => center);
  }
  // ---- the curtain down the back: rows at h (m below the head centre, scale 1)
  // [h, half width, back depth, front depth, centre z, edge angle from the front on her right,
  //  and on her left, where the hair is tucked behind the ear]
  const rows: number[][] = [
    [0.07, 0.056, 0.098, 0.08, 0.0, 1.35, 1.6],
    [0.03, 0.074, 0.112, 0.094, -0.002, 1.2, 1.66],
    [-0.02, 0.086, 0.118, 0.098, -0.004, 1.08, 1.68],
    [-0.07, 0.092, 0.118, 0.094, -0.008, 1.06, 1.68],
    [-0.12, 0.098, 0.114, 0.088, -0.016, 1.14, 1.7],
    [-0.17, 0.11, 0.106, 0.078, -0.03, 1.4, 1.76],
    [-0.22, 0.122, 0.098, 0.068, -0.044, 1.66, 1.82],
    [-0.27, 0.126, 0.09, 0.062, -0.054, 1.84, 1.9],
    [-0.32, 0.122, 0.084, 0.058, -0.059, 1.95, 1.97],
    [-0.37, 0.115, 0.078, 0.055, -0.06, 2.03, 2.04],
    [-0.41, 0.106, 0.074, 0.052, -0.06, 2.09, 2.09],
    [-0.45, 0.096, 0.07, 0.05, -0.06, 2.14, 2.14],
  ];
  // (sized for a head 0.083 wide and 0.1 deep at scale 1)
  const kx = rx / (0.083 * s), kz = rz / (0.1 * s);
  const clumps = 15;
  const tipRows = 2;
  const mkRows = (thick: number) =>
    rows.map((r, j) => {
      const [h, hw, zb, zf, zc, betaR, betaL] = r;
      const below = smoothstep(-0.05, -0.2, h);
      const tip = j >= rows.length - tipRows ? (j - (rows.length - tipRows - 1)) / tipRows : 0;
      const spec: RingSpec = {
        c: new THREE.Vector3(center.x, center.y + h * s, center.z + zc * s),
        ax: X,
        az: Z,
        rx: (hw * kx - thick) * s,
        rzF: (zf * kz - thick) * s,
        rzB: (zb * kz - thick) * s,
        pw: 2.1,
        arc: [Math.PI + betaL, 3 * Math.PI - betaR],
        // clumps of hair, waving as they fall; the front edges roll in
        rad: (th) => {
          const e0 = th - (Math.PI + betaL), e1 = 3 * Math.PI - betaR - th;
          const edge = Math.max(0, 1 - Math.min(e0, e1) / 0.32);
          return 1 + below * (0.035 * Math.cos(th * clumps + h * 9) + 0.022 * Math.sin(h * 34 + th * 3)) - 0.07 * edge * edge;
        },
        // ragged, V-cut tips: longer down the middle of the back
        dy: tip > 0 ? (th) => {
          const back = Math.cos(th - TAU); // 1 at the back centre
          const v = Math.pow(0.5 + 0.5 * Math.cos(th * clumps + 1.3), 0.8);
          return -(0.028 * v + 0.03 * back) * tip * s;
        } : undefined,
        w: hairW(h),
        v: clamp01(0.55 + h * 1.25),
        skin: 0,
      };
      return spec;
    });
  const uOf = (th: number) => (th - Math.PI) / TAU;
  const seg = clumps * 4;
  // sway: none at the scalp, growing towards the tips
  const outerR = mkRows(0);
  const innerR = mkRows(0.012);
  const swayAt = (j: number) => (m.curSway = Math.pow(clamp01(-rows[j][0] / 0.45), 1.3));
  const og = loft(m, outerR, seg, 'hair', false, false, { uOf, perRow: swayAt });
  const ig = loft(m, innerR, seg, 'hair', false, false, { uOf, perRow: swayAt, inward: true });
  // the tips and the two side edges join the outer and inner surfaces
  m.curSway = 1;
  const last = rows.length - 1;
  const tipIn = outerR[last].c.clone().add(new THREE.Vector3(0, 0.3, 0));
  emitQuads(m, [og[last], ig[last]], () => tipIn);
  for (const col of [0, seg]) {
    const a = og.map((r) => r[col]);
    const b = ig.map((r) => r[col]);
    const ref = vpos(m, og[5][col === 0 ? 2 : seg - 2], new THREE.Vector3());
    emitQuads(m, a.map((x, j) => [x, b[j]]), () => ref);
  }
  // ---- side-swept bangs from the part across the forehead, down past her right temple
  {
    const g: number[][] = [];
    const nu = 28, nv = 5;
    for (let j = 0; j <= nv; j++) {
      const row: number[] = [];
      for (let i = 0; i <= nu; i++) {
        const t = i / nu;
        const a = lerp(Math.PI + 0.5, Math.PI - 1.5, t); // from the part (her left) round to the right temple
        // the fringe's edge: ragged strand tips, lower as it sweeps across, down the side of the face
        const tipCut = j === 0 ? 0.012 * Math.sin(t * 55) * (0.5 + t) : 0;
        const yLow = lerp(0.46, -0.08, Math.pow(t, 1.1)) + tipCut;
        const yTop = lerp(0.8, 0.62, t);
        const yy = lerp(yLow, yTop, j / nv);
        const phi = Math.acos(Math.max(-0.99, Math.min(0.99, yy)));
        const sy = Math.sin(phi);
        const puff = 1.06 + 0.028 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - j / nv) + 0.01 * (1 - j / nv);
        const x = -Math.sin(a) * sy, z = -Math.cos(a) * sy;
        const p = new THREE.Vector3(center.x + x * rx * puff, center.y + yy * ry * puff, center.z + z * rz * puff);
        m.curSway = 0.1 * (1 - j / nv) * t;
        row.push(m.vert(p, hu0 + huw * (0.1 + 0.8 * t), hv0 + hvh * (0.68 + 0.27 * (j / nv)), [[B.head, 1]], 0));
      }
      g.push(row);
    }
    emitQuads(m, g, () => center);
    // its underside so the fringe has an edge when seen from below
    const g2 = g.map((row, j) =>
      row.map((idx, i) => {
        const p = vpos(m, idx, new THREE.Vector3());
        const d = p.clone().sub(center).multiplyScalar(-0.03);
        return m.vert(p.add(d), hu0 + huw * (0.1 + 0.8 * (i / nu)), hv0 + hvh * (0.68 + 0.27 * (j / nv)), [[B.head, 1]], 0);
      }),
    );
    emitQuads(m, g2, () => center, true);
    emitQuads(m, [g[0], g2[0]], () => center.clone().add(new THREE.Vector3(0, ry * 2, 0)));
  }
  // ---- a heavy wavy lock falling over her right shoulder onto the jacket's lapel
  {
    const side = -1;
    const pts: [number, number, number][] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // down the side of the face, over the collarbone, onto the lapel; waving side to side
      const h = lerp(0.035, -0.35, t);
      const x = lerp(0.074, 0.112, smoothstep(0.2, 0.8, t)) + 0.009 * Math.sin(t * 9.5);
      const z = lerp(0.048, 0.098, smoothstep(0.35, 0.85, t)) + 0.004 * Math.cos(t * 9.5);
      pts.push([x * kx, h, z]);
    }
    const rings: RingSpec[] = pts.map((p, i) => {
      const t = i / n;
      const h = p[1];
      const nxt = pts[Math.min(n, i + 1)], prv = pts[Math.max(0, i - 1)];
      const dir = new THREE.Vector3(side * (nxt[0] - prv[0]), nxt[1] - prv[1], nxt[2] - prv[2]).normalize();
      // flat across, facing out, twisting a little as it falls
      const tw = Math.sin(t * 6) * 0.5;
      const out0 = new THREE.Vector3(side * Math.cos(0.9 + tw), 0, Math.sin(0.9 + tw));
      const outward = out0.addScaledVector(dir, -out0.dot(dir)).normalize();
      const ax = new THREE.Vector3().crossVectors(dir, outward).normalize();
      const wdt = lerp(0.028, 0.008, Math.pow(t, 1.6)) * s;
      return {
        c: new THREE.Vector3(center.x + side * p[0] * s, center.y + h * s, center.z + p[2] * s),
        ax,
        az: outward,
        rx: wdt,
        rzF: wdt * 0.5,
        rzB: wdt * 0.5,
        w: hairW(h),
        v: clamp01(0.55 + h * 1.25),
        rad: (th) => 1 + 0.14 * Math.sin(th * 3 + i * 1.3),
        skin: 0,
      };
    });
    const sw0 = m.count;
    loft(m, rings, 10, 'hair', false, true);
    for (let i = sw0; i < m.count; i++) {
      const y = m.pos[i * 3 + 1];
      m.sway[i * 2] = 0.55 * clamp01((center.y - y) / (0.35 * s));
    }
  }
  m.curSway = prevSway;
}

/** Small gold hoops in the earlobes. */
export function buildEarrings(m: MeshAccum, def: SkeletonDef, center: THREE.Vector3, rx: number) {
  const s = def.scale * def.spec.headSize;
  const [u0, v0, uw, vh] = REGION.acc;
  for (const side of [1, -1]) {
    const lobe = new THREE.Vector3(center.x + side * rx * 1.0, center.y - 0.034 * s, center.z - 0.004 * s);
    const R = 0.011 * s, r = 0.0016 * s;
    const hc = lobe.clone().add(new THREE.Vector3(side * 0.002 * s, -R, 0));
    const g: number[][] = [];
    const n1 = 14, n2 = 5;
    for (let j = 0; j <= n1; j++) {
      const a = (j / n1) * TAU;
      const cc = hc.clone().add(new THREE.Vector3(0, Math.cos(a) * R, Math.sin(a) * R));
      const nrm = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      const row: number[] = [];
      for (let i = 0; i <= n2; i++) {
        const b = (i / n2) * TAU;
        const p = cc.clone().addScaledVector(nrm, Math.cos(b) * r).add(new THREE.Vector3(Math.sin(b) * r, 0, 0));
        row.push(m.vert(p, u0 + uw * 0.85, v0 + vh * 0.5, [[B.head, 1]], 0));
      }
      g.push(row);
    }
    // a torus: its 'inside' is the tube's own centreline, per row
    const rowsC = Array.from({ length: n1 + 1 }, (_, j) => {
      const a = (j / n1) * TAU;
      return hc.clone().add(new THREE.Vector3(0, Math.cos(a) * R, Math.sin(a) * R));
    });
    emitQuads(m, g, (j) => rowsC[j]);
  }
}
