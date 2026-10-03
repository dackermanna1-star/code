// Wall fixtures: the canopy range hood (with a retro clock on its chimney), the microwave wall
// shelf, the spice rack, two open shelves, the menu chalkboard, pendant lamps and framed posters.

import * as THREE from 'three';
import type { ChalkboardProp } from '../props/types';
import { PALETTE } from '../palette';
import { LAYOUT, BACK_WALL_Z, LEFT_WALL_X } from '../layout';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, cylB, softExtrude, roundedRectShape, roundedRectPath, mergeStatic, dynamic,
  lacquer, enamel, chrome, matte, textured, canvasTex, makeCanvasTexture, CHALK_FONT_STACK, Rand, type FP,
} from '../props/util';
import { posterTex, woodTex } from '../props/textures';
import { boxUV, butcherBlock } from './counter';
import { WALL_TOP } from './room';

const BZ = BACK_WALL_Z;

/** Extrude a side profile given as [z, y, fillet?] points along X (from x0 to x1). */
function sideProfile(pts: FP[], x0: number, x1: number, bevel: number): THREE.BufferGeometry {
  const p = fillet(pts.map((q) => (q.length > 2 ? [-q[0], q[1], q[2]] : [-q[0], q[1]]) as FP), 4, true);
  const s = new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y)));
  return softExtrude(s, x1 - x0, bevel, { curveSegs: 6, bevelSegs: 2 }).rotateY(Math.PI / 2).translate(x0, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Range hood + clock

function clockFaceTex(): THREE.Texture {
  return canvasTex(
    'clockFace',
    256,
    256,
    (c, w, h) => {
      const cx = w / 2, cy = h / 2;
      const g = c.createRadialGradient(cx, cy * 0.9, 10, cx, cy, w / 2);
      g.addColorStop(0, '#fffdf6');
      g.addColorStop(1, '#f6ead6');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        c.strokeStyle = big ? PALETTE.coralDark : '#9a8a7a';
        c.lineWidth = big ? 12 : 6;
        const r0 = big ? 82 : 90, r1 = 104;
        c.beginPath();
        c.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
        c.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
        c.stroke();
      }
      // a tiny fork & spoon emblem
      c.strokeStyle = '#c8b8a4';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(cx - 14, cy + 34);
      c.lineTo(cx - 14, cy + 66);
      c.moveTo(cx - 20, cy + 34);
      c.lineTo(cx - 20, cy + 46);
      c.moveTo(cx - 8, cy + 34);
      c.lineTo(cx - 8, cy + 46);
      c.stroke();
      c.beginPath();
      c.ellipse(cx + 14, cy + 40, 6, 9, 0, 0, Math.PI * 2);
      c.moveTo(cx + 14, cy + 49);
      c.lineTo(cx + 14, cy + 66);
      c.stroke();
    },
    {},
  );
}

interface Clock {
  hour: THREE.Object3D;
  minute: THREE.Object3D;
  second: THREE.Object3D;
}

function buildClock(parent: THREE.Object3D, pos: [number, number, number], r: number): Clock {
  const g = grp(parent, pos, 'clock');
  part(g, puck(r, 0.03, 0.012, 36).rotateX(Math.PI / 2), lacquer(PALETTE.coral, 0.32));
  part(g, new THREE.CircleGeometry(r * 0.86, 48), textured('clockFace', clockFaceTex(), { roughness: 0.5 }), { pos: [0, 0, 0.0305], cast: false });
  part(g, new THREE.TorusGeometry(r * 0.9, 0.006, 8, 48), chrome(), { pos: [0, 0, 0.032] });
  const hand = (len: number, wid: number, z: number, col: string) => {
    const h = dynamic(grp(g, [0, 0, z], 'hand'));
    part(h, rbox(wid, len, 0.004, wid / 2, 2), enamel(col, 0.4), { pos: [0, len / 2 - wid, 0], cast: false });
    return h;
  };
  const hour = hand(r * 0.5, 0.014, 0.036, '#4a3530');
  const minute = hand(r * 0.74, 0.01, 0.041, '#4a3530');
  const second = hand(r * 0.8, 0.004, 0.046, PALETTE.coralDark);
  part(g, puck(0.01, 0.014, 0.004, 16).rotateX(Math.PI / 2), lacquer(PALETTE.coral, 0.3), { pos: [0, 0, 0.038] });
  return { hour, minute, second };
}

