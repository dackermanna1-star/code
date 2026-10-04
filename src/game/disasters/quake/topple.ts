/**
 * Toppling trees: a tree (trunk + attached leaves) is lifted out of the world into one merged
 * mesh (terrain vertex format, so it is lit exactly like terrain), rotates about the bottom
 * edge of its trunk with rigid-rod dynamics, and when it lies flat its blocks are written back
 * rotated by 90 degrees (the visual and the placed blocks match).
 */
import * as THREE from 'three';
import type { World } from '../../../world/world';
import { BLOCKS, T_REPLACEABLE } from '../../../world/blocks/registry';
import { createFragmentGeometry } from '../../../physics/debris';
import { Mat, matOf } from '../wind/materials';

export interface TreeBlock {
  dx: number;
  dy: number;
  dz: number;
  state: number;
}

export interface Tree {
  /** Trunk base (lowest log). */
  x: number;
  y: number;
  z: number;
  blocks: TreeBlock[];
  height: number;
}

const N6: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Find the tree whose trunk passes through column (x, z) at or below y. Returns null if the
 * column has no trunk standing on the ground or the tree is too big to topple.
 */
export function findTree(w: World, x: number, z: number, yTop: number, maxBlocks = 450): Tree | null {
  let y = yTop;
  // down through leaves/air to the first log
  while (y > 1 && matOf(w.getBlock(x, y, z)) !== Mat.Wood) {
    const m = matOf(w.getBlock(x, y, z));
    if (m === Mat.Ground || m === Mat.Rock || m === Mat.Built) return null;
    y--;
  }
  if (y <= 1) return null;
  while (y > 1 && matOf(w.getBlock(x, y - 1, z)) === Mat.Wood) y--;
  const below = matOf(w.getBlock(x, y - 1, z));
  if (below !== Mat.Ground && below !== Mat.Rock) return null;
  // flood fill logs (near the trunk) and leaves
  const seen = new Set<number>();
  const key = (dx: number, dy: number, dz: number) => ((dx + 64) << 16) | ((dy + 64) << 8) | (dz + 64);
  const blocks: TreeBlock[] = [];
  const stack: [number, number, number][] = [[0, 0, 0]];
  seen.add(key(0, 0, 0));
  let height = 0;
  while (stack.length) {
    const [dx, dy, dz] = stack.pop()!;
    const st = w.getBlock(x + dx, y + dy, z + dz);
    const m = matOf(st);
    if (m !== Mat.Wood && m !== Mat.Leaves) continue;
    if (m === Mat.Wood && (Math.abs(dx) > 1 || Math.abs(dz) > 1) && dy < 3) continue; // a neighbouring trunk
    blocks.push({ dx, dy, dz, state: st });
    height = Math.max(height, dy + 1);
    if (blocks.length > maxBlocks) return null;
    for (const [ox, oy, oz] of N6) {
      const nx = dx + ox, ny = dy + oy, nz = dz + oz;
      if (ny < 0 || ny > 30 || Math.abs(nx) > 6 || Math.abs(nz) > 6) continue;
      const k = key(nx, ny, nz);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny, nz]);
    }
  }
  if (blocks.length < 2 || height < 3) return null;
  return { x, y, z, blocks, height };
}

/** Where a block of a tree falling toward `dir` (0 +x, 1 -x, 2 +z, 3 -z) ends up. */
export function fallenPos(t: Tree, b: TreeBlock, dir: number): [number, number, number] {
  // rotation by 90 degrees about the bottom edge of the trunk on the falling side
  switch (dir) {
    case 0: return [t.x + 1 + b.dy, t.y - b.dx, t.z + b.dz];
    case 1: return [t.x - 1 - b.dy, t.y + b.dx, t.z + b.dz];
    case 2: return [t.x + b.dx, t.y - b.dz, t.z + 1 + b.dy];
    default: return [t.x + b.dx, t.y + b.dz, t.z - 1 - b.dy];
  }
}

