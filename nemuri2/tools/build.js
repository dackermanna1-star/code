// Assembles dist/nemuri-ii.html: base.html + every modules/*.js (sorted by filename),
// each wrapped in its own guarded IIFE inside the game's closure, so modules can read
// and reassign engine globals but one broken module can never take the game down.
// Also writes dist/nemuri-ii.test.html with three.js inlined (for offline headless tests).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'src/base.html'), 'utf8');
const modDir = path.join(root, 'modules');
// --only=10-core.js,40-lucid.js  builds a private subset;  --out=name  writes dist/<name>.html (+ .test.html)
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
const only = typeof argv.only === 'string' ? argv.only.split(',').map(x => x.trim()) : null;
const outName = typeof argv.out === 'string' ? argv.out : 'nemuri-ii';
const vm = require('vm');
const files = fs.readdirSync(modDir).filter(f => /\.js$/.test(f)).sort().filter(f => !only || only.includes(f) || only.includes(f.replace(/\.js$/, '')));
const skipped = [];
let out = '';
for (const f of files) {
  const src = fs.readFileSync(path.join(modDir, f), 'utf8');
  if (src.indexOf('</script') >= 0) { skipped.push(f + ' (contains a literal </script>; write "<\\/script>")'); continue; }
  try { new vm.Script('(function(){"use strict";\n' + src + '\n})', { filename: f }); }
  catch (e) { skipped.push(f + ' (syntax error: ' + e.message + ')'); continue; }
  out += `\n/* ===================== module: ${f} ===================== */\n` +
         `try { (function () {\n${src}\n})(); } catch (__modErr) { if (window.console) console.error("[nemuri II] module ${f} failed to load", __modErr); }\n`;
}
const marker = '/*@@NEMURI2_MODULES@@*/';
if (base.split(marker).length !== 2) throw new Error('module marker missing');
const html = base.replace(marker, () => out);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/' + outName + '.html'), html);
const three = fs.readFileSync(path.join(root, 'vendor/three.r128.min.js'), 'utf8');
const cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
if (html.split(cdn).length !== 2) throw new Error('three.js script tag not found');
fs.writeFileSync(path.join(root, 'dist/' + outName + '.test.html'), html.replace(cdn, () => '<script>' + three + '</script>'));
if (skipped.length) console.log('SKIPPED MODULES:\n  ' + skipped.join('\n  '));
console.log('built', files.length - skipped.length, 'modules:', files.join(', ') || '(none)', '->', (html.length / 1024).toFixed(0) + 'KB');
