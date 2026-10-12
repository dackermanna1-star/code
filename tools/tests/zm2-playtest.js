// End-to-end play test of Milestone 2 ("a horde worth fighting"), all six features together:
// title -> setup (Normal, 3 bots) -> waves with an auto-aim player firing real bullets, then a few
// staged moments for the screenshots: a front callout at a wave start, a wave-type banner, a
// shotgun stagger, a shove, a telegraph arc and a mixed roster lined up in front of you.
// usage (dev server running; no autostart: it boots to the title screen):
//   node tools/drive.mjs "http://localhost:5173/" tools/tests/zm2-playtest.js /tmp/zplay2
/* global performance, setTimeout */
(() => {
  const g = window.__game, F = window.__front;
  const DEG = Math.PI / 180;
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 5000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const lines = [];
  let fails = 0;
  const log = (t) => lines.push('[sim] ' + t);
  const check = (name, ok, info = '') => { lines.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' (' + info + ')' : ''}`); if (!ok) fails++; };
  const out = () => { const l = lines.join('\n'); lines.length = 0; return l; };
  const Z = () => g.zombies;
  const ev = {};
  const evs = [];
  let bound = false;
  const bind = () => {
    if (bound) return; bound = true;
    Z().events.on('*', (e, type) => {
      ev[type] = (ev[type] || 0) + 1;
      if (type === 'front' || type === 'pace' || type === 'combo' || type === 'save' || type === 'wave' || type === 'shove')
        evs.push(`${type}:${e.phase || ''}${e.name ? ' ' + e.name : ''}${e.mod ? ' ' + e.mod : ''}${e.by && typeof e.by === 'string' ? ' by ' + e.by : ''}${e.kinds ? ' ' + e.kinds.join('+') : ''}${type === 'wave' ? ' w' + e.wave : ''}`);
    });
  };
  const prints = [];
  let hooked = false;
  const hookHud = () => {
    if (hooked) return; hooked = true;
    const cp = g.hud.centerPrint.bind(g.hud);
    g.hud.centerPrint = (t, s, ch) => { prints.push(String(t).replace(/\n/g, ' / ')); return cp(t, s, ch); };
  };

  // ------------------------------------------------------------ the auto-aim player
  let buttons = 0, flip = 0, hold = false;
  const aimAt = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  const targetOf = (p) => {
    const e = p.eyePos();
    let best = null, bd = 1e9;
    for (const z of Z().pool) {
      if (!z.alive) continue;
      const c = [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + (z.model?.crawl ? -20 : 8)];
      const d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
      if (d < bd && d < 1600 && g.visible(e, c)) { bd = d; best = c; }
    }
    if (g.bosses?.boss?.alive) { const b = g.bosses.boss, c = [b.pm.origin[0], b.pm.origin[1], b.pm.origin[2] + 20]; if (g.visible(e, c)) best = best || c; }
    return best;
  };
  const orig = g.buildLocalCmd.bind(g);
  let shots = 0;
  const play = (frames, dt = 0.03) => {
    const p = g.local;
    for (let i = 0; i < frames; i++) {
      buttons = 0;
      if (p.alive && !hold) {
        const c = targetOf(p), w = p.active;
        if (c) {
          aimAt(p, c);
          if (w && w.clip === 0) buttons = 4;
          else if ((flip++ & 1) === 0) { buttons = 1; shots++; }
        } else if (w && w.clip != null && w.clip < (w.def.clip || 30) * 0.5 && w.ammo > 0) buttons = 4;
      }
      g.frame(dt);
      if (Z().state === 'over') break;
    }
  };
  const shop = () => {
    const p = g.local, R = g.rounds, got = [];
    const b = (id) => { if (R.buy(p, id)) { got.push(id); return true; } return false; };
    const prim = p.weapons[1]?.id;
    if (!prim || prim === 'mp5') { if (p.money >= 3100 + 650) b('m4a1'); else if (!prim && p.money >= 1500 + 650) b('mp5'); }
    if (p.armor < 50) b(p.money >= 1000 ? 'vesthelm' : 'vest');
    for (let i = 0; i < 3; i++) b('primammo');
    if (p.weapons[1]) g.selectWeapon(p, p.weapons[1], true);
    return got;
  };
  // staging helpers
  const ahead = (p, d, side = 0) => { const y = p.pm.angles[1] * DEG, o = p.pm.origin; return [o[0] + Math.cos(y) * d - Math.sin(y) * side, o[1] + Math.sin(y) * d + Math.cos(y) * side, o[2]]; };
  /** Face the longest clear stretch from where you stand (so staged zombies have room). */
  const faceOpen = (p) => {
    let by = p.pm.angles[1], bl = 0;
    const e = p.eyePos();
    for (let a = 0; a < 360; a += 15) {
      let l = 0;
      for (let d = 40; d <= 700; d += 30) { const c = [e[0] + Math.cos(a * DEG) * d, e[1] + Math.sin(a * DEG) * d, e[2] - 20]; if (!g.visible(e, c) || !g.nav.nearest(c, 80)) break; l = d; }
      if (l > bl) { bl = l; by = a; }
    }
    p.pm.angles[1] = by; p.pm.angles[0] = 8;
    return bl;
  };
  /** Somewhere open and outdoors (sky above, a clear stretch out to reach u ahead and to the sides), facing down it. */
  const goOutside = (p, reach = 240) => {
    const nodes = g.nav.nodes;
    let best = null, bs = -1;
    for (let i = 0; i < 700; i++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const e = [n.x, n.y, n.z + 64];
      if (!g.visible(e, [e[0], e[1], e[2] + 700])) continue;
      for (let a = 0; a < 360; a += 30) {
        const c = Math.cos(a * DEG), sn = Math.sin(a * DEG);
        let ok = true;
        for (const r of [80, reach / 2, reach]) for (const side of [-130, 0, 130]) if (ok && !g.visible(e, [e[0] + c * r - sn * side, e[1] + sn * r + c * side, e[2] - 50])) ok = false;
        if (!ok) continue;
        const sc = (g.visible([e[0] + c * 160, e[1] + sn * 160, e[2]], [e[0] + c * 160, e[1] + sn * 160, e[2] + 700]) ? 1 : 0) + Math.random() * 0.5;
        if (sc > bs) { bs = sc; best = { n, a }; }
      }
    }
    if (!best) return false;
    p.pm.origin = [best.n.x, best.n.y, best.n.z + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0];
    p.pm.angles[1] = best.a; p.pm.angles[0] = 6;
    return true;
  };
  const near = (at) => { let z = null, bd = 1e9; for (const x of Z().pool) { if (!x.alive) continue; const d = Math.hypot(x.pm.origin[0] - at[0], x.pm.origin[1] - at[1]); if (d < bd) { bd = d; z = x; } } return z; };
  const frames = (n, dt = 0.016) => { for (let i = 0; i < n; i++) g.frame(dt); };
  const upList = () => { const p = g.local; return Z().pool.filter((x) => x.alive).map((x) => `${x.special || x.variant}@${Math.hypot(x.pm.origin[0] - p.pm.origin[0], x.pm.origin[1] - p.pm.origin[1]) | 0}`).join(' '); };
  const hush = () => { Z().clearHorde(); Z().nextSpawn = 1e9; Z().director.pending.length = 0; }; // (a staged shot: nothing else comes)
  const quietBots = () => { const t0 = g.bots.think; g.bots.think = () => {}; return () => { g.bots.think = t0; }; };

  let step = 0, waveSeen = 0, wavesPlayed = 0, calloutShot = false, stage = 0;
  window.__drive = async () => {
    step++;
    try {
      if (step === 1) {
        g.buildLocalCmd = orig;
        await until(() => F.title.active && F.title.shot, 8000);
        await sleep(2000);
        check('title: backdrop and main menu', F.title.active && !!q('.mm-front'));
        return { log: out(), shot: true };
      }
      if (step === 2) {
        q('.fe-news .x')?.click();
        q('.fe-entry[data-cmd="zsetup"]').click();
        await until(() => q('.fe-setup'));
        q('.fe-card[data-id="normal"]').click();
        const st = qa('.fe-setup .fe-step button');
        for (let i = 0; i < 12; i++) st[0].click();
        for (let i = 0; i < 3; i++) st[1].click();
        check('setup: Normal, 3 bots', q('.fe-card.on')?.dataset.id === 'normal' && q('.fe-step span').textContent === '3');
        await sleep(300);
        return { log: out(), shot: true };
      }
      if (step === 3) {
        q('.fe-setup .fe-go').click();
        await until(() => !g.menus.isOpen() && g.zombies.enabled && g.local?.alive, 8000);
        bind(); hookHud();
        await sleep(800);
        check('run started: Normal, 3 bots', Z().diff.id === 'normal' && g.players.filter((x) => x.isBot && x.team === g.local.team).length === 3);
        g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: buttons });
        g.local.god = true;
        shop();
        con('zm_ready');
        return { log: out() };
      }
      // ---------------------------------------------------------- natural waves (1-3)
      if (stage === 0) {
        const z = Z();
        const w0 = z.wave, st0 = z.state;
        play(40);
        let shot = false;
        if (z.state === 'wave' && z.wave !== waveSeen) {
          waveSeen = z.wave; wavesPlayed++;
          log(`wave ${z.wave} (${z.stats.mod || 'no type'}): count ${z.stats.count} hp ${z.stats.health} cap ${z.stats.maxAlive} fronts ${z.director.open?.map((f) => f.name).join(', ')} | prints: ${prints.slice(-3).join(' || ')}`);
          if (!calloutShot) { calloutShot = true; shot = true; check('wave start: a front callout', prints.some((t) => /coming|through|from/i.test(t)), prints.slice(-3).join(' || ')); }
        }
        if (z.state === 'break' && st0 === 'wave') {
          const vs = {};
          for (const x of z.pool) if (x.variant) vs[x.variant] = (vs[x.variant] || 0) + 1;
          log(`wave ${w0} cleared t=${g.time.toFixed(0)} kills ${z.kills} shots ${shots} staggers ${JSON.stringify(z.staggers.counts)}`);
          log(`  bought ${shop().join(',') || 'nothing'}; ${con('zm_ready')}`);
        }
        if (wavesPlayed >= 3 && z.state === 'break') { stage = 1; return { log: out(), shot: true }; }
        if (g.time > 700) { stage = 1; log('time cap on the natural waves'); }
        return { log: out(), shot };
      }
      // ---------------------------------------------------------- a wave type, forced
      if (stage === 1) {
        stage = 2;
        log(con('sv_cheats 1'));
        log(con('zm_mod iron'));
        log(con('zm_wave 8'));
        frames(90, 0.02);
        const S = Z().stats;
        check('wave type: Iron Rain banner', S.mod === 'iron', `${S.mod} prints: ${prints.slice(-3).join(' || ')}`);
        return { log: out(), shot: true };
      }
      if (stage === 2) {
        stage = 3;
        play(250);
        const vs = {};
        for (const x of Z().pool) if (x.alive && x.variant) vs[x.variant] = (vs[x.variant] || 0) + 1;
        log(`iron rain, 7.5 s in: up ${JSON.stringify(vs)} pace ${Z().director.phase} | evs ${evs.slice(-8).join(' | ')}`);
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- the staged shots
      if (stage === 3) { // the mixed roster, lined up
        stage = 4;
        g.paused = false;
        const p = g.local;
        hush();
        const unq = quietBots();
        frames(5);
        const room = goOutside(p, 360) ? 400 : faceOpen(p);
        const kinds = ['walker', 'runner', 'riot', 'bloater', 'burning', 'walker', 'crawler', 'walker'];
        kinds.forEach((v, i) => { Z().spawnZombie({ at: ahead(p, Math.min(room - 40, 260 + (i % 2) * 60), (i - 3.5) * 42), variant: v, extra: true }); });
        for (const x of Z().pool) if (x.alive) { x.zSpeed = 0; x.nextAttack = 1e9; x.pm.angles[1] = (p.pm.angles[1] + 180) % 360; }
        frames(40);
        const skins = new Set(Z().pool.filter((x) => x.alive).map((x) => x.skin));
        check('a mixed roster: several looks up at once', skins.size >= 4, [...skins].join(' '));
        unq();
        g.paused = true; // (held there for the shot)
        return { log: out(), shot: true };
      }
      if (stage === 4) { // a shotgun blast staggers the front one
        stage = 5;
        g.paused = false;
        const p = g.local;
        hush();
        const unq = quietBots();
        frames(5);
        g.giveWeapon(p, 'm3', { select: true, fullAmmo: true }); // (mid-wave: the shop sells no guns)
        frames(80);
        if (!goOutside(p, 240)) faceOpen(p);
        Z().spawnZombie({ at: ahead(p, 100), variant: 'walker', extra: true });
        const z = near(ahead(p, 100));
        z.nextAttack = 1e9; z.zSpeed = 60; z.health = z.maxHealth = 2000; // (the blast mustn't kill it: a kill isn't a stagger)
        frames(3);
        let t0 = -1;
        hold = true;
        for (let i = 0; i < 60 && t0 < 0; i++) {
          aimAt(p, [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 14]);
          buttons = 1;
          g.frame(0.01);
          if (z.staggerUntil > g.time) t0 = g.time;
        }
        buttons = 0;
        frames(8, 0.02);
        log(`stagger shot: up ${upList()} target ${z?.variant} hp ${z?.health} gun ${p.active?.id} clip ${p.active?.clip} shots ${ev.shot || 0}`);
        check('stagger: a point-blank M3 stops it', t0 >= 0 && z.staggerKind !== 'flinch', `${z.staggerKind} reel ${z.model.reelW.toFixed(2)} kneel ${z.model.kneelW.toFixed(2)}`);
        hold = false;
        unq();
        g.paused = true; // (held there for the shot)
        return { log: out(), shot: true };
      }
      if (stage === 5) { // a shove
        stage = 6;
        g.paused = false;
        const p = g.local;
        hush();
        const unq = quietBots();
        frames(80);
        if (!goOutside(p, 240)) faceOpen(p);
        Z().spawnZombie({ at: ahead(p, 50), variant: 'walker', extra: true });
        Z().spawnZombie({ at: ahead(p, 55, 30), variant: 'walker', extra: true });
        for (const x of Z().pool) if (x.alive) { x.nextAttack = 1e9; x.zSpeed = 0; x.pm.angles[1] = (p.pm.angles[1] + 180) % 360; }
        frames(3);
        const n0 = ev.shove || 0;
        g.localCommand('shove');
        frames(9, 0.016);
        check('shove: the cone takes them, a pip spent', (ev.shove || 0) === n0 + 1 && Z().shove.pips(p) < Z().diff.shove.pips, `pips ${Z().shove.pips(p)} staggers ${Z().pool.filter((x) => x.alive && x.staggerUntil > g.time).length}`);
        unq();
        g.paused = true; // (held there for the shot)
        return { log: out(), shot: true };
      }
      if (stage === 6) { // a hunter winding up on your right: the telegraph arc
        stage = 7;
        g.paused = false;
        const p = g.local;
        hush();
        const unq = quietBots();
        frames(5);
        if (!goOutside(p, 420)) faceOpen(p);
        const o = p.pm.origin;
        let at = null;
        for (const a of [40, -40, 25, -25, 0]) { // off to one side, where it can see you from
          const r = (p.pm.angles[1] + a) * DEG, c = [o[0] + Math.cos(r) * 380, o[1] + Math.sin(r) * 380, o[2]];
          if (g.visible(p.eyePos(), [c[0], c[1], c[2] + 20]) && g.nav.nearest(c, 80)) { at = c; break; }
        }
        Z().specials.spawn('hunter', { extra: true, near: at || ahead(p, 300) });
        const h = Z().pool.find((x) => x.alive && x.special === 'hunter');
        if (h) h.sp.cd.pounce = g.time + 0.3; // (its pounce ready: it lines up from out there instead of running in)
        let seen = false;
        const spot = (at || ahead(p, 380)).slice();
        for (let i = 0; i < 600 && h?.alive; i++) {
          g.frame(0.01);
          if (h.sp.state === 'chase' && Math.hypot(h.pm.origin[0] - o[0], h.pm.origin[1] - o[1]) < 200) { h.pm.origin = spot.slice(); h.prevOrigin = spot.slice(); } // (keep it out there till it lines up)
          const th = Z().specials.threats().find((r) => r.z === h && r.target === p);
          if (th && th.phase === 'windup' && th.prog > 0.4) { seen = true; break; }
        }
        g.paused = true; // (held there for the shot)
        const HS = await import('/src/game/hudstate.js');
        const arcs = HS.buildHudState(g).threats?.arcs?.length || 0;
        log(`telegraph shot: up ${upList()} hunter at ${at ? 'side' : 'ahead'} state ${h?.sp?.state}`);
        check('telegraph: a hunter lining up / winding up draws an arc', arcs > 0, `seen ${seen} arcs ${arcs}`);
        unq();
        g.paused = true; // (held there for the shot)
        return { log: out(), shot: true };
      }
      if (stage === 7) {
        stage = 8;
        g.paused = false;
        log('events: ' + JSON.stringify(ev));
        log('evs: ' + evs.slice(-30).join(' | '));
        log('prints (last 14): ' + prints.slice(-14).join(' || '));
        log(`playtest: ${fails} failure${fails === 1 ? '' : 's'}`);
        return { log: out(), done: true };
      }
    } catch (e) {
      lines.push('[sim] ERROR ' + e.stack);
      return { log: out(), done: true };
    }
    return { log: out(), done: true };
  };
})();
