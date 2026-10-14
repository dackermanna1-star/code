// Look seeds → outfits, palettes and personality, plus the procedural fabric
// patterns (check, hibiscus, stains, tears, veins) used to colour the bodies.
//
// A look seed (any 32-bit integer from the logic) decodes into a small set of
// GEOMETRY variants (outfit × skin tint × palette) — geometry is generated once
// per variant and shared, so hundreds of corpses stay cheap — and a free set of
// ANIMATION traits (limp, arm style, head tilt …) taken from the full seed.
import * as THREE from 'three';
import type { ZombieKind } from '../../../config/ids';
import { hash3 } from '../kit';
import { snoise } from '../common';

export type Outfit =
  | 'fisherman'
  | 'tourist'
  | 'waiter'
  | 'granny'
  | 'office'
  | 'lifeguard'
  | 'jogger'
  | 'bloater'
  | 'paramedic'
  | 'scrubs'
  | 'patient'
  | 'riot'
  | 'chef';

export const SHAMBLER_OUTFITS: readonly Outfit[] = ['fisherman', 'tourist', 'waiter', 'granny', 'office', 'lifeguard'];

export interface Look {
  kind: ZombieKind;
  seed: number;
  outfit: Outfit;
  /** Skin tint index (0..SKINS-1). */
  tint: number;
  /** Outfit palette variant (0..2). */
  pal: number;
  /** Extra geometry sub-variant (jogger: bib number + hair colour), 0 for other kinds. */
  sub: number;
  /** Geometry cache key. */
  key: string;
  // ---- animation personality (free, not part of the geometry key)
  /** Leg that drags (0 near / 1 far) and how much (0..1). */
  limpSide: number;
  limp: number;
  /** 0 both arms reaching, 1 one reaching one dangling, 2 both dangling, 3 one arm up high. */
  armStyle: number;
  /** Head roll (rad) and loll speed. */
  headTilt: number;
  loll: number;
  /** Jaw slackness 0..1. */
  jaw: number;
  /** Gait cycle length multiplier and sway amount. */
  gait: number;
  sway: number;
  /** Phase offset for idle noise. */
  phase: number;
}

