// Menus and full-screen states: title (over the live attract game), chapter
// splash, pause, options, how to play, game over, victory ("THE FERRY
// DEPARTS" → "TO BE CONTINUED"), loading screen and an FPS counter.
//
// Keyboard: ↑/↓ (W/S, Tab) choose, ←/→ (A/D) change a value, Enter/Space
// select, Esc/Backspace back. Mouse: hover selects, click activates, sliders
// drag. Menus swallow their own input so the game never sees it.
import type { WeaponId } from '../config/ids';
import { clamp01, fluidLayer, fmtInt, fmtTime, fromHtml, h } from './dom';
import { CLOCK_SVG, CRANE_SVG, FERRY_SVG, HORN_SVG, ROSTER_SVG, WHEEL_SVG } from './icons';
import {
  byRun,
  loadOptions,
  loadRuns,
  saveOptions,
  saveRuns,
  type BloodAmount,
  type Options,
  type Quality,
  type RunRecord,
  type RunStats,
} from './options';

/** Sounds the screens ask for (wire to AudioSystem.ui). */
export type UiSound = 'move' | 'select' | 'back' | 'toggle' | 'open';

/** Display names (results screens; the HUD gets names from the snapshot). */
export const WEAPON_NAMES: Record<WeaponId, string> = {
  revolver: 'Old Faithful',
  nailgun: 'Nail Gun',
  shotgun: 'Pump Shotgun',
  flare: 'Flare Pistol',
  harpoon: 'Harpoon Gun',
  outboard: 'The Outboard',
};

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
  activateAfter: number;
}

/** Ignore activation keys this long after a screen opens (held fire keys). */
const ACTIVATE_GRACE_MS = 260;
const FRESH_START = new Set(['pause', 'gameover', 'victory']);

const TIPS = [
  'Not dead till the head’s gone. Aim high.',
  'Stomp the twitching ones before they get up. Tidy pays $5.',
  'Bodies slow the horde. Build a wall of them.',
  'Three nails pin a body to the planks for good.',
  'Flares set piles of bodies on fire. Bodies burn well.',
  'Don’t pop a bloater next to yourself.',
  'The horn buys you two seconds. Once per chapter.',
  'Shoot the crane hook. Fish crates are heavy.',
  'A harpoon goes through five of them. And riot shields.',
];

interface SliderRange {
  min: number;
  max: number;
  step: number;
  nudge: number;
  fmt: (v: number) => string;
}
const PERCENT: SliderRange = { min: 0, max: 1, step: 0.05, nudge: 0.1, fmt: (v) => `${Math.round(v * 100)}%` };
const toUnit = (r: SliderRange, v: number) => clamp01((v - r.min) / (r.max - r.min));
const fromUnit = (r: SliderRange, f: number) => Number((r.min + Math.round(((r.max - r.min) * clamp01(f)) / r.step) * r.step).toFixed(4));

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

/** "[W] [A] [S] [D] or arrows" → text with key chips. */
function keyText(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const part of text.split(/(\[[^\]]+\])/)) {
    if (!part) continue;
    if (part.startsWith('[')) f.appendChild(h('span', 'lf-kbd', part.slice(1, -1)));
    else f.appendChild(document.createTextNode(part));
  }
  return f;
}

export class Screens {
  /** Current options (mutated in place; persisted on every change). */
  readonly options: Options;
  /** Called after any option change (apply volumes, quality, …). */
  onOptionsChange: ((o: Options) => void) | null = null;
  /** UI sound hook (menu moves, selects, back). */
  onUiSound: ((s: UiSound) => void) | null = null;
  /** Store finished runs in the records (off for bot / god-mode runs). */
  recordRuns = true;

  private readonly root: HTMLDivElement;
  private readonly splash: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private loading: HTMLDivElement | null = null;
  private loadingFill: HTMLDivElement | null = null;
  private loadingLabel: HTMLDivElement | null = null;
  private cur: ScreenState | null = null;
  private readonly selected = new Map<string, number>();
  private splashTimer = 0;
  private fpsShown: number | null = null;
  private navigating = false;
  private readonly recorded = new WeakMap<RunStats, number>();
  private victoryTimer = 0;

  constructor(view: HTMLElement) {
    this.options = loadOptions();
    this.root = fluidLayer(view, 'lf-screens');
    this.splash = h('div', 'lf-splash');
    this.fps = h('div', 'lf-fps');
    this.fps.style.display = 'none';
    this.root.append(this.splash, this.fps);
    window.addEventListener('keydown', this.onKey, true);
  }

