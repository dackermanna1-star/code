import * as THREE from 'three';
import { Vec3 } from '../physics/math.js';

/**
 * Blood and gore rendering:
 *  - BloodParticles: ballistic droplets (and tissue / bone fragments) with air drag that leave
 *    elongated stains where they land, plus a fine mist for high-velocity wounds.
 *  - SkinBlood: per-vertex blood film on a person's skin. Wounds emit their measured external
 *    bleeding rate; the film runs downhill across the mesh in the *current* pose (CPU-skinned
 *    heights), so streaks follow gravity as the body moves; low points drip, and blood reaching the
 *    floor feeds a growing pool. Arterial wounds spurt in time with the heartbeat.
 */

const MAX_DROPS = 5000;
const MAX_MIST = 1500;
const G = -9.81;

const KIND_COLOR = [
  new THREE.Color(0x3a0202), // blood
  new THREE.Color(0x8a3a3a), // tissue
  new THREE.Color(0xe8dccb), // bone
  new THREE.Color(0xc0303f), // melon juice
  new THREE.Color(0x2d7a2e), // melon rind
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class BloodParticles {
  constructor(scene, decals) {
    this.decals = decals;
    this.floorAt = null; // optional (x, z) -> floor height (default: the y = 0 plane)
    this.pos = new Float32Array(MAX_DROPS * 3);
    this.vel = new Float32Array(MAX_DROPS * 3);
    this.size = new Float32Array(MAX_DROPS);
    this.vol = new Float32Array(MAX_DROPS);
    this.kind = new Uint8Array(MAX_DROPS);
    this.age = new Float32Array(MAX_DROPS);
    this.n = 0;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DROPS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.setColorAt(0, KIND_COLOR[0]);
    scene.add(this.mesh);

    // mist: soft sprites
    this.mpos = new Float32Array(MAX_MIST * 3);
    this.mvel = new Float32Array(MAX_MIST * 3);
    this.mlife = new Float32Array(MAX_MIST);
    this.mage = new Float32Array(MAX_MIST);
    this.msize = new Float32Array(MAX_MIST);
    this.mcol = new Float32Array(MAX_MIST * 3);
    this.mn = 0;
    const mgeo = new THREE.BufferGeometry();
    this.mPosAttr = new THREE.BufferAttribute(new Float32Array(MAX_MIST * 3), 3);
    this.mSizeAttr = new THREE.BufferAttribute(new Float32Array(MAX_MIST), 1);
    this.mAlphaAttr = new THREE.BufferAttribute(new Float32Array(MAX_MIST), 1);
    this.mColAttr = new THREE.BufferAttribute(new Float32Array(MAX_MIST * 3), 3);
    for (const a of [this.mPosAttr, this.mSizeAttr, this.mAlphaAttr, this.mColAttr]) a.setUsage(THREE.DynamicDrawUsage);
    mgeo.setAttribute('position', this.mPosAttr);
    mgeo.setAttribute('aSize', this.mSizeAttr);
    mgeo.setAttribute('aAlpha', this.mAlphaAttr);
    mgeo.setAttribute('aColor', this.mColAttr);
    mgeo.setDrawRange(0, 0);
    const mmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC;
        uniform float uScale;
        void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC, a * vA); if (gl_FragColor.a < 0.004) discard; }`,
    });
    this.mist = new THREE.Points(mgeo, mmat);
    this.mist.frustumCulled = false;
    scene.add(this.mist);
  }

  setViewportHeight(h, fov) {
    this.mist.material.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(px, py, pz, vx, vy, vz, size, vol = 0.03, kind = 0) {
    if (this.n >= MAX_DROPS) return;
    const i = this.n++;
    this.pos[i * 3] = px;
    this.pos[i * 3 + 1] = py;
    this.pos[i * 3 + 2] = pz;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.vol[i] = vol;
    this.kind[i] = kind;
    this.age[i] = 0;
    this.mesh.setColorAt(i, KIND_COLOR[kind]);
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** Cone spray of `count` droplets around direction d (unit). */
  spray(p, d, count, speed, spread, sizeMin = 0.0008, sizeMax = 0.003, kind = 0, volEach = 0.05, rng = Math.random) {
    const up = Math.abs(d.y) < 0.9 ? _up : new THREE.Vector3(1, 0, 0);
    const r = new THREE.Vector3().crossVectors(d, up).normalize();
    const u = new THREE.Vector3().crossVectors(r, d).normalize();
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, s = Math.pow(rng(), 0.6) * spread;
      const sp = speed * (0.35 + 0.9 * rng());
      const dx = d.x + (r.x * Math.cos(a) + u.x * Math.sin(a)) * s;
      const dy = d.y + (r.y * Math.cos(a) + u.y * Math.sin(a)) * s;
      const dz = d.z + (r.z * Math.cos(a) + u.z * Math.sin(a)) * s;
      const l = Math.hypot(dx, dy, dz);
      const size = sizeMin + (sizeMax - sizeMin) * Math.pow(rng(), 2.2);
      this.emit(p.x, p.y, p.z, (dx / l) * sp, (dy / l) * sp, (dz / l) * sp, size, volEach, kind);
    }
  }

  addMist(p, d, count, speed, color = 0x7a0a0a, size = 0.05, life = 0.6, rng = Math.random) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this.mn < MAX_MIST; i++) {
      const k = this.mn++;
      const s = speed * (0.2 + rng());
      this.mpos.set([p.x, p.y, p.z], k * 3);
      this.mvel.set([d.x * s + (rng() - 0.5) * speed * 0.8, d.y * s + (rng() - 0.5) * speed * 0.8, d.z * s + (rng() - 0.5) * speed * 0.8], k * 3);
      this.mlife[k] = life * (0.6 + 0.8 * rng());
      this.mage[k] = 0;
      this.msize[k] = size * (0.5 + rng());
      this.mcol.set([c.r, c.g, c.b], k * 3);
    }
  }

  update(dt) {
    const decals = this.decals;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];
      const sp = Math.hypot(vx, vy, vz);
      // drag on a small drop: a = -k v|v|, k ~ 2e-4 / r
      const k = Math.min(2.2e-4 / Math.max(this.size[i], 4e-4), 2.5);
      const f = 1 / (1 + k * sp * dt);
      vx *= f;
      vz *= f;
      vy = vy * f + G * dt;
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] += vy * dt;
      this.pos[i3 + 2] += vz * dt;
      this.age[i] += dt;
      const y = this.pos[i3 + 1];
      let dead = this.age[i] > 6;
      const fy = this.floorAt ? this.floorAt(this.pos[i3], this.pos[i3 + 2], y + 0.5) : 0;
      if (y <= fy + this.size[i] * 0.5) {
        dead = true;
        const x = this.pos[i3], z = this.pos[i3 + 2];
        const kind = this.kind[i];
        if (kind === 0 || kind === 1) {
          const vh = Math.hypot(vx, vz);
          const sinA = Math.abs(vy) / Math.max(Math.hypot(vh, vy), 1e-6);
          const elong = Math.min(1 / Math.max(sinA, 0.2), 5);
          const rad = this.size[i] * (1.7 + 0.22 * Math.sqrt(Math.hypot(vh, vy))) * (kind === 1 ? 1.4 : 1);
          decals.splat(x, z, rad, 0, 0.55 + Math.min(this.vol[i] * 2, 0.4), elong, Math.atan2(vz, vx), Math.random());
          if (this.vol[i] >= 0.2) decals.addPoolVolume(x, z, this.vol[i]);
        } else if (kind === 3) {
          decals.splat(x, z, this.size[i] * 2.4, 2, 0.7, 1, 0, Math.random());
        }
      }
      if (dead) {
        // swap-remove
        n--;
        if (i !== n) {
          this.pos.copyWithin(i3, n * 3, n * 3 + 3);
          this.vel.copyWithin(i3, n * 3, n * 3 + 3);
          this.size[i] = this.size[n];
          this.vol[i] = this.vol[n];
          this.kind[i] = this.kind[n];
          this.age[i] = this.age[n];
          this.mesh.setColorAt(i, KIND_COLOR[this.kind[i]]);
          this.mesh.instanceColor.needsUpdate = true;
        }
        i--;
      }
    }
    this.n = n;
    // instances: stretched along velocity
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      _v.set(this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2]);
      const sp = _v.length();
      const s = this.size[i];
      const stretch = 1 + Math.min(sp * 0.0035 / Math.max(s, 1e-4), 2.5);
      if (sp > 1e-4) _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / sp));
      else _q.identity();
      _s.set(s, s * stretch, s);
      _m.compose(_v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;

    // mist
    let m = this.mn;
    for (let i = 0; i < m; i++) {
      this.mage[i] += dt;
      if (this.mage[i] > this.mlife[i]) {
        m--;
        if (i !== m) {
          this.mpos.copyWithin(i * 3, m * 3, m * 3 + 3);
          this.mvel.copyWithin(i * 3, m * 3, m * 3 + 3);
          this.mcol.copyWithin(i * 3, m * 3, m * 3 + 3);
          this.mlife[i] = this.mlife[m];
          this.mage[i] = this.mage[m];
          this.msize[i] = this.msize[m];
        }
        i--;
        continue;
      }
      const i3 = i * 3;
      const f = Math.exp(-dt * 7);
      this.mvel[i3] *= f;
      this.mvel[i3 + 1] = this.mvel[i3 + 1] * f - 0.6 * dt;
      this.mvel[i3 + 2] *= f;
      this.mpos[i3] += this.mvel[i3] * dt;
      this.mpos[i3 + 1] += this.mvel[i3 + 1] * dt;
      this.mpos[i3 + 2] += this.mvel[i3 + 2] * dt;
    }
    this.mn = m;
    const pa = this.mPosAttr.array, sa = this.mSizeAttr.array, aa = this.mAlphaAttr.array, ca = this.mColAttr.array;
    for (let i = 0; i < m; i++) {
      const t = this.mage[i] / this.mlife[i];
      pa[i * 3] = this.mpos[i * 3];
      pa[i * 3 + 1] = this.mpos[i * 3 + 1];
      pa[i * 3 + 2] = this.mpos[i * 3 + 2];
      sa[i] = this.msize[i] * (0.6 + 1.6 * Math.sqrt(t));
      aa[i] = 0.32 * (1 - t) * (1 - t);
      ca[i * 3] = this.mcol[i * 3];
      ca[i * 3 + 1] = this.mcol[i * 3 + 1];
      ca[i * 3 + 2] = this.mcol[i * 3 + 2];
    }
    for (const a of [this.mPosAttr, this.mSizeAttr, this.mAlphaAttr, this.mColAttr]) a.needsUpdate = true;
    this.mist.geometry.setDrawRange(0, m);
  }

  clear() {
    this.n = 0;
    this.mn = 0;
    this.mesh.count = 0;
    this.mist.geometry.setDrawRange(0, 0);
  }
}

// ------------------------------------------------------------------------------------------------

const UNIT_ML = 0.035; // blood volume represented by one unit of film on one vertex
const RETAIN = 0.55; // film a vertex holds (stain) before it runs
const DRIP = 1.6;

/** Vertex adjacency (CSR) of the body mesh, with extra links across detail-patch seams. */
export function buildAdjacency(data) {
  const nv = data.positions.length / 3;
  const idx = data.indices;
  const deg = new Uint32Array(nv);
  for (let t = 0; t < idx.length; t += 3) {
    deg[idx[t]] += 2;
    deg[idx[t + 1]] += 2;
    deg[idx[t + 2]] += 2;
  }
  // seam links: vertices on open edges connect to the nearest vertex of another region
  const edgeCount = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
      const k = a < b ? a * nv + b : b * nv + a;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  const boundary = new Set();
  for (const [k, c] of edgeCount) {
    if (c === 1) {
      boundary.add(Math.floor(k / nv));
      boundary.add(k % nv);
    }
  }
  const P = data.surface || data.positions;
  const cell = 0.012;
  const hash = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < nv; v++) {
    const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    let l = hash.get(k);
    if (!l) hash.set(k, (l = []));
    l.push(v);
  }
  const extra = [];
  for (const v of boundary) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bd = 0.015;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = hash.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!l) continue;
      for (const u of l) {
        if (data.region[u] === data.region[v]) continue;
        const d = Math.hypot(P[u * 3] - x, P[u * 3 + 1] - y, P[u * 3 + 2] - z);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
    }
    if (best >= 0) {
      extra.push(v, best);
      deg[v]++;
      deg[best]++;
    }
  }
  const off = new Uint32Array(nv + 1);
  for (let v = 0; v < nv; v++) off[v + 1] = off[v] + deg[v];
  const nb = new Int32Array(off[nv]).fill(-1);
  const fill = new Uint32Array(nv);
  const put = (a, b) => {
    // skip duplicates
    for (let k = off[a]; k < off[a] + fill[a]; k++) if (nb[k] === b) return;
    nb[off[a] + fill[a]++] = b;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    put(a, b); put(a, c); put(b, a); put(b, c); put(c, a); put(c, b);
  }
  for (let i = 0; i < extra.length; i += 2) {
    put(extra[i], extra[i + 1]);
    put(extra[i + 1], extra[i]);
  }
  return { off, nb, fill };
}

/** Spatial hash over sculpt-space vertex positions for nearest-vertex queries. */
export function buildVertexHash(data, cell = 0.01) {
  const P = data.surface || data.positions;
  const nv = P.length / 3;
  const map = new Map();
  for (let v = 0; v < nv; v++) {
    const k = `${Math.floor(P[v * 3] / cell)},${Math.floor(P[v * 3 + 1] / cell)},${Math.floor(P[v * 3 + 2] / cell)}`;
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(v);
  }
  return {
    cell,
    near(x, y, z, r, max = 8) {
      const out = [];
      const c = Math.ceil(r / cell);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -c; dx <= c; dx++) for (let dy = -c; dy <= c; dy++) for (let dz = -c; dz <= c; dz++) {
        const l = map.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!l) continue;
        for (const v of l) {
          const d = Math.hypot(P[v * 3] - x, P[v * 3 + 1] - y, P[v * 3 + 2] - z);
          if (d <= r) out.push([d, v]);
        }
      }
      out.sort((a, b) => a[0] - b[0]);
      return out.slice(0, max).map((e) => e[1]);
    },
  };
}

export class SkinBlood {
  /**
   * @param humanMesh HumanMesh of the person
   * @param shared { data, adjacency, vhash } shared by all people
   */
  constructor(humanMesh, shared, particles, decals, person) {
    this.hm = humanMesh;
    this.data = shared.data;
    this.adj = shared.adjacency;
    this.vhash = shared.vhash;
    this.particles = particles;
    this.decals = decals;
    this.person = person;
    const nv = this.data.positions.length / 3;
    this.film = humanMesh.blood; // the mesh attribute array
    this.next = new Float32Array(nv);
    this.yStamp = new Uint32Array(nv);
    this.wy = new Float32Array(nv * 3);
    this.stamp = 1;
    this.active = new Set();
    this.emitters = new Map(); // wound -> vertex list
    this.acc = 0;
    this.spurtT = new Map();
  }

  /** World position of vertex v under the current skinning (cached per update). */
  vertexWorld(v) {
    if (this.yStamp[v] === this.stamp) return v * 3;
    const bm = this.hm.skeleton.boneMatrices;
    const P = this.data.positions;
    const si = this.hm.skinIndex, sw = this.hm.skinWeight;
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w <= 0) continue;
      const o = si[v * 4 + k] * 16;
      ox += w * (bm[o] * x + bm[o + 4] * y + bm[o + 8] * z + bm[o + 12]);
      oy += w * (bm[o + 1] * x + bm[o + 5] * y + bm[o + 9] * z + bm[o + 13]);
      oz += w * (bm[o + 2] * x + bm[o + 6] * y + bm[o + 10] * z + bm[o + 14]);
    }
    this.wy[v * 3] = ox;
    this.wy[v * 3 + 1] = oy;
    this.wy[v * 3 + 2] = oz;
    this.yStamp[v] = this.stamp;
    return v * 3;
  }

  emittersFor(w, shape) {
    let list = this.emitters.get(w);
    if (list) return list;
    const seg = w.seg;
    const bindPos = w.body.userData.fragment ? w.body.userData.bindPos : seg.bindPos;
    const pm = shape.localToModel(seg.name, bindPos, w.local, new Vec3());
    w.modelPos = pm;
    list = this.vhash.near(pm.x, pm.y, pm.z, Math.max(w.radius * 1.4, 0.008), 6);
    if (!list.length) list = this.vhash.near(pm.x, pm.y, pm.z, 0.03, 3);
    this.emitters.set(w, list);
    return list;
  }

  update(dt, shape, rng = Math.random) {
    const injury = this.person.injury;
    this.acc += dt;
    // skin film (20 Hz)
    if (this.acc < 0.05) return;
    const h = this.acc;
    this.acc = 0;
    this.stamp++;
    this.hm.skeleton.update();
    const film = this.film;
    const wound = injury.wounds;
    for (const w of wound) {
      const ext = w.extNow || 0;
      if (ext <= 0) continue;
      const list = this.emittersFor(w, shape);
      if (!list.length) continue;
      const units = (ext * h) / UNIT_ML;
      // arterial wounds spurt with each heartbeat; heavy flow overflows as a stream of drips
      const wp = w.body.localToWorld(w.local, new Vec3());
      const n = w.body.localDirToWorld(w.normal, new Vec3());
      if (w.arterial && ext > 2.5 && injury.hr > 20 && !w.pressure) {
        const beat = Math.floor(w.spurtPhase);
        if (this.spurtT.get(w) !== beat) {
          this.spurtT.set(w, beat);
          const vol = ext / Math.max(injury.hr / 60, 0.5);
          const sp = 1.2 + Math.min(ext / 10, 2.2);
          this.particles.spray(wp, n, Math.min(6 + Math.round(vol * 2), 26), sp, 0.35, 0.0012, 0.0032, 0, vol / 14, rng);
        }
        for (const v of list) {
          film[v] = Math.max(film[v], 1.4);
          this.active.add(v);
        }
        continue;
      }
      const per = units / list.length;
      for (const v of list) {
        film[v] += per;
        this.active.add(v);
      }
      // more than the skin can carry away: it pours off the wound
      if (ext > 4 && rng() < h * ext * 0.4) {
        this.particles.emit(wp.x + n.x * 0.01, wp.y + n.y * 0.01, wp.z + n.z * 0.01, n.x * 0.3, n.y * 0.3 - 0.1, n.z * 0.3, 0.0022, 0.3, 0);
      }
    }
    // downhill flow on the current pose (double-buffered: blood moves at most one vertex per tick)
    const { off, nb } = this.adj;
    const next = this.next;
    const act = [...this.active];
    for (const v of act) next[v] = film[v];
    for (const v of act) {
      const b = film[v];
      if (b <= RETAIN) continue;
      const pv = this.vertexWorld(v);
      const yv = this.wy[pv + 1];
      // reached the floor: soaks into the pool
      if (yv < (this.particles.floorAt ? this.particles.floorAt(this.wy[pv], this.wy[pv + 2], yv + 0.3) : 0) + 0.018) {
        const ml = (b - RETAIN) * UNIT_ML;
        next[v] -= b - RETAIN;
        this.decals.addPoolVolume(this.wy[pv], this.wy[pv + 2], ml * 1.0);
        continue;
      }
      let best = -1, by = yv - 0.0003;
      for (let k = off[v]; k < off[v + 1]; k++) {
        const u = nb[k];
        if (u < 0) break;
        const pu = this.vertexWorld(u);
        const yu = this.wy[pu + 1];
        if (yu < by) {
          by = yu;
          best = u;
        }
      }
      const excess = b - RETAIN;
      if (best >= 0) {
        // steeper slopes run faster
        const amt = excess * Math.min(0.85, 0.35 + (yv - by) * 60);
        next[v] -= amt;
        if (this.active.has(best)) next[best] += amt;
        else {
          next[best] = film[best] + amt;
          this.active.add(best);
        }
      } else if (b > DRIP) {
        // a hanging drop forms at the low point and falls
        const ml = (b - RETAIN) * UNIT_ML;
        next[v] -= b - RETAIN;
        this.particles.emit(this.wy[pv], this.wy[pv + 1] - 0.003, this.wy[pv + 2], 0, -0.05, 0, 0.0024, ml, 0);
      }
    }
    for (const v of this.active) {
      film[v] = next[v];
      // a settled stain no longer needs simulating
      if (film[v] <= RETAIN + 0.01) this.active.delete(v);
    }
    this.hm.bloodDirty = true;
  }
}
