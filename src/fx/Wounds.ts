import * as THREE from 'three';
import { G } from '../core/G';
import { PixelCanvas, toTexture } from '../render/textures';
import { mulberry32 } from '../core/math';
import { PART_COUNT, partDef } from '../zombies/skeleton';
import type { BodyDef } from '../zombies/skeleton';

/**
 * Bullet wounds pinned to body parts. A wound lives in its part's local frame
 * (meters, relative to the part pivot), so it follows the limb through walk
 * cycles, hit reactions, ragdolls and finally the settled corpse.
 */
export interface Wound {
  part: number;
  /** position in the part frame (meters) */
  lx: number;
  ly: number;
  lz: number;
  /** orientation of the decal quad in the part frame */
  q: THREE.Quaternion;
  size: number;
  cell: number;
}

export type WoundKind = 'bullet' | 'pellet' | 'exit' | 'heavy' | 'laser';

const CELLS = 8; // atlas: 8 cells of 16x16
const CELL_OF: Record<WoundKind, [number, number]> = {
  bullet: [0, 2],
  pellet: [2, 2],
  exit: [4, 2],
  heavy: [6, 1],
  laser: [7, 1],
};
// exaggerated so a wound reads at the game's pixel scale from 10-20 m
const SIZE_OF: Record<WoundKind, [number, number]> = {
  bullet: [0.1, 0.13],
  pellet: [0.065, 0.085],
  exit: [0.15, 0.2],
  heavy: [0.18, 0.24],
  laser: [0.11, 0.14],
};
/** Wounds kept per body; the oldest small ones make room. */
const MAX_PER_BODY = 18;
const MAX_DYNAMIC = 4096;
const MAX_STATIC = 16384;

const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _roll = new THREE.Quaternion();

function makeAtlas() {
  const S = 16;
  const pc = new PixelCanvas(S * CELLS, S);
  const rnd = mulberry32(913);
  const put = (cx: number, x: number, y: number, c: [number, number, number], a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    pc.set(cx * S + x, y, c[0], c[1], c[2], a);
  };
  const HOLE: [number, number, number] = [18, 3, 4];
  const DARK: [number, number, number] = [74, 8, 10];
  const RED: [number, number, number] = [132, 16, 18];
  const BRIGHT: [number, number, number] = [178, 30, 28];
  const FLESH: [number, number, number] = [196, 104, 92];
  const SCORCH: [number, number, number] = [26, 20, 16];
  const EMBER: [number, number, number] = [210, 110, 40];
  for (let cell = 0; cell < CELLS; cell++) {
    const kind = cell < 2 ? 'bullet' : cell < 4 ? 'pellet' : cell < 6 ? 'exit' : cell === 6 ? 'heavy' : 'laser';
    const c = S / 2 - 0.5;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x - c;
        const dy = y - c;
        const d = Math.hypot(dx, dy) + (rnd() - 0.5) * (kind === 'exit' || kind === 'heavy' ? 2.2 : 1.1);
        if (kind === 'laser') {
          if (d < 2.2) put(cell, x, y, HOLE);
          else if (d < 4.5) put(cell, x, y, rnd() < 0.25 ? EMBER : SCORCH);
          else if (d < 6.5 && rnd() < 0.5) put(cell, x, y, SCORCH, 255);
          continue;
        }
        const r0 = kind === 'pellet' ? 1.6 : kind === 'bullet' ? 2.1 : 3.2;
        const r1 = kind === 'pellet' ? 3.2 : kind === 'bullet' ? 4.2 : 6.2;
        const r2 = kind === 'pellet' ? 4.6 : kind === 'bullet' ? 6.0 : 7.6;
        if (d < r0) put(cell, x, y, HOLE);
        else if (d < r1) put(cell, x, y, (kind === 'exit' || kind === 'heavy') && rnd() < 0.3 ? FLESH : rnd() < 0.5 ? DARK : RED);
        else if (d < r2 && rnd() < 0.55) put(cell, x, y, rnd() < 0.35 ? BRIGHT : RED);
        else if (d < r2 + 2 && rnd() < 0.08) put(cell, x, y, BRIGHT);
      }
  }
  const tex = toTexture(pc.commit(), { mipmaps: false });
  return tex;
}

