// Chapter 4 building blocks: slabs, stair shafts, hidden infected blockers,
// breachable drywall, ceiling vents, sliding elevator doors, a live floor
// indicator, and hospital / construction prop modules shared by the lower
// hospital floors and the tower construction levels.
import * as THREE from 'three';
import { Bucket, pushBox } from '../world/geom.js';
import { materials } from '../render/materials.js';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT } from '../world/collision.js';
import { ceilingLight, sign, floorWithHoles, P } from './kit.js';
import { DF } from '../render/decals.js';
import { makeRng } from '../core/math.js';

export const FH = 4; // floor to floor
export const CH = 3.4; // ceiling height
export const rng = makeRng(404);
export const pickr = (a) => a[Math.floor(rng() * a.length)];

// ------------------------------------------------------------ slabs --
export function slab(L, x0, z0, x1, z1, y, mat = 'linoleum', holes = [], opts = {}) {
  floorWithHoles(L, x0, z0, x1, z1, y, 0.3, mat, holes, opts);
}
export function ceil(L, x0, z0, x1, z1, y, mat = 'ceiling', holes = [], opts = {}) {
  floorWithHoles(L, x0, z0, x1, z1, y + 0.15, 0.15, mat, holes, opts);
}
// Visual-only floor finish (sits 5 mm above the structural slab).
export function finish(L, x0, z0, x1, z1, y, mat, tint) {
  L.box(x0, y - 0.01, z0, x1, y + 0.005, z1, mat, { collide: false, tint });
}