function buildHood(root: THREE.Object3D): Clock {
  const g = grp(root, [0, 0, 0], 'hood');
  const cx = LAYOUT.stove.pos.x;
  const hw = 0.44;
  const mint = lacquer(PALETTE.cabinet, 0.34);
  const cream = lacquer('#fff6e8', 0.34);
  // canopy: lip at the front, sloping up to the chimney
  const canopy: FP[] = [
    [BZ, 1.63],
    [-0.47, 1.63, 0.02],
    [-0.47, 1.73, 0.05],
    [-0.76, 2.0, 0.06],
    [BZ, 2.0],
  ];
  part(g, sideProfile(canopy, cx - hw, cx + hw, 0.028), mint);
  // cream rolled lip with chrome speed lines (retro streamline)
  part(g, new THREE.CapsuleGeometry(0.024, hw * 2 - 0.01, 6, 16).rotateZ(Math.PI / 2), cream, { pos: [cx, 1.652, -0.462] });
  for (const [y, z, l] of [[1.705, -0.468, 0.7], [1.745, -0.488, 0.56], [1.785, -0.52, 0.42]] as [number, number, number][]) {
    part(g, new THREE.CapsuleGeometry(0.005, l, 4, 8).rotateZ(Math.PI / 2), chrome(), { pos: [cx, y, z], cast: false });
  }
  // chimney with cream bands
  const chH = WALL_TOP - 1.99;
  part(g, rboxB(0.4, chH, 0.22, 0.03, 3), mint, { pos: [cx, 1.99, BZ + 0.11] });
  for (const y of [2.18, 2.73]) part(g, rbox(0.404, 0.026, 0.224, 0.012, 2), cream, { pos: [cx, y, BZ + 0.11] });
  // warm under-hood light (decor only)
  part(g, rbox(0.5, 0.01, 0.22, 0.004, 1), new THREE.MeshBasicMaterial({ color: '#ffe9bf', toneMapped: false }), { pos: [cx, 1.628, -0.78], cast: false });
  return buildClock(g, [cx, 2.455, BZ + 0.22], 0.125);
}

// ---------------------------------------------------------------------------------------------
// Shelves

function bracket(parent: THREE.Object3D, x: number, yTop: number, depth: number, drop: number, mat: THREE.Material, t = 0.024) {
  const pts: FP[] = [
    [BZ, yTop],
    [BZ + depth, yTop, 0.01],
    [BZ + depth - 0.02, yTop - 0.03, 0.03],
    [BZ + 0.03, yTop - drop + 0.02, 0.04],
    [BZ, yTop - drop],
  ];
  part(parent, sideProfile(pts, x - t / 2, x + t / 2, 0.006), mat);
}

function buildMicrowaveShelf(root: THREE.Object3D) {
  const g = grp(root, [0, 0, 0], 'microwaveShelf');
  const p = LAYOUT.microwave.pos;
  const d = 0.42, w = 0.57, t = 0.036;
  const board = boxUV(rbox(w, t, d, 0.012, 3).translate(p.x, p.y - t / 2, BZ + d / 2), 1 / 0.9);
  part(g, board, butcherBlock());
  for (const s of [-1, 1]) bracket(g, p.x + s * 0.17, p.y - t, 0.25, 0.2, lacquer('#fff6e8', 0.34), 0.024);
}

