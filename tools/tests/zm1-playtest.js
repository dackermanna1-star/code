// End-to-end play test of the integrated zombie mode: title -> setup (Normal, 3 bots) -> waves
// with an auto-aim player firing real bullets, buying in the breaks, ready-up, a down + bot revive.
// usage (dev server running; no autostart: it boots to the title screen):
//   node tools/drive.mjs "http://localhost:5173/" tools/tests/zm1-playtest.js /tmp/zplay
/* global performance, setTimeout */
(() => {
  const g = window.__game, F = window.__front;
  const DEG = Math.PI / 180;
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 5000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const press = (code) => { document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code, key: code, bubbles: true })); document.body.dispatchEvent(new window.KeyboardEvent('keyup', { code, key: code, bubbles: true })); };
  const lines = [];
  let fails = 0;
  const log = (t) => lines.push('[sim] ' + t);
  const check = (name, ok, info = '') => { lines.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' (' + info + ')' : ''}`); if (!ok) fails++; };
  const out = () => { const l = lines.join('\n'); lines.length = 0; return l; };
  const Z = () => g.zombies;
  const ev = {}; // event counts
  const evs = [];
  let bound = false;
  const bind = () => {
    if (bound) return; bound = true;
    Z().events.on('*', (e, type) => {
      ev[type] = (ev[type] || 0) + 1;
      if (type === 'down' || type === 'revive' || type === 'bleedout' || type === 'respawn' || type === 'wipe' || type === 'ready' || type === 'streak' || type === 'run' || type === 'wave' || type === 'special' || type === 'boss')
        evs.push(`${type}:${e.player?.name ?? ''}${e.by ? ' by ' + e.by.name : ''}${e.phase ? ' ' + e.phase : ''}${e.label ? ' ' + e.label : ''}${type === 'wave' ? ' w' + e.wave : ''}${e.kind ? ' ' + e.kind : ''}`);
    });
  };
  // centre prints, captured
  const prints = [];
  let hooked = false;
  const hookHud = () => {
    if (hooked) return; hooked = true;
    const cp = g.hud.centerPrint.bind(g.hud);
    g.hud.centerPrint = (t, s, ch) => { prints.push(String(t).replace(/\n/g, ' / ')); return cp(t, s, ch); };
  };

  // ------------------------------------------------------------ the auto-aim player
  let buttons = 0, flip = 0, aimHead = false;
  const aimAt = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  const targetOf = (p) => {
    const e = p.eyePos();
    let best = null, bd = 1e9;
    const cands = Z().pool.filter((z) => z.alive);
    if (g.bosses?.boss?.alive) cands.push(g.bosses.boss);
    for (const z of cands) {
      const c = aimHead && !z.boss ? z.eyePos() : [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + (z.boss ? 20 : 8)];
      const d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
      if (d < bd && d < 1600 && g.visible(e, c)) { bd = d; best = c; }
    }
    return best;
  };
  const orig = g.buildLocalCmd.bind(g);
  g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: buttons });
  let shots = 0;
  const play = (frames, dt = 0.03) => {
    const p = g.local;
    for (let i = 0; i < frames; i++) {
      buttons = 0;
      if (p.alive) {
        const c = targetOf(p);
        const w = p.active;
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
  // buy for the local player in a break: the best gun affordable, armour, ammo
  const shop = () => {
    const p = g.local, R = g.rounds;
    const got = [];
    const b = (id) => { if (R.buy(p, id)) { got.push(id); return true; } return false; };
    const prim = p.weapons[1]?.id;
    if (!prim || prim === 'mp5') {
      if (p.money >= 3100 + 650) b('m4a1');
      else if (!prim && p.money >= 1500 + 650) b('mp5');
    }
    if (p.armor < 50) b(p.money >= 1000 ? 'vesthelm' : 'vest');
    for (let i = 0; i < 3; i++) b('primammo');
    b('secammo');
    if (p.weapons[1]) g.selectWeapon(p, p.weapons[1], true);
    return got;
  };

  let step = 0, waveSeen = 0, downedDone = false, downT = 0, revivedBy = null, wavesPlayed = 0;
  window.__drive = async () => {
    step++;
    try {
      // ---------------------------------------------------------- 1: the title screen
      if (step === 1) {
        g.buildLocalCmd = orig;
        await until(() => F.title.active && F.title.shot, 8000);
        await sleep(2500);
        check('title: backdrop running', F.title.active && !!F.title.shot);
        check('title: main menu up', !!q('.mm-front') && !q('.mm-front.ingame'));
        check('title: zombie survival entry', !!q('.fe-entry[data-cmd="zsetup"]'));
        check('title: theme sound exists', !!g.sound.bank.get('title_theme'));
        return { log: out(), shot: true };
      }
      if (step === 2) {
        q('.fe-news .x')?.click();
        q('.fe-entry[data-cmd="zsetup"]').click();
        await until(() => q('.fe-setup'));
        q('.fe-card[data-id="normal"]').click();
        const steppers = qa('.fe-setup .fe-step button');
        const minus = steppers[0], plus = steppers[1];
        for (let i = 0; i < 12; i++) minus.click();
        for (let i = 0; i < 3; i++) plus.click();
        check('setup: Normal picked, 3 bots', q('.fe-card.on')?.dataset.id === 'normal' && q('.fe-step span').textContent === '3', q('.fe-step span')?.textContent);
        log('setup summary: ' + q('.fe-summary')?.textContent);
        await sleep(400);
        return { log: out(), shot: true };
      }
      if (step === 3) {
        q('.fe-setup .fe-go').click();
        await until(() => !g.menus.isOpen() && g.zombies.enabled && g.local?.alive, 8000);
        bind(); hookHud();
        await sleep(1200);
        const p = g.local;
        check('run: started on Normal with 3 bots', Z().diff.id === 'normal' && g.players.filter((x) => x.isBot && x.team === p.team).length === 3, `${Z().diff.id} bots=${g.players.filter((x) => x.isBot).length}`);
        check('run: $2000 and a pistol', p.money === 2000 && !!p.weapons[2] && !p.weapons[1], `$${p.money} ${p.weapons[2]?.id} ${p.weapons[1]?.id}`);
        check('run: title backdrop gone', !F.title.active);
        log('prints: ' + prints.join(' || '));
        log('tip card: ' + (q('.zt-card, .ztip, [class*="tip"]')?.textContent || '-'));
        g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: buttons });
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- 4: the first break: buy menu, shop, ready-up
      if (step === 4) {
        const p = g.local;
        check('break: shop open', Z().state === 'break' && Z().economy.open(p));
        press('KeyB');
        await sleep(300);
        const open = g.menus.isOpen();
        log('buy menu open: ' + open);
        return { log: out(), shot: true };
      }
      if (step === 5) {
        g.menus.hideAll();
        await sleep(200);
        const p = g.local;
        const got = shop();
        log(`bought ${got.join(',')} -> $${p.money}`);
        const left0 = Z().nextWaveAt - g.time;
        press('F1');
        const r = '';
        await sleep(100);
        const left1 = Z().nextWaveAt - g.time;
        check('ready-up: everyone ready cuts the break to ~3 s', left1 <= 3.2 && left0 > 4, `before ${left0.toFixed(1)} after ${left1.toFixed(1)} ${r}`);
        p.god = true;
        return { log: out(), shot: true };
      }
      // ---------------------------------------------------------- waves
      if (step >= 6) {
        const p = g.local, z = Z();
        const w0 = z.wave, st0 = z.state;
        aimHead = Math.random() < 0.4;
        play(120);
        if (z.state === 'over') {
          log(`RUN OVER at wave ${z.wave} survived ${z.survived}`);
          await sleep(1500);
          check('run over screen shows', !!q('.fe-over'));
          log('events: ' + JSON.stringify(ev));
          log('evs: ' + evs.slice(-30).join(' | '));
          log(`playtest: ${fails} failure${fails === 1 ? '' : 's'}`);
          return { log: out(), shot: true, done: true };
        }
        let shot = false;
        if (z.state === 'wave' && z.wave !== waveSeen) {
          waveSeen = z.wave; wavesPlayed++;
          log(`wave ${z.wave} started: count ${z.stats.count} hp ${z.stats.health} alive-cap ${z.stats.maxAlive} | me $${p.money} ${p.weapons[1]?.id || '-'} ar ${p.armor} | bots ${g.players.filter((b) => b.isBot && b.team === p.team).map((b) => `${b.name}:${b.alive ? (b.downed ? 'DOWN' : 'up') : 'dead'}:${b.weapons[1]?.id || b.weapons[2]?.id}:$${b.money}`).join(' ')}`);
          // mid-wave shop: guns refused, ammo at a premium
          const m0 = p.money, pr0 = prints.length;
          const okGun = g.rounds.buy(p, 'ak47');
          check(`wave ${z.wave}: no guns mid-wave`, !okGun && p.money === m0, prints.slice(pr0).join(' / '));
        }
        // the down + revive moment: wave 3, once some zombies are up
        if (!downedDone && z.state === 'wave' && z.wave >= 3 && !downT) {
          const zz = z.pool.find((x) => x.alive);
          if (zz) {
            p.god = false;
            g.damagePlayer(p, zz, 400, 2, 'zombie', [1, 0, 0], null);
            check('downed: you went down, not dead', p.alive && !!p.downed, `alive=${p.alive} downed=${!!p.downed} hp=${p.health}`);
            downT = g.time;
            shot = true;
          }
        }
        if (downT && !downedDone) {
          if (p.downed?.by && !revivedBy) { revivedBy = p.downed.by.name; log(`reviving: ${revivedBy} prog ${p.downed.prog?.toFixed?.(2)}`); shot = true; }
          if (!p.downed && p.alive) {
            downedDone = true; p.god = true;
            check('downed: a bot got you up', evs.some((e) => e.startsWith('revive:') && / by /.test(e)), `${revivedBy} after ${(g.time - downT).toFixed(1)} s hp=${p.health} ${evs.filter((e) => /revive|down/.test(e)).join(',')}`);
          } else if (!p.alive) {
            downedDone = true;
            check('downed: a bot got you up', false, `bled out after ${(g.time - downT).toFixed(1)} s`);
          } else if (g.time - downT > 1.5 && g.time - downT < 1.62) shot = true;
        }
        if (z.state === 'break' && st0 === 'wave') {
          log(`wave ${w0} cleared at t=${g.time.toFixed(0)}: me $${p.money} hp ${p.health | 0} kills ${z.kills} shots ${shots} | prints: ${prints.slice(-3).join(' || ')}`);
          const got = shop();
          log(`  bought ${got.join(',') || 'nothing'} -> $${p.money}; ready: ${con('zm_ready')}`);
          shot = w0 === 1 || w0 === 4;
        }
        if (wavesPlayed >= 6 && z.state === 'break') {
          // scoreboard and wrap up: let the squad die to see the run-over screen
          log('events: ' + JSON.stringify(ev));
          log('evs: ' + evs.slice(-40).join(' | '));
          log('prints (last 12): ' + prints.slice(-12).join(' || '));
          log(`playtest: ${fails} failure${fails === 1 ? '' : 's'}`);
          return { log: out(), shot: true, done: true };
        }
        if (g.time > 900) { log('time cap'); return { log: out(), done: true }; }
        return { log: out(), shot };
      }
    } catch (e) {
      lines.push('[sim] ERROR ' + e.stack);
      return { log: out(), done: true };
    }
    return { log: out(), done: true };
  };
})();
