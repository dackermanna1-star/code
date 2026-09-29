import * as THREE from 'three';
import { PixelCanvas, RGB, toTexture } from '../render/textures';
import { mulberry32 } from '../core/math';
import { BodyDef, DOG, HUMAN, PT, SKIN_H, SKIN_W } from './skeleton';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 16;
export const ATLAS_W = SKIN_W * ATLAS_COLS; // 1024
export const ATLAS_H = SKIN_H * ATLAS_ROWS; // 1024

/** Skin index ranges per zombie family. */
export const SKINS = {
  walker: [0, 56] as [number, number],
  runner: [56, 72] as [number, number],
  tough: [72, 80] as [number, number],
  armored: [80, 88] as [number, number],
  brute: [88, 92] as [number, number],
  exploder: [92, 96] as [number, number],
  dog: [96, 102] as [number, number],
  boss: [102, 104] as [number, number],
  crawler: [104, 112] as [number, number],
};

type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
interface Rect { x: number; y: number; w: number; h: number }

/** Pixel rect of a box face within a skin cell (Minecraft-style unwrap). */
export function faceRect(px: [number, number, number], origin: [number, number], face: Face): Rect {
  const [W, H, D] = px;
  const [u, v] = origin;
  switch (face) {
    case 'top': return { x: u + D, y: v, w: W, h: D };
    case 'bottom': return { x: u + D + W, y: v, w: W, h: D };
    case 'right': return { x: u, y: v + D, w: D, h: H };
    case 'front': return { x: u + D, y: v + D, w: W, h: H };
    case 'left': return { x: u + D + W, y: v + D, w: D, h: H };
    case 'back': return { x: u + 2 * D + W, y: v + D, w: W, h: H };
  }
}
const SIDES: Face[] = ['right', 'front', 'left', 'back'];
const ALL: Face[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];

const clampc = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const shade = (c: RGB, k: number): RGB => [clampc(c[0] * k), clampc(c[1] * k), clampc(c[2] * k)];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const SKIN_TONES: RGB[] = [
  [138, 186, 136], [118, 170, 148], [158, 188, 112], [128, 160, 118], [168, 196, 150], [104, 150, 120], [146, 176, 132], [120, 178, 128],
];
const HAIR: RGB[] = [[214, 96, 36], [30, 28, 30], [88, 58, 30], [206, 172, 84], [150, 44, 30], [120, 120, 120], [58, 40, 26], [40, 60, 150], [230, 220, 200]];
const SHIRTS: RGB[] = [
  [172, 42, 40], [222, 120, 36], [40, 70, 140], [30, 44, 74], [128, 128, 132], [220, 218, 206], [60, 110, 60], [34, 34, 38], [182, 162, 110],
  [110, 60, 130], [40, 120, 130], [200, 180, 60], [140, 90, 60], [90, 100, 110],
];
const PANTS: RGB[] = [[48, 72, 128], [36, 52, 90], [168, 150, 106], [44, 44, 46], [96, 96, 100], [98, 70, 44], [60, 80, 60], [150, 60, 40]];
const SHOES: RGB[] = [[96, 60, 32], [30, 30, 32], [196, 110, 40], [150, 150, 150], [70, 40, 30], [220, 220, 220]];
const BLOOD_D: RGB = [104, 12, 14];
const BLOOD_B: RGB = [168, 24, 24];

interface Painter {
  pc: PixelCanvas;
  em: PixelCanvas;
  ox: number;
  oy: number;
  rnd: () => number;
  body: BodyDef;
}

function partPx(body: BodyDef, t: PT) {
  return body.parts[t].px;
}
function partUv(body: BodyDef, t: PT, side: number): [number, number] {
  const uv = body.parts[t].uv;
  return uv[Math.min(side, uv.length - 1)];
}

