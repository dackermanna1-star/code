// Light: fixtures are baked into vertex colours (with grid line-of-sight
// occlusion and a cheap corner-darkening AO); each vertex also stores the one
// unstable lamp that affects it most, so flicker can modulate it at runtime.
import * as THREE from 'three';
import { CELL, GX0, GZ0, GW, FLOORS, T, F, ci, cj } from './plan.js';
import { MAX_LAMPS } from './ps1.js';

export const LAMP_AVG = { steady: 1, flicker: 0.85, dying: 0.18, pulse: 0.6, scripted: 1, dead: 0 };

export function addLamp(level, o) {
  const lamp = {
    k: o.k,
    x: o.x,
    y: o.y,
    z: o.z,
    color: o.color || [0.82, 0.92, 1.0],
    intensity: o.intensity ?? 1.15,
    radius: o.radius ?? 7.5,
    behavior: o.behavior || 'steady',
    kind: o.kind || 'troffer',
    blockDoors: o.blockDoors ?? true,
    down: o.down ?? true,
    idx: 0,
    phase: Math.random() * 100,
  };
  if (lamp.behavior !== 'dead') {
    lamp.idx = level.lamps.filter((l) => l.idx).length + 1;
    if (lamp.idx >= MAX_LAMPS) {
      console.warn('too many dynamic lamps');
      lamp.idx = 0;
    }
  }
  level.lamps.push(lamp);
  return lamp;
}

// 2D grid traversal between two points on floor k; endpoints' cells are ignored.
export function los(g, ax, az, bx, bz, doorsBlock) {
  let i = ci(ax), j = cj(az);
  const ti = ci(bx), tj = cj(bz);
  if (i === ti && j === tj) return true;
  const dx = bx - ax, dz = bz - az;
  const stepI = dx > 0 ? 1 : -1;
  const stepJ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(CELL / (dx || 1e-9));
  const tDeltaZ = Math.abs(CELL / (dz || 1e-9));
  const fx = (ax - GX0) / CELL - i;
  const fz = (az - GZ0) / CELL - j;
  let tMaxX = dx > 0 ? (1 - fx) * tDeltaX : fx * tDeltaX;
  let tMaxZ = dz > 0 ? (1 - fz) * tDeltaZ : fz * tDeltaZ;
  for (let s = 0; s < 200; s++) {
    if (tMaxX < tMaxZ) {
      i += stepI;
      tMaxX += tDeltaX;
    } else {
      j += stepJ;
      tMaxZ += tDeltaZ;
    }
    if (i === ti && j === tj) return true;
    if (Math.min(tMaxX, tMaxZ) > 1.0 + tDeltaX + tDeltaZ) return true;
    const t = g.at(i, j);
    if (t === T.OUT || t === T.SOLID) return false;
    if (doorsBlock && g.flag[j * GW + i] & F.NOLIGHT) return false;
  }
  return true;
}

export class Baker {
  constructor(level) {
    this.level = level;
    // bucket live lamps and windows per floor in 4 m cells
    this.buckets = new Map();
    const add = (k, x, z, r, item) => {
      for (let bz = Math.floor((z - r) / 4); bz <= Math.floor((z + r) / 4); bz++)
        for (let bx = Math.floor((x - r) / 4); bx <= Math.floor((x + r) / 4); bx++) {
          const key = `${k}:${bx}:${bz}`;
          let l = this.buckets.get(key);
          if (!l) this.buckets.set(key, (l = []));
          l.push(item);
        }
    };
    for (const L of level.lamps) if (L.behavior !== 'dead') add(L.k, L.x, L.z, L.radius, { lamp: L });
    for (const w of level.windows) {
      const wx = (w.x0 + w.x1) / 2, wz = (w.z0 + w.z1) / 2;
      // inner face centre
      const ix = w.axis === 'z' ? (w.nx > 0 ? w.x1 : w.x0) : wx;
      const iz = w.axis === 'x' ? (w.nz > 0 ? w.z1 : w.z0) : wz;
      const len = w.axis === 'x' ? w.x1 - w.x0 : w.z1 - w.z0;
      add(w.k, ix, iz, 7, { win: w, ix, iz, iy: w.k * 4 + (w.lo + w.hi) / 2, len });
    }
    this.moon = [0.4, 0.48, 0.75];
  }

