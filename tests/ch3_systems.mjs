import { stubOthers } from './ch3_stub.mjs';
// Chapter 3 systems test: lift crescendo w/ bots + director, roof follow, gas station
// and tanker explosions, pump-station door release.
export default async ({ page, shot, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const bots = () => evalg(() => {
    const g = window.game, lift = g.level.lift;
    return g.survivors.map((s) => `${s.char.id[0]}:(${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)})${lift.onDeck(s.pos) ? 'L' : ''}${s.phys.onGround ? 'g' : 'a'}${s.incapped ? 'I' : ''}${s.dead ? 'D' : ''}${Math.round(s.totalHealth)}`).join(' ');
  });
  console.log('start', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    g.cheats.god = true;
    window.session.menu.clear();
    g.player.teleport(109.0, 0.45, 93.0, 0.3);
    g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(104.5 + i * 0.5, 0, 89.5, Math.PI); });
    g.advance(1.0);
    const lift = L.lift;
    lift.ctrl.onUse(g.player);
    return { phase: lift.state.phase, gate: true };
  })));
  for (let t = 0; t < 13; t++) {
    const r = await evalg(() => {
      const g = window.game, L = g.level, lift = L.lift, d = g.director;
      g.advance(5);
      const inf = g.infected.commons.filter((c) => !c.dead);
      return `t=${g.time.toFixed(0)} ${lift.state.phase} dy=${lift.plat.offset.y.toFixed(2)} wave=${d.panicState ? d.panicState.wave : '-'} commons=${inf.length} near=${inf.filter((c) => Math.hypot(c.pos.x - 108, c.pos.z - 94) < 10).length} onLift=${inf.filter((c) => lift.onDeck(c.pos)).length} high=${inf.filter((c) => c.pos.y > 2).length} sp=${g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',')}`;
    });
    console.log(r, '|', await bots());
  }
  if (process.env.SHOT) await shot('ch3_sys_lifttop');
  // walk the player off onto the roof and let bots follow
  console.log('roof', await evalg(() => { const g = window.game; g.player.teleport(106, 9.02, 99.5, 0); g.advance(6); g.player.teleport(95, 9.02, 108, 0.8); g.advance(8); return g.director.panicState ? 'panic on' : 'panic off'; }), '|', await bots());
  // gas station + tanker
  console.log('gas', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    g.director.enabled = false;
    g.player.teleport(40, 0.02, 50, 0);
    g.advance(0.5);
    const pm = L.gas.gs.pumps[0];
    const dir = { x: 1, y: 0, z: 0 };
    for (let i = 0; i < 4; i++) pm.target.onShot(pm.x, 1.2, pm.z, dir, g.player);
    const fuse = pm.target.fuse;
    g.advance(4);
    const out = { fuse, pumpsDead: L.gas.gs.pumps.filter((p) => p.target.dead).length, fires: g.combat.fires.length, gone: L.gas.gs.gone };
    L.gas.tk.gone || g.props.props.find((p) => p.explosive === 'fuel' && !p.dead && p.pos.x > 84 && p.pos.x < 93)?.detonate(g.player);
    g.advance(3);
    out.tanker = L.gas.tk.gone; out.fires2 = g.combat.fires.length; out.hp = g.player.totalHealth;
    return out;
  })));
  if (process.env.SHOT) { await evalg(() => { const g = window.game; g.player.teleport(52, 0.02, 52, -2.3); g.player.pitch = 0.05; g.advance(0.3); }); await shot('ch3_sys_gasfire'); }
  // pump station door release
  console.log('door', JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level;
    g.player.teleport(104, -3.77, 152.5, 0);
    g.advance(0.5);
    const door = L.doors.find((d) => Math.abs(d.cx - 106.2) < 0.01);
    const u = g.usables.find((u) => u.prompt === 'Pull emergency release');
    const before = { locked: door.locked, open: door.open };
    u.onUse(g.player);
    g.advance(6);
    return { before, after: { locked: door.locked, open: door.open, angle: door.angle.toFixed(2) }, panic: g.director.panicState?.name };
  })));
};
