// End-to-end play test of Milestone 3 ("every run is different"), all six features together:
// title (What's new) -> setup (Normal, 3 bots, roles) -> waves with an auto-aim player firing real
// bullets -> the perk draft overlay at the break -> the Weapon Forge page and a forged gun -> a
// power-up on the floor and taken -> an airdrop (the crate on its chute, opened) -> the squad
// panel and a Hold order -> a boss: the staged arrival, a posture break, a phase, the trophy and
// its relic pick -> a katana kill. Screenshots at every step (look at them).
// usage (dev server running; no autostart: it boots to the title screen):
//   node tools/drive.mjs "http://localhost:5173/" tools/tests/zm3-playtest.js /tmp/zplay3
/* global performance, setTimeout, MouseEvent */
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
  const me = () => g.local;
  const ev = {};
  let bound = false;
  const bind = () => { if (bound) return; bound = true; Z().events.on('*', (e, type) => { ev[type] = (ev[type] || 0) + 1; }); };
  const prints = [];
  let hooked = false;
  const hookHud = () => {
    if (hooked) return; hooked = true;
    const cp = g.hud.centerPrint.bind(g.hud);
    g.hud.centerPrint = (t, s, ch) => { prints.push(String(t).replace(/\n/g, ' / ')); return cp(t, s, ch); };
  };
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));

  // ------------------------------------------------------------ the auto-aim player
  let buttons = 0, flip = 0, hold = false, fwd = 0;
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
    return best;
  };
  const orig = g.buildLocalCmd.bind(g);
  const play = (frames, dt = 0.03) => {
    const p = me();
    for (let i = 0; i < frames; i++) {
      buttons = 0;
      if (p.alive && !hold) {
        const c = targetOf(p), w = p.active;
        if (c) {
          aimAt(p, c);
          if (w && w.clip === 0) buttons = 4;
          else if ((flip++ & 1) === 0) buttons = 1;
        } else if (w && w.clip != null && w.clip < (w.def.clip || 30) * 0.5 && w.ammo > 0) buttons = 4;
      }
      g.frame(dt);
      if (Z().state === 'over') break;
    }
  };
  const frames = (n, dt = 0.016) => { for (let i = 0; i < n; i++) g.frame(dt); };
  const ticks = (n) => { for (let i = 0; i < n; i++) { g.tick(); if (i % 3 === 0) g.frame(0); } };
  const shop = () => {
    const p = me(), R = g.rounds, got = [];
    const b = (id) => { if (R.buy(p, id)) { got.push(id); return true; } return false; };
    const prim = p.weapons[1]?.id;
    if (!prim || prim === 'mp5') { if (p.money >= 2700 + 650) b('ak47'); else if (!prim && p.money >= 1500 + 650) b('mp5'); }
    if (p.armor < 50) b(p.money >= 1000 ? 'vesthelm' : 'vest');
    for (let i = 0; i < 3; i++) b('primammo');
    if (p.weapons[1]) g.selectWeapon(p, p.weapons[1], true);
    return got;
  };
  /** Face the longest clear stretch from where you stand (so staged things have room). */
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
  const ahead = (p, d, side = 0) => { const y = p.pm.angles[1] * DEG, o = p.pm.origin; return [o[0] + Math.cos(y) * d - Math.sin(y) * side, o[1] + Math.sin(y) * d + Math.cos(y) * side, o[2]]; };
  const hush = () => { Z().clearHorde(); Z().nextSpawn = 1e9; Z().director.pending.length = 0; };
  const to = (p, pos) => { p.pm.origin = [pos[0], pos[1], pos[2]]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0]; };
  const nearestNode = (at) => g.nav.nearest(at, 300) || g.nav.nearestXY(at, 400, 200);
  const walker = (at, health) => {
    const up = new Set(Z().pool.filter((x) => x.alive));
    const n = nearestNode(at);
    Z().spawnZombie({ variant: 'walker', at: n ? [n.x, n.y, n.z + 37] : at, extra: true });
    const z = Z().pool.find((x) => x.alive && !x.special && !up.has(x));
    if (z && health) { z.health = z.maxHealth = health; z.armor = 0; }
    return z;
  };

  let step = 0, stage = 0, waveSeen = 0, wavesPlayed = 0, draftShot = false, boss = null, trophy = null;
  const picks = [];
  window.__drive = async () => {
    step++;
    try {
      // ---------------------------------------------------------- the front end
      if (step === 1) {
        g.buildLocalCmd = orig;
        await until(() => F.title.active && F.title.shot, 8000);
        await sleep(2000);
        const news = q('.fe-news h3')?.textContent || '';
        check('title: backdrop, main menu and the Milestone 3 What\'s new', F.title.active && !!q('.mm-front') && /Every run is different/.test(news) && qa('.fe-news li').length === 6, news);
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
        check('setup: Normal, 3 bots, the Roles row', q('.fe-card.on')?.dataset.id === 'normal' && q('.fe-step span').textContent === '3' && /Roles/i.test(q('.fe-setup')?.textContent || ''));
        await sleep(300);
        return { log: out(), shot: true };
      }
      if (step === 3) {
        q('.fe-setup .fe-go').click();
        await until(() => !g.menus.isOpen() && g.zombies.enabled && g.local?.alive, 8000);
        bind(); hookHud();
        await sleep(800);
        const bots = g.players.filter((x) => x.isBot && x.team === me().team);
        check('run started: Normal, 3 bots', Z().diff.id === 'normal' && bots.length === 3);
        g.buildLocalCmd = () => ({ forwardmove: fwd, sidemove: 0, upmove: 0, buttons: 0, wbuttons: buttons });
        me().god = true;
        log(`bought ${shop().join(',')}`);
        con('zm_ready');
        return { log: out() };
      }
      // ---------------------------------------------------------- natural waves, the perk draft at the break
      if (stage === 0) {
        const z = Z(), st0 = z.state;
        play(40);
        if (z.state === 'wave' && z.wave !== waveSeen) { waveSeen = z.wave; wavesPlayed++; log(`wave ${z.wave} (${z.stats.mod || 'no type'}): count ${z.stats.count}`); }
        if (z.state === 'break' && st0 === 'wave') {
          const bots = g.players.filter((x) => x.isBot && x.team === me().team);
          log(`wave ${z.wave} cleared t=${g.time.toFixed(0)} kills ${z.kills}; roles ${bots.map((b) => `${b.role}:${b.weapons[1]?.id || '-'}`).join(' ')}`);
          await sleep(1200);
          const cards = qa('.zp-card');
          if (!draftShot && cards.length) {
            draftShot = true;
            check('the perk draft: cards over the game at the break', cards.length === z.diff.perks.choices && !!z.perks.offerFor(me()), `${cards.length} cards: ${[...cards].map((c) => c.textContent.slice(0, 30)).join(' | ')}`);
            return { log: out(), shot: true };
          }
        }
        if (draftShot && z.perks.offerFor(me())) {
          const of = z.perks.offerFor(me());
          frames(40); // (past the deal's grace)
          const took = z.perks.key('slot1', true); // (held: a tap would switch weapons)
          frames(25);
          z.perks.key('slot1', false);
          const held = z.perks.list(me()).map((x) => x.id);
          check('holding key 1 picks the first card', took && held.includes(of.ids[0]), held.join(','));
          frames(20);
          log(`bought ${shop().join(',')}`);
          con('zm_ready');
          return { log: out(), shot: true };
        }
        if (wavesPlayed >= 2 && z.state === 'break' && !z.perks.offerFor(me())) { stage = 1; return { log: out() }; }
        if (g.time > 600) { stage = 1; log('time cap on the natural waves'); }
        return { log: out() };
      }
      // ---------------------------------------------------------- the forge
      if (stage === 1) {
        stage = 2;
        const p = me();
        if (Z().state !== 'break') { hush(); Z().killed = Z().spawned = Z().stats.count; for (let i = 0; i < 300 && Z().state === 'wave'; i++) g.tick(); }
        Z().nextWaveAt = g.time + 9999; // (hold the break: the forge is break-only)
        while (Z().perks.offerFor(p)) Z().perks.choose(p, 0);
        p.money = 30000;
        if (!p.weapons[1]) g.rounds.buy(p, 'ak47');
        g.selectWeapon(p, p.weapons[1], true);
        frames(60);
        const ATT = await import('/src/game/attachments.js');
        g.menus.showBuyMenu({ money: p.money, team: 'CT' }, { allWeapons: true, itemState: (id) => Z().economy.menuState(p, id), upgradeTarget: (sk) => ATT.targetName(p, sk), banner: Z().economy.menuBanner(p) });
        g.menus.buyCategory(9);
        [...qa('.vg-btn')].find((b) => /Weapon Forge/.test(b.textContent))?.click();
        const title = q('.vg-panel .vg-title')?.textContent || '';
        const t2 = [...qa('.vg-btn')].find((b) => /Tier II\b/.test(b.textContent));
        t2?.dispatchEvent(new MouseEvent('mouseenter'));
        check('the Weapon Forge page, titled with the gun', /FORGE/i.test(title), title);
        return { log: out(), shot: true };
      }
      if (stage === 2) {
        stage = 3;
        g.menus._closeVg?.(true);
        g.menus.hideAll?.();
        const p = me(), w = p.weapons[1];
        const got = ['tier_1', 'tier_2', 'tier_3', 'round_shock'].map((id) => g.rounds.buy(p, id));
        frames(80);
        check('forged: Tier III with Shock rounds (break only)', got.every(Boolean) && w.tier === 3 && w.round === 'shock', `${got} T${w.tier} ${w.round}`);
        p.pm.angles[0] = 4;
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- a power-up
      if (stage === 3) {
        stage = 4;
        log(con('sv_cheats 1'));
        log(con('zm_wave 6'));
        hush();
        const p = me();
        faceOpen(p);
        p.pm.angles[0] = 22;
        const d = Z().pickups.spawn('powerup', ahead(p, Math.min(220, faceOpen(p) - 40)), { id: 'instakill', vel: [0, 0, 0] });
        p.pm.angles[0] = 22;
        frames(60);
        check('a power-up on the floor in front of you', !!d, d ? `${d.id} at ${Math.hypot(d.pos[0] - p.pm.origin[0], d.pos[1] - p.pm.origin[1]) | 0} u` : '');
        trophy = d;
        return { log: out(), shot: true };
      }
      if (stage === 4) {
        stage = 5;
        const p = me(), d = trophy;
        if (d) to(p, [d.pos[0], d.pos[1], p.pm.origin[2]]);
        frames(40);
        check('...taken: Insta-Kill for the squad, its banner', Z().perks.has(p, 'instakill') > 0 && (ev.powerup || 0) > 0, `has ${Z().perks.has(p, 'instakill')}`);
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- an airdrop
      if (stage === 5) {
        stage = 6;
        const A = Z().pickups.air, p = me();
        hush();
        const ok = A.call(true);
        for (let i = 0; i < 2500 && A.state !== 'falling'; i++) g.tick();
        let k = 0;
        for (; k < 2500 && A.state === 'falling' && A.crate.pos[2] > A.flare.pos[2] + 260; k++) g.tick();
        const c = A.crate?.pos;
        if (c) { const fp = A.flare.pos, dx = fp[0] - c[0], dy = fp[1] - c[1]; const e = [c[0] + 450, c[1] + 120, fp[2] + 40]; const n = nearestNode(e); if (n) to(p, [n.x, n.y, n.z + 37]); aimAt(p, [c[0] + dx * 0, c[1] + dy * 0, c[2] - 60]); }
        frames(30);
        check('an airdrop: the flare, then the crate on its parachute', ok && A.state === 'falling', `${A.state}`);
        return { log: out(), shot: true };
      }
      if (stage === 6) {
        stage = 7;
        const A = Z().pickups.air, p = me();
        for (let i = 0; i < 4000 && A.state === 'falling'; i++) g.tick();
        const d = A.crate;
        if (d) { to(p, [d.pos[0] - 44, d.pos[1], d.pos[2] + 37]); aimAt(p, [d.pos[0], d.pos[1], d.pos[2] + 8]); }
        buttons = 8; hold = true;
        g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: buttons });
        for (let i = 0; i < 260 && A.state !== 'opened'; i++) { buttons = 8; g.tick(); if (i % 3 === 0) g.frame(0); }
        buttons = 0; hold = false;
        if (d) { const n = nearestNode([d.pos[0] - 170, d.pos[1] - 60, d.pos[2]]); if (n && Math.hypot(n.x - d.pos[0], n.y - d.pos[1]) > 90) to(p, [n.x, n.y, n.z + 37]); aimAt(p, [d.pos[0], d.pos[1], d.pos[2] + 4]); }
        frames(30);
        const bn = Z().pickups.ui.bn;
        check('...landed, held E: opened (its banner)', A.state === 'opened' && bn?.id === 'crate', `${A.state} ${bn?.title} / ${bn?.sub}`);
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- the squad: Hold here, the panel
      if (stage === 7) {
        stage = 8;
        con('zm_wave 7');
        hush();
        const p = me();
        // back with the squad (the crate run took you off on your own)
        const mate = g.players.find((b) => b.isBot && b.team === p.team && b.alive);
        if (mate) { const o = mate.pm.origin; to(p, [o[0], o[1], o[2]]); }
        for (let i = 0; i < 100; i++) g.tick();
        g.bots.onRadio(p, 'Hold this position.');
        for (let i = 0; i < 700; i++) { g.tick(); if (i % 4 === 0) g.frame(0.04); }
        faceOpen(p);
        p.pm.angles[0] = 15;
        frames(20);
        const holders = g.bots.bots.filter((b) => b.p.team === p.team && b.holdHere);
        check('Hold here: the bots take the arc (the squad panel says HOLD)', holders.length === 3 && !!Z().squad.hold, holders.map((b) => `${b.p.name}:${b.p.role}:${b.zmState}`).join(' '));
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- a boss
      if (stage === 8) {
        stage = 9;
        const p = me();
        const BS = await import('/src/game/bosses.js');
        hush();
        Z().perks.revoke(p, 'instakill');
        for (const b of g.bots.bots) b.holdHere = null;
        g.bosses.order = [0, 1, 2, 3, 4];
        Z().startWave(10);
        Z().nextSpawn = 1e9; // (hush() would call the boss off too: clearHorde)
        const t0 = g.time;
        for (let i = 0; i < 2000 && !g.bosses.alive(); i++) { g.tick(); if (i % 5 === 0) g.frame(0.05); }
        boss = g.bosses.boss;
        void BS;
        const bo = boss?.pm.origin;
        if (bo) { const n = nearestNode([bo[0] + 400, bo[1], bo[2]]) || nearestNode(bo); if (n) to(p, [n.x, n.y, n.z + 37]); aimAt(p, [bo[0], bo[1], bo[2] + 30]); }
        frames(25);
        check('a boss arrives (the staged arrival, its title card)', !!boss?.alive && g.time - t0 > 3 && (ev.boss || 0) > 0, `${boss?.boss?.def?.name} after ${(g.time - t0).toFixed(1)} s`);
        return { log: out(), shot: true };
      }
      if (stage === 9) {
        stage = 10;
        const p = me(), b = boss, B = b.boss;
        b.god = false;
        g.bosses.boss.boss.state = B.state;
        let n = 0;
        for (; n < 400 && !(g.time < B.brokenUntil); n++) { g.damagePlayer(b, p, 18, 2, 'm3', [1, 0, 0], b.eyePos()); if (n % 6 === 5) g.tick(); }
        frames(12, 0.02);
        aimAt(p, [b.pm.origin[0], b.pm.origin[1], b.pm.origin[2] + 20]);
        frames(8, 0.02);
        check('shotgun pellets break its posture: it kneels', g.time < B.brokenUntil && (ev.posture || 0) > 0, `${n} pellets, hp ${b.health | 0}/${b.maxHealth | 0}`);
        return { log: out(), shot: true };
      }
      if (stage === 10) {
        stage = 11;
        const p = me(), b = boss, B = b.boss;
        for (let i = 0; i < 400 && !(b.health < b.maxHealth * 0.6); i++) g.damagePlayer(b, p, 60, 2, 'ak47', [1, 0, 0], b.eyePos());
        for (let i = 0; i < 6; i++) { g.tick(); g.frame(0.02); }
        aimAt(p, [b.pm.origin[0], b.pm.origin[1], b.pm.origin[2] + 20]);
        frames(10, 0.02);
        check('a phase: its move, the banner', B.phase >= 1 && (ev.bossphase || 0) > 0, `phase ${B.phase} banner ${g.bosses.stage?.banner?.label}`);
        return { log: out(), shot: true };
      }
      if (stage === 11) {
        stage = 12;
        const p = me(), b = boss;
        const hp0 = p.health;
        for (let i = 0; i < 400 && b.alive; i++) g.damagePlayer(b, p, 200, 2, 'ak47', [1, 0, 0], b.eyePos());
        frames(60, 0.02);
        trophy = g.dropped.find((d) => d.kind === 'trophy' && !d.taken);
        if (trophy) aimAt(p, [trophy.pos[0], trophy.pos[1], trophy.pos[2] + 10]);
        frames(10, 0.02);
        check('the boss falls: a trophy out of the body', !b.alive && !!trophy && (ev.trophy || 0) > 0, `hp ${hp0} -> ${p.health}`);
        return { log: out(), shot: true };
      }
      if (stage === 12) {
        stage = 13;
        const p = me(), d = trophy;
        if (d) to(p, [d.pos[0], d.pos[1], p.pm.origin[2]]);
        ticks(80);
        const waiting = !!Z().perks.waiting(p) || !!Z().perks.offerFor(p);
        hush();
        Z().killed = Z().stats.count; Z().spawned = Z().stats.count;
        for (let i = 0; i < 600 && Z().state === 'wave'; i++) g.tick();
        await sleep(1200);
        frames(10);
        await sleep(400);
        const of = Z().perks.offerFor(p);
        check('trophy taken: a relic pick (the boss\'s own first), shown at the break', waiting && of && (of.source === 'trophy' || Z().perks.offers.get(p)?.some((x) => x.source === 'trophy')) && qa('.zp-card').length > 0, `${of?.source} ${of?.ids?.join(',')} cards ${qa('.zp-card').length}`);
        return { log: out(), shot: true };
      }
      if (stage === 13) {
        stage = 14;
        const p = me();
        // the cards ahead of the trophy's (a supply draft, the break's draft) first: then the relics
        for (let k = 0; k < 4 && Z().perks.offerFor(p) && Z().perks.offerFor(p).source !== 'trophy'; k++) { const of = Z().perks.offerFor(p); picks.push(`${of.source}:${Z().perks.choose(p, 0)}`); }
        frames(20);
        await sleep(900);
        const of = Z().perks.offerFor(p);
        check('the trophy\'s relic cards (the boss\'s own relic among them)', of?.source === 'trophy' && qa('.zp-card').length === of.ids.length, `${of?.ids?.join(',')}`);
        return { log: out(), shot: true };
      }
      if (stage === 14) {
        stage = 15;
        const p = me();
        for (let k = 0; k < 4 && Z().perks.offerFor(p); k++) { const of = Z().perks.offerFor(p); picks.push(`${of.source}:${Z().perks.choose(p, 0)}`); await sleep(300); }
        check('relic and draft picked', picks.some((x) => x.startsWith('trophy:')), picks.join(' '));
        // the katana
        p.money = 20000;
        const ok = g.rounds.buy(p, 'katana');
        const k = p.weapons[3];
        g.selectWeapon(p, k, true);
        frames(60);
        faceOpen(p);
        p.pm.angles[0] = 0;
        const z = walker(ahead(p, 60), 160);
        if (z) { Z().think0 = Z().think0 || Z().think; }
        let kill = false;
        const kills0 = Z().kills;
        for (let i = 0; i < 300 && !kill; i++) {
          if (z?.alive) aimAt(p, [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 18]);
          buttons = i % 10 < 5 ? 1 : 0;
          g.tick(); if (i % 2 === 0) g.frame(0.02);
          kill = !z?.alive;
        }
        buttons = 0;
        frames(10, 0.02);
        check('a katana kill', ok && k?.id === 'katana' && kill && Z().kills > kills0, `${ok} ${k?.id} ${z?.health}`);
        return { log: out(), shot: true };
      }
      if (stage === 15) {
        stage = 16;
        g.buildLocalCmd = orig;
        g.menus.hideAll?.();
        const p = me();
        log(`perks held: ${Z().perks.list(p).map((x) => x.id).join(', ')}; events ${JSON.stringify(ev)}`);
        check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
        log(fails ? `FAILED: ${fails}` : 'ALL PASSED');
        return { log: out(), done: true };
      }
      return { log: out(), done: true };
    } catch (err) {
      check('no exception', false, `${err.message} ${err.stack?.split('\n').slice(0, 3).join(' / ')}`);
      return { log: out(), done: true };
    }
  };
})();
