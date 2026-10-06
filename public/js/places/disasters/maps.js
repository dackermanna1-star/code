// The island, the sky lobby and the five maps. Every map fills the whole
// island: streets and sidewalks (which never break) laid out in blocks, with
// houses, shops, landmarks, parks, cars, trees and street furniture, all built
// from classic studded bricks in breakable panels (walls in sections, floors in
// tiles, roofs in wedge strips) so disasters can tear them apart piece by piece.
// Each map also says where people spawn and where the bots should run to:
// up high (floods), indoors (acid rain, blizzards) or out in the open.
import * as THREE from 'three';

export const G = 2; // the island's ground level
export const LOBBY = { x: 0, y: 130, z: -178 };

function textTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const texCache = new Map();
/** A painted sign board: text (lines split on \n) on a coloured background. */
function signTex(text, o = {}) {
  const W = 512, H = Math.max(64, Math.min(512, Math.round(W * (o.h || 1) / (o.w || 4))));
  const key = [text, o.bg, o.fg, o.border, H].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const t = textTex(W, H, (x) => {
    x.fillStyle = o.bg || '#1b2a35'; x.fillRect(0, 0, W, H);
    const lw = Math.max(4, H * 0.05);
    x.strokeStyle = o.border || 'rgba(255,255,255,0.7)'; x.lineWidth = lw; x.strokeRect(lw * 1.5, lw * 1.5, W - lw * 3, H - lw * 3);
    const lines = text.split('\n');
    let fs = (H * 0.64) / lines.length;
    const font = () => { x.font = `bold ${fs}px "Arial Black", Arial, sans-serif`; };
    font();
    while (fs > 8 && Math.max(...lines.map((l) => x.measureText(l).width)) > W * 0.84) { fs -= 2; font(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = H / 2 + (i - (lines.length - 1) / 2) * fs * 1.12;
      x.lineWidth = fs * 0.14; x.strokeStyle = 'rgba(0,0,0,0.55)'; x.strokeText(l, W / 2, y);
      x.fillStyle = o.fg || '#fff'; x.fillText(l, W / 2, y);
    });
  });
  texCache.set(key, t);
  return t;
}
function clockTex() {
  if (texCache.has('clock')) return texCache.get('clock');
  const t = textTex(256, 256, (x) => {
    x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#f4efdc'; x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c9a43a'; x.lineWidth = 10; x.stroke();
    x.strokeStyle = '#222';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.lineWidth = i % 3 ? 4 : 9; x.beginPath(); x.moveTo(128 + Math.sin(a) * 88, 128 - Math.cos(a) * 88); x.lineTo(128 + Math.sin(a) * 102, 128 - Math.cos(a) * 102); x.stroke(); }
    x.lineCap = 'round'; x.lineWidth = 10; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 52 * Math.sin(-2.1), 128 - 52 * Math.cos(-2.1)); x.stroke();
    x.lineWidth = 6; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 80 * Math.sin(0.5), 128 - 80 * Math.cos(0.5)); x.stroke();
    x.fillStyle = '#222'; x.beginPath(); x.arc(128, 128, 8, 0, Math.PI * 2); x.fill();
  });
  texCache.set('clock', t);
  return t;
}

/** The island in the sea, and the lobby floating above it. */
export function buildIsland(world) {
  // sea floor, beach, grass
  world.add({ name: 'SeaFloor', size: [3000, 4, 3000], position: [0, -42, 0], color: 138, top: 'Smooth' });
  world.add({ name: 'Beach', size: [252, 6, 252], position: [0, -2, 0], color: 5 });
  world.add({ name: 'Grass', size: [228, 2, 228], position: [0, 1, 0], color: 37 });
  // a ragged coastline: sand spits and rocks around the edge
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, d = 128 + r() * 8;
    const w = 14 + r() * 18;
    world.add({ name: 'Beach', size: [w, 4, w * (0.5 + r() * 0.5)], position: [Math.cos(a) * d, -1.6, Math.sin(a) * d], rotation: [0, r() * 90, 0], color: 5 });
    if (r() < 0.5) world.add({ name: 'Rock', size: [4 + r() * 6, 3 + r() * 5, 4 + r() * 6], position: [Math.cos(a) * (d + 10), 0, Math.sin(a) * (d + 10)], rotation: [r() * 20, r() * 90, r() * 20], color: r() < 0.5 ? 199 : 194 });
  }
  // the lobby: a platform in the sky with a view of the island
  const L = LOBBY;
  world.add({ name: 'Lobby', size: [76, 3, 56], position: [L.x, L.y - 1.5, L.z], color: 199 });
  for (let x = -36; x < 38; x += 8) for (let z = -26; z < 28; z += 8) world.add({ name: 'LobbyTile', size: [8, 0.4, 8], position: [L.x + x + 2, L.y + 0.2, L.z + z + 2], color: ((x + z) / 8) % 2 ? 1 : 194, top: 'Smooth' });
  for (const [x, z, sx, sz] of [[0, -28, 76, 1], [0, 28, 76, 1], [-38, 0, 1, 56], [38, 0, 1, 56]]) {
    world.add({ name: 'Rail', size: [sx, 4, sz], position: [L.x + x, L.y + 2, L.z + z], color: 1, transparency: 0.5 });
    world.add({ name: 'RailTop', size: [sx + (sx > 1 ? 0 : 0.6), 0.6, sz + (sz > 1 ? 0 : 0.6)], position: [L.x + x, L.y + 4.3, L.z + z], color: 194, top: 'Smooth' });
    world.add({ name: 'Barrier', size: [sx, 16, sz], position: [L.x + x, L.y + 12, L.z + z], color: 1, transparency: 1 }); // nobody jumps off
  }
  // the sign and the round board
  const sign = world.add({ name: 'Sign', size: [44, 12, 1], position: [L.x, L.y + 13, L.z - 24], color: 26 });
  sign.addDecal('Back', textTex(1024, 280, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a2a2a'); g.addColorStop(1, '#111'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.font = 'bold 92px Arial Black, Arial'; x.textAlign = 'center';
    x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText('NATURAL DISASTER', w / 2, 120); x.fillStyle = '#ffcc22'; x.fillText('NATURAL DISASTER', w / 2, 120);
    x.strokeText('SURVIVAL', w / 2, 230); x.fillStyle = '#ff5522'; x.fillText('SURVIVAL', w / 2, 230);
  }));
  for (const sx of [-1, 1]) world.add({ name: 'SignPost', size: [1.4, 13, 1.4], position: [L.x + sx * 20, L.y + 6.5, L.z - 24], color: 194 });
  const board = world.add({ name: 'Board', size: [22, 13, 1], position: [L.x - 24, L.y + 7.5, L.z + 24], color: 26 });
  for (const sx of [-1, 1]) world.add({ name: 'Bench', size: [10, 1.2, 3], position: [L.x + sx * 22, L.y + 1.4, L.z - 6], color: 192 });
  for (const [x, z] of [[-32, -20], [32, -20], [-32, 20], [32, 20]]) {
    world.add({ name: 'Planter', size: [6, 3, 6], position: [L.x + x, L.y + 1.5, L.z + z], color: 192 });
    world.add({ name: 'Trunk', size: [1.4, 8, 1.4], position: [L.x + x, L.y + 7, L.z + z], color: 217 });
    world.add({ name: 'Leaves', shape: 'Ball', size: [8, 8, 8], position: [L.x + x, L.y + 13, L.z + z], color: 28 });
  }
  const spawns = [];
  for (const [x, z] of [[-14, 8], [0, 8], [14, 8], [-14, -6], [14, -6], [0, 18]]) spawns.push(world.add({ name: 'SpawnLocation', size: [6, 1.2, 6], position: [L.x + x, L.y + 0.6, L.z + z], color: 194, top: 'Smooth' }));
  return { spawns, board };
}

// --- a kit for building breakable things -------------------------------------------------------------------------
const L = { loose: true }; // furniture, props: the first things to go
const GR = { name: 'Ground', top: 'Smooth' }; // roads and paths: never break
/** Window openings spread along a wall, every ~`every` studs. */
const spread = (a0, a1, every = 8) => { const n = Math.max(1, Math.round((a1 - a0) / every)); return Array.from({ length: n }, (_, i) => a0 + (i + 0.5) * (a1 - a0) / n); };
/** A row of glass panes between a0 and a1 (with mullions between them). */
const panes = (a0, a1, y0, y1, size = 6) => { const n = Math.max(1, Math.round((a1 - a0) / size)), w = (a1 - a0) / n; return Array.from({ length: n }, (_, i) => [a0 + i * w + 0.3, a0 + (i + 1) * w - 0.3, y0, y1, 'glass']); };

/**
 * Build in a local frame: origin at (ox, oz) (and oy up), turned rot degrees
 * about Y. Local -z is the front. T() turns a local point into a world one
 * (for spawns and bot routes); at() makes a kit for something placed inside.
 */