/** Wooden spice rack: shelf board, scalloped back, rounded sides. Returns the bottle row centre. */
function buildSpiceRack(root: THREE.Object3D, width: number): THREE.Group {
  const p = LAYOUT.spiceShelf.pos;
  const g = grp(root, [p.x, p.y, 0], 'spiceRack');
  const wood = butcherBlock();
  const d = 0.17;
  part(g, boxUV(rbox(width, 0.026, d, 0.008, 3).translate(0, -0.013, BZ + d / 2), 1 / 0.9, [p.x, p.y, 0]), wood);
  // back panel with a scalloped top
  const s = new THREE.Shape();
  const h = 0.2, n = 5, sw = width / n;
  s.moveTo(-width / 2, -0.03);
  s.lineTo(width / 2, -0.03);
  s.lineTo(width / 2, h - 0.03);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = -width / 2 + i * sw;
    s.quadraticCurveTo(x0 + sw / 2, h + 0.03, x0, h - 0.03);
  }
  s.closePath();
  part(g, softExtrude(s, 0.018, 0.005, { curveSegs: 6, bevelSegs: 2 }), lacquer(PALETTE.coral, 0.36), { pos: [0, 0, BZ + 0.002] });
  // sides with rounded tops
  for (const sx of [-1, 1]) {
    const side = roundedRectShape(d, 0.16, 0.03, 0, 0.05);
    part(g, softExtrude(side, 0.018, 0.005, { curveSegs: 6 }).rotateY(Math.PI / 2), wood, { pos: [sx * (width / 2 + 0.009) - 0.009, 0, BZ + d / 2] });
  }
  // little front rail (low, below the labels)
  part(g, new THREE.CapsuleGeometry(0.0045, width - 0.01, 4, 10).rotateZ(Math.PI / 2), lacquer(PALETTE.coral, 0.36), { pos: [0, 0.012, BZ + d - 0.012] });
  return g;
}

