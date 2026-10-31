import type { FighterCard, IScreens, ResultsSummary, ScreenSide, VersusInfo } from './types';
import { el, esc, fmtDuration, mix, prepareRoot, rgba, setFighterColors, SLOT_COLORS, SLOT_LABELS, statNumber } from './dom';
import { drawPortrait } from './portrait';
import { renderWinChart, type ChartHandle } from './chart';

/** Full-screen moments: title, VS intro, results; plus toasts. */
export class Screens implements IScreens {
  private root!: HTMLElement;
  private layer!: HTMLElement;
  private toastLayer!: HTMLElement;
  private timers: number[] = [];
  private keyHandlers: ((e: KeyboardEvent) => void)[] = [];
  private chart: ChartHandle | null = null;
  private resizeHandler: (() => void) | null = null;
  private mounted = false;

  mount(root: HTMLElement): void {
    if (this.mounted) return;
    this.mounted = true;
    prepareRoot(root);
    this.root = root;
    this.layer = el('div', 'gl-screens', root);
    this.toastLayer = el('div', 'gl-toasts', root);
  }

  /* ------------------------------------------------------------------ */
  /* Housekeeping                                                       */
  /* ------------------------------------------------------------------ */

  private later(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  private onKey(fn: (e: KeyboardEvent) => void): void {
    // Capture phase on window: runs before the control bar's shortcuts and can swallow keys.
    window.addEventListener('keydown', fn, true);
    this.keyHandlers.push(fn);
  }

  private clearKeys(): void {
    for (const k of this.keyHandlers) window.removeEventListener('keydown', k, true);
    this.keyHandlers = [];
  }

  hideAll(): void {
    if (!this.mounted) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.clearKeys();
    this.chart?.cancel();
    this.chart = null;
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    for (const c of Array.from(this.layer.children) as HTMLElement[]) {
      if (c.classList.contains('gl-leave')) continue;
      c.classList.add('gl-leave');
      window.setTimeout(() => c.remove(), 520);
    }
  }

  toast(text: string): void {
    if (!this.mounted) return;
    const t = el('div', 'gl-toast', this.toastLayer, text);
    window.setTimeout(() => t.classList.add('gl-out'), 1700);
    window.setTimeout(() => t.remove(), 2200);
  }

  /* ------------------------------------------------------------------ */
  /* Title                                                              */
  /* ------------------------------------------------------------------ */

  showTitle(): Promise<void> {
    this.hideAll();
    const s = el('div', 'gl-screen gl-title-scr', this.layer);
    const bg = el('div', 'gl-ts-bg', s);
    el('div', 'gl-ts-glow', bg);
    el('div', 'gl-ts-rays', bg);
    const streaks = el('div', 'gl-ts-streaks', bg);
    for (let i = 0; i < 14; i++) {
      const st = el('i', '', streaks);
      st.style.setProperty('--y', `${(i * 61) % 100}%`);
      st.style.setProperty('--d', `${2.6 + ((i * 37) % 30) / 10}s`);
      st.style.setProperty('--delay', `${-((i * 53) % 40) / 10}s`);
      st.style.setProperty('--w', `${12 + ((i * 29) % 40)}vw`);
      st.style.setProperty('--h', `${((i * 7) % 3) + 1}px`);
      st.style.setProperty('--c', i % 3 === 0 ? '#ff5a1f' : i % 3 === 1 ? '#4f7dff' : '#ffffff');
    }
    const motes = el('div', 'gl-ts-motes', bg);
    for (let i = 0; i < 26; i++) {
      const m = el('i', '', motes);
      m.style.setProperty('--x', `${(i * 37) % 100}%`);
      m.style.setProperty('--d', `${6 + ((i * 13) % 70) / 10}s`);
      m.style.setProperty('--delay', `${-((i * 31) % 90) / 10}s`);
      m.style.setProperty('--s', `${2 + (i % 4)}px`);
    }
    const c = el('div', 'gl-ts-content', s);
    el('div', 'gl-ts-kicker', c, 'AN ENDLESS AI DUEL');
    const logo = el('div', 'gl-logo', c);
    const word = el('span', 'gl-logo-word', logo, 'GODLINE');
    word.dataset.text = 'GODLINE';
    el('span', 'gl-logo-slash', logo);
    el('div', 'gl-tagline', c, 'Endless duels of the divine');
    const btn = el('button', 'gl-btn gl-btn-primary gl-begin', c);
    btn.type = 'button';
    el('span', 'gl-btn-label', btn, 'BEGIN');
    el('div', 'gl-ts-sub', c, 'Two gods. One line between them. Every battle is unique — and only one walks away.');
    const tips = el('div', 'gl-ts-tips', c);
    tips.innerHTML = [
      ['Space', 'pause'], ['N', 'next battle'], ['R', 'replay'], ['H', 'hide HUD'], ['F', 'fullscreen'], ['M', 'mute'], ['1 2 3', 'speed'],
    ].map(([k, v]) => `<span><kbd>${k}</kbd> ${v}</span>`).join('');
    return new Promise<void>((resolve) => {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        this.clearKeys();
        s.classList.add('gl-leave');
        window.setTimeout(() => s.remove(), 700);
        resolve();
      };
      btn.addEventListener('click', go);
      this.onKey((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      });
      window.setTimeout(() => btn.focus({ preventScroll: true }), 50);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Versus                                                             */
  /* ------------------------------------------------------------------ */

  showVersus(info: VersusInfo, durationMs: number): Promise<void> {
    this.hideAll();
    const s = el('div', 'gl-screen gl-versus', this.layer);
    s.style.setProperty('--lc', info.left.color);
    s.style.setProperty('--rc', info.right.color);
    const bg = el('div', 'gl-vs-bg', s);
    el('div', 'gl-vs-half gl-vs-hl', bg);
    el('div', 'gl-vs-half gl-vs-hr', bg);
    el('div', 'gl-vs-seam', bg);

    const top = el('div', 'gl-vs-top', s);
    el('span', 'gl-vs-battle', top, `BATTLE ${info.battleNumber}`);
    el('span', 'gl-vs-dot', top, '◆');
    el('span', 'gl-vs-seed', top, `SEED ${info.seedCode}`);

    const row = el('div', 'gl-vs-row', s);
    const lc = this.card(row, info.left, 'left');
    const mid = el('div', 'gl-vs-mid', row);
    const vs = el('div', 'gl-vs-text', mid, 'VS');
    vs.dataset.text = 'VS';
    el('div', 'gl-vs-ring', mid);
    const rc = this.card(row, info.right, 'right');

    const bottom = el('div', 'gl-vs-bottom', s);
    el('div', 'gl-vs-arena-k', bottom, 'BATTLEGROUND');
    el('div', 'gl-vs-arena', bottom, info.arenaName.toUpperCase());
    el('div', 'gl-vs-arena-sub', bottom, info.arenaSubtitle);
    const fate = el('div', 'gl-vs-fate', bottom);
    fate.innerHTML = `Fate is undecided — <b style="color:${esc(mix(info.left.color, '#ffffff', 0.3))}">50%</b> · <b style="color:${esc(mix(info.right.color, '#ffffff', 0.3))}">50%</b>`;
    el('div', 'gl-vs-skip', s, 'CLICK OR PRESS SPACE TO SKIP');

    requestAnimationFrame(() => {
      for (const [card, f, side] of [[lc, info.left, 'left'], [rc, info.right, 'right']] as [HTMLElement, FighterCard, ScreenSide][]) {
        const cv = card.querySelector('canvas');
        if (cv) drawPortrait(cv as HTMLCanvasElement, { name: f.name, color: f.color, colorLight: f.colorLight, weaponId: f.weaponId, accessory: f.accessory, mirror: side === 'right' });
      }
    });

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.clearKeys();
        s.classList.add('gl-leave');
        window.setTimeout(() => s.remove(), 520);
        resolve();
      };
      this.later(finish, Math.max(600, durationMs));
      s.addEventListener('click', finish);
      this.onKey((e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      });
    });
  }

