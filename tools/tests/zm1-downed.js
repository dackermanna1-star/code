// Zombie survival, Milestone 1.3: downed, revive, bleed-out, respawn, squad wipe, Second Wind.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-downed.js /tmp/zm1d
// Prints "[sim] PASS ..." / "[sim] FAIL ...", and saves one screenshot (you down, a bot down
// in view). Each scenario starts a fresh run and stops the horde from spawning or clearing
// (Z.bossAt held off), so nothing but the test touches the squad. The buying checks run in
// the break (Second Wind) and on Sandbox (guns mid-wave), so they hold under the economy.
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const bots = () => squad().filter((p) => p.isBot);
  let rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); busOff = Z().events.on('*', (e, type) => rec.push({ type, phase: e.phase, player: e.player?.name ?? e.victim?.name, by: e.by === undefined ? undefined : e.by?.name ?? null, bleedOut: e.bleedOut, downs: e.downs, wave: e.wave, zombie: e.zombie })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  // the local player's buttons (wbuttons: 1 attack, 8 use) and forward move
  const input = { fwd: 0, wb: 0 };
  const build0 = g.buildLocalCmd;
  g.buildLocalCmd = () => ({ forwardmove: input.fwd, sidemove: 0, upmove: 0, buttons: 0, wbuttons: input.wb });
  const CHEST = 2;

  /** A fresh zombie game like the menu's New Game (you on CT, bots filled in). */
  function newRun(opts) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    listen();
    con('sv_cheats 1');
  }
  /** Wave n with nobody else on the map: nothing spawns, and the wave doesn't clear on its own. */
  function quietWave(n) {
    con(`zm_wave ${n}`);
    quiet();
  }
  /** Everything off the map, and nothing more coming (clearHorde resets bossAt: hold it off again). */
  function quiet() {
    const z = Z();
    z.clearHorde();
    z.spawned = z.stats.count;
    z.bossAt = 1e9;
  }
  const down = (p, attacker = null) => { p.god = false; g.damagePlayer(p, attacker, 500, CHEST, 'zombie', [1, 0, 0]); return !!p.downed; };
  const hz = (p) => Math.hypot(p.pm.velocity[0], p.pm.velocity[1]);
  /** Put q on open floor dist units from p (looking along yaw first); turns p to face him. */
  let C = null, PM = null, tr = null;
  async function placeNear(q, p, dist) {
    C = C || await import('/src/engine/collision.js');
    PM = PM || await import('/src/engine/pmove.js');
    tr = tr || new C.TraceResult();
    const o = p.pm.origin, H = PM.HULL_STAND, y0 = p.pm.angles[1];
    for (let a = 0; a < 360; a += 20) {
      const r = (y0 + a) * Math.PI / 180;
      const e = [o[0] + Math.cos(r) * dist, o[1] + Math.sin(r) * dist, o[2]];
      g.collision.trace(o, e, H.mins, H.maxs, C.MASK_WORLD_PLAYER, tr);
      if (tr.fraction < 1 || tr.startsolid) continue;
      g.collision.trace(e, [e[0], e[1], e[2] - 40], H.mins, H.maxs, C.MASK_WORLD_PLAYER, tr);
      if (tr.fraction >= 1) continue; // (a drop)
      q.pm.origin = e.slice(); q.prevOrigin = e.slice(); q.pm.velocity = [0, 0, 0];
      p.pm.angles[1] = y0 + a; p.pm.angles[0] = 8;
      return true;
    }
    return false;
  }
  const steps = [];

  // ---------------------------------------------------------------- the pieces exist
  steps.push(async () => {
    const BD = await import('/src/ui/menu/buydata.js');
    const ZD = await import('/src/game/zdowned.js');
    const R = await import('/src/assets/snd/recipes.js');
    check('second wind in the buy menu', BD.ITEMS.perk_secondwind?.price === 2500 && BD.itemsFor('upgrade', 'ALL').includes('perk_secondwind') && ZD.SECOND_WIND.price === 2500);
    const names = ['downed', 'downed_breath', 'revive_up', 'second_wind'];
    check('sounds catalogued and synthesized', names.every((n) => R.SOUND_NAMES.includes(n) && R.DEFS[n] && g.sound?.bank?.get(n)), names.filter((n) => !g.sound?.bank?.get(n)).join(' '));
    const d = Z().diff.squad;
    check('squad table', ['bleedOut', 'bleedOutStep', 'bleedOutMin', 'reviveTime', 'reviveHealth'].every((k) => typeof d[k] === 'number'), JSON.stringify(d));
    return false;
  });

  // ---------------------------------------------------------------- solo: down, pistol only, crawl, no buying, Second Wind, then a wipe
  steps.push(async () => {
    newRun({ zdiff: 'sandbox', allies: 0 }); // (Sandbox: guns sell mid-wave, so only being down stops a buy)
    const p = g.local, S = Z().diff.squad;
    p.money = 16000;
    // the break before wave 1: Second Wind is for sale
    const m0 = p.money;
    const ok = g.rounds.buy(p, 'perk_secondwind');
    check('buy second wind', ok && p.secondWind === true && m0 - p.money === 2500, `ok=${ok} paid ${m0 - p.money}`);
    check('only one second wind', g.rounds.buy(p, 'perk_secondwind') === false && m0 - p.money === 2500);
    g.rounds.buy(p, 'ak47');
    const ak = p.weapons[1];
    quietWave(3);
    g.selectWeapon(p, ak, true);
    rec = [];
    // a zombie claws you to 0
    Z().spawnZombie({ near: p.pm.origin });
    const z = Z().pool.find((q) => q.alive);
    down(p, z);
    quiet();
    const D = p.downed;
    check('down instead of dead', p.alive && !!D && p.health === 100 && of('kill', (e) => !e.zombie).length === 0, `alive=${p.alive} downed=${!!D} hp=${p.health}`);
    check('down event', of('down', (e) => e.player === p.name && e.bleedOut === S.bleedOut && e.downs === 1).length === 1, JSON.stringify(of('down')));
    check('a second wind keeps a solo run going', Z().state === 'wave' && of('wipe').length === 0, Z().state);
    check('pistol out', p.active === p.weapons[2] && p.active.def.kind === 'pistol', p.active?.id);
    g.localCommand('slot1');
    g.localCommand('drop');
    check('pistol only (no switching, no dropping)', p.active === p.weapons[2] && p.weapons[1] === ak && !!p.weapons[2]);
    // no guns from the floor (Sandbox sells them mid-wave to anyone standing)
    const m1 = p.money;
    check('downed player cannot buy guns', g.rounds.buy(p, 'm4a1') === false && p.money === m1 && p.weapons[1] === ak && !g.inBuyZone(p));
    check('no medkit on someone down', g.healTarget(p, null) === null);
    // bleeding
    const h0 = p.health;
    ticks(100);
    const drop = h0 - p.health;
    check('bleeding out', Math.abs(drop - 100 / S.bleedOut) < 0.3, `-${drop.toFixed(2)} hp in 1 s (bleed-out ${S.bleedOut} s)`);
    // crawling: ducked and slow
    const o0 = p.pm.origin.slice();
    let vmax = 0;
    for (let k = 0; k < 4 && vmax < 40; k++) { // (a direction with no wall in the way)
      p.pm.angles[1] += 90 * k;
      input.fwd = 400;
      for (let i = 0; i < 100; i++) { g.tick(); vmax = Math.max(vmax, hz(p)); }
      input.fwd = 0;
    }
    const moved = Math.hypot(p.pm.origin[0] - o0[0], p.pm.origin[1] - o0[1]);
    check('crawl', p.pm.ducking && vmax < 90 && vmax > 40, `max ${vmax.toFixed(0)} u/s, moved ${moved.toFixed(0)} u, ducked ${p.pm.ducking}`);
    // still shooting
    const c0 = p.active.clip;
    for (let i = 0; i < 60; i++) { input.wb = i % 20 < 2 ? 1 : 0; g.tick(); }
    input.wb = 0;
    check('can shoot while down', p.active.clip < c0, `clip ${c0} -> ${p.active.clip}`);
    // HUD state
    const { buildHudState } = await import('/src/game/hudstate.js');
    let s = buildHudState(g, {});
    check('hud: bleed-out bar', s.downed && s.downed.secondWind && s.downed.left > 0 && s.downed.left <= S.bleedOut && s.downed.frac > 0 && s.downed.frac < 1 && !s.inBuyZone, JSON.stringify(s.downed));
    // Second Wind: hold use
    rec = [];
    input.wb = 8;
    ticks(Math.round(S.reviveTime * 50));
    s = buildHudState(g, {});
    const mid = s.downed && s.downed.self && s.downed.prog > 0.3 && s.downed.prog < 0.7;
    ticks(Math.round(S.reviveTime * 50) + 20);
    input.wb = 0;
    check('second wind progress', mid, JSON.stringify(s.downed));
    check('second wind gets you up', !p.downed && p.alive && p.health === S.reviveHealth && !p.secondWind && of('revive', (e) => e.player === p.name && e.by === null).length === 1, `downed=${!!p.downed} hp=${p.health} sw=${p.secondWind}`);
    check('your gun back', p.active === ak, p.active?.id);
    ticks(10);
    // down again, a shorter bleed-out, and nobody left to help: the run is over
    rec = [];
    down(p);
    check('shorter bleed-out each time', of('down', (e) => e.downs === 2 && e.bleedOut === Math.max(S.bleedOutMin, S.bleedOut - S.bleedOutStep)).length === 1, JSON.stringify(of('down')));
    check('solo wipe ends the run', Z().state === 'over' && of('wipe').length === 1 && of('run', (e) => e.phase === 'over').length === 1, Z().state);
    return false;
  });

  // ---------------------------------------------------------------- a bot picks you up; zombies leave you for later
  steps.push(async () => {
    newRun({ allies: 2 });
    const p = g.local, S = Z().diff.squad;
    for (const b of bots()) b.god = true;
    quietWave(3);
    ticks(150); // (the bots come over)
    rec = [];
    down(p);
    check('down with bots up: no wipe', p.downed && Z().state === 'wave' && of('wipe').length === 0);
    // targeting: a common zombie right next to you goes for a bot on its feet instead; a hunter never picks you
    const b0 = bots()[0];
    const zz = (Z().spawnZombie({ near: p.pm.origin }), Z().pool.find((q) => q.alive && !q.special));
    zz.pm.origin = [p.pm.origin[0] + 40, p.pm.origin[1], p.pm.origin[2] + 18];
    zz.target = null;
    const dBot = Math.hypot(b0.pm.origin[0] - zz.pm.origin[0], b0.pm.origin[1] - zz.pm.origin[1]);
    const t1 = Z().pickTarget(zz, Z().humans(), g.time);
    check('zombies de-prioritise the downed', dBot > 460 || t1 !== p, `target ${t1?.name}, bot ${dBot.toFixed(0)} u away`);
    con('zm_special hunter near');
    const hunter = Z().pool.find((q) => q.alive && q.special === 'hunter');
    hunter.target = null;
    const th = Z().pickTarget(hunter, Z().humans(), g.time);
    check('hunters ignore the downed', hunter && th !== p && Z().downed.cost(hunter, p) === Infinity, `target ${th?.name}`);
    quiet();
    // a bot comes and holds use
    let t = 0, sawBy = false, bar = false;
    const { buildHudState } = await import('/src/game/hudstate.js');
    while (p.downed && t < 2500) {
      g.tick(); t++;
      if (p.downed?.by && p.downed.by.isBot) { sawBy = true; if (!bar) bar = !!buildHudState(g, {}).downed?.by; }
    }
    const rv = of('revive', (e) => e.player === p.name)[0];
    check('a bot revives you', !p.downed && rv && rv.by && bots().some((b) => b.name === rv.by), `after ${(t / 100).toFixed(1)} s by ${rv?.by}`);
    check('revive progress shown', sawBy && bar);
    check('back up with revive health', p.health === S.reviveHealth, `hp ${p.health}`);
    return false;
  });

  // ---------------------------------------------------------------- you revive a bot; bleeding out; respawning at the next wave
  steps.push(async () => {
    newRun({ allies: 2 });
    const p = g.local, S = Z().diff.squad;
    p.god = true;
    quietWave(4);
    const [b1, b2] = bots();
    b2.god = true;
    b2.bot.reviveClock = 1e9; // (this one leaves the reviving to you)
    // put b1 down right in front of you
    b1.bot.reviveClock = 1e9;
    down(b1);
    check('placed', await placeNear(b1, p, 50));
    const { buildHudState } = await import('/src/game/hudstate.js');
    ticks(2);
    const prompt = buildHudState(g, {}).revivePrompt;
    check('revive prompt', prompt === b1.name, String(prompt));
    rec = [];
    input.wb = 8;
    ticks(Math.round(S.reviveTime * 50));
    const s = buildHudState(g, {});
    const vx = hz(p);
    ticks(Math.round(S.reviveTime * 50) + 20);
    input.wb = 0;
    check('your revive progress bar', s.reviving && s.reviving.name === b1.name && s.reviving.prog > 0.3, JSON.stringify(s.reviving));
    check('a reviver holds still', vx < 1, `${vx.toFixed(1)} u/s`);
    check('you revive a bot', !b1.downed && b1.alive && b1.health === S.reviveHealth && of('revive', (e) => e.player === b1.name && e.by === p.name).length === 1);
    // letting go starts it over
    down(b1);
    await placeNear(b1, p, 50);
    input.wb = 8; ticks(100); input.wb = 0; ticks(3);
    check('letting go resets the revive', b1.downed && b1.downed.prog === 0 && !b1.downed.by && !p.reviving);
    // nobody comes: he bleeds out (a real death), the run goes on
    rec = [];
    b1.health = 0.01;
    ticks(3);
    check('bleed out = dead', !b1.alive && !b1.downed && of('bleedout', (e) => e.player === b1.name).length === 1 && of('kill', (e) => e.player === b1.name && !e.zombie).length === 1 && Z().state === 'wave');
    // you too: spectate while the bot holds on
    p.god = false;
    down(p);
    p.health = 0.01;
    ticks(3);
    check('you bleed out, the run goes on', !p.alive && !p.downed && Z().state === 'wave' && b2.alive, `state ${Z().state}`);
    // the next wave brings both back
    const w = Z().wave;
    rec = [];
    con('zm_skip');
    con('zm_skip');
    ticks(2);
    check('respawn at the next wave', Z().wave === w + 1 && p.alive && b1.alive && !p.downed && p.health === 100 && !!p.weapons[2] && of('respawn').length === 2 && of('respawn', (e) => e.player === p.name && e.wave === w + 1).length === 1, `wave ${Z().wave} you ${p.alive} bot ${b1.alive} respawns ${of('respawn').length}`);
    check('your view is back', g.viewTarget === p);
    return false;
  });

  // ---------------------------------------------------------------- the break picks everybody up; the whole squad down = game over
  steps.push(async () => {
    newRun({ allies: 2 });
    const p = g.local, S = Z().diff.squad, E = Z().diff.econ;
    quietWave(2);
    for (const b of bots()) { b.god = true; b.bot.reviveClock = 1e9; }
    down(p);
    rec = [];
    con('zm_skip'); // (the wave cleared)
    ticks(2);
    check('the break picks you up', !p.downed && p.alive && p.health === Math.min(100, S.reviveHealth + E.waveHeal) && of('revive', (e) => e.player === p.name && e.by === null).length === 1, `hp ${p.health}`);
    for (const b of bots()) b.god = false;
    down(p);
    check('no downs in a break', p.alive && !p.downed && p.health === 1 && Z().state === 'break', `hp ${p.health} state ${Z().state}`);
    for (const b of bots()) b.god = true;
    con('zm_skip');
    quiet();
    rec = [];
    const [b1, b2] = bots();
    down(b1); down(b2);
    check('two of three down: still on', Z().state === 'wave' && of('wipe').length === 0);
    down(p);
    check('squad wipe ends the run', Z().state === 'over' && of('wipe').length === 1 && of('run', (e) => e.phase === 'over').length === 1 && Z().survived === Z().wave - 1, `state ${Z().state} survived ${Z().survived}`);
    const hp = p.health;
    ticks(100);
    check('no bleeding after game over', p.health === hp && p.alive);
    return false;
  });

  // ---------------------------------------------------------------- a picture: you down, a bot down in front of you
  steps.push(async () => {
    newRun({ allies: 3 });
    const p = g.local;
    quietWave(3);
    const bs = bots();
    for (const b of bs) { b.god = true; b.bot.reviveClock = 1e9; }
    const b1 = bs[0];
    await placeNear(b1, p, 200);
    down(b1);
    down(p);
    p.health = 55;
    ticks(5);
    window.__downedShot = true;
    return { shot: true, wait: 300 };
  });

  steps.push(async () => {
    g.buildLocalCmd = build0;
    out.push(`[sim] downed: ${pass} passed, ${fail} failed`);
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    let r;
    try { r = await steps[i](); } catch (e) { check(`step ${i} threw`, false, e.stack || e.message); r = i === steps.length - 1; }
    i++;
    const log = out.splice(0).join('\n');
    const done = r === true || i >= steps.length;
    if (r && typeof r === 'object') return { log, ...r, done };
    return { log, done };
  };
})();