  /** A menu screen is open (the game should not read input). */
  get isMenuOpen(): boolean {
    return this.cur !== null;
  }

  /** Name of the open screen ('title', 'pause', 'options', 'help', 'gameover', 'victory') or null. */
  get current(): string | null {
    return this.cur?.name ?? null;
  }

  /** Change one option from outside the options screen: persists and notifies. */
  setOption<K extends keyof Options>(key: K, value: Options[K]): void {
    this.options[key] = value;
    this.optionsChanged();
  }

  // ------------------------------------------------------------- title

  /** Title screen over the live attract game. */
  showTitle(hd: { onPlay(): void }): void {
    document.getElementById('lf-boot')?.remove();
    const reopen = () => this.showTitle(hd);
    const root = h('div', 'lf-screen lf-title');
    root.appendChild(h('div', 'lf-title-scrim'));

    const col = h('div', 'lf-title-col');
    const eyebrow = h('div', 'lf-eyebrow');
    eyebrow.append(h('i', 'lf-live'), document.createTextNode('Final boarding call'));
    col.appendChild(eyebrow);

    const mark = h('div', 'lf-wordmark');
    mark.setAttribute('role', 'heading');
    mark.setAttribute('aria-label', 'Last Ferry');
    const last = h('div', 'lf-wm-last', 'LAST');
    const ferry = h('div', 'lf-wm-ferry', 'FERRY');
    const water = h('div', 'lf-wm-water');
    const boat = h('span', 'lf-wm-boat');
    boat.appendChild(fromHtml(FERRY_SVG));
    water.append(h('div', 'lf-wm-line'), boat);
    const refl = h('div', 'lf-wm-refl', 'FERRY');
    mark.append(last, ferry, water, refl);
    col.appendChild(mark);
    col.appendChild(h('div', 'lf-tagline', 'No one boards dead.'));

    const menu = this.menu('lf-menu', [
      ['Play', () => { this.closeScreen(); hd.onPlay(); }],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
    ]);
    col.appendChild(menu.el);

    const best = loadRuns().sort(byRun)[0];
    if (best) {
      const b = h('div', 'lf-best');
      const where = best.victory ? 'the ferry departed' : `chapter ${best.chapter}`;
      b.append(h('b', '', 'Best night'), document.createTextNode(`${fmtInt(best.kills)} kills · $${fmtInt(best.money)} · ${where}`));
      col.appendChild(b);
    }
    root.appendChild(col);

    // Departure board, top right.
    const board = h('div', 'lf-depart lf-glass');
    const rowA = h('div', 'lf-depart-row');
    rowA.append(h('span', 'k', 'Sailing'), h('span', 'v', '22:00'));
    const rowB = h('div', 'lf-depart-row');
    rowB.append(h('span', 'k', 'Status'), h('span', 'v is-live', 'Boarding'));
    const rowC = h('div', 'lf-depart-row');
    rowC.append(h('span', 'k', 'Gangway'), h('span', 'v', 'Pier 1'));
    board.append(h('div', 'lf-depart-head', 'Departures'), rowA, rowB, rowC);
    root.appendChild(board);

    root.appendChild(this.hint([['↑', '↓'], 'choose'], [['Enter'], 'select']));
    this.openScreen('title', root, menu.ctls, { back: null });
  }

  // ------------------------------------------------------------ splash

  /** "CHAPTER 1 · LAST LIGHT · 18:40" — non-blocking, fades in and out. */
  showChapterSplash(num: number, name: string, clock: string, ms = 2600): void {
    window.clearTimeout(this.splashTimer);
    this.splash.replaceChildren();
    const el = h('div', 'lf-splash-in');
    el.style.setProperty('--ms', `${Math.max(600, ms)}ms`);
    const eyebrow = h('div', 'lf-splash-eyebrow', `Chapter ${num}`);
    const title = h('div', 'lf-splash-title', name);
    const row = h('div', 'lf-splash-row');
    const clockEl = h('span', 'lf-splash-clock');
    clockEl.append(fromHtml(CLOCK_SVG), document.createTextNode(clock));
    row.append(h('span', 'lf-splash-rule'), clockEl, h('span', 'lf-splash-rule r'));
    el.append(eyebrow, title, row);
    this.splash.appendChild(el);
    this.splash.style.display = '';
    this.splashTimer = window.setTimeout(() => this.hideSplash(), Math.max(600, ms) + 60);
  }

