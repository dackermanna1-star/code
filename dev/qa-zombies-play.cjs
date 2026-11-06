// Real-time play session (rendering on): walk through downtown, shoot, check the frame loop logs no errors.
// Usage: node dev/qa-zombies-play.cjs [port] [seconds]
const { boot } = require('./qa-zombies-lib.cjs');
const port = process.argv[2] || 5302;
const secs = +(process.argv[3] || 60);
(async () => {
  const { browser, page, ev, shot, settle, report, errors } = await boot({ port });
  await ev(async () => {
    const g = window.game;
    const { createItem } = await import('/src/items/items.js');
    const P = g.player;
    P.inv.hotbar[0] = createItem('shotgun_pump', { ammo: 6 });
    P.inv.addItem(createItem('ammo_12g', { count: 40 }));
    P.inv.selected = 0; P.inv.changed();
    window.qa.god(true);
    const y = window.qa.ground(470.5, 512.5, 30);
    window.qa.tp(470.5, y, 512.5, -Math.PI / 2, 0);
    window.qa.setTime(19.6);
    g.chunks.radius = Math.min(g.chunks.radius, 6);
  });
  await settle(4000);
  // accelerate: run extra simulation steps between rendered frames so game time moves on in slow headless rendering
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < secs * 1000) {
    i++;
    await ev((i) => {
      const g = window.game, P = g.player;
      g.input.keys.add('KeyW');
      if (i % 6 === 0) g.input.keys.add('ShiftLeft'); else g.input.keys.delete('ShiftLeft');
      if (i % 10 === 0) P.yaw += (Math.random() - 0.5) * 1.5;
      if (i % 4 === 0) {
        // fire at the nearest zombie in view
        const z = g.zombies.zombies.filter((z) => !z.dead && z.distP < 25).sort((a, b) => a.distP - b.distP)[0];
        if (z) {
          const dx = z.x - P.x, dz = z.z - P.z, dy = z.y + 1.4 - (P.y + P.eye);
          P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          const st = P.inv.selectedStack; if (st && !st.ammo) st.ammo = 6;
          g.combat.cooldown = 0; g.combat.fireGun(st, g.combat.def);
        }
      }
      window.qa.sim(0.5, 1 / 30);
    }, i);
    await page.waitForTimeout(150);
    if (i % 25 === 0) {
      const s = await ev(() => ({ ...window.qa.summary(), clock: +window.game.clock.toFixed(0), hour: window.game.time.hour, kills: window.game.player.kills, zt: +(window.qa.zt.sum / Math.max(1, window.qa.zt.n)).toFixed(2), p: [Math.round(window.game.player.x), Math.round(window.game.player.z)] }));
      console.log('i=' + i, JSON.stringify(s));
      await ev(() => { window.qa.zt = { sum: 0, n: 0, max: 0 }; });
    }
  }
  await ev(() => { const g = window.game; g.input.keys.clear(); });
  await shot('play-end');
  report();
  await browser.close();
})();
