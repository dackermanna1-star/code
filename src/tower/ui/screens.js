// LAST LOOKOUT — menu screens: title (animated dusk + logo), pause, settings, game over, credits.
// Keyboard (arrows / WASD, Enter, Esc to go back) and mouse (hover selects, click activates).

import { el, SegBar } from './dom.js';
import { TitleArt, drawLogo } from './titleArt.js';
import { SETTINGS, mergeSettings, stepSetting, settingFraction, settingText } from './settingsModel.js';
import { formatCash, groupThousands, formatAccuracy, pad, gameOverTitle } from './format.js';

const CONTROLS = [
  ['MOUSE', 'LOOK'], ['RMB', 'SCOPE IN / OUT'], ['WHEEL', 'ZOOM'], ['LMB', 'FIRE'], ['R', 'RELOAD'],
  ['T', 'AMMO TYPE'], ['SHIFT', 'HOLD BREATH'], ['F', 'FOCUS (BULLET TIME)'], ['V', 'THERMAL'], ['ESC', 'PAUSE'],
];

/** Vertical menu of buttons with a selection cursor. */
class Menu {
  constructor(parent, ui, cls = 'menu') {
    this.root = el('div', cls, parent);
    this.ui = ui;
    this.items = [];
    this.btns = [];
    this.sel = 0;
  }

  set(items) {
    this.items = items;
    this.root.textContent = '';
    this.btns = items.map((it, i) => {
      const b = el('button', 'mi', this.root, it.label);
      if (it.note) el('span', 'note', b, it.note);
      if (it.disabled) b.disabled = true;
      b.addEventListener('mouseenter', () => this.select(i, true));
      b.addEventListener('click', () => this.activate(i));
      return b;
    });
    this.sel = Math.max(0, items.findIndex((it) => !it.disabled));
    this.select(this.sel, false);
  }

  select(i, sound) {
    if (!this.btns.length || (this.items[i] && this.items[i].disabled)) return;
    if (sound && i !== this.sel) this.ui('hover');
    this.btns.forEach((b, j) => b.classList.toggle('sel', j === i));
    this.sel = i;
  }

  move(d) {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const j = (this.sel + d * k + n * 4) % n;
      if (!this.items[j].disabled) {
        this.select(j, true);
        return;
      }
    }
  }

  activate(i = this.sel) {
    const it = this.items[i];
    if (!it || it.disabled) return;
    this.ui('click');
    it.run();
  }

  key(e) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') this.move(-1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') this.move(1);
    else if (k === 'Enter' || k === ' ') this.activate();
    else return false;
    return true;
  }
}

