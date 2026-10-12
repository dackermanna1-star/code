// Milestone 1 front end: title / main menu, the live title backdrop, the zombie setup screen
// (its options reach the run), first-run tips, the zombie scoreboard, the run-over screen,
// the loading screen and the classic New Game path. Drives the real DOM (clicks, keys).
// usage: node tools/drive.mjs "http://localhost:<PORT>/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-frontend.js /tmp/fe
(() => {
  const g = window.__game, F = window.__front;
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const lines = [];
  let fails = 0;
  const check = (name, ok, info = '') => { lines.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' (' + info + ')' : ''}`); if (!ok) fails++; };
  const key = (code, type = 'keydown') => document.body.dispatchEvent(new window.KeyboardEvent(type, { code, key: code, bubbles: true }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 4000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
  const entry = (cmd) => q(`.fe-entry[data-cmd="${cmd}"]`);
  const visible = (e) => !!e && !e.hidden && window.getComputedStyle(e).visibility !== 'hidden' && window.getComputedStyle(e).display !== 'none' && e.isConnected;
  const out = () => { const log = lines.join('\n'); lines.length = 0; return log; };
  let step = 0;

  window.__drive = async () => {
    step++;
    // ---------------------------------------------------------------- 1: boot pieces, in-game menu
    if (step === 1) {
      try { localStorage.removeItem('cs16-zm-tips'); localStorage.removeItem('cs16-whatsnew-seen'); } catch { /* ignore */ }
      F.tips.s = { runs: 0, seen: {}, off: false };
      check('front end modules are up', !!(F && F.title && F.tips && F.tally));
      check('title sounds are synthesized', !!g.sound.bank.get('title_theme') && !!g.sound.bank.get('title_start'));
      g.menus.showLoading('Testing', 0.5);
      check('loading screen shows the title and progress', !!q('.fe-loading .fe-title svg') && q('.fe-loadbar i').style.width === '50%');
      g.menus.hideLoading();
      check('loading screen goes away', !q('.fe-loading'));
      key('Escape');
      await until(() => q('.mm-front'));
      check('Esc in game opens the main menu over the game', !!q('.mm-front.ingame'));
      check('in-game menu: resume, zombie survival, classic, options, leave', ['resume', 'zsetup', 'newgame classic', 'options', 'quit'].every((c) => !!entry(c)));
      check('title lettering is drawn', !!q('.mm-front .fe-title svg path'));
      check('the title backdrop is off in game', !F.title.active);
      return { log: out(), wait: 200 };
    }
    // ---------------------------------------------------------------- 2: leave game -> title screen
    if (step === 2) {
      entry('quit').click();
      await until(() => F.title.active && F.title.shot, 4000);
      await sleep(1500);
      const T = F.title, s = T.shot;
      check('leaving the game starts the title backdrop', T.active && visible(T.root));
      check('title menu is the out-of-game one', !!q('.mm-front') && !q('.mm-front.ingame') && !!q('.fe-quick') && !entry('resume'));
      check("what's new panel shows on a first boot", visible(q('.fe-news')));
      check('the backdrop picked a nav-graph shot', !!s && !s.still, s?.still ? 'still view' : '');
      const zs = s?.zombies || [];
      check('a few zombies shamble in the shot', zs.length >= 2 && zs.every((z) => z.m.object3D.visible), `n=${zs.length}`);
      const onNav = zs.every((z) => { const n = g.nav.nearest([z.pos[0], z.pos[1], z.pos[2]], 60); return !!n; });
      check('backdrop zombies walk on the nav graph', onNav);
      const moved = zs.length && zs[0].s > 0;
      check('backdrop zombies move toward the camera', !!moved && zs.some((z) => Math.hypot(z.pos[0] - z.eye[0], z.pos[1] - z.eye[1]) < 1200));
      const e = T._eye;
      check('the camera is not inside a wall', !!e && !g.collision.testBox(e, [-4, -4, -4], [4, 4, 4], 1));
      check('game players are hidden on the title', g.players.every((p) => !p.model || !p.model.object3D.visible));
      // keyboard focus
      key('ArrowDown');
      check('arrow keys move through the menu', qa('.fe-entry.focus, .fe-quick.focus').length === 1);
      // what's new: dismissed for this update
      q('.fe-news .x').click();
      check("what's new hides and remembers", !visible(q('.fe-news')) && localStorage.getItem('cs16-whatsnew-seen') !== null && visible(q('.fe-news-pill')));
      q('.fe-news-pill').click();
      return { log: out(), shot: true };
    }
    // ---------------------------------------------------------------- 3: classic dialog, then the zombie setup
    if (step === 3) {
      entry('newgame classic').click();
      await until(() => q('.st-newgame'));
      const sel = q('.st-newgame select');
      check('Classic opens Create Server in classic mode', !!q('.st-newgame') && [...qa('.st-newgame select')].some((s) => s.value === 'classic'), sel?.value);
      check('the main menu steps aside for a dialog', window.getComputedStyle(q('.mm-front')).visibility === 'hidden');
      key('Escape');
      await sleep(100);
      check('Esc closes the dialog back to the menu', !q('.st-newgame') && window.getComputedStyle(q('.mm-front')).visibility !== 'hidden');
      entry('zsetup').click();
      await until(() => q('.fe-setup'));
      const cards = qa('.fe-setup .fe-card');
      check('setup: five difficulty cards in order', cards.map((c) => c.dataset.id).join() === 'casual,normal,hard,nightmare,sandbox');
      const labels = cards.map((c) => c.querySelector('.name').textContent).join();
      check('setup: card labels come from zdiff', labels === 'Casual,Normal,Hard,Nightmare,Sandbox', labels);
      check('setup: cards show start money', cards.every((c) => /\$[\d,]+/.test(c.querySelector('.stats').textContent)));
      check('setup: Normal is the default', q('.fe-card.on')?.dataset.id === 'normal');
      // choose: hard, 2 bots, 20 s breaks, hardcore, no squad scaling, GSG-9
      q('.fe-card[data-id="hard"]').click();
      const [minus, plus] = qa('.fe-step button');
      for (let i = 0; i < 12; i++) minus.click();
      check('setup: squad clamps at 0', q('.fe-step span').textContent === '0');
      for (let i = 0; i < 14; i++) plus.click();
      check('setup: squad clamps at 10', q('.fe-step span').textContent === '10');
      for (let i = 0; i < 8; i++) minus.click();
      check('setup: squad row shows you + bots', qa('.fe-squad svg').length === 11 && q('.fe-step span').textContent === '2');
      const r = q('.fe-setup .fe-range');
      r.value = String([0, 5, 8, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120].indexOf(20));
      r.dispatchEvent(new window.Event('input'));
      q('.fe-toggle[data-key="hardcore"]').click();
      q('.fe-toggle[data-key="squadScaling"]').click();
      qa('.fe-seg span').find((s) => s.dataset.k === 'gsg9').click();
      check('setup: summary follows the choices', /Hard/.test(q('.fe-summary').textContent) && /Hardcore/.test(q('.fe-summary').textContent) && /20 s/.test(q('.fe-summary').textContent));
      key('ArrowRight');
      check('setup: arrow keys change the difficulty', q('.fe-card.on')?.dataset.id === 'nightmare');
      key('ArrowLeft');
      await sleep(700); // (the screen fades in)
      return { log: out(), shot: true };
    }
    // ---------------------------------------------------------------- 4: start the run
    if (step === 4) {
      q('.fe-setup .fe-go').click();
      await until(() => !g.menus.isOpen() && g.local?.alive, 6000);
      const Z = g.zombies, D = Z.diff;
      check('start: menus close and you are in, no class menu', !g.menus.isOpen() && g.local.alive && g.local.team === 'CT');
      check('start: zombie mode on the chosen difficulty', Z.enabled && D.id === 'hard', D.id);
      check('start: hardcore / break / squad scaling reach the run', D.hardcore === true && D.breakLen === 20 && D.squadScaling === false, `${D.hardcore} ${D.breakLen} ${D.squadScaling}`);
      const bots = g.players.filter((p) => p.isBot && p.team === 'CT').length;
      check('start: squad size reaches the run', bots === 2, `bots=${bots}`);
      check('start: your look is the one picked', g.local.skin === 'gsg9', g.local.skin);
      check('start: the title backdrop is gone', !F.title.active && F.title.root.hidden && F.title.models.every((m) => !m || !m.m.object3D.visible));
      const ng = JSON.parse(localStorage.getItem('cs16-dust2-config') || '{}').newgame || {};
      check('start: the setup is remembered for next time', ng.zdiff === 'hard' && ng.allies === 2 && ng.hardcore === true, JSON.stringify({ z: ng.zdiff, a: ng.allies }));
      return { log: out() };
    }
    // ---------------------------------------------------------------- 5: first-run tips
    if (step === 5) {
      const T = F.tips;
      check('tips: run on a first run', T.live && T.s.runs === 1, `live=${T.live} runs=${T.s.runs}`);
      for (let i = 0; i < 4; i++) T.frame(1);
      check('tips: the buy tip comes up in the first break', T.cur?.id === 'buy' && visible(T.el) && /<kbd>B<\/kbd>/.test(T.body.innerHTML));
      await sleep(700);
      return { log: out(), shot: true };
    }
    if (step === 6) {
      const T = F.tips, Z = g.zombies;
      key('KeyH');
      key('KeyH', 'keyup');
      const saved = JSON.parse(localStorage.getItem('cs16-zm-tips') || '{}');
      check('tips: H dismisses and remembers', !T.cur && !!saved.seen?.buy);
      const bot = g.players.find((p) => p.isBot && p.team === 'CT');
      Z.events.mode('down', { player: bot, attacker: null, bleedOut: 30, downs: 1 });
      T.frame(0.05);
      check('tips: a teammate going down brings up the revive tip', T.cur?.id === 'revive' && T.body.textContent.includes(bot.name) && /E/.test(T.body.textContent));
      Z.events.mode('revive', { player: bot, by: g.local });
      check('scoreboard tally counts downs and revives', F.tally.downs(bot) === 1 && F.tally.revives(g.local) === 1);
      T.hide(true);
      T.want('buy');
      T.frame(0.05);
      check('tips: a seen tip never comes back', T.cur?.id !== 'buy');
      // ---- scoreboard (Tab)
      key('Tab');
      await until(() => q('.zs-panel'), 2000);
      const p = q('.zs-panel');
      const rows = p ? p.querySelectorAll('tr').length - 1 : 0;
      check('scoreboard: the zombie board, no teams', !!p && !/Terrorist/.test(p.textContent) && /Wave|Get ready/.test(p.textContent));
      check('scoreboard: one row per survivor', rows === 3, `rows=${rows}`);
      const head = p ? [...p.querySelectorAll('th')].map((t) => t.textContent).join() : '';
      check('scoreboard: kills / downs / revives / deaths / cash / status', /Kills,Downs,Revives,Deaths,Cash,Status/.test(head), head);
      const me = p?.querySelector('tr.me');
      check('scoreboard: your row shows your revive', !!me && me.children[3].textContent === '1');
      check('scoreboard: shows time, difficulty and squad kills', !!p && /Run time/i.test(p.textContent) && /Hard/.test(p.textContent) && /Hardcore/i.test(p.textContent) && /Squad kills/i.test(p.textContent));
      return { log: out(), shot: true };
    }
    if (step === 7) {
      key('Tab', 'keyup');
      await sleep(100);
      check('scoreboard: Tab up hides it', !q('.zs-panel') && !q('.vg-score'));
      // ---- run over
      g.zombies.gameOver();
      for (let i = 0; i < 450; i++) g.tick();
      await until(() => q('.fe-over'), 3000);
      const o = q('.fe-over');
      check('run over: the screen comes up', !!o && /survived/i.test(o.textContent));
      await sleep(700);
      check('run over: stats, badges and actions', !!o && o.querySelectorAll('.fe-stat').length === 8 && /Hard/.test(o.textContent) && /Hardcore/.test(o.textContent) && o.querySelectorAll('button').length === 3);
      return { log: out(), shot: true };
    }
    if (step === 8) {
      q('.fe-over .fe-go').click();
      await until(() => !g.menus.isOpen() && g.local?.alive && g.zombies.state === 'break', 6000);
      check('play again: straight back in with the same setup', !g.menus.isOpen() && g.zombies.enabled && g.zombies.diff.id === 'hard' && g.local.alive && g.zombies.wave === 0);
      check('tips: second run counts', F.tips.s.runs === 2 && F.tips.live);
      // ---- classic through the new menus
      key('Escape');
      await until(() => entry('newgame classic'));
      entry('newgame classic').click();
      await until(() => q('.st-newgame'));
      qa('.st-newgame .st-btn').find((b) => b.textContent === 'Start').click();
      await until(() => g.menus.vg?.kind === 'team', 3000);
      check('classic: Start goes to the team menu', g.menus.vg?.kind === 'team' && !g.zombies.enabled);
      key('Digit1');
      await until(() => g.menus.vg?.kind === 'class', 2000);
      key('Digit5');
      await until(() => !g.menus.isOpen(), 2000);
      for (let i = 0; i < 200; i++) g.tick();
      const T = g.players.filter((p) => p.team === 'T').length, CT = g.players.filter((p) => p.team === 'CT').length;
      check('classic: a T vs CT game with bots', g.local.team === 'T' && T > 1 && CT > 0 && !g.zombies.enabled, `T=${T} CT=${CT}`);
      key('Tab');
      await until(() => q('.vg-score'), 2000);
      check('classic: the classic scoreboard', !!q('.vg-score') && /Terrorists/.test(q('.vg-score').textContent) && !q('.zs-panel'));
      key('Tab', 'keyup');
      lines.push(`[sim] ${fails ? 'FAIL' : 'PASS'} zm1-frontend: ${fails} failure${fails === 1 ? '' : 's'}`);
      return { log: out(), done: true };
    }
    return { done: true };
  };
})();
