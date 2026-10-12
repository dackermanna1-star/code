// Zombie survival, Milestone 2 foundation: the shared contracts the six M2 builders code
// against (m2-contracts) - the difficulty groups, the new events, the feature modules and
// their hooks, the director's spawn seam (queue, fronts), the roster's z.variant, the
// stagger API and its hold in think, specials.threats() / letGo(), and that with every
// scaffold idle the mode plays as before.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm2-foundation.js /tmp/zm2
// Prints "[sim] PASS ..." / "[sim] FAIL ...". Builders: when your feature changes a scaffold
// default checked here (e.g. walkers and runners only, no wave type), replace that check
// with one for your behaviour.
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
  let rec = [];
  const pick = (e) => ({ type: e.type, phase: e.phase, mod: e.mod, kind: e.kind, src: e.src, by: e.by?.name, zombie: e.zombie, variant: e.variant, victim: e.victim });
  let busOff = null;
  const listen = () => { busOff?.(); busOff = Z().events.on('*', (e) => rec.push(pick(e))); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
  }
  const commons = () => Z().pool.filter((z) => z.alive && !z.special);
  const steps = [];

  // ---------------------------------------------------------------- the difficulty groups and events
  steps.push(async () => {
    const ZD = await import('/src/game/zdiff.js');
    const RS = await import('/src/game/runstats.js');
    const groups = { stagger: ['resist', 'decay', 'cooldown', 'knockdown'], shove: ['pips', 'regen', 'tired'], ai: ['flank', 'fields', 'surround', 'slots'], director: ['fronts', 'modsFrom', 'modChance', 'surge', 'surgeAlive', 'calm', 'radar', 'pingRange'], roster: ['mix', 'shift', 'riotCap'], combo: ['from', 'chance', 'gap', 'arcs'] };
    const missing = [];
    for (const id of ZD.ZDIFF_ORDER) for (const [k, fields] of Object.entries(groups)) for (const f of fields) if (ZD.ZDIFF[id][k]?.[f] === undefined) missing.push(`${id}.${k}.${f}`);
    check('every preset has the M2 groups', !missing.length, missing.join(' '));
    check('sandbox plays normal\'s M2 rows', Object.keys(groups).every((k) => JSON.stringify(ZD.ZDIFF.sandbox[k]) === JSON.stringify(ZD.ZDIFF.normal[k])));
    const up = (k, f) => ['casual', 'normal', 'hard', 'nightmare'].map((id) => ZD.ZDIFF[id][k][f]).every((v, i, a) => !i || v >= a[i - 1]);
    const bad = [['ai', 'flank'], ['director', 'surge'], ['director', 'surgeAlive'], ['director', 'modChance'], ['combo', 'chance'], ['stagger', 'resist'], ['roster', 'mix'], ['roster', 'riotCap']].filter(([k, f]) => !up(k, f));
    check('new pressure grows casual -> nightmare', !bad.length, bad.map((x) => x.join('.')).join(' '));
    check('fewer shoves and calmer breaks are hard / nightmare', ZD.ZDIFF.nightmare.shove.pips <= ZD.ZDIFF.normal.shove.pips && ZD.ZDIFF.nightmare.director.calm <= ZD.ZDIFF.normal.director.calm);
    check('casual keeps the full radar', ZD.ZDIFF.casual.director.radar === 'full' && ZD.ZDIFF.normal.director.radar === 'pings');
    const r = ZD.resolveDiff(ZD.zombieOptions({ zdiff: 'hard', hardcore: true }));
    check('resolveDiff carries the groups, frozen', r.ai.flank === ZD.ZDIFF.hard.ai.flank && Object.isFrozen(r.director) && Object.isFrozen(r.director.fronts));
    check('waveStats has a mod field (null)', ZD.waveStats(7).mod === null && 'mod' in ZD.waveStats(1, { diff: ZD.ZDIFF.nightmare, crowd: 3 }));
    const ev = ['stagger', 'shove', 'front', 'pace', 'save', 'combo'];
    check('M2 events registered', ev.every((n) => RS.EVENT_TYPES.has(n)), ev.filter((n) => !RS.EVENT_TYPES.has(n)).join(' '));
    return false;
  });

  // ---------------------------------------------------------------- the modules and their hooks
  steps.push(async () => {
    newRun();
    listen();
    const mods = ['staggers', 'shove', 'horde', 'director', 'roster', 'threats'];
    const api = ['tick', 'hud', 'frame', 'command'];
    const lacking = mods.flatMap((m) => api.filter((f) => typeof Z()[m]?.[f] !== 'function').map((f) => `${m}.${f}`));
    check('M2 modules built with tick / hud / frame / command', !lacking.length, lacking.join(' '));
    check('stagger / spawn / fronts APIs', typeof Z().stagger === 'function' && typeof Z().director.queue === 'function' && typeof Z().director.surge === 'function' && typeof Z().specials.threats === 'function' && typeof Z().specials.letGo === 'function' && typeof Z().roster.pick === 'function' && typeof Z().horde.field === 'function');
    check('unclaimed commands still fall through', Z().command(me(), 'zm2_nothing', []) === false && /Unknown command/.test(con('zm2_nothing')));
    // hooks are reached: tick, frame, hud, flow
    const n = { tick: 0, frame: 0, hud: 0, flow: 0, next: 0, max: 0, interval: 0, plan: 0, spawned: 0, hold: 0 };
    const spy = (o, f, k) => { const f0 = o[f].bind(o); o[f] = (...a) => { n[k]++; return f0(...a); }; return () => { o[f] = f0; }; };
    const undo = [spy(Z().threats, 'tick', 'tick'), spy(Z().director, 'frame', 'frame'), spy(Z().director, 'hud', 'hud'), spy(Z().horde, 'flow', 'flow'),
      spy(Z().director, 'next', 'next'), spy(Z().director, 'maxAlive', 'max'), spy(Z().director, 'interval', 'interval'), spy(Z().director, 'plan', 'plan'), spy(Z().horde, 'spawned', 'spawned')];
    con('sv_cheats 1');
    con('zm_wave 6');
    for (let i = 0; i < 300; i++) { g.tick(); if (i % 10 === 0) g.frame(0.1); }
    const HS = await import('/src/game/hudstate.js');
    const s = HS.buildHudState(g);
    undo.forEach((f) => f());
    check('hooks reached', n.tick >= 300 && n.frame > 0 && n.hud > 0 && n.flow > 0 && n.plan === 1 && n.next > 0 && n.next === n.interval && n.max >= n.next && n.spawned > 0, JSON.stringify(n));
    check('hud state still built', !!s.radar && s.radar.blips.some((b) => b.kind === 'enemy'));
    check('wave start carries mod (none yet)', of('wave', (e) => e.phase === 'start').length === 1 && of('wave', (e) => e.phase === 'start')[0].mod === null && Z().stats.mod === null);
    // the commons: today's crowd, with a variant
    const c = commons(), S = Z().stats;
    const bad = c.filter((z) => !(z.variant === 'walker' || z.variant === 'runner'));
    check('commons carry z.variant (walker / runner)', c.length > 3 && !bad.length, `${c.length} up, ${bad.map((z) => z.variant)}`);
    const runOk = c.every((z) => z.variant === 'runner' ? z.zSpeed >= 262 && z.zSpeed <= 280 : z.zSpeed >= S.speed * 0.9 - 1e-6 && z.zSpeed <= S.speed * 1.06 + 1e-6);
    check('runner / walker speeds as before', runOk, c.map((z) => `${z.variant[0]}${z.zSpeed | 0}`).join(' '));
    // (hordeai: a flanker keeps a side field, z.field 1..fields; close ones hold a ring slot)
    check('per-zombie M2 fields reset', c.every((z) => z.front === null && z.staggerUntil === 0 && z.staggerKind === null && z.poise === 0 && z.field >= 0 && z.field <= Z().diff.ai.fields && z.slot >= -1 && z.skin === 'zombie'));
    check('horde.field: the main field, or a flanker\'s side field', c.every((z) => { const f = Z().horde.field(z); return f === Z().dist || (z.field > 0 && f === Z().horde.side[z.field - 1]); }));
    // kill payload: the variant
    const z0 = c[0], v0 = z0.variant;
    const R = Z().roster, adj0 = R.adjust, die0 = R.onDeath;
    let adj = 0, died = 0;
    R.adjust = (...a) => { adj++; return adj0.apply(R, a); };
    R.onDeath = (...a) => { died++; return die0.apply(R, a); };
    g.damagePlayer(z0, me(), 99999, 1, 'deagle', [1, 0, 0], z0.eyePos());
    R.adjust = adj0; R.onDeath = die0;
    check('kill event carries the variant', of('kill', (e) => e.victim === z0 && e.variant === v0).length === 1, v0);
    check('roster.adjust / onDeath reached for a common', adj === 1 && died === 1, `adjust ${adj} onDeath ${died}`);
    return false;
  });

  // ---------------------------------------------------------------- the director's seam: queue and fronts
  steps.push(async () => {
    const bots = await import('/src/game/bots.js');
    const D = Z().director;
    const fr = D.fronts();
    const small = fr.filter((f) => f.nodes.length < 10);
    check('dust2 fronts', fr.length >= 6 && !small.length, fr.map((f) => `${f.id}:${f.nodes.length}`).join(' '));
    check('candidates: a front\'s nodes, null for unknown', D.candidates('tunnels') === D.front('tunnels').nodes && D.candidates('nope') === null);
    // pickSpawn in a front (or anywhere if it can't)
    const T = D.front('tunnels'), zones = new Set(T.zones);
    let inside = 0, tries = 0;
    for (let i = 0; i < 12; i++) { const n = Z().pickSpawn('tunnels'); if (!n) continue; tries++; if (zones.has(bots.zoneOf([n.x, n.y, n.z])?.[0])) inside++; }
    check('pickSpawn(front) spawns in it', tries > 0 && inside === tries, `${inside}/${tries} (you at ${bots.calloutOf(me().pm.origin)})`);
    check('pickSpawn(unknown front) falls back', !!Z().pickSpawn('nope'));
    // queued spawns come first once due, are counted, keep variant and front
    Z().clearHorde();
    const sp0 = Z().spawned;
    D.queue(null, { variant: 'runner', front: 'tunnels', at: g.time + 0.5 });
    D.queue('hunter', { at: g.time });
    Z().nextSpawn = 0; ticks(1);
    const hunter = Z().pool.find((z) => z.alive && z.special === 'hunter');
    check('a due queued special spawns next, counted', !!hunter && !hunter.extra && Z().spawned === sp0 + 1, `spawned +${Z().spawned - sp0}`);
    ticks(60); Z().nextSpawn = 0; ticks(1);
    const r = commons().find((z) => z.front === 'tunnels');
    check('a queued common keeps its variant and front', !!r && r.variant === 'runner' && zones.has(bots.zoneOf(r.pm.origin)?.[0]) && D.pending.length === 0, r ? `${r.variant} at ${bots.calloutOf(r.pm.origin)}` : 'none');
    // spawnZombie({ variant }) directly
    const nUp = commons().length;
    Z().spawnZombie({ variant: 'walker', near: me().pm.origin });
    const w = commons().find((z) => z.extra && z.variant === 'walker');
    check('spawnZombie({ variant })', commons().length === nUp + 1 && !!w);
    const counted = () => commons().filter((z) => !z.extra).length, c0 = counted();
    Z().spawnZombie({ variant: 'runner', near: me().pm.origin, extra: false });
    check('spawnZombie({ near, extra: false }) is counted', counted() === c0 + 1, `${c0} -> ${counted()}`);
    Z().specials.spawn('boomer', { extra: true, front: 'tspawn' });
    const b = Z().pool.find((z) => z.alive && z.special === 'boomer');
    check('specials.spawn({ front }) passes it on', !!b && b.front === 'tspawn' && b.variant === null);
    return false;
  });

  // ---------------------------------------------------------------- stagger
  steps.push(async () => {
    Z().clearHorde();
    rec = [];
    const o = me().pm.origin;
    Z().spawnZombie({ variant: 'walker', near: o });
    const z = commons()[0];
    ticks(5);
    const t0 = g.time;
    const dir = [1, 0, 0];
    z.windup = t0 + 0.2;
    const held = Z().stagger(z, 1, dir, 'shove', me());
    check('stagger(z, 1) holds it', held > 0.4 && held <= 1.2 && z.staggerUntil > t0 && z.staggerKind === 'stagger' && z.windup === 0, `held ${held.toFixed(2)}`);
    const e = of('stagger')[0];
    check('stagger event', !!e && e.zombie === z && e.by === me().name && e.src === 'shove' && e.kind === 'stagger');
    let moved = 0, swung = 0;
    for (let i = 0; i < 35; i++) { g.tick(); if (z.cmd && (z.cmd.forwardmove || z.cmd.sidemove)) moved++; if (z.windup) swung++; }
    check('no step, no swing while held', moved === 0 && swung === 0, `moved ${moved} swung ${swung}`);
    ticks(Math.ceil((z.staggerUntil - g.time) / 0.01) + 30);
    check('then it comes on again', z.alive && z.cmd && (z.cmd.forwardmove !== 0 || flat(z.pm.origin, o) < 80), `fm ${z.cmd?.forwardmove}`);
    const u0 = z.staggerUntil;
    check('a flinch holds nothing', Z().stagger(z, 0.2, dir, 'glock18', me()) === 0 && z.staggerUntil === u0 && z.staggerKind === 'flinch');
    rec = [];
    Z().stagger(z, 1, null, 'director', null);
    check('no event without a squad culprit', of('stagger').length === 0);
    con('zm_boss 0');
    const boss = g.bosses.boss;
    check('bosses never stagger', !!boss && Z().stagger(boss, 3, dir, 'm3', me()) === 0 && !boss.staggerUntil);
    g.bosses.despawn();
    return false;
  });

  // ---------------------------------------------------------------- threats and letGo
  steps.push(async () => {
    Z().clearHorde();
    Z().specials.spawn('hunter', { extra: true, near: me().pm.origin.slice() });
    const h = Z().pool.find((z) => z.alive && z.special === 'hunter');
    check('no threat while it just chases', Z().specials.threats().length === 0);
    h.sp.state = 'wind'; h.sp.until = g.time + 0.3; h.target = me();
    let th = Z().specials.threats();
    check('a windup shows', th.length === 1 && th[0].z === h && th[0].kind === 'hunter' && th[0].phase === 'windup' && Math.abs(th[0].left - 0.3) < 0.02 && th[0].target === me() && th[0].pos.length === 3);
    const rec0 = th[0];
    Z().specials.pin(h, me());
    th = Z().specials.threats();
    check('a pin shows as hold (records reused)', th.length === 1 && th[0] === rec0 && th[0].phase === 'hold' && th[0].target === me() && me().pinnedBy === h);
    Z().specials.letGo(h, me());
    check('letGo frees him (and says who did)', me().pinnedBy === null && h.sp.state === 'recover' && h.sp.freedBy === me() && Z().specials.threats().length === 0);
    Z().specials.spawn('smoker', { extra: true, near: me().pm.origin.slice() });
    const s = Z().pool.find((z) => z.alive && z.special === 'smoker');
    s.sp.state = 'pull'; s.sp.victim = me(); me().tonguedBy = s;
    th = Z().specials.threats();
    check('a smoker pulling shows as hold', th.some((r) => r.z === s && r.phase === 'hold' && r.target === me()));
    Z().specials.letGo(s);
    check('letGo snaps the tongue', me().tonguedBy === null && s.sp.state === 'recover');
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- scaffolds idle: the mode plays as before
  steps.push(async () => {
    newRun({ allies: 1 });
    listen();
    me().god = true;
    con('sv_cheats 1');
    con('zm_wave 3');
    const o = me().pm.origin.slice();
    let close = 0, specials = 0;
    for (let i = 0; i < 1500; i++) {
      g.tick();
      if (i % 25 === 0) g.frame(0.25);
      for (const z of Z().pool) if (z.alive && flat(z.pm.origin, o) < 200) { close++; break; }
    }
    specials = Z().pool.filter((z) => z.special).length;
    check('zombies still find you', close > 0 && Z().spawned > 5, `spawned ${Z().spawned}, ticks with one close ${close}, special bodies ${specials}`);
    check('no stagger events with nothing calling it', of('stagger').length === 0);
    check('the wave plays out', Z().state === 'wave' || Z().state === 'break', Z().state);
    return true;
  });

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
