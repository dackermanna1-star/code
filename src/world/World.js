// Voxel world storage, registries for world objects (containers, doors, vehicles, POIs ...)
// and the light engine (sky light + block light, 4 bits each).
//
// Coordinates: X east, Y up, Z south. Integer block coords; block (x,y,z) spans [x,x+1) etc.
// Storage is column-major: idx = (x + z * SX) * SY + y  (so a column is contiguous).

import {
  BLOCKS, B, LIGHT_EMIT, LIGHT_FILTER, SOLID, IS_DOOR, getCollisionBoxes, SIGN_CHARS,
} from './blocks.js';

export const WORLD_SIZE = { SX: 1024, SY: 64, SZ: 1024 };
/** y of the top surface block of flat town ground (roads / lawns). Building floors are at SURFACE, walls start at SURFACE+1. */
export const SURFACE = 20;
/** water fills up to and including this y in rivers / lakes */
export const WATER_LEVEL = 18;
export const CHUNK = 16;

/** Zone ids (per column) used for zombie density, ambience and location names. */
export const ZONES = {
  WILD: 0, FOREST: 1, FARM: 2, SUBURB: 3, DOWNTOWN: 4, COMMERCIAL: 5, INDUSTRIAL: 6,
  HIGHWAY: 7, MILITARY: 8, HOSPITAL: 9, POLICE: 10, PARK: 11, WATER: 12, CAMP: 13,
  TRAILER: 14, SCHOOL: 15, ROAD: 16, CEMETERY: 17, GAS: 18,
};
export const ZONE_NAMES = Object.fromEntries(Object.entries(ZONES).map(([k, v]) => [v, k]));

export class World {
  constructor(SX = WORLD_SIZE.SX, SY = WORLD_SIZE.SY, SZ = WORLD_SIZE.SZ) {
    this.SX = SX; this.SY = SY; this.SZ = SZ;
    this.blocks = new Uint8Array(SX * SY * SZ);
    this.light = new Uint8Array(SX * SY * SZ); // (sky << 4) | block
    this.meta = new Map(); // idx -> byte
    this.zone = new Uint8Array(SX * SZ);
    this.height = new Uint8Array(SX * SZ); // y of highest non-air block per column (computeHeightmap)
    this.seed = 0;

    // Registries (filled by the world generator)
    this.containers = new Map(); // idx -> {x,y,z, loot, name, size, locked, fixed, items:null}
    this.doors = new Map(); // idx(bottom half) -> {x,y,z, kind, facing, open, locked, hp, maxHp, barricade}
    this.vehicles = []; // {type, x, y, z, yaw, color, loot, gloveLoot, alarm, wrecked, burned}
    this.pois = []; // {name, type, x0, z0, x1, z1}
    this.spawnPoints = []; // {x, y, z, yaw}
    this.zombieSpawns = []; // {x, y, z, count, radius, types}
    this.floorLoot = []; // {x, y, z, loot, chance}
    this.notes = []; // {x, y, z, noteId}
    this.corpses = []; // {x, y, z, yaw, outfit, loot}
    this.emitters = []; // idx list of light emitting blocks placed during generation

    // Runtime
    this.generated = false; // set true after generation; setBlock then records changes
    this.changes = new Map(); // idx -> id (for saves)
    this.metaChanges = new Map();
    this.listeners = []; // (x0,y0,z0,x1,y1,z1) dirty-region callbacks
  }

