// Furnishing a room properly. A room knows its walls, where its doors and
// windows are and where the stairs come through; the layout hands out space
// against the walls (tall things not across windows, nothing in front of a
// door) and on the floor. Each kind of room is then filled the way people
// filled them - the living room's sofa, wall unit, television and the carpet
// hung on the wall; the kitchen's units, stove, fridge, table and the pans on
// the hob - and dressed: skirting, a light hanging from the ceiling, a switch
// by the door, radiators under the windows, pictures, and the mess left behind
// when everyone ran: papers, broken glass, bottles, clothes, a chair knocked
// over, a stain on the floor.
import { mat } from './kit.js';
import * as Fu from './furniture.js';

const F = Fu.F;
const noCol = { col: false };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const TAU = Math.PI * 2;

// --- surfaces for the small things -----------------------------------------------------------------------------------------
const D = {
  skirting: mat('woodFine', 0x5a4434), skirtingPaint: mat('woodFine', 0xd8d4cc, { p: 4 }),
  cord: mat('plaster', 0x1a1a1a, { p: 5 }), shade: [mat('fabric', 0xd8c8a0, { p: 5 }), mat('metal', 0x3a5a3a, { p: 4 }), mat('plaster', 0xf0ece0, { p: 5 }), mat('fabric', 0xb87848, { p: 5 })],
  bulb: mat('plaster', 0xfff6d8, { p: 5, r: 40 }), switch: mat('plaster', 0xe8e4d8, { p: 5, r: 90 }),
  paper: mat('plaster', 0xeeeae0, { p: 5 }), paperOld: mat('plaster', 0xd8ccb0, { p: 5 }), newspaper: mat('plaster', 0xc8c4b8, { p: 2 }),
  glassBottle: [mat('plaster', 0x2a5a2a, { p: 5, r: 30 }), mat('plaster', 0x5a3a1a, { p: 5, r: 30 }), mat('plaster', 0xc8d8d0, { p: 5, r: 30 })],
  can: mat('metal', 0xb8bcc0, { p: 5, r: 70 }), label: [mat('plaster', 0xc83a2a, { p: 5 }), mat('plaster', 0x2a5aa8, { p: 5 }), mat('plaster', 0xe8b828, { p: 5 }), mat('plaster', 0x3a8a3a, { p: 5 })],
  shard: mat('plaster', 0xa8c0c8, { p: 5, r: 15 }), debris: mat('plaster', 0xc8c0b0), brick: mat('brickOld', 0xffffff),
  blood: mat('plaster', 0x3a0a08, { p: 5, r: 60 }), bloodDry: mat('plaster', 0x4a1a10, { p: 5, r: 160 }),
  frame: [mat('woodFine', 0x6a4a30), mat('woodFine', 0xc8a040, { p: 5, r: 80 }), mat('metal', 0x3a3a3a, { p: 4 })],
  canvas: [mat('plaster', 0x7a8a5a, { p: 5 }), mat('plaster', 0x5a6a8a, { p: 5 }), mat('plaster', 0xa87a5a, { p: 5 }), mat('plaster', 0x8a5a4a, { p: 5 }), mat('plaster', 0x4a6a6a, { p: 5 }), mat('plaster', 0xc8b088, { p: 5 })],
  wallCarpet: [mat('fabric', 0x8a2a24, { p: 2 }), mat('fabric', 0x6a2a3a, { p: 2 }), mat('fabric', 0x7a3a1a, { p: 2 })],
  clockFace: mat('plaster', 0xf0ece0, { p: 5 }), black: F.black, white: F.white,
  pot: mat('metal', 0x8a8a8a, { p: 4 }), enamelPot: [mat('plaster', 0xd8d0c0, { p: 5, r: 60 }), mat('plaster', 0xc84a3a, { p: 5, r: 60 }), mat('plaster', 0x3a6aa8, { p: 5, r: 60 })],
  plate: mat('plaster', 0xf4f0e8, { p: 5, r: 50 }), towel: [mat('fabric', 0xd8c8b0), mat('fabric', 0x8aa0b8), mat('fabric', 0xc89a8a)],
  plant: mat('plaster', 0x3a6a2a, { p: 5 }), plantDead: mat('plaster', 0x6a5a3a, { p: 5 }), potClay: mat('brick', 0xc87a5a),
  toy: [mat('plaster', 0xd83a2a, { p: 5 }), mat('plaster', 0x2a6ad8, { p: 5 }), mat('plaster', 0xe8c828, { p: 5 }), mat('plaster', 0x3aa84a, { p: 5 })],
  trashBag: mat('plaster', 0x1e2a1e, { p: 5, r: 60 }), cardboard: F.cardboard, crt: mat('plaster', 0x3a3632, { p: 5 }), screen: F.screen,
  phone: mat('plaster', 0x8a2a20, { p: 5, r: 60 }), mirror: mat('metal', 0xd0dce0, { p: 5, r: 8 }), rubber: mat('plaster', 0x2a2a2a, { p: 5, r: 200 }),
  poster: [mat('plaster', 0xc8302a, { p: 5 }), mat('plaster', 0xe8d8b0, { p: 5 }), mat('plaster', 0x2a4a7a, { p: 5 })],
  map: mat('plaster', 0xa8c8a0, { p: 2 }), chalk: mat('plaster', 0x2a3a2a, { p: 5 }),
};

// --- the room's layout -------------------------------------------------------------------------------------------------------
/**
 * The walls of a room and what's free along them and on the floor.
 * R: { x0, z0, x1, z1, wins: [{x, z, w}], doors: [{x, z, w}], keepOut: [{x0, z0, x1, z1}], h }
 */
export class Layout {
  constructor(K, R, y) {
    this.K = K; this.R = R; this.y = y; this.r = K.r;
    this.h = R.h ?? 9.4;
    const m = 0.45;
    this.x0 = R.x0 + m; this.x1 = R.x1 - m; this.z0 = R.z0 + m; this.z1 = R.z1 - m;
    // walls: from one end to the other, the way into the room (n), what's taken along them
    this.walls = [
      { side: 'nz', ax: 'x', a0: this.x0, a1: this.x1, at: this.z0, nx: 0, nz: 1 },
      { side: 'pz', ax: 'x', a0: this.x0, a1: this.x1, at: this.z1, nx: 0, nz: -1 },
      { side: 'nx', ax: 'z', a0: this.z0, a1: this.z1, at: this.x0, nx: 1, nz: 0 },
      { side: 'px', ax: 'z', a0: this.z0, a1: this.z1, at: this.x1, nx: -1, nz: 0 },
    ];
    for (const w of this.walls) { w.used = []; w.wins = []; w.len = w.a1 - w.a0; }
    const onWall = (p) => {
      // which wall a door or window is in (the nearest)
      let best = null, bd = 2.5;
      for (const w of this.walls) { const d = Math.abs((w.ax === 'x' ? p.z : p.x) - w.at); if (d < bd) { bd = d; best = w; } }
      return best;
    };
    this.foot = []; // floor footprints taken: { x0, z0, x1, z1 }
    for (const d of R.doors || []) {
      const w = onWall(d);
      const a = w ? (w.ax === 'x' ? d.x : d.z) : 0;
      if (w) w.used.push([a - d.w / 2 - 0.8, a + d.w / 2 + 0.8]);
      // keep the floor clear in front of (and behind) every doorway
      const c = 4.6;
      this.foot.push({ x0: d.x - c, z0: d.z - c, x1: d.x + c, z1: d.z + c, door: true });
    }
    for (const q of R.wins || []) { const w = onWall(q); if (w) w.wins.push([(w.ax === 'x' ? q.x : q.z) - q.w / 2 - 0.2, (w.ax === 'x' ? q.x : q.z) + q.w / 2 + 0.2, q]); }
    for (const k of R.keepOut || []) {
      this.foot.push({ ...k });
      for (const w of this.walls) {
        // the stairs along a wall take that stretch of it
        const near = w.ax === 'x' ? (k.z0 <= w.at + 1 && k.z1 >= w.at - 1) : (k.x0 <= w.at + 1 && k.x1 >= w.at - 1);
        if (near) w.used.push(w.ax === 'x' ? [k.x0, k.x1] : [k.z0, k.z1]);
      }
    }
  }
  get w() { return this.x1 - this.x0; }
  get d() { return this.z1 - this.z0; }
  get cx() { return (this.x0 + this.x1) / 2; }
  get cz() { return (this.z0 + this.z1) / 2; }

