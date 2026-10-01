// Converts dist/alley.html into an artifact page body (no doctype/html/head/body
// wrappers: the host adds its own skeleton). Usage: node scripts/artifact-build.mjs out.html
import fs from 'node:fs';

const out = process.argv[2] ?? 'dist/artifact.html';
let html = fs.readFileSync('dist/alley.html', 'utf8');
const title = (html.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>Blue Hour Alley</title>'])[0].replace(/>[^<]*</, '>Blue Hour Alley<');
const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const headScripts = [...head.matchAll(/<script type="module"[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
const page = `${title}
<style>
  :root { --bg: #000; --fg: #8a8f99; color-scheme: dark; }
  html, body { background: var(--bg); color: var(--fg); height: 100%; }
</style>
${styles}
${body.replace(/<script type="module" src="[^"]*"><\/script>/, '')}
${headScripts}
`;
fs.writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024).toFixed(0)} KiB`);
