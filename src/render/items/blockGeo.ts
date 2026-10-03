/**
 * Block item geometry in the terrain vertex layout: arbitrary small block arrangements
 * meshed with the real chunk mesher (fences with two posts, beds with both halves ...) and
 * flat texture cards for plant/rail/torch style items. Cached per key.
 */
import * as THREE from 'three';
import { Mesher, P, pidx, octEncode, type LayerMesh } from '../mesher';
import { BLOCKS, BLOCK_BY_NAME, facesFor, stateOf, type BlockDef } from '../../world/blocks/registry';
import { textureLayer } from '../materials/textureList';
import type { BlockLayerKind } from './itemMaterials';

export interface BlockGeoLayer {
  kind: BlockLayerKind;
  geometry: THREE.BufferGeometry;
}
export interface BlockGeo {
  layers: BlockGeoLayer[];
  /** Bounds in block units (arrangement space). */
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** True for flat sprite cards (z = 0 plane, x/y in [-0.5, 0.5]). */
  flat: boolean;
}

const mesher = new Mesher();
const cache = new Map<string, BlockGeo>();
let sharedIndex: THREE.BufferAttribute | null = null;

function quadIndex(quads: number): THREE.BufferAttribute {
  if (!sharedIndex || sharedIndex.count < quads * 6) {
    const n = Math.max(quads, 4096);
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    sharedIndex = new THREE.BufferAttribute(idx, 1);
  }
  return sharedIndex;
}

function geometryFrom(l: LayerMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(l.pos, 4);
  pos.gpuType = THREE.IntType;
  const tex = new THREE.BufferAttribute(l.tex, 4);
  tex.gpuType = THREE.IntType;
  g.setAttribute('a_pos', pos);
  g.setAttribute('a_tex', tex);
  g.setAttribute('a_light', new THREE.BufferAttribute(l.light, 4, true));
  g.setAttribute('a_color', new THREE.BufferAttribute(l.color, 4, true));
  g.setIndex(quadIndex(l.vertexCount / 4));
  g.setDrawRange(0, (l.vertexCount / 4) * 6);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}

/** Default biome tints for item renders (Minecraft's inventory grass/foliage colours). */
export const ITEM_GRASS = 0x79c05a;
export const ITEM_FOLIAGE = 0x48b518;

/**
 * Mesh a block arrangement. `blocks` = [x, y, z, state] with x,y,z in 0..14.
 * Vertex positions are in arrangement units (block = 1).
 */
export function meshArrangement(key: string, blocks: [number, number, number, number][], tint = ITEM_GRASS, foliage = ITEM_FOLIAGE): BlockGeo {
  const hit = cache.get(key);
  if (hit) return hit;
  const arr = new Uint16Array(P * P * P);
  const light = new Uint16Array(P * P * P).fill(15 << 12);
  for (const [x, y, z, s] of blocks) arr[pidx(x, y, z)] = s;
  const grass = new Uint32Array(P * P).fill(tint);
  const fol = new Uint32Array(P * P).fill(foliage);
  const out = mesher.mesh({ blocks: arr, light, grass, foliage: fol, water: new Uint32Array(P * P).fill(0x3f76e4), ox: 0, oy: 0, oz: 0, bevels: 1, decorations: 0 });
  const layers: BlockGeoLayer[] = [];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  (['opaque', 'cutout', 'translucent'] as const).forEach((k) => {
    const l = out[k];
    if (!l) return;
    for (let i = 0; i < l.vertexCount; i++) {
      const x = l.pos[i * 4] / 256 - 8, y = l.pos[i * 4 + 1] / 256 - 8, z = l.pos[i * 4 + 2] / 256 - 8;
      min.min(new THREE.Vector3(x, y, z));
      max.max(new THREE.Vector3(x, y, z));
    }
    layers.push({ kind: k, geometry: geometryFrom(l) });
  });
  if (!layers.length) { min.set(0, 0, 0); max.set(1, 1, 1); }
  const g: BlockGeo = { layers, min, max, flat: false };
  cache.set(key, g);
  return g;
}

/** A vertical texture card in the terrain layout (x,y in [-0.5,0.5] at z = 0, facing +z). */
export function flatCard(key: string, cards: { tex: string; tint: number; x0: number; y0: number; x1: number; y1: number }[]): BlockGeo {
  const hit = cache.get(key);
  if (hit) return hit;
  const n = cards.length * 4;
  const pos = new Uint16Array(n * 4), tex = new Uint16Array(n * 4), light = new Uint8Array(n * 4), color = new Uint8Array(n * 4);
  const nrm = octEncode(0, 0, 1);
  let v = 0;
  for (const c of cards) {
    const layer = textureLayer(c.tex);
    const corners: [number, number, number, number][] = [[c.x0, c.y0, 0, 0], [c.x1, c.y0, 1, 0], [c.x1, c.y1, 1, 1], [c.x0, c.y1, 0, 1]];
    for (const [x, y, u, vv] of corners) {
      const i = v * 4;
      pos[i] = Math.round((x + 8) * 256); pos[i + 1] = Math.round((y + 8) * 256); pos[i + 2] = Math.round(8 * 256); pos[i + 3] = nrm;
      tex[i] = Math.round(u * 4096); tex[i + 1] = Math.round(vv * 4096); tex[i + 2] = layer; tex[i + 3] = 32; // FLAG_NO_POM
      light[i] = 255;
      color[i] = (c.tint >> 16) & 255; color[i + 1] = (c.tint >> 8) & 255; color[i + 2] = c.tint & 255; color[i + 3] = 255;
      v++;
    }
  }
  const geo = geometryFrom({ pos, tex, light, color, vertexCount: n });
  const g: BlockGeo = { layers: [{ kind: 'cutout', geometry: geo }], min: new THREE.Vector3(-0.5, -0.5, 0), max: new THREE.Vector3(0.5, 0.5, 0), flat: true };
  cache.set(key, g);
  return g;
}