function kit(st, ox = 0, oz = 0, rot = 0, oy = 0) {
  const ra = rot * Math.PI / 180;
  const c = Math.round(Math.cos(ra) * 1e9) / 1e9, s = Math.round(Math.sin(ra) * 1e9) / 1e9;
  const tx = (x, z) => [ox + x * c + z * s, oz - x * s + z * c];
  const P = (size, pos, color, o = {}) => {
    const [wx, wz] = tx(pos[0], pos[2]);
    const r = o.rotation || [0, 0, 0];
    return st.add({ ...o, size, color, position: [wx, pos[1] + oy, wz], rotation: [r[0], r[1] + rot, r[2]] });
  };
  const T = (x, y, z, extra) => { const [wx, wz] = tx(x, z); return extra ? [wx, y + oy, wz, extra] : [wx, y + oy, wz]; };
  const at = (x, z, r = 0, dy = 0) => kit(st, ...tx(x, z), rot + r, oy + dy);
  const B = (x0, x1, y0, y1, z0, z1, color, o) => P([Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color, o);
  /**
   * A wall in panels. axis 'x': it runs along x at z = c; 'z': along z at x = c.
   * open: [[a0, a1, y0, y1, kind]] where kind 'glass' fills the hole with a window.
   */
  const wall = (axis, a0, a1, cc, y0, y1, color, o = {}) => {
    const t = o.t ?? 1, panel = o.panel ?? 6, open = o.open || [];
    const cuts = [a0, a1];
    for (let a = a0 + panel; a < a1 - 0.5; a += panel) cuts.push(a);
    for (const op of open) cuts.push(op[0], op[1]);
    const xs = [...new Set(cuts.map((v) => +v.toFixed(3)))].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
    const piece = (s0, s1, b0, b1, col, extra = {}) => {
      const tt = extra.t ?? t;
      if (axis === 'x') B(s0, s1, b0, b1, cc - tt / 2, cc + tt / 2, col, extra.props);
      else B(cc - tt / 2, cc + tt / 2, b0, b1, s0, s1, col, extra.props);
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i], s1 = xs[i + 1];
      if (s1 - s0 < 0.05) continue;
      const mid = (s0 + s1) / 2;
      const here = open.filter((op) => mid > op[0] && mid < op[1]);
      const ys = [y0, y1];
      for (const op of here) ys.push(Math.max(y0, op[2]), Math.min(y1, op[3]));
      const yy = [...new Set(ys)].sort((p, q) => p - q);
      for (let j = 0; j < yy.length - 1; j++) {
        const b0 = yy[j], b1 = yy[j + 1];
        if (b1 - b0 < 0.05) continue;
        const bm = (b0 + b1) / 2;
        const op = here.find((q) => bm > q[2] && bm < q[3]);
        if (op) { if (op[4] === 'glass') piece(s0, s1, b0, b1, o.glass ?? 45, { t: 0.4, props: { transparency: 0.5, top: 'Smooth', bottom: 'Smooth', name: 'Glass' } }); continue; }
        piece(s0, s1, b0, b1, color, { props: o.props });
      }
    }
  };
  /** A floor in tiles; holes: [[x0, x1, z0, z1]] are left open (tiles are cut to fit around them). */
  const slab = (x0, x1, z0, z1, y0, y1, color, o = {}) => {
    const tile = o.tile ?? 8, holes = o.holes || [];
    const cuts = (a, b, edges) => {
      const cc = [a, b];
      for (let v = a + tile; v < b - 0.5; v += tile) cc.push(v);
      for (const e of edges) if (e > a && e < b) cc.push(e);
      return [...new Set(cc.map((v) => +v.toFixed(3)))].sort((p, q) => p - q);
    };
    const xs = cuts(x0, x1, holes.flatMap((h) => [h[0], h[1]]));
    const zs = cuts(z0, z1, holes.flatMap((h) => [h[2], h[3]]));
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (holes.some((h) => cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3])) continue;
      B(xs[i], xs[i + 1], y0, y1, zs[j], zs[j + 1], color, o.props);
    }
  };
  /** A gable roof (ridge along x) in wedge strips. */
  const gable = (x0, x1, z0, z1, y, h, color, seg = 6) => {
    const d = (z1 - z0) / 2;
    for (let x = x0; x < x1 - 0.01; x += seg) {
      const x2 = Math.min(x1, x + seg);
      P([x2 - x, h, d], [(x + x2) / 2, y + h / 2, z0 + d / 2], color, { shape: 'Wedge' });
      P([x2 - x, h, d], [(x + x2) / 2, y + h / 2, z0 + d * 1.5], color, { shape: 'Wedge', rotation: [0, 180, 0] });
    }
  };
  /** The triangular wall under each end of a gable roof. */
  const gableEnds = (x0, x1, z0, z1, y, h, color) => {
    const d = (z1 - z0) / 2;
    for (const x of [x0, x1]) {
      P([0.8, h, d], [x, y + h / 2, z0 + d / 2], color, { shape: 'Wedge', top: 'Smooth' });
      P([0.8, h, d], [x, y + h / 2, z0 + d * 1.5], color, { shape: 'Wedge', rotation: [0, 180, 0], top: 'Smooth' });
    }
  };
  /** Stairs rising along +z (dir 1) or -z (dir -1) from zStart, width x0..x1. */
  const stairs = (x0, x1, zStart, run, y0, y1, color, dir = 1) => {
    const n = Math.ceil((y1 - y0) / 1.0), d = run / n, rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const za = zStart + dir * i * d, zb = za + dir * d;
      B(x0, x1, y0 + i * rise, y0 + (i + 1) * rise, Math.min(za, zb), Math.max(za, zb), color);
    }
  };
  /** Solid stone steps rising along +x (dir 1) or -x, z0..z1 wide. */
  const stepsX = (z0, z1, xStart, run, y0, y1, color, dir = 1, props) => {
    const n = Math.ceil((y1 - y0) / 1.0), d = run / n, rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const xa = xStart + dir * i * d, xb = xa + dir * d;
      B(Math.min(xa, xb), Math.max(xa, xb), y0, y0 + (i + 1) * rise, z0, z1, color, props);
    }
  };
  const ladder = (x, z, y0, y1) => P([2, y1 - y0, 2], [x, (y0 + y1) / 2, z], 194, { shape: 'Truss', name: 'Ladder' });
  const tree = (x, z, h = 10, leaf = 28) => {
    B(x - 0.8, x + 0.8, G, G + h, z - 0.8, z + 0.8, 217, L);
    P([h * 0.9, h * 0.9, h * 0.9], [x, G + h + h * 0.25, z], leaf, { shape: 'Ball', loose: true });
    P([h * 0.6, h * 0.6, h * 0.6], [x + h * 0.3, G + h - 1, z + 1], leaf, { shape: 'Ball', loose: true });
  };
  const pine = (x, z, h = 16) => {
    B(x - 0.7, x + 0.7, G, G + h * 0.5, z - 0.7, z + 0.7, 217, L);
    [[1, 0.28], [0.74, 0.5], [0.5, 0.7], [0.26, 0.88]].forEach(([f, y], i) => { const q = h * 0.55 * f; P([q, h * 0.2, q], [x, G + h * y, z], 141, { rotation: [0, i % 2 ? 45 : 0, 0], loose: true }); });
  };
  const bush = (x, z, r = 3, col = 37) => P([r * 2, r * 2, r * 2], [x, G + r * 0.6, z], col, { shape: 'Ball', loose: true });
  const palm = (x, z, h = 16) => {
    for (let i = 0; i < h / 4; i++) B(x - 0.7 + i * 0.25, x + 0.7 + i * 0.25, G + i * 4, G + i * 4 + 4, z - 0.7, z + 0.7, 217, L);
    const px = x + (h / 4) * 0.25, py = G + h;
    for (let k = 0; k < 6; k++) { const a = k * 60; P([9, 0.4, 2.2], [px + Math.cos(a * Math.PI / 180) * 4, py - 0.8, z + Math.sin(a * Math.PI / 180) * 4], 37, { rotation: [0, -a, -18], loose: true }); }
    P([1.6, 1.6, 1.6], [px + 0.6, py - 1.4, z + 0.6], 217, { shape: 'Ball', loose: true });
  };
  /** A car, pointing along local +z when ry = 0. */
  const car = (x, z, ry, color, o = {}) => {
    const k = at(x, z, ry);
    k.B(-3, 3, G + 0.6, G + 2.6, -6, 6, color, L); // body
    k.B(-2.8, 2.8, G + 2.6, G + 4.4, -2.4, 3.6, color, L); // cabin
    k.B(-2.7, 2.7, G + 2.7, G + 4.2, -2.6, -2.4, 42, { loose: true, transparency: 0.3 }); // windscreen
    k.B(-2.4, -1, G + 1.6, G + 2.4, 5.95, 6.15, 24, L); k.B(1, 2.4, G + 1.6, G + 2.4, 5.95, 6.15, 24, L); // headlights
    for (const [wx, wz] of [[-2.8, -3.8], [2.8, -3.8], [-2.8, 3.8], [2.8, 3.8]]) k.P([1, 2.2, 2.2], [wx, G + 1.1, wz], 26, { shape: 'Cylinder', loose: true });
    if (o.siren) { k.B(-2, 2, G + 4.4, G + 5, -0.6, 0.6, 21, { loose: true, material: 'Neon' }); k.B(-1, 1, G + 4.4, G + 5, -0.6, 0.6, 23, { loose: true, material: 'Neon' }); }
  };
  /** A picket fence from (x0, z0) to (x1, z1) (straight along x or z), with gaps [[a0, a1]] along it. */
  const fence = (x0, z0, x1, z1, color = 1, gaps = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 8));
    const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    let last = false;
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      const s0 = along ? Math.min(ax, bx) : Math.min(az, bz), s1 = along ? Math.max(ax, bx) : Math.max(az, bz);
      last = false;
      if (gaps.some(([g0, g1]) => s1 > g0 + 0.5 && s0 < g1 - 0.5)) continue;
      for (const y of [G + 1, G + 2.6]) {
        if (along) B(s0, s1, y, y + 0.6, az - 0.2, az + 0.2, color, L);
        else B(ax - 0.2, ax + 0.2, y, y + 0.6, s0, s1, color, L);
      }
      B(ax - 0.35, ax + 0.35, G, G + 4, az - 0.35, az + 0.35, color, L);
      last = true;
    }
    if (last) B(x1 - 0.35, x1 + 0.35, G, G + 4, z1 - 0.35, z1 + 0.35, color, L);
  };
  /** An octagonal ring of wall panels (towers, tanks) of radius r. */
  const octagon = (cx, cz, r, y0, y1, color, o = {}) => {
    const w = 2 * r * Math.tan(Math.PI / 8) + 0.3;
    for (let k = 0; k < 8; k++) {
      if (o.skip?.includes(k)) continue;
      const a = k * Math.PI / 4;
      const col = Array.isArray(color) ? color[k % color.length] : color;
      P([w, y1 - y0, o.t ?? 1], [cx + Math.sin(a) * r, (y0 + y1) / 2, cz + Math.cos(a) * r], col, { rotation: [0, a * 180 / Math.PI, 0], ...(o.props || {}) });
    }
  };
  /** A street lamp; its arm reaches out along local +z (turned by ry). */
  const lamp = (x, z, ry = 0) => {
    const k = at(x, z, ry);
    k.B(-0.8, 0.8, G, G + 1, -0.8, 0.8, 199, L);
    k.B(-0.35, 0.35, G + 1, G + 14, -0.35, 0.35, 26, L);
    k.B(-0.3, 0.3, G + 13.4, G + 14, 0.35, 3.4, 26, L);
    k.B(-0.8, 0.8, G + 12.8, G + 13.4, 1.8, 3.6, 24, { loose: true, material: 'Neon' });
  };
  const bench = (x, z, ry = 0, col = 192) => {
    const k = at(x, z, ry);
    k.B(-3, 3, G + 1.6, G + 2.1, -0.9, 0.9, col, L); k.B(-3, 3, G + 2.1, G + 4.2, 0.6, 1.1, col, L);
    for (const a of [-2.4, 2.4]) k.B(a - 0.3, a + 0.3, G, G + 1.6, -0.7, 0.7, 26, L);
  };
  const hydrant = (x, z) => { P([2.6, 1.4, 1.4], [x, G + 1.3, z], 21, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true }); P([1.3, 1.3, 1.3], [x, G + 2.8, z], 21, { shape: 'Ball', loose: true }); };
  const trash = (x, z, col = 141) => P([3.2, 2.2, 2.2], [x, G + 1.6, z], col, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true });
  const mailbox = (x, z) => { B(x - 0.3, x + 0.3, G, G + 4, z - 0.3, z + 0.3, 192, L); B(x - 0.8, x + 0.8, G + 4, G + 5.4, z - 1.2, z + 1.2, 23, L); };
  const barrel = (x, z, col = 21, y = G) => P([3, 2.4, 2.4], [x, y + 1.5, z], col, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true, userData: { tank: true, small: true } });
  const crate = (x, z, sz = 4, y = G, col = 192) => B(x - sz / 2, x + sz / 2, y, y + sz, z - sz / 2, z + sz / 2, col, L);
  /** A sign board facing local -z, with painted text. */
  const sign = (x, y, z, w, h, text, o = {}) => {
    const p = P([w, h, o.t ?? 0.6], [x, y, z], o.color ?? 26, { name: 'Sign', loose: o.loose, rotation: o.rotation });
    st.detach(p);
    p.addDecal('Front', o.tex || signTex(text, { ...o, w, h }));
    return p;
  };
  return { st, P, B, T, at, tx, rot, wall, slab, gable, gableEnds, stairs, stepsX, ladder, tree, pine, bush, palm, car, fence, octagon, lamp, bench, hydrant, trash, mailbox, barrel, crate, sign };
}

/** Streets, sidewalks, paths and paved areas (all unbreakable). */
function ground(st) {
  const k = kit(st);
  const SW = 4;
  const minus = (a0, a1, cuts) => {
    let segs = [[a0, a1]];
    for (const [c0, c1] of cuts) {
      const out = [];
      for (const [s0, s1] of segs) {
        if (c1 <= s0 || c0 >= s1) { out.push([s0, s1]); continue; }
        if (c0 > s0) out.push([s0, c0]);
        if (c1 < s1) out.push([c1, s1]);
      }
      segs = out;
    }
    return segs.filter(([a, b]) => b - a > 0.2);
  };
  /** hs run along x: [z0, z1, x0, x1]; vs run along z: [x0, x1, z0, z1]. Sidewalks either side unless walk: false. */
  const roads = (hs, vs, o = {}) => {
    const y = G + (o.y || 0), walk = o.walk !== false;
    const dash = (x0, x1, z0, z1) => k.B(x0, x1, y + 0.2, y + 0.24, z0, z1, 24, { ...GR, canCollide: false });
    const zebra = (x0, x1, z0, z1, alongX) => {
      if (alongX) for (let x = x0 + 1; x < x1 - 1.5; x += 2.5) k.B(x, x + 1.2, y + 0.2, y + 0.24, z0, z1, 1, { ...GR, canCollide: false });
      else for (let z = z0 + 1; z < z1 - 1.5; z += 2.5) k.B(x0, x1, y + 0.2, y + 0.24, z, z + 1.2, 1, { ...GR, canCollide: false });
    };
    for (const [z0, z1, x0, x1] of hs) {
      k.B(x0, x1, y, y + 0.2, z0, z1, 199, GR);
      const cross = vs.filter((v) => v[2] < z1 && v[3] > z0).map((v) => [v[0] - 6, v[1] + 6]);
      const zm = (z0 + z1) / 2;
      for (let x = x0 + 3; x < x1 - 6; x += 12) if (!cross.some(([a, b]) => x + 5 > a && x < b)) dash(x, x + 5, zm - 0.3, zm + 0.3);
      for (const v of vs.filter((v) => v[2] < z1 && v[3] > z0)) { if (v[0] - 5 > x0) zebra(v[0] - 4.5, v[0] - 0.5, z0, z1, false); if (v[1] + 5 < x1) zebra(v[1] + 0.5, v[1] + 4.5, z0, z1, false); }
      if (walk) for (const [a, b] of [[z0 - SW, z0], [z1, z1 + SW]]) for (const [s0, s1] of minus(x0, x1, vs.filter((v) => v[2] < b && v[3] > a).map((v) => [v[0], v[1]]))) k.B(s0, s1, y, y + 0.5, a, b, 194, { name: 'Ground' });
    }
    for (const [x0, x1, z0, z1] of vs) {
      const crossed = hs.filter((h) => h[2] < x1 && h[3] > x0);
      const xm = (x0 + x1) / 2;
      for (const [s0, s1] of minus(z0, z1, crossed.map((h) => [h[0], h[1]]))) {
        k.B(x0, x1, y, y + 0.2, s0, s1, 199, GR);
        for (let z = s0 + 7; z < s1 - 8; z += 12) dash(xm - 0.3, xm + 0.3, z, z + 5);
      }
      if (walk) for (const [a, b] of [[x0 - SW, x0], [x1, x1 + SW]]) for (const [s0, s1] of minus(z0, z1, hs.filter((h) => h[2] < b && h[3] > a).map((h) => [h[0] - SW, h[1] + SW]))) k.B(a, b, y, y + 0.5, s0, s1, 194, { name: 'Ground' });
    }
  };
  const pad = (x0, x1, z0, z1, color = 194, h = 0.3, o = {}) => k.B(x0, x1, G, G + h, z0, z1, color, { name: 'Ground', ...o });
  /** Parking bay lines across z0..z1, every `step` along x. */
  const stalls = (x0, x1, z0, z1, step = 8, h = 0.3) => { for (let x = x0; x <= x1 + 0.01; x += step) k.B(x - 0.2, x + 0.2, G + h, G + h + 0.04, z0, z1, 1, { ...GR, canCollide: false }); };
  return { ...k, roads, pad, stalls };
}

/** Collects the bot routes of everything on a map. */
function routes() {
  const R = { high: [], inside: [], add(r) { if (r?.high) R.high.push(...r.high); if (r?.inside) R.inside.push(...r.inside); return r; } };
  return R;
}

// --- buildings ---------------------------------------------------------------------------------------------------
/** A house of one or two storeys with a gable roof. Opts: w, d, floors, wall, roof, trim, door, path, drive (-1/1), car, yard, fence. */
function house(k, o = {}) {
  const { B, T, wall, slab, gable, gableEnds, stairs, car, mailbox, fence } = k;
  const w = o.w ?? 20, d = o.d ?? 16, F = o.floors ?? 1, WC = o.wall ?? 1, H = 11, dx = o.door ?? 0;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const win = (a, y) => [a - 2, a + 2, y + 3, y + 8, 'glass'];
  slab(x0, x1, z0, z1, G, G + 0.4, o.floor ?? 18, { props: { top: 'Smooth' } });
  for (let f = 0; f < F; f++) {
    const y0 = G + f * (H + 1), y1 = y0 + H;
    const front = spread(x0, x1).filter((a) => f || Math.abs(a - dx) >= 4.5).map((a) => win(a, y0));
    if (!f) front.push([dx - 2, dx + 2, G, G + 8, 'door']);
    wall('x', x0, x1, z0, y0, y1, WC, { open: front });
    wall('x', x0, x1, z1, y0, y1, WC, { open: spread(x0, x1).map((a) => win(a, y0)) });
    wall('z', z0, z1, x0, y0, y1, WC, { open: spread(z0, z1).map((a) => win(a, y0)) });
    wall('z', z0, z1, x1, y0, y1, WC, { open: spread(z0, z1).map((a) => win(a, y0)) });
    if (f < F - 1) slab(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, y1, y1 + 1, 194, { holes: [[x1 - 5, x1 - 0.5, z0 + 1, z0 + 12.5]], props: { top: 'Smooth' } });
  }
  if (F > 1) stairs(x1 - 4.5, x1 - 0.5, z0 + 1.5, 11, G + 0.4, G + H + 1, 192, 1);
  const top = G + F * (H + 1) - 1, rh = o.roofH ?? Math.round(d * 0.42);
  slab(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, top, top + 0.6, o.trim ?? 1, { tile: 10 });
  gable(x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 1.5, top + 0.6, rh, o.roof ?? 21);
  gableEnds(x0 + 0.1, x1 - 0.1, z0 + 0.4, z1 - 0.4, top + 0.6, rh - 0.8, WC);
  if (o.chimney !== false) B(x0 + 3, x0 + 6, top - 1, top + rh + 2, 1, 4, 192);
  // furniture
  const sofa = o.sofa ?? 23;
  B(x0 + 1.5, x0 + 9, G + 0.4, G + 2.4, z1 - 3.6, z1 - 1, sofa, L); B(x0 + 1.5, x0 + 9, G + 2.4, G + 4.6, z1 - 1.6, z1 - 0.6, sofa, L);
  B(x0 + 3, x0 + 7.5, G + 0.4, G + 2, z1 - 8, z1 - 5.5, 192, L);
  B(x0 + 2, x0 + 7, G + 0.4, G + 2.6, z0 + 0.6, z0 + 2, 192, L); B(x0 + 2.5, x0 + 6.5, G + 2.6, G + 5.4, z0 + 1, z0 + 1.5, 26, L);
  const kx = F > 1 ? x1 - 5.5 : x1 - 0.6;
  B(kx - 6, kx, G + 0.4, G + 4, z1 - 3, z1 - 0.6, 1, L); B(kx - 6, kx, G + 4, G + 4.4, z1 - 3.2, z1 - 0.5, 194, L);
  if (F > 1) {
    const y = G + H + 1;
    B(x0 + 1, x0 + 7, y, y + 2, z1 - 8, z1 - 0.6, o.bed ?? 21, L); B(x0 + 1, x0 + 2, y, y + 4, z1 - 8, z1 - 0.6, 192, L);
    B(x1 - 12, x1 - 7, y, y + 3.5, z1 - 2.6, z1 - 0.6, 192, L);
  } else B(x1 - 7, x1 - 1, G + 0.4, G + 2.4, z0 + 1, z0 + 7.5, o.bed ?? 21, L);
  // porch, path, driveway, mailbox, back yard
  B(dx - 3, dx + 3, G, G + 0.5, z0 - 3, z0 - 0.5, 194);
  if (o.path) { B(dx - 1.5, dx + 1.5, G, G + 0.15, z0 - o.path, z0 - 3, 5, GR); mailbox(dx + 3.5, z0 - o.path + 1.5); }
  if (o.drive) {
    const sx = o.drive > 0 ? x1 + 2 : x0 - 10;
    B(sx, sx + 8, G, G + 0.15, z0 - (o.path || 6), z0 + 8, 199, GR);
    if (o.car != null) car(sx + 4, z0 + 1, 0, o.car);
  }
  if (o.yard) {
    const yz = z1 + o.yard, fx0 = x0 - (o.drive < 0 ? 11 : 3), fx1 = x1 + (o.drive > 0 ? 11 : 3);
    fence(fx0, z0 + 2, fx0, yz, o.fence ?? 1); fence(fx0, yz, fx1, yz, o.fence ?? 1); fence(fx1, yz, fx1, z0 + 2, o.fence ?? 1);
  }
  const door = [T(dx, G, z0 - 5), T(dx, G, z0 + 2.5)];
  return {
    inside: [[...door, T(x0 + 5, G, 0)]],
    high: F > 1 ? [[...door, T(x1 - 2.5, G, z0 + 0.9), T(x1 - 2.5, G + H + 1, z0 + 13.5), T(x0 + 5, G + H + 1, 1)]] : [],
  };
}

