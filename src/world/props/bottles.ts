// Seasoning bottles: the spice-shelf props and the HUD spice-drawer icons (same models).
// Chunky toy-like shapes with bold colours and a cream roundel pictogram facing +Z.
// Root origin = bottom centre, bottle upright; `nozzle` = where the seasoning comes out.
// Materials keep metalness low so icons rendered without an environment map stay bright.

import * as THREE from 'three';
import type { SeasoningDef } from '../../food/types';
import type { BottleProp } from './types';
import { PALETTE } from '../palette';
import {
  part, lathe, fillet, puck, rbox, softExtrude, mergeGeo, mergeStatic, lacquer, enamel, matte, canvasTex, textured,
  shade, mixHex, hexRgb, roundRectPath, Rand, type P2,
} from './util';
import { ginghamTex, woodTex, speckleTex } from './textures';

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;
const INK = '#4a3530';
const CREAM = '#fff6e8';

// ---------------------------------------------------------------------------------------------
// Materials

const mats = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = 'bottle:' + key;
    mats.set(key, m);
  }
  return m;
}

/** Soft satin silver: reads as metal in the kitchen but stays light in env-less HUD icons. */
const silver = () => mat('silver', () => new THREE.MeshStandardMaterial({ color: '#e4e9ee', metalness: 0.35, roughness: 0.3 }));

/** Clear glass shell over the (opaque) contents. */
const shellMat = () =>
  mat(
    'shell',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#f3fbff',
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.4,
      }),
  );

const LIQUID = new Set(['hot-sauce', 'soy-sauce', 'olive-oil', 'jam', 'tomato-sauce']);

function contentsMat(def: SeasoningDef): THREE.MeshStandardMaterial {
  return mat('fill:' + def.id, () => {
    const liquid = LIQUID.has(def.id);
    const m = new THREE.MeshStandardMaterial({ map: contentsTex(def), roughness: liquid ? 0.18 : 0.78, metalness: 0 });
    if (def.id === 'olive-oil') {
      m.emissive.set('#5a4a00');
      m.emissiveIntensity = 0.35;
    }
    return m;
  });
}

// ---------------------------------------------------------------------------------------------
// Canvas art: contents grain, label bands, stickers and pictograms

function seedOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return h;
}

function isLight(hex: string): boolean {
  const [r, g, b] = hexRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

const FILL_BASE: Record<string, string> = {
  salt: '#fbfbf8',
  sugar: '#fffdf9',
  sprinkles: '#fff4f8',
  'olive-oil': '#dcc444',
  'hot-sauce': '#e2381b',
  'soy-sauce': '#3a1d0c',
};

function contentsTex(def: SeasoningDef): THREE.Texture {
  return canvasTex(
    'seasonFill:' + def.id,
    256,
    128,
    (c, w, h) => {
      const r = new Rand(seedOf(def.id));
      c.fillStyle = FILL_BASE[def.id] ?? def.color;
      c.fillRect(0, 0, w, h);
      const dots = (n: number, cols: string[], s0: number, s1: number) => {
        for (let i = 0; i < n; i++) {
          c.fillStyle = r.pick(cols);
          c.globalAlpha = r.range(0.55, 1);
          const s = r.range(s0, s1);
          c.beginPath();
          c.ellipse(r.range(0, w), r.range(0, h), s, s * r.range(0.55, 1), r.range(0, Math.PI), 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      };
      switch (def.id) {
        case 'salt':
          dots(520, ['#e2e8ef', '#ffffff', '#d3dce6'], 0.8, 1.8);
          break;
        case 'sugar':
          dots(520, ['#ffffff', '#fbe7ef', '#efeff2'], 0.8, 1.8);
          break;
        case 'cinnamon':
          dots(700, ['#86421f', '#b86a3c', '#c47c4c'], 0.6, 1.4);
          break;
        case 'chili-flakes':
          dots(260, ['#8a1e12', '#e8642a', '#a8261a'], 1.5, 3.6);
          dots(90, ['#f6c94a', '#ffe08a'], 1.2, 2.2);
          break;
        case 'herbs':
          dots(380, ['#2f6a1e', '#7ab84a', '#3d7a26', '#9acb5a'], 1.2, 3.2);
          break;
        case 'sprinkles': {
          const cols = ['#ff5fa8', '#ffd23f', '#5fd3ff', '#7ce08a', '#b9a6f2', '#ff8a74'];
          for (let i = 0; i < 300; i++) {
            c.save();
            c.translate(r.range(0, w), r.range(0, h));
            c.rotate(r.range(0, Math.PI));
            c.fillStyle = r.pick(cols);
            roundRectPath(c, -4.5, -1.5, 9, 3, 1.5);
            c.fill();
            c.restore();
          }
          break;
        }
        case 'tomato-sauce':
          dots(220, ['#a82414', '#e04a30'], 1.5, 4);
          dots(50, ['#3f8a2e', '#5aa83e'], 1, 2);
          break;
        case 'jam':
          dots(150, ['#7a0f28', '#d8405a'], 1.2, 2.6);
          dots(40, ['#ffd48a'], 0.8, 1.4);
          break;
        case 'peanut-butter':
          c.strokeStyle = 'rgba(232,180,110,0.55)';
          c.lineWidth = 3;
          for (let i = 0; i < 18; i++) {
            c.beginPath();
            const y = r.range(0, h);
            c.moveTo(0, y);
            c.bezierCurveTo(w * 0.3, y + r.range(-14, 14), w * 0.6, y + r.range(-14, 14), w, y);
            c.stroke();
          }
          break;
        default: {
          // glossy liquids: a soft vertical sheen
          const g = c.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, 'rgba(255,255,255,0.0)');
          g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
          g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
          c.fillStyle = g;
          c.fillRect(0, 0, w, h);
        }
      }
    },
    { wrap: true },
  );
}

function circ(c: Ctx, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 0.09) {
  ell(c, x, y, r, r, 0, fill, stroke, lw);
}

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill?: string, stroke?: string, lw = 0.09) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function poly(c: Ctx, pts: number[][], fill?: string, stroke?: string, lw = 0.09) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function line(c: Ctx, pts: number[][], stroke: string, lw: number) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.stroke();
}

