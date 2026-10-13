// Zombie survival, Milestone 3.2: the weapon forge (zforge.js; tables in attachments.js). Tiers
// I-V (damage, magazine, reload, the price ladder, break-only, the menu states), the round types
// from Tier III and their procs - Incendiary (burns), Shock (an arc chain, a stun), Cryo (chill,
// freeze: no step, no claw, the pose held, +25% damage, shatter; specials stunned, bosses only
// slowed), Explosive (a small blast: zombies only, no gibs), Vampiric (health back, capped) -
// with the per-victim cooldown, one proc a trigger pull and the per-weapon rates; the tesla,
// chainsaw, flamethrower and launchers reading the tier; bots forging; the HUD badge, the view
// model's tier paint, the buy menu's Forge pages, the sounds. Then a Tier V Deagle at wave 25 on
// Normal against a stock AK-47 (real bullets).
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-forge.js /tmp/zforge
// Prints "[sim] PASS ..." / "[sim] FAIL ..." (and "[sim] INFO ..." for the measurements).
/* global document, localStorage */
(() => {
  const g = window.__game;
  const DEG = Math.PI / 180;
  const saved = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/zombies/.test(k)) saved[k] = localStorage.getItem(k); }
  const restore = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/zombies/.test(k) && !(k in saved)) localStorage.removeItem(k); }
    for (const k in saved) localStorage.setItem(k, saved[k]);
  };
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const F = () => g.zombies.forge;
  const me = () => g.local;
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  let rec = [];
  const pick = (e) => ({ type: e.type, player: e.player, attacker: e.attacker, victim: e.victim, kind: e.kind, tier: e.tier, round: e.round, weapon: e.weapon, cost: e.cost, damage: e.damage, blast: e.blast, explode: e.explode });
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push(pick(e))); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  let think0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
  let rate0 = null;
  const alwaysProc = () => { if (!rate0) rate0 = F().rate; F().rate = () => 1; };
  const normalProc = () => { if (rate0) F().rate = rate0; rate0 = null; };
  function newRun(opts = {}) {
    thawBots();
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
    listen();
  }
  function faceOpen(p) {
    const e = p.eyePos();
    let best = 0, bd = -1;
    for (let a = 0; a < 360; a += 15) {
      let d = 0;
      for (const r of [120, 200, 280, 360]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 30])) d = r; else break; }
      if (d > bd) { bd = d; best = a; }
    }
    p.pm.angles[1] = best; p.pm.angles[0] = 6;
    return bd;
  }
  // a plain walker `dist` ahead of you (side: to the left), standing still, plenty of health
  function zombieAt(dist, side = 0, hp = 1e5) {
    const p = me(), o = p.pm.origin, y = p.pm.angles[1] * DEG;
    for (const q of Z().pool) if (!q.alive && !q.special && q.deathTime > 0) q.deathTime = -1e9; // (the bodies are free again)
    for (const q of used) if (!q.alive) used.delete(q);
    for (let k = 0; k < 6; k++) {
      const dd = dist * (1 - k * 0.12), ss = side * (1 - k * 0.15);
      const at = [o[0] + Math.cos(y) * dd - Math.sin(y) * ss, o[1] + Math.sin(y) * dd + Math.cos(y) * ss, o[2]];
      Z().spawnZombie({ at, variant: 'walker' });
      let z = null, bd = 1e9;
      for (const q of Z().pool) { if (!q.alive || q.special || used.has(q)) continue; const d = Math.hypot(q.pm.origin[0] - at[0], q.pm.origin[1] - at[1]); if (d < bd) { bd = d; z = q; } }
      if (z) { used.add(z); z.health = z.maxHealth = hp; z.armor = 0; z.zSpeed = 0; z.nextAttack = 1e9; z.pm.origin[0] = at[0]; z.pm.origin[1] = at[1]; return z; }
    }
    return null;
  }
  const used = new Set();
  const clearZ = () => { Z().clearHorde?.(); used.clear(); for (const q of Z().pool) if (q.alive) { q.health = 0; q.alive = false; } };
  const chest = (q) => [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 14];
  const dirTo = (q) => { const e = me().eyePos(), c = chest(q), l = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]) || 1; return [(c[0] - e[0]) / l, (c[1] - e[1]) / l, (c[2] - e[2]) / l]; };
  // a bullet's hit as weaponsys / onBulletImpact deal it (the gun in hand's id, a shot id)
  const shoot = (q, dmg, hg = 2, shot = ++g.shotSeq) => { const h0 = q.health; g.damagePlayer(q, me(), dmg, hg, me().active.id, dirTo(q), chest(q), { shot }); return h0 - q.health; };
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  const gun = (id) => { const p = me(); if (p.weapons[WS.WEAPON_DEFS[id].slot]?.id !== id) g.giveWeapon(p, id, { select: true }); const w = p.weapons[WS.WEAPON_DEFS[id].slot]; g.selectWeapon(p, w, true); w.ammo = w.def.maxAmmo; return w; };
  const wait = (s) => ticks(Math.round(s / 0.01));
  let WS, ATT, ZF;
  const steps = [];

  // ---------------------------------------------------------------- tables, difficulty, sounds
  steps.push(async () => {
    WS = await import('/src/game/weaponsys.js');
    ATT = await import('/src/game/attachments.js');
    ZF = await import('/src/game/zforge.js');
    const ZD = await import('/src/game/zdiff.js');
    const four = ['casual', 'normal', 'hard', 'nightmare'];
    const fields = ['priceK', 'tiers', 'roundFrom', 'procK', 'leech', 'botTier'];
    const miss = [];
    for (const id of ZD.ZDIFF_ORDER) for (const f of fields) if (ZD.ZDIFF[id].forge?.[f] === undefined) miss.push(`${id}.${f}`);
    check('every preset has the forge group (priceK tiers roundFrom procK leech botTier)', !miss.length, miss.join(' '));
    const mono = (f, up) => four.map((id) => ZD.ZDIFF[id].forge[f]).every((v, i, a) => !i || (up ? v >= a[i - 1] : v <= a[i - 1]));
    check('pressure grows casual -> nightmare: prices up; procs, leech, bot tiers down', mono('priceK', true) && mono('procK', false) && mono('leech', false) && mono('botTier', false));
    check('five round types, each with name / text / price / colour', ZF.ROUND_IDS.length === 5 && ZF.ROUND_IDS.every((r) => ZF.ROUNDS[r].name && ZF.ROUNDS[r].text && ZF.ROUNDS[r].price > 0 && ZF.ROUNDS[r].rgb));
    const dg = { id: 'deagle', def: WS.WEAPON_DEFS.deagle }, mg = { id: 'minigun', def: WS.WEAPON_DEFS.minigun }, rpg = { id: 'rpg', def: WS.WEAPON_DEFS.rpg };
    const t5 = ATT.tierStats(dg, 5);
    check('Tier V Deagle: x2.2 damage, 11 rounds, reload x0.68', near(t5.damage, 2.2, 1e-9) && Math.round(7 * t5.clip) === 11 && t5.reload === 0.68, JSON.stringify(t5));
    check('machine guns and launchers gain less; an RPG stays single-shot', ATT.tierStats(mg, 5).damage < 1.6 && Math.round(ATT.tierStats(rpg, 5).clip) === 1);
    const names = ['forge_hammer', 'forge_tier5', 'forge_round', 'forge_ignite', 'forge_shock', 'forge_chill', 'forge_freeze', 'forge_shatter', 'forge_blast', 'forge_siphon'];
    const SR = await import('/src/assets/snd/recipes.js');
    const listed = names.filter((n) => SR.SOUND_GROUPS.Forge.includes(n));
    newRun();
    let made = 0;
    const quiet = [];
    for (const n of names) {
      try {
        const v = await g.sound.bank.get(n);
        const bufs = Array.isArray(v) ? v : [v];
        let peak = 0;
        for (const b of bufs) { const d = b?.getChannelData?.(0); if (d) for (let k = 0; k < d.length; k += 7) peak = Math.max(peak, Math.abs(d[k])); }
        if (bufs.length && peak > 0.05) made++; else quiet.push(n);
      } catch { quiet.push(n); }
    }
    check('the forge sounds are catalogued and render (not silent)', listed.length === names.length && made === names.length, `${listed.length} listed, ${made} rendered ${quiet.join(' ')}`);
    return false;
  });

  // ---------------------------------------------------------------- the shop: the ladder, prices, break-only, the menu states
  steps.push(async () => {
    freezeBots();
    const p = me();
    p.money = 60000;
    const w = gun('deagle');
    const E = Z().economy;
    const s1 = E.menuState(p, 'tier_1'), s2 = E.menuState(p, 'tier_2'), sr = E.menuState(p, 'round_cryo');
    const exp1 = Math.round((400 + 650 * 0.15) / 50) * 50;
    check('menu: Tier I open at its price, Tier II after it, rounds from Tier III', !s1.off && s1.price === exp1 && s2.off && /after/.test(s2.note) && sr.off && /III/.test(sr.note) && /damage/.test(s1.why || ''), `${s1.price} ${s2.note} ${sr.note} | ${s1.why}`);
    const m0 = p.money;
    check('buying Tier II first is refused (no money taken)', g.rounds.buy(p, 'tier_2') === false && p.money === m0 && !w.tier);
    const ok1 = g.rounds.buy(p, 'tier_1');
    check('Tier I bought: paid, tier 1, x1.18 damage, a forge event', ok1 && p.money === m0 - exp1 && w.tier === 1 && near(w.mods.damage, ATT.tierStats(w, 1).damage, 1e-9) && of('forge', (e) => e.player === p && e.kind === 'tier' && e.tier === 1 && e.cost === exp1 && e.weapon === 'deagle').length === 1);
    for (const n of [2, 3, 4, 5]) g.rounds.buy(p, 'tier_' + n);
    ticks(2);
    check('up to Tier V: x2.2 damage, an 11-round magazine (loaded), x0.68 reload, x0.8 draw', w.tier === 5 && near(w.mods.damage, 2.2, 1e-9) && w.clipMax === 11 && w.clip === 11 && w.mods.reload === 0.68 && w.mods.handling === 0.8, `${w.tier} ${w.mods.damage} ${w.clipMax} ${w.clip}`);
    const spent = m0 - p.money;
    info(`the Deagle's Tier I-V ladder costs $${spent} on Normal`);
    check('no Tier VI; the tier items say forged', g.rounds.buy(p, 'tier_6') === false && E.menuState(p, 'tier_3').off && E.menuState(p, 'tier_3').note === 'forged');
    const pr = E.menuState(p, 'round_cryo');
    const okR = g.rounds.buy(p, 'round_cryo');
    check('a round type at Tier III+: Cryo loaded (round event), then "loaded"', !pr.off && okR && w.round === 'cryo' && w.mods.round === 'cryo' && E.menuState(p, 'round_cryo').note === 'loaded' && of('forge', (e) => e.kind === 'round' && e.round === 'cryo').length === 1);
    const okS = g.rounds.buy(p, 'round_shock');
    check('swapping it for Shock', okS && w.round === 'shock' && !E.menuState(p, 'round_incendiary').off && /instead of Shock/.test(E.menuState(p, 'round_incendiary').why));
    // attachments still fold under the tier
    g.rounds.buy(p, 'att_extmag');
    check('an extended magazine on top: 7 x 1.5 x the tier\'s', w.clipMax === Math.round(Math.round(7 * 1.5) * ATT.tierStats(w, 5).clip) && near(w.mods.damage, 2.2, 1e-9), String(w.clipMax));
    // real shots carry the tier (weaponsys shoot)
    const z = (faceOpen(p), zombieAt(220));
    aim(p, chest(z));
    w.nextPrimary = 0; w.nextAttack = 0;
    const build = g.buildLocalCmd;
    g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 1 });
    w.lastShot = null;
    for (let i = 0; i < 40 && !w.lastShot; i++) { aim(p, chest(z)); g.frame(0.02); g.tick(); }
    g.buildLocalCmd = build;
    check('a Tier V Deagle round leaves the barrel at x2.2 damage', !!w.lastShot && near(w.lastShot.damage, 54 * 2.2, 1e-6), String(w.lastShot?.damage));
    // reload time
    const reloadTime = () => {
      w.clip = 0; w.inReload = false; w.nextAttack = 0; w.nextPrimary = 0; w.reloadEnd = 0;
      const t0 = g.time;
      WS.weaponFrame(w, g.weaponCtx(p), 4, 0); // (+reload)
      const r = w.reloadEnd ? w.reloadEnd - t0 : null;
      w.inReload = false; w.clip = w.clipMax; w.nextAttack = 0;
      return r;
    };
    const rT5 = reloadTime();
    w.tier = 0; ATT.refresh(w);
    const rT0 = reloadTime();
    w.tier = 5; ATT.refresh(w);
    check('it reloads in x0.68 the time', rT5 != null && rT0 > 0 && near(rT5 / rT0, 0.68, 0.01), `${rT0} -> ${rT5}`);
    // break-only
    Z().nextWaveAt = g.time + 0.02; ticks(5);
    p.money = 60000;
    const ak = gun('ak47');
    const mid = g.rounds.buy(p, 'tier_1');
    check('mid-wave the forge is shut (break-only)', Z().state === 'wave' && mid === false && !ak.tier && E.menuState(p, 'tier_1').closed === true);
    clearZ();
    Z().state = 'break'; Z().nextWaveAt = g.time + 9999;
    // the view model wears it
    const vm = g.vm;
    const swapped = []; vm?.object3D.traverse((o) => { if (o.isMesh && /vmskin_forge/.test(o.material?.name || '')) swapped.push(o.material.name); });
    g.selectWeapon(p, w, true); ticks(2);
    const vm2 = g.vm;
    const fin = []; vm2?.object3D.traverse((o) => { if (o.isMesh && /vmskin_forge5/.test(o.material?.name || '')) fin.push(1); });
    check('the view model: Tier V finish, glowing seams and the round\'s canister', !!vm2 && fin.length > 0 && (vm2.forgeGlow?.length || 0) >= 3 && /shock/.test(vm2._loadoutKey || ''), `${fin.length} painted, ${vm2?.forgeGlow?.length} glows, ${vm2?._loadoutKey}`);
    void swapped;
    // hard costs more
    const hardK = (await import('/src/game/zdiff.js')).ZDIFF.hard.forge.priceK;
    check('prices scale with diff.forge.priceK', F().price(p, 'round_vampiric') === Math.round((2500 + 650 * 0.1) * Z().diff.forge.priceK / 50) * 50 && hardK > 1);
    thawBots();
    return false;
  });

  // ---------------------------------------------------------------- procs: rates, cooldowns, one a pull
  steps.push(async () => {
    newRun();
    freezeBots();
    const p = me();
    faceOpen(p);
    const w = gun('deagle');
    con('sv_cheats 1');
    con('zm_forge 5 incendiary');
    check('zm_forge (cheat) forges the gun in hand', w.tier === 5 && w.round === 'incendiary' && Z().cheated === true);
    const rd = F().rate(w), ra = F().rate({ id: 'ak47', def: WS.WEAPON_DEFS.ak47, tier: 5 }), rm = F().rate({ id: 'minigun', def: WS.WEAPON_DEFS.minigun, tier: 5 }), rs = F().rate({ id: 'aa12', def: WS.WEAPON_DEFS.aa12, tier: 5 });
    check('per-weapon proc rates: Deagle > AK > minigun, AA-12 pellets low', rd > ra && ra > rm && rm < 0.05 && rs < 0.05, `${rd.toFixed(2)} ${ra.toFixed(2)} ${rm.toFixed(3)} ${rs.toFixed(3)}`);
    alwaysProc();
    // incendiary
    let z = zombieAt(200);
    rec = [];
    shoot(z, 60);
    check('Incendiary: sets it alight (the gun burns it), a proc event', !!z.burn && z.burn.weapon === 'deagle' && z.burn.by === p && of('proc', (e) => e.round === 'incendiary' && e.victim === z && e.attacker === p).length === 1);
    rec = [];
    shoot(z, 60);
    check('...the per-victim cooldown: no second proc at once', of('proc').length === 0);
    wait(1.3);
    shoot(z, 60);
    check('...and one after it', of('proc').length === 1);
    // one proc a trigger pull (pellets / a round through two)
    const z2 = zombieAt(200, 60);
    rec = [];
    const shot = ++g.shotSeq;
    wait(1.3);
    shoot(z, 30, 2, shot); shoot(z2, 30, 2, shot);
    check('one proc a trigger pull', of('proc').length === 1);
    // procs need the gun in hand and its round; a bot's hit on you or a zombie's on a bot never procs
    rec = [];
    wait(1.3);
    const prevRound = w.round; w.round = null;
    shoot(z2, 30);
    w.round = prevRound;
    g.damagePlayer(z2, p, 30, 2, 'ak47', dirTo(z2), chest(z2), { shot: ++g.shotSeq }); // (not the gun in hand)
    const bot = squad().find((q) => q.isBot);
    g.damagePlayer(bot, z2, 5, 2, 'zombie', [1, 0, 0], null, {});
    check('no proc without a round, from another weapon or on the squad', of('proc').length === 0);
    // the burn is fire damage: it never procs again (fire hits are skipped)
    rec = [];
    wait(1.0);
    check('the burn ticks never proc', of('proc').length === 0 && of('hit', (e) => e.victim === z && e.damage > 0).length > 0);
    clearZ();
    normalProc();
    return false;
  });

  // ---------------------------------------------------------------- Shock: the arc chain
  steps.push(async () => {
    const p = me();
    faceOpen(p);
    const w = gun('deagle');
    w.round = 'shock'; ATT.refresh(w);
    alwaysProc();
    const a = zombieAt(220), b = zombieAt(240, 35), c = zombieAt(240, -35), far = zombieAt(900, 0);
    for (const q of [b, c]) { q.pm.origin[2] = a.pm.origin[2]; }
    const h = [a, b, c, far].map((q) => q.health);
    rec = [];
    const arcs0 = F().counts.chain;
    shoot(a, 60);
    const procs = of('proc', (e) => e.round === 'shock');
    check('Shock: arcs on to the zombies close by (not the far one), as blast damage, one proc', procs.length === 1 && b.health < h[1] && c.health < h[2] && far.health === h[3] && F().counts.chain - arcs0 >= 2 && of('hit', (e) => (e.victim === b || e.victim === c) && e.blast && !e.explode).length >= 2, `${h[1] - b.health} ${h[2] - c.health} ${far.health === h[3]}`);
    check('...the one hit is stunned (the tesla\'s jolt)', a.staggerKind === 'stun' && a.staggerUntil > g.time);
    const jump = 2 + (5 - Z().diff.forge.roundFrom);
    check(`...up to ${jump} jumps at Tier V`, F().counts.chain - arcs0 <= jump);
    clearZ();
    normalProc();
    return false;
  });

  // ---------------------------------------------------------------- Cryo: chill, freeze, shatter; specials and bosses
  steps.push(async () => {
    const p = me();
    faceOpen(p);
    const w = gun('deagle');
    w.round = 'cryo'; ATT.refresh(w);
    alwaysProc();
    const z = zombieAt(240);
    z.zSpeed = 200; z.nextAttack = 0;
    shoot(z, 10);
    ticks(1);
    check('Cryo: one chill slows it (velocityModifier)', z.fgChill === 1 && z.pm.velocityModifier <= 0.66 && !(z.fgFrozen > g.time), `${z.fgChill} ${z.pm.velocityModifier}`);
    wait(0.35);
    rec = [];
    shoot(z, 10);
    const frozen = z.fgFrozen > g.time;
    check('...the second freezes it solid (ice on it)', frozen && F().ice.some((s) => s.z === z && s.group.visible) && F().counts.freeze >= 1);
    const o0 = z.pm.origin.slice(), yaw0 = z.pm.angles[1];
    const bot = squad().find((q) => q.isBot);
    // stand a bot right next to it: no claw while frozen
    bot.pm.origin[0] = o0[0] + 30; bot.pm.origin[1] = o0[1]; bot.pm.origin[2] = o0[2];
    bot.god = true;
    rec = [];
    for (let i = 0; i < 100; i++) { g.tick(); if (i % 10 === 0) g.frame(0); }
    const moved = Math.hypot(z.pm.origin[0] - o0[0], z.pm.origin[1] - o0[1]);
    check('...frozen: no step, no turn, no claw', moved < 4 && Math.abs(z.pm.angles[1] - yaw0) < 0.01 && of('hit', (e) => e.attacker === z).length === 0, `moved ${moved.toFixed(1)}`);
    check('...its pose holds (modelDt 0)', Z().modelDt(z, 0.05) === 0);
    const dF = shoot(z, 40);
    const t1 = z.fgFrozen;
    z.fgFrozen = 0;
    const dN = shoot(z, 40);
    z.fgFrozen = t1;
    check('...and takes 25% more damage (the shatter hook)', near(dF / dN, 1.25, 0.02), `${dF} vs ${dN}`);
    wait(1.8);
    check('...it thaws (still chilled), the ice goes', !(z.fgFrozen > g.time) && !F().ice.some((s) => s.z === z) && z.fgChillT > g.time);
    // freeze again and kill it: it shatters (ice, no gibs)
    wait(1.5);
    shoot(z, 10); wait(0.35); shoot(z, 10);
    const sh0 = F().counts.shatter;
    z.health = 30;
    shoot(z, 200);
    ticks(2);
    check('a frozen one that dies shatters (and is not gibbed)', !z.alive && F().counts.shatter === sh0 + 1 && !z.gibbed && !F().ice.some((s) => s.z === z));
    // a special: stunned, not frozen
    Z().specials.spawn('hunter', { extra: true, near: chest(zombieAt(260)).slice() });
    const hz = Z().pool.filter((q) => q.alive && q.special === 'hunter').pop();
    if (hz) {
      hz.health = hz.maxHealth = 1e5;
      wait(0.05);
      shoot(hz, 5); wait(0.35); shoot(hz, 5);
      check('a special: chilled, then stunned (never frozen solid)', !(hz.fgFrozen > g.time) && hz.staggerKind === 'stun', `${hz.staggerKind}`);
    } else check('a special: chilled, then stunned (never frozen solid)', false, 'no hunter');
    // a boss: only slowed
    con('zm_boss 0');
    const b = g.bosses.boss;
    if (b) {
      for (let i = 0; i < 4; i++) { shoot(b, 5); wait(0.35); }
      ticks(1);
      check('a boss: only slowed (one chill, never frozen)', b.fgChill === 1 && !(b.fgFrozen > g.time) && b.pm.velocityModifier <= 0.81, `${b.fgChill} ${b.pm.velocityModifier}`);
      b.health = 1; g.damagePlayer(b, p, 1e6, 2, 'knife', [1, 0, 0], null, {});
    } else check('a boss: only slowed', false, 'no boss');
    clearZ();
    normalProc();
    return false;
  });

  // ---------------------------------------------------------------- Explosive and Vampiric
  steps.push(async () => {
    const p = me();
    ticks(300);
    clearZ();
    faceOpen(p);
    const w = gun('deagle');
    w.round = 'explosive'; ATT.refresh(w);
    alwaysProc();
    const a = zombieAt(240), b = zombieAt(250, 30), far = zombieAt(600);
    const bot = squad().find((q) => q.isBot);
    bot.god = false; bot.health = 100;
    bot.pm.origin[0] = b.pm.origin[0]; bot.pm.origin[1] = b.pm.origin[1] + 40; bot.pm.origin[2] = b.pm.origin[2];
    const hb = b.health, hf = far.health, hme = p.health;
    p.god = false;
    rec = [];
    shoot(a, 60);
    p.god = true;
    const procs = of('proc', (e) => e.round === 'explosive').length;
    const blasts = of('hit', (e) => e.blast && e.attacker === p);
    check('Explosive: a small blast hurts the zombies close by (blast damage, never explode)', procs === 1 && b.health < hb && far.health === hf && blasts.length >= 2 && blasts.every((e) => !e.explode), `${procs} procs, ${hb - b.health} to the next one`);
    check('...never you, never the squad', p.health === hme && bot.health === 100);
    // a killing round's blast: no gibs, bodies whole
    const k = zombieAt(240, -30);
    k.health = 20;
    wait(0.5);
    shoot(k, 100);
    ticks(5);
    check('...a kill by it leaves the body whole (no gibs)', !k.alive && !k.gibbed);
    // vampiric
    w.round = 'vampiric'; ATT.refresh(w);
    p.health = 40;
    const v = zombieAt(240, 20);
    rec = [];
    shoot(v, 60);
    const healed = p.health - 40;
    check('Vampiric: health back (a few points)', healed >= 1 && healed <= 6 && F().counts.leech >= healed, String(healed));
    // capped at diff.forge.leech a second
    p.health = 20;
    const h0 = p.health;
    for (let i = 0; i < 20; i++) { wait(0.21); shoot(v, 60); }
    const per = (p.health - h0) / (20 * 0.21);
    check(`...at most ${Z().diff.forge.leech} HP a second`, per <= Z().diff.forge.leech + 1.5, per.toFixed(1));
    p.health = 100;
    const full0 = F().counts.leech;
    wait(0.3); shoot(v, 60);
    check('...nothing at full health', p.health === 100 && F().counts.leech === full0);
    clearZ();
    normalProc();
    return false;
  });

  // ---------------------------------------------------------------- the specials read the tier: tesla, chainsaw, flamethrower, launchers
  steps.push(async () => {
    const p = me();
    clearZ();
    faceOpen(p);
    const dmgFrom = (id, tier, fire) => {
      const w = gun(id);
      w.tier = tier; w.round = null; ATT.refresh(w);
      const z = zombieAt(id === 'chainsaw' ? 40 : 160);
      aim(p, chest(z));
      g.frame(0.02);
      const h0 = z.health;
      fire(w, z);
      const d = h0 - z.health;
      clearZ();
      return d;
    };
    const tesla0 = dmgFrom('tesla', 0, (w) => g.zapFrom(p, w)), tesla5 = dmgFrom('tesla', 5, (w) => g.zapFrom(p, w));
    check('the tesla reads the tier', tesla0 > 0 && near(tesla5 / tesla0, ATT.tierStats({ id: 'tesla', def: WS.WEAPON_DEFS.tesla }, 5).damage, 0.02), `${tesla0.toFixed(1)} -> ${tesla5.toFixed(1)}`);
    const saw0 = dmgFrom('chainsaw', 0, (w) => g.sawFrom(p, w)), saw5 = dmgFrom('chainsaw', 5, (w) => g.sawFrom(p, w));
    check('the chainsaw reads the tier', saw0 > 0 && near(saw5 / saw0, 1.8, 0.02), `${saw0.toFixed(1)} -> ${saw5.toFixed(1)}`);
    const fl = (tier) => dmgFrom('flamethrower', tier, (w, z) => { p.flameDmgT = 0; g.fire.stream(p); z.burn = null; });
    const f0 = fl(0), f5 = fl(5);
    check('the flamethrower reads the tier', f0 > 0 && near(f5 / f0, ATT.tierStats({ id: 'flamethrower', def: WS.WEAPON_DEFS.flamethrower }, 5).damage, 0.1), `${f0.toFixed(1)} -> ${f5.toFixed(1)} (whole points)`);
    const w = gun('rpg'); w.tier = 5; ATT.refresh(w);
    const n0 = g.projectiles.list.length;
    g.launchFrom(p, 'rocket');
    const pr = g.projectiles.list[g.projectiles.list.length - 1];
    check('a rocket carries the launcher\'s tier', g.projectiles.list.length === n0 + 1 && near(pr.dmgK, ATT.tierStats(w, 5).damage, 1e-9), String(pr?.dmgK));
    g.projectiles.clear();
    return false;
  });

  // ---------------------------------------------------------------- bots forge at the end of a break; the HUD; the buy menu
  steps.push(async () => {
    newRun({ allies: 3 });
    const bots = squad().filter((q) => q.isBot);
    for (const b of bots) { b.money = 30000; if (!b.weapons[1]) g.giveWeapon(b, 'm4a1', { select: true }); }
    Z().nextWaveAt = g.time + 2;
    rec = [];
    ticks(250);
    const tiers = bots.map((b) => (b.weapons[1] || b.weapons[2])?.tier | 0);
    check(`bots forge their main gun near a break's end (up to Tier ${Z().diff.forge.botTier} on Normal)`, tiers.every((t) => t >= 1 && t <= Z().diff.forge.botTier) && of('forge', (e) => e.player?.isBot).length >= bots.length, tiers.join(','));
    // the HUD badge
    freezeBots();
    Z().state = 'break'; Z().nextWaveAt = g.time + 9999;
    clearZ();
    const p = me();
    p.money = 50000;
    const w = gun('ak47');
    for (const n of [1, 2, 3, 4, 5]) g.rounds.buy(p, 'tier_' + n);
    g.rounds.buy(p, 'round_cryo');
    const HS = await import('/src/game/hudstate.js');
    const s = HS.buildHudState(g);
    check('the HUD knows the gun in hand: Tier V, Cryo', s.forge && s.forge.tier === 5 && s.forge.round === 'cryo');
    void w;
    // the buy menu: the Forge page (the Upgrades page has 9 items), its title names the gun and its tier
    const BD = await import('/src/ui/menu/buydata.js');
    check('buy menu: Weapon Forge... on Upgrades (9 items), 5 tiers + Elemental Rounds..., 5 rounds', BD.MENU.upgrade.ALL.length <= 9 && BD.MENU.upgrade.ALL.includes('forge') && BD.MENU.forge.ALL.length === 6 && BD.MENU.forgerounds.ALL.length === 5 && BD.SUBPAGES.forge.forge && BD.ITEMS.tier_5.skin === 'forge5');
    check('the page title names the gun and its tier', ATT.targetName(p, 'forge') === 'AK-47 (Tier V)' || /\(Tier V\)/.test(ATT.targetName(p, 'forge') || ''), ATT.targetName(p, 'forge'));
    // screenshot: the forged AK, frozen zombies, the badge
    faceOpen(p);
    const z1 = zombieAt(170, -30), z2 = zombieAt(200, 40);
    alwaysProc();
    shoot(z1, 5); wait(0.35); shoot(z1, 5);
    shoot(z2, 5); wait(0.35); shoot(z2, 5);
    normalProc();
    aim(p, [z1.pm.origin[0], z1.pm.origin[1], z1.pm.origin[2] + 30]);
    for (let i = 0; i < 6; i++) g.frame(0.03);
    return { shot: true };
  });
  steps.push(async () => {
    const p = me();
    // the menu, open on the Forge page
    g.menus?.showBuyMenu?.({ money: p.money, team: 'CT' }, { allWeapons: true, itemState: (id) => Z().economy.menuState(p, id), upgradeTarget: (sk) => ATT.targetName(p, sk), banner: Z().economy.menuBanner(p) });
    g.menus?.buyCategory?.(9);
    const btn = [...document.querySelectorAll('.vg-btn')].find((b) => /Weapon Forge/.test(b.textContent));
    btn?.click();
    const title = document.querySelector('.vg-panel .vg-title')?.textContent || '';
    check('the Forge page opens, titled with the gun', /WEAPON FORGE/.test(title) && /AK-47/.test(title), title);
    const hover = [...document.querySelectorAll('.vg-btn')].find((b) => /Elemental/.test(b.textContent));
    hover?.click();
    const r = [...document.querySelectorAll('.vg-btn')].find((b) => /Vampiric/.test(b.textContent));
    r?.dispatchEvent(new MouseEvent('mouseenter'));
    return { shot: true };
  });
  steps.push(async () => {
    g.menus?._closeVg?.(true);
    thawBots();
    return false;
  });

  // ---------------------------------------------------------------- Normal, wave 25: a Tier V Deagle against a stock AK-47 (real bullets)
  steps.push(async () => {
    newRun();
    freezeBots();
    const p = me();
    const ZD = await import('/src/game/zdiff.js');
    const hp = ZD.waveStats(25, { diff: Z().diff }).health;
    // a steady player: the AK in 3-round bursts, the Deagle tapped as fast as it settles; body shots at ~250 u
    const run = (id, tier, round, secs) => {
      clearZ();
      const open = faceOpen(p);
      const w = gun(id);
      w.tier = tier; w.round = round; w.att = {}; ATT.refresh(w); w.clip = w.clipMax;
      w.ammo = 9999;
      let z = null, shots = 0, last = null, burst = 0, pause = 0, kills = 0;
      const off = Z().events.on('kill', (e) => { if (e.attacker === p && e.zombie) kills++; });
      const build = g.buildLocalCmd;
      let fire = 0;
      g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: fire });
      const t0 = g.time, auto = w.def.kind !== 'pistol';
      while (g.time - t0 < secs) {
        if (!z || !z.alive) { z = zombieAt(Math.min(open - 30, 230 + Math.random() * 60), (Math.random() - 0.5) * 80, hp); pause = g.time + 0.3; }
        if (w.ammo < 100) w.ammo = 9999;
        aim(p, chest(z));
        if (g.time < pause) fire = 0;
        else if (auto) { fire = 1; if (burst >= 3) { burst = 0; pause = g.time + 0.22; fire = 0; } }
        else fire = fire ? 0 : 1; // (a semi-auto: press, release)
        g.frame(0.01);
        if (w.lastShot !== last) { last = w.lastShot; shots++; burst++; }
      }
      g.buildLocalCmd = build;
      off();
      clearZ();
      return { kills, shots, kpm: kills / secs * 60 };
    };
    const secs = 30;
    const ak = run('ak47', 0, null, secs);
    const d0 = run('deagle', 0, null, secs);
    const d5 = run('deagle', 5, null, secs);
    const d5i = run('deagle', 5, 'incendiary', secs);
    const d5x = run('deagle', 5, 'explosive', secs);
    info(`wave 25 commons (${hp} HP), body shots, ${secs} s: stock AK-47 ${ak.kpm.toFixed(0)} kills/min, stock Deagle ${d0.kpm.toFixed(0)}, Tier V Deagle ${d5.kpm.toFixed(0)}, +Incendiary ${d5i.kpm.toFixed(0)}, +Explosive ${d5x.kpm.toFixed(0)}`);
    check('a Tier V Deagle is viable at wave 25 on Normal: it kills at least as fast as a stock AK-47 (and 2x a stock Deagle)', d5.kpm >= ak.kpm * 0.95 && d5.kpm >= d0.kpm * 2, `${d5.kpm.toFixed(0)} vs AK ${ak.kpm.toFixed(0)}, stock ${d0.kpm.toFixed(0)}`);
    thawBots();
    restore();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false;
    let r = null;
    try { r = await steps[i++](); done = r === true; } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; restore(); }
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, shot: !!(r && r.shot) };
  };
})();
