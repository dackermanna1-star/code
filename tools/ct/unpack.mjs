#!/usr/bin/env node
// Unpacks assets/wads/chinatown.wad (or a given PWAD) back into the staging
// tree build/ct/lumps/<namespace>/ that tools/ct/pack.mjs assembles, so the
// map can be rebuilt and repacked with only Node: the art scripts need
// Blender, Python and downloaded source assets, the map builder does not.
//
//   P_START..P_END -> patches, F_START..F_END -> flats, S_START..S_END -> sprites
//   DS* -> sounds, D_* -> music, PNAMES + TEXTURE1 -> data/TEXTURES.json,
//   anything else outside the map -> graphics
//
// The map lumps are skipped (tools/ct/build-map.mjs writes them).
// Usage: [CT_LUMPS=dir] node tools/ct/unpack.mjs [--if-missing] [file.wad]
//   --if-missing  leave namespaces that already have staged lumps alone

import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const lumpsDir = process.env.CT_LUMPS ? path.resolve(process.env.CT_LUMPS) : path.join(root, 'build/ct/lumps');
const args = process.argv.slice(2);
const ifMissing = args.includes('--if-missing');
const file = args.find((a) => !a.startsWith('--')) || path.join(root, 'assets/wads/chinatown.wad');

const buf = fs.readFileSync(file);
if (buf.toString('ascii', 0, 4) !== 'PWAD') throw new Error(`${file} is not a PWAD`);
const count = buf.readInt32LE(4);
const dirOfs = buf.readInt32LE(8);
const lumps = [];
for (let i = 0; i < count; i++) {
  const o = dirOfs + 16 * i;
  const pos = buf.readInt32LE(o), size = buf.readInt32LE(o + 4);
  const name = buf.toString('ascii', o + 8, o + 16).replace(/\0.*$/, '').toUpperCase();
  lumps.push({ name, data: buf.subarray(pos, pos + size) });
}

const MAP_LUMPS = new Set(['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP']);
const MARKERS = { P_START: 'patches', F_START: 'flats', S_START: 'sprites' };
const ENDS = new Set(['P_END', 'F_END', 'S_END']);
const out = { patches: [], flats: [], sprites: [], sounds: [], music: [], graphics: [] };
let block = null, pnames = null, texture1 = null;
for (let i = 0; i < lumps.length; i++) {
  const l = lumps[i];
  if (MARKERS[l.name]) { block = MARKERS[l.name]; continue; }
  if (ENDS.has(l.name)) { block = null; continue; }
  if (block) { out[block].push(l); continue; }
  if (MAP_LUMPS.has(l.name)) continue;
  // A map header is an empty lump followed by THINGS.
  if (l.data.length === 0 && lumps[i + 1] && lumps[i + 1].name === 'THINGS') continue;
  if (l.name === 'PNAMES') { pnames = l.data; continue; }
  if (l.name === 'TEXTURE1') { texture1 = l.data; continue; }
  if (l.name.startsWith('DS')) out.sounds.push(l);
  else if (l.name.startsWith('D_')) out.music.push(l);
  else out.graphics.push(l);
}

const staged = (ns) => {
  const d = path.join(lumpsDir, ns);
  return fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.lmp') || f.endsWith('.json'));
};
const report = [];
const writeNs = (ns, list) => {
  if (ifMissing && staged(ns)) { report.push(`${ns} kept`); return; }
  const d = path.join(lumpsDir, ns);
  fs.mkdirSync(d, { recursive: true });
  for (const l of list) fs.writeFileSync(path.join(d, `${l.name}.lmp`), l.data);
  report.push(`${ns} ${list.length}`);
};
for (const ns of Object.keys(out)) writeNs(ns, out[ns]);

if (pnames && texture1) {
  if (ifMissing && staged('data')) report.push('data kept');
  else {
    const n = pnames.readInt32LE(0);
    const names = [];
    for (let i = 0; i < n; i++) names.push(pnames.toString('ascii', 4 + 8 * i, 12 + 8 * i).replace(/\0.*$/, '').toUpperCase());
    const defs = {};
    const nt = texture1.readInt32LE(0);
    for (let i = 0; i < nt; i++) {
      const o = texture1.readInt32LE(4 + 4 * i);
      const tname = texture1.toString('ascii', o, o + 8).replace(/\0.*$/, '').toUpperCase();
      const np = texture1.readInt16LE(o + 20);
      const patches = [];
      for (let j = 0; j < np; j++) {
        const p = o + 22 + 10 * j;
        patches.push({ patch: names[texture1.readInt16LE(p + 4)], x: texture1.readInt16LE(p), y: texture1.readInt16LE(p + 2) });
      }
      defs[tname] = { width: texture1.readInt16LE(o + 12), height: texture1.readInt16LE(o + 14), patches };
    }
    fs.mkdirSync(path.join(lumpsDir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(lumpsDir, 'data/TEXTURES.json'), JSON.stringify(defs, null, 1));
    report.push(`data TEXTURES.json (${nt} textures)`);
  }
}
console.log(`unpacked ${path.relative(root, file) || file}: ${report.join(', ')}`);