/** Deterministic 0..1 hash of (seed, n). */
export function lookHash(seed: number, n: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

export const SKINS = 4;
/** Zombie skin tints: sickly green, ashen grey, blue-grey, jaundiced. */
const SKIN_BASE = [0x9db487, 0xa9ae9f, 0x8ea79f, 0xb7b388];

export interface SkinPal {
  base: THREE.Color;
  light: THREE.Color;
  dark: THREE.Color;
  bruise: THREE.Color;
  wound: THREE.Color;
  socket: THREE.Color;
}
export function skinPal(tint: number): SkinPal {
  const base = new THREE.Color(SKIN_BASE[tint % SKIN_BASE.length]);
  return {
    base,
    light: base.clone().lerp(new THREE.Color(0xe8eedc), 0.35),
    dark: base.clone().multiplyScalar(0.62),
    bruise: new THREE.Color(0x6a5878),
    wound: new THREE.Color(0x5c0c0c),
    socket: new THREE.Color(0x231a20),
  };
}

export function decodeLook(kind: ZombieKind, seed: number): Look {
  const h = (n: number) => lookHash(seed, n);
  let outfit: Outfit;
  let pals = 3;
  switch (kind) {
    case 'shambler':
      outfit = SHAMBLER_OUTFITS[Math.floor(h(1) * SHAMBLER_OUTFITS.length)];
      break;
    case 'jogger':
      outfit = 'jogger';
      break;
    case 'bloater':
      outfit = 'bloater';
      break;
    case 'medic':
      outfit = h(1) < 0.55 ? 'paramedic' : 'scrubs';
      pals = 2;
      break;
    case 'patient':
      outfit = 'patient';
      break;
    case 'riot':
      outfit = 'riot';
      pals = 1;
      break;
    case 'bigdave':
      outfit = 'chef';
      pals = 1;
      break;
  }
  const tint = kind === 'bigdave' ? 0 : Math.floor(h(2) * SKINS);
  const pal = Math.floor(h(3) * pals);
  const armRoll = h(6);
  const sub = kind === 'jogger' ? Math.floor(h(13) * 8) : 0;
  return {
    kind,
    seed,
    outfit,
    tint,
    pal,
    sub,
    key: `${kind}:${outfit}:${tint}:${pal}:${sub}`,
    limpSide: h(4) < 0.5 ? 0 : 1,
    limp: h(5) < 0.45 ? 0.15 + h(15) * 0.25 : 0.55 + h(15) * 0.45,
    armStyle: armRoll < 0.5 ? 0 : armRoll < 0.75 ? 1 : armRoll < 0.9 ? 2 : 3,
    headTilt: (h(7) - 0.5) * 0.7,
    loll: 0.6 + h(8) * 0.9,
    jaw: 0.25 + h(9) * 0.75,
    gait: 0.88 + h(10) * 0.3,
    sway: 0.6 + h(11) * 0.8,
    phase: h(12) * 100,
  };
}

// ---------------------------------------------------------------- colour helpers
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
const C = (c: THREE.ColorRepresentation) => new THREE.Color(c);

/** Fabric: base colour with soft fold shading (darker underneath) and weave noise. */
export function fabric(base: THREE.ColorRepresentation, o: { fold?: number; noise?: number; freq?: number } = {}): ColorFn {
  const b = C(base);
  const fold = o.fold ?? 0.22;
  const noise = o.noise ?? 0.06;
  const f = o.freq ?? 22;
  return (p, n) => {
    const k = 1 - fold * Math.max(0, -n.y) * 0.8 + fold * 0.25 * Math.max(0, n.y) + snoise(p.x * f, p.y * f, p.z * f) * noise;
    return b.clone().multiplyScalar(k);
  };
}

/** Skin with subtle mottling, darker underneath, bruises. */
export function skinFn(sp: SkinPal, o: { bruise?: number; freq?: number } = {}): ColorFn {
  const f = o.freq ?? 9;
  const bruise = o.bruise ?? 0.35;
  return (p, n) => {
    const t = Math.max(0, -n.y) * 0.35;
    const c = sp.base.clone().lerp(sp.dark, t);
    const m = snoise(p.x * f + 3.1, p.y * f, p.z * f);
    if (m > 1 - bruise) c.lerp(sp.bruise, Math.min(0.6, (m - (1 - bruise)) * 2.2));
    c.multiplyScalar(1 + snoise(p.x * 31, p.y * 29, p.z * 33) * 0.05);
    return c;
  };
}

/**
 * Tears in clothing: where the mask fires, show skin (or a dark wound at the
 * centre of big holes). `edge` is an extra tear probability, e.g. near hems.
 */
/** Blotchy 3D noise in roughly 0..1 (two rotated octaves, less stripy than one). */
export function blotch(x: number, y: number, z: number): number {
  const a = snoise(x + 7.7, y * 1.1, z - 3.3);
  const b = snoise(y * 1.73 + 3.1, z * 1.91 - 1.3, x * 1.37 + 2.7);
  const c = snoise(z * 2.9 - 5.1, x * 3.1 + 1.9, y * 2.7 + 0.4);
  return (a * 0.5 + b * 0.35 + c * 0.25) * 0.55 + 0.5;
}

export function torn(cloth: ColorFn, sp: SkinPal, amount: number, edge?: (p: THREE.Vector3) => number, freq = 11): ColorFn {
  const sk = skinFn(sp);
  return (p, n) => {
    const e = edge ? edge(p) : 0;
    const v = blotch(p.x * freq, p.y * freq, p.z * freq) + e;
    const th = 1 - amount * 0.55;
    if (v > th + 0.09) return sp.wound.clone().lerp(sk(p, n), 0.3);
    if (v > th) return sk(p, n);
    return cloth(p, n);
  };
}

/** Splotchy stains (blood, grime, coffee) over a base function. */
export function stains(baseFn: ColorFn, col: THREE.ColorRepresentation, amount: number, freq = 7, seed = 0): ColorFn {
  const sc = C(col);
  return (p, n) => {
    const c = baseFn(p, n);
    const v = blotch(p.x * freq + seed, p.y * freq - seed * 0.7, p.z * freq + seed * 1.3);
    const th = 1 - amount * 0.55;
    if (v > th) c.lerp(sc, Math.min(0.85, (v - th) * 6));
    return c;
  };
}

/** Buffalo check (two crossing stripe sets): a = base, b = stripe, c = crossing. */
export function check(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, cc: THREE.ColorRepresentation, size: number, axes: 'xy' | 'zy' | 'auto' = 'auto'): ColorFn {
  const A = C(a);
  const B = C(b);
  const X = C(cc);
  return (p, n) => {
    const u = axes === 'xy' ? p.x : axes === 'zy' ? p.z : Math.abs(n.z) > Math.abs(n.x) ? p.x : p.z;
    const s1 = Math.floor(u / size) & 1;
    const s2 = Math.floor(p.y / size) & 1;
    const c = s1 && s2 ? X.clone() : s1 || s2 ? B.clone() : A.clone();
    return c.multiplyScalar(1 - Math.max(0, -n.y) * 0.18);
  };
}

/** Hibiscus print: big round flowers with a dark centre and leaves on a bright base. */
export function hibiscus(base: THREE.ColorRepresentation, petal: THREE.ColorRepresentation, petal2: THREE.ColorRepresentation, leaf: THREE.ColorRepresentation, cell = 0.09): ColorFn {
  const B = C(base);
  const P1 = C(petal);
  const P2 = C(petal2);
  const L = C(leaf);
  const centre = C(0xffe14a);
  return (p, n) => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    const gz = Math.floor(p.z / cell);
    let best = 9;
    let bestH = 0;
    let bestA = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const cz = gz + dz;
          const hx = (cx + hash3(cx, cy, cz)) * cell;
          const hy = (cy + hash3(cy, cz, cx + 5)) * cell;
          const hz = (cz + hash3(cz, cx, cy + 9)) * cell;
          const d = Math.hypot(p.x - hx, p.y - hy, p.z - hz) / cell;
          if (d < best) {
            best = d;
            bestH = hash3(cx * 1.7, cy * 2.3, cz * 3.1);
            bestA = Math.atan2(p.y - hy, (Math.abs(n.z) > 0.5 ? p.x - hx : p.z - hz));
          }
        }
    const shade = 1 - Math.max(0, -n.y) * 0.2;
    if (bestH < 0.62) {
      // flower: five petals
      const r = 0.42 + 0.12 * Math.cos(bestA * 5 + bestH * 20);
      if (best < 0.1) return centre.clone().multiplyScalar(shade);
      if (best < r) return (bestH < 0.31 ? P1 : P2).clone().multiplyScalar(shade);
    } else if (best < 0.3) {
      return L.clone().multiplyScalar(shade);
    }
    return B.clone().multiplyScalar(shade);
  };
}

