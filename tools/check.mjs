// Import every module under src/ (except main.js) to catch syntax/reference errors quickly.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(root);
let bad = 0;
for (const f of files) {
  if (f.endsWith('main.js')) continue;
  try { await import(f); } catch (e) { bad++; console.log('FAIL', path.relative(root, f), '-', e.message); }
}
// also make sure every texture/material referenced resolves
const { generateTextures } = await import(path.join(root, 'gfx/textures.js'));
const { resolveMaterials } = await import(path.join(root, 'world/materials.js'));
try { resolveMaterials(generateTextures().index); } catch (e) { bad++; console.log('FAIL materials -', e.message); }
console.log(files.length, 'modules checked,', bad, 'problems');
process.exit(bad ? 1 : 0);