  hideSplash(): void {
    window.clearTimeout(this.splashTimer);
    this.splash.replaceChildren();
    this.splash.style.display = 'none';
  }

  // ------------------------------------------------------------- pause

  showPause(hd: { onResume(): void; onRestart(): void; onQuit(): void }): void {
    const reopen = () => this.showPause(hd);
    const resume = () => { this.closeScreen(); hd.onResume(); };
    const root = h('div', 'lf-screen lf-scrim');
    const c = h('div', 'lf-center');
    const head = h('div', 'lf-pause-head');
    head.append(h('div', 'lf-eyebrow', 'Ship’s log'), h('div', 'lf-pause-title', 'Paused'));
    c.appendChild(head);
    const menu = this.menu('lf-menu lf-pause-menu', [
      ['Resume', resume],
      ['Restart', () => { this.closeScreen(); hd.onRestart(); }],
      ['Options', () => this.nav(() => this.showOptions(() => this.nav(reopen)))],
      ['How to play', () => this.nav(() => this.showHelp(() => this.nav(reopen)))],
      ['Quit to title', () => { this.closeScreen(); hd.onQuit(); }],
    ]);
    c.appendChild(menu.el);
    root.append(c, this.hint([['Esc'], 'resume'], [['↑', '↓'], 'choose'], [['Enter'], 'select']));
    this.openScreen('pause', root, menu.ctls, { back: resume });
  }

  // ----------------------------------------------------------- options

