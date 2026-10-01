// World manager: zone builder cache, chunk streaming around the player, collision queries.
import { ZoneMap } from './zones.js';
import { generateZone } from './generate.js';
import { buildChunkData } from './chunk.js';
import { CHUNK, LEVEL_H } from '../config.js';
import { aabbVisible } from '../core/math.js';

const MAX_BUILDERS = 180;

export class World {
  constructor(seed, tex, gpu) {
    this.seed = seed >>> 0;
    this.tex = tex;
    this.gpu = gpu;
    this.zones = new ZoneMap(this);
    this.builders = new Map();
    this.chunks = new Map();
    this.queryStamp = 1;
    this.radius = 3;
    this.vradius = 2;
    this.stats = { built: 0, buildMs: 0, genMs: 0 };
    this.dimDefs = new Map();
  }

  dimDef(dim) { return this.dimDefs.get(dim) || null; }

  zoneAt(dim, level, x, z) { return this.zones.zoneAt(dim, level, x, z); }

  builder(zone) {
    let zb = this.builders.get(zone.key);
    if (zb) {
      this.builders.delete(zone.key);
      this.builders.set(zone.key, zb);
      return zb;
    }
    const t0 = performance.now();
    zb = generateZone(this, zone);
    this.stats.genMs += performance.now() - t0;
    this.builders.set(zone.key, zb);
    if (this.builders.size > MAX_BUILDERS) {
      const it = this.builders.keys();
      for (let i = 0; i < 20; i++) this.builders.delete(it.next().value);
    }
    return zb;
  }

  ckey(dim, level, cx, cz) { return dim + ':' + level + ':' + cx + ':' + cz; }
  getChunk(dim, level, cx, cz) { return this.chunks.get(this.ckey(dim, level, cx, cz)); }

  buildChunk(dim, level, cx, cz) {
    const t0 = performance.now();
    const data = buildChunkData(this, dim, level, cx, cz);
    const ch = { key: this.ckey(dim, level, cx, cz), dim, level, cx, cz, data, meshes: {}, grid: null };
    if (this.gpu) {
      if (data.arch) ch.meshes.arch = this.gpu.createMesh(data.arch.data, data.arch.idx);
      if (data.props) ch.meshes.props = this.gpu.createMesh(data.props.data, data.props.idx);
      if (data.trans) ch.meshes.trans = this.gpu.createMesh(data.trans.data, data.trans.idx);
    }
    ch.archBounds = data.archBounds;
    ch.propBounds = data.propBounds;
    // drop CPU-side vertex data
    data.arch = data.props = data.trans = null;
    this.indexBoxes(ch);
    this.chunks.set(ch.key, ch);
    this.stats.built++;
    this.stats.buildMs += performance.now() - t0;
    return ch;
  }

