// Zero-dependency bundler: walks the ES-module graph from src/main.js, wraps
// each module in a function scope, wires imports to exports, and inlines the
// result with the stylesheet into single-file HTML pages.
//
//   node tools/build.mjs
//   -> dist/stickman-arena.html  (standalone page, open directly in a browser)
//   -> dist/artifact.html        (same app without the html/head/body wrapper)

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = path.join(root, 'src', 'main.js');

const IMPORT_RE = /^\s*import\s*(?:\{([^}]*)\}|\*\s+as\s+(\w+))\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const modules = new Map();
const order = [];

function parse(file) {
  if (modules.has(file)) return modules.get(file);
  let src = fs.readFileSync(file, 'utf8');
  const imports = [];
  src = src.replace(IMPORT_RE, (m, names, star, spec) => {
    const dep = path.resolve(path.dirname(file), spec);
    imports.push({ dep, names: names ? names.split(',').map((n) => n.trim()).filter(Boolean) : null, star });
    return '';
  });
  const exports = new Set();
  src = src.replace(/^export\s+(async\s+function|function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (m, kw, name) => {
    exports.add(name);
    return `${kw} ${name}`;
  });
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (m, names) => {
    for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      const parts = n.split(/\s+as\s+/);
      exports.add(parts.length > 1 ? `${parts[1]}:${parts[0]}` : parts[0]);
    }
    return '';
  });
  if (/^\s*export\s+default/m.test(src)) throw new Error(`default exports are not supported (${file})`);
  if (/^\s*export\s/m.test(src)) throw new Error(`unhandled export form in ${file}`);
  const mod = { file, src, imports, exports, id: `__m${modules.size}` };
  modules.set(file, mod);
  for (const imp of imports) parse(imp.dep);
  order.push(mod);
  return mod;
}

parse(entry);

let out = '';
for (const mod of order) {
  const lines = [];
  for (const imp of mod.imports) {
    const dep = modules.get(imp.dep);
    if (imp.star) lines.push(`const ${imp.star} = ${dep.id};`);
    else {
      const parts = imp.names.map((n) => {
        const [a, b] = n.split(/\s+as\s+/);
        return b ? `${a}: ${b}` : a;
      });
      lines.push(`const { ${parts.join(', ')} } = ${dep.id};`);
    }
  }
  const ret = [...mod.exports].map((e) => (e.includes(':') ? e : e)).join(', ');
  const rel = path.relative(root, mod.file);
  out += `// ---- ${rel}\nconst ${mod.id} = (() => {\n${lines.join('\n')}\n${mod.src.trim()}\nreturn { ${ret} };\n})();\n\n`;
}
const main = modules.get(entry);
out = `(() => {\n'use strict';\n${out}${main.id}.start(document.getElementById('app'));\n})();\n`;
if (out.includes('</script')) out = out.replace(/<\/script/g, '<\\/script');

const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Saira+Extra+Condensed:wght@600;700;800&display=swap';
const title = 'Stickman Arena';
const description = 'A physics-driven stick figure combat simulation: one elite black stickman against an endless, procedurally generated crowd.';
const body = `<div id="app">\n  <canvas id="stage" aria-label="Stick figure battle simulation"></canvas>\n</div>`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${out}</script>
</body>
</html>
`;

const artifact = `<title>${title}</title>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
${body}
<script>
${out}</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'stickman-arena.html'), standalone);
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), artifact);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`bundled ${order.length} modules -> dist/stickman-arena.html (${kb(standalone)}), dist/artifact.html (${kb(artifact)})`);
