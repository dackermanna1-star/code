// Outfits: how each look colours the base body and which pieces it adds
// (hair, hats, ties, cameras, bibs, gowns, armour …), plus the hand-held props
// and the detachable pieces (riot armour, Big Dave's apron, the gold medal).
import * as THREE from 'three';
import { PartBuilder, box, cone, cyl, lathe, roundBox, torus, type MatClass } from '../kit';
import { blob, snoise } from '../common';
import type { Dims, Dress } from './body';
import { HEAD, torsoSections } from './body';
import {
  above,
  bands,
  check,
  dots,
  fabric,
  hibiscus,
  skinFn,
  split,
  stains,
  torn,
  veined,
  type ColorFn,
  type Look,
  type SkinPal,
} from './looks';

const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);

/** Front surface x of the torso at chest-local height y (approximate). */
export function torsoFront(d: Dims, y: number): number {
  const s = torsoSections(d);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t + (a.hb ?? a.h) + ((b.hb ?? b.h) - (a.hb ?? a.h)) * t;
    }
  }
  return s[0].x + (s[0].hb ?? s[0].h);
}
/** Half-width (z) of the torso at chest-local height y. */
export function torsoHalfW(d: Dims, y: number): number {
  const s = torsoSections(d);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    if (y >= a.y && y <= b.y) return a.w + (b.w - a.w) * ((y - a.y) / (b.y - a.y));
  }
  return s[0].w;
}
export function torsoBack(d: Dims, y: number): number {
  const s = torsoSections(d);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t - (a.h + (b.h - a.h) * t);
    }
  }
  return s[0].x - s[0].h;
}

/** Pieces an outfit asks the rig to build as separate objects. */
export interface Extras {
  /** Hand-held prop (dropped on death): built into a group parented to `bone`. */
  prop?: { bone: 'handL' | 'handR' | 'foreArmL' | 'foreArmR'; at: [number, number, number]; rot?: [number, number, number]; build: (pb: PartBuilder) => void; kind: 'tray' | 'handbag' | 'fish' };
  /** Riot armour pieces: PLATE flag → bone + builder. */
  plates?: Array<{ flag: number; bone: 'head' | 'chest' | 'foreArmL'; build: (pb: PartBuilder) => void; at?: [number, number, number]; rot?: [number, number, number] }>;
  /** Big Dave's apron (pelvis). */
  apron?: (pb: PartBuilder) => void;
  /** Gold medal (jogger boss), chest. */
  medal?: (pb: PartBuilder) => void;
}

export interface Outfitted {
  dress: Dress;
  extras: Extras;
  /** Extra height above the skull top (hats), in head-local metres before scaling. */
  hat: number;
}

