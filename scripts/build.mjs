// Production build: dist/index.html + dist/build/main.js, plus a single-file dist/standalone.html
// that can be opened directly from disk (no server needed).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'build'), { recursive: true });

const common = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'info',
};

await esbuild.build({ ...common, format: 'esm', outfile: path.join(out, 'build/main.js') });
const iife = await esbuild.build({ ...common, format: 'iife', write: false });

const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync('public/style.css', path.join(out, 'style.css'));

const js = iife.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace(/<link rel="stylesheet" href="style.css"\s*\/?>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="build\/main.js"><\/script>/, () => `<script>\n${js}\n</script>`);
fs.writeFileSync(path.join(out, 'standalone.html'), standalone);
console.log(`standalone.html: ${(standalone.length / 1024).toFixed(0)} KB`);
