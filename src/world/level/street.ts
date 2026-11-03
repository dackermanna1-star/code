import * as THREE from 'three';
import type { LevelKit } from './kit';
import { boxGeo } from './kit';
import type { Materials } from './materials';
import { put, signBoard } from './blocks';
import { car, shopTexture, windowAtlas } from '../alley';
import { neonTexture } from '../city';
import { canvas, tex } from '../mapKit';
import { RNG } from '../../core/math';

/**
 * A city street's pieces, for the story's levels: buildings with lit and dark windows, shop
 * fronts with their glass, their signs and awnings, parked cars and a cab, a bus stop, hydrants,
 * benches, bags of rubbish, a manhole's steam, a club's velvet rope.
 */

/** The upper floors' windows: one material for a whole level (lit kitchens, TVs, curtains, dark). */
export class Windows {
  mat: THREE.MeshStandardMaterial;
  n: number;
  private geos: THREE.BufferGeometry[] = [];
  constructor(seed = 81) {
    const w = windowAtlas(seed);
    this.n = w.n;
    this.mat = new THREE.MeshStandardMaterial({ map: w.map, emissiveMap: w.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.1 });
  }
  /** A window at (cx, cy, cz) facing ry, w x h, one of the atlas's kinds. */
  add(cx: number, cy: number, cz: number, ry: number, w: number, h: number, kind: number) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) uv[i] = (kind + uv[i]) / this.n;
    geo.rotateY(ry);
    geo.translate(cx, cy, cz);
    this.geos.push(geo);
  }
  /**
   * Rows of windows across a face from (x0, z0) to (x1, z1), facing outward on the side `ry`
   * looks to: floors from y0 every `floorH`, a window every `pitch` m.
   */
  face(k: LevelKit, M: Materials, x0: number, z0: number, x1: number, z1: number, y0: number, floors: number, rng: RNG, o: { floorH?: number; pitch?: number; w?: number; h?: number; sills?: boolean; skip?: (i: number, f: number) => boolean } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    // outward normal: the face's left as you walk from 0 to 1
    const nx = uz, nz = -ux;
    const ry = Math.atan2(nx, nz);
    const pitch = o.pitch ?? 3.2, fh = o.floorH ?? 3.1;
    const n = Math.max(1, Math.floor(len / pitch));
    const off = (len - (n - 1) * pitch) / 2;
    for (let f = 0; f < floors; f++) {
      const cy = y0 + f * fh;
      for (let i = 0; i < n; i++) {
        if (o.skip?.(i, f)) continue;
        const t = off + i * pitch;
        const cx = x0 + ux * t + nx * 0.03, cz = z0 + uz * t + nz * 0.03;
        this.add(cx, cy, cz, ry, o.w ?? 1.25, o.h ?? 1.55, Math.floor(rng.next() * this.n));
        if (o.sills !== false) put(k, new THREE.BoxGeometry((o.w ?? 1.25) + 0.2, 0.08, 0.14), M.concrete(0x8a8680), cx + nx * 0.05, cy - (o.h ?? 1.55) / 2 - 0.04, cz + nz * 0.05, ry, false);
      }
    }
  }
  finish(k: LevelKit) {
    if (!this.geos.length) return;
    // (one draw for all of them; out-of-view culling is per chunk of the level, in groups of 80)
    for (let i = 0; i < this.geos.length; i += 80) {
      const part = this.geos.slice(i, i + 80);
      const merged = part.length === 1 ? part[0] : (mergeAll(part) as THREE.BufferGeometry);
      const m = new THREE.Mesh(merged, this.mat);
      m.matrixAutoUpdate = false;
      k.g.add(m);
    }
    this.geos = [];
  }
}
function mergeAll(geos: THREE.BufferGeometry[]) {
  // (all PlaneGeometry: indexed, same attributes)
  let vc = 0, ic = 0;
  for (const g of geos) {
    vc += g.attributes.position.count;
    ic += g.index!.count;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += g.attributes.position.count;
    io += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** A building: a solid block (its top a roof she can stand on), its faces in `mat`. */
export function block(k: LevelKit, x0: number, x1: number, z0: number, z1: number, h: number, mat: THREE.Material, o: { name?: string; walk?: boolean; tile?: number; y0?: number; climb?: boolean } = {}) {
  return k.solid([x0, x1, o.y0 ?? 0, (o.y0 ?? 0) + h, z0, z1], mat, { kind: 'wall', name: o.name ?? 'building', walk: o.walk ?? true, tile: o.tile ?? 2.2, climb: o.climb ?? false });
}

/** A parapet round a roof's edge (a knee-high wall: she can't fall off, she can climb over). */
export function parapet(k: LevelKit, M: Materials, x0: number, x1: number, z0: number, z1: number, y: number, h = 0.95, t = 0.25, open: ('n' | 's' | 'e' | 'w')[] = []) {
  const mat = M.concrete(0x8a8680);
  if (!open.includes('n')) k.solid([x0, x1, y, y + h, z0, z0 + t], mat, { kind: 'wall', name: 'parapet', walk: true });
  if (!open.includes('s')) k.solid([x0, x1, y, y + h, z1 - t, z1], mat, { kind: 'wall', name: 'parapet', walk: true });
  if (!open.includes('w')) k.solid([x0, x0 + t, y, y + h, z0 + t, z1 - t], mat, { kind: 'wall', name: 'parapet', walk: true });
  if (!open.includes('e')) k.solid([x1 - t, x1, y, y + h, z0 + t, z1 - t], mat, { kind: 'wall', name: 'parapet', walk: true });
}

/**
 * A shop's front on a building's face at (x, z), facing ry, w wide: the lit window (stock on the
 * shelves), the door, the sign over it - neon or painted - and maybe an awning.
 */
export function shopfront(k: LevelKit, M: Materials, rng: RNG, x: number, z: number, ry: number, w: number, o: { sign?: string; neon?: string; color?: string; awning?: number; shutter?: boolean; lit?: boolean; light?: number } = {}) {
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  const s = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const at = (u: number, y: number, out = 0.02) => new THREE.Vector3(x + s.x * u + f.x * out, y, z + s.z * u + f.z * out);
  // the frame (dark metal) round the glass
  const frame = M.iron();
  put(k, new THREE.BoxGeometry(w, 0.18, 0.12), frame, x + f.x * 0.06, 2.75, z + f.z * 0.06, ry, false);
  put(k, new THREE.BoxGeometry(w, 0.5, 0.1), frame, x + f.x * 0.05, 0.25, z + f.z * 0.05, ry, false);
  if (o.shutter) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 2.25), M.shutter(rng.int(1, 9)));
    m.position.copy(at(0, 1.6, 0.04));
    m.rotation.y = ry;
    k.g.add(m);
  } else {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 2.2), new THREE.MeshBasicMaterial({ map: shopTexture(rng), color: o.lit === false ? 0x3a3630 : 0xc8bcae }));
    glass.position.copy(at(-w * 0.17, 1.6, 0.03));
    glass.rotation.y = ry;
    k.g.add(glass);
    // the door (glass, the inside's light through it)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.26, 2.25), new THREE.MeshBasicMaterial({ color: o.lit === false ? 0x16140f : 0x8a7a5a }));
    door.position.copy(at(w * 0.33, 1.42, 0.03));
    door.rotation.y = ry;
    k.g.add(door);
    if (o.lit !== false) k.spot(at(0, 2.0, 1.1), 0xffe0b0, o.light ?? 14, 7);
  }
  // the sign
  if (o.neon) {
    const t = neonTexture([o.neon], o.color ?? '#ff3a6a', 1024, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, 4.4), 0.95), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.copy(at(0, 3.45, 0.06));
    m.rotation.y = ry;
    k.g.add(m);
    k.spot(at(0, 3.2, 1.0), new THREE.Color(o.color ?? '#ff3a6a').getHex(), 16, 8);
  } else if (o.sign) {
    const b = signBoard(k, o.sign, 0, 0, 0, ry, Math.min(w, 4.2), 0.7, { bg: o.color ?? '#20242a', fg: '#e8e0cc' });
    b.position.copy(at(0, 3.25, 0.05));
  }
  if (o.awning) awning(k, M, x + f.x * 0.02, z + f.z * 0.02, ry, w, o.awning, o.color ?? '#7a1a1a');
}

