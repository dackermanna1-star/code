import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Arena, Obstacle, paintQuad } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import { MapKit, MapParts } from '../mapKit';
import { RNG } from '../../core/math';
import type { Dressing } from '../dressing';

/** An axis-aligned box: x0, x1, y0, y1, z0, z1. */
export type Box = [number, number, number, number, number, number];

/** A light in the level: the pool lights the few nearest the player (see LightPool). */
export interface LightSpot {
  p: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  /** 0: steady; else how badly it flickers (a dying tube, a fire). */
  flicker: number;
  /** Switched off (a breaker thrown, a bulb shot out). */
  off?: boolean;
  /** A fire's breathing, a neon's buzz: multiplied in each frame. */
  mod?: (t: number) => number;
  phase: number;
}

export interface SolidOpts {
  /** Registered as an obstacle of this kind (false: scenery only, nothing stops at it). */
  kind?: Obstacle['kind'] | false;
  name?: string;
  /** Its top is a floor. */
  walk?: boolean;
  /** May be vaulted / climbed (default by height). */
  climb?: boolean;
  /** Physics / footing only (an invisible collider: a fence's mesh is drawn separately). */
  hidden?: boolean;
  cast?: boolean;
  /** Metres per texture repeat. */
  tile?: number;
  /** Faces to leave out (the bottom on the floor, a face against a wall). */
  skip?: ('px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz')[];
  material?: string;
}

const CHUNK = 24;
const _v = new THREE.Vector3();

/**
 * A box's faces with texture coordinates in metres (so brick stays brick-sized on any box):
 * indexed, with position, normal and uv.
 */
