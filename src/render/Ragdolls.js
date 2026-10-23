// Ragdolls for fallen soldiers (the physics of one body is in RagdollBody.js).
// Bodies take the impulse of the killing shot or blast, are tossed again by
// later blasts, pile on one another and fall asleep once still. Limbs torn off
// by a blast become separate pieces. Soldiers who are down but alive writhe
// until they die or are treated. Parts are drawn as instanced meshes built
// from the soldier's primitives.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEVER } from '../sim/damage.js';
import { Ragdoll, STEP, HIP_L, HIP_R, SH_L, SH_R, NECK, HEAD, EL_L, HA_L, EL_R, HA_R, KN_L, FT_L, KN_R, FT_R, L_UA, L_FA, L_TH, L_SH, P_TORSO, P_HEAD, P_UARM, P_FARM, P_THIGH, P_SHIN, P_WEAPON, NTYPES } from './RagdollBody.js';
import { box, taper, limb, ball, dome, V, weaponShapes, ROLE_WEAPON, makeRagdollMaterial, M_UNIFORM, M_GEAR, M_SKIN, M_HELMET, M_BOOT } from './InfantryRenderer.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();

// Limbs: [mask, part index, joint it is torn from, parts that go with it].
const CUTS = [
  [SEVER.ARM_L, 2, SH_L, [2, 3]],
  [SEVER.FORE_L, 3, EL_L, [3]],
  [SEVER.ARM_R, 4, SH_R, [4, 5]],
  [SEVER.FORE_R, 5, EL_R, [5]],
  [SEVER.LEG_L, 6, HIP_L, [6, 7]],
  [SEVER.SHIN_L, 7, KN_L, [7]],
  [SEVER.LEG_R, 8, HIP_R, [8, 9]],
  [SEVER.SHIN_R, 9, KN_R, [9]],
];

const MAX_BODIES = 6000;
const MAX_AWAKE = 110;
const CREATE_RANGE = 450;
const DRAW_RANGE = 650;
const NEAR_RANGE = 110;
const CELL = 4;

// ----------------------------------------------------------------- geometry

