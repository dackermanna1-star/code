/**
 * Settings menu (Esc): graphics, interface & accessibility, simulation,
 * audio and remappable controls. Changes apply immediately and persist.
 */
import { Modal } from './modal';
import { ACTION_LABELS, DEFAULT_BINDINGS, type Action } from '../sim/input';
import { applyPreset, DEFAULT_SETTINGS, type Preset, type Settings } from './settings';

type Field =
  | { key: keyof Settings; label: string; type: 'range'; min: number; max: number; step: number; help?: string; fmt?: (v: number) => string }
  | { key: keyof Settings; label: string; type: 'toggle'; help?: string }
  | { key: keyof Settings; label: string; type: 'select'; options: [string, string][]; help?: string }
  | { key: keyof Settings; label: string; type: 'number'; help?: string };

const TABS: Record<string, Field[]> = {
  Graphics: [
    { key: 'preset', label: 'Quality preset', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], help: 'Sets the options below; tune them individually afterwards.' },
    { key: 'renderScale', label: 'Render resolution', type: 'range', min: 0.4, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'terrainDetail', label: 'Terrain detail', type: 'range', min: 1.5, max: 6, step: 0.1 },
    { key: 'atmosphereSteps', label: 'Atmosphere samples', type: 'range', min: 6, max: 48, step: 1 },
    { key: 'cloudSteps', label: 'Cloud samples', type: 'range', min: 12, max: 128, step: 4 },
    { key: 'galaxySteps', label: 'Galaxy samples', type: 'range', min: 12, max: 96, step: 4 },
    { key: 'surfaceDetail', label: 'Surface micro-detail', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'scatterDensity', label: 'Rocks & vegetation density', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'fov', label: 'Field of view', type: 'range', min: 30, max: 110, step: 1, fmt: (v) => `${v}°` },
    { key: 'exposureComp', label: 'Exposure compensation', type: 'range', min: -3, max: 3, step: 0.1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV` },
    { key: 'autoExposure', label: 'Automatic exposure (eye adaptation)', type: 'toggle' },
    { key: 'maxExposureLog', label: 'Dark adaptation limit', type: 'range', min: 3, max: 7, step: 0.1, help: 'How far the eye adapts in darkness (higher shows fainter stars).' },
    { key: 'starBrightness', label: 'Star brightness', type: 'range', min: 0.2, max: 4, step: 0.1 },
    { key: 'bloom', label: 'Glare / bloom', type: 'range', min: 0, max: 0.06, step: 0.002 },
    { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 0.6, step: 0.02 },
    { key: 'fxaa', label: 'Anti-aliasing (FXAA)', type: 'toggle' },
    { key: 'cinematic', label: 'Cinematic look', type: 'toggle', help: 'Stronger glare and vignette, letterbox in cinematic camera.' },
    { key: 'motionEffects', label: 'Motion effects (FTL streaks, shake)', type: 'toggle' },
    { key: 'dof', label: 'Depth of field', type: 'select', options: [['off', 'Off'], ['auto', 'Autofocus (centre of view)'], ['manual', 'Manual focus']], help: 'A thin lens on a full-frame sensor; its focal length follows the field of view, so narrow fields blur more.' },
    { key: 'fNumber', label: 'Aperture', type: 'range', min: 0.95, max: 22, step: 0.05, fmt: (v) => `f/${v.toFixed(1)}` },
    { key: 'focusDistance', label: 'Manual focus distance (m)', type: 'number' },
    { key: 'motionBlur', label: 'Motion blur', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => (v === 0 ? 'off' : `${Math.round(v * 360)}° shutter`), help: 'Exposure as a fraction of 1/24 s (180° is the film standard). Always off with Reduce motion.' },
    { key: 'chromaticAberration', label: 'Lens: chromatic aberration', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'filmGrain', label: 'Lens: film grain', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'screenshotScale', label: 'Screenshot resolution', type: 'select', options: [['1', 'Screen resolution'], ['2', '2× (supersampled)'], ['4', '4× (supersampled)']] },
  ],
  Interface: [
    { key: 'uiScale', label: 'Interface scale', type: 'range', min: 0.75, max: 1.75, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'uiOpacity', label: 'Interface opacity', type: 'range', min: 0.4, max: 1, step: 0.02 },
    { key: 'highContrast', label: 'High-contrast interface', type: 'toggle' },
    { key: 'colorblind', label: 'Colour-blind friendly palette', type: 'toggle' },
    { key: 'reduceMotion', label: 'Reduce motion', type: 'toggle', help: 'Disables screen shake, motion blur and FTL tunnel effects, shortens camera transitions.' },
    { key: 'showLabels', label: 'Show labels', type: 'toggle' },
    { key: 'showOrbits', label: 'Show orbits', type: 'toggle' },
    { key: 'mouseSensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05 },
    { key: 'invertY', label: 'Invert vertical look', type: 'toggle' },
  ],
  Simulation: [
    { key: 'defaultShip', label: 'Spacecraft', type: 'select', options: [['scout', 'Scout'], ['lander', 'Lander'], ['cruiser', 'Cruiser'], ['heavy', 'Heavy hauler'], ['experimental', 'Experimental (speculative)']] },
    { key: 'realisticFuel', label: 'Realistic fuel (Tsiolkovsky)', type: 'toggle' },
    { key: 'shipDamage', label: 'Ship damage', type: 'toggle', help: 'Hard landings and re-entry heating damage the ship.' },
    { key: 'ftlLimits', label: 'FTL range limits', type: 'toggle', help: 'Jump range and cooldown limits for the (speculative) jump drive.' },
    { key: 'lifeFrequency', label: 'Life frequency', type: 'range', min: 0, max: 5, step: 0.1, help: 'Multiplier on the (already low) chance of life. Applies to newly generated systems.' },
    { key: 'knownUniverse', label: 'Known Universe (real catalogue data)', type: 'toggle', help: 'Off: a fully procedural universe. Takes effect on new journey.' },
    { key: 'universeSeed', label: 'Universe seed', type: 'number', help: 'Takes effect on new journey.' },
  ],
  Audio: [
    { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.02 },
    { key: 'ambienceVolume', label: 'Ambience', type: 'range', min: 0, max: 1, step: 0.02 },
    { key: 'effectsVolume', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.02 },
    { key: 'cinematicAudio', label: 'Cinematic audio in vacuum', type: 'toggle', help: 'Off: realistic silence in vacuum except sounds carried through the ship\'s hull.' },
  ],
};

const GROUPS: [string, Action[]][] = [
  ['Movement', ['forward', 'back', 'left', 'right', 'up', 'down', 'rollLeft', 'rollRight', 'boost', 'slow', 'jump', 'run']],
  ['Navigation', ['select', 'gotoTarget', 'frameTarget', 'orbitCam', 'scan', 'search', 'map', 'catalog', 'bookmark', 'info', 'labels', 'orbits']],
  ['Spacecraft', ['spawnShip', 'interact', 'throttleUp', 'throttleDown', 'throttleFull', 'throttleCut', 'flightAssist', 'gear', 'autopilot', 'land', 'brake', 'warp', 'hyperjump', 'cameraView', 'dock', 'shuttle']],
  ['Time & interface', ['timeFaster', 'timeSlower', 'timeReal', 'timePause', 'menu', 'help', 'hideUI', 'screenshot', 'mouseLook']],
  ['Cinematic camera', ['cinema', 'pathAdd', 'pathPlay', 'orbitCam']],
];

export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Mouse0') return 'Left click';
  if (code === 'Mouse1') return 'Middle click';
  if (code === 'Mouse2') return 'Right click';
  const map: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', AltLeft: 'L-Alt', AltRight: 'R-Alt', ControlLeft: 'L-Ctrl', Backquote: '`', Period: '.', Comma: ',', Slash: '/',
    Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num −', Backspace: 'Backspace', Escape: 'Esc', Tab: 'Tab', Pause: 'Pause',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  };
  return map[code] ?? code;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class SettingsMenu {
  readonly modal: Modal;
  private tab = 'Graphics';
  private capturing: Action | null = null;
  onChange: (key: keyof Settings | 'bindings') => void = () => {};
  extraButtons: { label: string; run: () => void }[] = [];

  constructor(parent: HTMLElement, readonly settings: Settings) {
    this.modal = new Modal(parent, 'Settings', 'settings-modal');
    this.modal.header.innerHTML = `<div class="tabs" role="tablist">${[...Object.keys(TABS), 'Controls'].map((t) => `<button role="tab" data-tab="${t}">${t}</button>`).join('')}</div>`;
    this.modal.header.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (t) { this.tab = t.dataset.tab!; this.render(); }
    });
    this.modal.onOpen = () => this.render();
    this.modal.content.addEventListener('input', (e) => this.onInput(e));
    this.modal.content.addEventListener('click', (e) => this.onClick(e as MouseEvent));
    window.addEventListener('keydown', (e) => {
      if (!this.capturing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') this.bind(this.capturing, e.code);
      this.capturing = null;
      this.render();
    }, true);
    this.modal.content.addEventListener('mousedown', (e) => {
      if (!this.capturing || (e.target as HTMLElement).dataset.bind) return;
      this.bind(this.capturing, `Mouse${e.button}`);
      this.capturing = null;
      this.render();
    });
  }

  get capturingKey() {
    return this.capturing !== null;
  }

  private bind(a: Action, code: string) {
    // a key used elsewhere is removed from the other action, except shared defaults (e.g. Space)
    this.settings.bindings[a] = [code];
    this.onChange('bindings');
  }

  render() {
    for (const b of this.modal.header.querySelectorAll('[data-tab]')) b.classList.toggle('active', (b as HTMLElement).dataset.tab === this.tab);
    const s = this.settings as unknown as Record<string, unknown>;
    let html = '';
    if (this.tab === 'Controls') {
      for (const [g, actions] of GROUPS) {
        html += `<h3>${g}</h3><div class="binds">`;
        for (const a of actions) {
          const codes = this.settings.bindings[a] ?? [];
          const conflict = codes.some((c) => Object.entries(this.settings.bindings).some(([o, cs]) => o !== a && cs.includes(c) && !(DEFAULT_BINDINGS[o as Action] ?? []).includes(c)));
          html += `<div class="bind-row"><span>${esc(ACTION_LABELS[a])}</span>
            <button data-bind="${a}" class="${this.capturing === a ? 'capturing' : ''}${conflict ? ' conflict' : ''}" title="Click, then press a key or mouse button (Esc cancels)">
              ${this.capturing === a ? 'press a key…' : codes.map(keyName).join(' / ') || 'unbound'}</button></div>`;
        }
        html += '</div>';
      }
      html += `<div class="row-btns"><button data-reset-binds>Reset controls to defaults</button></div>`;
    } else {
      for (const f of TABS[this.tab]) {
        const v = s[f.key];
        html += `<div class="field"><label for="f-${f.key}">${esc(f.label)}</label><div class="ctl">`;
        if (f.type === 'range') {
          html += `<input id="f-${f.key}" name="${f.key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" /><output>${f.fmt ? f.fmt(v as number) : (+(v as number)).toFixed(f.step < 0.01 ? 3 : f.step < 1 ? 2 : 0)}</output>`;
        } else if (f.type === 'toggle') {
          html += `<input id="f-${f.key}" name="${f.key}" type="checkbox" ${v ? 'checked' : ''} />`;
        } else if (f.type === 'select') {
          html += `<select id="f-${f.key}" name="${f.key}">${f.options.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        } else {
          html += `<input id="f-${f.key}" name="${f.key}" type="number" value="${v}" />`;
        }
        html += `</div>${f.help ? `<div class="help dim">${esc(f.help)}</div>` : ''}</div>`;
      }
      html += `<div class="row-btns"><button data-reset-tab>Reset ${this.tab.toLowerCase()} to defaults</button>${this.extraButtons.map((b, i) => `<button data-extra="${i}">${esc(b.label)}</button>`).join('')}</div>`;
    }
    this.modal.content.innerHTML = html;
  }

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el.name as keyof Settings;
    if (!key) return;
    const s = this.settings as unknown as Record<string, unknown>;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') s[key] = el.checked;
    else if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) s[key] = +el.value;
    else s[key] = el.value;
    if (key === 'preset') {
      applyPreset(this.settings, el.value as Preset);
      this.onChange('preset');
      this.render();
      return;
    }
    const out = el.parentElement?.querySelector('output');
    if (out) {
      const f = TABS[this.tab].find((x) => x.key === key);
      if (f?.type === 'range') out.textContent = f.fmt ? f.fmt(+el.value) : (+el.value).toFixed(f.step < 0.01 ? 3 : f.step < 1 ? 2 : 0);
    }
    this.onChange(key);
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.dataset.bind) {
      this.capturing = t.dataset.bind as Action;
      this.render();
    } else if (t.dataset.resetBinds !== undefined) {
      this.settings.bindings = structuredClone(DEFAULT_BINDINGS);
      this.onChange('bindings');
      this.render();
    } else if (t.dataset.resetTab !== undefined) {
      const d = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
      const s = this.settings as unknown as Record<string, unknown>;
      for (const f of TABS[this.tab]) {
        s[f.key] = d[f.key];
        this.onChange(f.key);
      }
      this.render();
    } else if (t.dataset.extra !== undefined) {
      this.extraButtons[+t.dataset.extra]?.run();
    }
  }
}

/** Controls reference (F1), generated from the current bindings. */
export class HelpOverlay {
  readonly modal: Modal;

  constructor(parent: HTMLElement, private settings: Settings) {
    this.modal = new Modal(parent, 'Controls & help', 'help-modal');
    this.modal.onOpen = () => this.render();
  }

  private k(a: Action) {
    return (this.settings.bindings[a] ?? []).slice(0, 2).map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join(' ');
  }

  render() {
    const k = (a: Action) => this.k(a);
    this.modal.content.innerHTML = `
      <div class="help-cols">
        <section><h3>Free camera (spectator)</h3><dl>
          <dt>${k('forward')} ${k('left')} ${k('back')} ${k('right')}</dt><dd>Fly; speed scales with distance to the nearest surface</dd>
          <dt>${k('up')} / ${k('down')}</dt><dd>Up / down</dd><dt>${k('rollLeft')} ${k('rollRight')}</dt><dd>Roll</dd>
          <dt>Drag / ${k('mouseLook')}</dt><dd>Look around (mouse look toggle)</dd>
          <dt>${k('boost')} · ${k('slow')} · wheel</dt><dd>×10 · ×0.1 · speed multiplier</dd>
          <dt>Click</dt><dd>Select object</dd><dt>${k('gotoTarget')}</dt><dd>Travel to selection</dd>
          <dt>${k('frameTarget')}</dt><dd>Look at selection</dd><dt>${k('orbitCam')}</dt><dd>Orbit camera around selection</dd>
          <dt>${k('scan')}</dt><dd>Scientific scan of selection (must be in range); on a surface, field instruments</dd>
        </dl></section>
        <section><h3>Spacecraft</h3><dl>
          <dt>${k('spawnShip')}</dt><dd>Spawn / board ship (lands it if you are near the ground)</dd>
          <dt>${k('forward')} / ${k('back')}</dt><dd>Throttle up / down (main engine)</dd>
          <dt>${k('left')} ${k('right')} ${k('up')} ${k('down')}</dt><dd>RCS translation</dd>
          <dt>Mouse · ${k('rollLeft')} ${k('rollRight')}</dt><dd>Pitch & yaw · roll</dd>
          <dt>${k('throttleFull')} / ${k('throttleCut')}</dt><dd>Full / cut throttle</dd>
          <dt>${k('flightAssist')}</dt><dd>Flight assist (kills rotation)</dd><dt>${k('frameTarget')}</dt><dd>Hover / landing assist (WASD = ground velocity)</dd>
          <dt>${k('gear')}</dt><dd>Landing gear</dd><dt>${k('autopilot')}</dt><dd>Autopilot: approach selection</dd>
          <dt>${k('land')}</dt><dd>Autopilot: land below</dd><dt>${k('brake')}</dt><dd>Match surface velocity</dd>
          <dt>${k('warp')}</dt><dd>Warp drive — <i>speculative fiction</i></dd>
          <dt>${k('hyperjump')}</dt><dd>Hyperspace jump to selected star/galaxy — <i>speculative fiction</i></dd>
          <dt>${k('cameraView')}</dt><dd>Chase / cockpit / orbit view</dd>
          <dt>${k('interact')}</dt><dd>Exit ship when landed · board when next to it</dd>
          <dt>${k('dock')}</dt><dd>Auto-dock with the nearest port (within 5 km) · undock. Near a port ${k('forward')}/${k('back')} fire fore/aft thrusters and ${k('brake')} matches the target's velocity</dd>
          <dt>${k('shuttle')}</dt><dd>Cruiser / heavy explorer: launch the shuttle (the mothership stays in orbit) · docked in its berth: stow it and take command again</dd>
        </dl></section>
        <section><h3>On foot</h3><dl>
          <dt>${k('forward')} ${k('left')} ${k('back')} ${k('right')}</dt><dd>Walk (gravity and traction depend on the world)</dd>
          <dt>${k('run')}</dt><dd>Run</dd><dt>${k('jump')}</dt><dd>Jump / swim up</dd><dt>${k('interact')}</dt><dd>Board ship</dd>
        </dl>
        <h3>Navigation & time</h3><dl>
          <dt>${k('search')}</dt><dd>Search</dd><dt>${k('map')}</dt><dd>3D map</dd><dt>${k('catalog')}</dt><dd>Discovery catalogue</dd>
          <dt>${k('bookmark')}</dt><dd>Bookmark location</dd><dt>${k('info')}</dt><dd>Info panel</dd>
          <dt>${k('labels')} · ${k('orbits')}</dt><dd>Labels · orbits</dd>
          <dt>${k('timeFaster')} ${k('timeSlower')} ${k('timeReal')} ${k('timePause')}</dt><dd>Time ×10, ÷10, real-time, pause</dd>
          <dt>${k('screenshot')}</dt><dd>Screenshot</dd><dt>${k('hideUI')}</dt><dd>Hide interface</dd><dt>${k('menu')}</dt><dd>Menu & settings</dd>
          <dt>${k('cinema')} · ${k('pathAdd')} · ${k('pathPlay')}</dt><dd>Camera paths: panel · add keyframe · play/stop</dd>
        </dl></section>
      </div>
      <p class="dim">Everything you see follows physical models: appearance emerges from mass, composition, temperature and atmosphere.
      Catalogued objects use real data; everything else is procedural. Warp and hyperspace are speculative fiction and labelled as such.</p>`;
  }
}