function leaf(c: Ctx, x: number, y: number, len: number, wid: number, ang: number, fill: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -wid, len, 0);
  c.quadraticCurveTo(len * 0.5, wid, 0, 0);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 0.07;
  c.stroke();
  line(c, [[len * 0.12, 0], [len * 0.78, 0]], 'rgba(255,255,255,0.5)', 0.05);
  c.restore();
}

function sparkle(c: Ctx, x: number, y: number, s: number, col: string) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fillStyle = col;
  c.fill();
}

function cube(c: Ctx, x: number, y: number, s: number, faces: [string, string, string], ink: string) {
  const k = s * 0.87;
  poly(c, [[x, y - s], [x + k, y - s * 0.5], [x, y], [x - k, y - s * 0.5]], faces[0]);
  poly(c, [[x - k, y - s * 0.5], [x, y], [x, y + s], [x - k, y + s * 0.5]], faces[1]);
  poly(c, [[x + k, y - s * 0.5], [x, y], [x, y + s], [x + k, y + s * 0.5]], faces[2]);
  poly(c, [[x, y - s], [x + k, y - s * 0.5], [x + k, y + s * 0.5], [x, y + s], [x - k, y + s * 0.5], [x - k, y - s * 0.5]], undefined, ink, 0.08);
}

function tomato(c: Ctx, x: number, y: number, r: number) {
  ell(c, x, y, r, r * 0.88, 0, '#ec4a36', INK);
  ell(c, x - r * 0.4, y - r * 0.3, r * 0.2, r * 0.12, -0.6, 'rgba(255,255,255,0.7)');
  const cy = y - r * 0.74;
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.12 : r * 0.44;
    pts.push([x + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.62]);
  }
  poly(c, pts, '#4fae4a', INK, 0.06);
}

function flame(c: Ctx, x: number, y: number, s: number, fill: string, stroke?: string) {
  c.beginPath();
  c.moveTo(x, y + 0.8 * s);
  c.bezierCurveTo(x - 0.78 * s, y + 0.8 * s, x - 0.72 * s, y - 0.05 * s, x - 0.28 * s, y - 0.45 * s);
  c.quadraticCurveTo(x - 0.24 * s, y - 0.1 * s, x - 0.06 * s, y - 0.06 * s);
  c.bezierCurveTo(x - 0.16 * s, y - 0.5 * s, x + 0.04 * s, y - 0.82 * s, x + 0.16 * s, y - 0.96 * s);
  c.bezierCurveTo(x + 0.3 * s, y - 0.5 * s, x + 0.78 * s, y - 0.3 * s, x + 0.68 * s, y + 0.3 * s);
  c.bezierCurveTo(x + 0.62 * s, y + 0.66 * s, x + 0.36 * s, y + 0.8 * s, x, y + 0.8 * s);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 0.09;
    c.stroke();
  }
}