function fillRect(p: Painter, r: Rect, fn: (x: number, y: number, fx: number, fy: number) => RGB | null) {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      const c = fn(i, j, r.w > 1 ? i / (r.w - 1) : 0, r.h > 1 ? j / (r.h - 1) : 0);
      if (c) p.pc.set(p.ox + r.x + i, p.oy + r.y + j, c[0], c[1], c[2], 255);
    }
}
function paintBox(p: Painter, t: PT, side: number, faces: Face[], fn: (face: Face, x: number, y: number, fx: number, fy: number) => RGB | null, extra = false) {
  const def = p.body.parts[t];
  const px = extra && def.extra ? def.extra.px : partPx(p.body, t);
  const uv = extra && def.extra ? def.extra.uv : partUv(p.body, t, side);
  for (const f of faces) {
    const r = faceRect(px, uv, f);
    fillRect(p, r, (x, y, fx, fy) => fn(f, x, y, fx, fy));
  }
}
function noisy(c: RGB, rnd: () => number, amt = 10): RGB {
  const j = (rnd() - 0.5) * 2 * amt;
  return [clampc(c[0] + j), clampc(c[1] + j), clampc(c[2] + j)];
}
function splatter(p: Painter, t: PT, side: number, count: number, faces: Face[] = ALL, extra = false) {
  const def = p.body.parts[t];
  const px = extra && def.extra ? def.extra.px : partPx(p.body, t);
  const uv = extra && def.extra ? def.extra.uv : partUv(p.body, t, side);
  for (let k = 0; k < count; k++) {
    const f = faces[Math.floor(p.rnd() * faces.length)];
    const r = faceRect(px, uv, f);
    const cx = Math.floor(p.rnd() * r.w);
    const cy = Math.floor(p.rnd() * r.h);
    const size = 1 + Math.floor(p.rnd() * 3);
    for (let j = -size; j <= size; j++)
      for (let i = -size; i <= size; i++) {
        if (i * i + j * j > size * size + p.rnd() * 2) continue;
        const x = cx + i;
        const y = cy + j;
        if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
        const c = p.rnd() < 0.55 ? BLOOD_D : BLOOD_B;
        const n = noisy(c, p.rnd, 12);
        p.pc.set(p.ox + r.x + x, p.oy + r.y + y, n[0], n[1], n[2], 255);
      }
    // drips
    if (f !== 'top' && f !== 'bottom' && p.rnd() < 0.5) {
      const len = 1 + Math.floor(p.rnd() * 4);
      for (let d = 0; d < len; d++) {
        const y = cy + size + d;
        if (y >= r.h) break;
        p.pc.set(p.ox + r.x + cx, p.oy + r.y + y, BLOOD_D[0], BLOOD_D[1], BLOOD_D[2], 255);
      }
    }
  }
}
function setEm(p: Painter, x: number, y: number, c: RGB) {
  p.em.set(p.ox + x, p.oy + y, c[0], c[1], c[2], 255);
}

interface HumanStyle {
  skin: RGB;
  hair: RGB | null;
  hairStyle: 'short' | 'long' | 'bald' | 'cap' | 'beanie' | 'mohawk';
  capColor: RGB;
  shirt: RGB;
  shirt2: RGB;
  shirtStyle: 'plain' | 'stripes' | 'plaid' | 'tank' | 'jacket' | 'none' | 'uniform';
  sleeves: 'short' | 'long' | 'none';
  pants: RGB;
  shoes: RGB;
  eye: RGB;
  blood: number;
  ribs: boolean;
  bloat: boolean;
  veins: boolean;
}

