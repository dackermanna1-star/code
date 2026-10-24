// Build script: bundles the game into dist/ (single game.js with the mesh worker inlined).
//   node build.mjs            -> production build
//   node build.mjs --watch --serve  -> rebuild on change + local server on :8080
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');
const outdir = 'dist';

// Inline worker sources: `import src from 'worker:./path.ts'` yields the bundled worker code as a string.
const inlineWorkerPlugin = {
  name: 'inline-worker',
  setup(build) {
    build.onResolve({ filter: /^worker:/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.slice('worker:'.length)),
      namespace: 'inline-worker',
    }));
    build.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async (args) => {
      const r = await esbuild.build({
        entryPoints: [args.path],
        bundle: true,
        write: false,
        format: 'iife',
        minify: !watch,
        target: 'es2020',
        metafile: true,
      });
      const watchFiles = Object.keys(r.metafile.inputs).map((f) => path.resolve(f));
      return { contents: `export default ${JSON.stringify(r.outputFiles[0].text)};`, loader: 'js', watchFiles };
    });
  },
};

fs.mkdirSync(outdir, { recursive: true });
for (const f of fs.readdirSync('public')) fs.copyFileSync(path.join('public', f), path.join(outdir, f));

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: path.join(outdir, 'game.js'),
  format: 'iife',
  target: 'es2020',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  plugins: [inlineWorkerPlugin],
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const { port } = await ctx.serve({ servedir: outdir, port: 8080 });
    console.log(`Serving on http://localhost:${port}`);
  }
} else {
  await esbuild.build(options);
}