  /** Is the floor rectangle free? */
  free(x0, z0, x1, z1) {
    if (x0 < this.x0 - 0.01 || x1 > this.x1 + 0.01 || z0 < this.z0 - 0.01 || z1 > this.z1 + 0.01) return false;
    for (const f of this.foot) if (x1 > f.x0 && x0 < f.x1 && z1 > f.z0 && z0 < f.z1) return false;
    return true;
  }
  /**
   * A place against a wall for something `w` wide and `dep` deep: returns { x, z, yaw, wall } (its back to the wall,
   * yaw turning it to face into the room) or null. o: { tall (keep off windows), wall (only that one), prefer: 'middle' | 'end' }.
   */
  wallSpot(w, dep, o = {}) {
    const walls = o.wall ? [o.wall] : this._order(o);
    for (const wl of walls) {
      if (wl.len < w + 0.4) continue;
      const tries = o.prefer === 'middle' ? [0.5, 0.35, 0.65, 0.2, 0.8] : [this.r(), this.r(), 0.5, 0.15, 0.85, this.r()];
      for (const f of tries) {
        const a = wl.a0 + w / 2 + 0.1 + (wl.len - w - 0.2) * f;
        const s0 = a - w / 2, s1 = a + w / 2;
        if (wl.used.some(([u0, u1]) => s1 > u0 && s0 < u1)) continue;
        if (o.tall && wl.wins.some(([u0, u1]) => s1 > u0 && s0 < u1)) continue;
        // the footprint on the floor
        const cx = wl.ax === 'x' ? a : wl.at + wl.nx * dep / 2, cz = wl.ax === 'x' ? wl.at + wl.nz * dep / 2 : a;
        const hw = wl.ax === 'x' ? w / 2 : dep / 2, hd = wl.ax === 'x' ? dep / 2 : w / 2;
        if (!this.free(cx - hw, cz - hd, cx + hw, cz + hd)) continue;
        wl.used.push([s0 - 0.3, s1 + 0.3]);
        this.foot.push({ x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd });
        return { x: cx, z: cz, yaw: Math.atan2(wl.nx, wl.nz), wall: wl, a };
      }
    }
    return null;
  }
  _order(o) {
    const ws = this.walls.slice().sort(() => this.r() - 0.5);
    // the longest walls first for big things
    if (o.big) ws.sort((a, b) => b.len - a.len);
    return ws;
  }
  /** A free spot on the floor away from the walls for something w x d (turned `yaw` = 0 or a quarter). */
  floorSpot(w, d, o = {}) {
    for (let i = 0; i < 14; i++) {
      const x = o.x ?? (this.x0 + w / 2 + 1 + this.r() * Math.max(0, this.w - w - 2));
      const z = o.z ?? (this.z0 + d / 2 + 1 + this.r() * Math.max(0, this.d - d - 2));
      if (!this.free(x - w / 2, z - d / 2, x + w / 2, z + d / 2)) { if (o.x !== undefined) return null; continue; }
      this.foot.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      return { x, z };
    }
    return null;
  }
  /** Somewhere along a wall to hang something (not over doors or windows): { x, z, yaw, y }. */
  wallHang(w, o = {}) {
    for (let i = 0; i < 8; i++) {
      const wl = o.wall || pick(this.r, this.walls);
      if (wl.len < w + 1) continue;
      const a = wl.a0 + w / 2 + 0.5 + this.r() * (wl.len - w - 1);
      const s0 = a - w / 2, s1 = a + w / 2;
      if (wl.wins.some(([u0, u1]) => s1 > u0 && s0 < u1)) continue;
      if ((this.R.doors || []).some((d) => Math.abs((wl.ax === 'x' ? d.x : d.z) - a) < d.w / 2 + w / 2 + 0.5 && Math.abs((wl.ax === 'x' ? d.z : d.x) - wl.at) < 2)) continue;
      if ((wl.hung || (wl.hung = [])).some(([u0, u1]) => s1 > u0 - 0.5 && s0 < u1 + 0.5)) continue;
      wl.hung.push([s0, s1]);
      const off = 0.06;
      return { x: wl.ax === 'x' ? a : wl.at - wl.nx * 0.45 + wl.nx * off, z: wl.ax === 'x' ? wl.at - wl.nz * 0.45 + wl.nz * off : a, yaw: Math.atan2(wl.nx, wl.nz), wall: wl };
    }
    return null;
  }
}

// --- the pieces -------------------------------------------------------------------------------------------------------------
function at(K, x, y, z, yaw, fn) { K.push(x, y, z, yaw); fn(); K.pop(); }

