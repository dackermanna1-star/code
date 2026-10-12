// Menus and full-screen states: title, how-to-play, options, pause, game over,
// victory; plus the level splash, the transient message lines and the FPS
// counter. Keyboard (arrows/WASD + Enter/Space, Esc back) and mouse navigable.
//
// Two looks, following Options.hudStyle:
//   'modern'  (default) quiet glass panels and system type in a fluid layer
//             that covers the whole view (any aspect ratio), see modern.css;
//   'classic' the original (py-sealhunter menu.py / levels.py / field.py):
//             kinifed "SealHunter" logo in (110,0,0) with a 3-step (20,20,20)
//             shadow, Kroftsmann menu items (inactive (50,50,50), active
//             (0,100,0)) on a translucent pane, Trebuchet bold level splash,
//             dark-red message lines — in a 640x480 box centred in the view.
// Each public show* method dispatches to the builder of the current look and
// remembers how to rebuild itself, so switching the look in the options
// redraws the open screen.
import { ENEMIES, type EnemyType } from '../config/enemies';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { designLayer, fluidLayer, h, storageGet, storageSet } from './dom';
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
  /** Rebuild this screen (after a change of look). */
  rebuild?: () => void;
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
/** Mouse sensitivity range (Options.mouseSensitivity). */
const SENS_MIN = 0.25;
const SENS_MAX = 3;
/** Modern messages: at most this many chips at once. */
const MAX_MODERN_MESSAGES = 4;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface SliderRange {
  min: number;
  max: number;
  /** Stored values snap to this step. */
  step: number;
  /** Arrow-key change per press. */
  nudge: number;
  fmt: (v: number) => string;
}

const PERCENT: SliderRange = { min: 0, max: 1, step: 0.05, nudge: 0.1, fmt: (v) => `${Math.round(v * 100)}%` };
const SENSITIVITY: SliderRange = { min: SENS_MIN, max: SENS_MAX, step: 0.05, nudge: 0.1, fmt: (v) => `${v.toFixed(2)}\u00d7` };

/** Option value -> 0..1 slider position. */
const toUnit = (r: SliderRange, v: number) => clamp01((v - r.min) / (r.max - r.min));
/** 0..1 slider position -> snapped option value. */
const fromUnit = (r: SliderRange, f: number) =>
  Number((r.min + Math.round(((r.max - r.min) * clamp01(f)) / r.step) * r.step).toFixed(4));

