// Zombie survival, Milestone 1 review fixes: cheats set no record (and the run-over says so),
// no downed overlay under GAME OVER, health reads 0 while down, a Second Wind cut off by the
// break isn't spent, bleeding out costs no kill, off-screen downed markers stay clear of the
// HUD rows, a ready-up clears the break's prints and tips, hardcore has no re-arm window, the
// title's record is the Quick start setup's, Esc on the run-over goes to the title (no Resume),
// no What's new pill in game. Drives the real menus; records / tips storage is put back after.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=0" tools/tests/zm1-fixes.js /tmp/zfix
/* global localStorage, KeyboardEvent */
(() => {
  const g = window.__game;
  const out = [];
  const log = (s) => out.push('[sim] ' + s);
  const check = (n, ok, info = '') => out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${n}${info ? ' - ' + info : ''}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const KEY = 'cs16-zombies-best';
  function newRun(opts) {
    g.newGame({ mode: 'zombies', allies: 0, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 0);
    ticks(50);
  }
  let step = 0, HS = null;
  const saved = localStorage.getItem(KEY), savedTips = localStorage.getItem('cs16-zm-tips'), savedNg = g.settings.get('newgame');
  window.__drive = async () => {
    out.length = 0;
    if (step === 0 && !g.local?.alive) return { wait: 500 };
    if (!HS) HS = await import('/src/game/hudstate.js');
    const me = () => g.local;
    if (step === 0) {
      // ---- 1. cheats taint the run
      localStorage.removeItem(KEY);
      newRun({ allies: 0 });
      check('fresh run clean', Z().cheated === false);
      con('sv_cheats 1');
      con('zm_wave 25');
      con('zm_skip');
      check('zm_wave/zm_skip: no record', Z().best === 0 && localStorage.getItem(KEY) == null, `best ${Z().best} store ${localStorage.getItem(KEY)}`);
      newRun({ allies: 0 });
      con('god');
      check('god taints', Z().cheated === true);
      con('god');
      newRun({ allies: 0 });
      con('impulse 101');
      check('impulse 101 taints', Z().cheated === true);
      newRun({ allies: 0 });
      con('zm_status');
      check('zm_status does not taint', Z().cheated === false);
      // a cheated wipe: no new best, and the run-over says so (main.js loop opens it 4 s on)
      newRun({ allies: 0 });
      con('zm_wave 25');
      me().god = false;
      g.damagePlayer(me(), null, 500, 2, 'world', null, null, {});
      check('wipe -> over', Z().state === 'over', Z().state);
      check('cheated: not a new best', Z().isNewBest() === false && localStorage.getItem(KEY) == null, `survived ${Z().survived}`);
      // ---- 2. downed HUD under GAME OVER, 9. health while down
      const s = HS.buildHudState(g, {});
      check('over: no downed overlay', s.downed == null && s.reviving == null && s.revivePrompt == null, JSON.stringify(s.downed));
      check('downed: health reads 0', s.health === 0, `${s.health}`);
      ticks(410);
      step = 1;
      return { log: out.join('\n'), wait: 1500 };
    }
    if (step === 1) {
      const ov = document.querySelector('.fe-over');
      check('run-over shown with the cheat badge', !!ov && /Cheats used/.test(ov.textContent) && !/New best/.test(ov.textContent), ov ? ov.querySelector('.fe-badges')?.textContent : 'none');
      step = 2;
      return { log: out.join('\n'), shot: true };
    }
    if (step === 2) {
      // ---- 7. leaving the run-over: Esc -> title main menu (no Resume)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      const mm = document.querySelector('.mm-front');
      const entries = [...document.querySelectorAll('.mm-front .fe-entry .t')].map((e) => e.textContent);
      check('Esc on run-over: title menu', !!mm && !mm.classList.contains('ingame') && !entries.includes('Resume') && !document.querySelector('.fe-over'), entries.join(','));
      check('Esc on run-over: game left', g.started === false, `started ${g.started}`);
      step = 3;
      return { log: out.join('\n'), wait: 1200 };
    }
    if (step === 3) {
      log(`title active ${window.__front.title.active}`);
      // back in via New Game for the rest (newGame helper works without the menu)
      g.menus.hideAll();
      // ---- 9 (live): health 0 while down in a wave, overlay up
      newRun({ allies: 1 });
      g.bots.bots.forEach((b) => { b.p.god = true; });
      Z().startWave(1); Z().nextSpawn = 1e9;
      ticks(10);
      me().god = false;
      g.damagePlayer(me(), null, 500, 2, 'world', null, null, {});
      const s = HS.buildHudState(g, {});
      check('wave: downed overlay + health 0', !!s.downed && s.health === 0 && me().health > 90, `s.health ${s.health} p.health ${me().health}`);
      // ---- 4. Second Wind cut off by the break
      me().secondWind = true;
      const prints = [], snds = [];
      const cp = g.hud.centerPrint.bind(g.hud); g.hud.centerPrint = (t, ...a) => { prints.push(String(t).split('\n')[0]); return cp(t, ...a); };
      const sp = g.sound.play.bind(g.sound); g.sound.play = (n, o) => { snds.push(n); return sp(n, o); };
      const bl = g.buildLocalCmd;
      g.buildLocalCmd = function () { const c = bl.call(this); c.wbuttons |= 8; c.forwardmove = c.sidemove = 0; return c; };
      ticks(100);
      const prog = me().downed?.prog || 0, self = !!me().downed?.self;
      Z().clearHorde(); Z().spawned = Z().killed = Z().stats.count; Z().waveCleared();
      ticks(2);
      g.buildLocalCmd = bl;
      g.hud.centerPrint = cp; g.sound.play = sp;
      check('Second Wind cut by the break: no SECOND WIND', !me().downed && me().secondWind === true && !prints.includes('SECOND WIND!') && !snds.includes('second_wind'), `prog ${prog.toFixed(2)} self ${self} prints ${JSON.stringify(prints)} snd ${snds.filter((n) => /wind|revive/.test(n))}`);
      // ---- 3. bleed-out costs no kill
      newRun({ allies: 1 });
      const bot = g.bots.bots[0].p; bot.god = true;
      Z().startWave(1); Z().nextSpawn = 1e9;
      ticks(10);
      me().kills = 3;
      Z().spawnZombie({ at: [me().pm.origin[0] + 300, me().pm.origin[1], me().pm.origin[2]] });
      const z = Z().pool.find((q) => q.alive);
      me().god = false;
      g.damagePlayer(me(), z, 500, 2, 'zombie', null, null, {});
      g.killPlayer(z, bot, 'ak47', false); // a bot kills the zombie that downed you
      me().health = 0.5; // (bleeding out)
      ticks(20);
      check('bled out: kills kept', !me().alive && me().kills === 3, `alive ${me().alive} kills ${me().kills} deaths ${me().deaths}`);
      // ---- 6. the downed teammate marker off screen: inside the safe rectangle
      step = 4;
      return { log: out.join('\n') };
    }
    if (step === 4) {
      newRun({ allies: 2 });
      const [a, b] = g.bots.bots.map((x) => x.p);
      b.god = true;
      Z().startWave(1); Z().nextSpawn = 1e9;
      ticks(10);
      // a behind me, to the left
      const o = me().pm.origin, yaw = me().pm.angles[1] * Math.PI / 180;
      a.pm.origin = [o[0] - Math.cos(yaw) * 150 + Math.cos(yaw + 1.57) * 60, o[1] - Math.sin(yaw) * 150 + Math.sin(yaw + 1.57) * 60, o[2]];
      a.god = false;
      g.damagePlayer(a, null, 500, 2, 'world', null, null, {});
      for (let i = 0; i < 20; i++) g.frame(1 / 60);
      const hud = g.hud, D = Z().downed, P = [0, 0, 0];
      D.toScreen(hud, [a.pm.origin[0], a.pm.origin[1], a.pm.origin[2] + 30], P);
      const bottom = hud.vh - 80 * hud.k - 8 * hud.lineH;
      check('behind marker pinned clear of the HUD rows', P[2] === 0 && P[1] <= bottom + 1 && P[0] >= 36 * hud.k - 0.5, `x ${P[0].toFixed(0)} y ${P[1].toFixed(0)} vh ${hud.vh} k ${hud.k}`);
      step = 5;
      return { log: out.join('\n'), shot: true };
    }
    if (step === 5) {
      // ---- 10. ready-up drops the break's prints and tips
      const tips = window.__front.tips;
      tips.setEnabled(false); tips.setEnabled(true);
      newRun({ allies: 0 });
      for (let i = 0; i < 30; i++) { g.tick(); tips.frame(0.1); } // 3 s: the buy tip is up
      const had = tips.cur?.id;
      Z().economy.setReady(g.local, true);
      for (let i = 0; i < 400 && Z().state !== 'wave'; i++) { g.tick(); if (i % 10 === 0) tips.frame(0.1); }
      ticks(5); tips.frame(0.1);
      const al = g.hud.centerQ?.alert?.map((e) => e.text.split('\n')[0]) || [];
      // (and the director's callout of where they come from: director.js)
      check('wave 1 after ready-up: only WAVE 1 in the alerts', al[0] === 'WAVE 1' && al.slice(1).every((x) => /^They're coming/.test(x)) && al.length <= 2, JSON.stringify(al));
      check('break tips gone in the wave', had === 'buy' && tips.cur?.id !== 'buy' && !tips.queue.some((q) => q.id === 'buy' || q.id === 'ready'), `had ${had} cur ${tips.cur?.id} q ${tips.queue.map((q) => q.id)}`);
      step = 6;
      return { log: out.join('\n'), shot: true };
    }
    if (step === 6) {
      // ---- 5. hardcore: no re-arm window
      for (const hc of [true, false]) {
        newRun({ allies: 1, hardcore: hc });
        g.bots.bots[0].p.god = true;
        g.killPlayer(me(), null, 'world', false); // dies in the break: back for wave 1
        con('sv_cheats 1'); con('zm_skip');
        ticks(100);
        const E = Z().economy, p = me();
        p.money = 10000;
        const r = E.rearm(p), open = E.open(p), ak = g.rounds.buy(p, 'ak47'), perk = g.rounds.buy(p, 'perk_secondwind'), ammo = g.rounds.buy(p, 'secammo');
        if (hc) check('hardcore: no re-arm, guns refused mid-wave, ammo sold', p.alive && r === 0 && !open && !ak && !perk && ammo && E.menuBanner(p).startsWith('MID-WAVE'), `alive ${p.alive} rearm ${r} open ${open} ak ${ak} perk ${perk} ammo ${ammo} banner ${E.menuBanner(p)}`);
        else check('normal: re-arm window kept', p.alive && r > 0 && open && ak, `rearm ${r} open ${open} ak ${ak}`);
      }
      // ---- 8. the main menu record for the quick-start setup
      localStorage.setItem(KEY, JSON.stringify({ 'de_dust2|normal|4-6': 7, 'de_dust2|normal|2-3': 5 }));
      g.settings.set('newgame', { ...(g.settings.get('newgame') || {}), allies: 3, zdiff: 'normal', hardcore: false });
      const info = g.menus.front.info();
      check('menu record = quick setup (3 bots -> 4-6)', info.best === 7 && /3 bots/.test(info.bestDiff), JSON.stringify(info));
      g.settings.set('newgame', { ...g.settings.get('newgame'), allies: 1 });
      const i2 = g.menus.front.info();
      check('1 bot -> 2-3 bucket', i2.best === 5, JSON.stringify(i2));
      g.settings.set('newgame', { ...g.settings.get('newgame'), allies: 3 });
      // in-game menu: no What's new pill
      g.menus.showMain({ inGame: true });
      check('in-game menu: no What\'s new pill', !document.querySelector('.mm-front .fe-news-pill'));
      g.menus.hideAll();
      g.started = false;
      step = 7;
      return { log: out.join('\n'), wait: 500 };
    }
    if (step === 7) {
      g.menus.showMain({ inGame: false });
      const rec = document.querySelector('.mm-front .fe-record');
      check('title: record panel for the quick setup', !!rec && /7/.test(rec.textContent) && /3 bots/.test(rec.textContent), rec?.textContent);
      check('title: What\'s new present', !!document.querySelector('.mm-front .fe-news-pill'));
      if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      if (savedTips == null) localStorage.removeItem('cs16-zm-tips'); else localStorage.setItem('cs16-zm-tips', savedTips);
      g.settings.set('newgame', savedNg);
      const n = out.filter((l) => / FAIL /.test(l)).length;
      out.push(n ? `[sim] FAILED: ${n}` : '[sim] ALL PASSED');
      return { log: out.join('\n'), shot: true, done: true };
    }
    return { done: true };
  };
})();