function makeMesh(max: number, tex: THREE.Texture) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  aCell.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCell', aCell);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n  vMapUv = vec2((aCell + uv.x) / ${CELLS}.0, uv.y);`);
  };
  mat.customProgramCacheKey = () => 'wounds';
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, aCell };
}

export class WoundSystem {
  private dyn: { mesh: THREE.InstancedMesh; aCell: THREE.InstancedBufferAttribute };
  private stat: { mesh: THREE.InstancedMesh; aCell: THREE.InstancedBufferAttribute };
  private statNext = 0;
  private statUsed = 0;
  total = 0;

  constructor(scene: THREE.Scene) {
    const tex = makeAtlas();
    this.dyn = makeMesh(MAX_DYNAMIC, tex);
    this.stat = makeMesh(MAX_STATIC, tex);
    scene.add(this.dyn.mesh, this.stat.mesh);
  }

  /**
   * Adds a wound where a ray (direction d) hit part `part` of a posed body at
   * world point h. With `exit`, the wound goes where the ray leaves the part.
   */
  add(list: Wound[], body: BodyDef, pos: Float32Array, quat: Float32Array, scl: Float32Array, part: number, hx: number, hy: number, hz: number, dx: number, dy: number, dz: number, kind: WoundKind) {
    if (part < 0 || part >= PART_COUNT) return;
    const d = partDef(body, part);
    const sx = scl[part * 3], sy = scl[part * 3 + 1], sz = scl[part * 3 + 2];
    _pq.set(quat[part * 4], quat[part * 4 + 1], quat[part * 4 + 2], quat[part * 4 + 3]);
    const inv = _q.copy(_pq).invert();
    // hit point and direction in the part frame
    _p.set(hx - pos[part * 3], hy - pos[part * 3 + 1], hz - pos[part * 3 + 2]).applyQuaternion(inv);
    _n.set(dx, dy, dz).applyQuaternion(inv);
    const cx = d.center[0] * sx, cy = d.center[1] * sy, cz = d.center[2] * sz;
    const hxs = (d.size[0] * sx) / 2, hys = (d.size[1] * sy) / 2, hzs = (d.size[2] * sz) / 2;
    let rx = _p.x - cx, ry = _p.y - cy, rz = _p.z - cz;
    if (kind === 'exit') {
      // walk the ray to where it leaves the box
      let tExit = Infinity;
      const ax = [rx, ry, rz], dv = [_n.x, _n.y, _n.z], hv = [hxs, hys, hzs];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dv[k]) < 1e-6) continue;
        const t = ((dv[k] > 0 ? hv[k] : -hv[k]) - ax[k]) / dv[k];
        if (t > 0 && t < tExit) tExit = t;
      }
      if (!Number.isFinite(tExit)) return;
      rx += _n.x * tExit;
      ry += _n.y * tExit;
      rz += _n.z * tExit;
    }
    // snap onto the nearest face and face the decal outward
    const fx = Math.abs(rx) / hxs, fy = Math.abs(ry) / hys, fz = Math.abs(rz) / hzs;
    let nx = 0, ny = 0, nz = 0;
    if (fx >= fy && fx >= fz) {
      nx = Math.sign(rx) || 1;
      rx = nx * hxs;
    } else if (fy >= fz) {
      ny = Math.sign(ry) || 1;
      ry = ny * hys;
    } else {
      nz = Math.sign(rz) || 1;
      rz = nz * hzs;
    }
    const [c0, cn] = CELL_OF[kind];
    const [s0, s1] = SIZE_OF[kind];
    const size = s0 + Math.random() * (s1 - s0);
    // keep the decal inside the face so it doesn't hang off an edge
    const m = size * 0.35;
    if (nx === 0) rx = THREE.MathUtils.clamp(rx, -hxs + m, hxs - m);
    if (ny === 0) ry = THREE.MathUtils.clamp(ry, -hys + m, hys - m);
    if (nz === 0) rz = THREE.MathUtils.clamp(rz, -hzs + m, hzs - m);
    const q = new THREE.Quaternion().setFromUnitVectors(_z, _s.set(nx, ny, nz));
    q.multiply(_roll.setFromAxisAngle(_z, Math.random() * Math.PI * 2));
    const w: Wound = { part, lx: cx + rx + nx * 0.003, ly: cy + ry + ny * 0.003, lz: cz + rz + nz * 0.003, q, size, cell: c0 + Math.floor(Math.random() * cn) };
    if (list.length >= MAX_PER_BODY) {
      // drop the smallest (pellet specks) first
      let k = 0;
      for (let i = 1; i < list.length; i++) if (list[i].size < list[k].size) k = i;
      list.splice(k, 1);
    }
    list.push(w);
    this.total++;
  }

  /** World position of a wound on a posed body (for blood drips). */
  worldPos(w: Wound, pos: Float32Array, quat: Float32Array, out: THREE.Vector3) {
    const i = w.part;
    _pq.set(quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]);
    return out.set(w.lx, w.ly, w.lz).applyQuaternion(_pq).add(_p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  }

  private write(target: { mesh: THREE.InstancedMesh; aCell: THREE.InstancedBufferAttribute }, idx: number, w: Wound, pos: Float32Array, quat: Float32Array) {
    const i = w.part;
    _pq.set(quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]);
    _p.set(w.lx, w.ly, w.lz).applyQuaternion(_pq);
    _p.x += pos[i * 3];
    _p.y += pos[i * 3 + 1];
    _p.z += pos[i * 3 + 2];
    _q.copy(_pq).multiply(w.q);
    _m.compose(_p, _q, _s.setScalar(w.size));
    target.mesh.setMatrixAt(idx, _m);
    target.aCell.setX(idx, w.cell);
  }

  /** Bakes a settled corpse's wounds into the static ring buffer. */
  bake(list: Wound[], pos: Float32Array, quat: Float32Array, mask: number) {
    const st = this.stat;
    let wrote = false;
    for (const w of list) {
      if (!(mask & (1 << w.part))) continue;
      this.write(st, this.statNext, w, pos, quat);
      this.statNext = (this.statNext + 1) % MAX_STATIC;
      this.statUsed = Math.min(MAX_STATIC, this.statUsed + 1);
      wrote = true;
    }
    if (!wrote) return;
    st.mesh.count = this.statUsed;
    st.mesh.instanceMatrix.needsUpdate = true;
    st.aCell.needsUpdate = true;
  }

  private n = 0;
  beginFrame() {
    this.n = 0;
  }
  /** Draws the wounds of a moving body this frame. */
  push(list: Wound[] | undefined, pos: Float32Array, quat: Float32Array, mask: number) {
    if (!list || list.length === 0) return;
    for (const w of list) {
      if (this.n >= MAX_DYNAMIC) return;
      if (!(mask & (1 << w.part))) continue;
      this.write(this.dyn, this.n++, w, pos, quat);
    }
  }
  endFrame() {
    const d = this.dyn;
    d.mesh.count = this.n;
    if (this.n > 0) {
      d.mesh.instanceMatrix.clearUpdateRanges();
      d.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
      d.mesh.instanceMatrix.needsUpdate = true;
      d.aCell.clearUpdateRanges();
      d.aCell.addUpdateRange(0, this.n);
      d.aCell.needsUpdate = true;
    }
  }

  clear() {
    this.statNext = 0;
    this.statUsed = 0;
    this.stat.mesh.count = 0;
    this.dyn.mesh.count = 0;
    this.total = 0;
  }
}

/** Wound kind for a hit, from the weapon's punch. */
export function woundKindFor(kind: string, damage: number, stopping: number): WoundKind | null {
  if (kind === 'pellet') return 'pellet';
  if (kind === 'laser' || kind === 'particle') return 'laser';
  if (kind !== 'bullet') return null;
  return damage >= 12 || stopping >= 200 ? 'heavy' : 'bullet';
}

void G;