/** Pictogram for a seasoning, drawn in a [-1, 1] unit box. */
function drawIcon(c: Ctx, id: string, accent: string) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (id) {
    case 'salt': {
      const f: [string, string, string] = ['#ffffff', '#e4ecf5', '#c6d6e8'];
      cube(c, -0.42, 0.3, 0.36, f, INK);
      cube(c, 0.42, 0.3, 0.36, f, INK);
      cube(c, 0, -0.3, 0.36, f, INK);
      break;
    }
    case 'sugar':
      cube(c, -0.2, 0.18, 0.5, ['#ffffff', '#ffe6ef', '#ffc9dc'], INK);
      sparkle(c, 0.55, -0.5, 0.32, '#f26d9b');
      sparkle(c, 0.62, 0.5, 0.17, '#f7a3c3');
      break;
    case 'pepper':
      leaf(c, -0.18, -0.48, 0.78, 0.3, -0.55, '#6cc36a');
      for (const [x, y] of [[-0.42, 0.3], [0.38, 0.34], [0.02, -0.12]]) {
        circ(c, x, y, 0.31, '#4f3f3a', INK);
        ell(c, x - 0.1, y - 0.11, 0.08, 0.055, -0.6, 'rgba(255,255,255,0.6)');
      }
      break;
    case 'cinnamon':
      for (const [x, a] of [[-0.16, -0.42], [0.2, 0.38]]) {
        c.save();
        c.translate(x, 0.06);
        c.rotate(a);
        roundRectPath(c, -0.21, -0.8, 0.42, 1.6, 0.16);
        c.fillStyle = '#b8682f';
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 0.09;
        c.stroke();
        ell(c, 0, -0.8, 0.21, 0.09, 0, '#7e3f19', INK, 0.06);
        c.beginPath();
        c.arc(0.02, -0.8, 0.07, 0.4, 4.6);
        c.strokeStyle = '#e7a56a';
        c.lineWidth = 0.04;
        c.stroke();
        line(c, [[-0.09, -0.62], [-0.09, 0.62]], 'rgba(255,225,190,0.45)', 0.05);
        c.restore();
      }
      break;
    case 'chili-flakes':
      c.beginPath();
      c.moveTo(-0.52, -0.5);
      c.bezierCurveTo(-0.05, -0.76, 0.46, -0.24, 0.62, 0.74);
      c.bezierCurveTo(0.14, 0.32, -0.5, 0.06, -0.64, -0.38);
      c.closePath();
      c.fillStyle = '#e8432f';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.09;
      c.stroke();
      c.beginPath();
      c.moveTo(-0.3, -0.5);
      c.bezierCurveTo(0, -0.52, 0.24, -0.26, 0.36, 0.12);
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 0.08;
      c.stroke();
      ell(c, -0.6, -0.47, 0.18, 0.12, -0.6, '#5aa83e', INK, 0.07);
      line(c, [[-0.68, -0.53], [-0.8, -0.72], [-0.66, -0.88]], '#3f8a2e', 0.1);
      break;
    case 'herbs':
      c.beginPath();
      c.moveTo(0.05, 0.88);
      c.quadraticCurveTo(0.14, 0.1, -0.04, -0.82);
      c.strokeStyle = '#3f8a2e';
      c.lineWidth = 0.1;
      c.stroke();
      for (const [y, s] of [[0.5, 0.56], [0.1, 0.52], [-0.3, 0.44]]) {
        leaf(c, 0.08, y, s, s * 0.42, -0.62, '#5fb848');
        leaf(c, 0.06, y + 0.06, s, s * 0.42, -Math.PI + 0.62, '#4aa33c');
      }
      leaf(c, -0.03, -0.62, 0.4, 0.18, -Math.PI / 2, '#6cc36a');
      break;
    case 'sprinkles': {
      circ(c, 0, 0, 0.86, '#e9b86e', INK);
      c.beginPath();
      for (let i = 0; i <= 56; i++) {
        const a = (i / 56) * TAU;
        const rr = 0.72 + Math.sin(a * 7) * 0.05;
        if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = '#ff7eb6';
      c.fill();
      circ(c, 0, 0, 0.25, '#fffaf2', INK, 0.08);
      const r = new Rand(11);
      const cols = ['#ffd23f', '#5fd3ff', '#7ce08a', '#ffffff', '#b9a6f2'];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + r.range(-0.1, 0.1);
        const rr = r.range(0.38, 0.6);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr, rot = r.range(0, Math.PI);
        line(c, [[x - Math.cos(rot) * 0.07, y - Math.sin(rot) * 0.07], [x + Math.cos(rot) * 0.07, y + Math.sin(rot) * 0.07]], cols[i % cols.length], 0.075);
      }
      break;
    }
    case 'ketchup':
      tomato(c, 0, 0.1, 0.78);
      break;
    case 'tomato-sauce':
      tomato(c, -0.14, 0.14, 0.66);
      leaf(c, 0.12, -0.32, 0.74, 0.32, -0.45, '#4fae4a');
      break;
    case 'mustard':
      c.save();
      c.rotate(-0.35);
      roundRectPath(c, -0.86, -0.33, 1.72, 0.66, 0.31);
      c.fillStyle = '#f2bc6a';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.09;
      c.stroke();
      roundRectPath(c, -0.98, -0.17, 1.96, 0.34, 0.17);
      c.fillStyle = '#d0603a';
      c.fill();
      c.stroke();
      line(c, Array.from({ length: 9 }, (_, i) => [-0.74 + i * 0.185, i % 2 ? -0.07 : 0.07]), '#ffd23f', 0.11);
      c.restore();
      break;
    case 'mayo': {
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * TAU;
        const rr = 0.78 + Math.sin(a * 5 + 0.6) * 0.07;
        if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9);
        else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9);
      }
      c.closePath();
      c.fillStyle = '#ffffff';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.08;
      c.stroke();
      circ(c, 0.08, -0.04, 0.34, '#ffc63c', INK, 0.08);
      ell(c, -0.02, -0.14, 0.09, 0.06, -0.6, 'rgba(255,255,255,0.75)');
      break;
    }
    case 'hot-sauce':
      flame(c, 0, 0.06, 1, '#ff6b2c', INK);
      flame(c, 0.03, 0.3, 0.52, '#ffd23f');
      break;
    case 'chocolate-syrup':
      roundRectPath(c, -0.62, -0.8, 1.24, 1.6, 0.14);
      c.fillStyle = '#6e3b1e';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.09;
      c.stroke();
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 3; j++) {
          roundRectPath(c, -0.5 + i * 0.52, -0.68 + j * 0.47, 0.46, 0.42, 0.08);
          c.fillStyle = '#8c5130';
          c.fill();
        }
      // foil wrapper on the lower part
      roundRectPath(c, -0.66, 0.2, 1.32, 0.64, 0.12);
      c.fillStyle = accent;
      c.fill();
      c.stroke();
      line(c, [[-0.5, 0.36], [0.5, 0.36]], 'rgba(255,255,255,0.6)', 0.07);
      break;
    case 'honey':
      ell(c, -0.2, -0.46, 0.25, 0.35, -0.35, 'rgba(226,241,255,0.97)', INK, 0.07);
      ell(c, 0.22, -0.5, 0.25, 0.35, 0.35, 'rgba(226,241,255,0.97)', INK, 0.07);
      c.save();
      c.beginPath();
      c.ellipse(0, 0.14, 0.7, 0.5, 0, 0, TAU);
      c.fillStyle = '#ffd23f';
      c.fill();
      c.clip();
      c.fillStyle = INK;
      c.fillRect(-0.3, -0.5, 0.19, 1.3);
      c.fillRect(0.08, -0.5, 0.19, 1.3);
      c.restore();
      ell(c, 0, 0.14, 0.7, 0.5, 0, undefined, INK);
      poly(c, [[-0.68, 0.06], [-0.9, 0.14], [-0.68, 0.22]], INK);
      circ(c, 0.44, 0.04, 0.075, INK);
      c.beginPath();
      c.arc(0.42, 0.2, 0.1, 0.3, 2.6);
      c.strokeStyle = INK;
      c.lineWidth = 0.06;
      c.stroke();
      break;
    case 'soy-sauce':
      c.save();
      c.rotate(-0.5);
      ell(c, 0, 0, 0.92, 0.38, 0, '#8cc63f', INK);
      for (const k of [-0.46, 0, 0.46]) circ(c, k, 0, 0.23, '#b7e06a', INK, 0.05);
      line(c, [[-0.92, 0], [-1.0, -0.1]], '#5a8a2a', 0.08);
      c.restore();
      break;
    case 'olive-oil':
      c.beginPath();
      c.moveTo(-0.86, 0.66);
      c.quadraticCurveTo(-0.1, 0.12, 0.8, -0.72);
      c.strokeStyle = '#8a6a3a';
      c.lineWidth = 0.08;
      c.stroke();
      leaf(c, -0.5, 0.38, 0.5, 0.15, -1.9, '#8fb44a');
      leaf(c, -0.2, 0.15, 0.5, 0.15, 0.55, '#7fa83e');
      leaf(c, 0.25, -0.28, 0.5, 0.15, -2.2, '#8fb44a');
      leaf(c, 0.52, -0.5, 0.45, 0.14, 0.2, '#7fa83e');
      ell(c, 0.05, 0.42, 0.22, 0.29, 0.45, '#6f9a2a', INK);
      ell(c, 0.46, 0.06, 0.2, 0.27, 0.45, '#4f7a1e', INK);
      ell(c, 0.0, 0.34, 0.06, 0.04, 0.4, 'rgba(255,255,255,0.6)');
      break;
    case 'lemon-juice':
      circ(c, 0, 0, 0.86, '#f6d62e', INK);
      circ(c, 0, 0, 0.72, '#fff7c4');
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * TAU;
        c.beginPath();
        c.moveTo(Math.cos(a0 + TAU / 16) * 0.1, Math.sin(a0 + TAU / 16) * 0.1);
        c.arc(0, 0, 0.62, a0 + 0.09, a0 + TAU / 8 - 0.09);
        c.closePath();
        c.fillStyle = '#ffe14d';
        c.fill();
      }
      break;
    case 'jam': {
      c.beginPath();
      c.moveTo(0, 0.86);
      c.bezierCurveTo(-0.96, 0.2, -0.76, -0.6, 0, -0.5);
      c.bezierCurveTo(0.76, -0.6, 0.96, 0.2, 0, 0.86);
      c.fillStyle = '#ee3b4f';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.09;
      c.stroke();
      for (const [x, y] of [[-0.35, -0.2], [0.05, -0.25], [0.4, -0.18], [-0.2, 0.12], [0.22, 0.1], [0, 0.45], [-0.45, 0.15], [0.45, 0.2]]) ell(c, x, y, 0.045, 0.07, 0.3, '#ffe08a');
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        ell(c, Math.cos(a) * 0.2, -0.58 + Math.sin(a) * 0.1 + 0.08, 0.2, 0.08, a, '#4fae4a', INK, 0.05);
      }
      break;
    }
    case 'peanut-butter':
      c.save();
      c.rotate(0.55);
      circ(c, 0, -0.4, 0.47, INK);
      circ(c, 0, 0.38, 0.51, INK);
      circ(c, 0, -0.4, 0.39, '#e9bd84');
      circ(c, 0, 0.38, 0.43, '#e9bd84');
      ell(c, 0, 0, 0.3, 0.2, 0, '#e9bd84');
      for (const [x, y] of [[-0.18, -0.5], [0.12, -0.3], [-0.1, 0.3], [0.2, 0.5], [-0.25, 0.55]]) line(c, [[x - 0.08, y], [x + 0.08, y]], '#c99558', 0.06);
      c.restore();
      break;
    case 'whip': {
      const cream = '#fffaf2', edge = '#9fb4c8';
      ell(c, 0, 0.56, 0.8, 0.27, 0, cream, edge, 0.07);
      ell(c, 0, 0.22, 0.63, 0.25, 0, cream, edge, 0.07);
      ell(c, 0, -0.08, 0.46, 0.21, 0, cream, edge, 0.07);
      poly(c, [[-0.26, -0.16], [0.02, -0.56], [0.26, -0.16]], cream, edge, 0.07);
      circ(c, 0.1, -0.64, 0.2, '#e8434f', INK, 0.07);
      line(c, [[0.14, -0.82], [0.3, -0.98]], '#5a8a2a', 0.07);
      break;
    }
    default:
      circ(c, 0, 0, 0.6, accent, INK);
  }
}

