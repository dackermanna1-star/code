// Turns dist-artifact/ (from `vite build --mode artifact`) into one hostable
// page body: <title>, inline CSS, the CDN import map, the markup and the game
// bundle inlined as a module script. The host supplies doctype/head/body.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'dist-artifact';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const importmap = head.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const fontLinks = [...head.matchAll(/<link [^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]).join('\n');
const cssHref = head.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"/)[1];
const jsSrc = head.match(/<script type="module"[^>]*src="\.\/([^"]+\.js)"/)[1];
const css = fs.readFileSync(path.join(dir, cssHref), 'utf8');
let js = fs.readFileSync(path.join(dir, jsSrc), 'utf8');
if (/<\/script/i.test(js)) js = js.replace(/<\/script/gi, '<\\/script');
if (/<\/style/i.test(css)) throw new Error('stylesheet contains </style>');
const page = `${title}
${fontLinks}
<style>
${css}
</style>
${importmap}
${body.trim()}
<script type="module">
${js}
</script>
`;
fs.writeFileSync(path.join(dir, 'sizzle-and-stack.html'), page);
console.log(`wrote ${dir}/sizzle-and-stack.html (${(page.length / 1024).toFixed(0)} KB)`);
