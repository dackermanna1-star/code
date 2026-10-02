/**
 * Section mesher (worker-safe). Converts a 16³ section (+1 block of padding on every side)
 * into compact vertex streams per render layer.
 *
 * Vertex format (4 attributes, 24 bytes):
 *   a_pos   Uint16x4 : x,y,z = (local+8)*256 ; w = octahedral normal (8|8 bits)
 *   a_tex   Uint16x4 : u*4096, v*4096, texture layer, flags
 *   a_light Uint8x4  : sky, blockR, blockG, blockB (smooth, 0..255 = 0..15)
 *   a_color Uint8x4  : tint rgb, ambient occlusion (255 = unoccluded)
 *
 * flags: bits 0-3 mode (see MODE_*), bit 4 submerged, bit 5 no-POM, bit 6 flowing,
 *        bit 7 foliage shading, bits 8-15 flow angle / misc.
 * Quads are emitted as 4 vertices; the renderer uses a shared index buffer (0,1,2, 0,2,3).
 */
import { BLOCKS, T_FULL_CUBE, T_LIQUID, T_LAYER, facesFor, type BlockDef, type Faces } from '../world/blocks/registry';
import '../world/blocks/blocks';
import { getBoxModel, stairShape, type ModelBox, type FaceKey } from '../world/blocks/models';
import { TEXTURE_INDEX } from './materials/textureList';
import { hash3 } from '../core/math';

export const MODE_NONE = 0, MODE_LEAVES = 1, MODE_PLANT = 2, MODE_PLANT_UPPER = 3, MODE_WATER = 4, MODE_LAVA = 5,
  MODE_NETHER_PORTAL = 6, MODE_END_PORTAL = 7, MODE_FIRE = 8, MODE_FLUFF = 9, MODE_HANGING = 10, MODE_TUFT = 11;
export const FLAG_SUBMERGED = 16, FLAG_NO_POM = 32, FLAG_FLOWING = 64, FLAG_FOLIAGE = 128;

export const P = 18; // padded size
export const pidx = (x: number, y: number, z: number) => ((y + 1) * P + (z + 1)) * P + (x + 1);
export const cidx = (x: number, z: number) => (z + 1) * P + (x + 1);

export interface MeshInput {
  /** padded 18³ block states, index pidx(x,y,z) with x,y,z in -1..16 */
  blocks: Uint16Array;
  /** padded 18³ packed light */
  light: Uint16Array;
  /** padded 18² biome colours (index cidx) */
  grass: Uint32Array;
  foliage: Uint32Array;
  water: Uint32Array;
  /** world coordinates of the section origin */
  ox: number;
  oy: number;
  oz: number;
  /** Bevel quality: 0 = off, 1 = on */
  bevels: number;
  /** Decorative extras (grass tufts, leaf fluff): 0 off, 1 on */
  decorations: number;
}

export interface LayerMesh {
  pos: Uint16Array;
  tex: Uint16Array;
  light: Uint8Array;
  color: Uint8Array;
  vertexCount: number;
}

export interface MeshOutput {
  opaque: LayerMesh | null;
  cutout: LayerMesh | null;
  translucent: LayerMesh | null;
}

class Stream {
  pos: Uint16Array;
  tex: Uint16Array;
  light: Uint8Array;
  color: Uint8Array;
  n = 0;
  constructor(cap = 4096) {
    this.pos = new Uint16Array(cap * 4);
    this.tex = new Uint16Array(cap * 4);
    this.light = new Uint8Array(cap * 4);
    this.color = new Uint8Array(cap * 4);
  }
  reset() {
    this.n = 0;
  }
  ensure(extra: number) {
    const need = (this.n + extra) * 4;
    if (need <= this.pos.length) return;
    let cap = this.pos.length;
    while (cap < need) cap *= 2;
    const grow = <T extends Uint16Array | Uint8Array>(a: T, C: any): T => {
      const b = new C(cap);
      b.set(a);
      return b;
    };
    this.pos = grow(this.pos, Uint16Array);
    this.tex = grow(this.tex, Uint16Array);
    this.light = grow(this.light, Uint8Array);
    this.color = grow(this.color, Uint8Array);
  }
  vertex(x: number, y: number, z: number, nrm: number, u: number, v: number, layer: number, flags: number, sky: number, r: number, g: number, b: number, tint: number, ao: number) {
    const i = this.n * 4;
    this.pos[i] = Math.max(0, Math.min(65535, Math.round((x + 8) * 256)));
    this.pos[i + 1] = Math.max(0, Math.min(65535, Math.round((y + 8) * 256)));
    this.pos[i + 2] = Math.max(0, Math.min(65535, Math.round((z + 8) * 256)));
    this.pos[i + 3] = nrm;
    this.tex[i] = Math.max(0, Math.min(65535, Math.round(u * 4096)));
    this.tex[i + 1] = Math.max(0, Math.min(65535, Math.round(v * 4096)));
    this.tex[i + 2] = layer;
    this.tex[i + 3] = flags;
    this.light[i] = sky;
    this.light[i + 1] = r;
    this.light[i + 2] = g;
    this.light[i + 3] = b;
    this.color[i] = (tint >> 16) & 255;
    this.color[i + 1] = (tint >> 8) & 255;
    this.color[i + 2] = tint & 255;
    this.color[i + 3] = ao;
    this.n++;
  }
  take(): LayerMesh | null {
    if (this.n === 0) return null;
    const c = this.n * 4;
    return { pos: this.pos.slice(0, c), tex: this.tex.slice(0, c), light: this.light.slice(0, c), color: this.color.slice(0, c), vertexCount: this.n };
  }
}

// ------------------------------------------------------------------------------------------
// octahedral normal encoding (8+8 bits)
export function octEncode(x: number, y: number, z: number): number {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let ox = x / l, oy = y / l;
  if (z < 0) {
    const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
    ox = tx;
    oy = ty;
  }
  const ex = Math.round((ox * 0.5 + 0.5) * 255);
  const ey = Math.round((oy * 0.5 + 0.5) * 255);
  return (ex << 8) | ey;
}

// Face frames: vertex(u,v) on the unit cube; see DIR order DOWN UP NORTH SOUTH WEST EAST
const FN: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const FACE_OCT = FN.map(([x, y, z]) => octEncode(x, y, z));
/** U and V tangent directions per face (as Dir indices for neighbour lookups and vectors). */
const FU: [number, number, number][] = [[1, 0, 0], [1, 0, 0], [-1, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, -1]];
const FV: [number, number, number][] = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
const KEY_OF: FaceKey[] = ['down', 'up', 'north', 'south', 'west', 'east'];

/** Position on face `d` for param (u,v) with plane coordinate `p` (unit block space). */
function facePos(d: number, u: number, v: number, p: number, out: number[]) {
  switch (d) {
    case 0: out[0] = u; out[1] = p; out[2] = v; break;
    case 1: out[0] = u; out[1] = p; out[2] = 1 - v; break;
    case 2: out[0] = 1 - u; out[1] = v; out[2] = p; break;
    case 3: out[0] = u; out[1] = v; out[2] = p; break;
    case 4: out[0] = p; out[1] = v; out[2] = u; break;
    default: out[0] = p; out[1] = v; out[2] = 1 - u; break;
  }
}
/** (u,v) of a block-space point on face d. */
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
const dirOfVec = (x: number, y: number, z: number) => (y < 0 ? 0 : y > 0 ? 1 : z < 0 ? 2 : z > 0 ? 3 : x < 0 ? 4 : 5);
const FU_DIR = FU.map(([x, y, z]) => dirOfVec(x, y, z));
const FV_DIR = FV.map(([x, y, z]) => dirOfVec(x, y, z));
const OPP = [1, 0, 3, 2, 5, 4];

// Natural textures that get random rotation per block to hide tiling
const ROTATE_TEX = new Set([
  'grass_block_top', 'dirt', 'sand', 'red_sand', 'gravel', 'stone', 'snow', 'netherrack', 'end_stone', 'coarse_dirt', 'podzol_top', 'mycelium_top',
  'deepslate_top', 'soul_sand', 'soul_soil', 'clay', 'mud', 'moss_block', 'bedrock', 'andesite', 'diorite', 'granite', 'tuff', 'calcite',
  'packed_ice', 'blue_ice', 'crimson_nylium', 'warped_nylium', 'magma_block', 'blackstone_top', 'farmland', 'farmland_moist', 'dirt_path_top',
]);