export class Screens {
  constructor(parent, fire, ui, getSettings, setSetting) {
    this.fire = fire;
    this.ui = ui;
    this.getSettings = getSettings;
    this.setSetting = setSetting;
    this.active = null; // 'title' | 'pause' | 'settings' | 'over' | 'credits'
    this.back = null;

    // ---- title
    const T = (this.title = el('div', 'scr title', parent));
    this.titleCanvas = el('canvas', 'title-bg', T);
    this.art = new TitleArt(this.titleCanvas);
    el('div', 'title-shade', T);
    const scan = el('div', 'scan', T);
    scan.style.opacity = '0.55';
    el('div', 'vign', T);
    const col = el('div', 'title-col', T);
    this.logoBox = el('div', '', col);
    this.logo = null;
    el('div', 'tagline', col, 'HOLD THE TOWER. COUNT YOUR ROUNDS.');
    this.titleMenu = new Menu(col, ui);
    el('div', 'press', col, 'ENTER TO SELECT');
    this.best = el('div', 'best', col, '');
    const cr = el('div', 'credits', T);
    cr.innerHTML = 'ANIMATIONS: <b>QUATERNIUS</b> — UNIVERSAL ANIMATION LIBRARY (CC0)<br>'
      + 'SOUND, MUSIC AND ART SYNTHESISED IN CODE · BUILT WITH THREE.JS';

    // ---- credits window (over the title)
    const C = (this.credits = el('div', 'scr', parent));
    el('div', 'dimbg', C);
    el('div', 'scan', C);
    const cw = el('div', 'win pn', C);
    el('h1', '', cw, 'CREDITS');
    el('h2', '', cw, 'LAST LOOKOUT');
    const cl = el('div', 'stats', cw);
    for (const [k, v] of [
      ['ANIMATIONS', 'QUATERNIUS'], ['', 'UNIVERSAL ANIMATION LIBRARY (CC0)'], ['PHYSICS', 'RAGDOLL LAB XPBD ENGINE'],
      ['RENDERING', 'THREE.JS'], ['SOUND & MUSIC', 'WEB AUDIO, SYNTHESISED LIVE'], ['ART & FONT', 'GENERATED IN CODE'],
    ]) {
      el('span', 'k', cl, k);
      el('span', 'v', cl, v);
    }
    const cb = el('div', 'row-btns', cw);
    const cbk = el('button', 'btn sel', cb, 'BACK  [ESC]');
    cbk.addEventListener('click', () => this._back());

    // ---- pause
    const P = (this.pause = el('div', 'scr', parent));
    el('div', 'dimbg', P);
    el('div', 'scan', P);
    const pw = el('div', 'win pn', P);
    el('h1', '', pw, 'PAUSED');
    this.pauseSub = el('h2', '', pw, 'THE VALLEY WAITS');
    const pc = el('div', 'cols', pw);
    this.pauseMenu = new Menu(pc, ui);
    this.pauseKeys = el('div', 'keys', pc);
    this._fillKeys(CONTROLS);

    // ---- settings
    const S = (this.settings = el('div', 'scr', parent));
    el('div', 'dimbg', S);
    el('div', 'scan', S);
    const sw = el('div', 'win pn', S);
    el('h1', '', sw, 'SETTINGS');
    el('h2', '', sw, '↑ ↓ SELECT · ← → ADJUST · ESC BACK');
    this.setGrid = el('div', 'set', sw);
    this.setRows = SETTINGS.map((spec, i) => this._settingRow(spec, i));
    this.setSel = 0;
    const sb = el('div', 'row-btns', sw);
    const def = el('button', 'btn alt', sb, 'DEFAULTS');
    def.addEventListener('click', () => {
      ui('click');
      const d = mergeSettings({});
      for (const spec of SETTINGS) this.setSetting(spec.key, d[spec.key]);
      this._refreshSettings();
    });
    const bk = el('button', 'btn', sb, 'BACK  [ESC]');
    bk.addEventListener('click', () => this._back());

    // ---- game over
    const O = (this.over = el('div', 'scr', parent));
    const odim = el('div', 'dimbg', O);
    odim.style.background = 'radial-gradient(ellipse at center, rgba(40,6,2,.82), rgba(8,2,1,.94))';
    el('div', 'scan', O);
    const ow = el('div', 'win pn over alert', O);
    this.overStamp = el('div', 'stamp hide', ow, 'NEW BEST');
    this.overTitle = el('h1', '', ow, 'THE LOOKOUT HAS FALLEN');
    this.overSub = el('h2', '', ow, '');
    this.overStats = el('div', 'stats', ow);
    const ob = el('div', 'row-btns', ow);
    this.overBtns = [el('button', 'btn alt', ob, 'TITLE'), el('button', 'btn', ob, 'TRY AGAIN')];
    this.overBtns[0].addEventListener('click', () => { ui('click'); this.fire('onQuit'); });
    this.overBtns[1].addEventListener('click', () => { ui('click'); this.fire('onRestart'); });
    this.overBtns.forEach((b, i) => b.addEventListener('mouseenter', () => this._overSel(i, true)));
    this.overSel = 1;
  }