/** Cream roundel with a coloured ring and the pictogram. */
function roundel(c: Ctx, cx: number, cy: number, r: number, ring: string, id: string, accent: string) {
  c.save();
  circ(c, cx, cy, r, '#fffaf2');
  c.lineWidth = r * 0.12;
  c.strokeStyle = ring;
  c.stroke();
  c.translate(cx, cy);
  c.scale(r * 0.66, r * 0.66);
  drawIcon(c, id, accent);
  c.restore();
}

/**
 * Full wrap-around label band. Canvas is 512 wide = 360 degrees around the body; its height is
 * chosen from the band's real proportions so the roundel stays round. Front (+Z) = canvas centre.
 */
function bandTex(def: SeasoningDef, bg: string, circumference: number, height: number): THREE.Texture {
  const H = Math.max(64, Math.min(256, Math.round((512 * height) / circumference)));
  return canvasTex(
    'bottleBand:' + def.id,
    512,
    H,
    (c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const light = isLight(bg);
      const motif = light ? mixHex(def.label, bg, 0.55) : mixHex(bg, '#ffffff', 0.22);
      // small motif repeated around the back
      const r = new Rand(seedOf(def.id) + 3);
      c.fillStyle = motif;
      for (let x = 24; x < w; x += 46) {
        if (Math.abs(x - w / 2) < h * 0.62) continue;
        const y = h / 2 + (Math.floor(x / 46) % 2 ? -h * 0.16 : h * 0.16);
        if (r.next() < 0.5) {
          c.beginPath();
          c.arc(x, y, h * 0.07, 0, TAU);
          c.fill();
        } else sparkle(c, x, y, h * 0.1, motif);
      }
      // piping
      const stripe = light ? def.label : CREAM;
      c.fillStyle = stripe;
      const sh = Math.max(4, h * 0.05);
      c.fillRect(0, h * 0.07, w, sh);
      c.fillRect(0, h * 0.93 - sh, w, sh);
      roundel(c, w / 2, h / 2, h * 0.36, light ? shade(def.label, -0.1) : shade(bg, -0.25), def.id, def.label);
    },
    { wrap: true, aniso: 8 },
  );
}

/** Sticker (rounded rect, transparent outside) with the roundel. Aspect 4:3. */
function stickerTex(def: SeasoningDef): THREE.Texture {
  return canvasTex(
    'bottleSticker:' + def.id,
    256,
    192,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      roundRectPath(c, 8, 8, w - 16, h - 16, 54);
      c.fillStyle = def.label;
      c.fill();
      c.lineWidth = 10;
      c.strokeStyle = CREAM;
      c.stroke();
      roundel(c, w / 2, h / 2, h * 0.34, shade(def.label, -0.22), def.id, def.label);
    },
    { aniso: 8 },
  );
}

function canTex(def: SeasoningDef): THREE.Texture {
  return canvasTex(
    'bottleBand:' + def.id,
    512,
    256,
    (c, w, h) => {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
      // wavy colour band at the bottom + dots
      c.fillStyle = def.label;
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.68 + Math.sin((x / w) * TAU * 4) * h * 0.04);
      c.lineTo(w, h);
      c.closePath();
      c.fill();
      c.fillStyle = mixHex(def.label, '#ffffff', 0.55);
      for (let x = 16; x < w; x += 32) {
        c.beginPath();
        c.arc(x, h * 0.86, 5, 0, TAU);
        c.fill();
      }
      c.fillStyle = mixHex(def.label, '#ffffff', 0.7);
      for (let x = 30; x < w; x += 64) {
        if (Math.abs(x - w / 2) < 70) continue;
        sparkle(c, x, h * 0.3, 12, mixHex(def.label, '#ffffff', 0.45));
      }
      c.fillStyle = PALETTE.coral;
      c.fillRect(0, h * 0.06, w, 6);
      roundel(c, w / 2, h * 0.4, h * 0.25, def.label, def.id, def.label);
    },
    { wrap: true, aniso: 8 },
  );
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