/** A shop: a glass front with a sign (and maybe an awning), a flat roof with a ladder up the back. */
function shop(k, o = {}) {
  const { P, B, T, wall, slab, sign, ladder } = k;
  const w = o.w ?? 24, d = o.d ?? 18, h = o.h ?? 13, WC = o.wall ?? 5, TR = o.trim ?? WC;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, gt = G + h - 4.2;
  slab(x0, x1, z0, z1, G, G + 0.4, o.floor ?? 1, { props: { top: 'Smooth' } });
  wall('x', x0, x1, z0, G, G + h, WC, { open: [[-2.5, 2.5, G, Math.min(G + 8, gt), 'door'], ...panes(x0 + 1, -3, G + 1.5, gt), ...panes(3, x1 - 1, G + 1.5, gt)], glass: o.glass ?? 45 });
  wall('x', x0, x1, z1, G, G + h, WC, { open: [[x1 - 7, x1 - 3, G, G + 8, 'door']] });
  wall('z', z0, z1, x0, G, G + h, WC, { open: panes(z0 + 3, z1 - 3, G + 3, G + 8, 8), glass: o.glass ?? 45 });
  wall('z', z0, z1, x1, G, G + h, WC);
  slab(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, G + h, G + h + 1, 199, { tile: 10 });
  // a parapet (with a gap where the ladder comes up)
  const py0 = G + h + 1, py1 = G + h + 2.4;
  B(x0 - 0.5, x1 + 0.5, py0, py1, z0 - 0.5, z0 + 0.5, TR);
  B(x0 - 0.5, x0 + 1.6, py0, py1, z1 - 0.5, z1 + 0.5, TR); B(x0 + 4.4, x1 + 0.5, py0, py1, z1 - 0.5, z1 + 0.5, TR);
  B(x0 - 0.5, x0 + 0.5, py0, py1, z0 + 0.5, z1 - 0.5, TR); B(x1 - 0.5, x1 + 0.5, py0, py1, z0 + 0.5, z1 - 0.5, TR);
  if (o.text) sign(0, G + h - 2.1, z0 - 0.85, Math.min(w - 4, 26), 3, o.text, { bg: o.bg, fg: o.fg });
  if (o.awning != null) {
    for (let i = 0, a = x0 + 1; a < x1 - 1.01; a += 3, i++) {
      const aw = Math.min(3, x1 - 1 - a);
      P([aw, 0.3, 4.5], [a + aw / 2, gt - 0.2, z0 - 2.4], i % 2 ? 1 : o.awning, { rotation: [-16, 0, 0], loose: true });
    }
  }
  // inside
  if (o.inner === 'diner') {
    for (const z of spread(z0 + 2, z1 - 5, 7)) { B(x0 + 1, x0 + 5, G + 0.4, G + 3, z - 1.1, z + 1.1, 1, L); B(x0 + 1, x0 + 5, G + 0.4, G + 2.2, z - 3, z - 1.8, 21, L); B(x0 + 1, x0 + 5, G + 0.4, G + 2.2, z + 1.8, z + 3, 21, L); }
    B(3, x1 - 2, G + 0.4, G + 4, z1 - 7, z1 - 5, 21, L); B(3, x1 - 2, G + 4, G + 4.4, z1 - 7.2, z1 - 4.8, 1, L);
    for (const x of spread(3, x1 - 2, 3.5)) P([1.6, 2.6, 1.6], [x, G + 1.7, z1 - 9], 26, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true });
  } else if (o.inner === 'office') {
    for (const [x, z] of [[x0 + 5, z0 + 5], [x0 + 5, z1 - 5], [x1 - 6, z1 - 5]]) { B(x - 2.5, x + 2.5, G + 0.4, G + 3.4, z - 1.5, z + 1.5, 192, L); B(x - 1, x + 1, G + 3.4, G + 5, z - 0.4, z, 26, L); }
    B(2, x1 - 2, G + 0.4, G + 4, z0 + 3, z0 + 5, 194, L);
  } else {
    for (const x of spread(x0 + 3, x1 - 8, 7)) B(x - 0.8, x + 0.8, G + 0.4, G + 7, -2, z1 - 5, 192, L);
    B(x1 - 7, x1 - 1, G + 0.4, G + 4, z0 + 3, z0 + 5, 192, L); B(x1 - 5, x1 - 3, G + 4, G + 5.4, z0 + 3.4, z0 + 4.6, 26, L);
  }
  B(-3, 3, G + h + 1, G + h + 4, 0, 4, 194, L); // the air conditioner on the roof
  ladder(x0 + 3, z1 + 1.5, G, G + h + 1.8);
  return {
    inside: [[T(0, G, z0 - 5), T(0, G, z0 + 2.5), T(x0 + 3, G, z0 + 4)]],
    high: [[T(x0 + 3, G, z1 + 5), T(x0 + 3, G + h + 1, z1 + 1.5, 'climb'), T(x0 + 4, G + h + 1, z1 - 4)]],
  };
}

/** A block of flats (or offices): storeys of windows, switchback stairs all the way to the roof. */
function apartments(k, o = {}) {
  const { P, B, T, wall, slab, stairs, sign } = k;
  const w = o.w ?? 28, d = o.d ?? 20, N = o.floors ?? 3, F = o.storey ?? 11, WC = o.wall ?? 192, TR = o.trim ?? 1;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const A = [x1 - 5, x1 - 1], C = [x1 - 10, x1 - 6]; // the two stair columns
  slab(x0, x1, z0, z1, G, G + 0.4, o.floor ?? 194, { props: { top: 'Smooth' } });
  const route = [T(0, G, z0 - 5), T(0, G, z0 + 2.5)];
  for (let f = 0; f < N; f++) {
    const y = G + f * F, yb = y + (f ? 0 : 0.4), y1 = y + F;
    const wins = (a0, a1) => spread(a0, a1, 7).map((a) => [a - 1.8, a + 1.8, y + 3, y + 8, 'glass']);
    const front = wins(x0, x1).filter((q) => f || q[1] < -3.5 || q[0] > 3.5);
    if (!f) front.push([-3, 3, yb, y + 8.6, 'door']);
    wall('x', x0, x1, z0, yb, y1 - 1, WC, { open: front, panel: 8, glass: o.glass });
    wall('x', x0, x1, z1, yb, y1 - 1, WC, { open: wins(x0, x1), panel: 8, glass: o.glass });
    wall('z', z0, z1, x0, yb, y1 - 1, WC, { open: wins(z0, z1), panel: 8, glass: o.glass });
    wall('z', z0, z1, x1, yb, y1 - 1, WC, { open: wins(z0, z1), panel: 8, glass: o.glass });
    const col = f % 2 ? C : A;
    slab(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, y1 - 1, y1, f === N - 1 ? 199 : TR, { tile: 8, holes: [[col[0] - 0.4, col[1] + 0.4, z0 + 2, z0 + 13]], props: { top: 'Smooth' } });
    if (f % 2 === 0) { stairs(A[0], A[1], z0 + 2, 11, yb, y1, 26, 1); route.push(T(A[0] + 2, y, z0 + 1.2), T(A[0] + 2, y1, z0 + 13.8)); }
    else { stairs(C[0], C[1], z0 + 13, 11, y, y1, 26, -1); route.push(T(C[0] + 2, y, z0 + 13.8), T(C[0] + 2, y1, z0 + 1.4)); }
    // furniture
    if (f === 0) { B(x0 + 3, x0 + 11, yb, yb + 3.6, z0 + 4, z0 + 6, o.desk ?? 192, L); P([3, 3, 3], [x0 + 2.5, yb + 1.5, z1 - 2.5], 37, { shape: 'Ball', loose: true }); }
    else {
      B(x0 + 1.5, x0 + 8, yb, yb + 2, z1 - 3.5, z1 - 1, o.sofa ?? 23, L); B(x0 + 1.5, x0 + 8, yb + 2, yb + 4.2, z1 - 1.6, z1 - 0.6, o.sofa ?? 23, L);
      B(x0 + 3, x0 + 7, yb, yb + 2.6, -1.5, 1.5, 192, L);
      B(-6, -0.5, yb, yb + 2, z0 + 1, z0 + 8, f % 2 ? 23 : 21, L);
    }
  }
  const top = G + N * F;
  for (const [a0, a1, b0, b1] of [[x0 - 0.5, x1 + 0.5, z0 - 0.5, z0 + 0.5], [x0 - 0.5, x1 + 0.5, z1 - 0.5, z1 + 0.5], [x0 - 0.5, x0 + 0.5, z0 + 0.5, z1 - 0.5], [x1 - 0.5, x1 + 0.5, z0 + 0.5, z1 - 0.5]]) B(a0, a1, top, top + 2.2, b0, b1, TR);
  B(x0 + 3, x0 + 9, top, top + 3, z0 + 3, z0 + 7, 194, L);
  P([6, 6, 6], [x0 + 6, top + 3, z1 - 5], 217, { shape: 'Cylinder', rotation: [0, 0, 90] });
  B(-4.5, 4.5, G + 9.2, G + 9.8, z0 - 3.5, z0 - 0.5, TR); // the entrance canopy
  if (o.text) sign(0, G + 10.7, z0 - 0.9, Math.min(16, w - 6), 1.8, o.text, { bg: o.bg, fg: o.fg });
  route.push(T(x0 + 6, top, 0));
  return { high: [route], inside: [[T(0, G, z0 - 5), T(0, G, z0 + 2.5), T(x0 + 5, G, 1)]] };
}

/** A water tower: a tank on four legs with a ladder up to the walkway. */
function waterTower(k, h = 30, col = 1) {
  const { P, B, T, slab, ladder } = k;
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) B(x - 0.7, x + 0.7, G, G + h, z - 0.7, z + 0.7, 199);
  for (const y of [G + h * 0.33, G + h * 0.66]) { B(-5, 5, y, y + 0.6, -5.3, -4.7, 199); B(-5, 5, y, y + 0.6, 4.7, 5.3, 199); B(-5.3, -4.7, y, y + 0.6, -4.7, 4.7, 199); B(4.7, 5.3, y, y + 0.6, -4.7, 4.7, 199); }
  slab(-8, 8, -8, 8, G + h, G + h + 0.8, 199, { tile: 8 });
  const y0 = G + h + 0.8, y1 = G + h + 3;
  B(-8, 8, y0, y1, -8, -7.6, 194); B(-8, 8, y0, y1, 7.6, 8, 194); B(-8, -7.6, y0, y1, -7.6, 7.6, 194);
  B(7.6, 8, y0, y1, -7.6, -1.6, 194); B(7.6, 8, y0, y1, 1.6, 7.6, 194);
  P([10, 12, 12], [0, G + h + 5.8, 0], col, { shape: 'Cylinder', rotation: [0, 0, 90] });
  P([1.6, 13, 13], [0, G + h + 11.6, 0], 21, { shape: 'Cylinder', rotation: [0, 0, 90] });
  P([3, 3, 3], [0, G + h + 12.6, 0], 21, { shape: 'Ball' });
  ladder(9, 0, G, G + h + 3);
  return { high: [[T(13, G, 0), T(9, G + h + 0.8, 0, 'climb'), T(6.8, G + h + 0.8, 4.5)]] };
}

/** A gas station: a canopy over the pumps, and a little store behind. */
function gasStation(k, o = {}) {
  const { B, sign } = k;
  B(-16, 16, G, G + 0.3, -14, 13, 194, { name: 'Ground', top: 'Smooth' });
  for (const [x, z] of [[-9, -10], [9, -10], [-9, 4], [9, 4]]) B(x - 0.8, x + 0.8, G + 0.3, G + 11, z - 0.8, z + 0.8, 1);
  k.slab(-13, 13, -13, 7, G + 11, G + 12.2, 1, { tile: 13 });
  B(-13.2, 13.2, G + 12.2, G + 13.2, -13.4, -12.6, o.color ?? 21);
  for (const x of [-4.5, 4.5]) {
    B(x - 1.5, x + 1.5, G + 0.3, G + 0.8, -9, 3, 194);
    for (const z of [-6, 0]) { B(x - 1, x + 1, G + 0.8, G + 5.4, z - 0.8, z + 0.8, o.color ?? 21, { loose: true, userData: { tank: true } }); B(x - 1.1, x + 1.1, G + 5.4, G + 6, z - 0.9, z + 0.9, 1, L); }
  }
  B(-0.5, 0.5, G, G + 16, -16.5, -15.5, 194);
  sign(0, G + 18, -16, 8, 5, `${o.name || 'GAS'}\n$1.99`, { bg: o.bg || '#c4281c', color: 1 });
  return shop(k.at(0, 19), { w: 22, d: 10, h: 11, wall: 1, trim: o.color ?? 21, text: o.store || 'GAS & GO', bg: o.bg || '#c4281c', floor: 194 });
}

function playground(k) {
  const { P, B, ladder } = k;
  B(-15, 15, G, G + 0.25, -12, 12, 5, { name: 'Ground' });
  // the slide tower
  for (const [x, z] of [[-11, -5], [-6, -5], [-11, 0], [-6, 0]]) B(x - 0.4, x + 0.4, G, G + 11, z - 0.4, z + 0.4, 23, L);
  B(-11.4, -5.6, G + 7, G + 7.8, -5.4, 0.4, 24, L);
  P([6, 3, 3.2], [-8.5, G + 12.5, -3.9], 21, { shape: 'Wedge', loose: true }); P([6, 3, 3.2], [-8.5, G + 12.5, -0.7], 21, { shape: 'Wedge', rotation: [0, 180, 0], loose: true });
  ladder(-8.5, -6.4, G, G + 8);
  P([2.8, 7.4, 10], [-8.5, G + 3.9, 5.4], 21, { shape: 'Wedge', rotation: [0, 180, 0], loose: true });
  // swings
  for (const x of [1, 13]) for (const z of [-3, 3]) B(x - 0.4, x + 0.4, G, G + 9, z - 0.4, z + 0.4, 194, L);
  B(0.6, 13.4, G + 9, G + 9.8, -3.4, 3.4, 194, L);
  for (const x of [4, 7, 10]) { B(x - 1, x + 1, G + 2, G + 2.4, -0.8, 0.8, 26, L); for (const dx of [-0.8, 0.8]) B(x + dx - 0.1, x + dx + 0.1, G + 2.4, G + 9, -0.1, 0.1, 194, { loose: true, canCollide: false }); }
  // a roundabout and a seesaw
  P([0.8, 7, 7], [8, G + 0.9, -8], 24, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true }); B(7.7, 8.3, G + 1.3, G + 3.5, -8.3, -7.7, 21, L);
  B(4, 12, G + 1.2, G + 1.6, 7.5, 8.5, 23, L); B(7.5, 8.5, G, G + 1.2, 7.5, 8.5, 194, L);
}

