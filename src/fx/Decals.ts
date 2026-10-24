import * as THREE from 'three';
import { Rng } from '../core/math';

/** Decal atlas cells (8x8 grid of 32px cells). */
export const DECAL = {
  SPLAT: 0, // 0..15 splats
  SPLAT_COUNT: 16,
  DROP: 16, // 16..23 small drops
  DROP_COUNT: 8,
  STREAK: 24, // 24..31 directional streaks
  STREAK_COUNT: 8,
  POOL: 32, // 32..35 pools
  POOL_COUNT: 4,
  FOOT_L: 36,
  FOOT_R: 37,
  SPILL: 40, // 40..43 liquid spills
  SPILL_COUNT: 4,
  CRACK: 44, // 44..47 cracks / dents
  CRACK_COUNT: 4,
  SCUFF: 48,
  SCUFF_COUNT: 4,
} as const;

const CELL = 32;
const GRID = 8;

function makeAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = CELL * GRID;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const rng = new Rng(4242);
  const cellXY = (i: number) => [(i % GRID) * CELL, Math.floor(i / GRID) * CELL];

  // white = full intensity; instance color tints. Alpha used for cutout.
  const blob = (ox: number, oy: number, cx: number, cy: number, r: number, shade = 255) => {
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= r + (rng.next() - 0.5) * 0.9) {
          const px = Math.round(cx + x),
            py = Math.round(cy + y);
          if (px < 1 || py < 1 || px >= CELL - 1 || py >= CELL - 1) continue;
          const v = Math.max(120, shade - Math.round(rng.next() * 40) - (d / r > 0.75 ? 30 : 0));
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(ox + px, oy + py, 1, 1);
        }
      }
  };

  // splats
  for (let i = 0; i < DECAL.SPLAT_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.SPLAT + i);
    const n = 3 + rng.int(0, 4);
    blob(ox, oy, 16, 16, 5 + rng.range(0, 4));
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(4, 10);
      blob(ox, oy, 16 + Math.cos(a) * d, 16 + Math.sin(a) * d, rng.range(1.5, 4));
    }
    for (let k = 0; k < 6 + rng.int(0, 8); k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(9, 14);
      blob(ox, oy, 16 + Math.cos(a) * d, 16 + Math.sin(a) * d, rng.range(0.4, 1.4));
    }
  }
  // drops
  for (let i = 0; i < DECAL.DROP_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.DROP + i);
    blob(ox, oy, 16, 16, rng.range(3, 6));
    for (let k = 0; k < 3; k++) blob(ox, oy, 16 + rng.range(-8, 8), 16 + rng.range(-8, 8), rng.range(0.6, 1.6));
  }
  // streaks (directional: elongated along +x)
  for (let i = 0; i < DECAL.STREAK_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.STREAK + i);
    let r = rng.range(3.5, 5);
    for (let x = 6; x < 28; x += 1.5) {
      blob(ox, oy, x, 16 + rng.range(-1, 1), r);
      r *= 0.93;
    }
    for (let k = 0; k < 6; k++) blob(ox, oy, rng.range(18, 30), 16 + rng.range(-7, 7), rng.range(0.5, 1.4));
  }
  // pools
  for (let i = 0; i < DECAL.POOL_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.POOL + i);
    blob(ox, oy, 16, 16, 12, 235);
    for (let k = 0; k < 7; k++) {
      const a = rng.range(0, Math.PI * 2);
      blob(ox, oy, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, rng.range(3, 6), 235);
    }
  }
  // footprints (pointing +y in texture = forward)
  for (const [idx, flip] of [
    [DECAL.FOOT_L, 1],
    [DECAL.FOOT_R, -1],
  ]) {
    const [ox, oy] = cellXY(idx);
    g.fillStyle = 'rgb(230,230,230)';
    const bx = 16 + flip * 1;
    // sole
    for (let y = 6; y < 20; y++) {
      const w = y < 10 ? 3 : 4;
      for (let x = -w; x <= w; x++) if (rng.next() > 0.12) g.fillRect(ox + bx + x, oy + y, 1, 1);
    }
    // heel
    for (let y = 22; y < 28; y++) for (let x = -3; x <= 3; x++) if (rng.next() > 0.15) g.fillRect(ox + bx + x, oy + y, 1, 1);
  }
  // spills
  for (let i = 0; i < DECAL.SPILL_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.SPILL + i);
    blob(ox, oy, 16, 16, 9, 240);
    for (let k = 0; k < 5; k++) blob(ox, oy, 16 + rng.range(-9, 9), 16 + rng.range(-9, 9), rng.range(2, 5), 240);
  }
  // cracks
  for (let i = 0; i < DECAL.CRACK_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.CRACK + i);
    g.fillStyle = 'rgb(255,255,255)';
    for (let k = 0; k < 5; k++) {
      let x = 16,
        y = 16;
      const a0 = rng.range(0, Math.PI * 2);
      for (let s = 0; s < 12; s++) {
        const a = a0 + rng.range(-0.6, 0.6);
        x += Math.cos(a) * 1.1;
        y += Math.sin(a) * 1.1;
        if (x < 1 || y < 1 || x > 30 || y > 30) break;
        g.fillRect(ox + Math.round(x), oy + Math.round(y), 1, 1);
      }
    }
    blob(ox, oy, 16, 16, 2.5);
  }
  // scuffs
  for (let i = 0; i < DECAL.SCUFF_COUNT; i++) {
    const [ox, oy] = cellXY(DECAL.SCUFF + i);
    for (let k = 0; k < 40; k++) blob(ox, oy, 16 + rng.range(-10, 10), 16 + rng.range(-3, 3), rng.range(0.3, 1.0), 200);
  }
  return c;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);

