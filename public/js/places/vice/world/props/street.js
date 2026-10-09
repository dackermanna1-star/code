// Street furniture along the sidewalks (roads.walkways): bus shelters on the
// avenues, hydrants, bins, parking meters along the streets that have
// parking, newspaper boxes, mailboxes, phone booths, benches and planters -
// densest where the district is busy, sparse in the suburbs. Near the kerb:
// things that serve the road; near the buildings: things you sit at. Green
// street-name signs at the junctions, STOP signs where there are no lights,
// speed limits on the avenues, and big lit billboards on poles along the
// expressway.
import * as THREE from 'three';
import { V } from '../../state.js';
import { L, tint, cyl, hash, rnd, canvasTex, GROUND } from './kit.js';
import { place } from './furniture.js';

const NEWS = [0x1d5fbf, 0xd62828, 0xffc21a, 0xf1f1f1, 0x2a9d4a, 0x222222];

export function buildStreets(P) {
  const R = V.roads;
  if (!R) return;
  const plan = P.plan;
  // things already on the sidewalks: lamps and traffic light poles
  for (const l of R.lamps) P.occupy(l.x, l.z, 2.5);
  const signs = new SignAtlas();
  const usedNode = new Set();
  for (const w of R.walkways) {
    const e = plan.edges[w.edge];
    if (e.elevated) continue;
    const L0 = Math.hypot(w.bx - w.ax, w.bz - w.az);
    if (L0 < 24) continue;
    const tx = (w.bx - w.ax) / L0, tz = (w.bz - w.az) / L0;
    const ox = tz * w.side, oz = -tx * w.side;          // towards the road
    const D = plan.districtAt((w.ax + w.bx) / 2, (w.az + w.bz) / 2), busy = D.peds;
    const kerb = w.w / 2 - 1.7, wall = w.w / 2 - 1.6;
    const at = (d, off) => [w.ax + tx * d + ox * off, w.az + tz * d + oz * off];
    const roadHead = Math.atan2(ox, oz);                 // facing the road
    const h = (k) => hash(w.ax * 3 + k, w.az * 7 - k, w.edge);
    const put = (name, d, off, head, col, r = 2) => {
      if (d < 6 || d > L0 - 6) return null;
      const [x, z] = at(d, off);
      if (!P.isFree(x, z, r) || !P.free(x, z, 1)) return null;
      P.occupy(x, z, r);
      return place(P, name, x, z, head, col, w.y);
    };
    if (e.bridge) continue;
    // a hydrant near the start of most blocks, another on long ones
    if (h(0) < 0.4 + busy * 0.5) put('hydrant', 9 + h(1) * 6, kerb, roadHead + h(2) * 6, tint(h(3) < 0.75 ? 0xf2c200 : 0xd62828, 1.1));
    if (L0 > 220 && busy > 0.5) put('hydrant', L0 * 0.6, kerb, roadHead, tint(0xf2c200, 1.1));
    // bins at the corners
    if (busy > 0.4 && h(12) < busy) { put('bin', L0 - 9, kerb, 0, tint(0x2a5d48)); if (busy > 0.8 && L0 > 150) put('bin', L0 * 0.5 + 8, kerb, 0, tint(0x2a5d48)); }
    // bus shelters on the avenues
    if ((e.cls === 'ave' || e.cls === 'blvd') && L0 > 110 && (e.id + (w.side > 0 ? 0 : 1)) % 2 === 0) {
      const d = L0 * 0.5;
      const [x, z] = at(d, kerb - 1.2);
      if (P.isFree(x, z, 7) && P.free(x, z, 6)) {
        P.occupy(x, z, 8);
        const it = place(P, 'busstop', x, z, roadHead, tint([0x1aa6b7, 0xef476f, 0x2b59c3, 0x3a3a3a][e.id % 4], 1.1), w.y);
        const bx = x - ox * 2.2, bz = z - oz * 2.2;
        P.box(bx, w.y + 4.2, bz, 6.4, 4.2, 0.4, roadHead, 'glass', { prop: true, shelter: true, glass: true, item: it });
        P.busStops = P.busStops || []; P.busStops.push({ x, z, heading: roadHead, edge: e.id });
      }
    }
    // parking meters along streets with parking, in town
    if (e.R.parking && busy >= 0.5) for (let d = 22; d < L0 - 18; d += 52) put('meter', d + 1.5, kerb + 0.6, roadHead, null, 1.5);
    // newspaper boxes in a little row near a corner
    if (busy >= 0.6 && h(4) < 0.45) for (let k = 0; k < 2 + (h(5) < 0.5 ? 1 : 0); k++) put('newsbox', 16 + k * 2.1, kerb, roadHead, tint(NEWS[Math.floor(h(6 + k) * NEWS.length)], 1.1), 1);
    // a mailbox now and then
    if (h(7) < 0.22 * busy + 0.06) put('mailbox', L0 * 0.32, kerb, roadHead, tint(0x1f4ea8, 1.1));
    // a phone booth, rarely
    if (busy >= 0.5 && h(8) < 0.06) put('phone', L0 * 0.7, wall, roadHead + Math.PI, tint(0x8a8f96, 1.1), 2);
    // benches facing the road, planters in the towers' districts
    if (busy >= 0.45) for (let d = 30 + h(9) * 30; d < L0 - 20; d += 90 + h(10) * 50) {
      if (D.style === 'tower' && h(d) < 0.5) { const it = put('planter', d, wall - 1, 0, null, 3.5); if (it) P.addBush(it.x, it.y + 2.2, it.z, 0.8, h(d + 1) < 0.3 ? 'bougain' : 'shrub'); }
      else put('bench', d, wall, roadHead, tint([0x2e5e4e, 0x3a3a3a, 0x6b3e26][e.id % 3]));
    }
    // street-name signs at the start of the block, STOP signs where there are no lights
    const nA = plan.nodes[e.a], nB = plan.nodes[e.b];
    if (w.side > 0 && !usedNode.has(e.a) && nA.edges.length >= 3) {
      const cross = nA.edges.map((id) => plan.edges[id]).find((o) => o !== e && o.name && o.name !== e.name);
      if (e.name || cross) {
        const [x, z] = at(5, kerb);
        if (P.isFree(x, z, 1.5)) { usedNode.add(e.a); P.occupy(x, z, 1.5); streetSign(P, signs, x, w.y, z, tx, tz, e.name, cross?.name, cross); }
      }
    }
    // STOP for traffic arriving at a junction without lights: at the end of the block on its right
    const stopAt = w.side > 0 ? nB : nA;
    if (stopAt.edges.length >= 3 && !stopAt.light && e.cls === 'street') {
      const d = w.side > 0 ? L0 - 4 : 4, [x, z] = at(d, kerb);
      const fx = w.side > 0 ? -tx : tx, fz = w.side > 0 ? -tz : tz; // facing the drivers
      if (P.isFree(x, z, 1.2)) { P.occupy(x, z, 1.2); plateSign(P, signs, x, w.y, z, fx, fz, 'STOP'); }
    }
    // speed limits on the avenues, one per block
    if ((e.cls === 'ave' || e.cls === 'blvd') && L0 > 90 && h(11) < 0.5) {
      const d = w.side > 0 ? 18 : L0 - 18, [x, z] = at(d, kerb);
      const fx = w.side > 0 ? -tx : tx, fz = w.side > 0 ? -tz : tz;
      if (P.isFree(x, z, 1.2)) { P.occupy(x, z, 1.2); plateSign(P, signs, x, w.y, z, fx, fz, e.cls === 'blvd' ? 'SPEED45' : 'SPEED35'); }
    }
  }
  signs.finish(P);
  billboards(P);
}

