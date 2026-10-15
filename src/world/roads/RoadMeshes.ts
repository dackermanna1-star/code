// Builds terrain-conforming road ribbons (one merged mesh for all roads) and concrete pads.
import * as THREE from 'three';
import type { BridgeDef, GroundPatchDef, RoadDef } from '../layout/types';
import type { World } from '../World';
import { densify, rectSd } from '../terrain/gen/raster';
import { createRoadMaterial, type RoadUniforms } from './roadMaterial';

const LIFT = 0.035;
const _n = new THREE.Vector3();

interface Builder {
  pos: number[];
  nrm: number[];
  uv: number[];
  info: number[];
  /** 1 = draw the gravel shoulder here, 0 = not (bridge decks, junctions with other roads, pads). */
  sh: number[];
  idx: number[];
}

function newBuilder(): Builder {
  return { pos: [], nrm: [], uv: [], info: [], sh: [], idx: [] };
}

function toGeometry(b: Builder): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('roadUv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('roadInfo', new THREE.Float32BufferAttribute(b.info, 4));
  g.setAttribute('roadShoulder', new THREE.Float32BufferAttribute(b.sh, 1));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}

/** Spatial hash of road centerline samples, to detect junction zones (no lane markings there). */
class RoadIndex {
  private cells = new Map<number, { x: number; z: number; hw: number; id: number }[]>();
  constructor(roads: RoadDef[]) {
    for (const r of roads)
      for (const p of densify(r.points, 3)) {
        const k = this.key(p.x, p.z);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push({ x: p.x, z: p.z, hw: r.width / 2, id: r.id });
      }
  }
  private key(x: number, z: number): number {
    return Math.floor(x / 32) * 4096 + Math.floor(z / 32);
  }
  /** Clearance to any OTHER road's edge. */
  otherClearance(x: number, z: number, self: number): number {
    let best = Infinity;
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const l = this.cells.get((cx + i) * 4096 + cz + j);
        if (!l) continue;
        for (const s of l) {
          if (s.id === self) continue;
          const d = Math.hypot(s.x - x, s.z - z) - s.hw;
          if (d < best) best = d;
        }
      }
    return best;
  }
}

function bridgeDeckAt(bridges: BridgeDef[], road: RoadDef, x: number, z: number): number | null {
  for (const br of bridges) {
    if (br.roadId !== road.id) continue;
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    const L2 = dx * dx + dz * dz;
    const t = ((x - br.a.x) * dx + (z - br.a.z) * dz) / L2;
    if (t < 0 || t > 1) continue;
    const cx = br.a.x + dx * t - x, cz = br.a.z + dz * t - z;
    if (cx * cx + cz * cz < (br.width / 2 + 1) ** 2) return br.deckY;
  }
  return null;
}

function addRoad(b: Builder, world: World, road: RoadDef, bridges: BridgeDef[], index: RoadIndex): void {
  const pts = densify(road.points, 2.5);
  if (pts.length < 2) return;
  const asphalt = road.kind === 'asphalt';
  const hw = road.width / 2;
  const ext = asphalt ? 1.6 : 0.8; // asphalt ribbons carry a gravel shoulder
  const offs = asphalt ? [-(hw + ext), -hw, -hw * 0.5, 0, hw * 0.5, hw, hw + ext] : [-(hw + ext), -0.9, 0, 0.9, hw + ext];
  const cols = offs.length;
  const markings = asphalt && road.width >= 7.9 ? 1 : 0;
  const base = b.pos.length / 3;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    // smoothed tangent
    const a = pts[Math.max(0, k - 1)], c = pts[Math.min(pts.length - 1, k + 1)];
    let tx = c.x - a.x, tz = c.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz, nz = tx;
    const deck = bridgeDeckAt(bridges, road, p.x, p.z);
    const mask = markings ? THREE.MathUtils.smoothstep(index.otherClearance(p.x, p.z, road.id), 2, 8) : 0;
    for (let ci = 0; ci < cols; ci++) {
      // on bridge decks the asphalt stops at the kerb (no gravel shoulder hanging past the parapets)
      const o = deck !== null && asphalt ? Math.sign(offs[ci]) * Math.min(Math.abs(offs[ci]), hw + 0.45) : offs[ci];
      const x = p.x + nx * o, z = p.z + nz * o;
      let y: number;
      if (deck !== null) {
        y = deck + 0.03;
        _n.set(0, 1, 0);
      } else {
        y = world.getHeight(x, z) + LIFT;
        world.getNormal(x, z, _n);
      }
      b.pos.push(x, y, z);
      b.nrm.push(_n.x, _n.y, _n.z);
      b.uv.push(o, p.s);
      b.info.push(hw, mask, asphalt ? 0 : 1, markings);
      b.sh.push(asphalt && deck === null ? THREE.MathUtils.smoothstep(index.otherClearance(x, z, road.id), -0.5, 2.0) : 0);
    }
  }
  for (let k = 0; k < pts.length - 1; k++)
    for (let ci = 0; ci < cols - 1; ci++) {
      const i0 = base + k * cols + ci, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      // across = left→right of travel, so (along x across) faces up with this winding
      b.idx.push(i0, i1, i2, i1, i3, i2);
    }
}

function addPad(b: Builder, world: World, p: GroundPatchDef): void {
  const pad = 1.5, step = 3;
  const hw = p.w / 2 + pad, hd = p.d / 2 + pad;
  const nx = Math.max(2, Math.ceil((2 * hw) / step)), nz = Math.max(2, Math.ceil((2 * hd) / step));
  const c = Math.cos(p.rotation), s = Math.sin(p.rotation);
  const base = b.pos.length / 3;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const lx = -hw + (2 * hw * i) / nx, lz = -hd + (2 * hd * j) / nz;
      const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
      const y = world.getHeight(x, z) + LIFT * 0.8;
      world.getNormal(x, z, _n);
      b.pos.push(x, y, z);
      b.nrm.push(_n.x, _n.y, _n.z);
      b.uv.push(rectSd(x, z, p.x, p.z, p.w / 2, p.d / 2, c, s), 0);
      b.info.push(0, 0, 2, 0);
      b.sh.push(0);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const i0 = base + j * (nx + 1) + i, i1 = i0 + 1, i2 = i0 + nx + 1, i3 = i2 + 1;
      b.idx.push(i0, i2, i1, i1, i2, i3);
    }
}

export class RoadMeshes {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;

  constructor(world: World, uniforms: RoadUniforms) {
    const L = world.layout;
    const index = new RoadIndex(L.roadDefs);
    const b = newBuilder();
    // dirt first, asphalt on top (draw order within the merged mesh follows index order)
    for (const p of L.groundPatches) if (p.surface === 'concrete') addPad(b, world, p);
    for (const r of L.roadDefs) if (r.kind === 'dirt') addRoad(b, world, r, L.bridges, index);
    for (const r of L.roadDefs) if (r.kind === 'asphalt') addRoad(b, world, r, L.bridges, index);
    this.material = createRoadMaterial(uniforms);
    this.mesh = new THREE.Mesh(toGeometry(b), this.material);
    this.mesh.name = 'roads';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }
}