function partGeometry(type, lod) {
  const s = lod === 0 ? 7 : 4;
  const parts = [];
  if (type === P_TORSO) {
    // Local origin at the pelvis centre (model y 0.93).
    parts.push(box(0.34, 0.2, 0.22, 0, 0.02, 0, 0, M_UNIFORM));
    parts.push(box(0.37, 0.06, 0.25, 0, 0.1, 0, 0, M_GEAR));
    parts.push(taper(0.33, 0.21, 0.41, 0.24, 0.07, 0.54, 0, 0, 1, M_UNIFORM));
    parts.push(box(0.39, 0.34, 0.3, 0, 0.34, 0, 1, M_GEAR));
    if (lod === 0) {
      parts.push(box(0.09, 0.11, 0.06, -0.12, 0.22, 0.17, 1, M_GEAR));
      parts.push(box(0.09, 0.11, 0.06, 0, 0.22, 0.17, 1, M_GEAR));
      parts.push(box(0.09, 0.11, 0.06, 0.12, 0.22, 0.17, 1, M_GEAR));
    }
    parts.push(box(0.3, 0.4, 0.17, 0, 0.35, -0.22, 1, M_GEAR));
    parts.push(ball(0.062, 0.2, 0.49, 0, 0, 1, M_UNIFORM));
    parts.push(ball(0.062, -0.2, 0.49, 0, 0, 1, M_UNIFORM));
  } else if (type === P_HEAD) {
    // Origin at the base of the neck.
    parts.push(limb(V(0, 0, 0), V(0, 0.1, 0.01), 0.052, 0.048, 6, 1, M_SKIN));
    parts.push(ball(0.105, 0, 0.185, 0.012, lod === 0 ? 1 : 0, 1, M_SKIN, 1.08));
    parts.push(dome(0.132, 0, 0.205, 0, 1, M_HELMET, lod === 0 ? 10 : 6));
    if (lod === 0) parts.push(box(0.09, 0.03, 0.03, 0, 0.305, 0.11, 1, M_BOOT));
  } else if (type === P_UARM) {
    // Limbs hang down -Y from the joint at the origin.
    parts.push(limb(V(0, 0, 0), V(0, -L_UA, 0), 0.058, 0.05, s, 2, M_UNIFORM));
  } else if (type === P_FARM) {
    parts.push(limb(V(0, 0, 0), V(0, -L_FA + 0.04, 0), 0.05, 0.043, s, 2, M_UNIFORM));
    parts.push(ball(0.048, 0, -L_FA + 0.01, 0, 0, 2, M_BOOT));
  } else if (type === P_THIGH) {
    parts.push(limb(V(0, 0, 0), V(0, -L_TH, 0), 0.088, 0.068, s, 3, M_UNIFORM));
  } else if (type === P_SHIN) {
    parts.push(limb(V(0, 0, 0), V(0, -L_SH + 0.03, 0), 0.062, 0.05, s, 4, M_UNIFORM));
    if (lod === 0) parts.push(box(0.11, 0.1, 0.06, 0, 0, 0.055, 4, M_GEAR));
    parts.push(box(0.11, 0.12, 0.27, 0, -L_SH + 0.02, 0.045, 4, M_BOOT));
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

// Weapon geometry centred on its middle with the barrel along +Z; returns
// the model-space centre and length too.
function weaponGeometry(v) {
  const g = mergeGeometries(weaponShapes(v, 0), false);
  g.computeBoundingBox();
  const b = g.boundingBox;
  const c = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  return { geo: g, center: c, len: Math.max(0.15, b.max.z - b.min.z) };
}

// Instanced part meshes with a per-instance seed/blood attribute.
class PartBatch {
  constructor(scene, geo, material, shadows) {
    this.scene = scene;
    this.geo = geo;
    this.material = material;
    this.shadows = shadows;
    this.mesh = null;
    this.capacity = 0;
    this.count = 0;
    this.alloc(64);
  }

  alloc(n) {
    const old = this.mesh;
    const geo = this.geo.clone();
    this.rag = new Float32Array(n * 2);
    this.aRag = new THREE.InstancedBufferAttribute(this.rag, 2);
    this.aRag.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRag', this.aRag);
    const m = new THREE.InstancedMesh(geo, this.material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = this.shadows;
    m.receiveShadow = this.shadows;
    m.count = 0;
    if (old) {
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      this.rag.set(old.geometry.getAttribute('aRag').array.subarray(0, this.count * 2));
      this.scene.remove(old);
      old.geometry.dispose();
      old.dispose();
    }
    this.mesh = m;
    this.capacity = n;
    this.scene.add(m);
  }

  push(mats, off, seed, blood) {
    if (this.count >= this.capacity) this.alloc(this.capacity * 2);
    const i = this.count++;
    this.mesh.instanceMatrix.array.set(mats.subarray(off, off + 16), i * 16);
    this.rag[i * 2] = seed;
    this.rag[i * 2 + 1] = blood;
  }

  end() {
    const n = this.count;
    this.mesh.count = n;
    if (n) {
      for (const a of [this.mesh.instanceMatrix, this.aRag]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.count = 0;
  }
}

const _sphere = new THREE.Sphere();

// ----------------------------------------------------------------- system

export class RagdollSystem {
  constructor(scene, world, quality, gore = null) {
    this.scene = scene;
    this.world = world;
    this.terrain = world.terrain;
    this.gore = gore;
    this.goreOn = true;
    this.bodies = [];
    this.grid = new Map();
    this.gridT = 0;
    this.acc = 0;
    this.cam = new THREE.Vector3();
    const shadows = !!quality.shadows;
    // Batches: [faction][lod][part type].
    const geos = [0, 1].map((lod) => Array.from({ length: NTYPES }, (_, t) => partGeometry(t, lod)));
    this.batches = [0, 1].map((f) => {
      const mat = makeRagdollMaterial(f);
      return [0, 1].map((lod) => geos[lod].map((g) => new PartBatch(scene, g, mat, shadows && lod === 0)));
    });
    // Dropped weapons.
    this.weapons = [];
    this.weaponBatches = [];
    const wmat = makeRagdollMaterial(0);
    for (let v = 0; v < 6; v++) {
      const w = weaponGeometry(v);
      this.weapons.push(w);
      this.weaponBatches.push(new PartBatch(scene, w.geo, wmat, shadows));
    }
    // Wound stumps.
    this.stumpMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), new THREE.MeshLambertMaterial({ color: 0x3a0605 }), 256);
    this.stumpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stumpMesh.frustumCulled = false;
    this.stumpMesh.count = 0;
    scene.add(this.stumpMesh);
    this.stumpM = new THREE.Matrix4();
  }

  setGore(on) {
    this.goreOn = on;
  }

  handle(events) {
    for (const e of events) {
      if (e.t === 'death' || e.t === 'downed') {
        const u = e.unit;
        if (u.cat !== 'inf') continue;
        if (u._rd) {
          u._rd.dead = e.t === 'death';
          continue;
        }
        // A soldier who went down out of range keeps the simple fallen pose.
        if (e.t === 'death' && u.downed) continue;
        this.create(u, e.hit, e.t === 'death');
      } else if (e.t === 'explosion' && !e.air) {
        const r = (e.radius || 4) * 1.6;
        for (const b of this.bodies) {
          if (Math.abs(b.cx - e.x) > r || Math.abs(b.cz - e.z) > r) continue;
          b.gatherStructs(this.world);
          b.blast(e.x, e.y, e.z, e.radius || 4, e.ex ? e.ex.damage : 150);
        }
      } else if (e.t === 'stabilized' && e.unit._rd) {
        e.unit._rd.stable = true;
      }
    }
  }

  create(u, hit, dead) {
    if (u.mounted || u.removed || u.hidden || u.para || u.climb) return;
    const dx = u.pos.x - this.cam.x;
    const dz = u.pos.z - this.cam.z;
    if (dx * dx + dz * dz > CREATE_RANGE * CREATE_RANGE) return;
    const v = ROLE_WEAPON[u.def.role] ?? 0;
    const b = new Ragdoll(u, v, this.weapons[v]);
    b.dead = dead;
    b.build(u);
    b.gatherStructs(this.world);
    b.rest(this.terrain);
    // Moving bodies keep their momentum.
    for (let i = 0; i < b.np; i++) b.push(i, u.vel.x, 0, u.vel.z);
    const gore = this.goreOn && this.gore;
    let severed = 0;
    if (this.goreOn && u.severed) {
      for (const [mask, part, joint, gibs] of CUTS) {
        if (u.severed & mask && !gibs.some((g) => b.parts[g].gib)) {
          b.cut(part, joint, gibs);
          severed++;
        }
      }
    }
    if (hit && hit.blast) {
      const B = hit.blast;
      b.blast(B.x, B.y, B.z, B.r, B.power, severed > 0);
      b.parts[0].blood = severed ? 0.7 : 0.35;
      if (gore && severed) this.gore.burst(b.p[NECK * 3], b.p[NECK * 3 + 1] - 0.3, b.p[NECK * 3 + 2], severed);
    } else if (hit) {
      // A bullet: the struck part takes the push, the legs give way.
      const tgt = hit.part === 'head' ? [[HEAD, 1], [NECK, 0.5]] : hit.part === 'legs' ? [[KN_L, 1], [KN_R, 1], [HIP_L, 0.4], [HIP_R, 0.4]] : [[SH_L, 0.8], [SH_R, 0.8], [NECK, 0.7], [HIP_L, 0.3], [HIP_R, 0.3]];
      for (const [i, k] of tgt) b.push(i, hit.dx * hit.v * k, hit.dy * hit.v * k * 0.5, hit.dz * hit.v * k);
      this.buckle(b, u, 0.9);
      if (hit.part === 'head') b.parts[1].blood = 0.3;
      else if (hit.part === 'torso') b.parts[0].blood = 0.3;
      else b.parts[6].blood = b.parts[8].blood = 0.35;
    } else {
      this.buckle(b, u, 1.1);
    }
    if (severed && !hit?.blast) b.blast(u.pos.x, u.pos.y + 0.6, u.pos.z, 3, 120, true);
    if (!dead) b.parts[0].blood = Math.max(b.parts[0].blood, 0.3);
    u._rd = b;
    this.bodies.push(b);
    if (this.bodies.length > MAX_BODIES) {
      const old = this.bodies.shift();
      old.u._rd = null;
    }
  }

  // Knees fold and the body drops: a small forward push on the knees, a
  // random sideways sway on the shoulders.
  buckle(b, u, k) {
    const fx = Math.sin(u.yaw);
    const fz = Math.cos(u.yaw);
    b.push(KN_L, fx * k, -0.3, fz * k);
    b.push(KN_R, fx * k * rr(0.6, 1.1), -0.3, fz * k * rr(0.6, 1.1));
    const sx = rr(-0.8, 0.8);
    const sz = rr(-0.8, 0.8);
    b.push(SH_L, sx, 0, sz);
    b.push(SH_R, sx, 0, sz);
  }

  update(dt, camera, frustum) {
    this.cam.copy(camera.position);
    const terrain = this.terrain;
    // Fixed-step physics for awake bodies (bounded per frame).
    this.acc = Math.min(this.acc + dt, STEP * 3);
    let awake = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.u.removed) {
        b.u._rd = null;
        this.bodies.splice(i, 1);
        continue;
      }
      b.age += dt;
      // Wounded who are still alive writhe now and then.
      if (!b.dead && b.u.alive) {
        b.writheT -= dt;
        if (b.writheT <= 0) {
          b.writheT = b.stable ? rr(3, 7) : rr(0.7, 2.2);
          const k = b.stable ? 0.5 : 1;
          const j = [HA_L, HA_R, FT_L, FT_R, HEAD, KN_L, KN_R][(rand() * 7) | 0];
          b.push(j, rr(-0.8, 0.8) * k, rr(0.8, 1.8) * k, rr(-0.8, 0.8) * k);
        }
      } else if (!b.u.alive) b.dead = true;
      if (!b.sleeping) awake++;
    }
    let steps = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      steps++;
    }
    if (steps && awake) {
      this.gridT -= dt;
      if (this.gridT <= 0) {
        this.gridT = 0.4;
        this.rebuildGrid();
      }
      let n = 0;
      for (const b of this.bodies) {
        if (b.sleeping) continue;
        // Too many bodies moving at once: the oldest settle immediately.
        if (awake - n > MAX_AWAKE && b.age > 1.5) {
          b.sleeping = true;
          n++;
          continue;
        }
        if (b.age >= b.nbrT) {
          b.nbrT = b.age + 0.4;
          this.neighbours(b);
        }
        for (let s = 0; s < steps; s++) b.step(terrain);
      }
    }
    // Blood: pools under bodies, spurting stumps.
    if (this.goreOn && this.gore) this.bleed(dt);
    this.draw(frustum);
  }

  // Bodies by 4 m cell, for bodies landing on one another.
  rebuildGrid() {
    const g = this.grid;
    g.clear();
    for (const b of this.bodies) {
      const key = cellKey(Math.floor(b.cx / CELL), Math.floor(b.cz / CELL));
      const list = g.get(key);
      if (list) list.push(b);
      else g.set(key, [b]);
    }
  }

  neighbours(b) {
    b.nbrs.length = 0;
    const cx = Math.floor(b.cx / CELL);
    const cz = Math.floor(b.cz / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.grid.get(cellKey(cx + i, cz + j));
        if (!list) continue;
        for (const q of list) {
          if (q === b || q.u.removed) continue;
          const r = q.radius + b.radius + 1;
          if ((q.cx - b.cx) ** 2 + (q.cz - b.cz) ** 2 < r * r) b.nbrs.push(q);
        }
      }
    }
  }

  bleed(dt) {
    const gore = this.gore;
    for (const b of this.bodies) {
      const d2 = (b.cx - this.cam.x) ** 2 + (b.cz - this.cam.z) ** 2;
      if (d2 > 300 * 300) continue;
      if (!b.pooled && (b.sleeping || b.age > 2.5)) {
        b.pooled = true;
        const big = b.stumps.length > 0 ? 0.6 : 0;
        gore.pool(b.cx, b.floor[HIP_L], b.cz, rr(0.8, 1.4) + big + (b.dead ? 0 : 0.5), rr(10, 22));
        for (const s of b.stumps) if (!s.body) gore.pool(b.p[s.i * 3], b.floor[s.i], b.p[s.i * 3 + 2], rr(0.3, 0.6), rr(4, 8));
      }
      if (b.age < 6 && d2 < 150 * 150) {
        for (const s of b.stumps) {
          if (!s.body || rand() > dt * 14) continue;
          const k = s.i * 3;
          const j = s.out * 3;
          const ox = b.p[k] - b.cx;
          const oz = b.p[k + 2] - b.cz;
          const ol = Math.hypot(ox, oz) || 1;
          const pulse = (0.55 + 0.45 * Math.sin(b.age * 9)) * (1 - b.age / 6);
          gore.spurt(b.p[k], b.p[k + 1], b.p[k + 2], (ox / ol) * 1.5 * pulse, 1.2 * pulse + 0.4, (oz / ol) * 1.5 * pulse, pulse);
          void j;
        }
      }
    }
  }

  draw(frustum) {
    const cam = this.cam;
    let stumps = 0;
    const sm = this.stumpMesh;
    for (const b of this.bodies) {
      if (b.dirty) b.computeMatrices();
      const dx = b.cx - cam.x;
      const dy = b.cy - cam.y;
      const dz = b.cz - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > DRAW_RANGE * DRAW_RANGE) continue;
      _sphere.center.set(b.cx, b.cy, b.cz);
      _sphere.radius = b.radius;
      if (!frustum.intersectsSphere(_sphere)) continue;
      const lod = d2 < NEAR_RANGE * NEAR_RANGE ? 0 : 1;
      const batch = this.batches[b.faction][lod];
      for (let i = 0; i < b.parts.length; i++) {
        const part = b.parts[i];
        if (part.type === P_WEAPON) {
          if (lod === 0) this.weaponBatches[b.variant].push(b.mats, i * 16, 0, 0);
        } else batch[part.type].push(b.mats, i * 16, b.seed, this.goreOn ? part.blood : 0);
      }
      if (this.goreOn && lod === 0 && stumps < 256) {
        for (const s of b.stumps) {
          if (stumps >= 256) break;
          const k = s.i * 3;
          this.stumpM.makeTranslation(b.p[k], b.p[k + 1], b.p[k + 2]);
          sm.setMatrixAt(stumps++, this.stumpM);
        }
      }
    }
    for (const f of this.batches) for (const l of f) for (const pb of l) pb.end();
    for (const wb of this.weaponBatches) wb.end();
    sm.count = stumps;
    if (stumps) sm.instanceMatrix.needsUpdate = true;
  }
}

function cellKey(i, j) {
  return (i + 32768) * 65536 + (j + 32768);
}
