// Regenerate public/assets/weapons/manifest.json from the optimized GLBs + tools/assets/weapons/meta/*.meta.json
//   node tools/assets/weapons/make_manifest.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'public/assets/weapons');
const REFS = JSON.parse(fs.readFileSync(path.join(HERE, 'ref_sources.json'), 'utf8'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const ORDER = ['ar_m416', 'ar_akm', 'ar_scarl', 'ar_m16a4', 'ar_beryl', 'ar_aug', 'ar_groza', 'smg_ump45', 'smg_vector', 'smg_uzi', 'smg_tommy', 'smg_mp5k',
  'dmr_sks', 'dmr_mini14', 'dmr_slr', 'dmr_mk14', 'sr_kar98k', 'sr_m24', 'sr_awm', 'sr_win94', 'sg_s1897', 'sg_s686', 'sg_s12k', 'lmg_m249', 'lmg_dp28',
  'pistol_p92', 'pistol_p1911', 'pistol_r1895', 'pistol_p18c', 'pistol_sawedoff'];

const weapons = [];
let total = 0;
for (const id of ORDER) {
  const file = path.join(OUT, id + '.glb');
  if (!fs.existsSync(file)) { console.warn('missing', id); continue; }
  const meta = JSON.parse(fs.readFileSync(path.join(HERE, 'meta', id + '.meta.json'), 'utf8'));
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  const nodes = {};
  for (const n of root.listNodes()) {
    if (n.getName() === id) continue;
    nodes[n.getName()] = { parent: n.getParentNode()?.getName() ?? null, mesh: !!n.getMesh(), position: n.getTranslation().map(v => +v.toFixed(4)) };
  }
  for (const req of ['body', 'mag', meta.cycle_node, 'muzzle', 'grip_support', 'sight_eye']) if (!nodes[req]) console.warn('MISSING NODE', id, req);
  const tex = root.listTextures().map(t => t.getSize()?.[0]);
  const bytes = fs.statSync(file).size; total += bytes;
  const ref = REFS[id] || {};
  weapons.push({
    id, file: id + '.glb', name: meta.name,
    length_m: meta.length_m, real_length_m: meta.real_length_m,
    bounds_m: { min: meta.bounds_min, max: meta.bounds_max },
    tris, materials: root.listMaterials().length, texture_px: Math.max(...tex), bytes,
    source: 'authored', license: 'CC0 (authored for this project with tools/assets/weapons)',
    reference: ref,
    nodes,
    cycle_node: meta.cycle_node, mag_kind: meta.mag_kind,
  });
}
// keep entries / keys written by other tools (e.g. melee or throwables placed in this folder by the gear pipeline)
let prev = {};
try { prev = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); } catch { /* first run */ }
const others = (prev.weapons || []).filter(w => !ORDER.includes(w.id));
const manifest = {
  ...prev,
  category: 'weapons',
  conventions: 'Node positions are local to the listed parent (mesh-node positions include the meshopt dequantization offset; do not rely on them). glTF +Y up, barrel along +Z, meters. Root node = weapon id; origin at the firing-hand pistol grip. ' +
    'Children of the root: body (static mesh), plus pivot nodes mag and <cycle_node> (bolt | charging_handle | slide); each pivot node holds its mesh as child <name>_mesh. ' +
    'Animate the pivot node (mag: top of the mag well; bolt/charging_handle/slide: the handle; break-action bolt: hinge pin; Win94 bolt: lever pivot; R1895 bolt: hammer pivot, mag: cylinder axis). ' +
    'Empties: muzzle, grip_support (support hand), sight_eye (eye point on the iron-sight line), rail_top (optic mount point, top of rail/receiver; omitted where nothing can mount).',
  firearms_total_bytes: total,
  weapons: [...weapons, ...others],
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('manifest:', weapons.length, 'weapons,', (total / 1048576).toFixed(2), 'MB');