export function armchair(K, x, y, z, yaw, m) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.8, 0.1, 1.6, 0.8, 1.4, m, { skip: 'ny' });
    K.box(0, 2.3, -1.15, 1.6, 1.2, 0.35, m, noCol);
    for (const s of [-1, 1]) K.box(s * 1.4, 1.9, 0.05, 0.3, 0.5, 1.45, m, noCol);
    K.box(0, 1.68, 0.2, 1.15, 0.15, 1.1, m, noCol);
  });
}
export function coffeeTable(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.5, 0, 2.4, 0.1, 1.4, o.m || F.woodDark, { col: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * 2.1, 0.7, sz * 1.1, 0.12, 0.7, 0.12, o.m || F.woodDark, noCol);
    K.solid(0, 0.8, 0, 2.4, 0.8, 1.4, 'wood');
    if (K.r() < 0.7) things(K, 0, 1.6, 0, 3.6, 2.0, 2 + Math.floor(K.r() * 3));
    if (K.r() < 0.5) K.lootAt(0, 1.62, 0, o.cat || 'home');
  });
}
/** The Soviet wall unit: cupboards, glass-fronted shelves with crockery, a space for the television. */
export function wallUnit(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 9, m = o.m || pick(K.r, [F.woodDark, F.wood, mat('woodFine', 0x5a3a28)]);
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.4, 0, w / 2, 1.4, 1.1, m, { skip: 'ny' });
    K.box(0, 7.1, -0.2, w / 2, 0.2, 0.9, m, { col: false });
    for (const s of [-1, 1]) K.box(s * (w / 2 - 0.15), 5, -0.2, 0.15, 2.3, 0.9, m, noCol);
    K.box(0, 4.6, -0.95, w / 2 - 0.3, 1.8, 0.08, m, noCol);
    // the glass-fronted middle with plates and glasses
    K.box(-w / 4, 4.8, -0.2, w / 4 - 0.2, 0.06, 0.8, m, noCol);
    for (let i = 0; i < 6; i++) K.box(-w / 2 + 0.8 + i * 0.6, 5.45, -0.6, 0.05, 0.55, 0.55, D.plate, noCol);
    for (let i = 0; i < 5; i++) K.cyl(-w / 2 + 0.9 + i * 0.7, 4.86, 0.1, 0.16, 0.55, D.glassBottle[2], { seg: 6, col: false });
    K.box(-w / 4, 5, 0.55, w / 4 - 0.2, 2, 0.03, mat('metal', 0x8a9aa0, { p: 5, r: 10 }), noCol);
    // cupboards on the right, doors and handles below
    K.box(w / 4, 5, 0.65, w / 4 - 0.2, 2.1, 0.04, m, noCol);
    for (let i = 0; i < 3; i++) K.box(-w / 2 + w / 6 + i * w / 3, 1.5, 1.12, w / 6 - 0.15, 1.1, 0.03, m, noCol);
    K.solid(0, 3.6, -0.2, w / 2, 3.6, 1, 'wood');
    // the television on its stand in the middle
    if (o.tv !== false) tv(K, w / 4, 2.8, 0.1, 0);
    K.lootAt(-w / 4, 2.85, 0.4, o.cat || 'home');
  });
}
export function tv(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.1, 0, 1.5, 1.1, 1.2, D.crt, noCol);
    K.box(0, 1.15, 1.22, 1.2, 0.85, 0.03, D.screen, noCol);
    K.box(1.2, 0.3, 1.24, 0.15, 0.15, 0.03, D.switch, noCol);
    K.box(0, 2.3, -0.3, 0.05, 0.4, 0.05, D.cord, noCol);
  });
}
export function nightstand(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.2, 0, 0.9, 1.2, 0.85, o.m || F.wood, { skip: 'ny' });
    K.box(0, 1.6, 0.86, 0.75, 0.3, 0.03, F.woodDark, noCol);
    if (K.r() < 0.7) { K.cyl(0.2, 2.4, 0, 0.3, 0.12, D.black, { seg: 6, col: false }); K.box(0.2, 3.0, 0, 0.04, 0.6, 0.04, D.black, noCol); K.lathe(0.2, 3.3, 0, [[0.55, 0], [0.35, 0.7]], pick(K.r, D.shade), { seg: 8 }); }
    if (K.r() < 0.5) book(K, -0.4, 2.42, 0.1, K.r() * 3);
    K.lootAt(-0.3, 2.42, 0, o.cat || 'home');
  });
}
export function floorLamp(K, x, y, z) {
  K.cyl(x, y, z, 0.6, 0.12, D.black, { seg: 8, col: false });
  K.box(x, y + 2.8, z, 0.06, 2.8, 0.06, D.black, noCol);
  K.lathe(x, y + 5.2, z, [[0.9, 0], [0.55, 1.1]], pick(K.r, D.shade), { seg: 10 });
}
export function plantPot(K, x, y, z, big = false) {
  const s = big ? 1.4 : 0.8, dead = K.r() < 0.7;
  K.lathe(x, y, z, [[0.45 * s, 0], [0.6 * s, 1.1 * s]], D.potClay, { seg: 8 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + K.r(); K.box(x + Math.cos(a) * 0.3 * s, y + 1.1 * s + 0.6 * s, z + Math.sin(a) * 0.3 * s, 0.12 * s, 0.7 * s * (dead ? 0.6 : 1), 0.35 * s, dead ? D.plantDead : D.plant, { col: false, yaw: a }); }
}
export function mirror(K, p, w = 1.8, h = 2.4, yy = 5) {
  at(K, p.x, 0, p.z, p.yaw, () => { K.box(0, yy, 0.05, w / 2 + 0.12, h / 2 + 0.12, 0.05, D.frame[0], noCol); K.box(0, yy, 0.11, w / 2, h / 2, 0.02, D.mirror, noCol); });
}
export function picture(K, p, yy) {
  const w = 1.4 + K.r() * 2, h = 1.2 + K.r() * 1.4;
  at(K, p.x, 0, p.z, p.yaw + (K.r() - 0.5) * 0.03, () => {
    K.box(0, yy, 0.05, w / 2 + 0.15, h / 2 + 0.15, 0.05, pick(K.r, D.frame), noCol);
    K.box(0, yy, 0.1, w / 2, h / 2, 0.02, pick(K.r, D.canvas), noCol);
    // a landscape: a strip of sky and land
    if (K.r() < 0.6) K.box(0, yy + h * 0.2, 0.12, w / 2, h * 0.3, 0.01, mat('plaster', pick(K.r, [0x8aa8c8, 0xc8b8a0, 0xa8b8c8]), { p: 5 }), noCol);
  });
}
export function wallCarpet(K, p, w, h, yy) {
  at(K, p.x, 0, p.z, p.yaw, () => {
    const m = pick(K.r, D.wallCarpet);
    K.box(0, yy, 0.06, w / 2, h / 2, 0.05, m, noCol);
    K.box(0, yy, 0.12, w / 2 - 0.5, h / 2 - 0.5, 0.01, mat('fabric', 0xc8a060, { p: 2 }), noCol);
    K.box(0, yy, 0.13, w / 2 - 0.9, h / 2 - 0.9, 0.01, m, noCol);
  });
}
export function clock(K, p, yy) {
  at(K, p.x, 0, p.z, p.yaw, () => {
    K.cylAxis(0, yy, 0.08, 0.75, 0.16, D.black, { axis: 'z', seg: 12, col: false, capMat: D.clockFace });
    K.box(0.15, yy + 0.2, 0.18, 0.03, 0.4, 0.01, D.black, { col: false, yaw: 0.6 });
    K.box(-0.1, yy - 0.05, 0.18, 0.03, 0.3, 0.01, D.black, { col: false, yaw: -1.2 });
  });
}
export function poster(K, p, yy, o = {}) {
  at(K, p.x, 0, p.z, p.yaw + (K.r() - 0.5) * 0.06, () => {
    const w = o.w ?? (1.6 + K.r()), h = o.h ?? w * 1.4;
    K.box(0, yy, 0.03, w / 2, h / 2, 0.01, o.m || pick(K.r, D.poster), noCol);
    K.box(0, yy + h * 0.25, 0.045, w / 2 - 0.2, h * 0.12, 0.005, mat('plaster', 0x1a1a1a, { p: 5 }), noCol);
    K.box(0, yy - h * 0.1, 0.045, w / 2 - 0.25, h * 0.18, 0.005, mat('plaster', 0xe8e0c8, { p: 5 }), noCol);
  });
}
export function shelfOnWall(K, p, w, yy, cat) {
  at(K, p.x, 0, p.z, p.yaw, () => {
    K.box(0, yy, 0.45, w / 2, 0.08, 0.45, F.wood, noCol);
    for (const s of [-1, 1]) K.box(s * (w / 2 - 0.3), yy - 0.35, 0.3, 0.06, 0.3, 0.3, F.metalDark, noCol);
    things(K, 0, yy + 0.08, 0.45, w - 0.4, 0.7, 2 + Math.floor(K.r() * 4));
    if (cat) K.lootAt(0, yy + 0.1, 0.45, cat, { shelf: true, spread: w / 3 });
  });
}

/** A few small objects on a surface (x, y, z centre, w x d area): books, bottles, tins, mugs, papers. */
export function things(K, x, y, z, w, d, n) {
  for (let i = 0; i < n; i++) {
    const px = x + (K.r() - 0.5) * w * 0.8, pz = z + (K.r() - 0.5) * d * 0.8, k = K.r();
    if (k < 0.22) book(K, px, y, pz, K.r() * TAU);
    else if (k < 0.42) K.cyl(px, y, pz, 0.17, 0.75 + K.r() * 0.3, pick(K.r, D.glassBottle), { seg: 6, col: false, cap: true });
    else if (k < 0.58) { K.cyl(px, y, pz, 0.2, 0.42, D.can, { seg: 8, col: false }); K.cyl(px, y + 0.08, pz, 0.205, 0.26, pick(K.r, D.label), { seg: 8, col: false, cap: false }); }
    else if (k < 0.72) K.cyl(px, y, pz, 0.2, 0.32, pick(K.r, D.enamelPot), { seg: 7, col: false });
    else if (k < 0.86) K.box(px, y + 0.02, pz, 0.45, 0.02, 0.32, K.r() < 0.5 ? D.paper : D.newspaper, { col: false, yaw: K.r() * TAU });
    else K.box(px, y + 0.25, pz, 0.35, 0.25, 0.25, D.cardboard, { col: false, yaw: K.r() * TAU });
  }
}
export function book(K, x, y, z, yaw) { K.box(x, y + 0.07, z, 0.3, 0.07, 0.42, pick(K.r, F.fabric), { col: false, yaw }); }

export function stove(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.5, 0, 1.25, 1.5, 1.1, F.enamel, { skip: 'ny' });
    K.box(0, 1.35, 1.12, 1.05, 0.8, 0.03, F.black, noCol);
    for (const a of [-0.55, 0.55]) for (const b of [-0.45, 0.45]) K.cyl(a, 3.0, b, 0.33, 0.06, F.black, { seg: 8, col: false });
    for (let i = 0; i < 4; i++) K.cylAxis(-0.75 + i * 0.5, 2.5, 1.13, 0.12, 0.1, F.black, { axis: 'z', seg: 6, col: false });
    // a pan or a kettle on the hob
    if (K.r() < 0.7) K.cyl(-0.55, 3.06, -0.45, 0.42, 0.5, pick(K.r, D.enamelPot), { seg: 10, col: false });
    if (K.r() < 0.5) { K.lathe(0.55, 3.06, 0.45, [[0.38, 0], [0.4, 0.4], [0.2, 0.8], [0.06, 0.85]], pick(K.r, D.enamelPot), { seg: 8 }); }
    K.lootAt(0, 3.1, 0, 'kitchen');
  });
}
export function fridge(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 3.1, 0, 1.3, 3.1, 1.2, F.enamel, { skip: 'ny' });
    K.box(0.95, 3.9, 1.24, 0.07, 0.8, 0.06, F.metal, noCol);
    K.box(0, 4.6, 1.21, 1.25, 0.02, 0.02, F.metal, noCol);
    if (K.r() < 0.3) K.box(-0.4, 5.2, 1.22, 0.3, 0.4, 0.01, pick(K.r, D.label), noCol);
    K.lootAt(0, 0.06, 1.9, 'food', { spread: 0.5 });
    K.lootAt(0, 6.25, 0, 'food', { spread: 0.4 });
  });
}
export function sink(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.45, 0, 1.4, 1.45, 1.1, F.paint, { skip: 'ny' });
    K.box(0, 3.0, 0.05, 1.45, 0.1, 1.2, F.steel, noCol);
    K.box(0, 3.0, 0.2, 1.0, 0.12, 0.7, mat('metal', 0x5a5e62, { p: 5 }), noCol);
    K.box(0, 3.6, -0.85, 0.08, 0.55, 0.08, F.steel, noCol);
    K.box(0, 4.1, -0.6, 0.06, 0.06, 0.3, F.steel, noCol);
    K.lootAt(0, 0.06, 1.7, 'kitchen');
  });
}
export function counterRun(K, x, y, z, yaw, L, o = {}) {
  const front = o.front || F.paint;
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.45, 0, L / 2, 1.45, 1.1, front, { skip: 'ny' });
    K.box(0, 3.0, 0.05, L / 2 + 0.05, 0.1, 1.2, F.counterTop, noCol);
    const n = Math.max(1, Math.round(L / 2.4));
    for (let i = 0; i < n; i++) { const xx = -L / 2 + L * (i + 0.5) / n; K.box(xx, 1.5, 1.12, L / n / 2 - 0.08, 1.1, 0.03, front, noCol); K.box(xx + L / n * 0.3, 2.2, 1.18, 0.05, 0.25, 0.04, F.metal, noCol); }
    things(K, 0, 3.1, 0.1, L - 0.4, 1.4, Math.round(L / 1.6));
    // the cupboards on the wall above, a shelf of jars
    if (o.upper !== false) { K.box(0, 6.4, -0.55, L / 2, 1.15, 0.6, front, { col: false }); for (let i = 0; i < n; i++) K.box(-L / 2 + L * (i + 0.5) / n, 6.4, 0.07, L / n / 2 - 0.08, 1.05, 0.02, front, noCol); }
    K.lootAt(-L * 0.25, 3.12, 0.3, 'kitchen'); K.lootAt(L * 0.25, 3.12, 0.3, 'food');
  });
}
export function washer(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => { K.box(0, 1.5, 0, 1.2, 1.5, 1.1, F.enamel, { skip: 'ny' }); K.cylAxis(0, 1.4, 1.12, 0.65, 0.06, mat('metal', 0x8a9aa0, { p: 5, r: 20 }), { axis: 'z', col: false, seg: 12 }); K.box(0, 2.75, 1.0, 1.0, 0.15, 0.1, D.switch, noCol); });
}
export function bathtub(K, x, y, z, yaw, L = 6.4) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.1, 0, L / 2, 1.1, 1.5, F.enamel, { skip: 'ny' });
    K.box(0, 1.98, 0, L / 2 - 0.35, 0.24, 1.15, mat('whiteTiles', 0x9ab8c8, { p: 5, r: 30 }), noCol);
    K.box(-L / 2 + 0.4, 3.8, -1.3, 0.06, 1.6, 0.06, F.steel, noCol);
    K.box(-L / 2 + 0.4, 5.3, -1.0, 0.25, 0.1, 0.25, F.steel, noCol);
    if (K.r() < 0.6) K.box(L / 2 - 1.2, 2.3, -1.45, 0.8, 1.2, 0.08, pick(K.r, D.towel), noCol);
  });
}
export function toilet(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.75, 0.2, 0.75, 0.75, 1.0, F.enamel, noCol);
    K.box(0, 1.55, 0.3, 0.8, 0.06, 0.95, F.enamel, noCol);
    K.box(0, 2.4, -0.75, 0.9, 0.8, 0.35, F.enamel, noCol);
    K.box(0, 6.2, -0.9, 0.7, 0.4, 0.25, F.enamel, noCol);
    K.box(0.5, 4.2, -0.75, 0.04, 2.0, 0.04, F.metal, noCol);
    K.solid(0, 1.2, 0, 0.9, 1.2, 1.1, 'concrete');
  });
}
export function basin(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 2.7, 0.2, 1.0, 0.3, 0.8, F.enamel, noCol);
    K.box(0, 1.3, -0.2, 0.25, 1.3, 0.25, F.enamel, noCol);
    K.box(0, 3.25, -0.4, 0.06, 0.25, 0.06, F.steel, noCol);
    K.box(0, 5.0, -0.55, 1.0, 1.3, 0.04, D.mirror, noCol);
    K.box(0, 3.4, -0.4, 0.8, 0.05, 0.2, D.plate, noCol);
    K.lootAt(0, 3.05, 0.3, 'medical');
  });
}
export function coatRack(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 5.8, 0, 2, 0.12, 0.1, F.woodDark, noCol);
    for (let i = 0; i < 4; i++) K.box(-1.5 + i, 5.6, 0.2, 0.05, 0.05, 0.2, F.metal, noCol);
    for (let i = 0; i < 3; i++) if (K.r() < 0.7) K.box(-1.4 + i * 1.2 + K.r() * 0.3, 4.3, 0.35, 0.6, 1.3, 0.22, pick(K.r, F.fabric), noCol);
    K.box(0, 0.5, 0.4, 1.8, 0.5, 0.45, F.woodDark, noCol);
    for (let i = 0; i < 3; i++) K.box(-1.2 + i * 1.1, 1.15, 0.45, 0.35, 0.15, 0.5, D.rubber, noCol);
    K.lootAt(0, 1.05, 0.5, 'clothes');
  });
}
export function safe(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => { K.box(0, 1.5, 0, 1.3, 1.5, 1.2, mat('metal', 0x3a3e3a, { p: 4 }), { skip: 'ny' }); K.cylAxis(0.3, 1.8, 1.22, 0.35, 0.1, F.steel, { axis: 'z', col: false }); K.lootAt(0, 3.05, 0, 'office'); });
}
export function phone(K, x, y, z, yaw) { at(K, x, y, z, yaw, () => { K.box(0, 0.18, 0, 0.45, 0.18, 0.35, D.phone, noCol); K.box(0, 0.42, 0, 0.5, 0.08, 0.14, D.phone, noCol); }); }

