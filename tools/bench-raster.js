// Micro-benchmark of character rasterization (Node, no canvas).
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
for (const f of ['src/engine/util.js', 'src/engine/raster.js', 'src/engine/rig.js', 'src/game/body.js', 'src/game/art-gojo.js', 'src/game/art-sukuna.js', 'src/game/charkit.js', 'src/game/gojo-poses.js', 'src/game/sukuna-poses.js'])
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const r = new JJK.Raster(640, 360);
const N = 600;
for (const id of ['gojo', 'sukuna']) {
  const art = JJK.Art[id];
  const P = JJK.Rig.full(JJK.Poses[id].idle);
  const J = JJK.Rig.solve(P, art.dims);
  const xf = new JJK.Rig.Xform().set(320, 322, 1, 1.2, 0, [0, 70], 1, 1);
  const sec = new JJK.Rig.Secondary();
  const t0 = process.hrtime.bigint();
  let sum = 0;
  for (let i = 0; i < N; i++) {
    r.begin();
    r.lights.push({ x: 350, y: 220, r: 55, r2: 3025, c: [40, 120, 255], i: 0.55 });
    art.draw(r, J, xf, { pose: P, pal: 0, sec });
    r.outline(art.outline, 0, true);
    r.flush();
    sum += r.px[(200 * 640 + 320)];
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(id, ms.toFixed(3), 'ms/frame', sum ? '' : '');
}
