#!/usr/bin/env node
// Convert the single-file build (dist-single/index.html) into page-content form for publishing as
// a claude.ai Artifact: the host supplies the <!doctype>/<html>/<head>/<body> skeleton, so emit
// <title>, styles, the canvas and the inline module script only.
//   VITE_WIP=1 npm run build:single && node tools/artifact.mjs [out.html]
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('dist-single/index.html', 'utf8')
const head = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>'))
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>'))
const title = (head.match(/<title>[\s\S]*?<\/title>/) || ['<title>Liminal Moscow</title>'])[0]
const styles = head.match(/<style[\s\S]*?<\/style>/g) || []
const scripts = head.match(/<script[\s\S]*?<\/script>/g) || []
const out = [
  title,
  '<meta name="description" content="A first-person voxel walking simulator. Moscow, winter 2008.">',
  ...styles,
  body.trim(),
  ...scripts.map(s => s.replace(' crossorigin', '')),
].join('\n')
const file = process.argv[2] || 'dist-single/liminal-moscow.html'
writeFileSync(file, out)
console.log(`${file}  ${(out.length / 1048576).toFixed(2)} MB`)
