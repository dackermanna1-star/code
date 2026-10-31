import * as THREE from 'three';
import { BONE_COUNT, B } from '../anim/skeleton';
import { createCharacterMaterial, MAX_WOUNDS, Wound } from '../character/material';
import { CharacterLibrary, CharacterModel, Variant } from '../character/library';
import { G, groups, Physics, RAPIER } from './physics';
import { Ragdoll } from './ragdoll';
import { BloodAtlas, SPLAT } from './bloodAtlas';
import { HALF_D, HALF_W } from './arena';

/** Permanent record of a defeated enemy. Never removed. */
export interface CorpseRecord {
  id: number;
  variant: number;
  x: number;
  z: number;
  /** Final world bone matrices (16 floats each). */
  bones: Float32Array;
  wounds: Wound[];
  time: number;
  cause: string;
}

const CHUNK_VERTS = 60000;
const CELLS_X = 4;
const CELLS_Z = 4;

interface Chunk {
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  verts: number;
  indices: number;
  cell: number;
  corpses: number;
  capacity: number;
  fullUpload?: boolean;
  pos: Float32Array;
  nor: Int8Array;
  uv: Uint16Array;
  bind: Uint16Array; // half floats
  skin: Uint8Array;
  cid: Uint16Array;
  layer: Uint8Array;
  idx: Uint16Array;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class CorpseSystem {
  records: CorpseRecord[] = [];
  chunks: Chunk[] = [];
  group = new THREE.Group();
  material: THREE.MeshStandardMaterial;
  private corpseUniforms: { uCorpseWounds: { value: THREE.DataTexture | null } };
  private woundData: Float32Array;
  woundTex: THREE.DataTexture;
  private woundRows = 256;
  totalVerts = 0;
  colliderBodies = 0;
  castShadows = false;
  /** Coarse height field of all bodies on the floor (10 cm cells) so live feet step on top of them. */
  readonly hfRes = 0.1;
  hfW = Math.ceil((HALF_W * 2) / 0.1);
  hfH = Math.ceil((HALF_D * 2) / 0.1);
  heights = new Float32Array(this.hfW * this.hfH);

  constructor(public lib: CharacterLibrary, public physics: Physics, public blood: BloodAtlas) {
    const { material, corpseUniforms } = createCharacterMaterial(lib.atlas, true);
    this.material = material;
    this.corpseUniforms = corpseUniforms;
    this.woundData = new Float32Array(MAX_WOUNDS * 2 * 4 * this.woundRows);
    this.woundTex = this.makeWoundTex();
    corpseUniforms.uCorpseWounds.value = this.woundTex;
    this.group.name = 'corpses';
    // tiny placeholder so the corpse shader is compiled during loading (no hitch on the first kill)
    const warm = new THREE.BufferGeometry();
    warm.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    warm.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(9), 3, true));
    warm.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(6), 2, true));
    warm.setAttribute('aBindPos', new THREE.Float16BufferAttribute(new Uint16Array(9), 3));
    warm.setAttribute('aSkin', new THREE.BufferAttribute(new Uint8Array(3), 1, true));
    warm.setAttribute('aCorpseId', new THREE.BufferAttribute(new Uint16Array(3), 1, false));
    warm.setAttribute('aLayer', new THREE.BufferAttribute(new Uint8Array(3), 1, false));
    const wm = new THREE.Mesh(warm, this.material);
    wm.frustumCulled = false;
    wm.position.set(0, -5, 0);
    this.group.add(wm);
  }

  private makeWoundTex() {
    const t = new THREE.DataTexture(this.woundData, MAX_WOUNDS * 2, this.woundRows, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  private ensureRows(n: number) {
    if (n <= this.woundRows) return;
    let rows = this.woundRows;
    while (rows < n) rows *= 2;
    const data = new Float32Array(MAX_WOUNDS * 2 * 4 * rows);
    data.set(this.woundData);
    this.woundData = data;
    this.woundRows = rows;
    const old = this.woundTex;
    this.woundTex = this.makeWoundTex();
    this.corpseUniforms.uCorpseWounds.value = this.woundTex;
    old.dispose();
  }

  private cellOf(x: number, z: number) {
    const cx = Math.min(CELLS_X - 1, Math.max(0, Math.floor(((x + HALF_W) / (HALF_W * 2)) * CELLS_X)));
    const cz = Math.min(CELLS_Z - 1, Math.max(0, Math.floor(((z + HALF_D) / (HALF_D * 2)) * CELLS_Z)));
    return cz * CELLS_X + cx;
  }

  private newChunk(cell: number, capacity = 6000): Chunk {
    const n = capacity;
    const c: Chunk = {
      geo: new THREE.BufferGeometry(),
      mesh: null as unknown as THREE.Mesh,
      verts: 0,
      indices: 0,
      cell,
      corpses: 0,
      capacity: n,
      pos: new Float32Array(n * 3),
      nor: new Int8Array(n * 3),
      uv: new Uint16Array(n * 2),
      bind: new Uint16Array(n * 3),
      skin: new Uint8Array(n),
      cid: new Uint16Array(n),
      layer: new Uint8Array(n),
      idx: new Uint16Array(n * 2),
    };
    this.attachGeometry(c);
    const mesh = new THREE.Mesh(c.geo, this.material);
    mesh.castShadow = this.castShadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'corpseChunk';
    c.mesh = mesh;
    this.group.add(mesh);
    this.chunks.push(c);
    return c;
  }

  private attachGeometry(c: Chunk) {
    const g = c.geo;
    g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(c.nor, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(c.uv, 2, true));
    g.setAttribute('aBindPos', new THREE.Float16BufferAttribute(c.bind, 3));
    g.setAttribute('aSkin', new THREE.BufferAttribute(c.skin, 1, true));
    g.setAttribute('aCorpseId', new THREE.BufferAttribute(c.cid, 1, false));
    g.setAttribute('aLayer', new THREE.BufferAttribute(c.layer, 1, false));
    g.setIndex(new THREE.BufferAttribute(c.idx, 1));
    g.setDrawRange(0, c.indices);
    const cell = c.cell;
    const cx = cell % CELLS_X, cz = Math.floor(cell / CELLS_X);
    const x = -HALF_W + (cx + 0.5) * ((HALF_W * 2) / CELLS_X);
    const z = -HALF_D + (cz + 0.5) * ((HALF_D * 2) / CELLS_Z);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 0.4, z), Math.hypot(HALF_W / CELLS_X + 2, HALF_D / CELLS_Z + 2, 1.5));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x - 6, -1, z - 6), new THREE.Vector3(x + 6, 3, z + 6));
  }

  /** Grow a chunk's buffers (doubling) by rebuilding its geometry; old GPU buffers are disposed. */
  private grow(c: Chunk, needVerts: number, needIdx: number) {
    let cap = c.capacity;
    while (cap < needVerts || cap * 2 < needIdx) cap = Math.min(CHUNK_VERTS, cap * 2);
    if (cap === c.capacity) return;
    const cp = <T extends Float32Array | Int8Array | Uint16Array | Uint8Array>(a: T, n: number): T => {
      const b = new (a.constructor as { new (n: number): T })(n);
      b.set(a);
      return b;
    };
    c.pos = cp(c.pos, cap * 3);
    c.nor = cp(c.nor, cap * 3);
    c.uv = cp(c.uv, cap * 2);
    c.bind = cp(c.bind, cap * 3);
    c.skin = cp(c.skin, cap);
    c.cid = cp(c.cid, cap);
    c.layer = cp(c.layer, cap);
    c.idx = cp(c.idx, cap * 2);
    c.capacity = cap;
    const old = c.geo;
    c.geo = new THREE.BufferGeometry();
    this.attachGeometry(c);
    c.mesh.geometry = c.geo;
    old.dispose();
    c.fullUpload = true;
  }

  /**
   * Bake a dead character (its current skinned pose) into permanent static geometry.
   * The model must have its final pose applied and matrices updated.
   */
  bake(model: CharacterModel, ragdoll: Ragdoll | null, cause: string, time: number): CorpseRecord {
    const variant: Variant = model.variant;
    const geo = variant.geometry;
    model.group.updateMatrixWorld(true);
    model.skeleton.update();
    const id = this.records.length;
    // record bone matrices (world)
    const bones = new Float32Array(BONE_COUNT * 16);
    for (let i = 0; i < BONE_COUNT; i++) model.bones[i].matrixWorld.toArray(bones, i * 16);
    const wounds = model.wounds.map((w) => ({ ...w, pos: w.pos.clone() }));
    const pelvis = new THREE.Vector3().setFromMatrixPosition(model.bones[B.hips].matrixWorld);
    const rec: CorpseRecord = { id, variant: variant.id, x: pelvis.x, z: pelvis.z, bones, wounds, time, cause };
    this.records.push(rec);
    this.writeWounds(id, wounds);
    this.emitGeometry(rec, model, geo);
    if (ragdoll) this.addColliders(ragdoll);
    // contact shadows / AO under body parts
    const up = new THREE.Vector3(0, 1, 0);
    for (const b of [B.hips, B.chest, B.head, B.shinL, B.shinR, B.farmL, B.farmR]) {
      _p.setFromMatrixPosition(model.bones[b].matrixWorld);
      if (_p.y < 0.5) {
        const r = b === B.hips || b === B.chest ? 0.42 : 0.22;
        this.blood.splat(_p.clone().setY(0.01), r * model.def.scale, SPLAT.ao, 0.55, up, null, 0, id + b);
      }
    }
    return rec;
  }

  private writeWounds(id: number, wounds: Wound[]) {
    this.ensureRows(id + 1);
    const row = id * MAX_WOUNDS * 2 * 4;
    const d = this.woundData;
    d.fill(0, row, row + MAX_WOUNDS * 8);
    wounds.slice(0, MAX_WOUNDS).forEach((w, i) => {
      const o = row + i * 8;
      d[o] = w.pos.x; d[o + 1] = w.pos.y; d[o + 2] = w.pos.z; d[o + 3] = w.radius;
      d[o + 4] = w.type; d[o + 5] = w.intensity; d[o + 6] = w.seed; d[o + 7] = w.drip;
    });
    this.woundTex.needsUpdate = true;
  }

  private emitGeometry(rec: CorpseRecord, model: CharacterModel, geo: THREE.BufferGeometry) {
    const posA = geo.attributes.position as THREE.BufferAttribute;
    const norA = geo.attributes.normal as THREE.BufferAttribute;
    const uvA = geo.attributes.uv as THREE.BufferAttribute;
    const skA = geo.attributes.aSkin as THREE.BufferAttribute;
    const siA = geo.attributes.skinIndex as THREE.BufferAttribute;
    const swA = geo.attributes.skinWeight as THREE.BufferAttribute;
    const index = geo.index!;
    const nv = posA.count;
    const cell = this.cellOf(rec.x, rec.z);
    let chunk = this.chunks.find((c) => c.cell === cell && c.verts + nv <= CHUNK_VERTS && c.indices + index.count <= CHUNK_VERTS * 2);
    if (!chunk) chunk = this.newChunk(cell, Math.max(6000, nv * 4));
    if (chunk.verts + nv > chunk.capacity || chunk.indices + index.count > chunk.capacity * 2) this.grow(chunk, chunk.verts + nv, chunk.indices + index.count);
    const base = chunk.verts;
    // skinning matrices: boneMatrices = boneWorld * boneInverse; mesh bindMatrix etc.
    const mesh = model.mesh;
    const skel = model.skeleton;
    const bm = skel.boneMatrices!;
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < BONE_COUNT; i++) mats.push(new THREE.Matrix4().fromArray(bm, i * 16));
    const bindM = mesh.bindMatrix, bindMI = mesh.bindMatrixInverse;
    const world = mesh.matrixWorld;
    for (let v = 0; v < nv; v++) {
      _m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = swA.getComponent(v, k);
        if (w <= 0) continue;
        const bi = siA.getComponent(v, k);
        const e = mats[bi].elements;
        const me = _m.elements;
        for (let q = 0; q < 16; q++) me[q] += e[q] * w;
      }
      _m2.multiplyMatrices(_m, bindM).premultiply(bindMI).premultiply(world);
      _v.fromBufferAttribute(posA, v).applyMatrix4(_m2);
      _nm.getNormalMatrix(_m2);
      _n.fromBufferAttribute(norA, v).applyMatrix3(_nm).normalize();
      const o = (base + v) * 3;
      chunk.pos[o] = _v.x; chunk.pos[o + 1] = Math.max(_v.y, 0.004); chunk.pos[o + 2] = _v.z;
      chunk.nor[o] = Math.round(_n.x * 127); chunk.nor[o + 1] = Math.round(_n.y * 127); chunk.nor[o + 2] = Math.round(_n.z * 127);
      chunk.uv[(base + v) * 2] = Math.round(THREE.MathUtils.clamp(uvA.getX(v), 0, 1) * 65535);
      chunk.uv[(base + v) * 2 + 1] = Math.round(THREE.MathUtils.clamp(uvA.getY(v), 0, 1) * 65535);
      chunk.bind[o] = THREE.DataUtils.toHalfFloat(posA.getX(v));
      chunk.bind[o + 1] = THREE.DataUtils.toHalfFloat(posA.getY(v));
      chunk.bind[o + 2] = THREE.DataUtils.toHalfFloat(posA.getZ(v));
      chunk.skin[base + v] = Math.round(THREE.MathUtils.clamp(skA.getX(v), 0, 1) * 255);
      chunk.cid[base + v] = rec.id;
      chunk.layer[base + v] = model.variant.layer;
    }
    // rasterize this body into the height field (max height per cell, slightly dilated, capped)
    const hf = this.heights;
    for (let v = 0; v < nv; v++) {
      const o = (base + v) * 3;
      const x = chunk.pos[o], y = chunk.pos[o + 1], z = chunk.pos[o + 2];
      const cx = Math.floor((x + HALF_W) / this.hfRes), cz = Math.floor((z + HALF_D) / this.hfRes);
      const h = Math.min(0.32, y * 0.9);
      for (let dz = -1; dz <= 1; dz++) {
        const zz = cz + dz;
        if (zz < 0 || zz >= this.hfH) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx;
          if (xx < 0 || xx >= this.hfW) continue;
          const hh = dx === 0 && dz === 0 ? h : h * 0.7;
          const i = zz * this.hfW + xx;
          if (hh > hf[i]) hf[i] = hh;
        }
      }
    }
    const ib = chunk.indices;
    for (let i = 0; i < index.count; i++) chunk.idx[ib + i] = index.getX(i) + base;
    chunk.verts += nv;
    chunk.indices += index.count;
    chunk.corpses++;
    this.totalVerts += nv;
    const g = chunk.geo;
    const full = !!chunk.fullUpload;
    chunk.fullUpload = false;
    const upd = (name: string, itemSize: number) => {
      const a = g.attributes[name] as THREE.BufferAttribute;
      a.clearUpdateRanges();
      if (!full) a.addUpdateRange(base * itemSize, nv * itemSize);
      a.needsUpdate = true;
    };
    upd('position', 3); upd('normal', 3); upd('uv', 2); upd('aBindPos', 3); upd('aSkin', 1); upd('aCorpseId', 1); upd('aLayer', 1);
    const ia = g.index!;
    ia.clearUpdateRanges();
    if (!full) ia.addUpdateRange(ib, index.count);
    ia.needsUpdate = true;
    g.setDrawRange(0, chunk.indices);
  }

  /** Static simplified colliders where the body lies, so later ragdolls land on top. */
  private addColliders(r: Ragdoll) {
    const w = this.physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const use = ['pelvis', 'chest', 'head', 'thighL', 'thighR'];
    r.read();
    r.parts.forEach((p, i) => {
      if (!use.includes(p.name) || !p.rb) return;
      const col = p.rb.collider(0);
      if (!col) return;
      const t = col.translation();
      const q = col.rotation();
      let cd: RAPIER.ColliderDesc;
      const shape = col.shape;
      if (shape.type === RAPIER.ShapeType.Ball) cd = RAPIER.ColliderDesc.ball((shape as RAPIER.Ball).radius * 0.9);
      else if (shape.type === RAPIER.ShapeType.Capsule) cd = RAPIER.ColliderDesc.capsule((shape as RAPIER.Capsule).halfHeight, (shape as RAPIER.Capsule).radius * 0.85);
      else return;
      cd.setTranslation(t.x, Math.max(t.y, 0.05), t.z).setRotation(q).setFriction(0.9).setCollisionGroups(groups(G.CORPSE, G.RAGDOLL | G.PROP | G.DEBRIS));
      w.createCollider(cd, body);
      void i;
    });
    this.colliderBodies++;
  }

  /** Bilinear height of bodies at (x, z). */
  heightAt(x: number, z: number) {
    const fx = (x + HALF_W) / this.hfRes - 0.5, fz = (z + HALF_D) / this.hfRes - 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= this.hfW - 1 || iz >= this.hfH - 1) return 0;
    const tx = fx - ix, tz = fz - iz;
    const W = this.hfW, h = this.heights;
    const a = h[iz * W + ix], b = h[iz * W + ix + 1], c = h[(iz + 1) * W + ix], d = h[(iz + 1) * W + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  get count() {
    return this.records.length;
  }
}
