// Zombie survival, Milestone 2.6 (specialsux): readable specials and the combo director -
// telegraph arcs on a ring around the crosshair (at most 3, merged by direction; hunter and
// charger windups, the smoker's tongue line, the boomer's vomit, a faint "lining up" arc),
// the rim glow (pulsing on a telegraph), the name tag under the crosshair, HELP markers over
// held teammates and the 'save' event / "SAVED Bravo" callout, the combo scheduler in
// Specials.pick (rate-neutral on Normal, pairs queued from one front), and the bots' radio
// callouts. Screenshots: _0 hunter windup, _1 charger windup, _2 smoker tongue (cough), _3
// smoker pulling you (hold), _4 boomer vomit, _5 HELP + SAVED + name tag.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5186/?autostart=1&mode=zombies&allies=2" tools/tests/zm2-specialsux.js /tmp/zm2sux
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a summary.
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const me = () => g.local;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const DEG = 180 / Math.PI;
  let rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); busOff = Z().events.on('*', (e) => rec.push({ type: e.type, kinds: e.kinds && e.kinds.slice(), front: e.front, player: e.player, by: e.by, kind: e.kind })); };
  const of = (type) => rec.filter((e) => e.type === type);
  let HS = null;
  const hud = () => HS.buildHudState(g);
  function newRun(opts = {}) {
    g.paused = false;
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
    con('zm_god_squad');
  }
  /** A special of kind brought in close (outside the count), standing still for the test. */
  const special = (kind) => {
    Z().specials.spawn(kind, { extra: true, near: me().pm.origin.slice() });
    const z = Z().pool.filter((q) => q.alive && q.special === kind).pop();
    z.target = me();
    return z;
  };
  /** Turn so that z sits at `bearing` degrees (+ left, - right, 0 ahead, 180 behind). */
  const face = (z, bearing = 0) => {
    const o = me().pm.origin, zo = z.pm.origin;
    me().pm.angles[1] = Math.atan2(zo[1] - o[1], zo[0] - o[0]) * DEG - bearing;
    me().pm.angles[0] = bearing === 0 ? -Math.atan2(zo[2] + 6 - me().eyePos()[2], flat(zo, o)) * DEG : 0;
  };
  /** A clear spot d units from you (in sight, about your height), or null. */
  const openSpot = (d) => {
    const o = me().pm.origin, e = me().eyePos();
    for (let i = 0; i < 24; i++) {
      const y = i / 24 * Math.PI * 2, p = [o[0] + Math.cos(y) * d, o[1] + Math.sin(y) * d, o[2]];
      if (g.visible(e, [p[0], p[1], p[2] + 17]) && g.visible([p[0], p[1], p[2] + 17], [p[0], p[1], p[2] - 60]) === false) return p;
    }
    return null;
  };
  const hold = (fn) => { for (let i = 0; i < 3; i++) g.frame(0.016); g.paused = true; fn?.(); return { shot: true }; };
  const steps = [];

  // ---------------------------------------------------------------- tables, sounds, wiring
  steps.push(async () => {
    HS = await import('/src/game/hudstate.js');
    const ZD = await import('/src/game/zdiff.js');
    const SP = await import('/src/game/specials.js');
    const TH = await import('/src/game/zthreats.js');
    const ids = ['casual', 'normal', 'hard', 'nightmare'];
    check('COMBO rows (from, chance, gap, arcs, cost)', ids.every((id) => { const c = ZD.ZDIFF[id].combo; return c.from > 0 && c.chance > 0 && c.gap[1] > c.gap[0] && c.arcs > 0 && c.cost > 1; }));
    check('normal: pairs cost two specials (no more of them, only bunched); hard / nightmare cheaper', ZD.ZDIFF.normal.combo.cost === 2 && ZD.ZDIFF.casual.combo.cost === 2 && ZD.ZDIFF.hard.combo.cost < 2 && ZD.ZDIFF.nightmare.combo.cost <= ZD.ZDIFF.hard.combo.cost);
    check('pairs from wave 6 on normal', ZD.ZDIFF.normal.combo.from === 6 && ZD.ZDIFF.casual.combo.from > 6 && ZD.ZDIFF.nightmare.combo.from < 6);
    check('combos: smoker + hunter, boomer then sprinters', SP.COMBOS.some((c) => c.kinds.join() === 'smoker,hunter') && SP.COMBOS.some((c) => c.kinds.join() === 'boomer,sprinter'));
    check('a colour per special', ['hunter', 'charger', 'smoker', 'boomer', 'sprinter'].every((k) => TH.THREAT_RGB[k]?.length === 3));
    newRun();
    listen();
    check('save_sting sound', !!g.sound?.bank?.get?.('save_sting'));
    check('rim glow uniform on special models', (() => { const z = special('hunter'); const ok = !!z.model.material.uniforms.uRim && typeof z.model.setRim === 'function'; Z().clearHorde(); return ok; })());
    return false;
  });

  // ---------------------------------------------------------------- the combo scheduler
  steps.push(async () => {
    con('zm_wave 8');
    Z().nextSpawn = 1e9; // (nothing else comes up)
    Z().clearHorde();
    const SPm = Z().specials;
    const run = (rate, n, wave) => {
      Z().stats = { ...Z().stats, special: rate, perKind: 9 };
      let sp = 0, pairs = 0, maxGap = 0, gap = 0;
      for (let i = 0; i < n; i++) {
        const k = SPm.pick(wave);
        if (k) { sp++; if (SPm.plan) pairs++; maxGap = Math.max(maxGap, gap); gap = 0; } else gap++;
      }
      return { sp, pairs, maxGap, worth: sp + pairs }; // (a pair: two specials)
    };
    const N = 4000, rate = 0.08;
    const sched = run(rate, N, 8), flatR = run(rate, N, 4);
    check('scheduler (wave 8): the same specials on average as the flat chance', Math.abs(sched.worth / N - rate) < 0.012 && Math.abs(flatR.sp / N - rate) < 0.015, `scheduled ${(sched.worth / N * 100).toFixed(2)}% (${sched.sp} picks, ${sched.pairs} pairs), flat ${(flatR.sp / N * 100).toFixed(2)}%, target ${rate * 100}%`);
    check('scheduler: about diff.combo.chance of them are pairs', Math.abs(sched.pairs / sched.sp - Z().diff.combo.chance) < 0.07, `${(sched.pairs / sched.sp * 100).toFixed(0)}%`);
    check('scheduler: no long droughts (steadier than the dice)', sched.maxGap < flatR.maxGap && sched.maxGap <= Math.ceil(1.5 * 2 / rate), `longest gap ${sched.maxGap} vs flat ${flatR.maxGap}`);
    check('below combo.from: no pairs', flatR.pairs === 0);
    check('rate 0: none', run(0, 300, 8).sp === 0);
    check('rate 1: every pick', run(1, 300, 8).sp === 300);
    // a pair planned by pick is queued by spawn: the second from the first's front, gap s on
    Z().stats = { ...Z().stats, special: 0.99, perKind: 9 };
    let k = null;
    SPm.plan = null;
    for (let i = 0; i < 400 && !SPm.plan; i++) k = SPm.pick(8);
    const P = SPm.plan;
    check('pick plans a pair now and then', !!P && k === P.kinds[0], P ? P.kinds.join('+') : 'none');
    rec = [];
    const D = Z().director, t0 = g.time;
    D.pending.length = 0;
    const n = SPm.spawn(k, { front: 'long', max: 5 });
    const q = D.pending[0], C = Z().diff.combo;
    check('the second is queued from the same front, a gap later', n > 0 && !!q && q.kind === P.kinds[1] && q.front === 'long' && q.at >= t0 + C.gap[0] - 1e-6 && q.at <= t0 + C.gap[1] + 1e-6, q ? `${q.kind} ${q.front} +${(q.at - t0).toFixed(2)}s` : 'nothing queued');
    const ce = of('combo')[0];
    check('combo event', !!ce && ce.kinds.join() === P.kinds.join() && ce.front === 'long');
    // ... and comes up when due, counted in the wave
    const sp0 = Z().spawned;
    Z().stats = { ...Z().stats, count: Z().spawned + 20 };
    g.time = q.at; Z().nextSpawn = 0; ticks(1);
    const second = Z().pool.filter((z) => z.alive && z.special === P.kinds[1] && z.front === 'long');
    check('the second arrives through that front', second.length > 0 && Z().spawned > sp0 && D.pending.length === 0, `${second.length} ${P.kinds[1]}, spawned +${Z().spawned - sp0}`);
    // a pick that doesn't end in a spawn plans nothing
    rec = [];
    SPm.plan = P; SPm.planT = g.time - 1;
    SPm.spawn(P.kinds[0], { front: 'mid' });
    check('a stale plan queues nothing', of('combo').length === 0);
    SPm.plan = P; SPm.planT = g.time;
    SPm.spawn(P.kinds[0], { extra: true });
    check('an extra (summoned) special queues nothing', of('combo').length === 0);
    // hard: pairs come cheaper (more specials)
    Z().nextSpawn = 1e9;
    Z().clearHorde();
    D.pending.length = 0;
    return false;
  });

  steps.push(async () => {
    newRun({ zdiff: 'nightmare' });
    con('zm_wave 8');
    Z().nextSpawn = 1e9;
    Z().clearHorde();
    Z().stats = { ...Z().stats, special: 0.08, perKind: 9 };
    let worth = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) { const k = Z().specials.pick(8); if (k) worth += Z().specials.plan ? 2 : 1; }
    check('nightmare: pairs add specials (cost < 2)', worth / N > 0.08 * 1.04, `${(worth / N * 100).toFixed(2)}% vs 8%`);
    return false;
  });

  // ---------------------------------------------------------------- telegraphs: hunter windup on your right
  let H = null;
  steps.push(async () => {
    newRun();
    listen();
    con('zm_wave 6');
    Z().nextSpawn = 1e9;
    Z().clearHorde();
    H = special('hunter');
    ticks(2);
    H.target = me(); // (think picks its target: you)
    face(H, -90);
    let s = hud();
    check('no arc while it just chases', s.threats && s.threats.arcs.length === 0);
    H.sp.state = 'wind'; H.sp.until = g.time + 0.2;
    s = hud();
    const a = s.threats.arcs[0];
    check('hunter windup: an arc on your right', s.threats.arcs.length === 1 && a.kind === 'hunter' && a.phase === 'windup' && Math.abs(a.bearing + 90) < 3, a ? `${a.kind} ${a.phase} ${a.bearing.toFixed(1)}` : 'none');
    const th = Z().specials.threats()[0];
    check('threats() carries total and prog', th.total === 0.35 && th.prog > 0.3 && th.prog < 0.7, `${th.total} ${th.prog.toFixed(2)}`);
    // rim glow pulses on the telegraph
    const rim = () => { const v = H.model.material.uniforms.uRim.value; return v.x + v.y + v.z; };
    let lo = 1e9, hi = 0;
    for (let i = 0; i < 12; i++) { g.time += 0.013; Z().threats.frame(0.016); lo = Math.min(lo, rim()); hi = Math.max(hi, rim()); }
    H.sp.state = 'chase';
    Z().threats.frame(0.016);
    const base = rim();
    check('rim glow: faint, pulsing on the telegraph', base > 0 && base < 0.4 && hi > base * 3 && lo < hi * 0.6, `base ${base.toFixed(3)} pulse ${lo.toFixed(3)}..${hi.toFixed(3)}`);
    // lining up: in range, sees you, its pounce nearly ready -> a faint arc (casual earlier)
    const spot = openSpot(300);
    if (spot) H.pm.origin = spot;
    Z().threats.seenT = 0; Z().threats.tick(g.time); // (the line of sight cache)
    H.sp.cd.pounce = g.time + 0.3; H.target = me();
    const d = flat(H.pm.origin, me().pm.origin);
    s = hud();
    const pre = s.threats.arcs[0];
    check('lining up: a faint arc first', !!spot && H.thSeen && pre && pre.phase === 'pre' && pre.kind === 'hunter', `d ${d.toFixed(0)} seen ${H.thSeen} ${pre ? pre.phase : 'none'}`);
    H.sp.cd.pounce = g.time + 0.7;
    check('lining up: only within the lead (0.6 s x diff.combo.arcs)', !hud().threats.arcs.length);
    H.sp.cd.pounce = g.time + 5;
    s = hud();
    check('not while the trick is far off', !s.threats.arcs.some((x) => x.phase === 'pre'));
    // the screenshot: a hunter winding up on your right
    H.sp.state = 'wind'; H.sp.until = g.time + 0.2;
    face(H, -90);
    return hold();
  });

  // ---------------------------------------------------------------- charger windup on your left
  let CH = null;
  steps.push(async () => {
    g.paused = false;
    Z().clearHorde();
    CH = special('charger');
    ticks(2);
    CH.target = me();
    CH.sp.state = 'wind'; CH.sp.until = g.time + 0.35;
    face(CH, 70);
    const s = hud(), a = s.threats.arcs[0];
    check('charger windup: an arc on your left', s.threats.arcs.length === 1 && a.kind === 'charger' && Math.abs(a.bearing - 70) < 3, a ? `${a.kind} ${a.bearing.toFixed(1)}` : 'none');
    return hold();
  });

  // ---------------------------------------------------------------- smoker: the tongue line, then the pull
  let SM = null;
  steps.push(async () => {
    g.paused = false;
    Z().clearHorde();
    SM = special('smoker');
    ticks(2);
    SM.target = me();
    SM.sp.state = 'wind'; SM.sp.until = g.time + 0.25;
    face(SM, 25);
    const s = hud(), a = s.threats.arcs[0];
    check('smoker cough: an arc (and its tongue line)', s.threats.arcs.length === 1 && a.kind === 'smoker' && a.phase === 'windup');
    return hold();
  });
  steps.push(async () => {
    g.paused = false;
    SM.sp.state = 'pull'; SM.sp.victim = me(); SM.sp.grab = g.time + 100; SM.sp.tookAt = SM.sp.took; SM.sp.hidden = 0; SM.sp.nextHurt = g.time + 100;
    me().tonguedBy = SM;
    face(SM, -150);
    const s = hud(), a = s.threats.arcs[0];
    check('smoker pulling you: a hold arc behind you', s.threats.arcs.length === 1 && a.kind === 'smoker' && a.phase === 'hold' && Math.abs(a.bearing + 150) < 3, a ? `${a.phase} ${a.bearing.toFixed(1)}` : 'none');
    return hold();
  });

  // ---------------------------------------------------------------- boomer vomit; merging; at most 3
  steps.push(async () => {
    g.paused = false;
    Z().specials.letGo(SM);
    Z().clearHorde();
    const B = special('boomer');
    ticks(2);
    B.target = me();
    B.sp.state = 'vomit'; B.sp.from = g.time + 100; B.sp.until = g.time + 101; B.sp.hit = false;
    face(B, 0);
    let s = hud(), a = s.threats.arcs[0];
    check('boomer vomit: an arc ahead', s.threats.arcs.length === 1 && a.kind === 'boomer' && a.phase === 'windup' && Math.abs(a.bearing) < 3, a ? `${a.kind} ${a.bearing.toFixed(1)}` : 'none');
    // merged by direction: a hunter right beside the boomer
    const h2 = special('hunter');
    h2.pm.origin = [B.pm.origin[0] + 8, B.pm.origin[1] + 8, B.pm.origin[2]];
    h2.sp.state = 'wind'; h2.sp.until = g.time + 100;
    s = hud();
    check('two in one direction: one arc', s.threats.arcs.length === 1 && s.threats.arcs[0].n === 2, `${s.threats.arcs.length} arcs, n ${s.threats.arcs[0]?.n}`);
    // four directions: three arcs, the most urgent kept
    const o = me().pm.origin, yaw = me().pm.angles[1] / DEG;
    const put = (z, b) => { const y = yaw + b / DEG; z.pm.origin = [o[0] + Math.cos(y) * 300, o[1] + Math.sin(y) * 300, o[2]]; };
    const c2 = special('charger'), s2 = special('smoker');
    put(B, 0); put(h2, 90); put(c2, 180); put(s2, -90);
    c2.sp.state = 'charge'; c2.sp.until = g.time + 100; c2.sp.yaw = 0; c2.sp.start = g.time; c2.sp.hitList = new Set();
    s2.sp.state = 'wind'; s2.sp.until = g.time + 0.05;
    s = hud();
    const kinds = s.threats.arcs.map((x) => x.kind).sort().join();
    check('four threats around you: at most three arcs, the most urgent', s.threats.arcs.length === 3 && kinds === 'charger,hunter,smoker', kinds);
    // the screenshot: the boomer alone, vomiting at you
    for (const z of [h2, c2, s2]) Z().despawn(z);
    put(B, 25); face(B, 25);
    B.sp.from = g.time + 0.15; B.sp.until = B.sp.from + 1;
    return hold();
  });

  // ---------------------------------------------------------------- HELP, saves, name tag, bot callouts
  steps.push(async () => {
    g.paused = false;
    Z().clearHorde();
    rec = [];
    const bot = g.players.find((p) => p.isBot && p.team === me().team && p.alive);
    const r0 = g.bots.stats.radio;
    const h = special('hunter');
    h.pm.origin = [bot.pm.origin[0] + 30, bot.pm.origin[1], bot.pm.origin[2]];
    Z().specials.pin(h, bot);
    ticks(1);
    let s = hud();
    check('HELP over a pinned teammate', s.threats.help.length === 1 && s.threats.help[0].p === bot && s.threats.help[0].by === h);
    check('the pinned bot cries out on the radio', g.bots.stats.radio > r0 && Z().threats.stats.grabs >= 1, `radio +${g.bots.stats.radio - r0}`);
    // shot off by you
    g.damagePlayer(h, me(), 50, 2, 'ak47', [1, 0, 0], h.eyePos());
    ticks(2);
    let e = of('save')[0];
    check('shot off: save event names you', !!e && e.player === bot && e.by === me() && e.kind === 'hunter' && !bot.pinnedBy, e ? `by ${e.by?.name}` : 'none');
    s = hud();
    check('SAVED <name> callout', s.threats.saves.some((x) => x.text === `SAVED ${bot.name}` && x.big));
    // letting go on its own: by null; letGo(z, by): by
    rec = [];
    h.sp.state = 'chase';
    Z().specials.pin(h, bot);
    h.sp.until = g.time; ticks(2);
    e = of('save')[0];
    check('time up: a save on his own (by null)', !!e && e.player === bot && e.by === null);
    rec = [];
    Z().specials.pin(h, bot);
    const mate = g.players.find((p) => p.isBot && p.team === me().team && p.alive && p !== bot);
    Z().specials.letGo(h, mate);
    e = of('save')[0];
    check('a shove / letGo: names who did it', !!e && e.by === mate, e ? `by ${e.by?.name}` : 'none');
    // killing a smoker that has him: by the killer
    rec = [];
    const sm = special('smoker');
    sm.sp.state = 'pull'; sm.sp.victim = bot; sm.sp.grab = g.time; sm.sp.tookAt = sm.sp.took; sm.sp.hidden = 0; sm.sp.nextHurt = g.time + 100;
    bot.tonguedBy = sm;
    g.damagePlayer(sm, me(), 1e4, 2, 'ak47', [1, 0, 0], sm.eyePos());
    e = of('save')[0];
    check('killed: save by the killer', !!e && e.player === bot && e.by === me() && e.kind === 'smoker');
    // a fly that missed is no save
    rec = [];
    const sm2 = special('smoker');
    sm2.sp.state = 'fly'; sm2.sp.victim = bot; sm2.sp.tip = sm2.eyePos();
    Z().specials.release(sm2);
    check('a tongue that never caught: no save', of('save').length === 0);
    // the bots call a special out once
    Z().clearHorde();
    const z = special('charger');
    const B = g.bots.bots.find((b) => b.p === mate);
    Z().threats.anyCallT = 0; Z().threats.callT = Object.create(null);
    const said = [];
    const r = g.rounds.radio.bind(g.rounds);
    g.rounds.radio = (p, text) => { said.push(text); r(p, text); };
    const first = Z().threats.spotted(B, z), again = Z().threats.spotted(B, z);
    B.acquire(z, { cos: 1, d: 300 }); // (the hook in Bot.acquire: already called)
    g.rounds.radio = r;
    check('a bot calls the special out, once', first === true && again === false && said.length === 1 && /charger/i.test(said[0]), said.join(' | '));
    // name tag when aimed at
    Z().clearHorde();
    const tag = special('hunter');
    ticks(15);
    face(tag, 0);
    s = hud();
    check('aiming at a special shows its name', !tag.thSeen || (s.threats.aim.on && s.threats.aim.name === 'Hunter'), `seen ${tag.thSeen} aim ${s.threats.aim.on} ${s.threats.aim.name}`);
    me().pm.angles[1] += 60;
    s = hud();
    check('looking away: no name', !s.threats.aim.on);
    // the screenshot: a HELP marker (a pinned bot), the SAVED callout, the name tag
    me().pm.angles[1] -= 60;
    const hh = special('hunter');
    hh.pm.origin = [bot.pm.origin[0] + 30, bot.pm.origin[1], bot.pm.origin[2]];
    Z().specials.pin(hh, bot);
    hh.sp.until = g.time + 100;
    Z().threats.onSave({ player: mate, by: me(), kind: 'hunter' });
    ticks(30); // (the callout fades in)
    return hold();
  });

  steps.push(async () => {
    g.paused = false;
    // classic play: nothing of this
    const s = hud();
    check('zombie HUD state present in zombie mode', !!s.threats);
    out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'} (${pass} passed, ${fail} failed)`);
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    try {
      const r = await steps[i++]();
      const log = out.splice(0).join('\n');
      if (r === true || i >= steps.length) return { log, done: true };
      if (r && r.shot) return { log, shot: true };
      return { log, done: false };
    } catch (e) {
      out.push(`[sim] FAIL exception ${e.message} ${e.stack?.split('\n')[1] || ''}`);
      return { log: out.splice(0).join('\n'), done: true };
    }
  };
})();
