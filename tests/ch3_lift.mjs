import { stubOthers } from './ch3_stub.mjs';
// Chapter 3 crescendo test: ride the scissor lift with bots + director, log waves.
export default async ({ page, shot, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r0 = await evalg(() => {
    const g = window.game, L = g.level;
    g.cheats.god = true;
    window.session.menu.clear();
    // walk everyone to the lift
    g.survivors.forEach((s, i) => s.teleport(106.8 + (i % 2) * 1.8, 0.45, 93.0 + Math.floor(i / 2) * 1.6, Math.PI));
    g.advance(1.0);
    const lift = L.lift;
    const out = { onDeck: g.survivors.map((s) => lift.onDeck(s.pos)), ctrlEnabled: lift.ctrl.enabled };
    lift.ctrl.onUse(g.player);
    out.phase = lift.state.phase;
    return out;
  });
  console.log('start', JSON.stringify(r0));
  for (let t = 0; t < 14; t++) {
    const r = await evalg(() => {
      const g = window.game, L = g.level, lift = L.lift, d = g.director;
      g.advance(5);
      const inf = g.infected.commons.filter((c) => !c.dead);
      const near = inf.filter((c) => Math.hypot(c.pos.x - 108, c.pos.z - 94) < 12);
      const onLift = inf.filter((c) => lift.onDeck(c.pos));
      return {
        t: g.time.toFixed(1), phase: lift.state.phase, dy: lift.plat.offset.y.toFixed(2), panic: d.panicState ? d.panicState.wave : null,
        commons: inf.length, near: near.length, onLiftInf: onLift.length, maxY: inf.reduce((m, c) => Math.max(m, c.pos.y), -99).toFixed(1),
        specials: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(','),
        surv: g.survivors.map((s) => `${s.char.id[0]}:${s.pos.y.toFixed(1)}${lift.onDeck(s.pos) ? 'L' : ''}${s.incapped ? 'I' : ''}${s.dead ? 'D' : ''}:${Math.round(s.totalHealth)}`).join(' '),
        obj: g.session?.objectiveText || '',
      };
    });
    console.log(JSON.stringify(r));
  }
  // walk off onto the roof
  const r2 = await evalg(() => {
    const g = window.game, L = g.level;
    return { prog: g.survivors.map((s) => L.progressAt(s.pos.x, s.pos.y, s.pos.z).toFixed(3)), callEnabled: L.lift.call.enabled };
  });
  console.log('end', JSON.stringify(r2));
  if (process.env.SHOT) await shot('ch3_lift_end');
};
