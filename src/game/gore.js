// Gore (zombie survival): bodies that stay, gibs, head pops, brass.
//  - a dead zombie's ragdoll, once it has settled, is "baked": its skinned pose is copied
//    into big static meshes per map area (statics.js: culled per area, a low-poly index
//    far away, nothing to animate), so bodies stay for the whole game at almost no cost
//  - an explosion that kills a zombie tears it into its real limbs (the mesh split by
//    bone: head, chest, belly, upper / lower arms, thighs, shins) plus meat chunks; they
//    fly, tumble, bleed, splat where they hit and are baked in place once they come to rest
//  - a headshot kill with a big gun pops the head off (the body ragdolls as usual)
//  - once a body is down it stays down: shooting it only makes it bleed
//  - spent brass is baked where it comes to rest too
import * as THREE from 'three';
import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { BONE_DEFS } from '../assets/pm/rig.js';
import { getSkinTexture } from '../assets/pm/skins.js';
import { lightCurve } from '../map/meshbuilder.js';
import { StaticStore, Soak, clusterIndex } from './statics.js';
import { canvasTexture } from '../assets/pm/gslight.js';
import { CorpseGrid } from './corpsegrid.js';

const tr = new TraceResult();
const rnd = (a, b) => a + Math.random() * (b - a);
const MAX_GIBS = 240;
const LIGHT_K = 1.5; // vertex colours are stored / LIGHT_K (bytes hold 0..1; light goes to 1.4)
const LOD_CELL = 5; // vertex clustering grid for the far-away index
const BODY_LAYOUT = [['position', 3, Float32Array], ['uv', 2, Float32Array], ['color', 3, Uint8Array, true]];
/** Weapons whose headshot kill pops the head off. */
export const HEAD_POPPERS = new Set(['deagle', 'm3', 'xm1014', 'scout', 'awp', 'g3sg1', 'sg550', 'ak47', 'm4a1', 'aug', 'sg552', 'galil', 'famas', 'm249']);
const GRAVITY = 800;
const HIT_R = 60; // a bullet passing farther than this (x boss scale) from a body's centre misses it

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
  vC = color * ${LIGHT_K.toFixed(1)};
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

let whiteTex = null;
function whiteTexture() {
  if (whiteTex) return whiteTex;
  whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  whiteTex.needsUpdate = true;
  return whiteTex;
}

/** Float colours (0..1) -> normalised bytes. */
function toBytes(col) {
  const out = new Uint8Array(col.length);
  for (let i = 0; i < col.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(col[i] * 255)));
  return out;
}

