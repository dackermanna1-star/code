export default async function ({ page }) {
  await page.evaluate(() => { window.__game.running = false; });
  const step = (s) => page.evaluate((s) => window.__game.simulate(s), s);
  const report = (label) => page.evaluate((label) => {
    const g = window.__game;
    const states = {};
    for (const b of g.ai.brains) if (b.ch.alive) states[b.state] = (states[b.state] || 0) + 1;
    return label + ' ' + JSON.stringify({ t: (g.time.elapsed - g.director.startTime).toFixed(0), hp: Math.round(g.player.health), kills: g.player.stats.kills, alive: g.director.remaining(), int: g.ai.intensity.toFixed(2), att: g.ai.attackersOn(g.player), states, dmgTaken: Math.round(g.player.stats.damageTaken), st: g.state });
  }, label);
  await step(1);
  await page.evaluate(() => { window.__smart = (new URLSearchParams(location.search)).has('dumb') ? 0 : 1; });
  await page.evaluate(() => {
    const g = window.__game;
    window.__deaths = [];
    // instrument deaths
    const orig = g.director.hooks.killFeed;
    const evs = window.__deathLog = [];
    window.__events.on('death', ((e) => { const k = e.victim.killedBy ?? e.victim.lastAttacker; evs.push({ v: e.victim.name, cause: e.cause, killer: k ? (k.isPlayer ? 'PLAYER' : (k.brain?.arch?.id ?? k.name)) : 'none', w: k?.weapon?.def?.id ?? k?.weapon?.name ?? '' }); }));
  });
  // provoke a biker
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id === 'biker' && b.ch.position.y < 1);
    const p = b.ch.position;
    g.player.ctrl.teleport({ x: p.x, y: p.y, z: p.z + 1.0 }, 0);
  });
  for (let k = 0; k < 24; k++) {
    for (let j = 0; j < 10; j++) {
      await page.evaluate(() => {
        const g = window.__game;
        if (!g.player.alive) return;
        let best = null, bd = 1e9;
        for (const b of g.ai.brains) { if (!b.ch.alive) continue; const d = b.ch.position.distanceTo(g.player.position); const hostile = b.state === 'combat' && b.target === g.player; const w = d - (hostile ? 3 : 0); if (w < bd) { bd = w; best = b; } }
        if (!best) return;
        const p = best.ch.position, me = g.player.position;
        const d = p.distanceTo(me);
        g.player.ctrl.yaw = Math.atan2(-(p.x - me.x), -(p.z - me.z));
        g.player.ctrl.pitch = best.ch.upright ? -0.05 : -0.7;
        if (d > 1.3) g.input.virtualPress('forward'); else g.input.virtualRelease('forward');
        const smart = (window.__smart ?? 1);
        const threat = smart && g.ai.brains.some((b) => b.ch.alive && b.target === g.player && b.attacking && b.ch.position.distanceTo(me) < 2.4 && Math.random() < 0.6);
        if (threat) { g.input.virtualPress('block'); return; }
        g.input.virtualRelease('block');
        if (d < 1.9) {
          const r = Math.random();
          if (r < 0.15) g.input.virtualTap('kick'); else g.input.virtualTap('attack');
        }
      });
      await step(0.25);
    }
    console.log(await report(`t${k}`));
    const st = await page.evaluate(() => window.__game.state);
    if (st !== 'playing') break;
  }
  console.log(JSON.stringify(await page.evaluate(() => window.__deathLog)));
  {
  }
}
