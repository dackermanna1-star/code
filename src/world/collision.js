// Static + dynamic AABB collision world with a 2D (XZ) uniform grid broadphase.
// Handles character movement (vertical cylinders with step-up), raycasts
// (bullets, sight) and particle collisions.

export const F_SOLID = 1; // blocks movement
export const F_SHOOT = 2; // blocks bullets
export const F_SIGHT = 4; // blocks line of sight
export const F_NONAV = 8; // ignored when building navigation surfaces
export const F_INFECTED_PASS = 16; // infected may walk through (e.g. breakable fences)
export const F_DEFAULT = F_SOLID | F_SHOOT | F_SIGHT;

export const SURFACES = ['concrete', 'plaster', 'brick', 'tile', 'wood', 'carpet', 'metal', 'dirt', 'fabric', 'rubber', 'glass', 'flesh', 'water'];
const SURF_ID = Object.fromEntries(SURFACES.map((s, i) => [s, i]));

export class CollisionWorld {
  constructor() {
    this.cap = 4096;
    this.n = 0;
    this.b = new Float32Array(this.cap * 6);
    this.flags = new Uint8Array(this.cap);
    this.surf = new Uint8Array(this.cap);
    this.stamp = new Uint32Array(this.cap);
    this.curStamp = 1;
    this.cs = 2; // grid cell size
    this.built = false;
    this.dynamic = []; // {min:[3], max:[3], flags, surf, owner, enabled}
    this.scratch = new Int32Array(8192);
    this._hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, box: -1, surf: 'concrete', owner: null };
  }

  addBox(x0, y0, z0, x1, y1, z1, surf = 'concrete', flags = F_DEFAULT) {
    if (this.n >= this.cap) this._grow();
    const i = this.n++;
    const o = i * 6;
    this.b[o] = Math.min(x0, x1); this.b[o + 1] = Math.min(y0, y1); this.b[o + 2] = Math.min(z0, z1);
    this.b[o + 3] = Math.max(x0, x1); this.b[o + 4] = Math.max(y0, y1); this.b[o + 5] = Math.max(z0, z1);
    this.flags[i] = flags;
    this.surf[i] = SURF_ID[surf] ?? 0;
    if (this.built) this._insert(i);
    return i;
  }
  _grow() {
    this.cap *= 2;
    const nb = new Float32Array(this.cap * 6); nb.set(this.b); this.b = nb;
    const nf = new Uint8Array(this.cap); nf.set(this.flags); this.flags = nf;
    const ns = new Uint8Array(this.cap); ns.set(this.surf); this.surf = ns;
    this.stamp = new Uint32Array(this.cap);
  }
  // Disable a static box (e.g. breakable wall) by collapsing it.
  disableBox(i) {
    this.flags[i] = 0;
  }
  surfaceName(i) { return SURFACES[this.surf[i]]; }

  addDynamic(min, max, opts = {}) {
    const d = {
      min: [...min], max: [...max],
      flags: opts.flags ?? F_DEFAULT,
      surf: opts.surf ?? 'metal',
      owner: opts.owner ?? null,
      enabled: true,
      vel: [0, 0, 0], // platform velocity for carrying characters
    };
    this.dynamic.push(d);
    return d;
  }
  removeDynamic(d) {
    const i = this.dynamic.indexOf(d);
    if (i >= 0) this.dynamic.splice(i, 1);
  }

  build() {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      minX = Math.min(minX, this.b[o]); minZ = Math.min(minZ, this.b[o + 2]);
      maxX = Math.max(maxX, this.b[o + 3]); maxZ = Math.max(maxZ, this.b[o + 5]);
    }
    if (!isFinite(minX)) { minX = minZ = -10; maxX = maxZ = 10; }
    this.minX = minX - 4; this.minZ = minZ - 4;
    this.nx = Math.ceil((maxX - minX + 8) / this.cs);
    this.nz = Math.ceil((maxZ - minZ + 8) / this.cs);
    const cells = this.nx * this.nz;
    const counts = new Int32Array(cells + 1);
    const forCells = (i, fn) => {
      const o = i * 6;
      const cx0 = Math.max(0, Math.floor((this.b[o] - this.minX) / this.cs));
      const cz0 = Math.max(0, Math.floor((this.b[o + 2] - this.minZ) / this.cs));
      const cx1 = Math.min(this.nx - 1, Math.floor((this.b[o + 3] - this.minX) / this.cs));
      const cz1 = Math.min(this.nz - 1, Math.floor((this.b[o + 5] - this.minZ) / this.cs));
      for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) fn(z * this.nx + x);
    };
    for (let i = 0; i < this.n; i++) forCells(i, (c) => counts[c + 1]++);
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    const items = new Int32Array(counts[cells]);
    const fill = counts.slice();
    for (let i = 0; i < this.n; i++) forCells(i, (c) => { items[fill[c]++] = i; });
    this.cellStart = counts;
    this.cellItems = items;
    this.extra = new Map(); // boxes added after build: cell -> [ids]
    this.built = true;
  }
  _insert(i) {
    const o = i * 6;
    const cx0 = Math.max(0, Math.floor((this.b[o] - this.minX) / this.cs));
    const cz0 = Math.max(0, Math.floor((this.b[o + 2] - this.minZ) / this.cs));
    const cx1 = Math.min(this.nx - 1, Math.floor((this.b[o + 3] - this.minX) / this.cs));
    const cz1 = Math.min(this.nz - 1, Math.floor((this.b[o + 5] - this.minZ) / this.cs));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
      const c = z * this.nx + x;
      if (!this.extra.has(c)) this.extra.set(c, []);
      this.extra.get(c).push(i);
    }
  }

  // Collect static boxes overlapping AABB into this.scratch. Returns count.
  query(minX, minY, minZ, maxX, maxY, maxZ, mask = F_SOLID) {
    const st = ++this.curStamp;
    let k = 0;
    const cx0 = Math.max(0, Math.floor((minX - this.minX) / this.cs));
    const cz0 = Math.max(0, Math.floor((minZ - this.minZ) / this.cs));
    const cx1 = Math.min(this.nx - 1, Math.floor((maxX - this.minX) / this.cs));
    const cz1 = Math.min(this.nz - 1, Math.floor((maxZ - this.minZ) / this.cs));
    const b = this.b;
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        const c = z * this.nx + x;
        const s = this.cellStart[c], e = this.cellStart[c + 1];
        for (let j = s; j <= e; j++) {
          let i;
          if (j === e) {
            const ex = this.extra.size ? this.extra.get(c) : null;
            if (!ex) break;
            for (const id of ex) {
              if (this.stamp[id] === st || !(this.flags[id] & mask)) continue;
              this.stamp[id] = st;
              const o = id * 6;
              if (b[o] > maxX || b[o + 3] < minX || b[o + 1] > maxY || b[o + 4] < minY || b[o + 2] > maxZ || b[o + 5] < minZ) continue;
              if (k < this.scratch.length) this.scratch[k++] = id;
            }
            break;
          }
          i = this.cellItems[j];
          if (this.stamp[i] === st) continue;
          this.stamp[i] = st;
          if (!(this.flags[i] & mask)) continue;
          const o = i * 6;
          if (b[o] > maxX || b[o + 3] < minX || b[o + 1] > maxY || b[o + 4] < minY || b[o + 2] > maxZ || b[o + 5] < minZ) continue;
          if (k < this.scratch.length) this.scratch[k++] = i;
        }
      }
    }
    return k;
  }

  // Ray cast. Direction must be normalised. Returns hit object (shared!) or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask = F_SHOOT, ignoreDynamicOwner = null) {
    let best = maxDist;
    let bestBox = -1, bestN = 0, bestDyn = null;
    const b = this.b;
    const invx = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
    const invy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
    const invz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
    const slab = (x0, y0, z0, x1, y1, z1) => {
      let t1 = (x0 - ox) * invx, t2 = (x1 - ox) * invx;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = t1 < t2 ? -1 : 1, axis = 0;
      let nAxis = ax;
      t1 = (y0 - oy) * invy; t2 = (y1 - oy) * invy;
      let tn = Math.min(t1, t2);
      if (tn > tmin) { tmin = tn; axis = 1; nAxis = t1 < t2 ? -1 : 1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (z0 - oz) * invz; t2 = (z1 - oz) * invz;
      tn = Math.min(t1, t2);
      if (tn > tmin) { tmin = tn; axis = 2; nAxis = t1 < t2 ? -1 : 1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < 0 || tmin > tmax) return -1;
      _slabAxis = axis * 2 + (nAxis > 0 ? 1 : 0);
      return tmin < 0 ? 0 : tmin;
    };
    let _slabAxis = 0;
    if (this.built) {
      const st = ++this.curStamp;
      const cs = this.cs;
      // Start cell (clamped into grid)
      let px = ox, pz = oz, t0 = 0;
      const gx1 = this.minX + this.nx * cs, gz1 = this.minZ + this.nz * cs;
      if (px < this.minX || px >= gx1 || pz < this.minZ || pz >= gz1) {
        // Enter grid bounds
        let tx0 = (this.minX - ox) * invx, tx1 = (gx1 - ox) * invx;
        let tz0 = (this.minZ - oz) * invz, tz1 = (gz1 - oz) * invz;
        const tmin = Math.max(Math.min(tx0, tx1), Math.min(tz0, tz1));
        const tmax = Math.min(Math.max(tx0, tx1), Math.max(tz0, tz1));
        if (tmax < 0 || tmin > tmax || tmin > maxDist) { t0 = Infinity; }
        else { t0 = Math.max(0, tmin) + 1e-4; px = ox + dx * t0; pz = oz + dz * t0; }
      }
      if (t0 !== Infinity) {
        let cx = Math.min(this.nx - 1, Math.max(0, Math.floor((px - this.minX) / cs)));
        let cz = Math.min(this.nz - 1, Math.max(0, Math.floor((pz - this.minZ) / cs)));
        const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
        const nextBX = this.minX + (cx + (dx > 0 ? 1 : 0)) * cs;
        const nextBZ = this.minZ + (cz + (dz > 0 ? 1 : 0)) * cs;
        let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (nextBX - ox) * invx;
        let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (nextBZ - oz) * invz;
        const tDX = Math.abs(dx) < 1e-9 ? Infinity : cs * Math.abs(invx);
        const tDZ = Math.abs(dz) < 1e-9 ? Infinity : cs * Math.abs(invz);
        let guard = 0;
        while (guard++ < 4096) {
          const c = cz * this.nx + cx;
          const s = this.cellStart[c], e = this.cellStart[c + 1];
          for (let j = s; j < e; j++) {
            const i = this.cellItems[j];
            if (this.stamp[i] === st) continue;
            this.stamp[i] = st;
            if (!(this.flags[i] & mask)) continue;
            const o = i * 6;
            const t = slab(b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5]);
            if (t >= 0 && t < best) { best = t; bestBox = i; bestN = _slabAxis; }
          }
          if (this.extra.size) {
            const ex = this.extra.get(c);
            if (ex) for (const i of ex) {
              if (this.stamp[i] === st) continue;
              this.stamp[i] = st;
              if (!(this.flags[i] & mask)) continue;
              const o = i * 6;
              const t = slab(b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5]);
              if (t >= 0 && t < best) { best = t; bestBox = i; bestN = _slabAxis; }
            }
          }
          const tNext = Math.min(tMaxX, tMaxZ);
          if (best <= tNext || tNext > maxDist) break;
          if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; if (cx < 0 || cx >= this.nx) break; }
          else { cz += stepZ; tMaxZ += tDZ; if (cz < 0 || cz >= this.nz) break; }
        }
      }
    }
    for (const d of this.dynamic) {
      if (!d.enabled || !(d.flags & mask) || (ignoreDynamicOwner && d.owner === ignoreDynamicOwner)) continue;
      const t = slab(d.min[0], d.min[1], d.min[2], d.max[0], d.max[1], d.max[2]);
      if (t >= 0 && t < best) { best = t; bestBox = -1; bestDyn = d; bestN = _slabAxis; }
    }
    if (bestBox < 0 && !bestDyn) return null;
    const h = this._hit;
    h.t = best;
    h.x = ox + dx * best; h.y = oy + dy * best; h.z = oz + dz * best;
    const axis = bestN >> 1, sgn = bestN & 1 ? 1 : -1;
    // The face hit has normal opposite to entry direction
    h.nx = axis === 0 ? sgn : 0; h.ny = axis === 1 ? sgn : 0; h.nz = axis === 2 ? sgn : 0;
    h.box = bestBox;
    h.dyn = bestDyn;
    h.owner = bestDyn ? bestDyn.owner : null;
    h.surf = bestDyn ? bestDyn.surf : SURFACES[this.surf[bestBox]];
    return h;
  }

  // True if segment a->b is unobstructed for sight.
  lineOfSight(ax, ay, az, bx, by, bz, mask = F_SIGHT) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, mask);
  }

  // Highest solid top surface under (x, yTop, z) within maxDrop, for a column of radius r.
  groundHeight(x, yTop, z, maxDrop = 50, r = 0.05) {
    const k = this.query(x - r, yTop - maxDrop, z - r, x + r, yTop, z + r, F_SOLID);
    let best = -Infinity;
    for (let j = 0; j < k; j++) {
      const o = this.scratch[j] * 6;
      const top = this.b[o + 4];
      if (top <= yTop + 1e-3 && top > best) best = top;
    }
    for (const d of this.dynamic) {
      if (!d.enabled || !(d.flags & F_SOLID)) continue;
      if (x + r < d.min[0] || x - r > d.max[0] || z + r < d.min[2] || z - r > d.max[2]) continue;
      if (d.max[1] <= yTop + 1e-3 && d.max[1] > best) best = d.max[1];
    }
    return best;
  }

  // Move a vertical cylinder body. body: {x,y,z, vx,vy,vz, r, h, onGround, step}
  // Applies velocity*dt, resolves collisions, updates onGround and velocities.
  moveBody(body, dt, opts = {}) {
    const r = body.r, h = body.h;
    const step = body.step ?? 0.45;
    const dx = body.vx * dt, dy = body.vy * dt, dz = body.vz * dt;
    const mask = opts.mask ?? F_SOLID;
    const wasGround = body.onGround;
    // Gather candidates for whole move
    const margin = r + 0.1;
    const k = this.query(
      Math.min(body.x, body.x + dx) - margin, Math.min(body.y, body.y + dy) - step - 0.2, Math.min(body.z, body.z + dz) - margin,
      Math.max(body.x, body.x + dx) + margin, Math.max(body.y, body.y + dy) + h + step + 0.2, Math.max(body.z, body.z + dz) + margin,
      mask
    );
    const cand = this._cand || (this._cand = new Int32Array(8192));
    for (let j = 0; j < k; j++) cand[j] = this.scratch[j];
    // Append dynamic boxes as pseudo candidates (negative index)
    const dyn = this.dynamic;
    const B = this.b;
    const boxOf = (j, out) => {
      if (j >= 0) {
        const o = j * 6;
        out[0] = B[o]; out[1] = B[o + 1]; out[2] = B[o + 2]; out[3] = B[o + 3]; out[4] = B[o + 4]; out[5] = B[o + 5];
      } else {
        const d = dyn[-j - 1];
        out[0] = d.min[0]; out[1] = d.min[1]; out[2] = d.min[2]; out[3] = d.max[0]; out[4] = d.max[1]; out[5] = d.max[2];
      }
      return out;
    };
    let nc = k;
    for (let di = 0; di < dyn.length; di++) {
      const d = dyn[di];
      if (!d.enabled || !(d.flags & mask)) continue;
      if (opts.ignoreOwner && d.owner === opts.ignoreOwner) continue;
      cand[nc++] = -di - 1;
    }
    const bx = this._bx || (this._bx = new Float32Array(6));
    const circleOverlap = (px, pz, rr) => {
      const cx = px < bx[0] ? bx[0] : px > bx[3] ? bx[3] : px;
      const cz = pz < bx[2] ? bx[2] : pz > bx[5] ? bx[5] : pz;
      const ex = px - cx, ez = pz - cz;
      return ex * ex + ez * ez < rr * rr;
    };

    body.onGround = false;
    body.groundDyn = null;
    // ---- vertical
    let ny = body.y + dy;
    if (dy <= 0) {
      let land = -Infinity, landDyn = null;
      for (let j = 0; j < nc; j++) {
        boxOf(cand[j], bx);
        if (!circleOverlap(body.x, body.z, r * 0.92)) continue;
        const top = bx[4];
        if (top <= body.y + 0.02 && top >= ny - 0.001 && top > land) { land = top; landDyn = cand[j] < 0 ? dyn[-cand[j] - 1] : null; }
      }
      if (land > -Infinity) {
        ny = land;
        body.vy = 0;
        body.onGround = true;
        body.groundDyn = landDyn;
      }
    } else {
      for (let j = 0; j < nc; j++) {
        boxOf(cand[j], bx);
        if (!circleOverlap(body.x, body.z, r * 0.92)) continue;
        if (bx[1] >= body.y + h - 0.02 && bx[1] < ny + h) {
          ny = bx[1] - h;
          body.vy = Math.min(0, body.vy);
        }
      }
    }
    body.y = ny;
    // ---- horizontal with substeps
    const hl = Math.max(Math.abs(dx), Math.abs(dz));
    const sub = Math.max(1, Math.ceil(hl / (r * 0.5)));
    const sx = dx / sub, sz = dz / sub;
    let hitWall = false;
    for (let s = 0; s < sub; s++) {
      body.x += sx;
      body.z += sz;
      for (let it = 0; it < 3; it++) {
        let pushed = false;
        for (let j = 0; j < nc; j++) {
          boxOf(cand[j], bx);
          if (bx[4] <= body.y + 0.01 || bx[1] >= body.y + h - 0.01) continue; // no vertical overlap
          const cx = body.x < bx[0] ? bx[0] : body.x > bx[3] ? bx[3] : body.x;
          const cz = body.z < bx[2] ? bx[2] : body.z > bx[5] ? bx[5] : body.z;
          let ex = body.x - cx, ez = body.z - cz;
          const d2 = ex * ex + ez * ez;
          if (d2 >= r * r) continue;
          // Try step-up
          const rise = bx[4] - body.y;
          if (rise > 0 && rise <= step && (wasGround || body.onGround || opts.forceStep)) {
            // Headroom check at stepped height
            let clear = true;
            for (let q = 0; q < nc; q++) {
              if (q === j) continue;
              boxOf(cand[q], this._bx2 || (this._bx2 = new Float32Array(6)));
              const b2 = this._bx2;
              if (b2[4] <= bx[4] + 0.01 || b2[1] >= bx[4] + h) continue;
              const qx = body.x < b2[0] ? b2[0] : body.x > b2[3] ? b2[3] : body.x;
              const qz = body.z < b2[2] ? b2[2] : body.z > b2[5] ? b2[5] : body.z;
              const fx = body.x - qx, fz = body.z - qz;
              if (fx * fx + fz * fz < r * r * 0.8) { clear = false; break; }
            }
            if (clear) {
              body.y = bx[4];
              body.onGround = true;
              body.stepped = (body.stepped || 0) + rise;
              continue;
            }
          }
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = r - d;
            ex /= d; ez /= d;
            body.x += ex * push;
            body.z += ez * push;
            // kill velocity into the wall
            const vn = body.vx * ex + body.vz * ez;
            if (vn < 0) { body.vx -= vn * ex; body.vz -= vn * ez; }
          } else {
            // centre inside box: push out along smallest axis
            const pxn = body.x - bx[0], pxp = bx[3] - body.x, pzn = body.z - bx[2], pzp = bx[5] - body.z;
            const m = Math.min(pxn, pxp, pzn, pzp);
            if (m === pxn) { body.x = bx[0] - r; body.vx = Math.min(0, body.vx); }
            else if (m === pxp) { body.x = bx[3] + r; body.vx = Math.max(0, body.vx); }
            else if (m === pzn) { body.z = bx[2] - r; body.vz = Math.min(0, body.vz); }
            else { body.z = bx[5] + r; body.vz = Math.max(0, body.vz); }
          }
          pushed = true;
          hitWall = true;
        }
        if (!pushed) break;
      }
    }
    // ---- ground snap / support check
    if (!body.onGround && body.vy <= 0.01) {
      let top = -Infinity, topDyn = null;
      const snap = wasGround ? step + 0.05 : 0.03;
      for (let j = 0; j < nc; j++) {
        boxOf(cand[j], bx);
        if (!circleOverlap(body.x, body.z, r * 0.9)) continue;
        if (bx[4] <= body.y + 0.02 && bx[4] >= body.y - snap && bx[4] > top) { top = bx[4]; topDyn = cand[j] < 0 ? dyn[-cand[j] - 1] : null; }
      }
      if (top > -Infinity) {
        body.y = top;
        body.onGround = true;
        body.vy = 0;
        body.groundDyn = topDyn;
      }
    }
    body.hitWall = hitWall;
    return body;
  }

  // Resolve a sphere particle against static world (used by ragdolls / gibs / shells).
  // p: {x,y,z}, returns contact normal y (>0.5 means resting on floor) or 0 if none.
  collideSphere(p, r, out) {
    const k = this.query(p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r, F_SOLID);
    let contact = false;
    out.nx = 0; out.ny = 0; out.nz = 0;
    const b = this.b;
    for (let j = 0; j < k; j++) {
      const o = this.scratch[j] * 6;
      const cx = p.x < b[o] ? b[o] : p.x > b[o + 3] ? b[o + 3] : p.x;
      const cy = p.y < b[o + 1] ? b[o + 1] : p.y > b[o + 4] ? b[o + 4] : p.y;
      const cz = p.z < b[o + 2] ? b[o + 2] : p.z > b[o + 5] ? b[o + 5] : p.z;
      let ex = p.x - cx, ey = p.y - cy, ez = p.z - cz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        ex /= d; ey /= d; ez /= d;
        const push = r - d;
        p.x += ex * push; p.y += ey * push; p.z += ez * push;
        out.nx += ex; out.ny += ey; out.nz += ez;
      } else {
        // inside: push up/out by smallest axis
        const opts = [
          [p.x - b[o], -1, 0, 0], [b[o + 3] - p.x, 1, 0, 0],
          [p.y - b[o + 1], 0, -1, 0], [b[o + 4] - p.y, 0, 1, 0],
          [p.z - b[o + 2], 0, 0, -1], [b[o + 5] - p.z, 0, 0, 1],
        ];
        let m = opts[0];
        for (const q of opts) if (q[0] < m[0]) m = q;
        p.x += m[1] * (m[0] + r); p.y += m[2] * (m[0] + r); p.z += m[3] * (m[0] + r);
        out.nx += m[1]; out.ny += m[2]; out.nz += m[3];
      }
      contact = true;
    }
    for (const d of this.dynamic) {
      if (!d.enabled || !(d.flags & F_SOLID)) continue;
      const cx = p.x < d.min[0] ? d.min[0] : p.x > d.max[0] ? d.max[0] : p.x;
      const cy = p.y < d.min[1] ? d.min[1] : p.y > d.max[1] ? d.max[1] : p.y;
      const cz = p.z < d.min[2] ? d.min[2] : p.z > d.max[2] ? d.max[2] : p.z;
      let ex = p.x - cx, ey = p.y - cy, ez = p.z - cz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r * r || d2 < 1e-10) continue;
      const dd = Math.sqrt(d2);
      ex /= dd; ey /= dd; ez /= dd;
      p.x += ex * (r - dd); p.y += ey * (r - dd); p.z += ez * (r - dd);
      out.nx += ex; out.ny += ey; out.nz += ez;
      contact = true;
    }
    return contact;
  }

  boxCount() { return this.n; }
  getBox(i, out) {
    const o = i * 6;
    for (let q = 0; q < 6; q++) out[q] = this.b[o + q];
    return out;
  }
}