  // Compute light for one point/normal. Returns {r,g,b, dyn:{idx, r,g,b}}
  shade(px, py, pz, nx, ny, nz, out) {
    const level = this.level;
    const hasN = nx * nx + ny * ny + nz * nz > 0.25;
    const qx = px + nx * 0.12, qy = py + ny * 0.12, qz = pz + nz * 0.12;
    const k = Math.max(-1, Math.min(1, Math.floor((qy + 0.3) / 4)));
    const g = level.grid(k);
    const i = ci(qx), j = cj(qz);
    let room = g.roomAt(i, j);
    if (room < 0) room = g.roomAt(ci(px), cj(pz));
    const ab = room >= 0 ? level.rooms[room].ambient : [0.03, 0.03, 0.035];
    const amb = [ab[0] * 1.6 + 0.012, ab[1] * 1.6 + 0.012, ab[2] * 1.6 + 0.016];
    // corner darkening
    let solid = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && g.opaque(i + di, j + dj)) solid++;
    const yRel = qy - g.base;
    const edge = yRel < 0.35 || yRel > 2.6 ? 1.6 : 1;
    const ao = Math.max(0.45, 1 - 0.05 * solid * edge);
    let r = amb[0] * ao, gg = amb[1] * ao, bb = amb[2] * ao;
    let dyn = null, dynC = 0, dynR = 0, dynG = 0, dynB = 0;
    const list = this.buckets.get(`${k}:${Math.floor(qx / 4)}:${Math.floor(qz / 4)}`);
    if (list)
      for (const it of list) {
        if (it.lamp) {
          const L = it.lamp;
          const lx = L.x - qx, ly = L.y - qy, lz = L.z - qz;
          const d = Math.hypot(lx, ly, lz);
          if (d > L.radius) continue;
          const inv = 1 / Math.max(d, 1e-4);
          let ndl = 1;
          if (hasN) ndl = Math.min(1, Math.max(0, (nx * lx + ny * ly + nz * lz) * inv * 0.8 + 0.2));
          if (ndl <= 0) continue;
          const down = L.down ? Math.min(1, Math.max(0, 0.3 + 0.7 * (ly * inv))) : 1;
          let att = 1 - d / L.radius;
          att = att * att;
          const c = L.intensity * att * ndl * down * (0.6 + 0.4 * ao);
          if (c < 0.004) continue;
          if (!los(g, L.x, L.z, qx, qz, L.blockDoors)) continue;
          if (L.behavior === 'steady') {
            r += L.color[0] * c;
            gg += L.color[1] * c;
            bb += L.color[2] * c;
          } else if (c > dynC) {
            if (dyn) {
              const a = LAMP_AVG[dyn.behavior];
              r += dynR * a;
              gg += dynG * a;
              bb += dynB * a;
            }
            dyn = L;
            dynC = c;
            dynR = L.color[0] * c;
            dynG = L.color[1] * c;
            dynB = L.color[2] * c;
          } else {
            const a = LAMP_AVG[L.behavior];
            r += L.color[0] * c * a;
            gg += L.color[1] * c * a;
            bb += L.color[2] * c * a;
          }
        } else if (it.win) {
          const w = it.win;
          const wnx = w.nx, wnz = w.nz;
          const vx = qx - it.ix, vy = qy - it.iy, vz = qz - it.iz;
          const ahead = vx * wnx + vz * wnz;
          if (ahead < -0.05) continue;
          const d = Math.hypot(vx, vy, vz);
          if (d > 7) continue;
          // the moon sits outside and above: light falls inward and down
          const sx = it.ix - wnx * 1.5, sy = it.iy + 1.4, sz = it.iz - wnz * 1.5;
          const lx = sx - qx, ly = sy - qy, lz = sz - qz;
          const dl = Math.hypot(lx, ly, lz);
          const inv = 1 / dl;
          let ndl = 1;
          if (hasN) ndl = Math.min(1, Math.max(0, (nx * lx + ny * ly + nz * lz) * inv * 0.85 + 0.15));
          if (ndl <= 0) continue;
          // beam: compare direction from source with the moon direction
          const mdx = wnx * 0.75, mdy = -0.66, mdz = wnz * 0.75;
          const cosb = (-lx * mdx - ly * mdy - lz * mdz) * inv;
          const beam = Math.min(1, Math.max(0, (cosb - 0.72) / 0.2));
          // lateral falloff so the patch keeps the window's width
          const lat = Math.abs(w.axis === 'x' ? qx - it.ix : qz - it.iz);
          const latF = Math.min(1, Math.max(0, 1 - (lat - it.len / 2) / 0.9));
          let att = 1 - d / 7;
          att *= att;
          const boarded = w.boarded ? 0.2 : 1;
          const c = (beam * latF * 0.9 + 0.22) * att * ndl * boarded;
          if (c < 0.004) continue;
          if (!los(g, it.ix + wnx * 0.3, it.iz + wnz * 0.3, qx, qz, true)) continue;
          r += this.moon[0] * c;
          gg += this.moon[1] * c;
          bb += this.moon[2] * c;
        }
      }
    out.r = r;
    out.g = gg;
    out.b = bb;
    out.dyn = dyn;
    out.dr = dynR;
    out.dg = dynG;
    out.db = dynB;
    return out;
  }

  // Bake a MeshBuilder's vertices. matrix (optional) maps local -> world.
  bake(b, matrix = null) {
    const n = b.vertexCount;
    const light = new Uint8Array(n * 4);
    const lamp = new Uint8Array(n * 4);
    const P = b.pos.a, N = b.nrm.a, M = b.lm.a;
    const out = {};
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const q = (x) => Math.max(0, Math.min(255, Math.round((x / 2) * 255)));
    // cache per quantised position+normal: quads share corners
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      const mode = M[i * 5];
      if (mode === 1) {
        light[i * 4] = q(M[i * 5 + 1]);
        light[i * 4 + 1] = q(M[i * 5 + 2]);
        light[i * 4 + 2] = q(M[i * 5 + 3]);
        light[i * 4 + 3] = 255;
        continue;
      }
      if (mode === 2) {
        light[i * 4] = q(0.08);
        light[i * 4 + 1] = q(0.08);
        light[i * 4 + 2] = q(0.09);
        lamp[i * 4] = q(M[i * 5 + 1]);
        lamp[i * 4 + 1] = q(M[i * 5 + 2]);
        lamp[i * 4 + 2] = q(M[i * 5 + 3]);
        lamp[i * 4 + 3] = M[i * 5 + 4];
        continue;
      }
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      nn.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      if (matrix) {
        v.applyMatrix4(matrix);
        nn.applyMatrix3(nm).normalize();
      }
      const key = `${Math.round(v.x * 50)},${Math.round(v.y * 50)},${Math.round(v.z * 50)},${Math.round(nn.x * 4)},${Math.round(nn.y * 4)},${Math.round(nn.z * 4)}`;
      let res = cache.get(key);
      if (!res) {
        this.shade(v.x, v.y, v.z, nn.x, nn.y, nn.z, out);
        res = [q(out.r), q(out.g), q(out.b), out.dyn ? q(out.dr) : 0, out.dyn ? q(out.dg) : 0, out.dyn ? q(out.db) : 0, out.dyn ? out.dyn.idx : 0];
        cache.set(key, res);
      }
      light[i * 4] = res[0];
      light[i * 4 + 1] = res[1];
      light[i * 4 + 2] = res[2];
      light[i * 4 + 3] = 255;
      lamp[i * 4] = res[3];
      lamp[i * 4 + 1] = res[4];
      lamp[i * 4 + 2] = res[5];
      lamp[i * 4 + 3] = res[6];
    }
    return { light, lamp };
  }
}

