// Main menu, game mode selection, options, pause, death and victory screens.
import { drawMenuBackdrop } from '../render/art/logo';
import { Input, Action, DEFAULT_BINDINGS, keyLabel } from '../core/input';
import { audio } from '../audio/audio';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  master: number;
  sfx: number;
  music: number;
  pixelScale: number;
  fov: number;
  renderDistance: number;
}

const DEFAULT_SETTINGS: Settings = { sensitivity: 0.0022, invertY: false, master: 0.8, sfx: 1, music: 0.7, pixelScale: 2, fov: 75, renderDistance: 7 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('noita3d.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem('noita3d.settings', JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export interface MenuCallbacks {
  newGame: (seed: number | null, sandbox: boolean) => void;
  resume: () => void;
  quitToMenu: () => void;
  settingsChanged: (s: Settings) => void;
  hasRun: () => boolean;
  /** Summary of a run saved with Save & Quit, if any. */
  savedRun: () => { depth: number; elapsed: number; seed: number } | null;
  loadSaved: () => void;
  saveAndQuit: () => void;
}

export class Menus {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private panel: HTMLDivElement;
  private raf = 0;
  private t0 = performance.now();
  screen: 'main' | 'mode' | 'options' | 'controls' | 'pause' | 'dead' | 'won' | 'credits' | 'none' = 'none';
  private back: 'main' | 'pause' = 'main';
  settings: Settings;
  private rebinding: Action | null = null;

  constructor(parent: HTMLElement, private input: Input, private cb: MenuCallbacks) {
    this.settings = loadSettings();
    this.root = document.createElement('div');
    this.root.className = 'menus';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-bg';
    this.ctx = this.canvas.getContext('2d')!;
    this.panel = document.createElement('div');
    this.panel.className = 'menu-panel';
    this.root.append(this.canvas, this.panel);
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.rebinding) {
        e.preventDefault();
        this.input.bindings[this.rebinding] = [e.code];
        this.input.saveBindings();
        this.rebinding = null;
        this.show('controls');
      }
    });
  }

  private animate = () => {
    if (this.screen === 'main' || this.screen === 'mode' || this.screen === 'credits' || ((this.screen === 'options' || this.screen === 'controls') && this.back === 'main')) {
      const w = window.innerWidth, h = window.innerHeight;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      drawMenuBackdrop(this.ctx, w, h, (performance.now() - this.t0) / 1000);
      this.canvas.style.display = '';
    } else this.canvas.style.display = 'none';
    this.raf = requestAnimationFrame(this.animate);
  };

  show(screen: Menus['screen'], data?: Record<string, string | number>): void {
    this.screen = screen;
    cancelAnimationFrame(this.raf);
    if (screen === 'none') {
      this.root.classList.add('hidden');
      return;
    }
    this.root.classList.remove('hidden');
    this.raf = requestAnimationFrame(this.animate);
    const btn = (id: string, label: string) => `<div class="mi" data-id="${id}">${label}</div>`;
    let html = '';
    switch (screen) {
      case 'main':
        this.back = 'main';
        html = `<div class="logo">Noita</div><div class="logo-sub">3D</div><div class="menu-list">
          ${this.cb.hasRun() ? btn('resume', 'Continue') : this.savedRunButton()}${btn('mode', 'New Game')}${btn('options', 'Options')}${btn('controls', 'Controls')}${btn('credits', 'Credits')}</div>
          <div class="build">Noita 3D — a first-person voxel reinterpretation · build ${__BUILD__}</div>`;
        break;
      case 'mode':
        html = `<div class="mode-title">Select game mode</div><div class="mode-box noita-panel">
          <div class="modes">
            <div class="mode sel" data-mode="new"><div class="mt">New Game</div><div class="md">Explore a new world.<br>The original Noita experience, rebuilt in 3D.</div></div>
            <div class="mode" data-mode="seed"><div class="mt">Seeded run</div><div class="md">Enter a world seed to replay or share a world.<br><input id="seed-in" placeholder="seed" maxlength="10"></div></div>
            <div class="mode" data-mode="sandbox"><div class="mt">Sandbox</div><div class="md">A new world with developer tools enabled (F3 stats, F4 tool palette): spawn materials, enemies and explosions.</div></div>
          </div>
          <div class="mode-go">${btn('start', 'Start')}</div></div>${btn('back', 'Return')}`;
        break;
      case 'options': {
        const s = this.settings;
        const range = (id: string, label: string, min: number, max: number, step: number, v: number) =>
          `<label class="opt"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><b id="${id}-v">${v}</b></label>`;
        html = `<div class="mode-title">Options</div><div class="opts noita-panel">
          ${range('o-sens', 'Mouse sensitivity', 0.0005, 0.006, 0.0001, s.sensitivity)}
          <label class="opt"><span>Invert mouse Y</span><input type="checkbox" id="o-inv" ${s.invertY ? 'checked' : ''}></label>
          ${range('o-fov', 'Field of view', 60, 100, 1, s.fov)}
          ${range('o-pix', 'Pixel size (render scale divisor)', 1, 4, 0.5, s.pixelScale)}
          ${range('o-rd', 'Render distance (chunks)', 4, 10, 1, s.renderDistance)}
          ${range('o-master', 'Master volume', 0, 1.2, 0.05, s.master)}
          ${range('o-sfx', 'Effects volume', 0, 1.2, 0.05, s.sfx)}
          ${range('o-music', 'Ambience volume', 0, 1.2, 0.05, s.music)}
          <label class="opt"><span>Tutorial hints</span><b class="rebind" id="o-hints">show again</b></label>
        </div>${btn('back', 'Return')}`;
        break;
      }
      case 'controls': {
        const actions = Object.keys(DEFAULT_BINDINGS) as Action[];
        html = `<div class="mode-title">Controls</div><div class="opts noita-panel controls">
          <div class="crow"><span>Cast / pour</span><b>Left mouse</b></div><div class="crow"><span>Throw flask</span><b>Right mouse</b></div>
          <div class="crow"><span>Select wand / item</span><b>Mouse wheel</b></div>
          ${actions.map((a) => `<div class="crow"><span>${a}</span><b class="rebind" data-act="${a}">${this.rebinding === a ? 'press a key…' : this.input.bindings[a].map(keyLabel).join(', ')}</b></div>`).join('')}
          <div class="crow small">Click a binding to change it.</div>
        </div>${btn('reset', 'Reset to defaults')}${btn('back', 'Return')}`;
        break;
      }
      case 'credits':
        html = `<div class="mode-title">Credits</div><div class="opts noita-panel credits">
          <p>A fan-made, non-commercial 3D reinterpretation of <b>Noita</b> by Nolla Games (Petri Purho, Arvi Teikari, Olli Harjola).</p>
          <p>Mechanics and numbers researched from noita.wiki.gg. All art, audio and code here are generated procedurally.</p>
          <p>Fonts: Pixelify Sans, Jacquard 12, Silkscreen (SIL Open Font License). Engine: three.js.</p></div>${btn('back', 'Return')}`;
        break;
      case 'pause':
        this.back = 'pause';
        html = `<div class="pause-title">Paused</div><div class="menu-list">${btn('resume', 'Resume')}${btn('options', 'Options')}${btn('controls', 'Controls')}${btn('save', 'Save & quit')}${btn('mode', 'New Game')}${btn('quit', 'Quit without saving')}</div>`;
        break;
      case 'dead':
        html = `<div class="death"><div class="dt">You died</div>
          <div class="ds">${data?.cause ? `Cause: ${data.cause}<br>` : ''}Depth ${data?.depth ?? 0} · ${data?.biome ?? ''}<br>Time ${fmtTime(Number(data?.time ?? 0))} · Gold ${data?.gold ?? 0} · Kills ${data?.kills ?? 0}<br>Seed ${data?.seed ?? ''}</div>
          <div class="menu-list">${btn('again', 'Start a new run')}${btn('sameseed', 'Retry this world')}${btn('quit', 'Main menu')}</div></div>`;
        break;
      case 'won':
        html = `<div class="death won"><div class="dt">The Work is complete</div>
          <div class="ds">You claimed the Sampo from the depths.<br>Time ${fmtTime(Number(data?.time ?? 0))} · Gold ${data?.gold ?? 0} · Kills ${data?.kills ?? 0}</div>
          <div class="menu-list">${btn('again', 'Start a new run')}${btn('quit', 'Main menu')}</div></div>`;
        break;
    }
    this.panel.className = `menu-panel s-${screen}`;
    this.panel.innerHTML = html;
    this.wire(screen, data);
  }

  private savedRunButton(): string {
    const s = this.cb.savedRun();
    if (!s) return '';
    return `<div class="mi" data-id="load">Continue<span class="mi-sub">depth ${s.depth} m · ${fmtTime(s.elapsed)}</span></div>`;
  }

  private wire(screen: Menus['screen'], data?: Record<string, string | number>): void {
    let mode = 'new';
    this.panel.querySelectorAll('.mi').forEach((el) => {
      el.addEventListener('mouseenter', () => audio.play('ui_hover', { volume: 0.25 }));
      el.addEventListener('click', () => {
        audio.unlock();
        audio.play('ui_click', { volume: 0.5 });
        const id = (el as HTMLElement).dataset.id;
        switch (id) {
          case 'resume': this.cb.resume(); break;
          case 'load': this.cb.loadSaved(); break;
          case 'save': this.cb.saveAndQuit(); break;
          case 'mode': this.show('mode'); break;
          case 'options': this.show('options'); break;
          case 'controls': this.show('controls'); break;
          case 'credits': this.show('credits'); break;
          case 'back': this.show(this.back === 'pause' && screen !== 'mode' ? 'pause' : 'main'); break;
          case 'quit': this.cb.quitToMenu(); break;
          case 'again': this.cb.newGame(null, false); break;
          case 'sameseed': this.cb.newGame(Number(data?.seed ?? 0), false); break;
          case 'reset':
            this.input.bindings = { ...DEFAULT_BINDINGS };
            this.input.saveBindings();
            this.show('controls');
            break;
          case 'start': {
            const seedStr = (this.panel.querySelector('#seed-in') as HTMLInputElement | null)?.value.trim();
            const seed = mode === 'seed' && seedStr ? (parseInt(seedStr, 10) >>> 0 || hashStr(seedStr)) : null;
            this.cb.newGame(seed, mode === 'sandbox');
            break;
          }
        }
      });
    });
    this.panel.querySelectorAll('.mode').forEach((el) =>
      el.addEventListener('click', () => {
        this.panel.querySelectorAll('.mode').forEach((m) => m.classList.remove('sel'));
        el.classList.add('sel');
        mode = (el as HTMLElement).dataset.mode!;
      }),
    );
    if (screen === 'options') {
      const s = this.settings;
      const bind = (id: string, key: keyof Settings) => {
        const el = this.panel.querySelector('#' + id) as HTMLInputElement;
        el.addEventListener('input', () => {
          (s[key] as number) = parseFloat(el.value);
          (this.panel.querySelector('#' + id + '-v') as HTMLElement).textContent = el.value;
          saveSettings(s);
          this.cb.settingsChanged(s);
        });
      };
      bind('o-sens', 'sensitivity');
      bind('o-fov', 'fov');
      bind('o-pix', 'pixelScale');
      bind('o-rd', 'renderDistance');
      bind('o-master', 'master');
      bind('o-sfx', 'sfx');
      bind('o-music', 'music');
      const hints = this.panel.querySelector('#o-hints') as HTMLElement;
      hints.addEventListener('click', () => {
        try {
          localStorage.removeItem('noita3d.hints');
        } catch {
          /* ignore */
        }
        hints.textContent = 'will show next run';
      });
      (this.panel.querySelector('#o-inv') as HTMLInputElement).addEventListener('change', (e) => {
        s.invertY = (e.target as HTMLInputElement).checked;
        saveSettings(s);
        this.cb.settingsChanged(s);
      });
    }
    if (screen === 'controls') {
      this.panel.querySelectorAll('.rebind').forEach((el) =>
        el.addEventListener('click', () => {
          this.rebinding = (el as HTMLElement).dataset.act as Action;
          (el as HTMLElement).textContent = 'press a key…';
        }),
      );
    }
  }
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

declare const __BUILD__: string;
