// Prints each move's hitbox reach (max forward extent, world units) and frame data.
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/src\/main\.js|menus\.js/.test(f))) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
for (const id of ['gojo', 'sukuna']) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'training', p1: { char: id, ctrl: c1 }, p2: { char: 'gojo', ctrl: c2 } });
  const f = m.fighters[0];
  // opponent far away
  m.fighters[1].x = 200;
  const hurtFront = Math.max(...f.hurt.map((b) => b[2])) - f.x;
  const rows = [];
  for (const mid of ['5L', '5M', '5H', '2L', '2M', '2H', '6H', 'throw', 'cleave', 'lunge', 'grabCleave', 'bluePull', 'redLaunch', 'blueRush']) {
    const mv = f.def.moves[mid];
    if (!mv || !mv.hits) continue;
    f.x = -100; f.y = 0; f.vx = 0; f.facing = 1; f.st = 'idle'; m.fighters[1].x = 200;
    f.startMove(mid, { free: true });
    let reach = -999, x0 = f.x;
    for (let t = 0; t < mv.total + 2 && f.st === 'move'; t++) {
      m.tick();
      for (const h of mv.hits) if (f.mf >= h.f[0] && f.mf <= h.f[1]) reach = Math.max(reach, JJK.Combat.hitbox(f, h)[2] - x0);
    }
    rows.push(`${mid.padEnd(10)} s${String(mv.s).padEnd(3)} total ${String(mv.total).padEnd(3)} reach ${Math.round(reach)}`);
  }
  console.log(`== ${id} (idle hurtbox front edge ${Math.round(hurtFront)})\n` + rows.join('\n'));
}