/** A heap of rubbish: bags, a box, bottles. */
export function trashHeap(K, x, y, z) {
  const n = 2 + Math.floor(K.r() * 3);
  for (let i = 0; i < n; i++) { const a = K.r() * TAU; K.box(x + Math.cos(a) * 0.8, y + 0.6, z + Math.sin(a) * 0.8, 0.7 + K.r() * 0.3, 0.6, 0.6 + K.r() * 0.3, D.trashBag, { col: false, yaw: a }); }
  if (K.r() < 0.6) K.box(x + 0.6, y + 0.45, z - 0.8, 0.6, 0.45, 0.5, D.cardboard, { col: false, yaw: K.r() });
  things(K, x, y, z, 3, 3, 2);
}
/** Dried blood: overlapping dark smears on the floor (or, `wall`, on a wall). */
export function bloodStain(K, x, y, z, s = 1) {
  const n = 3 + Math.floor(K.r() * 4);
  for (let i = 0; i < n; i++) K.box(x + (K.r() - 0.5) * 1.6 * s, y + 0.02 + i * 0.004, z + (K.r() - 0.5) * 1.6 * s, (0.3 + K.r() * 0.8) * s, 0.01, (0.2 + K.r() * 0.5) * s, K.r() < 0.5 ? D.blood : D.bloodDry, { col: false, yaw: K.r() * TAU, skip: 'ny' });
  // a trail
  if (K.r() < 0.5) { const a = K.r() * TAU; for (let i = 1; i < 5; i++) K.box(x + Math.cos(a) * i * 0.9 * s, y + 0.02, z + Math.sin(a) * i * 0.9 * s, 0.25 * s, 0.01, 0.12 * s, D.bloodDry, { col: false, yaw: a, skip: 'ny' }); }
}
/** Broken glass and bits of plaster under a window, or anywhere. */
export function debris(K, x, y, z, s = 1, glass = false) {
  const n = 5 + Math.floor(K.r() * 6);
  for (let i = 0; i < n; i++) {
    const px = x + (K.r() - 0.5) * 2.5 * s, pz = z + (K.r() - 0.5) * 2.5 * s;
    if (glass && K.r() < 0.6) K.box(px, y + 0.02, pz, 0.08 + K.r() * 0.2, 0.012, 0.06 + K.r() * 0.15, D.shard, { col: false, yaw: K.r() * TAU, skip: 'ny' });
    else K.box(px, y + 0.06, pz, 0.1 + K.r() * 0.25, 0.05 + K.r() * 0.08, 0.1 + K.r() * 0.2, K.r() < 0.7 ? D.debris : D.brick, { col: false, yaw: K.r() * TAU, skip: 'ny' });
  }
}
/** Papers scattered across a floor. */
export function papers(K, x, y, z, s = 1) {
  const n = 4 + Math.floor(K.r() * 8);
  for (let i = 0; i < n; i++) K.box(x + (K.r() - 0.5) * 3 * s, y + 0.015 + i * 0.002, z + (K.r() - 0.5) * 3 * s, 0.42, 0.006, 0.3, K.r() < 0.6 ? D.paper : K.r() < 0.5 ? D.paperOld : D.newspaper, { col: false, yaw: K.r() * TAU, skip: 'ny' });
}
/** Clothes dropped on the floor. */
export function clothes(K, x, y, z) {
  const n = 1 + Math.floor(K.r() * 3);
  for (let i = 0; i < n; i++) K.box(x + (K.r() - 0.5) * 1.5, y + 0.08, z + (K.r() - 0.5) * 1.5, 0.7 + K.r() * 0.5, 0.08, 0.5 + K.r() * 0.4, pick(K.r, F.fabric), { col: false, yaw: K.r() * TAU, skip: 'ny' });
}
/** A chair lying on its back. */
export function fallenChair(K, x, y, z, yaw, m = F.wood) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.85, 0, 0.85, 0.85, 0.1, m, noCol); // the seat, now upright
    K.box(0, 0.12, -1.2, 0.85, 0.1, 1.0, m, noCol); // the back on the floor
    for (const s of [-1, 1]) for (const t of [0.3, 1.6]) K.box(s * 0.7, t, 0.75, 0.09, 0.09, 0.75, m, noCol);
  });
}
/** A mattress dragged onto the floor (someone slept here). */
export function floorMattress(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.35, 0, 1.7, 0.35, 3.5, F.mattress, { col: false, skip: 'ny' });
    K.box(0.3, 0.75, 0.6, 1.5, 0.08, 2.2, pick(K.r, F.fabric), { col: false, yaw: 0.15 });
    K.lootAt(0, 0.75, -2, 'home');
  });
}
export function toys(K, x, y, z) {
  for (let i = 0; i < 5; i++) K.box(x + (K.r() - 0.5) * 2.5, y + 0.25, z + (K.r() - 0.5) * 2.5, 0.25, 0.25, 0.25, pick(K.r, D.toy), { col: false, yaw: K.r() * TAU });
  if (K.r() < 0.5) { K.box(x, y + 0.6, z + 1.2, 0.5, 0.6, 0.3, mat('fabric', 0x9a7050), noCol); K.box(x, y + 1.45, z + 1.2, 0.4, 0.35, 0.3, mat('fabric', 0x9a7050), noCol); }
}
export function bucketMop(K, x, y, z) {
  K.lathe(x, y, z, [[0.55, 0], [0.7, 1.4]], pick(K.r, D.enamelPot), { seg: 8 });
  K.box(x + 0.3, y + 2.6, z, 0.05, 2.6, 0.05, F.wood, { col: false, yaw: 0.2 });
}
/** A ceiling light: a bulb on a cord with a shade, or a flat dome. */
export function ceilingLight(K, x, y, z, kind = 'shade') {
  if (kind === 'tube') { K.box(x, y - 0.15, z, 2.4, 0.12, 0.3, F.white, noCol); K.box(x, y - 0.3, z, 2.2, 0.05, 0.18, D.bulb, noCol); return; }
  if (kind === 'dome') { K.lathe(x, y - 0.6, z, [[0.9, 0.6], [0.7, 0.15], [0.2, 0]], D.bulb, { seg: 10 }); return; }
  K.box(x, y - 0.6, z, 0.03, 0.6, 0.03, D.cord, noCol);
  K.lathe(x, y - 2.1, z, [[1.1, 0], [0.75, 0.6], [0.2, 0.9]], pick(K.r, D.shade), { seg: 10 });
  K.cyl(x, y - 1.75, z, 0.18, 0.35, D.bulb, { seg: 6, col: false });
}

