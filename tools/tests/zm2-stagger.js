// Zombie survival, Milestone 2.1 (stagger): hit reactions on the model, poise and the per-weapon
// stopping table, holds and swing cancel, cooldown and diminishing returns, leg knockdowns,
// weapon identities (shotguns hold, minigun pins the front rank, snipers don't stop, tesla
// stuns the chain, chainsaw holds), bosses / chargers nearly immune, specials losing their
// windup, burning zombies panicking (and the capped spread), the new head poppers.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm2-stagger.js /tmp/zst
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&team=t&bots=5&freeze=2" tools/tests/zm2-stagger.js /tmp/zstc
// (the second, classic CS: nothing staggers, the models never flinch)
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and "[sim] TIME ..." lines (measured holds).
// Screenshots: _0 hit reactions (head snap, shoulder twist, gut fold, leg buckle), _1 a
// knockdown on its knees, a tesla stun, a panicking burning zombie and one reeling from a
// blast, _2 real M3 fire.
// Runs on Sandbox (Normal's stagger rows) with the squad in god mode and the bots holding fire.
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const note = (s) => out.push(`[sim] TIME ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const me = () => g.local;
  const DEG = Math.PI / 180;
  const steps = [];
  let ST = null, GORE = null;
  const evs = [];
  let subscribed = false, think0 = null;
  const rnd0 = Math.random;
  const fixRandom = (v) => { Math.random = () => v; };
  const realRandom = () => { Math.random = rnd0; };

  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 2, zdiff: 'sandbox', ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
  }
  function faceOpen(p) {
    const e = p.eyePos();
    let best = 0, bd = -1;
    for (let a = 0; a < 360; a += 15) {
      let d = 0;
      for (const r of [120, 200, 280, 360, 440]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 30])) d = r; else break; }
      // (flat: the floor 100-140 u out is no higher than yours)
      if (![100, 140].every((r) => [-55, 0, 55].every((s) => g.visible(e, [e[0] + Math.cos(a * DEG) * r - Math.sin(a * DEG) * s, e[1] + Math.sin(a * DEG) * r + Math.cos(a * DEG) * s, e[2] - 48])))) d = Math.min(d, 100);
      if (d > bd) { bd = d; best = a; }
    }
    p.pm.angles[1] = best; p.pm.angles[0] = 6;
    return best;
  }
  /** A common zombie dist units in front of you (side: to your left), with lots of health. */
  function zombieAt(dist, side = 0, o = {}) {
    const p = me(), po = p.pm.origin, y = p.pm.angles[1] * DEG;
    const at = [po[0] + Math.cos(y) * dist - Math.sin(y) * side, po[1] + Math.sin(y) * dist + Math.cos(y) * side, po[2]];
    if (!Z().spawnZombie({ at, variant: 'walker', ...o })) return null;
    let z = null, bd = 1e9;
    for (const q of Z().pool) { if (!q.alive || q.special) continue; const d = Math.hypot(q.pm.origin[0] - at[0], q.pm.origin[1] - at[1]); if (d < bd) { bd = d; z = q; } }
    if (z) { z.health = z.maxHealth = 1e5; z.pm.angles[1] = (p.pm.angles[1] + 180) % 360; }
    return z;
  }
  const chest = (q) => [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 14];
  const dirTo = (q) => { const e = me().eyePos(), c = chest(q), l = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]) || 1; return [(c[0] - e[0]) / l, (c[1] - e[1]) / l, (c[2] - e[2]) / l]; };
  /** n hits of dmg on q in one trigger pull (a shotgun's pellets share the shot id). */
  const shoot = (q, dmg, hg = 2, weapon = 'ak47', n = 1, shot = ++g.shotSeq, by = me()) => { for (let i = 0; i < n; i++) g.damagePlayer(q, by, dmg, hg, weapon, dirTo(q), chest(q), { shot }); };
  const blast = (q) => shoot(q, 20, 2, 'm3', 9); // a point-blank pump shotgun
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  /** Seconds until z comes on again (a command with a step in it, or a swing: it may stand at somebody already), up to max ticks. */
  function untilMoves(z, max = 400) {
    for (let i = 1; i <= max; i++) { g.tick(); if (z.windup || (z.cmd && (z.cmd.forwardmove || z.cmd.sidemove))) return i * 0.01; }
    return Infinity;
  }
  const held = (z) => Math.max(0, z.staggerUntil - g.time);
  const freeOf = (z) => { ticks(Math.ceil(Math.max(0, (z.staggerFree || 0) - g.time) / 0.01) + 2); };
  const clear = () => { Z().clearHorde(); ticks(2); };

  // ---------------------------------------------------------------- classic CS: untouched
  steps.push(async () => {
    ST = await import('/src/game/zstagger.js');
    GORE = await import('/src/game/gore.js');
    if (Z().enabled) return false;
    const bot = g.players.find((p) => p.alive && p.isBot && p.team !== me().team && p.model);
    const m = bot?.model;
    if (m) { m.hit(1, [1, 0, 0], null, 1); m.clearHits(); }
    let flinched = 0, n = 0;
    const hit0 = Object.getPrototypeOf(m || {}).hit;
    if (m) Object.getPrototypeOf(m).hit = function (...a) { flinched++; return hit0.apply(this, a); };
    for (let i = 0; i < 600; i++) { g.tick(); if (i % 10 === 0) g.frame(0.1); n++; }
    if (m) Object.getPrototypeOf(m).hit = hit0;
    check('classic: plays on', n === 600 && g.players.length > 0);
    check('classic: no hit reactions', flinched === 0, `${flinched} calls`);
    check('classic: no stagger fields', g.players.every((p) => !p.staggerUntil));
    out.push(`[sim] ${fail ? 'SOME FAILED' : 'ALL PASSED'} (${pass} passed, ${fail} failed)`);
    return true;
  });

  // ---------------------------------------------------------------- setup and tables
  steps.push(async () => {
    newRun();
    con('sv_cheats 1');
    con('zm_wave 3');
    con('zm_god_squad');
    think0 = think0 || g.bots.think;
    g.bots.think = () => {}; // (the bots hold fire)
    Z().nextSpawn = 1e9;
    clear();
    if (!subscribed) { subscribed = true; Z().events.on('stagger', (e) => evs.push({ kind: e.kind, src: e.src, by: e.by, zombie: e.zombie, until: e.until })); }
    check('constants exported', ST.FLINCH === 0.35 && ST.KNOCKDOWN === 1.5);
    const D = Z().diff.stagger;
    check('difficulty rows', D && D.resist === 1 && D.cooldown > 0 && D.decay > 0 && D.knockdown === 1, JSON.stringify(D));
    const hp = GORE.HEAD_POPPERS;
    check('head poppers: barrett, minigun, aa12, deagle', ['barrett', 'minigun', 'aa12', 'deagle'].every((w) => hp.has(w)));
    faceOpen(me());
    return false;
  });

  // ---------------------------------------------------------------- a shotgun blast: stagger, swing lost, timing
  steps.push(async () => {
    const z = zombieAt(110);
    ticks(3);
    z.windup = g.time + 0.2; z.lastShot = g.time;
    evs.length = 0;
    blast(z);
    const h = held(z);
    check('point-blank M3: a full stagger', z.staggerKind === 'stagger' && h > 0.55 && h <= 0.62, `${z.staggerKind} ${h.toFixed(2)} s`);
    check('swing cancelled', z.windup === 0 && z.nextAttack >= z.staggerUntil && z.model.swipeT === -1);
    check('stagger event (by you, src m3)', evs.length === 1 && evs[0].kind === 'stagger' && evs[0].src === 'm3' && evs[0].by === me());
    const tm = untilMoves(z);
    note(`m3 point blank: held ${h.toFixed(2)} s, walked again after ${tm.toFixed(2)} s`);
    check('comes on again once the hold is over (steps, or swings 0.15 s later)', tm >= h - 0.01 && tm < h + 0.2, `${tm.toFixed(2)} vs ${h.toFixed(2)}`);
    // cooldown: a blast right after does nothing more than flinch
    blast(z);
    check('cooldown: no new stagger straight after', held(z) === 0, `held ${held(z).toFixed(2)}`);
    freeOf(z);
    blast(z);
    const h2 = held(z);
    check('diminishing returns: the next one is shorter', h2 > 0.2 && h2 < h - 0.05, `${h2.toFixed(2)} after ${h.toFixed(2)}`);
    note(`m3 again (after the cooldown): ${h2.toFixed(2)} s; cooldown ${Z().diff.stagger.cooldown} s`);
    // the pellets of a far shot (3 of 9 land) don't break it
    clear();
    const z2 = zombieAt(140);
    shoot(z2, 14, 2, 'm3', 3);
    check('a far blast (3 pellets): only a flinch', held(z2) === 0 && z2.poise > 0.2 && z2.poise < 1, `poise ${z2.poise.toFixed(2)}`);
    return false;
  });

  // ---------------------------------------------------------------- weapon identities by bullets
  steps.push(async () => {
    clear();
    const rows = [];
    // [weapon, damage, hits, interval s, n per pull]
    const guns = [['glock', 25, 8, 0.15, 1], ['ak47', 36, 8, 0.1, 1], ['mp5', 26, 10, 0.075, 1], ['deagle', 54, 4, 0.225, 1], ['xm1014', 20, 3, 0.25, 6], ['aa12', 22, 3, 0.2, 8], ['awp', 115, 3, 1.45, 1], ['barrett', 260, 2, 0.4, 1], ['scout', 75, 3, 1.25, 1]];
    for (const [w, dmg, n, dt, pel] of guns) {
      clear();
      const z = zombieAt(130);
      ticks(2);
      let first = -1, hits = 0;
      const t0 = g.time;
      for (let i = 0; i < n && first < 0; i++) {
        shoot(z, dmg, 2, w, pel); hits++;
        if (z.staggerUntil > g.time) first = g.time - t0;
        else ticks(Math.round(dt / 0.01));
      }
      rows.push({ w, hits: first >= 0 ? hits : null, hold: held(z) });
      note(`${w}: ${first >= 0 ? `staggered after ${hits} hit${hits > 1 ? 's' : ''} (${first.toFixed(2)} s), held ${held(z).toFixed(2)} s` : `never staggered in ${n} hits (poise ${z.poise.toFixed(2)})`}`);
    }
    const r = (w) => rows.find((x) => x.w === w);
    check('snipers kill, they don\'t stop', ['awp', 'barrett', 'scout'].every((w) => r(w).hits === null));
    check('a glock takes several rounds', r('glock').hits >= 3 && r('glock').hits <= 5, `${r('glock').hits}`);
    check('rifles in a few', r('ak47').hits >= 2 && r('ak47').hits <= 4, `${r('ak47').hits}`);
    check('the deagle in two', r('deagle').hits === 2, `${r('deagle').hits}`);
    check('auto shotguns in a blast or two', r('aa12').hits === 1 && r('xm1014').hits <= 2, `aa12 ${r('aa12').hits}, xm1014 ${r('xm1014').hits}`);
    check('pistol / smg holds are short, shotgun ones long', r('glock').hold < 0.35 && r('mp5').hold < 0.35 && r('aa12').hold > 0.45, `glock ${r('glock').hold.toFixed(2)} mp5 ${r('mp5').hold.toFixed(2)} aa12 ${r('aa12').hold.toFixed(2)}`);
    // the AA-12 holding a doorway: 2 s of fire, how much of it is the front zombie held?
    clear();
    const z = zombieAt(120);
    ticks(2);
    let heldT = 0, moved = 0;
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) shoot(z, 22, 2, 'aa12', 8);
      g.tick();
      if (z.staggerUntil > g.time) heldT++;
      else if (z.cmd?.forwardmove) moved++;
    }
    note(`aa12 at a doorway: front zombie held ${(heldT / 2).toFixed(0)}% of 2 s, walked ${moved} ticks`);
    check('the AA-12 holds the doorway (held most of the time)', heldT >= 100, `${(heldT / 2).toFixed(0)}%`);
    return false;
  });

  // ---------------------------------------------------------------- minigun: the front rank pinned, collateral
  steps.push(async () => {
    clear();
    const front = zombieAt(120), back = zombieAt(160);
    ticks(2);
    let fHeld = 0, bHeld = 0;
    const b0 = back.poise;
    for (let i = 0; i < 100; i++) {
      if (i % 5 === 0) { const shot = ++g.shotSeq; shoot(front, 30, 2, 'minigun', 1, shot); shoot(back, 30, 2, 'minigun', 1, shot); } // a round through both
      g.tick();
      if (front.staggerUntil > g.time) fHeld++;
      if (back.staggerUntil > g.time) bHeld++;
    }
    note(`minigun 1 s: front rank held ${fHeld}%, the one behind ${bHeld}% (collateral poise)`);
    check('minigun pins the front rank', fHeld >= 95, `${fHeld}%`);
    check('the rank behind (collateral) is stopped less', bHeld < fHeld - 30, `${bHeld}%`);
    void b0;
    return false;
  });

  // ---------------------------------------------------------------- tesla stuns its chain, chainsaw holds
  steps.push(async () => {
    clear();
    const p = me();
    g.rounds.buy(p, 'tesla');
    const w = p.weapons[1];
    check('tesla bought', w?.id === 'tesla');
    const zs = [zombieAt(160, 0), zombieAt(200, 40), zombieAt(240, -30)];
    ticks(2);
    for (const z of zs) z.zSpeed = 0;
    aim(p, chest(zs[0]));
    evs.length = 0;
    g.frame(0.01);
    g.zapFrom(p, w);
    const stunned = zs.filter((z) => z.staggerKind === 'stun' && held(z) > 0.3);
    note(`tesla: ${stunned.length} of ${zs.length} in the chain stunned, ${held(zs[0]).toFixed(2)} s`);
    check('tesla stuns its chain', stunned.length >= 2, `${stunned.length} stunned`);
    check('a brief stun (under half a second)', stunned.every((z) => held(z) <= 0.46));
    check('stun events', evs.filter((e) => e.kind === 'stun' && e.src === 'tesla').length === stunned.length);
    // the chainsaw
    clear();
    g.rounds.buy(p, 'chainsaw');
    const saw = p.weapons[1];
    check('chainsaw bought', saw?.id === 'chainsaw');
    if (saw) g.selectWeapon(p, saw, true);
    const z = zombieAt(50);
    ticks(2);
    let heldT = 0;
    for (let i = 0; i < 100; i++) {
      aim(p, chest(z));
      if (i % 10 === 0) g.sawFrom(p, saw);
      g.tick();
      if (z.staggerUntil > g.time) heldT++;
    }
    const after = untilMoves(z, 100);
    note(`chainsaw 1 s: target held ${heldT}%, comes on again (steps or swings) ${after.toFixed(2)} s after the last cut`);
    check('the chainsaw holds its target', heldT >= 95, `${heldT}%`);
    check('and lets go once it stops', after < 0.5, `${after.toFixed(2)} s`);
    return false;
  });

  // ---------------------------------------------------------------- leg knockdown, knees pose
  steps.push(async () => {
    clear();
    const z = zombieAt(120);
    ticks(2);
    fixRandom(0.01);
    shoot(z, 20, 6, 'm3', 9); // a blast at the legs
    realRandom();
    const h = held(z);
    check('a leg blast knocks it down', z.staggerKind === 'knockdown' && h > 1.4 && h < 1.7, `${z.staggerKind} ${h.toFixed(2)} s`);
    for (let i = 0; i < 40; i++) g.frame(0.01);
    check('the model goes down on its knees', z.model.kneelW > 0.8, z.model.kneelW.toFixed(2));
    const pelvisZ = z.model.rig.b.pelvis.wp.z, headZ = z.model.rig.b.head.wp.z;
    check('knees pose: hips and head low', pelvisZ < 26 && headZ < 45, `pelvis ${pelvisZ.toFixed(1)} head ${headZ.toFixed(1)}`);
    const tm = untilMoves(z);
    note(`knockdown: held ${h.toFixed(2)} s (on its knees, then up), walking again ${(tm + 0.4).toFixed(2)} s after the hit`);
    for (let i = 0; i < 40; i++) g.frame(0.01);
    check('and gets back up', z.model.kneelW < 0.2, z.model.kneelW.toFixed(2));
    // the roster can keep it down for good (crawler)
    const become0 = Z().roster.become;
    let asked = null;
    Z().roster.become = (q, v) => { asked = v; q.model.crawl = true; return true; };
    freeOf(z);
    fixRandom(0.01);
    shoot(z, 20, 7, 'm3', 9);
    realRandom();
    Z().roster.become = become0;
    for (let i = 0; i < 80; i++) g.frame(0.01);
    check('a knockdown asks the roster for a crawler', asked === 'crawler' && z.model.kneelW > 0.8, `${asked} kneel ${z.model.kneelW.toFixed(2)}`);
    z.model.crawl = false;
    // the roster's crawlers crawl in the same pose
    clear();
    const c = zombieAt(250, 0, { variant: 'crawler' });
    c.zSpeed = 90;
    for (let i = 0; i < 60; i++) g.frame(0.01);
    check('a crawler crawls on its hands and knees', c.variant === 'crawler' && c.model.kneelW > 0.8 && Math.hypot(c.pm.velocity[0], c.pm.velocity[1]) > 30, `kneel ${c.model.kneelW.toFixed(2)}`);
    return false;
  });

  // ---------------------------------------------------------------- bosses, chargers, specials
  steps.push(async () => {
    clear();
    con('zm_boss 0');
    const boss = g.bosses.boss;
    if (boss) { for (let i = 0; i < 3; i++) shoot(boss, 20, 2, 'm3', 9); }
    check('bosses never stagger', !!boss && !(boss.staggerUntil > g.time), boss ? `until ${boss.staggerUntil}` : 'no boss');
    check('bosses shrug off the tesla and the saw', !!boss && Z().stagger(boss, 1, null, 'tesla', me()) === 0 && Z().stagger(boss, 1, null, 'chainsaw', me()) === 0);
    g.bosses.despawn();
    clear();
    Z().specials.spawn('charger', { extra: true, near: me().pm.origin.slice() });
    const c = Z().pool.find((q) => q.alive && q.special === 'charger');
    c.health = c.maxHealth = 1e5;
    let n = 0;
    for (let i = 0; i < 3; i++) { if (c.sp.state !== 'chase') c.sp.state = 'chase'; shoot(c, 20, 2, 'm3', 9); if (c.staggerUntil > g.time) n++; ticks(90); }
    check('chargers are nearly immune (3 point-blank blasts)', n === 0, `${n} staggers, poise ${c.poise.toFixed(2)}`);
    check('a charger shrugs off the tesla and the saw', Z().stagger(c, 1, null, 'tesla', me()) === 0 && Z().stagger(c, 1, null, 'chainsaw', me()) === 0);
    c.sp.state = 'charge';
    check('a charging charger: nothing', Z().stagger(c, 5, null, 'shove', me()) === 0);
    clear();
    Z().specials.spawn('hunter', { extra: true, near: me().pm.origin.slice() });
    const h = Z().pool.find((q) => q.alive && q.special === 'hunter');
    h.health = h.maxHealth = 1e5;
    h.sp.state = 'wind'; h.sp.until = g.time + 0.3;
    blast(h);
    check('a hunter winding up loses its pounce', h.sp.state === 'recover' && h.staggerUntil > g.time, `${h.sp.state}`);
    h.sp.state = 'pin'; h.staggerUntil = 0; h.staggerFree = 0;
    blast(h);
    check('a hunter pinning somebody shrugs it off', h.sp.state === 'pin' && !(h.staggerUntil > g.time));
    h.sp.state = 'chase';
    clear();
    Z().specials.spawn('boomer', { extra: true, near: me().pm.origin.slice() });
    const b = Z().pool.find((q) => q.alive && q.special === 'boomer');
    b.health = b.maxHealth = 1e5;
    b.sp.state = 'vomit'; b.sp.from = g.time + 0.3; b.sp.until = g.time + 1.3;
    blast(b);
    check('a boomer heaving loses its bile', b.sp.state === 'chase' && b.staggerUntil > g.time && b.sp.cd.vomit > g.time + 2);
    return false;
  });

  // ---------------------------------------------------------------- fire: panic and the capped spread
  steps.push(async () => {
    clear();
    const z = zombieAt(200);
    ticks(5);
    const y0 = z.pm.angles[1];
    const o0 = z.pm.origin.slice();
    g.fire.burn(z, me(), 3, 16, 'molotov');
    ticks(2);
    const panicking = z.panicUntil > g.time && z.staggerUntil > g.time;
    let ran = 0;
    for (let i = 0; i < 60; i++) { g.tick(); if (z.cmd?.forwardmove === 400 && z.staggerUntil > g.time) ran++; }
    const turned = Math.abs(((z.pm.angles[1] - y0) % 360 + 540) % 360 - 180);
    check('a burning zombie panics', panicking && z.windup === 0, `panic ${(z.panicUntil - g.time).toFixed(2)} s left`);
    check('it runs off (turned away, moving)', ran > 40 && turned > 40, `ran ${ran} ticks, turned ${turned.toFixed(0)} deg, moved ${Math.hypot(z.pm.origin[0] - o0[0], z.pm.origin[1] - o0[1]).toFixed(0)} u`);
    // the spread: a burning zombie in a tight bunch sets a few alight, never all, never a second generation
    clear();
    const bunch = [];
    for (let i = 0; i < 9; i++) bunch.push(zombieAt(300 + (i % 3) * 22, ((i / 3) | 0) * 22 - 22));
    for (const q of bunch) q.zSpeed = 0;
    ticks(2);
    const sp0 = Z().staggers.counts.spread;
    g.fire.burn(bunch[4], me(), 6, 16, 'molotov');
    let maxBurning = 0;
    for (let i = 0; i < 150; i++) { g.tick(); maxBurning = Math.max(maxBurning, bunch.filter((q) => q.burn).length); }
    const spread = Z().staggers.counts.spread - sp0;
    const gen2 = bunch.some((q) => q.burn && q.burn.gen > 1);
    note(`fire: 1 lit in a bunch of 9 -> ${spread} caught it, at most ${maxBurning} burning at once`);
    check('fire spreads to the ones next to it', spread >= 1);
    check('the spread is capped', maxBurning <= 5 && !gen2, `${maxBurning} burning, second generation ${gen2}`);
    return false;
  });

  /** For the pictures: the bots behind you, no centre text, smoke and sparks gone. */
  function stage() {
    const p = me(), y = p.pm.angles[1] * DEG;
    for (const q of g.players) if (q.isBot && q.team === p.team && q.alive) { q.pm.origin[0] = p.pm.origin[0] - Math.cos(y) * 60; q.pm.origin[1] = p.pm.origin[1] - Math.sin(y) * 60; q.prevOrigin = q.pm.origin.slice(); }
    g.hud?.centerPrint?.('', 0); g.hud?.centerPrint?.('', 0, 'alert');
  }

  // ---------------------------------------------------------------- model hit reactions (screenshot)
  steps.push(async () => {
    clear();
    for (let i = 0; i < 150; i++) g.frame(0.01); // (the last test's fire and smoke die down)
    const p = me();
    if (p.weapons[3]) g.selectWeapon(p, p.weapons[3], true); // (the knife: a small view model)
    faceOpen(p);
    stage();
    p.pm.angles[0] = 4;
    const zs = [zombieAt(100, 51), zombieAt(100, 17), zombieAt(100, -17), zombieAt(100, -51)];
    for (const z of zs) { z.zSpeed = 0; z.nextAttack = 1e9; z.progT = 1e9; } // (stand there: no swings, no stuck hops)
    ticks(120);
    stage();
    for (let i = 0; i < 5; i++) g.frame(0.016);
    const m = zs[0].model;
    const headP0 = m.hHeadP;
    const headVsChest = () => { const b = m.rig.b; const q = b.chest.wq.clone().invert().multiply(b.head.wq); return q; };
    const rel0 = headVsChest();
    shoot(zs[0], 22, 1, 'deagle'); // head: snaps back
    check('a head shot from the front snaps the head back', m.hHeadP < headP0 - 4, `hHeadP ${m.hHeadP.toFixed(1)}`);
    shoot(zs[1], 48, 4, 'deagle'); // left shoulder
    check('a shoulder hit twists the chest', Math.abs(zs[1].model.hTwist) > 5, `twist ${zs[1].model.hTwist.toFixed(1)}`);
    shoot(zs[2], 48, 3, 'deagle'); // the gut
    check('a gut shot folds it', zs[2].model.hFold > 5, `fold ${zs[2].model.hFold.toFixed(1)}`);
    shoot(zs[3], 48, 6, 'deagle'); // a leg
    check('a leg hit buckles it', zs[3].model.hLegL > 0.5 && zs[3].model.hDip > 1);
    g.frame(0.016);
    // the head turned relative to the chest by more than a few degrees
    const ang = 2 * Math.acos(Math.min(1, Math.abs(rel0.dot(headVsChest())))) / DEG;
    check('the pose shows it', ang > 5, `head moved ${ang.toFixed(1)} deg against the chest`);
    for (const z of zs) z.model._hitDecay = () => {}; // (hold the pose for the picture)
    g.paused = true;
    return { shot: true };
  });

  steps.push(async () => {
    g.paused = false;
    for (const z of Z().pool) if (z.model) delete z.model._hitDecay;
    for (let i = 0; i < 60; i++) g.frame(0.01);
    const m = Z().pool.find((z) => z.alive)?.model;
    check('hit impulses die away', !!m && Math.abs(m.hHeadP) + Math.abs(m.hTwist) + m.hFold < 3);
    // knockdown, tesla stun, panic, reeling for the picture
    clear();
    const zs = [zombieAt(100, 51), zombieAt(100, 17), zombieAt(100, -17), zombieAt(100, -51)];
    for (const z of zs) { z.zSpeed = 0; z.nextAttack = 1e9; z.progT = 1e9; } // (stand there: no swings, no stuck hops)
    ticks(120);
    stage();
    blast(zs[3]); // reeling
    zs[3].staggerUntil = g.time + 5;
    fixRandom(0.01);
    shoot(zs[0], 20, 6, 'm3', 9);
    realRandom();
    Z().stagger(zs[1], 1, null, 'tesla', me());
    zs[1].staggerUntil = g.time + 5;
    g.fire.burn(zs[2], me(), 8, 1, 'molotov');
    ticks(2);
    zs[2].panicUntil = zs[2].staggerUntil = g.time + 5; zs[2].zSpeed = 0;
    for (let i = 0; i < 40; i++) g.frame(0.01);
    zs[0].staggerUntil = g.time + 5;
    for (let i = 0; i < 30; i++) g.frame(0.01);
    check('poses: knees, shaking, flailing, reeling', zs[0].model.kneelW > 0.8 && zs[1].model.stunW > 0.8 && zs[2].model.flailW > 0.8 && zs[3].model.reelW > 0.8, `${zs[0].model.kneelW.toFixed(2)} ${zs[1].model.stunW.toFixed(2)} ${zs[2].model.flailW.toFixed(2)} ${zs[3].model.reelW.toFixed(2)}`);
    g.paused = true;
    return { shot: true };
  });

  // ---------------------------------------------------------------- real gunfire: an M3 bought and fired
  steps.push(async () => {
    g.paused = false;
    clear();
    const p = me();
    g.rounds.buy(p, 'm3');
    const w = p.weapons[1];
    check('m3 bought', w?.id === 'm3');
    if (w) g.selectWeapon(p, w, true);
    for (let i = 0; i < 120; i++) g.frame(0.01); // (drawn)
    const z = zombieAt(90);
    z.nextAttack = 1e9;
    for (let i = 0; i < 3; i++) g.frame(0.01); // (its hitboxes where it stands)
    const build = g.buildLocalCmd;
    g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 1 });
    let t0 = -1, h = 0;
    for (let i = 0; i < 60 && t0 < 0; i++) {
      aim(p, chest(z));
      g.frame(0.01);
      if (z.staggerUntil > g.time) { t0 = g.time; h = held(z); }
    }
    g.buildLocalCmd = build;
    note(`real M3 at 90 u: ${t0 >= 0 ? `staggered, held ${h.toFixed(2)} s` : `no stagger (poise ${z.poise.toFixed(2)})`}`);
    check('a real M3 blast staggers it', t0 >= 0 && h > 0.4, `poise ${z.poise.toFixed(2)}`);
    for (let i = 0; i < 6; i++) g.frame(0.01);
    g.paused = true;
    return { shot: true };
  });

  // ---------------------------------------------------------------- head pops for the big guns
  steps.push(async () => {
    g.paused = false;
    clear();
    const popped = [];
    const pop0 = g.gore.popHead;
    g.gore.popHead = function (q, d) { popped.push(q.lastHit?.weaponId); return pop0.call(this, q, d); };
    for (const w of ['barrett', 'minigun', 'aa12', 'deagle', 'mp5']) {
      const z = zombieAt(150);
      z.health = 10;
      shoot(z, 500, 1, w);
      ticks(2);
    }
    g.gore.popHead = pop0;
    check('barrett, minigun, aa12, deagle pop heads; an mp5 doesn\'t', ['barrett', 'minigun', 'aa12', 'deagle'].every((w) => popped.includes(w)) && !popped.includes('mp5'), popped.join(' '));
    // a run plays on with bots shooting (staggers come from the squad's guns only)
    g.bots.think = think0;
    newRun({ allies: 3 });
    con('sv_cheats 1');
    con('zm_god_squad');
    con('zm_wave 9');
    evs.length = 0;
    const c0 = { ...Z().staggers.counts };
    for (let i = 0; i < 2500; i++) { g.tick(); if (i % 25 === 0) g.frame(0.25); }
    const c = Z().staggers.counts;
    note(`wave 9 with 3 bots, 25 s: ${c.stagger - c0.stagger} staggers, ${c.knockdown - c0.knockdown} knockdowns, ${c.pin - c0.pin} pins, ${c.cancel - c0.cancel} windups lost, ${evs.length} events`);
    check('in a real wave the squad staggers zombies', c.stagger + c.knockdown > c0.stagger + c0.knockdown && evs.every((e) => e.by && e.by.team === 'CT'));
    check('the wave plays out', Z().state === 'wave' || Z().state === 'break', Z().state);
    out.push(`[sim] ${fail ? 'SOME FAILED' : 'ALL PASSED'} (${pass} passed, ${fail} failed)`);
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r;
    try { r = await steps[i](); } catch (err) { check(`step ${i} threw`, false, `${err.message} ${err.stack?.split('\n')[1] || ''}`); r = true; out.push(`[sim] SOME FAILED (${pass} passed, ${fail} failed)`); }
    i++;
    const shot = r && typeof r === 'object' && r.shot;
    const done = r === true || i >= steps.length;
    return { log: out.join('\n'), done, shot };
  };
})();