/** Outermost radius of a lathe profile at height y. */
function radiusAt(prof: P2[], y: number): number {
  let best = 0;
  for (let i = 1; i < prof.length; i++) {
    const [ra, ya] = prof[i - 1];
    const [rb, yb] = prof[i];
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    if (y < lo || y > hi || hi - lo < 1e-7) continue;
    const t = (y - ya) / (yb - ya);
    best = Math.max(best, ra + (rb - ra) * t);
  }
  return best;
}

function bandPts(prof: P2[], y0: number, y1: number, off: number, n = 10): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    pts.push([radiusAt(prof, y) + off, y]);
  }
  return pts;
}

/** Opaque contents following the inside of a glass profile, from y0 to the fill level y1. */
function fillContents(root: THREE.Object3D, def: SeasoningDef, prof: P2[], y0: number, y1: number, inset = 0.0022) {
  const pts: P2[] = [[0, y0]];
  for (const [r, y] of bandPts(prof, y0, y1, -inset, 12)) pts.push([Math.max(0.001, r), y]);
  pts.push([0, y1]);
  part(root, lathe(pts, 36), contentsMat(def));
}

function glassShell(root: THREE.Object3D, prof: P2[], segs = 44) {
  part(root, lathe(prof, segs), shellMat(), { order: 3 });
}

/** Full wrap-around label following the body profile between y0 and y1. */
function labelBand(root: THREE.Object3D, def: SeasoningDef, prof: P2[], y0: number, y1: number, bg = def.label, off = 0.0008) {
  const pts = bandPts(prof, y0, y1, off);
  const rMid = radiusAt(prof, (y0 + y1) / 2) + off;
  const tex = bandTex(def, bg, TAU * rMid, y1 - y0);
  part(root, lathe(pts, 48, -Math.PI, TAU), textured('bottleBand:' + def.id, tex, { roughness: 0.42 }), { cast: false });
}

/** Front sticker (4:3) following the body profile. */
function sticker(root: THREE.Object3D, def: SeasoningDef, prof: P2[], y0: number, y1: number, off = 0.0009) {
  const pts = bandPts(prof, y0, y1, off, 8);
  const rMid = radiusAt(prof, (y0 + y1) / 2) + off;
  const half = Math.min(1.45, ((4 / 3) * (y1 - y0)) / (2 * rMid));
  const m = mat('sticker:' + def.id, () => new THREE.MeshStandardMaterial({ map: stickerTex(def), alphaTest: 0.5, roughness: 0.38 }));
  part(root, lathe(pts, 24, -half, half * 2), m, { cast: false });
}

/** Shaker holes: little dark discs on a flat top. */
function holes(root: THREE.Object3D, y: number, ring: number, n: number) {
  const disc = new THREE.CircleGeometry(0.0024, 10).rotateX(-Math.PI / 2);
  const geos = [disc.clone().translate(0, y, 0)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3;
    geos.push(disc.clone().translate(Math.cos(a) * ring, y, Math.sin(a) * ring));
  }
  part(root, mergeGeo(geos), enamel('#3a2f2c', 0.6), { cast: false });
}

/** Vertical grip ridges around a cap. */
function ridges(root: THREE.Object3D, r: number, y0: number, y1: number, n: number, color: string) {
  const geos: THREE.BufferGeometry[] = [];
  const h = y1 - y0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    geos.push(new THREE.CapsuleGeometry(0.0011, Math.max(0.001, h - 0.0022), 2, 5).translate(Math.sin(a) * r, y0 + h / 2, Math.cos(a) * r));
  }
  part(root, mergeGeo(geos), lacquer(color, 0.32), { cast: false });
}

function ringAt(root: THREE.Object3D, r: number, tubeR: number, y: number, m: THREE.Material) {
  part(root, new THREE.TorusGeometry(r, tubeR, 8, 44).rotateX(Math.PI / 2), m, { pos: [0, y, 0], cast: false });
}

function leafGeo(len: number, wid: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.45, wid, len, 0);
  s.quadraticCurveTo(len * 0.45, -wid, 0, 0);
  return softExtrude(s, 0.0026, 0.0011, { curveSegs: 8, bevelSegs: 2 }).translate(0, 0, -0.0013);
}

// ---------------------------------------------------------------------------------------------
// Bottle styles (each returns the nozzle)

/** Classic diner shaker (salt, sugar): glass body, chunky coloured dome cap with holes. */
function dinerShaker(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const R = 0.031;
  const g = fillet([[0, 0], [R - 0.004, 0, 0.004], [R, 0.007, 0.005], [R, 0.07, 0.014], [0.0255, 0.088, 0.008], [0.0245, 0.096]], 5);
  fillContents(root, def, g, 0.004, 0.069);
  glassShell(root, g);
  sticker(root, def, g, 0.022, 0.062);
  const cap = fillet([[0.0252, 0.084], [0.0294, 0.084, 0.002], [0.0304, 0.1, 0.005], [0.0286, 0.117, 0.01], [0.017, 0.1278, 0.004], [0, 0.1278]], 5);
  part(root, lathe(cap, 44), lacquer(def.label, 0.3));
  ringAt(root, 0.0298, 0.0017, 0.0872, silver());
  holes(root, 0.1281, 0.0102, 6);
  return new THREE.Vector3(0, 0.128, 0);
}

/** Spice jar (cinnamon, chili, herbs): straight glass, wrap label, flip-top cap. */
function spiceJar(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const R = 0.0275;
  const g = fillet([[0, 0], [R - 0.004, 0, 0.004], [R, 0.006, 0.004], [R, 0.085, 0.006], [0.024, 0.091, 0.003], [0.024, 0.095]], 5);
  fillContents(root, def, g, 0.004, 0.081);
  glassShell(root, g);
  labelBand(root, def, g, 0.024, 0.068);
  const capCol = def.label;
  part(root, puck(0.0293, 0.031, 0.0065, 44), lacquer(capCol, 0.32), { pos: [0, 0.0885, 0] });
  ringAt(root, 0.0292, 0.0011, 0.1125, enamel(shade(capCol, -0.35), 0.5));
  ridges(root, 0.0293, 0.0915, 0.109, 26, capCol);
  part(root, rbox(0.015, 0.0065, 0.007, 0.0028, 2), lacquer(capCol, 0.32), { pos: [0, 0.1135, 0.0285] });
  return new THREE.Vector3(0, 0.1195, 0);
}