// --------------------------------------------------- dynamic meshes --
// Build a (non-merged) mesh group from boxes with the same world-space UVs as
// level geometry, so a removable patch matches the wall around it.
export function boxMesh(list, matOverride = null) {
  const buckets = new Map();
  for (const b of list) {
    const [x0, y0, z0, x1, y1, z1, mat, tint] = b;
    let bk = buckets.get(mat);
    if (!bk) { bk = new Bucket(); bk.mat = mat; buckets.set(mat, bk); }
    pushBox(bk, x0, y0, z0, x1, y1, z1, { scale: materials.scaleOf(mat), tint, ao: b[8] ?? 0.8 });
  }
  const g = new THREE.Group();
  for (const bk of buckets.values()) {
    const m = new THREE.Mesh(bk.toGeometry(), matOverride || materials.get(bk.mat));
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------ blockers --
// An invisible, unbreakable, locked Door used purely as a nav blocker: infected
// stop (and bash) at it, the player collides with it. `setBlock(false)` lets
// everything through without moving any geometry.
export function blocker(L, x, y, z, axis, w, h = 2.3) {
  const d = new Door(L, x, y, z, axis, { width: w, height: h, locked: true, hp: 1e9 });
  d.mesh.visible = false;
  d.usable.enabled = false;
  d.setBlock = (on) => { d.open = !on; d.collider.enabled = on; };
  return d;
}

// -------------------------------------------------------- breach --
// A drywall section filling a wall opening that infected smash through on cue.
export function breachWall(L, game, o) {
  const { x0, y0, z0, x1, y1, z1 } = o;
  const axis = x1 - x0 > z1 - z0 ? 'x' : 'z';
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = axis === 'x' ? x1 - x0 : z1 - z0;
  const patch = boxMesh([[x0, y0, z0, x1, y1, z1, o.mat ?? 'plasterHosp', o.tint, 0.62]]);
  L.addObject(patch);
  const blk = blocker(L, cx, y0, cz, axis, w - 0.02, y1 - y0);
  blk.collider.min = [x0, y0, z0]; blk.collider.max = [x1, y1, z1];
  // rubble revealed after the breach (hidden until then)
  const rub = [];
  const nrm = o.dir ?? 1; // which side the debris falls to (+1 = +x / +z)
  for (let i = 0; i < 14; i++) {
    const a = rng() * w - w / 2, d = 0.2 + rng() * 1.8;
    const s = 0.12 + rng() * 0.35;
    const px = axis === 'x' ? cx + a : cx + nrm * d, pz = axis === 'x' ? cz + nrm * d : cz + a;
    rub.push([px - s, y0, pz - s * 0.7, px + s, y0 + s * 0.5, pz + s * 0.7, i % 3 ? 'plasterHosp' : 'concrete', 0xb8b8b0]);
  }
  const rubble = boxMesh(rub);
  rubble.visible = false;
  L.addObject(rubble);
  // cracks around the opening telegraph the weak spot
  const side = o.face ?? nrm;
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * w * 0.45;
    if (axis === 'x') L.decal(cx + a, y0 + 0.8 + rng() * 1.2, (side > 0 ? z1 : z0) + side * 0.012, 0, 0, side, 0.9, DF.CRACK);
    else L.decal((side > 0 ? x1 : x0) + side * 0.012, y0 + 0.8 + rng() * 1.2, cz + a, side, 0, 0, 0.9, DF.CRACK);
  }
  const api = {
    broken: false, blk,
    shake(k = 1) {
      if (this.broken) return;
      patch.position.set((rng() - 0.5) * 0.03 * k, 0, (rng() - 0.5) * 0.03 * k);
      game.fx.dust(cx, y0 + 2.2, cz, axis === 'x' ? 0 : nrm, -0.2, axis === 'x' ? nrm : 0, [0.7, 0.7, 0.66], 2, 0.35);
      game.audio.play('doorBang', { pos: new THREE.Vector3(cx, y0 + 1.2, cz), vol: 1 });
    },
    breach() {
      if (this.broken) return;
      this.broken = true;
      patch.visible = false;
      rubble.visible = true;
      blk.breakDoor(null);
      const nx = axis === 'x' ? 0 : nrm, nz = axis === 'x' ? nrm : 0;
      for (let i = 0; i < 6; i++) {
        const a = (rng() - 0.5) * w;
        const px = axis === 'x' ? cx + a : cx, pz = axis === 'x' ? cz : cz + a;
        game.fx.dust(px, y0 + 0.4 + rng() * 2, pz, nx, 0.2, nz, [0.72, 0.72, 0.68], 5, 0.7);
        game.fx.chips(px, y0 + 0.5 + rng() * 2, pz, nx, 0.4, nz, [0.78, 0.78, 0.74], 10);
      }
      const p = new THREE.Vector3(cx, y0 + 1.3, cz);
      game.audio.play('woodBreak', { pos: p, vol: 1.3 });
      game.audio.play('doorBreak', { pos: p, vol: 1.2 });
      game.audio.play('metalImpact', { pos: p, vol: 0.6 });
      if (game.player && game.player.pos.distanceTo(p) < 14) game.shake(0.6);
    },
  };
  return api;
}

// ---------------------------------------------------------- vents --
// Ceiling vent grate in a hole (the ceiling must already have the hole).
export function ventGrate(L, game, x, z, y, s = 1.2) {
  const list = [[x - s / 2, y - 0.02, z - s / 2, x + s / 2, y + 0.02, z - s / 2 + 0.06, 'metalDark'], [x - s / 2, y - 0.02, z + s / 2 - 0.06, x + s / 2, y + 0.02, z + s / 2, 'metalDark'],
    [x - s / 2, y - 0.02, z - s / 2, x - s / 2 + 0.06, y + 0.02, z + s / 2, 'metalDark'], [x + s / 2 - 0.06, y - 0.02, z - s / 2, x + s / 2, y + 0.02, z + s / 2, 'metalDark']];
  for (let i = 1; i < 8; i++) list.push([x - s / 2 + i * s / 8 - 0.015, y - 0.015, z - s / 2, x - s / 2 + i * s / 8 + 0.015, y + 0.015, z + s / 2, 'metal']);
  const g = boxMesh(list);
  const piv = new THREE.Group();
  piv.position.set(x, y, z);
  for (const m of g.children) { m.geometry.translate(-x, -y, -z); }
  piv.add(g);
  L.addObject(piv);
  // frame around the hole (static)
  L.box(x - s / 2 - 0.08, y - 0.03, z - s / 2 - 0.08, x + s / 2 + 0.08, y, z - s / 2, 'metalClean', { collide: false });
  L.box(x - s / 2 - 0.08, y - 0.03, z + s / 2, x + s / 2 + 0.08, y, z + s / 2 + 0.08, 'metalClean', { collide: false });
  L.box(x - s / 2 - 0.08, y - 0.03, z - s / 2, x - s / 2, y, z + s / 2, 'metalClean', { collide: false });
  L.box(x + s / 2, y - 0.03, z - s / 2, x + s / 2 + 0.08, y, z + s / 2, 'metalClean', { collide: false });
  const st = { t: -1, vy: 0, rx: 0, rz: 0 };
  const api = {
    open: false,
    rattle() { if (!this.open) { piv.rotation.x = (rng() - 0.5) * 0.05; piv.rotation.z = (rng() - 0.5) * 0.05; game.audio.play('metalImpact', { pos: piv.position, vol: 0.5 }); } },
    burst() {
      if (this.open) return;
      this.open = true;
      st.t = 0; st.vy = -1; st.rx = (rng() - 0.5) * 5; st.rz = (rng() - 0.5) * 5;
      game.audio.play('metalImpact', { pos: piv.position, vol: 1.2 });
      game.fx.dust(x, y - 0.2, z, 0, -1, 0, [0.5, 0.5, 0.48], 8, 0.5);
    },
    update(dt) {
      if (st.t < 0) return;
      st.t += dt;
      st.vy -= 16 * dt;
      piv.position.y += st.vy * dt;
      piv.rotation.x += st.rx * dt; piv.rotation.z += st.rz * dt;
      const fl = o_floor;
      if (piv.position.y < fl + 0.03) {
        piv.position.y = fl + 0.03; piv.rotation.set(0.05, piv.rotation.y, -0.04); st.t = -1;
        game.audio.play('metalImpact', { pos: piv.position, vol: 1 });
      }
    },
  };
  const o_floor = y - CH;
  L.dynamics.push(api);
  return api;
}

// -------------------------------------------------- sliding doors --
// Two metal leaves sliding apart inside an opening along X (door plane at z).
export class SlidingDoors {
  constructor(L, game, x, y, z, w = 1.6, h = 2.3, o = {}) {
    this.game = game;
    this.x = x; this.y = y; this.z = z; this.w = w; this.h = h;
    this.k = o.open ? 1 : 0; // 0 closed .. 1 open
    this.target = this.k;
    const t = 0.05;
    const mk = (x0, x1) => boxMesh([[x0, y, z - t, x1, y + h, z + t, 'metalClean', 0xb8bec0, 0.9], [x0 + 0.05, y + 1.0, z - t - 0.005, x1 - 0.05, y + 1.04, z + t + 0.005, 'chrome', 0x999999, 1]]);
    this.left = mk(x - w / 2, x); this.right = mk(x, x + w / 2);
    L.addObject(this.left); L.addObject(this.right);
    this.blk = blocker(L, x, y, z, 'x', w, Math.min(2.5, h));
    this.blk.collider.min = [x - w / 2, y, z - 0.12]; this.blk.collider.max = [x + w / 2, y + h, z + 0.12];
    this.blk.setBlock(this.k < 0.5);
    this.onOpened = null; this.onClosed = null;
    this.apply();
    L.dynamics.push(this);
  }
  open() { if (this.target !== 1) { this.target = 1; this.game.audio.play('metalGate', { pos: new THREE.Vector3(this.x, this.y + 1.2, this.z), vol: 0.35 }); } }
  close() { if (this.target !== 0) { this.target = 0; this.blk.setBlock(true); this.game.audio.play('metalGate', { pos: new THREE.Vector3(this.x, this.y + 1.2, this.z), vol: 0.35 }); } }
  apply() {
    const off = this.k * (this.w / 2 - 0.06);
    this.left.position.x = -off;
    this.right.position.x = off;
  }
  update(dt) {
    if (this.k === this.target) return;
    const sp = 0.75;
    this.k = this.target > this.k ? Math.min(this.target, this.k + dt * sp) : Math.max(this.target, this.k - dt * sp);
    this.apply();
    if (this.k === 1) { this.blk.setBlock(false); this.onOpened?.(); }
    if (this.k === 0) this.onClosed?.();
  }
}

// ------------------------------------------------ floor indicator --
// Canvas display (floor number + direction arrow) that can be updated live.
export class FloorIndicator {
  constructor(L, x, y, z, ry, w = 0.7, h = 0.32) {
    this.c = document.createElement('canvas');
    this.c.width = 256; this.c.height = 112;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = ry;
    L.addObject(this.mesh);
    this.floor = null; this.dir = null; this.blink = false;
    this.set('--', 0);
  }
  set(floor, dir = 0, lamp = false) {
    if (floor === this.floor && dir === this.dir && lamp === this.blink) return;
    this.floor = floor; this.dir = dir; this.blink = lamp;
    const g = this.c.getContext('2d');
    g.fillStyle = '#0c0806'; g.fillRect(0, 0, 256, 112);
    g.strokeStyle = '#3a2a20'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 106);
    g.fillStyle = lamp ? '#ffd040' : '#ff5a20';
    g.font = 'bold 76px "Courier New", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(floor), 150, 60);
    if (dir) {
      g.beginPath();
      if (dir > 0) { g.moveTo(52, 26); g.lineTo(82, 70); g.lineTo(22, 70); } else { g.moveTo(52, 86); g.lineTo(82, 42); g.lineTo(22, 42); }
      g.closePath(); g.fill();
    }
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------- stair shaft --
// Switchback stair (two flights) from y to y+H inside x0..x1 / z0..z1.
// entry 'n'|'s': the wall with the lower entry door and the upper exit door.
// first 'w'|'e': the half the first flight climbs on.
export function stairwell(L, o) {
  const { x0, z0, x1, z1, y } = o;
  const H = o.H ?? FH, LD = o.land ?? 1.6;
  const mat = o.mat ?? 'concrete', wm = o.wall ?? 'concreteDark';
  const xm = (x0 + x1) / 2;
  const s = o.entry === 'n' ? -1 : 1;
  const zE = s > 0 ? z1 : z0, zF = s > 0 ? z0 : z1;
  const firstW = (o.first ?? 'w') === 'w';
  const [fa0, fa1] = firstW ? [x0, xm] : [xm, x1];
  const [fb0, fb1] = firstW ? [xm, x1] : [x0, xm];
  const ym = y + H / 2, yt = y + H;
  const zEl = zE - s * LD, zFl = zF + s * LD;
  const za = Math.min(zEl, zFl), zb = Math.max(zEl, zFl);
  const top = yt + (o.topH ?? CH);
  // shaft ground (skipped when the zone slab already covers it)
  if (o.ground !== false) L.box(x0, y - 0.3, z0, x1, y, z1, mat);
  // flight 1 (solid underneath), flight 2 (+ fill under it)
  L.stairs(fa0, za, fa1, zb, y, ym, s > 0 ? '-z' : '+z', mat);
  L.stairs(fb0, za, fb1, zb, ym, yt, s > 0 ? '+z' : '-z', mat, { thin: true });
  L.box(fb0, y, za, fb1, ym - 0.42, zb, wm);
  // mid landing + upper landing
  L.box(x0, ym - 0.3, Math.min(zF, zFl), x1, ym, Math.max(zF, zFl), mat);
  L.box(x0, yt - 0.3, Math.min(zE, zEl), x1, yt, Math.max(zE, zEl), mat);
  // divider between the flights + guard on the upper landing edge
  L.box(xm - 0.07, y, za, xm + 0.07, yt + 1.05, zb, wm);
  L.box(fa0, yt, zEl - 0.05, fa1, yt + 1.05, zEl + 0.05, 'metalDark', { flags: F_SOLID | F_SHOOT });
  L.box(fa0, yt + 1.0, zEl - 0.07, fa1, yt + 1.06, zEl + 0.07, 'paintedYellow', { collide: false });
  // walls
  const xa = (fa0 + fa1) / 2, xb = (fb0 + fb1) / 2;
  const ops = [];
  if (o.doorLow !== false) ops.push({ a: xa - 0.6, b: xa + 0.6, y0: y, y1: y + 2.2 });
  if (o.doorHigh !== false) ops.push({ a: xb - 0.6, b: xb + 0.6, y0: yt, y1: yt + 2.2 });
  L.wallX(x0 - 0.15, x1 + 0.15, zE, y - 0.3, top, wm, 0.3, ops);
  if (o.farWall !== false) L.wallX(x0 - 0.15, x1 + 0.15, zF, y - 0.3, top, wm, 0.3, o.farOps || []);
  if (o.sideW !== false) L.wallZ(z0 + 0.15, z1 - 0.15, x0, y - 0.3, top, wm, 0.3, o.wOps || []);
  if (o.sideE !== false) L.wallZ(z0 + 0.15, z1 - 0.15, x1, y - 0.3, top, wm, 0.3, o.eOps || []);
  if (o.ceiling !== false) L.box(x0, top, z0, x1, top + 0.2, z1, mat);
  const doors = {};
  const dm = o.doorMat ?? 'paintedGreen';
  if (o.doorLow !== false && o.doors !== false) doors.low = new Door(L, xa, y, zE, 'x', { width: 1.1, hinge: firstW ? 1 : -1, material: dm, open: o.lowOpen, locked: o.lowLocked });
  if (o.doorHigh !== false && o.doors !== false) doors.high = new Door(L, xb, yt, zE, 'x', { width: 1.1, hinge: firstW ? -1 : 1, material: dm, open: o.highOpen, locked: o.highLocked });
  // lights + signage
  const zc = (zF + zFl) / 2;
  L.box(xm - 0.12, ym + 2.25, zF + s * 0.16 - 0.06, xm + 0.12, ym + 2.45, zF + s * 0.16 + 0.06, 'emissiveWarm', { collide: false });
  L.light(xm, ym + 2.1, zc, 0xffd8a0, o.lightI ?? 7, 8, { flicker: o.flicker ?? 0.15 });
  ceilingLight(L, xm, top, (zE + zEl) / 2, { type: 'cage', intensity: o.lightI ?? 6, range: 7, flicker: o.flicker2 ?? 0.3, on: o.topLight !== false });
  const sry = s > 0 ? Math.PI : 0; // reading from inside the shaft
  const inner = zE - s * 0.17;
  if (o.labels) {
    sign(L, o.labels[0], xa, y + 2.55, inner, sry, 0.5, 0.36, { bg: '#1a3a6a', fg: '#fff' });
    sign(L, o.labels[1], xb, yt + 2.55, inner, sry, 0.5, 0.36, { bg: '#1a3a6a', fg: '#fff' });
  }
  L.reverb(x0, y, z0, x1, top, z1, 'stairwell');
  L.ambience(x0, y, z0, x1, top, z1, 'hospital');
  return { doors, xa, xb, zE, zEl, ym, yt };
}

// ------------------------------------------------ exterior windows --
// Static (unbreakable) glazed openings in an exterior wall along X or Z.
export function extWallX(L, x0, x1, z, y0, y1, mat, wins = [], o = {}) {
  const sill = o.sill ?? 0.95, wh = o.wh ?? 1.5, ww = o.ww ?? 1.4, fy = o.fy ?? y0 + 0.3;
  L.wallX(x0, x1, z, y0, y1, mat, 0.4, wins.map((w) => ({ a: w - ww / 2, b: w + ww / 2, y0: fy + sill, y1: fy + sill + wh })));
  for (const w of wins) {
    L.box(w - ww / 2, fy + sill, z - 0.03, w + ww / 2, fy + sill + wh, z + 0.03, 'glassDirty', { tint: o.tint ?? 0x8a9aa0 });
    L.box(w - ww / 2, fy + sill - 0.04, z - 0.26, w + ww / 2, fy + sill, z + 0.26, 'concrete', { collide: false });
    L.box(w - 0.025, fy + sill, z - 0.04, w + 0.025, fy + sill + wh, z + 0.04, 'metalDark', { collide: false });
  }
}
export function extWallZ(L, z0, z1, x, y0, y1, mat, wins = [], o = {}) {
  const sill = o.sill ?? 0.95, wh = o.wh ?? 1.5, ww = o.ww ?? 1.4, fy = o.fy ?? y0 + 0.3;
  L.wallZ(z0, z1, x, y0, y1, mat, 0.4, wins.map((w) => ({ a: w - ww / 2, b: w + ww / 2, y0: fy + sill, y1: fy + sill + wh })));
  for (const w of wins) {
    L.box(x - 0.03, fy + sill, w - ww / 2, x + 0.03, fy + sill + wh, w + ww / 2, 'glassDirty', { tint: o.tint ?? 0x8a9aa0 });
    L.box(x - 0.26, fy + sill - 0.04, w - ww / 2, x + 0.26, fy + sill, w + ww / 2, 'concrete', { collide: false });
    L.box(x - 0.04, fy + sill, w - 0.025, x + 0.04, fy + sill + wh, w + 0.025, 'metalDark', { collide: false });
  }
}

// ------------------------------------------------------ small props --
export function seatRow(L, x, y, z, ry, n = 5, color = 0x3a5a7a) {
  const p = P.prop(L, x, y, z, ry);
  const len = n * 0.56;
  p.box(0, 0.22, 0, len, 0.05, 0.08, 'metalDark');
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + 0.28 + i * 0.56;
    p.box(lx, 0.44, 0, 0.5, 0.07, 0.48, 'plastic', color);
    p.box(lx, 0.72, 0.23, 0.5, 0.5, 0.05, 'plastic', color, [-0.12, 0, 0]);
  }
  for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) p.box(sx, 0.2, 0, 0.05, 0.42, 0.44, 'metalDark');
  p.col(0, 0.45, 0, len, 0.9, 0.5, 'plastic', F_SOLID | F_SHOOT);
  return p;
}
export function bedside(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.4, 0, 0.45, 0.8, 0.45, 'paintedWhite', 0xd8d8d0);
  p.box(0, 0.6, -0.23, 0.38, 0.02, 0.01, 'metal');
  p.col(0, 0.4, 0, 0.45, 0.8, 0.45, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function monitorCart(L, x, y, z, ry, on = true) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.45, 1.0, 0.4, 'plastic', 0xc8ccc8);
  p.box(0, 1.25, 0, 0.42, 0.34, 0.12, 'plastic', 0x2a2a2a);
  p.box(0, 1.25, -0.065, 0.36, 0.26, 0.01, on ? 'emissiveGreen' : 'blackMatte', on ? 0x224422 : null);
  p.col(0, 0.7, 0, 0.45, 1.4, 0.4, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function shelfUnit(L, x, y, z, ry, len = 2, h = 2, o = {}) {
  const p = P.prop(L, x, y, z, ry);
  const d = o.d ?? 0.5;
  for (const sx of [-len / 2 + 0.03, len / 2 - 0.03]) p.box(sx, h / 2, 0, 0.05, h, d, 'metalClean', 0x9a9e9a);
  for (let i = 0; i < 4; i++) {
    const sy = 0.15 + i * (h - 0.2) / 3;
    p.box(0, sy, 0, len, 0.03, d, 'metalClean', 0xa8aca8);
    if (o.stock !== false) {
      let bx = -len / 2 + 0.1;
      while (bx < len / 2 - 0.15) {
        const sm = o.small ? 0.4 : 1;
        const bw = (0.12 + rng() * 0.22) * sm, bh = (0.12 + rng() * 0.22) * (o.small ? 0.6 : 1);
        if (rng() < (o.small ? 0.8 : 0.7)) p.box(bx + bw / 2, sy + 0.015 + bh / 2, (rng() - 0.5) * 0.1 - (o.small ? d * 0.2 : 0), bw, bh, d * (o.small ? 0.35 : 0.7), rng() < 0.5 ? 'paper' : 'plastic', pickr(o.colors ?? [0xd8d4c8, 0xc8d8e8, 0xe8e0c0, 0x5a8ac0, 0xd06040, 0xeeeeee]));
        bx += bw + (o.small ? 0.015 : 0.03);
      }
    }
  }
  p.col(0, h / 2, 0, len, h, d, 'metal');
  return p;
}
export function labBench(L, x, y, z, ry, len = 3) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.44, 0, len, 0.88, 0.75, 'paintedWhite', 0xc8ccc4);
  p.box(0, 0.9, 0, len + 0.04, 0.04, 0.8, 'blackMatte', 0x202224);
  for (let i = 0; i < Math.floor(len / 0.6); i++) p.box(-len / 2 + 0.3 + i * 0.6, 0.44, -0.38, 0.54, 0.78, 0.01, 'paintedWhite', 0xb0b4ac);
  // glassware & instruments
  for (let i = 0; i < 5; i++) {
    const lx = -len / 2 + 0.3 + rng() * (len - 0.6);
    if (rng() < 0.5) p.cyl(lx, 0.99, (rng() - 0.5) * 0.4, 0.04 + rng() * 0.03, 0.14 + rng() * 0.12, 'glass', 0xccdddd);
    else p.box(lx, 1.02, (rng() - 0.5) * 0.3, 0.25, 0.2, 0.3, 'plastic', pickr([0xd8d8d0, 0x3a3a3a, 0x8a9aa8]));
  }
  p.col(0, 0.46, 0, len, 0.92, 0.8, 'metal');
  return p;
}
export function officeDesk(L, x, y, z, ry, o = {}) {
  P.desk(L, x, y, z, ry, o.computer !== false);
  const c = Math.cos(ry), s = Math.sin(ry);
  if (o.chair !== false) P.officeChair(L, x - s * -0.7, y, z - c * -0.7, ry + Math.PI + (rng() - 0.5) * 0.8);
  if (rng() < 0.6) P.papers(L, x, y + 0.77, z, 0.4, 3);
}
export function cubicle(L, x, y, z, ry, fabric = 0x5a6470) {
  // 2.4 x 2.4 cubicle: partition on back + one side, desk along the back
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.75, 1.15, 2.4, 1.5, 0.08, 'fabric', fabric);
  p.box(-1.16, 0.75, 0, 0.08, 1.5, 2.3, 'fabric', fabric);
  p.box(0, 1.51, 1.15, 2.42, 0.03, 0.1, 'metalClean');
  p.box(-1.16, 1.51, 0, 0.1, 0.03, 2.32, 'metalClean');
  p.box(0.05, 0.74, 0.8, 2.2, 0.04, 0.6, 'woodPale', 0xc8b89a);
  p.box(0.05, 0.37, 1.05, 2.2, 0.72, 0.03, 'woodPale', 0xa89878);
  p.box(0.2, 0.96, 0.95, 0.5, 0.36, 0.05, 'plastic', 0x2a2a2a);
  p.box(0.2, 0.96, 0.925, 0.44, 0.28, 0.01, 'glassDirty', 0x151a20);
  p.box(0.15, 0.77, 0.65, 0.45, 0.02, 0.16, 'plastic', 0x3a3a3a);
  p.col(0, 0.75, 1.15, 2.4, 1.5, 0.1, 'fabric');
  p.col(-1.16, 0.75, 0, 0.1, 1.5, 2.3, 'fabric');
  p.col(0.05, 0.38, 0.8, 2.2, 0.76, 0.6, 'wood', F_SOLID | F_SHOOT);
  if (rng() < 0.55) P.officeChair(L, ...rot(x, z, ry, 0.2, 0.1), y, ry + (rng() - 0.5));
  if (rng() < 0.4) P.papers(L, ...rot(x, z, ry, 0.3, 0.2), y + 0.01, 0.7, 5);
  return p;
}
// rotate a local offset (lx, lz) by ry around (x, z) -> [wx, wz]
export function rot(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + c * lx + s * lz, z - s * lx + c * lz];
}
export function wallTV(L, x, y, z, ry, on = false) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0, 0, 0.9, 0.55, 0.07, 'blackMatte');
  p.box(0, 0, -0.037, 0.84, 0.49, 0.005, on ? 'emissiveCool' : 'glassDirty', on ? 0x3a4a5a : 0x101418);
  return p;
}
export function bloodTrail(L, x0, z0, x1, z1, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    L.decal(x0 + (x1 - x0) * t + (rng() - 0.5) * 0.3, y + 0.012, z0 + (z1 - z0) * t + (rng() - 0.5) * 0.3, 0, 1, 0, 0.6 + rng() * 0.6, rng() < 0.5 ? DF.SMEAR : DF.BLOOD1 + (i % 4));
  }
}
export function scatterBlood(L, x0, z0, x1, z1, y, n = 3) {
  for (let i = 0; i < n; i++) L.decal(x0 + rng() * (x1 - x0), y + 0.012, z0 + rng() * (z1 - z0), 0, 1, 0, 0.7 + rng() * 1.2, DF.BLOOD1 + Math.floor(rng() * 4));
}

