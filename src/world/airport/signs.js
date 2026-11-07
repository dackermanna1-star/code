// =============================================================================
// Airfield signs: internally lit sign boxes on frangible legs with canvas
// texture faces (one atlas per airport, one draw call):
//   location (yellow on black), direction (black on yellow, arrows),
//   mandatory (white on red: runway holding positions), distance remaining
//   (white on black), gate signs on the terminal (white on blue).
// =============================================================================
import * as THREE from 'three';
import { RUNWAY, TAXIWAY_A_Z, TAXILANE_Z, TERMINAL_FACADE_Z, TAXIWAY_WIDTH } from '../layout.js';
import { makeCanvas, mat, PRIM, GeoBuilder } from './util.js';
import { HOLD_LINE_Z } from './pavement.js';
import { JB } from './jetbridge.js';

const PXM = 100;                 // atlas pixels per metre of sign face
const HW = TAXIWAY_WIDTH / 2;
const STYLE = {
  loc: { bg: '#111', fg: '#f2c21b', border: '#f2c21b' },
  dir: { bg: '#f2c21b', fg: '#111' },
  mand: { bg: '#c3161c', fg: '#fff', border: '#111' },
  dist: { bg: '#111', fg: '#fff' },
  gate: { bg: '#0d2f57', fg: '#fff' },
  blank: { bg: '#111', fg: '#111' },
};

class Atlas {
  constructor(w = 2048, h = 2048) {
    [this.canvas, this.ctx] = makeCanvas(w, h);
    this.w = w; this.h = h;
    this.x = 4; this.y = 20; this.rowH = 0;
    this.ctx.fillStyle = '#0c0c0c'; this.ctx.fillRect(0, 0, w, h);
    this.dark = { u0: 1 / w, v0: 1 - 15 / h, u1: 12 / w, v1: 1 - 4 / h };
  }
  alloc(pw, ph) {
    if (this.x + pw + 4 > this.w) { this.x = 4; this.y += this.rowH + 6; this.rowH = 0; }
    const r = { x: this.x, y: this.y, w: pw, h: ph };
    this.x += pw + 6; this.rowH = Math.max(this.rowH, ph);
    return r;
  }
  uv(r) { return { u0: r.x / this.w, u1: (r.x + r.w) / this.w, v1: 1 - r.y / this.h, v0: 1 - (r.y + r.h) / this.h }; }
}

function drawArrow(ctx, cx, cy, s, ang, col) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0); ctx.lineTo(s * 0.05, -s * 0.38); ctx.lineTo(s * 0.05, -s * 0.13); ctx.lineTo(-s * 0.5, -s * 0.13);
  ctx.lineTo(-s * 0.5, s * 0.13); ctx.lineTo(s * 0.05, s * 0.13); ctx.lineTo(s * 0.05, s * 0.38); ctx.closePath();
  ctx.fill();
  ctx.restore();
}
const ARROWS = { '>': 0, '<': Math.PI, '^': -Math.PI / 2, v: Math.PI / 2, '/': -Math.PI / 4, '\\': Math.PI / 4, '{': -3 * Math.PI / 4, '}': 3 * Math.PI / 4 };

/** segments: [{t: 'A2', s: 'loc'}] ; returns face width (m) and atlas rect */
function drawFace(atlas, segments, faceH = 1.0) {
  const ctx = atlas.ctx;
  const segW = segments.map((sg) => {
    let n = 0;
    for (const ch of sg.t) n += ARROWS[ch] !== undefined ? 0.95 : ch === ' ' ? 0.3 : ch === '-' ? 0.4 : 0.62;
    return Math.max(0.9, n * faceH * 0.72 + 0.35);
  });
  const W = segW.reduce((a, b) => a + b, 0);
  const r = atlas.alloc(Math.ceil(W * PXM), Math.ceil(faceH * PXM));
  let x = r.x;
  segments.forEach((sg, i) => {
    const st = STYLE[sg.s];
    const w = segW[i] * PXM, h = r.h;
    ctx.fillStyle = st.bg; ctx.fillRect(x, r.y, w, h);
    if (st.border) { ctx.strokeStyle = st.border; ctx.lineWidth = 5; ctx.strokeRect(x + 9, r.y + 9, w - 18, h - 18); }
    // text with arrows
    const fs = h * 0.66;
    ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = 'middle';
    let tw = 0;
    const parts = [...sg.t].map((ch) => {
      const isA = ARROWS[ch] !== undefined;
      const cw = isA ? fs * 0.95 : ctx.measureText(ch).width;
      tw += cw;
      return { ch, isA, cw };
    });
    let tx = x + (w - tw) / 2;
    for (const p of parts) {
      if (p.isA) drawArrow(ctx, tx + p.cw / 2, r.y + h / 2, fs * 0.85, ARROWS[p.ch], st.fg);
      else { ctx.fillStyle = st.fg; ctx.fillText(p.ch, tx, r.y + h / 2 + fs * 0.04); }
      tx += p.cw;
    }
    x += w;
  });
  return { W, H: faceH, uv: atlas.uv(r) };
}

function boxWithFaces(front, back, dark, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const rect = f === 4 ? front.uv : f === 5 ? (back ? back.uv : dark) : dark;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    }
  }
  return g;
}

