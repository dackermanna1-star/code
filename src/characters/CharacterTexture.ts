import * as THREE from 'three';
import { Rng, clamp } from '../core/math';
import { type Appearance, shade } from './Appearance';
import { P, F, PART_COUNT, type RigDims } from './Rig';

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Expression = 'neutral' | 'happy' | 'angry' | 'pain' | 'shock' | 'dead' | 'drunk' | 'scared' | 'laugh' | 'ko';

export const ATLAS_SIZE = 256;
const BODY_DENSITY = 42; // px per meter
const FACE_RES = 96;
const HEAD_SIDE_RES = 32;
const PALETTE = { x: 96, y: 32, cell: 4 };

/** Gore palette: 8 rows x 8 columns of 4px color cells. */
const FLESH_ROWS: string[][] = [
  ['#d01a1c', '#c4161a', '#b81418', '#dc2224', '#c81c1e', '#b01014', '#d42020', '#be1818'],
  ['#9e0e12', '#a81216', '#920c10', '#b01418', '#980e12', '#8a0a0e', '#a40f13', '#960d11'],
  ['#760a0d', '#6c080b', '#80090d', '#64070a', '#7a0b0e', '#70090c', '#5e0609', '#84090d'],
  ['#e04848', '#d63c40', '#e85454', '#cc3438', '#da4246', '#e65050', '#d03a3e', '#de4a4a'],
  ['#e88a9a', '#d87888', '#f09aa8', '#e08090', '#c86878', '#ec92a0', '#d47284', '#e48696'],
  ['#b85a78', '#a84e6a', '#c46484', '#9c4462', '#b05672', '#bc5e7c', '#a24a66', '#b6587a'],
  ['#ece2d0', '#e2d6c2', '#f2eadc', '#d8ccb6', '#e8decc', '#efe6d6', '#dcd0bc', '#e6dac8'],
  ['#480407', '#3c0306', '#520508', '#340205', '#4c0407', '#420306', '#380205', '#4e0508'],
];

export const FLESH = { BRIGHT: 0, MID: 1, DARK: 2, LIGHT: 3, PINK: 4, BRAIN: 5, BONE: 6, DEEP: 7 } as const;

