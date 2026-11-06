// Tiny fake voxel world + renderer for the entities test page.
import * as THREE from 'three';
import { B } from '../src/world/blocks.js';
import { createEntityMaterial, setEntityLight } from '../src/render/materials.js';

export class FakeWorld {
  constructor(SX = 96, SY = 24, SZ = 96, ox = -48, oz = -48) {
    this.SX = SX; this.SY = SY; this.SZ = SZ; this.ox = ox; this.oz = oz;
    this.blocks = new Uint8Array(SX * SY * SZ);
    this.roofs = [];
  }
  idx(x, y, z) { return ((x - this.ox) + (z - this.oz) * this.SX) * this.SY + y; }
  inb(x, y, z) { return x >= this.ox && z >= this.oz && x < this.ox + this.SX && z < this.oz + this.SZ && y >= 0 && y < this.SY; }
  get(x, y, z) {
    if (y < 0) return B.bedrock;
    if (!this.inb(x, y, z)) return 0;
    return this.blocks[this.idx(x, y, z)];
  }
  set(x, y, z, id) { if (this.inb(x, y, z)) this.blocks[this.idx(x, y, z)] = id; }
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, id);
  }
  isSolid(x, y, z) {
    const id = this.get(x, y, z);
    return id !== 0 && id !== B.water;
  }
  getMeta() { return 0; }
  skyAt(x, y, z) {
    for (const r of this.roofs) if (x >= r[0] && x <= r[3] && z >= r[2] && z <= r[5] && y < r[4]) return 6;
    return 15;
  }
  blockLightAt() { return 0; }
}

const MAT_COLORS = {
  [B.grass]: [0x5d8a3a, 0x6a5038], [B.stone]: [0x8a8a8a], [B.concrete]: [0xa8a8a2], [B.asphalt]: [0x3a3a3c],
  [B.planks_oak]: [0xa07a48], [B.brick_red]: [0x9a4a3a], [B.metal_wall]: [0x7a8288], [B.glass]: [0xa8d0e0],
  [B.dirt]: [0x6a5038], [B.sand]: [0xd8c890], [B.water]: [0x2a5a8a], [B.siding_white]: [0xd8d8d0],
};

function makeTex(hex, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hex);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const k = 0.85 + rnd() * 0.25;
    ctx.fillStyle = `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Build simple per-block-type meshes (exposed faces only). */
export function buildWorldMeshes(world, scene) {
  const groups = new Map();
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let x = world.ox; x < world.ox + world.SX; x++) for (let z = world.oz; z < world.oz + world.SZ; z++) for (let y = 0; y < world.SY; y++) {
    const id = world.get(x, y, z);
    if (!id) continue;
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = dirs[f];
      const n = world.get(x + dx, y + dy, z + dz);
      if (n && n !== B.water && !(n === B.glass && id !== B.glass)) continue;
      if (y + dy < 0) continue;
      const key = id === B.grass ? (f === 2 ? 'grass_top' : 'grass_side') : String(id);
      if (!groups.has(key)) groups.set(key, { id, top: f === 2, pos: [], nor: [], uv: [], idx: [] });
      const g = groups.get(key);
      const base = g.pos.length / 3;
      // quad corners
      const c = faceCorners(x, y, z, f);
      for (const p of c) g.pos.push(p[0], p[1], p[2]);
      for (let k = 0; k < 4; k++) g.nor.push(dx, dy, dz);
      g.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const meshes = [];
  for (const [key, g] of groups) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    const cols = MAT_COLORS[g.id] || [0x888888];
    const hex = key === 'grass_top' ? cols[0] : key === 'grass_side' ? cols[1] : cols[0];
    const glass = g.id === B.glass || g.id === B.water;
    const mat = createEntityMaterial({ map: makeTex(hex, g.id + (key === 'grass_top' ? 7 : 0)), transparent: glass, opacity: glass ? 0.45 : 1 });
    setEntityLight(mat, 1, 0);
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}

function faceCorners(x, y, z, f) {
  switch (f) {
    case 0: return [[x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x + 1, y, z], [x + 1, y, z + 1]];
    case 1: return [[x, y + 1, z], [x, y + 1, z + 1], [x, y, z + 1], [x, y, z]];
    case 2: return [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
    case 3: return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z]];
    case 4: return [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y, z + 1], [x, y, z + 1]];
    default: return [[x + 1, y + 1, z], [x, y + 1, z], [x, y, z], [x + 1, y, z]];
  }
}
