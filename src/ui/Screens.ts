// Menus and full-screen states: title, how-to-play, options, pause, game over,
// victory; plus the level splash, the transient message lines and the FPS
// counter. Keyboard (arrows/WASD + Enter/Space, Esc back) and mouse navigable.
//
// Looks follow the original (py-sealhunter menu.py / levels.py / field.py):
// kinifed "SealHunter" logo in (110,0,0) with a 3-step (20,20,20) shadow,
// Kroftsmann menu items (inactive (50,50,50), active (0,100,0)) on a
// translucent pane, Trebuchet bold level splash, dark-red message lines.
import { ENEMIES, type EnemyType } from '../config/enemies';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { designLayer, h, storageGet, storageSet } from './dom';
import type { ViewMode } from '../config/firstPerson';

export interface GameStats {
  timeSec: number;
  level: number;
  levelName: string;
  kills: number;
  killsByType: Partial<Record<EnemyType, number>>;
  moneyEarned: number;
  moneyLeft: number;
  shots: number;
  hits: number;
  headshots: number;
  niceShots: number;
  bestNiceShot: number;
  weaponsBought: WeaponId[];
  favoriteWeapon: WeaponId | null;
}

export interface Options {
  masterVolume: number;
  sfxVolume: number;
  ambience: boolean;
  blood: 'low' | 'normal' | 'max';
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  /** Camera: classic fixed view or first person. */
  view: ViewMode;
  /** HUD look: the new minimal style or the original 2005 HUD. */
  hudStyle: 'modern' | 'classic';
  /** First-person mouse/stick sensitivity multiplier (0.25..3). */
  mouseSensitivity: number;
  invertY: boolean;
}

export interface HighScore {
  kills: number;
  money: number;
  level: number;
  levelName: string;
  timeSec: number;
  victory: boolean;
  date: number;
}

export const DEFAULT_OPTIONS: Readonly<Options> = {
  masterVolume: 0.8,
  sfxVolume: 1,
  ambience: true,
  blood: 'normal',
  quality: 'high',
  showFps: false,
  view: 'third',
  hudStyle: 'modern',
  mouseSensitivity: 1,
  invertY: false,
};

const OPTIONS_KEY = 'sealhunter3d.options';
const SCORES_KEY = 'sealhunter3d.highscores';
const MAX_SCORES = 10;
const SHOWN_SCORES = 5;
/** Ignore activation keys this long after a screen opens (held fire keys). */
const ACTIVATE_GRACE_MS = 280;
/** field.py: messages scroll away every 2 s, one 16-px line per 16 ticks. */
const MESSAGE_HOLD_MS = 2000;
const MESSAGE_LINE = 16.3;
const MESSAGE_SCROLL_MS = 326;
const MAX_MESSAGES = 10;

const FRESH_START = new Set(['pause', 'gameover', 'victory']);
const ENEMY_ORDER: EnemyType[] = ['seal', 'activist', 'cub', 'penguin', 'fatseal', 'bear', 'turtle', 'walrus'];

interface Ctl {
  el: HTMLElement;
  activate?: () => void;
  adjust?: (dir: -1 | 1) => void;
}

interface ScreenState {
  name: string;
  root: HTMLElement;
  ctls: Ctl[];
  index: number;
  horizontal: boolean;
  back: (() => void) | null;
  openedAt: number;
  /** Activation keys are ignored until this time (held fire keys). */
  activateAfter: number;
}

