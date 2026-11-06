// Full-screen overlays: loading screen, pause menu, death screen, note reader, dialogs.
import { h, clear, setText, setStyle, setClass, clamp, fmtDays, phaseText } from '../dom.js';
import { Backdrop } from './backdrop.js';
import { SettingsView, ControlsView } from './SettingsView.js';

export const TIPS = [
  'Zombies are drawn to noise. A single gunshot can be heard blocks away — and so can breaking glass.',
  'Crouch to sneak. Moving slowly in the dark keeps you off their radar.',
  'A bite is a death sentence. Scratches and lacerations only might be.',
  'Bleeding kills faster than hunger. Rip clothing into rags if you have no bandages.',
  'Dirty bandages cause infections. Boil rags or use disinfectant.',
  'Canned food lasts forever — but you will need a can opener, a knife, or something sharp.',
  'Rain and wet clothes chill you to the bone. October nights in Millbrook drop near freezing.',
  'Carrying too much slows you down and drains stamina. Bags help; so does Strength.',
  'Read a map of Millbrook to reveal the town on your own map.',
  'Barricade windows and doors with planks, nails and a hammer before nightfall.',
  'Runners appear at night. Do not be outside after dark without a plan.',
  'Melee weapons wear down. Keep a spare, and a whetstone if you can find one.',
  'Shove (V) to knock a zombie back and buy yourself a second.',
  'The radio still works. Somebody out there is broadcasting.',
  'Police cars, ambulances and military trucks often carry better loot — and more trouble.',
  'Drink from rivers only if you are desperate. Purify or boil water first.',
];

export class LoadingScreen {
  constructor(ui) {
    this.ui = ui;
    this.backdrop = new Backdrop({ particles: false, seed: 4242 });
    this.label = h('div.ld-label');
    this.pct = h('div.ld-pct');
    this.segs = [];
    const bar = h('div.ld-bar');
    for (let i = 0; i < 24; i++) { const s = h('i'); this.segs.push(s); bar.appendChild(s); }
    this.tip = h('div.ld-tip-text');
    this.el = h('div.loading.hidden', this.backdrop.el,
      h('div.ld-center',
        h('div.ld-title', 'DEAD COUNTY'),
        this.label,
        bar,
        this.pct),
      h('div.ld-tip', h('span.ld-tip-tag', 'Tip'), this.tip));
    this.tipIdx = Math.floor(Math.random() * TIPS.length);
    this.lastLit = -1;
  }

  show(label, frac) {
    const wasHidden = this.el.classList.contains('hidden');
    setClass(this.el, 'hidden', false);
    if (wasHidden) { this.nextTip(); this.startTips(); }
    setText(this.label, label || 'Loading…');
    const f = clamp(frac || 0, 0, 1);
    const lit = Math.round(f * this.segs.length);
    if (lit !== this.lastLit) {
      this.lastLit = lit;
      this.segs.forEach((s, i) => setClass(s, 'on', i < lit));
    }
    setText(this.pct, Math.floor(f * 100) + '%');
  }

  nextTip() {
    this.tipIdx = (this.tipIdx + 1) % TIPS.length;
    this.tip.textContent = TIPS[this.tipIdx];
    this.tip.getAnimations?.().forEach((a) => a.cancel());
    this.tip.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'forwards' });
  }

  startTips() {
    clearInterval(this._iv);
    this._iv = setInterval(() => this.nextTip(), 7000);
  }

  hide() {
    setClass(this.el, 'hidden', true);
    clearInterval(this._iv);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
}

export class PauseMenu {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.sub = h('div.pause-sub');
    this.mainBox = h('div.pause-main',
      h('div.pause-title', 'Paused'),
      this.sub,
      h('div.menu-buttons',
        ui.button('Resume', () => this.resume(), 'btn-menu'),
        ui.button('Settings', () => this.view('settings'), 'btn-menu'),
        ui.button('Controls', () => this.view('controls'), 'btn-menu'),
        ui.button('Save & Quit to Menu', () => this.saveQuit(), 'btn-menu btn-danger')));
    this.settings = new SettingsView(ui, () => this.view('main'));
    this.controls = new ControlsView(ui, () => this.view('main'));
    this.el = h('div.pause.hidden', h('div.pause-dim'), this.mainBox, this.settings.el, this.controls.el);
    this.mode = 'main';
  }

  show() {
    setClass(this.el, 'hidden', false);
    const g = this.game;
    const t = g.time || {};
    const parts = [`Day ${t.day ?? 1}`];
    parts.push(g.player?.hasWatch ? `${String(t.hour ?? 0).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}` : phaseText((t.hour ?? 8) + (t.minute || 0) / 60));
    if (g.location?.name) parts.push(g.location.name);
    this.sub.textContent = parts.join(' · ');
    this.view('main');
  }

  hide() { setClass(this.el, 'hidden', true); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  view(m) {
    this.mode = m;
    setClass(this.mainBox, 'hidden', m !== 'main');
    setClass(this.settings.el, 'hidden', m !== 'settings');
    setClass(this.controls.el, 'hidden', m !== 'controls');
    if (m === 'settings') this.settings.render();
  }

  resume() {
    this.hide();
    try { this.game.resume?.(); } catch (e) { console.error(e); }
  }

  async saveQuit() {
    try { await this.game.saveGame?.(); } catch (e) { console.error('saveGame failed', e); }
    this.hide();
    try { this.game.quitToMenu?.(); } catch (e) { console.error('quitToMenu failed', e); }
  }

  /** Esc */
  back() {
    if (this.mode !== 'main') { this.view('main'); return true; }
    this.resume();
    return true;
  }
}

