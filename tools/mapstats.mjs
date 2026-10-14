// Size and budget report for the built-in maps (node, no browser):
//   node tools/mapstats.mjs [id|all]
// Per map: brushes, visible faces, triangles, world draw calls (one per texture), point
// lights, lightmap atlas, nav nodes (flood fill from the spawns, as the game does), the
// shipped lightmap's state, build / nav times; then each figure against de_dust2's x 1.3
// (the M5 budget). Browser-only figures (frame ms with 28 zombies, load time, draw calls
// including models) come from tools/tests/zm5-framework.js.
import { existsSync, readFileSync } from 'fs';
import { BUILTIN, BUILTIN_MAPS } from '../src/map/maps/index.js';
import { prepareMap } from '../src/map/prepare.js';
import { NavGraph } from '../src/game/nav.js';

const which = process.argv[2] || 'all';
const defs = which === 'all' ? BUILTIN_MAPS : [BUILTIN[which]];
if (!defs[0]) throw new Error(`mapstats: no built-in map "${which}"`);
const BUDGET = 1.3;

function stats(def) {
  const P = prepareMap(def);
  let tris = 0;
  const tex = new Set();
  for (const f of P.compiled.faces) { tris += f.poly.length - 2; tex.add(f.texName); }
  const t1 = performance.now();
  const spawns = P.map.entities.filter((e) => e.classname === 'info_player_start' || e.classname === 'info_player_deathmatch');
  const nav = new NavGraph(P.compiled.world, P.map.bounds).build(spawns.map((e) => [e.origin[0], e.origin[1], e.origin[2] - 36]));
  const navMs = performance.now() - t1;
  let lm = 'none';
  const f = new URL(`../public/maps/${def.id}.lm.json`, import.meta.url);
  if (existsSync(f)) { const m = JSON.parse(readFileSync(f, 'utf8')); lm = m.hash === P.hash ? `ok (${m.quality})` : `STALE (${m.hash} != ${P.hash})`; }
  return {
    id: def.id, brushes: P.map.brushes.length, faces: P.compiled.faces.length, tris, draws: tex.size, lights: P.lighting.lights.length,
    atlas: P.alloc.width * P.alloc.height, atlasStr: `${P.alloc.width}x${P.alloc.height}`, nav: nav.nodes.length,
    spawnsCT: spawns.filter((e) => e.classname === 'info_player_start').length, hash: P.hash, lm, buildMs: P.ms, navMs,
  };
}

const ref = stats(BUILTIN.de_dust2);
const rows = defs.map((d) => (d.id === 'de_dust2' ? ref : stats(d)));
const KEYS = ['brushes', 'faces', 'tris', 'draws', 'atlas', 'nav'];
for (const r of rows) {
  console.log(`${r.id.padEnd(16)} brushes ${r.brushes}  faces ${r.faces}  tris ${r.tris}  draws ${r.draws}  lights ${r.lights}  atlas ${r.atlasStr}  nav ${r.nav}  CT spawns ${r.spawnsCT}  hash ${r.hash}  lightmap ${r.lm}  build ${r.buildMs.toFixed(0)} ms  nav ${r.navMs.toFixed(0)} ms`);
  if (r !== ref) {
    const over = KEYS.filter((k) => r[k] > ref[k] * BUDGET).map((k) => `${k} ${r[k]} > ${Math.round(ref[k] * BUDGET)}`);
    console.log(`${''.padEnd(16)} budget (de_dust2 x ${BUDGET}): ${over.length ? 'OVER - ' + over.join(', ') : 'ok'}`);
  }
}
