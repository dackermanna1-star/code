#!/usr/bin/env node
// Assembles assets/wads/chinatown.wad from the staged lumps that the
// Chinatown asset and map scripts write to build/ct/lumps/<namespace>/.
//
//   patches/*.lmp   wall patches            -> P_START .. P_END
//   flats/*.lmp     64x64 flats             -> F_START .. F_END
//   sprites/*.lmp   sprite frames           -> S_START .. S_END
//   sounds/*.lmp    DMX sounds (DS*)
//   music/*.lmp     MIDI music (D_*)
//   graphics/*.lmp  other pictures (menu / HUD graphics)
//   data/TEXTURES.json  texture definitions -> PNAMES + TEXTURE1
//   data/*.lmp      other raw lumps
//   map/order.json + map/*.lmp  the map, in lump order
//
// TEXTURES.json: { "CTBRK1": { "width": 128, "height": 128,
//   "patches": [{ "patch": "CTBRK1A", "x": 0, "y": 0 }, ...] }, ... }
// Usage: [CT_LUMPS=dir] node tools/ct/pack.mjs [out.wad]

import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const lumpsDir = process.env.CT_LUMPS ? path.resolve(process.env.CT_LUMPS) : path.join(root, 'build/ct/lumps');
const out = process.argv[2] || path.join(root, 'assets/wads/chinatown.wad');

function listLumps(ns) {
  const dir = path.join(lumpsDir, ns);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.lmp')).sort()
    .map((f) => ({ name: f.slice(0, -4).toUpperCase(), data: fs.readFileSync(path.join(dir, f)) }));
}

function name8(s) {
  const b = Buffer.alloc(8);
  b.write(s.toUpperCase().slice(0, 8), 'ascii');
  return b;
}

const lumps = [];
const add = (name, data = Buffer.alloc(0)) => lumps.push({ name, data: Buffer.from(data) });

// Map first, so it's easy to find in a WAD viewer.
const mapDir = path.join(lumpsDir, 'map');
if (fs.existsSync(path.join(mapDir, 'order.json'))) {
  for (const n of JSON.parse(fs.readFileSync(path.join(mapDir, 'order.json'), 'utf8'))) {
    const f = path.join(mapDir, `${n.file || n.name}.lmp`);
    add(n.name, fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0));
  }
}

// Textures: PNAMES + TEXTURE1 from the manifest.
const texFile = path.join(lumpsDir, 'data/TEXTURES.json');
const patches = listLumps('patches');
if (fs.existsSync(texFile)) {
  const defs = JSON.parse(fs.readFileSync(texFile, 'utf8'));
  const names = Object.keys(defs);
  const pnames = [];
  const pindex = new Map();
  for (const t of names) for (const p of defs[t].patches) {
    const pn = p.patch.toUpperCase();
    if (!pindex.has(pn)) { pindex.set(pn, pnames.length); pnames.push(pn); }
  }
  const have = new Set(patches.map((p) => p.name));
  for (const pn of pnames) if (!have.has(pn)) throw new Error(`texture patch ${pn} has no lump in build/ct/lumps/patches`);
  const pn = Buffer.alloc(4 + 8 * pnames.length);
  pn.writeInt32LE(pnames.length, 0);
  pnames.forEach((n, i) => name8(n).copy(pn, 4 + 8 * i));
  const bodies = names.map((t) => {
    const d = defs[t];
    const b = Buffer.alloc(22 + 10 * d.patches.length);
    name8(t).copy(b, 0);
    b.writeInt32LE(0, 8); // masked (unused)
    b.writeInt16LE(d.width, 12);
    b.writeInt16LE(d.height, 14);
    b.writeInt32LE(0, 16); // columndirectory (unused)
    b.writeInt16LE(d.patches.length, 20);
    d.patches.forEach((p, i) => {
      const o = 22 + 10 * i;
      b.writeInt16LE(p.x | 0, o);
      b.writeInt16LE(p.y | 0, o + 2);
      b.writeInt16LE(pindex.get(p.patch.toUpperCase()), o + 4);
      b.writeInt16LE(1, o + 6);
      b.writeInt16LE(0, o + 8);
    });
    return b;
  });
  const head = Buffer.alloc(4 + 4 * names.length);
  head.writeInt32LE(names.length, 0);
  let off = head.length;
  bodies.forEach((b, i) => { head.writeInt32LE(off, 4 + 4 * i); off += b.length; });
  add('PNAMES', pn);
  add('TEXTURE1', Buffer.concat([head, ...bodies]));
}

for (const l of listLumps('data')) add(l.name, l.data);
for (const l of listLumps('graphics')) add(l.name, l.data);
for (const l of listLumps('sounds')) add(l.name, l.data);
for (const l of listLumps('music')) add(l.name, l.data);

const block = (start, end, list) => {
  if (!list.length) return;
  add(start);
  for (const l of list) add(l.name, l.data);
  add(end);
};
block('P_START', 'P_END', patches);
block('F_START', 'F_END', listLumps('flats'));
block('S_START', 'S_END', listLumps('sprites'));

// Duplicate names would shadow each other silently.
const seen = new Map();
for (const l of lumps) {
  if (['P_START', 'P_END', 'F_START', 'F_END', 'S_START', 'S_END', 'THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'].includes(l.name)) continue;
  if (seen.has(l.name)) throw new Error(`duplicate lump ${l.name}`);
  seen.set(l.name, true);
}

let size = 12;
for (const l of lumps) size += l.data.length;
const buf = Buffer.alloc(size + 16 * lumps.length);
buf.write('PWAD', 0, 'ascii');
buf.writeInt32LE(lumps.length, 4);
let pos = 12;
const dir = [];
for (const l of lumps) {
  l.data.copy(buf, pos);
  dir.push([pos, l.data.length, l.name]);
  pos += l.data.length;
}
buf.writeInt32LE(pos, 8);
for (const [o, s, n] of dir) {
  buf.writeInt32LE(o, pos);
  buf.writeInt32LE(s, pos + 4);
  name8(n).copy(buf, pos + 8);
  pos += 16;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
const count = (ns) => listLumps(ns).length;
console.log(`wrote ${path.relative(root, out)} (${(buf.length / 1048576).toFixed(2)} MB): ${lumps.length} lumps; `
  + `patches ${patches.length}, flats ${count('flats')}, sprites ${count('sprites')}, sounds ${count('sounds')}, music ${count('music')}`);