function fountain(k, r = 9) {
  const { P, octagon } = k;
  octagon(0, 0, r, G, G + 2, 194, { t: 1.4 });
  P([0.6, r * 2 - 1, r * 2 - 1], [0, G + 1.2, 0], 102, { shape: 'Cylinder', rotation: [0, 0, 90], transparency: 0.4, canCollide: false, name: 'PoolWater' });
  P([7, 2, 2], [0, G + 3.5, 0], 194, { shape: 'Cylinder', rotation: [0, 0, 90] });
  P([1, 7, 7], [0, G + 7.2, 0], 194, { shape: 'Cylinder', rotation: [0, 0, 90] });
  P([3, 1, 1], [0, G + 9, 0], 194, { shape: 'Cylinder', rotation: [0, 0, 90] });
  P([2, 2, 2], [0, G + 10.8, 0], 45, { shape: 'Ball', transparency: 0.3 });
}

/** A church: a nave with tall windows and a steeple at the front with a ladder up to the belfry. */
function church(k, o = {}) {
  const { P, B, T, wall, slab, ladder, sign } = k;
  const WC = o.wall ?? 1, H = 14;
  slab(-9, 9, -10, 22, G, G + 0.4, 192, { tile: 9 });
  const tall = (a) => [a - 1.5, a + 1.5, G + 4, G + 11.5, 'glass'];
  wall('z', -10, 22, -9, G, G + H, WC, { open: [-4, 4, 12, 18].map(tall), glass: 23 });
  wall('z', -10, 22, 9, G, G + H, WC, { open: [-4, 4, 12, 18].map(tall), glass: 23 });
  wall('x', -9, 9, 22, G, G + H, WC, { open: [[-2, 2, G + 5, G + 11, 'glass']], glass: 104 });
  wall('x', -9, 9, -10, G, G + H, WC, { open: [[-2.5, 2.5, G, G + 9, 'door']] });
  slab(-9.5, 9.5, -10.5, 22.5, G + H, G + H + 0.6, WC, { tile: 10 });
  const r = k.at(0, 6, 90);
  r.gable(-17, 17, -10.5, 10.5, G + H + 0.6, 9, o.roof ?? 199);
  r.gableEnds(-15.8, 15.8, -9, 9, G + H + 0.6, 7.6, WC);
  for (let z = -6; z < 16; z += 4) { B(-7.5, -2, G + 0.4, G + 2.4, z, z + 1.4, 192, L); B(2, 7.5, G + 0.4, G + 2.4, z, z + 1.4, 192, L); }
  B(-3, 3, G + 0.4, G + 4, 17.5, 20, 1, L);
  // the steeple
  const open = (a0, a1) => [[a0, a1, G + 21, G + 26.5, 'open']];
  wall('x', -4, 4, -18, G, G + 28, WC, { open: [[-2, 2, G, G + 9, 'door'], ...open(-2, 2)] });
  wall('z', -18, -10, -4, G, G + 28, WC, { open: open(-16, -12) });
  wall('z', -18, -10, 4, G, G + 28, WC, { open: open(-16, -12) });
  wall('x', -4, 4, -10, G + H, G + 28, WC, { open: open(-2, 2) });
  slab(-3.5, 3.5, -17.5, -10.5, G + 19, G + 20, 192, { tile: 7, holes: [[-3.5, 0, -16, -10.5]] });
  ladder(-2, -11.5, G, G + 21);
  slab(-4.5, 4.5, -18.5, -9.5, G + 28, G + 29, WC, { tile: 9 });
  P([2, 2, 2], [1.6, G + 23.6, -14], 24, { shape: 'Ball' }); // the bell
  B(-3, 3, G + 29, G + 32, -17, -11, o.roof ?? 199); B(-2, 2, G + 32, G + 35, -16, -12, o.roof ?? 199); B(-1, 1, G + 35, G + 40, -15, -13, o.roof ?? 199);
  B(-0.25, 0.25, G + 40, G + 45, -14.25, -13.75, 24); B(-1.4, 1.4, G + 42.6, G + 43.2, -14.25, -13.75, 24);
  if (o.text) sign(0, G + 11.5, -18.85, 7, 2, o.text, { bg: '#2b1d14', fg: '#f4e0a0' });
  return {
    high: [[T(0, G, -23), T(-2, G, -15.5), T(-2, G + 20, -11.5, 'climb'), T(2, G + 20, -14)]],
    inside: [[T(0, G, -23), T(0, G, -12), T(0, G, 4)]],
  };
}

/** An open parking garage: two decks and a roof, car ramps round the side. */
function garage(k, o = {}) {
  const { P, B, T, slab, car, sign } = k;
  const x0 = -20, x1 = 20, z0 = -16, z1 = 16, H = 10;
  slab(x0, x1, z0, z1, G, G + 0.3, 199, { tile: 10, props: { name: 'Ground' } });
  const cols = [];
  for (const x of [x0 + 0.8, -6, 9, x1 - 0.8]) for (const z of [z0 + 0.8, 0, z1 - 0.8]) cols.push([x, z]);
  for (let lv = 0; lv < 2; lv++) {
    const y = G + lv * H, y1 = y + H;
    for (const [x, z] of cols) B(x - 0.8, x + 0.8, y + (lv ? 0 : 0.3), y1 - 1, z - 0.8, z + 0.8, 194);
    // the ramp up from this level, and the hole above it
    const ramp = lv ? [x1 - 19, x1 - 11, z0 + 6, z0 + 28, -1] : [x1 - 10, x1 - 2, z0 + 2, z0 + 24, 1];
    slab(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, y1 - 1, y1, 194, { tile: 10, holes: [[ramp[0], ramp[1], ramp[2], ramp[3]]], props: { top: 'Smooth' } });
    P([8, H, 22], [(ramp[0] + ramp[1]) / 2, y + H / 2 + (lv ? 0 : 0.15), (ramp[2] + ramp[3]) / 2], 199, { shape: 'Wedge', rotation: [0, ramp[4] > 0 ? 0 : 180, 0], top: 'Smooth' });
    // a low wall round the deck above
    const yw = y1, yw1 = y1 + 2.4;
    B(x0 - 0.5, x1 + 0.5, yw, yw1, z1 - 0.5, z1 + 0.5, 1); B(x0 - 0.5, x0 + 0.5, yw, yw1, z0 + 0.5, z1 - 0.5, 1);
    B(x1 - 0.5, x1 + 0.5, yw, yw1, z0 + 0.5, z1 - 0.5, 1); B(x0 - 0.5, -2, yw, yw1, z0 - 0.5, z0 + 0.5, 1); B(4, x1 + 0.5, yw, yw1, z0 - 0.5, z0 + 0.5, 1);
  }
  car(-14, 6, 180, 23); car(1, -4, 0, 1); car(-14, -8, 0, 24);
  const k2 = k.at(0, 0, 0, H); k2.car(-14, 6, 0, 21); k2.car(-1, 6, 180, 26);
  k.at(0, 0, 0, 2 * H).car(-12, -5, 90, 102);
  sign(0, G + 8, z0 - 0.9, 16, 2.6, o.text || 'PARKING', { bg: '#0d4fa8' });
  return {
    high: [[T(x1 - 6, G, z0 - 5), T(x1 - 6, G, z0 + 1), T(x1 - 6, G + H, z0 + 25), T(x1 - 15, G + H, z0 + 29.5), T(x1 - 15, G + 2 * H, z0 + 4), T(-6, G + 2 * H, -6)]],
    inside: [[T(-8, G, z0 - 5), T(-8, G, -2)]],
  };
}

/** A cylinder tower with platforms every 16 studs and a ladder up the side. */
function crackTower(k, h, col = 194) {
  const { P, B, T, slab, ladder } = k;
  for (let i = 0; i < h / 4; i++) P([4, 6, 6], [0, G + 2 + i * 4, 0], i % 4 === 3 ? 21 : col, { shape: 'Cylinder', rotation: [0, 0, 90], name: 'Tank' });
  ladder(4, 0, G, G + h + 1);
  for (let y = G + 16; y <= G + h; y += 16) {
    slab(-5, 7, -5, 5, y, y + 0.8, 24, { tile: 6, holes: [[3, 5, -1, 1]] });
    B(-5, 7, y + 0.8, y + 3.4, -5.4, -5, 24); B(-5, 7, y + 0.8, y + 3.4, 5, 5.4, 24); B(6.6, 7, y + 0.8, y + 3.4, -5, 5, 24);
  }
  return { high: [[T(8, G, 2), T(4, G + h + 0.8, 0, 'climb'), T(5.5, G + h + 0.8, 3)]] };
}

/** An oil tank: stacked steel rings, a ladder up the south side, a rail round the top. */
function oilTank(k, r, rings, col = 1, skip = []) {
  const { P, T, ladder, octagon } = k;
  for (let i = 0; i < rings; i++) P([4, r * 2, r * 2], [0, G + 2 + i * 4, 0], i === rings - 2 ? 21 : col, { shape: 'Cylinder', rotation: [0, 0, 90], name: 'Tank', userData: { tank: true } });
  const top = G + rings * 4;
  ladder(0, r + 1, G, top + 1);
  octagon(0, 0, r - 0.5, top, top + 2.5, 194, { t: 0.5, skip: [0, ...skip] });
  return { top, high: [[T(0, G, r + 3.4), T(0, top, r + 1, 'climb'), T(-2, top, r - 4)]] };
}

// --- 1. Happy Home of Robloxia: the suburbs -----------------------------------------------------------------------------
function happyHouse(k) {
  const { P, B, wall, slab, gable, gableEnds, stairs, tree, car, fence, mailbox } = k;
  const W = 1, H1 = G + 12, H2 = G + 24;
  // the house: x -14..14, z -10..10, front door to the north
  slab(-14, 14, -10, 10, G, G + 0.4, 18, { props: { top: 'Smooth' } });
  const win = (a, y) => [a - 2, a + 2, y + 3, y + 8, 'glass'];
  wall('x', -14, 14, -10, G, H1, W, { open: [[-2, 2, G, G + 8, 'door'], win(-8, G), win(8, G)] });
  wall('x', -14, 14, 10, G, H1, W, { open: [win(-8, G), win(0, G), win(8, G)] });
  wall('z', -10, 10, -14, G, H1, W, { open: [win(0, G)] });
  wall('z', -10, 10, 14, G, H1, W, { open: [[-6, 0, G, G + 8, 'door']] });
  slab(-14.5, 14.5, -10.5, 10.5, H1, H1 + 1, 194, { holes: [[-13.5, -8.5, -6, 6]], props: { top: 'Smooth' } });
  wall('x', -14, 14, -10, H1 + 1, H2, W, { open: [win(-8, H1 + 1), win(0, H1 + 1), win(8, H1 + 1)] });
  wall('x', -14, 14, 10, H1 + 1, H2, W, { open: [win(-8, H1 + 1), win(8, H1 + 1)] });
  wall('z', -10, 10, -14, H1 + 1, H2, W, { open: [win(0, H1 + 1)] });
  wall('z', -10, 10, 14, H1 + 1, H2, W, { open: [win(-4, H1 + 1), win(4, H1 + 1)] });
  slab(-15, 15, -11, 11, H2, H2 + 0.6, 1, { tile: 10 });
  gable(-15, 15, -11, 11, H2 + 0.6, 9, 21);
  gableEnds(-14.2, 14.2, -10.6, 10.6, H2 + 0.6, 8.6, 1);
  B(-10, -7, H2 - 2, H2 + 12, 2, 5, 192); // chimney
  // inside: stairs, a living room, kitchen, bedroom
  stairs(-13.5, -9.5, -6, 12, G + 0.4, H1 + 1, 192, 1);
  B(-6, 4, G + 0.4, G + 2.4, 5, 8, 23, L); B(-6, 4, G + 2.4, G + 5, 7.5, 8.6, 23, L); // sofa
  B(-4, 2, G + 0.4, G + 2.6, -2, 1, 192, L); // coffee table
  B(-4, 2, G + 0.4, G + 3, -8.6, -7.4, 26, L); B(-3.5, 1.5, G + 3, G + 6.5, -8.4, -7.8, 26, L); // TV
  B(6, 13.4, G + 0.4, G + 4, 6.5, 9.4, 1, L); B(6, 13.4, G + 4, G + 4.4, 6.3, 9.6, 194, L); // kitchen counter
  B(11, 13.4, G + 0.4, G + 9, -9.4, -6.5, 1, L); // fridge
  B(5, 11, G + 0.4, G + 3.6, -3, 2, 192, L); // dining table
  B(-12, -4, H1 + 1, H1 + 3, 3, 9.4, 21, L); B(-12, -11, H1 + 1, H1 + 5, 3, 9.4, 192, L); // bed
  B(4, 10, H1 + 1, H1 + 4, -9.4, -7, 192, L); // dresser
  B(6, 13, H1 + 1, H1 + 3.4, 4, 9.4, 1, L); // bathtub
  // the garage on the east side, with a flat roof and a ladder up the back
  slab(14, 30, -8, 10, G, G + 0.3, 199, { props: { top: 'Smooth' } });
  wall('x', 14, 30, -8, G, G + 11, 1, { open: [[16, 28, G, G + 9, 'door']] });
  wall('x', 14, 30, 10, G, G + 11, 1);
  wall('z', -8, 10, 30, G, G + 11, 1, { open: [[0, 4, G + 4, G + 8, 'glass']] });
  slab(13.5, 30.5, -8.5, 10.5, G + 11, G + 12, 194);
  car(22, 1, 0, 23);
  B(26, 29.4, G + 0.3, G + 4, 6, 9.4, 192, L); // workbench
  P([2, 12, 2], [27, G + 6, 11.4], 194, { shape: 'Truss', name: 'Ladder' });
  P([2, 12, 2], [15.4, H1 + 6, 6], 194, { shape: 'Truss', name: 'Ladder' });
  // the yard: path, driveway, fence, trees, pool, swings, mailbox
  B(-2, 2, G, G + 0.2, -34, -10, 5, GR);
  B(16, 28, G, G + 0.2, -34, -8, 199, GR);
  fence(-34, -26, 40, -26, 1, [[-3, 3], [14, 30]]); fence(-34, -26, -34, 34, 1); fence(-34, 34, 40, 34, 1); fence(40, -26, 40, 34, 1);
  mailbox(-4.5, -29);
  tree(-26, -16, 12); tree(-26, 22, 10); tree(34, 26, 11); tree(35, -18, 9);
  B(-12, 6, G, G + 1, 16, 28, 194); B(-11, 5, G + 0.2, G + 1.05, 17, 27, 102, { transparency: 0.35, canCollide: false, name: 'PoolWater' });
  B(-10, -7, G + 1, G + 1.3, 26, 30, 1, L); // diving board
  for (const x of [20, 30]) { B(x - 0.4, x + 0.4, G, G + 10, 18, 18.8, 194, L); B(x - 0.4, x + 0.4, G, G + 10, 25, 25.8, 194, L); }
  B(19.6, 30.4, G + 10, G + 10.8, 18, 25.8, 194, L);
  B(23, 25, G + 2, G + 2.4, 21, 23, 21, L); // a swing seat
  return {
    high: [[[27, G, 15], [27, G + 12, 11.4, 'climb'], [24, G + 12, 4], [16.6, G + 12, 6], [15.4, H1 + 12.5, 6, 'climb'], [10, H2 + 3, 4]], [[0, G, -14], [-11.5, G, -8], [-11.5, H1 + 1, 7], [0, H1 + 1, 0]]],
    inside: [[[0, G, -14], [0, G, -4], [-4, G, 2]], [[0, G, -14], [6, G, 0]], [[22, G, -12], [22, G, 4]]],
  };
}

