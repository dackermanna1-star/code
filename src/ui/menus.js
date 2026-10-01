// Scenes & menus: title, main menu, character select, difficulty, VS screen,
// battle wrapper with pause menu, move list, controls, options and results.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, B = JJK.BTN, Font = JJK.Font, FX = JJK.FX;
  const W = JJK.W, H = JJK.H;
  const snd = (n, o) => JJK.Audio && JJK.Audio.play(n, o);
  const UI = (JJK.UI = {});

  // ------------------------------------------------------------ menu input
  // Combines both keyboards + all pads into menu events with key repeat.
  class MenuInput {
    constructor() { this.prev = {}; this.rep = {}; this.ev = {}; }
    poll(ctrls) {
      const st = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, alt: false };
      const k = JJK.keys;
      const has = (codes) => codes.some((c) => k.has(c));
      st.up = has(['ArrowUp', 'KeyW']); st.down = has(['ArrowDown', 'KeyS']);
      st.left = has(['ArrowLeft', 'KeyA']); st.right = has(['ArrowRight', 'KeyD']);
      st.ok = has(['Enter', 'KeyJ', 'KeyU', 'Space', 'NumpadEnter', 'Numpad1', 'Comma']);
      st.back = has(['Escape', 'Backspace', 'KeyK', 'Numpad2', 'Period']);
      st.alt = has(['KeyI', 'KeyL', 'Numpad3', 'Slash']);
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
          const p = JJK.padState(i);
          if (!p) continue;
          st.up = st.up || p.up; st.down = st.down || p.down; st.left = st.left || p.left; st.right = st.right || p.right;
          st.ok = st.ok || p.SP || p.START; st.back = st.back || p.SU || p.BACK; st.alt = st.alt || p.L || p.M;
        }
      }
      for (const key in st) {
        const was = this.prev[key];
        let fire = st[key] && !was;
        if (st[key] && was && (key === 'up' || key === 'down' || key === 'left' || key === 'right')) {
          this.rep[key] = (this.rep[key] || 0) + 1;
          if (this.rep[key] > 18 && this.rep[key] % 5 === 0) fire = true;
        } else if (!st[key]) this.rep[key] = 0;
        this.ev[key] = fire;
      }
      this.prev = st;
      void ctrls;
      return this.ev;
    }
    // per-player confirm for character select
  }
  UI.input = new MenuInput();

  // ------------------------------------------------------------ shared drawing
  let bgStage = null, bgCam = null;
  UI.drawBackdrop = function (ctx, t, dim = 0.55) {
    if (JJK.Stage && !bgStage) { bgStage = new JJK.Stage(); bgStage.reset && bgStage.reset(); bgCam = new JJK.Camera(); }
    if (bgStage) {
      bgCam.x = Math.sin(t * 0.004) * 200;
      bgCam.y = JJK.CAM_BASE_Y;
      bgCam.ez = 1;
      bgStage.update && bgStage.update(bgCam);
      bgStage.darken = 0;
      bgStage.drawBack(ctx, bgCam);
      bgStage.drawFront && bgStage.drawFront(ctx, bgCam);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a0406'); g.addColorStop(0.6, '#6a1a10'); g.addColorStop(1, '#100404');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = `rgba(8,0,4,${dim})`;
    ctx.fillRect(0, 0, W, H);
    // embers
    if (t % 3 === 0) FX.spawn('px', U.rand(-320, 320), -10, { vy: U.rand(0.4, 1.2), vx: U.rand(-0.3, 0.3), life: 220, size: U.rand(1, 2), color: U.pick(['#ff8a3a', '#ffd060', '#ff4020']), add: true, fade: 1 });
  };

  UI.title = function (ctx, y, small) {
    const b = Font.banner('CURSED ARTS', { scale: small ? 5 : 8, top: '#fff6c0', mid: '#ffd21a', mid2: '#f08000', bot: '#8a1a00', outline: '#200000' });
    if (b) ctx.drawImage(b, Math.round(W / 2 - b.width / 2), y);
    return b ? b.height : 0;
  };

  // A character drawn at large scale for menus.
  const bigRasters = {};
  UI.drawFighterBig = function (ctx, charId, pal, poseName, x, y, facing, z, opts = {}) {
    if (typeof document === 'undefined') return;
    const key = charId + (opts.slot || '');
    let r = bigRasters[key];
    if (!r) r = bigRasters[key] = new JJK.Raster(W, H);
    const def = JJK.Chars[charId];
    const anim = opts.anim ? def.anims[opts.anim] : null;
    const pose = anim ? JJK.Rig.sample(anim, opts.t || 0, def.poses) : JJK.Rig.full(def.poses[poseName] || def.poses.idle);
    if (opts.eyes) pose.eyes = 'open';
    const J = JJK.Rig.solve(pose, def.art.dims);
    const xf = new JJK.Rig.Xform().set(x, y, facing, z, pose.rot || 0, [0, 70], 1, 1);
    r.begin();
    r.lights.push({ x: x + facing * 34 * z, y: y - 110 * z, r: 60 * z, r2: 3600 * z * z, c: charId === 'gojo' ? [40, 110, 255] : [255, 50, 30], i: 0.4 });
    if (opts.dark) r.tint = [10, 0, 10, 0.75];
    def.art.draw(r, J, xf, { pose, pal, sec: opts.sec || new JJK.Rig.Secondary(), eyesOpen: !!opts.eyes });
    r.outline(def.art.outline, opts.aura || 0, true);
    r.flush();
    r.drawTo(ctx, opts.alpha != null ? opts.alpha : 1);
  };

  function list(ctx, items, sel, x, y, opts = {}) {
    const lh = opts.lh || 22;
    items.forEach((it, i) => {
      const yy = y + i * lh;
      const on = i === sel;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (on) {
        ctx.fillStyle = 'rgba(255,60,30,0.25)';
        ctx.fillRect(x - (opts.w || 180) / 2, yy - 4, opts.w || 180, lh - 4);
        ctx.fillStyle = '#ff5030';
        ctx.fillRect(x - (opts.w || 180) / 2, yy - 4, 3, lh - 4);
      }
      Font.draw(ctx, label, x, yy, { color: it.disabled ? '#606060' : on ? '#ffffff' : '#c0a8a0', align: 'center', scale: opts.scale || 2, outline: '#000' });
    });
  }

  // ------------------------------------------------------------ scenes
  class Title {
    constructor() { this.t = 0; }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (ev.ok || ev.start || ev.back || (this.t > 30 && JJK.keys.size && !this._held)) {
        if (ev.ok || ev.start) {
          if (JJK.Audio) JJK.Audio.unlock();
          snd('ui_start');
          g.set(new MainMenu());
        }
      }
      if (this.t === 2 && JJK.Music) JJK.Music.play('title');
      FX.update();
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t, 0.35);
      FX.draw(ctx, { sx: (x) => x + 320, sy: (y) => -y + 360, ez: 1 }, 'front');
      // characters
      UI.drawFighterBig(ctx, 'gojo', 0, null, 190, 378, 1, 1.25, { anim: 'idle', t: this.t, slot: 'a' });
      UI.drawFighterBig(ctx, 'sukuna', 0, null, 450, 378, -1, 1.25, { anim: 'idle', t: this.t, slot: 'b' });
      const hh = UI.title(ctx, 24);
      Font.draw(ctx, 'GOJO  VS  SUKUNA', W / 2, 26 + hh, { color: '#ffffff', align: 'center', scale: 2, outline: '#300000' });
      Font.draw(ctx, 'A JUJUTSU ARCADE FIGHTER', W / 2, 46 + hh, { color: '#d0a090', align: 'center', outline: '#000' });
      if (this.t % 60 < 40) Font.draw(ctx, 'PRESS START', W / 2, 300, { color: '#ffd23a', align: 'center', scale: 2, outline: '#000' });
      Font.draw(ctx, 'ENTER / J / GAMEPAD A', W / 2, 320, { color: '#a08070', align: 'center', outline: '#000' });
      Font.draw(ctx, 'FAN-MADE • PERSONAL USE', W / 2, 348, { color: '#604040', align: 'center' });
    }
  }
  UI.Title = Title;

  class MainMenu {
    constructor() {
      this.t = 0; this.sel = 0;
      this.items = [
        { label: 'ARCADE  (VS CPU)', go: (g) => g.set(new Difficulty('arcade')) },
        { label: 'VERSUS  (2 PLAYERS)', go: (g) => g.set(new Select({ mode: 'versus' })) },
        { label: 'CPU VS CPU', go: (g) => g.set(new Difficulty('watch')) },
        { label: 'TRAINING', go: (g) => g.set(new Select({ mode: 'training' })) },
        { label: 'MOVE LIST', go: (g) => g.set(new MoveList(this)) },
        { label: 'CONTROLS', go: (g) => g.set(new Controls(this)) },
        { label: 'OPTIONS', go: (g) => g.set(new Options(this)) },
      ];
    }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (ev.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; snd('ui_move'); }
      if (ev.down) { this.sel = (this.sel + 1) % this.items.length; snd('ui_move'); }
      if (ev.ok) { snd('ui_select'); this.items[this.sel].go(g); }
      if (ev.back) { snd('ui_back'); g.set(new Title()); }
      if (JJK.Music && this.t === 1) JJK.Music.play('title');
      FX.update();
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t + 500, 0.62);
      UI.title(ctx, 18, true);
      list(ctx, this.items, this.sel, W / 2, 110, { w: 300 });
      Font.draw(ctx, '↑↓ SELECT   ENTER/J CONFIRM   ESC/K BACK', W / 2, 340, { color: '#a08070', align: 'center' });
    }
  }
  UI.MainMenu = MainMenu;

  class Difficulty {
    constructor(mode, sel) {
      this.mode = mode; this.t = 0;
      this.levels = ['easy', 'normal', 'hard', 'extreme', 'boss'];
      this.sel = sel != null ? sel : 1;
      this.desc = {
        easy: 'SIMPLE ATTACKS, LIMITED COMBOS.',
        normal: 'BASIC DEFENSE AND SPECIALS.',
        hard: 'COMBOS, COUNTERS, SPACING, RESOURCES.',
        extreme: 'ADVANCED NEUTRAL, PUNISHES EVERYTHING.',
        boss: 'RELENTLESS. STILL OBEYS THE RULES.',
      };
    }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (ev.up) { this.sel = (this.sel + 4) % 5; snd('ui_move'); }
      if (ev.down) { this.sel = (this.sel + 1) % 5; snd('ui_move'); }
      if (ev.back) { snd('ui_back'); g.set(new MainMenu()); }
      if (ev.ok) { snd('ui_select'); g.set(new Select({ mode: this.mode, level: this.levels[this.sel] })); }
      FX.update();
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t + 900, 0.62);
      Font.draw(ctx, 'SELECT DIFFICULTY', W / 2, 40, { color: '#ffd23a', align: 'center', scale: 3, outline: '#000' });
      list(ctx, this.levels.map((l) => ({ label: l.toUpperCase() })), this.sel, W / 2, 100, { w: 220, lh: 26 });
      Font.draw(ctx, this.desc[this.levels[this.sel]], W / 2, 260, { color: '#e0c0b0', align: 'center', outline: '#000' });
    }
  }
  UI.Difficulty = Difficulty;

  // Character select: P1 (and P2 in versus) pick a character and a color.
  class Select {
    constructor(o) {
      this.o = o; this.t = 0;
      this.chars = ['gojo', 'sukuna'];
      this.cur = [0, 1];
      this.pal = [0, 0];
      this.done = [false, o.mode !== 'versus'];
      this.cpuPick = o.mode !== 'versus';
      this.secs = [new JJK.Rig.Secondary(), new JJK.Rig.Secondary()];
      this.prevHeld = [0, 0];
    }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (ev.back && !this.done[0]) { snd('ui_back'); g.set(new MainMenu()); return; }
      // P1 uses keyboard 1 / pad 1; P2 uses keyboard 2 / pad 2 (versus)
      const ctrls = g.ctrls;
      for (let i = 0; i < 2; i++) {
        if (i === 1 && this.o.mode !== 'versus') break;
        const c = ctrls[i].poll();
        const pressed = c.pressed;
        const d = c.dir, pd = this.prevDir ? this.prevDir[i] : 5;
        if (!this.done[i]) {
          if ((d === 4 && pd !== 4) || (d === 6 && pd !== 6)) { this.cur[i] = 1 - this.cur[i]; snd('ui_move'); }
          if (pressed & (B.L | B.SP | B.START)) { this.pal[i] = 0; this.lock(i); }
          else if (pressed & (B.M | B.H | B.SU)) { this.pal[i] = 1; this.lock(i); }
        } else if (pressed & B.BACK) { this.done[i] = false; snd('ui_back'); }
        if (!this.prevDir) this.prevDir = [5, 5];
        this.prevDir[i] = d;
      }
      // menu-confirm for P1 also works from the shared menu input
      if (!this.done[0] && ev.ok && !(g.ctrls[0].pressed)) { this.pal[0] = 0; this.lock(0); }
      if (this.done[0] && this.cpuPick && !this.cpuDone) {
        this.cpuDone = true;
        this.cur[1] = this.o.mode === 'training' ? 1 - this.cur[0] : 1 - this.cur[0];
        if (this.o.mode === 'watch') this.cur[1] = 1 - this.cur[0];
        this.pal[1] = this.cur[1] === this.cur[0] ? 1 - this.pal[0] : 0;
      }
      if (this.done[0] && this.done[1] && !this.go) {
        this.go = this.t;
      }
      if (this.go && this.t - this.go > 30) {
        const p1 = { char: this.chars[this.cur[0]], pal: this.pal[0] };
        const p2 = { char: this.chars[this.cur[1]], pal: this.cur[0] === this.cur[1] && this.pal[0] === this.pal[1] ? 1 - this.pal[0] : this.pal[1] };
        g.set(new VsScreen(Object.assign({}, this.o, { p1, p2 })));
      }
      for (const s of this.secs) s.t++;
    }
    lock(i) {
      this.done[i] = true;
      snd('ui_select');
      const id = this.chars[this.cur[i]];
      if (JJK.Voice) JJK.Voice.say(id, 'taunt');
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t + 1300, 0.7);
      Font.draw(ctx, 'SELECT YOUR SORCERER', W / 2, 14, { color: '#ffd23a', align: 'center', scale: 3, outline: '#000' });
      // two big character panels
      for (let k = 0; k < 2; k++) {
        const id = this.chars[k];
        const def = JJK.Chars[id];
        const cx = k === 0 ? 180 : 460;
        const hov = [0, 1].filter((i) => this.cur[i] === k && (i === 0 || this.o.mode === 'versus' || this.cpuDone));
        ctx.fillStyle = hov.length ? 'rgba(255,80,40,0.16)' : 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx - 120, 46, 240, 262);
        ctx.fillStyle = def.color;
        ctx.fillRect(cx - 120, 46, 240, 2);
        const pal = hov.length ? this.pal[hov[0]] : 0;
        UI.drawFighterBig(ctx, id, pal, null, cx, 290, k === 0 ? 1 : -1, 1.25, { anim: 'idle', t: this.t, slot: 's' + k, sec: this.secs[k] });
        Font.draw(ctx, def.full, cx, 256, { color: '#ffffff', align: 'center', scale: 2, outline: '#000' });
        Font.draw(ctx, def.title, cx, 276, { color: def.color, align: 'center', outline: '#000' });
        Font.draw(ctx, id === 'gojo' ? 'CONTROLS SPACE' : 'CONTROLS DESTRUCTION', cx, 288, { color: '#c0a8a0', align: 'center', outline: '#000' });
        for (const i of hov) {
          const tag = this.o.mode === 'versus' || i === 0 ? 'P' + (i + 1) : 'CPU';
          const col = i === 0 ? '#40a0ff' : '#ff4040';
          Font.draw(ctx, tag + (this.done[i] ? ' OK' : ''), cx + (i === 0 ? -100 : 100), 56, { color: col, align: i === 0 ? 'left' : 'right', scale: 2, outline: '#000' });
        }
      }
      const help = this.o.mode === 'versus' ? 'P1: A/D + J (color 1) or K (color 2)    P2: ←/→ + NUM1 / NUM2' : '←/→ CHOOSE   J/L: COLOR 1   K/H: COLOR 2';
      Font.draw(ctx, help, W / 2, 322, { color: '#e0c0b0', align: 'center', outline: '#000' });
      Font.draw(ctx, 'MODE: ' + this.o.mode.toUpperCase() + (this.o.level ? '  •  CPU ' + this.o.level.toUpperCase() : ''), W / 2, 338, { color: '#a08070', align: 'center' });
    }
  }
  UI.Select = Select;

  class VsScreen {
    constructor(o) { this.o = o; this.t = 0; }
    tick(g) {
      this.t++;
      if (this.t === 1) snd('ui_start');
      const ev = UI.input.poll();
      if (this.t > 150 || (this.t > 30 && ev.ok)) g.startBattle(this.o);
      FX.update();
    }
    render(ctx) {
      ctx.fillStyle = '#080004'; ctx.fillRect(0, 0, W, H);
      const k = U.ease.out3(Math.min(1, this.t / 24));
      // diagonal split
      ctx.fillStyle = '#0c1a3a';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(360, 0); ctx.lineTo(280, H); ctx.lineTo(0, H); ctx.fill();
      ctx.fillStyle = '#3a0c0c';
      ctx.beginPath(); ctx.moveTo(360, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(280, H); ctx.fill();
      const o = this.o;
      UI.drawFighterBig(ctx, o.p1.char, o.p1.pal, null, -100 + 300 * k, 420, 1, 2.0, { anim: 'idle', t: this.t, slot: 'v1', eyes: false });
      UI.drawFighterBig(ctx, o.p2.char, o.p2.pal, null, W + 100 - 300 * k, 420, -1, 2.0, { anim: 'idle', t: this.t, slot: 'v2' });
      const vs = Font.banner('VS', { scale: 10, top: '#ffffff', mid: '#ffd21a', bot: '#a01000' });
      if (vs && this.t > 20) {
        const s = this.t < 30 ? 1 + (30 - this.t) * 0.1 : 1;
        ctx.drawImage(vs, W / 2 - vs.width * s / 2, 140 - vs.height * s / 2, vs.width * s, vs.height * s);
      }
      Font.draw(ctx, JJK.Chars[o.p1.char].full, 30, 320, { color: '#ffffff', scale: 2, outline: '#000' });
      Font.draw(ctx, JJK.Chars[o.p2.char].full, W - 30, 320, { color: '#ffffff', scale: 2, align: 'right', outline: '#000' });
      Font.draw(ctx, JJK.Chars[o.p1.char].title, 30, 340, { color: JJK.Chars[o.p1.char].color, outline: '#000' });
      Font.draw(ctx, JJK.Chars[o.p2.char].title, W - 30, 340, { color: JJK.Chars[o.p2.char].color, align: 'right', outline: '#000' });
    }
  }
  UI.VsScreen = VsScreen;

  // ------------------------------------------------------------ battle scene
  class BattleScene {
    constructor(g, o) {
      this.g = g; this.o = o;
      const c1 = g.ctrls[0], c2 = g.ctrls[1];
      c1.virtual = null; c2.virtual = null;
      const cpu1 = o.mode === 'watch' ? (o.level || 'normal') : null;
      const cpu2 = o.mode === 'arcade' || o.mode === 'watch' ? (o.level || 'normal') : null;
      const p2ctrl = o.mode === 'versus' ? c2 : new JJK.Controller(null, -1);
      const p1ctrl = o.mode === 'watch' ? new JJK.Controller(null, -1) : c1;
      if (cpu2 || o.mode === 'training') p2ctrl.virtual = { dir: 5, held: 0 };
      if (cpu1) p1ctrl.virtual = { dir: 5, held: 0 };
      this.m = new JJK.Battle({
        mode: o.mode === 'watch' ? 'arcade' : o.mode,
        p1: { char: o.p1.char, pal: o.p1.pal, ctrl: p1ctrl, cpu: cpu1 },
        p2: { char: o.p2.char, pal: o.p2.pal, ctrl: p2ctrl, cpu: cpu2 },
      });
      if (o.mode === 'training') this.m.training.cpuLevel = o.level || 'normal';
      this.pause = null;
    }
    tick(g) {
      const m = this.m;
      // pause toggle
      const startPressed = JJK.keyPressed('Escape') || JJK.keyPressed('Enter') || JJK.keyPressed('NumpadEnter') || this.padStart();
      if (this.pause) {
        this.pause.tick(g, this);
        return;
      }
      if (startPressed && m.phase !== 'over') {
        this.pause = new PauseMenu(this);
        m.paused = true;
        if (JJK.Music) JJK.Music.pause();
        snd('ui_select');
        return;
      }
      m.tick();
      if (m.phase === 'over' && m.pt > 60) {
        m.destroy();
        g.set(new Results(this.o, m.result, m));
      }
    }
    padStart() {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      let s = false;
      for (let i = 0; i < pads.length; i++) {
        const p = JJK.padState(i);
        if (p && p.START) s = true;
      }
      const fire = s && !this._ps;
      this._ps = s;
      return fire;
    }
    render(ctx) {
      this.m.render(ctx);
      if (this.pause) this.pause.render(ctx);
    }
  }
  UI.BattleScene = BattleScene;

  class PauseMenu {
    constructor(bs) {
      this.bs = bs; this.sel = 0; this.sub = null;
      UI.input.poll();
      const m = bs.m;
      this.items = [
        { label: 'RESUME', go: () => this.close() },
        { label: 'MOVE LIST', go: () => { this.sub = new MoveList(null, m.fighters[0].def.id); } },
        { label: 'CONTROLS', go: () => { this.sub = new Controls(null); } },
      ];
      if (m.training) {
        const t = m.training;
        const T = JJK.Training;
        this.items.push(
          { label: () => 'DUMMY: ' + T.DUMMY[t.dummy], left: () => { t.dummy = (t.dummy + T.DUMMY.length - 1) % T.DUMMY.length; T.applyDummy(m); }, right: () => { t.dummy = (t.dummy + 1) % T.DUMMY.length; T.applyDummy(m); } },
          { label: () => 'BLOCK: ' + T.BLOCK[t.block], left: () => (t.block = (t.block + 3) % 4), right: () => (t.block = (t.block + 1) % 4) },
          { label: () => 'CPU LEVEL: ' + t.cpuLevel.toUpperCase(), left: () => this.cycleLevel(-1), right: () => this.cycleLevel(1) },
          { label: () => 'INFINITE HEALTH: ' + (t.infHp ? 'ON' : 'OFF'), go: () => (t.infHp = !t.infHp), left: () => (t.infHp = !t.infHp), right: () => (t.infHp = !t.infHp) },
          { label: () => 'INFINITE METER: ' + (t.infMeter ? 'ON' : 'OFF'), go: () => (t.infMeter = !t.infMeter), left: () => (t.infMeter = !t.infMeter), right: () => (t.infMeter = !t.infMeter) },
          { label: () => 'HITBOXES: ' + (t.hitboxes ? 'ON' : 'OFF'), go: () => (t.hitboxes = !t.hitboxes), left: () => (t.hitboxes = !t.hitboxes), right: () => (t.hitboxes = !t.hitboxes) },
          { label: () => 'FRAME DATA: ' + (t.frameData ? 'ON' : 'OFF'), go: () => (t.frameData = !t.frameData), left: () => (t.frameData = !t.frameData), right: () => (t.frameData = !t.frameData) },
          { label: () => 'FRAME METER: ' + (t.frameMeter ? 'ON' : 'OFF'), go: () => (t.frameMeter = !t.frameMeter), left: () => (t.frameMeter = !t.frameMeter), right: () => (t.frameMeter = !t.frameMeter) },
          { label: 'RESET POSITIONS', go: () => { T.reset(m, 'center'); this.close(); } },
        );
      }
      this.items.push(
        { label: 'RESTART MATCH', go: () => { bs.m.destroy(); bs.g.startBattle(bs.o); } },
        { label: 'CHARACTER SELECT', go: () => { bs.m.destroy(); bs.g.set(new Select({ mode: bs.o.mode, level: bs.o.level })); } },
        { label: 'QUIT TO MENU', go: () => { bs.m.destroy(); bs.g.set(new MainMenu()); } },
      );
    }
    cycleLevel(d) {
      const L = ['easy', 'normal', 'hard', 'extreme', 'boss'];
      const t = this.bs.m.training;
      t.cpuLevel = L[(L.indexOf(t.cpuLevel) + d + L.length) % L.length];
      JJK.Training.applyDummy(this.bs.m);
    }
    close() {
      this.bs.pause = null;
      this.bs.m.paused = false;
      if (JJK.Music) JJK.Music.resume();
      snd('ui_back');
    }
    tick(g, bs) {
      const ev = UI.input.poll();
      if (this.sub) {
        if (this.sub.tickSub(ev)) this.sub = null;
        return;
      }
      if (JJK.keyPressed('Escape')) { this.close(); return; }
      if (ev.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; snd('ui_move'); }
      if (ev.down) { this.sel = (this.sel + 1) % this.items.length; snd('ui_move'); }
      const it = this.items[this.sel];
      if (ev.left && it.left) { it.left(); snd('ui_move'); }
      if (ev.right && it.right) { it.right(); snd('ui_move'); }
      if (ev.ok && it.go) { snd('ui_select'); it.go(); }
      if (ev.back && !JJK.keyPressed('Escape')) this.close();
    }
    render(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      if (this.sub) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H); this.sub.render(ctx, true); return; }
      Font.draw(ctx, 'PAUSED', W / 2, 30, { color: '#ffd23a', align: 'center', scale: 3, outline: '#000' });
      const lh = this.items.length > 9 ? 19 : 22;
      list(ctx, this.items, this.sel, W / 2, 70, { w: 320, lh, scale: this.items.length > 9 ? 1 : 2 });
    }
  }

  // ------------------------------------------------------------ move list
  class MoveList {
    constructor(back, charId) { this.back = back; this.ci = charId === 'sukuna' ? 1 : 0; this.scroll = 0; this.t = 0; }
    tickSub(ev) {
      if (ev.left || ev.right) { this.ci = 1 - this.ci; this.scroll = 0; snd('ui_move'); }
      if (ev.down) this.scroll = Math.min(this.scroll + 1, 10);
      if (ev.up) this.scroll = Math.max(0, this.scroll - 1);
      return ev.back || ev.ok;
    }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (this.tickSub(ev)) { snd('ui_back'); g.set(this.back || new MainMenu()); }
      FX.update();
    }
    render(ctx, overlay) {
      if (!overlay) UI.drawBackdrop(ctx, this.t + 2000, 0.8);
      const id = this.ci === 0 ? 'gojo' : 'sukuna';
      const def = JJK.Chars[id];
      Font.draw(ctx, '← ' + def.full + ' →', W / 2, 10, { color: def.color, align: 'center', scale: 2, outline: '#000' });
      const rows = def.moveList.slice(this.scroll);
      let y = 34;
      for (const r of rows) {
        if (y > 330) break;
        if (!r[1]) {
          Font.draw(ctx, r[0], 20, y, { color: '#ffd23a', outline: '#000' });
          ctx.fillStyle = '#ffd23a'; ctx.fillRect(20, y + 9, 600, 1);
          y += 14;
        } else {
          Font.draw(ctx, r[0], 24, y, { color: '#ffffff', outline: '#000' });
          Font.draw(ctx, r[1], 180, y, { color: '#d0c0c0', outline: '#000' });
          y += 11;
        }
      }
      Font.draw(ctx, 'NUMPAD NOTATION: ↓↘→ = QUARTER CIRCLE FORWARD   SP = SPECIAL   SU = SUPER', W / 2, 340, { color: '#a08070', align: 'center' });
      Font.draw(ctx, '←/→ CHARACTER   ↑/↓ SCROLL   K/ESC BACK', W / 2, 350, { color: '#a08070', align: 'center' });
    }
  }
  UI.MoveList = MoveList;

  class Controls {
    constructor(back) { this.back = back; this.t = 0; }
    tickSub(ev) { return ev.back || ev.ok; }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (this.tickSub(ev)) { snd('ui_back'); g.set(this.back || new MainMenu()); }
      FX.update();
    }
    render(ctx, overlay) {
      if (!overlay) UI.drawBackdrop(ctx, this.t + 2500, 0.8);
      Font.draw(ctx, 'CONTROLS', W / 2, 12, { color: '#ffd23a', align: 'center', scale: 3, outline: '#000' });
      const rows = [
        ['', 'PLAYER 1 (KEYBOARD)', 'PLAYER 2 (KEYBOARD)', 'GAMEPAD'],
        ['MOVE', 'W A S D', 'ARROW KEYS', 'D-PAD / STICK'],
        ['LIGHT (L)', 'J', 'NUM1 or ,', 'X'],
        ['MEDIUM (M)', 'K', 'NUM2 or .', 'Y'],
        ['HEAVY (H)', 'L', 'NUM3 or /', 'RB'],
        ['SPECIAL (SP)', 'U', 'NUM4 or ;', 'A'],
        ['SUPER (SU)', 'I', "NUM5 or '", 'B'],
        ['UNIQUE (UN)', 'O', 'NUM6 or [', 'RT'],
        ['THROW (L+M)', 'H', 'NUM0', 'LB'],
        ['PARRY (M+H)', 'Y', 'NUM .', 'LT'],
        ['DASH', 'SPACE / →→', 'R-SHIFT / →→', 'L3 / →→'],
        ['PAUSE', 'ESC / ENTER', 'NUM ENTER', 'START'],
      ];
      let y = 46;
      for (const r of rows) {
        const head = r[0] === '';
        Font.draw(ctx, r[0], 20, y, { color: '#ffd23a', outline: '#000' });
        Font.draw(ctx, r[1], 150, y, { color: head ? '#ffd23a' : '#ffffff', outline: '#000' });
        Font.draw(ctx, r[2], 300, y, { color: head ? '#ffd23a' : '#ffffff', outline: '#000' });
        Font.draw(ctx, r[3], 470, y, { color: head ? '#ffd23a' : '#ffffff', outline: '#000' });
        y += 14;
      }
      const tips = [
        'BLOCK: HOLD BACK (←). CROUCH-BLOCK LOWS (↙), STAND-BLOCK OVERHEADS.',
        'PERFECT GUARD: START BLOCKING JUST BEFORE THE HIT. PARRY: M+H (RISKY).',
        'QUICK RECOVERY: PRESS A BUTTON AS YOU HIT THE GROUND. THROW ESCAPE: L+M.',
        'CANCEL: L > M > H > SPECIAL > SUPER. LAUNCHERS (2H) CAN BE JUMP-CANCELLED.',
        'DOMAIN: SP+SU WITH 200 CE AND A FULL DOMAIN GAUGE. EXPAND TOGETHER TO CLASH.',
      ];
      y += 8;
      for (const t of tips) { Font.draw(ctx, t, W / 2, y, { color: '#e0c0b0', align: 'center', outline: '#000' }); y += 12; }
    }
  }
  UI.Controls = Controls;

  class Options {
    constructor(back) {
      this.back = back; this.sel = 0; this.t = 0;
      const S = JJK.settings;
      const pct = (v) => Math.round(v * 100) + '%';
      const step = (k, d, lo, hi) => () => { S[k] = U.clamp(Math.round((S[k] + d) * 100) / 100, lo, hi); this.apply(); };
      this.items = [
        { label: () => 'MUSIC VOLUME  ' + pct(S.musicVol), left: step('musicVol', -0.1, 0, 1), right: step('musicVol', 0.1, 0, 1) },
        { label: () => 'SFX VOLUME  ' + pct(S.sfxVol), left: step('sfxVol', -0.1, 0, 1), right: step('sfxVol', 0.1, 0, 1) },
        { label: () => 'VOICE LINES  ' + (S.voice ? 'ON' : 'OFF'), left: () => (S.voice = !S.voice), right: () => (S.voice = !S.voice), go: () => (S.voice = !S.voice) },
        { label: () => 'VOICE LANGUAGE  ' + (S.voiceLang === 'ja' ? 'JAPANESE' : 'ENGLISH'), left: () => (S.voiceLang = S.voiceLang === 'ja' ? 'en' : 'ja'), right: () => (S.voiceLang = S.voiceLang === 'ja' ? 'en' : 'ja') },
        { label: () => 'SCREEN SHAKE  ' + pct(S.shake), left: step('shake', -0.25, 0, 1.5), right: step('shake', 0.25, 0, 1.5) },
        { label: () => 'FLASH EFFECTS  ' + (S.flashes ? 'FULL' : 'REDUCED'), left: () => (S.flashes = !S.flashes), right: () => (S.flashes = !S.flashes) },
        { label: () => 'CRT FILTER  ' + (S.crt ? 'ON' : 'OFF'), left: () => { S.crt = !S.crt; this.apply(); }, right: () => { S.crt = !S.crt; this.apply(); } },
        { label: () => 'ROUND TIME  ' + S.roundTime + 'S', left: () => (S.roundTime = S.roundTime === 99 ? 90 : S.roundTime === 90 ? 60 : 99), right: () => (S.roundTime = S.roundTime === 60 ? 90 : S.roundTime === 90 ? 99 : 60) },
        { label: () => 'ROUNDS TO WIN  ' + S.rounds, left: () => (S.rounds = Math.max(1, S.rounds - 1)), right: () => (S.rounds = Math.min(3, S.rounds + 1)) },
        { label: () => 'P1 GAMEPAD  ' + (S.p1Pad < 0 ? 'NONE' : '#' + (S.p1Pad + 1)), left: () => { S.p1Pad = U.clamp(S.p1Pad - 1, -1, 3); this.apply(); }, right: () => { S.p1Pad = U.clamp(S.p1Pad + 1, -1, 3); this.apply(); } },
        { label: () => 'P2 GAMEPAD  ' + (S.p2Pad < 0 ? 'NONE' : '#' + (S.p2Pad + 1)), left: () => { S.p2Pad = U.clamp(S.p2Pad - 1, -1, 3); this.apply(); }, right: () => { S.p2Pad = U.clamp(S.p2Pad + 1, -1, 3); this.apply(); } },
        { label: 'BACK', go: () => this.leave() },
      ];
    }
    apply() {
      const S = JJK.settings;
      if (JJK.Audio) JJK.Audio.setVolumes(S.musicVol, S.sfxVol);
      if (JJK.game) { JJK.game.ctrls[0].pad = S.p1Pad; JJK.game.ctrls[1].pad = S.p2Pad; JJK.game.applyCrt(); }
      JJK.saveSettings();
    }
    leave() { this.apply(); this.g.set(this.back || new MainMenu()); }
    tick(g) {
      this.g = g;
      this.t++;
      const ev = UI.input.poll();
      if (ev.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; snd('ui_move'); }
      if (ev.down) { this.sel = (this.sel + 1) % this.items.length; snd('ui_move'); }
      const it = this.items[this.sel];
      if (ev.left && it.left) { it.left(); snd('ui_move'); this.apply(); }
      if (ev.right && it.right) { it.right(); snd('ui_move'); this.apply(); }
      if (ev.ok && it.go) { snd('ui_select'); it.go(); this.apply(); }
      if (ev.back) { snd('ui_back'); this.leave(); }
      FX.update();
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t + 3000, 0.75);
      Font.draw(ctx, 'OPTIONS', W / 2, 14, { color: '#ffd23a', align: 'center', scale: 3, outline: '#000' });
      list(ctx, this.items, this.sel, W / 2, 52, { w: 380, lh: 23 });
    }
  }
  UI.Options = Options;

  class Results {
    constructor(o, result, m) {
      this.o = o; this.r = result; this.t = 0; this.sel = 0;
      this.winner = result && result.winner;
      this.stats = result ? result.stats : null;
      this.items = [
        { label: 'REMATCH', go: (g) => g.startBattle(this.o) },
        { label: 'CHARACTER SELECT', go: (g) => g.set(new Select({ mode: this.o.mode, level: this.o.level })) },
        { label: 'MAIN MENU', go: (g) => g.set(new MainMenu()) },
      ];
    }
    tick(g) {
      this.t++;
      const ev = UI.input.poll();
      if (this.t < 30) return;
      if (ev.up) { this.sel = (this.sel + 2) % 3; snd('ui_move'); }
      if (ev.down) { this.sel = (this.sel + 1) % 3; snd('ui_move'); }
      if (ev.ok) { snd('ui_select'); this.items[this.sel].go(g); }
      FX.update();
    }
    render(ctx) {
      UI.drawBackdrop(ctx, this.t + 4000, 0.7);
      const w = this.winner;
      if (w) {
        UI.drawFighterBig(ctx, w.def.id, w.pal, null, 180, 340, 1, 1.6, { anim: 'win', t: Math.min(this.t, 90), slot: 'res', eyes: w.def.id === 'gojo' });
        const b = Font.banner(w.def.name + ' WINS', { scale: 6 });
        if (b) ctx.drawImage(b, Math.round(440 - b.width / 2), 40);
        const quote = w.def.id === 'gojo' ? '"THROUGHOUT HEAVEN AND EARTH,|I ALONE AM THE HONORED ONE."' : '"STAND PROUD.|YOU WERE STRONG."';
        quote.split('|').forEach((q, i) => Font.draw(ctx, q, 440, 110 + i * 12, { color: w.def.color, align: 'center', outline: '#000' }));
      } else {
        const b = Font.banner('DRAW', { scale: 6 });
        if (b) ctx.drawImage(b, Math.round(W / 2 - b.width / 2), 40);
      }
      if (this.stats) {
        const s = this.stats;
        Font.draw(ctx, 'P1 HITS ' + s.hits[0] + '  DMG ' + s.dmg[0] + '  MAX COMBO ' + s.maxCombo[0], 440, 150, { color: '#a0d0ff', align: 'center', outline: '#000' });
        Font.draw(ctx, 'P2 HITS ' + s.hits[1] + '  DMG ' + s.dmg[1] + '  MAX COMBO ' + s.maxCombo[1], 440, 162, { color: '#ffb0a0', align: 'center', outline: '#000' });
      }
      list(ctx, this.items, this.sel, 440, 210, { w: 260 });
    }
  }
  UI.Results = Results;
})();
