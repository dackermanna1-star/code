// Server-side view of the BrickColor table (parsed from the client module so
// there is a single source of truth).
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'engine', 'BrickColor.js'), 'utf8');
const TABLE = {};
for (const m of src.matchAll(/^\s*(\d+): \['([^']+)', (\d+), (\d+), (\d+)\]/gm)) {
  TABLE[m[1]] = { name: m[2], rgb: [Number(m[3]), Number(m[4]), Number(m[5])] };
}

function brickColorHex(num) {
  const c = TABLE[num] || TABLE[194];
  const hex = '#' + c.rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
  return { name: c.name, hex };
}

module.exports = { brickColorHex, TABLE };
