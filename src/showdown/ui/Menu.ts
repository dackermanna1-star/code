import './menu.css';

export interface MenuSettings {
  diff: 'normal' | 'hard' | 'strongest';
  sens: number;
  manga: boolean;
  quality: 'high' | 'medium' | 'low';
  /** chosen by the player (otherwise the game may step it down on a slow machine) */
  qualitySet?: boolean;
  volume: number;
}

const KEY = 'sd-settings-v1';

export function loadSettings(): MenuSettings {
  const def: MenuSettings = { diff: 'hard', sens: 1, manga: false, quality: 'high', volume: 0.8 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return def;
}

export function saveSettings(s: MenuSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Title screen, difficulty select, pause and results. Plain DOM over the
 * live city behind it.
 */
export class Menu {
  readonly root: HTMLDivElement;
  settings = loadSettings();
  onStart: ((s: MenuSettings) => void) | null = null;
  onResume: (() => void) | null = null;
  onRetry: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onSettings: ((s: MenuSettings) => void) | null = null;
  onSound: ((name: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'sd-menu';
    parent.appendChild(this.root);
    // menus are laid out for ~900px of height and scaled to fit the window
    const fit = () => {
      const k = Math.max(0.5, Math.min(1.25, window.innerHeight / 900, window.innerWidth / 1300));
      this.root.style.setProperty('--k', k.toFixed(3));
    };
    fit();
    window.addEventListener('resize', fit);
  }

  private set(html: string, cls: string) {
    this.root.className = `sd-menu show ${cls}`;
    this.root.innerHTML = html;
  }

  hide() {
    this.root.className = 'sd-menu';
    this.root.innerHTML = '';
  }

  loading(k: number) {
    this.set(
      `<div class="sd-load"><div class="kanji">人外魔境新宿決戦</div><div class="bar"><i style="width:${Math.round(k * 100)}%"></i></div><div class="lbl">呪力を練っています… ${Math.round(k * 100)}%</div></div>`,
      'loading',
    );
  }

  title() {
    const d = this.settings.diff;
    this.set(
      `<div class="sd-title">
        <div class="date">十二月二十四日　正午　新宿</div>
        <div class="logo"><span class="a">人外魔境</span><span class="b">新宿決戦</span></div>
        <div class="sub">SHINJUKU SHOWDOWN</div>
        <div class="vs"><span class="g">五条悟</span><i>VS</i><span class="s">両面宿儺</span></div>
        <div class="diffs">
          <button data-d="normal" class="${d === 'normal' ? 'on' : ''}"><b>並</b><span>NORMAL</span></button>
          <button data-d="hard" class="${d === 'hard' ? 'on' : ''}"><b>強</b><span>HARD</span></button>
          <button data-d="strongest" class="${d === 'strongest' ? 'on' : ''}"><b>最強</b><span>THE STRONGEST</span></button>
        </div>
        <button class="start">開戦 <span>BEGIN</span></button>
        <div class="row">
          <label><input type="checkbox" class="manga" ${this.settings.manga ? 'checked' : ''}> 漫画モード <small>Manga mode (black &amp; white)</small></label>
          <label>感度 <small>Mouse</small> <input type="range" class="sens" min="0.3" max="2.5" step="0.05" value="${this.settings.sens}"></label>
          <label>画質 <small>Quality</small> <select class="quality"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        </div>
        <div class="keys">
          <span><b>WASD</b> move</span><span><b>SHIFT</b> dash</span><span><b>SPACE</b> jump / hold to float</span>
          <span><b>LMB</b> strike · hold for <b>黒閃</b></span><span><b>RMB</b> Red</span><span><b>Q</b> Blue</span>
          <span><b>R</b> Hollow Purple (hold)</span><span><b>Z</b> Domain</span><span><b>F</b> Reverse Cursed Technique</span>
          <span><b>ESC</b> pause</span>
        </div>
        <div class="fine">An unofficial fan tribute to Jujutsu Kaisen. Everything is procedurally built; no assets from the series are used.</div>
      </div>`,
      'title',
    );
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    (q<HTMLSelectElement>('.quality')).value = this.settings.quality;
    this.root.querySelectorAll<HTMLButtonElement>('.diffs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.diff = b.dataset.d as MenuSettings['diff'];
        this.root.querySelectorAll('.diffs button').forEach((x) => x.classList.toggle('on', x === b));
        this.onSound?.('uiMove');
      }),
    );
    q<HTMLInputElement>('.manga').addEventListener('change', (e) => {
      this.settings.manga = (e.target as HTMLInputElement).checked;
      this.onSettings?.(this.settings);
    });
    q<HTMLInputElement>('.sens').addEventListener('input', (e) => {
      this.settings.sens = Number((e.target as HTMLInputElement).value);
      this.onSettings?.(this.settings);
    });
    q<HTMLSelectElement>('.quality').addEventListener('change', (e) => {
      this.settings.quality = (e.target as HTMLSelectElement).value as MenuSettings['quality'];
      this.settings.qualitySet = true;
      saveSettings(this.settings);
      this.onSettings?.(this.settings);
    });
    q<HTMLButtonElement>('.start').addEventListener('click', () => {
      saveSettings(this.settings);
      this.onSound?.('uiSelect');
      this.onStart?.(this.settings);
    });
  }

  pause() {
    this.set(
      `<div class="sd-pause"><div class="h">一時停止</div><div class="en">PAUSED</div>
        <button class="resume">再開 <span>RESUME</span></button>
        <button class="retry">やり直す <span>RESTART</span></button>
        <button class="quit">タイトルへ <span>TITLE</span></button>
        <label><input type="checkbox" class="manga" ${this.settings.manga ? 'checked' : ''}> 漫画モード <small>Manga mode</small></label>
      </div>`,
      'pause',
    );
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    q<HTMLButtonElement>('.resume').addEventListener('click', () => this.onResume?.());
    q<HTMLButtonElement>('.retry').addEventListener('click', () => this.onRetry?.());
    q<HTMLButtonElement>('.quit').addEventListener('click', () => this.onQuit?.());
    q<HTMLInputElement>('.manga').addEventListener('change', (e) => {
      this.settings.manga = (e.target as HTMLInputElement).checked;
      saveSettings(this.settings);
      this.onSettings?.(this.settings);
    });
  }

  results(win: boolean, stats: { time: number; bf: number; bfBest: number; dmgTaken: number; techniques: number }, diffName: string) {
    const m = Math.floor(stats.time / 60);
    const s = Math.floor(stats.time % 60);
    // a grade from speed, Black Flashes and how little got through
    let score = 0;
    if (win) score += 50;
    score += Math.min(20, stats.bf * 4);
    score += Math.max(0, 20 - stats.dmgTaken / 60);
    score += Math.max(0, 10 - stats.time / 30);
    const grade = !win ? '—' : score > 85 ? '最強' : score > 72 ? 'S' : score > 60 ? 'A' : score > 50 ? 'B' : 'C';
    this.set(
      `<div class="sd-results ${win ? 'win' : 'lose'}">
        <div class="h">${win ? '勝利' : '敗北'}</div>
        <div class="en">${win ? 'VICTORY — THE STRONGEST STANDS' : 'DEFEAT — THE WORLD WAS CUT'}</div>
        <div class="grade">${grade}</div>
        <table>
          <tr><td>難易度 <small>Difficulty</small></td><td>${diffName}</td></tr>
          <tr><td>戦闘時間 <small>Time</small></td><td>${m}:${String(s).padStart(2, '0')}</td></tr>
          <tr><td>黒閃 <small>Black Flash</small></td><td>${stats.bf} <small>(best streak ${stats.bfBest})</small></td></tr>
          <tr><td>被ダメージ <small>Damage taken</small></td><td>${Math.round(stats.dmgTaken)}</td></tr>
          <tr><td>術式 <small>Techniques</small></td><td>${stats.techniques}</td></tr>
        </table>
        <button class="retry">もう一度 <span>FIGHT AGAIN</span></button>
        <button class="quit">タイトルへ <span>TITLE</span></button>
      </div>`,
      'results',
    );
    (this.root.querySelector('.retry') as HTMLButtonElement).addEventListener('click', () => this.onRetry?.());
    (this.root.querySelector('.quit') as HTMLButtonElement).addEventListener('click', () => this.onQuit?.());
  }

  /** The VS card over the intro's split-panel close-ups. */
  vsCard(show: boolean) {
    if (!show) {
      this.hide();
      return;
    }
    this.set(
      `<div class="sd-vs"><div class="l"><span class="t">現代最強の呪術師</span><span class="jp">五条悟</span><span class="en">SATORU GOJO</span></div>
       <div class="mid"><span class="vs">VS</span></div>
       <div class="r"><span class="t">呪いの王</span><span class="jp">両面宿儺</span><span class="en">RYOMEN SUKUNA</span></div>
       <div class="ttl">人外魔境新宿決戦</div></div>`,
      'vs',
    );
  }

  /** "Click to fight" when pointer lock is lost mid-fight. */
  clickToFight() {
    this.set(`<div class="sd-click">クリックで戦闘再開<span>CLICK TO FIGHT</span></div>`, 'click');
  }
}