export function buildSigns(def) {
  const atlas = new Atlas(2048, 2048);
  const signs = new GeoBuilder({ colors: false });
  const legs = new GeoBuilder();
  /**
   * place a sign: position (x, z) of the panel centre, yaw (rad) so that the front faces
   * direction (sin(yaw)?) – we use the face normal +z rotated by yaw.
   */
  const place = (x, z, faceDir, front, back = null, { y = 1.15, h = 1.0, legsOn = true } = {}) => {
    const F = drawFace(atlas, front, h);
    const Bk = back ? drawFace(atlas, back, h) : null;
    const W = Math.max(F.W, Bk ? Bk.W : 0);
    const yaw = Math.atan2(faceDir[0], faceDir[1]);   // rotate +z onto faceDir
    const g = boxWithFaces(F, Bk, atlas.dark, W, h + 0.12, 0.3);
    signs.add(g, mat(x, y, z, 0, yaw, 0));
    if (legsOn) {
      for (const s of [-1, 1]) {
        const lx = x + Math.cos(yaw) * s * (W / 2 - 0.25), lz = z - Math.sin(yaw) * s * (W / 2 - 0.25);
        legs.add(PRIM.cyl8, mat(lx, (y - h / 2) / 2, lz, 0, 0, 0, 0.07, y - h / 2, 0.07), 0x9a9da0);
        legs.add(PRIM.box, mat(lx, 0.05, lz, 0, 0, 0, 0.35, 0.1, 0.35), 0x8a8a86);
      }
    }
  };
  const ends = (x) => (x <= RUNWAY.x0 + 10 ? '09' : x >= RUNWAY.x1 - 10 ? '27' : '27-09');
  // 1. holding position signs at each runway connector (facing north, both sides)
  for (const c of def.connectors) {
    if (c.to !== 0) continue;
    const rw = ends(c.x);
    place(c.x + HW + 9, HOLD_LINE_Z - 0.5, [0, -1], [{ t: c.id, s: 'loc' }, { t: rw, s: 'mand' }], [{ t: c.id, s: 'loc' }]);
    place(c.x - HW - 9, HOLD_LINE_Z - 0.5, [0, -1], [{ t: rw, s: 'mand' }, { t: c.id, s: 'loc' }], [{ t: c.id, s: 'loc' }]);
  }
  // 2. direction signs on taxiway A before each junction (both directions)
  for (const c of def.connectors) {
    const south = c.to === 0;   // runway connectors are south of A
    if (c.x > RUNWAY.x0 + 30) {
      // eastbound traffic: sign on its left (north), facing west
      place(c.x - 55, TAXIWAY_A_Z - HW - 11, [-1, 0], [{ t: 'A', s: 'loc' }, { t: south ? `${c.id}\\` : `/${c.id}`, s: 'dir' }], [{ t: 'A', s: 'loc' }]);
    }
    if (c.x < RUNWAY.x1 - 30) {
      // westbound traffic: sign on its left (south), facing east
      place(c.x + 55, TAXIWAY_A_Z + HW + 11, [1, 0], [{ t: south ? `{${c.id}` : `${c.id}}`, s: 'dir' }, { t: 'A', s: 'loc' }].map((s, i, a) => (south ? a[i] : a[i])), [{ t: 'A', s: 'loc' }]);
    }
    if (!south) {
      // apron connector at the taxilane: location + direction to A
      place(c.x + HW + 8, def.apron.zMax + 14, [0, -1], [{ t: c.id, s: 'loc' }, { t: 'A v', s: 'dir' }], [{ t: c.id, s: 'loc' }]);
    }
  }
  // rapid exit sign before the high-speed turn-off (left side for 09 landings)
  if (def.rapidExits) for (const e of def.rapidExits) place(e.start[0] - 180, -42, [-1, 0], [{ t: `${e.id}{`, s: 'dir' }], null);
  // 3. distance-remaining signs (thousands of feet): north side for 09, south side for 27
  const ft = 304.8;
  for (let k = 1; k <= 9; k++) {
    const xa = RUNWAY.x1 - k * ft;
    if (xa > RUNWAY.x0 + 100) place(xa, -44, [-1, 0], [{ t: String(k), s: 'dist' }], null, { y: 1.25, h: 1.3 });
    const xb = RUNWAY.x0 + k * ft;
    if (xb < RUNWAY.x1 - 100) place(xb, 44, [1, 0], [{ t: String(k), s: 'dist' }], null, { y: 1.25, h: 1.3 });
  }
  // 4. gate signs on the fixed links (facing the apron) and stand ID boards at the head of stand
  for (const g of def.gates) {
    place(g.x + JB.rotDX, JB.floorY + 3.55, [0, 1], [{ t: g.id, s: 'gate' }], null, { y: JB.floorY + 3.55, h: 1.0, legsOn: false });
    void TERMINAL_FACADE_Z;
  }
  void TAXILANE_Z;
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  const m = new THREE.MeshStandardMaterial({ name: 'apt-signs', map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.55 });
  const group = new THREE.Group();
  group.name = 'signs';
  const sm = new THREE.Mesh(signs.build(), m);
  sm.castShadow = true; sm.receiveShadow = true;
  const lm = new THREE.Mesh(legs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
  group.add(sm, lm);
  return { group, material: m };
}
