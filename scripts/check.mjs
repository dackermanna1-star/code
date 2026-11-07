// End-to-end smoke test: loads the experience at every flight phase and a set of
// standard viewpoints, collects console errors and draw-call stats, and writes
// screenshots to the output directory.
//
//   node scripts/check.mjs [outDir] [--quality low] [--only cruise,approach]
//
// Exit code 1 if any page produced console errors or a module failed to init.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || path.join(os.tmpdir(), 'b738-check'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const quality = opt('quality', 'low');
const only = opt('only', '') ? opt('only').split(',') : null;

const VIEWS = [
  ['gate-aisle', 'phase=gate&pos=0,1.66,-13.2&look=180,-4'],
  ['gate-window', 'phase=gate&seat=7A&look=88,-4'],
  ['gate-door', 'phase=gate&pos=-0.6,1.66,-14.35&look=90,-2'],
  ['pushback', 'phase=pushback&progress=0.5&seat=12F&look=-85,-4'],
  ['taxi', 'phase=taxi_out&progress=0.6&seat=16A&look=92,-6'],
  ['takeoff', 'phase=takeoff&progress=0.55&seat=20A&look=95,-8'],
  ['climb', 'phase=climb&progress=0.35&seat=18A&look=95,-10'],
  ['cruise-window', 'phase=cruise&progress=0.3&seat=16A&look=95,-8'],
  ['cruise-aisle', 'phase=cruise&progress=0.3&pos=0,1.66,6&look=0,-6'],
  ['cruise-ife', 'phase=cruise&progress=0.3&seat=16A&look=0,-14'],
  ['descent', 'phase=descent&progress=0.6&seat=10A&look=95,-8'],
  ['approach', 'phase=approach&progress=0.7&seat=22A&look=95,-10'],
  ['landing', 'phase=landing&progress=0.3&seat=20F&look=-95,-6'],
  ['taxi-in', 'phase=taxi_in&progress=0.5&seat=8A&look=92,-6'],
  ['arrived', 'phase=arrived&pos=0,1.66,-12.5&look=150,-4'],
  ['lav', 'phase=cruise&pos=-1.0,1.66,-15.4&look=90,-15'],
  ['galley-aft', 'phase=cruise&pos=0,1.66,12.4&look=180,-12'],
  ['cinematic', 'phase=climb&progress=0.2&cam=cinematic'],
].filter(([name]) => !only || only.includes(name));

fs.mkdirSync(outDir, { recursive: true });
const batch = VIEWS.map(([name, q]) => ({ out: path.join(outDir, `${name}.png`), query: `${q}&quality=${quality}`, frames: 30 }));
const batchFile = path.join(outDir, 'batch.json');
fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2));
const res = spawnSync(process.execPath, [path.join(root, 'scripts/shot.mjs'), '--batch', batchFile, '--width', opt('width', '1280'), '--height', opt('height', '720')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60 * 60 * 1000 });
let report;
try { report = JSON.parse(res.stdout); } catch { console.error(res.stdout, res.stderr); process.exit(2); }
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
let bad = 0;
for (const r of report) {
  if (r.fatal) { console.log('FATAL', r.fatal); bad++; continue; }
  const name = path.basename(r.out, '.png');
  const errs = (r.errors || []).filter((e) => !/AudioContext|autoplay|play\(\) failed|NotAllowedError/i.test(e));
  if (errs.length || (r.moduleErrors || []).length) bad++;
  console.log(`${errs.length || (r.moduleErrors || []).length ? 'FAIL' : 'ok  '} ${name.padEnd(14)} phase=${String(r.phase).padEnd(9)} alt=${String(r.alt).padStart(6)} spd=${String(r.spd).padStart(4)} calls=${String(r.drawCalls).padStart(4)} tris=${String(r.triangles).padStart(8)} ready=${r.readyMs}ms${(r.moduleErrors || []).length ? ' moduleErrors=' + r.moduleErrors.join(',') : ''}`);
  for (const e of errs.slice(0, 5)) console.log('      ', e.split('\n')[0].slice(0, 220));
}
console.log(`\nScreenshots + report.json in ${outDir}`);
process.exit(bad ? 1 : 0);