/** Round "bubble" shaker for sprinkles: the colourful contents are the label. */
function bubbleShaker(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const g = fillet([[0, 0], [0.021, 0, 0.005], [0.0355, 0.02, 0.022], [0.0365, 0.054, 0.026], [0.026, 0.086, 0.012], [0.0205, 0.094], [0.0205, 0.1]], 6);
  fillContents(root, def, g, 0.004, 0.078);
  glassShell(root, g, 48);
  sticker(root, def, g, 0.026, 0.058);
  const cap = fillet([[0.0205, 0.091], [0.0248, 0.091, 0.002], [0.026, 0.106, 0.006], [0.0205, 0.12, 0.008], [0, 0.1222]], 5);
  part(root, lathe(cap, 40), lacquer(def.label, 0.3));
  ringAt(root, 0.0252, 0.0016, 0.0935, lacquer(PALETTE.coral, 0.3));
  holes(root, 0.1225, 0.0088, 6);
  return new THREE.Vector3(0, 0.1225, 0);
}

/** Pepper mill: turned walnut body, cream band, dark grinding crown, silver knob. */
function grinder(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const wt = woodTex('mill', { w: 256, h: 128, rings: 3, base: '#f0dcc6', contrast: 0.9 });
  wt.center.set(0.5, 0.5);
  wt.rotation = Math.PI / 2;
  const wood = textured('millWood', wt, { color: '#87553a', roughness: 0.4 });
  const body = fillet([[0, 0], [0.028, 0, 0.004], [0.0305, 0.006, 0.003], [0.0305, 0.017, 0.004], [0.0255, 0.028, 0.01], [0.0255, 0.1, 0.012], [0.0215, 0.112, 0.006], [0.0215, 0.118]], 5);
  part(root, lathe(body, 40), wood);
  labelBand(root, def, body, 0.044, 0.09, '#fff1dc');
  ringAt(root, 0.0304, 0.0018, 0.0115, silver());
  const crown = fillet([[0.0215, 0.114], [0.0272, 0.116, 0.003], [0.0276, 0.136, 0.006], [0.0205, 0.145, 0.005], [0.008, 0.147], [0.008, 0.151]], 5);
  part(root, lathe(crown, 40), lacquer('#3a2f2c', 0.32));
  ridges(root, 0.0277, 0.119, 0.133, 22, '#4a3d3a');
  part(root, new THREE.SphereGeometry(0.0108, 20, 14), silver(), { pos: [0, 0.157, 0] });
  return new THREE.Vector3(0, 0.167, 0);
}

const SQUEEZE: Record<string, { body: string; cap: string; tip: string }> = {
  ketchup: { body: '#d9301f', cap: '#fff4e6', tip: '#e8302a' },
  mustard: { body: '#f7c623', cap: '#fff4e6', tip: '#e8a800' },
  mayo: { body: '#fbf3d6', cap: '#6cc0ee', tip: '#6cc0ee' },
  'chocolate-syrup': { body: '#5a2d16', cap: '#ff9cc0', tip: '#ff9cc0' },
};

/** Diner squeeze bottle (ketchup, mustard, mayo, chocolate). */
function squeeze(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const S = SQUEEZE[def.id] ?? { body: def.color, cap: CREAM, tip: def.label };
  const R = 0.0305;
  const g = fillet([[0, 0], [R - 0.004, 0, 0.005], [R, 0.008, 0.005], [R, 0.09, 0.016], [0.019, 0.11, 0.006], [0.0185, 0.113]], 6);
  part(root, lathe(g, 44), lacquer(S.body, 0.3));
  labelBand(root, def, g, 0.026, 0.078);
  const cap = fillet([[0.018, 0.106], [0.022, 0.106, 0.002], [0.0222, 0.126, 0.004], [0.012, 0.13, 0.003], [0.0115, 0.132]], 5);
  part(root, lathe(cap, 40), lacquer(S.cap, 0.3));
  ridges(root, 0.0223, 0.108, 0.123, 24, S.cap);
  part(root, lathe(fillet([[0.0115, 0.1295], [0.0092, 0.136, 0.003], [0.0042, 0.153, 0.002], [0.0032, 0.1555], [0, 0.1555]], 4), 28), lacquer(S.cap, 0.3));
  part(root, new THREE.SphereGeometry(0.0036, 12, 8), lacquer(S.tip, 0.3), { pos: [0, 0.1558, 0] });
  return new THREE.Vector3(0, 0.159, 0);
}

/** Honey: a squeezy beehive (skep) with a little door and a bee sticker. */
function honeyHive(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const pts: P2[] = [[0, 0], [0.031, 0]];
  const rs = [0.0372, 0.0348, 0.0312, 0.0266, 0.0208];
  const hs = [0.023, 0.021, 0.019, 0.017, 0.014];
  let y = 0.0015;
  rs.forEach((rm, i) => {
    const rg = rm - 0.0042;
    for (let k = i === 0 ? 1 : 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([rg + (rm - rg) * Math.sin(Math.PI * t), y + hs[i] * t]);
    }
    y += hs[i];
  });
  pts.push([0.0135, y + 0.004], [0.0122, y + 0.006]);
  const top = y + 0.006;
  part(root, lathe(pts, 48), mat('honeyBody', () => new THREE.MeshPhysicalMaterial({ color: '#f2ad2c', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 })));
  // entrance hole on the bottom ring
  part(root, new THREE.CircleGeometry(0.0085, 20, 0, Math.PI), enamel('#5a3214', 0.6), { pos: [0, 0.004, 0.0335], rot: [-0.12, 0, 0], cast: false });
  // sticker floats over rings 2-3
  const band: P2[] = [];
  for (let i = 0; i <= 6; i++) band.push([0.0352, 0.026 + (0.03 * i) / 6]);
  const half = ((4 / 3) * 0.03) / (2 * 0.0352);
  part(root, lathe(band, 20, -half, half * 2), mat('sticker:' + def.id, () => new THREE.MeshStandardMaterial({ map: stickerTex(def), alphaTest: 0.5, roughness: 0.38 })), { cast: false });
  // cap + nozzle
  part(root, lathe(fillet([[0.0118, top - 0.003], [0.0136, top - 0.003, 0.002], [0.0138, top + 0.011, 0.004], [0.008, top + 0.014, 0.002], [0.0075, top + 0.0145]], 4), 32), lacquer(CREAM, 0.3));
  part(root, lathe(fillet([[0.0075, top + 0.014], [0.0062, top + 0.019, 0.002], [0.0032, top + 0.03, 0.0015], [0.0026, top + 0.032], [0, top + 0.032]], 4), 24), lacquer(CREAM, 0.3));
  part(root, new THREE.SphereGeometry(0.0032, 12, 8), lacquer('#e8a521', 0.3), { pos: [0, top + 0.032, 0] });
  return new THREE.Vector3(0, top + 0.035, 0);
}

