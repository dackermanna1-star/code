// Write manifest.json for public/assets/attachments, public/assets/items and public/assets/gear (the gear manifest
// also indexes every asset of this category, including the melee/throwable GLBs that live in public/assets/weapons).
//   node tools/assets/gear/make_manifest.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const AUTHORED = { source: 'authored for this project (scripted Blender, tools/assets/gear)', source_url: null, license: 'CC0-1.0', author: 'project' };
const PH = (id, author) => ({ source: `Poly Haven "${id}"`, source_url: `https://polyhaven.com/a/${id}`, license: 'CC0-1.0', author, converted_by: 'tools/assets/gear/ph_prop.py' });
const SOURCES = {
  melee_machete: PH('machete', 'Ulan Cabanilla'),
  melee_crowbar: PH('crowbar_01', 'Alexander Otterbeck'),
  ammo_762: PH('ammo_box', 'DanKit'),
  item_fuelcan: PH('metal_jerrycan', 'Sean Buckley'),
  deathbox: PH('wooden_crate_02', 'James Ray Cock, Jurita Burger'),
};
const ORIGIN = {
  scope: 'rail-mount base: bottom of the clamp on the Picatinny rail top, centred on the clamp; optical axis along +Z',
  muzzle: 'rear (thread shoulder) face on the bore axis; device extends along +Z',
  grip: 'rail contact on the clamp top (mounts under a bottom rail); grip hangs toward -Y',
  mag: 'top of the magazine body (mag-well top, like the weapon mag pivots); hangs toward -Y',
  stock: 'stock_tactical: receiver end plate on the buffer-tube axis, stock extends toward -Z; stock_cheekpad: top of the stock comb',
  melee: 'hand grip; +Z = toward the tip/head, +Y = spine/up',
  throwable: 'hand grip at the body centre; +Y = fuze/neck up',
  helmet: 'head centre = Head bone + (0, 0.100, 0.008) in the rest pose; +Z = face forward',
  vest: 'chest centre = root-space (0, 1.30, 0.0) in the rest pose (Spine2 + (0, -0.021, +0.020))',
  backpack: 'upper-back attach point = root-space (0, 1.40, -0.185) (Spine2 + (0, 0.079, -0.165)); the pack front sits behind the thickest vest',
  parachute: 'between the shoulder riser attachments, root-space about (0, 1.47, -0.05) (Spine2 + (0, 0.15, -0.03))',
  item: 'bottom centre resting on the ground (y = 0); printed/front side faces +Z',
};

function triCount(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}

async function entry(dir, file) {
  const id = file.replace('.glb', '');
  const p = path.join(ROOT, 'public/assets', dir, file);
  const doc = await io.read(p);
  const root = doc.getRoot();
  const metaPath = path.join(HERE, 'meta', id + '.meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  // bounds from the decoded scene (world space)
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const wm = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); const v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const w = [0, 1, 2].map(k => v[0] * wm[k] + v[1] * wm[4 + k] + v[2] * wm[8 + k] + wm[12 + k]);
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
      }
    }
  }
  const nodes = root.listNodes().map(n => n.getName()).filter(Boolean);
  const kind = meta.kind || (dir === 'items' ? 'item' : dir);
  const e = {
    id,
    file: `/assets/${dir}/${file}`,
    kind,
    ...(SOURCES[id] || AUTHORED),
    tris: triCount(doc),
    bytes: fs.statSync(p).size,
    bounds_min_m: mn.map(x => +x.toFixed(4)),
    bounds_max_m: mx.map(x => +x.toFixed(4)),
    size_m: mx.map((x, i) => +(x - mn[i]).toFixed(4)),
    nodes,
    materials: root.listMaterials().map(m => m.getName()),
    textures: root.listTextures().map(t => ({ mime: t.getMimeType(), size: t.getSize() })),
  };
  const originKey = ['reddot', 'holo', 'scope'].includes(kind) ? 'scope' : (['ammo', 'heal', 'boost', 'airdrop', 'item', 'deathbox', 'fuel'].includes(kind) ? 'item' : kind);
  e.origin = ORIGIN[originKey] || ORIGIN.item;
  for (const k of ['type', 'level', 'zoom', 'zoom_min', 'optical_axis_height_m', 'eye_relief_m', 'lens_radius_m', 'window_size_m', 'reticle',
    'field_of_view_deg', 'attach_bone', 'attach_offset_m', 'origin_root_space_m', 'capacity_l', 'caliber', 'fits', 'length_m', 'span_m',
    'chord_m', 'canopy_diameter_m', 'variant', 'notes', 'nodes_note', 'inner_width_m', 'capacity_note']) {
    if (meta[k] !== undefined) e[k] = meta[k];
  }
  return e;
}

