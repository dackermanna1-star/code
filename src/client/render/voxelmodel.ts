import * as THREE from 'three';
import { mulberry32, seedFromString } from '../../shared/math';

/**
 * Tiny "entity model compiler" for Minecraft-style blocky models.
 *
 * A model is a tree of named parts (pivots); every part holds boxes. Each
 * box face gets its own region in a per-model pixel-art texture atlas
 * (noise-filled base colour plus optional hand-painted details such as
 * eyes, noses or stitching), exactly like a Minecraft entity texture. All
 * boxes of a part are merged into one BufferGeometry, so a creature costs
 * one draw call per moving part. Compiled templates are cached and shared
 * by every instance (instances only allocate their pivot groups + meshes).
 */

export type FaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
type Vec3T = [number, number, number];

/** Paints one face region. (0,0) is the top-left texel seen from outside the box, upright. */
export type Paint = (p: Painter) => void;

export interface BoxOpts {
  /** Rotation about the box centre (radians, XYZ). */
  r?: Vec3T;
  /** Per-texel brightness noise (default 0.07). */
  n?: number;
  /** Unlit (flames, lights). */
  glow?: boolean;
  /** Texels per block unit (defaults to the model density). */
  d?: number;
  /** Face painters. `side` paints left and right with x=0 at the FRONT edge (mirrored for you); `all` runs on every face first. */
  f?: Partial<Record<FaceName | 'side' | 'all', Paint>>;
}

interface BoxDef extends BoxOpts {
  s: Vec3T;
  p: Vec3T;
  c: number;
}

interface PartDef {
  name: string;
  parent: string | null;
  at: Vec3T;
  rot: Vec3T;
  boxes: BoxDef[];
}

export class Painter {
  w = 0;
  h = 0;
  /** Face base colour. */
  base = 0;
  face: FaceName = 'front';
  private ox = 0;
  private oy = 0;
  private mirror = false;
  constructor(private atlas: Uint8Array, private aw: number, private ah: number, readonly rnd: () => number) {}

  /** @internal */
  bind(ox: number, oy: number, w: number, h: number, base: number, face: FaceName, mirror: boolean) {
    this.ox = ox; this.oy = oy; this.w = w; this.h = h; this.base = base; this.face = face; this.mirror = mirror;
  }

  private idx(x: number, y: number) {
    if (this.mirror) x = this.w - 1 - x;
    // atlas rows are stored bottom-up (DataTexture, flipY = false)
    return ((this.ah - 1 - (this.oy + y)) * this.aw + this.ox + x) * 4;
  }

  /** Set a texel (clipped). Negative x/y count from the right/bottom edge. */
  px(x: number, y: number, c: number, noise = 0) {
    x = Math.floor(x < 0 ? this.w + x : x);
    y = Math.floor(y < 0 ? this.h + y : y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    const f = noise ? 1 + (this.rnd() * 2 - 1) * noise : 1;
    this.atlas[i] = Math.min(255, ((c >> 16) & 255) * f);
    this.atlas[i + 1] = Math.min(255, ((c >> 8) & 255) * f);
    this.atlas[i + 2] = Math.min(255, (c & 255) * f);
    this.atlas[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: number, noise = 0.05) {
    x = Math.floor(x < 0 ? this.w + x : x);
    y = Math.floor(y < 0 ? this.h + y : y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, noise);
  }

  /** Fill rows [y0, y0+h) across the whole face. */
  rows(y0: number, h: number, c: number, noise = 0.05) {
    this.rect(0, y0, this.w, h, c, noise);
  }

  /** Fill columns [x0, x0+w) down the whole face. */
  cols(x0: number, w: number, c: number, noise = 0.05) {
    this.rect(x0, 0, w, this.h, c, noise);
  }

  fill(c: number, noise = 0.07) {
    this.rect(0, 0, this.w, this.h, c, noise);
  }

  /** Multiply a texel's brightness. */
  shade(x: number, y: number, f: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    this.atlas[i] = Math.min(255, this.atlas[i] * f);
    this.atlas[i + 1] = Math.min(255, this.atlas[i + 1] * f);
    this.atlas[i + 2] = Math.min(255, this.atlas[i + 2] * f);
  }

  /** Darken/lighten the outer ring of the face (bevel-ish outline). */
  border(f: number) {
    for (let x = 0; x < this.w; x++) { this.shade(x, 0, f); if (this.h > 1) this.shade(x, this.h - 1, f); }
    for (let y = 1; y < this.h - 1; y++) { this.shade(0, y, f); if (this.w > 1) this.shade(this.w - 1, y, f); }
  }

  /** Random speckles of colour c. */
  speckle(c: number, chance: number, noise = 0.08) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rnd() < chance) this.px(x, y, c, noise);
  }