/** Slim hot-sauce bottle with a long neck and a green screw cap. */
function hotSauce(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const g = fillet([[0, 0], [0.019, 0, 0.004], [0.022, 0.006, 0.004], [0.022, 0.07, 0.014], [0.0098, 0.1, 0.012], [0.0088, 0.124], [0.0098, 0.126], [0.0098, 0.128]], 6);
  fillContents(root, def, g, 0.004, 0.113, 0.0017);
  glassShell(root, g, 40);
  labelBand(root, def, g, 0.02, 0.062);
  part(root, lathe(bandPts(g, 0.101, 0.114, 0.0007, 4), 32), lacquer(CREAM, 0.35), { cast: false });
  part(root, puck(0.0118, 0.024, 0.0042, 32), lacquer(def.label, 0.32), { pos: [0, 0.1235, 0] });
  ridges(root, 0.0119, 0.126, 0.144, 18, def.label);
  return new THREE.Vector3(0, 0.148, 0);
}

/** Tall olive-oil bottle with a cork stopper. */
function oilBottle(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const g = fillet([[0, 0], [0.022, 0, 0.005], [0.0245, 0.008, 0.004], [0.0245, 0.09, 0.016], [0.0105, 0.117, 0.012], [0.0096, 0.132], [0.0108, 0.134], [0.0108, 0.136]], 6);
  fillContents(root, def, g, 0.004, 0.108, 0.0018);
  glassShell(root, g, 40);
  labelBand(root, def, g, 0.026, 0.074);
  const cork = textured('cork', speckleTex('cork', '#dcb47e', '#a87a48', 900, [0.5, 1.4]), { roughness: 0.85 });
  part(root, puck(0.0101, 0.021, 0.0035, 24), cork, { pos: [0, 0.129, 0] });
  ringAt(root, 0.011, 0.0012, 0.131, enamel(def.label, 0.4));
  return new THREE.Vector3(0, 0.15, 0);
}

/** Round soy-sauce flask with a red pouring cap (spout to the left, -X). */
function soyFlask(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const g = fillet([[0, 0], [0.026, 0, 0.006], [0.034, 0.015, 0.014], [0.0358, 0.044, 0.022], [0.031, 0.078, 0.02], [0.0135, 0.098, 0.008], [0.0125, 0.106]], 6);
  fillContents(root, def, g, 0.004, 0.08, 0.002);
  glassShell(root, g, 44);
  labelBand(root, def, g, 0.026, 0.062);
  part(root, lathe(fillet([[0.0124, 0.101], [0.0182, 0.101, 0.003], [0.0192, 0.119, 0.008], [0.0085, 0.127, 0.004], [0, 0.127]], 5), 36), lacquer(def.label, 0.3));
  const a = 0.75;
  const dir = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
  const base = new THREE.Vector3(-0.007, 0.121, 0);
  const len = 0.024;
  const mid = base.clone().addScaledVector(dir, len / 2);
  part(root, new THREE.CylinderGeometry(0.0034, 0.0048, len, 16), lacquer(def.label, 0.3), { pos: [mid.x, mid.y, 0], rot: [0, 0, a] });
  const tip = base.clone().addScaledVector(dir, len);
  return tip;
}

/** Lemon-shaped squeezy bottle with a green cap and two leaves. */
function lemonBottle(root: THREE.Group, _def: SeasoningDef): THREE.Vector3 {
  const g = fillet([[0, 0], [0.011, 0, 0.003], [0.027, 0.014, 0.02], [0.0368, 0.046, 0.03], [0.0275, 0.082, 0.02], [0.012, 0.097, 0.006], [0.0078, 0.104]], 8);
  const peel = mat(
    'lemonPeel',
    () => new THREE.MeshPhysicalMaterial({ color: '#f9df3e', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2, bumpMap: speckleTex('lemonDimple', '#808080', '#5a5a5a', 1600, [0.6, 1.5]), bumpScale: 0.8 }),
  );
  part(root, lathe(g, 48), peel);
  const green = lacquer(PALETTE.leaf, 0.32);
  part(root, puck(0.0088, 0.013, 0.003, 24), green, { pos: [0, 0.1, 0] });
  part(root, lathe(fillet([[0.0062, 0.112], [0.0048, 0.118, 0.002], [0.0026, 0.127, 0.001], [0, 0.128]], 3), 20), green);
  const lg = leafGeo(0.03, 0.0085);
  part(root, lg, green, { pos: [0.004, 0.108, 0.002], rot: [0.2, 0, 0.45] });
  part(root, lg, lacquer(PALETTE.leafDark, 0.32), { pos: [-0.003, 0.107, -0.002], rot: [0.3, Math.PI * 0.85, 0.5] });
  return new THREE.Vector3(0, 0.128, 0);
}