  // ------------------------------------------------------------------ basics
  idx(x, y, z) { return (x + z * this.SX) * this.SY + y; }
  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.SX && y < this.SY && z < this.SZ;
  }
  /** Block id at integer coords (0 = air). Below the world is bedrock, out of xz bounds is air. */
  get(x, y, z) {
    if (y < 0) return B.bedrock;
    if (x < 0 || z < 0 || x >= this.SX || z >= this.SZ || y >= this.SY) return 0;
    return this.blocks[(x + z * this.SX) * this.SY + y];
  }
  /** Raw set used during generation (no lighting / dirty tracking). */
  set(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= this.SX || y >= this.SY || z >= this.SZ) return;
    const i = (x + z * this.SX) * this.SY + y;
    this.blocks[i] = id;
    if (LIGHT_EMIT[id]) this.emitters.push(i);
  }
  getMeta(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.meta.get(this.idx(x, y, z)) || 0;
  }
  setMeta(x, y, z, m) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (m) this.meta.set(i, m); else this.meta.delete(i);
    if (this.generated) this.metaChanges.set(i, m);
  }
  /** Fill inclusive box with block id (raw). */
  fill(x0, y0, z0, x1, y1, z1, id) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); y0 = Math.max(0, y0);
    x1 = Math.min(this.SX - 1, x1); z1 = Math.min(this.SZ - 1, z1); y1 = Math.min(this.SY - 1, y1);
    const emit = LIGHT_EMIT[id];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const base = (x + z * this.SX) * this.SY;
        this.blocks.fill(id, base + y0, base + y1 + 1);
        if (emit) for (let y = y0; y <= y1; y++) this.emitters.push(base + y);
      }
    }
  }
  /** Hollow box walls (inclusive), no floor/ceiling. */
  walls(x0, y0, z0, x1, y1, z1, id) {
    this.fill(x0, y0, z0, x1, y1, z0, id);
    this.fill(x0, y0, z1, x1, y1, z1, id);
    this.fill(x0, y0, z0, x0, y1, z1, id);
    this.fill(x1, y0, z0, x1, y1, z1, id);
  }
  isSolid(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }

  /** Place a block by name or id with optional facing (0 +Z,1 -X,2 -Z,3 +X) / extra meta bits. */
  place(x, y, z, block, facing = 0, extraMeta = 0) {
    const id = typeof block === 'string' ? B[block] : block;
    if (id === undefined) throw new Error('Unknown block ' + block);
    if (this.generated) this.setBlock(x, y, z, id, (facing & 3) | extraMeta);
    else {
      this.set(x, y, z, id);
      const m = BLOCKS[id].oriented || extraMeta ? (facing & 3) | extraMeta : 0;
      this.setMeta(x, y, z, m);
    }
  }

  /**
   * Place a 2-tall door with its bottom half at (x,y,z). facing: the direction the door "front" faces
   * (doors in a wall running along X use facing 0 or 2, walls along Z use 1 or 3).
   * kind: 'door_wood' | 'door_white' | 'door_metal' | 'door_glass' | 'door_cell'
   */
  placeDoor(x, y, z, facing, kind = 'door_wood', opts = {}) {
    const id = B[kind];
    const d = BLOCKS[id];
    const open = !!opts.open;
    const m = (facing & 3) | (open ? 4 : 0);
    this.set(x, y, z, id); this.setMeta(x, y, z, m);
    this.set(x, y + 1, z, id); this.setMeta(x, y + 1, z, m | 8);
    const hp = opts.hp || d.door.hp;
    this.doors.set(this.idx(x, y, z), {
      x, y, z, kind, facing: facing & 3, open, locked: typeof opts.locked === 'string' ? opts.locked : !!opts.locked, hp, maxHp: hp, barricade: 0,
    });
  }

  /** Register a container at an existing container block (override loot table, name, lock, fixed items). */
  addContainer(x, y, z, loot = null, opts = {}) {
    const id = this.get(x, y, z);
    const d = BLOCKS[id];
    this.containers.set(this.idx(x, y, z), {
      x, y, z,
      loot: loot || d.container || 'crate',
      name: opts.name || null,
      size: opts.size || d.slots || 6,
      locked: !!opts.locked,
      fixed: opts.fixed || null, // [{id, count, data}] items always present
      items: null, // generated lazily on first open
    });
  }

  /** place + addContainer in one call */
  placeContainer(x, y, z, block, facing = 0, loot = null, opts = {}) {
    this.place(x, y, z, block, facing);
    this.addContainer(x, y, z, loot, opts);
  }

  /**
   * Spell text with sign_letter blocks starting at (x,y,z) and advancing by (dx,dz) per char.
   * facing = direction the letters face (toward the street).
   */
  placeSign(x, y, z, text, facing, dx, dz) {
    text = text.toUpperCase();
    for (let i = 0; i < text.length; i++) {
      let ci = SIGN_CHARS.indexOf(text[i]);
      if (ci < 0) ci = SIGN_CHARS.indexOf(' ');
      const px = x + dx * i, pz = z + dz * i;
      this.set(px, y, pz, B.sign_letter);
      this.setMeta(px, y, pz, (facing & 3) | (ci << 2));
    }
  }

  setZone(x0, z0, x1, z1, zone) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    x0 = Math.max(0, x0); z0 = Math.max(0, z0);
    x1 = Math.min(this.SX - 1, x1); z1 = Math.min(this.SZ - 1, z1);
    for (let z = z0; z <= z1; z++) this.zone.fill(zone, z * this.SX + x0, z * this.SX + x1 + 1);
  }
  getZone(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.SX || z >= this.SZ) return ZONES.WILD;
    return this.zone[z * this.SX + x];
  }

  addPOI(p) { this.pois.push(p); }
  addVehicle(v) { this.vehicles.push(v); }
  addCorpse(c) { this.corpses.push(c); }
  addFloorLoot(x, y, z, loot, chance = 1) { this.floorLoot.push({ x, y, z, loot, chance }); }
  addNote(x, y, z, noteId) { this.notes.push({ x, y, z, noteId }); }
  addZombieSpawn(s) { this.zombieSpawns.push(s); }
  addSpawnPoint(p) { this.spawnPoints.push(p); }

  /** First air y above the highest solid block at column (x,z). */
  surfaceY(x, z) {
    const h = this.height[Math.floor(z) * this.SX + Math.floor(x)];
    return h + 1;
  }

  computeHeightmap() {
    const { SX, SY, SZ, blocks } = this;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const base = (x + z * SX) * SY;
        let y = SY - 1;
        while (y > 0 && blocks[base + y] === 0) y--;
        this.height[z * SX + x] = y;
      }
    }
  }

  /** Highest y at column that blocks sky (rain / indoor tests). */
  roofY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.SX || z >= this.SZ) return -1;
    return this.height[z * this.SX + x];
  }

  // ------------------------------------------------------------------ runtime edits
  /** Runtime block change: records the diff, updates light and notifies renderers. */
  setBlock(x, y, z, id, meta = 0) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    const old = this.blocks[i];
    const oldMeta = this.meta.get(i) || 0;
    if (old === id && oldMeta === meta) return;
    this.blocks[i] = id;
    if (meta) this.meta.set(i, meta); else this.meta.delete(i);
    if (this.generated) {
      this.changes.set(i, id);
      this.metaChanges.set(i, meta);
    }
    // height map
    const hi = z * this.SX + x;
    if (id !== 0 && y > this.height[hi]) this.height[hi] = y;
    else if (id === 0 && y === this.height[hi]) {
      let yy = y;
      const base = (x + z * this.SX) * this.SY;
      while (yy > 0 && this.blocks[base + yy] === 0) yy--;
      this.height[hi] = yy;
    }
    const needsLight = LIGHT_FILTER[old] !== LIGHT_FILTER[id] || LIGHT_EMIT[old] !== LIGHT_EMIT[id];
    if (needsLight && this.lightReady) this.relightAround(x, y, z);
    this.notify(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1);
  }
  notify(x0, y0, z0, x1, y1, z1) {
    for (const l of this.listeners) l(x0, y0, z0, x1, y1, z1);
  }

  // ------------------------------------------------------------------ doors
  /** Door state for any cell of a door (finds the bottom half). Creates state lazily. */
  getDoor(x, y, z) {
    const id = this.get(x, y, z);
    if (!IS_DOOR[id]) return null;
    let m = this.getMeta(x, y, z);
    if (m & 8) { y -= 1; m = this.getMeta(x, y, z); }
    const i = this.idx(x, y, z);
    let d = this.doors.get(i);
    if (!d) {
      const def = BLOCKS[id];
      d = { x, y, z, kind: def.name, facing: m & 3, open: !!(m & 4), locked: false, hp: def.door.hp, maxHp: def.door.hp, barricade: 0 };
      this.doors.set(i, d);
    }
    return d;
  }
  /** Apply door state to its two blocks' meta (runtime). */
  syncDoor(d) {
    const id = B[d.kind];
    const m = d.facing | (d.open ? 4 : 0) | (d.barricade > 0 ? 16 : 0);
    this.setBlock(d.x, d.y, d.z, id, m);
    this.setBlock(d.x, d.y + 1, d.z, id, m | 8);
  }
  removeDoor(d) {
    this.doors.delete(this.idx(d.x, d.y, d.z));
    this.setBlock(d.x, d.y, d.z, 0, 0);
    this.setBlock(d.x, d.y + 1, d.z, 0, 0);
  }

  getContainer(x, y, z) {
    if (!this.inBounds(x, y, z)) return null;
    const i = this.idx(x, y, z);
    // NB: a registered entry is returned even if its block was just broken (Game.breakBlock reads the
    // items after replacing the block to drop them on the floor)
    let c = this.containers.get(i);
    if (!c) {
      const d = BLOCKS[this.get(x, y, z)];
      if (!d.container) return null;
      c = { x, y, z, loot: d.container, name: null, size: d.slots || 6, locked: false, fixed: null, items: null };
      this.containers.set(i, c);
    }
    return c;
  }

  // ------------------------------------------------------------------ collision helpers
  /**
   * Calls cb(x0,y0,z0,x1,y1,z1) for every solid collision box intersecting the AABB (world space).
   */
  forEachSolidBox(minX, minY, minZ, maxX, maxY, maxZ, cb) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x < 0 || z < 0 || x >= this.SX || z >= this.SZ) {
          // world border: invisible wall
          for (let y = y0; y <= y1; y++) cb(x, y, z, x + 1, y + 1, z + 1);
          continue;
        }
        for (let y = y0; y <= y1; y++) {
          const id = this.get(x, y, z);
          if (!SOLID[id]) continue;
          const boxes = getCollisionBoxes(id, BLOCKS[id].render === 'cube' ? 0 : this.getMeta(x, y, z));
          if (!boxes) continue;
          for (const b of boxes) cb(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        }
      }
    }
  }

  // ------------------------------------------------------------------ lighting
  skyAt(x, y, z) {
    if (y >= this.SY) return 15;
    if (!this.inBounds(x, y, z)) return y < 0 ? 0 : 15;
    return this.light[this.idx(x, y, z)] >> 4;
  }
  blockLightAt(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.light[this.idx(x, y, z)] & 15;
  }

  /** Full light computation for the entire world (call once after generation). */
  async computeAllLight(onProgress) {
    const { SX, SY, SZ, blocks, light } = this;
    light.fill(0);
    // 1. Sky columns (remember for each column the highest cell that is not full sky light)
    const tops = new Int16Array(SX * SZ);
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) tops[z * SX + x] = this._skyColumn(x, z);
      if (onProgress && (z & 63) === 0) await onProgress(z / SZ * 0.4);
    }
    // 2. Seeds: lit cells next to darker neighbours
    const q = new LightQueue();
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const base = (x + z * SX) * SY;
        const top = tops[z * SX + x];
        let ntopMax = -1;
        if (x + 1 < SX) ntopMax = Math.max(ntopMax, tops[z * SX + x + 1]);
        if (x > 0) ntopMax = Math.max(ntopMax, tops[z * SX + x - 1]);
        if (z + 1 < SZ) ntopMax = Math.max(ntopMax, tops[(z + 1) * SX + x]);
        if (z > 0) ntopMax = Math.max(ntopMax, tops[(z - 1) * SX + x]);
        for (let y = top + 1; y <= ntopMax; y++) q.push(base + y);
        // partially filtered columns (leaves, water) also spread
        for (let y = top; y >= 0; y--) {
          const s = light[base + y] >> 4;
          if (s > 1 && s < 15) q.push(base + y);
          if (LIGHT_FILTER[blocks[base + y]] >= 15) break;
        }
      }
      if (onProgress && (z & 63) === 0) await onProgress(0.4 + z / SZ * 0.2);
    }
    this._spreadSky(q, null);
    if (onProgress) await onProgress(0.8);
    // 3. Block light from emitters
    const bq = new LightQueue();
    for (const i of this.emitters) {
      const e = LIGHT_EMIT[blocks[i]];
      if (e && (light[i] & 15) < e) {
        light[i] = (light[i] & 0xf0) | e;
        bq.push(i);
      }
    }
    this._spreadBlock(bq, null);
    this.lightReady = true;
    if (onProgress) await onProgress(1);
  }

  /** Sky light for one column. Returns the highest y that does not have full (15) sky light. */
  _skyColumn(x, z) {
    const { SY, blocks, light } = this;
    const base = (x + z * this.SX) * SY;
    let lvl = 15, top = -1;
    for (let y = SY - 1; y >= 0; y--) {
      const f = LIGHT_FILTER[blocks[base + y]];
      if (f >= 15) lvl = 0;
      else if (f > 0) lvl = Math.max(0, lvl - f);
      if (lvl < 15 && top < 0) top = y;
      light[base + y] = (lvl << 4) | (light[base + y] & 15);
    }
    return top;
  }

  _spreadSky(q, bounds) {
    const { SX, SY, SZ, blocks, light } = this;
    const strideX = SY, strideZ = SX * SY;
    while (q.size) {
      const i = q.pop();
      const lvl = light[i] >> 4;
      if (lvl <= 1) continue;
      const y = i % SY;
      const col = (i - y) / SY;
      const x = col % SX;
      const z = (col - x) / SX;
      for (let n = 0; n < 6; n++) {
        let j, nx = x, nz = z, ny = y;
        switch (n) {
          case 0: if (x + 1 >= SX) continue; j = i + strideX; nx++; break;
          case 1: if (x - 1 < 0) continue; j = i - strideX; nx--; break;
          case 2: if (z + 1 >= SZ) continue; j = i + strideZ; nz++; break;
          case 3: if (z - 1 < 0) continue; j = i - strideZ; nz--; break;
          case 4: if (y + 1 >= SY) continue; j = i + 1; ny++; break;
          default: if (y - 1 < 0) continue; j = i - 1; ny--; break;
        }
        if (bounds && (nx < bounds[0] || nx > bounds[3] || nz < bounds[2] || nz > bounds[5])) continue;
        const f = LIGHT_FILTER[blocks[j]];
        if (f >= 15) continue;
        const nl = lvl - 1 - f;
        if (nl > (light[j] >> 4)) {
          light[j] = (nl << 4) | (light[j] & 15);
          q.push(j);
        }
      }
    }
  }

  _spreadBlock(q, bounds) {
    const { SX, SY, SZ, blocks, light } = this;
    const strideX = SY, strideZ = SX * SY;
    while (q.size) {
      const i = q.pop();
      const lvl = light[i] & 15;
      if (lvl <= 1) continue;
      const y = i % SY;
      const col = (i - y) / SY;
      const x = col % SX;
      const z = (col - x) / SX;
      for (let n = 0; n < 6; n++) {
        let j, nx = x, nz = z;
        switch (n) {
          case 0: if (x + 1 >= SX) continue; j = i + strideX; nx++; break;
          case 1: if (x - 1 < 0) continue; j = i - strideX; nx--; break;
          case 2: if (z + 1 >= SZ) continue; j = i + strideZ; nz++; break;
          case 3: if (z - 1 < 0) continue; j = i - strideZ; nz--; break;
          case 4: if (y + 1 >= SY) continue; j = i + 1; break;
          default: if (y - 1 < 0) continue; j = i - 1; break;
        }
        if (bounds && (nx < bounds[0] || nx > bounds[3] || nz < bounds[2] || nz > bounds[5])) continue;
        const f = LIGHT_FILTER[blocks[j]];
        if (f >= 15) continue;
        const nl = lvl - 1 - f;
        if (nl > (light[j] & 15)) {
          light[j] = (light[j] & 0xf0) | nl;
          q.push(j);
        }
      }
    }
  }

  /** Recompute light in a +-15 box around a changed block; notifies dirty regions where light changed. */
  relightAround(cx, cy, cz) {
    const R = 15;
    const { SX, SY, SZ, blocks, light } = this;
    const x0 = Math.max(0, cx - R), x1 = Math.min(SX - 1, cx + R);
    const z0 = Math.max(0, cz - R), z1 = Math.min(SZ - 1, cz + R);
    const w = x1 - x0 + 1, d = z1 - z0 + 1;
    const old = new Uint8Array(w * d * SY);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const base = (x + z * SX) * SY;
      old.set(light.subarray(base, base + SY), ((x - x0) + (z - z0) * w) * SY);
      light.fill(0, base, base + SY);
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this._skyColumn(x, z);
    const sq = new LightQueue(), bq = new LightQueue();
    // seed all lit cells inside (cheap enough for a 31x31x64 region) + border cells outside
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
        const border = x < x0 || x > x1 || z < z0 || z > z1;
        const base = (x + z * SX) * SY;
        for (let y = 0; y < SY; y++) {
          const i = base + y;
          if (!border) {
            const e = LIGHT_EMIT[blocks[i]];
            if (e) { light[i] = (light[i] & 0xf0) | e; bq.push(i); }
          }
          const l = light[i];
          if ((l >> 4) > 1 && (border || (l >> 4) === 15)) sq.push(i);
          if (border && (l & 15) > 1) bq.push(i);
        }
      }
    }
    const bounds = [x0, 0, z0, x1, SY - 1, z1];
    this._spreadSky(sq, bounds);
    this._spreadBlock(bq, bounds);
    // find changed sections
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -1, maxY = -1, maxZ = -1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const base = (x + z * SX) * SY, ob = ((x - x0) + (z - z0) * w) * SY;
      for (let y = 0; y < SY; y++) {
        if (light[base + y] !== old[ob + y]) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
      }
    }
    if (maxX >= 0) this.notify(minX - 1, minY - 1, minZ - 1, maxX + 1, maxY + 1, maxZ + 1);
  }
}

/** Growable FIFO queue of ints. */
class LightQueue {
  constructor(cap = 1 << 16) {
    this.buf = new Int32Array(cap);
    this.head = 0; this.tail = 0; this.size = 0;
  }
  push(v) {
    if (this.size === this.buf.length) {
      const nb = new Int32Array(this.buf.length * 2);
      for (let k = 0; k < this.size; k++) nb[k] = this.buf[(this.head + k) % this.buf.length];
      this.buf = nb; this.head = 0; this.tail = this.size;
    }
    this.buf[this.tail] = v;
    this.tail = (this.tail + 1) % this.buf.length;
    this.size++;
  }
  pop() {
    const v = this.buf[this.head];
    this.head = (this.head + 1) % this.buf.length;
    this.size--;
    return v;
  }
}