// ---- signs: one canvas atlas with every name, STOP and the speed limits --------------------
const CELL_W = 512, CELL_H = 64, COLS = 2, ROWS = 40;
class SignAtlas {
  constructor() { this.names = new Map(); this.list = []; }
  cell(name) {
    if (!this.names.has(name)) { this.names.set(name, this.list.length); this.list.push(name); }
    const i = this.names.get(name), c = i % COLS, r = Math.floor(i / COLS);
    return [c / COLS, 1 - (r + 1) / ROWS, (c + 1) / COLS, 1 - r / ROWS];
  }
  finish(P) {
    const list = this.list.slice(0, COLS * ROWS);
    const tex = canvasTex(CELL_W * COLS, CELL_H * ROWS, (x) => {
      list.forEach((name, i) => {
        const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H;
        if (name === 'STOP') {
          x.fillStyle = '#c8102e'; x.fillRect(cx, cy, CELL_W, CELL_H);
          x.fillStyle = '#fff'; x.font = 'bold 50px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STOP', cx + CELL_W / 2, cy + CELL_H / 2 + 2);
        } else if (name.startsWith('SPEED')) {
          x.fillStyle = '#f4f4f0'; x.fillRect(cx, cy, CELL_W, CELL_H);
          x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(cx + 6, cy + 6, CELL_W - 12, CELL_H - 12);
          x.fillStyle = '#111'; x.font = 'bold 30px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SPEED LIMIT ' + name.slice(5), cx + CELL_W / 2, cy + CELL_H / 2 + 2);
        } else if (name === '#BACK') {
          x.fillStyle = '#8d9196'; x.fillRect(cx, cy, CELL_W, CELL_H);
        } else {
          x.fillStyle = '#0f6b3c'; x.fillRect(cx, cy, CELL_W, CELL_H);
          x.strokeStyle = '#f2f2f2'; x.lineWidth = 3; x.strokeRect(cx + 4, cy + 4, CELL_W - 8, CELL_H - 8);
          x.fillStyle = '#f7f7f7'; x.font = 'bold 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
          let t = name.toUpperCase(); while (x.measureText(t).width > CELL_W - 30 && t.length > 4) t = t.slice(0, -1);
          x.fillText(t, cx + CELL_W / 2, cy + CELL_H / 2 + 2);
        }
      });
    });
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1 });
    P.signMat = mat;
    P.extraMats = P.extraMats || {};
    P.extraMats.sign = mat;
  }
}
/** A green street sign: two blades on a pole, one along the street, one along the cross street. */
function streetSign(P, A, x, y, z, tx, tz, name, cross, crossEdge) {
  const g = P.C.get('detail', x, z), gs = P.C.get('sign', x, z), steel = [0.3, 0.32, 0.35];
  cyl(g, x, y, z, 0.18, 13.2, 6, { lay: L.concrete, tint: steel });
  const blade = (ux, uz, label, yy) => {
    const uv = A.cell(label);
    const w = 4.8, h = 0.75, nx = -uz * 0.06, nz = ux * 0.06;
    const p = (s, v, off) => [x + ux * s + nx * off, yy + v, z + uz * s + nz * off];
    gs.quad(p(-w, -h, 1), p(w, -h, 1), p(w, h, 1), p(-w, h, 1), { uvs: [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] });
    gs.quad(p(w, -h, -1), p(-w, -h, -1), p(-w, h, -1), p(w, h, -1), { uvs: [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] });
  };
  if (name) blade(tx, tz, name, y + 12.4);
  if (cross && crossEdge) {
    const p = crossEdge.pts, dx = p[p.length - 1].x - p[0].x, dz = p[p.length - 1].z - p[0].z, l = Math.hypot(dx, dz) || 1;
    blade(dx / l, dz / l, cross, y + (name ? 11.0 : 12.4));
  }
  P.box(x, y + 6.6, z, 0.25, 6.6, 0.25, 0, 'metal', { prop: true, breakable: true, pole: true });
}
/** A square plate on a short post facing direction (fx, fz): STOP or a speed limit. */
function plateSign(P, A, x, y, z, fx, fz, label) {
  const g = P.C.get('detail', x, z), gs = P.C.get('sign', x, z), steel = [0.42, 0.44, 0.47];
  cyl(g, x, y, z, 0.14, 8.6, 6, { lay: L.concrete, tint: steel });
  const uv = A.cell(label), back = A.cell('#BACK');
  const rx = fz, rz = -fx, stop = label === 'STOP';
  const hw = stop ? 1.5 : 1.7, hh = stop ? 1.5 : 1.9, cy = y + 7.6;
  // the front: a plate (the STOP is an octagon cut from the square cell by its corners)
  const P0 = (u, v, off) => [x + rx * u + fx * off, cy + v, z + rz * u + fz * off];
  const u0 = uv[0], u1 = uv[2], v0 = uv[1], v1 = uv[3];
  if (stop) {
    // map a 512 x 64 cell's centre onto a square: use the middle third of the cell
    const um0 = u0 + (u1 - u0) * 0.33, um1 = u0 + (u1 - u0) * 0.67;
    const oct = []; for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; oct.push([Math.cos(a) * hw, Math.sin(a) * hh]); }
    for (let k = 1; k < 7; k++) {
      const q = [oct[0], oct[k], oct[k + 1]];
      const base = gs.count;
      for (const [u, v] of q) { const pp = P0(u, v, 0.12); gs.vert(pp[0], pp[1], pp[2], fx, 0, fz, um0 + (u / hw * 0.5 + 0.5) * (um1 - um0), v0 + (v / hh * 0.5 + 0.5) * (v1 - v0), 0, 0.5, 0, 1, 1, 1, null); }
      gs.idx.push(base, base + 1, base + 2);
      const b2 = gs.count, bk = A.cell('#BACK');
      for (const [u, v] of [q[0], q[2], q[1]]) { const pp = P0(u, v, 0.06); gs.vert(pp[0], pp[1], pp[2], -fx, 0, -fz, bk[0] + 0.1, bk[1] + 0.01, 0, 0.5, 0, 1, 1, 1, null); }
      gs.idx.push(b2, b2 + 1, b2 + 2);
    }
  } else {
    gs.quad(P0(-hw, -hh * 0.5, 0.12), P0(hw, -hh * 0.5, 0.12), P0(hw, hh * 0.5, 0.12), P0(-hw, hh * 0.5, 0.12), { uvs: [[u0 + 0.08 * (u1 - u0), v0], [u1 - 0.08 * (u1 - u0), v0], [u1 - 0.08 * (u1 - u0), v1], [u0 + 0.08 * (u1 - u0), v1]] });
    gs.quad(P0(hw, -hh * 0.5, 0.06), P0(-hw, -hh * 0.5, 0.06), P0(-hw, hh * 0.5, 0.06), P0(hw, hh * 0.5, 0.06), { uvs: [[back[0], back[1]], [back[0] + 0.01, back[1]], [back[0] + 0.01, back[3]], [back[0], back[3]]] });
  }
  P.box(x, y + 4.3, z, 0.2, 4.3, 0.2, 0, 'metal', { prop: true, breakable: true, pole: true });
}

