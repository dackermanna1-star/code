// Build the single-file game, then run every test suite. Exit code 1 if anything fails.
// npm test  (=  node tests/run-all.mjs)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['build', ['tools/build.mjs']],
  ['smoke (dev + built)', ['tests/smoke.mjs']],
  ['engine (dev)', ['tests/engine.mjs']],
  ['engine (built)', ['tests/engine.mjs', '--built']],
  ['maps', ['tests/maps.mjs']],
];
// Slow suites (systems ~150 s, meta ~90 s, the full-game playthrough ~4.5 min per run, dev + built):
// `npm test -- --all` or `node tests/run-all.mjs --all`. HW_PLAYTHROUGH=0 skips the playthrough,
// HW_PLAYTHROUGH=dev runs it on the dev page only.
if (process.argv.includes('--all')) {
  steps.push(['systems (dev)', ['tests/systems.mjs']], ['meta', ['tests/meta.mjs']]);
  if (process.env.HW_PLAYTHROUGH !== '0') {
    steps.push(['playthrough (dev)', ['tests/playthrough.mjs']]);
    if (process.env.HW_PLAYTHROUGH !== 'dev') steps.push(['playthrough (built)', ['tests/playthrough.mjs', '--built']]);
  }
}

const results = [];
for (const [name, args] of steps) {
  console.log(`\n=== ${name} ===`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  const ok = r.status === 0;
  results.push({ name, ok, sec: (Date.now() - t0) / 1000 });
  if (!ok && name === 'build') break; // nothing else can run without a build
}

console.log('\n=== summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.sec.toFixed(1)}s)`);
const failed = results.some((r) => !r.ok) || results.length < steps.length;
process.exit(failed ? 1 : 0);