/** Glass jar with a lid (tomato sauce, peanut butter). */
function sauceJar(root: THREE.Group, def: SeasoningDef, o: { R: number; H: number; lidH: number; lid: string; fill: number; bandBg: string }): THREE.Vector3 {
  const { R, H } = o;
  const g = fillet([[0, 0], [R - 0.005, 0, 0.005], [R, 0.008, 0.005], [R, H - 0.016, 0.012], [R - 0.005, H - 0.004, 0.004], [R - 0.005, H]], 6);
  fillContents(root, def, g, 0.004, o.fill, 0.0022);
  glassShell(root, g, 48);
  labelBand(root, def, g, H * 0.2, H * 0.72, o.bandBg);
  const lidY = H - 0.007;
  part(root, puck(R - 0.0015, o.lidH, 0.0055, 48), lacquer(o.lid, 0.3), { pos: [0, lidY, 0] });
  ringAt(root, R - 0.0012, 0.0016, lidY + o.lidH * 0.42, enamel(CREAM, 0.4));
  ridges(root, R - 0.0012, lidY + 0.003, lidY + o.lidH * 0.3, 40, o.lid);
  return new THREE.Vector3(0, lidY + o.lidH, 0);
}

/** Jam jar with a gingham cloth cover tied with string. */
function jamJar(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const R = 0.037;
  const g = fillet([[0, 0], [R - 0.004, 0, 0.005], [R, 0.008, 0.005], [R, 0.056, 0.01], [0.032, 0.064, 0.003], [0.032, 0.07]], 6);
  fillContents(root, def, g, 0.004, 0.06);
  glassShell(root, g, 48);
  sticker(root, def, g, 0.014, 0.046);
  part(root, puck(0.0335, 0.012, 0.004, 40), lacquer(def.label, 0.3), { pos: [0, 0.066, 0] });
  // cloth: dome + flared skirt with a wavy hem
  const y = 0.072, r = 0.034;
  const prof = fillet([[r + 0.011, y - 0.022], [r + 0.0022, y - 0.006, 0.004], [r + 0.0022, y + 0.004, 0.006], [r * 0.55, y + 0.018, 0.012], [0, y + 0.02]], 6);
  const cloth = lathe(prof, 64);
  const pos = cloth.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const k = THREE.MathUtils.clamp((y - 0.006 - py) / 0.016, 0, 1);
    if (k <= 0) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    const phi = Math.atan2(x, z);
    const s = 1 + 0.07 * Math.sin(phi * 9) * k;
    pos.setXYZ(i, x * s, py + 0.0035 * Math.cos(phi * 9) * k, z * s);
  }
  cloth.computeVertexNormals();
  const clothMat = mat('jamCloth', () => {
    const gt = ginghamTex(def.label, 'jamCloth').clone();
    gt.repeat.set(6, 1.4);
    gt.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: gt, roughness: 0.85, side: THREE.DoubleSide });
  });
  part(root, cloth, clothMat);
  ringAt(root, r + 0.0026, 0.0016, y - 0.004, matte('#f3e2c0', 0.7));
  part(root, new THREE.SphereGeometry(0.003, 10, 8), matte('#f3e2c0', 0.7), { pos: [0.006, y - 0.006, r + 0.0035] });
  return new THREE.Vector3(0, y + 0.02, 0);
}

/** Whipped-cream aerosol can with a slanted star nozzle (towards -X). */
function whipCan(root: THREE.Group, def: SeasoningDef): THREE.Vector3 {
  const R = 0.029;
  const g = fillet([[0, 0], [R - 0.004, 0, 0.004], [R, 0.006, 0.004], [R, 0.112]], 4);
  part(root, lathe(g, 44), enamel('#fbfaf6', 0.3));
  part(root, lathe(bandPts(g, 0.012, 0.106, 0.0006, 4), 48, -Math.PI, TAU), textured('bottleBand:' + def.id, canTex(def), { roughness: 0.38 }), { cast: false });
  part(root, lathe(fillet([[R, 0.1105], [R + 0.0005, 0.114, 0.002], [0.024, 0.125, 0.01], [0.011, 0.131, 0.003], [0.0105, 0.133]], 5), 44), silver());
  ringAt(root, R + 0.0002, 0.0016, 0.0095, silver());
  part(root, puck(0.0118, 0.015, 0.004, 28), lacquer('#ffffff', 0.3), { pos: [0, 0.13, 0] });
  const a = 0.62;
  const dir = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
  const base = new THREE.Vector3(-0.003, 0.142, 0);
  const len = 0.024;
  const mid = base.clone().addScaledVector(dir, len / 2);
  part(root, new THREE.CylinderGeometry(0.0036, 0.0058, len, 10), lacquer('#ffffff', 0.3), { pos: [mid.x, mid.y, 0], rot: [0, 0, a] });
  const tip = base.clone().addScaledVector(dir, len);
  part(root, new THREE.ConeGeometry(0.0045, 0.006, 6), lacquer(def.label, 0.3), { pos: [tip.x, tip.y, 0], rot: [0, 0, a] });
  return tip.addScaledVector(dir, 0.003);
}

// ---------------------------------------------------------------------------------------------

export function buildBottle(def: SeasoningDef): BottleProp {
  const root = new THREE.Group();
  root.name = 'bottle:' + def.id;
  let nozzle: THREE.Vector3;
  switch (def.bottle) {
    case 'shaker':
      nozzle = def.id === 'sprinkles' ? bubbleShaker(root, def) : def.id === 'salt' || def.id === 'sugar' ? dinerShaker(root, def) : spiceJar(root, def);
      break;
    case 'grinder':
      nozzle = grinder(root, def);
      break;
    case 'squeeze':
      nozzle = def.id === 'honey' ? honeyHive(root, def) : squeeze(root, def);
      break;
    case 'bottle':
      nozzle = def.id === 'lemon-juice' ? lemonBottle(root, def) : def.id === 'soy-sauce' ? soyFlask(root, def) : def.id === 'olive-oil' ? oilBottle(root, def) : hotSauce(root, def);
      break;
    case 'jar':
      nozzle =
        def.id === 'jam'
          ? jamJar(root, def)
          : def.id === 'peanut-butter'
            ? sauceJar(root, def, { R: 0.042, H: 0.074, lidH: 0.024, lid: '#e8432f', fill: 0.065, bandBg: def.label })
            : sauceJar(root, def, { R: 0.034, H: 0.09, lidH: 0.019, lid: def.label, fill: 0.078, bandBg: '#fff3e0' });
      break;
    case 'can':
      nozzle = whipCan(root, def);
      break;
    default:
      nozzle = spiceJar(root, def);
  }
  mergeStatic(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { root, nozzle, height: box.max.y };
}
