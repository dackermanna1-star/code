import { formatDistance, formatSpeed, formatDuration } from '../core/mathutil';

export interface HudState {
  mode: string;
  frame: string;
  speed: number;
  altitude: number;
  gravity: number;
  target: string;
  targetDist: number;
  timeScale: number;
  date: string;
  fps: number;
  extra?: string;
}

/** Compact bottom-centre instrument strip and top-left status chips. */
export class Hud {
  readonly root: HTMLElement;
  private cells: Record<string, HTMLElement> = {};
  private top: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.top = document.createElement('div');
    this.top.className = 'hud-top';
    this.top.innerHTML = `<div class="panel hud-chip" id="hud-mode"></div><div class="panel hud-chip mono" id="hud-time"></div><div class="panel hud-chip mono dim" id="hud-perf"></div>`;
    const bottom = document.createElement('div');
    bottom.className = 'panel hud-bottom';
    for (const [k, label] of [['speed', 'Speed'], ['alt', 'Altitude'], ['grav', 'Gravity'], ['target', 'Target'], ['frame', 'Frame']]) {
      const c = document.createElement('div');
      c.className = 'hud-cell';
      c.innerHTML = `<div class="k">${label}</div><div class="v">—</div>`;
      bottom.appendChild(c);
      this.cells[k] = c.querySelector('.v') as HTMLElement;
    }
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'panel toast';
    this.toastEl.style.opacity = '0';
    const cross = document.createElement('div');
    cross.className = 'crosshair';
    this.root.append(this.top, bottom, this.toastEl, cross);
    parent.appendChild(this.root);
  }

  update(s: HudState) {
    (this.top.querySelector('#hud-mode') as HTMLElement).innerHTML = `<b>${s.mode}</b>`;
    const ts = s.timeScale === 0 ? 'paused' : s.timeScale === 1 ? 'real-time' : `×${s.timeScale.toExponential(0).replace('e+', 'e')}`;
    (this.top.querySelector('#hud-time') as HTMLElement).textContent = `${s.date}  ·  ${ts}`;
    (this.top.querySelector('#hud-perf') as HTMLElement).textContent = `${s.fps.toFixed(0)} fps${s.extra ? '  ·  ' + s.extra : ''}`;
    this.cells.speed.textContent = formatSpeed(s.speed);
    this.cells.alt.textContent = isFinite(s.altitude) ? formatDistance(s.altitude) : '—';
    this.cells.grav.textContent = s.gravity > 0 ? `${s.gravity.toFixed(2)} m/s²` : '—';
    this.cells.target.textContent = s.target ? `${s.target} · ${formatDistance(s.targetDist)}` : 'none';
    this.cells.frame.textContent = s.frame;
  }

  toast(msg: string, seconds = 3) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), seconds * 1000);
  }
}

export { formatDuration };
