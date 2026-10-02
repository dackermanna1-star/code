/**
 * Builds a THREE.Mesh for a single block state using the real chunk mesher + terrain
 * materials (for falling blocks, dropped block items, held blocks, icons ...).
 */
import * as THREE from 'three';
import { Mesher, P, pidx, cidx, type LayerMesh } from './mesher';
import type { Renderer } from './renderer';

const mesher = new Mesher();
const cache = new Map<string, THREE.BufferGeometry[]>();

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
  const quads = l.vertexCount / 4;
  const idx = new Uint16Array(quads * 6);
  for (let q = 0; q < quads; q++) {
    const v = q * 4, i = q * 6;
    idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2);
  return g;
}

/**
 * Create a mesh group for a block centred at its local origin (block occupies [-0.5,0.5]^3 + offset).
 * `light` packed light (default full sky), `tint` biome colour for grass/leaves.
 */
export function createBlockMesh(renderer: Renderer, state: number, opts: { light?: number; tint?: number; bevels?: boolean } = {}): THREE.Group {
  const light = opts.light ?? 15 << 12;
  const tint = opts.tint ?? 0x7fb238;
  const key = `${state}|${light}|${tint}|${opts.bevels ?? true}`;
  let geos = cache.get(key);
  if (!geos) {
    const blocks = new Uint16Array(P * P * P);
    const lightArr = new Uint16Array(P * P * P).fill(light);
    blocks[pidx(0, 0, 0)] = state;
    // double-height blocks: add the upper half so the model is complete
    const col = new Uint32Array(P * P).fill(tint);
    const out = mesher.mesh({ blocks, light: lightArr, grass: col, foliage: col, water: new Uint32Array(P * P).fill(0x3f76e4), ox: 0, oy: 0, oz: 0, bevels: opts.bevels === false ? 0 : 1, decorations: 0 });
    geos = [out.opaque, out.cutout, out.translucent].map((l) => (l ? geometryFrom(l) : null)).filter(Boolean) as THREE.BufferGeometry[];
    (geos as any).layers = [out.opaque, out.cutout, out.translucent].map((l) => !!l);
    cache.set(key, geos);
    void cidx;
  }
  const mats = renderer.blockMaterials();
  const layers: boolean[] = (geos as any).layers;
  const group = new THREE.Group();
  let gi = 0;
  for (let li = 0; li < 3; li++) {
    if (!layers[li]) continue;
    const mat = li === 0 ? mats.opaque : mats.cutout; // translucent items are drawn with the cutout G-buffer material
    const m = new THREE.Mesh(geos[gi++], mat);
    m.position.set(-0.5, -0.5, -0.5);
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}