/** Merge per-block geometries (terrain vertex format) offset from an origin. */
function mergeBlocks(blocks: { ox: number; oy: number; oz: number; state: number }[], light: number, tint: number): THREE.BufferGeometry | null {
  if (!blocks.length) return null;
  const parts = blocks.map((b) => ({ b, g: createFragmentGeometry(b.state, 0, 0, 0, 1, 1, 1, { light, tint }) }));
  const nv = parts.length * 24;
  const pos = new Uint16Array(nv * 4), tex = new Uint16Array(nv * 4), li = new Uint8Array(nv * 4), co = new Uint8Array(nv * 4);
  const fp = new Float32Array(nv * 3);
  const idx = new Uint32Array(parts.length * 36);
  let v = 0, ii = 0;
  for (const { b, g } of parts) {
    const ap = g.getAttribute('a_pos').array as Uint16Array;
    const at = g.getAttribute('a_tex').array as Uint16Array;
    const al = g.getAttribute('a_light').array as Uint8Array;
    const ac = g.getAttribute('a_color').array as Uint8Array;
    const af = g.getAttribute('position').array as Float32Array;
    const ix = g.getIndex()!.array as Uint16Array;
    const n = ap.length / 4;
    for (let k = 0; k < n; k++) {
      const o = (v + k) * 4;
      pos[o] = ap[k * 4] + Math.round(b.ox * 256);
      pos[o + 1] = ap[k * 4 + 1] + Math.round(b.oy * 256);
      pos[o + 2] = ap[k * 4 + 2] + Math.round(b.oz * 256);
      pos[o + 3] = ap[k * 4 + 3];
      for (let c = 0; c < 4; c++) {
        tex[o + c] = at[k * 4 + c];
        li[o + c] = al[k * 4 + c];
        co[o + c] = ac[k * 4 + c];
      }
      fp[(v + k) * 3] = af[k * 3] + b.ox;
      fp[(v + k) * 3 + 1] = af[k * 3 + 1] + b.oy;
      fp[(v + k) * 3 + 2] = af[k * 3 + 2] + b.oz;
    }
    for (let k = 0; k < ix.length; k++) idx[ii++] = ix[k] + v;
    v += n;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 4);
  pa.gpuType = THREE.IntType;
  const ta = new THREE.BufferAttribute(tex, 4);
  ta.gpuType = THREE.IntType;
  g.setAttribute('a_pos', pa);
  g.setAttribute('a_tex', ta);
  g.setAttribute('a_light', new THREE.BufferAttribute(li, 4, true));
  g.setAttribute('a_color', new THREE.BufferAttribute(co, 4, true));
  g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** One falling tree (visual + final placement). */
export class ToppleTree {
  readonly group = new THREE.Group();
  angle = 0.02;
  private vel = 0;
  done = false;
  private axis = new THREE.Vector3();
  private pivot = new THREE.Vector3();
  constructor(readonly tree: Tree, readonly dir: number, renderer: { blockMaterials(): { opaque: THREE.Material; cutout: THREE.Material } } | null, tint = 0x5f9f3a) {
    const t = tree;
    const sx = dir === 0 ? 1 : dir === 1 ? -1 : 0, sz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    // pivot: bottom edge of the trunk base on the falling side
    this.pivot.set(t.x + 0.5 + sx * 0.5, t.y, t.z + 0.5 + sz * 0.5);
    // rotating the up vector toward the fall direction: axis = up x dir
    this.axis.set(sz, 0, -sx).normalize();
    this.group.position.copy(this.pivot);
    if (renderer) {
      const mats = renderer.blockMaterials();
      const solid: { ox: number; oy: number; oz: number; state: number }[] = [];
      const leaves: { ox: number; oy: number; oz: number; state: number }[] = [];
      for (const b of t.blocks) {
        // block centre relative to the pivot (geometry is centred on the block centre)
        const e = { ox: t.x + b.dx + 0.5 - this.pivot.x, oy: t.y + b.dy + 0.5 - this.pivot.y, oz: t.z + b.dz + 0.5 - this.pivot.z, state: b.state };
        (BLOCKS[b.state >>> 4]?.layer === 'opaque' ? solid : leaves).push(e);
      }
      const light = 15 << 12;
      const gs = mergeBlocks(solid, light, tint), gl = mergeBlocks(leaves, light, tint);
      if (gs) this.group.add(new THREE.Mesh(gs, mats.opaque));
      if (gl) this.group.add(new THREE.Mesh(gl, mats.cutout));
      for (const m of this.group.children) m.frustumCulled = false;
    }
    this.group.updateMatrixWorld(true);
  }

  /** Advance the fall; returns true when the tree lies flat (call `place` then). */
  update(dt: number): boolean {
    if (this.done) return true;
    // rigid rod about its base: theta'' = 3g / (2L) sin(theta)
    const L = Math.max(3, this.tree.height);
    this.vel += ((3 * 20) / (2 * L)) * Math.sin(this.angle + 0.03) * dt;
    this.angle += this.vel * dt;
    if (this.angle >= Math.PI / 2) {
      this.angle = Math.PI / 2;
      this.done = true;
    }
    this.group.quaternion.setFromAxisAngle(this.axis, this.angle);
    this.group.updateMatrixWorld(true);
    return this.done;
  }

  /** Write the fallen tree into the world (only into air / replaceable cells). Returns placed count. */
  place(set: (x: number, y: number, z: number, st: number) => boolean, get: (x: number, y: number, z: number) => number): number {
    let n = 0;
    for (const b of this.tree.blocks) {
      const [x, y, z] = fallenPos(this.tree, b, this.dir);
      const cur = get(x, y, z);
      if (cur && !T_REPLACEABLE[cur >>> 4]) continue;
      let st = b.state;
      // logs lie along the fall direction
      const def = BLOCKS[st >>> 4];
      if (def?.orient === 'axis' && (st & 3) === 0) st = (st & ~3) | (this.dir < 2 ? 1 : 2);
      if (set(x, y, z, st)) n++;
    }
    return n;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.group.children) (m as THREE.Mesh).geometry.dispose();
    this.group.clear();
  }
}