  private card(parent: HTMLElement, f: FighterCard, side: ScreenSide): HTMLElement {
    const card = el('div', `gl-card gl-card-${side}`, parent);
    setFighterColors(card, f.color, f.colorLight);
    const art = el('div', 'gl-card-art', card);
    el('canvas', 'gl-portrait', art);
    const body = el('div', 'gl-card-body', card);
    el('div', 'gl-card-name', body, f.name.toUpperCase()).dataset.text = f.name.toUpperCase();
    el('div', 'gl-card-title', body, f.title);
    const rows = el('div', 'gl-card-rows', body);
    for (const [k, v, b] of [['Aspect', f.aspectName, f.aspectBlurb], ['Weapon', f.weaponName, f.weaponBlurb], ['Nature', f.personalityName, f.personalityBlurb]]) {
      const r = el('div', 'gl-card-row', rows);
      el('span', 'gl-cr-k', r, k);
      el('span', 'gl-cr-v', r, v);
      el('span', 'gl-cr-b', r, b);
    }
    const abs = el('div', 'gl-card-abs', body);
    for (const a of f.abilities) {
      const r = el('div', 'gl-cab', abs);
      r.style.setProperty('--sc', SLOT_COLORS[a.slot] ?? '#ffffff');
      el('span', 'gl-cab-g', r, a.glyph);
      const tx = el('span', 'gl-cab-tx', r);
      el('span', 'gl-cab-n', tx, a.name);
      el('span', 'gl-cab-s', tx, (SLOT_LABELS[a.slot] ?? a.slot).toUpperCase());
      el('span', 'gl-cab-d', tx, a.description);
    }
    return card;
  }

