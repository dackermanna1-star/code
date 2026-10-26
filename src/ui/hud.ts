// HTML overlay: crosshair, tool bar, health, stats, help and pause menu.
import { TOOL_NAMES } from '../game/tools';

const CSS = `
#hud { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #eceae4; user-select: none; }
#hud .xh { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; }
#hud .xh::before, #hud .xh::after { content: ''; position: absolute; background: rgba(255,255,255,.85); box-shadow: 0 0 2px #000; }
#hud .xh::before { left: 10px; top: 4px; width: 2px; height: 14px; }
#hud .xh::after { left: 4px; top: 10px; width: 14px; height: 2px; }
#hud .tools { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 6px; }
#hud .tool { padding: 6px 10px; background: rgba(15,17,20,.55); border: 1px solid rgba(255,255,255,.12); border-radius: 4px; font-size: 12px; letter-spacing: .02em; color: #c9c6be; min-width: 64px; text-align: center; }
#hud .tool b { color: #8f8b80; font-weight: 600; margin-right: 6px; }
#hud .tool.on { background: rgba(214,163,55,.88); color: #15130f; border-color: rgba(255,220,140,.9); }
#hud .tool.on b { color: #3d2f10; }
#hud .stats { position: absolute; right: 12px; top: 10px; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #cfcac0; text-align: right; background: rgba(10,11,13,.45); padding: 6px 9px; border-radius: 4px; white-space: pre; }
#hud .health { position: absolute; left: 18px; bottom: 22px; width: 180px; height: 8px; background: rgba(0,0,0,.45); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,.15); }
#hud .health i { display: block; height: 100%; background: linear-gradient(90deg, #c94d36, #e9a33c); }
#hud .hint { position: absolute; left: 18px; top: 14px; font-size: 12px; color: #d8d4ca; background: rgba(10,11,13,.45); padding: 6px 9px; border-radius: 4px; line-height: 1.5; }
#hud .menu { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, rgba(10,12,16,.55), rgba(5,6,8,.85)); pointer-events: auto; cursor: pointer; }
#hud .panel { max-width: 720px; padding: 28px 34px; background: rgba(18,20,24,.92); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
#hud .panel h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: .04em; color: #f0c25a; font-weight: 800; }
#hud .panel h2 { margin: 0 0 18px; font-size: 13px; color: #a7a397; font-weight: 500; }
#hud .grid { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 6px 14px; font-size: 13px; color: #d9d5cb; }
#hud .opts button { font: inherit; color: #f2efe8; background: #2a2d33; border: 1px solid #3c4048; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
#hud .opts button:hover { background: #353941; }
#hud .grid kbd { font: 12px ui-monospace, monospace; background: #2a2d33; border: 1px solid #3c4048; border-bottom-width: 2px; border-radius: 4px; padding: 1px 6px; color: #f2efe8; white-space: nowrap; }
#hud .go { margin-top: 20px; font-size: 15px; color: #f0c25a; font-weight: 700; text-align: center; letter-spacing: .03em; }
#hud .loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0d0f12; font-size: 14px; color: #bdb8ad; gap: 12px; }
#hud .bar { width: 320px; height: 6px; background: #22252b; border-radius: 3px; overflow: hidden; }
#hud .bar i { display: block; height: 100%; width: 0; background: #e2a93b; transition: width .1s; }
#hud .opts { margin-top: 14px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #b9b4a9; }
#hud .opts label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
#hud .opts select { background: #23262c; color: #e9e5dc; border: 1px solid #3a3e46; border-radius: 3px; font-size: 12px; }
#hud .vignette { position: absolute; inset: 0; pointer-events: none; }
`;

export class Hud {
  private root: HTMLElement;
  private toolsEl: HTMLElement;
  private statsEl: HTMLElement;
  private healthEl: HTMLElement;
  private menuEl: HTMLElement;
  private loadingEl: HTMLElement;
  private barEl: HTMLElement;
  private loadText: HTMLElement;
  private lastTool = -1;
  private statsT = 0;
  onStart: (() => void) | null = null;
  onSetting: ((k: string, v: string | boolean) => void) | null = null;

