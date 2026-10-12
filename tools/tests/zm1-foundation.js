// Zombie survival, Milestone 1 foundation: the event bus (runstats.js), the difficulty table
// (zdiff.js) and its New Game options, the record fixes and the zm_* console cheats.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-foundation.js /tmp/zm1
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=1&zdiff=hard&hardcore=1&breaklen=20&squad=0" tools/tests/zm1-foundation.js /tmp/zm1
// (with &zdiff= only the option plumbing is checked). Prints "[sim] PASS ..." / "[sim] FAIL ...".
// The event / cheat checks run on Sandbox (buy anything, any time) and the records checks wipe
// the whole squad, so they hold whatever the economy and downed rules become; the one check
// tied to today's numbers is "normal plays the tuned curve" (retuning Normal replaces it).
/* global location, localStorage, URLSearchParams */
(() => {
  const g = window.__game;
  const Q = new URLSearchParams(location.search);
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  // every event, copied (payloads are reused)
  let rec = [];
  const pick = (e) => ({ type: e.type, phase: e.phase, wave: e.wave, kind: e.kind, id: e.id, item: e.item, cost: e.cost, money: e.money, weapon: e.weapon, shot: e.shot, pellets: e.pellets, head: e.head, lethal: e.lethal, damage: e.damage, special: e.special, boss: e.boss, extra: e.extra, squad: e.squad, local: e.local, zombie: e.zombie, attacker: e.attacker?.name ?? e.shooter?.name ?? e.player?.name, victim: e.victim?.name, survived: e.survived, bonus: e.bonus, heal: e.heal, count: e.count });
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  let busOff = null;
  const listen = () => { busOff?.(); busOff = Z().events.on('*', (e) => rec.push(pick(e))); };

  /** A fresh zombie game like the menu's New Game (you on CT, bots filled in). */
  function newRun(opts) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
  }
  /** The whole squad dies (bots first): the run is over under any rule for when it ends. */
  const wipe = () => { for (const q of [...squad().filter((q) => q.isBot), g.local]) { q.god = false; if (q.alive) g.killPlayer(q, null, 'world', false); } };
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) * 180 / Math.PI; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI; };

  const steps = [];

  // ---------------------------------------------------------------- options only (&zdiff=...)
  if (Q.has('zdiff')) {
    steps.push(async () => {
      const d = Z().diff;
      check('url zdiff', d.id === Q.get('zdiff'), d.id);
      if (Q.has('hardcore')) check('url hardcore', d.hardcore === (Q.get('hardcore') !== '0') && (!d.hardcore || d.econ.waveHeal === 0), `hardcore=${d.hardcore} heal=${d.econ.waveHeal}`);
      if (Q.has('breaklen')) check('url breaklen', d.breakLen === +Q.get('breaklen'), String(d.breakLen));
      if (Q.has('squad')) check('url squad scaling', d.squadScaling === (Q.get('squad') !== '0'), String(d.squadScaling));
      const ZD = await import('/src/game/zdiff.js');
      con('sv_cheats 1');
      con('zm_wave 1');
      const want = ZD.waveStats(1, Z().waveOpts());
      check('stats follow the preset', Z().waveOpts().diff === d && Z().stats.health === want.health && Z().stats.count === want.count, `hp ${Z().stats.health}/${want.health} count ${Z().stats.count}/${want.count}`);
      ticks(100);
      con('zm_skip');
      check('break length used', Math.abs(Z().nextWaveAt - g.time - d.breakLen) < 0.05, `${(Z().nextWaveAt - g.time).toFixed(2)} vs ${d.breakLen}`);
      return true;
    });
  } else {
    // ---------------------------------------------------------------- the table
    steps.push(async () => {
      const ZD = await import('/src/game/zdiff.js');
      const d = Z().diff;
      check('default difficulty', d.id === 'normal' && !d.hardcore && d.squadScaling && d.breakLen === ZD.ZDIFF.normal.breakLen && d.firstBreak === ZD.ZDIFF.normal.firstBreak, `${d.id} ${d.breakLen}/${d.firstBreak}`);
      check('presets', ZD.ZDIFF_ORDER.join() === 'casual,normal,hard,nightmare,sandbox' && ZD.ZDIFF_ORDER.every((id) => ZD.ZDIFF[id].label && ZD.ZDIFF[id].blurb));
      const money = ZD.ZDIFF_ORDER.map((id) => ZD.ZDIFF[id].econ.startMoney).join();
      check('start money', money === '3000,2000,1500,1000,16000', money);
      check('sandbox rules', ZD.ZDIFF.sandbox.sandbox && ZD.ZDIFF.sandbox.econ.buyAnytime && ZD.ZDIFF.sandbox.econ.buyAnywhere && !ZD.ZDIFF.normal.econ.buyAnytime && ZD.ZDIFF.sandbox.horde === ZD.ZDIFF.normal.horde);
      const fields = ['econ.killPay.base', 'econ.killPay.perWave', 'econ.combatPremium', 'econ.waveHeal', 'horde.health', 'horde.damageCap', 'horde.speedCap', 'horde.runnerCap', 'horde.maxAliveCap', 'horde.lateGrowth', 'horde.botCrowd', 'specials.rate', 'specials.perKind', 'squad.bleedOut', 'squad.reviveTime', 'breakLen'];
      const missing = [];
      for (const id of ZD.ZDIFF_ORDER) for (const f of fields) if (typeof f.split('.').reduce((o, k) => o?.[k], ZD.ZDIFF[id]) !== 'number') missing.push(`${id}.${f}`);
      check('table fields', !missing.length, missing.join(' '));
      check('table frozen', Object.isFrozen(ZD.ZDIFF.normal.horde) && Object.isFrozen(Z().diff.econ));
      // Normal (and Sandbox) = the curve as tuned with squad scaling (1.4; tools/tests/zm1-scaling.js checks it in detail)
      let diffs = 0;
      for (let n = 1; n <= 60; n++) for (const crowd of [1, 3, 6]) { const a = ZD.waveStats(n, { diff: ZD.ZDIFF.normal, crowd }), b = ZD.waveStats(n, { diff: ZD.ZDIFF.sandbox, crowd }); for (const k in a) if (a[k] !== b[k]) diffs++; }
      const nw = (n, crowd = 1) => ZD.waveStats(n, { diff: ZD.ZDIFF.normal, crowd });
      const tuned = [nw(1), nw(10), nw(20, 5)].map((w) => `${w.count}/${w.maxAlive}/${w.health}/${w.damage}`).join(' ');
      check('normal plays the tuned curve', diffs === 0 && tuned === '4/5/80/12 23/9/190/22 58/16/230/24' && nw(10, 5).count > nw(10).count && nw(30).damage > nw(12).damage, `${diffs} sandbox differences; ${tuned}`);
      const h = (id, n) => ZD.waveStats(n, { diff: ZD.ZDIFF[id] });
      check('presets scale', h('casual', 10).health < h('normal', 10).health && h('normal', 10).health < h('hard', 10).health && h('hard', 10).health < h('nightmare', 10).health && h('nightmare', 25).damage > h('nightmare', 12).damage, `w10 hp ${['casual', 'normal', 'hard', 'nightmare'].map((id) => h(id, 10).health).join('/')}`);
      const o = ZD.zombieOptions({ zdiff: 'bogus', breakLen: '999', hardcore: 1, squadScaling: false });
      check('option defaults', o.zdiff === 'normal' && o.breakLen === 120 && o.hardcore && !o.squadScaling && ZD.zombieOptions({}).squadScaling && ZD.zombieOptions({}).breakLen === 0);
      const hc = ZD.resolveDiff(ZD.zombieOptions({ zdiff: 'sandbox', hardcore: true, breakLen: 30 }));
      check('hardcore folded in', hc.econ.waveHeal === 0 && !hc.econ.buyAnytime && hc.breakLen === 30 && ZD.ZDIFF.sandbox.econ.waveHeal === 25);
      return false;
    });

    // ---------------------------------------------------------------- events + cheats
    steps.push(async () => {
      rec = [];
      listen();
      newRun({ zdiff: 'sandbox' }); // ($16000, buy anything any time: these checks don't depend on the economy)
      check('run start event', of('run', (e) => e.phase === 'start').length === 1);
      check('cheats need sv_cheats', /sv_cheats/.test(con('zm_wave 2')) && Z().wave === 0);
      check('zm_status without cheats', /Sandbox/.test(con('zm_status')));
      con('sv_cheats 1');
      const r = con('zm_wave 3');
      check('zm_wave', Z().wave === 3 && Z().state === 'wave' && of('wave', (e) => e.phase === 'start' && e.wave === 3).length === 1, r);
      ticks(300);
      const r2 = con('zm_god_squad');
      check('zm_god_squad', squad().every((p) => p.god) && squad().length === 3, r2);
      // buying
      const p = g.local, m0 = p.money;
      rec = [];
      g.rounds.buy(p, 'ak47');
      const b = of('buy')[0];
      check('buy event', b && b.item === 'ak47' && b.cost === m0 - p.money && b.cost > 0 && b.money === p.money, JSON.stringify(b));
      g.rounds.buy(p, 'ak47'); // (already have one: no event)
      check('no buy event on a refused buy', of('buy').length === 1);
      return false;
    });

    // you shoot zombies with a real gun: shot / hit / kill, accuracy, kills
    steps.push(async () => {
      const p = g.local, Zm = Z();
      const think = g.bots.think, build = g.buildLocalCmd;
      g.bots.think = () => {}; // (the bots hold fire: these kills are yours)
      con('zm_wave 4');
      for (let i = 0; i < 3; i++) Zm.spawnZombie({ near: p.pm.origin });
      let firing = false;
      g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: firing ? 1 : 0 });
      g.selectWeapon(p, p.weapons[1], true);
      rec = [];
      const k0 = Zm.kills, s0 = Zm.squadKills;
      for (let i = 0; i < 1500 && Zm.kills - k0 < 3; i++) {
        let best = null, bd = 1e9;
        const e = p.eyePos();
        for (const z of Zm.pool) {
          if (!z.alive) continue;
          const c = [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 12];
          const d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
          if (d < bd && g.visible(e, c)) { bd = d; best = c; }
        }
        firing = !!best;
        if (best) aim(p, best);
        if (p.weapons[1] && p.weapons[1].clip === 0 && p.weapons[1].ammo < 30) g.rounds.buy(p, 'primammo');
        g.frame(0.02);
      }
      g.buildLocalCmd = build;
      g.bots.think = think;
      const shots = of('shot', (e) => e.attacker === p.name), hits = of('hit', (e) => e.attacker === p.name && e.shot > 0), kills = of('kill', (e) => e.local);
      check('shot events', shots.length > 0 && shots.every((e) => e.weapon === 'ak47' && e.pellets === 1), `${shots.length} shots`);
      check('hit events carry the shot id', hits.length > 0 && hits.every((e) => shots.some((s) => s.shot === e.shot)), `${hits.length} hits`);
      check('kill events (yours)', kills.length === Zm.kills - k0 && kills.length >= 1, `${kills.length} kills`);
      check('lethal hit before its kill', rec.findIndex((e) => e.type === 'hit' && e.lethal) < rec.findIndex((e) => e.type === 'kill' && e.local));
      const S = Zm.runStats;
      check('run stats', S.me.shots === shots.length && S.me.kills >= kills.length && S.me.shotsHit > 0 && S.accuracy() > 0 && S.accuracy() <= 1 && S.me.byWeapon.ak47 >= 1, `shots ${S.me.shots} on target ${S.me.shotsHit} acc ${(S.accuracy() * 100).toFixed(0)}% kills ${S.me.kills}`);
      check('squad kills count yours too', Zm.squadKills - s0 === Zm.kills - k0);
      // a bot's kill is the squad's, not yours
      const bot = squad().find((q) => q.isBot);
      const z = Zm.pool.find((q) => q.alive) || (Zm.spawnZombie({ near: p.pm.origin }) && Zm.pool.find((q) => q.alive));
      const k1 = Zm.kills, s1 = Zm.squadKills;
      rec = [];
      g.damagePlayer(z, bot, 1e6, 2, 'm4a1', [1, 0, 0]);
      check('a bot kill is not yours', Zm.kills === k1 && Zm.squadKills === s1 + 1 && of('kill', (e) => e.squad && !e.local).length === 1, `kills ${Zm.kills - k1} squad ${Zm.squadKills - s1}`);
      return false;
    });

    // payload reuse, nesting
    steps.push(async () => {
      const Zm = Z(), p = g.local, ev = Zm.events;
      const z = (Zm.spawnZombie({ near: p.pm.origin }), Zm.pool.find((q) => q.alive && !q.isBoss));
      const seen = [];
      let nested = null, outerAfter = null;
      const off = ev.on('hit', (e) => {
        seen.push(e);
        if (seen.length === 2 && !nested) {
          nested = true;
          const before = e.damage;
          g.damagePlayer(z, p, 3, 2, 'deagle', [1, 0, 0]); // (a hit from inside a hit subscriber)
          outerAfter = e.damage === before && e.weapon === 'usp';
        }
      });
      g.damagePlayer(z, p, 1, 2, 'usp', [1, 0, 0]);
      g.damagePlayer(z, p, 2, 2, 'usp', [1, 0, 0]);
      off();
      check('payload reused', seen[0] === seen[1], `${seen.length} hits`);
      check('nested emit gets its own payload', seen[2] && seen[2] !== seen[1] && outerAfter === true);
      let warned = false;
      const w = console.warn;
      console.warn = () => { warned = true; };
      ev.on('no_such_event', () => {})();
      console.warn = w;
      check('unknown event warns', warned);
      const throwing = ev.on('hit', () => { throw new Error('subscriber bug (expected)'); });
      const ce = console.error;
      let logged = false;
      console.error = () => { logged = true; };
      let survived = true;
      try { g.damagePlayer(z, p, 1, 2, 'usp', [1, 0, 0]); } catch { survived = false; }
      console.error = ce;
      throwing();
      check('a failing subscriber does not break the game', survived && logged);
      return false;
    });

    // specials, extras, the sprinter overshoot, the "left" counter
    steps.push(async () => {
      const Zm = Z(), p = g.local;
      con('zm_wave 6');
      ticks(10);
      rec = [];
      const r = con('zm_special hunter near');
      const hunter = Zm.pool.find((z) => z.alive && z.special === 'hunter');
      check('zm_special', hunter && hunter.extra && of('special', (e) => e.phase === 'spawn' && e.kind === 'hunter').length === 1, r);
      const info = Zm.hudInfo();
      let up = 0;
      for (const z of Zm.pool) if (z.alive && z.extra) up++;
      check('left counter leaves extras out', info.left === Math.max(0, Zm.stats.count - Zm.killed) && info.extras === up && up >= 1, `left ${info.left} extras ${info.extras} count ${Zm.stats.count} killed ${Zm.killed}`);
      const killed0 = Zm.killed, k0 = Zm.kills;
      g.damagePlayer(hunter, p, 1e6, 1, 'deagle', [1, 0, 0]);
      check('special death event', of('special', (e) => e.phase === 'death' && e.kind === 'hunter' && e.attacker === p.name).length === 1 && of('kill', (e) => e.special === 'hunter' && e.head).length === 1);
      check('an extra is not in the count', Zm.killed === killed0 && Zm.kills === k0 + 1);
      // a sprinter pack with one zombie left in the wave
      Zm.clearHorde();
      Zm.spawned = Zm.stats.count - 1;
      const pk = Zm.specials.pick;
      Zm.specials.pick = () => 'sprinter';
      Zm.nextSpawn = 0;
      ticks(1);
      Zm.specials.pick = pk;
      check('sprinter pack stays in the count', Zm.spawned === Zm.stats.count, `${Zm.spawned}/${Zm.stats.count}`);
      check('specials.spawn max', Zm.specials.spawn('sprinter', { max: 1, extra: true }) <= 1);
      return false;
    });

    // bosses, skip
    steps.push(async () => {
      const Zm = Z(), p = g.local;
      rec = [];
      const r = con('zm_boss butcher');
      const b = g.bosses.boss;
      check('zm_boss', b && b.alive && b.boss.def.id === 'butcher' && of('boss', (e) => e.phase === 'spawn' && e.id === 'butcher').length === 1, r);
      const r2 = con('zm_boss 3');
      check('zm_boss by number replaces it', g.bosses.boss?.boss.def.id === 'inferno' && !b.alive && g.players.indexOf(b) < 0, r2);
      const k0 = Zm.kills;
      g.damagePlayer(g.bosses.boss, p, 1e7, 2, 'm249', [1, 0, 0]);
      check('boss death event', of('boss', (e) => e.phase === 'death' && e.id === 'inferno' && e.attacker === p.name).length === 1 && of('kill', (e) => e.boss && e.local).length === 1 && Zm.kills === k0 + 1);
      ticks(200);
      rec = [];
      const w = Zm.wave;
      const r3 = con('zm_skip');
      check('zm_skip clears the wave', Zm.state === 'break' && of('wave', (e) => e.phase === 'cleared' && e.wave === w && e.bonus === Zm.stats.bonus && e.heal === Zm.diff.econ.waveHeal).length === 1, r3);
      const r4 = con('zm_skip');
      check('zm_skip ends the break', Zm.state === 'wave' && Zm.wave === w + 1, r4);
      check('wave rows', Zm.runStats.waves.some((row) => row.wave === w && row.end > 0));
      return false;
    });

    // the Milestone 1 feature scaffolds: tick / hud hooks and HUD layers are called
    steps.push(async () => {
      const Zm = Z();
      check('feature modules', ['economy', 'downed', 'feedback'].every((k) => typeof Zm[k]?.tick === 'function' && typeof Zm[k]?.hud === 'function'));
      let ticked = 0, hudded = 0;
      const t0 = Zm.economy.tick, h0 = Zm.downed.hud;
      Zm.economy.tick = () => ticked++;
      Zm.downed.hud = (s) => { hudded++; s.zmTest = !!s.radar; };
      ticks(5);
      const { buildHudState } = await import('/src/game/hudstate.js');
      const s = buildHudState(g, {});
      Zm.economy.tick = t0; Zm.downed.hud = h0;
      check('feature hooks called', ticked === 5 && hudded === 1 && s.zmTest === true, `tick ${ticked} hud ${hudded}`);
      let over = 0, under = 0;
      const off1 = g.hud.addLayer(() => over++), off2 = g.hud.addLayer(() => under++, -1);
      g.hud.draw(s, 0.016);
      off1(); off2();
      g.hud.draw(s, 0.016);
      check('hud layers', over === 1 && under === 1 && g.hud.layers.length === 0);
      // commands nothing else takes reach the features (F1 'autobuy', a typed 'zm_ready')
      const got = [], c0 = Zm.economy.command;
      Zm.economy.command = (q, cmd, args) => { got.push(`${q === g.local}:${cmd}:${args.join(',')}`); return cmd === 'zm_ready' || cmd === 'autobuy'; };
      const printed = con('zm_ready now');
      g.localCommand('autobuy');
      const unknown = con('zm_nonsense');
      Zm.economy.command = c0;
      check('feature commands', got.join(' ') === 'true:zm_ready:now true:autobuy: true:zm_nonsense:' && printed === '' && /Unknown command/.test(unknown), `${got.join(' ')} | "${printed}" | "${unknown}"`);
      return false;
    });

    // records: dying in a break counts the cleared wave; a new best beats the best before the run
    steps.push(async () => {
      // (records are per map, difficulty and squad size: zrecords.js; one JSON object under KEY)
      const KEY = 'cs16-zombies-best';
      const saved = localStorage.getItem(KEY);
      newRun({ allies: 1 });
      const rk = Z().recordKey();
      localStorage.setItem(KEY, JSON.stringify({ [rk]: 5 }));
      newRun({ allies: 1 });
      listen();
      con('sv_cheats 1');
      con('zm_wave 6');
      con('zm_skip'); // wave 6 cleared: a break
      check('best saved when a wave is cleared', Z().best === 6 && JSON.parse(localStorage.getItem(KEY))[rk] === 6 && Z().bestBefore === 5);
      rec = [];
      wipe();
      check('dying in a break counts the cleared wave', Z().state === 'over' && Z().survived === 6, `survived ${Z().survived}`);
      check('new best', Z().isNewBest() === true);
      check('run over event', of('run', (e) => e.phase === 'over' && e.survived === 6).length === 1 && of('kill', (e) => !e.zombie).length === 2);
      // equal to the best before the run: not a new best (it used to say so)
      newRun({ allies: 1 });
      con('zm_wave 7');
      wipe();
      check('dying mid-wave counts the waves before it', Z().survived === 6, `survived ${Z().survived}`);
      check('tying the best is not a new best', Z().isNewBest() === false && Z().best === 6);
      if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      return false;
    });

    // New Game options reach the mode
    steps.push(async () => {
      newRun({ allies: 1, zdiff: 'hard', hardcore: true, breakLen: 25, squadScaling: false });
      const d = Z().diff;
      check('options reach g.zombies.diff', d.id === 'hard' && d.hardcore && d.breakLen === 25 && !d.squadScaling && d.econ.waveHeal === 0, `${d.id} hc=${d.hardcore} brk=${d.breakLen} sq=${d.squadScaling}`);
      const ZD = await import('/src/game/zdiff.js');
      check('hard horde', Z().stats.health > ZD.waveStats(1, { diff: ZD.ZDIFF.normal }).health, `wave 1 hp ${Z().stats.health}`);
      newRun({ allies: 1 });
      check('defaults again', Z().diff.id === 'normal' && Z().diff.breakLen === ZD.ZDIFF.normal.breakLen && Z().stats.health === ZD.waveStats(1, { diff: ZD.ZDIFF.normal }).health);
      return true;
    });
  }

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false;
    try { done = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; }
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done };
  };
})();