  /** Mid x (left-biased) for symmetric features. */
  get cx() {
    return Math.floor(this.w / 2);
  }
}

/** Corner order per face: BL, BR, TR, TL as seen from outside (unit cube, centred). */
const FACES: Array<{ name: FaceName; n: Vec3T; c: Vec3T[]; dims: (s: Vec3T) => [number, number] }> = [
  { name: 'front', n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], dims: (s) => [s[0], s[1]] },
  { name: 'back', n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], dims: (s) => [s[0], s[1]] },
  { name: 'right', n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], dims: (s) => [s[2], s[1]] },
  { name: 'left', n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], dims: (s) => [s[2], s[1]] },
  { name: 'top', n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], dims: (s) => [s[0], s[2]] },
  { name: 'bottom', n: [0, -1, 0], c: [[1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]], dims: (s) => [s[0], s[2]] },
];

export interface CompiledPart {
  name: string;
  parent: string | null;
  at: Vec3T;
  rot: Vec3T;
  geo: THREE.BufferGeometry | null;
  glowGeo: THREE.BufferGeometry | null;
}

export interface Template {
  key: string;
  parts: CompiledPart[];
  mat: THREE.MeshLambertMaterial;
  glowMat: THREE.MeshBasicMaterial;
  texture: THREE.DataTexture;
}

export interface Instance {
  root: THREE.Group;
  nodes: Record<string, THREE.Group>;
  meshes: THREE.Mesh[];
}

export class ModelBuilder {
  private parts: PartDef[] = [];
  constructor(readonly key: string, readonly density = 16) {}

  /** Add a pivot. `at` is relative to the parent pivot (or the model origin). */
  part(name: string, parent: string | null = null, at: Vec3T = [0, 0, 0], rot: Vec3T = [0, 0, 0]): PartBuilder {
    const def: PartDef = { name, parent, at, rot, boxes: [] };
    this.parts.push(def);
    return new PartBuilder(def);
  }