// Closed doors block baked light so rooms behind them stay dark.
export function markClosedDoors(level) {
  for (const d of level.doors) {
    if (d.kind === 'opening') continue;
    const closed = (d.open ?? 0) < 0.25 || d.barricaded || d.locked;
    if (!closed && !d.blockLight) continue;
    level.grid(d.k).fill(d.x0, d.z0, d.x1, d.z1, (n) => {
      level.grid(d.k).flag[n] |= F.NOLIGHT;
    });
  }
}

// ---------------------------------------------------------------- runtime

export class LampController {
  constructor(level) {
    this.lamps = level.lamps.filter((l) => l.idx);
    this.levels = new Float32Array(MAX_LAMPS);
    this.state = this.lamps.map(() => ({ mode: 'on', t: Math.random() * 6, v: 1, next: 0 }));
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.lamps.length; i++) {
      const L = this.lamps[i];
      const s = this.state[i];
      let v = 1;
      switch (L.behavior) {
        case 'steady':
          v = 0.97 + 0.03 * Math.sin(t * 0.7 + L.phase);
          break;
        case 'pulse':
          v = 0.55 + 0.28 * Math.sin(t * 1.3 + L.phase) + 0.05 * Math.sin(t * 7.1 + L.phase * 3);
          break;
        case 'flicker': {
          s.t -= dt;
          if (s.mode === 'on') {
            v = 0.95 + 0.05 * Math.sin(t * 3 + L.phase);
            if (s.t <= 0) {
              s.mode = 'burst';
              s.t = 0.2 + Math.random() * 1.1;
              s.next = 0;
            }
          } else if (s.mode === 'burst') {
            s.next -= dt;
            if (s.next <= 0) {
              s.v = Math.random() < 0.5 ? 0.04 : 0.6 + Math.random() * 0.4;
              s.next = 0.025 + Math.random() * 0.08;
            }
            v = s.v;
            if (s.t <= 0) {
              if (Math.random() < 0.25) {
                s.mode = 'off';
                s.t = 0.6 + Math.random() * 2.5;
              } else {
                s.mode = 'on';
                s.t = 2 + Math.random() * 9;
              }
            }
          } else {
            v = 0.03;
            if (s.t <= 0) {
              s.mode = 'burst';
              s.t = 0.15 + Math.random() * 0.4;
            }
          }
          break;
        }
        case 'dying': {
          s.t -= dt;
          if (s.mode === 'on') s.mode = 'off';
          if (s.mode === 'off') {
            v = 0.04;
            if (s.t <= 0) {
              s.mode = 'strike';
              s.t = 0.3 + Math.random() * 0.9;
              s.next = 0;
            }
          } else if (s.mode === 'strike') {
            s.next -= dt;
            if (s.next <= 0) {
              s.v = s.v > 0.3 ? 0.04 : 0.5 + Math.random() * 0.5;
              s.next = s.v > 0.3 ? 0.03 + Math.random() * 0.05 : 0.05 + Math.random() * 0.2;
            }
            v = s.v;
            if (s.t <= 0) {
              if (Math.random() < 0.35) {
                s.mode = 'hold';
                s.t = 0.8 + Math.random() * 3;
              } else {
                s.mode = 'off';
                s.t = 1.5 + Math.random() * 6;
              }
            }
          } else {
            v = 0.55 + 0.05 * Math.sin(t * 40);
            if (s.t <= 0) {
              s.mode = 'off';
              s.t = 2 + Math.random() * 7;
            }
          }
          break;
        }
      }
      this.levels[L.idx] = v;
    }
  }
}
