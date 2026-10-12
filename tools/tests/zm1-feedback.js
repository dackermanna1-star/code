// Zombie survival, Milestone 1.5 (feedback): hit markers and hit sounds, the kill-feed filter,
// the quiet counter and streaks, the centre-message channels, the trauma camera shake, hit-stop,
// the low-HP vignette and heartbeat, pain direction for fire / acid, damage numbers.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-feedback.js /tmp/zfb
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&team=t&bots=5&freeze=2" tools/tests/zm1-feedback.js /tmp/zfbc
// (the second, classic CS: checks the kill feed, centre print and pain direction are as before)
// Prints "[sim] PASS ..." / "[sim] FAIL ...". Screenshots: _0 markers + feed + quiet counter +
// centre channels, _1 a streak callout, _2 the low-HP vignette, _3 damage numbers.
// Runs on Sandbox with the squad in god mode and the bots holding fire; every hit is dealt
// with damagePlayer (plus one burst of real gunfire), so it doesn't depend on the economy,
// downed or wave tuning.
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const F = () => g.zombies.feedback;
  const H = () => g.hud;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const DEG = Math.PI / 180;
  // every sound asked for (the bank may be muted headless: the call is what counts)
  const played = [];
  const play0 = g.sound.play;
  g.sound.play = function (name, o) { played.push(name); return play0.call(this, name, o); };
  const heard = (name) => played.filter((n) => n === name).length;
  let HS = null;
  const hud = () => HS.buildHudState(g, { settings: g.settings });
  const streaks = [];
  let subscribed = false;
  const lastRow = () => H().kills[H().kills.length - 1] || null;

  function newRun(opts) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
  }
  /** Face the most open direction (so zombies put in front are in plain sight). */
  function faceOpen(p) {
    const e = p.eyePos();
    let best = 0, bd = -1;
    for (let a = 0; a < 360; a += 15) {
      let d = 0;
      for (const r of [120, 200, 280, 360]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 30])) d = r; else break; }
      if (d > bd) { bd = d; best = a; }
    }
    p.pm.angles[1] = best; p.pm.angles[0] = 6;
    return best;
  }
  /** A zombie dist units in front of you (side: to the left). */
  function zombieAt(dist, side = 0) {
    const p = g.local, o = p.pm.origin, y = p.pm.angles[1] * DEG;
    const at = [o[0] + Math.cos(y) * dist - Math.sin(y) * side, o[1] + Math.sin(y) * dist + Math.cos(y) * side, o[2]];
    Z().spawnZombie({ at });
    let z = null, bd = 1e9;
    for (const q of Z().pool) { if (!q.alive || q.special) continue; const d = Math.hypot(q.pm.origin[0] - at[0], q.pm.origin[1] - at[1]); if (d < bd) { bd = d; z = q; } }
    if (z) { z.zSpeed = 0; z.nextAttack = 1e9; } // (stands there)
    return z;
  }
  const chest = (q) => [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 14];
  const dirTo = (q) => { const e = g.local.eyePos(), c = chest(q), l = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]) || 1; return [(c[0] - e[0]) / l, (c[1] - e[1]) / l, (c[2] - e[2]) / l]; };
  const shoot = (q, dmg, hg = 2, weapon = 'ak47', shot = ++g.shotSeq) => g.damagePlayer(q, g.local, dmg, hg, weapon, dirTo(q), chest(q), { shot });
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };

  const steps = [];

  // ---------------------------------------------------------------- setup, sounds
  steps.push(async () => {
    HS = await import('/src/game/hudstate.js');
    newRun({ zdiff: 'sandbox' });
    con('sv_cheats 1');
    con('zm_wave 3');
    con('zm_god_squad');
    g.bots.think = () => {}; // (the bots hold fire: every kill here is yours)
    Z().nextSpawn = 1e9; // (no wave spawns: only the zombies the test puts down)
    Z().clearHorde();
    if (!subscribed) { subscribed = true; Z().events.on('streak', (e) => streaks.push({ label: e.label, n: e.n, player: e.player?.name })); }
    const missing = ['hit_tick', 'hit_head', 'hit_kill', 'heartbeat'].filter((n) => !g.sound.bank?.get(n));
    check('hit sounds synthesized', !missing.length, missing.length ? 'missing ' + missing.join(', ') : 'hit_tick hit_head hit_kill heartbeat');
    check('damage numbers off by default', !g.settings.get('cl_damagenumbers'));
    return false;
  });

  // ---------------------------------------------------------------- markers, sounds, the feed filter
  steps.push(async () => {
    const p = g.local;
    faceOpen(p);
    const z = zombieAt(170);
    check('a zombie in front', !!z);
    played.length = 0;
    shoot(z, 5);
    let s = hud();
    check('body hit: white marker', s.hits.length === 1 && s.hits[0].kind === 0 && s.hits[0].heavy === 0, JSON.stringify(s.hits));
    check('body hit: tick sound', heard('hit_tick') === 1 && heard('hit_head') === 0);
    shoot(z, 5, 1);
    s = hud();
    check('head hit: gold marker', s.hits.length === 1 && s.hits[0].kind === 1, JSON.stringify(s.hits));
    check('head hit: tink sound', heard('hit_head') === 1);
    ticks(10);
    played.length = 0;
    const sid = ++g.shotSeq;
    for (let i = 0; i < 6; i++) shoot(z, 1, 2, 'm3', sid); // a shotgun's pellets
    check('pellets: one tick', heard('hit_tick') === 1, `${heard('hit_tick')} ticks`);
    // fire still burning on them: no marker, no tick
    ticks(60);
    played.length = 0;
    g.fire.hurt(z, p, 2, 'molotov', 'fire');
    s = hud();
    check('burning: no marker or tick', s.hits.length === 0 && heard('hit_tick') === 0, `${s.hits.length} markers`);
    // a kill: red X, the kill sound, and a common zombie stays out of the feed
    const rows = H().kills.length, kills0 = Z().kills;
    played.length = 0;
    shoot(z, 1e4, 1);
    s = hud();
    const x = s.hits.find((h) => h.kind === 2);
    check('kill: red X', !!x && x.heavy === 0, JSON.stringify(s.hits));
    check('kill: kill sound', heard('hit_kill') === 1 && heard('hit_tick') === 0);
    check('common kill: not in the feed', H().kills.length === rows && Z().kills === kills0 + 1, `${H().kills.length} rows (was ${rows})`);
    check('common kill: quiet counter', s.killTally && s.killTally.n === 1 && s.killTally.mine === 1, JSON.stringify(s.killTally));
    // a special: heavier marker, its kill stops the world for a beat and makes the feed
    ticks(60);
    const hunter = (con('zm_special hunter near'), Z().pool.find((q) => q.alive && q.special === 'hunter'));
    check('a hunter', !!hunter);
    hunter.pm.origin[0] = z.pm.origin[0]; hunter.pm.origin[1] = z.pm.origin[1]; hunter.pm.origin[2] = z.pm.origin[2];
    shoot(hunter, 5);
    s = hud();
    check('special hit: heavier marker', s.hits[0] && s.hits[0].heavy === 1, JSON.stringify(s.hits));
    g.hitStop = 0;
    shoot(hunter, 1e4);
    s = hud();
    const hx = s.hits.find((h) => h.kind === 2);
    check('special kill: heavy X', !!hx && hx.heavy === 1);
    check('special kill: hit-stop', g.hitStop >= 0.04 && g.hitStop <= 0.07, g.hitStop.toFixed(3));
    check('special kill: in the feed', lastRow() && lastRow().victim === 'Hunter' && lastRow().attacker === p.name, JSON.stringify(lastRow()));
    // a boss: heaviest marker; its death is a hit-stop too (whoever kills it)
    ticks(40);
    con('zm_boss butcher');
    const b = g.bosses.boss;
    check('a boss', !!b);
    shoot(b, 40);
    s = hud();
    check('boss hit: heaviest marker', s.hits[0] && s.hits[0].heavy === 2, JSON.stringify(s.hits));
    g.hitStop = 0;
    g.damagePlayer(b, squad().find((q) => q.isBot), 1e7, 2, 'm249', [1, 0, 0]);
    check('boss death: hit-stop', g.hitStop >= 0.06, g.hitStop.toFixed(3));
    check('boss kill: in the feed', lastRow() && lastRow().victim === b.name, JSON.stringify(lastRow()));
    g.hitStop = 0;
    return false;
  });

  // real gunfire: markers and ticks come off actual bullets
  steps.push(async () => {
    const p = g.local;
    ticks(100);
    faceOpen(p);
    const z = zombieAt(200);
    z.health = z.maxHealth = 1e5;
    g.rounds.buy(p, 'ak47');
    if (p.weapons[1]) g.selectWeapon(p, p.weapons[1], true);
    const build = g.buildLocalCmd;
    g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 1 });
    played.length = 0;
    const m0 = F().mark.t;
    for (let i = 0; i < 200 && F().mark.t === m0; i++) { aim(p, chest(z)); g.frame(0.02); }
    g.buildLocalCmd = build;
    check('real bullets: hit marker and tick', F().mark.t > m0 && heard('hit_tick') + heard('hit_head') >= 1, `${heard('hit_tick')} ticks, ${heard('hit_head')} tinks`);
    Z().despawn?.(z);
    return false;
  });

  // ---------------------------------------------------------------- streaks, teammates in the feed
  steps.push(async () => {
    ticks(150);
    const p = g.local;
    faceOpen(p);
    streaks.length = 0;
    g.hitStop = 0;
    const zs = [zombieAt(160, -60), zombieAt(180, 0), zombieAt(160, 60)];
    check('three zombies', zs.every(Boolean));
    for (const z of zs) shoot(z, 1e4);
    ticks(1);
    let s = hud();
    check('three quick kills: TRIPLE', streaks.length === 1 && streaks[0].label === 'TRIPLE' && streaks[0].n === 3 && streaks[0].player === p.name, JSON.stringify(streaks));
    check('TRIPLE in the feed and under the crosshair', lastRow()?.label === 'TRIPLE' && s.streak?.label === 'TRIPLE');
    check('TRIPLE: hit-stop', g.hitStop > 0.03, g.hitStop.toFixed(3));
    g.hitStop = 0;
    ticks(20);
    shoot(zombieAt(170), 1e4);
    ticks(1);
    check('a fourth: QUAD', streaks.length === 2 && streaks[1].label === 'QUAD', JSON.stringify(streaks));
    g.paused = true; // (hold the frame for the screenshot)
    return { shot: true };
  });

  steps.push(async () => {
    g.paused = false;
    ticks(150); // (the chain runs out)
    streaks.length = 0;
    const zs = [zombieAt(150, -70), zombieAt(170, -25), zombieAt(190, 25), zombieAt(210, 70)];
    const sid = ++g.shotSeq;
    for (const z of zs) shoot(z, 1e4, 2, 'barrett', sid); // one round through all four
    ticks(1);
    check('one shot, four dead: COLLATERAL x4', streaks.length === 1 && streaks[0].label === 'COLLATERAL x4' && streaks[0].n === 4, JSON.stringify(streaks));
    ticks(150);
    streaks.length = 0;
    shoot(zombieAt(160, -40), 1e4); shoot(zombieAt(160, 40), 1e4);
    ticks(1);
    check('two kills: no callout', streaks.length === 0, JSON.stringify(streaks));
    // teammates: a down and a death go in the feed
    const bot = squad().find((q) => q.isBot && q.alive);
    const z = zombieAt(200);
    Z().events.mode('down', { player: bot, attacker: z, bleedOut: 30, downs: 1 });
    check('teammate down: in the feed', lastRow() && lastRow().victim === bot.name && lastRow().suffix === 'DOWN' && lastRow().weapon === 'zombie', JSON.stringify(lastRow()));
    g.killPlayer(bot, z, 'zombie', false);
    check('teammate death: in the feed', lastRow() && lastRow().victim === bot.name && !lastRow().suffix, JSON.stringify(lastRow()));
    return false;
  });

  // ---------------------------------------------------------------- centre channels
  steps.push(async () => {
    const h = H();
    h.centerPrint('', 0);
    check('the HUD knows it is zombie survival', h.centerQueued === true);
    h.centerPrint('Wave 7 cleared!\n+$2250. Next wave in 15 seconds.', 5);
    h.centerPrint('You have insufficient funds!', 2);
    check('a buy message does not wipe "Wave cleared"', h.centerQ.alert.length === 1 && /cleared/.test(h.centerQ.alert[0].text) && h.centerQ.info.length === 1 && /funds/.test(h.centerQ.info[0].text));
    h.centerPrint('M4A1 fitted with a red dot', 2);
    check('the latest confirmation replaces the last', h.centerQ.info.length === 1 && /red dot/.test(h.centerQ.info[0].text) && h.centerQ.alert.length === 1);
    h.centerPrint('Wave 7 cleared!\n+$2250. Next wave in 15 seconds.', 5);
    check('the same alert again: no duplicate', h.centerQ.alert.length === 1);
    h.centerPrint('BUTCHER IS DEAD!\nfull health and armour.', 5);
    check('alerts stack', h.centerQ.alert.length === 2 && /cleared/.test(h.centerQ.alert[0].text) && /BUTCHER/.test(h.centerQ.alert[1].text));
    h.centerPrint('Stunned!', 1.5, 'alert');
    h.centerPrint('GAME OVER', 8);
    check('at most 3 alerts, the oldest goes', h.centerQ.alert.length === 3 && !/cleared/.test(h.centerQ.alert[0].text) && h.centerQ.alert[1].text === 'Stunned!');
    h.centerPrint('', 0);
    check('an empty print clears them', !h.centerQ.alert.length && !h.centerQ.info.length && !h.center);
    // classic CS: GoldSrc's one slot, unchanged
    h.centerQueued = false;
    h.centerPrint('The bomb has been planted!', 3);
    h.centerPrint('Defusing Bomb Without Defuse Kit', 2);
    check('classic: one slot, the last print wins', h.center && h.center.lines[0] === 'Defusing Bomb Without Defuse Kit' && !h.centerQ.alert.length && !h.centerQ.info.length);
    h.centerPrint('', 0);
    h.centerQueued = true;
    // the screenshot: an alert, a confirmation, a head marker on a zombie, the feed and the quiet counter
    const p = g.local;
    ticks(30);
    faceOpen(p);
    const z1 = zombieAt(190, 35), z2 = zombieAt(230, -50);
    shoot(z2, 1e4); // (the quiet counter)
    ticks(60); // (its X fades)
    h.centerPrint(`Wave ${Z().wave} cleared!\n+$1250, +10 health. Next wave in 15 seconds.`, 5);
    h.centerPrint('You patched up Bot (+25)', 2);
    shoot(z1, 6, 1);
    const s = hud();
    check('screenshot state', s.hits.length === 1 && s.hits[0].kind === 1 && s.killTally && s.killTally.n >= 1, JSON.stringify(s.hits));
    g.paused = true;
    return { shot: true };
  });

  // ---------------------------------------------------------------- camera shake, hit-stop
  steps.push(async () => {
    g.paused = false;
    g.shaker.clear();
    const p = g.local;
    g.camPos = p.eyePos();
    g.shakeAt(p.eyePos(), 8);
    const tr0 = g.shaker.trauma;
    check('a blast at your feet: trauma', tr0 > 0.6 && tr0 <= 1, tr0.toFixed(2));
    const ys = [];
    for (let i = 0; i < 100; i++) ys.push(g.shakeOffset(1 / 60)[0]);
    let peak = 0, d1 = 0, d2 = 0;
    for (let i = 0; i < ys.length; i++) {
      peak = Math.max(peak, Math.abs(ys[i]));
      if (i > 0) d1 += Math.abs(ys[i] - ys[i - 1]);
      if (i > 1) d2 += Math.abs(ys[i] - 2 * ys[i - 1] + ys[i - 2]);
    }
    check('shake strength', peak > 0.4 && peak < 2.6, `peak ${peak.toFixed(2)} deg`);
    check('shake is smooth (no random jumps)', d2 / d1 < 1, `curvature/slope ${(d2 / d1).toFixed(2)} (white noise ~1.6)`);
    const early = Math.max(...ys.slice(0, 15).map(Math.abs)), late = Math.max(...ys.slice(45, 60).map(Math.abs));
    check('shake eases out', late < early * 0.5 && ys.slice(-20).every((v) => v === 0) && g.shaker.trauma === 0, `early ${early.toFixed(2)} late ${late.toFixed(2)}`);
    g.shaker.clear();
    g.shakeAt([p.pm.origin[0] + 1300, p.pm.origin[1], p.pm.origin[2]], 8);
    check('far away: a faint shake', g.shaker.trauma > 0 && g.shaker.trauma < 0.3, g.shaker.trauma.toFixed(2));
    g.shaker.clear();
    g.shake = { until: g.time + 1, amp: 12 }; // (an old-style write)
    g.shakeOffset(1 / 60);
    check('old-style g.shake writes still shake', g.shake === null && g.shaker.trauma > 0.5);
    g.shaker.clear();
    g.addShake(12, 1.5);
    check('addShake', g.shaker.trauma > 0.5 && Math.abs(g.shaker.trauma / g.shaker.rate - 1.5) < 0.01);
    g.shaker.clear();
    // hit-stop: the world all but stops for the stop's length (real time), then runs on
    g.hitStop = 0.06;
    const t0 = g.time;
    g.frame(0.03); g.frame(0.03);
    const held = g.time - t0;
    check('hit-stop holds the world', held <= 0.011 && g.hitStop === 0, `world moved ${(held * 1000).toFixed(0)} ms in 60 ms`);
    const t1 = g.time;
    g.frame(0.05);
    check('then it runs on', Math.abs(g.time - t1 - 0.05) <= 0.011, `${((g.time - t1) * 1000).toFixed(0)} ms in 50 ms`);
    // a boss breaking (stunned / enraged / core exposed): a beat of hit-stop
    con('zm_boss butcher');
    ticks(2);
    g.hitStop = 0;
    const B = g.bosses.boss.boss;
    B.stunUntil = g.time + 2;
    ticks(1);
    check('boss stunned: hit-stop', g.hitStop > 0.03, g.hitStop.toFixed(3));
    g.hitStop = 0;
    B.enraged = true;
    ticks(1);
    check('boss enraged: hit-stop', g.hitStop > 0.03, g.hitStop.toFixed(3));
    g.bosses.despawn();
    g.hitStop = 0;
    return false;
  });

  // ---------------------------------------------------------------- low health, pain direction
  steps.push(async () => {
    const p = g.local;
    p.health = 20;
    played.length = 0;
    ticks(5);
    check('low health: heartbeat', heard('heartbeat') === 1);
    ticks(150);
    check('...and again, about once a second', heard('heartbeat') === 2 || heard('heartbeat') === 3, `${heard('heartbeat')} beats in 1.5 s`);
    p.health = 100;
    played.length = 0;
    ticks(150);
    check('healthy: no heartbeat', heard('heartbeat') === 0);
    // hurt: the edges flash red; and pain points at fire / acid, not at whoever threw it
    p.god = false; p.armor = 0;
    p.pm.angles[1] = 0;
    const o = p.pm.origin;
    const z = zombieAt(300);
    z.pm.origin[0] = o[0] + 300; z.pm.origin[1] = o[1]; // (dead ahead)
    g.damageIndicators = [];
    const ind = () => g.damageIndicators.map((d) => d.dir).join(',');
    g.fire.hurt(p, z, 1, 'acid', 'acid', [o[0], o[1] - 200, o[2]]); // a pool off to the right
    check('acid: points at the pool', ind() === 'right', ind());
    check('hurt: a red flash', F().hurtNow(g.time) > 0.2, F().hurtNow(g.time).toFixed(2));
    g.fire.hurt(p, z, 1, 'molotov', 'fire'); // burning: no telling
    check('burning: no direction', ind() === 'right', ind());
    g.damagePlayer(p, z, 1, 0, 'fireball', [0, -1, 0.3], null, { blast: true, fire: true }); // a blast from the left
    check('a fire blast: points at it', ind() === 'right,left', ind());
    g.damagePlayer(p, z, 1, 2, 'zombie', [-1, 0, 0], null); // a claw from in front
    check('a claw: points at the zombie', ind() === 'right,left,front', ind());
    Z().despawn?.(z);
    // the screenshot: nearly dead, the red closes in with the heartbeat
    p.health = 12;
    ticks(1);
    played.length = 0;
    F().nextBeat = 0;
    ticks(3);
    p.god = true;
    faceOpen(p);
    g.paused = true;
    return { shot: true };
  });

  // ---------------------------------------------------------------- damage numbers
  steps.push(async () => {
    g.paused = false;
    const p = g.local;
    p.health = 100;
    g.settings.set('cl_damagenumbers', 1);
    faceOpen(p);
    ticks(80);
    const z = zombieAt(180), z2 = zombieAt(240, 60);
    const hp0 = z.health;
    shoot(z, 23, 1); // (x4 for the head)
    shoot(z, 10, 2);
    const n = F().nums.find((q) => q.victim === z && g.time - q.t < 0.5);
    check('damage numbers: hits add up', n && Math.round(n.dmg) === Math.round(hp0 - z.health) && n.dmg > 33 && n.kind === 1, n ? `${Math.round(n.dmg)} (health ${hp0} -> ${z.health}) kind ${n.kind}` : 'none');
    shoot(z2, 1e4, 2);
    const n2 = F().nums.find((q) => q.victim === z2 && g.time - q.t < 0.5);
    check('damage numbers: a kill shows red', n2 && n2.kind === 2 && n2.dmg > 0, n2 ? `${Math.round(n2.dmg)} kind ${n2.kind}` : 'none');
    g.paused = true;
    return { shot: true };
  });

  steps.push(async () => {
    g.paused = false;
    g.settings.set('cl_damagenumbers', 0);
    const z = zombieAt(180);
    const used = F().nums.filter((q) => g.time - q.t < 0.5).length;
    shoot(z, 7);
    check('damage numbers off: none', F().nums.filter((q) => g.time - q.t < 0.5).length === used);
    // a new run starts clean
    newRun({ zdiff: 'sandbox' });
    const s = hud();
    check('a new run resets', s.hits.length === 0 && !s.streak && !s.killTally && g.hitStop === 0 && F().chain === 0);
    g.sound.play = play0;
    return true;
  });

  // ---------------------------------------------------------------- classic CS: nothing changed
  const classic = [];
  classic.push(async () => {
    HS = await import('/src/game/hudstate.js');
    const h = H(), p = g.local;
    check('classic: centre print is the one GoldSrc slot', h.centerQueued === false);
    h.centerPrint('The bomb has been planted!', 3);
    h.centerPrint('Defusing Bomb Without Defuse Kit', 2);
    check('classic: the last print wins', h.center?.lines[0] === 'Defusing Bomb Without Defuse Kit' && !h.centerQ.alert.length && !h.centerQ.info.length);
    const s = hud();
    check('classic: no zombie HUD state', s.hits === undefined && s.killTally === undefined && s.streak === undefined);
    const foe = g.players.find((q) => q.alive && q.team !== p.team && q.team !== 'SPEC');
    const rows = h.kills.length;
    g.hitStop = 0;
    g.killPlayer(foe, p, 'ak47', true);
    const r = lastRow();
    check('classic: every kill in the feed', h.kills.length === Math.min(4, rows + 1) && r.victim === foe.name && r.attacker === p.name && r.headshot && !r.label && !r.suffix, JSON.stringify(r));
    check('classic: no hit-stop', g.hitStop === 0);
    // pain points at the attacker
    const foe2 = g.players.find((q) => q.alive && q.team !== p.team && q.team !== 'SPEC');
    p.god = false;
    p.pm.angles[1] = 0;
    foe2.pm.origin[0] = p.pm.origin[0] - 300; foe2.pm.origin[1] = p.pm.origin[1];
    g.damageIndicators = [];
    g.damagePlayer(p, foe2, 1, 2, 'ak47', [1, 0, 0], null);
    check('classic: pain direction', g.damageIndicators.map((d) => d.dir).join() === 'back', g.damageIndicators.map((d) => d.dir).join());
    p.god = true;
    g.shaker.clear();
    g.camPos = p.eyePos();
    g.shakeAt(p.eyePos(), 6);
    check('classic: grenades still shake the view', g.shaker.trauma > 0.4 && Math.abs(g.shakeOffset(1 / 60)[0]) >= 0);
    g.shaker.clear();
    h.centerPrint('Terrorists Win!', 5);
    return { shot: true };
  });
  classic.push(async () => {
    g.sound.play = play0;
    return true;
  });

  const run = g.zombies.enabled ? steps : classic;
  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r = false;
    try { r = await run[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; }
    const done = r === true || i >= run.length;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, shot: !!(r && r.shot) };
  };
})();
