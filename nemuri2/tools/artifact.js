// Writes a claude.ai Artifact-ready copy of dist/nemuri-ii.html: the artifact host supplies the
// doctype/html/head/body skeleton, so this strips those wrappers and keeps title, styles, body and scripts.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'nemuri-ii.html'), 'utf8');
const head = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>'))
  .replace(/<meta charset="UTF-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = src.slice(src.indexOf('<body>') + 6, src.lastIndexOf('</body>'));
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'nemuri-ii.artifact.html');
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
