// Zombie survival, Milestone 2.2 (shove): the melee shove - the bindings (Mouse 4 and the
// Options key, F still the flashlight), the 60 degree / 70 u cone, the stagger + push + lost
// swing, the boss's token push, the hunter deadstop, a shove freeing a pinned / tongued
// teammate, L4D fatigue (pips, weak shoves, regen), the HUD pips and the view-model bash, and
// the bots: they shove when swarmed and come to knock a hunter off you.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm2-shove.js /tmp/zshove
// Prints "[sim] PASS ..." / "[sim] FAIL ...". Screenshot _0: the bash with the pips under the
// crosshair (three of four left, the fourth filling up).
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const SH = () => g.zombies.shove;
  const me = () => g.local;
  const DEG = Math.PI / 180;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const played = [];
  const play0 = g.sound.play;
  g.sound.play = function (name, o) { played.push(name); return play0.call(this, name, o); };
  const heard = (name) => played.filter((n) => n === name).length;
  let rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); busOff = Z().events.on('*', (e, type) => rec.push({ type, player: e.player, hits: e.hits, freed: e.freed, tired: e.tired, src: e.src, by: e.by, zombie: e.zombie, kind: e.kind })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  const think0 = g.bots.think;
  let HS = null;

  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    con('sv_cheats 1');
    con('zm_god_squad');
    Z().nextSpawn = 1e9; // (no wave spawns: only what the test puts down)
    g.bots.think = () => {}; // (the bots hold still and hold fire until their own steps)
    Z().clearHorde();
    listen();
  }
  /** Face the most open direction (level). */
  function faceOpen(p) {
    const e = p.eyePos();
    let best = 0, bd = -1;
    for (let a = 0; a < 360; a += 15) {
      let d = 0;
      for (const r of [60, 120, 200, 280]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 40])) d = r; else break; }
      if (d > bd) { bd = d; best = a; }
    }
    p.pm.angles[1] = best; p.pm.angles[0] = 0;
    return best;
  }
  /** A point dist in front of p (side: to the left), at p's height. */
  const ahead = (p, dist, side = 0) => { const o = p.pm.origin, y = p.pm.angles[1] * DEG; return [o[0] + Math.cos(y) * dist - Math.sin(y) * side, o[1] + Math.sin(y) * dist + Math.cos(y) * side, o[2]]; };
  /** A common that stands still dist in front of you. */
  function zombieAt(dist, side = 0) {
    const at = ahead(me(), dist, side);
    Z().spawnZombie({ at, variant: 'walker' });
    let z = null, bd = 1e9;
    for (const q of Z().pool) { if (!q.alive || q.special) continue; const d = flat(q.pm.origin, at); if (d < bd) { bd = d; z = q; } }
    if (z) { z.zSpeed = 0; z.nextAttack = g.time + 1e3; }
    return z;
  }
  const put = (p, pos) => { p.pm.origin = pos.slice(); p.prevOrigin = pos.slice(); p.pm.velocity = [0, 0, 0]; };
  const special = (kind, near) => { Z().specials.spawn(kind, { extra: true, near }); return Z().pool.find((z) => z.alive && z.special === kind); };
  /** Wait out the shove cooldown and fatigue: everybody fresh. */
  const rest = () => { for (const p of g.players) p.shove = null; };
  const steps = [];

  // ---------------------------------------------------------------- bindings, sounds, the command
  steps.push(async () => {
    HS = await import('/src/game/hudstate.js');
    const IN = await import('/src/engine/input.js');
    newRun();
    check('Mouse 4 shoves by default', IN.DEFAULT_BINDS.MOUSE4 === 'shove' && g.input.binds.MOUSE4 === 'shove');
    check('the shove key: T by default (Options), F stays the flashlight, Q last weapon', g.settings.get('shoveKey') === 'KeyT' && g.input.binds.KeyT === 'shove' && g.input.binds.KeyF === 'impulse 100' && g.input.binds.KeyQ === 'lastinv');
    g.input.bindOnly('shove', 'KeyJ');
    const moved = g.input.binds.KeyJ === 'shove' && g.input.binds.KeyT === 'impulse 201' && g.input.binds.MOUSE4 === 'shove';
    g.input.bindOnly('shove', 'none');
    const none = !Object.keys(g.input.binds).some((k) => g.input.binds[k] === 'shove' && k !== 'MOUSE4');
    g.input.bindOnly('shove', g.settings.get('shoveKey'));
    check('rebinding the key gives the old one back (Mouse 4 stays)', moved && none && g.input.binds.KeyT === 'shove');
    const missing = ['shove_swing', 'shove_hit'].filter((n) => !g.sound.bank?.get(n));
    check('shove sounds synthesized', !missing.length, missing.join());
    // the bind / console path: an unclaimed command reaches shove.command
    faceOpen(me());
    played.length = 0;
    g.localCommand('shove');
    check('the shove command (key bind) shoves', me().shove && me().shove.at === g.time && of('shove').length === 1 && heard('shove_swing') === 1);
    rest(); ticks(60);
    check('typed in the console too', !/Unknown command/.test(con('shove')) && of('shove').length === 2);
    return false;
  });

  // ---------------------------------------------------------------- the cone and what it does
  steps.push(async () => {
    rest(); ticks(60); rec = [];
    Z().clearHorde();
    faceOpen(me());
    const front = zombieAt(45), side = zombieAt(40, 40), far = zombieAt(110), behind = zombieAt(-45);
    ticks(2);
    front.windup = g.time + 0.2; // (mid-swing)
    const t0 = g.time, v0 = front.pm.velocity.slice(), o0 = front.pm.origin.slice();
    played.length = 0;
    const n = SH().tryShove(me());
    check('the cone takes the ones in front, close (60 deg, 70 u)', n === 2 && front.staggerUntil > t0 && side.staggerUntil > t0 && !(far.staggerUntil > t0) && !(behind.staggerUntil > t0), `hits ${n}`);
    const away = [o0[0] - me().pm.origin[0], o0[1] - me().pm.origin[1]], l = Math.hypot(away[0], away[1]);
    const dv = ((front.pm.velocity[0] - v0[0]) * away[0] + (front.pm.velocity[1] - v0[1]) * away[1]) / l;
    check('pushed back hard (stagger + shove)', dv > 250, `${dv.toFixed(0)} u/s away`);
    check('its swing is lost', front.windup === 0 && front.nextAttack > t0 + 0.4);
    const st = of('stagger', (e) => e.src === 'shove' && e.by === me());
    check('staggered through the stagger API (src shove, by you)', st.length === 2 && st.every((e) => e.kind === 'stagger'), JSON.stringify(st.map((e) => e.kind)));
    const ev = of('shove')[0];
    check('a shove event', !!ev && ev.player === me() && ev.hits === 2 && ev.freed === null && ev.tired === false);
    check('swing + hit foley', heard('shove_swing') === 1 && heard('shove_hit') === 1);
    const trail = [];
    for (let i = 0; i < 40; i++) { g.tick(); if (i % 5 === 0) trail.push(`${flat(front.pm.origin, me().pm.origin).toFixed(0)}/${Math.hypot(front.pm.velocity[0], front.pm.velocity[1]).toFixed(0)}/${front.pm.onground ? 'g' : 'a'}`); }
    check('and it ends up further off', flat(front.pm.origin, me().pm.origin) > flat(o0, me().pm.origin) + 25, `${flat(o0, me().pm.origin).toFixed(0)} -> ${flat(front.pm.origin, me().pm.origin).toFixed(0)} ${trail.join(' ')}`);
    // through a wall: nothing
    Z().clearHorde();
    rest();
    const yaw = me().pm.angles[1];
    let wallYaw = null;
    const e = me().eyePos();
    for (let a = 0; a < 360 && wallYaw === null; a += 10) {
      const y = a * DEG, p1 = [e[0] + Math.cos(y) * 30, e[1] + Math.sin(y) * 30, e[2] - 54];
      const p2 = [e[0] + Math.cos(y) * 70, e[1] + Math.sin(y) * 70, e[2] - 54];
      if (g.visible(e, [p1[0], p1[1], e[2] - 30]) && !g.visible(e, [p2[0], p2[1], e[2] - 30])) wallYaw = a;
    }
    if (wallYaw !== null) {
      me().pm.angles[1] = wallYaw;
      const at = ahead(me(), 85);
      const z = Z().pool.find((q) => !q.alive && !q.special) || null;
      Z().spawnZombie({ at, variant: 'walker' });
      const w = Z().pool.find((q) => q.alive && !q.special && flat(q.pm.origin, at) < 2) || z;
      check('not through a wall', w && SH().tryShove(me()) === 0 && !(w.staggerUntil > g.time));
    } else check('not through a wall (no wall close by: skipped)', true);
    me().pm.angles[1] = yaw;
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- fatigue
  steps.push(async () => {
    rest(); rec = [];
    Z().clearHorde();
    faceOpen(me());
    const D = Z().diff.shove;
    // mash it every tick for 3 s
    let tries = 0, ok = 0;
    for (let i = 0; i < 300; i++) { tries++; if (SH().tryShove(me()) >= 0) ok++; g.tick(); }
    const ev = of('shove');
    const full = ev.findIndex((e) => e.tired) + 1, weak = ev.length - full; // (the last full one says tired)
    const maxWeak = Math.ceil((3 - (D.pips - 1) * 0.55) / D.tired) + 1;
    check('spamming: the pips go, then only weak shoves now and then', ok === ev.length && full === D.pips && weak >= 1 && weak <= maxWeak && SH().pips(me()) === 0, `${tries} tries, ${ok} shoves (${D.pips} full, ${weak} weak, at most ${maxWeak})`);
    check('the last pip says tired', ev[D.pips - 1]?.tired === true && ev[D.pips - 2]?.tired === false);
    // a weak one only flinches (no hold, the swing goes on)
    while (g.time < me().shove.tiredUntil || g.time < me().shove.next) g.tick();
    const z = zombieAt(45);
    ticks(1);
    z.windup = g.time + 0.25;
    const t0 = g.time;
    check('out of pips: a weak shove (a flinch, the swing goes on)', SH().tryShove(me()) === 1 && !(z.staggerUntil > t0) && z.windup > t0 && me().shove.weak);
    check('and no other one for a while', SH().tryShove(me()) === -1);
    Z().clearHorde();
    // a pip comes back after regen s of rest, all of them after pips x regen
    const t1 = g.time;
    while (SH().pips(me()) < 1 && g.time < t1 + 10) g.tick();
    const first = g.time - t1;
    while (SH().pips(me()) < D.pips && g.time < t1 + 20) g.tick();
    const all = g.time - t1;
    check('pips come back one at a time', Math.abs(first - D.regen) < 0.05 && Math.abs(all - D.regen * D.pips) < 0.1, `first ${first.toFixed(2)} s, all ${all.toFixed(2)} s (regen ${D.regen})`);
    // harder difficulties: fewer pips, slower
    const ZD = await import('/src/game/zdiff.js');
    check('nightmare tires you sooner than normal', ZD.ZDIFF.nightmare.shove.pips < ZD.ZDIFF.normal.shove.pips && ZD.ZDIFF.nightmare.shove.regen > ZD.ZDIFF.normal.shove.regen);
    return false;
  });

  // ---------------------------------------------------------------- who can't shove
  steps.push(async () => {
    rest();
    const p = me();
    p.downed = true;
    check('not while down', SH().tryShove(p) === -1);
    p.downed = false;
    const h = special('hunter', ahead(p, 150));
    put(h, ahead(p, 30));
    Z().specials.pin(h, p);
    check('not while pinned flat', p.pinnedBy === h && SH().tryShove(p) === -1);
    Z().specials.letGo(h);
    // on a tongue you can: shove the smoker that reeled you in
    Z().clearHorde();
    rest();
    faceOpen(p);
    const s = special('smoker', ahead(p, 150));
    put(s, ahead(p, 50));
    s.sp.state = 'pull'; s.sp.victim = p; s.sp.grab = g.time; s.sp.tookAt = s.sp.took; p.tonguedBy = s;
    check('on a tongue: shove the smoker off', SH().tryShove(p) === 1 && p.tonguedBy === null && s.sp.state === 'recover' && s.sp.freedBy === p);
    Z().clearHorde();
    // a zombie isn't in the squad
    check('zombies don\'t shove', SH().tryShove(Z().pool[0]) === -1);
    return false;
  });

  // ---------------------------------------------------------------- specials and the boss
  steps.push(async () => {
    rest(); rec = [];
    Z().clearHorde();
    const p = me();
    faceOpen(p);
    // a hunter in mid-leap: the deadstop
    const h = special('hunter', ahead(p, 200));
    put(h, ahead(p, 40));
    h.sp.state = 'air'; h.sp.start = g.time; h.pm.velocity = [-300, 0, 100];
    check('a hunter in mid-leap is knocked out of the air', SH().tryShove(p) === 1 && h.sp.state === 'recover' && h.sp.until > g.time + 0.8);
    Z().clearHorde();
    // the boss: a token push, no stagger
    rest();
    con('zm_boss 0');
    const B = g.bosses.boss;
    if (B) {
      put(B, ahead(p, 50));
      const v0 = Math.hypot(B.pm.velocity[0], B.pm.velocity[1]);
      const n = SH().tryShove(p);
      const v1 = Math.hypot(B.pm.velocity[0], B.pm.velocity[1]);
      check('the boss only rocks (a token push, no stagger)', n === 1 && !(B.staggerUntil > g.time) && v1 - v0 > 10 && v1 - v0 < 80, `hits ${n}, +${(v1 - v0).toFixed(0)} u/s`);
      g.bosses.despawn();
    } else check('the boss only rocks (no boss came)', false);
    return false;
  });

  // ---------------------------------------------------------------- freeing a teammate
  steps.push(async () => {
    rest(); rec = [];
    Z().clearHorde();
    g.bots.think = () => {}; // (the bots stand still for this one)
    const p = me();
    faceOpen(p);
    const b = g.players.find((q) => q.isBot && q.team === 'CT' && q.alive);
    put(b, ahead(p, 60));
    const h = special('hunter', ahead(p, 200));
    put(h, ahead(p, 86));
    Z().specials.pin(h, b);
    ticks(5);
    check('the bot is pinned', b.pinnedBy === h && h.sp.state === 'pin');
    const n = SH().tryShove(p);
    check('a shove frees the pinned bot', b.pinnedBy === null && h.sp.state === 'recover' && h.sp.freedBy === p, `hits ${n}`);
    const ev = of('shove').pop();
    check('the shove event names him', ev && ev.freed === b && ev.player === p);
    ticks(10);
    check('and he stays free', b.pinnedBy === null);
    // a tongued bot: shove him off the line
    Z().clearHorde();
    rest();
    put(b, ahead(p, 55));
    const s = special('smoker', ahead(p, 300));
    put(s, ahead(p, 280));
    s.sp.state = 'pull'; s.sp.victim = b; s.sp.grab = g.time; s.sp.tookAt = s.sp.took; s.sp.hidden = 0; b.tonguedBy = s;
    SH().tryShove(p);
    check('a shove frees a tongued bot', b.tonguedBy === null && s.sp.state === 'recover' && s.sp.freedBy === p && of('shove').pop()?.freed === b);
    Z().clearHorde();
    g.bots.think = think0;
    return false;
  });

  // ---------------------------------------------------------------- the bots
  steps.push(async () => {
    rest(); rec = [];
    Z().clearHorde();
    g.bots.think = think0;
    const p = me();
    faceOpen(p);
    // a hunter pins you; a bot close by comes and knocks it off
    const b = g.players.find((q) => q.isBot && q.team === 'CT' && q.alive);
    put(b, ahead(p, 130));
    const h = special('hunter', ahead(p, 200));
    put(h, ahead(p, 26)); // (between you and the bot)
    Z().specials.pin(h, p);
    // (it can't be shot off or killed here: held until somebody shoves it off)
    const onDamage0 = Z().specials.onDamage;
    Z().specials.onDamage = function (z, dmg) { if (z !== h) onDamage0.call(this, z, dmg); };
    let freedBy = null, t0 = g.time;
    for (let i = 0; i < 500 && p.pinnedBy; i++) {
      h.sp.until = g.time + 2; h.health = h.maxHealth = 1e6;
      g.tick();
      if (i % 10 === 0) g.frame(0.1);
    }
    Z().specials.onDamage = onDamage0;
    freedBy = h.sp.freedBy;
    const sv = of('shove', (e) => e.player?.isBot && e.freed === p);
    check('a bot comes and shoves the hunter off you', p.pinnedBy === null && !!freedBy?.isBot && sv.length >= 1, `freed by ${freedBy?.name || 'nobody'} after ${(g.time - t0).toFixed(1)} s (hunter ${h.alive ? 'alive' : 'dead'} ${h.health} ${h.sp.state}, bot ${flat(b.pm.origin, p.pm.origin).toFixed(0)} u, ${b.bot?.mode})`);
    Z().clearHorde();
    // swarmed: a bot with zombies in its face shoves them back
    rest(); rec = [];
    let shoved = 0;
    for (let k = 0; k < 3 && !shoved; k++) {
      const yb = b.pm.angles[1] * DEG, bo = b.pm.origin;
      for (const sd of [-18, 0, 18]) Z().spawnZombie({ at: [bo[0] + Math.cos(yb) * 42 - Math.sin(yb) * sd, bo[1] + Math.sin(yb) * 42 + Math.cos(yb) * sd, bo[2]], variant: 'walker' });
      for (let i = 0; i < 300 && !shoved; i++) {
        g.tick();
        if (i % 10 === 0) g.frame(0.1);
        shoved = of('shove', (e) => e.player === b && e.hits > 0).length;
      }
      Z().clearHorde();
    }
    check('a swarmed bot shoves them back', shoved > 0, `${shoved}`);
    // and it keeps a pip for a save
    check('a bot keeps a pip in hand', SH().pips(b) >= 1);
    return false;
  });

  // ---------------------------------------------------------------- HUD pips and the view-model bash (screenshot)
  steps.push(async () => {
    rest();
    Z().clearHorde();
    g.bots.think = () => {};
    const p = me();
    faceOpen(p);
    p.pm.angles[0] = 8;
    let s = HS.buildHudState(g, { settings: g.settings });
    check('no pips before you shove', !s.shove?.show);
    zombieAt(48);
    ticks(1);
    SH().tryShove(p);
    ticks(8);
    s = HS.buildHudState(g, { settings: g.settings });
    check('pips show after a shove', s.shove?.show && s.shove.pips === Z().diff.shove.pips - 1 && s.shove.max === Z().diff.shove.pips, JSON.stringify(s.shove));
    g.frame(0.016);
    const vm = g.vm?.object3D;
    check('the view model bashes (thrown forward and turned)', !!vm && vm.position.z < -3 && vm.rotation.y > 0.2, vm ? `z ${vm.position.z.toFixed(2)} yaw ${vm.rotation.y.toFixed(2)}` : 'no vm');
    ticks(40);
    g.frame(0.016);
    check('and comes back', !!vm && Math.abs(vm.position.z) < 0.5 && Math.abs(vm.rotation.y) < 0.1, vm ? `z ${vm.position.z.toFixed(2)}` : '');
    // the shot: mid-bash, the fourth pip filling
    p.shove.pips = Z().diff.shove.pips - 1; p.shove.regenAt = g.time + Z().diff.shove.regen * 0.4; p.shove.at = g.time - 0.07;
    g.paused = true;
    return { shot: true };
  });

  // ---------------------------------------------------------------- a run plays on with the bots shoving
  steps.push(async () => {
    g.paused = false;
    rest(); rec = [];
    g.bots.think = think0;
    Z().nextSpawn = g.time;
    con('zm_wave 4');
    for (let i = 0; i < 1500; i++) { g.tick(); if (i % 25 === 0) g.frame(0.25); }
    const sv = of('shove');
    check('a wave plays on (bots shove now and then, no errors)', (Z().state === 'wave' || Z().state === 'break') && sv.every((e) => e.player && e.player.team === 'CT'), `${sv.length} shoves, ${sv.filter((e) => e.hits > 0).length} landed`);
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false, r = null;
    try { r = await steps[i++](); done = r === true; } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; }
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, shot: !!(r && r.shot) };
  };
})();
