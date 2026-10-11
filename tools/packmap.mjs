// Bundle an original GoldSrc map with a local build: copies the .bsp, packs only the
// WAD textures it uses into one small <map>.wad, and copies its skybox, into
// public/gamedata/<map>/ (git-ignored: these are your own game files and never part of
// the repo). Vite then ships them with `npm run build`, and the map appears in New
// Game with no files to add.
//
// usage: node tools/packmap.mjs <map.bsp> <dir with .wad files> [sky dir (gfx/env)]
import { readFile, writeFile, mkdir, copyFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join } from 'path';

const [bspPath, wadDir, skyDir = wadDir] = process.argv.slice(2);
if (!bspPath || !wadDir) {
  console.error('usage: node tools/packmap.mjs <map.bsp> <wad dir> [sky dir]');
  process.exit(1);
}
const id = basename(bspPath).replace(/\.bsp$/i, '').toLowerCase();
const outRoot = new URL('../public/gamedata/', import.meta.url).pathname;
const out = join(outRoot, id);
await mkdir(out, { recursive: true });

const cstr = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };

// ---------------------------------------------------------------- the map's texture names
const bsp = await readFile(bspPath);
const dv = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
if (dv.getInt32(0, true) !== 30) throw new Error('not a GoldSrc (v30) BSP');
const texOfs = dv.getInt32(4 + 2 * 8, true);
const external = new Set();
for (let i = 0, n = dv.getInt32(texOfs, true); i < n; i++) {
  const off = dv.getInt32(texOfs + 4 + i * 4, true);
  if (off < 0) continue;
  const o = texOfs + off;
  const name = cstr(bsp, o, 16).toLowerCase();
  if (dv.getUint32(o + 24, true) === 0 && name && name !== 'sky') external.add(name); // no pixels inside the BSP
}
const entText = (() => { const o = dv.getInt32(4, true), l = dv.getInt32(8, true); return bsp.toString('latin1', o, o + l); })();
const skyname = (/"skyname"\s+"([^"]*)"/.exec(entText) || [])[1]?.toLowerCase() || null;

// ---------------------------------------------------------------- pick lumps from the WADs
const wanted = (name) => {
  if (external.has(name)) return true;
  // every frame of an animated (+0name, +aname) or random-tiled (-0name) texture
  if (/^[+-]./.test(name)) for (const e of external) if (/^[+-]./.test(e) && e.slice(2) === name.slice(2) && e[0] === name[0]) return true;
  return false;
};
const lumps = new Map();
const wadFiles = (await readdir(wadDir)).filter((f) => /\.wad$/i.test(f)).sort();
for (const f of wadFiles) {
  const w = await readFile(join(wadDir, f));
  const wv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  const magic = w.toString('latin1', 0, 4);
  if (magic !== 'WAD3') continue;
  const num = wv.getInt32(4, true), tab = wv.getInt32(8, true);
  for (let i = 0; i < num; i++) {
    const o = tab + i * 32;
    if (w[o + 12] !== 0x43 || w[o + 13] !== 0) continue; // miptex, uncompressed
    const name = cstr(w, o + 16, 16).toLowerCase();
    if (lumps.has(name) || !wanted(name)) continue;
    const pos = wv.getInt32(o, true), size = wv.getInt32(o + 4, true);
    lumps.set(name, { data: w.subarray(pos, pos + size), from: f });
  }
}
const missing = [...external].filter((n) => !lumps.has(n));

// ---------------------------------------------------------------- write <map>.wad (WAD3)
const entries = [...lumps];
let size = 12;
for (const [, l] of entries) size += (l.data.length + 3) & ~3;
const tab = size;
size += entries.length * 32;
const wad = Buffer.alloc(size);
wad.write('WAD3', 0, 'latin1');
wad.writeInt32LE(entries.length, 4);
wad.writeInt32LE(tab, 8);
let pos = 12;
entries.forEach(([name, l], i) => {
  l.data.copy(wad, pos);
  const o = tab + i * 32;
  wad.writeInt32LE(pos, o);
  wad.writeInt32LE(l.data.length, o + 4);
  wad.writeInt32LE(l.data.length, o + 8);
  wad[o + 12] = 0x43;
  wad.write(name.slice(0, 15), o + 16, 'latin1');
  pos += (l.data.length + 3) & ~3;
});
await writeFile(join(out, `${id}.wad`), wad);
await copyFile(bspPath, join(out, `${id}.bsp`));

// ---------------------------------------------------------------- skybox
let sky = null;
if (skyname) {
  const sides = ['rt', 'lf', 'bk', 'ft', 'up', 'dn'];
  const found = [];
  for (const s of sides) {
    const src = [join(skyDir, `${skyname}${s}.tga`), join(skyDir, 'gfx', 'env', `${skyname}${s}.tga`)].find(existsSync);
    if (src) { await copyFile(src, join(out, `${skyname}${s}.tga`)); found.push(s); }
  }
  if (found.length === 6) sky = skyname;
  else console.warn(`sky "${skyname}": only ${found.length}/6 sides found in ${skyDir}`);
}

// ---------------------------------------------------------------- index of bundled maps
const manifest = { bsp: `${id}.bsp`, wads: [`${id}.wad`], sky };
const indexPath = join(outRoot, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, 'utf8')) : {};
index[id] = manifest;
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

const from = {};
for (const [, l] of lumps) from[l.from] = (from[l.from] || 0) + 1;
console.log(`${id}: ${lumps.size} textures (${Object.entries(from).map(([f, n]) => `${n} from ${f}`).join(', ')}), ${(wad.length / 1024).toFixed(0)} KB`);
console.log(`sky: ${sky || 'none'}`);
if (missing.length) console.warn(`not found in ${wadDir}: ${missing.join(', ')}`);
console.log(`-> ${out}`);