function happyHome(st) {
  const g = ground(st), R = routes();
  g.roads([[-52, -38, -114, 114], [53, 67, -114, 114]], [[-74, -60, -114, 114], [60, 74, -114, 114]]);
  R.add(happyHouse(kit(st)));
  // north of Main Street: houses facing the street, the gas station on the corner
  R.add(house(kit(st, -96, -80, 180), { w: 18, d: 16, floors: 2, wall: 5, roof: 199, path: 16, yard: 12, sofa: 21 }));
  R.add(house(kit(st, -40, -82, 180), { w: 20, d: 16, floors: 2, wall: 1, roof: 23, path: 18, drive: -1, car: 21, yard: 12 }));
  R.add(house(kit(st, -2, -82, 180), { w: 20, d: 16, floors: 1, wall: 24, roof: 192, path: 18, drive: -1, car: 1, yard: 12, sofa: 28 }));
  R.add(house(kit(st, 34, -82, 180), { w: 20, d: 16, floors: 2, wall: 45, roof: 199, path: 18, drive: -1, car: 26, yard: 12, fence: 192 }));
  R.add(gasStation(kit(st, 96, -86, 180)));
  // the side streets: two houses each side, facing the street
  R.add(house(kit(st, -96, -12, -90), { w: 20, d: 16, floors: 2, wall: 18, roof: 199, path: 10, drive: -1, car: 102, yard: 6 }));
  R.add(house(kit(st, -96, 26, -90), { w: 20, d: 16, floors: 1, wall: 1, roof: 28, path: 10, drive: -1, car: 24, yard: 6, sofa: 21 }));
  R.add(house(kit(st, 96, -12, 90), { w: 20, d: 16, floors: 1, wall: 9, roof: 192, path: 10, drive: -1, car: 23, yard: 6 }));
  R.add(house(kit(st, 96, 26, 90), { w: 20, d: 16, floors: 2, wall: 1, roof: 21, path: 10, drive: -1, car: 199, yard: 6, fence: 192 }));
  // the park in the south: a playground, a pond, a basketball court; the water tower; the mini mart
  const k = kit(st);
  playground(kit(st, -34, 92));
  k.B(-10, 14, G, G + 1.2, 84, 85, 194); k.B(-10, 14, G, G + 1.2, 99, 100, 194); k.B(-10, -9, G, G + 1.2, 85, 99, 194); k.B(13, 14, G, G + 1.2, 85, 99, 194);
  k.B(-9, 13, G, G + 0.8, 85, 99, 102, { transparency: 0.3, canCollide: false, name: 'PoolWater' });
  for (const [x, z] of [[-4, 89], [6, 95], [9, 88]]) k.P([0.2, 3, 3], [x, G + 0.85, z], 37, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true });
  k.P([1.6, 1.6, 1.6], [1, G + 1.4, 92], 24, { shape: 'Ball', loose: true }); k.P([0.8, 0.8, 0.8], [1.6, G + 2.4, 92], 24, { shape: 'Ball', loose: true }); // a duck
  g.pad(0, 4, 71, 84, 5, 0.15, { top: 'Smooth' }); g.pad(-18, 0, 76, 80, 5, 0.15, { top: 'Smooth' });
  g.pad(27, 47, 77, 107, 106, 0.2, { top: 'Smooth' });
  for (const [z0, z1] of [[91.8, 92.2], [77, 77.4], [106.6, 107]]) g.pad(27, 47, z0, z1, 1, 0.24, { top: 'Smooth', canCollide: false });
  for (const [z, dz] of [[79, 1], [105, -1]]) { k.B(36.5, 37.5, G, G + 10, z - 0.5 - dz * 1.5, z + 0.5 - dz * 1.5, 199, L); k.B(34, 40, G + 9, G + 13, z - 0.2, z + 0.2, 1, L); k.P([0.3, 2.6, 2.6], [37, G + 10, z + dz * 1.6], 106, { shape: 'Cylinder', rotation: [0, 0, 90], loose: true }); }
  for (const [x, z, ry] of [[-14, 104, 180], [16, 80, 0], [-50, 80, 90], [20, 104, 180]]) k.bench(x, z, ry);
  for (const [x, z, h] of [[-52, 106, 11], [-6, 108, 12], [22, 76, 9], [52, 108, 10], [52, 76, 9], [-20, 108, 10]]) k.tree(x, z, h);
  R.add(waterTower(kit(st, -96, 94), 30));
  for (const [x, z] of [[-108, 76], [-84, 108], [-110, 110], [-82, 78]]) k.pine(x, z, 15);
  R.add(shop(kit(st, 96, 94), { w: 28, d: 18, text: 'MINI MART', bg: '#1f7a3a', fg: '#ffffff', awning: 28, wall: 1, trim: 28 }));
  g.pad(79, 113, 72, 82, 199, 0.15, { top: 'Smooth' }); g.stalls(82, 110, 74, 80, 7, 0.15);
  k.car(89, 77, 0, 21); k.car(103, 77, 180, 194);
  // trees, lamps, hydrants and cars along the streets
  for (const x of [-52, -46]) for (const z of [-20, 0, 20]) k.tree(x, z + (x === -46 ? 10 : 0), 9 + Math.abs(z % 3));
  for (const [x, z] of [[48, -18], [50, 2], [48, 22], [-81, -106], [-108, -64], [10, -106], [-20, -106], [52, -108]]) k.tree(x, z, 10);
  for (const [x, z] of [[-108, -30], [-108, 44], [108, -30], [108, 44], [-24, -70], [12, -70], [44, -70]]) k.bush(x, z, 2.4);
  for (const x of [-100, -40, 20, 86]) k.lamp(x, -54.5, 0);
  for (const x of [-88, -20, 44, 104]) k.lamp(x, -35.5, 180);
  for (const x of [-100, -30, 30, 100]) k.lamp(x, 69.5, 180);
  for (const z of [-90, -10, 30, 90]) { k.lamp(-76.5, z, 90); k.lamp(76.5, z + 20, -90); }
  for (const [x, z] of [[-58, -36], [58, -54], [-58, 69], [58, 51]]) k.hydrant(x, z);
  for (const [x, z] of [[-10, -36], [80, -36], [-62, 51]]) k.trash(x, z);
  k.car(-26, -48.5, 90, 21); k.car(92, -41.5, -90, 1); k.car(-90, -41.5, -90, 24); k.car(-63.5, 10, 0, 23); k.car(70.5, -20, 180, 26); k.car(20, 63.5, -90, 28); k.car(-80, 56.5, 90, 194);
  return {
    name: 'Happy Home of Robloxia',
    spawns: [[-30, -45], [10, -45], [44, -45], [-90, -45], [90, -45], [-67, -10], [-67, 30], [67, -10], [67, 30], [-20, 60], [24, 60], [2, 76]].map(([x, z]) => [x, G, z]),
    high: R.high,
    inside: R.inside,
    open: [[-67, -45], [67, -45], [-67, 60], [67, 60], [0, -45], [0, 60], [-6, 78], [37, 92], [-96, 60], [96, 60]],
  };
}

// --- 2. Glass Office: downtown ------------------------------------------------------------------------------------------
function glassTower(k) {
  const { P, B, wall, slab, stairs } = k;
  const F = 12, N = 4, R = 16;
  slab(-R, R, -R, R, G, G + 0.4, 194, { props: { top: 'Smooth' } });
  for (let f = 0; f < N; f++) {
    const y = G + f * F;
    const bandA = y + (f ? 0 : 0.4), y1 = y + F;
    for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R], [0, -R], [0, R], [-R, 0], [R, 0]]) B(x - 1, x + 1, bandA, y1 - 1, z - 1, z + 1, 199);
    // curtain walls: a spandrel band at the bottom, then glass
    const open = [];
    for (let a = -R + 1; a < R - 1; a += 5) if (Math.abs(a + 2.5) > 1.2) open.push([a, a + 5, y + 2, y1 - 1, 'glass']);
    const doors = f === 0 ? [[-4, 4, G, G + 9, 'door']] : [];
    wall('x', -R + 1, R - 1, -R, bandA, y1 - 1, 199, { open: f === 0 ? [...open.filter((o) => o[1] <= -4 || o[0] >= 4), ...doors] : open, glass: 102, panel: 5 });
    wall('x', -R + 1, R - 1, R, bandA, y1 - 1, 199, { open, glass: 102, panel: 5 });
    wall('z', -R + 1, R - 1, -R, bandA, y1 - 1, 199, { open, glass: 102, panel: 5 });
    wall('z', -R + 1, R - 1, R, bandA, y1 - 1, 199, { open, glass: 102, panel: 5 });
    // the floor above, with a hole over this floor's stairs
    const sx = f % 2 ? [3, 9] : [9.5, 15.5];
    slab(-R - 0.5, R + 0.5, -R - 0.5, R + 0.5, y1 - 1, y1, 194, { tile: 8, holes: [[sx[0] - 0.5, sx[1] + 0.5, -15, -1]], props: { top: 'Smooth' } });
    // stairs: up toward +z on even floors, back toward -z on odd ones
    if (f % 2 === 0) stairs(sx[0], sx[1], -15, 14, y + (f ? 0 : 0.4), y1, 26, 1);
    else stairs(sx[0], sx[1], -1, 14, y, y1, 26, -1);
    if (f === 0) { B(-10, 0, G + 0.4, G + 4, -6, -3, 192, L); P([3, 3, 3], [-12, G + 1.9, 10], 37, { shape: 'Ball', loose: true }); }
    else for (const [dx, dz] of [[-10, -8], [-10, 6], [-2, 6], [-2, -8]]) { B(dx - 2.5, dx + 2.5, y, y + 3.2, dz - 1.5, dz + 1.5, 1, L); B(dx - 0.8, dx + 0.8, y, y + 2.2, dz + 2, dz + 3.2, 26, L); B(dx - 0.9, dx + 0.9, y + 3.2, y + 4.6, dz - 1, dz - 0.6, 26, L); }
  }
  // the roof: a parapet, air conditioners, an antenna
  const top = G + N * F;
  for (const [x0, x1, z0, z1] of [[-R - 0.5, R + 0.5, -R - 0.5, -R + 0.5], [-R - 0.5, R + 0.5, R - 0.5, R + 0.5], [-R - 0.5, -R + 0.5, -R, R], [R - 0.5, R + 0.5, -R, R]]) B(x0, x1, top, top + 2.5, z0, z1, 199);
  B(-12, -4, top, top + 4, 4, 12, 194, L); B(-2, 6, top, top + 4, 4, 12, 194, L);
  B(-0.4, 0.4, top, top + 18, -10.4, -9.6, 194);
  k.sign(0, G + 10.4, -16.9, 14, 2.2, 'ROBLOXIA TOWER', { bg: '#14202c', fg: '#bfe3ff' });
  return {
    high: [[[0, G, -22], [0, G, -10], [12.5, G, -14], [12.5, G + 12, 0.5], [6, G + 12, 0.5], [6, G + 24, -14.5], [12.5, G + 24, -14.5], [12.5, G + 36, 0.5], [6, G + 36, 0.5], [6, G + 48, -14.5], [0, G + 48, 4]]],
    inside: [[[0, G, -22], [0, G, -6], [-6, G, 4]], [[0, G, -22], [0, G, -10], [12.5, G, -14], [12.5, G + 12, 0.5], [-6, G + 12, 4]]],
  };
}

