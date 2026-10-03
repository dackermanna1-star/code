/**
 * Physical block debris: randomly sized sub-cubes cut out of a destroyed block (correct
 * texture sub-regions, rendered with the terrain G-buffer materials), simulated as Rapier
 * bodies that fly, tumble, bounce, settle, then shrink away.
 */
import * as THREE from 'three';
import { BLOCKS, facesFor, type BlockDef } from '../world/blocks/registry';
import { TEXTURE_INDEX } from '../render/materials/textureList';
import { octEncode } from '../render/mesher';
import type { World } from '../world/world';
import { blockMaterial } from './materials';
import { GROUP, type PhysBody, type PhysicsWorld } from './rapierWorld';

// face param conventions shared with the mesher (Dir order DOWN UP NORTH SOUTH WEST EAST)
const FN: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const FACE_OCT = FN.map(([x, y, z]) => octEncode(x, y, z));
const KEYS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
function faceUV(d: number, x: number, y: number, z: number): [number, number] {
  switch (d) {
    case 0: return [x, z];
    case 1: return [x, 1 - z];
    case 2: return [1 - x, y];
    case 3: return [x, y];
    case 4: return [z, y];
    default: return [1 - z, y];
  }
}
function rotUV(u: number, v: number, r: number): [number, number] {
  switch (r) {
    case 90: return [v, 1 - u];
    case 180: return [1 - u, 1 - v];
    case 270: return [1 - v, u];
    default: return [u, v];
  }
}

/** Face textures + rotations of a cube block state (axis-oriented logs handled). */
function cubeFaceTextures(def: BlockDef, meta: number): { tex: string[]; rot: number[] } {
  let f = facesFor(def, meta);
  const rot = [0, 0, 0, 0, 0, 0];
  if (def.orient === 'axis') {
    const axis = meta & 3;
    if (axis === 1) {
      f = { up: f.north, down: f.north, north: f.north, south: f.north, west: f.up, east: f.up };
      rot[0] = rot[1] = rot[2] = rot[3] = 90;
    } else if (axis === 2) {
      f = { up: f.north, down: f.north, north: f.up, south: f.up, west: f.north, east: f.north };
      rot[4] = rot[5] = 90;
    }
  }
  return { tex: KEYS.map((k) => f[k]), rot };
}

export interface FragmentOptions {
  /** Packed world light (sky<<12|r<<8|g<<4|b). */
  light?: number;
  /** Biome tint 0xRRGGBB for tinted textures. */
  tint?: number;
}

/**
 * Geometry (terrain vertex format + a float `position` for shadow casting) of the sub-box
 * [x0,x1]×[y0,y1]×[z0,z1] (block units 0..1) of a block, centred on the sub-box centre.
 */
export function createFragmentGeometry(state: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: FragmentOptions = {}): THREE.BufferGeometry {
  const def = BLOCKS[state >>> 4];
  const { tex, rot } = cubeFaceTextures(def, state & 15);
  const L = o.light ?? 15 << 12;
  const sky = ((L >>> 12) & 15) * 17, lr = ((L >>> 8) & 15) * 17, lg = ((L >>> 4) & 15) * 17, lb = (L & 15) * 17;
  let tint = 0xffffff;
  if (def.tint === 'grass' || def.tint === 'foliage') tint = o.tint ?? 0x7fb238;
  else if (typeof def.tint === 'number') tint = def.tint;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const pos = new Uint16Array(24 * 4), tx = new Uint16Array(24 * 4), li = new Uint8Array(24 * 4), co = new Uint8Array(24 * 4);
  const fp = new Float32Array(24 * 3);
  const idx = new Uint16Array(36);
  let n = 0;
  const corners = (d: number): [number, number, number][] => {
    switch (d) {
      case 0: return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
      case 1: return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
      case 2: return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
      case 3: return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      case 4: return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
      default: return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
    }
  };
  for (let d = 0; d < 6; d++) {
    const layer = TEXTURE_INDEX.get(tex[d]) ?? 0;
    const t = def.shape === 'grass_block' && tex[d] === 'dirt' ? 0xffffff : tint;
    const cs = corners(d);
    const base = n;
    for (const [x, y, z] of cs) {
      let [u, v] = faceUV(d, x, y, z);
      if (rot[d]) [u, v] = rotUV(u, v, rot[d]);
      const i = n * 4;
      // local position relative to the fragment centre, stored with the mesher's +8 bias
      pos[i] = Math.round((x - cx + 8) * 256);
      pos[i + 1] = Math.round((y - cy + 8) * 256);
      pos[i + 2] = Math.round((z - cz + 8) * 256);
      pos[i + 3] = FACE_OCT[d];
      tx[i] = Math.round(u * 4096);
      tx[i + 1] = Math.round(v * 4096);
      tx[i + 2] = layer;
      tx[i + 3] = 32; // no parallax on small chunks
      li[i] = sky; li[i + 1] = lr; li[i + 2] = lg; li[i + 3] = lb;
      co[i] = (t >> 16) & 255; co[i + 1] = (t >> 8) & 255; co[i + 2] = t & 255;
      co[i + 3] = d === 0 ? 190 : d === 1 ? 255 : 225;
      fp[n * 3] = x - cx; fp[n * 3 + 1] = y - cy; fp[n * 3 + 2] = z - cz;
      n++;
    }
    const q = d * 6;
    idx[q] = base; idx[q + 1] = base + 1; idx[q + 2] = base + 2; idx[q + 3] = base; idx[q + 4] = base + 2; idx[q + 5] = base + 3;
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 4);
  pa.gpuType = THREE.IntType;
  const ta = new THREE.BufferAttribute(tx, 4);
  ta.gpuType = THREE.IntType;
  g.setAttribute('a_pos', pa);
  g.setAttribute('a_tex', ta);
  g.setAttribute('a_light', new THREE.BufferAttribute(li, 4, true));
  g.setAttribute('a_color', new THREE.BufferAttribute(co, 4, true));
  g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.01);
  return g;
}