export class CharacterAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly regions: Region[][] = [];
  expression: Expression = 'neutral';
  private rng: Rng;
  dirty = false;
  bloodiness = 0;
  /** per-face blood coverage counters to limit overdraw */
  private faceSnapshot: ImageData | null = null;
  private faceBloodLayer: { x: number; y: number; c: string; s: number }[] = [];

  constructor(
    public rig: RigDims,
    public app: Appearance,
  ) {
    this.rng = new Rng(app.seed * 7 + 3);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS_SIZE;
    this.g = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.g.imageSmoothingEnabled = false;
    this.layout();
    this.paintAll();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
  }

  dispose(): void {
    this.texture.dispose();
  }

  // ------------------------------------------------------------ layout
  private layout(): void {
    for (let i = 0; i < PART_COUNT; i++) this.regions[i] = [];
    const head = this.regions[P.HEAD];
    head[F.PZ] = { x: 0, y: 0, w: FACE_RES, h: FACE_RES };
    head[F.NZ] = { x: 96, y: 0, w: HEAD_SIDE_RES, h: HEAD_SIDE_RES };
    head[F.PX] = { x: 128, y: 0, w: HEAD_SIDE_RES, h: HEAD_SIDE_RES };
    head[F.NX] = { x: 160, y: 0, w: HEAD_SIDE_RES, h: HEAD_SIDE_RES };
    head[F.PY] = { x: 192, y: 0, w: HEAD_SIDE_RES, h: HEAD_SIDE_RES };
    head[F.NY] = { x: 224, y: 0, w: HEAD_SIDE_RES, h: HEAD_SIDE_RES };

    // shelf-pack all body part faces
    type Item = { part: number; face: number; w: number; h: number };
    const items: Item[] = [];
    for (let p = 0; p < PART_COUNT; p++) {
      if (p === P.HEAD) continue;
      const s = this.rig.size[p];
      const W = Math.max(3, Math.round(s.x * BODY_DENSITY));
      const H = Math.max(3, Math.round(s.y * BODY_DENSITY));
      const D = Math.max(3, Math.round(s.z * BODY_DENSITY));
      items.push({ part: p, face: F.PZ, w: W, h: H });
      items.push({ part: p, face: F.NZ, w: W, h: H });
      items.push({ part: p, face: F.PX, w: D, h: H });
      items.push({ part: p, face: F.NX, w: D, h: H });
      items.push({ part: p, face: F.PY, w: W, h: D });
      items.push({ part: p, face: F.NY, w: W, h: D });
    }
    items.sort((a, b) => b.h - a.h);
    // free areas: right of the face below head row (x 128..256, y 32..96) then full rows below y=96
    const shelves: { x0: number; x1: number; y: number; h: number; cx: number }[] = [];
    let cursorY = 96;
    const pad = 1;
    const area2 = { x0: 128 + pad, x1: 256, y: 32 + pad, maxY: 96 };
    let a2x = area2.x0;
    let a2y = area2.y;
    let a2h = 0;
    for (const it of items) {
      // try area 2 first for small items
      if (it.h <= 20) {
        if (a2x + it.w + pad > area2.x1) {
          a2x = area2.x0;
          a2y += a2h + pad;
          a2h = 0;
        }
        if (a2y + it.h + pad <= area2.maxY) {
          this.regions[it.part][it.face] = { x: a2x, y: a2y, w: it.w, h: it.h };
          a2x += it.w + pad;
          a2h = Math.max(a2h, it.h);
          continue;
        }
      }
      let placed = false;
      for (const sh of shelves) {
        if (it.h <= sh.h && sh.cx + it.w + pad <= sh.x1) {
          this.regions[it.part][it.face] = { x: sh.cx, y: sh.y, w: it.w, h: it.h };
          sh.cx += it.w + pad;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const sh = { x0: pad, x1: 256, y: cursorY + pad, h: it.h, cx: pad };
        cursorY += it.h + pad;
        shelves.push(sh);
        this.regions[it.part][it.face] = { x: sh.cx, y: sh.y, w: it.w, h: it.h };
        sh.cx += it.w + pad;
      }
    }
    if (cursorY > 256) console.warn('character atlas overflow', cursorY);
  }

  /** UV (0..1, flipY=false) for normalized face coords. */
  uv(part: number, face: number, s: number, t: number, out: { u: number; v: number }): void {
    const r = this.regions[part][face];
    out.u = (r.x + s * r.w) / ATLAS_SIZE;
    out.v = (r.y + t * r.h) / ATLAS_SIZE;
  }

  /** UV of the center of a gore palette cell. */
  fleshUV(row: number, col: number, out: { u: number; v: number }): void {
    out.u = (PALETTE.x + col * PALETTE.cell + PALETTE.cell / 2) / ATLAS_SIZE;
    out.v = (PALETTE.y + row * PALETTE.cell + PALETTE.cell / 2) / ATLAS_SIZE;
  }

  // ------------------------------------------------------------ painting helpers
  private px(x: number, y: number, c: string, w = 1, h = 1): void {
    this.g.fillStyle = c;
    this.g.fillRect(x, y, w, h);
  }

  private fillRegion(r: Region, c: string, padOut = true): void {
    this.g.fillStyle = c;
    if (padOut) this.g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    else this.g.fillRect(r.x, r.y, r.w, r.h);
  }

  /** Fill region rows [t0,t1) (normalized) with a color. */
  private band(r: Region, t0: number, t1: number, c: string, s0 = 0, s1 = 1): void {
    const y0 = r.y + Math.round(t0 * r.h);
    const y1 = r.y + Math.round(t1 * r.h);
    const x0 = r.x + Math.round(s0 * r.w);
    const x1 = r.x + Math.round(s1 * r.w);
    if (y1 > y0 && x1 > x0) this.px(x0, y0, c, x1 - x0, y1 - y0);
  }

  private noise(r: Region, colors: string[], density: number): void {
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) if (this.rng.next() < density) this.px(r.x + x, r.y + y, this.rng.pick(colors));
  }

  // ------------------------------------------------------------ main paint
  paintAll(): void {
    const g = this.g;
    g.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    g.fillStyle = this.app.skin;
    g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    this.paintPalette();
    this.paintBody();
    this.paintHeadSides();
    this.drawFace(this.expression);
  }

  private paintPalette(): void {
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        this.px(PALETTE.x + col * PALETTE.cell, PALETTE.y + row * PALETTE.cell, FLESH_ROWS[row][col], PALETTE.cell, PALETTE.cell);
  }

  private paintBody(): void {
    const a = this.app;
    const R = this.regions;
    const skin = a.skin;
    const skinD = a.skinShade;
    const top = a.topColor;
    const topD = shade(top, -0.25);
    const topL = shade(top, 0.15);

    // ---------------- torso
    const sleeveType = this.sleeves();
    for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY, F.NY]) {
      const r = R[P.TORSO][f];
      this.fillRegion(r, top);
      // subtle cloth noise
      this.noise(r, [shade(top, -0.08), shade(top, 0.06)], 0.05);
      if (f !== F.PY && f !== F.NY) this.band(r, 0.92, 1, topD); // hem shadow
    }
    const front = R[P.TORSO][F.PZ];
    const back = R[P.TORSO][F.NZ];
    const tTop = R[P.TORSO][F.PY];
    switch (a.top) {
      case 'tshirt':
      case 'security':
      case 'crop':
      case 'blouse': {
        // round collar
        const cx = front.x + Math.floor(front.w / 2);
        this.px(cx - 2, front.y, skin, 4, 1);
        this.px(cx - 1, front.y + 1, skin, 2, 1);
        this.px(cx - 3, front.y, topD, 1, 2);
        this.px(cx + 2, front.y, topD, 1, 2);
        this.band(tTop, 0.25, 0.75, skin, 0.38, 0.62);
        if (a.top === 'tshirt') this.paintPrint(front, a.print);
        if (a.top === 'security') {
          this.paintText(back, 'SECURITY', a.topColor2, 0.22);
          this.px(front.x + front.w - 6, front.y + 3, a.topColor2, 3, 1);
        }
        if (a.top === 'crop') {
          this.band(front, 0.55, 1, skin);
          this.band(back, 0.55, 1, skin);
          this.band(R[P.TORSO][F.PX], 0.55, 1, skin);
          this.band(R[P.TORSO][F.NX], 0.55, 1, skin);
          this.px(front.x + Math.floor(front.w / 2), front.y + Math.round(front.h * 0.75), skinD, 1, 1);
        }
        if (a.top === 'blouse') {
          this.px(cx - 3, front.y, a.topColor2, 2, 2);
          this.px(cx + 1, front.y, a.topColor2, 2, 2);
          for (let y = 3; y < front.h - 2; y += 3) this.px(cx, front.y + y, shade(top, -0.4));
        }
        break;
      }
      case 'tank': {
        for (const f of [F.PZ, F.NZ]) {
          const r = R[P.TORSO][f];
          this.band(r, 0, 0.3, skin, 0, 0.22);
          this.band(r, 0, 0.3, skin, 0.78, 1);
          this.band(r, 0, 0.12, skin, 0.3, 0.7);
        }
        this.band(R[P.TORSO][F.PX], 0, 0.35, skin);
        this.band(R[P.TORSO][F.NX], 0, 0.35, skin);
        this.band(tTop, 0, 1, skin);
        this.band(tTop, 0, 1, top, 0.25, 0.32);
        this.band(tTop, 0, 1, top, 0.68, 0.75);
        break;
      }
      case 'longsleeve':
      case 'hoodie': {
        const cx = front.x + Math.floor(front.w / 2);
        this.px(cx - 2, front.y, skin, 4, 1);
        if (a.top === 'hoodie') {
          this.band(front, 0.55, 0.85, topD, 0.25, 0.75);
          this.band(front, 0.56, 0.84, top, 0.28, 0.72);
          this.px(cx - 2, front.y + 1, '#ddd', 1, 4);
          this.px(cx + 1, front.y + 1, '#ddd', 1, 4);
          this.band(back, 0, 0.22, topD, 0.15, 0.85);
        }
        break;
      }
      case 'flannel': {
        for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY]) this.paintPlaid(R[P.TORSO][f], top, a.topColor2);
        const cx = front.x + Math.floor(front.w / 2);
        for (let y = 2; y < front.h; y += 3) this.px(cx, front.y + y, '#e8e0d0');
        this.px(cx - 2, front.y, skin, 4, 1);
        break;
      }
      case 'hawaiian': {
        for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY]) {
          const r = R[P.TORSO][f];
          for (let i = 0; i < (r.w * r.h) / 9; i++) {
            const x = r.x + this.rng.int(0, r.w - 2);
            const y = r.y + this.rng.int(0, r.h - 2);
            const c = this.rng.pick([a.topColor2, '#f4f0e0', '#e04060', '#f0c030']);
            this.px(x, y, c, 2, 1);
            this.px(x, y + 1, c, 1, 1);
          }
        }
        const cx = front.x + Math.floor(front.w / 2);
        this.px(cx - 2, front.y, skin, 4, 2);
        this.px(cx - 1, front.y + 2, skin, 2, 1);
        break;
      }
      case 'leather':
      case 'suit': {
        // open jacket showing shirt
        const inner = a.top === 'suit' ? '#efece4' : a.topColor2;
        const cx = front.x + Math.floor(front.w / 2);
        const w2 = Math.max(2, Math.round(front.w * 0.18));
        this.px(cx - w2, front.y, inner, w2 * 2, front.h - 1);
        // lapels
        for (let y = 0; y < Math.round(front.h * 0.45); y++) {
          const k = Math.round((y / (front.h * 0.45)) * w2);
          this.px(cx - w2 - 1 + k, front.y + y, topL);
          this.px(cx + w2 - k, front.y + y, topL);
        }
        if (a.top === 'suit') {
          this.px(cx - 1, front.y + 1, a.topColor2, 2, Math.round(front.h * 0.7));
          this.px(cx - 1, front.y, shade(a.topColor2, -0.3), 2, 1);
        } else {
          // zipper + studs
          this.px(cx - w2 - 1, front.y, '#9a9a9a', 1, front.h);
          for (let y = 3; y < front.h; y += 4) this.px(front.x + 2, front.y + y, '#b8b8b8');
          this.paintBackPatch(back, a.style === 'boss' ? '#c01818' : '#d8d4c8');
        }
        break;
      }
      case 'vest': {
        // vest panels over bare chest or shirt
        const under = this.rng.chance(0.5) ? skin : a.topColor2;
        for (const f of [F.PZ]) {
          const r = R[P.TORSO][f];
          const cx = r.x + Math.floor(r.w / 2);
          const w2 = Math.max(2, Math.round(r.w * 0.22));
          this.px(cx - w2, r.y, under, w2 * 2, r.h);
          if (under === skin) {
            this.px(cx - w2 + 1, r.y + Math.round(r.h * 0.3), skinD, w2 * 2 - 2, 1);
            this.px(cx, r.y + Math.round(r.h * 0.45), skinD, 1, Math.round(r.h * 0.3));
          }
          this.px(cx - w2 - 1, r.y, '#b0a070', 1, r.h);
          this.px(cx + w2, r.y, '#b0a070', 1, r.h);
        }
        // sides: arm holes
        this.band(R[P.TORSO][F.PX], 0, 0.3, under);
        this.band(R[P.TORSO][F.NX], 0, 0.3, under);
        this.band(tTop, 0, 1, under, 0, 0.22);
        this.band(tTop, 0, 1, under, 0.78, 1);
        this.paintBackPatch(back, '#d8d4c8');
        break;
      }
      case 'apron': {
        const ap = a.topColor2;
        this.band(front, 0.22, 1, ap, 0.12, 0.88);
        this.band(front, 0, 0.22, ap, 0.3, 0.7);
        this.band(R[P.TORSO][F.PX], 0.55, 0.62, ap);
        this.band(R[P.TORSO][F.NX], 0.55, 0.62, ap);
        this.band(back, 0.55, 0.62, ap);
        for (let i = 0; i < 6; i++) {
          this.px(front.x + this.rng.int(3, front.w - 4), front.y + this.rng.int(4, front.h - 2), this.rng.pick(['#a83a2a', '#8a6a3a', '#c8b89a']));
        }
        break;
      }
      case 'bartender': {
        const cx = front.x + Math.floor(front.w / 2);
        const vest = a.topColor2;
        this.band(front, 0.12, 1, vest, 0, 0.36);
        this.band(front, 0.12, 1, vest, 0.64, 1);
        this.band(back, 0.1, 1, vest);
        this.band(R[P.TORSO][F.PX], 0.15, 1, vest);
        this.band(R[P.TORSO][F.NX], 0.15, 1, vest);
        // bow tie
        this.px(cx - 2, front.y + 1, '#1a1a1a', 4, 2);
        this.px(cx, front.y + 1, '#2a2a2a', 1, 2);
        for (let y = 4; y < front.h; y += 3) this.px(cx, front.y + y, '#cfcac0');
        break;
      }
    }

    // ---------------- pelvis / legs
    const pants = a.bottomColor;
    const pantsD = shade(pants, -0.22);
    const pantsL = shade(pants, 0.16);
    for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY, F.NY]) {
      const r = R[P.PELVIS][f];
      this.fillRegion(r, a.bottom === 'skirt' ? pants : pants);
      if (a.bottom === 'jeans') this.noise(r, [shade(pants, -0.12), shade(pants, 0.1)], 0.1);
    }
    if (a.belt && a.bottom !== 'skirt') {
      for (const f of [F.PZ, F.NZ, F.PX, F.NX]) this.band(R[P.PELVIS][f], 0, 0.3, '#2a1c12');
      const r = R[P.PELVIS][F.PZ];
      this.px(r.x + Math.floor(r.w / 2) - 1, r.y, '#d8b040', 3, 2);
    }
    if (a.top === 'crop' || a.top === 'tank') {
      // nothing
    }
    for (const side of [0, 1]) {
      const thigh = side === 0 ? P.THIGH_L : P.THIGH_R;
      const shin = side === 0 ? P.SHIN_L : P.SHIN_R;
      for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY, F.NY]) {
        const rt = R[thigh][f];
        const rs = R[shin][f];
        this.fillRegion(rt, pants);
        this.fillRegion(rs, pants);
        if (a.bottom === 'jeans') {
          this.noise(rt, [shade(pants, -0.12), shade(pants, 0.1)], 0.12);
          this.noise(rs, [shade(pants, -0.12), shade(pants, 0.1)], 0.12);
          if (f === F.PX || f === F.NX) {
            const sx = rt.x + Math.floor(rt.w / 2);
            this.px(sx, rt.y, '#c8a060', 1, rt.h);
            this.px(rs.x + Math.floor(rs.w / 2), rs.y, '#c8a060', 1, rs.h);
          }
        }
        if (a.bottom === 'shorts') {
          this.band(rt, 0.55, 1, skin);
          this.fillRegion(rs, skin);
        }
        if (a.bottom === 'skirt') {
          this.band(rt, 0.35, 1, skin);
          this.fillRegion(rs, skin);
        }
        if (a.bottom === 'chef') {
          // houndstooth chef pants
          const hc = shade(pants, 0.35);
          for (let y = 0; y < rt.h; y += 2) for (let x = (y / 2) % 2; x < rt.w; x += 2) this.px(rt.x + x, rt.y + y, hc);
          for (let y = 0; y < rs.h; y += 2) for (let x = (y / 2) % 2; x < rs.w; x += 2) this.px(rs.x + x, rs.y + y, hc);
        }
        // shoes on the lower part of the shin
        if (f !== F.PY) {
          if (f === F.NY) this.fillRegion(rs, shade(a.shoeColor, -0.3));
          else {
            this.band(rs, 0.8, 1, a.shoeColor);
            this.band(rs, 0.94, 1, shade(a.shoeColor, a.shoeColor === '#e8e4dc' ? -0.3 : 0.25));
            if (f === F.PZ) this.band(rs, 0.8, 0.84, shade(a.shoeColor, 0.15), 0.2, 0.8);
          }
        }
        if (a.bottom === 'jeans' && f === F.PZ) this.band(rs, 0.76, 0.8, pantsD);
      }
    }

    // ---------------- arms
    for (const side of [0, 1]) {
      const ua = side === 0 ? P.UARM_L : P.UARM_R;
      const la = side === 0 ? P.LARM_L : P.LARM_R;
      for (const f of [F.PZ, F.NZ, F.PX, F.NX, F.PY, F.NY]) {
        const ru = R[ua][f];
        const rl = R[la][f];
        this.fillRegion(ru, skin);
        this.fillRegion(rl, skin);
        let sleeveColor = top;
        if (a.top === 'apron') sleeveColor = a.topColor;
        if (a.top === 'bartender') sleeveColor = a.topColor;
        if (a.top === 'flannel') this.paintPlaid(ru, top, a.topColor2);
        if (sleeveType === 'short') {
          if (a.top !== 'flannel') this.band(ru, 0, 0.55, sleeveColor);
          else this.band(ru, 0.55, 1, skin);
          this.band(ru, 0.5, 0.55, shade(sleeveColor, -0.25));
        } else if (sleeveType === 'long') {
          if (a.top !== 'flannel') this.fillRegion(ru, sleeveColor);
          this.fillRegion(rl, sleeveColor);
          if (a.top === 'flannel') this.paintPlaid(rl, top, a.topColor2);
          this.band(rl, 0.66, 0.72, shade(sleeveColor, -0.25));
          this.band(rl, 0.72, 1, skin);
        } else if (sleeveType === 'none') {
          if (f === F.PY) this.fillRegion(ru, a.top === 'vest' ? top : skin);
        }
        if (f === F.PY && sleeveType !== 'none') this.fillRegion(ru, sleeveColor);
        // hand details (bottom 28% of lower arm)
        if (f === F.NY) this.fillRegion(rl, shade(skin, -0.08));
        else {
          const hy = rl.y + Math.round(rl.h * 0.72);
          this.px(rl.x, hy, shade(skin, -0.06), rl.w, rl.h - Math.round(rl.h * 0.72));
          if (f === F.PZ || f === F.NZ) {
            // finger lines
            for (let k = 1; k < 4; k++) {
              const fx = rl.x + Math.round((rl.w * k) / 4);
              this.px(fx, rl.y + rl.h - 3, skinD, 1, 3);
            }
          }
        }
      }
      // tattoos on exposed skin
      if (a.tattoos > 0 && sleeveType !== 'long') {
        const parts = sleeveType === 'none' ? [ua, la] : [la];
        for (const pi of parts) {
          for (const f of [F.PZ, F.PX, F.NX, F.NZ]) {
            const r = R[pi][f];
            const n = Math.round(a.tattoos * r.w * r.h * 0.12);
            const t0 = pi === ua && sleeveType === 'short' ? 0.6 : 0.05;
            for (let i = 0; i < n; i++) {
              const x = r.x + this.rng.int(0, r.w - 1);
              const y = r.y + this.rng.int(Math.round(r.h * t0), Math.round(r.h * (pi === la ? 0.66 : 0.95)));
              this.px(x, y, this.rng.chance(0.15) ? '#a82a2a' : a.tattooColor);
            }
          }
        }
      }
    }
  }

  private sleeves(): 'short' | 'long' | 'none' {
    switch (this.app.top) {
      case 'tank':
      case 'vest':
        return 'none';
      case 'longsleeve':
      case 'flannel':
      case 'leather':
      case 'hoodie':
      case 'suit':
        return 'long';
      case 'bartender':
      case 'apron':
        return this.rng.chance(0.5) ? 'long' : 'short';
      default:
        return 'short';
    }
  }

  private paintPlaid(r: Region, c1: string, c2: string): void {
    const d1 = shade(c1, -0.3);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const bx = x % 4 < 2;
        const by = y % 4 < 2;
        let c = c1;
        if (bx && by) c = d1;
        else if (bx || by) c = shade(c1, -0.12);
        if (x % 4 === 3 || y % 4 === 3) c = c2;
        this.px(r.x + x, r.y + y, c);
      }
  }

  private paintPrint(r: Region, id: number): void {
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h * 0.42);
    const c = shade(this.app.topColor, this.app.topColor === '#1b1b1f' ? 0.75 : -0.45);
    const accent = '#e8c040';
    const shapes: string[][] = [
      // skull
      [' xxx ', 'x.x.x', 'xxxxx', ' x.x '],
      // beer mug
      ['xxx  ', 'x.x x', 'x.xx ', 'xxx  '],
      // star
      ['  x  ', ' xxx ', 'xxxxx', ' x x '],
      // stripes
      ['xxxxx', '     ', 'xxxxx', '     '],
      // heart
      [' x x ', 'xxxxx', ' xxx ', '  x  '],
      // number 7
      ['xxxx', '   x', '  x ', ' x  '],
    ];
    const sh = shapes[id % shapes.length];
    const ox = cx - Math.floor(sh[0].length / 2);
    for (let y = 0; y < sh.length; y++)
      for (let x = 0; x < sh[y].length; x++) {
        const ch = sh[y][x];
        if (ch === 'x') this.px(ox + x, cy + y - 1, c);
        else if (ch === '.') this.px(ox + x, cy + y - 1, id === 1 ? accent : this.app.topColor);
      }
  }

  private paintBackPatch(r: Region, c: string): void {
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h * 0.45);
    // winged skull patch
    const sk = ['  xxx  ', ' x.x.x ', 'xxxxxxx', '  x.x  '];
    for (let y = 0; y < sk.length; y++)
      for (let x = 0; x < sk[y].length; x++) {
        const ch = sk[y][x];
        if (ch === 'x') this.px(cx - 3 + x, cy - 2 + y, c);
        else if (ch === '.') this.px(cx - 3 + x, cy - 2 + y, '#141414');
      }
    // rocker text bars
    this.px(cx - Math.floor(r.w * 0.38), r.y + 2, '#c8a020', Math.round(r.w * 0.76), 2);
    this.px(cx - Math.floor(r.w * 0.3), cy + 4, '#c8a020', Math.round(r.w * 0.6), 1);
  }

  private paintText(r: Region, _text: string, c: string, t: number): void {
    // tiny pseudo-text: blocky letters 2px wide
    const y = r.y + Math.round(r.h * t);
    const n = Math.floor((r.w - 2) / 2);
    for (let i = 0; i < n; i++) {
      const x = r.x + 1 + i * 2;
      this.px(x, y, c, 1, 3);
      if (i % 2 === 0) this.px(x, y, c, 1, 1);
    }
  }

  // ------------------------------------------------------------ head (non-front faces)
  private paintHeadSides(): void {
    const a = this.app;
    const R = this.regions[P.HEAD];
    const hair = a.hairColor;
    const hairD = shade(hair, -0.25);
    const hairL = shade(hair, 0.15);
    const skin = a.skin;
    const skinD = a.skinShade;
    const st = a.hairStyle;

    // sides (+X = char's left: s=0 front edge; -X: s=1 front edge)
    for (const f of [F.PX, F.NX]) {
      const r = R[f];
      this.fillRegion(r, skin);
      const frontS = f === F.PX ? 0 : 1;
      const sAt = (s: number) => (frontS === 0 ? s : 1 - s); // s measured from front edge
      const bandS = (t0: number, t1: number, s0: number, s1: number, c: string) => {
        const a0 = sAt(s0);
        const a1 = sAt(s1);
        this.band(r, t0, t1, c, Math.min(a0, a1), Math.max(a0, a1));
      };
      // ear
      bandS(0.42, 0.66, 0.48, 0.64, skinD);
      bandS(0.46, 0.62, 0.52, 0.6, shade(skin, -0.3));
      // hair
      if (st !== 'bald') {
        let hairBottom = 0.3;
        let backBottom = 0.75;
        if (st === 'long' || st === 'bob' || st === 'afro' || st === 'mullet') {
          hairBottom = st === 'afro' ? 0.5 : 0.35;
          backBottom = st === 'long' || st === 'mullet' ? 1 : st === 'bob' ? 0.8 : 0.85;
        }
        if (st === 'buzz') {
          for (let y = 0; y < r.h * 0.6; y++)
            for (let x = 0; x < r.w; x++) if (this.rng.next() < 0.45) this.px(r.x + x, r.y + y, hairD);
        } else if (st === 'mohawk') {
          bandS(0, 0.12, 0.1, 1, hair);
          for (let y = 0; y < r.h * 0.5; y++)
            for (let x = 0; x < r.w; x++) if (this.rng.next() < 0.2) this.px(r.x + x, r.y + y, shade(skin, -0.15));
        } else if (st === 'balding') {
          bandS(0.25, 0.55, 0.3, 1, hair);
          bandS(0.25, 0.55, 0.3, 0.48, skin);
        } else {
          bandS(0, hairBottom, 0.1, 1, hair);
          bandS(0, backBottom, 0.55, 1, hair);
          bandS(hairBottom - 0.06, hairBottom, 0.1, 0.4, hairD);
          if (st === 'long' || st === 'bob') bandS(0.3, backBottom, 0.66, 1, hair);
          // re-draw ear over hair for short styles
          if (st !== 'long' && st !== 'afro' && st !== 'bob') {
            bandS(0.42, 0.66, 0.48, 0.64, skinD);
            bandS(0.46, 0.62, 0.52, 0.6, shade(skin, -0.3));
          }
        }
        this.noise(r, [], 0);
        for (let i = 0; i < 6; i++) {
          const x = r.x + this.rng.int(0, r.w - 1);
          const y = r.y + this.rng.int(0, Math.round(r.h * 0.25));
          this.px(x, y, hairL);
        }
      }
      // sideburns / beard
      const fh = a.facialHair;
      const beardC = a.hairColor;
      if (fh === 'beard' || fh === 'bigbeard' || fh === 'chinstrap') {
        bandS(0.35, 1, 0, fh === 'bigbeard' ? 0.45 : 0.3, beardC);
        bandS(0.62, 1, 0, fh === 'bigbeard' ? 0.62 : 0.42, beardC);
      } else if (fh === 'handlebar' || fh === 'mustache' || fh === 'goatee') {
        bandS(0.35, 0.55, 0.1, 0.22, a.hairStyle === 'bald' ? skinD : hair);
      } else if (fh === 'stubble') {
        for (let y = Math.round(r.h * 0.6); y < r.h; y++)
          for (let x = 0; x < r.w; x++) {
            const sNorm = frontS === 0 ? x / r.w : 1 - x / r.w;
            if (sNorm < 0.45 && this.rng.next() < 0.35) this.px(r.x + x, r.y + y, shade(skin, -0.32));
          }
      }
      if (a.glasses !== 'none') bandS(0.42, 0.46, 0, 0.5, a.glasses === 'sunglasses' ? '#111' : '#333');
    }

    // back
    {
      const r = R[F.NZ];
      this.fillRegion(r, skin);
      if (st === 'bald') {
        this.band(r, 0.8, 1, skinD);
      } else if (st === 'buzz') {
        for (let y = 0; y < r.h * 0.7; y++) for (let x = 0; x < r.w; x++) if (this.rng.next() < 0.45) this.px(r.x + x, r.y + y, hairD);
      } else if (st === 'mohawk') {
        this.band(r, 0, 0.55, hair, 0.38, 0.62);
      } else if (st === 'balding') {
        this.band(r, 0.25, 0.65, hair);
      } else {
        const bottom = st === 'long' || st === 'mullet' ? 1 : st === 'bob' ? 0.8 : st === 'afro' ? 0.85 : st === 'ponytail' ? 0.62 : 0.72;
        this.band(r, 0, bottom, hair);
        this.noise({ x: r.x, y: r.y, w: r.w, h: Math.round(r.h * bottom) }, [hairD, hairL], 0.12);
        this.band(r, bottom - 0.05, bottom, hairD);
        if (st === 'ponytail') this.band(r, 0.3, 1, hairD, 0.4, 0.6);
        if (st === 'bun') this.band(r, 0.15, 0.4, hairD, 0.32, 0.68);
      }
    }
    // top
    {
      const r = R[F.PY];
      if (st === 'bald') {
        this.fillRegion(r, skin);
        this.band(r, 0.3, 0.45, shade(skin, 0.18), 0.35, 0.55);
      } else if (st === 'balding') {
        this.fillRegion(r, hair);
        this.band(r, 0.2, 1, skin, 0.2, 0.8);
        this.band(r, 0.35, 0.5, shade(skin, 0.18), 0.4, 0.55);
      } else if (st === 'mohawk') {
        this.fillRegion(r, shade(skin, -0.05));
        this.noise(r, [shade(skin, -0.18)], 0.25);
        this.band(r, 0, 1, hair, 0.36, 0.64);
        this.band(r, 0, 1, hairL, 0.45, 0.52);
      } else if (st === 'buzz') {
        this.fillRegion(r, skin);
        this.noise(r, [hairD, hair], 0.55);
      } else {
        this.fillRegion(r, hair);
        this.noise(r, [hairD, hairL], 0.18);
        if (st === 'slick' || st === 'ponytail' || st === 'bun') {
          for (let x = 2; x < r.w; x += 4) this.px(r.x + x, r.y, hairD, 1, r.h);
        }
      }
    }
    // bottom (under chin / neck)
    {
      const r = R[F.NY];
      this.fillRegion(r, skinD);
      const fh = a.facialHair;
      if (fh === 'beard' || fh === 'bigbeard' || fh === 'goatee' || fh === 'chinstrap') {
        const t1 = fh === 'goatee' ? 0.35 : fh === 'bigbeard' ? 0.9 : 0.6;
        const s0 = fh === 'goatee' ? 0.32 : 0;
        const s1 = fh === 'goatee' ? 0.68 : 1;
        // t=0 is front edge for -Y face
        this.band(r, 0, t1, a.hairColor, s0, s1);
      }
    }
  }

  // ------------------------------------------------------------ face
  drawFace(expr: Expression): void {
    this.expression = expr;
    const a = this.app;
    const fp = a.face;
    const r = this.regions[P.HEAD][F.PZ];
    const g = this.g;
    const X = (u: number) => r.x + u * r.w;
    const Y = (v: number) => r.y + v * r.h;
    const skin = a.skin;
    const skinD = a.skinShade;
    const line = shade(skin, -0.62);
    const lineSoft = shade(skin, -0.35);
    const rr = new Rng(a.seed * 13 + 1);

    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    g.imageSmoothingEnabled = true;
    // base skin with subtle shading
    g.fillStyle = skin;
    g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    const grad = g.createLinearGradient(0, Y(0.55), 0, Y(1));
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(60,20,10,0.16)');
    g.fillStyle = grad;
    g.fillRect(r.x, r.y, r.w, r.h);
    // drunk / exertion blush
    const blush = expr === 'drunk' ? 0.5 : expr === 'angry' ? 0.18 : fp.cheek * 0.3;
    if (blush > 0.02) {
      g.fillStyle = `rgba(220,60,60,${blush})`;
      g.beginPath();
      g.ellipse(X(0.27), Y(0.62), r.w * 0.09, r.h * 0.05, 0, 0, Math.PI * 2);
      g.ellipse(X(0.73), Y(0.62), r.w * 0.09, r.h * 0.05, 0, 0, Math.PI * 2);
      g.fill();
      if (expr === 'drunk') {
        g.fillStyle = 'rgba(210,60,60,0.35)';
        g.beginPath();
        g.ellipse(X(0.5), Y(0.6), r.w * 0.05, r.h * 0.04, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';
    const lw = (r.w / 96) * 1.35;

    // wrinkles
    if (fp.wrinkles > 0.05) {
      g.strokeStyle = lineSoft;
      g.lineWidth = 1.2 * lw;
      const n = 1 + Math.round(fp.wrinkles * 2);
      for (let i = 0; i < n; i++) {
        const y = 0.24 + i * 0.045;
        g.beginPath();
        g.moveTo(X(0.32), Y(y + 0.01));
        g.quadraticCurveTo(X(0.5), Y(y - 0.015), X(0.68), Y(y + 0.01));
        g.stroke();
      }
      // crow's feet
      g.beginPath();
      g.moveTo(X(0.1), Y(fp.eyeY - 0.02));
      g.lineTo(X(0.06), Y(fp.eyeY - 0.04));
      g.moveTo(X(0.9), Y(fp.eyeY - 0.02));
      g.lineTo(X(0.94), Y(fp.eyeY - 0.04));
      g.stroke();
    }

    // expression parameters
    let browL = 0; // + = raised
    let browInner = 0; // + = inner raised (sad/pain), - = inner lowered (angry)
    let eyeOpen = 1;
    let eyeMode: 'open' | 'closed' | 'squeeze' | 'x' | 'happy' | 'half' = 'open';
    let pupil = 1;
    let mouth: 'flat' | 'smile' | 'frown' | 'open' | 'grit' | 'o' | 'laugh' | 'dead' | 'smirk' = 'flat';
    switch (expr) {
      case 'neutral':
        break;
      case 'happy':
        mouth = 'smile';
        browL = 0.01;
        break;
      case 'laugh':
        mouth = 'laugh';
        eyeMode = 'happy';
        browL = 0.02;
        break;
      case 'angry':
        browInner = -0.05;
        eyeOpen = 0.62;
        mouth = rr.chance(0.5) ? 'grit' : 'frown';
        break;
      case 'pain':
        browInner = 0.035;
        eyeMode = 'squeeze';
        mouth = 'grit';
        break;
      case 'shock':
        browL = 0.04;
        eyeOpen = 1.35;
        pupil = 0.6;
        mouth = 'o';
        break;
      case 'scared':
        browInner = 0.045;
        browL = 0.02;
        eyeOpen = 1.3;
        pupil = 0.65;
        mouth = 'open';
        break;
      case 'dead':
        eyeMode = 'x';
        mouth = 'dead';
        break;
      case 'ko':
        eyeMode = 'closed';
        mouth = 'open';
        break;
      case 'drunk':
        eyeMode = 'half';
        mouth = 'smirk';
        browInner = 0.02;
        break;
    }

    const ey = fp.eyeY;
    const es = fp.eyeSpacing * 1.12;
    const ew = 0.108 * fp.eyeSize;
    const eh = 0.064 * fp.eyeSize;

    // eyes
    for (const side of [-1, 1]) {
      const cx = 0.5 + side * es;
      if (a.glasses === 'sunglasses') continue;
      if (eyeMode === 'open' || eyeMode === 'half') {
        const open = eyeMode === 'half' ? 0.45 : eyeOpen;
        const h = eh * open;
        g.fillStyle = '#f4f0e6';
        g.beginPath();
        g.ellipse(X(cx), Y(ey), r.w * ew, r.h * Math.max(h, 0.012), 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = lineSoft;
        g.lineWidth = 1.1 * lw;
        g.stroke();
        if (expr === 'angry' || expr === 'shock' || expr === 'pain') {
          // bloodshot veins
          g.strokeStyle = 'rgba(200,40,40,0.7)';
          g.lineWidth = 0.8;
          for (let k = 0; k < 3; k++) {
            const sx = cx + side * ew * (0.95 - k * 0.1);
            g.beginPath();
            g.moveTo(X(sx), Y(ey + (k - 1) * eh * 0.4));
            g.lineTo(X(sx - side * ew * 0.35), Y(ey + (k - 1) * eh * 0.25));
            g.stroke();
          }
        }
        // iris + pupil
        g.fillStyle = fp.eyeColor;
        const ps = 0.042 * fp.eyeSize * pupil;
        const look = side * -0.006;
        g.beginPath();
        g.ellipse(X(cx + look), Y(ey + (eyeMode === 'half' ? 0.012 : 0)), r.w * ps, r.h * Math.min(ps, h * 1.05), 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0c0806';
        g.beginPath();
        g.ellipse(X(cx + look), Y(ey + (eyeMode === 'half' ? 0.012 : 0)), r.w * ps * 0.5, r.h * Math.min(ps * 0.5, h), 0, 0, Math.PI * 2);
        g.fill();
        // upper lid line (angled for angry)
        g.strokeStyle = line;
        g.lineWidth = 2.2 * lw;
        g.beginPath();
        const tilt = expr === 'angry' ? 0.025 : 0;
        g.moveTo(X(cx - ew * 1.1), Y(ey - h * 0.6 - (side < 0 ? -tilt : tilt) * 0.0));
        g.quadraticCurveTo(X(cx), Y(ey - h * 1.35 + tilt), X(cx + ew * 1.1), Y(ey - h * 0.6));
        g.stroke();
        if (eyeMode === 'half') {
          g.fillStyle = skinD;
          g.fillRect(X(cx - ew * 1.1), Y(ey - h * 1.4), r.w * ew * 2.2, r.h * h * 0.9);
          g.beginPath();
          g.moveTo(X(cx - ew * 1.1), Y(ey - h * 0.4));
          g.lineTo(X(cx + ew * 1.1), Y(ey - h * 0.4));
          g.stroke();
        }
        // lower lid hint
        g.lineWidth = 1 * lw;
        g.strokeStyle = lineSoft;
        g.beginPath();
        g.moveTo(X(cx - ew * 0.8), Y(ey + h + 0.012));
        g.quadraticCurveTo(X(cx), Y(ey + h + 0.025), X(cx + ew * 0.8), Y(ey + h + 0.012));
        g.stroke();
        if (expr === 'angry') {
          // angry lid cut: skin triangle over inner top of eye
          g.fillStyle = skin;
          g.beginPath();
          g.moveTo(X(cx - side * ew * 1.3), Y(ey - h * 1.6));
          g.lineTo(X(cx - side * ew * 1.3), Y(ey - h * 0.1));
          g.lineTo(X(cx + side * ew * 1.3), Y(ey - h * 1.6));
          g.closePath();
          g.fill();
          g.strokeStyle = line;
          g.lineWidth = 2.2 * lw;
          g.beginPath();
          g.moveTo(X(cx - side * ew * 1.2), Y(ey - h * 0.2));
          g.lineTo(X(cx + side * ew * 1.1), Y(ey - h * 1.25));
          g.stroke();
        }
      } else if (eyeMode === 'closed') {
        g.strokeStyle = line;
        g.lineWidth = 2.2 * lw;
        g.beginPath();
        g.moveTo(X(cx - ew), Y(ey));
        g.quadraticCurveTo(X(cx), Y(ey + 0.02), X(cx + ew), Y(ey));
        g.stroke();
      } else if (eyeMode === 'happy') {
        g.strokeStyle = line;
        g.lineWidth = 2.4 * lw;
        g.beginPath();
        g.moveTo(X(cx - ew), Y(ey + 0.01));
        g.quadraticCurveTo(X(cx), Y(ey - 0.035), X(cx + ew), Y(ey + 0.01));
        g.stroke();
      } else if (eyeMode === 'squeeze') {
        g.strokeStyle = line;
        g.lineWidth = 2.6 * lw;
        g.beginPath();
        g.moveTo(X(cx - side * ew), Y(ey - 0.025));
        g.lineTo(X(cx + side * ew * 0.6), Y(ey));
        g.lineTo(X(cx - side * ew), Y(ey + 0.025));
        g.stroke();
      } else if (eyeMode === 'x') {
        g.strokeStyle = line;
        g.lineWidth = 2.6 * lw;
        const d = ew * 0.8;
        g.beginPath();
        g.moveTo(X(cx - d), Y(ey - d));
        g.lineTo(X(cx + d), Y(ey + d));
        g.moveTo(X(cx + d), Y(ey - d));
        g.lineTo(X(cx - d), Y(ey + d));
        g.stroke();
      }
    }

    // glasses
    if (a.glasses !== 'none') {
      const sun = a.glasses === 'sunglasses';
      g.fillStyle = sun ? '#121212' : 'rgba(200,230,255,0.15)';
      g.strokeStyle = sun ? '#050505' : '#2a2a2a';
      g.lineWidth = 2 * lw;
      for (const side of [-1, 1]) {
        const cx = 0.5 + side * es;
        g.beginPath();
        g.rect(X(cx - ew * 1.35), Y(ey - eh * 1.2), r.w * ew * 2.7, r.h * eh * 2.3);
        g.fill();
        g.stroke();
        if (sun) {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(X(cx - ew * 1.0), Y(ey - eh * 0.9), r.w * ew * 0.6, r.h * eh * 0.4);
          g.fillStyle = '#121212';
        }
      }
      g.beginPath();
      g.moveTo(X(0.5 - es + ew * 1.35), Y(ey - eh * 0.6));
      g.lineTo(X(0.5 + es - ew * 1.35), Y(ey - eh * 0.6));
      g.stroke();
    }

    // eyebrows
    {
      const thick = 3.6 * fp.browThick * lw;
      g.strokeStyle = a.hairStyle === 'bald' && a.facialHair === 'none' ? shade(skin, -0.5) : shade(a.hairColor, -0.1);
      g.lineWidth = thick;
      for (const side of [-1, 1]) {
        const cx = 0.5 + side * es;
        const by = ey - 0.095 * fp.eyeSize - browL;
        const inner = cx - side * ew * 1.1;
        const outer = cx + side * ew * 1.25;
        const innerY = by - browInner + fp.browTilt * 0.02;
        const outerY = by + browInner * 0.3 - fp.browTilt * 0.02;
        g.beginPath();
        g.moveTo(X(inner), Y(innerY));
        g.quadraticCurveTo(X(cx), Y(Math.min(innerY, outerY) - 0.018), X(outer), Y(outerY + 0.01));
        g.stroke();
      }
      if (browInner < -0.02) {
        // frown creases between brows
        g.strokeStyle = lineSoft;
        g.lineWidth = 1.3 * lw;
        g.beginPath();
        g.moveTo(X(0.47), Y(ey - 0.1));
        g.lineTo(X(0.48), Y(ey - 0.055));
        g.moveTo(X(0.53), Y(ey - 0.1));
        g.lineTo(X(0.52), Y(ey - 0.055));
        g.stroke();
      }
    }

    // nose
    {
      g.strokeStyle = lineSoft;
      g.lineWidth = 1.6 * lw;
      const ns = fp.noseSize * 1.35;
      const ny = 0.63;
      g.beginPath();
      if (fp.noseType === 0) {
        g.moveTo(X(0.5 - 0.01), Y(ey + 0.02));
        g.lineTo(X(0.5 - 0.035 * ns), Y(ny));
        g.quadraticCurveTo(X(0.5), Y(ny + 0.03 * ns), X(0.5 + 0.035 * ns), Y(ny));
      } else if (fp.noseType === 1) {
        g.moveTo(X(0.5 - 0.05 * ns), Y(ny - 0.01));
        g.quadraticCurveTo(X(0.5), Y(ny + 0.035 * ns), X(0.5 + 0.05 * ns), Y(ny - 0.01));
        g.moveTo(X(0.5 - 0.06 * ns), Y(ny - 0.03));
        g.lineTo(X(0.5 - 0.05 * ns), Y(ny - 0.01));
        g.moveTo(X(0.5 + 0.06 * ns), Y(ny - 0.03));
        g.lineTo(X(0.5 + 0.05 * ns), Y(ny - 0.01));
      } else if (fp.noseType === 2) {
        g.moveTo(X(0.52), Y(ey));
        g.lineTo(X(0.55 + 0.02 * ns), Y(ny - 0.01));
        g.lineTo(X(0.5), Y(ny + 0.01));
      } else {
        // big bulbous
        g.ellipse(X(0.5), Y(ny - 0.02), r.w * 0.055 * ns, r.h * 0.045 * ns, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      }
      g.stroke();
      // nostrils
      g.fillStyle = shade(skin, -0.45);
      g.beginPath();
      g.ellipse(X(0.5 - 0.022 * ns), Y(ny + 0.004), r.w * 0.009, r.h * 0.006, 0, 0, Math.PI * 2);
      g.ellipse(X(0.5 + 0.022 * ns), Y(ny + 0.004), r.w * 0.009, r.h * 0.006, 0, 0, Math.PI * 2);
      g.fill();
      // nasolabial folds
      if (fp.wrinkles > 0.3 || expr === 'angry' || expr === 'pain' || expr === 'laugh') {
        g.strokeStyle = lineSoft;
        g.lineWidth = 1.3 * lw;
        g.beginPath();
        g.moveTo(X(0.4), Y(0.58));
        g.quadraticCurveTo(X(0.36), Y(0.66), X(0.38), Y(0.74));
        g.moveTo(X(0.6), Y(0.58));
        g.quadraticCurveTo(X(0.64), Y(0.66), X(0.62), Y(0.74));
        g.stroke();
      }
    }

    // facial hair (behind mouth)
    const fh = a.facialHair;
    const beard = a.hairColor;
    const beardD = shade(beard, -0.2);
    const mouthY = 0.76;
    const mw = fp.mouthWidth * 1.3;
    if (fh === 'stubble') {
      g.fillStyle = shade(skin, -0.3);
      for (let i = 0; i < 260; i++) {
        const u = rr.range(0.12, 0.88);
        const v = rr.range(0.62, 0.99);
        const dx = (u - 0.5) / 0.4;
        const dv = (v - 0.62) / 0.4;
        if (dx * dx + (1 - dv) * (1 - dv) * 0.2 > 1.05) continue;
        g.fillRect(X(u), Y(v), 1, 1);
      }
    }
    if (fh === 'beard' || fh === 'bigbeard' || fh === 'chinstrap' || fh === 'goatee' || fh === 'handlebar') {
      g.fillStyle = beard;
      g.beginPath();
      if (fh === 'beard') {
        g.moveTo(X(0.06), Y(0.52));
        g.lineTo(X(0.14), Y(0.68));
        g.quadraticCurveTo(X(0.5), Y(0.62), X(0.86), Y(0.68));
        g.lineTo(X(0.94), Y(0.52));
        g.lineTo(X(1), Y(0.52));
        g.lineTo(X(1), Y(1));
        g.lineTo(X(0), Y(1));
        g.lineTo(X(0), Y(0.52));
      } else if (fh === 'bigbeard') {
        g.moveTo(X(0), Y(0.48));
        g.lineTo(X(0.12), Y(0.6));
        g.quadraticCurveTo(X(0.5), Y(0.56), X(0.88), Y(0.6));
        g.lineTo(X(1), Y(0.48));
        g.lineTo(X(1), Y(1));
        g.lineTo(X(0), Y(1));
      } else if (fh === 'chinstrap') {
        g.moveTo(X(0.04), Y(0.5));
        g.lineTo(X(0.12), Y(0.5));
        g.quadraticCurveTo(X(0.18), Y(0.88), X(0.5), Y(0.9));
        g.quadraticCurveTo(X(0.82), Y(0.88), X(0.88), Y(0.5));
        g.lineTo(X(0.96), Y(0.5));
        g.lineTo(X(1), Y(1));
        g.lineTo(X(0), Y(1));
      } else if (fh === 'goatee') {
        g.moveTo(X(0.5 - mw * 0.9), Y(mouthY + 0.035));
        g.quadraticCurveTo(X(0.5), Y(mouthY + 0.01), X(0.5 + mw * 0.9), Y(mouthY + 0.035));
        g.lineTo(X(0.5 + mw * 0.7), Y(0.96));
        g.quadraticCurveTo(X(0.5), Y(1.02), X(0.5 - mw * 0.7), Y(0.96));
      } else if (fh === 'handlebar') {
        // horseshoe: mustache + vertical bars down the chin
        g.moveTo(X(0.5 - mw * 1.25), Y(mouthY - 0.05));
        g.lineTo(X(0.5 - mw * 1.0), Y(mouthY - 0.05));
        g.lineTo(X(0.5 - mw * 1.0), Y(1));
        g.lineTo(X(0.5 - mw * 1.4), Y(1));
        g.closePath();
        g.moveTo(X(0.5 + mw * 1.25), Y(mouthY - 0.05));
        g.lineTo(X(0.5 + mw * 1.0), Y(mouthY - 0.05));
        g.lineTo(X(0.5 + mw * 1.0), Y(1));
        g.lineTo(X(0.5 + mw * 1.4), Y(1));
      }
      g.closePath();
      g.fill();
      // texture strands
      g.strokeStyle = beardD;
      g.lineWidth = 1 * lw;
      for (let i = 0; i < 26; i++) {
        const u = rr.range(0.05, 0.95);
        const v = rr.range(0.66, 0.97);
        g.beginPath();
        g.moveTo(X(u), Y(v));
        g.lineTo(X(u + rr.range(-0.01, 0.01)), Y(v + 0.03));
        g.stroke();
      }
    }

    // mouth
    {
      const mx0 = 0.5 - mw / 2;
      const mx1 = 0.5 + mw / 2;
      const hasBeardAround = fh === 'beard' || fh === 'bigbeard';
      if (hasBeardAround) {
        // skin patch around lips so the mouth reads
        g.fillStyle = shade(skin, -0.05);
        g.beginPath();
        g.ellipse(X(0.5), Y(mouthY + 0.01), r.w * mw * 0.62, r.h * 0.05, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = line;
      g.lineWidth = 2.2 * lw;
      g.fillStyle = '#3a0c0c';
      switch (mouth) {
        case 'flat':
          g.beginPath();
          g.moveTo(X(mx0), Y(mouthY));
          g.quadraticCurveTo(X(0.5), Y(mouthY + 0.008), X(mx1), Y(mouthY - 0.002));
          g.stroke();
          break;
        case 'smile':
        case 'smirk':
          g.beginPath();
          g.moveTo(X(mx0), Y(mouthY - (mouth === 'smirk' ? 0 : 0.015)));
          g.quadraticCurveTo(X(0.5), Y(mouthY + 0.03), X(mx1), Y(mouthY - 0.02));
          g.stroke();
          break;
        case 'frown':
          g.beginPath();
          g.moveTo(X(mx0), Y(mouthY + 0.02));
          g.quadraticCurveTo(X(0.5), Y(mouthY - 0.02), X(mx1), Y(mouthY + 0.02));
          g.stroke();
          break;
        case 'grit': {
          const h = 0.045;
          g.fillStyle = '#efe8da';
          g.fillRect(X(mx0 - 0.01), Y(mouthY - h / 2), r.w * (mw + 0.02), r.h * h);
          g.strokeRect(X(mx0 - 0.01), Y(mouthY - h / 2), r.w * (mw + 0.02), r.h * h);
          g.lineWidth = 1 * lw;
          g.beginPath();
          g.moveTo(X(mx0 - 0.01), Y(mouthY));
          g.lineTo(X(mx1 + 0.01), Y(mouthY));
          for (let k = 1; k < 5; k++) {
            const tx = mx0 - 0.01 + ((mw + 0.02) * k) / 5;
            g.moveTo(X(tx), Y(mouthY - h / 2));
            g.lineTo(X(tx), Y(mouthY + h / 2));
          }
          g.stroke();
          break;
        }
        case 'open':
        case 'laugh': {
          g.beginPath();
          if (mouth === 'laugh') {
            g.moveTo(X(mx0 - 0.01), Y(mouthY - 0.02));
            g.quadraticCurveTo(X(0.5), Y(mouthY - 0.01), X(mx1 + 0.01), Y(mouthY - 0.02));
            g.quadraticCurveTo(X(0.5), Y(mouthY + 0.1), X(mx0 - 0.01), Y(mouthY - 0.02));
          } else {
            g.ellipse(X(0.5), Y(mouthY + 0.01), r.w * mw * 0.42, r.h * 0.05, 0, 0, Math.PI * 2);
          }
          g.fill();
          g.stroke();
          g.fillStyle = '#efe8da';
          g.fillRect(X(mx0 + 0.02), Y(mouthY - 0.015), r.w * (mw - 0.04), r.h * 0.016);
          break;
        }
        case 'o':
          g.beginPath();
          g.ellipse(X(0.5), Y(mouthY + 0.015), r.w * 0.04, r.h * 0.055, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          break;
        case 'dead':
          g.beginPath();
          g.moveTo(X(mx0), Y(mouthY));
          g.quadraticCurveTo(X(0.5), Y(mouthY + 0.03), X(mx1), Y(mouthY + 0.005));
          g.stroke();
          g.fillStyle = '#c84a5a';
          g.beginPath();
          g.ellipse(X(0.5 + mw * 0.15), Y(mouthY + 0.035), r.w * 0.03, r.h * 0.035, 0.3, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 1.2 * lw;
          g.stroke();
          break;
      }
      // lower lip hint
      if (mouth === 'flat' || mouth === 'smile' || mouth === 'frown' || mouth === 'smirk') {
        g.strokeStyle = shade(skin, -0.25);
        g.lineWidth = 1.2 * lw;
        g.beginPath();
        g.moveTo(X(0.5 - mw * 0.25), Y(mouthY + 0.035));
        g.lineTo(X(0.5 + mw * 0.25), Y(mouthY + 0.035));
        g.stroke();
      }
    }

    // mustache drawn over the mouth
    if (fh === 'mustache' || fh === 'handlebar' || fh === 'beard' || fh === 'bigbeard' || fh === 'goatee') {
      g.fillStyle = beard;
      g.beginPath();
      const w = fh === 'handlebar' ? mw * 1.35 : mw * 0.85;
      g.moveTo(X(0.5 - w), Y(mouthY - 0.005));
      g.quadraticCurveTo(X(0.5 - w * 0.6), Y(mouthY - 0.07), X(0.5), Y(mouthY - 0.06));
      g.quadraticCurveTo(X(0.5 + w * 0.6), Y(mouthY - 0.07), X(0.5 + w), Y(mouthY - 0.005));
      g.quadraticCurveTo(X(0.5 + w * 0.5), Y(mouthY - 0.03), X(0.5), Y(mouthY - 0.025));
      g.quadraticCurveTo(X(0.5 - w * 0.5), Y(mouthY - 0.03), X(0.5 - w), Y(mouthY - 0.005));
      g.fill();
    }

    // scar
    if (fp.scar) {
      g.strokeStyle = '#c87878';
      g.lineWidth = 2 * lw;
      g.beginPath();
      g.moveTo(X(0.66), Y(0.32));
      g.lineTo(X(0.78), Y(0.6));
      g.stroke();
      g.lineWidth = 1 * lw;
      for (let k = 0; k < 4; k++) {
        const t = 0.15 + k * 0.22;
        const x = 0.66 + 0.12 * t;
        const y = 0.32 + 0.28 * t;
        g.beginPath();
        g.moveTo(X(x - 0.02), Y(y + 0.005));
        g.lineTo(X(x + 0.02), Y(y - 0.005));
        g.stroke();
      }
    }

    // hair on the forehead
    this.drawFrontHair(r, X, Y);
    g.restore();
    g.imageSmoothingEnabled = false;

    // re-apply blood that was painted on the face
    for (const b of this.faceBloodLayer) this.px(b.x, b.y, b.c, b.s, b.s);
    this.dirty = true;
  }

  private drawFrontHair(r: Region, X: (u: number) => number, Y: (v: number) => number): void {
    const a = this.app;
    const g = this.g;
    const hair = a.hairColor;
    const st = a.hairStyle;
    const rr = new Rng(a.seed * 31 + 7);
    g.fillStyle = hair;
    const jag = (y0: number, x0 = 0, x1 = 1, amp = 0.03) => {
      g.beginPath();
      g.moveTo(X(x0), Y(0));
      g.lineTo(X(x1), Y(0));
      g.lineTo(X(x1), Y(y0));
      const n = 9;
      for (let i = n; i >= 0; i--) {
        const u = x0 + ((x1 - x0) * i) / n;
        g.lineTo(X(u), Y(y0 + (i % 2 === 0 ? 0 : amp) + rr.range(-0.01, 0.01)));
      }
      g.closePath();
      g.fill();
    };
    switch (st) {
      case 'bald':
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.ellipse(X(0.38), Y(0.08), r.w * 0.12, r.h * 0.035, -0.2, 0, Math.PI * 2);
        g.fill();
        break;
      case 'buzz':
        g.fillStyle = shade(hair, -0.1);
        for (let i = 0; i < 380; i++) g.fillRect(X(rr.range(0.02, 0.98)), Y(rr.range(0, 0.16)), 1, 1);
        break;
      case 'short':
        jag(0.14, 0, 1, 0.035);
        g.fillRect(X(0), Y(0), r.w * 0.07, r.h * 0.36);
        g.fillRect(X(0.93), Y(0), r.w * 0.07, r.h * 0.36);
        break;
      case 'slick':
      case 'ponytail':
      case 'bun':
        g.beginPath();
        g.moveTo(X(0), Y(0.32));
        g.quadraticCurveTo(X(0.05), Y(0.12), X(0.3), Y(0.1));
        g.quadraticCurveTo(X(0.6), Y(0.08), X(0.95), Y(0.14));
        g.lineTo(X(1), Y(0.32));
        g.lineTo(X(1), Y(0));
        g.lineTo(X(0), Y(0));
        g.fill();
        g.strokeStyle = shade(hair, 0.18);
        g.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.moveTo(X(0.1 + i * 0.14), Y(0.02));
          g.quadraticCurveTo(X(0.18 + i * 0.14), Y(0.06), X(0.28 + i * 0.13), Y(0.1));
          g.stroke();
        }
        break;
      case 'mohawk':
        g.fillRect(X(0.38), Y(0), r.w * 0.24, r.h * 0.12);
        break;
      case 'long':
      case 'bob':
        g.beginPath();
        g.moveTo(X(0), Y(st === 'long' ? 1 : 0.78));
        g.lineTo(X(0.08), Y(st === 'long' ? 1 : 0.78));
        g.lineTo(X(0.1), Y(0.3));
        g.quadraticCurveTo(X(0.3), Y(0.12), X(0.5), Y(0.14));
        g.quadraticCurveTo(X(0.7), Y(0.12), X(0.9), Y(0.3));
        g.lineTo(X(0.92), Y(st === 'long' ? 1 : 0.78));
        g.lineTo(X(1), Y(st === 'long' ? 1 : 0.78));
        g.lineTo(X(1), Y(0));
        g.lineTo(X(0), Y(0));
        g.fill();
        break;
      case 'afro':
        g.beginPath();
        g.moveTo(X(0), Y(0.6));
        g.lineTo(X(0.06), Y(0.6));
        g.quadraticCurveTo(X(0.1), Y(0.2), X(0.5), Y(0.2));
        g.quadraticCurveTo(X(0.9), Y(0.2), X(0.94), Y(0.6));
        g.lineTo(X(1), Y(0.6));
        g.lineTo(X(1), Y(0));
        g.lineTo(X(0), Y(0));
        g.fill();
        g.fillStyle = shade(hair, 0.12);
        for (let i = 0; i < 90; i++) g.fillRect(X(rr.range(0, 1)), Y(rr.range(0, 0.18)), 2, 2);
        break;
      case 'mullet':
        jag(0.12, 0, 1, 0.025);
        g.fillRect(X(0), Y(0), r.w * 0.06, r.h * 0.45);
        g.fillRect(X(0.94), Y(0), r.w * 0.06, r.h * 0.45);
        break;
      case 'balding':
        g.fillRect(X(0), Y(0.12), r.w * 0.09, r.h * 0.3);
        g.fillRect(X(0.91), Y(0.12), r.w * 0.09, r.h * 0.3);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.beginPath();
        g.ellipse(X(0.42), Y(0.08), r.w * 0.1, r.h * 0.03, -0.1, 0, Math.PI * 2);
        g.fill();
        break;
    }
  }

  // ------------------------------------------------------------ blood & damage
  /**
   * Paint blood/bruise pixels onto a part face at normalized coords.
   * size: radius in face-relative units (0..1), amount 0..1.
   */
  paintBlood(part: number, face: number, s: number, t: number, size: number, amount: number, bruise = false): void {
    const r = this.regions[part][face];
    const isFace = part === P.HEAD && face === F.PZ;
    const block = isFace ? 4 : 1;
    const cols = Math.max(1, Math.floor(r.w / block));
    const rows = Math.max(1, Math.floor(r.h / block));
    const cx = s * cols;
    const cy = t * rows;
    const rad = Math.max(1.2, size * Math.max(cols, rows));
    const n = Math.ceil(rad * rad * 3.2 * clamp(amount, 0.2, 1.5));
    const reds = ['#c01014', '#a00c10', '#d81a1c', '#8a0a0c', '#e02424', '#b81216'];
    const darks = ['#5a0608', '#6a0709', '#4a0406'];
    const bruises = ['#7a3a7a', '#8a4a8a', '#a05a8a', '#6a3a6a', '#9a4a6a'];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.7) * rad;
      let gx = Math.floor(cx + Math.cos(ang) * d);
      let gy = Math.floor(cy + Math.sin(ang) * d * (bruise ? 1 : 1.25) + (bruise ? 0 : Math.random() * d * 0.6));
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      let c: string;
      if (bruise) c = bruises[(Math.random() * bruises.length) | 0];
      else c = Math.random() < 0.18 ? darks[(Math.random() * darks.length) | 0] : reds[(Math.random() * reds.length) | 0];
      const x = r.x + gx * block;
      const y = r.y + gy * block;
      this.px(x, y, c, block, block);
      if (isFace) {
        this.faceBloodLayer.push({ x, y, c, s: block });
        if (this.faceBloodLayer.length > 900) this.faceBloodLayer.splice(0, 100);
      }
    }
    // drips running down on vertical faces
    if (!bruise && face !== F.PY && face !== F.NY && amount > 0.4) {
      const drips = 1 + ((Math.random() * 2) | 0);
      for (let k = 0; k < drips; k++) {
        let gx = Math.floor(cx + (Math.random() - 0.5) * rad);
        let gy = Math.floor(cy);
        const len = 2 + ((Math.random() * rows * 0.35) | 0);
        for (let j = 0; j < len; j++) {
          if (gx < 0 || gx >= cols || gy + j >= rows) break;
          const x = r.x + gx * block;
          const y = r.y + (gy + j) * block;
          const c = j > len - 2 ? '#7a0a0c' : '#b01014';
          this.px(x, y, c, block, block);
          if (isFace) this.faceBloodLayer.push({ x, y, c, s: block });
        }
      }
    }
    this.bloodiness = Math.min(1, this.bloodiness + amount * 0.02);
    this.dirty = true;
  }

  /** Splatter blood randomly over a whole part (e.g. blood shower). */
  soakPart(part: number, amount: number): void {
    for (let f = 0; f < 6; f++) {
      const k = Math.ceil(amount * 3);
      for (let i = 0; i < k; i++) this.paintBlood(part, f, Math.random(), Math.random(), 0.25, amount);
    }
  }

  flush(): void {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}
