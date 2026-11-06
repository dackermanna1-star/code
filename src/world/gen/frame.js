// Frame: a local coordinate system for authoring buildings once and placing them in any orientation.
//
// Local axes: +lz is the building FRONT (toward the street), +lx is "to the right" of someone standing in front of
// the building looking at it... (precisely: whatever the frame's u vector maps to). A frame is an affine map
//   world.x = ax + ux*lx + vx*lz,   world.z = az + uz*lx + vz*lz     (u, v are unit axis vectors, possibly mirrored)
// Local facings (0 = +lz, 1 = -lx, 2 = -lz, 3 = +lx) are converted to world facings automatically, so every
// oriented block (furniture, stairs, doors, ladders, signs) can be authored in local space.
import { B, BLOCKS, SOLID, IS_DOOR, FACING_DIR, facingFromDir } from '../blocks.js';
import { clearCell } from './util.js';

export class Frame {
  constructor(ctx, ax, az, ux, uz, vx, vz, w, d) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.ax = ax; this.az = az;
    this.ux = ux; this.uz = uz; this.vx = vx; this.vz = vz;
    this.w = w; this.d = d;
    this.fmap = [0, 1, 2, 3].map((f) => {
      const dx = FACING_DIR[f][0], dz = FACING_DIR[f][2];
      return facingFromDir(dx * ux + dz * vx, dx * uz + dz * vz);
    });
  }

  /** Frame covering world rect [x0..x1]x[z0..z1] whose local +Z points toward world facing `front`. */
  static fromRect(ctx, x0, z0, x1, z1, front = 0, mirror = false) {
    const W = x1 - x0 + 1, D = z1 - z0 + 1;
    let ax, az, ux, uz, vx, vz, w, d;
    switch (front & 3) {
      case 0: ux = 1; uz = 0; vx = 0; vz = 1; ax = x0; az = z0; w = W; d = D; break;
      case 2: ux = -1; uz = 0; vx = 0; vz = -1; ax = x1; az = z1; w = W; d = D; break;
      case 3: ux = 0; uz = -1; vx = 1; vz = 0; ax = x0; az = z1; w = D; d = W; break;
      default: ux = 0; uz = 1; vx = -1; vz = 0; ax = x1; az = z0; w = D; d = W; break;
    }
    if (mirror) { ax += ux * (w - 1); az += uz * (w - 1); ux = -ux; uz = -uz; }
    return new Frame(ctx, ax, az, ux, uz, vx, vz, w, d);
  }

  /** Child frame with local origin at (lx, lz) of this frame (same orientation, optional mirror). */
  sub(lx, lz, w, d, mirror = false) {
    let ax = this.wx(lx, lz), az = this.wz(lx, lz), ux = this.ux, uz = this.uz;
    if (mirror) { ax += ux * (w - 1); az += uz * (w - 1); ux = -ux; uz = -uz; }
    return new Frame(this.ctx, ax, az, ux, uz, this.vx, this.vz, w, d);
  }

  /**
   * Child frame with arbitrary axes: child local (cx, cz) -> this local (ox + U[0]*cx + V[0]*cz, oz + U[1]*cx + V[1]*cz).
   * U, V are unit axis vectors in this frame's local coordinates (e.g. U=[0,1], V=[1,0] swaps axes).
   */
  child(ox, oz, U, V, w, d) {
    const ax = this.wx(ox, oz), az = this.wz(ox, oz);
    const ux = U[0] * this.ux + U[1] * this.vx, uz = U[0] * this.uz + U[1] * this.vz;
    const vx = V[0] * this.ux + V[1] * this.vx, vz = V[0] * this.uz + V[1] * this.vz;
    return new Frame(this.ctx, ax, az, ux, uz, vx, vz, w, d);
  }

  wx(lx, lz) { return this.ax + this.ux * lx + this.vx * lz; }
  wz(lx, lz) { return this.az + this.uz * lx + this.vz * lz; }
  /** local facing -> world facing */
  fw(f) { return this.fmap[f & 3]; }
  /** continuous local point -> world point (cell centres map to cell centres) */
  px(lx, lz) { return this.ax + 0.5 - 0.5 * (this.ux + this.vx) + this.ux * lx + this.vx * lz; }
  pz(lx, lz) { return this.az + 0.5 - 0.5 * (this.uz + this.vz) + this.uz * lx + this.vz * lz; }
  /** local yaw (0 = facing +lz) -> world yaw */
  yaw(ly) {
    const sx = Math.sin(ly), cz = Math.cos(ly);
    const wx = sx * this.ux + cz * this.vx, wz = sx * this.uz + cz * this.vz;
    return Math.atan2(wx, wz);
  }
  worldRect(lx0, lz0, lx1, lz1) {
    const xa = this.wx(lx0, lz0), za = this.wz(lx0, lz0), xb = this.wx(lx1, lz1), zb = this.wz(lx1, lz1);
    return { x0: Math.min(xa, xb), z0: Math.min(za, zb), x1: Math.max(xa, xb), z1: Math.max(za, zb) };
  }

  // ------------------------------------------------------------------ blocks
  get(lx, y, lz) { return this.world.get(this.wx(lx, lz), y, this.wz(lx, lz)); }
  set(lx, y, lz, id) { this.world.set(this.wx(lx, lz), y, this.wz(lx, lz), id); }
  /** set + wipe registries/meta (use when replacing something that might have been a door/container) */
  clear(lx, y, lz, id = 0) { clearCell(this.world, this.wx(lx, lz), y, this.wz(lx, lz), id); }
  place(lx, y, lz, block, f = 0, extra = 0) {
    this.world.place(this.wx(lx, lz), y, this.wz(lx, lz), block, this.fw(f), extra);
  }
  fill(lx0, y0, lz0, lx1, y1, lz1, id) {
    this.world.fill(this.wx(lx0, lz0), y0, this.wz(lx0, lz0), this.wx(lx1, lz1), y1, this.wz(lx1, lz1), id);
  }
  /** fill only where currently air */
  fillAir(lx0, y0, lz0, lx1, y1, lz1, id) {
    const [xa, xb] = lx0 <= lx1 ? [lx0, lx1] : [lx1, lx0];
    const [za, zb] = lz0 <= lz1 ? [lz0, lz1] : [lz1, lz0];
    for (let lx = xa; lx <= xb; lx++) for (let lz = za; lz <= zb; lz++) for (let y = y0; y <= y1; y++) {
      if (this.get(lx, y, lz) === 0) this.set(lx, y, lz, id);
    }
  }
  walls(lx0, y0, lz0, lx1, y1, lz1, id) {
    this.fill(lx0, y0, lz0, lx1, y1, lz0, id);
    this.fill(lx0, y0, lz1, lx1, y1, lz1, id);
    this.fill(lx0, y0, lz0, lx0, y1, lz1, id);
    this.fill(lx1, y0, lz0, lx1, y1, lz1, id);
  }
  /** replace every block of id `from` with `to` inside the local box */
  replace(lx0, y0, lz0, lx1, y1, lz1, from, to) {
    const [xa, xb] = lx0 <= lx1 ? [lx0, lx1] : [lx1, lx0];
    const [za, zb] = lz0 <= lz1 ? [lz0, lz1] : [lz1, lz0];
    for (let lx = xa; lx <= xb; lx++) for (let lz = za; lz <= zb; lz++) for (let y = y0; y <= y1; y++) {
      if (this.get(lx, y, lz) === from) this.set(lx, y, lz, to);
    }
  }

  // ------------------------------------------------------------------ doors & openings
  door(lx, y, lz, f, kind = 'door_wood', opts = {}) {
    const x = this.wx(lx, lz), z = this.wz(lx, lz);
    clearCell(this.world, x, y, z); clearCell(this.world, x, y + 1, z);
    this.world.placeDoor(x, y, z, this.fw(f), kind, opts);
    // World.placeDoor stores !!locked; keep key ids (docs: locked may be a key id string)
    if (typeof opts.locked === 'string') this.world.doors.get(this.world.idx(x, y, z)).locked = opts.locked;
    if (opts.barricade) {
      // opts.barricade = number of planks nailed across (same 150 hp per plank as a player barricade)
      const d = this.world.doors.get(this.world.idx(x, y, z));
      d.barricade = opts.barricade * 150;
      d.open = false;
      this.world.setMeta(x, y, z, (this.world.getMeta(x, y, z) & ~4) | 16);
      this.world.setMeta(x, y + 1, z, (this.world.getMeta(x, y + 1, z) & ~4) | 16);
    }
    this.ctx.openings.add(this.world.idx(x, y, z));
    this.ctx.stats.doors = (this.ctx.stats.doors || 0) + 1;
  }
  /** doorless opening (h tall) */
  opening(lx, y, lz, h = 2) {
    for (let k = 0; k < h; k++) this.clear(lx, y + k, lz, 0);
    this.ctx.openings.add(this.world.idx(this.wx(lx, lz), y, this.wz(lx, lz)));
  }
  markOpening(lx, y, lz) { this.ctx.openings.add(this.world.idx(this.wx(lx, lz), y, this.wz(lx, lz))); }
  /** air cell whose 4 neighbours are not doors / openings (safe for free-standing furniture) */
  canPlace(lx, y, lz) {
    if (this.get(lx, y, lz) !== 0) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (IS_DOOR[this.get(lx + dx, y, lz + dz)] || this.isOpening(lx + dx, y, lz + dz)) return false;
    }
    return true;
  }
  isOpening(lx, y, lz) { return this.ctx.openings.has(this.world.idx(this.wx(lx, lz), y, this.wz(lx, lz))); }

  // ------------------------------------------------------------------ containers & signs
  container(lx, y, lz, block, f = 0, loot = null, opts = {}) {
    const x = this.wx(lx, lz), z = this.wz(lx, lz);
    this.world.placeContainer(x, y, z, block, this.fw(f), loot, opts);
  }
  /** register an override on an already placed container block */
  regContainer(lx, y, lz, loot, opts = {}) { this.world.addContainer(this.wx(lx, lz), y, this.wz(lx, lz), loot, opts); }

  /** Sign text starting at (lx,y,lz), letters facing local facing f, reading left-to-right for the viewer. */
  sign(lx, y, lz, text, f = 0) {
    const wf = this.fw(f);
    const F = FACING_DIR[wf];
    const dx = F[2], dz = -F[0]; // viewer's right
    this.world.placeSign(this.wx(lx, lz), y, this.wz(lx, lz), text, wf, dx, dz);
  }
  /** Sign centred on local x span [lx0..lx1] (text runs along local +x when f=0, -x when f=2). */
  signCentered(lx0, lx1, y, lz, text, f = 0) {
    const n = text.length, span = lx1 - lx0 + 1;
    if (n > span) text = text.slice(0, span);
    const off = Math.floor((span - text.length) / 2);
    // determine local advance direction for this facing
    const wf = this.fw(f), F = FACING_DIR[wf];
    const wdx = F[2], wdz = -F[0];
    // local +x world dir:
    const plus = (this.ux === wdx && this.uz === wdz);
    const start = plus ? lx0 + off : lx1 - off;
    this.sign(start, y, lz, text, f);
  }

  // ------------------------------------------------------------------ gameplay registries (local coords)
  /** standable cell (air at y and y+1, solid floor below) nearest to (lx, lz), searching outward. */
  findFree(lx, y, lz, maxR = 4) {
    const ok = (x, z) => {
      const a = this.get(x, y, z), b = this.get(x, y + 1, z), f = this.get(x, y - 1, z);
      return !SOLID[a] && !SOLID[b] && SOLID[f] && !BLOCKS[a].damage;
    };
    if (ok(lx, lz)) return [lx, lz];
    for (let r = 1; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) for (const dz of [-r, r]) if (ok(lx + dx, lz + dz)) return [lx + dx, lz + dz];
      for (let dz = -r + 1; dz <= r - 1; dz++) for (const dx of [-r, r]) if (ok(lx + dx, lz + dz)) return [lx + dx, lz + dz];
    }
    return null;
  }
  loot(lx, y, lz, table, chance = 1, h = 0) {
    if (h === 0) { const c = this.findFree(lx, y, lz, 3); if (!c) return; [lx, lz] = c; }
    this.world.addFloorLoot(this.px(lx + 0.5, lz + 0.5), y + h, this.pz(lx + 0.5, lz + 0.5), table, chance);
  }
  note(lx, y, lz, id, h = 0) {
    if (h === 0) { const c = this.findFree(lx, y, lz, 4); if (c) [lx, lz] = c; }
    this.world.addNote(this.px(lx + 0.5, lz + 0.5), y + h, this.pz(lx + 0.5, lz + 0.5), id);
    this.ctx.usedNotes.add(id);
  }
  zombies(lx, y, lz, count, radius = 2, opts = {}) {
    const c = this.findFree(lx, y, lz, 5); if (!c) return; [lx, lz] = c;
    this.world.addZombieSpawn({ x: this.px(lx + 0.5, lz + 0.5), y, z: this.pz(lx + 0.5, lz + 0.5), count, radius, ...opts });
  }
  corpse(lx, y, lz, localYaw, outfit = 'civilian', loot = 'corpse_civilian') {
    const c = this.findFree(lx, y, lz, 4); if (!c) return; [lx, lz] = c;
    this.world.addCorpse({ x: this.px(lx + 0.5, lz + 0.5), y, z: this.pz(lx + 0.5, lz + 0.5), yaw: this.yaw(localYaw), outfit, loot });
  }
  spawnPoint(lx, y, lz, localYaw = 0) {
    const c = this.findFree(lx, y, lz, 5); if (!c) return; [lx, lz] = c;
    this.world.addSpawnPoint({ x: this.px(lx + 0.5, lz + 0.5), y, z: this.pz(lx + 0.5, lz + 0.5), yaw: this.yaw(localYaw) });
  }
  /** vehicle centred at continuous local point (cx, cz) */
  vehicle(cx, cz, localYaw, type, opts = {}) {
    const v = { type, x: this.px(cx, cz), y: opts.y ?? 21, z: this.pz(cx, cz), yaw: this.yaw(localYaw), ...opts };
    v.y = opts.y ?? 21;
    return this.ctx.addVehicle(v);
  }
  zone(lx0, lz0, lx1, lz1, zone) {
    const r = this.worldRect(lx0, lz0, lx1, lz1);
    this.world.setZone(r.x0, r.z0, r.x1, r.z1, zone);
  }
  poi(name, type, lx0 = 0, lz0 = 0, lx1 = this.w - 1, lz1 = this.d - 1) {
    const r = this.worldRect(lx0, lz0, lx1, lz1);
    this.ctx.addPOI({ name, type, ...r });
  }
}

export { B, BLOCKS };
