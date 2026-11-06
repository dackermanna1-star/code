// Build a single-file distribution: node tools/build.js
// Inlines every src/*.js referenced between <!--SCRIPTS--> markers in index.html.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<!--SCRIPTS-->'), end = html.indexOf('<!--/SCRIPTS-->');
if (start < 0 || end < 0) throw new Error('script markers not found');
const block = html.slice(start, end);
const files = [...block.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
let inlined = '';
for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  if (code.includes('</script')) throw new Error(f + ' contains a closing script tag');
  inlined += `<script>/* ${f} */\n${code}\n</script>\n`;
}
const out = html.slice(0, start) + inlined + html.slice(end + '<!--/SCRIPTS-->'.length);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const dest = path.join(root, 'dist', 'spleen-sepsis.html');
fs.writeFileSync(dest, out);
console.log('wrote', path.relative(process.cwd(), dest), (out.length / 1024).toFixed(0) + ' KB', files.length + ' scripts');
