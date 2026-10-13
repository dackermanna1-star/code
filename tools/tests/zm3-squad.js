// Zombie survival, Milestone 3.3: squad roles and orders (zsquad.js, zorders.js, bots.js hooks).
// Roles (handed out, picked on the setup screen / &roles=, zm_role), role shopping (each role's
// guns and kit; never an RPG / M32 in a bot's hands), mid-wave restocks, target scoring (Focus,
// the one holding a teammate, the Marksman, the Gunner), the Focus order (radio and the H key)
// with bots really switching to it, "Hold here" (an arc of nav-snapped slots facing the lanes,
// the Demo's claymores, kept through a wave start), Follow (a ring of slots, open in front),
// Regroup (back, then follow), bots shooting a pinned teammate free, the Medic (sooner, farther,
// revives first), the Demo's molotovs, the Marksman's Barrett (tapped, scoped at range), the
// Gunner's minigun, the squad panel (PINNED / DOWN 0:18 / REVIVING / HOLDING), role glyphs, sounds.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5183/?autostart=1&mode=zombies&allies=5" tools/tests/zm3-squad.js /tmp/zm3squad
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a summary line.
/* global document, setTimeout, performance */
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n, frames = 0) => { for (let i = 0; i < n; i++) { g.tick(); if (frames && i % frames === 0) g.frame(0.01 * frames); } };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const SQ = () => g.zombies.squad;
  const me = () => g.local;
  const DEG = Math.PI / 180;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const squadBots = () => g.bots.bots.filter((b) => b.p.team === 'CT' && !b.p.isZombie);
  const byRole = (r) => squadBots().find((b) => b.p.role === r);
  let rec = [], busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push({ type: e.type, phase: e.phase, player: e.player, role: e.role, order: e.order, target: e.target, bots: e.bots })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let think0 = null;
  const thaw = () => { if (think0) g.bots.think = think0; think0 = null; };
  function newRun(opts = {}) {
    thaw();
    g.newGame({ mode: 'zombies', allies: 5, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 5);
    ticks(60);
    me().god = true;
    con('sv_cheats 1');
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
    listen();
  }
  const put = (p, pos) => { p.pm.origin = pos.slice(); p.prevOrigin = pos.slice(); p.pm.velocity = [0, 0, 0]; };
  /** Face the most open direction (level); returns how far it's open. */
  function faceOpen(p) {
    const e = p.eyePos();
    let best = 0, bd = -1;
    for (let a = 0; a < 360; a += 10) {
      let d = 0;
      for (const r of [100, 250, 450, 700, 1000]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 30])) d = r; else break; }
      if (d > bd) { bd = d; best = a; }
    }
    p.pm.angles[1] = best; p.pm.angles[0] = 0;
    return bd;
  }
  /**
   * Somewhere open: you go to a nav spot near you with a clear, level line at least minOpen
   * long, facing down it (the bots' fights at range need one); returns how far it's open.
   */
  function goOpen(minOpen = 900) {
    const start = g.nav.nearest(me().feet(), 200);
    let k = 0;
    for (const { node } of g.nav.around(start, 2500, 4000)) {
      if (k++ % 15 || node.edges.length < 7) continue;
      const e = [node.x, node.y, node.z + 64];
      for (let a = 0; a < 360; a += 15) {
        let d = 0;
        for (const r of [150, 300, 500, 700, 900, 1100]) { if (g.visible(e, [e[0] + Math.cos(a * DEG) * r, e[1] + Math.sin(a * DEG) * r, e[2] - 30])) d = r; else break; }
        if (d >= minOpen && g.nav.nearestXY([e[0] + Math.cos(a * DEG) * d * 0.8, e[1] + Math.sin(a * DEG) * d * 0.8, node.z], 60, 60)) {
          put(me(), [node.x, node.y, node.z + 36]);
          me().pm.angles[1] = a; me().pm.angles[0] = 0;
          return d;
        }
      }
    }
    return faceOpen(me());
  }
  const ahead = (p, dist, side = 0) => { const o = p.pm.origin, y = p.pm.angles[1] * DEG; return [o[0] + Math.cos(y) * dist - Math.sin(y) * side, o[1] + Math.sin(y) * dist + Math.cos(y) * side, o[2]]; };
  function walkerAt(at, hp = 100000) {
    Z().spawnZombie({ at, variant: 'walker' });
    let z = null, bd = 1e9;
    for (const q of Z().pool) { if (!q.alive || q.special) continue; const d = flat(q.pm.origin, at); if (d < bd) { bd = d; z = q; } }
    if (z) { z.zSpeed = 0; z.nextAttack = g.time + 1e3; z.health = z.maxHealth = hp; z.armor = 0; }
    return z;
  }
  const aimAt = (p, z) => {
    const e = p.eyePos(), c = z.eyePos();
    p.pm.angles[1] = Math.atan2(c[1] - e[1], c[0] - e[0]) / DEG;
    p.pm.angles[0] = -Math.atan2(c[2] - 10 - e[2], Math.hypot(c[0] - e[0], c[1] - e[1])) / DEG;
  };
  /** Everyone in the squad near you (behind you, so they see what you see), healthy, armed with what they bought. */
  function gather(spread = 70) {
    const o = me().pm.origin, y = me().pm.angles[1] * DEG, used = [o];
    squadBots().forEach((b, i) => {
      const s = (i - 2) * spread;
      const at = [o[0] - Math.cos(y) * 60 - Math.sin(y) * s, o[1] - Math.sin(y) * 60 + Math.cos(y) * s, o[2] - 36];
      // a free nav spot near there (never inside you or another bot: they'd be stuck in each other)
      let best = null, bd = 1e9;
      for (const { node } of g.nav.around(g.nav.nearestXY(at, 160, 80) || g.nav.nearest(me().feet(), 200), 200, 200)) {
        const q = [node.x, node.y, node.z + 36];
        if (used.some((u) => flat(u, q) < 44) || Math.abs(q[2] - o[2]) > 40) continue;
        const d = flat(q, at);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) { put(b.p, best); used.push(best); }
      b.p.pm.angles[1] = me().pm.angles[1];
    });
  }
  const steps = [];

  // ---------------------------------------------------------------- tables, sounds, binds, roles
  steps.push(async () => {
    const S = await import('/src/game/zsquad.js');
    const ZD = await import('/src/game/zdiff.js');
    const IN = await import('/src/engine/input.js');
    const RM = await import('/src/ui/radiomenu.js');
    newRun();
    check('ROLES: gunner, medic, demo, marksman, rifleman with guns, colours, text', ['gunner', 'medic', 'demo', 'marksman', 'rifleman'].every((r) => S.ROLES[r]?.label && S.ROLES[r].rgb && S.ROLES[r].text) && S.ROLE_ORDER.join() === 'gunner,medic,demo,marksman');
    check('no bot role ever buys a launcher (RPG / M32) or the flamethrower', Object.values(S.ROLES).every((R) => ![...(R.guns || []), ...(R.interim || []), ...R.extras].some((id) => /rpg|m32|flamethrower|remotec4/.test(id))));
    check('the Gunner: minigun then M249; Marksman: the Barrett first; Demo: claymores + molotovs; Medic: medkits', S.ROLES.gunner.guns.join() === 'minigun,m249' && S.ROLES.marksman.guns[0] === 'barrett' && S.ROLES.demo.extras.includes('claymore') && S.ROLES.demo.extras.includes('molotov') && S.ROLES.medic.extras.includes('medkit'));
    const four = ['casual', 'normal', 'hard', 'nightmare'];
    const mono = (f, up) => four.map((id) => f(ZD.ZDIFF[id].roles)).every((v, i, a) => !i || (up ? v >= a[i - 1] : v <= a[i - 1]));
    check('roles group: medicHeal / medicRange / focus shrink, restock reserve grows casual -> nightmare', mono((r) => r.medicHeal) && mono((r) => r.medicRange) && mono((r) => r.focus) && mono((r) => r.restock, true) && ZD.ZDIFF.sandbox.roles.restock === ZD.ZDIFF.normal.roles.restock);
    const missing = ['squad_order', 'squad_hold', 'squad_focus', 'squad_mark'].filter((n) => !g.sound.bank?.get(n));
    check('squad sounds synthesized', !missing.length, missing.join());
    check('Mouse 3 and I are bound to the Focus order (H stays the tips key); the radio menu has it (zombie survival only)', IN.DEFAULT_BINDS.MOUSE3 === 'zm_focus' && IN.DEFAULT_BINDS.KeyI === 'zm_focus' && !IN.DEFAULT_BINDS.KeyH && new RM.RadioMenu(document.createElement('div'), () => {}, { zombie: () => true }).items(1).includes('Focus My Target'));
    // roles handed out
    const bp = squadBots().map((b) => b.p);
    check('five bots: gunner, medic, demo, marksman, rifleman (in join order)', bp.map((p) => p.role).join() === 'gunner,medic,demo,marksman,rifleman', bp.map((p) => p.role).join());
    SQ().reset(); rec = [];
    ticks(60);
    check('a role event for each (roles reset on a new run, handed out again)', of('role').length === 5 && squadBots().every((b) => !!b.p.role));
    // the New Game picks: a pick per bot, 'auto' fills the default order around them
    newRun({ roles: ['medic', 'auto', 'rifleman', 'gunner'], allies: 5 });
    const picked = squadBots().map((b) => b.p.role).join();
    check('New Game role picks (auto slots take the next free role)', picked === 'medic,demo,rifleman,gunner,marksman', picked);
    check('picks from a string too (the URL: &roles=)', JSON.stringify(S.normRoles('demo,auto,x')) === '["demo","auto","auto"]' && S.normRoles('auto,auto') === null && S.normRoles(null) === null);
    newRun();
    const r = con('zm_role 5 medic');
    check('zm_role changes a bot\'s role; zm_squad lists them', squadBots()[4].p.role === 'medic' && /Medic/.test(r) && /Gunner/.test(con('zm_squad')) && of('role', (e) => e.role === 'medic').length === 1, r);
    return false;
  });

  // ---------------------------------------------------------------- shopping
  steps.push(async () => {
    newRun();
    const E = Z().economy;
    // the first break's trip on Normal's start money
    for (const b of squadBots()) { E.st(b.p).shopped = -99; E.botBuy(b); }
    const desc = () => squadBots().map((b) => `${b.p.role}:${b.p.weapons[1]?.id || '-'}:${b.p.weapons[4].map((w) => w.id + (w.count ?? 1)).join('+')}:$${b.p.money}`).join(' ');
    const first = desc();
    const M = byRole('medic').p, D = byRole('demo').p, G = byRole('gunner').p, K = byRole('marksman').p;
    check('first break: the Medic and the Demo buy their role guns, the Gunner / Marksman a stand-in', ['p90', 'ump45', 'mp5'].includes(M.weapons[1]?.id) && ['aa12', 'xm1014', 'm3'].includes(D.weapons[1]?.id) && !!G.weapons[1] && !!K.weapons[1], first);
    check('nobody overspends (money never negative)', squadBots().every((b) => b.p.money >= 0));
    // rich, but early: the heavies wait for their wave (diff.roles.heavyFrom)
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    const early = desc(), HF = Z().diff.roles.heavyFrom;
    check('rich at wave 1: no heavy before its wave (no M249 / minigun, Barrett, AA-12 yet)', !['minigun', 'm249'].includes(G.weapons[1]?.id) && K.weapons[1]?.id !== 'barrett' && D.weapons[1]?.id !== 'aa12' && !!G.weapons[1] && HF.minigun > HF.m249, early);
    Z().wave = HF.m249 - 1;
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    check('...the Gunner saves for the M249 first', G.weapons[1]?.id === 'm249', desc());
    // rich, from the heavies' waves: the role guns and kit
    Z().wave = Math.max(HF.minigun, HF.aa12, HF.barrett) - 1;
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    const rich = desc();
    check('...then the minigun', G.weapons[1]?.id === 'minigun', rich);
    check('the Marksman gets the Barrett', K.weapons[1]?.id === 'barrett', rich);
    check('the Demo: AA-12, 2 claymores, 2 molotovs', D.weapons[1]?.id === 'aa12' && D.weapons[4].find((w) => w.id === 'claymore')?.count === 2 && D.weapons[4].find((w) => w.id === 'molotov')?.count === 2, rich);
    check('the Medic: P90 and 2 medkits', M.weapons[1]?.id === 'p90' && M.weapons[4].find((w) => w.id === 'medkit')?.count === 2, rich);
    check('role guns come with ammo; armour on', [G, K, D, M].every((p) => p.weapons[1].ammo > 0 && p.armor === 100));
    check('attachments on the role guns with money to spare', [G, K, M].some((p) => Object.values(p.weapons[1].att || {}).some(Boolean)), rich);
    check('no bot holds an RPG, M32 or flamethrower', g.players.every((p) => !p.isBot || !p.allWeapons().some((w) => /^(rpg|m32|flamethrower)$/.test(w.id))));
    check('the Rifleman shops as before (the economy\'s own trip)', !!byRole('rifleman').p.weapons[1]);
    // mid-wave restock: a pack before it runs dry; the Medic a medkit; never below diff.roles.restock
    Z().nextWaveAt = g.time + 0.05; ticks(10);
    Z().nextSpawn = 1e9;
    const w = G.weapons[1];
    w.ammo = 0; G.money = 6000;
    M.weapons[4] = M.weapons[4].filter((x) => x.id !== 'medkit'); M.money = 5000;
    K.weapons[1].ammo = 0; K.money = Z().diff.roles.restock - 10;
    const m0 = G.money;
    ticks(200);
    check('mid-wave: the Gunner buys a belt before it runs dry', w.ammo > 0 && G.money < m0, `${w.ammo} $${G.money}`);
    check('mid-wave: the Medic restocks a medkit', M.weapons[4].some((x) => x.id === 'medkit'));
    check('mid-wave: never below the restock reserve', K.weapons[1].ammo === 0);
    return false;
  });

  // ---------------------------------------------------------------- targets and the Focus order
  steps.push(async () => {
    newRun();
    const G = byRole('gunner'), K = byRole('marksman'), R = byRole('rifleman');
    faceOpen(me());
    const z = walkerAt(ahead(me(), 500));
    Z().specials.spawn('hunter', { extra: true, near: ahead(me(), 600) });
    const h = Z().pool.find((q) => q.alive && q.special === 'hunter');
    const tw = (b, e, d) => SQ().targetWeight(b, e, d);
    check('weights: the Gunner prefers commons, the Marksman specials (and not commons at range), riflemen even', tw(G, z, 500) === 0.85 && tw(K, h, 500) === 0.35 && tw(K, z, 500) > 1.5 && tw(K, z, 100) === 1 && tw(R, z, 500) === 1 && tw(R, h, 500) === 1);
    // a hunter on a teammate: everyone's first
    h.sp.state = 'pin'; h.sp.victim = R.p;
    check('the one holding a teammate down goes to the top of every list', tw(G, h, 500) < 0.35 && tw(R, h, 500) === 0.3);
    h.sp.state = 'chase'; h.sp.victim = null;
    Z().clearHorde();
    // Focus: a decoy close to the bots, the target farther; you aim at the far one and press H
    const dist = goOpen(800);
    gather(40);
    // a spot you can see (the map decides how open it is)
    const seen = (d0, sides) => {
      const e = me().eyePos();
      for (const d of [d0, d0 * 0.8, d0 * 0.6]) for (const sd of sides) { const a = ahead(me(), d, sd); if (g.visible(e, [a[0], a[1], a[2] + 20]) && g.nav.nearestXY([a[0], a[1], a[2] - 36], 40, 60)) return a; }
      return ahead(me(), d0 * 0.5);
    };
    const near = walkerAt(seen(Math.min(260, dist * 0.35), [110, -110, 80, -80]));
    const far = walkerAt(seen(Math.min(700, dist * 0.85), [-40, 40, 0]));
    ticks(2); g.frame(0.01);
    aimAt(me(), far);
    rec = [];
    g.localCommand('zm_focus');
    const mates = squadBots().filter((b) => b.p.alive);
    check('the Focus key (zm_focus): every bot gets the Focus target (order event, target marked)', mates.every((b) => b.focus?.target === far) && of('order', (e) => e.order === 'focus' && e.target === far && e.bots === mates.length).length === 1 && SQ().mark?.target === far);
    check('a focused bot rates it 0.25 (x its role)', tw(R, far, 500) === 0.25 && tw(G, far, 500) < 0.25);
    let onFar = 0, onNear = 0;
    for (let k = 0; k < 300; k++) {
      g.tick(); if (k % 5 === 0) g.frame(0.05);
      if (k > 60 && k % 10 === 0) for (const b of mates) { const e = b.p.eyePos(); if (!g.visible(e, far.eyePos()) || !g.visible(e, near.eyePos())) continue; if (b.target === far) onFar++; else if (b.target === near) onNear++; }
    }
    const on = mates.filter((b) => b.target === far).length, sees = mates.filter((b) => b.p.alive && g.visible(b.p.eyePos(), far.eyePos())).length;
    check('the bots really switch to it over the closer decoy (the ones that see both)', on >= sees - 1 && onFar >= 10 && onFar > 3 * onNear, `on it ${on}/${sees} seeing; samples on the target ${onFar}, on the decoy ${onNear}`);
    // the HUD: the panel says FOCUS for the ones on it, the marker draws
    const s = { zombie: {} };
    SQ().hud(s);
    check('the squad panel has every bot, header FOCUS', s.squad?.n === 5 && s.squad.order === 'FOCUS');
    far.health = 1; g.damagePlayer(far, me(), 50, 2, 'deagle', [1, 0, 0], far.eyePos());
    ticks(2);
    check('the target dies: the marker goes', !SQ().mark);
    // nothing aimed at: Negative, no focus
    me().pm.angles[0] = -89; rec = [];
    g.localCommand('zm_focus');
    check('nothing under the crosshair: no focus, a Negative', mates.every((b) => !b.focus) && of('order', (e) => e.order === 'focus' && !e.target && e.bots === 0).length === 1);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- Hold here
  steps.push(async () => {
    newRun();
    const E = Z().economy;
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    Z().nextSpawn = 1e9;
    gather();
    rec = [];
    g.bots.onRadio(me(), 'Hold this position.');
    const F = SQ().hold, R = Z().diff.roles.holdArc, a = F?.anchor;
    const holders = squadBots().filter((b) => b.holdHere);
    check('Hold: an order event, every bot gets a slot', of('order', (e) => e.order === 'hold' && e.bots === 5).length === 1 && holders.length === 5);
    check('lanes found from the fronts (busiest first)', F && F.lanes.length >= 1 && F.lanes.every((l, i) => !i || l.w <= F.lanes[i - 1].w), F && F.lanes.map((l) => l.w).join());
    const onNav = holders.every((b) => { const n = g.nav.nearestXY(b.holdHere.pos, 6, 4); return !!n; });
    check('every slot snapped to a nav node', onNav);
    const slots = holders.map((b) => b.holdHere.pos);
    const apart = slots.every((s, i) => slots.every((q, j) => i === j || flat(s, q) >= 40));
    check('slots apart from each other (no blob)', apart, slots.map((s) => s.map(Math.round).join(',')).join(' | '));
    const ln = holders.filter((b) => b.p.role !== 'medic' && b.p.role !== 'marksman');
    check('the line stands on the arc (about holdArc out), facing its lane', ln.every((b) => { const d = flat(b.holdHere.pos, a); return d > R * 0.35 && d < R + 160 && b.holdHere.watch.length === 1; }), ln.map((b) => Math.round(flat(b.holdHere.pos, a))).join());
    const lane0 = F.lanes[0], G = byRole('gunner'), M = byRole('medic'), K = byRole('marksman');
    check('the Gunner on the busiest lane, the Medic in the middle, the Marksman behind the line', G.holdHere.lane === 0 && flat(M.holdHere.pos, a) < R * 0.5 && flat(K.holdHere.pos, a) < flat(G.holdHere.pos, a) + 10, `${flat(M.holdHere.pos, a).toFixed(0)} ${flat(K.holdHere.pos, a).toFixed(0)} ${flat(G.holdHere.pos, a).toFixed(0)}`);
    const dir = lane0.dir, gp = G.holdHere.pos;
    check('the busiest lane points out from the spot toward where they come from', (gp[0] - a[0]) * dir[0] + (gp[1] - a[1]) * dir[1] > R * 0.4);
    const D = byRole('demo');
    check('the Demo goes to plant claymores out on the lanes', D.zmTask?.kind === 'claymore' && D.zmTask.spots.length >= 1);
    const mines0 = g.explosives.mines.length;
    const dtrace = [], spots0 = (D.zmTask?.spots || []).map((q) => q.pos.map(Math.round).join(",")).join(" ");
    for (let k = 0; k < 2000; k++) { g.tick(); if (k % 10 === 0) g.frame(0.1); if (k % 200 === 0) dtrace.push(`${D.zmTask ? D.zmTask.phase + D.zmTask.i : '-'}@${Math.round(D.zmTask ? flat(D.p.pm.origin, D.zmTask.spots[Math.min(D.zmTask.i, D.zmTask.spots.length - 1)].pos) : 0)}/${D.mode}`); }
    const at = holders.map((b) => flat(b.p.pm.origin, b.holdHere.pos));
    check('they get to their slots and hold (one boxed in by a teammate holds close by)', at.filter((d) => d < 70).length >= 3 && at.filter((d) => d < 240).length >= 4 && holders.filter((b) => b.inPosition).length >= 3, holders.map((b, j) => `${b.p.role} ${at[j].toFixed(0)} at ${b.p.pm.origin.map(Math.round)} slot ${b.holdHere.pos.map(Math.round)} ${b.mode} ${b.inPosition ? 'in' : ''} ${b.zmTask ? b.zmTask.phase + b.zmTask.i : ''}`).join(' | ') + ` me ${me().pm.origin.map(Math.round)}`);
    const mines = g.explosives.mines.filter((m) => m.owner === D.p);
    check('the Demo\'s claymores are down out on the lanes, facing out', mines.length >= 1 && mines.length > mines0 - 1 && mines.every((m) => flat(m.pos, a) > R * 0.6), `${mines.length} mines ${mines.map((m) => flat(m.pos, a).toFixed(0)).join()} spots ${spots0} demo at ${D.p.pm.origin.map(Math.round)} trace ${dtrace.join(' ')}`);
    check('...and it has its gun back out', D.p.active?.def.slot === 1);
    const s = { zombie: {} };
    SQ().hud(s);
    const st = s.squad.rows.slice(0, s.squad.n).map((r) => r.state);
    check('the panel: HOLDING, header HOLD', st.filter((x) => x === 'HOLDING').length >= 3 && s.squad.order === 'HOLD', st.join());
    // a wave starts: the hold carries on
    Z().nextWaveAt = g.time + 0.02; ticks(5);
    check('a wave start keeps the Hold', Z().state === 'wave' && squadBots().every((b) => b.holdHere && b.holdHere.anchor === a));
    return { shot: true, log: '' };
  });

  // ---------------------------------------------------------------- Follow / Regroup / Cover
  steps.push(async () => {
    Z().clearHorde();
    Z().nextSpawn = 1e9;
    rec = [];
    g.bots.onRadio(me(), 'Follow me.');
    check('Follow: an order event, the Hold is off', of('order', (e) => e.order === 'follow' && e.bots === 5).length === 1 && !SQ().hold && squadBots().every((b) => !b.holdHere && b.follow?.p === me()));
    ticks(800, 10);
    const o = me().pm.origin, yaw = me().pm.angles[1] * DEG;
    const ds = squadBots().map((b) => flat(b.p.pm.origin, o));
    check('they come to you', ds.every((d) => d < 400), ds.map((d) => d.toFixed(0)).join());
    const sl = squadBots().map((b) => b.zmSlot?.pos).filter(Boolean);
    const apart = sl.every((s, i) => sl.every((q, j) => i === j || flat(s, q) >= 30));
    const dots = sl.map((s) => ((s[0] - o[0]) * Math.cos(yaw) + (s[1] - o[1]) * Math.sin(yaw)) / (flat(s, o) || 1));
    check('each to its own slot round you, none in your line of fire', sl.length >= 3 && apart && dots.every((d) => d < 0.86), sl.map((s, j) => s.map(Math.round).join(',') + ' ' + dots[j].toFixed(2)).join(' | '));
    const s = { zombie: {} };
    SQ().hud(s);
    check('the panel: FOLLOW', s.squad.rows.slice(0, s.squad.n).filter((r) => r.state === 'FOLLOW').length >= 3, s.squad.rows.slice(0, s.squad.n).map((r) => r.state).join());
    // Regroup: back to you first, then a Follow
    rec = [];
    g.bots.onRadio(me(), 'Regroup team.');
    check('Regroup: everyone breaks off back to you', squadBots().every((b) => b.fallback?.regroup && b.fallback.p === me()) && of('order', (e) => e.order === 'fallback').length === 1);
    for (const b of squadBots()) put(b.p, [me().pm.origin[0] + 40, me().pm.origin[1], me().pm.origin[2]]);
    ticks(20);
    check('...and once back, they follow', squadBots().every((b) => !b.fallback && b.follow?.p === me()));
    // Cover: the nearest one, close
    g.bots.onRadio(me(), 'Cover me!');
    const cov = squadBots().filter((b) => b.follow?.cover);
    check('Cover me: the nearest one sticks close', cov.length === 1);
    return false;
  });

  // ---------------------------------------------------------------- pinned teammates, the Medic, the panel states
  steps.push(async () => {
    newRun();
    const E = Z().economy;
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    Z().nextWaveAt = g.time + 0.02; ticks(5);
    Z().nextSpawn = 1e9; Z().clearHorde();
    gather(60);
    const R = byRole('rifleman');
    // a hunter pins the rifleman a little way off; the others shoot it off him
    Z().specials.spawn('hunter', { extra: true, near: R.p.pm.origin.slice() });
    const h = Z().pool.find((q) => q.alive && q.special === 'hunter');
    put(h, [R.p.pm.origin[0] + 30, R.p.pm.origin[1], R.p.pm.origin[2]]);
    Z().specials.pin(h, R.p);
    const s = { zombie: {} };
    SQ().hud(s);
    const row = s.squad.rows.slice(0, s.squad.n).find((r) => r.name === R.p.name);
    check('the panel: PINNED (blinking)', row?.state === 'PINNED' && row.blink);
    let freed = -1;
    for (let i = 0; i < 600 && freed < 0; i++) { g.tick(); if (i % 5 === 0) g.frame(0.05); if (!R.p.pinnedBy) freed = i; }
    check('the squad shoots (or shoves) him free', freed >= 0 && freed < 600, `freed after ${(freed / 100).toFixed(2)} s, hunter hp ${h.health}`);
    Z().clearHorde();
    // the Medic: a teammate at 60 is patched (others wait for 55); range and revive priority
    const M = byRole('medic'), G = byRole('gunner');
    check('heal thresholds: the Medic diff.roles.medicHeal, the rest 55', SQ().healAt(M) === Z().diff.roles.medicHeal && SQ().healAt(G) === 55 && SQ().healRange(M) === Z().diff.roles.medicRange && SQ().healRange(G) === 450);
    check('revives: the Medic goes farther', SQ().reviveRange(M, false) === 2700 && SQ().reviveRange(M, true) === 1350 && SQ().reviveRange(G, false) === 1800);
    G.p.health = 60;
    put(G.p, [M.p.pm.origin[0] + 300, M.p.pm.origin[1], M.p.pm.origin[2]]);
    if (!g.nav.canWalk(M.p.feet(), G.p.feet())) put(G.p, [M.p.pm.origin[0] + 60, M.p.pm.origin[1], M.p.pm.origin[2]]);
    let healing = false;
    for (let i = 0; i < 1000 && G.p.health < 61; i++) { g.tick(); if (M.heal?.target === G.p) healing = true; }
    check('the Medic patches up a teammate at 60 HP', healing && G.p.health > 60, `heal ${healing} hp ${G.p.health}`);
    // downed: DOWN m:ss, REVIVING
    const K = byRole('marksman');
    Z().downed.goDown(K.p);
    check('somebody just went down: the others leave him to the free Medic for a moment', SQ().reviveRange(G, false) === 0 && SQ().reviveRange(M, false) === 2700);
    SQ().hud(s);
    const kr = s.squad.rows.slice(0, s.squad.n).find((r) => r.name === K.p.name);
    check('the panel: DOWN 0:ss with the bleed-out time', /^DOWN \d:\d\d$/.test(kr?.state || '') && kr.down && kr.blink, kr?.state);
    // (you step out of the way: a human stands still only in tests)
    const away = g.nav.around(g.nav.nearest(me().feet(), 200), 700, 3000).find((x) => x.dist > 450 && squadBots().every((b) => flat(b.p.pm.origin, [x.node.x, x.node.y]) > 300));
    if (away) put(me(), [away.node.x, away.node.y, away.node.z + 36]);
    let rev = null, revRow = '', first = null;
    for (let i = 0; i < 2500 && K.p.downed; i++) {
      g.tick();
      if (i % 20 === 0) { SQ().hud(s); const rr = s.squad.rows.slice(0, s.squad.n).find((r) => r.state === 'REVIVING'); if (rr) revRow = rr.name; }
      const D = K.p.downed;
      if (D && !first && D.claim && g.time - D.claimT < 0.6) first = D.claim;
      if (D?.by) rev = D.by;
    }
    check('the Medic goes for him first (the others leave him to it)', first === M.p, `${first?.name} (${first?.role})`);
    check('he gets picked up by the Medic; the panel says REVIVING', !K.p.downed && rev === M.p && revRow === M.p.name, `by ${rev?.name} (${rev?.role}) row ${revRow}; still down ${!!K.p.downed} alive ${K.p.alive} medic ${M.p.alive ? flat(M.p.pm.origin, K.p.pm.origin).toFixed(0) : 'dead'} away, revive ${M.revive ? 'on' : 'off'} mode ${M.mode}`);
    return false;
  });

  // ---------------------------------------------------------------- the Demo's molotovs, the Marksman, the Gunner
  steps.push(async () => {
    newRun();
    const E = Z().economy;
    Z().wave = 20; // (shopping as if late in the run: the heavies are open - diff.roles.heavyFrom)
    for (const b of squadBots()) { b.p.money = 14000; E.st(b.p).shopped = -99; E.botBuy(b); }
    Z().wave = 0;
    Z().nextWaveAt = g.time + 0.02; ticks(5);
    Z().nextSpawn = 1e9; Z().clearHorde();
    const dist = goOpen(1000);
    gather(60);
    const D = byRole('demo');
    // a pack of four, out in the open, away from everyone
    const c = ahead(me(), Math.min(800, dist * 0.8));
    const pack = [];
    for (const [dx, dy] of [[0, 0], [40, 30], [-40, 30], [0, -45]]) pack.push(walkerAt([c[0] + dx, c[1] + dy, c[2]]));
    put(D.p, me().pm.origin.slice());
    D.p.pm.angles[1] = me().pm.angles[1];
    const n0 = D.p.weapons[4].find((w) => w.id === 'molotov')?.count ?? 0;
    ticks(1);
    const P0 = SQ().packFor(D);
    const why = `pack ${P0 ? P0.sol.err.toFixed(0) : 'none'} state ${Z().state} near ${D.zombieNear(250, 380)}`;
    let thrown = false;
    for (let i = 0; i < 700 && !thrown; i++) {
      g.tick(); if (i % 5 === 0) g.frame(0.05);
      thrown = g.projectiles.list.some((pr) => pr.type === 'molotov' && pr.owner === D.p) || g.fire.patches.some((pa) => pa.owner === D.p);
    }
    check('the Demo throws a molotov into the pack', thrown && (D.p.weapons[4].find((w) => w.id === 'molotov')?.count ?? 0) < n0, `n0 ${n0} dist ${dist} ${why} nade ${D.nade?.phase} mode ${D.mode}`);
    let landed = null;
    for (let i = 0; i < 300 && !landed; i++) { g.tick(); landed = g.fire.patches.find((pa) => pa.owner === D.p); }
    check('...and it lands on them', !!landed && flat(landed.center, c) < 220, landed ? flat(landed.center, c).toFixed(0) : 'no fire');
    check('never near one of us', !landed || g.players.every((q) => !q.alive || q.isZombie || q.team !== 'CT' || flat(q.pm.origin, landed.center) > 150));
    Z().clearHorde(); g.fire.clear?.();
    // the Marksman: the Barrett tapped (not held), scoped in at range
    const K = byRole('marksman');
    check('the Barrett counts as a tapped auto-sniper for bots', K.weaponClass(K.p.weapons[1]) === 'autosniper');
    put(K.p, me().pm.origin.slice()); K.p.pm.angles[1] = me().pm.angles[1];
    g.selectWeapon(K.p, K.p.weapons[1], true);
    const fz = walkerAt(ahead(me(), Math.min(900, dist * 0.9)));
    let zoomed = false, shots = 0, last = K.p.weapons[1].clip;
    for (let i = 0; i < 500; i++) {
      g.tick(); if (i % 5 === 0) g.frame(0.05);
      if (K.p.fov < 90) zoomed = true;
      const cl = K.p.weapons[1].clip; if (cl < last) shots += last - cl; last = cl;
    }
    check('the Marksman scopes in at range and keeps firing', zoomed && shots >= 3 && fz.health < fz.maxHealth, `zoomed ${zoomed} shots ${shots}`);
    Z().clearHorde();
    for (let i = 0; i < 200; i++) g.tick();
    check('...and zooms back out once it\'s quiet', K.p.fov >= 90, `fov ${K.p.fov}`);
    // the Gunner's minigun
    const G = byRole('gunner');
    put(G.p, me().pm.origin.slice()); G.p.pm.angles[1] = me().pm.angles[1];
    g.selectWeapon(G.p, G.p.weapons[1], true);
    const gz = walkerAt(ahead(me(), Math.min(500, dist * 0.6)));
    let fired = 0, lastC = G.p.weapons[1].clip;
    for (let i = 0; i < 400; i++) { g.tick(); if (i % 5 === 0) g.frame(0.05); const cl = G.p.weapons[1].clip; if (cl < lastC) fired += lastC - cl; lastC = cl; }
    check('the Gunner\'s minigun spins up and fires', G.p.weapons[1].id === 'minigun' && fired >= 10 && gz.health < gz.maxHealth, `${fired} rounds, ${gz.maxHealth - gz.health} damage`);
    check('no bot errors', g.bots.stats.errors === 0, String(g.bots.stats.errors));
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- a real wave with roles, the HUD (look at it)
  steps.push(async () => {
    newRun();
    const E = Z().economy;
    for (const b of squadBots()) { b.p.money = 9000; E.st(b.p).shopped = -99; E.botBuy(b); }
    con('zm_wave 4');
    let down = 0, mol = 0;
    for (let i = 0; i < 3000; i++) {
      g.tick(); if (i % 10 === 0) g.frame(0.1);
      if (i % 50 === 0) { down += squadBots().filter((b) => b.p.downed).length; mol += g.projectiles.list.filter((pr) => pr.type === 'molotov').length; }
    }
    check('a wave with roles plays (no bot errors)', g.bots.stats.errors === 0 && Z().kills + Z().squadKills > 0, `kills ${Z().squadKills} errors ${g.bots.stats.errors}`);
    // the view: face your squad (glyphs over them) with a Focus target marked
    Z().clearHorde(); Z().nextSpawn = 1e9;
    const open = goOpen(900);
    // the bots spread out ahead of you (as if holding), a zombie past them marked
    squadBots().forEach((b, i) => {
      const a = ahead(me(), Math.min(220, open * 0.4) + (i % 2) * 70, (i - 2) * 70);
      const n = g.nav.nearestXY([a[0], a[1], a[2] - 36], 120, 80);
      if (n) put(b.p, [n.x, n.y, n.z + 36]);
      b.p.pm.angles[1] = me().pm.angles[1];
    });
    const th = g.bots.think;
    g.bots.think = () => {}; // (they hold still for the picture)
    const z = walkerAt(ahead(me(), Math.min(700, open * 0.9), 60));
    ticks(2); g.frame(0.01);
    if (z) { aimAt(me(), z); g.localCommand('zm_focus'); me().pm.angles[1] -= 10; me().pm.angles[0] = 6; }
    squadBots()[1].p.health = 40;
    ticks(3); g.frame(0.016);
    g.bots.think = th;
    return { shot: true, log: `[sim] info: squad downs sampled ${down}, molotovs in flight sampled ${mol}` };
  });

  // ---------------------------------------------------------------- the setup screen: Auto / Pick
  steps.push(async () => {
    thaw();
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const until = async (fn, ms = 4000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await until(() => q('.mm-front'));
    q('.fe-entry[data-cmd="zsetup"]')?.click();
    await until(() => q('.fe-setup'));
    const roleRow = qa('.fe-setup .fe-row').find((r) => /Roles/i.test(r.querySelector('.k')?.textContent || ''));
    check('setup: a Roles row (Auto / Pick)', !!roleRow && roleRow.querySelectorAll('.fe-seg span').length === 2);
    // 4 bots
    const minus = q('.fe-step button'), plus = qa('.fe-step button')[1];
    for (let i = 0; i < 12; i++) minus.click();
    for (let i = 0; i < 4; i++) plus.click();
    const autoChips = qa('.fe-roles span').map((s) => s.textContent).join();
    check('setup Auto: the default roles shown (not clickable)', autoChips === 'GUN,MED,DEM,MRK' && qa('.fe-roles span.off').length === 4, autoChips);
    roleRow.querySelectorAll('.fe-seg span')[1].click();
    const chip = () => qa('.fe-roles span');
    chip()[0].click(); // auto -> gunner
    chip()[0].click(); // -> medic
    chip()[3].click(); chip()[3].click(); chip()[3].click(); chip()[3].click(); chip()[3].click(); // -> rifleman
    const picked = chip().map((s) => s.textContent).join();
    check('setup Pick: clicking a chip cycles its role; the autos fill around the picks', picked === 'MED,GUN,DEM,RIF', picked);
    return { wait: 900 };
  });
  steps.push(async () => ({ shot: true }));
  steps.push(async () => {
    const q = (s) => document.querySelector(s);
    const until = async (fn, ms = 6000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
    q('.fe-setup .fe-go').click();
    await until(() => !g.menus.isOpen() && g.local?.alive, 8000);
    ticks(80);
    const roles = g.players.filter((p) => p.isBot && p.team === 'CT').map((p) => p.role).join();
    check('setup Pick: the picks reach the run', roles === 'medic,gunner,demo,rifleman', roles);
    thaw();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    let done = false, shot = false, extra = '', wait = 0;
    try {
      const r = await steps[i++]();
      if (r === true) done = true;
      else if (r && typeof r === 'object') { shot = !!r.shot; extra = r.log || ''; wait = r.wait || 0; }
    } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; }
    if (i >= steps.length) done = true;
    const lines = out.splice(0);
    if (extra) lines.unshift(extra);
    if (done) { lines.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`); thaw(); }
    return { log: lines.join('\n'), done, shot, wait };
  };
})();
