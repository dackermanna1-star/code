// Headless simulation: runs CPU vs CPU matches in Node to catch runtime errors
// and gather balance statistics. Usage: node tools/sim.js [matches] [level] [p1] [p2]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/src\/main\.js|menus\.js/.test(f));
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) { console.warn('missing', f); continue; }
  vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
const JJK = globalThis.JJK;
const N = +(process.argv[2] || 4);
const level = process.argv[3] || 'hard';
const level2 = process.argv[6] || level;
const p1c = process.argv[4] || 'gojo', p2c = process.argv[5] || 'sukuna';
const moveUse = {};
const t0 = Date.now();
const res = { wins: {}, frames: 0, rounds: 0, dmg: [0, 0], maxCombo: [0, 0], timeouts: 0, ko: 0 };
for (let i = 0; i < N; i++) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const swap = i % 2 === 1;
  const a = swap ? p2c : p1c, b = swap ? p1c : p2c;
  const m = new JJK.Battle({ mode: 'arcade', p1: { char: a, ctrl: c1, cpu: swap ? level2 : level }, p2: { char: b, ctrl: c2, cpu: swap ? level : level2 } });
  const orig = m.onMoveStart.bind(m);
  m.onMoveStart = (f, mv) => { const k = f.def.id + ':' + mv.id; moveUse[k] = (moveUse[k] || 0) + 1; orig(f, mv); };
  const origTO = m.timeOver.bind(m);
  m.timeOver = () => { res.timeouts++; origTO(); };
  let frames = 0;
  while (m.phase !== 'over' && frames < 60 * 60 * 12) { m.tick(); frames++; }
  const w = m.result && m.result.winner ? m.result.winner.def.id : 'draw/none';
  res.wins[w] = (res.wins[w] || 0) + 1;
  res.frames += frames;
  res.rounds += m.round;
  for (const f of m.fighters) { res.dmg[0] += 0; }
  res.maxCombo[0] = Math.max(res.maxCombo[0], m.stats.maxCombo[0], m.stats.maxCombo[1]);
  console.log(`match ${i + 1}: ${a}(P1) vs ${b}(P2) -> ${w}  rounds=${m.round} frames=${frames} phase=${m.phase} hits=${m.stats.hits.join('/')} dmg=${m.stats.dmg.join('/')} maxCombo=${m.stats.maxCombo.join('/')}`);
}
console.log('RESULT', JSON.stringify(res), 'time', (Date.now() - t0) / 1000 + 's');
const top = Object.entries(moveUse).sort((a, b) => b[1] - a[1]);
console.log('MOVE USE', top.map(([k, v]) => k + '=' + v).join('  '));