function glassOffice(st) {
  const g = ground(st), R = routes(), k = kit(st);
  g.roads([[-59, -45, -114, 114], [45, 59, -114, 114]], [[-59, -45, -114, 114], [45, 59, -114, 114]]);
  R.add(glassTower(kit(st)));
  // the plaza round the tower
  for (const [x0, x1, z0, z1] of [[-41, 41, -41, -16], [-41, 41, 16, 41], [-41, -16, -16, 16], [16, 41, -16, 16]]) g.pad(x0, x1, z0, z1, 208, 0.25, { top: 'Smooth' });
  for (const [x, z] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) { k.B(x - 4, x + 4, G, G + 2.2, z - 4, z + 4, 192); k.B(x - 3.4, x + 3.4, G + 2.2, G + 2.4, z - 3.4, z + 3.4, 25); k.tree(x, z, 9, 37); }
  for (const [x, z, ry] of [[-14, -30, 0], [14, -30, 0], [-14, 30, 180], [14, 30, 180], [-30, 0, 90], [30, 0, -90]]) k.bench(x, z, ry);
  for (const [x, c] of [[-6, 23], [0, 21], [6, 24]]) { k.B(x - 0.3, x + 0.3, G, G + 22, -36.3, -35.7, 194, L); k.B(x + 0.3, x + 5.3, G + 18, G + 21, -36.1, -35.9, c, { loose: true, canCollide: false }); }
  for (let i = 0; i < 5; i++) k.P([4, 4, 4], [0, G + 2.5 + i * 3.4, 29], i % 2 ? 24 : 21, { rotation: [0, i * 22, 0] });
  k.B(-3, 3, G, G + 0.6, 26, 32, 194);
  for (const [x, z] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) k.lamp(x, z, x < 0 ? 90 : -90);
  // the north block: Bloxy Burger and the Pizza Place, an alley behind
  g.pad(-41, 41, -71, -63, 208, 0.5);
  R.add(shop(kit(st, -20, -82, 180), { w: 32, d: 22, h: 14, wall: 5, trim: 21, text: 'BLOXY BURGER', bg: '#c4281c', fg: '#ffd84a', awning: 24, inner: 'diner' }));
  R.add(shop(kit(st, 20, -82, 180), { w: 32, d: 22, h: 14, wall: 192, trim: 1, text: 'PIZZA PLACE', bg: '#1f7a3a', fg: '#ffffff', awning: 21, inner: 'diner' }));
  for (const [x, c] of [[-32, 28], [-8, 23], [10, 28], [34, 23]]) k.B(x - 3, x + 3, G, G + 4, -104, -100, c, L);
  for (const [x, z] of [[-26, -108], [16, -106], [28, -110]]) k.P([2.4, 2.4, 2.4], [x, G + 1, z], 26, { shape: 'Ball', loose: true });
  // the south block: a fountain park
  fountain(kit(st, 0, 88), 10);
  g.pad(-3, 3, 63, 78, 208, 0.25, { top: 'Smooth' }); g.pad(-41, -10, 86, 90, 208, 0.25, { top: 'Smooth' }); g.pad(10, 41, 86, 90, 208, 0.25, { top: 'Smooth' });
  for (const [x, z, h] of [[-30, 72, 10], [30, 72, 10], [-30, 106, 11], [30, 106, 11], [-14, 108, 9], [14, 108, 9], [-38, 98, 8], [38, 98, 8]]) k.tree(x, z, h, 37);
  for (const [x, z, ry] of [[-15, 88, 90], [15, 88, -90], [0, 103, 180]]) k.bench(x, z, ry);
  for (let x = -38; x <= 38; x += 6) if (Math.abs(x) > 5) k.bush(x, 66, 2);
  // west: the parking garage; east: Sunset Apartments
  g.pad(-72, -63, -41, 41, 208, 0.5);
  R.add(garage(kit(st, -88, 0, -90), { text: 'PARKING' }));
  g.pad(63, 77, -41, 41, 208, 0.5);
  R.add(apartments(kit(st, 88, 0, 90), { w: 36, d: 22, floors: 4, wall: 18, trim: 1, text: 'SUNSET APTS', bg: '#7a2a10' }));
  // the corners: a gas station, the bank, a church, more flats
  R.add(gasStation(kit(st, -88, -88, 180), { name: 'GAS', store: 'QUIK STOP', color: 23, bg: '#0d4fa8' }));
  R.add(shop(kit(st, 88, -86, 180), { w: 30, d: 22, h: 16, wall: 208, trim: 1, text: 'ROBLOXIA BANK', bg: '#1d3b6a', fg: '#ffd84a', inner: 'office', glass: 42 }));
  const bank = kit(st, 88, -86, 180);
  for (const x of [-11, -6, 6, 11]) bank.P([14, 2, 2], [x, G + 7.6, -14], 1, { shape: 'Cylinder', rotation: [0, 0, 90] });
  bank.B(-14, 14, G + 14.6, G + 15.6, -16, -12.3, 1); bank.B(-14, 14, G, G + 0.6, -17, -11, 194); bank.B(-14, 14, G, G + 0.3, -18.5, -17, 194);
  R.add(church(kit(st, -88, 86), { text: 'ST. BLOX', roof: 192 }));
  R.add(apartments(kit(st, 88, 88), { w: 32, d: 20, floors: 3, wall: 192, trim: 194, text: 'BLOX HOTEL', bg: '#3a1d5a' }));
  // lamps, hydrants, bins, a bus stop, cars
  for (const x of [-100, -76, -28, 28, 76, 100]) { k.lamp(x, -61, 0); k.lamp(x, 61, 180); }
  for (const z of [-100, -76, -28, 28, 76, 100]) { k.lamp(-61, z, 90); k.lamp(61, z, -90); }
  for (const [x, z] of [[-43, -43], [43, 43], [-61, 61], [61, -61]]) k.hydrant(x, z);
  for (const [x, z] of [[-43, 20], [43, -20], [20, 61], [-20, -61]]) k.trash(x, z);
  k.B(-34, -22, G + 0.5, G + 0.9, -62.5, -61.5, 192, L); k.B(-34, -22, G + 8, G + 8.5, -64, -60, 23, L); for (const x of [-33.5, -22.5]) k.B(x - 0.3, x + 0.3, G + 0.5, G + 8, -62.3, -61.7, 194, L);
  k.car(-30, -48, 90, 24); k.car(10, -56, -90, 21); k.car(70, 48.5, 90, 1); k.car(-48.5, 20, 0, 23); k.car(-55.5, -80, 180, 26); k.car(55.5, 30, 180, 28); k.car(48.5, -96, 0, 102); k.car(-20, 55.5, -90, 199);
  return {
    name: 'Glass Office',
    spawns: [[-20, -30], [0, -34], [20, -30], [-30, 20], [30, 20], [0, 52], [-52, 0], [52, 0], [0, -52], [-52, 52], [52, -52], [0, 70]].map(([x, z]) => [x, G, z]),
    high: R.high,
    inside: R.inside,
    open: [[-52, -52], [52, 52], [-52, 52], [52, -52], [0, -52], [0, 52], [-52, 0], [52, 0], [0, 76], [-28, -38]],
  };
}

// --- 3. Furious Fire Station: a small town ----------------------------------------------------------------------------
function fireHouse(k) {
  const { P, B, wall, slab, stairs, tree, car, fence, sign, hydrant } = k;
  const H1 = G + 13, H2 = G + 26;
  const RED = 192, TRIM = 1;
  slab(-22, 12, -12, 12, G, G + 0.4, 194, { props: { top: 'Smooth' } });
  // ground floor: two truck bays open to the front (north)
  wall('x', -22, 12, -12, G, H1, RED, { open: [[-19, -9, G, G + 10, 'door'], [-6, 4, G, G + 10, 'door'], [6, 10, G + 4, G + 9, 'glass']] });
  wall('x', -22, 12, 12, G, H1, RED, { open: [[-18, -12, G + 4, G + 9, 'glass'], [0, 6, G + 4, G + 9, 'glass']] });
  wall('z', -12, 12, -22, G, H1, RED, { open: [[-4, 2, G + 4, G + 9, 'glass']] });
  wall('z', -12, 12, 12, G, H1, RED, { open: [[4, 9, G, G + 8, 'door']] });
  B(-22.5, 12.5, H1 - 1.2, H1, -12.6, -11.4, TRIM);
  slab(-22.5, 12.5, -12.5, 12.5, H1, H1 + 1, 199, { holes: [[5.5, 11.5, -8, 6]] });
  sign(-5, G + 11.2, -12.95, 22, 1.8, 'FIRE STATION 8', { bg: '#7a1410', fg: '#ffe9a8' });
  // upstairs: the dorm, the kitchen
  wall('x', -22, 12, -12, H1 + 1, H2, RED, { open: [[-19, -14, H1 + 4, H1 + 9, 'glass'], [-10, -5, H1 + 4, H1 + 9, 'glass'], [-1, 4, H1 + 4, H1 + 9, 'glass']] });
  wall('x', -22, 12, 12, H1 + 1, H2, RED, { open: [[-16, -10, H1 + 4, H1 + 9, 'glass'], [2, 8, H1 + 4, H1 + 9, 'glass']] });
  wall('z', -12, 12, -22, H1 + 1, H2, RED);
  wall('z', -12, 12, 12, H1 + 1, H2, RED, { open: [[-6, 0, H1 + 4, H1 + 9, 'glass']] });
  slab(-22.5, 12.5, -12.5, 12.5, H2, H2 + 1, 199);
  for (const [x0, x1, z0, z1] of [[-22.5, 12.5, -12.5, -11.5], [-22.5, 12.5, 11.5, 12.5], [-22.5, -21.5, -12, 12], [11.5, 12.5, -12, 12]]) B(x0, x1, H2 + 1, H2 + 3, z0, z1, TRIM);
  stairs(6, 11, -8, 14, G + 0.4, H1 + 1, 199, 1);
  P([14, 0.8, 0.8], [-7.5, G + 7, 5.25], 131, { shape: 'Cylinder', rotation: [0, 0, 90] }); // the fire pole
  for (const x of [-18, -12, -6]) B(x - 1.5, x + 1.5, H1 + 1, H1 + 3, 6, 11.4, 21, L);
  B(-4, 4, H1 + 1, H1 + 4.2, -10.8, -7, 1, L); B(-19, -13, H1 + 1, H1 + 4, -4, 2, 192, L);
  // the trucks
  const truck = (x) => {
    B(x - 3.5, x + 3.5, G + 1, G + 6, -6, 9, 21, L); B(x - 3.5, x + 3.5, G + 1, G + 8, -11, -6, 21, L);
    B(x - 3.4, x + 3.4, G + 5.2, G + 7.2, -11.1, -10.9, 42, L); B(x - 3.6, x + 3.6, G + 3, G + 3.6, -6, 9, 1, L);
    B(x - 1.5, x + 1.5, G + 6, G + 7, -5, 8, 194, L); B(x - 1, x + 1, G + 8, G + 8.6, -10, -8, 21, { loose: true, material: 'Neon' });
    for (const [wx, wz] of [[-3.4, -9], [3.4, -9], [-3.4, 5], [3.4, 5]]) P([1.2, 2.4, 2.4], [x + wx, G + 1.2, wz], 26, { shape: 'Cylinder', loose: true });
  };
  truck(-14); truck(-1);
  // the hose tower (a ladder to the top)
  for (let f = 0; f < 4; f++) {
    const y0 = G + f * 12, y1 = y0 + 12;
    wall('x', 14, 22, 0, y0, y1, RED, { open: f ? [[16, 20, y0 + 4, y0 + 9, 'glass']] : [[16, 20, G, G + 8, 'door']] });
    wall('x', 14, 22, 10, y0, y1, RED, { open: [[16, 20, y0 + 4, y0 + 9, 'glass']] });
    wall('z', 0, 10, 22, y0, y1, RED, { open: [[3, 7, y0 + 4, y0 + 9, 'glass']] });
  }
  P([2, 48, 2], [16, G + 24, 8], 194, { shape: 'Truss', name: 'Ladder' });
  slab(13.5, 22.5, -0.5, 10.5, G + 48, G + 49, 199, { tile: 5, holes: [[14.5, 17.5, 6.5, 9.5]] });
  for (const [x0, x1, z0, z1] of [[13.5, 22.5, -0.5, 0.3], [13.5, 22.5, 9.7, 10.5], [21.7, 22.5, 0, 10]]) B(x0, x1, G + 49, G + 51, z0, z1, TRIM);
  // the yard
  B(-22, 12, G, G + 0.2, -32, -12, 199, GR);
  hydrant(-26, -24); hydrant(18, -24);
  B(-30, -29.4, G, G + 30, -20, -19.4, 194); B(-29.4, -22, G + 24, G + 29, -19.8, -19.6, 23, { loose: true, canCollide: false });
  tree(-34, 10, 11); tree(30, 26, 10); tree(-10, 30, 12);
  B(-8, 2, G, G + 2.6, 20, 24, 192, L); B(-8, 2, G, G + 1.4, 18, 19, 192, L); B(-8, 2, G, G + 1.4, 25, 26, 192, L); // picnic table
  fence(-36, 34, 36, 34, 1);
  return {
    high: [[[18, G, -4], [18, G, 3], [16, G, 6], [16, G + 49, 8, 'climb'], [19, G + 49, 4]], [[6, G, 16], [6.5, G, 9], [8.5, G, -6.5], [8.5, H1 + 1, 6.5], [0, H1 + 1, 0]]],
    inside: [[[-14, G, -18], [-14, G, -4]], [[-1, G, -18], [-1, G, 0], [-8, G, 2]]],
  };
}

/** The town hall: two storeys, a portico of columns, a clock tower on the roof. */
function townHall(k) {
  const { P, B, wall, slab, sign, gable } = k;
  const r = apartments(k, { w: 36, d: 22, floors: 2, storey: 12, wall: 5, trim: 1, floor: 192, desk: 23 });
  const z0 = -11;
  B(-12, 12, G, G + 0.6, z0 - 7, z0, 194); B(-12, 12, G, G + 1.2, z0 - 5, z0, 194);
  for (const x of [-10, -5, 5, 10]) P([10.8, 1.8, 1.8], [x, G + 6.6, z0 - 3.5], 1, { shape: 'Cylinder', rotation: [0, 0, 90] });
  B(-12, 12, G + 12, G + 13, z0 - 5.5, z0 - 0.5, 1);
  gable(-12, 12, z0 - 5.5, z0 + 0.5, G + 13, 3.6, 1, 8);
  sign(0, G + 15.2, z0 - 0.9, 14, 2, 'TOWN HALL', { bg: '#2a2a2a', fg: '#f4e0a0' });
  const top = G + 24;
  wall('x', -4, 4, -4, top, top + 12, 5); wall('x', -4, 4, 4, top, top + 12, 5); wall('z', -4, 4, -4, top, top + 12, 5); wall('z', -4, 4, 4, top, top + 12, 5);
  slab(-4.5, 4.5, -4.5, 4.5, top + 12, top + 13, 1, { tile: 9 });
  B(-3, 3, top + 13, top + 16, -3, 3, 192); B(-1.5, 1.5, top + 16, top + 19, -1.5, 1.5, 192); B(-0.3, 0.3, top + 19, top + 23, -0.3, 0.3, 24);
  for (const [x, z, ry] of [[0, -4.6, 0], [0, 4.6, 180], [-4.6, 0, -90], [4.6, 0, 90]]) {
    const c = P([6, 6, 0.3], [x, top + 7.5, z], 1, { name: 'Clock', rotation: [0, ry, 0] });
    k.st.detach(c); c.addDecal('Front', clockTex());
  }
  return r;
}

function fireStation(st) {
  const g = ground(st), R = routes(), k = kit(st);
  g.roads([[-50, -36, -114, 114], [58, 72, -114, 114]], [[-70, -56, -114, 114], [56, 70, -114, 114]]);
  R.add(fireHouse(kit(st)));
  // the crew's car park, a memorial bell, trees
  g.pad(28, 50, -28, 12, 199, 0.2, { top: 'Smooth' }); g.stalls(28, 50, -28, -14, 7.33, 0.2);
  k.car(31.7, -21, 180, 21); k.car(39, -21, 0, 1); k.car(46.3, -21, 180, 194);
  k.B(-46, -40, G, G + 1, -24, -18, 194); k.B(-44.5, -41.5, G + 1, G + 7, -21.5, -20.5, 192); k.B(-46, -40, G + 7, G + 7.6, -22, -20, 192); k.P([2.6, 2.6, 2.6], [-43, G + 5.6, -21], 24, { shape: 'Ball' });
  for (const [x, z, h] of [[-46, 4, 11], [-46, 26, 10], [46, 26, 11], [46, 44, 9], [-30, 46, 10], [10, 46, 9]]) k.tree(x, z, h);
  for (const [x, z, ry] of [[-40, -8, 90], [20, 44, 180]]) k.bench(x, z, ry);
  // north of Main Street: the gas station, town hall, police station and Mom's Diner
  R.add(gasStation(kit(st, -94, -86, 180), { name: 'FUEL', store: 'FUEL & FOOD', color: 24, bg: '#b8860b' }));
  R.add(townHall(kit(st, -26, -82, 180)));
  R.add(shop(kit(st, 28, -84, 180), { w: 30, d: 20, h: 14, wall: 194, trim: 23, text: 'POLICE', bg: '#0d4fa8', inner: 'office' }));
  k.car(18, -66, 180, 26, { siren: true }); k.car(30, -66, 180, 26, { siren: true });
  g.pad(13, 43, -73, -55, 199, 0.15, { top: 'Smooth' });
  k.B(42.7, 43.3, G, G + 24, -71.3, -70.7, 194); k.B(37.7, 42.7, G + 20, G + 23, -71.1, -70.9, 23, { loose: true, canCollide: false });
  R.add(shop(kit(st, 94, -84, 180), { w: 30, d: 18, h: 13, wall: 1, trim: 23, text: "MOM'S DINER", bg: '#13a3c8', fg: '#ffffff', awning: 23, inner: 'diner', glass: 42 }));
  // the side streets: houses
  R.add(house(kit(st, -94, -10, -90), { w: 20, d: 16, floors: 2, wall: 1, roof: 199, path: 12, drive: -1, car: 21, yard: 6 }));
  R.add(house(kit(st, -94, 30, -90), { w: 20, d: 16, floors: 1, wall: 18, roof: 192, path: 12, drive: -1, car: 102, yard: 6 }));
  R.add(house(kit(st, 94, -10, 90), { w: 20, d: 16, floors: 1, wall: 45, roof: 199, path: 12, drive: -1, car: 24, yard: 6 }));
  R.add(house(kit(st, 94, 30, 90), { w: 20, d: 16, floors: 2, wall: 5, roof: 21, path: 12, drive: -1, car: 1, yard: 6 }));
  // the south: a playground, the supermarket and its car park, the water tower
  playground(kit(st, -94, 95));
  R.add(shop(kit(st, 0, 100), { w: 48, d: 22, h: 14, wall: 194, trim: 21, text: 'SUPERMARKET', bg: '#c4281c', awning: 21 }));
  g.pad(-40, 40, 76, 88, 199, 0.2, { top: 'Smooth' }); g.stalls(-38, 38, 77, 85, 7.6, 0.2);
  k.car(-26.6, 81, 0, 24); k.car(-3.8, 81, 180, 1); k.car(19, 81, 0, 28); k.car(34.2, 81, 180, 21);
  for (let i = 0; i < 3; i++) k.B(-48 + i * 3.4, -45 + i * 3.4, G, G + 5, 104, 108, [23, 28, 24][i], L);
  R.add(waterTower(kit(st, 96, 96), 32, 194));
  for (const [x, z] of [[-110, 78], [-78, 110], [110, 78], [80, 110], [-46, 92], [46, 92]]) k.pine(x, z, 16);
  // lamps, hydrants and cars along the streets
  for (const x of [-100, -60, -10, 40, 90]) k.lamp(x, -52, 0);
  for (const x of [-90, -40, 20, 52, 100]) k.lamp(x, -34, 180);
  for (const x of [-100, -40, 40, 100]) k.lamp(x, 74, 180);
  for (const z of [-80, -10, 30, 90]) { k.lamp(-72, z, 90); k.lamp(72, z + 15, -90); }
  for (const [x, z] of [[-54, -34], [54, -52], [-54, 56], [54, 74]]) k.hydrant(x, z);
  k.car(-40, -40.5, -90, 23); k.car(80, -47.5, 90, 194); k.car(-59.5, 20, 0, 1); k.car(66.5, 40, 180, 21); k.car(-90, 61.5, 90, 24);
  return {
    name: 'Furious Fire Station',
    spawns: [[-24, -43], [8, -43], [40, -43], [-63, -10], [-63, 30], [63, -10], [63, 30], [-30, 65], [30, 65], [0, 72], [-90, -43], [90, -43]].map(([x, z]) => [x, G, z]),
    high: R.high,
    inside: R.inside,
    open: [[-63, -43], [63, -43], [-63, 65], [63, 65], [0, -43], [0, 65], [40, 0], [-40, 20], [-94, 65], [94, 65]],
  };
}