  constructor() {
    this.root = document.getElementById('hud')!;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root.innerHTML = `
      <div class="xh"></div>
      <div class="tools"></div>
      <div class="health"><i style="width:100%"></i></div>
      <div class="stats"></div>
      <div class="menu" style="display:none"><div class="panel">
        <h1>VOXEL TEARDOWN</h1>
        <h2>Industrial demolition sandbox &mdash; everything is made of 10&nbsp;cm voxels and everything breaks.</h2>
        <div class="grid">
          <kbd>W A S D</kbd><span>Move</span><kbd>Mouse</kbd><span>Look</span>
          <kbd>Shift</kbd><span>Sprint</span><kbd>Space</kbd><span>Jump</span>
          <kbd>C / Ctrl</kbd><span>Crouch</span><kbd>LMB</kbd><span>Use tool</span>
          <kbd>1 &ndash; 8</kbd><span>Select tool</span><kbd>Wheel</kbd><span>Cycle tools</span>
          <kbd>E</kbd><span>Grab / drop object</span><kbd>F</kbd><span>Toggle flashlight</span>
          <kbd>V</kbd><span>Fly (noclip)</span><kbd>T</kbd><span>Time of day</span>
          <kbd>R</kbd><span>Slow motion</span><kbd>Esc</kbd><span>Pause / menu</span>
          <kbd>F3</kbd><span>Stats overlay</span><span></span><span></span>
        </div>
        <div class="opts">
          <label>Quality <select data-k="quality"><option value="auto" selected>Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
          <label>Time <select data-k="env"><option value="afternoon">Afternoon</option><option value="sunset">Sunset</option><option value="overcast">Overcast</option><option value="night">Night</option></select></label>
          <label><input type="checkbox" data-k="stats"> Show stats</label>
          <button data-act="restart">Restart level</button>
        </div>
        <div class="go">Click to play</div>
      </div></div>
      <div class="loading"><div class="ltext">Building the factory&hellip;</div><div class="bar"><i></i></div></div>`;
    this.toolsEl = this.root.querySelector('.tools')!;
    this.statsEl = this.root.querySelector('.stats')!;
    this.healthEl = this.root.querySelector('.health i')!;
    this.menuEl = this.root.querySelector('.menu')!;
    this.loadingEl = this.root.querySelector('.loading')!;
    this.barEl = this.root.querySelector('.bar i')!;
    this.loadText = this.root.querySelector('.ltext')!;
    this.menuEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="restart"]')) { location.reload(); return; }
      if (t.closest('.opts')) return;
      this.onStart?.();
    });
    this.root.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('change', () => {
        const i = el as HTMLInputElement;
        this.onSetting?.(i.dataset.k!, i.type === 'checkbox' ? i.checked : i.value);
      });
    });
  }

  loading(frac: number, text?: string): void {
    this.barEl.style.width = `${Math.round(frac * 100)}%`;
    if (text) this.loadText.textContent = text;
  }
  doneLoading(): void { this.loadingEl.style.display = 'none'; }
  showMenu(on: boolean): void { this.menuEl.style.display = on ? 'flex' : 'none'; }
  showStats(on: boolean): void {
    this.statsEl.style.display = on ? 'block' : 'none';
    const cb = this.root.querySelector('[data-k="stats"]') as HTMLInputElement | null;
    if (cb) cb.checked = on;
  }
  /** Reflect the current setting values in the menu controls. */
  setOption(k: string, v: string): void {
    const el = this.root.querySelector(`[data-k="${k}"]`) as HTMLSelectElement | null;
    if (el) el.value = v;
  }

  update(dt: number, tool: number, health: number, stats: () => string): void {
    if (tool !== this.lastTool) {
      this.lastTool = tool;
      this.toolsEl.innerHTML = TOOL_NAMES.map((n, i) => `<div class="tool${i === tool ? ' on' : ''}"><b>${i + 1}</b>${n}</div>`).join('');
    }
    this.healthEl.style.width = `${Math.max(0, health)}%`;
    this.statsT -= dt;
    if (this.statsT <= 0) { this.statsT = 0.25; this.statsEl.textContent = stats(); }
  }
}