  _settingRow(spec, i) {
    const row = el('div', 'sl', this.setGrid);
    const k = el('div', 'k', row, spec.label);
    const ctl = el('div', 'ctl', row);
    const left = el('span', 'arr', ctl, '◀');
    let bar = null, opts = null;
    if (spec.type === 'range') bar = new SegBar(ctl);
    else {
      opts = el('div', 'opts', ctl);
      const choices = spec.type === 'bool' ? [false, true] : spec.options;
      opts._items = choices.map((c) => {
        const o = el('span', 'opt', opts, spec.type === 'bool' ? (c ? 'ON' : 'OFF') : String(c).toUpperCase());
        o._v = c;
        o.addEventListener('click', (e) => {
          e.stopPropagation();
          this._setSel(i);
          this._apply(spec, c);
        });
        return o;
      });
    }
    const right = el('span', 'arr', ctl, '▶');
    const v = el('div', 'v', row, '');
    const pick = (e) => {
      this._setSel(i);
      if (spec.type === 'range' && bar) {
        const r = bar.root.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        this._apply(spec, spec.min + f * (spec.max - spec.min));
      }
    };
    left.addEventListener('click', (e) => { e.stopPropagation(); this._setSel(i); this._step(spec, -1); });
    right.addEventListener('click', (e) => { e.stopPropagation(); this._setSel(i); this._step(spec, 1); });
    if (bar) {
      bar.root.addEventListener('pointerdown', (e) => {
        pick(e);
        const mv = (ev) => pick(ev);
        const up = () => {
          removeEventListener('pointermove', mv);
          removeEventListener('pointerup', up);
        };
        addEventListener('pointermove', mv);
        addEventListener('pointerup', up);
      });
    }
    k.addEventListener('click', () => {
      this._setSel(i);
      if (spec.type !== 'range') this._step(spec, 1);
    });
    for (const n of [k, ctl, v]) n.addEventListener('mouseenter', () => this._setSel(i, true));
    return { row, bar, opts, v, spec };
  }

  _setSel(i, sound) {
    if (sound && i !== this.setSel) this.ui('hover');
    this.setSel = i;
    this.setRows.forEach((r, j) => r.row.classList.toggle('sel', j === i));
  }

  _step(spec, dir) {
    const cur = this.getSettings()[spec.key];
    this._apply(spec, stepSetting(spec, cur, dir));
  }

  _apply(spec, v) {
    const cur = this.getSettings()[spec.key];
    this.setSetting(spec.key, v);
    if (this.getSettings()[spec.key] !== cur) this.ui('tick');
    this._refreshSettings();
  }

  _refreshSettings() {
    const vals = this.getSettings();
    for (const r of this.setRows) {
      const val = vals[r.spec.key];
      if (r.bar) r.bar.set(settingFraction(r.spec, val), true);
      if (r.opts) for (const o of r.opts._items) o.classList.toggle('on', o._v === val);
      r.v.textContent = r.spec.type === 'range' ? settingText(r.spec, val) : '';
    }
  }

  _show(name) {
    for (const n of ['title', 'pause', 'settings', 'over', 'credits']) this[n].classList.toggle('on', n === name);
    this.active = name;
    if (name === 'title' || (name === 'credits' && this.back === 'title') || (name === 'settings' && this.back === 'title')) {
      this.title.classList.add('on');
      this._artOn(true);
    } else this._artOn(false);
  }

  _artOn(on) {
    if (on) {
      if (typeof innerWidth === 'number') this.art.resize(innerWidth, innerHeight);
      this.art.render(0);
      this.art.start();
    } else this.art.stop();
  }

  resize(w, h, k = 1) {
    this.k = k;
    if (this.art.running) {
      this.art.resize(w, h);
      this.art.render(0);
    }
    if (this.logo) this._sizeLogo(w);
  }

  _sizeLogo(w) {
    const lw = this.logo.width;
    // the title column is zoomed by the UI scale: size the logo in its units
    const s = Math.max(1, Math.min(3, Math.floor((w * 0.5) / (lw * (this.k || 1)))));
    this.logo.style.width = `${lw * s}px`;
    this.logo.style.height = `${this.logo.height * s}px`;
  }

