// Production build:
//   dist/index.html + dist/build/main.js   (static hosting)
//   dist/standalone.html                    (single self-contained file, open from disk)
//   dist/artifact.html                      (body-only variant for hosts that supply the document skeleton)
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

const fonts = (html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/) || [''])[0];
const artifact = [
  '<title>Delve</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  fonts,
  `<style>\n:root { color-scheme: dark; }\n${css}\n</style>`,
  '<div id="app"></div>',
  '<div id="ui"></div>',
  `<script>\n${js}\n</script>`,
].join('\n');
fs.writeFileSync(path.join(out, 'artifact.html'), artifact);
console.log(`artifact.html: ${(artifact.length / 1024).toFixed(0)} KB`);
