// Dev server: bundles src/ on demand and serves public/ at http://localhost:8000
import * as esbuild from 'esbuild';

const port = Number(process.env.PORT || 8000);
const ctx = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  outdir: 'public/build',
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
});
await ctx.watch();
const { hosts } = await ctx.serve({ servedir: 'public', port });
console.log(`\n  Delve is running at http://localhost:${port}\n`);
void hosts;
