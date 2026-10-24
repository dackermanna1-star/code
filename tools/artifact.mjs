// Packages the Vite build for publishing as a claude.ai Artifact:
// the page itself must not carry its own <html>/<head>/<body> (the host wraps it),
// the stylesheet is inlined and the bundle ships next to it as game.js.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const out = path.resolve('dist-artifact');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsRel = html.match(/<script[^>]+src="\.?\/?([^"]+\.js)"/)[1];
const cssRel = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?([^"]+\.css)"/)?.[1] ?? html.match(/href="\.?\/?(assets\/[^"]+\.css)"/)[1];
const css = fs.readFileSync(path.join(dist, cssRel), 'utf8');
fs.copyFileSync(path.join(dist, jsRel), path.join(out, 'game.js'));
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();

const page = `<title>Last Call</title>
<meta name="description" content="A physics-driven first-person bar brawler inspired by Paint the Town Red.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Rubik:wght@400;600;800&display=swap">
<style>
:root { color-scheme: dark; }
${css}
</style>
${body}
<script type="module" src="game.js"></script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB';
console.log('artifact page:', kb('index.html'), '· game.js:', kb('game.js'));
