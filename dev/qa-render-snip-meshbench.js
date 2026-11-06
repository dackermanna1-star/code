const C = g.chunks;
const P = g.player;
const ccx = Math.floor(P.x / 16), ccz = Math.floor(P.z / 16);
const times = [], mtimes = [];
let verts = 0;
for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let cy = 0; cy < 4; cy++) {
  const t0 = performance.now();
  const out = C.mesher.mesh(ccx + dx, cy, ccz + dz);
  mtimes.push(performance.now() - t0);
  for (const k of ['opaque', 'cutout', 'translucent']) if (out[k]) verts += out[k].vertexCount;
  const t1 = performance.now();
  C.buildSection(ccx + dx, cy, ccz + dz);
  times.push(performance.now() - t1);
}
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3);
const max = (a) => +Math.max(...a).toFixed(2);
return { n: times.length, meshAvg: avg(mtimes), meshMax: max(mtimes), buildAvg: avg(times), buildMax: max(times), vertsPerSection: Math.round(verts / times.length) };
