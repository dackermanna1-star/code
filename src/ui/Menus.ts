import type { Game } from '../game/Game';
import type { GameMode } from '../game/Director';
import type { Settings, QualityName, Difficulty } from '../core/Settings';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function fmtTime(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump'],
  ['C', 'Crouch'],
  ['V / double-tap', 'Dodge'],
  ['Left mouse', 'Punch / swing (hold for a heavy blow)'],
  ['Right mouse', 'Block (tap just before a hit to parry)'],
  ['Q / middle mouse', 'Kick (look down to stomp)'],
  ['E', 'Pick up · grab people · use · drink'],
  ['F', 'Throw what you are holding'],
  ['G', 'Drop'],
  ['R', 'Rage (when adrenaline is full)'],
  ['Tab', 'Stats'],
  ['Esc / P', 'Pause'],
];

export interface EndSummary {
  won: boolean;
  mode: GameMode;
  time: number;
  wave: number;
  stats: Record<string, number>;
  newBest: boolean;
  best: string;
}

/** Title, pause, settings, controls and end-of-round screens. */
export class Menus {
  private root: HTMLDivElement;
  private title: HTMLDivElement;
  private pause: HTMLDivElement;
  private settings: HTMLDivElement;
  private controls: HTMLDivElement;
  private end: HTMLDivElement;
  private loading: HTMLDivElement;
  private notice: HTMLDivElement;
  private clickResume: HTMLDivElement;
  private records!: HTMLDivElement;
  private diffBtns: HTMLButtonElement[] = [];
  private back: 'title' | 'pause' = 'title';
  private settingsInputs: { key: keyof Settings; el: HTMLInputElement | HTMLSelectElement; out?: HTMLElement; fmt?: (v: number) => string }[] = [];

  constructor(
    private game: Game,
    parent: HTMLElement,
  ) {
    this.root = h('div', 'menus');
    parent.appendChild(this.root);
    this.title = this.buildTitle();
    this.pause = this.buildPause();
    this.settings = this.buildSettings();
    this.controls = this.buildControls();
    this.end = h('div', 'screen end-screen');
    this.loading = h('div', 'screen loading', '<div class="load-inner"><div class="load-bottle"></div><div class="load-text">SETTING UP THE BAR…</div></div>');
    this.notice = h('div', 'lock-notice');
    this.clickResume = h('div', 'screen click-resume', '<div class="cr-inner">CLICK TO FIGHT</div>');
    this.clickResume.addEventListener('click', () => this.game.resume());
    this.root.append(this.title, this.pause, this.settings, this.controls, this.end, this.clickResume, this.loading, this.notice);
    document.addEventListener('pointerlockerror', () => this.onLockError());
  }

