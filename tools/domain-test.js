// Headless tests of the domain lifecycle: activation, effects, burnout, interruption and clash.
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/src\/main\.js|menus\.js/.test(f))) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
function battle(p1, p2) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'versus', p1: { char: p1, ctrl: c1 }, p2: { char: p2, ctrl: c2 } });
  while (m.phase !== 'fight') m.tick();
  for (const f of m.fighters) { f.meter = 300; f.dg = 100; }
  return m;
}
const run = (m, n) => { for (let i = 0; i < n; i++) m.tick(); };
{ // Unlimited Void
  const m = battle('gojo', 'sukuna');
  const [g, s] = m.fighters;
  g.startMove('domain');
  run(m, 30 + 140);
  check(m.domain && m.domain.type === 'void', 'Unlimited Void activates');
  check(s.st === 'dizzy' || s.domainStun > 0, 'victim immobilized (' + s.st + ')');
  check(g.meter < 112 && g.dg < 12, 'cost: 200 CE and domain gauge (meter ' + Math.round(g.meter) + ')');
  run(m, 320);
  check(!m.domain, 'domain ends');
  check(g.burnout > 0, 'owner burns out');
  check(!g.def.moves.blue.cond(g), 'techniques unavailable during burnout');
}
{ // Malevolent Shrine sure-hit damage + Infinity bypass
  const m = battle('sukuna', 'gojo');
  const [s, g] = m.fighters;
  g.cs.infOn = true;
  s.startMove('domain');
  run(m, 40 + 140);
  check(m.domain && m.domain.type === 'shrine', 'Malevolent Shrine activates');
  const hp0 = g.hp;
  run(m, 200);
  check(g.hp < hp0, 'sure-hit slashes damage through Infinity (' + Math.round(hp0 - g.hp) + ')');
  check(s.dmgMul() > 1 && s.speedMul() > 1, 'Sukuna buffed inside his domain');
}
{ // interrupted startup refunds part of the cost
  const m = battle('gojo', 'sukuna');
  const [g, s] = m.fighters;
  s.x = g.x + 70;
  g.startMove('domain');
  run(m, 4);
  JJK.Combat.hit(m, s, g, { dmg: 30, str: 'm', hs: 16, tier: 2 }, [g.x, 100], {}, JJK.STR.m);
  run(m, 5);
  check(!m.domain && g.meter > 190 && g.meter < 235, 'interrupted domain fails and refunds 100 CE (meter ' + Math.round(g.meter) + ')');
}
{ // clash resolution
  const m = battle('gojo', 'sukuna');
  const [g, s] = m.fighters;
  g.cpu = { clashPress: (r) => (r <= 16.5 ? JJK.BTN.L : 0), think() {} }; // near-perfect
  s.cpu = { clashPress: (r) => (r <= 2 ? JJK.BTN.L : 0), think() {} }; // late
  g.startMove('domain'); s.startMove('domain');
  let sawClash = false, loserBurn = false;
  for (let i = 0; i < 900; i++) { m.tick(); if (m.clash) sawClash = true; if (sawClash && !m.clash && s.burnout > 0) loserBurn = true; }
  check(sawClash, 'simultaneous expansion triggers a Domain Clash');
  check(m.domain && m.domain.owner === g || g.burnout > 0, 'more precise player wins the clash');
  check(loserBurn, 'loser burns out');
}
console.log(fails ? fails + ' failure(s)' : 'all domain tests passed');
process.exitCode = fails ? 1 : 0;
