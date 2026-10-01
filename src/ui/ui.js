// PS1-style user interface drawn into the low resolution overlay canvas: title screen, pause
// menu, options, memory card dialogs, notes and short messages.
import { drawText, drawTextCentered, textWidth, wrapText, FONT_LINE } from '../gfx/font.js';

const C = {
  text: '#d8d2b8', dim: '#8a8676', hi: '#ffe9a0', shadow: '#000', box: 'rgba(8,8,12,0.82)', border: '#9a9478',
  paper: '#e4dfcf', ink: '#2a2a30', red: '#c84030',
};

export class UI {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
    this.stack = [];          // menu stack: {id, items, sel, title}
    this.message = null;      // {text, t}
    this.prompt = null;       // contextual interaction hint
    this.note = null;         // note text being read
    this.card = null;         // memory card dialog state
    this.fade = 0;            // 0 = clear, 1 = black
    this.fadeTarget = 0;
    this.saveIcon = 0;
    this.titleT = 0;
  }

  get W() { return this.game.uic.width; }
  get H() { return this.game.uic.height; }

  // ------------------------------------------------------------------ menus
  open(id) {
    const items = this.items(id);
    this.stack.push({ id, items, sel: 0 });
    this.game.sfx('move');
  }
  close() { this.stack.pop(); this.game.sfx('back'); }
  top() { return this.stack[this.stack.length - 1]; }
  get active() { return this.stack.length > 0 || !!this.note || !!this.card; }

  items(id) {
    const g = this.game, s = g.settings;
    const onoff = (v) => (v ? 'ON' : 'OFF');
    switch (id) {
      case 'title': {
        const it = [];
        if (g.hasSave()) it.push({ label: 'CONTINUE', act: () => g.continueGame() });
        it.push({ label: 'NEW EXPLORATION', act: () => g.startNew() });
        it.push({ label: 'OPTIONS', act: () => this.open('options') });
        it.push({ label: 'CONTROLS', act: () => this.open('controls') });
        return it;
      }
      case 'pause':
        return [
          { label: 'RESUME', act: () => g.resume() },
          { label: 'OPTIONS', act: () => this.open('options') },
          { label: 'CONTROLS', act: () => this.open('controls') },
          { label: 'QUIT TO TITLE', act: () => this.open('confirmquit') },
        ];
      case 'confirmquit':
        return [
          { label: 'NO', act: () => this.close() },
          { label: 'YES', act: () => g.quitToTitle() },
        ];
      case 'options':
        return [
          { label: 'SENSITIVITY', val: () => s.sens.toFixed(1), adj: (d) => { s.sens = Math.max(0.2, Math.min(3, +(s.sens + d * 0.1).toFixed(1))); } },
          { label: 'INVERT Y', val: () => onoff(s.invertY), adj: () => { s.invertY = !s.invertY; } },
          { label: 'FIELD OF VIEW', val: () => String(s.fov), adj: (d) => { s.fov = Math.max(46, Math.min(74, s.fov + d * 2)); } },
          { label: 'FRAME RATE', val: () => (s.fps30 ? '30 (PS1)' : '60'), adj: () => { s.fps30 = !s.fps30; } },
          { label: 'VERTEX JITTER', val: () => ['OFF', 'AUTHENTIC', 'HEAVY'][s.jitterMode], adj: (d) => { s.jitterMode = (s.jitterMode + (d || 1) + 3) % 3; } },
          { label: 'DITHERING', val: () => onoff(s.dither), adj: () => { s.dither = !s.dither; } },
          { label: 'SCREEN', val: () => (s.wide ? '16:9' : '4:3'), adj: () => { s.wide = !s.wide; g.applyScreen(); } },
          { label: 'BRIGHTNESS', val: () => s.bright.toFixed(1), adj: (d) => { s.bright = Math.max(0.6, Math.min(1.6, +(s.bright + d * 0.1).toFixed(1))); } },
          { label: 'VOLUME', val: () => String(Math.round(s.volume * 10)), adj: (d) => { s.volume = Math.max(0, Math.min(1, +(s.volume + d * 0.1).toFixed(1))); g.applyVolume(); } },
          { label: 'BACK', act: () => { g.saveSettings(); this.close(); } },
        ];
      case 'controls':
        return [{ label: 'BACK', act: () => this.close() }];
      default:
        return [{ label: 'BACK', act: () => this.close() }];
    }
  }

  // returns true when the UI consumed input
  input(inp) {
    if (this.card) { this.cardInput(inp); return true; }
    if (this.note) {
      if (inp.menuOk || inp.menuBack || inp.use || inp.pause || inp.click) { this.note = null; this.game.sfx('note_close'); }
      return true;
    }
    const m = this.top();
    if (!m) return false;
    if (inp.menuUp) { m.sel = (m.sel + m.items.length - 1) % m.items.length; this.game.sfx('move'); }
    if (inp.menuDown) { m.sel = (m.sel + 1) % m.items.length; this.game.sfx('move'); }
    const it = m.items[m.sel];
    if (it && it.adj && (inp.menuLeft || inp.menuRight)) { it.adj(inp.menuLeft ? -1 : 1); this.game.sfx('move'); }
    if (inp.click && this.hover >= 0) { m.sel = this.hover; }
    if ((inp.menuOk || (inp.click && this.hover >= 0)) && it) {
      if (it.act) { this.game.sfx('select'); it.act(); }
      else if (it.adj) { it.adj(1); this.game.sfx('move'); }
    }
    if ((inp.menuBack || inp.pause) && this.stack.length) {
      if (m.id === 'pause' && inp.pause) this.game.resume();
      else if (m.id !== 'title' && m.id !== 'pause') { if (m.id === 'options') this.game.saveSettings(); this.close(); }
      else if (m.id === 'pause') this.game.resume();
    }
    return true;
  }

  // ------------------------------------------------------------------ memory card
  openSaveDialog() {
    this.card = { phase: 'ask', sel: 0, t: 0 };
    this.game.sfx('note_open');
  }
  cardInput(inp) {
    const c = this.card;
    if (c.phase === 'ask') {
      if (inp.menuLeft || inp.menuRight || inp.menuUp || inp.menuDown) { c.sel = 1 - c.sel; this.game.sfx('move'); }
      if (inp.menuOk || inp.use || inp.click) {
        if (c.sel === 0) { c.phase = 'saving'; c.t = 0; this.game.sfx('select'); }
        else { this.card = null; this.game.sfx('back'); }
      }
      if (inp.menuBack || inp.pause) { this.card = null; this.game.sfx('back'); }
    } else if (c.phase === 'done') {
      if (inp.menuOk || inp.use || inp.menuBack || inp.click || c.t > 2.5) this.card = null;
    }
  }
  updateCard(dt) {
    const c = this.card;
    if (!c) return;
    c.t += dt;
    if (c.phase === 'saving' && c.t > 1.6) {
      const ok = this.game.saveGame('manual');
      c.phase = 'done'; c.t = 0; c.ok = ok;
      this.game.sfx(ok ? 'save' : 'error');
    }
  }

  showNote(text) { this.note = text; this.game.sfx('note_open'); }
  say(text, secs = 2.5) { this.message = { text, t: secs }; }

  // ------------------------------------------------------------------ drawing
  draw(dt) {
    const c = this.ctx, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    this.updateCard(dt);
    const g = this.game;
    if (g.state === 'title') this.drawTitle(dt);
    if (g.state === 'play' || g.state === 'pause') {
      if (this.prompt && !this.active) {
        const t = this.prompt;
        drawTextCentered(c, t, W / 2, H - 22, C.text, 1, C.shadow);
      }
      if (this.message) {
        this.message.t -= dt;
        const a = Math.min(1, this.message.t);
        if (a <= 0) this.message = null;
        else { c.globalAlpha = a; drawTextCentered(c, this.message.text, W / 2, H - 36, C.hi, 1, C.shadow); c.globalAlpha = 1; }
      }
    }
    if (this.loading) drawTextCentered(c, 'NOW LOADING', W / 2, H / 2 - 4, C.text, 1, C.shadow);
    if (this.saveIcon > 0) {
      this.saveIcon -= dt;
      if (Math.floor(this.saveIcon * 4) % 2 === 0) this.drawCardIcon(W - 22, 8, 1);
    }
    // fades sit under menus so menus stay readable
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 2.4);
    if (Math.abs(this.fade - this.fadeTarget) < 0.01) this.fade = this.fadeTarget;
    if (this.fade > 0.003) { c.fillStyle = `rgba(0,0,0,${this.fade})`; c.fillRect(0, 0, W, H); }
    const m = this.top();
    if (m && m.id !== 'title') this.drawMenu(m);
    else if (m && m.id === 'title') this.drawMenu(m, true);
    if (this.note) this.drawNote();
    if (this.card) this.drawCard();
    if (g.touchUI) g.touchUI.draw(c);
  }

  box(x, y, w, h) {
    const c = this.ctx;
    c.fillStyle = C.box; c.fillRect(x, y, w, h);
    c.fillStyle = C.border;
    c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h);
  }

  drawTitle(dt) {
    const c = this.ctx, W = this.W, H = this.H;
    this.titleT += dt;
    // vignette band behind the logo
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 38, W, 54);
    const logo = 'LEVEL ZERO';
    const sc = 3;
    const jitter = Math.sin(this.titleT * 31) > 0.97 ? 1 : 0;
    drawTextCentered(c, logo, W / 2 + jitter, 46, '#e8d888', sc, '#3a3010');
    drawTextCentered(c, 'AN EXPLORATION OF THE BACKROOMS', W / 2, 74, C.dim, 1, C.shadow);
    if (!this.top()) {
      if (Math.floor(this.titleT * 1.6) % 2 === 0) drawTextCentered(c, this.game.input.isTouch ? 'TAP TO START' : 'PRESS START', W / 2, 160, C.text, 1, C.shadow);
    }
    drawTextCentered(c, '(C)1998 HOLLOW FLOOR SOFTWARE', W / 2, H - 14, '#5e5a4c', 1);
  }

  drawMenu(m, isTitle = false) {
    const c = this.ctx, W = this.W, H = this.H;
    const titles = { pause: 'PAUSE', options: 'OPTIONS', controls: 'CONTROLS', confirmquit: 'RETURN TO TITLE?' };
    const lines = m.items;
    if (m.id === 'controls') { this.drawControls(m); return; }
    const rowH = 12;
    const w = m.id === 'options' ? 220 : 160;
    const h = lines.length * rowH + (isTitle ? 12 : 30);
    const x = Math.round((W - w) / 2), y = isTitle ? 120 : Math.round((H - h) / 2);
    if (!isTitle) this.box(x, y, w, h);
    if (!isTitle) drawTextCentered(c, titles[m.id] || '', W / 2, y + 7, C.hi, 1);
    const y0 = y + (isTitle ? 6 : 22);
    this.hover = -1;
    const mouse = this.game.mouseUI();
    lines.forEach((it, i) => {
      const ly = y0 + i * rowH;
      if (mouse && mouse.y >= ly - 2 && mouse.y < ly + rowH - 2 && mouse.x >= x && mouse.x < x + w) this.hover = i;
      const sel = i === m.sel;
      const col = sel ? C.hi : C.text;
      if (it.val) {
        drawText(c, it.label, x + 16, ly, col, 1, C.shadow);
        const v = (sel ? '← ' : '  ') + it.val() + (sel ? ' →' : '  ');
        drawText(c, v, x + w - 12 - textWidth(v), ly, col, 1, C.shadow);
      } else {
        if (isTitle) drawTextCentered(c, it.label, W / 2, ly, col, 1, C.shadow);
        else drawText(c, it.label, x + 16, ly, col, 1, C.shadow);
      }
      if (sel) {
        const cx = isTitle ? W / 2 - textWidth(it.label) / 2 - 10 : x + 6;
        if (Math.floor(performance.now() / 300) % 2 === 0) drawText(c, '▶', cx, ly, C.hi, 1);
      }
    });
    if (m.id === 'pause') {
      const g = this.game;
      const t = Math.floor(g.stats.time);
      const hh = String(Math.floor(t / 3600)).padStart(2, '0'), mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
      const dist = g.player.distance / 1000;
      drawText(c, `TIME ${hh}:${mm}:${ss}`, x + 8, y + h + 6, C.dim, 1, C.shadow);
      drawText(c, `WALKED ${dist.toFixed(2)} KM`, x + w - 8 - textWidth(`WALKED ${dist.toFixed(2)} KM`), y + h + 6, C.dim, 1, C.shadow);
    }
  }

  drawControls(m) {
    const c = this.ctx, W = this.W, H = this.H;
    const touch = this.game.input.isTouch;
    const rows = touch ? [
      ['LEFT THUMB', 'WALK'], ['RIGHT THUMB', 'LOOK'], ['TAP', 'USE'], ['RUN / CROUCH', 'BUTTONS'], ['CLIMB', 'LEDGES'], ['II', 'PAUSE'],
    ] : [
      ['W A S D', 'WALK'], ['MOUSE', 'LOOK'], ['ARROWS', 'WALK / TURN'], ['SHIFT', 'RUN'], ['C / CTRL', 'CROUCH'],
      ['SPACE', 'CLIMB LEDGE'], ['E / CLICK', 'USE'], ['ESC', 'PAUSE'], ['GAMEPAD', 'SUPPORTED'],
    ];
    const w = 220, h = rows.length * 11 + 44;
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    this.box(x, y, w, h);
    drawTextCentered(c, 'CONTROLS', W / 2, y + 7, C.hi, 1);
    rows.forEach(([a, b], i) => {
      drawText(c, a, x + 14, y + 22 + i * 11, C.text, 1, C.shadow);
      drawText(c, b, x + w - 14 - textWidth(b), y + 22 + i * 11, C.dim, 1, C.shadow);
    });
    drawTextCentered(c, '▶ BACK', W / 2, y + h - 12, C.hi, 1, C.shadow);
    void m;
  }

  drawNote() {
    const c = this.ctx, W = this.W, H = this.H;
    const w = 200, x = Math.round((W - w) / 2);
    const lines = wrapText(this.note, 30);
    const h = Math.min(H - 24, lines.length * FONT_LINE + 28);
    const y = Math.round((H - h) / 2);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, W, H);
    c.fillStyle = C.paper; c.fillRect(x, y, w, h);
    c.fillStyle = '#c9c3b0'; c.fillRect(x + w - 3, y + 3, 3, h - 3); c.fillRect(x + 3, y + h - 3, w - 3, 3);
    lines.slice(0, Math.floor((h - 28) / FONT_LINE)).forEach((ln, i) => drawText(c, ln, x + 12, y + 12 + i * FONT_LINE, C.ink, 1));
  }

  drawCardIcon(x, y, s) {
    const c = this.ctx;
    c.fillStyle = '#304060'; c.fillRect(x, y, 14 * s, 16 * s);
    c.fillStyle = '#8090b0'; c.fillRect(x + 2 * s, y + 2 * s, 10 * s, 5 * s);
    c.fillStyle = '#d0b040'; for (let i = 0; i < 4; i++) c.fillRect(x + (2 + i * 3) * s, y + 12 * s, 2 * s, 3 * s);
  }

  drawCard() {
    const c = this.ctx, W = this.W, H = this.H;
    const card = this.card;
    const w = 200, h = 84, x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    this.box(x, y, w, h);
    this.drawCardIcon(x + 10, y + 10, 2);
    drawText(c, 'MEMORY CARD', x + 50, y + 12, C.hi, 1);
    drawText(c, 'SLOT 1', x + 50, y + 22, C.dim, 1);
    if (card.phase === 'ask') {
      drawText(c, 'SAVE YOUR PROGRESS?', x + 50, y + 38, C.text, 1);
      const yes = card.sel === 0, no = card.sel === 1;
      drawText(c, (yes ? '▶' : ' ') + 'YES', x + 60, y + 58, yes ? C.hi : C.text, 1);
      drawText(c, (no ? '▶' : ' ') + 'NO', x + 120, y + 58, no ? C.hi : C.text, 1);
    } else if (card.phase === 'saving') {
      drawText(c, 'SAVING' + '.'.repeat(1 + (Math.floor(card.t * 4) % 3)), x + 50, y + 38, C.text, 1);
      drawText(c, 'DO NOT REMOVE THE', x + 50, y + 54, C.dim, 1);
      drawText(c, 'MEMORY CARD', x + 50, y + 63, C.dim, 1);
    } else {
      drawText(c, card.ok ? 'SAVE COMPLETE.' : 'COULD NOT SAVE.', x + 50, y + 42, card.ok ? C.text : C.red, 1);
    }
  }
}