// ------------------------------------------------------------------------------------------
const FLAT_SHAPES = new Set(['cross', 'double_plant', 'crop', 'stem', 'torch', 'rail', 'ladder', 'vine', 'lily_pad', 'cobweb', 'pane', 'door', 'lever', 'wire', 'fire', 'chain']);

function tintOf(def: BlockDef): number {
  if (def.tint === 'grass') return ITEM_GRASS;
  if (def.tint === 'foliage') return ITEM_FOLIAGE;
  if (def.tint === 'water') return 0x3f76e4;
  if (typeof def.tint === 'number') return def.tint;
  return 0xffffff;
}

/** Whether a block item is shown as a flat texture sprite (like Minecraft's item/generated models). */
export function isFlatBlockItem(def: BlockDef): boolean {
  return FLAT_SHAPES.has(def.shape) || def.name === 'bamboo';
}

/** Small models that Minecraft's inventory shows larger than block scale. */
const ZOOM_SHAPES = new Set(['lantern', 'sea_pickle', 'end_rod', 'flower_pot', 'button', 'brewing_stand']);

export interface BlockItemGeo extends BlockGeo {
  /** 'cube' keep the block-cell framing; 'fit' frame the model bounds. */
  framing: 'cube' | 'fit';
}

/** Geometry for a block item's inventory/hand/dropped representation. */
export function blockItemGeo(def: BlockDef): BlockItemGeo {
  const id = def.id;
  if (isFlatBlockItem(def)) {
    const t = tintOf(def);
    if (def.shape === 'door') {
      const top = facesFor(def, 8).north, bot = facesFor(def, 0).north;
      return { ...flatCard(`flat:${def.name}`, [{ tex: bot, tint: 0xffffff, x0: -0.25, y0: -0.5, x1: 0.25, y1: 0 }, { tex: top, tint: 0xffffff, x0: -0.25, y0: 0, x1: 0.25, y1: 0.5 }]), framing: 'fit' };
    }
    const meta = def.shape === 'double_plant' ? 8 : def.shape === 'torch' ? 1 : def.shape === 'crop' ? 7 : 0;
    const f = facesFor(def, meta);
    const tex = def.shape === 'lily_pad' ? f.up : def.shape === 'wire' ? f.up : f.north;
    return { ...flatCard(`flat:${def.name}`, [{ tex, tint: def.shape === 'wire' ? 0xd01010 : t, x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 }]), framing: 'fit' };
  }
  const blocks: [number, number, number, number][] = [];
  let meta = 0;
  let framing: 'cube' | 'fit' = 'cube';
  switch (def.shape) {
    case 'fence': case 'wall':
      blocks.push([1, 1, 1, stateOf(id, 0)], [2, 1, 1, stateOf(id, 0)]);
      framing = 'fit';
      break;
    case 'bed':
      // foot at z=1, head toward +z (hfacing SOUTH = 0)
      blocks.push([1, 1, 1, stateOf(id, 0)], [1, 1, 2, stateOf(id, 8)]);
      framing = 'fit';
      break;
    case 'piston':
      meta = 1;
      break;
    case 'end_rod':
      meta = 1;
      break;
    case 'button':
      meta = 1;
      break;
    case 'hopper':
      meta = 0;
      break;
    default:
      if (def.orient === 'facing') meta = 3; // front toward SOUTH (left face in the icon)
      else if (def.orient === 'hfacing' || def.shape === 'stairs' || def.shape === 'chest' || def.shape === 'anvil' || def.shape === 'repeater' || def.shape === 'comparator') meta = def.shape === 'stairs' ? 1 : 0;
      else if (def.shape === 'leaves') meta = 4;
  }
  if (!blocks.length) blocks.push([1, 1, 1, stateOf(id, meta)]);
  if (ZOOM_SHAPES.has(def.shape)) framing = 'fit';
  const geo = meshArrangement(`item:${def.name}`, blocks, def.tint === 'foliage' ? ITEM_FOLIAGE : ITEM_GRASS);
  // translate so the arrangement's anchor cell is centred at the origin
  return { ...geo, framing };
}

/** Centre (arrangement units) used to place a block item's geometry at the origin. */
export function blockItemCentre(g: BlockItemGeo): THREE.Vector3 {
  if (g.flat) return new THREE.Vector3(0, 0, 0);
  if (g.framing === 'cube') return new THREE.Vector3(1.5, 1.5, 1.5);
  return g.min.clone().add(g.max).multiplyScalar(0.5);
}

export { BLOCKS, BLOCK_BY_NAME };