function paintHuman(p: Painter, s: HumanStyle) {
  const r = p.rnd;
  const skin = (f: Face, x: number, y: number): RGB => {
    const k = f === 'top' ? 1.06 : f === 'bottom' ? 0.8 : f === 'back' ? 0.9 : 1.0;
    let c = noisy(shade(s.skin, k), r, 9);
    if (s.veins && r() < 0.06) c = shade(c, 0.7);
    return c;
  };
  // ---- head
  paintBox(p, PT.Head, 0, ALL, (f, x, y, fx, fy) => {
    let c = skin(f, x, y);
    const H = 10;
    if (s.hair && s.hairStyle !== 'bald') {
      if (f === 'top') c = s.hairStyle === 'mohawk' ? (x > 3 && x < 7 ? noisy(s.hair, r, 12) : c) : noisy(s.hair, r, 12);
      else if (s.hairStyle === 'mohawk') {
        if (f === 'back' && x > 3 && x < 7 && y < 3) c = noisy(s.hair, r, 12);
      } else if (f === 'back') {
        if (y < (s.hairStyle === 'long' ? 9 : 4)) c = noisy(s.hair, r, 12);
      } else if (f === 'left' || f === 'right') {
        if (y < (s.hairStyle === 'long' ? 8 : 3) && !(y > 1 && (f === 'left' ? x < 3 : x > 6))) c = noisy(s.hair, r, 12);
        if (y < 2) c = noisy(s.hair, r, 12);
      } else if (f === 'front') {
        if (y < 2 || (s.hairStyle === 'long' && (x < 1 || x > 8) && y < 7)) c = noisy(s.hair, r, 12);
      }
    }
    if (s.hairStyle === 'cap' || s.hairStyle === 'beanie') {
      const capH = s.hairStyle === 'cap' ? 3 : 4;
      if (f === 'top' || ((f === 'front' || f === 'back' || f === 'left' || f === 'right') && y < capH)) c = noisy(s.capColor, r, 8);
    }
    if (f === 'front') {
      // eyes
      if (y === 4 && (x === 2 || x === 3 || x === 6 || x === 7)) {
        c = s.eye;
        setEm(p, faceRect(partPx(p.body, PT.Head), partUv(p.body, PT.Head, 0), 'front').x + x, faceRect(partPx(p.body, PT.Head), partUv(p.body, PT.Head, 0), 'front').y + y, s.eye);
      }
      if (y === 3 && (x === 2 || x === 3 || x === 6 || x === 7) && r() < 0.5) c = shade(s.skin, 0.72);
      // nose
      if (y === 5 && (x === 4 || x === 5)) c = shade(s.skin, 0.8);
      // mouth
      if (y === 7 && x >= 3 && x <= 6) c = [40, 10, 12];
      if (y === 8 && x >= 3 && x <= 6 && r() < 0.6) c = r() < 0.5 ? [220, 214, 190] : [60, 12, 12];
      if (y >= 8 && x >= 2 && x <= 7 && r() < s.blood * 0.8) c = noisy(BLOOD_D, r, 10);
    }
    void H;
    return c;
  });
  splatter(p, PT.Head, 0, Math.round(1 + s.blood * 4), ['front', 'left', 'right', 'back']);

  // ---- torso
  const shirtColor = (f: Face, x: number, y: number, fx: number): RGB => {
    let c = s.shirt;
    switch (s.shirtStyle) {
      case 'stripes':
        if (y % 4 < 2) c = s.shirt2;
        break;
      case 'plaid':
        if (x % 4 === 0 || y % 4 === 0) c = mixc(s.shirt, s.shirt2, 0.6);
        if (x % 4 === 0 && y % 4 === 0) c = s.shirt2;
        break;
      case 'jacket':
        if (f === 'front' && Math.abs(fx - 0.5) < 0.2) c = s.shirt2;
        break;
      case 'uniform':
        if (f === 'front' && y === 4 && (x === 3 || x === 10)) c = [200, 180, 60];
        break;
    }
    const k = f === 'top' ? 1.05 : f === 'back' ? 0.88 : f === 'left' || f === 'right' ? 0.94 : 1.0;
    return noisy(shade(c, k), r, 8);
  };
  paintBox(p, PT.Torso, 0, ALL, (f, x, y, fx, fy) => {
    if (f === 'bottom') return shade(s.pants, 0.8);
    if (s.shirtStyle === 'none') {
      let c = skin(f, x, y);
      if (f === 'front' && (y === 6 || y === 9) && x > 2 && x < 11) c = shade(s.skin, 0.8);
      return c;
    }
    if (f === 'top') {
      if (s.shirtStyle === 'tank' && (x < 3 || x > 10)) return skin(f, x, y);
      return shirtColor(f, x, y, fx);
    }
    let c = shirtColor(f, x, y, fx);
    if (s.shirtStyle === 'tank' && f !== 'left' && f !== 'right' && y < 3 && (x < 3 || x > 10)) c = skin(f, x, y);
    if (f === 'front' && y < 2 && x > 4 && x < 9) c = skin(f, x, y); // neckline
    // tears showing skin / wounds
    if (r() < 0.05) c = skin(f, x, y);
    return c;
  });
  if (s.ribs) {
    const fr = faceRect(partPx(p.body, PT.Torso), partUv(p.body, PT.Torso, 0), 'front');
    const cx = 3 + Math.floor(r() * 5);
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < 5; i++) {
        const c: RGB = j % 2 === 0 ? [226, 214, 196] : [96, 14, 16];
        p.pc.set(p.ox + fr.x + cx + i, p.oy + fr.y + 5 + j, c[0], c[1], c[2]);
      }
  }
  splatter(p, PT.Torso, 0, Math.round(2 + s.blood * 8), ['front', 'left', 'right', 'back']);

  // ---- pelvis (pants + belt)
  paintBox(p, PT.Pelvis, 0, ALL, (f, x, y) => {
    if (f === 'top') return shade(s.shirt, 0.9);
    let c = noisy(s.pants, r, 8);
    if (y === 0 && f !== 'bottom') c = [44, 32, 24];
    if (y === 0 && f === 'front' && (x === 5 || x === 6)) c = [180, 170, 130];
    return c;
  });
  splatter(p, PT.Pelvis, 0, Math.round(s.blood * 3), ['front', 'back']);

  // ---- arms
  for (const side of [0, 1]) {
    paintBox(p, PT.UArm, side, ALL, (f, x, y) => {
      if (f === 'top') return s.sleeves === 'none' || s.shirtStyle === 'none' || s.shirtStyle === 'tank' ? skin(f, x, y) : shirtColor(f, x, y, 0.5);
      const sleeveLen = s.shirtStyle === 'none' || s.shirtStyle === 'tank' || s.sleeves === 'none' ? 0 : s.sleeves === 'short' ? 5 : 11;
      if (y < sleeveLen) return shirtColor(f, x, y, 0.5);
      return skin(f, x, y);
    });
    paintBox(p, PT.LArm, side, ALL, (f, x, y) => {
      if (f === 'bottom') return shade(s.skin, 0.75);
      const sleeve = s.sleeves === 'long' && s.shirtStyle !== 'none' && s.shirtStyle !== 'tank';
      if (sleeve && y < 7) return shirtColor(f, x, y, 0.5);
      let c = skin(f, x, y);
      if (y >= 9) c = shade(c, 0.9); // hand
      if (y === 11 && x % 2 === 0) c = shade(s.skin, 0.7);
      return c;
    });
    splatter(p, PT.UArm, side, Math.round(r() * (1 + s.blood * 3)), SIDES);
    splatter(p, PT.LArm, side, Math.round(r() * (1 + s.blood * 4)), SIDES);
  }
  // ---- legs
  for (const side of [0, 1]) {
    paintBox(p, PT.ULeg, side, ALL, (f, x, y) => {
      let c = noisy(shade(s.pants, f === 'back' ? 0.9 : 1), r, 9);
      if (r() < 0.03) c = shade(c, 1.3);
      return c;
    });
    paintBox(p, PT.LLeg, side, ALL, (f, x, y) => {
      let c = noisy(shade(s.pants, f === 'back' ? 0.9 : 1), r, 9);
      if (y >= 12) c = noisy(s.shoes, r, 8);
      if (r() < 0.04) c = skin(f, x, y); // torn
      return c;
    });
    splatter(p, PT.ULeg, side, Math.round(r() * (1 + s.blood * 3)), SIDES);
    splatter(p, PT.LLeg, side, Math.round(r() * (1 + s.blood * 2)), SIDES);
  }
  // shoe (shared foot region)
  paintBox(p, PT.LLeg, 0, ALL, (f, x, y) => {
    let c = noisy(s.shoes, r, 10);
    if (f === 'bottom') c = [30, 26, 22];
    if ((f === 'front' || f === 'left' || f === 'right') && y === 2) c = shade(s.shoes, 0.6);
    return c;
  }, true);

  if (s.bloat) {
    // glowing pustules on torso/arms
    for (const t of [PT.Torso, PT.UArm, PT.Head, PT.ULeg]) {
      for (let k = 0; k < (t === PT.Torso ? 9 : 3); k++) {
        const faces: Face[] = ['front', 'left', 'right', 'back'];
        const f = faces[Math.floor(r() * 4)];
        const rr = faceRect(partPx(p.body, t), partUv(p.body, t, 0), f);
        const x = Math.floor(r() * rr.w);
        const y = Math.floor(r() * rr.h);
        const glow: RGB = r() < 0.5 ? [255, 170, 40] : [190, 255, 60];
        p.pc.set(p.ox + rr.x + x, p.oy + rr.y + y, glow[0], glow[1], glow[2]);
        setEm(p, rr.x + x, rr.y + y, shade(glow, 0.8));
        if (x + 1 < rr.w) {
          p.pc.set(p.ox + rr.x + x + 1, p.oy + rr.y + y, glow[0] * 0.8, glow[1] * 0.8, glow[2] * 0.6);
          setEm(p, rr.x + x + 1, rr.y + y, shade(glow, 0.5));
        }
      }
    }
  }
}