/** Small dot print (hospital gown, granny dress). */
export function dots(base: THREE.ColorRepresentation, dot: THREE.ColorRepresentation, cell = 0.05, r = 0.2): ColorFn {
  const B = C(base);
  const D = C(dot);
  return (p, n) => {
    const u = (Math.abs(n.z) > Math.abs(n.x) ? p.x : p.z) / cell;
    const v = p.y / cell;
    const row = Math.floor(v);
    const uu = u + (row & 1) * 0.5;
    const du = uu - Math.floor(uu) - 0.5;
    const dv = v - row - 0.5;
    const c = du * du + dv * dv < r * r ? D.clone() : B.clone();
    return c.multiplyScalar(1 - Math.max(0, -n.y) * 0.18);
  };
}

/** Horizontal bands (reflective stripes, waistbands) over a base. `bands` = [y0, y1, colour]. */
export function bands(baseFn: ColorFn, list: Array<[number, number, THREE.ColorRepresentation]>): ColorFn {
  const cols = list.map(([a, b, c]) => [a, b, C(c)] as const);
  return (p, n) => {
    for (const [a, b, c] of cols) if (p.y >= a && p.y <= b) return c.clone().multiplyScalar(1 - Math.max(0, -n.y) * 0.15);
    return baseFn(p, n);
  };
}

/** Swollen, veined skin (bloater bellies). */
export function veined(sp: SkinPal, vein: THREE.ColorRepresentation, amount = 1, freq = 7): ColorFn {
  const V = C(vein);
  const swollen = sp.base.clone().lerp(C(0xc4b0b4), 0.4);
  const yellow = C(0xc8c078);
  const sk = skinFn({ ...sp, base: swollen }, { bruise: 0.5 });
  return (p, n) => {
    const c = sk(p, n);
    // jaundiced blotches
    const b = snoise(p.x * 4.1 + 2, p.y * 3.7, p.z * 4.3 - 1);
    if (b > 0.35) c.lerp(yellow, Math.min(0.5, (b - 0.35) * 1.5));
    const v = Math.abs(snoise(p.x * freq, p.y * freq * 0.8, p.z * freq) + 0.5 * snoise(p.x * freq * 2.3, p.y * freq * 2.1, p.z * freq * 2.2));
    if (v < 0.09 * amount) c.lerp(V, 0.85);
    else if (v < 0.17 * amount) c.lerp(V, 0.4);
    return c;
  };
}

/** Choose between two colour functions with a predicate. */
export function split(pred: (p: THREE.Vector3, n: THREE.Vector3) => boolean, a: ColorFn, b: ColorFn): ColorFn {
  return (p, n) => (pred(p, n) ? a(p, n) : b(p, n));
}

/** Ragged boundary helper: true when y (+ noise) is above `y0`. */
export function above(y0: number, rag = 0.02, freq = 40): (p: THREE.Vector3) => boolean {
  return (p) => p.y + snoise(p.x * freq, p.z * freq, p.y * 3) * rag > y0;
}
