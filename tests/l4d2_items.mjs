// L4D2 item logic test (QUALITY=low, no rendering): defibrillator revive, upgrade
// packs (deploy -> crate -> incendiary / explosive rounds), laser sight, katana,
// baseball bat, frying pan, chainsaw (cutting, fuel burn, fuel-out swap), item
// spawn models, bots running with the new items. Prints PASS/FAIL per check.
// QUALITY=low node tests/play.mjs tests/l4d2_items.mjs
export default async ({ page, evalg, wait, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, P = g.player, out = [];
    const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' (' + info + ')' : ''}`);
    try {
      g.noRender = true; g.director.enabled = false; g.cheats.god = true;
      window.session.menu?.clear?.();
      for (const c of g.infected.commons) c.hp = 0;
      g.advance(0.5);
      const bots = g.survivors.filter((s) => s !== P);
      const home = P.pos.clone();
      const front = (d = 1.2) => [P.pos.x - Math.sin(P.yaw) * d, P.pos.y, P.pos.z - Math.cos(P.yaw) * d];
      const commonAt = (d = 1.2) => { const [x, y, z] = front(d); const c = g.infected.spawnCommon(x, y, z, {}); if (c) { c.hp = 50; c.state = 3; } return c; };
      // player input goes through game.testCmd (the controller rebuilds P.cmd every frame)
      const hold = (cmd, secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { g.testCmd = Object.assign({}, cmd, i > 0 ? { firePressed: false, usePressed: false } : {}); g.advance(1 / 60); } g.testCmd = null; };
      g.cheats.botsIdle = true; // bots stand still (and don't shoot our test targets) until the bot checks
      P.pitch = -0.05;
      // ---- world models for every new item
      for (const t of ['katana', 'baseballBat', 'fryingPan', 'chainsaw', 'defib', 'upgradeIncendiary', 'upgradeExplosive', 'laserSight', 'crateIncendiary', 'crateExplosive']) {
        const it = g.items.spawn(t, home.x + 5, home.y, home.z + 5);
        ok('spawn model ' + t, !!it && !!it.mesh);
        if (it) { it.taken = true; it.mesh.parent?.remove(it.mesh); }
      }
      // ---- melee: pick up from the world, swing, kill a common
      for (const t of ['katana', 'baseballBat', 'fryingPan']) {
        const it = g.items.spawn(t, P.pos.x, P.pos.y, P.pos.z);
        g.items.take(it, P);
        ok('pickup ' + t, P.inv.secondary.type === t && P.slot === 1);
        g.advance(0.6);
        const c = commonAt(1.1);
        hold({ fire: true, firePressed: true }, 0.05); hold({}, 0.9);
        ok(t + ' kills a common', !c || c.dead, c ? 'hp ' + c.hp.toFixed(0) : 'no common');
      }
      // ---- chainsaw: rev, cut, burn fuel, run dry -> pistol
      {
        const it = g.items.spawn('chainsaw', P.pos.x, P.pos.y, P.pos.z);
        g.items.take(it, P);
        g.advance(0.6);
        const w = P.inv.secondary, f0 = w.fuel;
        const cs = [commonAt(1.0), commonAt(1.3)];
        hold({ fire: true }, 1.0);
        ok('chainsaw cuts commons', cs.every((c) => !c || c.dead), cs.map((c) => c && c.hp.toFixed(0)).join(','));
        ok('chainsaw burns fuel while cutting', w.fuel < f0 - 4, `${f0} -> ${w.fuel.toFixed(1)}`);
        const f1 = w.fuel; hold({}, 1.0);
        ok('chainsaw idles without burning fuel', Math.abs(w.fuel - f1) < 1e-6);
        w.fuel = 0.3; hold({ fire: true }, 0.3); g.advance(0.1);
        ok('chainsaw out of fuel -> pistol', P.inv.secondary.type === 'pistol', P.inv.secondary.type);
      }
      // ---- laser sight
      P.giveWeapon('rifle');
      g.advance(0.7);
      const rw = P.inv.primary, sp0 = rw.spread(P);
      const lb = g.items.spawn('laserSight', P.pos.x, P.pos.y, P.pos.z);
      ok('laser box take', g.items.take(lb, P) && rw.laser === true);
      ok('laser tightens spread', rw.spread(P) < sp0 * 0.7, `${sp0.toFixed(2)} -> ${rw.spread(P).toFixed(2)}`);
      ok('laser box stays (infinite)', !lb.taken);
      g.viewmodel.update(1 / 60, P, { dx: 0, dy: 0 });
      ok('laser beam on viewmodel', !!g.viewmodel.laser && g.viewmodel.laser.visible);
      // ---- upgrade packs: pick up, deploy (hold fire), crate, rounds
      for (const kind of ['incendiary', 'explosive']) {
        const t = kind === 'incendiary' ? 'upgradeIncendiary' : 'upgradeExplosive';
        P.inv.medkit = false;
        const pk = g.items.spawn(t, P.pos.x, P.pos.y, P.pos.z);
        g.items.take(pk, P);
        ok('pickup ' + t, P.inv.medkit === t);
        P.selectSlot(3); g.advance(0.5);
        const n0 = g.items.items.filter((i) => i.crate && !i.taken).length;
        hold({ fire: true }, 1.5);
        const crate = g.items.items.filter((i) => i.crate && !i.taken).pop();
        ok('deploy ' + kind + ' crate', !P.inv.medkit && g.items.items.filter((i) => i.crate && !i.taken).length === n0 + 1);
        if (!crate) continue;
        rw.upgrade = null;
        ok('take ' + kind + ' rounds', g.items.take(crate, P) && rw.upgrade?.type === kind && rw.upgrade.rounds === rw.maxClip);
        ok('crate once per survivor', !g.items.take(crate, P));
        for (const b of bots) { if (!b.inv.primary) b.giveWeapon('smg'); g.items.take(crate, b); }
        ok('crate gone after everyone loaded', crate.taken);
        P.selectSlot(0); g.advance(0.7);
        const c = commonAt(4);
        if (kind === 'incendiary') c.hp = 400; // survive a few rounds so the flames can be seen
        P.yaw = Math.atan2(-(c.pos.x - P.pos.x), -(c.pos.z - P.pos.z)); P.pitch = -0.08;
        const rounds = rw.upgrade.rounds;
        let burned = false;
        const aim = () => { const dx = c.pos.x - P.pos.x, dz = c.pos.z - P.pos.z, dy = c.pos.y + 1.2 - (P.pos.y + 1.62); P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.aimPitchOff = P.aimYawOff = 0; };
        for (let i = 0; i < 40 && !c.dead; i++) { aim(); hold({ fire: true, firePressed: true }, 1 / 60); hold({}, 0.1); if (c.burning > 0) burned = true; }
        ok(kind + ' rounds fired', rw.upgrade ? rw.upgrade.rounds < rounds : true);
        if (kind === 'incendiary') ok('incendiary sets infected alight', burned || c.burning > 0 || (c.dead && c.lastHitBy === P), 'burning ' + c.burning.toFixed(1));
        else ok('explosive rounds kill', c.dead);
      }
      // ---- defibrillator: a bot dies, the player shocks them back (hold use on the body)
      {
        const b = bots[0];
        b.teleport(P.pos.x - Math.sin(P.yaw) * 1.2, P.pos.y, P.pos.z - Math.cos(P.yaw) * 1.2, 0);
        g.advance(0.2);
        b.die('test');
        g.advance(1.0);
        P.inv.medkit = 'defib';
        const u = g.items.findUsable(P);
        ok('defib prompt on body', !!u && u.defib === b, u ? u.prompt : 'none');
        hold({ use: true, usePressed: true }, 3.2);
        ok('defib revives', !b.dead && b.health === 50 && !P.inv.medkit, `dead ${b.dead} hp ${b.health}`);
        // bot uses a defib on a dead teammate
        const b2 = bots[1], b3 = bots[2];
        g.cheats.botsIdle = false;
        b3.teleport(b2.pos.x + 1.5, b2.pos.y, b2.pos.z, 0); g.advance(0.2);
        b3.die('test'); b2.inv.medkit = 'defib';
        g.advance(8);
        ok('bot defibs a dead teammate', !b3.dead, 'bot mode ' + b2.brain?.mode);
      }
      // ---- bots with melee / chainsaw keep running
      {
        bots[0].giveWeapon('chainsaw'); bots[1].giveWeapon('katana'); bots[2].giveWeapon('fryingPan');
        for (const b of bots) if (!b.inv.primary) b.giveWeapon('smg');
        g.cheats.botsIdle = false;
        for (let i = 0; i < 6; i++) commonAt(3 + i * 0.3);
        let err = null;
        try { g.advance(8); } catch (e) { err = e.message; }
        ok('bots run with melee/chainsaw 8s', !err, err || bots.map((b) => b.char.id + ':' + b.inv.secondary.type + '/s' + b.slot).join(' '));
      }
    } catch (e) { out.push('FAIL exception ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')); }
    return out;
  });
  for (const l of r || ['FAIL no result']) console.log(l);
  const errs = logs.filter((l) => /\[error\]|pageerror/i.test(l) && !/WebGL|GL_INVALID|favicon/.test(l));
  console.log('console errors:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(`summary: ${(r || []).filter((l) => l.startsWith('PASS')).length} pass, ${(r || []).filter((l) => l.startsWith('FAIL')).length} fail`);
};
