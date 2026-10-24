// UI controller: main menu, pause menu, garage, locations, settings, controls
// help, HUD and touch controls.

import type { Game } from '../game/game.ts';
import { TIME_SCALES } from '../game/game.ts';
import { VEHICLES, getVehicleDef, type VehicleDef } from '../sim/vehicle/defs.ts';
import { ZONES } from '../game/map/layout.ts';
import { TIMES } from '../render/renderer.ts';
import { HUD } from './hud.ts';
import { h, hex } from './dom.ts';
import { EditorUI } from './editor.ts';
import { TouchControls } from './touch.ts';

type Screen = 'main' | 'play' | 'pause' | 'garage' | 'teleport' | 'settings' | 'controls' | 'editor';

export class UI {
  private game: Game;
  private root: HTMLElement;
  readonly hud: HUD;
  private screen: Screen = 'main';
  private back: Screen = 'main';
  private main!: HTMLElement;
  private pause!: HTMLElement;
  private garage!: HTMLElement;
  private teleport!: HTMLElement;
  private settingsEl!: HTMLElement;
  private controls!: HTMLElement;
  private editor: EditorUI;
  private touch: TouchControls | null = null;
  private selVehicle: string;
  private selColor: number;
  private menuOrbit = 0;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.hud = new HUD(game);
    root.appendChild(this.hud.root);
    this.selVehicle = game.player?.def.id ?? 'meridian';
    this.selColor = game.player?.color ?? getVehicleDef(this.selVehicle).paint.color;
    this.buildMain();
    this.buildPause();
    this.buildGarage();
    this.buildTeleport();
    this.buildSettings();
    this.buildControls();
    this.editor = new EditorUI(game, root, () => this.show('play'));
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.touch = new TouchControls(game, root, () => this.show('pause'));
    }
    game.onNotice = (n) => this.hud.toast(n);
    game.onAction = (a) => {
      if (a === 'menu') this.onEscape();
      else if (a === 'help') this.show(this.screen === 'controls' ? 'play' : 'controls');
      else if (a === 'editor') this.show(this.screen === 'editor' ? 'play' : 'editor');
      else if (a === 'map') this.show(this.screen === 'teleport' ? 'play' : 'teleport');
      else if (a === 'nextVehicle') this.cycleVehicle();
    };
    this.show('main');
  }

  private onEscape(): void {
    switch (this.screen) {
      case 'main':
        break;
      case 'play':
        this.show('pause');
        break;
      case 'pause':
        this.show('play');
        break;
      case 'editor':
        this.show('play');
        break;
      default:
        this.show(this.back === 'main' ? 'main' : 'pause');
    }
  }

  show(s: Screen): void {
    const g = this.game;
    const prev = this.screen;
    if (s === 'garage' || s === 'teleport' || s === 'settings' || s === 'controls') {
      if (prev === 'main' || prev === 'pause' || prev === 'play') this.back = prev === 'play' ? 'pause' : prev;
    }
    this.screen = s;
    this.main.classList.toggle('hidden', s !== 'main');
    this.pause.classList.toggle('hidden', s !== 'pause');
    this.garage.classList.toggle('hidden', s !== 'garage');
    this.teleport.classList.toggle('hidden', s !== 'teleport');
    this.settingsEl.classList.toggle('hidden', s !== 'settings');
    this.controls.classList.toggle('hidden', s !== 'controls');
    this.hud.setVisible(s === 'play' || s === 'editor' || s === 'controls');
    // the editor panel takes the left side of the screen
    this.root.classList.toggle('editing', s === 'editor');
    g.inMenu = s !== 'play' && s !== 'controls' && s !== 'editor';
    this.editor.setActive(s === 'editor');
    g.editorActive = s === 'editor';
    this.touch?.setVisible(s === 'play');
    if (s === 'pause') this.pausedByMenu(true);
    else if (prev === 'pause' && s === 'play') this.pausedByMenu(false);
    if (s === 'main') g.rig.setMode('cinematic');
    if (s === 'play' && (g.rig.mode === 'cinematic' && prev === 'main')) g.rig.setMode('chase');
    if (s === 'garage') this.refreshGarage();
  }

  private wasPaused = false;
  private pausedByMenu(on: boolean): void {
    if (on) {
      this.wasPaused = this.game.paused;
      this.game.paused = true;
    } else {
      this.game.paused = this.wasPaused;
    }
  }

  update(dt: number): void {
    this.hud.update(dt);
    this.editor.update(dt);
    if (this.screen === 'main') this.menuOrbit += dt;
  }

  private cycleVehicle(): void {
    const ids = VEHICLES.map((v) => v.id);
    const cur = this.game.player?.def.id ?? ids[0];
    const next = ids[(ids.indexOf(cur) + 1) % ids.length];
    const def = getVehicleDef(next);
    this.game.spawnPlayer(next, def.paint.color);
    this.game.notify(def.name, 'info');
  }

  // ------------------------------------------------------------------ main menu
  private buildMain(): void {
    const start = () => {
      this.game.enableAudio();
      this.show('play');
    };
    this.main = h(
      'div',
      { id: 'mainmenu' },
      h(
        'div',
        { class: 'menu-box' },
        h('h1', { class: 'title' }, 'WRECK', h('span', {}, 'FIELD')),
        h('p', { class: 'tagline' }, 'Soft-body crash sandbox. Every panel bends, every window shatters, every wheel can be torn off.'),
        h(
          'div',
          { class: 'buttons' },
          h('button', { class: 'btn primary', onclick: start }, '▶  Drive'),
          h('button', { class: 'btn', onclick: () => { this.game.enableAudio(); this.show('garage'); } }, 'Garage'),
          h('button', { class: 'btn', onclick: () => { this.game.enableAudio(); this.show('teleport'); } }, 'Locations'),
          h('button', { class: 'btn', onclick: () => this.show('settings') }, 'Settings'),
          h('button', { class: 'btn', onclick: () => this.show('controls') }, 'Controls'),
        ),
        h('div', { class: 'foot' }, 'WASD / arrows to drive · Gamepad supported · Touch controls on mobile'),
      ),
    );
    this.root.appendChild(this.main);
  }

  // ------------------------------------------------------------------ pause
  private buildPause(): void {
    const g = this.game;
    const resume = () => this.show('play');
    this.pause = h(
      'div',
      { id: 'pause', class: 'overlay dim hidden' },
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Paused'),
        h('p', { class: 'sub' }, 'Physics is frozen while this menu is open.'),
        h(
          'div',
          { class: 'buttons' },
          h('button', { class: 'btn primary', onclick: resume }, 'Resume'),
          h('button', { class: 'btn', onclick: () => { g.resetPlayer(false); resume(); } }, 'Repair & reset car  ·  R'),
          h('button', { class: 'btn', onclick: () => this.show('garage') }, 'Garage  ·  change vehicle'),
          h('button', { class: 'btn', onclick: () => this.show('teleport') }, 'Locations  ·  teleport'),
          h('button', { class: 'btn', onclick: () => this.show('editor') }, 'Sandbox editor  ·  B'),
          h('button', { class: 'btn', onclick: () => { g.startDerby(); resume(); } }, 'Start demolition derby'),
          h('button', { class: 'btn', onclick: () => { g.spawnAI(); resume(); } }, 'Spawn AI rammer'),
          h('button', { class: 'btn', onclick: () => this.show('settings') }, 'Settings'),
          h('button', { class: 'btn', onclick: () => this.show('controls') }, 'Controls'),
          h('button', { class: 'btn ghost', onclick: () => this.show('main') }, 'Main menu'),
        ),
      ),
    );
    this.root.appendChild(this.pause);
  }

  // ------------------------------------------------------------------ garage
  private garageGrid!: HTMLElement;
  private swatchesEl!: HTMLElement;
  private buildGarage(): void {
    this.garageGrid = h('div', { class: 'garage-grid' });
    this.swatchesEl = h('div', { class: 'swatches' });
    const drive = () => {
      const g = this.game;
      if (g.player) g.spawnPlayer(this.selVehicle, this.selColor);
      this.show('play');
    };
    this.garage = h(
      'div',
      { id: 'garage', class: 'overlay dim hidden' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Garage'), h('p', { class: 'sub' }, 'Pick a vehicle and paint. Each has its own structure, powertrain and suspension.')), h('button', { class: 'btn ghost close-x', onclick: () => this.onEscape(), 'aria-label': 'Close' }, '✕')),
        this.garageGrid,
        h('div', { class: 'garage-foot' }, this.swatchesEl, h('button', { class: 'btn primary', onclick: drive }, 'Drive this car')),
      ),
    );
    this.root.appendChild(this.garage);
  }

  private refreshGarage(): void {
    this.garageGrid.replaceChildren(
      ...VEHICLES.map((d) => {
        const card = h(
          'button',
          { class: `vcard ${d.id === this.selVehicle ? 'selected' : ''}`, onclick: () => { this.selVehicle = d.id; this.selColor = d.paint.color; this.refreshGarage(); } },
          h('div', { class: 'cat' }, d.category),
          h('div', { class: 'name' }, d.name),
          h('div', { class: 'desc' }, d.description),
          silhouette(d, d.id === this.selVehicle ? this.selColor : d.paint.color),
          h(
            'div',
            { class: 'stats' },
            h('span', {}, 'Power ', h('b', {}, `${powerHp(d)} hp`)),
            h('span', {}, 'Mass ', h('b', {}, `${d.mass} kg`)),
            h('span', {}, 'Drive ', h('b', {}, d.drive)),
            h('span', {}, 'Engine ', h('b', {}, d.engine.name)),
          ),
        );
        return card;
      }),
    );
    const def = getVehicleDef(this.selVehicle);
    const custom = h('input', { type: 'color', class: 'swatch-custom', value: hex(this.selColor), title: 'Custom color', 'aria-label': 'Custom color' }) as HTMLInputElement;
    custom.addEventListener('input', () => {
      this.selColor = parseInt(custom.value.slice(1), 16);
    });
    this.swatchesEl.replaceChildren(
      h('span', { style: { color: 'var(--muted)', fontSize: '13px', marginRight: '4px' } }, 'Paint'),
      ...def.colors.map((c) =>
        h('button', { class: `swatch ${c === this.selColor ? 'selected' : ''}`, style: { background: hex(c) }, 'aria-label': hex(c), onclick: () => { this.selColor = c; this.refreshGarage(); } }),
      ),
      custom,
    );
  }

  // ------------------------------------------------------------------ teleport
  private buildTeleport(): void {
    const grid = h(
      'div',
      { class: 'zone-grid' },
      ...ZONES.map((z) =>
        h(
          'button',
          { class: 'zcard', style: { '--zc': z.color }, onclick: () => { this.game.teleport(z); this.show('play'); } },
          h('div', { class: 'name' }, z.name),
          h('div', { class: 'desc' }, z.description),
        ),
      ),
    );
    grid.querySelectorAll<HTMLElement>('.zcard').forEach((el, i) => el.style.setProperty('--zc', ZONES[i].color));
    this.teleport = h(
      'div',
      { id: 'teleport', class: 'overlay dim hidden' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Locations'), h('p', { class: 'sub' }, 'Teleport your car to any test zone. Press J in game to open this map.')), h('button', { class: 'btn ghost close-x', onclick: () => this.onEscape(), 'aria-label': 'Close' }, '✕')),
        grid,
      ),
    );
    this.root.appendChild(this.teleport);
  }

  // ------------------------------------------------------------------ settings
  private buildSettings(): void {
    const g = this.game;
    const s = () => g.settings;
    const seg = (options: [string, string | number][], get: () => string | number, set: (v: string | number) => void) => {
      const wrap = h('div', { class: 'seg' });
      const render = () => {
        wrap.replaceChildren(...options.map(([label, val]) => h('button', { class: get() === val ? 'on' : '', onclick: () => { set(val); render(); } }, label)));
      };
      render();
      return wrap;
    };
    const slider = (min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) => {
      const val = h('span', { class: 'val' }, fmt(get()));
      const inp = h('input', { type: 'range', min, max, step, value: get() }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        set(Number(inp.value));
        val.textContent = fmt(Number(inp.value));
      });
      return h('div', {}, inp, val);
    };
    const toggle = (get: () => boolean, set: (v: boolean) => void) => {
      const inp = h('input', { type: 'checkbox' }) as HTMLInputElement;
      inp.checked = get();
      inp.addEventListener('change', () => set(inp.checked));
      return h('label', { class: 'toggle' }, inp, h('span', {}));
    };
    const row = (label: string, hint: string, ctl: HTMLElement) => [h('label', {}, label, hint ? h('span', { class: 'hint' }, hint) : null), ctl];
    const form = h(
      'div',
      { class: 'form' },
      ...row('Graphics quality', 'Shadows, bloom, resolution and effects', seg([['Low', 'low'], ['Medium', 'medium'], ['High', 'high'], ['Ultra', 'ultra']], () => s().quality, (v) => g.applySettings({ quality: v as 'low' }))),
      ...row('Physics rate', 'Higher is more accurate but costs CPU', seg([['1000 Hz', 1000], ['1500 Hz', 1500], ['2000 Hz', 2000]], () => s().physicsHz, (v) => g.applySettings({ physicsHz: Number(v) }))),
      ...row('Time of day', '', seg(TIMES.map((t, i) => [t.name, i] as [string, number]), () => s().timeOfDay, (v) => g.applySettings({ timeOfDay: Number(v) }))),
      ...row('Damage multiplier', 'Applies to vehicles spawned or reset after the change', slider(0.3, 3, 0.1, () => s().fragility, (v) => g.applySettings({ fragility: v }), (v) => `×${v.toFixed(1)}`)),
      ...row('Gravity', '', slider(0.2, 2, 0.05, () => s().gravity, (v) => g.applySettings({ gravity: v }), (v) => `${v.toFixed(2)} g`)),
      ...row('Volume', '', slider(0, 1, 0.05, () => s().volume, (v) => g.applySettings({ volume: v }), (v) => `${Math.round(v * 100)}%`)),
      ...row('ABS', 'Anti-lock brakes', toggle(() => s().abs, (v) => g.applySettings({ abs: v }))),
      ...row('Traction control', '', toggle(() => s().tc, (v) => g.applySettings({ tc: v }))),
      ...row('Show performance', 'FPS and physics timing', toggle(() => s().showFps, (v) => g.applySettings({ showFps: v }))),
    );
    this.settingsEl = h(
      'div',
      { id: 'settings', class: 'overlay dim hidden' },
      h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Settings'), h('p', { class: 'sub' }, 'Changes apply instantly and are remembered.')), h('button', { class: 'btn ghost close-x', onclick: () => this.onEscape(), 'aria-label': 'Close' }, '✕')), form),
    );
    this.root.appendChild(this.settingsEl);
  }

  // ------------------------------------------------------------------ controls
  private buildControls(): void {
    const rows: [string, string][] = [
      ['Throttle / brake', 'W S  ·  ↑ ↓'],
      ['Steer', 'A D  ·  ← →'],
      ['Handbrake', 'Space'],
      ['Reverse', 'Hold S when stopped'],
      ['Repair & reset in place', 'R'],
      ['Reset to zone spawn', 'Backspace / Home'],
      ['Save / load position', 'K / L'],
      ['Change camera', 'C'],
      ['Free camera', 'F (WASD, Q/E, mouse)'],
      ['Orbit camera', 'Drag with mouse'],
      ['Slow motion', 'T  (×1, ×½, ×¼, ×0.1)'],
      ['Pause physics', 'P'],
      ['Headlights', 'N'],
      ['Manual gearbox', 'M  (E up, Q down)'],
      ['Engine on / off', 'I'],
      ['Horn', 'G'],
      ['Next vehicle', 'Tab'],
      ['Drop a random prop ahead', 'O'],
      ['Sandbox editor', 'B'],
      ['Locations map', 'J'],
      ['Menu', 'Esc'],
      ['Gamepad', 'RT/LT pedals · stick steer · A handbrake · Y reset · B camera'],
    ];
    this.controls = h(
      'div',
      { id: 'controls', class: 'overlay dim hidden' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Controls'), h('p', { class: 'sub' }, 'Drive into anything. Everything is physically simulated.')), h('button', { class: 'btn ghost close-x', onclick: () => this.onEscape(), 'aria-label': 'Close' }, '✕')),
        h('div', { class: 'keys' }, ...rows.map(([a, b]) => h('div', { class: 'row' }, h('span', {}, a), h('span', {}, ...b.split('  ').map((k, i) => [i ? ' ' : '', h('kbd', {}, k)]).flat())))),
      ),
    );
    this.root.appendChild(this.controls);
  }

  get currentScreen(): Screen {
    return this.screen;
  }
}