interface DecalSlot {
  growFrom: number;
  growTo: number;
  growT: number;
  growDur: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/**
 * Persistent instanced decals (blood, footprints, spills) on static surfaces.
 * Ring buffer: oldest decals are recycled when the budget is exceeded.
 */
export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private count = 0;
  private uvAttr: THREE.InstancedBufferAttribute;
  private growing: { index: number; slot: DecalSlot }[] = [];
  readonly capacity: number;
  totalBlood = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    const tex = new THREE.CanvasTexture(makeAtlas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    geo.setAttribute('cellUV', this.uvAttr);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: false,
      alphaTest: 0.5,
      roughness: 0.35,
      metalness: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 cellUV;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = cellUV + uv * 0.125;\n#endif');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    // init colors
    this.mesh.setColorAt(0, _c.set(0xffffff));
  }

  /**
   * Add a decal. `normal` is the surface normal; `rot` rotation around normal;
   * `size` in meters; `cell` atlas cell index.
   */
  add(pos: THREE.Vector3, normal: THREE.Vector3, size: number, cell: number, color: THREE.ColorRepresentation, rot = Math.random() * Math.PI * 2, grow = 0): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    this.mesh.count = this.count;
    _q.setFromUnitVectors(Z, normal);
    _q2.setFromAxisAngle(Z, rot);
    _q.multiply(_q2);
    _p.copy(pos).addScaledVector(normal, 0.004 + (i % 7) * 0.0006);
    const startSize = grow > 0 ? size * 0.15 : size;
    _m.compose(_p, _q, _s.set(startSize, startSize, startSize));
    this.mesh.setMatrixAt(i, _m);
    _c.set(color);
    this.mesh.setColorAt(i, _c);
    const cx = (cell % GRID) / GRID;
    const cy = 1 - (Math.floor(cell / GRID) + 1) / GRID;
    this.uvAttr.setXY(i, cx, cy);
    this.uvAttr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // remove any growth record that pointed at this recycled slot
    if (this.growing.length) this.growing = this.growing.filter((g) => g.index !== i);
    if (grow > 0) {
      this.growing.push({ index: i, slot: { growFrom: startSize, growTo: size, growT: 0, growDur: grow, pos: _p.clone(), quat: _q.clone() } });
    }
    return i;
  }

  update(dt: number): void {
    if (this.growing.length === 0) return;
    for (let k = this.growing.length - 1; k >= 0; k--) {
      const g = this.growing[k];
      const s = g.slot;
      s.growT += dt;
      const t = Math.min(1, s.growT / s.growDur);
      const e = 1 - (1 - t) * (1 - t);
      const size = s.growFrom + (s.growTo - s.growFrom) * e;
      _m.compose(s.pos, s.quat, _s.set(size, size, size));
      this.mesh.setMatrixAt(g.index, _m);
      if (t >= 1) this.growing.splice(k, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.cursor = 0;
    this.count = 0;
    this.mesh.count = 0;
    this.growing.length = 0;
    this.totalBlood = 0;
  }
}

export function bloodColor(fresh = true): THREE.Color {
  const r = 0.55 + Math.random() * 0.25;
  return new THREE.Color(fresh ? r : r * 0.6, Math.random() * 0.03, Math.random() * 0.03);
}