  /* ------------------------------------------------------------------ */
  /* Results                                                            */
  /* ------------------------------------------------------------------ */

  showResults(summary: ResultsSummary, handlers: { onNext(): void; onReplay(): void; onRematch(): void }, autoNextSec: number | null): void {
    this.hideAll();
    const left = summary.winnerSide === 'left' ? summary.winner : summary.loser;
    const right = summary.winnerSide === 'left' ? summary.loser : summary.winner;
    const s = el('div', 'gl-screen gl-results', this.layer);
    setFighterColors(s, summary.winner.color, summary.winner.colorLight);
    el('div', 'gl-res-bg', s);
    const panel = el('div', 'gl-res-panel', s);

    // Banner.
    const banner = el('div', 'gl-res-banner', panel);
    el('div', 'gl-res-k', banner, 'VICTORIOUS');
    const name = el('div', 'gl-res-name', banner, summary.winner.name.toUpperCase());
    name.dataset.text = summary.winner.name.toUpperCase();
    el('div', 'gl-res-title', banner, summary.winner.title);
    const fin = el('div', 'gl-res-fin', banner);
    fin.innerHTML = `<span class="gl-res-fname">${esc(summary.finisherName)}</span><span class="gl-res-sep">◆</span><span>${esc(summary.methodLabel)}</span><span class="gl-res-sep">◆</span><span>${fmtDuration(summary.durationSec)}</span>`;
    if (summary.headline) el('div', 'gl-res-head', banner, summary.headline);
    el('div', 'gl-res-defeated', banner, `${summary.loser.name} has fallen`);

    const grid = el('div', 'gl-res-grid', panel);
    // Chart + story.
    const colA = el('div', 'gl-res-col gl-res-cola', grid);
    el('div', 'gl-res-h', colA, 'WIN PROBABILITY');
    const chartWrap = el('div', 'gl-chart-wrap', colA);
    const canvas = el('canvas', 'gl-chart', chartWrap);
    const tip = el('div', 'gl-chart-tip', chartWrap);
    el('div', 'gl-res-h', colA, 'THE STORY OF THE BATTLE');
    const list = el('ol', 'gl-moments', colA);
    const items: HTMLElement[] = [];
    summary.moments.forEach((m, i) => {
      const li = el('li', '', list);
      const col = m.side === 'left' ? left.color : m.side === 'right' ? right.color : '#ffffff';
      li.style.setProperty('--c', col);
      el('span', 'gl-m-i', li, String(i + 1));
      el('span', 'gl-m-t', li, fmtDuration(m.t));
      el('span', 'gl-m-x', li, m.text);
      items.push(li);
    });

    // Stats.
    const colB = el('div', 'gl-res-col gl-res-colb', grid);
    el('div', 'gl-res-h', colB, 'BATTLE STATISTICS');
    const table = el('table', 'gl-stats', colB);
    const thead = el('thead', '', table);
    const hr = el('tr', '', thead);
    const th1 = el('th', 'gl-st-l', hr, left.name);
    th1.style.color = mix(left.color, '#ffffff', 0.25);
    el('th', 'gl-st-m', hr, '');
    const th3 = el('th', 'gl-st-r', hr, right.name);
    th3.style.color = mix(right.color, '#ffffff', 0.25);
    const tb = el('tbody', '', table);
    for (const [label, lv, rv] of summary.stats) {
      const tr = el('tr', '', tb);
      const a = el('td', 'gl-st-l', tr, lv);
      el('td', 'gl-st-m', tr, label);
      const b = el('td', 'gl-st-r', tr, rv);
      const ln = statNumber(lv), rn = statNumber(rv);
      if (Number.isFinite(ln) && Number.isFinite(rn) && ln !== rn) {
        const lowerBetter = /taken|deaths|whiffed|got hit/i.test(label);
        const leftBetter = lowerBetter ? ln < rn : ln > rn;
        const win = leftBetter ? a : b;
        win.classList.add('gl-best');
        win.style.setProperty('--c', leftBetter ? left.color : right.color);
      }
    }
    el('div', 'gl-res-foot', colB, `Seed ${summary.seedCode} · ${summary.arenaName}`);

    // Actions.
    const actions = el('div', 'gl-res-actions', panel);
    const next = el('button', 'gl-btn gl-btn-primary gl-res-next', actions);
    next.type = 'button';
    let ringEl: SVGSVGElement | null = null;
    let countEl: HTMLElement | null = null;
    if (autoNextSec !== null && autoNextSec > 0) {
      const ringWrap = el('span', 'gl-ring-wrap', next);
      ringWrap.innerHTML = `<svg class="gl-ring" viewBox="0 0 36 36"><circle class="gl-ring-bg" cx="18" cy="18" r="15.5"/><circle class="gl-ring-fg" cx="18" cy="18" r="15.5" style="animation-duration:${autoNextSec}s"/></svg>`;
      ringEl = ringWrap.querySelector('svg');
      countEl = el('span', 'gl-ring-n', ringWrap, String(Math.ceil(autoNextSec)));
    }
    el('span', 'gl-btn-label', next, 'NEXT BATTLE');
    const replay = el('button', 'gl-btn gl-res-replay', actions, 'REPLAY');
    replay.type = 'button';
    replay.title = 'Watch this exact battle again';
    const rematch = el('button', 'gl-btn gl-res-rematch', actions, 'REMATCH');
    rematch.type = 'button';
    rematch.title = 'Same gods, new fate';

    let countdown = 0;
    const stopCountdown = () => {
      if (countdown) clearInterval(countdown);
      countdown = 0;
      ringEl?.closest('.gl-ring-wrap')?.classList.add('gl-ring-stop');
    };
    if (autoNextSec !== null && autoNextSec > 0) {
      const endAt = performance.now() + autoNextSec * 1000;
      countdown = window.setInterval(() => {
        const left = Math.max(0, (endAt - performance.now()) / 1000);
        if (countEl) countEl.textContent = String(Math.ceil(left));
        if (left <= 0) {
          stopCountdown();
          handlers.onNext();
        }
      }, 200);
      this.timers.push(countdown);
    }
    next.addEventListener('click', () => {
      stopCountdown();
      handlers.onNext();
    });
    replay.addEventListener('click', () => {
      stopCountdown();
      handlers.onReplay();
    });
    rematch.addEventListener('click', () => {
      stopCountdown();
      handlers.onRematch();
    });
    // Interacting with the panel (scrolling the story etc.) does not cancel; only buttons do.

    // Chart once laid out.
    const draw = (reveal: number) => {
      this.chart?.cancel();
      this.chart = renderWinChart(canvas, {
        timeline: summary.timeline, moments: summary.moments, duration: summary.durationSec,
        leftColor: left.color, rightColor: right.color, leftName: left.name, rightName: right.name,
      }, reveal);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => draw(1300)));
    let rt = 0;
    this.resizeHandler = () => {
      clearTimeout(rt);
      rt = window.setTimeout(() => draw(0), 120);
    };
    window.addEventListener('resize', this.resizeHandler);

    const showTip = (i: number) => {
      items.forEach((li, j) => li.classList.toggle('gl-hot', j === i));
      if (i < 0 || !this.chart) {
        tip.classList.remove('gl-on');
        return;
      }
      const pos = this.chart.markerPos(i);
      if (!pos) return;
      const m = summary.moments[i];
      tip.innerHTML = `<b>${fmtDuration(m.t)}</b> ${esc(m.text)}`;
      tip.style.left = `${pos.x}px`;
      tip.style.top = `${pos.y}px`;
      tip.classList.toggle('gl-tip-flip', pos.x > canvas.clientWidth * 0.6);
      tip.classList.add('gl-on');
    };
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      showTip(this.chart ? this.chart.hit(e.clientX - r.left, e.clientY - r.top) : -1);
    });
    canvas.addEventListener('mouseleave', () => showTip(-1));
    items.forEach((li, i) => {
      li.addEventListener('mouseenter', () => showTip(i));
      li.addEventListener('mouseleave', () => showTip(-1));
    });
    void rgba;
  }
}