const NBSP = '\u00a0';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function loadOptions(): Options {
  const o: Options = { ...DEFAULT_OPTIONS };
  const raw = storageGet<Partial<Options>>(OPTIONS_KEY);
  if (raw && typeof raw === 'object') {
    if (typeof raw.masterVolume === 'number' && isFinite(raw.masterVolume)) o.masterVolume = clamp01(raw.masterVolume);
    if (typeof raw.sfxVolume === 'number' && isFinite(raw.sfxVolume)) o.sfxVolume = clamp01(raw.sfxVolume);
    if (typeof raw.ambience === 'boolean') o.ambience = raw.ambience;
    if (raw.blood === 'low' || raw.blood === 'normal' || raw.blood === 'max') o.blood = raw.blood;
    if (raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') o.quality = raw.quality;
    if (typeof raw.showFps === 'boolean') o.showFps = raw.showFps;
  }
  return o;
}

function loadScores(): HighScore[] {
  const raw = storageGet<HighScore[]>(SCORES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s.kills === 'number' && typeof s.money === 'number');
}

const byScore = (a: HighScore, b: HighScore) => b.kills - a.kills || b.money - a.money || a.timeSec - b.timeSec;

export class Screens {
  /** Current options (loaded from localStorage, mutated in place on change). */
  readonly options: Options;
  onOptionsChange: ((o: Options) => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly splash: HTMLDivElement;
  private readonly msgs: HTMLDivElement;
  private readonly msgList: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private cur: ScreenState | null = null;
  private readonly selected = new Map<string, number>();
  private splashAnim: Animation | null = null;
  private splashTimer = 0;
  private msgTimer = 0;
  private msgScrolling = false;
  private fpsShown: number | null = null;
  private navigating = false;
  private readonly recorded = new WeakMap<GameStats, number>();

  constructor(view: HTMLElement) {
    this.options = loadOptions();
    this.root = designLayer(view, 'sh-screens');

    this.msgs = h('div', 'sh-msgs');
    this.msgList = h('div', 'sh-msgs-list');
    this.msgs.appendChild(this.msgList);
    this.splash = h('div', 'sh-splash');
    this.fps = h('div', 'sh-fps');
    this.fps.style.display = 'none';
    this.root.append(this.msgs, this.splash, this.fps);

    window.addEventListener('keydown', this.onKey, true);
  }

  get isMenuOpen(): boolean {
    return this.cur !== null;
  }

  // ------------------------------------------------------------ public API

  showTitle(hd: { onStart(view?: ViewMode): void }): void {
    const reopen = () => this.showTitle(hd);
    const root = h('div', 'sh-screen sh-title');
    root.appendChild(h('div', 'sh-vignette'));
    root.appendChild(h('div', 'sh-logo', 'SealHunter'));
    root.appendChild(h('div', 'sh-logo-sub', '3D remake of the 2005 original'));

    const menu = this.buildMenu('-- Main menu --', [
      ['Start game', () => { this.closeScreen(); hd.onStart(); }],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
    ]);
    menu.el.style.left = '414px';
    menu.el.style.top = '240px';
    root.appendChild(menu.el);

    const best = loadScores().sort(byScore)[0];
    if (best) {
      const b = h('div', 'sh-best');
      b.textContent = `Best hunt: ${fmt(best.kills)} kills · $${fmt(best.money)} · level ${best.level}`;
      b.style.left = '404px';
      b.style.top = '388px';
      root.appendChild(b);
    }
    root.appendChild(h('div', 'sh-hint', '↑ ↓ / W S to choose · Enter to select · or use the mouse'));
    this.openScreen('title', root, menu.ctls, { back: null });
  }

  /** Level splash: fades in ~1 s and out ~1 s (levels.py LevelSplash). Non-blocking. */
  showSplash(text: string, ms = 2080): void {
    const total = Math.max(200, ms);
    const fade = Math.min(1040, total / 2);
    this.splashAnim?.cancel();
    window.clearTimeout(this.splashTimer);
    this.splash.textContent = text;
    this.splash.style.display = '';
    if (typeof this.splash.animate === 'function') {
      this.splash.style.opacity = '0';
      this.splashAnim = this.splash.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: fade / total },
          { opacity: 1, offset: 1 - fade / total },
          { opacity: 0, offset: 1 },
        ],
        { duration: total, easing: 'linear', fill: 'forwards' },
      );
    } else {
      this.splash.style.opacity = '1';
    }
    this.splashTimer = window.setTimeout(() => this.hideSplash(), total + 30);
  }

  showPause(hd: { onResume(): void; onRestart(): void; onQuit(): void }): void {
    const reopen = () => this.showPause(hd);
    const resume = () => { this.closeScreen(); hd.onResume(); };
    const root = h('div', 'sh-screen sh-dim');
    const title = h('div', 'sh-h1', 'PAUSED');
    Object.assign(title.style, { position: 'absolute', left: '0', right: '0', top: '96px', textAlign: 'center', fontSize: '46px' });
    root.appendChild(title);
    const items: Array<[string, () => void]> = [
      ['Resume', resume],
      ['Restart', () => { this.closeScreen(); hd.onRestart(); }],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Quit to title', () => { this.closeScreen(); hd.onQuit(); }],
    ];
    const menu = this.buildMenu('', items);
    menu.el.style.left = '217px';
    menu.el.style.top = '150px';
    root.appendChild(menu.el);
    root.appendChild(h('div', 'sh-hint', 'Esc / P to resume'));
    this.openScreen('pause', root, menu.ctls, { back: resume });
  }

  showGameOver(reason: string, stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    const root = h('div', 'sh-screen sh-dim');
    const title = h('div', 'sh-go-title', 'GAME OVER');
    title.style.top = '64px';
    const why = h('div', 'sh-go-reason', reason);
    why.style.top = '123px';
    root.append(title, why);
    const ctls = this.buildResults(root, stats, false, hd);
    this.openScreen('gameover', root, ctls, { back: null, horizontal: true });
  }

  showVictory(stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    const root = h('div', 'sh-screen sh-dim');
    const head = h('div', 'sh-go-head', 'The last seal on the planet is dead.');
    head.style.top = '78px';
    const sub = h('div', 'sh-go-reason', `You cleared every level in ${fmtTime(stats.timeSec)}.`);
    sub.style.top = '116px';
    root.append(head, sub);
    const ctls = this.buildResults(root, stats, true, hd);
    this.openScreen('victory', root, ctls, { back: null, horizontal: true });
  }

  /** How-to-play screen. `onBack` defaults to closing the menu. */
  showHelp(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const root = h('div', 'sh-screen sh-dim');
    const panel = h('div', 'sh-panel');
    panel.classList.add('sh-help');
    Object.assign(panel.style, { left: '26px', top: '12px', width: '588px', height: '456px', padding: '12px 18px 10px' });
    root.appendChild(panel);

    panel.appendChild(h('div', 'sh-h1', 'HOW TO PLAY'));
    panel.appendChild(h('div', 'sh-h2', 'Goal'));
    panel.appendChild(
      h(
        'p',
        'sh-p',
        'Animals pour onto the ice floe from the left. Shoot them before they get across: if a single one ' +
          'reaches the right edge, the game is over. Kills pay a bounty, headshots pay extra and three or more ' +
          'kills with one bullet is a nice shot. Buy bigger guns in the top bar. Every level ends with a boss.',
      ),
    );

    panel.appendChild(h('div', 'sh-h2', 'Controls'));
    const kv = h('div', 'sh-kv');
    const keys = (...ks: string[]) => {
      const span = h('span');
      ks.forEach((k, i) => {
        if (i) span.appendChild(document.createTextNode(' '));
        span.appendChild(k === '–' ? document.createTextNode(k) : h('span', 'sh-key', k));
      });
      return span;
    };
    const row = (label: string, ctl: HTMLElement, note = '') => {
      kv.appendChild(h('div', 'k', label));
      const v = h('div', 'v');
      v.appendChild(ctl);
      if (note) v.appendChild(document.createTextNode(`  ${note}`));
      kv.appendChild(v);
    };
    row('Move', keys('W', 'A', 'S', 'D'), 'or the arrow keys');
    row('Fire', keys('Space', 'Ctrl', 'Left mouse'), 'hold for automatic fire');
    row('Reload', keys('R'));
    row('Buy best weapon', keys('B', 'Enter'), 'the most expensive one you can afford');
    row('Select or buy', keys('1', '–', '9', '0'), 'or click a slot in the top bar');
    row('Cycle weapons', keys('Q', 'Tab'));
    row('Jump', keys('E', 'Shift'), 'stomp crawling seals — or just walk into them to kick');
    row('Pause', keys('P', 'Esc'));
    panel.appendChild(kv);

    panel.appendChild(h('div', 'sh-h2', 'Enemies'));
    const foes = h('div', 'sh-foes');
    const foe = (t: EnemyType, text: string) => {
      const d = h('div');
      d.appendChild(h('b', '', ENEMIES[t].name));
      d.appendChild(document.createTextNode(` — ${text}`));
      foes.appendChild(d);
    };
    foe('seal', '$50. Crawls on when wounded: kick or stomp it.');
    foe('activist', '$100. Shoot the cub from his arms and he flees.');
    foe('cub', '$25. Slow; stops to sniff. Knocks you over.');
    foe('penguin', '$100. Waddles, then belly-slides around.');
    foe('fatseal', '$200. Stops to regenerate. Bowls you over.');
    foe('bear', '$500. The more you hurt it, the faster it runs.');
    foe('turtle', '$500. Bullets bounce off the shell. Aim low.');
    foe('walrus', 'Final boss. Sharpens its tusks, then charges.');
    panel.appendChild(foes);
    panel.appendChild(h('div', 'sh-h2', 'Bosses'));
    panel.appendChild(
      h(
        'p',
        'sh-p',
        'Fat seal · penguin flock · polar bear · turtle · walrus … and then the last seal on the planet.',
      ),
    );

    const btn = h('div', 'sh-btn', 'Back');
    panel.appendChild(btn);
    this.openScreen('help', root, [{ el: btn, activate: back }], { back });
  }

  /** Options screen. `onBack` defaults to closing the menu. */
  showOptions(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const o = this.options;
    const root = h('div', 'sh-screen sh-dim');
    const panel = h('div', 'sh-panel');
    Object.assign(panel.style, { left: '135px', top: '84px', width: '370px', padding: '14px 16px 14px' });
    root.appendChild(panel);
    const title = h('div', 'sh-h1', 'OPTIONS');
    title.style.marginBottom = '10px';
    panel.appendChild(title);

    const ctls: Ctl[] = [];
    const changed = () => {
      storageSet(OPTIONS_KEY, o);
      this.onOptionsChange?.({ ...o });
    };

    const sliderRow = (label: string, get: () => number, set: (v: number) => void) => {
      const row = h('div', 'sh-opt');
      row.appendChild(h('div', 'sh-opt-label', label));
      const ctl = h('div', 'sh-opt-ctl');
      const slider = h('div', 'sh-slider');
      const fill = h('div', 'sh-slider-fill');
      const knob = h('div', 'sh-slider-knob');
      slider.append(fill, knob);
      const val = h('div', 'sh-opt-val');
      ctl.append(slider, val);
      row.appendChild(ctl);
      const paint = () => {
        const v = get();
        fill.style.width = `${v * 100}%`;
        knob.style.left = `${v * 100}%`;
        val.textContent = `${Math.round(v * 100)}%`;
      };
      const put = (v: number) => {
        const q = Math.round(clamp01(v) * 20) / 20;
        if (q === get()) return;
        set(q);
        paint();
        changed();
      };
      const fromPointer = (e: PointerEvent) => {
        const r = slider.getBoundingClientRect();
        if (r.width > 0) put((e.clientX - r.left) / r.width);
      };
      slider.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        slider.setPointerCapture?.(e.pointerId);
        fromPointer(e);
      });
      slider.addEventListener('pointermove', (e) => {
        if (slider.hasPointerCapture?.(e.pointerId)) fromPointer(e);
      });
      paint();
      panel.appendChild(row);
      ctls.push({ el: row, adjust: (d) => put(get() + d * 0.1) });
    };

    const choiceRow = <T>(label: string, values: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
      const row = h('div', 'sh-opt');
      row.appendChild(h('div', 'sh-opt-label', label));
      const ctl = h('div', 'sh-opt-ctl');
      const choice = h('div', 'sh-choice');
      ctl.appendChild(choice);
      row.appendChild(ctl);
      const paint = () => {
        const cur = values.find(([v]) => v === get());
        choice.textContent = cur ? cur[1] : String(get());
      };
      const step = (d: -1 | 1) => {
        const i = Math.max(0, values.findIndex(([v]) => v === get()));
        set(values[(i + d + values.length) % values.length][0]);
        paint();
        changed();
      };
      choice.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = choice.getBoundingClientRect();
        step(e.clientX < r.left + r.width * 0.3 ? -1 : 1);
      });
      paint();
      panel.appendChild(row);
      ctls.push({ el: row, adjust: step, activate: () => step(1) });
    };

    sliderRow('Master volume', () => o.masterVolume, (v) => (o.masterVolume = v));
    sliderRow('Effects volume', () => o.sfxVolume, (v) => (o.sfxVolume = v));
    choiceRow<boolean>('Ambience (wind, sea)', [[true, 'On'], [false, 'Off']], () => o.ambience, (v) => (o.ambience = v));
    choiceRow<Options['blood']>('Blood', [['low', 'Low'], ['normal', 'Normal'], ['max', 'Max']], () => o.blood, (v) => (o.blood = v));
    choiceRow<Options['quality']>('Graphics quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => o.quality, (v) => (o.quality = v));
    choiceRow<boolean>('Show FPS', [[false, 'Off'], [true, 'On']], () => o.showFps, (v) => (o.showFps = v));

    const backRow = h('div', 'sh-opt');
    backRow.style.marginTop = '8px';
    backRow.appendChild(h('div', 'sh-opt-label', '← Back'));
    panel.appendChild(backRow);
    ctls.push({ el: backRow, activate: back });

    const hint = h('div', 'sh-hint', '↑ ↓ choose · ← → change · Esc back');
    root.appendChild(hint);
    this.openScreen('options', root, ctls, { back });
  }

  /** Transient message line (field.py: dark red, under the HUD, scrolls away after ~2 s). */
  message(text: string): void {
    const line = h('div', 'sh-msg', text);
    const wasEmpty = this.msgList.childElementCount === 0;
    this.msgList.appendChild(line);
    while (this.msgList.childElementCount > MAX_MESSAGES) this.msgList.firstElementChild?.remove();
    if (wasEmpty && !this.msgScrolling) {
      window.clearTimeout(this.msgTimer);
      this.msgTimer = window.setTimeout(this.scrollMessages, MESSAGE_HOLD_MS);
    }
  }

  setFps(fps: number | null): void {
    const v = fps === null || !isFinite(fps) ? null : Math.round(fps);
    if (v === this.fpsShown) return;
    this.fpsShown = v;
    if (v === null) this.fps.style.display = 'none';
    else {
      this.fps.style.display = '';
      this.fps.textContent = `FPS: ${v}`;
    }
  }

  hideAll(): void {
    this.closeScreen();
    this.hideSplash();
    window.clearTimeout(this.msgTimer);
    this.msgScrolling = false;
    this.msgList.getAnimations?.().forEach((a) => a.cancel());
    this.msgList.replaceChildren();
  }

  /** Saved high scores, best first. */
  highScores(): HighScore[] {
    return loadScores().sort(byScore);
  }

  // ------------------------------------------------------------- internals

  /** Run an internal menu-to-menu navigation (no activation grace period). */
  private nav(fn: () => void): void {
    this.navigating = true;
    try {
      fn();
    } finally {
      this.navigating = false;
    }
  }

  private hideSplash(): void {
    window.clearTimeout(this.splashTimer);
    this.splashAnim?.cancel();
    this.splashAnim = null;
    this.splash.style.opacity = '0';
    this.splash.style.display = 'none';
  }

  private scrollMessages = (): void => {
    const first = this.msgList.firstElementChild;
    if (!first) {
      this.msgScrolling = false;
      return;
    }
    this.msgScrolling = true;
    const done = () => {
      first.remove();
      this.msgList.style.transform = '';
      this.msgScrolling = false;
      if (this.msgList.childElementCount > 0) {
        this.msgTimer = window.setTimeout(this.scrollMessages, MESSAGE_HOLD_MS - MESSAGE_SCROLL_MS);
      }
    };
    if (typeof this.msgList.animate === 'function') {
      const a = this.msgList.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(-${MESSAGE_LINE}px)` }],
        { duration: MESSAGE_SCROLL_MS, easing: 'linear' },
      );
      a.onfinish = done;
      a.oncancel = () => {
        this.msgScrolling = false;
      };
    } else done();
  };

  private buildMenu(caption: string, items: Array<[string, () => void]>): { el: HTMLDivElement; ctls: Ctl[] } {
    const el = h('div', 'sh-menu');
    if (caption) el.appendChild(h('div', 'sh-menu-cap', caption));
    const pane = h('div', 'sh-menu-pane');
    el.appendChild(pane);
    const ctls: Ctl[] = items.map(([label, action]) => {
      const mi = h('div', 'sh-mi', label);
      pane.appendChild(mi);
      return { el: mi, activate: action };
    });
    return { el, ctls };
  }

  private buildResults(
    root: HTMLElement,
    s: GameStats,
    victory: boolean,
    hd: { onRetry(): void; onTitle(): void },
  ): Ctl[] {
    const rank = this.record(s, victory);

    // Stats.
    const left = h('div', 'sh-panel');
    Object.assign(left.style, { left: '30px', top: '145px', width: '330px', height: '264px', padding: '9px 14px' });
    const lh = h('div', 'sh-h2', 'This hunt');
    lh.style.marginTop = '0';
    left.appendChild(lh);
    const grid = h('div', 'sh-stats');
    const add = (k: string, v: string, sub?: string) => {
      grid.appendChild(h('div', 'k', k));
      grid.appendChild(h('div', 'v', v));
      if (sub) grid.appendChild(h('div', 'sub', sub));
    };
    add('Time', fmtTime(s.timeSec));
    const lvlName = s.levelName && s.levelName !== `Level ${s.level}` ? ` — ${s.levelName}` : '';
    add('Level reached', `${s.level}${lvlName}`);
    const breakdown = ENEMY_ORDER.filter((t) => (s.killsByType[t] ?? 0) > 0)
      .map((t) => `${ENEMIES[t].name} ${fmt(s.killsByType[t] ?? 0)}`.replace(/ /g, NBSP))
      .join(' · ');
    add('Kills', fmt(s.kills), breakdown || undefined);
    add('Money earned', `$${fmt(s.moneyEarned)}`, `$${fmt(s.moneyLeft)} left unspent`);
    const acc = s.shots > 0 ? Math.min(100, Math.round((100 * s.hits) / s.shots)) : 0;
    add('Accuracy', s.shots > 0 ? `${acc}%` : '—', s.shots > 0 ? `${fmt(s.hits)} hits from ${fmt(s.shots)} shots` : undefined);
    add('Headshots', fmt(s.headshots));
    add('Nice shots', fmt(s.niceShots), s.bestNiceShot > 0 ? `best: ${s.bestNiceShot} kills with one shot` : undefined);
    const bought = s.weaponsBought.filter((w) => WEAPONS[w]).map((w) => WEAPONS[w].name.replace(/ /g, NBSP));
    add('Weapons bought', String(bought.length), bought.length ? bought.join(', ') : undefined);
    add('Favourite weapon', s.favoriteWeapon && WEAPONS[s.favoriteWeapon] ? WEAPONS[s.favoriteWeapon].name : '—');
    left.appendChild(grid);
    root.appendChild(left);

    // High scores.
    const right = h('div', 'sh-panel');
    Object.assign(right.style, { left: '372px', top: '145px', width: '238px', height: '264px', padding: '9px 12px' });
    const rh = h('div', 'sh-h2', 'Best hunts');
    rh.style.marginTop = '0';
    right.appendChild(rh);
    const table = h('table', 'sh-hs');
    const head = h('tr');
    for (const [t, r] of [['#', false], ['Kills', true], ['Money', true], ['Lvl', true], ['Time', true]] as const) {
      const td = h('td', r ? 'r' : '', t);
      td.style.color = '#a9bad3';
      head.appendChild(td);
    }
    table.appendChild(head);
    const scores = loadScores().sort(byScore).slice(0, SHOWN_SCORES);
    for (let i = 0; i < SHOWN_SCORES; i++) {
      const sc = scores[i];
      const tr = h('tr', sc ? (i === rank ? 'sh-new' : '') : 'sh-empty');
      const cells = sc
        ? [`${i + 1}.`, fmt(sc.kills), `$${fmt(sc.money)}`, sc.victory ? '★' : String(sc.level), fmtTime(sc.timeSec)]
        : [`${i + 1}.`, '—', '', '', ''];
      cells.forEach((c, j) => tr.appendChild(h('td', j ? 'r' : '', c)));
      table.appendChild(tr);
    }
    right.appendChild(table);
    const note = h('p', 'sh-p');
    note.style.marginTop = '10px';
    note.style.fontSize = '10.5px';
    note.style.color = '#c4cfde';
    note.textContent =
      rank >= 0
        ? `New entry at #${rank + 1}!`
        : 'Ranked by kills, then money earned.';
    if (rank >= 0) note.style.color = '#ffe58a';
    right.appendChild(note);
    if (victory) {
      const v = h('p', 'sh-p', '★ = cleared the whole game');
      v.style.fontSize = '10px';
      v.style.color = '#a9bad3';
      v.style.marginTop = '4px';
      right.appendChild(v);
    }
    root.appendChild(right);

    // Buttons.
    const btns = h('div', 'sh-go-btns');
    btns.style.top = '421px';
    const retry = h('div', 'sh-btn', 'Retry');
    const title = h('div', 'sh-btn', 'Title');
    btns.append(retry, title);
    root.appendChild(btns);
    return [
      { el: retry, activate: () => { this.closeScreen(); hd.onRetry(); } },
      { el: title, activate: () => { this.closeScreen(); hd.onTitle(); } },
    ];
  }

  /** Store the result once per stats object; returns its rank among the shown scores or -1. */
  private record(s: GameStats, victory: boolean): number {
    // A hunt without a single kill is not worth remembering.
    if (s.kills <= 0 && !victory) return -1;
    let date = this.recorded.get(s);
    if (date === undefined) {
      date = Date.now() + Math.random();
      this.recorded.set(s, date);
      const scores = loadScores();
      scores.push({
        kills: Math.round(s.kills),
        money: Math.round(s.moneyEarned),
        level: s.level,
        levelName: s.levelName,
        timeSec: Math.round(s.timeSec),
        victory,
        date,
      });
      storageSet(SCORES_KEY, scores.sort(byScore).slice(0, MAX_SCORES));
    }
    const idx = loadScores().sort(byScore).findIndex((e) => e.date === date);
    return idx >= 0 && idx < SHOWN_SCORES ? idx : -1;
  }

  private openScreen(
    name: string,
    root: HTMLElement,
    ctls: Ctl[],
    opt: { back: (() => void) | null; horizontal?: boolean },
  ): void {
    this.closeScreen();
    // Keep game input from seeing clicks on menus.
    const stop = (e: Event) => e.stopPropagation();
    root.addEventListener('pointerdown', stop);
    root.addEventListener('mousedown', stop);
    root.addEventListener('mouseup', stop);
    root.addEventListener('click', stop);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('wheel', stop, { passive: true });

    const st: ScreenState = {
      name,
      root,
      ctls,
      // Menus remember their last item (menu.py SELECTED), except that pause /
      // game over / victory start on their first item when the game opens them.
      index: Math.min(
        this.navigating || !FRESH_START.has(name) ? (this.selected.get(name) ?? 0) : 0,
        Math.max(0, ctls.length - 1),
      ),
      horizontal: !!opt.horizontal,
      back: opt.back,
      openedAt: performance.now(),
      activateAfter: performance.now() + (this.navigating ? 0 : ACTIVATE_GRACE_MS),
    };
    ctls.forEach((c, i) => {
      c.el.addEventListener('pointerenter', () => {
        if (this.cur === st) this.select(i);
      });
      c.el.addEventListener('click', () => {
        if (this.cur !== st) return;
        this.select(i);
        c.activate?.();
      });
    });
    this.cur = st;
    this.root.appendChild(root);
    this.select(st.index);
  }

  private closeScreen(): void {
    if (!this.cur) return;
    this.cur.root.remove();
    this.cur = null;
  }

  private select(i: number): void {
    const st = this.cur;
    if (!st || st.ctls.length === 0) return;
    const n = st.ctls.length;
    st.index = ((i % n) + n) % n;
    this.selected.set(st.name, st.index);
    st.ctls.forEach((c, j) => c.el.classList.toggle('sh-active', j === st.index));
  }

  private onKey = (e: KeyboardEvent): void => {
    const st = this.cur;
    if (!st) return;
    // The key press that opened this screen must not also act on it.
    const fresh = e.timeStamp > 0 && e.timeStamp < st.openedAt;
    e.stopImmediatePropagation();
    if (fresh) return;
    const ctl = st.ctls[st.index];
    const settled = performance.now() >= st.activateAfter;
    let handled = true;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.select(st.index - 1);
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'Tab':
        this.select(st.index + (e.shiftKey && e.code === 'Tab' ? -1 : 1));
        break;
      case 'ArrowLeft':
      case 'KeyA':
        if (ctl?.adjust) ctl.adjust(-1);
        else if (st.horizontal) this.select(st.index - 1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (ctl?.adjust) ctl.adjust(1);
        else if (st.horizontal) this.select(st.index + 1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (!e.repeat && settled) ctl?.activate?.();
        break;
      case 'Escape':
      case 'Backspace':
        if (!e.repeat && settled) st.back?.();
        break;
      case 'KeyP':
        if (!e.repeat && settled && st.name === 'pause') st.back?.();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
}