// Privacy curtain on a ceiling rail (brighter than the kit version so bays read
// as pale green cloth even in dim rooms). Runs along local X.
export function curtain(L, x, y, z, ry, len = 2.4, closed = 0.6, tint = 0xa8c8bc) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 2.42, 0, len, 0.03, 0.03, 'metalClean');
  const cw = Math.max(0.3, len * closed);
  const n = Math.max(2, Math.round(cw / 0.22));
  for (let i = 0; i < n; i++) p.box(-len / 2 + (i + 0.5) * cw / n, 1.42, (i % 2 ? 0.035 : -0.035), cw / n + 0.02, 1.95, 0.02, 'plasterHosp', tint);
  return p;
}

// -------------------------------------------------- hospital rooms --
// Patient room furnishing. far: 'n'|'s' wall the bed heads touch.
export function patientRoom(L, x0, z0, x1, z1, y, o = {}) {
  const far = o.far ?? 'n';
  const zf = far === 'n' ? z0 : z1, sg = far === 'n' ? 1 : -1;
  const ry = far === 'n' ? Math.PI : 0;
  const beds = o.beds ?? 2;
  const w = x1 - x0;
  const xs = beds === 1 ? [x0 + w * 0.5] : [x0 + w * 0.28, x0 + w * 0.72];
  xs.forEach((bx, i) => {
    if (o.emptyBed === i) P.bed(L, bx, y, zf + sg * 1.25, ry + (rng() - 0.5) * 0.4, 0xd8dcd8, true);
    else P.bed(L, bx, y, zf + sg * 1.15, ry, 0xd8dcd8, true);
    P.ivStand(L, bx + 0.75, y, zf + sg * 0.55);
    bedside(L, bx - 0.8, y, zf + sg * 0.35, ry);
    if (o.monitors !== false && rng() < 0.6) monitorCart(L, bx + 0.8, y, zf + sg * 1.4, ry + Math.PI / 2, rng() < 0.4);
    if (beds > 1 && i === 0) curtain(L, (xs[0] + xs[1]) / 2, y, zf + sg * 1.4, Math.PI / 2, 2.6, 0.3 + rng() * 0.6);
    if (rng() < (o.corpse ?? 0.25)) { P.corpse(L, bx + (rng() - 0.5), y + 0.01, zf + sg * (2.6 + rng()), rng() * 6, pickr([0x8aa0b0, 0xd8d8d0, 0x5a6a8a])); L.decal(bx, y + 0.012, zf + sg * 2.8, 0, 1, 0, 1.4, DF.POOL); }
  });
  if (o.tv !== false) wallTV(L, (x0 + x1) / 2, y + 2.1, (far === 'n' ? z1 : z0) - sg * 0.13, far === 'n' ? 0 : Math.PI);
  if (rng() < 0.5) P.chair(L, x0 + 0.6 + rng() * (w - 1.2), y, (z0 + z1) / 2 + (rng() - 0.5) * 1.5, rng() * 6, 'woodPale', rng() < 0.3);
  if (rng() < 0.3) P.wheelchair(L, x1 - 0.7, y, (z0 + z1) / 2, rng() * 6);
  if (o.blood !== false) scatterBlood(L, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, y, o.blood ?? 2);
  if (o.light !== false) ceilingLight(L, (x0 + x1) / 2, y + (o.h ?? CH), (z0 + z1) / 2, { type: 'fluoro', intensity: o.li ?? 9, flicker: o.flicker ?? (rng() < 0.4 ? 0.6 : 0.1), on: o.lightOn ?? rng() < 0.7 });
  if (o.items) for (const it of o.items) L.item(it.type, it.x, y + (it.dy ?? 0.02), it.z, { chance: it.chance ?? 0.6, group: it.group });
  L.ambience(x0, y, z0, x1, y + CH, z1, 'hospital');
  L.reverb(x0, y, z0, x1, y + CH, z1, 'room');
}
export function officeRoom(L, x0, z0, x1, z1, y, o = {}) {
  const far = o.far ?? 'n';
  const zf = far === 'n' ? z0 : z1, sg = far === 'n' ? 1 : -1;
  const cx = (x0 + x1) / 2;
  officeDesk(L, cx, y, zf + sg * 1.6, far === 'n' ? Math.PI : 0);
  P.filingCabinet(L, x0 + 0.45, y, zf + sg * 0.4, far === 'n' ? Math.PI : 0);
  P.filingCabinet(L, x0 + 0.95, y, zf + sg * 0.4, far === 'n' ? Math.PI : 0);
  P.bookshelf(L, x1 - 0.3, y, (z0 + z1) / 2, -Math.PI / 2);
  if (rng() < 0.6) P.chair(L, cx + 0.7, y, zf + sg * 3.0, rng() * 6, 'fabric');
  if (rng() < 0.5) P.picture(L, x0 + 0.03, y + 1.6, (z0 + z1) / 2, Math.PI / 2);
  P.papers(L, cx, y + 0.01, (z0 + z1) / 2, 1.2, 6);
  if (o.light !== false) ceilingLight(L, cx, y + CH, (z0 + z1) / 2, { type: 'fluoro', intensity: 8, flicker: rng() < 0.4 ? 0.5 : 0.1, on: o.lightOn ?? rng() < 0.6 });
  if (o.items) for (const it of o.items) L.item(it.type, it.x, y + (it.dy ?? 0.02), it.z, { chance: it.chance ?? 0.6 });
  L.reverb(x0, y, z0, x1, y + CH, z1, 'room');
}