export class DeathScreen {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.content = h('div.death-content');
    this.el = h('div.death.hidden', h('div.death-bg'), h('div.death-blood'), this.content);
  }

  show(info = {}) {
    const g = this.game;
    clear(this.content);
    const skillsDef = g.SKILLS || {};
    const skills = info.skills || g.player?.skills || {};
    const prof = (g.PROFESSIONS || []).find((p) => p.id === info.profession);
    const profName = prof?.name || info.professionName || info.profession || 'Survivor';
    const skillRows = Object.entries(skills)
      .map(([id, s]) => [id, typeof s === 'number' ? s : s?.level ?? 0])
      .sort((a, b) => b[1] - a[1]);
    const btns = h('div.death-buttons',
      this.ui.button('New Game', () => this.newGame(), 'btn-menu'),
      this.ui.button('Main Menu', () => this.mainMenu(), 'btn-menu'));
    this.content.append(
      h('div.death-title', 'This is how you died.'),
      h('div.death-cause', info.cause || 'You died.'),
      h('div.death-card',
        h('div.death-name', info.name || 'Unknown survivor'),
        h('div.death-prof', profName),
        h('div.death-stats',
          h('div.dstat', h('b', fmtDays(info.daysSurvived ?? 0)), h('span', 'survived')),
          h('div.dstat', h('b', String(info.kills ?? 0)), h('span', 'zombies killed'))),
        skillRows.length ? h('div.death-skills', skillRows.map(([id, lv]) => h('div.dskill',
          h('span', skillsDef[id]?.name || id),
          h('span.pd-pips', Array.from({ length: 10 }, (_, i) => h('i' + (i < lv ? '.on' : ''))))))) : null),
      btns);
    setClass(this.el, 'hidden', false);
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
  }

  hide() { setClass(this.el, 'hidden', true); this.el.classList.remove('in'); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  newGame() {
    this.hide();
    try { this.game.quitToMenu?.(); } catch (e) { console.error(e); }
    this.ui.showMainMenu('newgame');
  }

  mainMenu() {
    this.hide();
    try { this.game.quitToMenu?.(); } catch (e) { console.error(e); }
    if (!this.ui.menu.isOpen) this.ui.showMainMenu();
  }
}

export class NoteReader {
  constructor(ui) {
    this.ui = ui;
    this.title = h('div.note-title');
    this.text = h('div.note-text');
    this.paper = h('div.note-paper', h('i.note-pin'), this.title, this.text, h('i.note-stain'));
    this.el = h('div.note-layer.hidden', this.paper,
      h('div.note-hint', h('span.key.sm', 'Esc'), ' close'));
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.ui.closeNote(); });
  }
  show({ title, text } = {}) {
    setText(this.title, title || '');
    setClass(this.title, 'hidden', !title);
    setText(this.text, text || '');
    this.paper.scrollTop = 0;
    const rot = (Math.random() * 1.6 - 0.8).toFixed(2);
    setStyle(this.paper, 'transform', `rotate(${rot}deg)`);
    setClass(this.paper, 'long', (text || '').length > 900);
    setClass(this.el, 'hidden', false);
    this.paper.getAnimations?.().forEach((a) => a.cancel());
    this.paper.animate?.([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'ease-out' });
  }
  hide() { setClass(this.el, 'hidden', true); }
  get isOpen() { return !this.el.classList.contains('hidden'); }
}

export class DialogLayer {
  constructor(ui) {
    this.ui = ui;
    this.stack = [];
    this.el = h('div.dialog-layer.hidden');
  }
  show({ title, text, buttons } = {}) {
    const box = h('div.panel-box.dialog');
    const close = () => this.close(box);
    if (title) box.appendChild(h('div.pb-title', title));
    if (text) box.appendChild(h('div.dialog-text', text));
    const foot = h('div.pb-foot.dialog-foot');
    const list = buttons && buttons.length ? buttons : [{ label: 'OK' }];
    list.forEach((b, i) => {
      const btn = this.ui.button(b.label, () => {
        let keep = false;
        try { keep = b.run?.() === false; } catch (e) { console.error(e); }
        if (!keep) close();
      }, 'btn-wide' + (i === 0 && list.length > 1 ? ' btn-primary' : '') + (b.danger ? ' btn-danger' : ''));
      foot.appendChild(btn);
    });
    box.appendChild(foot);
    box._buttons = list;
    this.stack.push(box);
    this.el.appendChild(box);
    setClass(this.el, 'hidden', false);
    box.animate?.([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' });
    return { close };
  }
  close(box) {
    box = box || this.stack[this.stack.length - 1];
    if (!box) return;
    const i = this.stack.indexOf(box);
    if (i >= 0) this.stack.splice(i, 1);
    box.remove();
    if (!this.stack.length) setClass(this.el, 'hidden', true);
  }
  closeAll() { while (this.stack.length) this.close(); }
  get isOpen() { return this.stack.length > 0; }
  /** Enter → first button */
  confirm() {
    const box = this.stack[this.stack.length - 1];
    const btn = box && box.querySelector('.pb-foot .btn');
    btn?.click();
  }
}