// --- 4. Lighthouse Point: a fishing village ---------------------------------------------------------------------------
function lighthouse(st) {
  const g = ground(st), R = routes(), k = kit(st);
  const T = G + 16; // the top of the headland
  const ROCK = { name: 'Rock' };
  g.roads([[10, 22, -114, 114], [-58, -48, -114, 34]], [[-16, -4, -58, 22]]);
  // the headland in the north-east: a stone plateau with rough sides, steps and a ladder up
  k.slab(50, 110, -110, -54, G, T, 199, { tile: 12, props: ROCK });
  for (const [x0, x1, z0, z1, h] of [[46, 50, -108, -60, 7], [48, 52, -100, -94, 12], [50, 108, -54, -50, 6], [64, 76, -56, -52, 11], [94, 104, -56, -52, 9], [110, 113, -106, -58, 10]]) k.B(x0, x1, G, G + h, z0, z1, 194, ROCK);
  k.stepsX(-92, -84, 30, 20, G, T, 194, 1, ROCK);
  for (let i = 0; i < 6; i++) k.B(77, 83, G, G + i + 1, -45 - i, -44 - i, 194, ROCK);
  k.ladder(80, -53, G + 6, T + 1);
  for (const [x0, x1, z0, z1] of [[50, 110, -110.5, -109.5], [109.5, 110.5, -110, -54], [50, 76, -54.5, -53.5], [84, 110, -54.5, -53.5], [49.5, 50.5, -110, -93], [49.5, 50.5, -83, -54]]) k.B(x0, x1, T, T + 2, z0, z1, 194, ROCK);
  // the lighthouse: an octagonal striped tower with a ladder inside
  const cx = 86, cz = -84;
  for (let i = 0; i < 10; i++) {
    const y0 = T + i * 4;
    k.octagon(cx, cz, 6 - i * 0.12, y0, y0 + 4, i % 2 ? 21 : 1, { skip: i < 2 ? [6] : [], t: 1.2 });
  }
  k.ladder(cx + 3.2, cz, T, T + 42);
  const gy = T + 40;
  k.slab(cx - 8, cx + 8, cz - 8, cz + 8, gy, gy + 1, 26, { tile: 8, holes: [[cx - 0.2, cx + 4.3, cz - 1.8, cz + 1.8]] });
  for (const [x0, x1, z0, z1] of [[cx - 8, cx + 8, cz - 8, cz - 7.4], [cx - 8, cx + 8, cz + 7.4, cz + 8], [cx - 8, cx - 7.4, cz - 7.4, cz + 7.4], [cx + 7.4, cx + 8, cz - 7.4, cz + 7.4]]) k.B(x0, x1, gy + 1, gy + 3.5, z0, z1, 26);
  k.octagon(cx, cz, 4.6, gy + 1, gy + 7, 45, { t: 0.4, props: { transparency: 0.5, name: 'Glass' } });
  k.P([2, 2, 2], [cx - 1.6, gy + 4.5, cz], 24, { shape: 'Ball', material: 'Neon', canCollide: false });
  k.octagon(cx, cz, 4.8, gy + 7, gy + 8.5, 26, { t: 1.2 });
  k.P([4.4, 4.4, 4.4], [cx, gy + 9, cz], 26, { shape: 'Ball' });
  R.high.push([[24, G, -88], [52, T, -88], [cx - 9, T, cz], [cx - 2, T, cz], [cx + 1.2, T, cz], [cx + 3.2, gy + 1, cz, 'climb'], [cx - 2, gy + 1, cz + 2]]);
  R.high.push([[80, G, -40], [80, G + 6, -50.5], [80, T, -53, 'climb'], [78, T, -60]]);
  // the keeper's cottage on the headland, a telescope, a bench
  R.add(house(kit(st, 64, -98, -90, 16), { w: 18, d: 14, wall: 1, roof: 23, chimney: true }));
  k.at(66, -64, 0, 16).bench(0, 0, 180); k.B(98, 99, T, T + 4, -62, -61, 26, L); k.P([3, 1, 1], [98.5, T + 4.6, -61.5], 26, { shape: 'Cylinder', rotation: [0, 30, 20], loose: true });
  // the village: cottages along the lane, the general store, the church
  const cottages = [[-96, -76, 1, 199], [-70, -76, 45, 192], [-44, -76, 3, 21], [16, -78, 9, 23]];
  for (const [x, z, w, r] of cottages) R.add(house(kit(st, x, z, 180), { w: x === 16 ? 16 : 18, d: 14, wall: w, roof: r, path: z === -78 ? 9 : 7, yard: 10, fence: 1 }));
  R.add(shop(kit(st, -12, -80, 180), { w: 24, d: 16, h: 12, wall: 192, trim: 1, text: 'GENERAL STORE', bg: '#2b1d14', fg: '#f4e0a0', awning: 28 }));
  R.add(church(kit(st, -88, -16, 180), { wall: 1, roof: 199, text: 'CHAPEL' }));
  for (const [x, w, r] of [[-58, 24, 199], [-34, 45, 192], [14, 1, 21]]) R.add(house(kit(st, x, -20, 180), { w: 16, d: 14, wall: w, roof: r, path: 19, chimney: x !== -34 }));
  R.add(shop(kit(st, 36, -22, 180), { w: 18, d: 14, h: 12, wall: 217, trim: 1, text: 'BAIT & TACKLE', bg: '#1d4a6a' }));
  // the slope below the headland: pines, a sign, picnic tables
  for (const [x, z, h] of [[56, -40, 16], [66, -30, 18], [58, -16, 15], [96, -40, 17], [106, -26, 15], [88, -24, 14], [104, -6, 16], [56, 0, 14]]) k.pine(x, z, h);
  k.B(66, 67, G, G + 6, -2, -1, 192, L); k.B(79, 80, G, G + 6, -2, -1, 192, L); k.sign(73, G + 6.5, -1.5, 15, 4, 'LIGHTHOUSE POINT', { color: 192, bg: '#2b4a6a', rotation: [0, 180, 0] });
  for (const [x, z] of [[76, -16], [88, -6]]) { k.B(x - 4, x + 4, G + 2.4, G + 2.9, z - 1.5, z + 1.5, 192, L); k.B(x - 4, x + 4, G + 1.4, G + 1.8, z - 3.6, z - 2.6, 192, L); k.B(x - 4, x + 4, G + 1.4, G + 1.8, z + 2.6, z + 3.6, 192, L); k.B(x - 0.5, x + 0.5, G, G + 2.4, z - 0.5, z + 0.5, 192, L); }
  // the boardwalk, the shops on the front, the beach
  g.pad(-114, 114, 26, 34, 217, 0.4);
  R.add(shop(kit(st, -70, 46), { w: 26, d: 14, h: 12, wall: 1, trim: 23, text: 'FISH MARKET', bg: '#0d4fa8', awning: 23 }));
  R.add(shop(kit(st, -36, 44), { w: 16, d: 10, h: 12, wall: 9, trim: 1, text: 'ICE CREAM', bg: '#e06aa8', awning: 9 }));
  R.add(shop(kit(st, 62, 45), { w: 20, d: 12, h: 12, wall: 24, trim: 23, text: 'SURF SHOP', bg: '#13a3c8', awning: 24 }));
  for (const [x, z] of [[-100, 44], [-10, 42], [14, 44], [34, 46], [92, 44], [106, 48]]) k.palm(x, z, 16);
  g.pad(-114, 114, 54, 114, 5, 0.25);
  // the pier, running out to sea, and the boats
  k.B(-47, -37, G, G + 1, 54, 58, 217);
  for (let z = 62; z < 174; z += 8) {
    for (const x of [-46, -38]) k.B(x - 0.6, x + 0.6, -12, G + 1, z - 0.6, z + 0.6, 217);
    k.B(-47, -37, G + 1, G + 1.8, z - 4, z + 4, 18);
    k.B(-47, -46.4, G + 1.8, G + 4, z - 4, z + 4, 217, L); k.B(-37.6, -37, G + 1.8, G + 4, z - 4, z + 4, 217, L);
  }
  k.B(-47, -37, G + 1.8, G + 4, 169.4, 170, 217, L);
  for (const z of [90, 130]) k.lamp(-46, z, 90);
  const boat = (x, z, ry, c) => { const b = k.at(x, z, ry); b.B(-3, 3, 0, 2, -7, 7, c, L); b.B(-2, 2, 0, 2, -8.5, -7, c, L); b.B(-2, 2, 2, 2.5, -1, 5, 192, L); b.B(-0.2, 0.2, 2, 10, 0, 0.4, 194, L); b.B(-1.5, 1.5, 2, 4, 3, 6, 1, L); };
  boat(-30, 150, 0, 1); boat(-56, 128, 20, 21); boat(-24, 116, -10, 23);
  // lifeguard towers, umbrellas, a shipwreck, a sandcastle, a volleyball net
  for (const [x, z] of [[40, 88], [84, 96]]) {
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) k.B(x + dx - 0.4, x + dx + 0.4, G, G + 12, z + dz - 0.4, z + dz + 0.4, 217, L);
    k.slab(x - 3, x + 3, z - 3, z + 3, G + 12, G + 13, 217, { tile: 6 });
    k.B(x - 3, x + 3, G + 13, G + 15, z - 3, z - 2.4, 21, L); k.B(x - 3, x + 3, G + 18, G + 18.6, z - 3.4, z + 3.4, 21, L);
    for (const [dx, dz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]]) k.B(x + dx - 0.2, x + dx + 0.2, G + 13, G + 18, z + dz - 0.2, z + dz + 0.2, 1, L);
    k.ladder(x, z + 4.2, G, G + 13);
    R.high.push([[x, G, z + 8], [x, G + 13, z + 4.2, 'climb'], [x, G + 13, z]]);
  }
  for (const [x, z, c] of [[0, 70, 21], [10, 80, 23], [-16, 84, 24], [26, 92, 21], [58, 76, 28], [68, 94, 24], [100, 74, 23], [-76, 74, 24], [-30, 100, 23], [104, 104, 21]]) {
    k.B(x - 0.3, x + 0.3, G, G + 9, z - 0.3, z + 0.3, 1, L); k.P([9, 1, 9], [x, G + 9, z], c, { shape: 'Ball', loose: true });
    k.B(x + 1, x + 4, G + 0.25, G + 0.35, z - 3, z + 3, c === 21 ? 23 : 21, { loose: true, top: 'Smooth' });
  }
  const wreck = k.at(-88, 92, 35);
  wreck.P([10, 6, 28], [0, G + 1.6, 0], 192, { rotation: [0, 0, 18], loose: true }); wreck.P([8, 6, 8], [0.6, G + 1.6, -18], 192, { shape: 'Wedge', rotation: [0, 180, 18], loose: true });
  wreck.B(-4, 4, G + 4, G + 4.6, -4, 8, 217, L); wreck.P([1, 18, 1], [2, G + 8, 2], 217, { rotation: [10, 0, 30], loose: true }); wreck.B(-3, 3, G + 4.6, G + 7, 6, 10, 217, L);
  k.B(16, 24, G, G + 2, 100, 108, 5, L); for (const [x, z] of [[16, 100], [24, 100], [16, 108], [24, 108]]) k.B(x - 1, x + 1, G + 2, G + 5, z - 1, z + 1, 5, L); k.B(19, 21, G + 2, G + 6.5, 103, 105, 5, L); k.B(19.9, 20.1, G + 6.5, G + 8.5, 103.9, 104.1, 194, L); k.B(20.1, 21.6, G + 7.4, G + 8.4, 103.95, 104.05, 21, L);
  for (const x of [-14, 2]) k.B(x - 0.3, x + 0.3, G, G + 8, 95.7, 96.3, 1, L);
  k.B(-14, 2, G + 5, G + 7.5, 95.9, 96.1, 1, { loose: true, transparency: 0.5, canCollide: false }); k.P([1.6, 1.6, 1.6], [-4, G + 0.8, 90], 1, { shape: 'Ball', loose: true });
  // beach huts facing the sea, the snack shack, boat rental, surfboards and kayaks
  const hut = (x, z, c) => {
    const h = k.at(x, z, 180);
    h.slab(-4, 4, -3, 3, G, G + 0.5, 217, { tile: 8 });
    h.wall('x', -4, 4, -3, G, G + 7, c, { open: [[-1.5, 1.5, G + 0.5, G + 6, 'door']], panel: 8 }); h.wall('x', -4, 4, 3, G, G + 7, c, { panel: 8 });
    h.wall('z', -2.5, 2.5, -4, G, G + 7, 1, { panel: 6 }); h.wall('z', -2.5, 2.5, 4, G, G + 7, 1, { panel: 6 });
    h.gable(-4.6, 4.6, -3.8, 3.8, G + 7, 3, 1, 9.2); h.gableEnds(-3.9, 3.9, -2.9, 2.9, G + 7, 2.6, c);
  };
  [[22, 23], [32, 21], [42, 24], [52, 28]].forEach(([x, c]) => hut(x, 61, c));
  R.add(shop(kit(st, -22, 62, 180), { w: 14, d: 8, h: 10, wall: 24, trim: 21, text: 'SNACKS', bg: '#c4281c', awning: 21, inner: 'diner' }));
  R.add(shop(kit(st, -60, 64, 180), { w: 12, d: 8, h: 10, wall: 1, trim: 23, text: 'BOATS', bg: '#0d4fa8' }));
  for (const [i, c] of [[0, 24], [1, 21], [2, 23], [3, 106]]) k.P([0.5, 7, 2], [72 + i * 2.6, G + 3.4, 57], c, { rotation: [-14, 0, 0], loose: true });
  for (const [x, z, c] of [[94, 60, 21], [96, 64, 24], [-102, 76, 23]]) { k.B(x - 6, x + 6, G + 0.25, G + 1.4, z - 1.2, z + 1.2, c, L); k.B(x - 1.5, x + 1.5, G + 1.4, G + 1.8, z - 0.8, z + 0.8, 26, L); }
  for (const [x, z] of [[-100, 58], [8, 58], [86, 112], [-40, 112]]) { k.B(x - 3, x + 3, G, G + 1.6, z - 2, z + 2, 5, L); k.B(x - 0.2, x + 0.2, G + 1.6, G + 3.6, z - 1, z, 37, { loose: true, canCollide: false }); k.B(x + 1, x + 1.3, G + 1.6, G + 3, z, z + 1, 37, { loose: true, canCollide: false }); }
  for (const [x, z, s] of [[-108, 60, 5], [108, 66, 6], [70, 110, 4], [-60, 108, 5], [110, 100, 5]]) k.B(x - s, x + s, G - 1, G + s * 0.7, z - s * 0.8, z + s * 0.8, 194, ROCK);
  // lamps along the harbour road and the lane
  for (const x of [-100, -60, -24, 20, 60, 100]) k.lamp(x, 24, 180);
  for (const x of [-84, -30, 24]) k.lamp(x, -46, 180);
  k.car(-60, 13.5, 90, 23); k.car(40, 18.5, -90, 1); k.car(-10, -20, 0, 21); k.car(-90, -51, 90, 192);
  return {
    name: 'Lighthouse Point',
    spawns: [[-60, 16], [-20, 16], [20, 16], [60, 16], [-90, 30], [90, 30], [-10, -30], [-40, -53], [10, -53], [0, 64], [40, 70], [-62, 70]].map(([x, z]) => [x, G, z]),
    high: R.high,
    inside: R.inside,
    open: [[-60, 16], [20, 16], [80, 16], [0, 64], [30, 76], [-20, 96], [60, 100], [-100, 70], [80, -20], [-10, -40]],
    beacon: { x: cx - 1.6, y: gy + 4.5, z: cz },
  };
}