// ---- billboards along the expressway ---------------------------------------------------------
const ADS = [
  { bg: ['#ff2d95', '#7b2cbf'], title: 'FLASH 98.3', sub: 'VICE CITY’S HITS', fg: '#ffffff', deco: 'wave' },
  { bg: ['#16c2c2', '#0a6e8f'], title: 'OCEAN VIEW', sub: 'ART DECO HOTEL • SOUTH BEACH', fg: '#ffffff', deco: 'palm' },
  { bg: ['#ffcf3f', '#ff7a1a'], title: 'SUNSHINE AUTOS', sub: 'DRIVE THE DREAM', fg: '#2b1d0e', deco: 'sun' },
  { bg: ['#fdfcf7', '#ffd6e7'], title: 'VICE AIR', sub: 'FLY THE COAST', fg: '#ff3f8e', deco: 'plane' },
  { bg: ['#d62828', '#8c1a1a'], title: 'CORAL COLA', sub: 'ICE COLD', fg: '#ffffff', deco: 'wave' },
  { bg: ['#120e2b', '#5a189a'], title: 'CLUB NEON', sub: 'TONIGHT • OCEAN DRIVE', fg: '#3ef0ff', deco: 'sun' },
  { bg: ['#2d6a4f', '#1b4332'], title: 'HAVANA CIGARS', sub: 'CALLE OCHO SINCE 1962', fg: '#ffd166', deco: 'palm' },
  { bg: ['#1d3557', '#457b9d'], title: 'VICE GAZETTE', sub: 'THE CITY NEVER SLEEPS', fg: '#f1faee', deco: 'wave' },
];
function adAtlas() {
  return canvasTex(1024, 512, (x) => {
    x.scale(0.5, 0.5);
    ADS.forEach((a, i) => {
      const cx = (i % 4) * 512, cy = Math.floor(i / 4) * 512, W = 512, H = 512;
      const g = x.createLinearGradient(cx, cy, cx + W, cy + H); g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
      x.fillStyle = g; x.fillRect(cx, cy, W, H);
      x.save(); x.beginPath(); x.rect(cx, cy, W, H); x.clip();
      x.globalAlpha = 0.35; x.fillStyle = a.fg;
      if (a.deco === 'sun') { x.beginPath(); x.arc(cx + W * 0.8, cy + H * 0.35, 120, 0, Math.PI * 2); x.fill(); }
      if (a.deco === 'wave') for (let k = 0; k < 5; k++) { x.beginPath(); for (let u = 0; u <= W; u += 24) x.lineTo(cx + u, cy + H * 0.72 + k * 26 + Math.sin(u / 40 + k) * 12); x.lineTo(cx + W, cy + H); x.lineTo(cx, cy + H); x.fill(); }
      if (a.deco === 'palm') { x.lineWidth = 16; x.strokeStyle = a.fg; x.beginPath(); x.moveTo(cx + W * 0.82, cy + H); x.quadraticCurveTo(cx + W * 0.78, cy + H * 0.6, cx + W * 0.86, cy + H * 0.3); x.stroke(); for (let k = 0; k < 7; k++) { const an = -Math.PI + k * 0.5; x.beginPath(); x.ellipse(cx + W * 0.86 + Math.cos(an) * 60, cy + H * 0.3 + Math.sin(an) * 30 + 20, 70, 14, an, 0, Math.PI * 2); x.fill(); } }
      if (a.deco === 'plane') { x.beginPath(); x.ellipse(cx + W * 0.75, cy + H * 0.3, 110, 22, -0.2, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(cx + W * 0.72, cy + H * 0.3); x.lineTo(cx + W * 0.6, cy + H * 0.55); x.lineTo(cx + W * 0.68, cy + H * 0.55); x.lineTo(cx + W * 0.82, cy + H * 0.32); x.fill(); }
      x.globalAlpha = 1; x.restore();
      x.fillStyle = a.fg; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.font = 'bold 86px Arial Black, Arial, sans-serif';
      let t = a.title; let fs = 86; while (x.measureText(t).width > W - 50 && fs > 40) { fs -= 4; x.font = `bold ${fs}px Arial Black, Arial, sans-serif`; }
      x.fillText(t, cx + 26, cy + H * 0.56);
      x.font = 'bold 34px Arial, sans-serif'; x.fillText(a.sub, cx + 28, cy + H * 0.68);
      x.fillRect(cx + 28, cy + H * 0.6, 160, 6);
    });
  });
}
function billboards(P) {
  const plan = P.plan, r = rnd(555);
  const tex = adAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  P.extraMats = P.extraMats || {}; P.extraMats.ads = mat;
  (P.anim = P.anim || []).push(() => { mat.emissiveIntensity = P.glow.value * 0.7; });
  let k = 0;
  for (const e of plan.edges) {
    if (!e.elevated || e.len < 300) continue;
    for (let d = 140; d < e.len - 140; d += 520) {
      const p = pointOn(e, d);
      if (p.y < GROUND + 30) continue;
      for (const s of [-1, 1]) {
        if (r() < 0.35) continue;
        const off = e.width / 2 + 34;
        const x = p.x - p.tz * off * s, z = p.z + p.tx * off * s;
        if (!plan.isLand(x, z, 10) || P.roads.clear(x, z) < 8 || !P.free(x, z, 22) || !P.isFree(x, z, 10)) continue;
        billboard(P, x, z, p.y + 6, Math.atan2(p.tx, p.tz) + Math.PI / 2 + (r() - 0.5) * 0.3, k++ % ADS.length, (k * 3 + 5) % ADS.length);
      }
    }
  }
  // a few on the causeway islands and by the airport
  for (const [x, z, hd] of [[1000, -1240, 0], [1220, -1340, Math.PI], [-2600, -900, 0.3], [-1500, -980, Math.PI], [620, -2560, Math.PI / 2], [2140, -1240, -Math.PI / 2]]) {
    if (!plan.isLand(x, z, 8) || P.roads.clear(x, z) < 6 || !P.free(x, z, 22)) continue;
    billboard(P, x, z, GROUND + 26, hd, k++ % ADS.length, (k + 3) % ADS.length);
  }
  P.billboards = k;
}
function billboard(P, x, z, top, h, adA, adB) {
  const y = P.ground.heightAt(x, z), g = P.C.get('surf', x, z), ga = P.C.get('ads', x, z);
  const c = Math.cos(h), s = Math.sin(h), W2 = 21, H2 = 7.5, by = top + H2;
  const Wd = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const steel = [0.5, 0.52, 0.55];
  cyl(g, x, y, z, 1.6, by - y - H2 + 0.5, 10, { lay: L.concrete, tint: steel, scale: 10 });
  g.box(x, by, z, W2 + 0.6, H2 + 0.6, 0.9, h, { lay: L.concrete, tint: [0.25, 0.26, 0.28] });
  // the two faces
  const face = (side, ad) => {
    const u0 = (ad % 4) / 4, v1 = 1 - Math.floor(ad / 4) / 2, u1 = u0 + 0.25, v0 = v1 - 0.5;
    const vv0 = v0 + (v1 - v0) * 0.29, vv1 = v1 - (v1 - v0) * 0.29; // the middle of the square art, letterboxed to the board
    const z0 = side * 0.95;
    const q = [Wd(-W2 * side, by - H2, z0), Wd(W2 * side, by - H2, z0), Wd(W2 * side, by + H2, z0), Wd(-W2 * side, by + H2, z0)];
    ga.quad(q[0], q[1], q[2], q[3], { uvs: [[u0, vv0], [u1, vv0], [u1, vv1], [u0, vv1]] });
  };
  face(1, adA); face(-1, adB);
  // the catwalk and its lamps
  const cw = Wd(0, by - H2 - 0.6, 2.5);
  g.box(cw[0], cw[1], cw[2], W2, 0.15, 1.6, h, { lay: L.shutter, tint: steel, scale: 3 });
  for (const lx of [-14, 0, 14]) { const lp = Wd(lx, by - H2 - 0.2, 4.6); g.box(lp[0], lp[1], lp[2], 0.8, 0.35, 0.6, h, { lay: L.whiteTiles, tint: [1, 0.95, 0.85], glow: 1 }); }
  P.box(x, (y + by) / 2, z, 1.8, (by - y) / 2, 1.8, 0, 'metal', { pole: true });
}
function pointOn(e, d) {
  const pts = e.pts;
  let i = 1;
  while (i < pts.length - 1 && pts[i].d < d) i++;
  const a = pts[i - 1], b = pts[i], Ln = b.d - a.d || 1, t = Math.min(1, Math.max(0, (d - a.d) / Ln));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / Ln, tz: (b.z - a.z) / Ln };
}