// ---------------------------------------------------------------- shared bits
function hairCap(pb: PartBuilder, hs: number, c: THREE.ColorRepresentation, o: { front?: number; back?: number; top?: number; mat?: MatClass; bump?: number } = {}): void {
  const [sx, sy, sz] = HEAD.skull;
  const [rx, ry, rz] = HEAD.skullR;
  const g = blob(rx * 1.07 * hs, ry * 1.03 * hs, rz * 1.08 * hs, 18, 12, o.bump ?? 0.05, 26);
  // keep the cap above the brow at the front, lower at the back
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const front = o.front ?? 0.03;
  const back = o.back ?? -0.06;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const cutoff = (v.x > 0 ? front : back) * hs - (o.top ?? 0);
    if (v.y < cutoff) {
      // tuck under the skull surface
      v.multiplyScalar(0.9);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  pb.addShaded(g, fabric(c, { fold: 0.3, noise: 0.12, freq: 40 }), o.mat ?? 'fur', { p: V(sx * hs, sy * hs, sz) }, true);
}

function buttons(pb: PartBuilder, d: Dims, ys: number[], z: number, c: THREE.ColorRepresentation, r = 0.011): void {
  for (const y of ys) pb.add(blob(r * 0.6, r, r, 6, 4), c, 'cloth', { p: V(torsoFront(d, y) - 0.002, y, z) });
}

function stubble(sp: SkinPal, amount: number): ColorFn {
  const sk = skinFn(sp);
  const st = sp.dark.clone().lerp(col(0x2a2a26), 0.45);
  return (p, n) => {
    const c = sk(p, n);
    if (p.y < 0.13 && p.x > 0.03) c.lerp(st, amount * (0.6 + 0.4 * (snoise(p.x * 80, p.y * 80, p.z * 80) * 0.5 + 0.5)));
    return c;
  };
}

/** Seven-segment digits for the race bib (built in the YZ plane, facing +X). */
function digits(pb: PartBuilder, n: string, x: number, y: number, z0: number, h: number, c: THREE.ColorRepresentation): void {
  const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
  const w = h * 0.55;
  const t = h * 0.16;
  const sp = w + t * 1.6;
  const total = n.length * sp - t * 1.6;
  for (let i = 0; i < n.length; i++) {
    // digits read left→right as seen from the front (+X): +Z is the reader's left
    const zc = z0 + total / 2 - w / 2 - i * sp;
    const segs = SEG[n[i]] ?? '';
    const put = (dy: number, dz: number, horiz: boolean) =>
      pb.add(box(0.004, horiz ? t : h / 2, horiz ? w : t), c, 'plastic', { p: V(x, y + dy, zc + dz) });
    if (segs.includes('a')) put(h / 2 - t / 2, 0, true);
    if (segs.includes('g')) put(0, 0, true);
    if (segs.includes('d')) put(-h / 2 + t / 2, 0, true);
    if (segs.includes('f')) put(h / 4, w / 2 - t / 2, false);
    if (segs.includes('b')) put(h / 4, -w / 2 + t / 2, false);
    if (segs.includes('e')) put(-h / 4, w / 2 - t / 2, false);
    if (segs.includes('c')) put(-h / 4, -w / 2 + t / 2, false);
  }
}

// ---------------------------------------------------------------- props
function trayProp(pb: PartBuilder): void {
  // silver tray (flat on the palm), a wine bottle, a glass and a cloche
  pb.add(cyl(0.2, 0.19, 0.016, 24), 0xc9ced4, 'metal', { p: V(0, 0.008, 0) });
  pb.add(torus(0.195, 0.008, 6, 28), 0xdfe3e8, 'metal', { p: V(0, 0.016, 0), r: [Math.PI / 2, 0, 0] });
  pb.add(cyl(0.032, 0.034, 0.17, 10), 0x1f4a24, 'plastic', { p: V(-0.08, 0.1, -0.06) });
  pb.add(cyl(0.012, 0.03, 0.05, 10), 0x1f4a24, 'plastic', { p: V(-0.08, 0.21, -0.06) });
  pb.add(cyl(0.014, 0.014, 0.03, 8), 0x8a1020, 'plastic', { p: V(-0.08, 0.245, -0.06) });
  pb.add(box(0.002, 0.05, 0.05), 0xf0e6c8, 'plastic', { p: V(-0.047, 0.1, -0.06) });
  // cloche
  pb.add(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8dde3, 'metal', { p: V(0.06, 0.016, 0.05) });
  pb.add(blob(0.016, 0.014, 0.016, 8, 6), 0xd8dde3, 'metal', { p: V(0.06, 0.125, 0.05) });
  // tipped glass
  pb.add(cyl(0.028, 0.012, 0.05, 10, true), 0xd0e6ee, 'plastic', { p: V(0.06, 0.04, -0.12), r: [1.3, 0, 0.2] });
}

function handbagProp(pb: PartBuilder): void {
  // hangs below the origin (the elbow crook)
  pb.add(roundBox(0.2, 0.15, 0.085, 0.025), 0x6e1f2c, 'rubber', { p: V(0, -0.19, 0) });
  pb.add(roundBox(0.205, 0.05, 0.09, 0.02), 0x5a1722, 'rubber', { p: V(0, -0.12, 0) });
  pb.add(box(0.03, 0.022, 0.095), 0xd8b040, 'metal', { p: V(0, -0.125, 0) });
  const strap = torus(0.08, 0.009, 6, 18, Math.PI);
  pb.add(strap, 0x4a1018, 'rubber', { p: V(0, -0.11, 0) });
}

function fishProp(pb: PartBuilder): void {
  // a big dead fish held by the tail, head down
  const body = blob(0.055, 0.17, 0.03, 12, 10);
  pb.addShaded(body, (p, n) => {
    const t = (p.x + 0.055) / 0.11;
    const c = col(0x5a6e7a).lerp(col(0xd8dee0), Math.min(1, Math.max(0, t * 1.2 - 0.1)));
    return c.multiplyScalar(1 + Math.max(0, n.y) * 0.1);
  }, 'skin', { p: V(0, -0.2, 0) });
  pb.add(cone(0.06, 0.08, 6), 0x46586a, 'skin', { p: V(0, -0.02, 0), s: [1, 1, 0.25] });
  pb.add(blob(0.012, 0.012, 0.012, 6, 4), 0xf0f0e0, 'eye', { p: V(0.022, -0.33, 0.024) });
  pb.add(blob(0.012, 0.012, 0.012, 6, 4), 0xf0f0e0, 'eye', { p: V(0.022, -0.33, -0.024) });
  pb.add(blob(0.02, 0.015, 0.012, 6, 4), 0x9a3a3a, 'skin', { p: V(0.0, -0.36, 0) });
  pb.add(box(0.05, 0.04, 0.004), 0x46586a, 'skin', { p: V(-0.05, -0.2, 0), r: [0, 0, 0.5] });
}

// ---------------------------------------------------------------- outfits
export function outfit(look: Look, d: Dims, sp: SkinPal): Outfitted {
  const hs = d.head;
  const skin = skinFn(sp);
  const pal = look.pal;
  const extras: Extras = {};
  const sleeve = (fn: ColorFn, y0: number, rag = 0.02): ColorFn => split(above(y0, rag), fn, skin);
  let dress: Dress;

  switch (look.outfit) {
    // ------------------------------------------------------------------ FISHERMAN
    case 'fisherman': {
      const flannel = [
        [0xa8261e, 0x2a1414, 0x1a0c0c],
        [0x3a6a3a, 0x1c2a1c, 0x101810],
        [0x2a4c8c, 0x16203a, 0x0c1222],
      ][pal];
      const shirt = torn(check(flannel[0], flannel[1], flannel[2], 0.045), sp, 0.12);
      const rubber = fabric(0x4a5532, { fold: 0.35, noise: 0.05 });
      const strapC = col(0x2e3420);
      const bibTop = 0.17;
      const torso: ColorFn = (p, n) => {
        const front = p.x > -0.02;
        if (front ? p.y < bibTop : p.y < 0.07) return rubber(p, n);
        if (Math.abs(Math.abs(p.z) - 0.085) < 0.022) return strapC.clone();
        return shirt(p, n);
      };
      dress = {
        torso,
        hips: rubber,
        upperArm: shirt,
        foreArm: split(above(-0.06, 0.01), check(flannel[0], flannel[1], flannel[2], 0.03), skin),
        thigh: rubber,
        shin: rubber,
        legMat: 'rubber',
        hand: skin,
        foot: 'wader',
        footCol: 0x404a2c,
        footCol2: 0x1a1c14,
        face: stubble(sp, 0.7),
        noEars: true,
        extra: {
          head: (pb) => {
            // knit beanie with a turned-up cuff
            const bc = [0xd09a28, 0x24365a, 0xa82e26][pal];
            const [sx, sy] = HEAD.skull;
            pb.addShaded(blob(0.162 * hs, 0.15 * hs, 0.148 * hs, 16, 10, 0.03, 30), fabric(bc, { fold: 0.25, noise: 0.15, freq: 60 }), 'cloth', { p: V(sx * hs - 0.005, (sy + 0.04) * hs, 0) }, true);
            pb.addShaded(cyl(0.155 * hs, 0.152 * hs, 0.055 * hs, 18), fabric(new THREE.Color(bc).multiplyScalar(0.8), { noise: 0.1, freq: 50 }), 'cloth', { p: V(sx * hs - 0.005, (sy + 0.0) * hs, 0), r: [0, 0, -0.12] }, true);
            // fishing lure hooked into the beanie
            pb.add(blob(0.012, 0.02, 0.012, 6, 5), 0xff5a1a, 'plastic', { p: V(0.06 * hs, (sy + 0.13) * hs, 0.11 * hs) });
            pb.add(blob(0.01, 0.01, 0.01, 5, 4), 0xf0f0f0, 'metal', { p: V(0.06 * hs, (sy + 0.105) * hs, 0.115 * hs) });
          },
          jaw: (pb) => {
            pb.add(blob(0.07 * hs, 0.035 * hs, 0.085 * hs, 10, 6), sp.dark.clone().lerp(col(0x2a2a26), 0.6), 'skin', { p: V(0.035 * hs, -0.046 * hs, 0) });
          },
          chest: (pb) => {
            // wader bib buckles
            for (const s of [1, -1]) pb.add(box(0.012, 0.03, 0.035), 0xb0b4b8, 'metal', { p: V(torsoFront(d, bibTop) - 0.004, bibTop - 0.01, s * 0.085) });
          },
        },
      };
      if (pal !== 2) extras.prop = { bone: 'handL', at: V(0.0, -0.13, 0.0), build: fishProp, kind: 'fish' };
      break;
    }
    // ------------------------------------------------------------------ TOURIST
    case 'tourist': {
      const pr = [
        [0x18b4c4, 0xff5d8f, 0xff9a2a, 0x2e8a3a],
        [0xc4232c, 0xfff2d6, 0xffd23a, 0x1e6a2e],
        [0xffc61a, 0x2a62d8, 0xe0262e, 0x2a8a3a],
      ][pal];
      const print = hibiscus(pr[0], pr[1], pr[2], pr[3], 0.085);
      const shirt = torn(print, sp, 0.1);
      const neckV: ColorFn = (p, n) => (p.x > 0.0 && p.y > 0.24 && Math.abs(p.z) < (p.y - 0.24) * 0.75 ? skin(p, n) : shirt(p, n));
      const shorts = fabric(0xc4aa70, { fold: 0.3 });
      dress = {
        torso: neckV,
        hips: bands(shorts, [[0.075, 0.1, 0x5a4026]]),
        upperArm: sleeve(print, -0.13),
        foreArm: skin,
        thigh: sleeve(shorts, -0.16, 0.01),
        shin: skin,
        hand: skin,
        foot: 'sandal',
        footCol2: 0xf4f4ee,
        extra: {
          head: (pb) => {
            if (pal === 0) {
              // bucket hat
              const [sx, sy] = HEAD.skull;
              pb.addShaded(cyl(0.13 * hs, 0.155 * hs, 0.12 * hs, 18), fabric(0xd8c690, { noise: 0.08 }), 'cloth', { p: V(sx * hs, (sy + 0.11) * hs, 0) });
              pb.addShaded(blob(0.13 * hs, 0.03 * hs, 0.13 * hs, 16, 6), fabric(0xd8c690), 'cloth', { p: V(sx * hs, (sy + 0.17) * hs, 0) });
              pb.addShaded(cyl(0.25 * hs, 0.26 * hs, 0.02 * hs, 22), fabric(0xcab680), 'cloth', { p: V(sx * hs, (sy + 0.055) * hs, 0), r: [0, 0, -0.18] });
            } else {
              hairCap(pb, hs, pal === 1 ? 0x6a4a2a : 0xc8a050, { front: 0.08 });
              // sunglasses pushed up on the forehead
              for (const s of [1, -1]) pb.add(blob(0.028 * hs, 0.02 * hs, 0.032 * hs, 8, 6), 0x101418, 'plastic', { p: V(0.13 * hs, 0.275 * hs, s * 0.045 * hs) });
              pb.add(box(0.01, 0.008, 0.2 * hs), 0x101418, 'plastic', { p: V(0.12 * hs, 0.28 * hs, 0) });
            }
          },
          chest: (pb) => {
            // camera on a strap
            const y = 0.06;
            const fx = torsoFront(d, y) + 0.035;
            pb.add(roundBox(0.06, 0.075, 0.12, 0.012), 0x18181a, 'plastic', { p: V(fx, y, 0.03) });
            pb.add(cyl(0.032, 0.032, 0.05, 14).rotateZ(Math.PI / 2), 0x222226, 'plastic', { p: V(fx + 0.05, y, 0.035) });
            pb.add(cyl(0.022, 0.022, 0.006, 14).rotateZ(Math.PI / 2), 0x3a5a9a, 'eye', { p: V(fx + 0.077, y, 0.035) });
            pb.add(box(0.02, 0.012, 0.03), 0xc0c4c8, 'metal', { p: V(fx, y + 0.044, 0.07) });
            for (const s of [1, -1]) {
              const y0 = d.shY + 0.03;
              const z0 = s * 0.08;
              const len = Math.hypot(y0 - y, 0.05);
              pb.add(box(0.008, len, 0.012), 0x1a1a1a, 'plastic', { p: V((torsoFront(d, (y + y0) / 2) + fx) / 2 - 0.005, (y + y0) / 2, (z0 + 0.03 + s * 0.04) / 2), r: [s * 0.1, 0, -0.18] });
            }
          },
          pelvis: (pb) => {
            // bum bag
            pb.add(roundBox(0.07, 0.07, 0.17, 0.025), 0xe0468a, 'plastic', { p: V(d.hipsD + 0.025, 0.05, 0.02) });
            pb.add(box(0.012, 0.02, d.hipsW * 2.05), 0x1a1a1a, 'plastic', { p: V(0.0, 0.07, 0), s: [d.hipsD * 2 / 0.012 * 0.98, 1, 1] });
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ WAITER
    case 'waiter': {
      const white = stains(fabric(0xeeeae0, { fold: 0.25 }), 0x6a0e0e, 0.22, 6, 3 + look.tint);
      const vest = fabric(0x1a1a20, { fold: 0.3 });
      const torso: ColorFn = (p, n) => {
        const front = p.x > 0.0;
        if (front && p.y > 0.12 && Math.abs(p.z) < (p.y - 0.12) * 0.55 + 0.012) return white(p, n);
        if (p.y > d.shY - 0.02 && Math.abs(p.z) > d.torsoW * 0.62) return white(p, n);
        return vest(p, n);
      };
      dress = {
        torso,
        hips: fabric(0x18181c),
        upperArm: white,
        foreArm: bands(white, [[-d.fore + 0.02, -d.fore + 0.05, 0xf4f2ea]]),
        thigh: fabric(0x18181c),
        shin: fabric(0x18181c),
        hand: skin,
        foot: 'shoe',
        footCol: 0x0e0e10,
        extra: {
          head: (pb) => {
            hairCap(pb, hs, 0x14110e, { front: 0.1, mat: 'plastic', bump: 0.01 });
            // side parting
            pb.add(box(0.14 * hs, 0.006, 0.006), 0xa8b090, 'skin', { p: V(0.03 * hs, 0.35 * hs, 0.06 * hs), r: [0, 0.1, -0.1] });
            // pencil moustache
            pb.add(box(0.012, 0.008, 0.07 * hs), 0x14110e, 'fur', { p: V(0.16 * hs, 0.126 * hs, 0) });
          },
          chest: (pb) => {
            const y = d.shY + 0.055;
            const fx = torsoFront(d, y) + 0.0;
            pb.add(blob(0.018, 0.022, 0.022, 6, 5), 0x0a0a0c, 'cloth', { p: V(fx, y, 0) });
            for (const s of [1, -1]) pb.add(blob(0.016, 0.03, 0.045, 6, 5), 0x0a0a0c, 'cloth', { p: V(fx - 0.004, y, s * 0.038), r: [0, 0, 0] });
            buttons(pb, d, [0.0, 0.05, 0.1], 0, 0x3a3a40);
          },
          foreArmR: (pb) => {
            // white towel over the forearm
            pb.add(roundBox(0.11, 0.06, 0.13, 0.015), 0xf6f6f2, 'cloth', { p: V(0.0, -0.08, 0), r: [0, 0, 0.1] });
            pb.add(roundBox(0.1, 0.14, 0.02, 0.01), 0xf0f0ea, 'cloth', { p: V(0.0, -0.15, 0.06) });
            pb.add(roundBox(0.1, 0.12, 0.02, 0.01), 0xf0f0ea, 'cloth', { p: V(0.0, -0.14, -0.06) });
          },
        },
      };
      extras.prop = { bone: 'handL', at: V(0.0, -0.06, 0.0), rot: [0, 0, 0], build: trayProp, kind: 'tray' };
      break;
    }
    // ------------------------------------------------------------------ GRANNY
    case 'granny': {
      const cardi = [0xa48cc8, 0xd88aa0, 0x6aa0a8][pal];
      const dressPrint = dots([0xf0d0d8, 0xe8e0c0, 0xd8e4f0][pal], [0xb04060, 0x5a8a40, 0x3a5aa0][pal], 0.04, 0.28);
      const cardFn = torn(fabric(cardi, { fold: 0.3, noise: 0.12, freq: 50 }), sp, 0.08);
      const torso: ColorFn = (p, n) => (p.x > 0.02 && Math.abs(p.z) < 0.045 + Math.max(0, 0.2 - p.y) * 0.1 ? dressPrint(p, n) : cardFn(p, n));
      const stocking = fabric(0xb8957a, { fold: 0.15, noise: 0.03 });
      dress = {
        torso,
        hips: dressPrint,
        upperArm: cardFn,
        foreArm: bands(cardFn, [[-d.fore + 0.0, -d.fore + 0.035, new THREE.Color(cardi).multiplyScalar(0.8)]]),
        thigh: stocking,
        shin: stocking,
        hand: skin,
        foot: 'granny',
        footCol: 0x1c1416,
        footCol2: 0x0e0a0a,
        extra: {
          head: (pb) => {
            const hc = [0xd8d8e8, 0xb8c4e8, 0xe0dcd0][pal];
            const fn = fabric(hc, { fold: 0.3, noise: 0.15, freq: 50 });
            hairCap(pb, hs, hc, { front: 0.12, bump: 0.12 });
            // tight curls
            for (let i = 0; i < 22; i++) {
              const a = (i / 22) * Math.PI * 2;
              const r = 0.13 + 0.02 * Math.sin(i * 3.1);
              const y = 0.26 + 0.07 * Math.cos(i * 1.7);
              pb.addShaded(blob(0.04 * hs, 0.04 * hs, 0.04 * hs, 6, 5), fn, 'fur', { p: V(Math.cos(a) * r * 0.95 * hs - 0.01, y * hs, Math.sin(a) * r * hs) });
            }
            // bun
            pb.addShaded(blob(0.07 * hs, 0.065 * hs, 0.07 * hs, 10, 8), fn, 'fur', { p: V(-0.08 * hs, 0.36 * hs, 0) });
            // spectacles
            for (const s of [1, -1]) {
              pb.add(torus(0.026 * hs, 0.004, 5, 12), 0x8a6a30, 'metal', { p: V(0.17 * hs, 0.188 * hs, s * 0.052 * hs), r: [0, Math.PI / 2, 0] });
              pb.add(box(0.12 * hs, 0.005, 0.005), 0x8a6a30, 'metal', { p: V(0.11 * hs, 0.195 * hs, s * 0.13 * hs) });
            }
          },
          chest: (pb) => {
            // pearls
            for (let i = 0; i < 13; i++) {
              const a = -1.25 + (i / 12) * 2.5;
              const y = d.shY + 0.03 - Math.cos(a * 0.9) * 0.07;
              const fx = torsoFront(d, y);
              pb.add(blob(0.011, 0.011, 0.011, 6, 4), 0xf4f0e6, 'eye', { p: V(fx * Math.cos(a) * 0.92 + 0.004, y, Math.sin(a) * 0.1) });
            }
            buttons(pb, d, [-0.04, 0.04, 0.12], 0.05, 0xf0f0f0, 0.012);
          },
          pelvis: (pb) => {
            // A-line skirt to the knees
            const len = d.thigh * 0.88;
            const g = lathe([[d.hipsW * 1.42, -len - 0.01], [d.hipsW * 1.5, -len], [d.hipsW * 1.32, -len * 0.6], [d.hipsW * 1.08, -0.08], [d.hipsW * 0.95, 0.02]], 20);
            g.scale(0.82, 1, 1);
            pb.addShaded(g, dressPrint, 'cloth', {}, true);
          },
        },
      };
      extras.prop = { bone: 'foreArmL', at: V(0.0, -0.02, 0.03), build: handbagProp, kind: 'handbag' };
      break;
    }
    // ------------------------------------------------------------------ OFFICE
    case 'office': {
      const shirtC = [0xc4d6ea, 0xeeece4, 0xe6d8e6][pal];
      const tieC = [0xb81c22, 0x1c2a6a, 0x2a6a3a][pal];
      const shirt = stains(torn(fabric(shirtC, { fold: 0.25 }), sp, 0.13, (p) => (p.y < -0.06 ? 0.15 : 0)), 0x7a5a30, 0.12, 5, 3.3);
      const trousers = fabric(0x464a54, { fold: 0.3 });
      dress = {
        torso: shirt,
        hips: bands(trousers, [[0.07, 0.1, 0x161414]]),
        upperArm: shirt,
        foreArm: shirt,
        thigh: trousers,
        shin: trousers,
        hand: skin,
        foot: 'shoe',
        footCol: 0x1a1210,
        extra: {
          head: (pb) => {
            // comb-over: dark sides, three strands over a bald crown
            const hc = 0x3a2e24;
            const [sx, sy] = HEAD.skull;
            for (const s of [1, -1]) pb.addShaded(blob(0.1 * hs, 0.08 * hs, 0.04 * hs, 10, 6, 0.08, 40), fabric(hc), 'fur', { p: V((sx - 0.04) * hs, (sy + 0.02) * hs, s * 0.115 * hs) });
            pb.addShaded(blob(0.08 * hs, 0.09 * hs, 0.12 * hs, 10, 6, 0.08, 40), fabric(hc), 'fur', { p: V((sx - 0.1) * hs, (sy + 0.0) * hs, 0) });
            for (let i = 0; i < 3; i++) {
              const g = new THREE.TorusGeometry(0.15 * hs, 0.006, 4, 16, 2.2);
              pb.add(g, hc, 'fur', { p: V(sx * hs, sy * hs + 0.003, (-0.03 + i * 0.03) * hs), r: [0, 0, 0.45] });
            }
          },
          chest: (pb) => {
            // collar + tie
            const y0 = d.shY + 0.05;
            const fx = torsoFront(d, y0);
            pb.add(blob(0.02, 0.025, 0.022, 6, 5), tieC, 'cloth', { p: V(fx + 0.004, y0, 0) });
            const segs = 5;
            for (let i = 0; i < segs; i++) {
              const y = y0 - 0.04 - i * 0.07;
              const w = 0.03 + i * 0.005;
              pb.add(box(0.012, 0.075, w * 2), tieC, 'cloth', { p: V(torsoFront(d, y) + 0.008, y, 0.004 * i), r: [0.05 * i, 0, 0] });
            }
            for (const s of [1, -1]) pb.add(box(0.02, 0.04, 0.06), shirtC, 'cloth', { p: V(fx - 0.01, y0 + 0.01, s * 0.045), r: [s * 0.6, 0, -0.3] });
            // ID lanyard card
            pb.add(box(0.004, 0.07, 0.05), 0xf4f4f4, 'plastic', { p: V(torsoFront(d, 0.12) + 0.008, 0.12, 0.08) });
            pb.add(box(0.005, 0.02, 0.05), 0x2a5ad0, 'plastic', { p: V(torsoFront(d, 0.14) + 0.009, 0.145, 0.08) });
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ LIFEGUARD
    case 'lifeguard': {
      const shorts = bands(fabric(0xd8262c, { fold: 0.3 }), []);
      const stripe: ColorFn = (p, n) => (Math.abs(Math.abs(p.z) - d.hipsW) < 0.03 && p.x > -0.06 && p.x < 0.06 ? col(0xf4f4f4) : shorts(p, n));
      const body: ColorFn = (p, n) => {
        const c = skinFn(sp, { bruise: 0.45 })(p, n);
        // abs: faint grid on the front of the belly
        if (p.x > 0.05 && p.y < 0.2 && p.y > -0.1 && (Math.abs(p.z) < 0.006 || Math.abs(((p.y + 0.1) % 0.075) - 0.0375) < 0.004)) c.multiplyScalar(0.82);
        // bite wound
        if ((p.x + 0.05) ** 2 + (p.y - 0.25) ** 2 + (p.z - 0.15) ** 2 < 0.004) c.copy(sp.wound);
        return c;
      };
      dress = {
        torso: body,
        torsoMat: 'skin',
        hips: stripe,
        upperArm: skin,
        foreArm: skin,
        armMat: 'skin',
        thigh: sleeve(stripe, -0.14, 0.008),
        shin: skin,
        legMat: 'skin',
        hand: skin,
        foot: 'bare',
        extra: {
          head: (pb) => {
            const hc = [0xf0d878, 0xd8a050, 0x2a1e18][pal];
            hairCap(pb, hs, hc, { front: 0.12, bump: 0.08 });
            for (let i = 0; i < 9; i++) {
              const a = -0.9 + i * 0.25;
              const g = cone(0.035 * hs, 0.11 * hs, 5);
              g.translate(0, 0.05 * hs, 0);
              pb.addShaded(g, fabric(hc), 'fur', { p: V((0.03 - 0.03 * Math.abs(i - 4)) * hs, 0.31 * hs, Math.sin(a) * 0.11 * hs), r: [Math.sin(a) * -0.6, 0, -0.5 + 0.12 * Math.abs(i - 4)] });
            }
            // zinc cream on the nose
            pb.add(blob(0.032 * hs, 0.012 * hs, 0.028 * hs, 8, 5), 0xf8f8f8, 'skin', { p: V(0.168 * hs, 0.178 * hs, 0), r: [0, 0, -0.35] });
          },
          chest: (pb) => {
            // whistle on a cord
            const y = d.shY + 0.04;
            const g = torus(0.085, 0.006, 4, 20, Math.PI * 1.1);
            pb.add(g, 0xff6a1a, 'cloth', { p: V(0.03, y - 0.02, 0), r: [Math.PI / 2, 0, -0.95] });
            const wy = 0.18;
            pb.add(roundBox(0.06, 0.03, 0.03, 0.01), 0xffd21a, 'plastic', { p: V(torsoFront(d, wy) + 0.02, wy, 0.02) });
            pb.add(cyl(0.017, 0.017, 0.032, 10), 0xffd21a, 'plastic', { p: V(torsoFront(d, wy) + 0.03, wy - 0.01, 0.02), r: [Math.PI / 2, 0, 0] });
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ JOGGER
    case 'jogger': {
      const neon = [0xb6f23a, 0xff4fa8, 0xff8a1e][pal];
      const top = torn(fabric(neon, { fold: 0.3 }), sp, 0.09);
      const torso: ColorFn = (p, n) => {
        // tank top: deep arm holes, scoop neck
        if (p.y > d.shY - 0.08 && Math.abs(p.z) > d.torsoW * 0.55) return skin(p, n);
        if (p.y > d.shY - 0.01 && Math.abs(p.z) < 0.06) return skin(p, n);
        return top(p, n);
      };
      const shorts = fabric(0x1a1a22, { fold: 0.3 });
      const sh: ColorFn = (p, n) => (Math.abs(Math.abs(p.z) - d.hipsW * 0.98) < 0.02 && Math.abs(p.x) < 0.05 ? col(neon) : shorts(p, n));
      const sock = bands(skin, [[-d.shin - 0.01, -d.shin + 0.09, 0xf0f0f0]]);
      const num = ['13', '42', '404', '666', '1337', '007', '99', '26'][look.sub % 8];
      dress = {
        torso,
        hips: sh,
        upperArm: skin,
        foreArm: bands(skin, [[-d.fore + 0.015, -d.fore + 0.06, neon]]),
        armMat: 'skin',
        thigh: sleeve(sh, -0.1, 0.006),
        shin: sock,
        legMat: 'skin',
        hand: skin,
        foot: 'sneaker',
        footCol: 0xf0f0f0,
        footCol2: neon,
        extra: {
          head: (pb) => {
            const hc = [0x3a2a1c, 0xc89048, 0x1a1412][look.sub % 3];
            hairCap(pb, hs, hc, { front: 0.09, bump: 0.06 });
            if (pal !== 0) {
              // ponytail
              const g = blob(0.04 * hs, 0.11 * hs, 0.04 * hs, 8, 6);
              pb.addShaded(g, fabric(hc), 'fur', { p: V(-0.16 * hs, 0.22 * hs, 0), r: [0, 0, 0.9] });
            }
            const [sx, sy] = HEAD.skull;
            const band = torus(0.148 * hs, 0.02 * hs, 6, 22);
            band.rotateX(Math.PI / 2);
            band.scale(1.04, 1, 0.94);
            pb.add(band, [0xff3a8a, 0x2ae0e0, 0xf0f0f0][pal], 'cloth', { p: V(sx * hs + 0.005, (sy + 0.06) * hs, 0), r: [0, 0, -0.22] });
          },
          chest: (pb) => {
            // race bib: white sheet, safety-pinned, with a number
            const y = 0.07;
            const fx = torsoFront(d, y) + 0.004;
            pb.add(box(0.004, 0.13, 0.16), 0xf8f8f4, 'plastic', { p: V(fx, y, 0) });
            pb.add(box(0.005, 0.022, 0.16), 0xd82020, 'plastic', { p: V(fx + 0.001, y + 0.054, 0) });
            digits(pb, num, fx + 0.004, y - 0.012, 0, 0.06, 0x101010);
            for (const [dy, dz] of [[0.058, 0.07], [0.058, -0.07], [-0.058, 0.07], [-0.058, -0.07]]) pb.add(blob(0.006, 0.006, 0.006, 4, 3), 0xc0c4c8, 'metal', { p: V(fx + 0.003, y + dy, dz) });
          },
        },
      };
      extras.medal = (pb) => {
        const y = 0.2;
        const fx = torsoFront(d, y) + 0.012;
        for (const s of [1, -1]) pb.add(box(0.008, 0.2, 0.025), 0x2a4ac8, 'cloth', { p: V((fx + torsoFront(d, d.shY)) / 2, (y + d.shY + 0.05) / 2, s * 0.045), r: [s * -0.25, 0, -0.12] });
        pb.add(cyl(0.045, 0.045, 0.012, 16).rotateZ(Math.PI / 2), 0xffc81a, 'metal', { p: V(fx + 0.01, y - 0.03, 0) });
        pb.add(cyl(0.03, 0.03, 0.014, 12).rotateZ(Math.PI / 2), 0xffe060, 'metal', { p: V(fx + 0.011, y - 0.03, 0) });
      };
      break;
    }
    // ------------------------------------------------------------------ BLOATER
    case 'bloater': {
      const vest = stains(fabric(0xe8e2cc, { fold: 0.25 }), 0x8a7a2a, 0.35, 5, 1.7);
      const torso: ColorFn = (p, n) => (p.y > 0.14 + (p.x > 0 ? 0.05 : -0.08) || (p.y > 0.0 && p.x < 0.0) ? (p.y > d.shY - 0.06 && Math.abs(p.z) > d.torsoW * 0.5 ? skin(p, n) : vest(p, n)) : veined(sp, 0x4a2c5a, 1, 8)(p, n));
      const trousers = fabric([0x5c4630, 0x3a4a5c, 0x4a4a3a][pal], { fold: 0.3 });
      dress = {
        torso,
        torsoMat: 'skin',
        hips: bands(trousers, [[0.06, 0.1, 0x22180e]]),
        upperArm: skin,
        foreArm: skin,
        armMat: 'skin',
        thigh: trousers,
        shin: trousers,
        hand: skin,
        belly: veined(sp, 0x3a1c4a, 1.1, 6),
        foot: 'shoe',
        footCol: 0x3a2a1a,
        extra: {
          head: (pb) => {
            if (pal === 2) {
              hairCap(pb, hs, 0x5a4a3a, { front: -0.02, back: -0.04, bump: 0.1 });
            } else {
              // trucker cap, backwards
              const cc = pal === 0 ? 0xc82a2a : 0x2a5ac8;
              const [sx, sy] = HEAD.skull;
              pb.addShaded(blob(0.16 * hs, 0.11 * hs, 0.148 * hs, 14, 8), fabric(cc), 'cloth', { p: V(sx * hs, (sy + 0.07) * hs, 0) });
              pb.add(box(0.13 * hs, 0.012, 0.16 * hs), cc, 'cloth', { p: V((sx - 0.2) * hs, (sy + 0.05) * hs, 0), r: [0, 0, 0.15] });
              pb.add(blob(0.1 * hs, 0.06 * hs, 0.06 * hs, 8, 6), 0xf0f0f0, 'cloth', { p: V((sx + 0.08) * hs, (sy + 0.1) * hs, 0) });
            }
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ PARAMEDIC
    case 'paramedic': {
      const green = torn(fabric(0x2c5436, { fold: 0.3 }), sp, 0.07);
      const hv = 0xc8e83a;
      const silver = 0xd8dcd8;
      const torso = bands((p, n) => (p.y > d.shY - 0.07 ? col(hv).multiplyScalar(1 - Math.max(0, -n.y) * 0.15) : green(p, n)), [[0.0, 0.035, silver], [0.1, 0.135, silver]]);
      const trousers = bands(fabric(0x23402c, { fold: 0.3 }), [[-0.2, -0.17, silver]]);
      dress = {
        torso,
        hips: fabric(0x23402c, { fold: 0.3 }),
        upperArm: bands(green, [[-0.12, -0.09, silver]]),
        foreArm: bands(green, [[-0.1, -0.07, silver]]),
        thigh: fabric(0x23402c, { fold: 0.3 }),
        shin: trousers,
        hand: fabric(0x5a8ad8, { fold: 0.2 }),
        handMat: 'rubber',
        foot: 'boot',
        footCol: 0x141414,
        extra: {
          head: (pb) => hairCap(pb, hs, [0x2a1e16, 0x8a6a40][pal], { front: 0.1, bump: 0.05 }),
          chest: (pb) => {
            // radio on the chest + "+" badge
            const y = 0.2;
            pb.add(roundBox(0.03, 0.08, 0.045, 0.008), 0x141414, 'plastic', { p: V(torsoFront(d, y) + 0.012, y, 0.09) });
            pb.add(cyl(0.004, 0.004, 0.05, 6), 0x141414, 'plastic', { p: V(torsoFront(d, y) + 0.012, y + 0.06, 0.1) });
            const by = 0.17;
            pb.add(box(0.004, 0.05, 0.05), 0xf4f4f4, 'plastic', { p: V(torsoFront(d, by) + 0.003, by, -0.08) });
            pb.add(box(0.005, 0.034, 0.01), 0x20a040, 'plastic', { p: V(torsoFront(d, by) + 0.005, by, -0.08) });
            pb.add(box(0.005, 0.01, 0.034), 0x20a040, 'plastic', { p: V(torsoFront(d, by) + 0.005, by, -0.08) });
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ SCRUBS
    case 'scrubs': {
      const sc = [0x2fa39c, 0x5a7ed0][pal];
      const scrub = stains(torn(fabric(sc, { fold: 0.28 }), sp, 0.07), 0x6a0e0e, 0.2, 6, 2.2);
      const torso: ColorFn = (p, n) => (p.x > 0 && p.y > 0.25 && Math.abs(p.z) < (p.y - 0.25) * 0.8 ? skin(p, n) : scrub(p, n));
      dress = {
        torso,
        hips: scrub,
        upperArm: sleeve(scrub, -0.12),
        foreArm: skin,
        thigh: scrub,
        shin: scrub,
        hand: fabric(0x8a6ad8, { fold: 0.2 }),
        handMat: 'rubber',
        foot: 'clog',
        footCol: pal === 0 ? 0xf0f0f0 : 0x5ad06a,
        footCol2: 0xd0d0d0,
        noEars: false,
        extra: {
          head: (pb) => {
            // surgical cap
            const [sx, sy] = HEAD.skull;
            pb.addShaded(blob(0.158 * hs, 0.13 * hs, 0.146 * hs, 14, 8, 0.04, 30), fabric(sc), 'cloth', { p: V((sx - 0.01) * hs, (sy + 0.05) * hs, 0) });
          },
          jaw: (pb) => {
            // mask pulled down under the chin
            pb.addShaded(blob(0.06 * hs, 0.055 * hs, 0.1 * hs, 10, 7), fabric(0x9ad0e8), 'cloth', { p: V(0.05 * hs, -0.07 * hs, 0) });
          },
          chest: (pb) => {
            // stethoscope around the neck
            const y = d.shY + 0.03;
            pb.add(torus(0.1, 0.008, 5, 20, Math.PI * 1.15), 0x101010, 'rubber', { p: V(0.0, y, 0), r: [Math.PI / 2, 0, -0.8] });
            pb.add(cyl(0.022, 0.022, 0.012, 12).rotateZ(Math.PI / 2), 0xc8ccd0, 'metal', { p: V(torsoFront(d, 0.14) + 0.01, 0.14, 0.06) });
            pb.add(box(0.004, 0.05, 0.03), 0x101010, 'rubber', { p: V(torsoFront(d, 0.2) + 0.006, 0.2, 0.06) });
            // pens in the chest pocket
            pb.add(box(0.006, 0.05, 0.05), new THREE.Color(sc).multiplyScalar(0.8), 'cloth', { p: V(torsoFront(d, 0.2) + 0.002, 0.2, -0.08) });
            pb.add(cyl(0.005, 0.005, 0.05, 6), 0xd02020, 'plastic', { p: V(torsoFront(d, 0.22) + 0.004, 0.24, -0.07) });
            pb.add(cyl(0.005, 0.005, 0.05, 6), 0x2040d0, 'plastic', { p: V(torsoFront(d, 0.22) + 0.004, 0.24, -0.09) });
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ PATIENT
    case 'patient': {
      const gown = stains(dots(0xaecbe0, 0x6a8ab0, 0.045, 0.18), 0x6a2a10, 0.12, 5, 4.4);
      const torso: ColorFn = (p, n) => (p.x < -0.04 && Math.abs(p.z) < 0.05 + (0.25 - p.y) * 0.08 && p.y < 0.28 ? skin(p, n) : gown(p, n));
      const hips: ColorFn = (p, n) => (p.x < -0.02 ? skin(p, n) : gown(p, n));
      dress = {
        torso,
        hips,
        upperArm: sleeve(gown, -0.11),
        foreArm: bands(skin, [[-d.fore + 0.03, -d.fore + 0.055, 0xf8f8f8]]),
        thigh: skin,
        shin: skin,
        legMat: 'skin',
        hand: skin,
        foot: 'bare',
        noseMissing: pal === 2,
        extra: {
          head: (pb) => {
            hairCap(pb, hs, [0x4a3a2a, 0x7a7a72, 0x2a1e16][look.tint % 3], { front: 0.08, bump: 0.18 });
            if (pal === 0) {
              // head bandage with a fresh stain
              const [sx, sy] = HEAD.skull;
              for (let i = 0; i < 3; i++) {
                const g = torus(0.152 * hs, 0.022 * hs, 6, 22);
                g.rotateX(Math.PI / 2);
                pb.addShaded(g, (p) => (p.x > 0.08 && p.z > 0.02 && i === 1 ? col(0x9a1414) : col(0xf4f2ea)), 'cloth', { p: V(sx * hs, (sy + 0.02 + i * 0.04) * hs, 0), r: [0.15 * (i - 1), 0, -0.25 + i * 0.12] });
              }
            }
          },
          chest: (pb) => {
            if (pal === 1) {
              // neck brace
              pb.addShaded(cyl(0.085, 0.1, 0.09, 14), fabric(0xeeeee6), 'plastic', { p: V(d.neckX * 0.8, d.neckY + 0.02, 0) });
            }
          },
          pelvis: (pb) => {
            // gown skirt, open at the back (yes, you can see it)
            const len = d.thigh * 0.75;
            const phi = Math.PI * 1.35;
            const g2 = new THREE.LatheGeometry(
              [new THREE.Vector2(d.hipsW * 1.25, -len), new THREE.Vector2(d.hipsW * 1.08, -0.06), new THREE.Vector2(d.hipsW * 1.0, 0.04)],
              16,
              Math.PI / 2 - phi / 2,
              phi,
            );
            g2.scale(0.8, 1, 1);
            pb.addShaded(g2, gown, 'cloth', {}, true);
            // inside faces (open gown): a second, slightly smaller flipped copy
            const g3 = g2.clone();
            g3.scale(0.97, 1, 0.97);
            const idx = g3.index!;
            for (let i = 0; i < idx.count; i += 3) {
              const a = idx.getX(i);
              idx.setX(i, idx.getX(i + 1));
              idx.setX(i + 1, a);
            }
            g3.computeVertexNormals();
            pb.addShaded(g3, (p, n) => gown(p, n).multiplyScalar(0.7), 'cloth', {}, true);
          },
        },
      };
      break;
    }
    // ------------------------------------------------------------------ RIOT
    case 'riot': {
      const navy = fabric(0x28324a, { fold: 0.35, noise: 0.08 });
      const quilt: ColorFn = (p, n) => {
        const c = navy(p, n);
        if (Math.abs(((p.y + 1) % 0.07) - 0.035) < 0.004) c.multiplyScalar(0.7);
        return c;
      };
      const black = 0x101216;
      dress = {
        torso: quilt,
        hips: navy,
        upperArm: quilt,
        foreArm: navy,
        thigh: navy,
        shin: navy,
        hand: fabric(black),
        handMat: 'rubber',
        foot: 'boot',
        footCol: 0x0c0c0e,
        footCol2: 0x050505,
        extra: {
          head: (pb) => {
            // buzz cut (visible once the helmet is shot off)
            hairCap(pb, hs, 0x2a2622, { front: 0.12, bump: 0.02 });
          },
          upperArmL: (pb) => pb.add(blob(0.1 * d.limb, 0.085 * d.limb, 0.09 * d.limb, 10, 7), black, 'plastic', { p: V(0, 0.0, 0.02) }),
          upperArmR: (pb) => pb.add(blob(0.1 * d.limb, 0.085 * d.limb, 0.09 * d.limb, 10, 7), black, 'plastic', { p: V(0, 0.0, -0.02) }),
          foreArmL: (pb) => pb.add(blob(0.05 * d.limb, 0.06 * d.limb, 0.055 * d.limb, 8, 6), black, 'plastic', { p: V(-0.035, 0.0, 0) }),
          foreArmR: (pb) => pb.add(blob(0.05 * d.limb, 0.06 * d.limb, 0.055 * d.limb, 8, 6), black, 'plastic', { p: V(-0.035, 0.0, 0) }),
          shinL: (pb) => {
            pb.add(roundBox(0.05, d.shin * 0.75, 0.11 * d.limb, 0.02), black, 'plastic', { p: V(0.065 * d.limb, -d.shin * 0.42, 0) });
            pb.add(blob(0.06, 0.07, 0.075, 8, 6), black, 'plastic', { p: V(0.06 * d.limb, 0.0, 0) });
          },
          shinR: (pb) => {
            pb.add(roundBox(0.05, d.shin * 0.75, 0.11 * d.limb, 0.02), black, 'plastic', { p: V(0.065 * d.limb, -d.shin * 0.42, 0) });
            pb.add(blob(0.06, 0.07, 0.075, 8, 6), black, 'plastic', { p: V(0.06 * d.limb, 0.0, 0) });
          },
          pelvis: (pb) => {
            // duty belt with pouches
            pb.add(cyl(d.hipsW * 1.04, d.hipsW * 1.04, 0.05, 18), black, 'plastic', { p: V(0, 0.08, 0), s: [d.hipsD / d.hipsW * 1.06, 1, 1] });
            for (const z of [0.12, -0.12, 0.0]) pb.add(roundBox(0.05, 0.07, 0.06, 0.012), 0x161a20, 'plastic', { p: V(z === 0 ? -d.hipsD - 0.01 : d.hipsD * 0.6, 0.06, z === 0 ? 0 : z * 1.25) });
          },
          handR: (pb) => {
            // baton
            pb.add(cyl(0.017, 0.02, 0.55, 10), 0x0a0a0c, 'rubber', { p: V(0.03, -0.09, 0), r: [0, 0, Math.PI / 2 - 0.25] });
            pb.add(cyl(0.012, 0.012, 0.12, 8), 0x0a0a0c, 'rubber', { p: V(-0.03, -0.12, 0.0), r: [Math.PI / 2, 0, 0] });
          },
        },
      };
      extras.plates = [
        {
          flag: 1,
          bone: 'head',
          build: (pb) => {
            const [sx, sy] = HEAD.skull;
            const S = (x: number, y: number, z: number): [number, number, number] => [x * hs, y * hs, z * hs];
            const shell = new THREE.SphereGeometry(0.19, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
            pb.addShaded(shell, (_p, n) => col(0x1a1e26).multiplyScalar(0.8 + Math.max(0, n.y) * 0.45 + Math.max(0, n.x) * 0.1), 'plastic', { p: S(sx - 0.005, sy - 0.01, 0), s: [hs * 1.02, hs * 1.05, hs] });
            pb.add(torus(0.19, 0.012, 5, 24), 0x0c0e12, 'rubber', { p: S(sx - 0.005, sy - 0.01 - 0.072, 0), r: [Math.PI / 2, 0, 0], s: [hs, hs, hs] });
            // white band with lettering
            pb.add(cyl(0.192 * hs, 0.192 * hs, 0.028 * hs, 24, true), 0xe8e8e8, 'plastic', { p: S(sx - 0.005, sy + 0.04, 0) });
            // visor (clear, tinted) in front of the face
            const visor = new THREE.SphereGeometry(0.205, 18, 8, -0.95, 1.9, Math.PI * 0.32, Math.PI * 0.36);
            visor.rotateY(Math.PI / 2);
            pb.add(visor, 0x9ab8d0, 'glass', { p: S(sx + 0.005, sy - 0.04, 0), s: [hs, hs, hs] });
            pb.add(box(0.03 * hs, 0.025 * hs, 0.32 * hs), 0x0c0e12, 'rubber', { p: S(sx + 0.13, sy + 0.08, 0), r: [0, 0, -0.5] });
            // neck guard
            pb.add(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 14, 1, true, Math.PI * 0.75, Math.PI * 0.5), 0x14161c, 'cloth', { p: S(sx - 0.01, sy - 0.12, 0), s: [hs, hs, hs] });
          },
        },
        {
          flag: 4,
          bone: 'chest',
          build: (pb) => {
            // armoured vest: front + back plates with shoulder straps and a POLICE band
            const y = 0.14;
            const fx = torsoFront(d, y);
            const bx = torsoBack(d, y);
            const w = torsoHalfW(d, y);
            pb.add(roundBox(0.05, 0.36, w * 1.9, 0.03), 0x15181e, 'plastic', { p: V(fx + 0.01, y, 0), r: [0, 0, -0.04] });
            pb.add(roundBox(0.05, 0.34, w * 1.9, 0.03), 0x15181e, 'plastic', { p: V(bx - 0.01, y + 0.01, 0), r: [0, 0, 0.06] });
            for (const s of [1, -1]) pb.add(roundBox(fx - bx + 0.07, 0.04, 0.07, 0.015), 0x15181e, 'plastic', { p: V((fx + bx) / 2, d.shY + 0.05, s * 0.12) });
            pb.add(box(0.012, 0.055, w * 1.7), 0xf2f2f2, 'plastic', { p: V(fx + 0.04, y + 0.06, 0) });
            // letters (blocks)
            for (let i = 0; i < 6; i++) pb.add(box(0.004, 0.034, 0.028), 0x101216, 'plastic', { p: V(fx + 0.047, y + 0.06, (2.5 - i) * 0.042) });
            pb.add(box(0.012, 0.055, w * 1.7), 0xf2f2f2, 'plastic', { p: V(bx - 0.04, y + 0.06, 0) });
          },
        },
        {
          flag: 2,
          bone: 'chest',
          // held out in front, turned toward the camera so its face reads from the side
          at: V(torsoFront(d, 0.0) + 0.3, 0.03, 0.1),
          rot: [0, -0.5, 0],
          build: (pb) => {
            // big curved polycarbonate shield
            const R = 0.8;
            const arc = 0.98;
            const H = 1.3;
            const g = new THREE.CylinderGeometry(R, R, H, 18, 1, true, -arc / 2, arc);
            // centre the arc on +X
            g.rotateY(Math.PI / 2);
            g.translate(-R, 0, 0);
            pb.add(g, 0xc0d8e8, 'glass');
            // rim
            const rimTop = new THREE.TorusGeometry(R, 0.018, 5, 16, arc);
            rimTop.rotateX(Math.PI / 2);
            rimTop.rotateY(arc / 2);
            rimTop.translate(-R, 0, 0);
            pb.add(rimTop.clone(), 0x101216, 'rubber', { p: V(0, H / 2, 0) });
            pb.add(rimTop, 0x101216, 'rubber', { p: V(0, -H / 2, 0) });
            for (const s of [1, -1]) {
              const a = (s * arc) / 2;
              pb.add(cyl(0.018, 0.018, H, 6), 0x101216, 'rubber', { p: V(-R + Math.cos(a) * R, 0, -Math.sin(a) * R) });
            }
            // white POLICE band across the middle
            const band = new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.09, 18, 1, true, -arc / 2 + 0.05, arc - 0.1);
            band.rotateY(Math.PI / 2);
            band.translate(-R, 0, 0);
            pb.add(band, 0xf4f4f4, 'plastic', { p: V(0, 0.28, 0) });
            for (let i = 0; i < 6; i++) {
              const a = ((i - 2.5) / 6) * (arc - 0.25);
              pb.add(box(0.006, 0.055, 0.045), 0x101216, 'plastic', { p: V(-R + Math.cos(a) * (R + 0.009), 0.28, -Math.sin(a) * (R + 0.009)), r: [0, a, 0] });
            }
            // handle (the brute's near hand holds it)
            pb.add(box(0.03, 0.14, 0.03), 0x101216, 'rubber', { p: V(-0.05, 0.0, -0.0) });
            pb.add(box(0.05, 0.02, 0.03), 0x101216, 'rubber', { p: V(-0.025, 0.07, -0.0) });
            pb.add(box(0.05, 0.02, 0.03), 0x101216, 'rubber', { p: V(-0.025, -0.07, -0.0) });
          },
        },
      ];
      break;
    }
    // ------------------------------------------------------------------ BIG DAVE
    case 'chef': {
      const white = stains(stains(fabric(0xf2f0e8, { fold: 0.28 }), 0x8a5a20, 0.28, 5, 1.1), 0x8a1010, 0.12, 7, 5.5);
      const torso: ColorFn = (p, n) => {
        // jacket gapes open over the belly (the apron hides it until he rips it off)
        if (p.x > 0.05 && p.y < 0.16 && Math.abs(p.z) < 0.08 + (0.16 - p.y) * 0.9) return veined(sp, 0x4a2c5a, 1, 7)(p, n);
        return white(p, n);
      };
      const trousers = check(0xe4e4e4, 0x2a2a2a, 0x141414, 0.028);
      dress = {
        torso,
        hips: trousers,
        upperArm: white,
        foreArm: sleeve(white, -0.06, 0.01),
        thigh: trousers,
        shin: trousers,
        hand: skin,
        belly: veined(sp, 0x3a1c4a, 1.1, 5),
        foot: 'clog',
        footCol: 0x161414,
        footCol2: 0x080808,
        extra: {
          head: (pb) => {
            const [sx, sy] = HEAD.skull;
            // tall pleated toque
            const prof: Array<[number, number]> = [[0.14, 0.0], [0.145, 0.08], [0.17, 0.2], [0.21, 0.32], [0.215, 0.37], [0.17, 0.41], [0.0, 0.42]];
            const t = lathe(prof, 22);
            const p = t.attributes.position;
            const v = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i);
              const a = Math.atan2(v.z, v.x);
              const k = 1 + 0.06 * Math.cos(a * 11) * Math.min(1, v.y / 0.2);
              p.setXYZ(i, v.x * k, v.y, v.z * k);
            }
            t.computeVertexNormals();
            pb.addShaded(t, fabric(0xf8f8f4, { fold: 0.3 }), 'cloth', { p: V(sx * hs, (sy + 0.08) * hs, 0), s: [hs, hs, hs], r: [0, 0, -0.1] });
            pb.addShaded(cyl(0.152 * hs, 0.155 * hs, 0.07 * hs, 22), fabric(0xeeeee8), 'cloth', { p: V(sx * hs, (sy + 0.07) * hs, 0), r: [0, 0, -0.1] });
            // huge curly moustache + bushy brows
            for (const s of [1, -1]) {
              pb.add(blob(0.03 * hs, 0.022 * hs, 0.06 * hs, 8, 6), 0x161210, 'fur', { p: V(0.16 * hs, 0.125 * hs, s * 0.045 * hs), r: [s * 0.4, 0, 0] });
              pb.add(torus(0.02 * hs, 0.009 * hs, 5, 10, Math.PI * 1.3), 0x161210, 'fur', { p: V(0.15 * hs, 0.135 * hs, s * 0.105 * hs), r: [0, 0, s > 0 ? 1.4 : -1.4] });
              pb.add(blob(0.022 * hs, 0.016 * hs, 0.05 * hs, 6, 5), 0x161210, 'fur', { p: V(0.14 * hs, 0.23 * hs, s * 0.055 * hs), r: [s * -0.3, 0, 0] });
            }
          },
          chest: (pb) => {
            // double-breasted buttons + red neckerchief
            buttons(pb, d, [0.2, 0.27, 0.33], 0.09, 0xd8d4c8, 0.016);
            buttons(pb, d, [0.2, 0.27, 0.33], -0.09, 0xd8d4c8, 0.016);
            const y = d.neckY - 0.06;
            pb.add(torus(0.075, 0.025, 6, 16), 0xc81e1e, 'cloth', { p: V(d.neckX * 0.8, y, 0), r: [Math.PI / 2, 0, 0.3] });
            pb.add(blob(0.03, 0.06, 0.04, 8, 6), 0xc81e1e, 'cloth', { p: V(torsoFront(d, y - 0.06) + 0.01, y - 0.06, 0.02) });
          },
          foreArmL: (pb) => {
            // MUM tattoo: a little red heart on the near forearm
            for (const s2 of [1, -1]) pb.add(blob(0.018, 0.018, 0.006, 6, 4), 0xa01a2a, 'skin', { p: V(0.012 * s2, -0.1, 0.07 * d.limb) });
            pb.add(cone(0.026, 0.03, 4), 0xa01a2a, 'skin', { p: V(0, -0.126, 0.068 * d.limb), r: [0, 0, Math.PI], s: [1, 1, 0.25] });
          },
        },
      };
      extras.apron = (pb) => {
        // cream apron: a skirt hugging the front of the belly down to the knees, a bib
        // on the chest, neck strap and a pocket with a ladle; stained
        const apronFn = stains(stains(fabric(0xf0e8d0, { fold: 0.35, noise: 0.08 }), 0x7a4a18, 0.3, 4, 2.2), 0x7a0c0c, 0.2, 6, 9.1);
        const bx = 0.06 * d.belly + 0.05; // belly centre (pelvis space)
        const by = 0.06 - 0.02;
        const rx = d.waistD * 1.32 + 0.03;
        const ry = d.waistD * 1.18;
        const rz = d.waistW * 1.12 + 0.03;
        const pts: THREE.Vector2[] = [];
        const yb = -d.thigh * 0.9;
        for (let i = 0; i <= 12; i++) {
          const y = yb + (i / 12) * (by + ry * 0.55 - yb);
          const t = (y - by) / ry;
          const r = Math.max(Math.abs(t) < 1 ? rz * Math.sqrt(1 - t * t) : 0, d.hipsW * 1.3);
          pts.push(new THREE.Vector2(r, y));
        }
        const arc = Math.PI * 1.3;
        const g = new THREE.LatheGeometry(pts, 20, Math.PI / 2 - arc / 2, arc);
        g.scale(rx / rz, 1, 1);
        pb.addShaded(g, apronFn, 'cloth', { p: V(bx, 0, 0) }, true);
        const back = g.clone();
        back.scale(0.985, 1, 0.985);
        const idx = back.index!;
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i);
          idx.setX(i, idx.getX(i + 1));
          idx.setX(i + 1, a);
        }
        back.computeVertexNormals();
        pb.addShaded(back, (p, n) => apronFn(p, n).multiplyScalar(0.72), 'cloth', { p: V(bx, 0, 0) }, true);
        // bib: from the top of the belly up the chest, tilted back
        const yTop = d.chestY + d.shY - 0.04;
        const y0 = by + ry * 0.5;
        const x0 = bx + rx * 0.8;
        const x1 = torsoFront(d, yTop - d.chestY) + 0.02;
        const len = Math.hypot(x0 - x1, yTop - y0);
        pb.addShaded(roundBox(0.025, len + 0.04, 0.34, 0.01), apronFn, 'cloth', { p: V((x0 + x1) / 2, (y0 + yTop) / 2, 0), r: [0, 0, Math.atan2(x0 - x1, yTop - y0)] }, true);
        // neck strap
        for (const s2 of [1, -1]) pb.add(box(0.02, 0.2, 0.022), 0xe8e0c8, 'cloth', { p: V(x1 - 0.06, yTop + 0.06, s2 * 0.12), r: [s2 * 0.35, 0, 0.6] });
        // pocket with a ladle
        const py = by - ry * 0.55;
        const px = bx + rx * Math.sqrt(1 - 0.55 * 0.55) + 0.012;
        pb.add(box(0.012, 0.13, 0.2), 0xe2d8bc, 'cloth', { p: V(px, py, 0.05), r: [0, 0, -0.5] });
        pb.add(cyl(0.012, 0.012, 0.34, 6), 0xb8bcc0, 'metal', { p: V(px - 0.02, py + 0.13, 0.11), r: [0.2, 0, 0.35] });
        pb.add(blob(0.05, 0.022, 0.05, 8, 5), 0xb8bcc0, 'metal', { p: V(px + 0.04, py - 0.04, 0.08) });
      };
      break;
    }
  }
  const hat =
    look.outfit === 'chef' ? 0.45
    : look.outfit === 'fisherman' || look.outfit === 'lifeguard' ? 0.03
    : look.outfit === 'tourist' ? (pal === 0 ? 0.05 : 0)
    : look.outfit === 'bloater' ? (pal !== 2 ? 0.05 : 0)
    : look.outfit === 'granny' || (look.outfit === 'patient' && pal === 0) ? 0.02
    : 0;
  return { dress, extras, hat };
}
