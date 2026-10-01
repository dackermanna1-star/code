// Bundles the game into a single self-contained HTML file: dist/index.html.
// Zero dependencies. Every module under src/ becomes a lazy async factory; static imports turn
// into awaited lookups, dynamic import() resolves inside the bundle, and the world worker is
// started from the bundle's own source through a Blob URL.
//   node tools/build.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(src);

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const resolve = (from, spec) => rel(path.normalize(path.join(path.dirname(path.join(root, from)), spec)));

function transform(id, code) {
  const exportsList = [];
  // static imports (possibly multi-line)
  code = code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm, (m, names, spec) => {
    const binds = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const mm = s.match(/^(\w+)\s+as\s+(\w+)$/);
      return mm ? `${mm[1]}: ${mm[2]}` : s;
    });
    return `const { ${binds.join(', ')} } = await __require(${JSON.stringify(resolve(id, spec))});`;
  });
  code = code.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, (m, name, spec) => `const ${name} = await __require(${JSON.stringify(resolve(id, spec))});`);
  code = code.replace(/^import\s+['"]([^'"]+)['"];?/gm, (m, spec) => `await __require(${JSON.stringify(resolve(id, spec))});`);
  // export lists
  code = code.replace(/^export\s+\{([^}]*)\};?/gm, (m, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      const mm = n.match(/^(\w+)\s+as\s+(\w+)$/);
      exportsList.push(mm ? [mm[2], mm[1]] : [n, n]);
    }
    return '';
  });
  // exported declarations
  code = code.replace(/^export\s+(async\s+function\*?|function\*?|class|const|let|var)\s+(\w+)/gm, (m, kw, name) => {
    exportsList.push([name, name]);
    return `${kw} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(code)) {
    const line = code.split('\n').find((l) => /^\s*(import|export)\s/.test(l));
    throw new Error(`${id}: unsupported module syntax: ${line}`);
  }
  // dynamic imports resolve inside the bundle; import.meta has no meaning in a classic script
  code = code.replace(/\bimport\(/g, '__dynImport(');
  code = code.replace(/\bimport\.meta\.url\b/g, 'location.href');
  const getters = exportsList.map(([ext, local]) => `Object.defineProperty(__exports, ${JSON.stringify(ext)}, { get: () => ${local}, enumerable: true });`).join('\n');
  return `__def(${JSON.stringify(id)}, async function (__exports, __dynImport) {\n${getters}\n${code}\n});`;
}

const modules = files.map((f) => transform(rel(f), fs.readFileSync(f, 'utf8')));

const runtime = `
const __mods = Object.create(null), __cache = Object.create(null);
function __def(id, fn) { __mods[id] = fn; }
function __norm(id) {
  const out = [];
  for (const part of id.split('/')) { if (part === '..') out.pop(); else if (part !== '.' && part !== '') out.push(part); }
  return out.join('/');
}
function __require(id) {
  if (__cache[id]) return __cache[id];
  const fn = __mods[id];
  if (!fn) return Promise.reject(new Error('module not found: ' + id));
  const ex = {};
  const dyn = (spec) => __require(__norm(id.split('/').slice(0, -1).join('/') + '/' + spec));
  return (__cache[id] = fn(ex, dyn).then(() => ex));
}`;

const bundleFn = `function __bundle(__isWorker) {
"use strict";
${runtime}
${modules.join('\n')}
if (__isWorker) {
  __require('src/world/worker.js').catch((e) => { self.postMessage({ type: 'error', key: null, message: String(e && e.stack || e) }); });
} else {
  globalThis.__makeWorldWorker = () => new Worker(URL.createObjectURL(new Blob(['(' + __bundle.toString() + ')(true);'], { type: 'text/javascript' })));
  __require('src/main.js').catch((e) => { console.error(e); const el = document.getElementById('err'); if (el) { el.style.display = 'block'; el.textContent = 'Failed to start: ' + e.message; } });
}
}`;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// escape "</script" inside the code so the inline script can't terminate early
const safeScript = '<script>\n' + `(${bundleFn})(false);`.replace(/<\/script/gi, '<\\/script') + '\n</script>';
html = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, () => safeScript);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/index.html written: ${files.length} modules, ${kb} KB`);