// --- 5. Rakish Refinery ---------------------------------------------------------------------------------------------------
function refinery(st) {
  const g = ground(st), R = routes(), k = kit(st);
  g.pad(-113, 113, -113, 113, 194, 0.3);
  g.roads([[14, 26, -113, 113]], [[-14, -2, -113, 113]], { y: 0.3, walk: false });
  // the tank farm: two rows of tanks behind low walls, catwalks between the tops of the big ones
  const t1 = R.add(oilTank(kit(st, -98, -88), 10, 6, 1, [2]));
  R.add(oilTank(kit(st, -70, -88), 10, 6, 194, [2, 6]));
  R.add(oilTank(kit(st, -42, -88), 10, 6, 1, [6]));
  R.add(oilTank(kit(st, -98, -46), 9, 5, 194));
  R.add(oilTank(kit(st, -70, -46), 10, 6, 1));
  R.add(oilTank(kit(st, -42, -46), 8, 4, 194));
  for (const x0 of [-88.5, -60.5]) { k.B(x0, x0 + 9, t1.top, t1.top + 0.8, -89.5, -86.5, 24); k.B(x0, x0 + 9, t1.top + 0.8, t1.top + 3, -89.9, -89.5, 24); k.B(x0, x0 + 9, t1.top + 0.8, t1.top + 3, -86.5, -86.1, 24); }
  for (const [z0, z1] of [[-102, -72], [-60, -32]]) {
    k.B(-112, -28, G, G + 2, z0, z0 + 1, 199); k.B(-112, -111, G, G + 2, z0 + 1, z1 - 1, 199); k.B(-29, -28, G, G + 2, z0 + 1, z1 - 1, 199);
    for (const [a0, a1] of [[-112, -84], [-80, -56], [-52, -28]]) k.B(a0, a1, G, G + 2, z1 - 1, z1, 199);
  }
  // the pipe rack along the north, bridging the road
  for (let x = -110; x <= 58; x += 12) { if (x > -15 && x < -1) continue; k.B(x - 0.6, x + 0.6, G, G + 12, -22.6, -21.4, 199); k.B(x - 0.6, x + 0.6, G, G + 12, -18.6, -17.4, 199); k.B(x - 0.6, x + 0.6, G + 12, G + 12.6, -22.6, -17.4, 199); }
  for (let x = -110; x < 58; x += 24) { k.P([24, 1.6, 1.6], [x + 12, G + 13.4, -21], 24, { shape: 'Cylinder' }); k.P([24, 1.6, 1.6], [x + 12, G + 13.4, -18.6], 1, { shape: 'Cylinder' }); k.P([24, 1, 1], [x + 12, G + 13.1, -20], 21, { shape: 'Cylinder' }); }
  // the cracking towers and the flare stack
  R.add(crackTower(kit(st, 22, -64), 48));
  R.add(crackTower(kit(st, 42, -92), 40, 1));
  for (let i = 0; i < 10; i++) k.P([5, 2, 2], [10, G + 2.5 + i * 5, -104], i > 7 ? 21 : 199, { shape: 'Cylinder', rotation: [0, 0, 90] });
  for (const [x, z] of [[4, -110], [16, -110], [10, -98]]) k.B(x - 0.15, x + 0.15, G, G + 30, z - 0.15, z + 0.15, 26, { loose: true, canCollide: false });
  // the control room and the offices
  R.add(shop(kit(st, 84, -50, 180), { w: 26, d: 16, h: 12, wall: 208, trim: 24, text: 'CONTROL ROOM', bg: '#2a2a2a', fg: '#ffd84a', inner: 'office', glass: 42 }));
  const sk = kit(st, 84, -50, 180, 13);
  sk.B(-9.4, -8.6, G, G + 6, 2, 3, 26); sk.B(8.6, 9.4, G, G + 6, 2, 3, 26); sk.sign(0, G + 6.5, 2.5, 22, 4.4, 'RAKISH\nREFINERY', { bg: '#1b1b1b', fg: '#ff9a2a' });
  R.add(apartments(kit(st, 88, -92, 180), { w: 28, d: 18, floors: 3, wall: 208, trim: 199, text: 'OFFICES', bg: '#2a2a2a', glass: 102 }));
  g.pad(62, 110, -32, 8, 199, 0.4, { top: 'Smooth' }); g.stalls(64, 108, -30, -18, 8, 0.4);
  k.car(68, -24, 0, 21); k.car(84, -24, 180, 1); k.car(100, -24, 0, 26); k.car(76, 0, 90, 23);
  for (const x of [64, 108]) k.lamp(x, -12, x < 80 ? 90 : -90);
  // the warehouse
  const wh = kit(st, -66, 70);
  wh.slab(-26, 26, -32, 32, G + 0.3, G + 0.6, 199, { tile: 13, props: { top: 'Smooth' } });
  const hi = (a) => [a - 2.5, a + 2.5, G + 11, G + 15, 'glass'];
  wh.wall('x', -26, 26, -32, G, G + 18, 23, { panel: 8, open: [[-20, -8, G, G + 12, 'door'], [8, 20, G, G + 12, 'door']] });
  wh.wall('x', -26, 26, 32, G, G + 18, 23, { panel: 8, open: [hi(-14), hi(0), hi(14)] });
  wh.wall('z', -32, 32, -26, G, G + 18, 23, { panel: 8, open: [hi(-20), hi(0), hi(20)] });
  wh.wall('z', -32, 32, 26, G, G + 18, 23, { panel: 8, open: [[-6, 6, G, G + 12, 'door'], hi(-20), hi(20)] });
  const roof = wh.at(0, 0, 90);
  roof.gable(-33, 33, -27, 27, G + 18, 9, 194, 8);
  roof.gableEnds(-31.9, 31.9, -26, 26, G + 18, 8.4, 23);
  wh.sign(0, G + 15, -32.85, 26, 3, 'WAREHOUSE 2', { bg: '#0d2f5a' });
  for (const x of [-20, -10, 10, 20]) for (let y = 0; y < 3; y++) for (const z of [-4, 6, 16]) if (y < 2 || (x + z) % 4) wh.crate(x, z + (y % 2), 4, G + 0.6 + y * 4, y === 2 ? 24 : 192);
  for (const z of [-20, 24]) for (const [a0, a1] of [[-22, -5], [5, 22]]) { for (const x of [a0, (a0 + a1) / 2, a1]) wh.B(x - 0.4, x + 0.4, G + 0.6, G + 12, z - 2, z + 2, 106); for (const y of [G + 0.6, G + 4.6, G + 8.6, G + 12]) wh.B(a0, a1, y, y + 0.4, z - 2, z + 2, 199); }
  const fl = wh.at(-14, -14, 30); fl.B(-1.6, 1.6, G + 0.6, G + 3.4, -2.4, 2.4, 24, L); fl.B(-1.4, 1.4, G + 3.4, G + 7.4, 0, 2.4, 26, { loose: true, transparency: 0.6 }); fl.B(-1.6, 1.6, G + 0.6, G + 7.6, -2.6, -2.4, 26, L); fl.B(-1.4, 1.4, G + 1, G + 1.3, -5.4, -2.6, 194, L);
  R.inside.push([wh.T(14, G, -38), wh.T(14, G, -27), wh.T(0, G, -27), wh.T(0, G, -10)]);
  // the container yard and its gantry crane
  const cols = [21, 23, 24, 28, 106, 1, 102];
  let ci = 0;
  for (const [x, hgt] of [[40, 1], [50, 2], [60, 3], [70, 2], [80, 1], [90, 3], [100, 2]]) for (const [z0, n] of [[40, hgt], [64, Math.max(1, 4 - hgt)]]) for (let j = 0; j < n; j++) k.B(x - 4, x + 4, G + 0.3 + j * 8.6, G + 8.9 + j * 8.6, z0, z0 + 20, cols[ci++ % cols.length]);
  k.ladder(60, 38.6, G, G + 26.2);
  R.high.push([[60, G, 34], [60, G + 26.1, 38.6, 'climb'], [60, G + 26.1, 46]]);
  for (const [x, z] of [[33, 34], [33, 92], [107, 34], [107, 92]]) k.B(x - 1.2, x + 1.2, G, G + 32, z - 1.2, z + 1.2, 24);
  for (const z of [34, 92]) k.B(31.8, 108.2, G + 32, G + 34, z - 1.4, z + 1.4, 24);
  k.B(64, 72, G + 34, G + 35.4, 32, 94, 24); k.B(65, 71, G + 30, G + 34, 60, 66, 199);
  k.B(67.85, 68.15, G + 27.6, G + 30, 62.85, 63.15, 26, { canCollide: false }); k.B(64, 72, G + 19, G + 27.6, 53, 73, 21, L);
  k.ladder(33, 31.6, G, G + 34.2);
  R.high.push([[33, G, 28], [33, G + 34, 31.6, 'climb'], [40, G + 34, 34]]);
  // the railway, with tank cars
  for (const z of [105, 109]) k.B(-113, 113, G + 0.3, G + 0.9, z - 0.3, z + 0.3, 131, { ...GR });
  for (let x = -111; x < 113; x += 5) k.B(x - 0.6, x + 0.6, G + 0.3, G + 0.6, 103.5, 110.5, 217, { name: 'Ground', canCollide: false });
  for (const x of [-40, -14, 12]) {
    k.B(x - 11, x + 11, G + 1.6, G + 2.6, 104, 110, 26, L);
    k.P([20, 7, 7], [x, G + 6.1, 107], x === -14 ? 21 : 1, { shape: 'Cylinder', loose: true, userData: { tank: true } });
    for (const dx of [-8, 8]) for (const z of [104.6, 109.4]) k.P([0.6, 2.4, 2.4], [x + dx, G + 1.6, z], 26, { shape: 'Cylinder', loose: true });
  }
  // the loading yard: a lorry, barrels, pallets, a guard hut, a warning sign
  const lorry = k.at(22, 66, 0);
  lorry.B(-3.5, 3.5, G + 1.4, G + 9, -14, 12, 1, L); lorry.B(-3.5, 3.5, G + 1.4, G + 7.4, 13, 19, 21, L); lorry.B(-3.2, 3.2, G + 4.6, G + 6.8, 18.9, 19.1, 42, L);
  for (const z of [-10, -4, 8, 16]) for (const x of [-3.6, 3.6]) lorry.P([1.2, 2.8, 2.8], [x, G + 1.7, z], 26, { shape: 'Cylinder', loose: true });
  for (let i = 0; i < 16; i++) k.barrel(-34 + (i % 4) * 3.2, 84 + Math.floor(i / 4) * 3.2, i % 3 ? 21 : 24);
  for (let i = 0; i < 6; i++) { const x = -32 + (i % 3) * 6, z = 40 + Math.floor(i / 3) * 6; k.B(x - 2.5, x + 2.5, G + 0.3, G + 0.9, z - 2.5, z + 2.5, 217, L); k.crate(x, z, 4, G + 0.9); }
  R.add(shop(kit(st, 18, 40, 180), { w: 10, d: 8, h: 10, wall: 1, trim: 24, text: 'GUARD', bg: '#2a2a2a' }));
  k.B(-35.5, -34.5, G, G + 7, 29, 30, 26); k.B(-17.5, -16.5, G, G + 7, 29, 30, 26); k.sign(-26, G + 7, 29.5, 20, 4, 'DANGER: FLAMMABLE', { bg: '#ffd400', fg: '#1b1b1b', border: '#1b1b1b' });
  for (const [x, z] of [[-22, 34], [24, 34], [-24, -10], [26, -10], [-110, 10], [110, 30]]) {
    k.B(x - 0.5, x + 0.5, G, G + 22, z - 0.5, z + 0.5, 199, L);
    k.B(x - 2.5, x + 2.5, G + 21, G + 23, z - 0.6, z + 0.6, 1, { loose: true, material: 'Neon' });
  }
  return {
    name: 'Rakish Refinery',
    spawns: [[-60, 20], [-30, 20], [30, 20], [60, 20], [90, 20], [-90, 20], [-8, -40], [-8, 70], [-8, 96], [20, -10], [-60, -10], [86, -10]].map(([x, z]) => [x, G, z]),
    high: R.high,
    inside: R.inside,
    open: [[-60, 20], [0, 20], [60, 20], [-8, -40], [-8, 60], [-30, -10], [100, 20], [-100, 20], [30, 100], [-110, 0]],
  };
}

export const MAPS = [
  { id: 'home', name: 'Happy Home', build: happyHome },
  { id: 'office', name: 'Glass Office', build: glassOffice },
  { id: 'firestation', name: 'Fire Station', build: fireStation },
  { id: 'lighthouse', name: 'Lighthouse Point', build: lighthouse },
  { id: 'refinery', name: 'Rakish Refinery', build: refinery },
];