interface Fragment {
  mesh: THREE.Mesh;
  body: PhysBody;
  age: number;
  life: number;
  still: number;
  shrink: number;
}

export interface DebrisHost {
  world: World;
  physics: PhysicsWorld | null;
  renderer?: { blockMaterials(): { opaque: THREE.Material; cutout: THREE.Material } } | null;
}

/** Owns all debris fragments (one scene, rendered into the G-buffer and shadow maps). */
export class DebrisManager {
  readonly scene = new THREE.Scene();
  private frags: Fragment[] = [];
  /** Max simultaneous fragments. */
  maxFragments = 160;
  private _p = new THREE.Vector3();
  private _q = new THREE.Quaternion();

  constructor(private host: DebrisHost) {
    this.scene.matrixWorldAutoUpdate = true;
  }

  get count() {
    return this.frags.length;
  }

  /**
   * Spawn `n` fragments of the block `state` that was at (bx,by,bz), flying away from `center`
   * with speed scaled by `strength` (m/s at the block).
   */
  spawn(state: number, bx: number, by: number, bz: number, center: THREE.Vector3, strength: number, n = 2, rand: () => number = Math.random) {
    const pw = this.host.physics;
    const r = this.host.renderer;
    if (!pw || !r || !state) return;
    const def = BLOCKS[state >>> 4];
    if (!def || def.shape === 'liquid' || !def.solid && def.shape !== 'leaves') return;
    const mats = r.blockMaterials();
    const mat = def.layer === 'opaque' ? mats.opaque : mats.cutout;
    const w = this.host.world;
    const light = Math.max(w.getLight(bx, by, bz), w.getLight(bx, by + 1, bz));
    const chunk = w.getChunk(bx >> 4, bz >> 4);
    const ci = (bz & 15) * 16 + (bx & 15);
    const tint = def.tint === 'foliage' ? chunk?.foliageColor[ci] : chunk?.grassColor[ci];
    const pm = blockMaterial(def);
    for (let i = 0; i < n; i++) {
      while (this.frags.length >= this.maxFragments) this.kill(this.frags[0]);
      const big = rand() < 0.25;
      const sx = 0.14 + rand() * (big ? 0.42 : 0.26), sy = 0.14 + rand() * (big ? 0.42 : 0.26), sz = 0.14 + rand() * (big ? 0.42 : 0.26);
      const x0 = rand() * (1 - sx), y0 = rand() * (1 - sy), z0 = rand() * (1 - sz);
      const geo = createFragmentGeometry(state, x0, y0, z0, x0 + sx, y0 + sy, z0 + sz, { light, tint });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      const p = new THREE.Vector3(bx + x0 + sx / 2, by + y0 + sy / 2, bz + z0 + sz / 2);
      const dir = p.clone().sub(center);
      const dist = Math.max(0.3, dir.length());
      dir.divideScalar(dist);
      dir.y += 0.35 + rand() * 0.4;
      dir.x += (rand() - 0.5) * 0.5;
      dir.z += (rand() - 0.5) * 0.5;
      dir.normalize();
      const speed = strength * (0.55 + rand() * 0.7);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 0.3, rand() * 0.3, rand() * 0.3));
      const body = pw.addBody({
        kind: 'debris',
        position: p,
        rotation: q,
        linvel: dir.multiplyScalar(speed),
        angvel: { x: (rand() - 0.5) * 2 * (4 + speed), y: (rand() - 0.5) * 2 * (4 + speed), z: (rand() - 0.5) * 2 * (4 + speed) },
        shape: { type: 'box', half: [sx * 0.49, sy * 0.49, sz * 0.49] },
        density: Math.min(pm.density, 2600),
        friction: pm.friction,
        restitution: Math.min(0.6, pm.restitution + 0.05),
        group: GROUP.DEBRIS,
        linearDamping: 0.08,
        angularDamping: 0.3,
        ccd: speed > 14,
        buoyancy: pm.density < 1000 ? 1.4 : 0.6,
      });
      body.userData.sound = def.sound;
      const frag: Fragment = { mesh, body, age: 0, life: 7 + rand() * 6, still: 0, shrink: 1 };
      body.owner = frag;
      mesh.position.copy(p);
      mesh.quaternion.copy(q);
      this.scene.add(mesh);
      this.frags.push(frag);
    }
  }

  /** Per-frame: interpolate transforms, age, shrink and remove settled fragments. */
  update(dt: number, alpha: number) {
    for (let i = this.frags.length - 1; i >= 0; i--) {
      const f = this.frags[i];
      if (f.body.removed) { this.kill(f); continue; }
      f.age += dt;
      f.still = f.body.sleeping ? f.still + dt : 0;
      // settled pieces leave sooner; everything goes after its lifetime
      if (f.age > f.life || f.still > 3.5 + (i % 7) * 0.4) f.shrink -= dt / 0.8;
      if (f.shrink <= 0) { this.kill(f); continue; }
      f.body.interpolate(alpha, this._p, this._q);
      f.mesh.position.copy(this._p);
      f.mesh.quaternion.copy(this._q);
      f.mesh.scale.setScalar(f.shrink < 1 ? Math.max(0.01, f.shrink * f.shrink) : 1);
    }
  }

  private kill(f: Fragment) {
    const i = this.frags.indexOf(f);
    if (i >= 0) this.frags.splice(i, 1);
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    if (!f.body.removed) this.host.physics?.removeBody(f.body);
  }

  clear() {
    for (const f of [...this.frags]) this.kill(f);
  }
}