  showTitle(meta = {}) {
    if (!this.logo) {
      this.logo = drawLogo('LAST LOOKOUT', 4);
      this.logo.className = 'logo';
      this.logoBox.appendChild(this.logo);
      this._sizeLogo(typeof innerWidth === 'number' ? innerWidth : 1280);
    }
    const cont = meta.continueWave ?? (meta.canContinue ? meta.wave : null);
    this.titleMenu.set([
      { label: 'START RUN', note: 'THE TOWER', run: () => this.fire('onStart', { continue: false }) },
      { label: 'HOLDOUT', note: meta.holdoutBest ? `BEST ROUND ${pad(meta.holdoutBest)}` : 'ON FOOT · ENDLESS', run: () => this.fire('onStart', { mode: 'holdout' }) },
      { label: 'CONTINUE', note: cont ? `WAVE ${pad(cont)}` : 'NO SAVED RUN', disabled: !cont, run: () => this.fire('onStart', { continue: true }) },
      { label: 'SETTINGS', run: () => this.openSettings('title') },
      { label: 'CREDITS', run: () => this.openCredits() },
    ]);
    if (cont) this.titleMenu.select(2, false);
    const bw = meta.bestWave ?? (meta.best && meta.best.wave) ?? 0;
    const bs = meta.bestScore ?? (meta.best && meta.best.score) ?? 0;
    this.best.innerHTML = bw ? `BEST WAVE <b>${pad(bw)}</b> &nbsp;·&nbsp; BEST SCORE <b>${groupThousands(bs)}</b>` : 'NO RECORD YET · THE VALLEY IS WAITING';
    this.back = null;
    this._show('title');
  }

  /** The controls legend beside the pause menu (HOLDOUT has its own). */
  _fillKeys(list) {
    if (this._keysFor === list) return;
    this._keysFor = list;
    const keys = this.pauseKeys;
    keys.textContent = '';
    for (const [k, v] of list) {
      const kk = el('span', 'k', keys);
      el('span', 'key', kk, k);
      el('span', '', keys, v);
    }
  }

  showPause(meta = {}) {
    this._fillKeys(meta.controls || CONTROLS);
    this.pauseMenu.set([
      { label: 'RESUME', run: () => this.fire('onResume') },
      { label: 'SETTINGS', run: () => this.openSettings('pause') },
      { label: 'RESTART RUN', run: () => this.fire('onRestart') },
      { label: 'QUIT TO TITLE', run: () => this.fire('onQuit') },
    ]);
    const bits = [];
    if (meta.round) bits.push(`ROUND ${pad(meta.round)}`);
    if (meta.wave) bits.push(`WAVE ${pad(meta.wave)}`);
    if (meta.cash !== undefined) bits.push(formatCash(meta.cash));
    this.pauseSub.textContent = bits.length ? bits.join(' · ') : 'THE VALLEY WAITS';
    this.back = null;
    this._show('pause');
  }

  openSettings(from) {
    this.back = from || this.active || null;
    this._refreshSettings();
    this._setSel(0);
    this._show('settings');
  }

  openCredits() {
    this.back = 'title';
    this._show('credits');
  }

  _back() {
    this.ui('back');
    const b = this.back;
    this.back = null;
    if (b === 'title') this._show('title');
    else if (b === 'pause') this._show('pause');
    else this.hide();
  }