// --- the rooms ----------------------------------------------------------------------------------------------------------------
/**
 * Fill a room. kind: living | bedroom | kids | kitchen | dining | bath | hall | office | store | classroom | ward | dorm | cells |
 * armory | garage | shop | lobby | corridor. o: { cat, era, lights, tidy }
 */
export function furnishRoom(K, R, y, kind, o = {}) {
  const L = new Layout(K, R, y);
  const r = K.r;
  if (L.w < 3 || L.d < 3) { if (r() < 0.5) K.lootAt(L.cx, y + 0.05, L.cz, o.cat || 'home'); return; }
  const cat = o.cat || 'home';
  const H = L.h;
  const top = y + H - 0.05;
  switch (kind) {
    case 'living': {
      const s = L.wallSpot(7, 2.8, { big: true });
      if (s) Fu.sofa(K, s.x, y, s.z, s.yaw, { cat });
      const wu = L.wallSpot(9, 2.4, { tall: true, big: true });
      if (wu) wallUnit(K, wu.x, y, wu.z, wu.yaw, { cat, tv: true });
      else { const t = L.wallSpot(3.2, 2.6); if (t) { Fu.dresser(K, t.x, y, t.z, t.yaw, { w: 3.2, cat }); tv(K, t.x, y + 3.22, t.z, t.yaw); } }
      const a1 = L.wallSpot(3.4, 3.2); if (a1) armchair(K, a1.x, y, a1.z, a1.yaw, pick(r, F.fabric));
      if (s) { const ct = L.floorSpot(5, 3); if (ct) coffeeTable(K, ct.x, y, ct.z, 0, { cat }); }
      const bs = L.wallSpot(4, 1.4, { tall: true }); if (bs) Fu.bookshelf(K, bs.x, y, bs.z, bs.yaw, { cat });
      if (r() < 0.6) { const p = L.wallSpot(1.6, 1.6); if (p) floorLamp(K, p.x, y, p.z); }
      if (r() < 0.5) { const p = L.wallSpot(1.8, 1.8); if (p) plantPot(K, p.x, y, p.z, true); }
      Fu.rug(K, L.cx, y, L.cz, 0, { w: Math.min(9, L.w - 3), d: Math.min(6, L.d - 3) });
      const wc = L.wallHang(7); if (wc && r() < 0.65) wallCarpet(K, wc, 7, 4.6, y + 4.6);
      break;
    }
    case 'bedroom': case 'kids': {
      const kids = kind === 'kids' || (kind === 'bedroom' && r() < 0.18);
      const dbl = !kids && L.w > 9 && L.d > 9 && r() < 0.6;
      const b = L.wallSpot(dbl ? 6.4 : 3.8, 7.4, { prefer: 'middle', big: true });
      if (b) {
        Fu.bed(K, b.x, y, b.z, b.yaw, { double: dbl, cat });
        // nightstands either side
        for (const sd of [-1, 1]) {
          if (!dbl && sd < 0) continue;
          const off = (dbl ? 3.2 : 1.9) + 1.0;
          const nx = b.x + Math.cos(b.yaw) * off * sd, nz = b.z - Math.sin(b.yaw) * off * sd;
          const bx = nx - Math.sin(b.yaw) * (7.4 / 2 - 0.9), bz = nz - Math.cos(b.yaw) * (7.4 / 2 - 0.9);
          if (L.free(bx - 0.9, bz - 0.9, bx + 0.9, bz + 0.9)) { nightstand(K, bx, y, bz, b.yaw, { cat }); L.foot.push({ x0: bx - 0.9, z0: bz - 0.9, x1: bx + 0.9, z1: bz + 0.9 }); }
        }
      }
      if (kids && L.w > 8) { const b2 = L.wallSpot(3.8, 7.4); if (b2) Fu.bed(K, b2.x, y, b2.z, b2.yaw, { cat }); }
      const wd = L.wallSpot(4.6, 2.3, { tall: true }); if (wd) Fu.wardrobe(K, wd.x, y, wd.z, wd.yaw, { cat: 'clothes' });
      const dr = L.wallSpot(4.2, 1.9); if (dr) { Fu.dresser(K, dr.x, y, dr.z, dr.yaw, { cat }); if (r() < 0.6) things(K, dr.x, y + 3.22, dr.z, 3, 1.2, 3); }
      if (kids) { const t = L.floorSpot(3, 3); if (t) toys(K, t.x, y, t.z); const p = L.wallHang(2); if (p) poster(K, p, y + 5.2); }
      if (r() < 0.5) Fu.rug(K, L.cx, y, L.cz, r() * 0.3, { w: 5, d: 3.5 });
      const pic = L.wallHang(3); if (pic && r() < 0.7) picture(K, pic, y + 5.4);
      if (r() < 0.45) { const c = L.floorSpot(2, 2); if (c) clothes(K, c.x, y, c.z); }
      if (r() < 0.15) { const m = L.floorSpot(3.6, 7.2); if (m) floorMattress(K, m.x, y, m.z, r() * 0.4); }
      break;
    }
    case 'kitchen': {
      const len = Math.min(8, Math.max(3.5, Math.max(L.w, L.d) - 7));
      const run = L.wallSpot(len, 2.4, { big: true, prefer: 'end' }) || L.wallSpot(3.5, 2.4);
      if (run) counterRun(K, run.x, y, run.z, run.yaw, run === null ? 3.5 : (run.wall.len >= len + 0.4 ? len : 3.5), { upper: r() < 0.8 });
      const st = L.wallSpot(2.6, 2.4); if (st) stove(K, st.x, y, st.z, st.yaw);
      const fr = L.wallSpot(2.7, 2.6, { tall: true }); if (fr) fridge(K, fr.x, y, fr.z, fr.yaw);
      const sk = L.wallSpot(2.9, 2.4); if (sk) sink(K, sk.x, y, sk.z, sk.yaw);
      const tb = L.floorSpot(8.5, 7.5); if (tb) Fu.table(K, tb.x, y, tb.z, r() * 0.2, { w: 4.6, d: 3.4, chairs: true, cat: 'food' });
      if (r() < 0.5) { const p = L.wallHang(2); if (p) clock(K, p, y + 6.6); }
      if (r() < 0.5) { const t = L.floorSpot(2, 2); if (t) trashHeap(K, t.x, y, t.z); }
      if (r() < 0.4) { const b = L.wallSpot(1.6, 1.6); if (b) bucketMop(K, b.x, y, b.z); }
      break;
    }
    case 'dining': {
      const tb = L.floorSpot(Math.min(10, L.w - 4), Math.min(8, L.d - 4)) || L.floorSpot(6, 6);
      if (tb) Fu.table(K, tb.x, y, tb.z, 0, { w: Math.min(7, L.w - 6), d: 3.6, chairs: true, cat });
      const sb = L.wallSpot(6, 2, { tall: true }); if (sb) wallUnit(K, sb.x, y, sb.z, sb.yaw, { w: 6, tv: false, cat });
      const pic = L.wallHang(3); if (pic) picture(K, pic, y + 5.4);
      break;
    }
    case 'bath': {
      const bt = L.wallSpot(6.6, 3.2, { big: true }); if (bt) bathtub(K, bt.x, y, bt.z, bt.yaw, Math.min(6.4, bt.wall.len - 0.4));
      const tl = L.wallSpot(2, 2.4); if (tl) toilet(K, tl.x, y, tl.z, tl.yaw);
      const bs = L.wallSpot(2.2, 1.8); if (bs) basin(K, bs.x, y, bs.z, bs.yaw);
      const wa = L.wallSpot(2.6, 2.4); if (wa && r() < 0.6) washer(K, wa.x, y, wa.z, wa.yaw);
      if (r() < 0.5) { const p = L.wallHang(1.2); if (p) at(K, p.x, 0, p.z, p.yaw, () => K.box(0, y + 4, 0.15, 0.6, 1.0, 0.1, pick(r, D.towel), noCol)); }
      break;
    }
    case 'hall': {
      const cr = L.wallSpot(4.2, 1.2); if (cr) coatRack(K, cr.x, y, cr.z, cr.yaw);
      const mi = L.wallHang(1.8); if (mi) mirror(K, mi, 1.6, 3, y + 4.6);
      if (r() < 0.4) { const p = L.wallSpot(1.8, 1.8); if (p) plantPot(K, p.x, y, p.z); }
      break;
    }
    case 'office': {
      const n = Math.max(1, Math.min(4, Math.floor(L.w * L.d / 70)));
      for (let i = 0; i < n; i++) { const dk = L.wallSpot(5.6, 3.2); if (dk) { Fu.desk(K, dk.x, y, dk.z, dk.yaw, { cat }); if (r() < 0.5) phone(K, dk.x + Math.cos(dk.yaw) * 1.8, y + 2.72, dk.z - Math.sin(dk.yaw) * 1.8, dk.yaw); } }
      for (let i = 0; i < 2; i++) { const cb = L.wallSpot(2.6, 2.6, { tall: true }); if (cb) Fu.cabinet(K, cb.x, y, cb.z, cb.yaw, { cat }); }
      const bs = L.wallSpot(4, 1.4, { tall: true }); if (bs) Fu.bookshelf(K, bs.x, y, bs.z, bs.yaw, { cat, m: F.woodPale });
      if (r() < 0.25) { const sf = L.wallSpot(2.8, 2.6); if (sf) safe(K, sf.x, y, sf.z, sf.yaw); }
      const p = L.wallHang(3); if (p) (r() < 0.5 ? poster : picture)(K, p, y + 5.4);
      const cl = L.wallHang(1.6); if (cl) clock(K, cl, y + 6.8);
      if (r() < 0.7) papers(K, L.cx, y, L.cz, 1.2);
      if (r() < 0.4) { const p2 = L.wallSpot(1.8, 1.8); if (p2) plantPot(K, p2.x, y, p2.z, true); }
      break;
    }
    case 'store': {
      for (let i = 0; i < 3; i++) { const rk = L.wallSpot(7.2, 2.4, { tall: true, big: i === 0 }); if (rk) Fu.rack(K, rk.x, y, rk.z, rk.yaw, { w: 7, cat: o.storeCat || cat }); }
      for (let i = 0; i < 3; i++) { const c = L.floorSpot(3.2, 3.2); if (c) { if (r() < 0.5) Fu.crate(K, c.x, y, c.z, r(), { loot: r() < 0.4 ? (o.storeCat || cat) : null }); else Fu.pallet(K, c.x, y, c.z, r(), { load: D.cardboard }); } }
      break;
    }
    case 'classroom': {
      const back = L.wallSpot(Math.min(12, L.w - 2), 0.4, { prefer: 'middle', big: true, wall: L.walls.find((w) => w.side === (R.side < 0 ? 'nz' : 'pz')) }) || L.wallSpot(8, 0.4, { big: true });
      if (back) at(K, back.x, 0, back.z, back.yaw, () => { K.box(0, y + 5, 0.1, Math.min(6, back.wall.len / 2 - 1), 1.9, 0.08, D.chalk, noCol); K.box(0, y + 3.0, 0.3, Math.min(6, back.wall.len / 2 - 1), 0.06, 0.25, F.wood, noCol); });
      if (back) { const fx = back.x + Math.sin(back.yaw) * 3.5, fz = back.z + Math.cos(back.yaw) * 3.5; Fu.desk(K, fx, y, fz, back.yaw + Math.PI, { cat: 'school', pc: false }); }
      const rows = Math.floor((L.d - 8) / 4), cols = Math.floor((L.w - 2) / 5);
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const x = L.x0 + 2.8 + j * 5, z = (R.side < 0 ? L.z0 + 8 + i * 4 : L.z1 - 8 - i * 4);
        if (!L.free(x - 2, z - 1.2, x + 2, z + 1.2)) continue;
        if (r() < 0.12) { fallenChair(K, x, y, z + 1, r() * TAU, F.woodPale); continue; }
        Fu.table(K, x, y, z, R.side < 0 ? 0 : Math.PI, { w: 3.6, d: 2, h: 2.4, m: F.woodPale, loot: r() < 0.12, cat: 'school' });
        Fu.chair(K, x, y, z + (R.side < 0 ? 1.6 : -1.6), R.side < 0 ? Math.PI : 0, { m: F.woodPale });
      }
      const mp = L.wallHang(5); if (mp) at(K, mp.x, 0, mp.z, mp.yaw, () => K.box(0, y + 5.4, 0.05, 2.5, 1.7, 0.02, D.map, noCol));
      const pr = L.wallHang(2); if (pr) poster(K, pr, y + 5.6);
      if (r() < 0.6) papers(K, L.cx, y, L.cz, 1.5);
      break;
    }
    case 'ward': {
      const n = Math.max(1, Math.floor(L.w / 5));
      for (let i = 0; i < n; i++) { const b = L.wallSpot(3.8, 7.6, { prefer: 'end' }); if (b) { Fu.hospitalBed(K, b.x, y, b.z, b.yaw, { cat: 'medical' }); if (r() < 0.6) nightstand(K, b.x + Math.cos(b.yaw) * 2.6, y, b.z - Math.sin(b.yaw) * 2.6 - Math.cos(b.yaw) * 2.6, b.yaw, { m: F.white, cat: 'medical' }); } }
      const cb = L.wallSpot(2.6, 2.6, { tall: true }); if (cb) Fu.cabinet(K, cb.x, y, cb.z, cb.yaw, { m: F.white, cat: 'medical' });
      if (r() < 0.6) { const s = L.floorSpot(2, 2); if (s) bloodStain(K, s.x, y, s.z, 1.2); }
      if (r() < 0.5) papers(K, L.cx, y, L.cz);
      break;
    }
    case 'dorm': {
      const n = Math.max(1, Math.floor(L.w / 4.6));
      for (let i = 0; i < n; i++) { const b = L.wallSpot(3.6, 7.2, { prefer: 'end' }); if (b) Fu.bunk(K, b.x, y, b.z, b.yaw, { cat: 'military' }); }
      for (let i = 0; i < 2; i++) { const lk = L.wallSpot(3.4, 2.2, { tall: true }); if (lk) Fu.locker(K, lk.x, y, lk.z, lk.yaw, { n: 2, cat: 'military' }); }
      const tb = L.floorSpot(5, 4); if (tb) Fu.table(K, tb.x, y, tb.z, 0, { w: 4, d: 2.6, chairs: r() < 0.6, cat: 'military', m: F.olive });
      const pr = L.wallHang(2.4); if (pr) poster(K, pr, y + 5.4, { m: mat('plaster', 0xa83020, { p: 5 }) });
      if (r() < 0.5) { const c = L.floorSpot(2, 2); if (c) clothes(K, c.x, y, c.z); }
      break;
    }
    case 'armory': {
      for (let i = 0; i < 2; i++) { const lk = L.wallSpot(6.4, 2.2, { tall: true }); if (lk) Fu.locker(K, lk.x, y, lk.z, lk.yaw, { n: 4, cat }); }
      const rk = L.wallSpot(7.2, 2.4, { tall: true }); if (rk) Fu.rack(K, rk.x, y, rk.z, rk.yaw, { w: 7, m: F.olive, cat });
      for (let i = 0; i < 2; i++) { const a = L.floorSpot(4.6, 2); if (a) Fu.ammoBox(K, a.x, y, a.z, r() * 0.3, { cat }); }
      break;
    }
    case 'garage': {
      const wb = L.wallSpot(8, 3, { big: true }); if (wb) Fu.workbench(K, wb.x, y, wb.z, wb.yaw, { cat: 'industrial' });
      const rk = L.wallSpot(7, 2.4, { tall: true }); if (rk) Fu.rack(K, rk.x, y, rk.z, rk.yaw, { w: 6.6, cat: 'industrial' });
      for (let i = 0; i < 2; i++) { const b = L.floorSpot(2.4, 2.4); if (b) Fu.barrel(K, b.x, y, b.z); }
      break;
    }
    case 'corridor': case 'lobby': default: {
      if (r() < 0.5) { const p = L.wallSpot(7, 2.8); if (p) Fu.sofa(K, p.x, y, p.z, p.yaw, { cat }); }
      if (r() < 0.6) { const p = L.wallSpot(1.8, 1.8); if (p) plantPot(K, p.x, y, p.z, true); }
      if (r() < 0.5) K.lootAt(L.cx, y + 0.05, L.cz, cat, { spread: Math.min(L.w, L.d) / 3 });
    }
  }
  dress(K, L, y, kind, o);
}

