import { stubOthers } from './ch3_stub.mjs';
// Chapter 3 bot-follow test: move the player along the route in steps; bots must keep up.
export default async ({ page, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const route = JSON.parse(process.env.ROUTE || '[]');
  const dirOn = process.env.DIRECTOR !== '0';
  await evalg((dirOn) => { const g = window.game; g.cheats.god = true; g.director.enabled = dirOn; window.session.menu.clear(); }, dirOn);
  for (const [name, x, y, z, adv] of route) {
    const r = await evalg(([name, x, y, z, adv]) => {
      const g = window.game, L = g.level;
      const P = g.player;
      if (name === '!lift') { P.teleport(108.8, 0.45, 93.2, 0); g.advance(1.5); L.lift.ctrl.onUse(P); g.advance(adv ?? 56); return 'lift ' + L.lift.state.phase + ' | ' + g.survivors.filter((s) => s !== P).map((b) => `${b.char.id}:y${b.pos.y.toFixed(1)}${L.lift.onDeck(b.pos) ? 'L' : ''}`).join(' '); }
      if (name === '!end') { const d = L.endDoor; if (d.open) d.use(P); g.advance(adv ?? 3); const inside = g.survivors.filter((s) => !s.dead).map((s) => L.inBox(L.endSafe, s.pos, 0.1)); return 'end door open=' + d.open + ' inside=' + inside.join(',') + ' session=' + window.session.state + ' endTriggered=' + window.session.endTriggered; }
      if (name === '!release') { const u = g.usables.find((u) => u.prompt === 'Pull emergency release'); u.onUse(P); g.advance(adv ?? 6); return 'released door; open=' + L.doors.find((d) => d.cx > 106 && d.cx < 106.4).open; }
      // walk the player there gradually (teleport in small hops so bots can follow)
      const sx = P.pos.x, sy = P.pos.y, sz = P.pos.z;
      const d = Math.hypot(x - sx, z - sz);
      const hops = Math.max(1, Math.round(d / 4));
      for (let i = 1; i <= hops; i++) {
        const t = i / hops;
        const n = L.nav.nearestNode(sx + (x - sx) * t, sy + (y - sy) * t, sz + (z - sz) * t, 3);
        if (n >= 0 && i < hops) P.teleport(L.nav.nodeX(n), L.nav.nodeY[n] + 0.02, L.nav.nodeZ(n), P.yaw);
        else if (i === hops) P.teleport(x, y + 0.02, z, P.yaw);
        g.advance(0.9);
      }
      g.advance(adv ?? 3);
      const bots = g.survivors.filter((s) => s !== P);
      return name.padEnd(12) + ' prog ' + L.progressAt(P.pos.x, P.pos.y, P.pos.z).toFixed(3) + ' | ' + bots.map((b) => `${b.char.id}:${b.pos.distanceTo(P.pos).toFixed(1)}m y${b.pos.y.toFixed(1)}${b.incapped ? ' INC' : ''}${b.dead ? ' DEAD' : ''}`).join('  ') + ` | commons ${g.infected.commons.filter((c) => !c.dead).length} sp ${g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',')}`;
    }, [name, x, y, z, adv]);
    console.log(r);
  }
};
