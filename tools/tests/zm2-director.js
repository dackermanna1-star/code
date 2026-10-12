// Zombie survival, Milestone 2.4: the wave director (director.js) - named spawn fronts with
// callouts, the horde roar and the edge arrows; the trickle -> surge -> calm -> final push
// pacing; the wave-type deck (never the last two, never on a boss wave) and what each type
// does (Horde Rush, Specials Squad, Crawler Swarm, The Dead Rise, Iron Rain, Twin Elites);
// the BSP fallback (fronts clustered by path distance); the ping-based radar.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm2-director.js /tmp/zm2d
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a summary; the last step returns a screenshot
// (banner, callout, arrows).
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const D = () => g.zombies.director;
  const me = () => g.local;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push({ type: e.type, phase: e.phase, id: e.id, name: e.name, pos: e.pos && e.pos.slice(), front: e.front, by: e.by, mod: e.mod, t: e.t, n: Z().spawned })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  let prints = [], sounds = [];
  const spyOut = () => {
    const cp0 = g.hud.centerPrint, sp0 = g.sound?.play;
    g.hud.centerPrint = function (txt, s, ch) { if (txt) prints.push(String(txt)); return cp0.call(this, txt, s, ch); };
    if (sp0) g.sound.play = function (name, o) { sounds.push({ name, pos: o?.pos ? o.pos.slice() : null }); return sp0.call(this, name, o); };
    return () => { g.hud.centerPrint = cp0; if (sp0) g.sound.play = sp0; };
  };
  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
    con('zm_god_squad');
  }
  // the squad as a turret: whatever comes within r of anyone in it dies (so waves play out)
  const turret = (r = 550) => {
    const sq = g.players.filter((p) => p.alive && p.team === 'CT' && !p.isZombie);
    for (const z of Z().pool) if (z.alive && sq.some((p) => flat(p.pm.origin, z.pm.origin) < r)) g.damagePlayer(z, me(), 99999, 1, 'deagle', [1, 0, 0], z.eyePos());
  };
  const commons = () => Z().pool.filter((z) => z.alive && !z.special);
  let M, ZD, RS, bots, roster, HS, specialsM;
  const steps = [];

  // ---------------------------------------------------------------- tables, the sound, the difficulty rows
  steps.push(async () => {
    M = await import('/src/game/director.js');
    ZD = await import('/src/game/zdiff.js');
    RS = await import('/src/assets/snd/recipes.js');
    bots = await import('/src/game/bots.js');
    roster = await import('/src/game/zroster.js');
    HS = await import('/src/game/hudstate.js');
    specialsM = await import('/src/game/specials.js');
    const ids = ['rush', 'specials', 'crawlers', 'risen', 'iron', 'elites'];
    check('six wave types with banners', ids.every((id) => M.MODS[id]?.label && M.MODS[id].sub && M.MODS[id].weight > 0), ids.map((id) => M.MODS[id]?.label).join(', '));
    check('crawler swarm / iron rain need the roster\'s variants', M.MODS.crawlers.needs === 'crawler' && M.MODS.iron.needs === 'riot');
    const F = M.ZOMBIE_FRONTS.de_dust2;
    check('dust2 fronts placed by hand', F.length === 7 && F.every((f) => f.name && f.via && f.zones.length && f.mouth?.length === 2), F.map((f) => f.id).join(' '));
    check('horde_roar is catalogued', Object.values(RS.SOUND_GROUPS).flat().includes('horde_roar') && !!RS.DEFS.horde_roar);
    const up = (f) => ['casual', 'normal', 'hard', 'nightmare'].map((id) => ZD.ZDIFF[id].director[f]).every((v, i, a) => !i || v >= a[i - 1]);
    check('director rows: pressure grows casual -> nightmare', ['surge', 'surgeAlive', 'modChance', 'power', 'push', 'trickle'].every(up) && ['casual', 'normal', 'hard', 'nightmare'].map((id) => ZD.ZDIFF[id].director.spread).every((v, i, a) => !i || v <= a[i - 1]));
    check('normal keeps a calm and the trickle under maxAlive', ZD.ZDIFF.normal.director.calm >= 4 && ZD.ZDIFF.normal.director.trickle < 1);
    // the sound bank renders in the background
    for (let i = 0; i < 40 && !g.sound?.bank?.get?.('horde_roar'); i++) await new Promise((r) => globalThis.setTimeout(r, 250));
    check('horde_roar in the bank', !!g.sound?.bank?.get?.('horde_roar'));
    return false;
  });

  // ---------------------------------------------------------------- fronts: which open, callout, roar, arrows, where they spawn
  steps.push(async () => {
    newRun();
    listen();
    const undo = spyOut();
    prints = []; sounds = [];
    con('zm_mod none');
    con('zm_wave 6');
    const opened = of('front', (e) => e.phase === 'open');
    const R = Z().diff.director.fronts;
    check('a wave opens diff.director.fronts fronts', opened.length >= R[0] && opened.length <= R[1] && opened.every((e) => D().front(e.id) && e.pos?.length === 3), opened.map((e) => e.name).join(', '));
    const call = prints.find((p) => /They're coming/.test(p));
    check('the callout names them', !!call && opened.every((e) => call.includes(e.name)), call);
    const ip = prints.indexOf(prints.find((p) => /^WAVE 6/.test(p)));
    check('callout after the stock WAVE print', ip >= 0 && prints.indexOf(call) > ip);
    const roars = sounds.filter((s) => s.name === 'horde_roar');
    const eye = g.camPos || me().eyePos(); // (the listener)
    check('a positional horde roar per front (carries: within 1400 u)', roars.length === opened.length && roars.every((s) => s.pos && flat(s.pos, eye) <= 1401), roars.map((s) => Math.round(flat(s.pos, eye))).join(' '));
    const ar = D().arrows.filter((a) => a.f && g.time - a.t0 < 1);
    check('an arrow per front', ar.length === opened.length && ar.every((a) => D().open.includes(a.f)));
    // the squad's own corner never opens (CT spawn); over many plans the counts stay in range
    const seen = {};
    let bad = 0;
    for (let i = 0; i < 40; i++) {
      D().plan(6, ZD.waveStats(6, Z().waveOpts()), false);
      for (const f of D().open) seen[f.id] = (seen[f.id] || 0) + 1;
      if (D().open.length < R[0] || D().open.length > R[1]) bad++;
    }
    check('the squad\'s corner never opens', !seen.ctspawn, `you at ${bots.calloutOf(me().pm.origin)}; opened ${JSON.stringify(seen)}`);
    check('front counts in range, more than one front used', !bad && Object.keys(seen).length >= 3);
    undo();
    // play the wave: commons come in by the open fronts
    Z().clearHorde();
    con('zm_wave 6');
    const open = new Set(D().open.map((f) => f.id)), zones = new Set(D().open.flatMap((f) => f.zones));
    let n = 0, inFront = 0, inZone = 0;
    const seenZ = new Set();
    for (let i = 0; i < 2500 && Z().state === 'wave'; i++) {
      g.tick();
      for (const z of Z().pool) {
        if (!z.alive || seenZ.has(z)) continue;
        seenZ.add(z);
        if (z.special || z.extra) continue;
        n++;
        if (open.has(z.front)) inFront++;
        if (zones.has(bots.zoneOf(z.pm.origin)?.[0])) inZone++;
      }
      for (const z of Z().pool) if (!z.alive) seenZ.delete(z);
      if (i % 5 === 0) turret();
    }
    const want = 1 - Z().diff.director.spread - 0.2; // (diff.director.spread of the trickle comes from anywhere)
    check('commons come by the open fronts', n > 5 && inFront / n >= want && inZone / n >= want - 0.1, `${n} spawned, front ${inFront}, in its zones ${inZone}`);
    return false;
  });

  // ---------------------------------------------------------------- pacing: trickle -> surge -> calm -> push
  steps.push(async () => {
    newRun();
    listen();
    Z().specials.pick = () => null; // (commons only: cleaner counts)
    con('zm_mod none');
    con('zm_wave 9');
    const S = Z().stats, dd = Z().diff.director;
    const cap = { trickle: Math.max(2, Math.round(S.maxAlive * dd.trickle)), surge: Math.min(28, Math.max(S.maxAlive + 1, Math.round(S.maxAlive * dd.surgeAlive))), push: Math.min(28, Math.round(S.maxAlive * dd.push)) };
    const top = {}, surgeFront = { n: 0, ok: 0 };
    let calmSpawns = 0, last = Z().spawned;
    for (let i = 0; i < 15000 && Z().state === 'wave'; i++) {
      g.tick();
      // on a tick something came up: how many are up against the phase it came up in
      if (Z().spawned > last) {
        const ph = D().phase, up = Z().pool.filter((z) => z.alive).length;
        top[ph] = Math.max(top[ph] || 0, up);
        if (ph === 'calm') calmSpawns += Z().spawned - last;
        if (ph === 'surge') for (const z of Z().pool) if (z.alive && !z._dirSeen) { surgeFront.n++; if (z.front === D().surgeFront?.id) surgeFront.ok++; }
        last = Z().spawned;
      }
      for (const z of Z().pool) z._dirSeen = z.alive ? 1 : 0;
      if (i % 5 === 0) turret();
    }
    delete Z().specials.pick;
    const seq = of('pace').map((e) => e.phase);
    check('pace runs trickle -> surge -> calm -> push', seq[0] === 'trickle' && seq.includes('surge') && seq.indexOf('calm') > seq.indexOf('surge') && seq.includes('push'), seq.join(' '));
    check('nothing new comes in a calm', calmSpawns === 0, `${calmSpawns}`);
    check('a surge goes over the trickle, within its cap', (top.surge || 0) <= cap.surge && (top.trickle || 0) <= cap.trickle && cap.surge > cap.trickle, `${JSON.stringify(top)} caps ${JSON.stringify(cap)}`);
    check('a surge comes from one front', surgeFront.n > 0 && surgeFront.ok / surgeFront.n >= 0.75, `${surgeFront.ok}/${surgeFront.n}`);
    check('surges are announced', of('pace', (e) => e.phase === 'surge').every((e) => e.by === 'director'));
    check('the wave plays out, counted right', Z().state === 'break' && Z().spawned === Z().stats.count && of('front', (e) => e.phase === 'close').length >= 1, `${Z().state} ${Z().spawned}/${Z().stats.count}`);
    return false;
  });

  // ---------------------------------------------------------------- the deck
  steps.push(async () => {
    newRun();
    const d0 = Z().diff;
    Z().diff = { ...d0, director: { ...d0.director, modChance: 1 } };
    D().history.length = 0;
    const drawn = [];
    let repeats = 0, onBoss = 0, early = 0, gated = 0;
    for (let n = 1; n <= 90; n++) {
      const boss = n % 5 === 0;
      const S = D().plan(n, ZD.waveStats(n, Z().waveOpts()), boss);
      const m = S.mod;
      if (boss && m) onBoss++;
      if (m && n < d0.director.modsFrom) early++;
      if (m && M.MODS[m].needs && !(roster.COMMONS[M.MODS[m].needs]?.weight > 0)) gated++;
      if (m) { const k = drawn.length; if ((k && drawn[k - 1] === m) || (k > 1 && drawn[k - 2] === m)) repeats++; drawn.push(m); }
    }
    Z().diff = d0;
    const kinds = new Set(drawn);
    check('every 5th wave left to the boss', onBoss === 0);
    check('never one of the last two', repeats === 0 && drawn.length > 30, `${drawn.length} drawn: ${drawn.slice(0, 12).join(' ')}...`);
    check('no type before modsFrom', early === 0);
    check('types whose variant isn\'t built stay out of the deck', gated === 0, `crawler weight ${roster.COMMONS.crawler.weight}, riot ${roster.COMMONS.riot.weight}`);
    check('rush, specials and elites all come up', ['rush', 'specials', 'elites'].every((k) => kinds.has(k)), [...kinds].join(' '));
    // what each does to the stats
    const base = ZD.waveStats(9, Z().waveOpts());
    const playAs = (id) => { D().force = id; return D().plan(9, base, false); };
    const r = playAs('rush');
    check('horde rush: more, weaker, more runners, faster', r.mod === 'rush' && r.count > base.count && r.health < base.health && r.runners > base.runners && D().X.interval < 1);
    const sp = playAs('specials');
    check('specials squad: specials far likelier, one more of a kind', sp.special > base.special * 1.8 && sp.perKind === base.perKind + 1 && sp.count < base.count);
    const el = playAs('elites');
    check('twin elites: two elite specials queued', D().pending.filter((q) => q.elite > 1 && q.kind).length === 2 && el.count >= 4);
    const cr = playAs('crawlers');
    check('crawler swarm asks for crawlers', cr.mod === 'crawlers' && D().X.variant === 'crawler' && D().X.share >= 0.4);
    const ir = playAs('iron');
    check('iron rain asks for riot zombies', ir.mod === 'iron' && D().X.variant === 'riot' && D().X.share > 0.2);
    check('a boss wave has no type, even forced', (() => { D().force = 'rush'; const b = D().plan(10, base, true); const ok = b.mod === null && D().force === 'rush'; D().force = undefined; return ok; })());
    check('zm_mod sets the next wave (cheat)', /HORDE RUSH/.test(con('zm_mod rush')) && D().force === 'rush' && /usage/.test(con('zm_mod nope')));
    D().force = undefined;
    return false;
  });

  // ---------------------------------------------------------------- twin elites, live
  steps.push(async () => {
    newRun();
    con('zm_mod elites');
    con('zm_wave 7');
    const S = Z().stats, seenEl = new Map();
    for (let i = 0; i < 2600 && seenEl.size < 2; i++) {
      g.tick();
      for (const z of Z().pool) if (z.alive && z.elite && !seenEl.has(z)) seenEl.set(z, { name: z.name, maxHealth: z.maxHealth, special: z.special, extra: z.extra });
      if (i % 5 === 0) turret();
    }
    const el = [...seenEl.values()];
    const okHp = el.every((z) => z.maxHealth >= Math.round(S.health * specialsM.SPECIALS[z.special].hp) * 1.5);
    check('two elites arrive', el.length === 2 && el.every((z) => /^Elite /.test(z.name) && !z.extra && z.special), el.map((z) => `${z.name} ${z.maxHealth}hp`).join(', '));
    check('elites are tougher', okHp && el.length === 2);
    // the body comes back as a plain special afterwards
    const z0 = [...seenEl.keys()][0];
    if (z0?.alive) g.damagePlayer(z0, me(), 99999, 1, 'deagle', [1, 0, 0], z0.eyePos());
    Z().clearHorde();
    if (z0) z0.deathTime = 0; // (its body is free right away)
    Z().specials.spawn(z0?.special || 'hunter', { extra: true, near: me().pm.origin.slice() });
    const plain = Z().pool.find((z) => z.alive && z.special === (z0?.special || 'hunter'));
    check('a reused body is no elite', !!plain && !plain.elite && !/^Elite/.test(plain.name));
    return false;
  });

  // ---------------------------------------------------------------- the dead rise
  steps.push(async () => {
    newRun();
    check('the dead rise needs bodies (none yet)', !D().available('risen'));
    // a field of bodies 800-1500 u off (the squad at CT spawn): kill and bake some commons there
    const spot = D().front('mid').mouth || D().front('mid').pos;
    for (let i = 0; i < 14; i++) {
      Z().spawnZombie({ near: spot });
      const z = Z().pool.find((q) => q.alive && !q.special);
      if (!z) break;
      g.frame(0.016);
      g.damagePlayer(z, me(), 99999, 1, 'deagle', [1, 0, 0], z.eyePos());
      for (let k = 0; k < 30; k++) { g.tick(); if (k % 5 === 0) g.frame(0.05); } // (the body follows its ragdoll on frames)
      g.gore.bakePlayer(z);
    }
    const nRec = g.gore.records.length;
    check('bodies to raise', D().available('risen'), `${nRec} records`);
    listen();
    prints = [];
    const undo = spyOut();
    const sz0 = Z().spawnZombie;
    let risen = 0;
    Z().spawnZombie = function (o = {}) { const r = sz0.call(this, o); if (r && o.risen && o.at && o.extra === false) risen++; return r; };
    con('zm_mod risen');
    con('zm_wave 6');
    const want = D().riseLeft;
    for (let i = 0; i < 4000 && Z().state === 'wave'; i++) { g.tick(); if (i % 5 === 0) turret(); }
    Z().spawnZombie = sz0;
    undo();
    check('bodies get up, counted in the wave', want > 0 && risen >= Math.min(want, 2) && Z().spawned <= Z().stats.count, `${risen} risen of ${want} planned, ${Z().spawned}/${Z().stats.count}`);
    check('the dead rise is called out', prints.some((p) => /getting back up/.test(p)));
    check('the wave still plays out', Z().state === 'break' || Z().spawned === Z().stats.count, `${Z().state} ${Z().spawned}/${Z().stats.count}`);
    return false;
  });

  // ---------------------------------------------------------------- crawler swarm / iron rain ask the roster (walker look until it's built)
  steps.push(async () => {
    newRun();
    Z().specials.pick = () => null;
    const sz0 = Z().spawnZombie, asked = {};
    let all = 0;
    Z().spawnZombie = function (o = {}) { if (!o.at && !o.near && !o.special) { all++; asked[o.variant || 'any'] = (asked[o.variant || 'any'] || 0) + 1; } return sz0.call(this, o); };
    con('zm_mod crawlers');
    con('zm_wave 6');
    for (let i = 0; i < 3000 && Z().state === 'wave'; i++) { g.tick(); if (i % 5 === 0) turret(); }
    Z().spawnZombie = sz0;
    delete Z().specials.pick;
    const share = (asked.crawler || 0) / Math.max(1, all);
    check('crawler swarm: many commons asked as crawlers', all >= 8 && share >= 0.25, `${JSON.stringify(asked)}`);
    const c = commons().filter((z) => z.variant === 'crawler');
    check('the roster takes the variant (falls back to the walker look if not built)', c.length === 0 || c.every((z) => z.alive), `${c.length} crawlers up`);
    return false;
  });

  // ---------------------------------------------------------------- surge on request (the screamer)
  steps.push(async () => {
    newRun();
    listen();
    prints = [];
    const undo = spyOut();
    con('zm_mod none');
    con('zm_wave 8');
    ticks(150);
    D().lastSurge = -99;
    const scr = Z().pool.find((z) => z.alive) || { pm: { origin: me().pm.origin } };
    const ok = D().surge(scr, { by: 'screamer' });
    const again = D().surge(scr, { by: 'screamer' });
    undo();
    check('surge(src, { by: screamer }) starts one', ok && D().phase === 'surge' && of('pace', (e) => e.phase === 'surge' && e.by === 'screamer').length === 1);
    check('no surge on top of a surge', again === false);
    check('the screamer\'s surge is called out', prints.some((p) => /screamer/i.test(p)));
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- the radar: pings on normal, full on casual, hardcore's sweep
  steps.push(async () => {
    newRun();
    con('zm_wave 3');
    Z().clearHorde();
    Z().state = 'wave'; Z().spawned = Z().stats.count = 999; // (nothing else comes in)
    const nav = g.nav, o = me().pm.origin, eye = me().eyePos();
    const node = (lo, hi, f = () => true) => nav.nodes.find((n) => { const d = Math.hypot(n.x - o[0], n.y - o[1]); return d > lo && d < hi && Math.abs(n.z - o[2]) < 120 && f(n); });
    for (const p of g.players) if (p.isBot && p.team === 'CT') p.alive = false; // (only you look and listen)
    const put = (n) => {
      if (!n) return null;
      const before = new Set(Z().pool.filter((q) => q.alive));
      if (!Z().spawnZombie({ at: [n.x, n.y, n.z + 37], extra: true })) return null;
      const z = Z().pool.find((q) => q.alive && !before.has(q));
      z.nextGrowl = 1e9; z.growlT = undefined; z.radarT = -99; z.radarNext = 0;
      return z;
    };
    const near = put(node(200, 350));
    const tsp = D().front('tspawn').nodes[0];
    const far = put(tsp);
    const blipOf = (s, z) => s.radar.blips.some((b) => b.kind === 'enemy' && Math.abs(b.x - z.pm.origin[0]) < 1 && Math.abs(b.y - z.pm.origin[1]) < 1);
    let s = HS.buildHudState(g);
    check('pings: close by shows', !!near && blipOf(s, near));
    check('pings: far and unseen doesn\'t', !!far && !blipOf(s, far));
    // heard: a growl within earshot
    const mid = put(node(800, 1100, (n) => !g.visible(eye, [n.x, n.y, n.z + 64])));
    s = HS.buildHudState(g);
    const before = mid && blipOf(s, mid);
    if (mid) mid.growlT = g.time;
    s = HS.buildHudState(g);
    check('pings: a growl within earshot shows', !!mid && !before && blipOf(s, mid));
    // seen: in front of you, nothing in between
    const vis = node(600, 1500, (n) => g.visible(eye, [n.x, n.y, n.z + 57]));
    const seenZ = vis && put(vis);
    if (seenZ) { me().pm.angles[1] = Math.atan2(vis.y - o[1], vis.x - o[0]) * 180 / Math.PI; }
    s = HS.buildHudState(g);
    check('pings: seen shows', !!seenZ && blipOf(s, seenZ), vis ? `${Math.round(Math.hypot(vis.x - o[0], vis.y - o[1]))} u` : 'no spot');
    // it stays a moment, then goes
    if (seenZ) { me().pm.angles[1] += 180; }
    g.time += 0.5;
    s = HS.buildHudState(g);
    const stays = seenZ && blipOf(s, seenZ);
    g.time += 2;
    s = HS.buildHudState(g);
    check('pings: a seen one stays a moment, then fades', !!stays && !blipOf(s, seenZ));
    // casual: every zombie
    newRun({ zdiff: 'casual' });
    con('zm_wave 3');
    ticks(400);
    s = HS.buildHudState(g);
    const up = Z().pool.filter((z) => z.alive).length;
    check('casual: full blips', up > 0 && s.radar.blips.filter((b) => b.kind === 'enemy').length === up, `${up} up`);
    // hardcore: zfeedback's sweep, untouched
    newRun({ hardcore: 1 });
    con('zm_wave 3');
    ticks(400);
    s = HS.buildHudState(g);
    check('hardcore keeps its sweep', !s.radar.blips.some((b) => D().pings.includes(b)));
    return false;
  });

  // ---------------------------------------------------------------- BSP maps: fronts by clustering the spawn nodes
  steps.push(async () => {
    newRun();
    const d = D(), cands = Z().spawnCandidates();
    const save = [d.frontsBy, d.frontsList, d.frontsFor];
    d.frontsBy = new Map(); d.frontsList = [];
    const t0 = globalThis.performance.now();
    d.cluster(cands);
    const ms = globalThis.performance.now() - t0;
    const cl = d.frontsList;
    const names = cl.map((f) => f.name), assigned = cl.reduce((a, f) => a + f.nodes.length, 0);
    check('clusters: 3-6 named by compass', cl.length >= 3 && cl.length <= 6 && new Set(names).size === names.length && cl.every((f) => /^((UPPER|LOWER) )?(NORTH|SOUTH|EAST|WEST)/.test(f.name) && f.via === 'from the'), names.join(', '));
    check('clusters cover the spawn nodes', assigned >= cands.length * 0.95 && new Set(cl.map((f) => f.id)).size === cl.length, `${assigned}/${cands.length} in ${ms.toFixed(0)} ms`);
    // compact: a cluster's nodes sit around its middle (much tighter than the whole map's spread)
    const spread = (nodes, c) => nodes.reduce((a, n) => a + Math.hypot(n.x - c[0], n.y - c[1]), 0) / nodes.length;
    let mx = 0, my = 0;
    for (const n of cands) { mx += n.x; my += n.y; }
    const all = spread(cands, [mx / cands.length, my / cands.length]);
    check('clusters are compact', cl.every((f) => spread(f.nodes, f.pos) < all * 0.8), cl.map((f) => Math.round(spread(f.nodes, f.pos))).join(' ') + ` vs ${Math.round(all)}`);
    // a cluster plays as a front
    d.frontsBy = new Map(cl.map((f) => [f.id, f]));
    const big = cl.find((f) => f.nodes.length >= M.MIN_FRONT);
    check('a cluster is a front: candidates() / callout', !!big && d.candidates(big.id) === big.nodes && /coming from the /.test(d.callout([big])), big && d.callout([big]));
    [d.frontsBy, d.frontsList, d.frontsFor] = save;
    d.frontsFor = null; // (rebuilt for the map on the next use)
    check('the map\'s own fronts come back', d.fronts().length === 7);
    return false;
  });

  // ---------------------------------------------------------------- picture: the banner, the callout, the arrows
  steps.push(async () => {
    newRun();
    Z().specials.pick = () => null;
    con('zm_mod rush');
    con('zm_wave 9');
    const f = D().open[0], o = me().pm.origin;
    me().pm.angles[1] = Math.atan2(f.exit[1] - o[1], f.exit[0] - o[0]) * 180 / Math.PI - 80;
    for (let i = 0; i < 40; i++) { g.tick(); if (i % 10 === 0) g.frame(0.1); }
    g.frame(0.016);
    delete Z().specials.pick;
    check('banner up', D().mod === 'rush' && g.time - D().bannerT < 4.5);
    out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return 'shot';
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    if (i >= steps.length) return { log: '', done: true };
    let done = false, shot = false;
    try { const r = await steps[i++](); if (r === 'shot') { shot = true; done = true; } else done = r; } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; }
    if (i >= steps.length) done = true;
    if (done && !shot) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done: done && !shot, shot };
  };
})();