function paintDog(p: Painter, fur: RGB, patch: RGB, eye: RGB) {
  const r = p.rnd;
  const furc = (f: Face): RGB => {
    const k = f === 'top' ? 1.08 : f === 'bottom' ? 0.78 : f === 'back' ? 0.92 : 1;
    let c = noisy(shade(fur, k), r, 10);
    if (r() < 0.12) c = noisy(patch, r, 10);
    return c;
  };
  for (const t of [PT.Pelvis, PT.Torso, PT.Head, PT.UArm, PT.LArm, PT.ULeg, PT.LLeg]) {
    for (const side of [0, 1]) {
      paintBox(p, t, side, ALL, (f, x, y) => {
        let c = furc(f);
        if ((t === PT.LArm || t === PT.LLeg) && y >= 6) c = shade(fur, 0.6);
        return c;
      });
      splatter(p, t, side, t === PT.Torso ? 5 : 1, ['front', 'left', 'right', 'back', 'top']);
    }
  }
  // face: eyes on head front
  const fr = faceRect(partPx(p.body, PT.Head), partUv(p.body, PT.Head, 0), 'front');
  for (const ex of [1, 5]) {
    p.pc.set(p.ox + fr.x + ex, p.oy + fr.y + 2, eye[0], eye[1], eye[2]);
    setEm(p, fr.x + ex, fr.y + 2, eye);
  }
  // ribs on flanks
  for (const f of ['left', 'right'] as Face[]) {
    const rr = faceRect(partPx(p.body, PT.Torso), partUv(p.body, PT.Torso, 0), f);
    for (let j = 2; j < 7; j += 2) for (let i = 2; i < 10; i++) p.pc.set(p.ox + rr.x + i, p.oy + rr.y + j, 120, 30, 30);
  }
  // snout
  paintBox(p, PT.Head, 0, ALL, (f, x, y) => {
    let c = noisy(shade(fur, 0.95), r, 8);
    if (f === 'front') {
      c = y === 0 ? [30, 22, 22] : [110, 20, 20];
      if (y === 2 && r() < 0.6) c = [230, 220, 200];
    }
    return c;
  }, true);
}