/** A canvas awning out over the pavement, striped (scenery, high enough to walk under). */
export function awning(k: LevelKit, M: Materials, x: number, z: number, ry: number, w: number, depth: number, color: string) {
  const [c, cx] = canvas(256, 64);
  for (let i = 0; i < 8; i++) {
    cx.fillStyle = i % 2 ? '#d8d0c0' : color;
    cx.fillRect(i * 32, 0, 32, 64);
  }
  const mat = new THREE.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.85, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(w, depth);
  geo.rotateX(-Math.PI / 2 + 0.32);
  const m = new THREE.Mesh(geo, mat);
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  m.position.set(x + f.x * depth * 0.48, 3.0 - depth * 0.15, z + f.z * depth * 0.48);
  m.rotation.y = ry;
  m.castShadow = true;
  k.g.add(m);
  void M;
}

/** A parked car (she can climb on it), long along `ry`. */
export function parkedCar(k: LevelKit, x: number, z: number, ry: number, color: number, burnt = false) {
  car(k.mk, x, z, ry, color, burnt);
  const along = Math.abs(Math.cos(ry)) > 0.5;
  const hx = along ? 2.15 : 0.92, hz = along ? 0.92 : 2.15;
  k.block([x - hx, x + hx, 0, 1.3, z - hz, z + hz], 'crate', 'car', true);
}
/** A yellow cab, its roof light on. */
export function cab(k: LevelKit, x: number, z: number, ry: number) {
  parkedCar(k, x, z, ry, 0xd8a818);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0xffe8a0 }));
  lamp.position.set(x, 1.66, z);
  lamp.rotation.y = ry + Math.PI / 2;
  k.g.add(lamp);
}
/** A bus shelter: posts, a roof, a lit advertising panel, a bench. */
export function busStop(k: LevelKit, M: Materials, x: number, z: number, ry: number, ad = 'PALEWATER · BETTER LIVES THROUGH SCIENCE') {
  const s = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  for (const u of [-1.6, 1.6]) put(k, new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), M.steel(), x + s.x * u - f.x * 0.5, 1.25, z + s.z * u - f.z * 0.5, 0, true);
  put(k, new THREE.BoxGeometry(3.6, 0.08, 1.4), M.steel(), x, 2.5, z, ry, true);
  put(k, new THREE.BoxGeometry(2.6, 0.08, 0.4), M.steel(), x - f.x * 0.3, 0.48, z - f.z * 0.3, ry, true);
  const panel = signBoard(k, ad, 0, 0, 0, ry, 1.2, 1.8, { bg: '#e8f0f4', fg: '#1a3a5a', lit: true, font: '"Oswald", sans-serif' });
  panel.position.set(x + s.x * 1.75 - f.x * 0.5, 1.35, z + s.z * 1.75 - f.z * 0.5);
  panel.rotation.y = ry + Math.PI / 2;
  k.spot([x, 2.2, z], 0xd8eaff, 8, 5);
  k.block([x - 0.15 + s.x * 0, x + 0.15, 0, 2.5, z - 0.15, z + 0.15], 'pillar', 'bus stop');
}
/** A fire hydrant. */
export function hydrant(k: LevelKit, M: Materials, x: number, z: number) {
  put(k, new THREE.CylinderGeometry(0.12, 0.15, 0.7, 10), M.paint(0xb82a1a, 0.5, 0.2), x, 0.35, z, 0, true);
  put(k, new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.paint(0xb82a1a, 0.5, 0.2), x, 0.7, z, 0, false);
}
/** A heap of black rubbish bags against a wall. */
export function trashBags(k: LevelKit, M: Materials, rng: RNG, x: number, z: number, n = 4) {
  const mat = M.paint(0x0c0c0e, 0.25, 0.05);
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(0.32 + rng.next() * 0.12, 9, 7);
    g.scale(1, 0.78, 0.9);
    put(k, g, mat, x + (rng.next() - 0.5) * 0.9, 0.25, z + (rng.next() - 0.5) * 0.9, rng.next() * 6, true);
  }
}
/** A bench (she can step up on it). */
export function bench(k: LevelKit, M: Materials, x: number, z: number, ry: number) {
  const s = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  put(k, new THREE.BoxGeometry(1.8, 0.06, 0.45), M.wood(), x, 0.46, z, ry, true);
  put(k, new THREE.BoxGeometry(1.8, 0.4, 0.05), M.wood(), x - Math.sin(ry) * 0.22, 0.75, z - Math.cos(ry) * 0.22, ry, true);
  for (const u of [-0.8, 0.8]) put(k, new THREE.BoxGeometry(0.06, 0.46, 0.4), M.iron(), x + s.x * u, 0.23, z + s.z * u, ry, false);
}
/** Steam rising from a manhole (a few drifting sprites). */
export function steam(k: LevelKit, x: number, z: number, strength = 1) {
  const [c, cx] = canvas(64, 64);
  const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(220,220,225,0.55)');
  gr.addColorStop(1, 'rgba(220,220,225,0)');
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 64, 64);
  const t = tex(c, true, false);
  const puffs: { s: THREE.Sprite; t: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
    k.g.add(s);
    puffs.push({ s, t: i / 7 });
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }));
  disc.position.set(x, 0.012, z);
  k.g.add(disc);
  k.updates.push((dt) => {
    for (const p of puffs) {
      p.t = (p.t + dt * 0.22) % 1;
      const y = p.t * 3.2;
      p.s.position.set(x + Math.sin(p.t * 6 + y) * 0.2, 0.2 + y, z + Math.cos(p.t * 5) * 0.15);
      p.s.scale.setScalar((0.6 + p.t * 2.2) * strength);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(p.t * Math.PI) * 0.32 * strength;
    }
  });
}
/** Velvet rope on brass posts, from a to b (a club's queue). */
export function velvetRope(k: LevelKit, M: Materials, x0: number, z0: number, x1: number, z1: number) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6) + 1);
  const brass = M.paint(0xb8903a, 0.25, 0.9);
  const rope = M.paint(0x6a0a14, 0.6, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    put(k, new THREE.CylinderGeometry(0.035, 0.05, 0.95, 8), brass, x, 0.47, z, 0, true);
    put(k, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), brass, x, 0.02, z, 0, false);
    if (i > 0) {
      const px = x0 + (x1 - x0) * ((i - 1) / (n - 1)), pz = z0 + (z1 - z0) * ((i - 1) / (n - 1));
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        pts.push(new THREE.Vector3(px + (x - px) * u, 0.86 - Math.sin(u * Math.PI) * 0.16, pz + (z - pz) * u));
      }
      k.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.022, 5), rope, false);
    }
  }
  k.block([Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, 0, 0.95, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08], 'prop', 'rope');
}
/** A newspaper box / an electrical cabinet: a little box on the pavement. */
export function streetBox(k: LevelKit, M: Materials, x: number, z: number, ry: number, color: number, h = 1.05) {
  put(k, new THREE.BoxGeometry(0.5, h, 0.45), M.paint(color, 0.5, 0.3), x, h / 2, z, ry, true);
  k.block([x - 0.28, x + 0.28, 0, h, z - 0.28, z + 0.28], 'prop', 'box', true);
}
export { boxGeo };
