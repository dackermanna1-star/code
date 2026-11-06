// Scripted playtest: visits POIs, tests weather/time, combat and UI. Usage: node dev/core-playtest.cjs [port] [only]
const { chromium } = require('playwright');
const port = process.argv[2] || 5198;
const only = process.argv[3] ? process.argv[3].split(',') : null;
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await p.goto(`http://localhost:${port}/?autostart=1&test=1&seed=${process.env.SEED || 'millbrook'}`);
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 240000 });
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const settle = async (ms = 2500) => {
    // let chunks mesh around the new position
    await ev(() => { const g = window.game; g.chunks.budgetMs = 60; });
    await p.waitForTimeout(ms);
  };
  const shot = async (name) => { await p.screenshot({ path: `dev/out/play-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot fail', name, e.message.split('\n')[0])); console.log('shot', name); };
  const tp = (x, y, z, yaw, pitch = -0.15) => ev(([x, y, z, yaw, pitch]) => { const g = window.game, P = g.player; P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.yaw = yaw; P.pitch = pitch; }, [x, y, z, yaw, pitch]);
  const pois = await ev(() => window.game.world.pois.map((q) => ({ name: q.name, type: q.type, x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, w: q.x1 - q.x0, d: q.z1 - q.z0 })));
  console.log('POIs:', pois.length, pois.map((q) => q.name).join(' | ').slice(0, 1500));
  const want = (n) => !only || only.includes(n);
  const setTime = (h) => ev((h) => { const g = window.game; g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + h); }, h);
  const setWeather = (w) => ev((w) => window.game.weatherSys.set(w, true), w);
  await ev(() => { window.game.noSpawn = false; });

  if (want('spawn')) { await settle(1500); await shot('spawn'); }
  // overview views from above POIs
  const visit = async (match, label, h = 11, weather = 'clear', height = 18, back = 26) => {
    const q = pois.find((q) => q.name.toLowerCase().includes(match)) || pois.find((q) => q.type === match);
    if (!q) { console.log('no POI', match); return; }
    await setTime(h); await setWeather(weather);
    const y = await ev(([x, z]) => window.game.world.surfaceY(Math.floor(x), Math.floor(z)), [q.x, q.z + back]);
    await tp(q.x, Math.max(y, 21) + height, q.z + back, 0, -0.5);
    await ev(() => { window.game.player.flying = true; });
    await settle(3500);
    await shot(label);
  };
  // keep the player from falling while we take aerial shots
  await ev(() => {
    const g = window.game; const P = g.player; const orig = P.updateMovement.bind(P);
    P.updateMovement = (dt, input, ctx) => { if (P.flying) { P.vy = 0; return {}; } return orig(dt, input, ctx); };
    g.survival.hurt = ((h) => (a, c, s) => { if (!P.flying) h.call(g.survival, a, c, s); })(g.survival.hurt);
  });
  if (want('downtown')) await visit('downtown', 'downtown', 13);
  if (want('hospital')) await visit('hospital', 'hospital', 10);
  if (want('police')) await visit('police', 'police', 15);
  if (want('checkpoint')) await visit('checkpoint', 'checkpoint', 9, 'overcast', 22, 34);
  if (want('farm')) await visit('farm', 'farm', 17.5, 'clear', 16, 30);
  if (want('suburb')) await visit('street', 'suburb', 16, 'cloudy', 12, 20);
  if (want('dusk')) await visit('downtown', 'dusk', 19.3, 'clear', 6, 18);
  if (want('night')) {
    await visit('street', 'night', 23, 'clear', 2, 6);
    await ev(() => { const g = window.game; g.player.inv.addItem(window.__createItem ? window.__createItem('flashlight') : null); });
  }
  if (want('storm')) await visit('downtown', 'storm', 14, 'storm', 4, 12);
  if (want('fog')) await visit('forest', 'fog', 9, 'fog', 3, 10);

  if (want('combat')) {
    // stand on a road, spawn zombies, shoot them
    await setTime(12); await setWeather('clear');
    const q = pois.find((q) => q.type === 'residential') || pois[0];
    const gy = await ev(([x, z]) => window.game.world.surfaceY(Math.floor(x), Math.floor(z)), [q.x, q.z]);
    await tp(q.x, gy, q.z, 0, -0.05);
    await ev(() => { window.game.player.flying = false; });
    await settle(2500);
    await ev(async () => {
      const g = window.game;
      const { createItem } = await import('/src/items/items.js');
      g.player.inv.hotbar[0] = createItem('pistol_m9', { ammo: 15 });
      g.player.inv.hotbar[1] = createItem('fire_axe');
      g.player.inv.addItem(createItem('ammo_9mm', { count: 30 }));
      g.player.inv.selected = 0; g.player.inv.changed();
      const P = g.player;
      for (let i = 0; i < 5; i++) {
        const z = g.zombies.spawn(P.x - Math.sin(P.yaw) * (6 + i * 1.5) + (i - 2) * 1.2, P.y, P.z - Math.cos(P.yaw) * (6 + i * 1.5), { variant: i === 4 ? 'brute' : 'walker' });
        z.yaw = P.yaw;
      }
      g.noSpawn = true;
    });
    await p.waitForTimeout(1500);
    await shot('combat-before');
    // fire several shots at zombies
    for (let i = 0; i < 6; i++) {
      await ev(() => {
        const g = window.game, P = g.player;
        const z = g.zombies.zombies.filter((z) => !z.dead).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
        if (!z) return;
        const dx = z.x - P.x, dz = z.z - P.z, dy = z.y + 1.55 - (P.y + P.eye);
        P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        g.combat.cooldown = 0;
        g.combat.fireGun(g.player.inv.selectedStack, (g.combat.def));
      });
      await p.waitForTimeout(350);
      if (i === 1) await shot('combat-shot');
    }
    await p.waitForTimeout(1200);
    await shot('combat-after');
    const st = await ev(() => { const g = window.game; return { dead: g.zombies.zombies.filter((z) => z.dead).length, alive: g.zombies.zombies.filter((z) => !z.dead).length, kills: g.player.kills, hp: g.player.health, ammo: g.hud.ammo }; });
    console.log('combat', JSON.stringify(st));
    // melee
    await ev(() => { const g = window.game; g.player.inv.selected = 1; g.player.inv.changed(); });
    await p.waitForTimeout(700);
    await ev(() => { const g = window.game; g.combat.cooldown = 0; g.combat.swing(g.player.inv.selectedStack, g.combat.def, false); });
    await p.waitForTimeout(150);
    await shot('melee-swing');
    await p.waitForTimeout(3000);
    const st2 = await ev(() => { const g = window.game; return { alive: g.zombies.zombies.filter((z) => !z.dead).length, hp: g.player.health.toFixed(1), wounds: g.player.wounds.map((w) => w.type + '@' + w.part), moodles: g.player.moodles.map((m) => m.id) }; });
    console.log('after melee', JSON.stringify(st2));
  }
  if (want('loot')) {
    // find the nearest container and open the inventory with it
    const res = await ev(() => {
      const g = window.game, w = g.world, P = g.player;
      for (let r = 1; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let y = 20; y < 30; y++) {
        const x = Math.floor(P.x) + dx, z = Math.floor(P.z) + dz;
        const c = w.getContainer(x, y, z);
        if (c && !c.locked) { g.openLoot([g.containerDesc(c)]); return { x, y, z, loot: c.loot, items: c.items.filter(Boolean).map((s) => s.id) }; }
      }
      return null;
    });
    console.log('loot', JSON.stringify(res));
    await p.waitForTimeout(800);
    await shot('loot');
    await ev(() => window.game.ui.closeAll());
  }
  if (want('map')) {
    await ev(() => { const g = window.game; g.mapRevealed = true; g.ui.openPanel('map'); });
    await p.waitForTimeout(1500);
    await shot('map');
    await ev(() => window.game.ui.closeAll());
  }
  const perf = await ev(() => ({ perf: window.game.perf, fps: window.game.fps, sections: window.game.chunks.stats.sections, zombies: window.game.zombies.zombies.length }));
  console.log('perf', JSON.stringify(perf));
  const uniq = [...new Set(errors)];
  console.log('errors (' + uniq.length + '):\n' + uniq.slice(0, 40).join('\n'));
  await b.close();
})();