  indexBoxes(ch) {
    const b = ch.data.boxes;
    const nb = b.length / 7;
    const ax = ch.cx * CHUNK, az = ch.cz * CHUNK;
    const grid = new Array(CHUNK * CHUNK);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    for (let k = 0; k < nb; k++) {
      const o = k * 7;
      const x0 = Math.max(0, Math.floor(b[o] - ax)), x1 = Math.min(CHUNK - 1, Math.floor(b[o + 3] - ax - 1e-4));
      const z0 = Math.max(0, Math.floor(b[o + 2] - az)), z1 = Math.min(CHUNK - 1, Math.floor(b[o + 5] - az - 1e-4));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * CHUNK + x].push(k);
    }
    ch.grid = grid;
    ch.stamp = new Int32Array(nb);
  }

  unloadChunk(ch) {
    if (this.gpu) for (const k in ch.meshes) this.gpu.deleteMesh(ch.meshes[k]);
    this.chunks.delete(ch.key);
  }

  levelOf(y) { return Math.floor((y + 0.05) / LEVEL_H); }

  // Stream chunks around a position. Returns number built.
  update(dim, px, py, pz, budgetMs = 6, force = false) {
    const level = this.levelOf(py);
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const R = this.radius, VR = this.vradius;
    const want = [];
    for (let dl = -1; dl <= 1; dl++) {
      const L = level + dl;
      const r = dl === 0 ? R : VR;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const ccx = cx * CHUNK + CHUNK / 2, ccz = cz * CHUNK + CHUNK / 2;
        const d = Math.hypot(ccx - px, ccz - pz);
        if (d > r * CHUNK + CHUNK * 0.75) continue;
        const k = this.ckey(dim, L, cx, cz);
        if (this.chunks.has(k)) continue;
        want.push([d + Math.abs(dl) * 24, dim, L, cx, cz]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    let built = 0;
    for (const w of want) {
      if (!force && built > 0 && performance.now() - t0 > budgetMs) break;
      if (force && w[0] > force) break;
      this.buildChunk(w[1], w[2], w[3], w[4]);
      built++;
    }
    // unload
    for (const ch of this.chunks.values()) {
      if (ch.dim !== dim) { this.unloadChunk(ch); continue; }
      const dl = Math.abs(ch.level - level);
      if (dl > 2) { this.unloadChunk(ch); continue; }
      const r = (dl === 0 ? R : VR) + 1.6;
      const d = Math.hypot(ch.cx * CHUNK + CHUNK / 2 - px, ch.cz * CHUNK + CHUNK / 2 - pz);
      if (d > r * CHUNK) this.unloadChunk(ch);
    }
    this.pendingCount = want.length - built;
    return built;
  }

  unloadAll() { for (const ch of [...this.chunks.values()]) this.unloadChunk(ch); }

  // Collect collision boxes overlapping the AABB into out (flat array of 7-tuples).
  // Missing chunks on the query's own level are reported as solid so nothing falls out of the world.
  queryBoxes(dim, x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    const stamp = ++this.queryStamp;
    const L0 = Math.floor(y0 / LEVEL_H) - 2, L1 = Math.floor(y1 / LEVEL_H);
    const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    const cz0 = Math.floor(z0 / CHUNK), cz1 = Math.floor(z1 / CHUNK);
    let missing = false;
    for (let L = L0; L <= L1; L++) {
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.chunks.get(this.ckey(dim, L, cx, cz));
        if (!ch) { if (L >= L1 - 1) missing = true; continue; }
        const b = ch.data.boxes;
        const ax = cx * CHUNK, az = cz * CHUNK;
        const gx0 = Math.max(0, Math.floor(x0 - ax)), gx1 = Math.min(CHUNK - 1, Math.floor(x1 - ax));
        const gz0 = Math.max(0, Math.floor(z0 - az)), gz1 = Math.min(CHUNK - 1, Math.floor(z1 - az));
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
          const cell = ch.grid[gz * CHUNK + gx];
          for (let j = 0; j < cell.length; j++) {
            const k = cell[j];
            if (ch.stamp[k] === stamp) continue;
            ch.stamp[k] = stamp;
            const o = k * 7;
            if (b[o] >= x1 || b[o + 3] <= x0 || b[o + 1] >= y1 || b[o + 4] <= y0 || b[o + 2] >= z1 || b[o + 5] <= z0) continue;
            out.push(b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
          }
        }
      }
    }
    return missing;
  }

  // zone at the player's position (for ambience)
  zoneInfoAt(dim, x, y, z) {
    const level = this.levelOf(y);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (const L of [level, level - 1]) {
      const ch = this.chunks.get(this.ckey(dim, L, cx, cz));
      if (!ch) continue;
      const zi = ch.data.zoneIdx[(Math.floor(z) - cz * CHUNK) * CHUNK + (Math.floor(x) - cx * CHUNK)];
      const zone = ch.data.zones[zi];
      if (zone && zone.type !== 'claimed') return zone;
      if (zone && zone.claimedBy) return zone.claimedBy;
    }
    return null;
  }

  // iterate loaded chunks of a dimension near a point
  *chunksNear(dim, x, z, r, levels) {
    for (const ch of this.chunks.values()) {
      if (ch.dim !== dim) continue;
      if (levels && !levels.includes(ch.level)) continue;
      const dx = Math.max(ch.cx * CHUNK - x, 0, x - (ch.cx + 1) * CHUNK);
      const dz = Math.max(ch.cz * CHUNK - z, 0, z - (ch.cz + 1) * CHUNK);
      if (dx * dx + dz * dz <= r * r) yield ch;
    }
  }

  draw(r, dim, cam, fogFar, propDist) {
    const pl = r.planes;
    const vis = [];
    for (const ch of this.chunks.values()) {
      if (ch.dim !== dim) continue;
      const b = ch.archBounds || ch.propBounds;
      if (!b) continue;
      const dx = Math.max(b[0] - cam.x, 0, cam.x - b[3]), dy = Math.max(b[1] - cam.y, 0, cam.y - b[4]), dz = Math.max(b[2] - cam.z, 0, cam.z - b[5]);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > fogFar + 2) continue;
      if (!aabbVisible(pl, b[0], b[1], b[2], b[3], b[4], b[5])) continue;
      vis.push([d, ch]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    for (const [d, ch] of vis) {
      if (ch.meshes.arch) r.draw(ch.meshes.arch);
      if (ch.meshes.props && d < propDist) {
        const pb = ch.propBounds;
        if (aabbVisible(pl, pb[0], pb[1], pb[2], pb[3], pb[4], pb[5])) r.draw(ch.meshes.props);
      }
    }
    // dynamic objects
    if (this.drawDynamics) this.drawDynamics(r, vis);
    // transparent pass, back to front
    r.blend('alpha');
    for (let i = vis.length - 1; i >= 0; i--) {
      const ch = vis[i][1];
      if (ch.meshes.trans) r.draw(ch.meshes.trans);
    }
    r.blend('opaque');
    return vis.length;
  }
}