// ------------------------------------------------ construction props --
export function steelColumn(L, x, z, y0, y1, o = {}) {
  const f = 0.16, wb = 0.3;
  const m = o.mat ?? 'rust', t = o.tint ?? 0x8a6a50;
  L.box(x - wb, y0, z - f - 0.02, x + wb, y1, z - f + 0.02, m, { collide: false, tint: t });
  L.box(x - wb, y0, z + f - 0.02, x + wb, y1, z + f + 0.02, m, { collide: false, tint: t });
  L.box(x - 0.02, y0, z - f, x + 0.02, y1, z + f, m, { collide: false, tint: t });
  L.clip(x - wb, y0, z - f - 0.02, x + wb, y1, z + f + 0.02, F_DEFAULT);
  if (o.base !== false) L.box(x - 0.4, y0, z - 0.4, x + 0.4, y0 + 0.08, z + 0.4, 'concrete', { collide: false });
}
// horizontal I-beam (visual) along X or Z at height y (bottom)
export function steelBeam(L, a0, a1, c, y, axis = 'x', o = {}) {
  const m = o.mat ?? 'rust', t = o.tint ?? 0x7a5a44, h = o.h ?? 0.45, fl = 0.14;
  if (axis === 'x') {
    L.box(a0, y, c - fl, a1, y + 0.03, c + fl, m, { collide: false, tint: t });
    L.box(a0, y + h - 0.03, c - fl, a1, y + h, c + fl, m, { collide: false, tint: t });
    L.box(a0, y, c - 0.015, a1, y + h, c + 0.015, m, { collide: false, tint: t });
  } else {
    L.box(c - fl, y, a0, c + fl, y + 0.03, a1, m, { collide: false, tint: t });
    L.box(c - fl, y + h - 0.03, a0, c + fl, y + h, a1, m, { collide: false, tint: t });
    L.box(c - 0.015, y, a0, c + 0.015, y + h, a1, m, { collide: false, tint: t });
  }
}
export function workLight(L, x, y, z, ry, o = {}) {
  const p = P.prop(L, x, y, z, ry);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; p.box(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25, 0.03, 1.15, 0.03, 'paintedYellow', null, [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]); }
  p.cyl(0, 1.2, 0, 0.02, 0.9, 'metalDark');
  p.box(0, 1.72, 0, 0.5, 0.12, 0.08, 'paintedYellow', 0xa08020);
  for (const sx of [-0.13, 0.13]) { p.box(sx, 1.72, -0.06, 0.22, 0.2, 0.12, 'metalDark'); p.box(sx, 1.72, -0.125, 0.18, 0.15, 0.01, o.on === false ? 'blackMatte' : 'emissiveWarm'); }
  p.col(0, 0.9, 0, 0.5, 1.8, 0.5, 'metal', F_SOLID | F_SHOOT);
  if (o.on === false) return null;
  const [lx, lz] = rot(x, z, ry, 0, -0.9);
  return L.light(lx, y + 1.8, lz, o.color ?? 0xfff0d0, o.intensity ?? 16, o.range ?? 13, { flicker: o.flicker ?? 0.05 });
}
export function cableSpool(L, x, y, z, r = 0.55, ry = 0) {
  const p = P.prop(L, x, y, z, ry);
  for (const sz of [-0.3, 0.3]) p.cyl(0, r, sz, r, 0.05, 'wood', 0x9a7a50, [Math.PI / 2, 0, 0], 16);
  p.cyl(0, r, 0, r * 0.7, 0.55, 'rubber', 0x1a1a1a, [Math.PI / 2, 0, 0], 16);
  p.col(0, r, 0, r * 2, r * 2, 0.65, 'wood');
  return p;
}
export function drywallStack(L, x, y, z, ry, n = 10) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.05, 0, 2.4, 0.1, 1.1, 'wood', 0x9a8a6a);
  p.box(0, 0.1 + n * 0.0125, 0, 2.44, n * 0.025, 1.22, 'plasterHosp', 0xd8d8d0);
  p.col(0, (0.1 + n * 0.025) / 2, 0, 2.44, 0.1 + n * 0.025, 1.22, 'plaster');
  return p;
}
export function toolCart(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, 0.9, 0.7, 0.5, 'paintedRed', 0xa02a1a);
  for (let i = 0; i < 4; i++) p.box(0, 0.2 + i * 0.16, -0.255, 0.84, 0.12, 0.01, 'metalDark');
  p.box(0, 0.83, 0, 0.9, 0.05, 0.5, 'metalDark');
  p.box(0.2, 0.9, 0, 0.3, 0.1, 0.12, 'paintedYellow', 0xb89020);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.2, 0.2]) p.cyl(sx, 0.06, sz, 0.05, 0.04, 'rubber', null, [0, 0, Math.PI / 2]);
  p.col(0, 0.45, 0, 0.9, 0.9, 0.5, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function sawhorse(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.75, 0, 1.4, 0.08, 0.1, 'wood', 0xb89868);
  for (const sx of [-0.55, 0.55]) for (const sz of [-1, 1]) p.box(sx, 0.37, sz * 0.12, 0.06, 0.78, 0.05, 'wood', 0xb89868, [sz * 0.25, 0, 0]);
  p.col(0, 0.4, 0, 1.4, 0.8, 0.4, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function concreteBags(L, x, y, z, ry) {
  const p = P.pallet(L, x, y, z, ry, false);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) p.box(-0.35 + i * 0.35, 0.2 + r * 0.14, (r % 2 ? 0.2 : -0.2), 0.33, 0.13, 0.55, 'paper', 0x9a9488);
  p.col(0, 0.35, 0, 1.15, 0.7, 1.2, 'fabric');
  return p;
}
export function rebar(L, x, y, z, ry, len = 4) {
  const p = P.prop(L, x, y, z, ry);
  for (let i = 0; i < 9; i++) p.cyl(-0.2 + (i % 3) * 0.2, 0.1 + Math.floor(i / 3) * 0.05, 0, 0.012, len, 'rust', 0x6a4a36, [Math.PI / 2, 0, 0], 6);
  for (const sz of [-len / 3, len / 3]) p.box(0, 0.05, sz, 0.8, 0.1, 0.1, 'wood', 0x9a8a6a);
  p.col(0, 0.12, 0, 0.8, 0.24, len, 'metal', F_SOLID | F_SHOOT);
  return p;
}
// Collect translucent plastic sheets into one mesh at the end of the build.
export class PlasticSheets {
  constructor() { this.list = []; }
  add(x0, y0, z0, x1, y1, z1, tint = 0xffffff) { this.list.push([x0, y0, z0, x1, y1, z1, 'plastic', tint, 1]); }
  build(L) {
    if (!this.list.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a9290, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
    const g = boxMesh(this.list, mat);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.renderOrder = 2; } });
    g.userData.noCull = true;
    L.addObject(g);
  }
}
export { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT };

// ------------------------------------------------------- safe rooms --
// Safe room with 0.16 m walls (door casings stand proud, no z-fighting).
// door: {wall:'n'|'s'|'e'|'w', at}. Sets L.startSafe or L.endSafe/L.endDoor.
export function safeBox(L, o) {
  const { x0, z0, x1, z1 } = o;
  const y = o.y ?? 0, h = o.h ?? CH;
  const wm = o.wall ?? 'plasterGreen', t = 0.16;
  if (o.floor !== false) L.box(x0, y - 0.3, z0, x1, y, z1, o.floor ?? 'concreteFloor');
  if (o.ceil !== false) L.box(x0, y + h, z0, x1, y + h + 0.2, z1, o.ceil ?? 'ceiling');
  const dw = o.door.wall, at = o.door.at;
  const op = [{ a: at - 0.55, b: at + 0.55, y0: y, y1: y + 2.2 }];
  const ex = o.extra || {};
  const ops = (k) => (k === dw ? op : []).concat(ex[k] || []);
  if (!o.skip?.includes('n')) L.wallX(x0 - t / 2, x1 + t / 2, z0, y, y + h, wm, t, ops('n'));
  if (!o.skip?.includes('s')) L.wallX(x0 - t / 2, x1 + t / 2, z1, y, y + h, wm, t, ops('s'));
  if (!o.skip?.includes('w')) L.wallZ(z0 + t / 2, z1 - t / 2, x0, y, y + h, wm, t, ops('w'));
  if (!o.skip?.includes('e')) L.wallZ(z0 + t / 2, z1 - t / 2, x1, y, y + h, wm, t, ops('e'));
  const axis = dw === 'n' || dw === 's' ? 'x' : 'z';
  const fixed = dw === 'n' ? z0 : dw === 's' ? z1 : dw === 'w' ? x0 : x1;
  const door = axis === 'x' ? new Door(L, at, y, fixed, 'x', { width: 1.1, safe: true, hinge: o.hinge ?? 1 }) : new Door(L, fixed, y, at, 'z', { width: 1.1, safe: true, hinge: o.hinge ?? 1 });
  ceilingLight(L, (x0 + x1) / 2, y + h, (z0 + z1) / 2, { type: 'cage', intensity: 9, range: 9, color: 0xffe2b0 });
  const box = [x0, y - 0.2, z0, x1, y + h, z1];
  if (o.end) { L.endSafe = box; L.endDoor = door; } else L.startSafe = box;
  L.ambience(x0, y, z0, x1, y + h, z1, 'safe');
  L.reverb(x0, y, z0, x1, y + h, z1, 'safe');
  // red "SAFE ROOM" stencil outside, next to the door
  const out = dw === 'n' ? [at, fixed - t / 2 - 0.02, Math.PI] : dw === 's' ? [at, fixed + t / 2 + 0.02, 0] : dw === 'w' ? [fixed - t / 2 - 0.02, at, -Math.PI / 2] : [fixed + t / 2 + 0.02, at, Math.PI / 2];
  if (axis === 'x') sign(L, 'SAFE ROOM', out[0], y + 2.55, out[1], out[2], 1.3, 0.32, { bg: '#8a1a14', fg: '#fff' });
  else sign(L, 'SAFE ROOM', out[0], y + 2.55, out[1], out[2], 1.3, 0.32, { bg: '#8a1a14', fg: '#fff' });
  return { door, box };
}

