// Build: bundles the browser client, the mesher worker and the simulation
// worker with esbuild and copies static files into dist/client.
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');
const opts = {
  bundle: true,
  sourcemap: true,
  logLevel: 'warning',
  target: 'es2022',
  platform: 'browser',
  format: 'esm',
  minify: !watch,
  outdir: 'dist/client',
  entryPoints: {
    main: 'src/client/main.ts',
    'mesher.worker': 'src/client/render/mesher.worker.ts',
    'sim.worker': 'src/sim/worker.ts',
  },
};

mkdirSync('dist/client', { recursive: true });
for (const f of readdirSync('src/client/static')) cpSync(join('src/client/static', f), join('dist/client', f), { recursive: true });

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(opts);
  console.log('build ok -> dist/client');
}