  showOptions(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const o = this.options;
    const root = h('div', 'lf-screen lf-scrim');
    const c = h('div', 'lf-center');
    const panel = h('div', 'lf-panel lf-options');
    c.appendChild(panel);
    root.appendChild(c);
    const head = h('div', 'lf-panel-head');
    head.append(h('div', 'lf-h1', 'Options'), h('div', 'lf-panel-note', 'Saved automatically'));
    panel.appendChild(head);

    const ctls: Ctl[] = [];
    const section = (title: string) => panel.appendChild(h('div', 'lf-section', title));
    const row = (label: string) => {
      const r = h('div', 'lf-opt');
      r.appendChild(h('div', 'lf-opt-label', label));
      const ctl = h('div', 'lf-opt-ctl');
      r.appendChild(ctl);
      panel.appendChild(r);
      return { r, ctl };
    };
    const sliderRow = (label: string, get: () => number, set: (v: number) => void, range: SliderRange = PERCENT) => {
      const { r, ctl } = row(label);
      const slider = h('div', 'lf-slider');
      const fill = h('div', 'lf-slider-fill');
      const knob = h('div', 'lf-slider-knob');
      slider.append(fill, knob);
      const val = h('div', 'lf-opt-val');
      ctl.append(slider, val);
      const paint = () => {
        const f = toUnit(range, get());
        fill.style.width = `${f * 100}%`;
        knob.style.left = `${f * 100}%`;
        val.textContent = range.fmt(get());
      };
      const put = (f: number) => {
        const q = fromUnit(range, f);
        if (q === get()) return;
        set(q);
        paint();
        this.optionsChanged();
        this.sound('toggle');
      };
      bindSlider(slider, put);
      paint();
      ctls.push({ el: r, adjust: (d) => put(toUnit(range, get() + d * range.nudge)) });
    };
    const segRow = <T>(label: string, values: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
      const { r, ctl } = row(label);
      const seg = h('div', 'lf-seg');
      ctl.appendChild(seg);
      const items = values.map(([v, text]) => {
        const it = h('div', 'lf-seg-i', text);
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          if (v === get()) return;
          set(v);
          paint();
          this.optionsChanged();
          this.sound('toggle');
        });
        seg.appendChild(it);
        return it;
      });
      const paint = () => items.forEach((it, i) => it.classList.toggle('is-on', values[i][0] === get()));
      const step = (d: -1 | 1) => {
        const i = Math.max(0, values.findIndex(([v]) => v === get()));
        const ni = Math.min(values.length - 1, Math.max(0, i + d));
        if (ni === i && values.length > 2) return;
        set(values[values.length === 2 ? (i + 1) % 2 : ni][0]);
        paint();
        this.optionsChanged();
        this.sound('toggle');
      };
      paint();
      ctls.push({ el: r, adjust: step, activate: () => step(1) });
    };

    section('Sound');
    sliderRow('Master volume', () => o.masterVolume, (v) => (o.masterVolume = v));
    sliderRow('Effects', () => o.sfxVolume, (v) => (o.sfxVolume = v));
    sliderRow('Music', () => o.musicVolume, (v) => (o.musicVolume = v));
    section('Picture');
    segRow<Quality>('Graphics quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => o.quality, (v) => (o.quality = v));
    segRow<BloodAmount>('Blood', [['low', 'A little'], ['normal', 'Plenty'], ['max', 'Buckets']], () => o.blood, (v) => (o.blood = v));
    sliderRow('Screen shake', () => o.shake, (v) => (o.shake = v));
    segRow<boolean>('Show FPS', [[false, 'Off'], [true, 'On']], () => o.showFps, (v) => (o.showFps = v));

    const foot = h('div', 'lf-panel-foot');
    const btn = h('div', 'lf-btn', 'Done');
    foot.appendChild(btn);
    panel.appendChild(foot);
    ctls.push({ el: btn, activate: back });
    root.appendChild(this.hint([['↑', '↓'], 'choose'], [['←', '→'], 'change'], [['Esc'], 'back']));
    this.openScreen('options', root, ctls, { back });
  }

  // ------------------------------------------------------- how to play

  showHelp(onBack?: () => void): void {
    const back = onBack ?? (() => this.closeScreen());
    const root = h('div', 'lf-screen lf-scrim');
    const c = h('div', 'lf-center');
    const panel = h('div', 'lf-panel lf-help');
    c.appendChild(panel);
    root.appendChild(c);
    const head = h('div', 'lf-panel-head');
    head.append(h('div', 'lf-h1', 'How to play'));
    const goal = h(
      'p',
      'lf-lede',
      'The town is burning and the last ferry is boarding. Hold the pier until every passenger is aboard — if a single zombie reaches the gangway, nobody sails.',
    );
    head.appendChild(goal);
    panel.appendChild(head);

    const cols = h('div', 'lf-help-cols');
    panel.appendChild(cols);

    // Controls.
    const c1 = h('div', 'lf-help-col');
    c1.appendChild(h('div', 'lf-section', 'Controls'));
    const keys = h('div', 'lf-keys');
    const krow = (label: string, k: string) => {
      keys.appendChild(h('div', 'k', label));
      const v = h('div', 'v');
      v.appendChild(keyText(k));
      keys.appendChild(v);
    };
    krow('Move', '[W] [A] [S] [D] or arrows');
    krow('Fire', '[Space] [Ctrl] or hold [Left mouse]');
    krow('Reload', '[R]');
    krow('Buy / select', '[1] – [6] or click a weapon');
    krow('Buy best', '[B] [Enter]');
    krow('Cycle weapons', '[Q] [Tab]');
    krow('Stomp', '[E] [Shift] jump, land on it');
    krow('Kick', 'walk into a crawler');
    krow('Ferry horn', '[H] once per chapter');
    krow('Cannon strike', '[F] when the wheel is full');
    krow('Crane', 'shoot the hook in its lane');
    krow('Pause', '[P] [Esc]');
    c1.appendChild(keys);

    // Rules.
    const c2 = h('div', 'lf-help-col');
    c2.appendChild(h('div', 'lf-section', 'House rules'));
    const rule = (n: string, title: string, text: string, icon?: string) => {
      const r = h('div', 'lf-rule');
      const badge = h('div', 'lf-rule-n');
      if (icon) badge.appendChild(fromHtml(icon));
      else badge.textContent = n;
      const body = h('div', 'lf-rule-body');
      body.append(h('div', 'lf-rule-t', title), h('div', 'lf-rule-p', text));
      r.append(badge, body);
      c2.appendChild(r);
    };
    rule(
      '1',
      'Not dead till the head’s gone',
      'An ordinary kill leaves a body that twitches and gets back up as a crawler. Headshots, fire, blasts, harpoons, stomps and three nails keep them down.',
    );
    rule('2', 'The dead are terrain', 'Bodies stay where they fall and slow the horde. Joggers trip over them. Piles burn beautifully.');
    rule('', 'The horn', 'Every zombie on screen staggers for two seconds. Once per chapter.', HORN_SVG);
    rule('', 'The crane', 'Shoot the hook and a pallet of fish crates flattens whatever is under it.', CRANE_SVG);
    rule('', 'Captain’s Favour', 'Kills fill the wheel. When it’s full, [F] calls three shells from the ferry’s deck gun.', WHEEL_SVG);
    c2.querySelectorAll('.lf-rule-p').forEach((p) => {
      const t = p.textContent ?? '';
      if (t.includes('[')) {
        p.textContent = '';
        p.appendChild(keyText(t));
      }
    });
    const money = h('div', 'lf-money-rules');
    money.innerHTML =
      '<span><b>+$15</b> headshot</span><span><b>NICE SHOT</b> 3+ kills, one pull</span><span><b>TIDY</b> stomp a body +$5</span>';
    c2.appendChild(money);

    // Roster.
    const c3 = h('div', 'lf-help-col');
    c3.appendChild(h('div', 'lf-section', 'The horde'));
    const roster = h('div', 'lf-roster');
    const card = (kind: keyof typeof ROSTER_SVG, name: string, bounty: string, text: string, tag = '') => {
      const el = h('div', 'lf-card');
      const ico = h('div', 'lf-card-ico');
      ico.appendChild(fromHtml(ROSTER_SVG[kind]));
      const body = h('div', 'lf-card-body');
      const top = h('div', 'lf-card-top');
      top.append(h('span', 'lf-card-name', name), h('span', 'lf-card-bounty', bounty));
      body.append(top, h('div', 'lf-card-text', text));
      if (tag) body.appendChild(h('div', 'lf-card-tag', tag));
      el.append(ico, body);
      roster.appendChild(el);
    };
    card('shambler', 'Shambler', '$40', 'Fishermen, tourists, waiters, grannies. Slow. Plenty of them.');
    card('jogger', 'Jogger', '$60', 'Still running the 10k. Zig-zags, trips over bodies.');
    card('bloater', 'Bloater', '$120', 'Pops into a gas cloud and two crawlers. Not up close.');
    card('medic', 'Paramedics', '$70', 'Drop a medic and the patient gets up.');
    card('riot', 'Riot brute', '$300', 'Helmet, shield, plate. Shotgun ×2 on armour; harpoons go through.', 'Chapter 3');
    card('crawler', 'Crawler', '$15', 'A body that got back up. Low — kick it or stomp it.');
    c3.appendChild(roster);
    const bosses = h('div', 'lf-bosses');
    bosses.append(h('b', '', 'Bosses'), document.createTextNode('Big Dave · The Marathon · The Riot Squad'));
    c3.appendChild(bosses);

    cols.append(c1, c2, c3);
    const foot = h('div', 'lf-panel-foot');
    const btn = h('div', 'lf-btn', 'Got it');
    foot.appendChild(btn);
    panel.appendChild(foot);
    root.appendChild(this.hint([['Esc'], 'back']));
    this.openScreen('help', root, [{ el: btn, activate: back }], { back });
  }

  // ----------------------------------------------------------- results

  /**
   * Game over. `cause`: 'gangway' (a zombie boarded), 'dead' (the Bosun went
   * down) or any custom line.
   */
  showGameOver(cause: 'gangway' | 'dead' | string, stats: RunStats, hd: { onRetry(): void; onTitle(): void }, detail?: string): void {
    const rank = this.record(stats, false);
    const root = h('div', 'lf-screen lf-scrim lf-results is-over');
    const c = h('div', 'lf-center');
    const col = h('div', 'lf-res');
    c.appendChild(col);
    root.appendChild(c);

    const head = h('div', 'lf-res-head');
    const [title, line] =
      cause === 'gangway'
        ? ['They boarded', 'One of them made it up the gangway. Nobody’s sailing tonight.']
        : cause === 'dead'
          ? ['The Bosun is down', 'You’ll be back on your feet in a few seconds. That’s the problem.']
          : ['Game over', cause];
    head.append(h('div', 'lf-eyebrow is-red', `Chapter ${stats.chapter} · ${stats.chapterName}`), h('div', 'lf-res-title', title), h('div', 'lf-res-line', detail || line));
    col.appendChild(head);
    col.appendChild(this.resultCards(stats, rank, false));

    const btns = h('div', 'lf-btns');
    const retry = h('div', 'lf-btn is-primary', 'Try again');
    const tbtn = h('div', 'lf-btn', 'Title');
    btns.append(retry, tbtn);
    col.appendChild(btns);
    this.openScreen('gameover', root, [
      { el: retry, activate: () => { this.closeScreen(); hd.onRetry(); } },
      { el: tbtn, activate: () => { this.closeScreen(); hd.onTitle(); } },
    ], { back: null, horizontal: true });
  }

  /** Victory: "THE FERRY DEPARTS", then "TO BE CONTINUED", then the night's numbers. */
  showVictory(stats: RunStats, hd: { onRetry(): void; onTitle(): void }): void {
    const rank = this.record(stats, true);
    const root = h('div', 'lf-screen lf-victory');
    root.appendChild(h('div', 'lf-victory-scrim'));
    const c = h('div', 'lf-center');
    const col = h('div', 'lf-res');
    c.appendChild(col);
    root.appendChild(c);

    const head = h('div', 'lf-vic-head');
    const boat = h('span', 'lf-vic-boat');
    boat.appendChild(fromHtml(FERRY_SVG));
    head.append(
      boat,
      h('div', 'lf-vic-title', 'The ferry departs'),
      h('div', 'lf-res-line', `${stats.passengersSaved ? `${fmtInt(stats.passengersSaved)} souls aboard. ` : ''}Somebody had to hold the pier.`),
      h('div', 'lf-tbc', 'To be continued'),
    );
    col.appendChild(head);
    const cards = this.resultCards(stats, rank, true);
    cards.classList.add('lf-late');
    col.appendChild(cards);
    const btns = h('div', 'lf-btns lf-late');
    const retry = h('div', 'lf-btn is-primary', 'Play again');
    const tbtn = h('div', 'lf-btn', 'Title');
    btns.append(retry, tbtn);
    col.appendChild(btns);
    this.openScreen('victory', root, [
      { el: retry, activate: () => { this.closeScreen(); hd.onRetry(); } },
      { el: tbtn, activate: () => { this.closeScreen(); hd.onTitle(); } },
    ], { back: null, horizontal: true });
    // Buttons ignore keys until the sequence has played.
    if (this.cur) this.cur.activateAfter = performance.now() + 2600;
    window.clearTimeout(this.victoryTimer);
  }

  private resultCards(s: RunStats, rank: number, victory: boolean): HTMLDivElement {
    const cards = h('div', 'lf-res-cards');
    const left = h('div', 'lf-panel lf-res-run');
    left.appendChild(h('div', 'lf-section', 'Tonight'));
    const hero = h('div', 'lf-hero');
    const acc = s.shots > 0 ? Math.min(100, Math.round((100 * s.hits) / s.shots)) : 0;
    const big = (v: string, l: string, cls = '') => {
      const d = h('div', cls);
      d.append(h('div', 'v', v), h('div', 'l', l));
      hero.appendChild(d);
    };
    big(fmtInt(s.kills), 'Kills');
    big(fmtInt(s.headshots), 'Headshots');
    big(s.shots > 0 ? `${acc}%` : '—', 'Accuracy');
    big(`$${fmtInt(s.moneyEarned)}`, 'Earned', 'is-brass');
    left.appendChild(hero);
    const grid = h('div', 'lf-stats');
    const add = (k: string, v: string, sub?: string) => {
      grid.appendChild(h('div', 'k', k));
      const vv = h('div', 'v', v);
      if (sub) vv.appendChild(h('small', '', sub));
      grid.appendChild(vv);
    };
    add('Chapter reached', victory ? `${s.chapter} — all cleared` : `${s.chapter} · ${s.chapterName}`);
    add('Time on the pier', fmtTime(s.timeSec));
    add('Best nice shot', s.bestNiceShot >= 3 ? `${s.bestNiceShot} with one pull` : '—', s.niceShots > 0 ? `${fmtInt(s.niceShots)} nice shots` : undefined);
    add('Favourite weapon', s.favouriteWeapon ? WEAPON_NAMES[s.favouriteWeapon] : '—');
    add('Bodies stomped', fmtInt(s.corpsesStomped));
    if (s.risenKilled !== undefined) add('Crawlers put down', fmtInt(s.risenKilled));
    if (s.bodiesNailed) add('Bodies nailed down', fmtInt(s.bodiesNailed));
    if (s.passengersSaved !== undefined) add('Passengers aboard', fmtInt(s.passengersSaved));
    if (s.moneyLeft !== undefined) add('Money left', `$${fmtInt(s.moneyLeft)}`);
    left.appendChild(grid);
    cards.appendChild(left);

    const right = h('div', 'lf-panel lf-res-best');
    right.appendChild(h('div', 'lf-section', 'Best nights'));
    const table = h('table', 'lf-hs');
    const hr = h('tr', 'th');
    for (const [t, r] of [['#', false], ['Kills', true], ['Money', true], ['Ch', true], ['Time', true]] as const) hr.appendChild(h('td', r ? 'r' : '', t));
    table.appendChild(hr);
    const runs = loadRuns().sort(byRun).slice(0, 5);
    for (let i = 0; i < 5; i++) {
      const r = runs[i];
      const tr = h('tr', r ? (i === rank ? 'is-new' : '') : 'is-empty');
      const cells = r ? [String(i + 1), fmtInt(r.kills), `$${fmtInt(r.money)}`, r.victory ? '⚓' : String(r.chapter), fmtTime(r.timeSec)] : [String(i + 1), '—', '', '', ''];
      cells.forEach((v, j) => tr.appendChild(h('td', j ? 'r' : '', v)));
      table.appendChild(tr);
    }
    right.appendChild(table);
    right.appendChild(h('div', rank >= 0 ? 'lf-note is-new' : 'lf-note', rank >= 0 ? `New best night at #${rank + 1}` : '⚓ = the ferry departed'));
    // Tonight's horde, by kind.
    const kinds: Array<[keyof typeof ROSTER_SVG, string, number]> = [];
    const by = s.killsByKind ?? {};
    const add2 = (k: keyof typeof ROSTER_SVG, label: string, n: number | undefined) => {
      if (n && n > 0) kinds.push([k, label, n]);
    };
    add2('shambler', 'Shamblers', (by.shambler ?? 0) + (by.patient ?? 0));
    add2('jogger', 'Joggers', by.jogger);
    add2('bloater', 'Bloaters', by.bloater);
    add2('medic', 'Medics', by.medic);
    add2('riot', 'Riot', by.riot);
    add2('bigdave', 'Big Dave', by.bigdave);
    add2('crawler', 'Crawlers', s.risenKilled);
    if (kinds.length) {
      right.appendChild(h('div', 'lf-section lf-horde-h', 'Put down tonight'));
      const grid = h('div', 'lf-horde');
      for (const [k, label, n] of kinds) {
        const cell = h('div', 'lf-horde-i');
        const ico = h('span', 'lf-horde-ico');
        ico.appendChild(fromHtml(ROSTER_SVG[k]));
        cell.append(ico, h('b', '', fmtInt(n)), h('span', '', label));
        grid.appendChild(cell);
      }
      right.appendChild(grid);
    }
    cards.appendChild(right);
    return cards;
  }

  /** Store a run once per stats object; returns its rank among the top 5 or -1. */
  private record(s: RunStats, victory: boolean): number {
    if (!this.recordRuns || (s.kills <= 0 && !victory)) return -1;
    let date = this.recorded.get(s);
    if (date === undefined) {
      date = Date.now() + Math.random();
      this.recorded.set(s, date);
      const runs = loadRuns();
      const rec: RunRecord = {
        kills: Math.round(s.kills),
        money: Math.round(s.moneyEarned),
        chapter: s.chapter,
        timeSec: Math.round(s.timeSec),
        victory,
        date,
      };
      runs.push(rec);
      saveRuns(runs);
    }
    const idx = loadRuns().sort(byRun).findIndex((e) => e.date === date);
    return idx >= 0 && idx < 5 ? idx : -1;
  }

  // ----------------------------------------------------------- loading

  /** Loading screen (0..1). Replaces the static boot screen from index.html. */
  showLoading(progress: number, label = 'Loading'): void {
    document.getElementById('lf-boot')?.remove();
    if (!this.loading) {
      this.loading = h('div', 'lf-loading');
      const inner = h('div', 'lf-loading-in');
      const mark = h('div', 'lf-loading-mark');
      mark.append(h('span', 'a', 'LAST'), h('span', 'b', 'FERRY'));
      const bar = h('div', 'lf-loading-bar');
      this.loadingFill = h('div', 'lf-loading-fill');
      bar.appendChild(this.loadingFill);
      this.loadingLabel = h('div', 'lf-loading-label');
      const tip = h('div', 'lf-loading-tip', TIPS[Math.floor(Math.random() * TIPS.length)]);
      inner.append(mark, bar, this.loadingLabel, tip);
      this.loading.appendChild(inner);
      this.root.appendChild(this.loading);
    }
    this.loadingFill!.style.transform = `scaleX(${clamp01(progress)})`;
    this.loadingLabel!.textContent = `${label} · ${Math.round(clamp01(progress) * 100)}%`;
  }

  hideLoading(): void {
    document.getElementById('lf-boot')?.remove();
    const el = this.loading;
    if (!el) return;
    this.loading = null;
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 420);
  }

  // --------------------------------------------------------------- fps

  /** FPS counter (null hides it). */
  setFps(fps: number | null): void {
    if (fps === this.fpsShown) return;
    this.fpsShown = fps;
    this.fps.style.display = fps === null ? 'none' : '';
    if (fps !== null) this.fps.textContent = `${Math.round(fps)} FPS`;
  }

  /** Close any open menu and the splash (e.g. starting a game). */
  hideAll(): void {
    document.getElementById('lf-boot')?.remove();
    this.closeScreen();
    this.hideSplash();
    window.clearTimeout(this.victoryTimer);
  }

  /** Close the open menu screen (if any). */
  close(): void {
    this.closeScreen();
  }

  // ---------------------------------------------------------- internals

  private optionsChanged(): void {
    saveOptions(this.options);
    this.onOptionsChange?.({ ...this.options });
  }

  private sound(s: UiSound): void {
    this.onUiSound?.(s);
  }

  private nav(fn: () => void): void {
    this.navigating = true;
    try {
      fn();
    } finally {
      this.navigating = false;
    }
  }

  private menu(cls: string, items: Array<[string, () => void]>): { el: HTMLDivElement; ctls: Ctl[] } {
    const el = h('div', cls);
    const ctls: Ctl[] = items.map(([label, action]) => {
      const mi = h('div', 'lf-mi');
      mi.append(h('span', 'lf-mi-arrow'), h('span', 'lf-mi-text', label));
      el.appendChild(mi);
      return { el: mi, activate: action };
    });
    return { el, ctls };
  }

  private hint(...parts: Array<[string[], string]>): HTMLDivElement {
    const el = h('div', 'lf-hint');
    for (const [keys, text] of parts) {
      const g = h('span', 'lf-hint-g');
      for (const k of keys) g.appendChild(h('span', 'lf-kbd', k));
      g.appendChild(document.createTextNode(text));
      el.appendChild(g);
    }
    return el;
  }

  private openScreen(name: string, root: HTMLElement, ctls: Ctl[], opt: { back: (() => void) | null; horizontal?: boolean }): void {
    this.closeScreen();
    const stop = (e: Event) => e.stopPropagation();
    root.addEventListener('pointerdown', stop);
    root.addEventListener('mousedown', stop);
    root.addEventListener('mouseup', stop);
    root.addEventListener('click', stop);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('wheel', stop, { passive: true });
    const now = performance.now();
    const st: ScreenState = {
      name,
      root,
      ctls,
      index: Math.min(this.navigating || !FRESH_START.has(name) ? (this.selected.get(name) ?? 0) : 0, Math.max(0, ctls.length - 1)),
      horizontal: !!opt.horizontal,
      back: opt.back,
      openedAt: now,
      activateAfter: now + (this.navigating ? 0 : ACTIVATE_GRACE_MS),
    };
    ctls.forEach((c, i) => {
      c.el.addEventListener('pointerenter', () => {
        if (this.cur === st && st.index !== i) {
          this.select(i);
          this.sound('move');
        }
      });
      c.el.addEventListener('click', () => {
        if (this.cur !== st) return;
        this.select(i);
        if (c.activate) {
          this.sound('select');
          c.activate();
        }
      });
    });
    this.cur = st;
    root.classList.add('screen');
    this.root.insertBefore(root, this.splash);
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
    st.ctls.forEach((c, j) => c.el.classList.toggle('is-active', j === st.index));
  }

  private onKey = (e: KeyboardEvent): void => {
    const st = this.cur;
    if (!st) return;
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
        this.sound('move');
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'Tab':
        this.select(st.index + (e.shiftKey && e.code === 'Tab' ? -1 : 1));
        this.sound('move');
        break;
      case 'ArrowLeft':
      case 'KeyA':
        if (ctl?.adjust) ctl.adjust(-1);
        else if (st.horizontal) {
          this.select(st.index - 1);
          this.sound('move');
        }
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (ctl?.adjust) ctl.adjust(1);
        else if (st.horizontal) {
          this.select(st.index + 1);
          this.sound('move');
        }
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (!e.repeat && settled && ctl?.activate) {
          this.sound('select');
          ctl.activate();
        }
        break;
      case 'Escape':
      case 'Backspace':
        if (!e.repeat && settled && st.back) {
          this.sound('back');
          st.back();
        }
        break;
      case 'KeyP':
        if (!e.repeat && settled && st.name === 'pause' && st.back) {
          this.sound('back');
          st.back();
        }
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
}
