import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const out = [];
const walk = (n, d) => { const t = n.getTranslation().map(v => +v.toFixed(4)), r = n.getRotation().map(v => +v.toFixed(3)), s = n.getScale().map(v => +v.toFixed(3)); out.push('  '.repeat(d) + n.getName() + ' T' + JSON.stringify(t) + ' R' + JSON.stringify(r) + (s.some(v => v !== 1) ? ' S' + JSON.stringify(s) : '')); for (const c of n.listChildren()) walk(c, d + 1); };
for (const sc of root.listScenes()) for (const n of sc.listChildren()) walk(n, 0);
console.log(out.filter(l => /Bip|Root|Armature|^\S/.test(l)).slice(0, 80).join('\n'));