export interface SkinAtlas {
  map: THREE.Texture;
  emissive: THREE.Texture;
  /** Average color per skin (for gibs/blood tinting). */
  palette: RGB[][];
}

export function buildSkinAtlas(): SkinAtlas {
  const pc = new PixelCanvas(ATLAS_W, ATLAS_H);
  const em = new PixelCanvas(ATLAS_W, ATLAS_H);
  em.fill([0, 0, 0]);
  const palette: RGB[][] = [];
  const rndAll = mulberry32(90210);
  const pickc = <T>(arr: T[], rr = rndAll) => arr[Math.floor(rr() * arr.length)];
  const eyeY: RGB = [236, 255, 96];
  const eyeR: RGB = [255, 70, 40];

  for (let idx = 0; idx < ATLAS_COLS * ATLAS_ROWS; idx++) {
    const ox = (idx % ATLAS_COLS) * SKIN_W;
    const oy = Math.floor(idx / ATLAS_COLS) * SKIN_H;
    const rnd = mulberry32(idx * 7717 + 3);
    const inRange = (k: keyof typeof SKINS) => idx >= SKINS[k][0] && idx < SKINS[k][1];
    let body: BodyDef = HUMAN;
    if (inRange('dog')) body = DOG;
    const p: Painter = { pc, em, ox, oy, rnd, body };
    // clear cell to a neutral dark (unused regions)
    for (let y = 0; y < SKIN_H; y++) for (let x = 0; x < SKIN_W; x++) pc.set(ox + x, oy + y, 60, 20, 20);

    if (body === DOG) {
      const furs: RGB[] = [[214, 176, 150], [150, 120, 90], [90, 80, 70], [200, 190, 170], [120, 90, 60], [60, 55, 50]];
      paintDog(p, furs[idx % furs.length], [140, 40, 36], eyeY);
      palette.push([[180, 140, 120], [140, 30, 30]]);
      continue;
    }
    const style: HumanStyle = {
      skin: pickc(SKIN_TONES, rnd),
      hair: pickc(HAIR, rnd),
      hairStyle: pickc(['short', 'short', 'long', 'bald', 'cap', 'beanie', 'short', 'mohawk'] as const, rnd),
      capColor: pickc([[40, 60, 150], [180, 40, 40], [40, 40, 44], [220, 200, 60], [60, 100, 60]] as RGB[], rnd),
      shirt: pickc(SHIRTS, rnd),
      shirt2: pickc(SHIRTS, rnd),
      shirtStyle: pickc(['plain', 'plain', 'stripes', 'plaid', 'tank', 'jacket', 'plain'] as const, rnd),
      sleeves: pickc(['short', 'long', 'short', 'none'] as const, rnd),
      pants: pickc(PANTS, rnd),
      shoes: pickc(SHOES, rnd),
      eye: eyeY,
      blood: rnd() * 0.8,
      ribs: rnd() < 0.15,
      bloat: false,
      veins: false,
    };
    if (inRange('runner')) {
      style.shirtStyle = pickc(['tank', 'plain', 'stripes'] as const, rnd);
      style.shirt = pickc([[220, 60, 60], [240, 240, 240], [60, 140, 220], [240, 200, 40], [40, 40, 40]] as RGB[], rnd);
      style.sleeves = 'none';
      style.pants = pickc([[30, 30, 34], [60, 60, 70], [140, 30, 30]] as RGB[], rnd);
      style.shoes = pickc([[230, 230, 230], [220, 80, 40], [60, 120, 220]] as RGB[], rnd);
      style.blood = 0.6 + rnd() * 0.4;
      style.skin = pickc([[170, 200, 150], [150, 190, 140], [180, 196, 160]] as RGB[], rnd);
    } else if (inRange('tough')) {
      style.shirtStyle = pickc(['tank', 'none', 'plain'] as const, rnd);
      style.shirt = pickc([[220, 214, 190], [200, 200, 200], [110, 90, 60]] as RGB[], rnd);
      style.hairStyle = pickc(['bald', 'short', 'cap'] as const, rnd);
      style.pants = pickc([[48, 72, 128], [96, 96, 100], [60, 50, 40]] as RGB[], rnd);
      style.blood = 0.5 + rnd() * 0.5;
      style.skin = pickc([[132, 168, 120], [118, 150, 110], [140, 176, 118]] as RGB[], rnd);
    } else if (inRange('armored')) {
      style.shirtStyle = 'uniform';
      style.shirt = [34, 40, 60];
      style.sleeves = 'long';
      style.pants = [30, 34, 48];
      style.shoes = [24, 24, 26];
      style.hairStyle = 'short';
      style.blood = 0.3 + rnd() * 0.4;
    } else if (inRange('brute')) {
      style.skin = pickc([[110, 138, 112], [98, 124, 100], [124, 140, 100]] as RGB[], rnd);
      style.shirtStyle = 'none';
      style.hairStyle = 'bald';
      style.pants = pickc([[60, 50, 40], [40, 50, 70]] as RGB[], rnd);
      style.eye = eyeR;
      style.veins = true;
      style.blood = 0.7;
      style.ribs = false;
    } else if (inRange('exploder')) {
      style.skin = pickc([[178, 196, 96], [196, 190, 110]] as RGB[], rnd);
      style.shirtStyle = pickc(['tank', 'none'] as const, rnd);
      style.shirt = [210, 200, 170];
      style.hairStyle = 'bald';
      style.bloat = true;
      style.blood = 0.3;
      style.eye = [255, 180, 60];
    } else if (inRange('boss')) {
      style.skin = [96, 104, 92];
      style.shirtStyle = 'none';
      style.hairStyle = 'mohawk';
      style.hair = [30, 30, 30];
      style.pants = [40, 30, 26];
      style.shoes = [30, 30, 30];
      style.eye = eyeR;
      style.veins = true;
      style.blood = 1;
      style.ribs = true;
    }
    paintHuman(p, style);
    palette.push([style.skin, style.shirt, style.pants]);
  }
  const map = toTexture(pc.commit(), { nearest: true, mipmaps: true });
  map.anisotropy = 1;
  const emissive = toTexture(em.commit(), { nearest: true, mipmaps: true });
  return { map, emissive, palette };
}

/** Tiling blood-noise mask used to progressively bloody body parts. */
export function makeBloodMask() {
  const S = 32;
  const pc = new PixelCanvas(S, S);
  const rnd = mulberry32(31337);
  // blotchy threshold field: value = order in which pixels get bloodied
  const v = new Float32Array(S * S);
  for (let k = 0; k < 40; k++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const rad = 1 + rnd() * 5;
    const base = rnd();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let dx = Math.abs(x - cx);
        let dy = Math.abs(y - cy);
        dx = Math.min(dx, S - dx);
        dy = Math.min(dy, S - dy);
        const d = Math.sqrt(dx * dx + dy * dy) / rad;
        if (d < 1) v[y * S + x] = Math.max(v[y * S + x], (1 - d) * (0.5 + base * 0.5));
      }
  }
  for (let i = 0; i < S * S; i++) {
    const val = Math.min(255, v[i] * 255 + rnd() * 20);
    pc.set(i % S, Math.floor(i / S), val, val, val);
  }
  return toTexture(pc.commit(), { nearest: true, repeat: true, srgb: false, mipmaps: false });
}