// ------------------------------------------------------------ culling --
// The hospital stacks many floors, so frustum culling alone draws signs,
// doors, props and items of every floor behind the walls. Every 0.25 s this
// disables render layer 0 on non-merged level objects that are far from the
// camera or on another floor band (layers are used instead of `visible`, so it
// never fights game code that shows/hides things). Mark objects with
// userData.noCull to exempt them.
export function installCuller(L, game, o = {}) {
  const band = o.band ?? 9, dist = o.dist ?? 60;
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const list = [];
  for (const obj of L.root.children) {
    if (L.meshes.includes(obj) || obj.userData.noCull) continue;
    box.setFromObject(obj, false);
    if (box.isEmpty()) continue;
    box.getCenter(c);
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    if (r > 25) continue;
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh || m.isLine || m.isPoints) meshes.push(m); });
    list.push({ obj, x: c.x, y: c.y, z: c.z, r, meshes, on: true });
  }
  let t = 0;
  const api = {
    count: list.length,
    update(dt) {
      t -= dt; if (t > 0) return; t = 0.25;
      const cp = game.camPos;
      for (const e of list) {
        const on = Math.abs(e.y - cp.y) < band + e.r && Math.hypot(e.x - cp.x, e.z - cp.z) < dist + e.r;
        if (on === e.on) continue;
        e.on = on;
        for (const m of e.meshes) { if (on) m.layers.enable(0); else m.layers.disable(0); }
      }
    },
  };
  L.dynamics.push(api);
  return api;
}
