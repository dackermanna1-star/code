// Zombie survival, Milestone 3.4: the boss overhaul (bosses.js, bossstage.js, zelites.js,
// relics.js, src/ui/bossbar.js) - the seeded boss order (all five before any repeats, never
// the same twice in a row), health by the wave it comes in (no tankier), the staged arrival
// (rumble, a roar from its direction, the commons backing off, the lights dipping and coming
// back to the player's own setting, the title card), posture (what builds it, bots less, the
// break: kneel, x damage, the weak point, the hit-stop, recovery and a bigger bar, draining),
// phases (66% / 33%, a move each, held a moment until it's seen; Nightmare's third a frenzy) and every phase move doing its
// thing, the trophy flow (heal and armour, the trophy, your relic offer with the boss's
// signature relic, bots leave it), the relics, the elites (Alpha Hunter, Juggernaut: queued on
// odd waves only, their health, the bar, the plough, the drop), the sounds and the HUD.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-bosses.js /tmp/zm3b
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a summary line; the last step takes a screenshot.
/* global localStorage */
(() => {
  const g = window.__game, DEG = Math.PI / 180;
  const saved = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/zombies/.test(k)) saved[k] = localStorage.getItem(k); }
  const restore = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/zombies/.test(k) && !(k in saved)) localStorage.removeItem(k); }
    for (const k in saved) localStorage.setItem(k, saved[k]);
  };
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const B = () => g.bosses;
  const me = () => g.local;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const botPs = () => squad().filter((p) => p.isBot);
  const H = { HEAD: 1, CHEST: 2, STOMACH: 3 };
  let rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push({ type: e.type, phase: e.phase, id: e.id, kind: e.kind, name: e.name, boss: e.boss, by: e.by, player: e.player, zombie: e.zombie })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  // sounds played (by name)
  const heard = {};
  const play0 = g.sound.play.bind(g.sound);
  g.sound.play = (name, o) => { heard[name] = (heard[name] || 0) + 1; return play0(name, o); };
  const hush = () => { for (const k in heard) delete heard[k]; };
  let think0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
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
  const ahead = (p, d, side = 0) => { const y = p.pm.angles[1] * DEG, o = p.pm.origin; return [o[0] + Math.cos(y) * d - Math.sin(y) * side, o[1] + Math.sin(y) * d + Math.cos(y) * side, o[2]]; };
  /** Somewhere open (a clear stretch reach u ahead and to the sides), facing down it. */
  const goOpen = (p, reach = 600) => {
    const nodes = g.nav.nodes;
    for (let i = 0; i < 1500; i++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const e = [n.x, n.y, n.z + 64];
      for (let a = 0; a < 360; a += 30) {
        const c = Math.cos(a * DEG), sn = Math.sin(a * DEG);
        let ok = true;
        for (const r of [80, reach / 2, reach]) for (const side of [-120, 0, 120]) if (ok && !(g.visible(e, [e[0] + c * r - sn * side, e[1] + sn * r + c * side, e[2] - 50]) && g.nav.nearest([e[0] + c * r - sn * side, e[1] + sn * r + c * side, n.z], 90))) ok = false;
        if (!ok) continue;
        p.pm.origin = [n.x, n.y, n.z + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0];
        p.pm.angles[1] = a; p.pm.angles[0] = 0;
        return true;
      }
    }
    return false;
  };
  const place = (b, at) => {
    const n = g.nav.nearest([at[0], at[1], at[2] - 36], 200) || g.nav.nearestXY([at[0], at[1], at[2] - 36], 300, 150);
    if (n) { b.pm.origin = [n.x, n.y, n.z + 37]; b.prevOrigin = b.pm.origin.slice(); b.pm.velocity = [0, 0, 0]; b.node = null; b.goal = null; }
    const p = me(), o = b.pm.origin;
    b.pm.angles[1] = Math.atan2(p.pm.origin[1] - o[1], p.pm.origin[0] - o[0]) / DEG;
  };
  /** A boss (BOSSES index k) right in front of you in the open, past its intro, its other moves held off. */
  const stage = (k, d = 420) => {
    Z().clearHorde(); g.clearDropped();
    goOpen(me());
    con(`zm_boss ${k}`);
    const b = B().boss;
    place(b, ahead(me(), d));
    b.boss.state = 'chase'; b.boss.until = g.time;
    const T = g.time;
    for (const c of ['charge', 'spit', 'scream', 'blink', 'fireball', 'nova', 'slam', 'raise', 'firstRaise', 'hook', 'rain', 'wave', 'ambush', 'pack', 'meteor', 'blaze', 'leap']) b.boss.cd[c] = T + 999;
    return b;
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let CR, BS, RL, PK, ZM, EL, ZD, MB;
  const steps = [];

  // ---------------------------------------------------------------- the order and health
  steps.push(async () => {
    BS = await import('/src/game/bosses.js');
    RL = await import('/src/game/relics.js');
    PK = await import('/src/game/perks.js');
    ZM = await import('/src/game/zmods.js');
    EL = await import('/src/game/zelites.js');
    ZD = await import('/src/game/zdiff.js');
    MB = await import('/src/map/meshbuilder.js');
    CR = await import('/src/game/combatrules.js');
    newRun({ seed: 4242 });
    const ids = (n) => Array.from({ length: n }, (_, i) => B().pick((i + 1) * 5).def.id);
    const a = ids(20);
    newRun({ seed: 4242 });
    const a2 = ids(20);
    newRun({ seed: 99 });
    const c = ids(20);
    check('the order comes from the run\'s seed (same seed, same order; another seed, another)', a.join() === a2.join() && a.join() !== c.join(), a.slice(0, 5).join());
    let cyclesOk = true, seams = 0, firsts = new Set(), any = new Set();
    for (let s = 1; s <= 150; s++) {
      B().plan(s);
      const o = Array.from({ length: 20 }, (_, i) => B().pick((i + 1) * 5).def.id);
      for (let k = 0; k < 20; k += 5) if (new Set(o.slice(k, k + 5)).size !== 5) cyclesOk = false;
      for (let k = 1; k < 20; k++) if (o[k] === o[k - 1]) seams++;
      firsts.add(o[0]);
      o.slice(0, 6).forEach((x) => any.add(x));
    }
    check('all five before any repeats, every cycle; never the same boss twice in a row', cyclesOk && seams === 0);
    check('any boss can come first (so a 30-minute run can meet the Inferno or the Abomination)', firsts.size === 5 && any.size === 5, [...firsts].join());
    check('pick: the cycle counts rounds of five', B().pick(25).cycle === 0 && B().pick(30).cycle === 1 && B().pick(55).cycle === 2);
    // health by the wave it comes in
    const d0 = BS.BOSSES[0], hw = Z().diff.boss.hpWave;
    const h5 = B().healthFor(d0, 5, 0, 1), h25 = B().healthFor(d0, 25, 0, 1), h30 = B().healthFor(d0, 30, 1, 1);
    check('health by the wave of appearance: hpWave first + per x (n/5 - 1)', h5 === Math.round(d0.health * BS.BOSS_NERF * hw[0]) && h25 === Math.round(d0.health * BS.BOSS_NERF * (hw[0] + 4 * hw[1])) && h30 > h25, `${h5} ${h25} ${h30}`);
    const avg = (n0, n1) => { let s = 0, k = 0; for (let n = n0; n <= n1; n += 5) { s += B().healthFor(d0, n, 0, 1) / (d0.health * BS.BOSS_NERF); k++; } return s / k; };
    check('no tankier on Normal: x1.0 on average over waves 5-25, under the old 1.6 later', avg(5, 25) <= 1.0001 && avg(30, 50) < 1.6, `${avg(5, 25).toFixed(2)} / ${avg(30, 50).toFixed(2)}`);
    check('the crowd scales health (1.6 shooters: x1.18)', B().healthFor(d0, 5, 0, 1.6) === Math.round(d0.health * BS.BOSS_NERF * hw[0] * 1.18));
    const ab = BS.BOSSES[4];
    check('a boss before its old slot comes lighter and hits softer (the Abomination at wave 5: x0.65; all of it by wave 25; the Butcher always whole)', B().healthFor(ab, 5, 0, 1) === Math.round(ab.health * 0.65 * BS.BOSS_NERF * hw[0]) && B().healthFor(ab, 25, 0, 1) === Math.round(ab.health * BS.BOSS_NERF * (hw[0] + 4 * hw[1])) && B().early(ab, 15) > 0.65 && B().early(ab, 15) < 1 && B().early(d0, 5) === 1 && B().early(ab, 40) === 1, `${B().healthFor(ab, 5, 0, 1)} / ${B().healthFor(ab, 25, 0, 1)}`);
    const hp = (id) => ZD.ZDIFF[id].boss.hpWave[0];
    check('the difficulties scale it (Casual < Normal < Nightmare)', hp('casual') < hp('normal') && hp('normal') < hp('nightmare'));
    check('every boss has a weak point, a bone for its glow and two phase moves (MOVES)', BS.BOSSES.every((d) => d.weak?.length && d.weakBone && d.weakName && d.moves?.length === 2 && d.moves.every((m) => BS.MOVES[m]?.name && BS.MOVES[m]?.hint)));
    return false;
  });

  // ---------------------------------------------------------------- the staged arrival
  steps.push(() => {
    newRun({ seed: 7 });
    freezeBots();
    const p = me();
    goOpen(p);
    // a few commons up near you, coming
    for (let i = 0; i < 6; i++) Z().spawnZombie({ variant: 'walker', near: ahead(p, 260, (i - 3) * 60) });
    const commons = Z().pool.filter((z) => z.alive && !z.special);
    const S = B().stage, U = MB.worldUniforms.brightness, base = U.value;
    hush();
    Z().startWave(5);
    Z().nextSpawn = 1e9;
    const A = S.A;
    check('a boss wave starts its arrival (the boss and where it comes from, known up front)', !!A && A.def === B().pick(5).def && Math.abs(Z().bossAt - g.time - BS.ARRIVE) < 0.02);
    const frame = () => S.drawUnder(g.hud, { zombie: null }, 0.01); // (the lights move in the HUD layer, every frame)
    let minB = base, backed = false, roarT = 0;
    for (let i = 0; i < (BS.ARRIVE - 0.3) * 100; i++) {
      g.tick(); frame();
      minB = Math.min(minB, U.value);
      if (!roarT && heard.boss_far_roar) roarT = g.time;
      if (roarT && commons.some((z) => z.alive && z.panicUntil > g.time)) backed = true;
    }
    check('the ground rumbles, then a roar from its direction (and an arrow at the screen\'s edge)', heard.boss_rumble === 1 && heard.boss_far_roar === 1 && S.arrowT > 0 && Z().bossAt - roarT > 2);
    check('the commons back off from the squad at the roar', backed && commons.filter((z) => z.alive).every((z) => z.panicUntil > g.time - 1));
    check('the lights dip while it comes', minB < base * 0.7, `${base.toFixed(2)} -> ${minB.toFixed(2)}`);
    const node = A.node;
    for (let i = 0; i < 60 && !B().alive(); i++) { g.tick(); frame(); }
    const b = B().boss;
    const onNode = !node || dist(b.pm.origin, [node.x, node.y]) < 2 || squad().some((q) => dist(q.pm.origin, [node.x, node.y]) < 500); // (unless somebody stands on it by now)
    check('it comes in where it roared from, with its title card', !!b && b.alive && onNode && S.title?.def === b.boss.def && !S.A && heard.boss_title === 1 && of('boss', (e) => e.phase === 'spawn').length === 1, `${!!b} ${b?.alive} ${onNode} ${S.title?.def?.id} ${!!S.A} ${heard.boss_title} ${of('boss', (e) => e.phase === 'spawn').length}`);
    for (let i = 0; i < 700; i++) { g.tick(); frame(); }
    check('the lights come back up to your own setting after its entrance', Math.abs(U.value - base) < 1e-6 && S.dim === 0, `${U.value}`);
    // a brightness change while dipped becomes the new base
    S.liftAt = g.time + 5; for (let i = 0; i < 150; i++) { g.tick(); frame(); }
    MB.setLightCurve(2.5, 1.6); const nb = U.value;
    S.liftAt = 0; for (let i = 0; i < 700; i++) { g.tick(); frame(); }
    check('...and a brightness change made while they are down sticks', Math.abs(U.value - nb) < 1e-6);
    MB.setLightCurve(2.5, 1); S.drawUnder(g.hud, { zombie: null }, 0.01);
    // the run ends mid-arrival: nothing stays dipped
    Z().clearHorde();
    Z().startWave(10); Z().nextSpawn = 1e9;
    for (let i = 0; i < 300; i++) { g.tick(); frame(); }
    const dipped = U.value < base * 0.9;
    g.newGame({ mode: 'zombies', allies: 0 });
    frame();
    check('a new run puts the lights straight back', dipped && Math.abs(U.value - MB.worldUniforms.brightness.value) < 1e-9 && S.dim === 0 && !S.A && U.value === base);
    return false;
  });

  // ---------------------------------------------------------------- posture
  steps.push(() => {
    newRun({ seed: 3 });
    freezeBots();
    con('sv_cheats 1');
    const b = stage(0); // the Butcher: weak point, his head
    const Bb = b.boss, D = Z().diff.boss, P = BS.POSTURE;
    check('the posture bar: POSTURE.of x its health, empty', Bb.postureMax === Math.round(b.maxHealth * P.of) && Bb.posture === 0 && B().hudInfo().posture === 0);
    b.health = b.maxHealth = 1e6;
    const gain = (dmg, hg, w, who = me(), opts = {}) => { Bb.posture = 0; g.damagePlayer(b, who, dmg, hg, w, [1, 0, 0], b.eyePos(), opts); const x = Bb.posture; Bb.posture = 0; return x; };
    const body = gain(30, H.CHEST, 'ak47'), head = gain(30, H.HEAD, 'ak47'), sg = gain(30, H.CHEST, 'm3'), blast = gain(30, 0, 'hegrenade', me(), { blast: true }), fire = gain(30, 0, 'molotov', me(), { fire: true, blast: true }), knife = gain(30, H.CHEST, 'knife');
    const bot = gain(30, H.HEAD, 'ak47', botPs()[0]);
    check('bullets in the body barely build it; its weak point, shotguns, explosives and melee do', body > 0 && head > 8 * body && sg > 4 * body && blast > sg && knife > sg && fire < body, `body ${body.toFixed(1)} head ${head.toFixed(1)} m3 ${sg.toFixed(1)} blast ${blast.toFixed(1)} knife ${knife.toFixed(1)} fire ${fire.toFixed(1)}`);
    check('a bot\'s hits build POSTURE.bot as much as yours; diff.boss.posture scales it all', Math.abs(bot - head * P.bot) < 1e-6 && Math.abs(head - 30 * P.weak * D.posture) < 1e-6);
    const zz = g.players.find((q) => q.isZombie && !q.isBoss) || null;
    void zz;
    // drain
    Bb.posture = Bb.postureMax * 0.5; Bb.postureT = g.time;
    ticks(200);
    const held = Bb.posture;
    ticks(300);
    check('left alone it drains (after POSTURE.idle s)', held === Bb.postureMax * 0.5 && Bb.posture < held * 0.95, `${held.toFixed(0)} -> ${Bb.posture.toFixed(0)}`);
    // the break
    const chest0 = (() => { const h0 = b.health; g.damagePlayer(b, me(), 30, H.CHEST, 'ak47', [1, 0, 0], b.eyePos()); return h0 - b.health; })();
    Bb.posture = 0;
    g.hitStop = 0;
    hush(); rec = [];
    let pellets = 0;
    while (!(g.time < Bb.brokenUntil) && pellets < 400) { g.damagePlayer(b, me(), 20, H.CHEST, 'm3', [1, 0, 0], b.eyePos()); pellets++; }
    const t = g.time;
    check('shotgun pellets break it: down for diff.boss.kneel s, the posture event, its sound, a hit-stop', Math.abs(Bb.brokenUntil - t - D.kneel) < 1e-6 && Bb.breaks === 1 && of('posture', (e) => e.phase === 'break' && e.boss === b && e.by === me()).length === 1 && heard.boss_posture_break === 1 && g.hitStop > 0, `${pellets} pellets`);
    const chest1 = (() => { const h0 = b.health; g.damagePlayer(b, me(), 30, H.CHEST, 'ak47', [1, 0, 0], b.eyePos()); return h0 - b.health; })();
    check('while it kneels it takes diff.boss.kneelK x damage', Math.abs(chest1 / chest0 - D.kneelK) < 0.01, `${chest0.toFixed(1)} -> ${chest1.toFixed(1)}`);
    ticks(30);
    const hi = B().hudInfo();
    check('it kneels: no moves, no claws (state broken, kneel pose), the bar says BROKEN', Bb.state === 'broken' && b.model.kneelT === 1 && b.cmd.forwardmove === 0 && hi.broken && hi.brokenLeft > 0 && hi.brokenLeft < 1 && hi.status === 'POSTURE BROKEN');
    check('no posture builds while it kneels', (() => { const p0 = Bb.posture; g.damagePlayer(b, me(), 30, H.HEAD, 'm3', [1, 0, 0], b.eyePos()); return Bb.posture === p0; })());
    check('the banner: POSTURE BROKEN (the first break of a run explains the weak point)', B().stage.banner?.kind === 'break' && /weak point/.test(B().stage.banner.sub));
    const max0 = Bb.postureMax;
    ticks(Math.ceil(D.kneel * 100) + 5);
    check('back up after the kneel: the bar empties and grows by POSTURE.grow (no chain-breaking)', !(g.time < Bb.brokenUntil) && Bb.state === 'chase' && Bb.posture === 0 && Bb.postureMax === Math.round(max0 * P.grow) && of('posture', (e) => e.phase === 'recover').length === 1 && b.model.kneelT === 0);
    // the weak point while kneeling: the Spitter's gut (not a head: x POSTURE.weakK on top)
    const s = stage(1);
    s.health = s.maxHealth = 1e6;
    B().breakPosture(s, me());
    const gut = (() => { const h0 = s.health; g.damagePlayer(s, me(), 30, H.STOMACH, 'ak47', [1, 0, 0], s.eyePos()); return h0 - s.health; })();
    const chestS = (() => { const h0 = s.health; g.damagePlayer(s, me(), 30, H.CHEST, 'ak47', [1, 0, 0], s.eyePos()); return h0 - s.health; })();
    check('its glowing weak point takes POSTURE.weakK x more on top (the Spitter\'s gut)', Math.abs(gut / chestS - P.weakK * CR.HITGROUP_DAMAGE_MULT[3]) < 0.02, `${chestS.toFixed(1)} / ${gut.toFixed(1)}`);
    const a = stage(4);
    B().breakPosture(a, me());
    check('the Abomination\'s break opens its core for the whole kneel', a.boss.exposedUntil >= a.boss.brokenUntil);
    return false;
  });

  // ---------------------------------------------------------------- phases
  steps.push(() => {
    newRun({ seed: 5 });
    freezeBots();
    con('sv_cheats 1');
    const b = stage(2); // the Banshee
    rec = []; hush();
    b.health = b.maxHealth * 0.65; ticks(2);
    const e1 = of('bossphase');
    check('below 66%: phase 2, its first move (event, banner, roar)', b.boss.phase === 1 && b.boss.moves.has('ambush') && e1.length === 1 && e1[0].id === 'ambush' && e1[0].phase === 1 && B().stage.banner?.label === BS.MOVES.ambush.name && heard.boss_phase === 1);
    const gd = B().adjust(b, me(), 100, H.CHEST, 'ak47', {});
    B().cool(b.boss, 'ambush', g.time, 10);
    const gd2 = B().adjust(b, me(), 100, H.CHEST, 'ak47', {});
    check('a fresh phase takes less damage until its move has gone off (each phase gets seen), then full', gd < 50 && gd2 > 90 && !(b.boss.guardUntil > g.time), `${gd.toFixed(0)} -> ${gd2.toFixed(0)}`);
    b.health = b.maxHealth * 0.2; ticks(2);
    check('below 33%: phase 3, its second move', b.boss.phase === 2 && b.boss.moves.has('pack') && of('bossphase').length === 2 && B().hudInfo().phase === 2);
    const bar = B().hudInfo();
    check('the boss bar knows the phases (the notches) and the posture', Array.isArray(bar.phases) && bar.phases.length === 2 && bar.posture != null);
    newRun({ seed: 5, zdiff: 'nightmare' });
    freezeBots();
    con('sv_cheats 1');
    const n = stage(0);
    rec = [];
    n.health = n.maxHealth * 0.2; ticks(2);
    check('Nightmare: three phases, the third a FRENZY (everything faster)', n.boss.phase === 3 && n.boss.frenzy && of('bossphase').map((e) => e.id).join() === 'hook,bloodlust,frenzy');
    return false;
  });

  // ---------------------------------------------------------------- the phase moves
  steps.push(() => {
    newRun({ seed: 11, allies: 0 });
    con('sv_cheats 1');
    const p = me();
    // the Butcher's MEAT HOOK: thrown at you, reels you in
    let b = stage(0, 520);
    b.boss.moves.add('hook');
    b.boss.cd.hook = g.time;
    b.boss.cd.charge = g.time + 999;
    hush();
    const d0 = dist(b.pm.origin, p.pm.origin);
    let hooked = false, flew = false, minD = d0;
    for (let i = 0; i < 300; i++) { g.tick(); if (b.boss.hook) flew = true; if (b.boss.hook?.victim === p) hooked = true; minD = Math.min(minD, dist(b.pm.origin, p.pm.origin)); }
    check('MEAT HOOK: the chain flies at you, bites and reels you in for the cleaver', flew && hooked && heard.boss_hook_throw >= 1 && heard.boss_hook_hit === 1 && minD < 160, `${d0.toFixed(0)} -> ${minD.toFixed(0)}`);
    // BLOODLUST: a charge that ends winds up a second at once
    b = stage(0, 520);
    b.boss.moves.add('bloodlust');
    const run = () => { const y = b.pm.angles[1] * DEG; b.pm.velocity = [Math.cos(y) * 600, Math.sin(y) * 600, 0]; b.boss.state = 'charging'; b.boss.until = g.time; b.boss.chargeYaw = b.pm.angles[1]; b.boss.chargeStart = g.time - 1; g.tick(); }; // (a charge running out, not into a wall)
    run();
    const second = b.boss.state === 'charge_wind' && b.boss.chained;
    run();
    check('BLOODLUST: a second charge right after the first, then a rest', second && b.boss.state === 'chase' && !b.boss.chained && b.boss.cd.charge > g.time);
    // the Spitter's ACID RAIN: six circles round you, six globs onto them
    b = stage(1, 520);
    const n0 = g.projectiles.list.length;
    B().rainUp(b, p, g.time);
    const marks = B().stage.markers.filter((m) => m.obj.visible && m.kind === 'ring').length;
    ticks(105);
    const globs = g.projectiles.list.filter((q) => q.type === 'acid').length;
    check('ACID RAIN: six circles on the floor round you, six globs onto them', marks === 6 && globs - n0 >= 6, `${marks} marks, ${globs} globs`);
    ticks(150);
    // ACID WAVE: a marked lane, then a run of acid pools along it
    b = stage(1, 520);
    const pools0 = g.fire.patches.length;
    B().waveUp(b, p, g.time);
    const lane = B().stage.markers.some((m) => m.obj.visible && m.kind === 'lane');
    let ran = false;
    for (let i = 0; i < 150; i++) { g.tick(); if (b.boss.acid) ran = true; }
    check('ACID WAVE: a lane on the floor, then pools of acid running along it', lane && ran && g.fire.patches.length - pools0 >= 4, `${g.fire.patches.length - pools0} pools`);
    // the Banshee's PHANTOM STRIKE and WAIL OF THE PACK
    b = stage(2, 600);
    b.boss.moves.add('ambush'); b.boss.cd.ambush = g.time;
    const at0 = b.pm.origin.slice();
    let amb = false;
    for (let i = 0; i < 20 && !amb; i++) { g.tick(); amb = b.boss.state === 'ambush'; }
    check('PHANTOM STRIKE: she blinks in close (behind you if she can), then a telegraphed strike', amb && dist(b.pm.origin, at0) > 50 && dist(b.pm.origin, p.pm.origin) < 560);
    b = stage(2, 500);
    b.boss.moves.add('pack'); b.boss.cd.pack = g.time;
    const sp0 = Z().pool.filter((z) => z.alive && z.special === 'sprinter').length;
    ticks(130);
    const sp1 = Z().pool.filter((z) => z.alive && z.special === 'sprinter' && z.extra).length;
    check('WAIL OF THE PACK: sprinters answer her (outside the wave\'s count)', sp1 - sp0 >= 2, `${sp1}`);
    // the Inferno's METEOR SHOWER and BLAZING CHARGE
    b = stage(3, 520);
    B().meteorUp(b, p, g.time);
    const mk = B().stage.markers.filter((m) => m.obj.visible && m.kind === 'ring').length;
    let falling = 0;
    for (let i = 0; i < 125; i++) { g.tick(); falling = Math.max(falling, g.projectiles.list.filter((q) => q.type === 'fireball' && q.vel[2] < -100 && Math.abs(q.vel[0]) < 1).length); }
    check('METEOR SHOWER: circles under you, fireballs straight down onto them', mk >= 2 && falling >= 2, `${mk} marks, ${falling} falling`);
    ticks(100);
    b = stage(3, 600);
    b.boss.moves.add('blaze'); b.boss.cd.blaze = g.time;
    let blazed = false, trail = 0;
    const ig0 = g.fire.ignite.bind(g.fire);
    g.fire.ignite = (pos, owner, o) => { if (owner === b && b.boss.state === 'blazing') trail++; return ig0(pos, owner, o); };
    for (let i = 0; i < 250; i++) { g.tick(); if (b.boss.state === 'blazing') blazed = true; }
    g.fire.ignite = ig0;
    check('BLAZING CHARGE: a telegraphed dash that leaves fire behind', blazed && trail >= 3, `${trail} fires`);
    // the Abomination's AFTERSHOCK and EARTHSHAKER
    b = stage(4, 260);
    b.boss.moves.add('aftershock');
    b.boss.cd.slam = g.time;
    hush();
    let after = false;
    for (let i = 0; i < 260; i++) { g.tick(); if (b.boss.state === 'after_up') after = true; }
    check('AFTERSHOCK: after the slam a wider one (marked) - jump twice', after && heard.slam === 2);
    b = stage(4, 600);
    b.boss.moves.add('leap'); b.boss.cd.leap = g.time;
    hush();
    let air = false, landed = false;
    for (let i = 0; i < 350; i++) { g.tick(); if (b.boss.state === 'leap_air') air = true; if (air && b.boss.state === 'chase') { landed = true; break; } }
    check('EARTHSHAKER: a marked spot, a leap onto it, a slam where it lands (core open after)', air && landed && heard.boss_quake === 1 && b.boss.exposedUntil > g.time && dist(b.pm.origin, p.pm.origin) < 450, `${dist(b.pm.origin, p.pm.origin).toFixed(0)}`);
    // the existing AoEs got their circles too
    b = stage(4, 260);
    b.boss.cd.slam = g.time;
    let slamMark = false;
    for (let i = 0; i < 40 && !slamMark; i++) { g.tick(); slamMark = b.boss.state === 'slam_up' && B().stage.markers.some((m) => m.obj.visible && m.ring.scale.x === 430); }
    check('the slam\'s reach is marked on the floor while it winds up', slamMark);
    return false;
  });

  // ---------------------------------------------------------------- the trophy and relics
  steps.push(() => {
    newRun({ seed: 21 });
    freezeBots();
    con('sv_cheats 1');
    const D = Z().diff.boss;
    const b = stage(3, 300); // the Inferno
    const bot = botPs()[0];
    me().health = 30; me().armor = 0; bot.health = 20; bot.armor = 80;
    rec = []; hush();
    b.boss.state = 'chase';
    g.damagePlayer(b, me(), 1e7, H.CHEST, 'ak47', [1, 0, 0], b.eyePos());
    const tro = g.dropped.filter((d) => d.kind === 'trophy' && !d.taken);
    check('a boss kill: +diff.boss.heal health (to max) and diff.boss.armor armour - not a full heal', me().health === 30 + D.heal && me().armor === D.armor && bot.health === 20 + D.heal && bot.armor === Math.min(100, 80 + D.armor) && D.heal < 100);
    check('...and a trophy out of the body (its event, its sound)', tro.length === 1 && tro[0].data.bossId === 'inferno' && of('trophy', (e) => e.phase === 'drop' && e.boss === 'THE INFERNO').length === 1 && heard.trophy_drop === 1);
    ticks(80);
    const d = tro[0];
    // a bot walking over it leaves it
    bot.pm.origin = [d.pos[0], d.pos[1], d.pos[2] + 37]; bot.prevOrigin = bot.pm.origin.slice();
    ticks(20);
    check('bots leave the trophy to you', !d.taken);
    bot.pm.origin = [d.pos[0] + 300, d.pos[1], d.pos[2] + 37]; bot.prevOrigin = bot.pm.origin.slice();
    me().pm.origin = [d.pos[0], d.pos[1], d.pos[2] + 37]; me().prevOrigin = me().pm.origin.slice(); me().pm.velocity = [0, 0, 0];
    ticks(20);
    const offer = Z().perks.offerFor(me());
    check('you take it: pick 1 of diff.boss.relics relics, the boss\'s own signature relic first', d.taken && offer?.source === 'trophy' && offer.ids.length === D.relics && offer.ids[0] === RL.BOSS_RELIC.inferno && offer.ids.every((id) => PK.PERKS[id]?.rarity === 'relic') && new Set(offer.ids).size === offer.ids.length && of('trophy', (e) => e.phase === 'take' && e.player === me()).length === 1, offer?.ids.join());
    Z().perks.choose(me(), 0);
    check('the relic is a perk: its stats feed the pipeline (Inferno Core: +50% fire damage)', Z().perks.has(me(), 'infernocore') === 1 && Math.abs(Z().mods.factor(me(), 'fireDamage') - 1.5) < 1e-6);
    // a second trophy from the same boss: you hold its relic already - it isn't offered again
    const b2 = stage(3, 300);
    g.damagePlayer(b2, me(), 1e7, H.CHEST, 'ak47', [1, 0, 0], b2.eyePos());
    const t2 = g.dropped.find((x) => x.kind === 'trophy' && !x.taken);
    const ids = RL.relicChoices(Z(), me(), t2.data.bossId, D.relics);
    check('a relic you hold is not offered again', !ids.includes('infernocore') && ids.length === D.relics, ids.join());
    // the relics table
    const rows = Object.entries(RL.RELICS);
    check('relics: rarity relic (never drafted), known stats, a signature relic for every boss, no thralls', rows.length >= 10 && rows.every(([id, r]) => PK.PERKS[id]?.rarity === 'relic' && Object.keys(r.stats).every((k) => ZM.STATS[k])) && BS.BOSSES.every((x) => RL.RELICS[RL.BOSS_RELIC[x.id]]) && !rows.some(([id, r]) => /thrall|friend/i.test(id + r.text)) && Z().perks.roll(30).every((id) => PK.PERKS[id].rarity !== 'relic'));
    check('the HUD: a trophy marker (drawn without errors)', (() => { try { B().stage.drawOver(g.hud, { zombie: Z().hudInfo(), alive: true }); return true; } catch (e) { return String(e); } })() === true);
    return false;
  });

  // ---------------------------------------------------------------- elites
  steps.push(() => {
    newRun({ seed: 31 });
    freezeBots();
    const E = B().elites, D = Z().diff.boss, dir = Z().director;
    const plans = [];
    const q0 = dir.queue.bind(dir);
    dir.queue = (kind, o) => { plans.push({ kind, o }); return true; };
    const r0 = E.rnd;
    E.rnd = () => 0; // (always: the odds, the first kind)
    for (const n of [D.elitesFrom - 2, D.elitesFrom, D.elitesFrom + 1, 15, D.elitesFrom + 2]) E.plan(n, null);
    E.plan(D.elitesFrom + 2, 'elites');
    E.rnd = () => 0.999;
    E.plan(D.elitesFrom + 2, null);
    dir.queue = q0; E.rnd = r0;
    check('elites: only odd waves from diff.boss.elitesFrom, never a boss wave or a Twin Elites wave, at eliteChance', plans.length === 2 && plans.every((x) => x.o.elite?.id === 'alpha' && x.kind === 'hunter' && x.o.at > g.time + 5), JSON.stringify(plans.map((x) => [x.kind, x.o.elite?.id, +(x.o.at - g.time).toFixed(1)])));
    // one comes in
    rec = []; hush();
    Z().state = 'wave'; Z().wave = 9;
    const p = me();
    goOpen(p);
    const base = Math.round(Z().stats.health * 1.6);
    Z().specials.spawn('hunter', { near: ahead(p, 400), elite: EL.ELITES.alpha });
    const al = Z().pool.find((z) => z.alive && z.eliteRow === EL.ELITES.alpha);
    check('the Alpha Hunter: x diff.boss.eliteHp health, bigger, named; its banner, howl and event', !!al && al.maxHealth === Math.round(base * D.eliteHp) && al.name === 'Alpha Hunter' && al.model.object3D.scale.x > 1.2 && B().stage.banner?.label === EL.ELITES.alpha.name && heard.elite_spawn === 1 && of('elite', (e) => e.phase === 'spawn' && e.zombie === al).length === 1);
    const hi = B().hudInfo();
    check('...on the boss bar with no boss up (its own bar)', !!hi && hi.name === null && hi.elites.length === 1 && hi.elites[0].name === EL.ELITES.alpha.name);
    ticks(100);
    check('...with its pack of sprinters', Z().pool.filter((z) => z.alive && z.special === 'sprinter' && z.extra).length >= 2);
    al.sp.state = 'recover'; al.sp.until = g.time + 0.5; al.sp.cd.pounce = g.time + 6;
    g.tick();
    check('...that pounces again almost as soon as it\'s off you', al.sp.cd.pounce <= g.time + EL.ELITES.alpha.pounce + 0.02);
    const drops0 = g.dropped.filter((d) => d.kind === 'health').length;
    g.damagePlayer(al, p, 1e6, H.CHEST, 'ak47', [1, 0, 0], al.eyePos());
    check('one down: its event and a health vial', of('elite', (e) => e.phase === 'death' && e.zombie === al).length === 1 && g.dropped.filter((d) => d.kind === 'health').length >= drops0 + 1 && heard.elite_down === 1 && !al.eliteRow);
    // the Juggernaut ploughs through
    Z().clearHorde();
    Z().specials.spawn('charger', { near: ahead(p, 400), elite: EL.ELITES.juggernaut });
    const j = Z().pool.find((z) => z.alive && z.eliteRow === EL.ELITES.juggernaut);
    const mates = botPs();
    const o = j.pm.origin, y = j.pm.angles[1] * DEG;
    j.sp.state = 'charge'; j.sp.until = g.time + 1.5; j.sp.yaw = j.pm.angles[1]; j.sp.start = g.time; j.sp.hitList = new Set();
    for (const [k, q] of mates.slice(0, 2).entries()) { q.pm.origin = [o[0] + Math.cos(y) * (10 + k * 4), o[1] + Math.sin(y) * (10 + k * 4), o[2]]; q.prevOrigin = q.pm.origin.slice(); q.god = true; }
    g.tick();
    check('the Juggernaut: ploughs through everyone in its way and keeps going', j.sp.hitList.size === 2 && j.sp.state === 'charge', `${j.sp.hitList.size} ${j.sp.state}`);
    // into a wall: a long stun
    j.sp.state = 'recover'; j.sp.until = g.time + 1.6;
    j.eliteCharging = true;
    g.tick();
    check('...and into a wall it stays stunned a long while (STUNNED on its bar)', j.sp.until >= g.time + EL.ELITES.juggernaut.stun - 0.05 && B().hudInfo().elites[0].status === 'STUNNED');
    for (const q of mates) q.god = false;
    return false;
  });

  // ---------------------------------------------------------------- sounds, HUD, a full fight per boss
  steps.push(async () => {
    const SR = await import('/src/assets/snd/recipes.js');
    const names = SR.SOUND_GROUPS['Boss overhaul'];
    check('the boss overhaul\'s sounds: listed and synthesized', names.length >= 14 && names.every((n) => !!g.sound.bank.get(n)), names.filter((n) => !g.sound.bank.get(n)).join());
    newRun({ seed: 41 });
    con('sv_cheats 1');
    const BB = await import('/src/ui/bossbar.js');
    let ok = true;
    try {
      const b = stage(4);
      B().breakPosture(b, me());
      BB.drawBossBar(g.hud, B().hudInfo(), 40);
      B().stage.drawOver(g.hud, { zombie: Z().hudInfo(), alive: true });
      B().stage.drawUnder(g.hud, { zombie: Z().hudInfo(), alive: true }, 0.01);
    } catch (e) { ok = String(e.stack); }
    check('the boss bar, banners and title card draw', ok === true, ok === true ? '' : ok);
    // every boss, a fight with a stand-in player shooting it (bossfight-style; through walls: it's the boss under test): it acts, phases, breaks, dies
    newRun({ seed: 41, allies: 2 });
    thawBots();
    const res = [];
    for (let k = 0; k < 5; k++) {
      Z().clearHorde(); g.clearDropped();
      Z().state = 'wave'; Z().wave = (k + 1) * 5; Z().bossAt = 0; Z().spawned = 999; Z().stats = { ...Z().stats, count: 0 };
      if (!B().spawn((k + 1) * 5, { def: BS.BOSSES[k], cycle: 0 })) { res.push(`${k}: no spawn`); continue; }
      const b = B().boss, st = {};
      let next = 0;
      rec = [];
      for (let i = 0; i < 12000 && b.alive; i++) {
        g.tick();
        st[b.boss.state] = (st[b.boss.state] || 0) + 1;
        if (g.time > next) {
          next = g.time + 0.12;
          const e = me().eyePos(), c = [b.pm.origin[0], b.pm.origin[1], b.pm.origin[2] + 20];
          { const d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); g.damagePlayer(b, me(), 5, Math.random() < 0.3 ? 1 : 2, 'm3', [(c[0] - e[0]) / d, (c[1] - e[1]) / d, (c[2] - e[2]) / d]); }
        }
      }
      res.push({ id: b.boss.def.id, dead: !b.alive, phases: of('bossphase').length, breaks: of('posture', (e) => e.phase === 'break').length, t: g.time, moves: Object.keys(st).filter((s) => !/chase|intro|broken/.test(s)).join('/') });
      if (b.alive) g.damagePlayer(b, me(), 1e7, 2, 'ak47', [1, 0, 0]);
      ticks(100);
    }
    const good = res.filter((r) => r.dead && r.phases === 2).length, breaks = res.reduce((n, r) => n + (r.breaks || 0), 0), moves = res.reduce((n, r) => n + (r.moves ? r.moves.split('/').length : 0), 0);
    check('a fight with each boss: it acts, passes both phases and dies; posture breaks along the way', good === 5 && breaks >= 3 && moves >= 8, JSON.stringify(res));
    return false;
  });

  // ---------------------------------------------------------------- a look: a staged boss on its knees
  steps.push(() => {
    newRun({ seed: 51, allies: 0 });
    con('sv_cheats 1');
    const b = stage(0, 300);
    b.boss.until = g.time + 99; b.boss.state = 'intro';
    B().breakPosture(b, me());
    b.boss.brokenUntil = g.time + 99; // (held down for the picture)
    const e = me().eyePos(), c = [b.pm.origin[0], b.pm.origin[1], b.pm.origin[2] + 10];
    me().pm.angles[1] = Math.atan2(c[1] - e[1], c[0] - e[0]) / DEG;
    me().pm.angles[0] = -Math.atan2(c[2] - e[2], Math.hypot(c[0] - e[0], c[1] - e[1])) / DEG;
    return { wait: 600 };
  });

  steps.push(() => ({ shot: true }));

  let i = 0;
  window.__drive = async () => {
    try {
      const r = (await steps[i++]()) || {};
      const done = i >= steps.length;
      if (done) {
        g.sound.play = play0;
        thawBots();
        restore();
        out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
      }
      return { log: out.splice(0).join('\n'), done, wait: r.wait, shot: r.shot };
    } catch (e) {
      g.sound.play = play0;
      restore();
      return { log: out.splice(0).join('\n') + `\n[sim] FAIL step ${i} threw: ${e.stack}`, done: true };
    }
  };
})();