const ROUNDED_SOFT = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'mycelium', 'sand', 'red_sand', 'gravel', 'snow_block', 'clay', 'mud', 'moss_block', 'soul_sand', 'soul_soil', 'netherrack', 'end_stone', 'crimson_nylium', 'warped_nylium', 'hay_block', 'dirt_path', 'farmland', 'melon', 'pumpkin']);
function bevelFor(def: BlockDef): number {
  if (def.layer !== 'opaque') return 0;
  if (ROUNDED_SOFT.has(def.name)) return 0.11;
  if (def.tags.includes('planks') || def.sound === 'metal' || def.name.includes('glass') || def.name === 'bookshelf' || def.name === 'crafting_table' || def.name.endsWith('_concrete')) return 0.035;
  if (def.tags.includes('wool')) return 0.06;
  if (def.tags.includes('logs')) return 0.06;
  return 0.07;
}

// ------------------------------------------------------------------------------------------
export class Mesher {
  private streams = { opaque: new Stream(16384), cutout: new Stream(4096), translucent: new Stream(2048) };
  private inp!: MeshInput;
  private tmp = [0, 0, 0];
  // per-face corner lighting cache: 4 corners x (sky,r,g,b,ao)
  private cl = new Float32Array(20);

  mesh(inp: MeshInput): MeshOutput {
    this.inp = inp;
    const { opaque, cutout, translucent } = this.streams;
    opaque.reset(); cutout.reset(); translucent.reset();
    const B = inp.blocks;
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const st = B[pidx(x, y, z)];
          if (st === 0) continue;
          this.block(x, y, z, st);
        }
    return { opaque: opaque.take(), cutout: cutout.take(), translucent: translucent.take() };
  }

  // ---------------------------------------------------------------------------- helpers
  private at(x: number, y: number, z: number) {
    return this.inp.blocks[pidx(x, y, z)];
  }
  private lightAt(x: number, y: number, z: number) {
    return this.inp.light[pidx(x, y, z)];
  }
  private stream(def: BlockDef): Stream {
    return def.layer === 'translucent' ? this.streams.translucent : def.layer === 'cutout' ? this.streams.cutout : this.streams.opaque;
  }
  private tintOf(def: BlockDef, x: number, z: number, meta = 0): number {
    const t = def.tint;
    if (t === 'none') return 0xffffff;
    if (t === 'grass') return this.inp.grass[cidx(x, z)];
    if (t === 'foliage') return this.inp.foliage[cidx(x, z)];
    if (t === 'water') return this.inp.water[cidx(x, z)];
    return t as number;
  }
  /** Does the neighbour state fully cover the face of our block that points toward it? */
  private occludes(nst: number, dirToNeighbor: number, self: number): boolean {
    if (nst === 0) return false;
    const nid = nst >>> 4;
    if (T_FULL_CUBE[nid]) return true;
    const nd = BLOCKS[nid];
    // same translucent / cutout block type (glass, water, ice, leaves)
    if (nid === self >>> 4 && (nd.layer === 'translucent' || nd.shape === 'leaves' || nd.shape === 'cube')) return true;
    if (nd.shape === 'slab') {
      const m = nst & 15;
      if (m === 2) return true;
      if (dirToNeighbor === 0) return m === 1; // neighbour below: its top must be full -> top slab
      if (dirToNeighbor === 1) return m === 0; // neighbour above: bottom slab covers our top
      return false;
    }
    if (nd.shape === 'stairs') {
      const top = (nst >> 2) & 1;
      if (dirToNeighbor === 0) return top === 1;
      if (dirToNeighbor === 1) return top === 0;
      return false;
    }
    if (nd.shape === 'snow_layer') return dirToNeighbor === 1 || (dirToNeighbor === 0 && (nst & 7) === 7);
    if (nd.shape === 'carpet') return dirToNeighbor === 1;
    if (nd.shape === 'farmland' || nd.shape === 'path') return dirToNeighbor === 1;
    if (nd.shape === 'piston' && !((nst >> 3) & 1)) return true;
    return false;
  }
  private opaqueAO(x: number, y: number, z: number) {
    const s = this.at(x, y, z);
    return T_FULL_CUBE[s >>> 4] === 1 ? 1 : 0;
  }

  /**
   * Compute smooth light + AO for the 4 corners of face d of the cell whose light layer is
   * (lx,ly,lz) (the cell in front of the face). Results in this.cl as [sky,r,g,b,ao]*4
   * ordered (u0v0, u1v0, u1v1, u0v1).
   */
  private cornerLight(d: number, lx: number, ly: number, lz: number, useAO: boolean) {
    const U = FU[d], V = FV[d];
    const cl = this.cl;
    const c0 = this.lightAt(lx, ly, lz);
    for (let corner = 0; corner < 4; corner++) {
      const su = corner === 1 || corner === 2 ? 1 : -1;
      const sv = corner >= 2 ? 1 : -1;
      const ax = lx + U[0] * su, ay = ly + U[1] * su, az = lz + U[2] * su;
      const bx = lx + V[0] * sv, by = ly + V[1] * sv, bz = lz + V[2] * sv;
      const cx = ax + V[0] * sv, cy = ay + V[1] * sv, cz = az + V[2] * sv;
      const oa = this.opaqueAO(ax, ay, az), ob = this.opaqueAO(bx, by, bz), oc = this.opaqueAO(cx, cy, cz);
      let ao = 3;
      if (useAO) ao = oa && ob ? 0 : 3 - (oa + ob + oc);
      // average light over non-opaque cells (the centre always counts)
      let s = (c0 >>> 12) & 15, r = (c0 >>> 8) & 15, g = (c0 >>> 4) & 15, b = c0 & 15, n = 1;
      const add = (L: number) => {
        s += (L >>> 12) & 15; r += (L >>> 8) & 15; g += (L >>> 4) & 15; b += L & 15; n++;
      };
      if (!oa) add(this.lightAt(ax, ay, az));
      if (!ob) add(this.lightAt(bx, by, bz));
      if (!oc && !(oa && ob)) add(this.lightAt(cx, cy, cz));
      const k = corner * 5;
      cl[k] = (s / n) * 17;
      cl[k + 1] = (r / n) * 17;
      cl[k + 2] = (g / n) * 17;
      cl[k + 3] = (b / n) * 17;
      cl[k + 4] = ao;
    }
  }

  /** Emit a vertex at block-local position with light bilinearly interpolated at face param (u,v). */
  private emitV(s: Stream, bx: number, by: number, bz: number, px: number, py: number, pz: number, nrm: number, tu: number, tv: number, fu: number, fv: number, layer: number, flags: number, tint: number) {
    const cl = this.cl;
    const w0 = (1 - fu) * (1 - fv), w1 = fu * (1 - fv), w2 = fu * fv, w3 = (1 - fu) * fv;
    const sky = cl[0] * w0 + cl[5] * w1 + cl[10] * w2 + cl[15] * w3;
    const r = cl[1] * w0 + cl[6] * w1 + cl[11] * w2 + cl[16] * w3;
    const g = cl[2] * w0 + cl[7] * w1 + cl[12] * w2 + cl[17] * w3;
    const b = cl[3] * w0 + cl[8] * w1 + cl[13] * w2 + cl[18] * w3;
    const ao = cl[4] * w0 + cl[9] * w1 + cl[14] * w2 + cl[19] * w3;
    s.vertex(bx + px, by + py, bz + pz, nrm, tu, tv, layer, flags, Math.round(sky), Math.round(r), Math.round(g), Math.round(b), tint, Math.round(AO_CURVE(ao)));
  }

  private flatLight(x: number, y: number, z: number) {
    const L = this.lightAt(x, y, z);
    const cl = this.cl;
    for (let i = 0; i < 4; i++) {
      cl[i * 5] = ((L >>> 12) & 15) * 17;
      cl[i * 5 + 1] = ((L >>> 8) & 15) * 17;
      cl[i * 5 + 2] = ((L >>> 4) & 15) * 17;
      cl[i * 5 + 3] = (L & 15) * 17;
      cl[i * 5 + 4] = 3;
    }
  }

  /** Max of own cell light and the cell above (for plants/thin things). */
  private plantLight(x: number, y: number, z: number) {
    const a = this.lightAt(x, y, z), b = this.lightAt(x, y + 1, z);
    const L = ((Math.max((a >>> 12) & 15, ((b >>> 12) & 15)) << 12) | (Math.max((a >>> 8) & 15, (b >>> 8) & 15) << 8) | (Math.max((a >>> 4) & 15, (b >>> 4) & 15) << 4) | Math.max(a & 15, b & 15));
    const cl = this.cl;
    for (let i = 0; i < 4; i++) {
      cl[i * 5] = ((L >>> 12) & 15) * 17;
      cl[i * 5 + 1] = ((L >>> 8) & 15) * 17;
      cl[i * 5 + 2] = ((L >>> 4) & 15) * 17;
      cl[i * 5 + 3] = (L & 15) * 17;
      cl[i * 5 + 4] = 3;
    }
  }

  // ---------------------------------------------------------------------------- dispatch
  private block(x: number, y: number, z: number, st: number) {
    const def = BLOCKS[st >>> 4];
    switch (def.shape) {
      case 'air': return;
      case 'cube': case 'grass_block': this.cube(x, y, z, st, def); return;
      case 'leaves': this.leaves(x, y, z, st, def); return;
      case 'cross': case 'double_plant': case 'cobweb': this.cross(x, y, z, st, def); return;
      case 'crop': this.crop(x, y, z, st, def); return;
      case 'stem': this.stem(x, y, z, st, def); return;
      case 'liquid': this.liquid(x, y, z, st, def); return;
      case 'wire': this.wire(x, y, z, st, def); return;
      case 'rail': this.rail(x, y, z, st, def); return;
      case 'portal': this.portal(x, y, z, st, def); return;
      case 'end_portal': this.endPortal(x, y, z, st, def); return;
      case 'fire': this.fire(x, y, z, st, def); return;
      case 'vine': this.vine(x, y, z, st, def); return;
      default: {
        const nb = (dx: number, dy: number, dz: number) => this.at(x + dx, y + dy, z + dz);
        const boxes = getBoxModel(st, nb);
        if (boxes) this.boxes(x, y, z, st, def, boxes);
        else this.cube(x, y, z, st, def);
      }
    }
  }

  // ---------------------------------------------------------------------------- cubes
  private cubeFaces(def: BlockDef, st: number, x: number, y: number, z: number): { tex: Faces; rot: number[] } {
    const meta = st & 15;
    let f = facesFor(def, meta);
    const rot = [0, 0, 0, 0, 0, 0];
    if (def.orient === 'axis') {
      const axis = meta & 3;
      if (axis === 1) {
        // along X: ends on west/east
        f = { up: f.north, down: f.north, north: f.north, south: f.north, west: f.up, east: f.up };
        rot[0] = rot[1] = rot[2] = rot[3] = 90;
      } else if (axis === 2) {
        f = { up: f.north, down: f.north, north: f.up, south: f.up, west: f.north, east: f.north };
        rot[4] = rot[5] = 90;
      }
    } else if (def.orient === 'facing') {
      const facing = meta & 7;
      // rotate side textures so their "up" points toward the facing direction
      if (facing === 0) { rot[2] = rot[3] = rot[4] = rot[5] = 180; }
      else if (facing >= 2) {
        // facing horizontal: top/bottom textures point toward facing; perpendicular sides rotated 90
        const upRot: Record<number, number> = { 2: 0, 3: 180, 4: 270, 5: 90 };
        rot[1] = upRot[facing];
        rot[0] = (360 - upRot[facing] + 180) % 360;
        if (facing === 2 || facing === 3) { rot[4] = facing === 2 ? 90 : 270; rot[5] = facing === 2 ? 270 : 90; }
        else { rot[2] = facing === 4 ? 90 : 270; rot[3] = facing === 4 ? 270 : 90; }
      }
    }
    if (def.shape === 'grass_block') {
      const above = this.at(x, y + 1, z);
      const an = above ? BLOCKS[above >>> 4].name : '';
      if (an === 'snow' || an === 'snow_block') f = { ...f, north: 'grass_block_snow', south: 'grass_block_snow', west: 'grass_block_snow', east: 'grass_block_snow' };
    }
    return { tex: f, rot };
  }

  private cube(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.stream(def);
    const exposed = [false, false, false, false, false, false];
    let any = false;
    for (let d = 0; d < 6; d++) {
      const n = this.at(x + FN[d][0], y + FN[d][1], z + FN[d][2]);
      exposed[d] = !this.occludes(n, d, st);
      if (exposed[d]) any = true;
    }
    if (!any) return;
    const { tex, rot } = this.cubeFaces(def, st, x, y, z);
    const w = this.inp.bevels ? bevelFor(def) : 0;
    const keys = KEY_OF;
    const isGrass = def.shape === 'grass_block';
    const baseTint = this.tintOf(def, x, z);
    const h = hash3(this.inp.ox + x, this.inp.oy + y, this.inp.oz + z);
    for (let d = 0; d < 6; d++) {
      if (!exposed[d]) continue;
      const tname = tex[keys[d]];
      const layer = TEXTURE_INDEX.get(tname) ?? 0;
      let r = rot[d];
      if (ROTATE_TEX.has(tname) && (d === 1 || d === 0)) r = (r + ((h >>> (d * 3)) & 3) * 90) % 360;
      const tint = isGrass ? (tname === 'dirt' || tname === 'grass_block_snow' ? (tname === 'grass_block_snow' ? 0xffffff : 0xffffff) : baseTint) : baseTint;
      const i0 = w && exposed[OPP[FU_DIR[d]]] ? w : 0; // u=0 edge is toward -U
      const i1 = w && exposed[FU_DIR[d]] ? w : 0;
      const j0 = w && exposed[OPP[FV_DIR[d]]] ? w : 0;
      const j1 = w && exposed[FV_DIR[d]] ? w : 0;
      const nx = x + FN[d][0], ny = y + FN[d][1], nz = z + FN[d][2];
      const sub = T_LIQUID[this.at(nx, ny, nz) >>> 4] === 1 ? FLAG_SUBMERGED : 0;
      this.cornerLight(d, nx, ny, nz, true);
      this.quad(s, x, y, z, d, d === 1 || d === 3 || d === 5 ? 1 : 0, i0, 1 - i1, j0, 1 - j1, layer, r, sub, tint, FACE_OCT[d]);
    }
    if (w > 0) this.bevels(s, x, y, z, st, def, exposed, tex, rot, w, baseTint, isGrass);
    if (isGrass && this.inp.decorations && exposed[1]) {
      const above = this.at(x, y + 1, z);
      if (above === 0) this.tuft(x, y + 1, z, baseTint, h);
    }
  }

  /**
   * Emit a quad on face d spanning param u∈[u0,u1], v∈[v0,v1], at plane coordinate `plane`.
   * Texture coords = param (rotated by r degrees). Light is interpolated from this.cl.
   */
  private quad(s: Stream, x: number, y: number, z: number, d: number, plane: number, u0: number, u1: number, v0: number, v1: number, layer: number, r: number, flags: number, tint: number, nrm: number, uvRect?: [number, number, number, number]) {
    s.ensure(4);
    const P = this.tmp;
    const us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1];
    // flip diagonal based on AO to avoid anisotropy
    const cl = this.cl;
    const a0 = cl[4] + cl[14], a1 = cl[9] + cl[19];
    const start = a0 < a1 ? 1 : 0;
    for (let k = 0; k < 4; k++) {
      const i = (k + start) & 3;
      const u = us[i], v = vs[i];
      facePos(d, u, v, plane, P);
      let tu = u, tv = v;
      if (uvRect) {
        // map param from [u0,u1]x[v0,v1] onto uv rect (1/16 units)
        const fu = u1 === u0 ? 0 : (u - u0) / (u1 - u0);
        const fv = v1 === v0 ? 0 : (v - v0) / (v1 - v0);
        tu = (uvRect[0] + (uvRect[2] - uvRect[0]) * fu) / 16;
        tv = (uvRect[1] + (uvRect[3] - uvRect[1]) * fv) / 16;
      }
      if (r) [tu, tv] = rotUV(tu, tv, r);
      this.emitV(s, x, y, z, P[0], P[1], P[2], nrm, tu, tv, u, v, layer, flags, tint);
    }
  }

  private bevels(s: Stream, x: number, y: number, z: number, st: number, def: BlockDef, ex: boolean[], tex: Faces, rot: number[], w: number, baseTint: number, isGrass: boolean) {
    const keys = KEY_OF;
    // edges: pairs of perpendicular exposed faces
    for (let f = 0; f < 6; f++) {
      if (!ex[f]) continue;
      for (let g = f + 1; g < 6; g++) {
        if (!ex[g] || g === OPP[f]) continue;
        // pick texture face: prefer the vertical neighbour (top/bottom) texture for horizontal edges
        const tf = f === 1 || f === 0 ? f : g === 1 || g === 0 ? g : f;
        const og = tf === f ? g : f;
        const tname = tex[keys[tf]];
        const layer = TEXTURE_INDEX.get(tname) ?? 0;
        const tint = isGrass ? (tf === 1 ? baseTint : 0xffffff) : baseTint;
        // axis of the edge = the remaining axis
        const nf = FN[f], ng = FN[g];
        const ax = [1 - Math.abs(nf[0]) - Math.abs(ng[0]), 1 - Math.abs(nf[1]) - Math.abs(ng[1]), 1 - Math.abs(nf[2]) - Math.abs(ng[2])];
        const axisPos = dirOfVec(ax[0], ax[1], ax[2]); // positive axis dir
        const axisNeg = OPP[axisPos];
        const a0 = ex[axisNeg] ? w : 0, a1 = ex[axisPos] ? 1 - w : 1;
        // edge base point (on the cube edge): component along nf/ng = 1 if positive dir else 0
        const base = [0, 0, 0];
        for (let i = 0; i < 3; i++) base[i] = (nf[i] > 0 ? 1 : 0) + (ng[i] > 0 ? 1 : 0);
        // f-side points: edge point moved inward along ng by w; g-side: moved inward along nf by w
        const pts: number[][] = [];
        const mk = (a: number, side: 'f' | 'g') => {
          const p = [base[0] + ax[0] * a, base[1] + ax[1] * a, base[2] + ax[2] * a];
          const inward = side === 'f' ? ng : nf;
          for (let i = 0; i < 3; i++) p[i] -= inward[i] * w;
          return p;
        };
        pts.push(mk(a0, 'f'), mk(a1, 'f'), mk(a1, 'g'), mk(a0, 'g'));
        // texture coordinates: project onto the texture face (tf) frame
        const rtex = rot[tf];
        // emit quad (ordering must be CCW seen from outside: normal ~ nf+ng)
        const e1 = sub(pts[1], pts[0]), e2 = sub(pts[3], pts[0]);
        const cr = cross(e1, e2);
        const outward = [nf[0] + ng[0], nf[1] + ng[1], nf[2] + ng[2]];
        const flip = cr[0] * outward[0] + cr[1] * outward[1] + cr[2] * outward[2] < 0;
        const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
        s.ensure(4);
        for (const oi of order) {
          const p = pts[oi];
          const isF = oi < 2;
          const faceD = isF ? f : g;
          // light from that face's corner interpolation
          const nx = x + FN[faceD][0], ny = y + FN[faceD][1], nz = z + FN[faceD][2];
          this.cornerLight(faceD, nx, ny, nz, true);
          const [fu, fv] = faceUV(faceD, p[0], p[1], p[2]);
          // texture uv: on tf frame, g-side points sit on the original edge
          const q = oi < 2 === (tf === f) ? p : [p[0] + (tf === f ? ng : nf)[0] * w, p[1] + (tf === f ? ng : nf)[1] * w, p[2] + (tf === f ? ng : nf)[2] * w];
          let [tu, tv] = faceUV(tf, q[0], q[1], q[2]);
          if (rtex) [tu, tv] = rotUV(tu, tv, rtex);
          const n = FN[faceD];
          this.emitV(s, x, y, z, p[0], p[1], p[2], FACE_OCT[faceD] === undefined ? octEncode(n[0], n[1], n[2]) : FACE_OCT[faceD], tu, tv, fu, fv, layer, FLAG_NO_POM, tint);
        }
        void og;
        // end caps where the chamfer does not continue into an occluding neighbour along the axis
        for (const [end, adir] of [[a0, axisNeg], [a1, axisPos]] as [number, number][]) {
          if (ex[adir]) continue; // corner handled by corner triangle
          const n = [x + FN[adir][0], y + FN[adir][1], z + FN[adir][2]];
          const nst = this.at(n[0], n[1], n[2]);
          if (!T_FULL_CUBE[nst >>> 4]) continue;
          const nEx = (d: number) => !this.occludes(this.at(n[0] + FN[d][0], n[1] + FN[d][1], n[2] + FN[d][2]), d, nst);
          const continues = nEx(f) && nEx(g) && bevelFor(BLOCKS[nst >>> 4]) > 0;
          if (continues) continue;
          // cap triangle in the plane at `end` facing -adir (toward our chamfer)
          const pe = [base[0] + ax[0] * end, base[1] + ax[1] * end, base[2] + ax[2] * end];
          const pf = [pe[0] - ng[0] * w, pe[1] - ng[1] * w, pe[2] - ng[2] * w];
          const pg = [pe[0] - nf[0] * w, pe[1] - nf[1] * w, pe[2] - nf[2] * w];
          this.tri(s, x, y, z, [pe, pf, pg], OPP[adir], layer, tint, tf, rtex, nst);
        }
      }
    }
    // corners where three exposed faces meet
    for (const fy of [0, 1]) {
      if (!ex[fy]) continue;
      for (const fz of [2, 3]) {
        if (!ex[fz]) continue;
        for (const fx of [4, 5]) {
          if (!ex[fx]) continue;
          const c = [FN[fx][0] > 0 ? 1 : 0, FN[fy][1] > 0 ? 1 : 0, FN[fz][2] > 0 ? 1 : 0];
          const sx = FN[fx][0], sy = FN[fy][1], sz = FN[fz][2];
          const pY = [c[0] - sx * w, c[1], c[2] - sz * w];
          const pZ = [c[0] - sx * w, c[1] - sy * w, c[2]];
          const pX = [c[0], c[1] - sy * w, c[2] - sz * w];
          const tname = tex[keys[fy]];
          const layer = TEXTURE_INDEX.get(tname) ?? 0;
          const tint = isGrass ? (fy === 1 ? baseTint : 0xffffff) : baseTint;
          let tri: [number[], number][] = [[pY, fy], [pZ, fz], [pX, fx]];
          const nrm = octEncode(sx, sy, sz);
          const e1 = sub(tri[1][0], tri[0][0]), e2 = sub(tri[2][0], tri[0][0]);
          const cr = cross(e1, e2);
          if (cr[0] * sx + cr[1] * sy + cr[2] * sz < 0) tri = [tri[0], tri[2], tri[1]];
          s.ensure(4);
          for (let k = 0; k < 4; k++) {
            const [p, di] = tri[Math.min(k, 2)];
            const nx = x + FN[di][0], ny = y + FN[di][1], nz = z + FN[di][2];
            this.cornerLight(di, nx, ny, nz, true);
            const [fu, fv] = faceUV(di, p[0], p[1], p[2]);
            let [tu, tv] = faceUV(fy, p[0], p[1], p[2]);
            if (rot[fy]) [tu, tv] = rotUV(tu, tv, rot[fy]);
            this.emitV(s, x, y, z, p[0], p[1], p[2], nrm, tu, tv, fu, fv, layer, FLAG_NO_POM, tint);
          }
        }
      }
    }
  }

  /** Emit a triangle (as a degenerate quad) with flat-ish lighting from the neighbour `nst` side. */
  private tri(s: Stream, x: number, y: number, z: number, pts: number[][], faceDir: number, layer: number, tint: number, tf: number, rtex: number, _nst: number) {
    const n = FN[faceDir];
    const e1 = sub(pts[1], pts[0]), e2 = sub(pts[2], pts[0]);
    const cr = cross(e1, e2);
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) pts = [pts[0], pts[2], pts[1]];
    // light: use the light of our own block's neighbour toward the chamfer outward direction (approx: cell above)
    this.flatLight(x + (n[0] < 0 ? 0 : 0), y, z);
    const L = this.cellLightOutside(x, y, z);
    const cl = this.cl;
    for (let i = 0; i < 4; i++) { cl[i * 5] = L[0]; cl[i * 5 + 1] = L[1]; cl[i * 5 + 2] = L[2]; cl[i * 5 + 3] = L[3]; cl[i * 5 + 4] = 2; }
    s.ensure(4);
    for (let k = 0; k < 4; k++) {
      const p = pts[Math.min(k, 2)];
      let [tu, tv] = faceUV(tf, p[0], p[1], p[2]);
      if (rtex) [tu, tv] = rotUV(tu, tv, rtex);
      this.emitV(s, x, y, z, p[0], p[1], p[2], FACE_OCT[faceDir], tu, tv, 0.5, 0.5, layer, FLAG_NO_POM, tint);
    }
  }

  /** Brightest light among the 6 neighbours (for small caps). */
  private cellLightOutside(x: number, y: number, z: number): number[] {
    let best = 0, bv = -1;
    for (let d = 0; d < 6; d++) {
      const nx = x + FN[d][0], ny = y + FN[d][1], nz = z + FN[d][2];
      if (T_FULL_CUBE[this.at(nx, ny, nz) >>> 4]) continue;
      const L = this.lightAt(nx, ny, nz);
      const v = ((L >>> 12) & 15) * 4 + Math.max((L >>> 8) & 15, (L >>> 4) & 15, L & 15);
      if (v > bv) { bv = v; best = L; }
    }
    return [((best >>> 12) & 15) * 17, ((best >>> 8) & 15) * 17, ((best >>> 4) & 15) * 17, (best & 15) * 17];
  }

  // ---------------------------------------------------------------------------- box models
  private boxes(x: number, y: number, z: number, st: number, def: BlockDef, boxes: ModelBox[]) {
    const s = this.stream(def);
    const tintBase = this.tintOf(def, x, z);
    const P = this.tmp;
    for (const b of boxes) {
      const fx = b.from[0] / 16, fy = b.from[1] / 16, fz = b.from[2] / 16;
      const tx = b.to[0] / 16, ty = b.to[1] / 16, tz = b.to[2] / 16;
      for (let d = 0; d < 6; d++) {
        const mf = b.faces[KEY_OF[d]];
        if (!mf) continue;
        if (mf.cull !== undefined) {
          const c = FN[mf.cull];
          if (this.occludes(this.at(x + c[0], y + c[1], z + c[2]), mf.cull, st)) continue;
        }
        const layer = TEXTURE_INDEX.get(mf.tex) ?? 0;
        // param rect on this face
        let u0: number, u1: number, v0: number, v1: number, plane: number;
        switch (d) {
          case 0: u0 = fx; u1 = tx; v0 = fz; v1 = tz; plane = fy; break;
          case 1: u0 = fx; u1 = tx; v0 = 1 - tz; v1 = 1 - fz; plane = ty; break;
          case 2: u0 = 1 - tx; u1 = 1 - fx; v0 = fy; v1 = ty; plane = fz; break;
          case 3: u0 = fx; u1 = tx; v0 = fy; v1 = ty; plane = tz; break;
          case 4: u0 = fz; u1 = tz; v0 = fy; v1 = ty; plane = fx; break;
          default: u0 = 1 - tz; u1 = 1 - fz; v0 = fy; v1 = ty; plane = tx; break;
        }
        if (u1 - u0 <= 1e-6 || v1 - v0 <= 1e-6) {
          if (!(d <= 1 && u1 > u0 && v1 > v0)) {
            // zero-area in one param: skip unless it's a flat plane (handled when from==to on the plane axis)
            if (u1 - u0 <= 1e-6 || v1 - v0 <= 1e-6) continue;
          }
        }
        const onBoundary = (d === 0 && fy === 0) || (d === 1 && ty === 1) || (d === 2 && fz === 0) || (d === 3 && tz === 1) || (d === 4 && fx === 0) || (d === 5 && tx === 1);
        if (b.rotation) this.flatLight(x, y, z);
        else if (onBoundary) this.cornerLight(d, x + FN[d][0], y + FN[d][1], z + FN[d][2], true);
        else this.cornerLight(d, x, y, z, false), this.boostOwn(x, y, z);
        const tint = mf.tint === false ? 0xffffff : tintBase;
        const uv = mf.uv;
        s.ensure(4);
        const us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1];
        // default texture rect: position-derived
        for (let k = 0; k < 4; k++) {
          const u = us[k], v = vs[k];
          facePos(d, u, v, plane, P);
          let tu = u, tv = v;
          if (uv) {
            const fu = (u - u0) / (u1 - u0 || 1), fv = (v - v0) / (v1 - v0 || 1);
            tu = (uv[0] + (uv[2] - uv[0]) * fu) / 16;
            tv = (uv[1] + (uv[3] - uv[1]) * fv) / 16;
          }
          if (mf.rot) [tu, tv] = rotUV(tu, tv, mf.rot);
          let px = P[0], py = P[1], pz = P[2];
          let nrm = FACE_OCT[d];
          if (b.rotation) {
            const o = b.rotation.origin;
            const r = rotatePoint(px - o[0] / 16, py - o[1] / 16, pz - o[2] / 16, b.rotation.axis, b.rotation.angle);
            px = r[0] + o[0] / 16; py = r[1] + o[1] / 16; pz = r[2] + o[2] / 16;
            const n = rotatePoint(FN[d][0], FN[d][1], FN[d][2], b.rotation.axis, b.rotation.angle);
            nrm = octEncode(n[0], n[1], n[2]);
          }
          this.emitV(s, x, y, z, px, py, pz, nrm, tu, tv, u, v, layer, FLAG_NO_POM * (def.shape === 'slab' || def.shape === 'stairs' ? 0 : 1), tint);
        }
      }
    }
  }

  /** For faces inside the block's own cell, make sure light isn't darker than the cell itself. */
  private boostOwn(x: number, y: number, z: number) {
    const L = this.lightAt(x, y, z);
    const cl = this.cl;
    const s = ((L >>> 12) & 15) * 17, r = ((L >>> 8) & 15) * 17, g = ((L >>> 4) & 15) * 17, b = (L & 15) * 17;
    for (let i = 0; i < 4; i++) {
      cl[i * 5] = Math.max(cl[i * 5], s);
      cl[i * 5 + 1] = Math.max(cl[i * 5 + 1], r);
      cl[i * 5 + 2] = Math.max(cl[i * 5 + 2], g);
      cl[i * 5 + 3] = Math.max(cl[i * 5 + 3], b);
      cl[i * 5 + 4] = 3;
    }
  }

  // ---------------------------------------------------------------------------- foliage
  private leaves(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.cutout;
    const tint = this.tintOf(def, x, z);
    const tname = facesFor(def, st & 15).north;
    const layer = TEXTURE_INDEX.get(tname) ?? 0;
    let anyExposed = false;
    for (let d = 0; d < 6; d++) {
      const n = this.at(x + FN[d][0], y + FN[d][1], z + FN[d][2]);
      if (this.occludes(n, d, st)) continue;
      anyExposed = true;
      const nx = x + FN[d][0], ny = y + FN[d][1], nz = z + FN[d][2];
      this.cornerLight(d, nx, ny, nz, true);
      this.quad(s, x, y, z, d, d === 1 || d === 3 || d === 5 ? 1 : 0, 0, 1, 0, 1, layer, 0, MODE_LEAVES | FLAG_FOLIAGE | FLAG_NO_POM, tint, FACE_OCT[d]);
    }
    if (!anyExposed || !this.inp.decorations) return;
    // fluff cards: 3 intersecting planes, randomly rotated, extending beyond the block
    const h = hash3(this.inp.ox + x, this.inp.oy + y, this.inp.oz + z, 7);
    const needle = def.name.startsWith('spruce');
    const fl = TEXTURE_INDEX.get(needle ? 'leaves_fluff_needle' : 'leaves_fluff_oak') ?? layer;
    this.plantLight(x, y, z);
    const cards = 3;
    for (let i = 0; i < cards; i++) {
      const a = (((h >>> (i * 5)) & 31) / 32) * Math.PI + i * (Math.PI / cards);
      const tilt = ((((h >>> (i * 3 + 13)) & 7) / 7) - 0.5) * 0.9;
      const size = 0.82 + (((h >>> (i * 4 + 2)) & 7) / 7) * 0.25;
      const ca = Math.cos(a) * size, sa = Math.sin(a) * size;
      const cy = 0.5, ty = Math.cos(tilt) * size, tz2 = Math.sin(tilt) * size;
      const nrm = octEncode(-sa * 0.3, 0.9, ca * 0.3);
      const corners = [
        [0.5 - ca - sa * tz2 * 0.3, cy - ty, 0.5 - sa + tz2],
        [0.5 + ca - sa * tz2 * 0.3, cy - ty, 0.5 + sa + tz2],
        [0.5 + ca + sa * tz2 * 0.3, cy + ty, 0.5 + sa - tz2],
        [0.5 - ca + sa * tz2 * 0.3, cy + ty, 0.5 - sa - tz2],
      ];
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      s.ensure(4);
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        this.emitV(s, x, y, z, c[0], c[1], c[2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, fl, MODE_FLUFF | FLAG_FOLIAGE | FLAG_NO_POM, tint);
      }
    }
  }

  private tuft(x: number, y: number, z: number, tint: number, h: number) {
    if (y > 15 + 1) return;
    const s = this.streams.cutout;
    const layer = TEXTURE_INDEX.get('grass_tuft') ?? 0;
    // light from the air cell above the grass block
    this.plantLight(x, y, z);
    const ox = (((h >>> 4) & 15) / 15 - 0.5) * 0.3, oz = (((h >>> 8) & 15) / 15 - 0.5) * 0.3;
    const height = 0.32 + ((h >>> 12) & 7) / 7 * 0.22;
    const a0 = ((h >>> 16) & 63) / 64 * Math.PI;
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * Math.PI / 2;
      const ca = Math.cos(a) * 0.62, sa = Math.sin(a) * 0.62;
      const nrm = octEncode(0, 1, 0);
      const cx = 0.5 + ox, cz = 0.5 + oz;
      const pts = [[cx - ca, 0, cz - sa], [cx + ca, 0, cz + sa], [cx + ca, height, cz + sa], [cx - ca, height, cz - sa]];
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      s.ensure(4);
      for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, layer, MODE_TUFT | FLAG_FOLIAGE | FLAG_NO_POM, tint);
    }
  }

  private cross(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.stream(def);
    const meta = st & 15;
    const f = facesFor(def, meta);
    const layer = TEXTURE_INDEX.get(f.north) ?? 0;
    const tint = this.tintOf(def, x, z);
    const h = hash3(this.inp.ox + x, this.inp.oy + (def.shape === 'double_plant' && meta & 8 ? y - 1 : y), this.inp.oz + z, 3);
    const offset = def.name !== 'sugar_cane' && def.name !== 'cobweb' && def.name !== 'bamboo' && !def.name.endsWith('_sapling');
    const ox = offset ? (((h >>> 4) & 15) / 15 - 0.5) * 0.4 : 0;
    const oz = offset ? (((h >>> 8) & 15) / 15 - 0.5) * 0.4 : 0;
    const upper = def.shape === 'double_plant' && (meta & 8) !== 0;
    const mode = def.name === 'cobweb' || def.name === 'bamboo' ? MODE_NONE : def.name === 'weeping_vines' ? MODE_HANGING : upper ? MODE_PLANT_UPPER : MODE_PLANT;
    this.plantLight(x, y, z);
    const nrm = octEncode(0, 1, 0);
    const sz = def.name === 'sugar_cane' || def.name === 'bamboo' ? 0.5 : 0.45 * Math.SQRT2;
    const rot0 = Math.PI / 4 + (offset ? (((h >>> 12) & 15) / 15 - 0.5) * 0.5 : 0);
    const H = def.name === 'short_grass' ? 0.85 + ((h >>> 20) & 7) / 7 * 0.25 : 1;
    for (let i = 0; i < 2; i++) {
      const a = rot0 + i * Math.PI / 2;
      const ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
      const cx = 0.5 + ox, cz = 0.5 + oz;
      const pts = [[cx - ca, 0, cz - sa], [cx + ca, 0, cz + sa], [cx + ca, H, cz + sa], [cx - ca, H, cz - sa]];
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      s.ensure(4);
      for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, layer, mode | FLAG_FOLIAGE | FLAG_NO_POM, tint);
    }
  }

  private crop(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.stream(def);
    const f = facesFor(def, st & 15);
    const layer = TEXTURE_INDEX.get(f.north) ?? 0;
    this.plantLight(x, y, z);
    const nrm = octEncode(0, 1, 0);
    const yb = -1 / 16; // crops sit slightly into farmland
    for (const p of [0.25, 0.75]) {
      for (const axis of [0, 1]) {
        const pts = axis === 0
          ? [[0, yb, p], [1, yb, p], [1, 1 + yb, p], [0, 1 + yb, p]]
          : [[p, yb, 1], [p, yb, 0], [p, 1 + yb, 0], [p, 1 + yb, 1]];
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
        s.ensure(4);
        for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, layer, MODE_PLANT | FLAG_FOLIAGE | FLAG_NO_POM, 0xffffff);
      }
    }
  }

  private stem(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.stream(def);
    const age = st & 7;
    const layer = TEXTURE_INDEX.get('stem') ?? 0;
    // Minecraft stem colours: green -> yellow-brown with age
    const r = age * 32, g = 255 - age * 8, b = age * 4;
    const tint = (r << 16) | (g << 8) | b;
    this.plantLight(x, y, z);
    const H = (age * 2 + 2) / 16;
    const nrm = octEncode(0, 1, 0);
    for (let i = 0; i < 2; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const ca = Math.cos(a) * 0.45 * Math.SQRT2, sa = Math.sin(a) * 0.45 * Math.SQRT2;
      const pts = [[0.5 - ca, 0, 0.5 - sa], [0.5 + ca, 0, 0.5 + sa], [0.5 + ca, H, 0.5 + sa], [0.5 - ca, H, 0.5 - sa]];
      const uvs = [[0, 0], [1, 0], [1, H], [0, H]];
      s.ensure(4);
      for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, layer, MODE_PLANT | FLAG_FOLIAGE | FLAG_NO_POM, tint);
    }
  }

  private vine(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.cutout;
    const meta = st & 15;
    const layer = TEXTURE_INDEX.get(facesFor(def, meta).north) ?? 0;
    const tint = this.tintOf(def, x, z);
    // bits: 1 south, 2 west, 4 north, 8 east (attached faces)
    const faces: [number, number][] = [[1, 3], [2, 4], [4, 2], [8, 5]];
    const inset = 0.8 / 16;
    let anyFace = false;
    for (const [bit, d] of faces) {
      if (!(meta & bit)) continue;
      anyFace = true;
      // quad on the inside of face d, facing inward (normal opposite)
      this.flatLight(x, y, z);
      const plane = d === 3 || d === 5 ? 1 - inset : inset;
      const od = OPP[d];
      // emit with the opposite face frame so it faces into the block
      this.quad(s, x, y, z, od, plane, 0, 1, 0, 1, layer, 0, MODE_HANGING | FLAG_FOLIAGE | FLAG_NO_POM, tint, FACE_OCT[od]);
    }
    if (!anyFace || meta === 0) {
      // ceiling vine (glow lichen etc.)
      this.flatLight(x, y, z);
      this.quad(s, x, y, z, 0, 1 - inset, 0, 1, 0, 1, layer, 0, MODE_HANGING | FLAG_FOLIAGE | FLAG_NO_POM, tint, FACE_OCT[0]);
    }
  }

  // ---------------------------------------------------------------------------- liquids
  private liquidHeight(x: number, y: number, z: number, id: number): number {
    // corner-average heights per Minecraft, returns -1 if not this liquid
    const st = this.at(x, y, z);
    if (st >>> 4 !== id) return -1;
    const above = this.at(x, y + 1, z);
    if (above >>> 4 === id) return 1;
    const lvl = st & 7;
    return (8 - lvl) / 9;
  }
  private cornerHeight(x: number, y: number, z: number, cx: number, cz: number, id: number): number {
    // corner between columns (x+cx-1 .. x+cx) and (z+cz-1 .. z+cz)
    let sum = 0, cnt = 0;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const px = x + cx + dx, pz = z + cz + dz;
        const above = this.at(px, y + 1, pz);
        if (above >>> 4 === id) return 1;
        const h = this.liquidHeight(px, y, pz, id);
        if (h >= 0) {
          if (h >= 0.8) { sum += h * 10; cnt += 10; } else { sum += h; cnt += 1; }
        } else {
          const st = this.at(px, y, pz);
          if (!BLOCKS[st >>> 4].solid) cnt += 1;
        }
      }
    return cnt ? sum / cnt : 0;
  }

  private liquid(x: number, y: number, z: number, st: number, def: BlockDef) {
    const id = st >>> 4;
    const isWater = def.liquid === 1;
    const s = isWater ? this.streams.translucent : this.streams.opaque;
    const mode = isWater ? MODE_WATER : MODE_LAVA;
    const layer = TEXTURE_INDEX.get(isWater ? 'water_still' : 'lava_still') ?? 0;
    const tint = isWater ? this.inp.water[cidx(x, z)] : 0xffffff;
    const aboveSame = this.at(x, y + 1, z) >>> 4 === id;
    const h00 = aboveSame ? 1 : this.cornerHeight(x, y, z, 0, 0, id);
    const h10 = aboveSame ? 1 : this.cornerHeight(x, y, z, 1, 0, id);
    const h11 = aboveSame ? 1 : this.cornerHeight(x, y, z, 1, 1, id);
    const h01 = aboveSame ? 1 : this.cornerHeight(x, y, z, 0, 1, id);
    // flow
    const fx = (h00 + h01) - (h10 + h11);
    const fz = (h00 + h10) - (h01 + h11);
    const flowing = Math.abs(fx) + Math.abs(fz) > 0.01;
    const angle = flowing ? Math.round(((Math.atan2(fz, fx) / (2 * Math.PI)) + 1) % 1 * 255) : 0;
    const flags = mode | (flowing ? FLAG_FLOWING : 0) | (angle << 8) | FLAG_NO_POM;
    // top
    const up = this.at(x, y + 1, z);
    if (!aboveSame && !(T_FULL_CUBE[up >>> 4])) {
      this.cornerLight(1, x, y + 1, z, false);
      this.boostOwn(x, y, z);
      // vertices in UP frame order: (u0v0)=(0,_,1) (u1v0)=(1,_,1) (u1v1)=(1,_,0) (u0v1)=(0,_,0)
      const hs = [h01, h11, h10, h00];
      const pts = [[0, hs[0], 1], [1, hs[1], 1], [1, hs[2], 0], [0, hs[3], 0]];
      const n = normalTop(h00, h10, h11, h01);
      const nrm = octEncode(n[0], n[1], n[2]);
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      s.ensure(4);
      for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, uvs[k][0], uvs[k][1], uvs[k][0], uvs[k][1], layer, flags, tint);
    }
    // sides
    const sideH: Record<number, [number, number]> = { 2: [h10, h00], 3: [h01, h11], 4: [h00, h01], 5: [h11, h10] };
    for (let d = 2; d < 6; d++) {
      const n = this.at(x + FN[d][0], y, z + FN[d][2]);
      if (n >>> 4 === id) continue;
      if (this.occludes(n, d, st)) continue;
      const [ha, hb] = sideH[d];
      this.cornerLight(d, x + FN[d][0], y, z + FN[d][2], false);
      this.boostOwn(x, y, z);
      // face param: u along face, v up; heights at u=0 -> ha, u=1 -> hb
      const P = this.tmp;
      const us = [0, 1, 1, 0], vs = [0, 0, hb, ha];
      s.ensure(4);
      for (let k = 0; k < 4; k++) {
        facePos(d, us[k], vs[k], d === 3 || d === 5 ? 1 : 0, P);
        this.emitV(s, x, y, z, P[0], P[1], P[2], FACE_OCT[d], us[k], vs[k], us[k], Math.min(1, vs[k]), layer, mode | FLAG_FLOWING | (192 << 8) | FLAG_NO_POM, tint);
      }
    }
    // bottom
    const dn = this.at(x, y - 1, z);
    if (dn >>> 4 !== id && !T_FULL_CUBE[dn >>> 4]) {
      this.cornerLight(0, x, y - 1, z, false);
      this.boostOwn(x, y, z);
      this.quad(s, x, y, z, 0, 0, 0, 1, 0, 1, layer, 0, mode | FLAG_NO_POM, tint, FACE_OCT[0]);
    }
  }

  // ---------------------------------------------------------------------------- misc special
  private wire(x: number, y: number, z: number, st: number, _def: BlockDef) {
    const s = this.streams.cutout;
    const power = st & 15;
    const layer = TEXTURE_INDEX.get('redstone_dust') ?? 0;
    const f = power / 15;
    const r = Math.round(255 * (f * 0.6 + 0.4)), g = Math.round(255 * Math.max(0, f * f * 0.7 - 0.5) * 0.3), b = 0;
    const tint = (r << 16) | (g << 8) | b;
    const conn = [false, false, false, false]; // N S W E
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const isWire = (s2: number) => s2 !== 0 && BLOCKS[s2 >>> 4].shape === 'wire';
    const isComponent = (s2: number) => {
      if (!s2) return false;
      const n = BLOCKS[s2 >>> 4].name;
      return n.includes('redstone_torch') || n === 'lever' || n.endsWith('button') || n.endsWith('pressure_plate') || n.includes('repeater') || n === 'comparator' || n === 'redstone_block' || n === 'observer' || n === 'daylight_detector' || n === 'target' || n.endsWith('_rail');
    };
    const upFull = T_FULL_CUBE[this.at(x, y + 1, z) >>> 4] === 1;
    const climb = [false, false, false, false];
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = dirs[i];
      const n = this.at(x + dx, y, z + dz);
      if (isWire(n) || isComponent(n)) conn[i] = true;
      else if (!upFull && isWire(this.at(x + dx, y + 1, z + dz)) && T_FULL_CUBE[n >>> 4]) { conn[i] = true; climb[i] = true; }
      else if (!T_FULL_CUBE[n >>> 4] && isWire(this.at(x + dx, y - 1, z + dz))) conn[i] = true;
    }
    const nconn = conn.filter(Boolean).length;
    if (nconn === 1) {
      // extend the line to the opposite side as Minecraft does
      for (let i = 0; i < 4; i++) if (conn[i]) conn[i ^ 1] = true;
    }
    this.flatLight(x, y, z);
    const yy = 1 / 64;
    const flags = FLAG_NO_POM;
    // dot or full cross
    const x0 = nconn === 0 ? 0 : conn[2] ? 0 : 0.3125, x1 = nconn === 0 ? 1 : conn[3] ? 1 : 0.6875;
    const z0 = nconn === 0 ? 0 : conn[0] ? 0 : 0.3125, z1 = nconn === 0 ? 1 : conn[1] ? 1 : 0.6875;
    // horizontal bar (x)
    s.ensure(8);
    const emitFlat = (ax: number, az: number, bx: number, bz: number) => {
      const pts = [[ax, yy, bz], [bx, yy, bz], [bx, yy, az], [ax, yy, az]];
      for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], FACE_OCT[1], pts[k][0], 1 - pts[k][2], 0.5, 0.5, layer, flags, tint);
    };
    if (nconn === 0) emitFlat(0.1875, 0.1875, 0.8125, 0.8125);
    else {
      if (conn[2] || conn[3]) emitFlat(x0, 0.3125, x1, 0.6875);
      if (conn[0] || conn[1]) emitFlat(0.3125, z0, 0.6875, z1);
    }
    // climbing pieces on adjacent block faces
    for (let i = 0; i < 4; i++) {
      if (!climb[i]) continue;
      const [dx, dz] = dirs[i];
      const d = dx < 0 ? 4 : dx > 0 ? 5 : dz < 0 ? 2 : 3;
      const plane = d === 3 || d === 5 ? 1 - 1 / 64 : 1 / 64;
      // vertical strip on the inner side of our cell facing back toward us
      this.quad(s, x, y, z, OPP[d], plane, 0.3125, 0.6875, 0, 1, layer, 0, flags, tint, FACE_OCT[OPP[d]]);
    }
  }

  private rail(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.cutout;
    const meta = st & 15;
    const shape = def.name === 'rail' ? meta : meta & 7;
    const layer = TEXTURE_INDEX.get(facesFor(def, meta).north) ?? 0;
    this.flatLight(x, y, z);
    const yy = 1 / 64;
    let rot = 0;
    let h = [yy, yy, yy, yy]; // heights at corners (0,1),(1,1),(1,0),(0,0) in UP order SW,SE,NE,NW
    switch (shape) {
      case 0: rot = 0; break; // N-S
      case 1: rot = 90; break; // E-W
      case 2: rot = 90; h = [yy, 1 + yy, 1 + yy, yy]; break; // ascending east
      case 3: rot = 90; h = [1 + yy, yy, yy, 1 + yy]; break; // ascending west
      case 4: rot = 0; h = [yy, yy, 1 + yy, 1 + yy]; break; // ascending north
      case 5: rot = 0; h = [1 + yy, 1 + yy, yy, yy]; break; // ascending south
      case 6: rot = 0; break; // SE curve
      case 7: rot = 90; break; // SW
      case 8: rot = 180; break; // NW
      case 9: rot = 270; break; // NE
    }
    const pts = [[0, h[0], 1], [1, h[1], 1], [1, h[2], 0], [0, h[3], 0]];
    const n = normalTop(h[3], h[2], h[1], h[0]);
    const nrm = octEncode(n[0], n[1], n[2]);
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    s.ensure(4);
    for (let k = 0; k < 4; k++) {
      const [tu, tv] = rotUV(uvs[k][0], uvs[k][1], rot);
      this.emitV(s, x, y, z, pts[k][0], pts[k][1], pts[k][2], nrm, tu, tv, 0.5, 0.5, layer, FLAG_NO_POM, 0xffffff);
    }
  }

  private portal(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.translucent;
    const layer = TEXTURE_INDEX.get('nether_portal') ?? 0;
    const axisZ = (st & 1) === 1;
    this.flatLight(x, y, z);
    const flags = MODE_NETHER_PORTAL | FLAG_NO_POM;
    const id = st >>> 4;
    if (!axisZ) {
      // spans X, thin in Z (6..10)
      for (const d of [2, 3]) this.quad(s, x, y, z, d, d === 2 ? 6 / 16 : 10 / 16, 0, 1, 0, 1, layer, 0, flags, 0xffffff, FACE_OCT[d]);
      for (const d of [4, 5]) if (this.at(x + FN[d][0], y, z) >>> 4 !== id) this.quad(s, x, y, z, d, d === 4 ? 0 : 1, 6 / 16, 10 / 16, 0, 1, layer, 0, flags, 0xffffff, FACE_OCT[d]);
    } else {
      for (const d of [4, 5]) this.quad(s, x, y, z, d, d === 4 ? 6 / 16 : 10 / 16, 0, 1, 0, 1, layer, 0, flags, 0xffffff, FACE_OCT[d]);
      for (const d of [2, 3]) if (this.at(x, y, z + FN[d][2]) >>> 4 !== id) this.quad(s, x, y, z, d, d === 2 ? 0 : 1, 6 / 16, 10 / 16, 0, 1, layer, 0, flags, 0xffffff, FACE_OCT[d]);
    }
    void def;
  }

  private endPortal(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.opaque;
    const layer = TEXTURE_INDEX.get('end_portal') ?? 0;
    this.flatLight(x, y, z);
    const top = def.name === 'end_gateway' ? 1 : 12 / 16;
    this.quad(s, x, y, z, 1, top, 0, 1, 0, 1, layer, 0, MODE_END_PORTAL | FLAG_NO_POM, 0xffffff, FACE_OCT[1]);
    if (def.name === 'end_gateway') for (let d = 0; d < 6; d++) if (d !== 1 && !T_FULL_CUBE[this.at(x + FN[d][0], y + FN[d][1], z + FN[d][2]) >>> 4]) this.quad(s, x, y, z, d, d === 3 || d === 5 ? 1 : 0, 0, 1, 0, 1, layer, 0, MODE_END_PORTAL | FLAG_NO_POM, 0xffffff, FACE_OCT[d]);
    void st;
  }

  private fire(x: number, y: number, z: number, st: number, def: BlockDef) {
    const s = this.streams.cutout;
    const layer = TEXTURE_INDEX.get(facesFor(def, st & 15).north) ?? 0;
    this.flatLight(x, y, z);
    const flags = MODE_FIRE | FLAG_NO_POM;
    const below = this.at(x, y - 1, z);
    const nrm = octEncode(0, 1, 0);
    if (T_FULL_CUBE[below >>> 4] || BLOCKS[below >>> 4].solid) {
      // crossed planes, slightly inclined inward
      const H = 1.4;
      const planes = [
        [[0, 0, 0.2], [1, 0, 0.2], [1, H, 0.5], [0, H, 0.5]],
        [[1, 0, 0.8], [0, 0, 0.8], [0, H, 0.5], [1, H, 0.5]],
        [[0.2, 0, 1], [0.2, 0, 0], [0.5, H, 0], [0.5, H, 1]],
        [[0.8, 0, 0], [0.8, 0, 1], [0.5, H, 1], [0.5, H, 0]],
      ];
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const pl of planes) {
        s.ensure(4);
        for (let k = 0; k < 4; k++) this.emitV(s, x, y, z, pl[k][0], pl[k][1], pl[k][2], nrm, uvs[k][0], uvs[k][1], 0.5, 0.5, layer, flags, 0xffffff);
      }
    } else {
      // fire on the sides of flammable neighbours
      for (let d = 2; d < 6; d++) {
        const n = this.at(x + FN[d][0], y, z + FN[d][2]);
        if (!BLOCKS[n >>> 4].flammability) continue;
        const plane = d === 3 || d === 5 ? 1 - 1 / 16 : 1 / 16;
        this.quad(s, x, y, z, OPP[d], plane, 0, 1, 0, 1, layer, 0, flags, 0xffffff, FACE_OCT[OPP[d]]);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------
function AO_CURVE(ao: number): number {
  // ao in 0..3 -> 0..255 (Minecraft-like but softer since SSAO adds detail)
  const t = ao / 3;
  return 255 * (0.42 + 0.58 * t);
}
function rotUV(u: number, v: number, r: number): [number, number] {
  switch (r) {
    case 90: return [v, 1 - u];
    case 180: return [1 - u, 1 - v];
    case 270: return [1 - v, u];
    default: return [u, v];
  }
}
function rotatePoint(x: number, y: number, z: number, axis: 'x' | 'y' | 'z', deg: number): [number, number, number] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
function sub(a: number[], b: number[]) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/** normal of a top surface with corner heights at NW(0,0) NE(1,0) SE(1,1) SW(0,1) in (x,z) */
function normalTop(hNW: number, hNE: number, hSE: number, hSW: number): [number, number, number] {
  const dx = ((hNE + hSE) - (hNW + hSW)) * 0.5;
  const dz = ((hSW + hSE) - (hNW + hNE)) * 0.5;
  const n = [-dx, 1, -dz];
  const l = Math.hypot(n[0], n[1], n[2]);
  return [n[0] / l, n[1] / l, n[2] / l];
}

export { stairShape as _stairShape, T_LAYER as _T_LAYER };
export type { Faces };