  showGameOver(stats = {}) {
    this.overTitle.textContent = gameOverTitle(stats);
    const wave = stats.wave ?? 0;
    this.overSub.textContent = stats.cause === 'gate' ? `OVERRUN ON WAVE ${pad(wave)}` : `KILLED IN THE CABIN ON WAVE ${pad(wave)}`;
    const acc = stats.accuracy !== undefined ? `${Math.round(stats.accuracy * 100)}%` : formatAccuracy(stats.hits, stats.shots);
    const best = stats.best || {};
    if (stats.mode === 'holdout') {
      // (HOLDOUT, on foot: rounds instead of waves, points instead of cash)
      this.overSub.textContent = `THE DEAD TOOK YOU ON ROUND ${pad(stats.round ?? 0)}`;
      const H = [
        ['ROUNDS SURVIVED', pad(stats.rounds ?? 0), stats.newBest],
        ['KILLS', groupThousands(stats.kills ?? 0)],
        ['HEADSHOTS', groupThousands(stats.headshots ?? 0)],
        ['POINTS EARNED', groupThousands(stats.earned ?? 0)],
        ['BARRICADES CLEARED', groupThousands(stats.doors ?? 0)],
        ['ACCURACY', acc],
        ['BEST', `ROUND ${pad(best.round ?? 0)}`],
      ];
      this.overStats.textContent = '';
      for (const [k, v, hi] of H) {
        el('span', 'k', this.overStats, k);
        el('span', 'v' + (hi ? ' hi' : ''), this.overStats, v);
      }
      this.overStamp.classList.toggle('hide', !stats.newBest);
      this._overSel(1, false);
      this.back = null;
      this._show('over');
      return;
    }
    const rows = [
      ['WAVE REACHED', pad(wave), stats.newBest],
      ['KILLS', groupThousands(stats.kills ?? 0)],
      ['HEADSHOTS', groupThousands(stats.headshots ?? 0)],
      ['LONGEST SHOT', stats.longest ? `${Math.round(stats.longest)} m` : '—'],
      ['ACCURACY', acc],
      ['CASH EARNED', formatCash(stats.cashEarned ?? stats.cash ?? 0)],
    ];
    if (stats.score !== undefined) rows.push(['SCORE', groupThousands(stats.score), stats.newBest]);
    if (best.wave !== undefined || best.score !== undefined) rows.push(['BEST', `WAVE ${pad(best.wave ?? 0)} · ${groupThousands(best.score ?? 0)}`]);
    this.overStats.textContent = '';
    for (const [k, v, hi] of rows) {
      el('span', 'k', this.overStats, k);
      el('span', 'v' + (hi ? ' hi' : ''), this.overStats, v);
    }
    this.overStamp.classList.toggle('hide', !stats.newBest);
    this._overSel(1, false);
    this.back = null;
    this._show('over');
  }

  _overSel(i, sound) {
    if (sound && i !== this.overSel) this.ui('hover');
    this.overSel = i;
    this.overBtns.forEach((b, j) => b.classList.toggle('sel', j === i));
  }

  hide() {
    for (const n of ['title', 'pause', 'settings', 'over', 'credits']) this[n].classList.remove('on');
    this.active = null;
    this.back = null;
    this._artOn(false);
  }

  /** Keyboard for the open screen; returns true when the key was used. */
  key(e) {
    const a = this.active;
    if (!a) return false;
    const k = e.key;
    if (a === 'title') return this.titleMenu.key(e);
    if (a === 'pause') return this.pauseMenu.key(e);
    if (a === 'credits') {
      if (k === 'Escape' || k === 'Enter' || k === 'Backspace' || k === ' ') this._back();
      return true;
    }
    if (a === 'settings') {
      const n = this.setRows.length;
      if (k === 'Escape' || k === 'Backspace') this._back();
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') this._setSel((this.setSel + n - 1) % n, true);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this._setSel((this.setSel + 1) % n, true);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this._step(this.setRows[this.setSel].spec, -1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this._step(this.setRows[this.setSel].spec, 1);
      else if (k === 'Enter' || k === ' ') {
        const spec = this.setRows[this.setSel].spec;
        if (spec.type !== 'range') this._step(spec, 1);
      } else return false;
      return true;
    }
    if (a === 'over') {
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this._overSel(0, true);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this._overSel(1, true);
      else if (k === 'Enter' || k === ' ') this.overBtns[this.overSel].click();
      else return false;
      return true;
    }
    return false;
  }
}