function openShelf(root: THREE.Object3D, x0: number, x1: number, y: number, depth: number, brackets: number[]): THREE.Group {
  const g = grp(root, [0, 0, 0], 'openShelf');
  const t = 0.04;
  part(g, boxUV(rbox(x1 - x0, t, depth, 0.012, 3).translate((x0 + x1) / 2, y - t / 2, BZ + depth / 2), 1 / 0.9), butcherBlock());
  for (const bx of brackets) bracket(g, bx, y - t, depth - 0.05, 0.16, lacquer(PALETTE.cabinet, 0.36), 0.022);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chalkboard

const CHALK_W = 512, CHALK_H = 360;

function drawChalk(c: CanvasRenderingContext2D, title: string, sub: string | undefined) {
  const w = CHALK_W, h = CHALK_H;
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.fillStyle = '#2f3f37';
  c.fillRect(0, 0, w, h);
  const r = new Rand(77);
  // old eraser smudges
  for (let i = 0; i < 9; i++) {
    const x = r.range(0, w), y = r.range(0, h), rad = r.range(60, 140);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // chalk dust along the bottom edge
  const dust = c.createLinearGradient(0, h * 0.82, 0, h);
  dust.addColorStop(0, 'rgba(255,255,255,0)');
  dust.addColorStop(1, 'rgba(255,255,255,0.08)');
  c.fillStyle = dust;
  c.fillRect(0, h * 0.82, w, h * 0.18);

  const chalk = (text: string, x: number, y: number, maxW: number, px: number, col: string) => {
    let size = px;
    c.font = `800 ${size}px ${CHALK_FONT_STACK}`;
    while (c.measureText(text).width > maxW && size > 18) {
      size -= 2;
      c.font = `800 ${size}px ${CHALK_FONT_STACK}`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = col;
    c.globalAlpha = 0.28;
    c.fillText(text, x + 1.6, y + 1.2);
    c.fillText(text, x - 1.2, y - 1.4);
    c.globalAlpha = 0.92;
    c.fillText(text, x, y);
    c.globalAlpha = 1;
    return size;
  };
  const tSize = chalk(title, w / 2, h * 0.36, w * 0.84, 66, '#f7f4ea');
  // underline swoosh
  c.strokeStyle = 'rgba(255,214,120,0.85)';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  const uw = Math.min(w * 0.7, c.measureText(title).width * 0.9 + 20);
  c.moveTo(w / 2 - uw / 2, h * 0.36 + tSize * 0.55);
  c.quadraticCurveTo(w / 2, h * 0.36 + tSize * 0.75, w / 2 + uw / 2, h * 0.36 + tSize * 0.5);
  c.stroke();
  if (sub) chalk(sub, w / 2, h * 0.66, w * 0.86, 44, '#ffd6e4');
  // doodles: star, heart, sparkles
  const star = (x: number, y: number, s: number, col: string) => {
    c.strokeStyle = col;
    c.lineWidth = 3.5;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? s * 0.45 : s;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.stroke();
  };
  star(42, 40, 20, 'rgba(255,224,130,0.9)');
  star(w - 40, h - 44, 14, 'rgba(180,230,255,0.85)');
  c.strokeStyle = 'rgba(255,170,190,0.9)';
  c.lineWidth = 4;
  c.beginPath();
  const hx = w - 52, hy = 44;
  c.moveTo(hx, hy + 14);
  c.bezierCurveTo(hx - 24, hy - 2, hx - 10, hy - 20, hx, hy - 6);
  c.bezierCurveTo(hx + 10, hy - 20, hx + 24, hy - 2, hx, hy + 14);
  c.stroke();
  c.strokeStyle = 'rgba(200,255,210,0.8)';
  c.lineWidth = 3;
  for (const [x, y] of [[48, h - 50], [74, h - 34]]) {
    c.beginPath();
    c.moveTo(x - 8, y);
    c.lineTo(x + 8, y);
    c.moveTo(x, y - 8);
    c.lineTo(x, y + 8);
    c.stroke();
  }
  // chalk grain: knock tiny specks out of the strokes
  c.fillStyle = 'rgba(47,63,55,0.55)';
  for (let i = 0; i < 2600; i++) c.fillRect(r.range(0, w), r.range(0, h), r.range(0.8, 2), r.range(0.8, 1.6));
}

function buildChalkboard(root: THREE.Object3D): ChalkboardProp {
  const p = LAYOUT.chalkboard.pos;
  const g = grp(root, [p.x, p.y, p.z], 'chalkboard');
  const W = 0.58, H = 0.43, frame = 0.04;
  const wood = textured('chalkFrame', woodTex('chalkFrame', { w: 256, h: 128, rings: 4, base: '#f0d0a4', contrast: 0.7 }), { color: '#d99e66', roughness: 0.5 });
  const ring = roundedRectShape(W, H, 0.05);
  ring.holes.push(roundedRectPath(W - frame * 2, H - frame * 2, 0.025));
  part(g, softExtrude(ring, 0.032, 0.01, { curveSegs: 5, bevelSegs: 2 }), wood, { pos: [0, 0, -0.01] });
  part(g, rbox(W - frame * 2 + 0.01, H - frame * 2 + 0.01, 0.01, 0.01, 1), matte('#26332d', 0.9), { pos: [0, 0, -0.008], cast: false });
  let title = "Today's Special";
  let sub: string | undefined = 'Anything!';
  const tex = makeCanvasTexture(CHALK_W, CHALK_H, (c) => drawChalk(c, title, sub), { aniso: 8 });
  part(g, new THREE.PlaneGeometry(W - frame * 2, H - frame * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), { pos: [0, 0, 0.0005], cast: false });
  // chalk tray with a stick of chalk and a felt eraser
  part(g, rbox(W * 0.8, 0.016, 0.05, 0.007, 2), wood, { pos: [0, -H / 2 + 0.008, 0.022] });
  part(g, new THREE.CapsuleGeometry(0.0055, 0.04, 4, 10).rotateZ(Math.PI / 2 - 0.15), matte('#fffdf6', 0.9), { pos: [-0.12, -H / 2 + 0.022, 0.03] });
  part(g, new THREE.CapsuleGeometry(0.005, 0.03, 4, 10).rotateZ(Math.PI / 2 + 0.2), matte('#ffd1dc', 0.9), { pos: [-0.06, -H / 2 + 0.021, 0.034] });
  part(g, rbox(0.07, 0.022, 0.03, 0.008, 2), lacquer(PALETTE.butter, 0.5), { pos: [0.13, -H / 2 + 0.027, 0.028] });
  part(g, rbox(0.07, 0.008, 0.03, 0.003, 1), matte('#6a6460', 0.95), { pos: [0.13, -H / 2 + 0.013, 0.028] });
  // hanging string + nail
  part(g, new THREE.TorusGeometry(0.11, 0.0025, 6, 32, Math.PI * 0.7).rotateZ(Math.PI * 0.15), matte('#c9a77a', 0.8), { pos: [0, H / 2 - 0.07, -0.004], cast: false });
  part(g, new THREE.SphereGeometry(0.008, 10, 8), chrome(), { pos: [0, H / 2 + 0.038, -0.002] });

  const c = (tex.image as HTMLCanvasElement | undefined) ?? null;
  const redraw = () => {
    const ctx = c && 'getContext' in c ? (c.getContext('2d') as CanvasRenderingContext2D | null) : null;
    if (!ctx) return;
    drawChalk(ctx, title, sub);
    tex.needsUpdate = true;
  };
  // redraw once the rounded web font arrives (canvas text drawn earlier used a fallback)
  if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts.load(`800 48px 'Baloo 2'`).then(redraw, () => {});
    void document.fonts.ready.then(redraw, () => {});
  }
  return {
    root: g,
    write(t: string, s?: string) {
      title = t;
      sub = s;
      redraw();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Pendant lamps

export interface Pendant {
  group: THREE.Group;
  bulb: THREE.Mesh;
}

let bulbMaterial: THREE.MeshBasicMaterial | null = null;
function bulbMat(): THREE.MeshBasicMaterial {
  return (bulbMaterial ??= new THREE.MeshBasicMaterial({ color: '#fff3d2', toneMapped: false }));
}

/** Dome pendant; pos = bottom centre of the shade. The group pivots at the ceiling line. */
function domePendant(root: THREE.Object3D, pos: [number, number, number], r: number, color: string): Pendant {
  const top = WALL_TOP + 0.2;
  const g = grp(root, [pos[0], top, pos[2]], 'pendant');
  const s = grp(g, [0, pos[1] - top, 0], 'shade');
  const h = r * 0.85;
  const outer = fillet([[r, 0], [r * 0.98, h * 0.25, r * 0.4], [r * 0.6, h * 0.85, r * 0.3], [r * 0.18, h, r * 0.06], [r * 0.12, h]], 5);
  part(s, lathe(outer, 36), lacquer(color, 0.3), { cast: false });
  const inner = fillet([[r * 0.12, h - 0.006], [r * 0.56, h * 0.82, r * 0.3], [r * 0.94, h * 0.24, r * 0.3], [r - 0.004, 0.002]], 5);
  part(s, lathe(inner, 36), enamel('#fff6e6', 0.6), { cast: false });
  part(s, new THREE.TorusGeometry(r, 0.0065, 6, 36).rotateX(Math.PI / 2), lacquer('#fff6e6', 0.3), { pos: [0, 0.002, 0], cast: false });
  part(s, cylB(r * 0.17, r * 0.2, 0.05, 16), chrome(), { pos: [0, h - 0.008, 0], cast: false });
  // cord up to the (invisible) ceiling
  part(s, cylB(0.0055, 0.0055, top - (pos[1] + h + 0.04), 8), enamel('#4a3d3a', 0.5), { pos: [0, h + 0.04, 0], cast: false });
  // a round bulb peeking out under the rim
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 16, 10), bulbMat());
  bulb.position.y = -r * 0.04;
  bulb.castShadow = false;
  bulb.name = 'bulb';
  s.add(bulb);
  return { group: g, bulb };
}

// ---------------------------------------------------------------------------------------------

export interface Fixtures {
  root: THREE.Group;
  chalkboard: ChalkboardProp;
  spiceRack: THREE.Group;
  shelfA: THREE.Group;
  shelfB: THREE.Group;
  lamps: THREE.Object3D[];
  pendants: Pendant[];
  lights: THREE.Light[];
  update(dt: number, time: number): void;
}

export const SHELF_A = { x0: -1.3, x1: -0.06, y: 2.14, depth: 0.22 };
export const SHELF_B = { x0: 1.04, x1: 2.52, y: 2.08, depth: 0.22 };
export const SPICE_RACK_W = 0.5;

export function buildFixtures(): Fixtures {
  const root = new THREE.Group();
  root.name = 'fixtures';
  const clock = buildHood(root);
  buildMicrowaveShelf(root);
  const spiceRack = buildSpiceRack(root, SPICE_RACK_W);
  const shelfA = openShelf(root, SHELF_A.x0, SHELF_A.x1, SHELF_A.y, SHELF_A.depth, [SHELF_A.x0 + 0.16, SHELF_A.x1 - 0.16]);
  const shelfB = openShelf(root, SHELF_B.x0, SHELF_B.x1, SHELF_B.y, SHELF_B.depth, [SHELF_B.x0 + 0.16, SHELF_B.x1 - 0.16]);
  const chalkboard = buildChalkboard(root);

  // posters: cake above the fridge, fruit on the left wall
  const posterFrame = (parent: THREE.Object3D, kind: 'fruit' | 'cake', pos: [number, number, number], rotY: number) => {
    const g = grp(parent, pos, 'poster', [0, rotY, 0]);
    const w = 0.3, h = 0.375;
    const ring = roundedRectShape(w + 0.05, h + 0.05, 0.03);
    ring.holes.push(roundedRectPath(w, h, 0.012));
    part(g, softExtrude(ring, 0.025, 0.007, { curveSegs: 6 }), lacquer(kind === 'cake' ? PALETTE.coral : PALETTE.cabinet, 0.34));
    part(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: posterTex(kind), roughness: 0.7 }), { pos: [0, 0, 0.008], cast: false });
  };
  posterFrame(root, 'cake', [LAYOUT.fridge.pos.x, 2.36, BZ + 0.004], 0);
  posterFrame(root, 'fruit', [LEFT_WALL_X + 0.004, 1.62, -0.42], Math.PI / 2);

  // pendants: the dining lamp (with a warm light) and two over the counter
  const pendants: Pendant[] = [];
  pendants.push(domePendant(root, [LAYOUT.table.pos.x, 1.8, LAYOUT.table.pos.z - 0.04], 0.19, PALETTE.coral));
  pendants.push(domePendant(root, [-0.52, 2.02, -0.5], 0.13, PALETTE.butter));
  pendants.push(domePendant(root, [1.6, 2.0, -0.48], 0.13, PALETTE.butter));
  const lights: THREE.Light[] = [];
  const warm = new THREE.PointLight('#ffd49a', 1.7, 3.4, 2);
  warm.position.set(LAYOUT.table.pos.x, 1.76, LAYOUT.table.pos.z - 0.04);
  warm.castShadow = false;
  root.add(warm);
  lights.push(warm);

  const keep: THREE.Object3D[] = [chalkboard.root, clock.hour, clock.minute, clock.second, ...pendants.map((p) => p.bulb)];
  mergeStatic(root, keep);

  const t0 = 10 * 3600 + 8 * 60 + 20; // starts at 10:08:20
  return {
    root,
    chalkboard,
    spiceRack,
    shelfA,
    shelfB,
    lamps: pendants.map((p) => p.bulb),
    pendants,
    lights,
    update(_dt: number, time: number) {
      const s = t0 + time;
      clock.second.rotation.z = -((Math.floor(s) % 60) / 60) * Math.PI * 2;
      clock.minute.rotation.z = -((s / 60) % 60) / 60 * Math.PI * 2;
      clock.hour.rotation.z = -((s / 3600) % 12) / 12 * Math.PI * 2;
    },
  };
}