  // ------------------------------------------------------------------ building
  private btn(label: string, cls: string, fn: () => void, sub?: string): HTMLButtonElement {
    const b = h('button', 'btn ' + cls, sub ? `<span>${label}</span><small>${sub}</small>` : `<span>${label}</span>`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.uiSound('click');
      fn();
    });
    b.addEventListener('mouseenter', () => this.game.uiSound('hover'));
    return b;
  }

  private buildTitle(): HTMLDivElement {
    const s = h('div', 'screen title-screen');
    const col = h('div', 'title-col');
    col.appendChild(
      h(
        'div',
        'logo-wrap',
        `<div class="logo-kicker">THE IRON HORSE · EST. 1962</div>
         <div class="logo"><span class="l1">LAST</span><span class="l2">CALL</span></div>
         <div class="logo-sub">One bar. Forty regulars. No rules.</div>`,
      ),
    );
    const menu = h('div', 'title-menu');
    menu.appendChild(this.btn('BRAWL', 'big', () => this.game.startMode('brawl'), 'Pick a fight. Be the last one standing.'));
    menu.appendChild(this.btn('SURVIVAL', 'big', () => this.game.startMode('survival'), 'Endless waves. How long can you last?'));
    const diff = h('div', 'diff-row', '<span class="diff-label">DIFFICULTY</span>');
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const b = h('button', 'chip', d.toUpperCase());
      b.dataset.v = d;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.uiSound('click');
        this.game.settings.set('difficulty', d);
        this.syncDifficulty();
      });
      this.diffBtns.push(b);
      diff.appendChild(b);
    }
    menu.appendChild(diff);
    const row = h('div', 'title-row');
    row.appendChild(this.btn('SETTINGS', 'small', () => this.openSettings('title')));
    row.appendChild(this.btn('CONTROLS', 'small', () => this.openControls('title')));
    menu.appendChild(row);
    col.appendChild(menu);
    this.records = h('div', 'records');
    col.appendChild(this.records);
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
      col.appendChild(h('div', 'title-warn', 'This game needs a mouse and keyboard.'));
    }
    s.appendChild(col);
    s.appendChild(h('div', 'title-foot', 'Inspired by <i>Paint the Town Red</i> · click a mode to start · mouse + keyboard'));
    this.syncDifficulty();
    return s;
  }

  private syncDifficulty(): void {
    const d = this.game.settings.value.difficulty;
    for (const b of this.diffBtns) b.classList.toggle('on', b.dataset.v === d);
  }

  private buildPause(): HTMLDivElement {
    const s = h('div', 'screen pause-screen');
    const box = h('div', 'panel');
    box.appendChild(h('div', 'panel-title', 'PAUSED'));
    box.appendChild(this.btn('RESUME', '', () => this.game.resume()));
    box.appendChild(this.btn('RESTART', '', () => this.game.restart()));
    box.appendChild(this.btn('SETTINGS', '', () => this.openSettings('pause')));
    box.appendChild(this.btn('CONTROLS', '', () => this.openControls('pause')));
    box.appendChild(this.btn('QUIT TO TITLE', 'dim', () => this.game.quitToTitle()));
    s.appendChild(box);
    return s;
  }

  private buildControls(): HTMLDivElement {
    const s = h('div', 'screen controls-screen');
    const box = h('div', 'panel wide');
    box.appendChild(h('div', 'panel-title', 'CONTROLS'));
    const grid = h('div', 'controls-grid');
    for (const [k, v] of CONTROLS) grid.appendChild(h('div', 'ctl-row', `<span class="ctl-key">${k}</span><span class="ctl-act">${v}</span>`));
    box.appendChild(grid);
    box.appendChild(
      h(
        'div',
        'ctl-tips',
        'Grab someone with <b>E</b>, then punch, knee or throw them — or look down at a table or the bar and punch to slam their face into it. Smash bottles over heads, hurl chairs, swing pool cues. Heavy blows knock people flat; stomp them while they are down. A heavy blow on a staggered, beaten enemy is a finisher. Parries open enemies up for brutal counters.',
      ),
    );
    box.appendChild(this.btn('BACK', '', () => this.closeSub()));
    s.appendChild(box);
    return s;
  }

  private buildSettings(): HTMLDivElement {
    const s = h('div', 'screen settings-screen');
    const box = h('div', 'panel wide');
    box.appendChild(h('div', 'panel-title', 'SETTINGS'));
    const grid = h('div', 'settings-grid');
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const row = h('label', 'set-row');
      row.appendChild(h('span', 'set-label', label));
      const inp = h('input');
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      const out = h('span', 'set-val');
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        this.game.settings.set(key, v as never);
        out.textContent = fmt(v);
      });
      row.append(inp, out);
      grid.appendChild(row);
      this.settingsInputs.push({ key, el: inp, out, fmt });
    };
    const toggle = (key: keyof Settings, label: string) => {
      const row = h('label', 'set-row toggle');
      row.appendChild(h('span', 'set-label', label));
      const inp = h('input');
      inp.type = 'checkbox';
      inp.addEventListener('change', () => this.game.settings.set(key, inp.checked as never));
      row.append(inp, h('span', 'set-check'));
      grid.appendChild(row);
      this.settingsInputs.push({ key, el: inp });
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    slider('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
    toggle('invertY', 'Invert mouse Y');
    slider('fov', 'Field of view', 65, 110, 1, (v) => `${v}°`);
    slider('master', 'Master volume', 0, 1, 0.01, pct);
    slider('music', 'Music volume', 0, 1, 0.01, pct);
    slider('sfx', 'Effects volume', 0, 1, 0.01, pct);
    slider('shake', 'Screen shake', 0, 1.5, 0.05, pct);
    slider('gore', 'Gore', 0, 2, 0.1, (v) => (v < 0.05 ? 'Off' : v < 0.75 ? 'Light' : v < 1.4 ? 'Normal' : 'Extra'));
    slider('crowd', 'Crowd size (next round)', 12, 48, 1, (v) => String(v));
    // quality select
    const qrow = h('label', 'set-row');
    qrow.appendChild(h('span', 'set-label', 'Graphics quality'));
    const sel = h('select');
    for (const q of ['low', 'medium', 'high'] as QualityName[]) {
      const o = h('option');
      o.value = q;
      o.textContent = q[0].toUpperCase() + q.slice(1);
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => this.game.settings.set('quality', sel.value as QualityName));
    qrow.appendChild(sel);
    grid.appendChild(qrow);
    this.settingsInputs.push({ key: 'quality', el: sel });
    toggle('showFps', 'Show FPS');
    toggle('hints', 'Show tips');
    box.appendChild(grid);
    box.appendChild(this.btn('BACK', '', () => this.closeSub()));
    s.appendChild(box);
    return s;
  }

  private syncSettings(): void {
    const v = this.game.settings.value;
    for (const si of this.settingsInputs) {
      const val = v[si.key];
      if (si.el instanceof HTMLInputElement && si.el.type === 'checkbox') si.el.checked = !!val;
      else si.el.value = String(val);
      if (si.out && si.fmt) si.out.textContent = si.fmt(Number(val));
    }
  }

  // ------------------------------------------------------------------ screens
  private hideAll(): void {
    for (const s of [this.title, this.pause, this.settings, this.controls, this.end, this.clickResume]) s.classList.remove('show');
  }

  showTitle(): void {
    this.hideAll();
    const r = this.game.records;
    const b = r.get('brawl');
    const sv = r.get('survival');
    const parts: string[] = [];
    if (b.bestTime) parts.push(`BEST BRAWL <b>${fmtTime(b.bestTime)}</b>`);
    if (b.wins) parts.push(`WINS <b>${b.wins}</b>`);
    if (sv.bestWave) parts.push(`BEST WAVE <b>${sv.bestWave}</b>`);
    this.records.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    this.syncDifficulty();
    this.title.classList.add('show');
  }

  showPause(): void {
    this.hideAll();
    this.pause.classList.add('show');
  }

  showClickToResume(): void {
    this.hideAll();
    this.clickResume.classList.add('show');
  }

  hide(): void {
    this.hideAll();
  }

  showLoading(on: boolean): void {
    this.loading.classList.toggle('show', on);
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.back = from;
    this.hideAll();
    this.syncSettings();
    this.settings.classList.add('show');
  }

  private openControls(from: 'title' | 'pause'): void {
    this.back = from;
    this.hideAll();
    this.controls.classList.add('show');
  }

  private closeSub(): void {
    if (this.back === 'pause' && this.game.state === 'paused') this.showPause();
    else this.showTitle();
  }

  /** Esc while in a sub-menu goes back one level. */
  handleEscape(): boolean {
    if (this.settings.classList.contains('show') || this.controls.classList.contains('show')) {
      this.closeSub();
      return true;
    }
    return false;
  }

  showEnd(sum: EndSummary): void {
    this.hideAll();
    const st = sum.stats;
    const acc = st.punches > 0 ? Math.round((st.hits / Math.max(1, st.punches)) * 100) : 0;
    const score = Math.max(
      0,
      Math.round(
        st.kills * 100 +
          st.headExplosions * 60 +
          st.decapitations * 60 +
          st.bestCombo * 25 +
          st.parries * 30 +
          st.objectsBroken * 5 +
          (sum.mode === 'survival' ? sum.wave * 500 : sum.won ? 1500 + Math.max(0, 600 - sum.time) * 3 : 0) -
          st.damageTaken * 0.8,
      ),
    );
    const grade = score >= 6500 ? 'S' : score >= 4800 ? 'A' : score >= 3200 ? 'B' : score >= 1800 ? 'C' : 'D';
    let head: string;
    let sub: string;
    if (sum.mode === 'brawl') {
      head = sum.won ? 'LAST ONE STANDING' : 'YOU GOT WRECKED';
      sub = sum.won ? `The Iron Horse is closed for repairs. Cleared in ${fmtTime(sum.time)}.` : `Lasted ${fmtTime(sum.time)} · ${st.kills} knocked out`;
    } else {
      head = `WAVE ${sum.wave}`;
      sub = `You lasted ${fmtTime(sum.time)} and put ${st.kills} people through the floor.`;
    }
    const rows: [string, string | number][] = [
      ['Knockouts', st.kills],
      ['Hits landed', st.hits],
      ['Accuracy', `${acc}%`],
      ['Best combo', st.bestCombo],
      ['Parries', st.parries],
      ['Heads popped', st.headExplosions],
      ['Decapitations', st.decapitations],
      ['Things thrown', st.thrown],
      ['Things smashed', st.objectsBroken],
      ['Damage dealt', Math.round(st.damageDealt)],
      ['Damage taken', Math.round(st.damageTaken)],
      ['Score', score],
    ];
    this.end.innerHTML = '';
    const box = h('div', 'end-box');
    box.appendChild(h('div', 'end-kicker', sum.mode === 'brawl' ? 'BRAWL' : 'SURVIVAL'));
    box.appendChild(h('div', 'end-head ' + (sum.won ? 'won' : 'lost'), head));
    box.appendChild(h('div', 'end-sub', sub));
    const mid = h('div', 'end-mid');
    mid.appendChild(h('div', 'end-grade grade-' + grade, `<span>${grade}</span><small>RANK</small>`));
    const grid = h('div', 'end-stats');
    for (const [k, v] of rows) grid.appendChild(h('div', 'es-row', `<span>${k}</span><b>${v}</b>`));
    mid.appendChild(grid);
    box.appendChild(mid);
    if (sum.newBest) box.appendChild(h('div', 'end-best new', `NEW BEST · ${sum.best}`));
    else if (sum.best) box.appendChild(h('div', 'end-best', `BEST · ${sum.best}`));
    const btns = h('div', 'end-btns');
    btns.appendChild(this.btn('AGAIN', 'big-ish', () => this.game.restart()));
    const other: GameMode = sum.mode === 'brawl' ? 'survival' : 'brawl';
    btns.appendChild(this.btn(other === 'brawl' ? 'TRY BRAWL' : 'TRY SURVIVAL', '', () => this.game.startMode(other, true)));
    btns.appendChild(this.btn('TITLE', 'dim', () => this.game.quitToTitle()));
    box.appendChild(btns);
    this.end.appendChild(box);
    this.end.classList.add('show');
  }

  // ------------------------------------------------------------------ pointer lock problems
  private onLockError(): void {
    this.game.onPointerLockUnavailable();
  }

  showNotice(html: string, ms = 6000): void {
    this.notice.innerHTML = html;
    this.notice.classList.add('show');
    clearTimeout((this.notice as any)._t);
    (this.notice as any)._t = setTimeout(() => this.notice.classList.remove('show'), ms);
  }
}