/**
 * Dressing for every room: skirting, a light, switches by the doors, radiators under the windows,
 * and how badly it was left: papers, glass, rubbish, blood.
 */
export function dress(K, L, y, kind, o = {}) {
  const r = K.r, R = L.R;
  const H = L.h;
  // skirting boards (broken at the doorways)
  if (o.skirting !== false && kind !== 'garage' && kind !== 'store' && kind !== 'cells') {
    const sk = r() < 0.6 ? D.skirting : D.skirtingPaint;
    for (const w of L.walls) {
      const gaps = (R.doors || []).filter((d) => Math.abs((w.ax === 'x' ? d.z : d.x) - (w.ax === 'x' ? R[w.side === 'nz' ? 'z0' : 'z1'] : R[w.side === 'nx' ? 'x0' : 'x1'])) < 2).map((d) => [(w.ax === 'x' ? d.x : d.z) - d.w / 2, (w.ax === 'x' ? d.x : d.z) + d.w / 2]);
      const wallAt = w.ax === 'x' ? (w.side === 'nz' ? R.z0 : R.z1) : (w.side === 'nx' ? R.x0 : R.x1);
      const a0 = w.ax === 'x' ? R.x0 : R.z0, a1 = w.ax === 'x' ? R.x1 : R.z1;
      let a = a0;
      const runs = [];
      for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { if (g0 > a) runs.push([a, g0]); a = Math.max(a, g1); }
      if (a < a1) runs.push([a, a1]);
      for (const [s0, s1] of runs) {
        if (s1 - s0 < 0.3) continue;
        const c = wallAt + (w.nx || w.nz) * 0.07;
        if (w.ax === 'x') K.box((s0 + s1) / 2, y + 0.3, c, (s1 - s0) / 2, 0.3, 0.07, sk, { col: false, skip: 'ny' });
        else K.box(c, y + 0.3, (s0 + s1) / 2, 0.07, 0.3, (s1 - s0) / 2, sk, { col: false, skip: 'ny' });
      }
    }
  }
  // the light
  if (o.lights !== false && L.w > 3.5 && L.d > 3.5) {
    const kind2 = kind === 'office' || kind === 'classroom' || kind === 'ward' || kind === 'store' || kind === 'dorm' || kind === 'armory' || kind === 'garage' || kind === 'corridor' ? 'tube' : kind === 'bath' || kind === 'hall' || kind === 'kitchen' ? 'dome' : 'shade';
    const n = kind2 === 'tube' ? Math.max(1, Math.round(Math.max(L.w, L.d) / 12)) : 1;
    for (let i = 0; i < n; i++) {
      const along = L.w > L.d;
      const x = along ? L.x0 + L.w * (i + 0.5) / n : L.cx, z = along ? L.cz : L.z0 + L.d * (i + 0.5) / n;
      ceilingLight(K, x, y + H, z, kind2);
    }
  }
  // switches by the doors
  for (const d of R.doors || []) {
    for (const w of L.walls) {
      const wallAt = w.ax === 'x' ? (w.side === 'nz' ? R.z0 : R.z1) : (w.side === 'nx' ? R.x0 : R.x1);
      if (Math.abs((w.ax === 'x' ? d.z : d.x) - wallAt) > 1.5) continue;
      const a = (w.ax === 'x' ? d.x : d.z) + d.w / 2 + 0.7;
      if (a > (w.ax === 'x' ? R.x1 : R.z1) - 0.3) continue;
      const c = wallAt + (w.nx || w.nz) * 0.05;
      if (w.ax === 'x') K.box(a, y + 4.2, c, 0.18, 0.25, 0.04, D.switch, noCol);
      else K.box(c, y + 4.2, a, 0.04, 0.25, 0.18, D.switch, noCol);
    }
  }
  // radiators under the windows
  if (kind !== 'garage' && kind !== 'store') for (const w of L.walls) for (const [, , q] of w.wins) {
    if (q.sill < 1.8) continue;
    const wallAt = w.ax === 'x' ? (w.side === 'nz' ? R.z0 : R.z1) : (w.side === 'nx' ? R.x0 : R.x1);
    const x = w.ax === 'x' ? q.x : wallAt + w.nx * 0.35, z = w.ax === 'x' ? wallAt + w.nz * 0.35 : q.z;
    Fu.radiator(K, x, y, z, Math.atan2(w.nx, w.nz));
    // glass under the broken ones, leaves blown in
    if (r() < 0.25) debris(K, x + w.nx * 1.4, y, z + w.nz * 1.4, 0.7, true);
  }
  // the mess
  const mess = o.tidy ? 0.3 : 1;
  if (r() < 0.45 * mess) { const s = L.floorSpot(2.5, 2.5); if (s) papers(K, s.x, y, s.z); }
  if (r() < 0.3 * mess) { const s = L.floorSpot(2.5, 2.5); if (s) debris(K, s.x, y, s.z, 1, r() < 0.4); }
  if (r() < 0.12 * mess) { const s = L.floorSpot(2.2, 2.2); if (s) bloodStain(K, s.x, y, s.z, 0.9 + r() * 0.6); }
  if (r() < 0.2 * mess) { const s = L.floorSpot(2.6, 2.6); if (s) fallenChair(K, s.x, y, s.z, r() * TAU); }
  if (r() < 0.25 * mess) { const s = L.floorSpot(2.4, 2.4); if (s) trashHeap(K, s.x, y, s.z); }
  if (r() < 0.35 * mess) { const s = L.floorSpot(1.6, 1.6); if (s) things(K, s.x, y, s.z, 2, 2, 2 + Math.floor(r() * 3)); }
}