async function folder(dir, filter = () => true) {
  const all = fs.readdirSync(path.join(ROOT, 'public/assets', dir)).filter(f => f.endsWith('.glb') && !f.startsWith('_') && filter(f)).sort();
  const out = [];
  for (const f of all.filter(f => !f.endsWith('_lod1.glb'))) {
    const e = await entry(dir, f);
    const lf = f.replace('.glb', '_lod1.glb');
    if (all.includes(lf)) {
      const l = await entry(dir, lf);
      e.lod1 = { file: l.file, tris: l.tris, bytes: l.bytes, textures: l.textures, switch_distance_m: 25 };
    }
    out.push(e);
  }
  return out;
}

const conventions = {
  units: 'meters', up: '+Y', forward: '+Z (the right-hand side of an asset is -X)',
  compression: 'EXT_meshopt_compression + KHR_mesh_quantization (load with GLTFLoader.setMeshoptDecoder); no Draco/KTX2',
  materials: "authored assets: one baked PBR material 'M_<id>' (JPEG baseColor, normal, packed ORM = occlusion/roughness/metalness) " +
    "plus plain untextured materials for glass/lenses/lines ('lens', 'lens_amber', 'window', 'glass_*', 'liquid_*', 'line')",
};
const attachments = await folder('attachments');
const items = await folder('items');
const gear = await folder('gear');
const weaponsExtra = await folder('weapons', f => /^(melee_|throw_)/.test(f));
const total = (a) => a.reduce((s, e) => s + e.bytes + (e.lod1 ? e.lod1.bytes : 0), 0);
const reticles = fs.readdirSync(path.join(ROOT, 'public/assets/attachments/reticles')).filter(f => f.endsWith('.png')).sort()
  .map(f => ({ file: `/assets/attachments/reticles/${f}`, bytes: fs.statSync(path.join(ROOT, 'public/assets/attachments/reticles', f)).size }));

const write = (dir, obj) => fs.writeFileSync(path.join(ROOT, 'public/assets', dir, 'manifest.json'), JSON.stringify(obj, null, 1) + '\n');
write('attachments', { category: 'attachments', version: 1, generated_by: 'tools/assets/gear/make_manifest.mjs', conventions, reticles,
  total_bytes: total(attachments) + reticles.reduce((s, r) => s + r.bytes, 0), assets: attachments });
write('items', { category: 'items', version: 1, generated_by: 'tools/assets/gear/make_manifest.mjs', conventions, total_bytes: total(items), assets: items });
write('gear', {
  category: 'gear', version: 1, generated_by: 'tools/assets/gear/make_manifest.mjs', conventions,
  fit: { characters: 'fitted to the max body envelope of survivor_m_shirt / _leather / _vest / _hoodie_blue (rest A-pose, tools/assets/gear/fit)',
    skeleton: 'pubg_m55 (joint rest rotations are identity, so bone-local offsets equal root-space offsets in the rest pose)' },
  total_bytes: total(gear), assets: gear,
  index: {
    note: 'every asset of the attachments/melee/throwables/gear/items category; melee_* and throw_* live in public/assets/weapons',
    attachments: attachments.map(e => e.file), items: items.map(e => e.file), gear: gear.map(e => e.file), weapons: weaponsExtra.map(e => e.file),
    total_bytes: total(attachments) + total(items) + total(gear) + total(weaponsExtra) + reticles.reduce((s, r) => s + r.bytes, 0),
  },
  weapons_extra: weaponsExtra,
});
console.log('attachments', attachments.length, 'items', items.length, 'gear', gear.length, 'weapons', weaponsExtra.length,
  'MB', ((total(attachments) + total(items) + total(gear) + total(weaponsExtra)) / 1048576).toFixed(2));