export function boxGeo(b: Box, tile = 1, skip: SolidOpts['skip'] = []): THREE.BufferGeometry {
  const [x0, x1, y0, y1, z0, z1] = b;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const face = (o: number[], u: number[], v: number[], n: number[], lu: number, lv: number, u0: number, v0: number) => {
    const base = pos.length / 3;
    for (const [a, c] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(o[0] + u[0] * a * lu + v[0] * c * lv, o[1] + u[1] * a * lu + v[1] * c * lv, o[2] + u[2] * a * lu + v[2] * c * lv);
      nor.push(n[0], n[1], n[2]);
      uv.push((u0 + a * lu) / tile, (v0 + c * lv) / tile);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const W = x1 - x0, H = y1 - y0, D = z1 - z0;
  if (!skip.includes('pz')) face([x0, y0, z1], [1, 0, 0], [0, 1, 0], [0, 0, 1], W, H, x0, y0);
  if (!skip.includes('nz')) face([x1, y0, z0], [-1, 0, 0], [0, 1, 0], [0, 0, -1], W, H, -x1, y0);
  if (!skip.includes('px')) face([x1, y0, z1], [0, 0, -1], [0, 1, 0], [1, 0, 0], D, H, -z1, y0);
  if (!skip.includes('nx')) face([x0, y0, z0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], D, H, z0, y0);
  if (!skip.includes('py')) face([x0, y1, z1], [1, 0, 0], [0, 0, -1], [0, 1, 0], W, D, x0, -z1);
  if (!skip.includes('ny')) face([x0, y0, z0], [1, 0, 0], [0, 0, 1], [0, -1, 0], W, D, x0, z0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Only the attributes merged statics keep (position, normal, uv), indexed. */
function plainGeo(g: THREE.BufferGeometry) {
  let out = g.index ? g : g.toNonIndexed();
  if (!out.index) {
    const n = out.attributes.position.count;
    out.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

/**
 * Lights for a whole level on a fixed handful of real lights: every few frames the spots that
 * matter most to where she is (bright and near) get them, fading across so nothing pops - the
 * shaders always see the same number of lights, so nothing recompiles.
 */
export class LightPool {
  lights: THREE.PointLight[] = [];
  private cur: (LightSpot | null)[] = [];
  private want: (LightSpot | null)[] = [];
  private k: number[] = [];
  private acc = 0;
  private t = 0;
  constructor(group: THREE.Group, n: number, public spots: LightSpot[]) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.7);
      l.position.set(0, -100, 0);
      group.add(l);
      this.lights.push(l);
      this.cur.push(null);
      this.want.push(null);
      this.k.push(0);
    }
  }
  private choose(focus: THREE.Vector3) {
    const scored: [LightSpot, number][] = [];
    for (const s of this.spots) {
      if (s.off) continue;
      const d = s.p.distanceTo(focus);
      if (d > s.distance + 14) continue;
      // (bright and near; the ones lit now get a little loyalty, so two equals don't trade places)
      const held = this.cur.includes(s) ? 1.35 : 1;
      scored.push([s, (s.intensity / (1 + (d * d) / (s.distance * s.distance * 0.35))) * held]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const chosen = scored.slice(0, this.lights.length).map((x) => x[0]);
    // keep each chosen spot on the light that has it already; the rest go to free lights
    const next: (LightSpot | null)[] = this.lights.map((_, i) => (this.cur[i] && chosen.includes(this.cur[i]!) ? this.cur[i] : null));
    for (const s of chosen) {
      if (next.includes(s)) continue;
      const free = next.findIndex((x, i) => x === null && !(this.cur[i] && chosen.includes(this.cur[i]!)));
      if (free >= 0) next[free] = s;
    }
    this.want = next;
  }
  update(dt: number, focus: THREE.Vector3) {
    this.t += dt;
    this.acc -= dt;
    if (this.acc <= 0) {
      this.acc = 0.25;
      this.choose(focus);
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (this.cur[i] !== this.want[i]) {
        // fade out what it had, then over to the new spot
        this.k[i] = Math.max(0, this.k[i] - dt * 3.5);
        if (this.k[i] <= 0 || !this.cur[i]) {
          this.cur[i] = this.want[i];
          this.k[i] = 0;
          const s = this.cur[i];
          if (s) {
            l.position.copy(s.p);
            l.color.setHex(s.color);
            l.distance = s.distance;
            l.decay = s.decay;
          }
        }
      } else if (this.cur[i]) this.k[i] = Math.min(1, this.k[i] + dt * 3.5);
      const s = this.cur[i];
      if (!s || s.off) {
        l.intensity = 0;
        if (s?.off) this.k[i] = 0;
        continue;
      }
      let f = 1;
      if (s.flicker) {
        const tt = this.t * 1.0 + s.phase;
        const n = Math.sin(tt * 13.0) * Math.sin(tt * 7.3) * Math.sin(tt * 2.1);
        f = n > 1 - s.flicker * 0.6 ? 0.12 : 0.94 + Math.sin(tt * 40) * 0.04;
      }
      if (s.mod) f *= s.mod(this.t + s.phase);
      l.intensity = s.intensity * this.k[i] * f;
    }
  }
}

/**
 * The toolbox for the story's big levels: boxes of brick and concrete merged into a few meshes
 * per stretch of the level (so what's out of view isn't drawn), floors that take blood at any
 * height, raised platforms to stand on, stairs, ladders, and lights by the dozen on a pool.
 */
export class LevelKit {
  readonly mk: MapKit;
  readonly g: THREE.Group;
  readonly rng: RNG;
  readonly up = new THREE.Vector3(0, 1, 0);
  updates: ((dt: number) => void)[] = [];
  spots: LightSpot[] = [];
  pool: LightPool | null = null;
  private stat = new Map<THREE.Material, Map<string, THREE.BufferGeometry[]>>();
  private cast = new Set<THREE.Material>();
  private paint = new Map<THREE.Material, Map<string, THREE.BufferGeometry[]>>();
  readonly floorDensity: number;
  readonly wallDensity: number;
  readonly propDensity: number;
  /** The shadow-casting key light, kept over the player. */
  key: THREE.DirectionalLight | null = null;
  private keyOff = new THREE.Vector3();
  private keyHalf = 22;

  constructor(public a: Arena, public blood: BloodAtlas, public pointLights: number, public shadowMapSize: number, opts: { bounds: Arena['bounds']; seed?: number; density?: number }) {
    this.mk = new MapKit(a, blood, pointLights, shadowMapSize);
    this.g = a.group;
    this.rng = new RNG(opts.seed ?? 4242);
    a.bounds = { ...opts.bounds };
    a.traversal = true;
    // (a big level shares the blood atlas over much more floor: fewer texels a metre)
    const hi = blood.size >= 4096;
    const k = opts.density ?? 1;
    this.floorDensity = (hi ? 44 : 26) * k;
    this.wallDensity = this.floorDensity * 0.5;
    this.propDensity = this.floorDensity * 0.6;
  }

  // ------------------------------------------------------------------ static geometry
  private chunkKey(g: THREE.BufferGeometry) {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    bb.getCenter(_v);
    return `${Math.floor(_v.x / CHUNK)},${Math.floor(_v.z / CHUNK)}`;
  }
  /** World-space geometry into the level's merged statics. */
  geo(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
    const g = plainGeo(geo);
    const key = this.chunkKey(g);
    let m = this.stat.get(mat);
    if (!m) this.stat.set(mat, (m = new Map()));
    let list = m.get(key);
    if (!list) m.set(key, (list = []));
    list.push(g);
    if (cast) this.cast.add(mat);
  }
  /** A mesh positioned in the world (its transform baked in). */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, cast = true) {
    const g = geo.clone().applyMatrix4(m);
    this.geo(g, mat, cast);
  }
  /** A paintable geometry (built by paintQuad: it has its blood uv). */
  paintGeo(geo: THREE.BufferGeometry, mat: THREE.Material) {
    const key = this.chunkKey(geo);
    let m = this.paint.get(mat);
    if (!m) this.paint.set(mat, (m = new Map()));
    let list = m.get(key);
    if (!list) m.set(key, (list = []));
    list.push(geo);
  }

  /** A box: drawn (merged), and unless told otherwise something fighters stop at. */
  solid(b: Box, mat: THREE.Material | null, o: SolidOpts = {}): Obstacle | null {
    const [x0, x1, y0, y1, z0, z1] = b;
    if (mat && !o.hidden) this.geo(boxGeo(b, o.tile ?? 1, o.skip ?? (y0 <= 0.001 ? ['ny'] : [])), mat, o.cast !== false);
    if (o.kind === false) return null;
    const ob: Obstacle = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h: y1 - y0, kind: o.kind ?? 'wall', name: o.name ?? 'box' };
    if (y0 > 0.001) ob.y0 = y0;
    if (o.walk) ob.walk = true;
    if (o.climb !== undefined) ob.climb = o.climb;
    if (o.material) ob.material = o.material;
    this.a.obstacles.push(ob);
    return ob;
  }
  /** An obstacle only (nothing drawn): an invisible stop, a footing. */
  block(b: Box, kind: Obstacle['kind'] = 'wall', name = 'block', walk = false) {
    return this.solid(b, null, { kind, name, walk, hidden: true });
  }

  // ------------------------------------------------------------------ floors
  /**
   * A floor that takes blood: a quad at height y over the rect (the street, a dock's deck, a roof,
   * a room's boards). `dense`: where fights happen, the full resolution.
   */
  floor(x0: number, x1: number, z0: number, z1: number, mat: THREE.Material, o: { y?: number; tile?: number; dense?: boolean; seg?: number } = {}) {
    const y = o.y ?? 0;
    const w = x1 - x0, d = z1 - z0;
    const tile = o.tile ?? 4;
    const dens = this.floorDensity * (o.dense ? 1.7 : 1);
    const seg = o.seg ?? Math.max(1, Math.round(Math.max(w, d) / 6));
    const geo = paintQuad(this.blood, new THREE.Vector3(x0, y, z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), w, d, [tile, tile], 'floor', dens, seg, seg);
    // world-continuous uv (adjacent floors line up)
    const uv = geo.attributes.uv.array as Float32Array;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      uv[j] = pos[i] / tile;
      uv[j + 1] = -pos[i + 2] / tile;
    }
    this.paintGeo(geo, mat);
    return geo;
  }
  /** A wall face that takes blood up to `paintH` (u runs along it; it faces the side of `n`). */
  paintWall(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, mat: THREE.Material, tile = 2, paintH = 2.6) {
    const u = new THREE.Vector3(x1 - x0, 0, z1 - z0);
    const len = u.length();
    u.normalize();
    const ph = Math.min(h, paintH);
    const geo = paintQuad(this.blood, new THREE.Vector3(x0, y0, z0), u, this.up, len, ph, [tile, tile], 'wall', this.wallDensity, Math.max(1, Math.round(len / 4)), 1);
    this.paintGeo(geo, mat);
    if (h > ph + 0.01) {
      const g = new THREE.PlaneGeometry(len, h - ph);
      const n = new THREE.Vector3().crossVectors(u, this.up);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(u, this.up, n));
      g.translate(x0 + (u.x * len) / 2, y0 + ph + (h - ph) / 2, z0 + (u.z * len) / 2);
      const uv = g.attributes.uv.array as Float32Array;
      for (let i = 0; i < uv.length; i += 2) {
        uv[i] = (uv[i] * len) / tile;
        uv[i + 1] = (ph + uv[i + 1] * (h - ph)) / tile;
      }
      this.geo(g, mat, false);
    }
  }
  /**
   * A raised platform she can stand on (a loading dock, a roof, a landing): its deck takes blood,
   * its sides are drawn with `side` (or not at all).
   */
  deck(x0: number, x1: number, z0: number, z1: number, y: number, top: THREE.Material, side: THREE.Material | null, o: { thick?: number; tile?: number; dense?: boolean; name?: string; climb?: boolean; kind?: Obstacle['kind'] } = {}) {
    const th = o.thick ?? y;
    this.floor(x0, x1, z0, z1, top, { y, tile: o.tile, dense: o.dense });
    if (side) this.geo(boxGeo([x0, x1, y - th, y - 0.002, z0, z1], 1, ['py', ...(y - th <= 0.001 ? ['ny' as const] : [])]), side, true);
    const ob: Obstacle = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h: th, kind: o.kind ?? 'crate', name: o.name ?? 'deck', walk: true };
    if (y - th > 0.001) ob.y0 = y - th;
    if (o.climb !== undefined) ob.climb = o.climb;
    this.a.obstacles.push(ob);
    return ob;
  }
  /**
   * Stairs (or a slope): up from y0 at the low end of `axis` to y1 at the high end (`dir` -1 to
   * rise the other way). Steps are drawn; the footing is a ramp; the sides are open unless walled.
   */
  stairs(x0: number, x1: number, z0: number, z1: number, axis: 'x' | 'z', y0: number, y1: number, mat: THREE.Material, o: { dir?: 1 | -1; steps?: number; walls?: boolean; railMat?: THREE.Material } = {}) {
    const dir = o.dir ?? 1;
    const ry0 = dir > 0 ? y0 : y1, ry1 = dir > 0 ? y1 : y0;
    this.a.ramps.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, axis, y0: ry0, y1: ry1 });
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const n = o.steps ?? Math.max(2, Math.round((y1 - y0) / 0.18));
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const h = y0 + (y1 - y0) * b;
      // (a step's tread runs from its own edge to the top of the flight's footprint)
      const s0 = dir > 0 ? a : 1 - b, s1 = dir > 0 ? b : 1 - a;
      const top = h;
      if (axis === 'x') this.geo(boxGeo([x0 + len * s0, x0 + len * s1, y0 - 0.02, top, z0, z1], 1), mat, true);
      else this.geo(boxGeo([x0, x1, y0 - 0.02, top, z0 + len * s0, z0 + len * s1], 1), mat, true);
    }
    if (o.walls) {
      const t = 0.12;
      if (axis === 'x') {
        this.block([x0, x1, 0, Math.max(y0, y1) + 1.1, z0 - t, z0], 'wall', 'stair-side');
        this.block([x0, x1, 0, Math.max(y0, y1) + 1.1, z1, z1 + t], 'wall', 'stair-side');
      } else {
        this.block([x0 - t, x0, 0, Math.max(y0, y1) + 1.1, z0, z1], 'wall', 'stair-side');
        this.block([x1, x1 + t, 0, Math.max(y0, y1) + 1.1, z0, z1], 'wall', 'stair-side');
      }
    }
  }
  /** A ladder from the floor at y0 up to y1 against a wall; she faces `yaw` climbing it. */
  ladder(x: number, z: number, yaw: number, y0: number, y1: number, mat: THREE.Material) {
    this.a.ladders.push({ x, z, yaw, y0, y1 });
    const s = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const base = new THREE.Vector3(x, 0, z).addScaledVector(f, 0.22);
    const rail = new THREE.CylinderGeometry(0.022, 0.022, y1 - y0 + 0.9, 6);
    for (const k of [-0.22, 0.22]) {
      const m = new THREE.Matrix4().makeTranslation(base.x + s.x * k, (y0 + y1 + 0.9) / 2, base.z + s.z * k);
      this.mesh(rail, mat, m, true);
    }
    const rung = new THREE.CylinderGeometry(0.016, 0.016, 0.44, 5);
    rung.rotateZ(Math.PI / 2);
    rung.rotateY(yaw);
    for (let y = y0 + 0.28; y < y1 + 0.05; y += 0.3) this.mesh(rung, mat, new THREE.Matrix4().makeTranslation(base.x, y, base.z), false);
  }

  // ------------------------------------------------------------------ lights
  /** A light in the level (lit when she's near enough for it to matter). */
  spot(p: THREE.Vector3 | [number, number, number], color: number, intensity: number, distance: number, o: { decay?: number; flicker?: number; mod?: (t: number) => number } = {}) {
    const s: LightSpot = { p: Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone(), color, intensity, distance, decay: o.decay ?? 1.7, flicker: o.flicker ?? 0, mod: o.mod, phase: this.rng.next() * 100 };
    this.spots.push(s);
    return s;
  }
  /** The moon (or a work light's glare): shadows round wherever she is. */
  keyLight(color: number, intensity: number, dir: THREE.Vector3, half = 22) {
    const l = new THREE.DirectionalLight(color, intensity);
    l.castShadow = true;
    l.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 120;
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.035;
    this.keyOff.copy(dir).normalize().multiplyScalar(50);
    this.keyHalf = half;
    this.g.add(l, l.target);
    this.key = l;
    return l;
  }

  // ------------------------------------------------------------------ finish
  /** Merge the statics, light the pool, hand the level to the arena. */
  finish(o: { hemi: THREE.HemisphereLight; dust?: THREE.Points; dressing?: Partial<Dressing>; update?: (dt: number) => void; probe?: THREE.Vector3 }): MapParts {
    const recv = (m: THREE.Mesh) => {
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    };
    for (const [mat, chunks] of this.stat) {
      for (const list of chunks.values()) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = this.cast.has(mat);
        recv(m);
        m.name = 'levelStatic';
        this.g.add(m);
      }
    }
    for (const [mat, chunks] of this.paint) {
      for (const list of chunks.values()) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const m = new THREE.Mesh(merged, mat);
        recv(m);
        m.name = 'levelPaint';
        this.g.add(m);
      }
    }
    this.stat.clear();
    this.paint.clear();
    // the reflections: the finished level seen from where it matters most
    if (o.probe) this.mk.probe(this.a.background, o.probe);
    // the light pool: a couple more than the arenas' budget (only the nearest few are ever lit)
    this.pool = new LightPool(this.g, Math.max(3, this.pointLights + 2), this.spots);
    const a = this.a;
    const key = this.key;
    const keyOff = this.keyOff;
    const texel = (this.keyHalf * 2) / this.shadowMapSize;
    const dust = o.dust ?? this.mk.noDust();
    const ups = this.updates;
    const pool = this.pool;
    const foc = new THREE.Vector3();
    return {
      moon: key ?? new THREE.DirectionalLight(0x000000, 0),
      hemi: o.hemi,
      dust,
      dressing: (o.dressing ?? {}) as Dressing,
      update: (dt: number) => {
        foc.copy(a.focus);
        pool.update(dt, foc);
        if (key) {
          // the shadow frustum over her, snapped to its texels (no shimmer as she moves)
          const fx = Math.round(foc.x / texel) * texel, fz = Math.round(foc.z / texel) * texel;
          key.target.position.set(fx, foc.y, fz);
          key.position.set(fx + keyOff.x, foc.y + keyOff.y, fz + keyOff.z);
          key.target.updateMatrixWorld();
        }
        for (const u of ups) u(dt);
        o.update?.(dt);
      },
    };
  }
}