/** Drop collapsed triangles (a popped head's) and the vertices nothing uses any more. */
function compact(s) {
  const { pos, idx } = s;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz > 1e-4) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const map = new Int32Array(pos.length / 3).fill(-1);
  let n = 0;
  for (const v of keep) if (map[v] < 0) map[v] = n++;
  const P = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
  for (let v = 0; v < map.length; v++) {
    const k = map[v];
    if (k < 0) continue;
    P[k * 3] = pos[v * 3]; P[k * 3 + 1] = pos[v * 3 + 1]; P[k * 3 + 2] = pos[v * 3 + 2];
    U[k * 2] = s.uv[v * 2]; U[k * 2 + 1] = s.uv[v * 2 + 1];
    C[k * 3] = s.col[v * 3]; C[k * 3 + 1] = s.col[v * 3 + 1]; C[k * 3 + 2] = s.col[v * 3 + 2];
  }
  return { pos: P, uv: U, col: C, idx: keep.map((v) => map[v]) };
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
    this.store = new StaticStore(this.group, BODY_LAYOUT, (k) => this.material(k), { lod: true, verts: 4096, pad: 8, name: 'corpses' });
    this.records = []; // baked whole bodies: { skin, center, spheres, scale } (for hits, raising the dead)
    this.grid = new CorpseGrid(); // ...the same, bucketed by area (bullets only test the ones on their path)
    this.gibs = [];
    this.fountains = [];
    this.brassSoak = new Soak(1, 4, 6); // at most 4 shells per 6 x 6 units (a pile reads the same)
    this.customTex = new Map(); // corpse skins with their wounds burned in (bosses)
  }

  clear() {
    this.store.clear();
    this.records = [];
    this.grid.clear();
    for (const gb of this.gibs) { gb.mesh.removeFromParent(); gb.mesh.geometry.dispose(); }
    this.gibs = [];
    this.fountains = [];
    this.brassSoak.clear();
    for (const t of this.customTex.values()) t.dispose();
    this.customTex.clear();
    for (const [k, m] of this.materials) if (k.startsWith('wounded_')) { m.dispose(); this.materials.delete(k); }
  }

  material(key) {
    let m = this.materials.get(key);
    if (m) return m;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    uniforms.map = { value: this.customTex.get(key) || (key === 'meat' ? meatTexture() : key === 'brass' ? whiteTexture() : getSkinTexture(key)) };
    m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, fog: true });
    m.name = 'corpse_' + key;
    this.materials.set(key, m);
    return m;
  }

  /** Make geometry permanent: GS-space positions, uvs, float colours (/ LIGHT_K), triangles. */
  addStatic(kind, pos, uv, col, idx, lod = true) {
    const nv = pos.length / 3;
    if (!nv || !idx.length) return;
    const lidx = lod ? clusterIndex(pos, idx, LOD_CELL) : [];
    this.store.add(kind, { position: pos, uv, color: toBytes(col) }, nv, idx, lidx);
  }

  /** Per frame: upload what was added, near / far detail by the camera. */
  updateStatics() {
    this.store.update(this.game.camPos || null);
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
      for (let k = 0; k < 3; k++) col[o + k] = Math.min(1.4, (l[k] * 0.62 + 0.12 + l[k] * 0.36 * d) * ch) / LIGHT_K;
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
    const snap = this.snapshot(p.model);
    const sph = this.spheres(snap, p.boss ? p.boss.scale : 1);
    const s = compact(snap);
    const skin = p.model.skin;
    // a boss keeps its bullet holes: its own copy of the skin with the wounds painted in
    const L = p.model.woundLayer;
    this.addStatic(p.boss && L && L.n > 0 ? this.woundedSkin(skin, L.canvas) : skin, s.pos, s.uv, s.col, s.idx);
    if (p.model.extras) this.bakeExtras(p.model, snap);
    const c = sph.length ? sph.reduce((a, q) => [a[0] + q[0] / sph.length, a[1] + q[1] / sph.length, a[2] + q[2] / sph.length], [0, 0, 0]) : p.pm.origin.slice();
    this.addRecord({ skin, center: c, spheres: sph, scale: p.boss ? p.boss.scale : 1 });
    p.model.object3D.visible = false;
  }

  /** A baked body joins the list (and the area grid bullets look it up in). */
  addRecord(rec) {
    this.records.push(rec);
    this.grid.add(rec, HIT_R * rec.scale + 1);
  }

  /** A one-off corpse texture: the skin with a wound layer over it. Returns its key. */
  woundedSkin(skin, wounds) {
    const base = getSkinTexture(skin).userData.canvas;
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop'; // (keeps the skin's cut-out alpha)
    g.drawImage(wounds, 0, 0, c.width, c.height);
    const key = `wounded_${skin}_${this.customTex.size}`;
    this.customTex.set(key, canvasTexture(c));
    return key;
  }

  /** The parts bolted onto a boss (cleaver, plates, horns...) stay with its body. */
  bakeExtras(model, snap) {
    const world = this.game.renderer.world;
    _inv.copy(world.matrixWorld).invert();
    const light = this.lightFor(snap.pos);
    for (const mesh of model.extras.meshes) {
      const hex = mesh.material.userData?.hex;
      if (!hex || !mesh.visible) continue; // glowing bits go out with the boss
      const geo = mesh.geometry, P = geo.attributes.position.array, nv = P.length / 3;
      _m.multiplyMatrices(_inv, mesh.matrixWorld);
      const pos = new Float32Array(nv * 3);
      for (let k = 0; k < nv; k++) {
        _v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(_m);
        pos[k * 3] = _v.x; pos[k * 3 + 1] = _v.y; pos[k * 3 + 2] = _v.z;
      }
      const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: nv }, (_, i) => i);
      const col = this.shade(pos, idx, light, model.material.uniforms.uChar?.value || 0);
      const c = new THREE.Color(hex);
      for (let k = 0; k < nv; k++) { col[k * 3] *= c.r; col[k * 3 + 1] *= c.g; col[k * 3 + 2] *= c.b; }
      this.addStatic('brass', pos, geo.attributes.uv.array, col, idx);
    }
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
    if (this.gibs.length >= MAX_GIBS) this.finish(this.gibs[0]);
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
    for (let i = 0; i < n; i++) { C[i * 3] = l[0] * 0.9 / LIGHT_K; C[i * 3 + 1] = l[1] * 0.9 / LIGHT_K; C[i * 3 + 2] = l[2] * 0.9 / LIGHT_K; }
    const I = Array.from({ length: n }, (_, i) => i);
    this.spawnGib('meat', at, geo.attributes.position.array, geo.attributes.uv.array, C, I, [at[0] - dir[0] * 10, at[1] - dir[1] * 10, at[2] - 10], dir, power * 1.3, 'meat');
    geo.dispose();
  }

  /** A gib comes to rest: bake it in place. */
  settle(gb) {
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
    this.addStatic(gb.skin, out, m.geometry.attributes.uv.array, m.geometry.attributes.color.array, Array.from(m.geometry.index.array), gb.piece !== 'meat');
    m.removeFromParent();
    m.geometry.dispose();
  }

  /** Blow a living zombie apart where it stands (killed by an explosion). */
  gibPlayer(p, dir, power = 1) {
    if (!this.enabled || !p.model || p.gibbed) return;
    // (a zombie can die before a frame has drawn it where it now is)
    const o0 = p.pm.origin;
    p.model.object3D.position.set(o0[0], o0[1], o0[2] + p.hull().mins[2]);
    p.model.object3D.rotation.set(0, 0, p.pm.angles[1] * Math.PI / 180);
    const s = this.snapshot(p.model);
    p.gibbed = true;
    p.model.object3D.visible = false;
    if (p.model.ragdoll) { p.model.ragdoll.detach(); p.model.ragdoll = null; }
    const o = p.pm.origin;
    this.burst(s, p.model.skin, [o[0] - dir[0] * 20, o[1] - dir[1] * 20, o[2] - 20], dir, power);
  }

  /** A spent case came to rest: it stays (unless the spot is already full of brass). */
  bakeShell(mesh) {
    if (!this.enabled) return;
    mesh.updateMatrix();
    const p = mesh.position;
    if (!this.brassSoak.take([p.x, p.y, p.z], [0, 0, 1], 0)) return;
    const geo = mesh.geometry, P = geo.attributes.position.array, nv = P.length / 3;
    const out = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) {
      _v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(mesh.matrix);
      out[k * 3] = _v.x; out[k * 3 + 1] = _v.y; out[k * 3 + 2] = _v.z;
    }
    const c = mesh.material.color, col = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) {
      const f = (0.8 + 0.2 * Math.random()) / LIGHT_K; // a little variation between the faces
      col[k * 3] = c.r * f; col[k * 3 + 1] = c.g * f; col[k * 3 + 2] = c.b * f;
    }
    this.addStatic('brass', out, geo.attributes.uv.array, col, Array.from(geo.index.array), false);
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
    // only the bodies filed along the bullet's path (corpsegrid.js), not every one of the run
    const recs = this.grid.along(a, b);
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i], c = r.center;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / L2));
      const ex = a[0] + dx * t - c[0], ey = a[1] + dy * t - c[1], ez = a[2] + dz * t - c[2];
      if (ex * ex + ey * ey + ez * ez > HIT_R * HIT_R * r.scale * r.scale) continue;
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

  /** A bullet / blade hit a body on the floor: it bleeds (bodies never come apart once down). */
  hitCorpse(h, dmg, dir) {
    const g = this.game;
    g.effects.blood?.(h.point, dir, Math.min(60, dmg), {});
    g.sound?.play('hit_flesh', { pos: h.point, volume: 0.7 });
  }

  // ---------------------------------------------------------------- per frame
  /** One physics step of a flying gib (fx: blood trails, splats, sounds). True: it's done. */
  step(gb, dt, fx) {
    const g = this.game, t = g.time, B = g.effects.bloodFx;
    const v = gb.vel, p = gb.pos;
    v[2] -= GRAVITY * dt;
    const next = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
    const s = gb.size;
    g.collision.trace(p, next, [-s, -s, -s], [s, s, s], MASK_WORLD_PLAYER, tr);
    if (tr.startsolid) { p[2] += 2; v[0] = v[1] = 0; gb.stuck = (gb.stuck || 0) + 1; }
    else if (tr.fraction < 1) {
      p[0] = tr.endpos[0]; p[1] = tr.endpos[1]; p[2] = tr.endpos[2];
      const n = tr.normal, vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
      const speed = Math.hypot(v[0], v[1], v[2]);
      if (speed > 140 && gb.bounces < 4 && B) B.splat([p[0] - n[0] * s, p[1] - n[1] * s, p[2] - n[2] * s], n, rnd(10, 22) * (gb.piece === 'meat' ? 0.6 : 1), v);
      if (speed > 160 && gb.bounces < 2 && fx) g.sound?.play('gib_land', { pos: p, volume: Math.min(1, speed / 500) });
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
    if (B && fx && t < gb.bleedUntil && t >= gb.nextDrop && gb.piece !== 'meat') {
      gb.nextDrop = t + 0.06;
      B.droplet([p[0], p[1], p[2]], [v[0] * 0.3 + rnd(-30, 30), v[1] * 0.3 + rnd(-30, 30), v[2] * 0.3 + rnd(0, 40)], rnd(1.0, 1.8));
    }
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (gb.ground && sp < 25) gb.rest += dt; else gb.rest = 0;
    gb.age = (gb.age || 0) + dt;
    return gb.rest > 0.4 || p[2] < -4000 || gb.age > 8 || (gb.stuck || 0) > 40;
  }

  /** Too many gibs in the air: play the oldest one's flight out at once and bake it where it lands. */
  finish(gb) {
    for (let k = 0; k < 600 && !this.step(gb, 1 / 60, false); k++);
    this.settle(gb);
  }

  update(dt) {
    if (!this.enabled || dt <= 0) return;
    for (let i = 0; i < this.gibs.length; i++) {
      if (this.step(this.gibs[i], dt, true)) { this.settle(this.gibs[i]); i--; }
    }
    const g = this.game, t = g.time, B = g.effects.bloodFx;
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
