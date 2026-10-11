// Gore (zombie survival): bodies that stay, gibs, head pops.
//  - a dead zombie's ragdoll, once it has settled, is "baked": its skinned pose is copied
//    into a few big static meshes (one draw call per batch, nothing to animate), so the
//    floor can stay covered in bodies for the whole game at almost no cost
//  - explosions and overkill tear a body into its real limbs (the mesh split by bone:
//    head, chest, belly, upper / lower arms, thighs, shins) plus meat chunks; they fly,
//    tumble, bleed, splat where they hit and are baked in place once they come to rest
//  - corpses can be shot or blown up into gibs; a big headshot pops the head off
//  - blood decals stay too (bigger pools in blood.js)
import * as THREE from 'three';
import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { BONE_DEFS } from '../assets/pm/rig.js';
import { getSkinTexture } from '../assets/pm/skins.js';
import { lightCurve } from '../map/meshbuilder.js';

const tr = new TraceResult();
const rnd = (a, b) => a + Math.random() * (b - a);
const BATCH_VERTS = 60000;
const MAX_BATCHES = 14; // ~70 bodies a batch; the oldest batch goes when this many are full
const MAX_GIBS = 240;
const GRAVITY = 800;

// which piece each bone's vertices belong to when a body comes apart
const PIECE_OF = {
  root: 'belly', pelvis: 'belly', spine: 'belly', chest: 'chest', neck: 'head', head: 'head',
  upperarm_r: 'uarm_r', forearm_r: 'farm_r', hand_r: 'farm_r', upperarm_l: 'uarm_l', forearm_l: 'farm_l', hand_l: 'farm_l',
  thigh_r: 'thigh_r', shin_r: 'shin_r', foot_r: 'shin_r', thigh_l: 'thigh_l', shin_l: 'shin_l', foot_l: 'shin_l',
};
const BONE_PIECE = BONE_DEFS.map(([n]) => PIECE_OF[n]);
const PIECES = ['head', 'chest', 'belly', 'uarm_r', 'farm_r', 'uarm_l', 'farm_l', 'thigh_r', 'shin_r', 'thigh_l', 'shin_l'];
const PIECE_ID = Object.fromEntries(PIECES.map((p, i) => [p, i]));
const SPHERE_R = { head: 5, chest: 9, belly: 8, uarm_r: 4, farm_r: 4, uarm_l: 4, farm_l: 4, thigh_r: 5, shin_r: 4.5, thigh_l: 5, shin_l: 4.5 };

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vC;
void main() {
  vUv = uv;
  vC = color;
  #include <begin_vertex>
  #include <project_vertex>
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vC;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(t.rgb * vC, 1.0);
  #include <fog_fragment>
}`;

let meatTex = null;
function meatTexture() {
  if (meatTex) return meatTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#6a0e0a'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = ['#9a1a12', '#3a0604', '#c8a090', '#802018'][i % 4];
    g.globalAlpha = 0.5;
    g.fillRect(Math.random() * 32, Math.random() * 32, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  meatTex = new THREE.CanvasTexture(c);
  meatTex.colorSpace = THREE.NoColorSpace;
  return meatTex;
}

/** One big static mesh of baked bodies / gibs sharing a texture. */
class CorpseBatch {
  constructor(parent, material, key) {
    this.key = key;
    this.pos = new Float32Array(BATCH_VERTS * 3);
    this.uv = new Float32Array(BATCH_VERTS * 2);
    this.col = new Float32Array(BATCH_VERTS * 3);
    this.bone = new Uint8Array(BATCH_VERTS);
    this.idx = new Uint32Array(BATCH_VERTS * 3);
    this.nv = 0;
    this.ni = 0;
    const g = new THREE.BufferGeometry();
    this.attrs = [['position', this.pos, 3], ['uv', this.uv, 2], ['color', this.col, 3]].map(([n, a, k]) => {
      const at = new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(n, at);
      return at;
    });
    this.index = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.index);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'corpses_' + key;
    parent.add(this.mesh);
  }

  room(nv, ni) { return this.nv + nv <= BATCH_VERTS && this.ni + ni <= BATCH_VERTS * 3; }

  /** Append (positions in world GS space). Returns a slot { v0, nv, i0, ni }. */
  add(pos, uv, col, bone, idx) {
    const nv = pos.length / 3, ni = idx.length;
    const v0 = this.nv, i0 = this.ni;
    this.pos.set(pos, v0 * 3);
    this.uv.set(uv, v0 * 2);
    this.col.set(col, v0 * 3);
    if (bone) this.bone.set(bone, v0);
    for (let i = 0; i < ni; i++) this.idx[i0 + i] = idx[i] + v0;
    this.nv += nv;
    this.ni += ni;
    this.attrs[0].addUpdateRange(v0 * 3, nv * 3);
    this.attrs[1].addUpdateRange(v0 * 2, nv * 2);
    this.attrs[2].addUpdateRange(v0 * 3, nv * 3);
    for (const a of this.attrs) a.needsUpdate = true;
    this.index.addUpdateRange(i0, ni);
    this.index.needsUpdate = true;
    this.geometry.setDrawRange(0, this.ni);
    return { v0, nv, i0, ni };
  }

  /** Read a slot back (to blow a baked body apart). */
  read(s) {
    const idx = new Uint32Array(s.ni);
    for (let i = 0; i < s.ni; i++) idx[i] = this.idx[s.i0 + i] - s.v0;
    return {
      pos: this.pos.slice(s.v0 * 3, (s.v0 + s.nv) * 3), uv: this.uv.slice(s.v0 * 2, (s.v0 + s.nv) * 2),
      col: this.col.slice(s.v0 * 3, (s.v0 + s.nv) * 3), bone: this.bone.slice(s.v0, s.v0 + s.nv), idx,
    };
  }

  /** Hide a slot (its triangles collapse to nothing). */
  remove(s) {
    for (let i = 0; i < s.ni; i++) this.idx[s.i0 + i] = s.v0;
    this.index.addUpdateRange(s.i0, s.ni);
    this.index.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();

export class Gore {
  constructor(game) {
    this.game = game;
    this.enabled = typeof document !== 'undefined';
    this.group = new THREE.Group();
    this.group.name = 'gore';
    game.effects.group.add(this.group);
    this.materials = new Map();
    this.batches = []; // in creation order
    this.records = []; // baked whole bodies: { batch, slot, skin, center, spheres, hp }
    this.gibs = [];
    this.fountains = [];
  }

  clear() {
    for (const b of this.batches) b.dispose();
    this.batches = [];
    this.records = [];
    for (const gb of this.gibs) { gb.mesh.removeFromParent(); gb.mesh.geometry.dispose(); }
    this.gibs = [];
    this.fountains = [];
  }

  material(key) {
    let m = this.materials.get(key);
    if (m) return m;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    uniforms.map = { value: key === 'meat' ? meatTexture() : getSkinTexture(key) };
    m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, fog: true });
    m.name = 'corpse_' + key;
    this.materials.set(key, m);
    return m;
  }

  batchFor(key, nv, ni) {
    for (let i = this.batches.length - 1; i >= 0; i--) {
      const b = this.batches[i];
      if (b.key === key && b.room(nv, ni)) return b;
    }
    if (this.batches.length >= MAX_BATCHES) {
      const old = this.batches.shift();
      this.records = this.records.filter((r) => r.batch !== old);
      old.dispose();
    }
    const b = new CorpseBatch(this.group, this.material(key), key);
    this.batches.push(b);
    return b;
  }

  // ---------------------------------------------------------------- snapshots
  /** The model's current skinned pose in world (GS) space, per-vertex light and dominant bone. */
  snapshot(model, light = null) {
    const mesh = model.mesh, geo = mesh.geometry;
    model.object3D.updateMatrixWorld(true);
    const world = this.game.renderer.world;
    _inv.copy(world.matrixWorld).invert();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    const n = geo.attributes.position.count;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, _v);
      _v.applyMatrix4(_m);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    }
    const si = geo.attributes.skinIndex.array, sw = geo.attributes.skinWeight.array;
    const bone = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let b = 0, w = -1;
      for (let k = 0; k < 4; k++) if (sw[i * 4 + k] > w) { w = sw[i * 4 + k]; b = si[i * 4 + k]; }
      bone[i] = b;
    }
    const g0 = geo.groups.find((gr) => gr.materialIndex === 0);
    const all = geo.index.array;
    const idx = g0 ? all.slice(g0.start, g0.start + g0.count) : all.slice();
    const uv = geo.attributes.uv.array.slice(0, n * 2);
    const col = this.shade(pos, idx, light || this.lightFor(pos), model.material.uniforms.uChar?.value || 0);
    return { pos, uv, bone, idx, col };
  }

  /** Baked lighting at the body's position (GoldSrc model lighting, like updateModels). */
  lightFor(pos) {
    const n = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i += 7) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
    const k = Math.ceil(n / 7);
    const l = this.game.W.sampler.sample([cx / k, cy / k, cz / k + 8], [0, 0, 0]).map(lightCurve);
    return l;
  }

  /** Per-vertex colour: ambient + sun on the flat normal, darkened if charred. */
  shade(pos, idx, l, char) {
    const n = pos.length / 3;
    const nrm = new Float32Array(n * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
    }
    const sun = this.game.W.lighting?.sunDir || [0.4, 0.3, 0.86];
    const col = new Float32Array(n * 3);
    const ch = 1 - char * 0.84;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const len = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
      const d = Math.max(0, (nrm[o] * sun[0] + nrm[o + 1] * sun[1] + nrm[o + 2] * sun[2]) / len);
      for (let k = 0; k < 3; k++) col[o + k] = Math.min(1.4, (l[k] * 0.62 + 0.12 + l[k] * 0.36 * d) * ch);
    }
    return col;
  }

  /** Centres of the body's pieces (for hit tests), from a snapshot. */
  spheres(s, scale = 1) {
    const acc = PIECES.map(() => [0, 0, 0, 0]);
    const n = s.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = acc[PIECE_ID[BONE_PIECE[s.bone[i]]]];
      a[0] += s.pos[i * 3]; a[1] += s.pos[i * 3 + 1]; a[2] += s.pos[i * 3 + 2]; a[3]++;
    }
    const out = [];
    acc.forEach((a, i) => { if (a[3] > 2) out.push([a[0] / a[3], a[1] / a[3], a[2] / a[3], SPHERE_R[PIECES[i]] * scale]); });
    return out;
  }

  // ---------------------------------------------------------------- baking
  /** Make a dead zombie's body permanent (its model is then free for the next zombie). */
  bakePlayer(p) {
    if (!this.enabled || p.baked || p.gibbed || !p.model) return;
    p.baked = true;
    const s = this.snapshot(p.model);
    const skin = p.model.skin;
    const b = this.batchFor(skin, s.pos.length / 3, s.idx.length);
    const slot = b.add(s.pos, s.uv, s.col, s.bone, s.idx);
    const sph = this.spheres(s, p.boss ? p.boss.scale : 1);
    const c = sph.length ? sph.reduce((a, q) => [a[0] + q[0] / sph.length, a[1] + q[1] / sph.length, a[2] + q[2] / sph.length], [0, 0, 0]) : p.pm.origin.slice();
    this.records.push({ batch: b, slot, skin, center: c, spheres: sph, hp: p.boss ? 400 : 70, scale: p.boss ? p.boss.scale : 1 });
    p.model.object3D.visible = false;
  }

  /** Dead zombies whose bodies have settled get baked (called every frame). */
  bakeSettled(list) {
    const t = this.game.time;
    for (const p of list) {
      if (p.alive || p.baked || p.gibbed || !p.deathTime || !p.model) continue;
      const age = t - p.deathTime;
      const rd = p.model.ragdoll;
      if (p.isBoss ? age > 4.5 : (age > 2.5 && !(rd && rd.awake)) || age > 12) this.bakePlayer(p);
    }
  }

  // ---------------------------------------------------------------- gibs
  /** Split a snapshot into flying pieces. dir: blast direction; power ~ 0.5..2. only: piece name to take alone. */
  burst(s, skin, origin, dir, power = 1, only = null) {
    const g = this.game;
    const groups = PIECES.map(() => []);
    for (let t = 0; t < s.idx.length; t += 3) {
      const pc = PIECE_ID[BONE_PIECE[s.bone[s.idx[t]]]];
      groups[pc].push(s.idx[t], s.idx[t + 1], s.idx[t + 2]);
    }
    const made = [];
    groups.forEach((tris, pi) => {
      if (!tris.length || (only && PIECES[pi] !== only)) return;
      const map = new Map();
      const P = [], U = [], C = [], I = [];
      for (const vi of tris) {
        let k = map.get(vi);
        if (k === undefined) {
          k = map.size;
          map.set(vi, k);
          P.push(s.pos[vi * 3], s.pos[vi * 3 + 1], s.pos[vi * 3 + 2]);
          U.push(s.uv[vi * 2], s.uv[vi * 2 + 1]);
          C.push(s.col[vi * 3], s.col[vi * 3 + 1], s.col[vi * 3 + 2]);
        }
        I.push(k);
      }
      let cx = 0, cy = 0, cz = 0;
      const nv = P.length / 3;
      for (let i = 0; i < nv; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
      cx /= nv; cy /= nv; cz /= nv;
      for (let i = 0; i < nv; i++) { P[i * 3] -= cx; P[i * 3 + 1] -= cy; P[i * 3 + 2] -= cz; }
      made.push(this.spawnGib(skin, [cx, cy, cz], new Float32Array(P), new Float32Array(U), new Float32Array(C), I, origin, dir, power, PIECES[pi]));
    });
    // meat chunks and a big burst of blood
    if (!only) {
      const c = origin;
      for (let i = 0; i < Math.round(5 + power * 4); i++) this.meat([c[0] + rnd(-8, 8), c[1] + rnd(-8, 8), c[2] + rnd(-10, 20)], dir, power);
      const fx = g.effects;
      fx.blood?.([c[0], c[1], c[2] + 10], [dir[0], dir[1], Math.max(0.3, dir[2])], 120, { blast: true });
      fx.blood?.([c[0], c[1], c[2] + 20], [-dir[0], -dir[1], 0.6], 90, { blast: true });
      const B = fx.bloodFx;
      if (B) for (let i = 0; i < 26; i++) B.droplet([c[0] + rnd(-10, 10), c[1] + rnd(-10, 10), c[2] + rnd(0, 30)], [rnd(-1, 1) * 380 + dir[0] * 200, rnd(-1, 1) * 380 + dir[1] * 200, rnd(120, 520)], rnd(1.4, 2.6));
      B?.puddle([c[0], c[1], c[2]], { delay: 0.2, radius: rnd(34, 48) });
      g.sound?.play('gib', { pos: c, volume: 1 });
    }
    return made;
  }

  spawnGib(skin, at, P, U, C, I, origin, dir, power, piece) {
    if (this.gibs.length >= MAX_GIBS) this.settle(this.gibs[0], true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(I);
    const mesh = new THREE.Mesh(geo, this.material(skin));
    mesh.position.set(at[0], at[1], at[2]);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // away from the blast centre (and along it), plenty of up
    let ax = at[0] - origin[0], ay = at[1] - origin[1], az = at[2] - origin[2];
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    const sp = rnd(180, 420) * power;
    const vel = [ax * sp * 0.6 + dir[0] * sp * 0.6 + rnd(-90, 90), ay * sp * 0.6 + dir[1] * sp * 0.6 + rnd(-90, 90), Math.abs(az) * sp * 0.3 + rnd(160, 380) * Math.min(1.6, power)];
    const w = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)];
    const wl = Math.hypot(...w) || 1;
    const spin = rnd(6, 16) * (piece === 'chest' || piece === 'belly' ? 0.5 : 1);
    const gb = {
      mesh, skin, pos: at.slice(), vel, w: [w[0] / wl * spin, w[1] / wl * spin, w[2] / wl * spin], rest: 0, bounces: 0,
      bleedUntil: this.game.time + rnd(1.2, 2.5), nextDrop: 0, piece, size: piece === 'chest' || piece === 'belly' ? 6 : 3.5,
    };
    this.gibs.push(gb);
    return gb;
  }

  meat(at, dir, power) {
    const geo = new THREE.BoxGeometry(rnd(1.5, 3.5), rnd(1.5, 3), rnd(1.5, 3.5)).toNonIndexed();
    const n = geo.attributes.position.count;
    const C = new Float32Array(n * 3);
    const l = this.lightFor([at[0], at[1], at[2]]);
    for (let i = 0; i < n; i++) { C[i * 3] = l[0] * 0.9; C[i * 3 + 1] = l[1] * 0.9; C[i * 3 + 2] = l[2] * 0.9; }
    const I = Array.from({ length: n }, (_, i) => i);
    this.spawnGib('meat', at, geo.attributes.position.array, geo.attributes.uv.array, C, I, [at[0] - dir[0] * 10, at[1] - dir[1] * 10, at[2] - 10], dir, power * 1.3, 'meat');
    geo.dispose();
  }

  /** A gib comes to rest: bake it into a batch (or just drop it when forced and full). */
  settle(gb, force = false) {
    const i = this.gibs.indexOf(gb);
    if (i >= 0) this.gibs.splice(i, 1);
    const m = gb.mesh;
    m.updateMatrix();
    const P = m.geometry.attributes.position.array;
    const nv = P.length / 3;
    const out = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) {
      _v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(m.matrix);
      out[k * 3] = _v.x; out[k * 3 + 1] = _v.y; out[k * 3 + 2] = _v.z;
    }
    const idx = m.geometry.index.array;
    const b = this.batchFor(gb.skin, nv, idx.length);
    b.add(out, m.geometry.attributes.uv.array, m.geometry.attributes.color.array, null, idx);
    m.removeFromParent();
    m.geometry.dispose();
    void force;
  }

  /** Blow a dead (not yet baked) or living zombie apart where it stands. */
  gibPlayer(p, dir, power = 1) {
    if (!this.enabled || !p.model || p.gibbed) return;
    const s = this.snapshot(p.model);
    p.gibbed = true;
    p.model.object3D.visible = false;
    if (p.model.ragdoll) { p.model.ragdoll.detach(); p.model.ragdoll = null; }
    const o = p.pm.origin;
    this.burst(s, p.model.skin, [o[0] - dir[0] * 20, o[1] - dir[1] * 20, o[2] - 20], dir, power);
  }

  gibRecord(r, dir, power = 1) {
    const i = this.records.indexOf(r);
    if (i < 0) return;
    this.records.splice(i, 1);
    const s = r.batch.read(r.slot);
    r.batch.remove(r.slot);
    this.burst(s, r.skin, [r.center[0] - dir[0] * 20, r.center[1] - dir[1] * 20, r.center[2] - 16], dir, power);
  }

  /** Take a baked body away without a trace (the Abomination raises it). */
  removeRecord(r) {
    const i = this.records.indexOf(r);
    if (i < 0) return;
    this.records.splice(i, 1);
    r.batch.remove(r.slot);
  }

  /** A big headshot kill: the head comes off, the neck fountains. */
  popHead(p, dir) {
    if (!this.enabled || !p.model) return;
    const s = this.snapshot(p.model);
    const o = p.pm.origin;
    this.burst(s, p.model.skin, [o[0] - dir[0] * 30, o[1] - dir[1] * 30, o[2] + 10], [dir[0], dir[1], 0.5], 0.9, 'head');
    const hb = p.model.bones[p.model.rig.b.head.i];
    hb.scale.set(0.001, 0.001, 0.001);
    this.fountains.push({ p, until: this.game.time + rnd(1.8, 3), next: 0 });
    this.game.sound?.play('headpop', { pos: [o[0], o[1], o[2] + 30], volume: 1 });
  }

  // ---------------------------------------------------------------- corpse hits
  /** Nearest corpse a segment hits: { rec | player, t (0..1), point } or null. */
  corpseHit(a, b, live = []) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L2 = dx * dx + dy * dy + dz * dz;
    if (L2 < 1e-6) return null;
    let best = null;
    const test = (sph, owner) => {
      for (const q of sph) {
        const fx = a[0] - q[0], fy = a[1] - q[1], fz = a[2] - q[2];
        const B = fx * dx + fy * dy + fz * dz, Cc = fx * fx + fy * fy + fz * fz - q[3] * q[3];
        const disc = B * B - L2 * Cc;
        if (disc < 0) continue;
        const t = (-B - Math.sqrt(disc)) / L2;
        if (t < 0 || t > 1 || (best && t >= best.t)) continue;
        best = { ...owner, t, point: [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t] };
      }
    };
    for (const r of this.records) {
      const c = r.center;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / L2));
      const ex = a[0] + dx * t - c[0], ey = a[1] + dy * t - c[1], ez = a[2] + dz * t - c[2];
      if (ex * ex + ey * ey + ez * ez > 3600 * r.scale * r.scale) continue;
      test(r.spheres, { rec: r });
    }
    for (const p of live) {
      if (p.alive || p.baked || p.gibbed || !p.deathTime || !p.model?.object3D.visible) continue;
      const o = p.pm.origin;
      const t = Math.max(0, Math.min(1, ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy + (o[2] - a[2]) * dz) / L2));
      const ex = a[0] + dx * t - o[0], ey = a[1] + dy * t - o[1], ez = a[2] + dz * t - o[2];
      if (ex * ex + ey * ey + ez * ez > 9000) continue;
      test(this.liveSpheres(p), { player: p });
    }
    return best;
  }

  liveSpheres(p) {
    const m = p.model, world = this.game.renderer.world;
    m.object3D.updateMatrixWorld(true);
    const sc = p.boss ? p.boss.scale : 1;
    const out = [];
    for (const [bone, r] of [['head', 5], ['chest', 9], ['pelvis', 8], ['thigh_r', 5], ['thigh_l', 5], ['shin_r', 4.5], ['shin_l', 4.5]]) {
      m.bones[m.rig.b[bone].i].getWorldPosition(_v);
      world.worldToLocal(_v);
      out.push([_v.x, _v.y, _v.z, r * sc]);
    }
    return out;
  }

  /** A bullet / blade hit a corpse. */
  hitCorpse(h, dmg, dir) {
    const g = this.game;
    g.effects.blood?.(h.point, dir, Math.min(60, dmg), {});
    g.sound?.play('hit_flesh', { pos: h.point, volume: 0.7 });
    const hp = h.rec ? h.rec : h.player;
    hp.corpseHp = (hp.corpseHp ?? (h.rec ? h.rec.hp : (h.player.boss ? 400 : 70))) - dmg;
    if (hp.corpseHp > 0) return;
    const d = [dir[0], dir[1], Math.max(0.2, dir[2])];
    if (h.rec) this.gibRecord(h.rec, d, 0.8);
    else this.gibPlayer(h.player, d, 0.8);
  }

  /** An explosion: corpses in range come apart. */
  blast(pos, radius, damage, live = []) {
    const hitIt = (c) => {
      const d = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
      if (d > radius) return null;
      const dmg = damage * (1 - d / radius);
      if (dmg < 25) return null;
      const l = d || 1;
      return { dir: [(c[0] - pos[0]) / l, (c[1] - pos[1]) / l, Math.max(0.35, (c[2] - pos[2]) / l)], power: Math.min(2, 0.6 + dmg / 120) };
    };
    for (const r of this.records.slice()) { const h = hitIt(r.center); if (h) this.gibRecord(r, h.dir, h.power); }
    for (const p of live) {
      if (p.alive || p.baked || p.gibbed || !p.deathTime || !p.model) continue;
      const h = hitIt(p.pm.origin);
      if (h) this.gibPlayer(p, h.dir, h.power);
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.enabled || dt <= 0) return;
    const g = this.game, t = g.time, B = g.effects.bloodFx;
    for (let i = 0; i < this.gibs.length; i++) {
      const gb = this.gibs[i];
      const v = gb.vel, p = gb.pos;
      v[2] -= GRAVITY * dt;
      const next = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      const s = gb.size;
      g.collision.trace(p, next, [-s, -s, -s], [s, s, s], MASK_WORLD_PLAYER, tr);
      if (tr.startsolid) { p[2] += 2; v[0] = v[1] = 0; }
      else if (tr.fraction < 1) {
        p[0] = tr.endpos[0]; p[1] = tr.endpos[1]; p[2] = tr.endpos[2];
        const n = tr.normal, vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        const speed = Math.hypot(v[0], v[1], v[2]);
        if (speed > 140 && gb.bounces < 4 && B) B.splat([p[0] - n[0] * s, p[1] - n[1] * s, p[2] - n[2] * s], n, rnd(10, 22) * (gb.piece === 'meat' ? 0.6 : 1), v);
        if (speed > 160 && gb.bounces < 2) g.sound?.play('gib_land', { pos: p, volume: Math.min(1, speed / 500) });
        gb.bounces++;
        v[0] -= 1.3 * vn * n[0]; v[1] -= 1.3 * vn * n[1]; v[2] -= 1.3 * vn * n[2];
        const fr = n[2] > 0.7 ? 0.55 : 0.8;
        v[0] *= fr; v[1] *= fr; v[2] *= fr;
        gb.w[0] *= 0.6; gb.w[1] *= 0.6; gb.w[2] *= 0.6;
        if (n[2] > 0.7 && Math.abs(v[2]) < 60) { v[2] = 0; gb.ground = true; }
      } else { p[0] = next[0]; p[1] = next[1]; p[2] = next[2]; gb.ground = false; }
      if (gb.ground) { v[0] *= Math.max(0, 1 - 4 * dt); v[1] *= Math.max(0, 1 - 4 * dt); gb.w[0] *= 0.9; gb.w[1] *= 0.9; gb.w[2] *= 0.9; }
      const wl = Math.hypot(gb.w[0], gb.w[1], gb.w[2]);
      if (wl > 1e-3) {
        _ax.set(gb.w[0] / wl, gb.w[1] / wl, gb.w[2] / wl);
        _q.setFromAxisAngle(_ax, wl * dt);
        gb.mesh.quaternion.premultiply(_q);
      }
      gb.mesh.position.set(p[0], p[1], p[2]);
      if (B && t < gb.bleedUntil && t >= gb.nextDrop && gb.piece !== 'meat') {
        gb.nextDrop = t + 0.06;
        B.droplet([p[0], p[1], p[2]], [v[0] * 0.3 + rnd(-30, 30), v[1] * 0.3 + rnd(-30, 30), v[2] * 0.3 + rnd(0, 40)], rnd(1.0, 1.8));
      }
      const sp = Math.hypot(v[0], v[1], v[2]);
      if (gb.ground && sp < 25) gb.rest += dt; else gb.rest = 0;
      if (gb.rest > 0.4 || p[2] < -4000) { this.settle(gb); i--; }
    }
    // neck fountains
    for (let i = 0; i < this.fountains.length; i++) {
      const f = this.fountains[i];
      if (t > f.until || !f.p.model || f.p.gibbed) { this.fountains.splice(i--, 1); continue; }
      if (t < f.next || !B) continue;
      f.next = t + 0.045;
      const m = f.p.model;
      m.bones[m.rig.b.neck.i].getWorldPosition(_v);
      g.renderer.world.worldToLocal(_v);
      const k = (f.until - t) / 2.5;
      for (let j = 0; j < 2; j++) B.droplet([_v.x, _v.y, _v.z + 3], [rnd(-60, 60), rnd(-60, 60), rnd(120, 300) * (0.4 + k)], rnd(1.2, 2.2));
    }
  }
}