function powerHp(d: VehicleDef): number {
  let best = 0;
  for (const [rpm, t] of d.engine.torque) best = Math.max(best, (t * rpm * 2 * Math.PI) / 60);
  return Math.round(best / 745.7);
}

/** Side-view silhouette drawn from the body shape. */
function silhouette(d: VehicleDef, color: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 460;
  c.height = 140;
  const ctx = c.getContext('2d')!;
  const P = d.shape;
  const L = 5.6;
  const sx = (z: number) => 230 - (z / L) * 400;
  const sy = (y: number) => 128 - y * 52;
  ctx.fillStyle = hex(color);
  ctx.beginPath();
  const pts = [...P.top].sort((a, b) => b[0] - a[0]);
  ctx.moveTo(sx(pts[0][0]), sy(P.bottom[0][1]));
  for (const [z, y] of pts) ctx.lineTo(sx(z), sy(y));
  const bot = [...P.bottom].sort((a, b) => a[0] - b[0]);
  for (const [z, y] of bot) ctx.lineTo(sx(z), sy(y));
  ctx.closePath();
  ctx.fill();
  // windows
  ctx.fillStyle = 'rgba(10,16,24,0.85)';
  ctx.beginPath();
  const gh = pts.filter(([z]) => z <= P.zWindshieldBase + 0.01 && z >= P.zRearWindowBase - 0.01);
  if (gh.length > 1) {
    const belt = (z: number) => {
      let y = P.shoulder[0][1];
      for (const [zz, yy] of P.shoulder) if (zz <= z) y = yy;
      return y;
    };
    ctx.moveTo(sx(gh[0][0]), sy(belt(gh[0][0]) + 0.02));
    for (const [z, y] of gh) ctx.lineTo(sx(z) + (z === gh[0][0] ? -4 : 0), sy(y - 0.06));
    ctx.lineTo(sx(gh[gh.length - 1][0]), sy(belt(gh[gh.length - 1][0]) + 0.02));
    ctx.closePath();
    ctx.fill();
  }
  // wheels
  for (const za of [P.zFrontAxle, P.zRearAxle]) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(sx(za), sy(P.wheelY), P.wheelRadius * 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa3ab';
    ctx.beginPath();
    ctx.arc(sx(za), sy(P.wheelY), P.wheelRadius * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export { TIME_SCALES };