/** Drag / click on a slider track reports the 0..1 pointer position. */
function bindSlider(slider: HTMLElement, put: (f: number) => void): void {
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
}

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
    // Added with first person / the modern UI: older saves lack them and keep the defaults.
    if (raw.view === 'third' || raw.view === 'first') o.view = raw.view;
    if (raw.hudStyle === 'modern' || raw.hudStyle === 'classic') o.hudStyle = raw.hudStyle;
    if (typeof raw.mouseSensitivity === 'number' && isFinite(raw.mouseSensitivity)) {
      o.mouseSensitivity = Math.min(SENS_MAX, Math.max(SENS_MIN, raw.mouseSensitivity));
    }
    if (typeof raw.invertY === 'boolean') o.invertY = raw.invertY;
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

  /** Change one option from outside the options screen (e.g. the V key): persists and notifies. */
  setOption<K extends keyof Options>(key: K, value: Options[K]): void {
    this.options[key] = value;
    storageSet(OPTIONS_KEY, this.options);
    if (key === 'hudStyle') this.applyStyle();
    this.onOptionsChange?.({ ...this.options });
  }

  private readonly root: HTMLDivElement;
  private readonly splash: HTMLDivElement;
  private readonly msgs: HTMLDivElement;
  private readonly msgList: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  // Modern look.
  private readonly mroot: HTMLDivElement;
  private readonly mSplash: HTMLDivElement;
  private readonly mSplashText: HTMLDivElement;
  private readonly mMsgs: HTMLDivElement;
  private readonly mFps: HTMLDivElement;
  private style: 'modern' | 'classic';
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

    this.mroot = fluidLayer(view, 'shm-screens');
    this.mMsgs = h('div', 'shm-msgs');
    this.mSplash = h('div', 'shm-splash');
    this.mSplashText = h('div', 'shm-splash-text');
    this.mSplash.append(this.mSplashText, h('div', 'shm-splash-rule'));
    this.mSplash.style.display = 'none';
    this.mFps = h('div', 'shm-fps');
    this.mFps.style.display = 'none';
    this.mroot.append(this.mMsgs, this.mSplash, this.mFps);

    this.style = this.options.hudStyle === 'classic' ? 'classic' : 'modern';
    this.root.style.display = this.style === 'classic' ? '' : 'none';
    this.mroot.style.display = this.style === 'modern' ? '' : 'none';

    window.addEventListener('keydown', this.onKey, true);
  }

  /** Current look of the screens (follows Options.hudStyle). */
  get currentStyle(): 'modern' | 'classic' {
    return this.style;
  }

  /** Follow options.hudStyle: swap layers and redraw the open screen in the new look. */
  private applyStyle(): void {
    const style = this.options.hudStyle === 'classic' ? 'classic' : 'modern';
    if (style === this.style) return;
    this.style = style;
    this.hideSplash();
    this.clearMessages();
    this.root.style.display = style === 'classic' ? '' : 'none';
    this.mroot.style.display = style === 'modern' ? '' : 'none';
    const fps = this.fpsShown;
    this.fpsShown = null;
    this.fps.style.display = 'none';
    this.mFps.style.display = 'none';
    this.setFps(fps);
    const rebuild = this.cur?.rebuild;
    if (rebuild) this.nav(rebuild);
  }

  /** Build a screen with the current look and remember how to rebuild it. */
  private present(build: () => void, again: () => void): void {
    build();
    if (this.cur) this.cur.rebuild = again;
  }

  get isMenuOpen(): boolean {
    return this.cur !== null;
  }

  // ------------------------------------------------------------ public API

  showTitle(hd: { onStart(view?: ViewMode): void }): void {
    this.present(() => (this.style === 'modern' ? this.mTitle(hd) : this.cTitle(hd)), () => this.showTitle(hd));
  }

  /** Level splash: fades in ~1 s and out ~1 s (levels.py LevelSplash). Non-blocking. */
  showSplash(text: string, ms = 2080): void {
    if (this.style === 'modern') {
      this.mSplashText.textContent = text;
      this.mSplash.classList.toggle('is-boss', /boss/i.test(text));
      this.runSplash(this.mSplash, ms);
    } else {
      this.splash.textContent = text;
      this.runSplash(this.splash, ms);
    }
  }

  showPause(hd: { onResume(): void; onRestart(): void; onQuit(): void }): void {
    this.present(() => (this.style === 'modern' ? this.mPause(hd) : this.cPause(hd)), () => this.showPause(hd));
  }

  showGameOver(reason: string, stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    this.present(
      () => (this.style === 'modern' ? this.mResults(stats, false, hd, reason) : this.cGameOver(reason, stats, hd)),
      () => this.showGameOver(reason, stats, hd),
    );
  }

  showVictory(stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    this.present(
      () => (this.style === 'modern' ? this.mResults(stats, true, hd) : this.cVictory(stats, hd)),
      () => this.showVictory(stats, hd),
    );
  }

  /** How-to-play screen. `onBack` defaults to closing the menu. */
  showHelp(onBack?: () => void): void {
    this.present(() => (this.style === 'modern' ? this.mHelp(onBack) : this.cHelp(onBack)), () => this.showHelp(onBack));
  }

  /** Options screen. `onBack` defaults to closing the menu. */
  showOptions(onBack?: () => void): void {
    this.present(() => (this.style === 'modern' ? this.mOptions(onBack) : this.cOptions(onBack)), () => this.showOptions(onBack));
  }

  // ------------------------------------------------------- classic builders

  private cTitle(hd: { onStart(view?: ViewMode): void }): void {
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

  private runSplash(el: HTMLElement, ms: number): void {
    const total = Math.max(200, ms);
    const fade = Math.min(1040, total / 2);
    this.splashAnim?.cancel();
    window.clearTimeout(this.splashTimer);
    el.style.display = '';
    if (typeof el.animate === 'function') {
      el.style.opacity = '0';
      this.splashAnim = el.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: fade / total },
          { opacity: 1, offset: 1 - fade / total },
          { opacity: 0, offset: 1 },
        ],
        { duration: total, easing: 'linear', fill: 'forwards' },
      );
    } else {
      el.style.opacity = '1';
    }
    this.splashTimer = window.setTimeout(() => this.hideSplash(), total + 30);
  }

  private cPause(hd: { onResume(): void; onRestart(): void; onQuit(): void }): void {
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

  private cGameOver(reason: string, stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    const root = h('div', 'sh-screen sh-dim');
    const title = h('div', 'sh-go-title', 'GAME OVER');
    title.style.top = '64px';
    const why = h('div', 'sh-go-reason', reason);
    why.style.top = '123px';
    root.append(title, why);
    const ctls = this.buildResults(root, stats, false, hd);
    this.openScreen('gameover', root, ctls, { back: null, horizontal: true });
  }

  private cVictory(stats: GameStats, hd: { onRetry(): void; onTitle(): void }): void {
    const root = h('div', 'sh-screen sh-dim');
    const head = h('div', 'sh-go-head', 'The last seal on the planet is dead.');
    head.style.top = '78px';
    const sub = h('div', 'sh-go-reason', `You cleared every level in ${fmtTime(stats.timeSec)}.`);
    sub.style.top = '116px';
    root.append(head, sub);
    const ctls = this.buildResults(root, stats, true, hd);
    this.openScreen('victory', root, ctls, { back: null, horizontal: true });
  }

  private cHelp(onBack?: () => void): void {
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
    row('Switch view', keys('V'), 'first person / classic camera, at any time');
    row('First person', keys('Mouse'), 'look and aim · click to capture the mouse, Esc frees it · W A S D move where you look');
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

  private cOptions(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const o = this.options;
    const root = h('div', 'sh-screen sh-dim');
    const panel = h('div', 'sh-panel');
    Object.assign(panel.style, { left: '135px', top: '36px', width: '370px', padding: '14px 16px 14px' });
    root.appendChild(panel);
    const title = h('div', 'sh-h1', 'OPTIONS');
    title.style.marginBottom = '10px';
    panel.appendChild(title);

    const ctls: Ctl[] = [];
    const changed = () => this.optionsChanged();

    const sliderRow = (label: string, get: () => number, set: (v: number) => void, range: SliderRange = PERCENT) => {
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
        const f = toUnit(range, v);
        fill.style.width = `${f * 100}%`;
        knob.style.left = `${f * 100}%`;
        val.textContent = range.fmt(v);
      };
      const put = (f: number) => {
        const q = fromUnit(range, f);
        if (q === get()) return;
        set(q);
        paint();
        changed();
      };
      bindSlider(slider, put);
      paint();
      panel.appendChild(row);
      ctls.push({ el: row, adjust: (d) => put(toUnit(range, get() + d * range.nudge)) });
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
    choiceRow<ViewMode>('View', [['third', 'Classic'], ['first', 'First person']], () => o.view, (v) => (o.view = v));
    choiceRow<Options['hudStyle']>('Interface', [['modern', 'Modern'], ['classic', 'Classic']], () => o.hudStyle, (v) => (o.hudStyle = v));
    sliderRow('Mouse sensitivity', () => o.mouseSensitivity, (v) => (o.mouseSensitivity = v), SENSITIVITY);
    choiceRow<boolean>('Invert mouse Y', [[false, 'Off'], [true, 'On']], () => o.invertY, (v) => (o.invertY = v));

    const backRow = h('div', 'sh-opt');
    backRow.style.marginTop = '8px';
    backRow.appendChild(h('div', 'sh-opt-label', '← Back'));
    panel.appendChild(backRow);
    ctls.push({ el: backRow, activate: back });

    const hint = h('div', 'sh-hint', '↑ ↓ choose · ← → change · Esc back');
    root.appendChild(hint);
    this.openScreen('options', root, ctls, { back });
  }

  // ----------------------------------------------------- public API (cont.)

  /**
   * Transient message. Classic: field.py dark-red line under the HUD that
   * scrolls away after ~2 s. Modern: a small chip under the progress bar.
   */
  message(text: string): void {
    if (this.style === 'modern') {
      this.modernMessage(text);
      return;
    }
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
    const el = this.style === 'modern' ? this.mFps : this.fps;
    if (v === null) el.style.display = 'none';
    else {
      el.style.display = '';
      el.textContent = this.style === 'modern' ? `${v} FPS` : `FPS: ${v}`;
    }
  }

  hideAll(): void {
    this.closeScreen();
    this.hideSplash();
    this.clearMessages();
  }

  /** Saved high scores, best first. */
  highScores(): HighScore[] {
    return loadScores().sort(byScore);
  }

  // -------------------------------------------------------- modern builders

  /** A vertical list of menu items. */
  private mMenu(cls: string, items: Array<[string, () => void]>): { el: HTMLDivElement; ctls: Ctl[] } {
    const el = h('div', cls);
    const ctls: Ctl[] = items.map(([label, action]) => {
      const mi = h('div', 'shm-mi', label);
      el.appendChild(mi);
      return { el: mi, activate: action };
    });
    return { el, ctls };
  }

  /** Bottom hint line with key caps: [['↑', '↓'], 'choose'], [['Enter'], 'select'] … */
  private mHint(...parts: Array<[string[], string]>): HTMLDivElement {
    const el = h('div', 'shm-hint');
    parts.forEach(([keys, text], i) => {
      if (i) el.appendChild(document.createTextNode(' '));
      for (const k of keys) {
        el.appendChild(h('span', 'shm-kbd', k));
        el.appendChild(document.createTextNode(' '));
      }
      el.appendChild(document.createTextNode(text));
    });
    return el;
  }

  /** "[W] [A] or the arrows" -> text with key caps. */
  private keyCell(cls: string, spec: string): HTMLDivElement {
    const el = h('div', cls);
    for (const part of spec.split(/(\[[^\]]+\])/)) {
      if (!part) continue;
      if (part.startsWith('[')) el.appendChild(h('span', 'shm-kbd', part.slice(1, -1)));
      else el.appendChild(document.createTextNode(part));
    }
    return el;
  }

  private mTitle(hd: { onStart(view?: ViewMode): void }): void {
    const reopen = () => this.showTitle(hd);
    const root = h('div', 'shm-screen shm-title');
    root.appendChild(h('div', 'shm-title-scrim'));
    const col = h('div', 'shm-title-col');
    const mark = h('div', 'shm-wordmark');
    mark.append(h('span', '', 'Seal'), h('span', '', 'Hunter'));
    col.append(mark, h('div', 'shm-wordmark-rule'), h('div', 'shm-tagline', '3D remake of the 2005 original'));
    const menu = this.mMenu('shm-menu', [
      ['Play', () => { this.closeScreen(); hd.onStart('third'); }],
      ['Play first person', () => { this.closeScreen(); hd.onStart('first'); }],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
    ]);
    col.appendChild(menu.el);
    const best = loadScores().sort(byScore)[0];
    if (best) {
      const b = h('div', 'shm-best');
      const where = best.victory ? 'all levels cleared' : `level ${best.level}`;
      b.append(h('b', '', 'Best hunt'), document.createTextNode(`${fmt(best.kills)} kills · $${fmt(best.money)} · ${where}`));
      col.appendChild(b);
    }
    root.append(col, this.mHint([['↑', '↓'], 'choose'], [['Enter'], 'select']));
    this.openScreen('title', root, menu.ctls, { back: null });
  }

  private mPause(hd: { onResume(): void; onRestart(): void; onQuit(): void }): void {
    const reopen = () => this.showPause(hd);
    const resume = () => { this.closeScreen(); hd.onResume(); };
    const root = h('div', 'shm-screen shm-scrim');
    const c = h('div', 'shm-center');
    c.appendChild(h('div', 'shm-pause-title', 'Paused'));
    const menu = this.mMenu('shm-pause-menu', [
      ['Resume', resume],
      ['Restart', () => { this.closeScreen(); hd.onRestart(); }],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Quit to title', () => { this.closeScreen(); hd.onQuit(); }],
    ]);
    c.appendChild(menu.el);
    root.append(c, this.mHint([['Esc'], 'resume'], [['↑', '↓'], 'choose'], [['Enter'], 'select']));
    this.openScreen('pause', root, menu.ctls, { back: resume });
  }

  private mOptions(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const o = this.options;
    const root = h('div', 'shm-screen shm-scrim');
    const c = h('div', 'shm-center');
    const panel = h('div', 'shm-panel shm-options');
    c.appendChild(panel);
    root.appendChild(c);
    const head = h('div', 'shm-panel-head');
    head.append(h('div', 'shm-h1', 'Options'));
    panel.appendChild(head);

    const ctls: Ctl[] = [];
    const changed = () => this.optionsChanged();
    const section = (title: string) => panel.appendChild(h('div', 'shm-section', title));
    const row = (label: string) => {
      const r = h('div', 'shm-opt');
      r.appendChild(h('div', 'shm-opt-label', label));
      const ctl = h('div', 'shm-opt-ctl');
      r.appendChild(ctl);
      panel.appendChild(r);
      return { r, ctl };
    };

    const sliderRow = (label: string, get: () => number, set: (v: number) => void, range: SliderRange = PERCENT) => {
      const { r, ctl } = row(label);
      const slider = h('div', 'shm-slider');
      const fill = h('div', 'shm-slider-fill');
      const knob = h('div', 'shm-slider-knob');
      slider.append(fill, knob);
      const val = h('div', 'shm-opt-val');
      ctl.append(slider, val);
      const paint = () => {
        const v = get();
        const f = toUnit(range, v);
        fill.style.width = `${f * 100}%`;
        knob.style.left = `${f * 100}%`;
        val.textContent = range.fmt(v);
      };
      const put = (f: number) => {
        const q = fromUnit(range, f);
        if (q === get()) return;
        set(q);
        paint();
        changed();
      };
      bindSlider(slider, put);
      paint();
      ctls.push({ el: r, adjust: (d) => put(toUnit(range, get() + d * range.nudge)) });
    };

    const segRow = <T>(label: string, values: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
      const { r, ctl } = row(label);
      const seg = h('div', 'shm-seg');
      ctl.appendChild(seg);
      const items = values.map(([v, text]) => {
        const it = h('div', 'shm-seg-i', text);
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          if (v === get()) return;
          set(v);
          paint();
          changed();
        });
        seg.appendChild(it);
        return it;
      });
      const paint = () => items.forEach((it, i) => it.classList.toggle('is-on', values[i][0] === get()));
      const step = (d: -1 | 1) => {
        const i = Math.max(0, values.findIndex(([v]) => v === get()));
        set(values[(i + d + values.length) % values.length][0]);
        paint();
        changed();
      };
      paint();
      ctls.push({ el: r, adjust: step, activate: () => step(1) });
    };

    const onOff: Array<[boolean, string]> = [[false, 'Off'], [true, 'On']];
    section('Audio');
    sliderRow('Master volume', () => o.masterVolume, (v) => (o.masterVolume = v));
    sliderRow('Effects volume', () => o.sfxVolume, (v) => (o.sfxVolume = v));
    segRow<boolean>('Ambience', onOff, () => o.ambience, (v) => (o.ambience = v));
    section('Graphics');
    segRow<Options['quality']>('Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => o.quality, (v) => (o.quality = v));
    segRow<Options['blood']>('Blood', [['low', 'Low'], ['normal', 'Normal'], ['max', 'Max']], () => o.blood, (v) => (o.blood = v));
    segRow<boolean>('Show FPS', onOff, () => o.showFps, (v) => (o.showFps = v));
    section('Game');
    segRow<ViewMode>('View', [['third', 'Classic'], ['first', 'First person']], () => o.view, (v) => (o.view = v));
    segRow<Options['hudStyle']>('Interface', [['modern', 'Modern'], ['classic', 'Classic']], () => o.hudStyle, (v) => (o.hudStyle = v));
    sliderRow('Mouse sensitivity', () => o.mouseSensitivity, (v) => (o.mouseSensitivity = v), SENSITIVITY);
    segRow<boolean>('Invert mouse Y', onOff, () => o.invertY, (v) => (o.invertY = v));

    const foot = h('div', 'shm-panel-foot');
    const btn = h('div', 'shm-btn', 'Back');
    foot.appendChild(btn);
    panel.appendChild(foot);
    ctls.push({ el: btn, activate: back });

    root.appendChild(this.mHint([['↑', '↓'], 'choose'], [['←', '→'], 'change'], [['Esc'], 'back']));
    this.openScreen('options', root, ctls, { back });
  }

  private mHelp(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const root = h('div', 'shm-screen shm-scrim');
    const c = h('div', 'shm-center');
    const panel = h('div', 'shm-panel shm-help');
    c.appendChild(panel);
    root.appendChild(c);
    const head = h('div', 'shm-panel-head');
    head.append(h('div', 'shm-h1', 'How to play'));
    panel.appendChild(head);

    const left = h('div');
    const right = h('div');
    panel.append(left, right);

    left.appendChild(h('div', 'shm-section', 'Goal'));
    left.appendChild(
      h(
        'p',
        'shm-p',
        'Animals pour onto the ice floe from the left. Shoot them before they get across: if a single one ' +
          'reaches the right edge, the game is over. Kills pay a bounty, headshots pay extra and three or more ' +
          'kills with one bullet is a nice shot. Buy bigger guns from the weapon bar.',
      ),
    );

    left.appendChild(h('div', 'shm-section', 'Controls'));
    const keys = h('div', 'shm-keys');
    const th = (t: string) => keys.appendChild(h('div', 'th', t));
    th('');
    th('Classic');
    th('First person');
    const krow = (label: string, classic: string, fp?: string) => {
      keys.appendChild(h('div', 'k', label));
      const a = this.keyCell('', classic);
      keys.appendChild(a);
      if (fp === undefined) a.style.gridColumn = 'span 2';
      else keys.appendChild(this.keyCell('', fp));
    };
    krow('Move', '[W] [A] [S] [D] or arrows', '[W] [A] [S] [D] where you look');
    krow('Aim', 'you fire along your lane', '[Mouse] · click to capture it');
    krow('Fire', '[Space] [Ctrl] [Left mouse]', '[Left mouse] [Space]');
    krow('Reload', '[R]');
    krow('Jump / stomp', '[E] [Shift] · or walk into a crawling seal to kick it');
    krow('Buy best weapon', '[B] [Enter]');
    krow('Select or buy', '[1] – [9] [0] or click a weapon tile');
    krow('Cycle weapons', '[Q] [Tab]');
    krow('Switch view', '[V] at any time');
    krow('Pause', '[P] [Esc]', '[Esc] also frees the mouse');
    left.appendChild(keys);

    right.appendChild(h('div', 'shm-section', 'Creatures'));
    const foes = h('div', 'shm-foes');
    const foe = (t: EnemyType, bounty: string, text: string) => {
      const n = h('div', 'n', ENEMIES[t].name);
      const d = h('div');
      d.appendChild(document.createTextNode(text));
      foes.append(n, d);
      if (bounty) d.prepend(h('span', 'b', `${bounty} `));
    };
    foe('seal', '$50', 'Crawls on when wounded: kick or stomp it.');
    foe('activist', '$100', 'Shoot the cub from his arms and he flees.');
    foe('cub', '$25', 'Slow; stops to sniff. Knocks you over.');
    foe('penguin', '$100', 'Waddles, then belly-slides.');
    foe('fatseal', '$200', 'Stops to regenerate. Bowls you over.');
    foe('bear', '$500', 'The more you hurt it, the faster it runs.');
    foe('turtle', '$500', 'Bullets bounce off the shell. Aim low.');
    foe('walrus', '', 'Final boss. Sharpens its tusks, then charges.');
    right.appendChild(foes);
    right.appendChild(h('div', 'shm-section', 'Bosses'));
    right.appendChild(
      h(
        'p',
        'shm-p',
        'Every level ends with one: fat seal, penguin flock, polar bear, turtle, walrus … and then the last seal on the planet. ' +
          'In first person the radar shows creatures behind you and the red escape edge.',
      ),
    );

    const foot = h('div', 'shm-help-foot');
    const btn = h('div', 'shm-btn', 'Back');
    foot.appendChild(btn);
    panel.appendChild(foot);
    root.appendChild(this.mHint([['Esc'], 'back']));
    this.openScreen('help', root, [{ el: btn, activate: back }], { back });
  }

  /** Game over / victory: headline, this hunt's numbers, best hunts, retry / title. */
  private mResults(s: GameStats, victory: boolean, hd: { onRetry(): void; onTitle(): void }, reason = ''): void {
    const rank = this.record(s, victory);
    const root = h('div', 'shm-screen shm-scrim');
    const c = h('div', 'shm-center');
    const col = h('div', 'shm-results');
    c.appendChild(col);
    root.appendChild(c);

    const head = h('div', 'shm-res-head');
    if (victory) {
      head.append(
        h('div', 'shm-res-title is-victory', 'The last seal on the planet is dead.'),
        h('div', 'shm-res-rule'),
        h('div', 'shm-res-reason', `You cleared every level in ${fmtTime(s.timeSec)}.`),
      );
    } else {
      head.append(h('div', 'shm-res-title', 'Game over'), h('div', 'shm-res-rule'));
      if (reason) head.appendChild(h('div', 'shm-res-reason', reason));
    }
    col.appendChild(head);

    const cards = h('div', 'shm-res-cards');
    col.appendChild(cards);

    // This hunt.
    const left = h('div', 'shm-panel shm-res-hunt');
    left.appendChild(h('div', 'shm-section', 'This hunt'));
    const hero = h('div', 'shm-hero');
    const acc = s.shots > 0 ? Math.min(100, Math.round((100 * s.hits) / s.shots)) : 0;
    const big = (v: string, l: string) => {
      const d = h('div');
      d.append(h('div', 'v', v), h('div', 'l', l));
      hero.appendChild(d);
    };
    big(fmt(s.kills), 'Kills');
    big(fmtTime(s.timeSec), 'Time');
    big(s.shots > 0 ? `${acc}%` : '—', 'Accuracy');
    big(`$${fmt(s.moneyEarned)}`, 'Earned');
    left.appendChild(hero);
    const grid = h('div', 'shm-stats');
    const add = (k: string, v: string, sub?: string) => {
      grid.appendChild(h('div', 'k', k));
      const vv = h('div', 'v', v);
      if (sub) vv.appendChild(h('small', '', sub));
      grid.appendChild(vv);
    };
    const lvlName = s.levelName && s.levelName !== `Level ${s.level}` ? ` — ${s.levelName}` : '';
    add('Level reached', `${s.level}${lvlName}`);
    const breakdown = ENEMY_ORDER.filter((t) => (s.killsByType[t] ?? 0) > 0)
      .map((t) => `${ENEMIES[t].name} ${fmt(s.killsByType[t] ?? 0)}`.replace(/ /g, NBSP))
      .join(' · ');
    if (breakdown) add('Creatures', '', breakdown);
    if (s.shots > 0) add('Hits', `${fmt(s.hits)} of ${fmt(s.shots)} shots`);
    add('Headshots', fmt(s.headshots));
    add('Nice shots', fmt(s.niceShots), s.bestNiceShot > 0 ? `best: ${s.bestNiceShot} kills with one shot` : undefined);
    const bought = s.weaponsBought.filter((w) => WEAPONS[w]).map((w) => WEAPONS[w].name.replace(/ /g, NBSP));
    add('Weapons bought', String(bought.length), bought.length ? bought.join(', ') : undefined);
    add('Favourite weapon', s.favoriteWeapon && WEAPONS[s.favoriteWeapon] ? WEAPONS[s.favoriteWeapon].name : '—');
    add('Money left', `$${fmt(s.moneyLeft)}`);
    left.appendChild(grid);
    cards.appendChild(left);

    // Best hunts.
    const right = h('div', 'shm-panel shm-res-best');
    right.appendChild(h('div', 'shm-section', 'Best hunts'));
    const table = h('table', 'shm-hs');
    const hr = h('tr', 'th');
    for (const [t, r] of [['#', false], ['Kills', true], ['Money', true], ['Level', true], ['Time', true]] as const) {
      hr.appendChild(h('td', r ? 'r' : '', t));
    }
    table.appendChild(hr);
    const scores = loadScores().sort(byScore).slice(0, SHOWN_SCORES);
    for (let i = 0; i < SHOWN_SCORES; i++) {
      const sc = scores[i];
      const tr = h('tr', sc ? (i === rank ? 'is-new' : '') : 'is-empty');
      const cells = sc
        ? [String(i + 1), fmt(sc.kills), `$${fmt(sc.money)}`, sc.victory ? '★' : String(sc.level), fmtTime(sc.timeSec)]
        : [String(i + 1), '—', '', '', ''];
      cells.forEach((v, j) => tr.appendChild(h('td', j ? 'r' : '', v)));
      table.appendChild(tr);
    }
    right.appendChild(table);
    const note = h('div', rank >= 0 ? 'shm-note is-new' : 'shm-note');
    note.textContent = rank >= 0 ? `New best hunt at #${rank + 1}` : 'Ranked by kills, then money earned.';
    right.appendChild(note);
    if (victory || scores.some((x) => x.victory)) right.appendChild(h('div', 'shm-note', '★ cleared every level'));
    cards.appendChild(right);

    const btns = h('div', 'shm-btns');
    const retry = h('div', 'shm-btn', 'Retry');
    const title = h('div', 'shm-btn', 'Title');
    btns.append(retry, title);
    col.appendChild(btns);
    this.openScreen(victory ? 'victory' : 'gameover', root, [
      { el: retry, activate: () => { this.closeScreen(); hd.onRetry(); } },
      { el: title, activate: () => { this.closeScreen(); hd.onTitle(); } },
    ], { back: null, horizontal: true });
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
    for (const el of [this.splash, this.mSplash]) {
      el.style.opacity = '0';
      el.style.display = 'none';
    }
  }

  private clearMessages(): void {
    window.clearTimeout(this.msgTimer);
    this.msgScrolling = false;
    this.msgList.getAnimations?.().forEach((a) => a.cancel());
    this.msgList.replaceChildren();
    this.mMsgs.replaceChildren();
  }

  /** Persist the options, notify, and follow a change of look. */
  private optionsChanged(): void {
    storageSet(OPTIONS_KEY, this.options);
    this.onOptionsChange?.({ ...this.options });
    this.applyStyle();
  }

  private modernMessage(text: string): void {
    const chip = h('div', 'shm-msg', text);
    if (/massacre/i.test(text)) chip.classList.add('is-hot');
    this.mMsgs.appendChild(chip);
    while (this.mMsgs.childElementCount > MAX_MODERN_MESSAGES) this.mMsgs.firstElementChild?.remove();
    window.setTimeout(() => {
      chip.classList.add('is-out');
      window.setTimeout(() => chip.remove(), 240);
    }, MESSAGE_HOLD_MS);
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
    // Input ignores clicks inside '.screen'.
    root.classList.add('screen');
    (this.style === 'modern' ? this.mroot : this.root).appendChild(root);
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