  compile(): Template {
    const rnd = mulberry32(seedFromString(this.key));
    // 1. collect faces and their texel sizes
    interface FaceJob { box: BoxDef; face: (typeof FACES)[number]; w: number; h: number; x: number; y: number }
    const jobs: FaceJob[] = [];
    for (const part of this.parts) for (const b of part.boxes) {
      const d = b.d ?? this.density;
      for (const face of FACES) {
        const [fw, fh] = face.dims(b.s);
        jobs.push({ box: b, face, w: Math.max(1, Math.round(fw * d)), h: Math.max(1, Math.round(fh * d)), x: 0, y: 0 });
      }
    }
    // 2. shelf-pack (1 texel padding around every region)
    const order = [...jobs].sort((a, b) => b.h - a.h || b.w - a.w);
    let area = 0;
    for (const j of jobs) area += (j.w + 2) * (j.h + 2);
    let aw = 16;
    while (aw * aw < area * 1.15) aw *= 2;
    let ah = 0;
    for (;;) {
      let x = 0, y = 0, shelf = 0, ok = true;
      for (const j of order) {
        const w = j.w + 2, h = j.h + 2;
        if (w > aw) { ok = false; break; }
        if (x + w > aw) { x = 0; y += shelf; shelf = 0; }
        j.x = x + 1; j.y = y + 1;
        x += w;
        shelf = Math.max(shelf, h);
      }
      ah = y + shelf;
      if (ok && ah <= aw) break;
      aw *= 2;
    }
    ah = aw;
    // 3. paint
    const data = new Uint8Array(aw * ah * 4);
    const painter = new Painter(data, aw, ah, rnd);
    for (const j of jobs) {
      const b = j.box, name = j.face.name;
      painter.bind(j.x, j.y, j.w, j.h, b.c, name, false);
      painter.fill(b.c, b.n ?? 0.07);
      if (b.f?.all) b.f.all(painter);
      if ((name === 'left' || name === 'right') && b.f?.side) {
        // x = 0 at the front edge: the right face shows the front on its right
        painter.bind(j.x, j.y, j.w, j.h, b.c, name, name === 'right');
        b.f.side(painter);
        painter.bind(j.x, j.y, j.w, j.h, b.c, name, false);
      }
      const fp = b.f?.[name];
      if (fp) fp(painter);
      // pad: copy edge texels outwards so nearest sampling never bleeds
      const row = (yy: number) => (aw * (ah - 1 - yy)) * 4;
      for (let yy = j.y - 1; yy <= j.y + j.h; yy++) {
        const sy = Math.min(j.y + j.h - 1, Math.max(j.y, yy));
        for (let xx = j.x - 1; xx <= j.x + j.w; xx++) {
          const sx = Math.min(j.x + j.w - 1, Math.max(j.x, xx));
          if (sx === xx && sy === yy) continue;
          const di = row(yy) + xx * 4, si = row(sy) + sx * 4;
          data[di] = data[si]; data[di + 1] = data[si + 1]; data[di + 2] = data[si + 2]; data[di + 3] = data[si + 3];
        }
      }
    }
    const texture = new THREE.DataTexture(data, aw, ah, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    // 4. geometry per part
    const jobOf = new Map<BoxDef, FaceJob[]>();
    for (const j of jobs) {
      let l = jobOf.get(j.box);
      if (!l) jobOf.set(j.box, (l = []));
      l.push(j);
    }
    const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), nv = new THREE.Vector3();
    const build = (boxes: BoxDef[]): THREE.BufferGeometry | null => {
      if (!boxes.length) return null;
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
      for (const b of boxes) {
        e.set(b.r?.[0] ?? 0, b.r?.[1] ?? 0, b.r?.[2] ?? 0);
        q.setFromEuler(e);
        for (const j of jobOf.get(b)!) {
          const base = pos.length / 3;
          const u0 = j.x / aw, u1 = (j.x + j.w) / aw;
          const vTop = 1 - j.y / ah, vBot = 1 - (j.y + j.h) / ah;
          const uvs = [u0, vBot, u1, vBot, u1, vTop, u0, vTop];
          nv.set(j.face.n[0], j.face.n[1], j.face.n[2]).applyQuaternion(q);
          for (let k = 0; k < 4; k++) {
            const c = j.face.c[k];
            v.set((c[0] * b.s[0]) / 2, (c[1] * b.s[1]) / 2, (c[2] * b.s[2]) / 2).applyQuaternion(q);
            pos.push(v.x + b.p[0], v.y + b.p[1], v.z + b.p[2]);
            nor.push(nv.x, nv.y, nv.z);
            uv.push(uvs[k * 2], uvs[k * 2 + 1]);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    };
    const parts: CompiledPart[] = this.parts.map((p) => ({
      name: p.name,
      parent: p.parent,
      at: p.at,
      rot: p.rot,
      geo: build(p.boxes.filter((b) => !b.glow)),
      glowGeo: build(p.boxes.filter((b) => b.glow)),
    }));
    return {
      key: this.key,
      parts,
      texture,
      mat: new THREE.MeshLambertMaterial({ map: texture }),
      glowMat: new THREE.MeshBasicMaterial({ map: texture }),
    };
  }
}

export class PartBuilder {
  constructor(private def: PartDef) {}
  /** Box of size s centred at p (relative to the part pivot) with base colour c. */
  box(s: Vec3T, p: Vec3T, c: number, opts: BoxOpts = {}): this {
    this.def.boxes.push({ s, p, c, ...opts });
    return this;
  }
}

const templates = new Map<string, Template>();

/** Compile once per key (models are deterministic per key). */
export function template(key: string, build: (m: ModelBuilder) => void, density = 16): Template {
  let t = templates.get(key);
  if (!t) {
    const m = new ModelBuilder(key, density);
    build(m);
    templates.set(key, (t = m.compile()));
  }
  return t;
}

/** New scene-graph instance of a template (shares geometry, texture and materials). */
export function instantiate(t: Template): Instance {
  const root = new THREE.Group();
  const nodes: Record<string, THREE.Group> = {};
  const meshes: THREE.Mesh[] = [];
  for (const p of t.parts) {
    const g = new THREE.Group();
    g.name = p.name;
    g.position.set(p.at[0], p.at[1], p.at[2]);
    g.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    if (p.geo) {
      const m = new THREE.Mesh(p.geo, t.mat);
      meshes.push(m);
      g.add(m);
    }
    if (p.glowGeo) {
      const m = new THREE.Mesh(p.glowGeo, t.glowMat);
      m.userData.glow = true;
      meshes.push(m);
      g.add(m);
    }
    nodes[p.name] = g;
    (p.parent ? nodes[p.parent] : root).add(g);
  }
  return { root, nodes, meshes };
}

/** Scale an RGB colour (clamped). */
export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Linear blend of two RGB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ------------------------------------------------------------- hurt tint
const tinted = new WeakMap<THREE.Material, THREE.Material>();
/** Red "took damage" variant of a material (cached). */
export function hurtMaterial(m: THREE.Material): THREE.Material {
  let t = tinted.get(m);
  if (!t) {
    if (m instanceof THREE.MeshLambertMaterial) {
      const c = m.clone();
      c.color.setRGB(1, 0.55, 0.55);
      c.emissive.setRGB(0.28, 0.0, 0.0);
      t = c;
    } else t = m;
    tinted.set(m, t);
  }
  return t;
}
