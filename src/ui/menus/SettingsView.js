// Settings form (game.settings → game.applySettings()) and the keybinding reference.
import { h, clear } from '../dom.js';

const DEFAULTS = {
  sensitivity: 1, fov: 75, renderDistance: 8, quality: 'medium', masterVolume: 0.8, sfxVolume: 1, musicVolume: 0.6,
  invertY: false, showFps: false, headBob: true,
};

const SCHEMA = [
  { group: 'Controls', items: [
    { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×' },
    { key: 'invertY', label: 'Invert mouse Y', type: 'toggle' },
  ] },
  { group: 'Video', items: [
    { key: 'fov', label: 'Field of view', type: 'range', min: 60, max: 110, step: 1, fmt: (v) => Math.round(v) + '°' },
    { key: 'renderDistance', label: 'Render distance', type: 'range', min: 4, max: 16, step: 1, fmt: (v) => `${Math.round(v)} chunks`, lazy: true },
    { key: 'quality', label: 'Graphics quality', type: 'choice', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
    { key: 'headBob', label: 'View bobbing', type: 'toggle' },
    { key: 'showFps', label: 'Show FPS counter', type: 'toggle' },
  ] },
  { group: 'Audio', items: [
    { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'sfxVolume', label: 'Effects volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'musicVolume', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'ambienceVolume', label: 'Ambience volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, optional: true },
  ] },
];

function pct(v) { return Math.round(v * 100) + '%'; }

export class SettingsView {
  constructor(ui, onBack) {
    this.ui = ui;
    this.onBack = onBack;
    this.body = h('div.set-body');
    const back = ui.button('Back', () => onBack?.(), 'btn-wide');
    this.el = h('div.panel-box.settings-box',
      h('div.pb-title', 'Settings'),
      this.body,
      h('div.pb-foot', back, h('span.pb-note', 'Changes are saved automatically')));
  }

  get settings() {
    const g = this.ui.game;
    if (!g.settings) g.settings = { ...DEFAULTS };
    return g.settings;
  }

  apply(lazy) {
    clearTimeout(this._t);
    const run = () => { try { this.ui.game.applySettings?.(); } catch (e) { console.error('applySettings failed', e); } };
    if (lazy) run();
    else this._t = setTimeout(run, 60);
  }

  render() {
    clear(this.body);
    const s = this.settings;
    for (const grp of SCHEMA) {
      const g = h('div.set-group', h('div.set-group-title', grp.group));
      for (const it of grp.items) {
        if (it.optional && !(it.key in s)) continue;
        const cur = s[it.key] ?? DEFAULTS[it.key];
        let control;
        if (it.type === 'range') {
          const val = h('span.set-val', it.fmt(+cur));
          const input = h('input.slider', { type: 'range', min: it.min, max: it.max, step: it.step, value: cur });
          const paint = () => {
            const f = (input.value - it.min) / (it.max - it.min);
            input.style.setProperty('--f', (f * 100).toFixed(1) + '%');
          };
          paint();
          input.addEventListener('input', () => {
            const v = +input.value;
            val.textContent = it.fmt(v);
            paint();
            if (!it.lazy) { s[it.key] = v; this.apply(false); }
          });
          input.addEventListener('change', () => { s[it.key] = +input.value; this.apply(true); this.ui.sound('ui_click', 0.5); });
          control = h('div.set-ctl', input, val);
        } else if (it.type === 'toggle') {
          const b = h('button.toggle' + (cur ? '.on' : ''), { type: 'button' }, h('i'), h('span', cur ? 'On' : 'Off'));
          b.addEventListener('click', () => {
            s[it.key] = !s[it.key];
            b.classList.toggle('on', s[it.key]);
            b.lastChild.textContent = s[it.key] ? 'On' : 'Off';
            this.ui.sound('ui_click');
            this.apply(true);
          });
          control = h('div.set-ctl', b);
        } else if (it.type === 'choice') {
          const seg = h('div.seg');
          for (const [v, label] of it.options) {
            const b = h('button.seg-btn' + (cur === v ? '.on' : ''), { type: 'button', text: label });
            b.addEventListener('click', () => {
              s[it.key] = v;
              for (const x of seg.children) x.classList.toggle('on', x === b);
              this.ui.sound('ui_click');
              this.apply(true);
            });
            seg.appendChild(b);
          }
          control = h('div.set-ctl', seg);
        }
        g.appendChild(h('div.set-row', h('span.set-label', it.label), control));
      }
      this.body.appendChild(g);
    }
  }
}

export const CONTROLS = [
  { group: 'Movement', rows: [
    [['W', 'A', 'S', 'D'], 'Move'], [['Shift'], 'Sprint'], [['C'], 'Crouch / sneak'], [['Space'], 'Jump / climb'],
  ] },
  { group: 'Combat', rows: [
    [['LMB'], 'Attack / fire'], [['RMB'], 'Aim gun / shove'], [['R'], 'Reload / clear jam'], [['B'], 'Toggle fire mode'],
    [['V'], 'Shove'], [['G'], 'Throw'],
  ] },
  { group: 'Interaction', rows: [
    [['E'], 'Interact / open / loot'], [['F'], 'Flashlight'], [['Q'], 'Drop held item'], [['1', '–', '9'], 'Select hotbar slot'],
    [['Wheel'], 'Cycle hotbar'],
  ] },
  { group: 'Interface', rows: [
    [['Tab'], 'Inventory  (also I)'], [['X'], 'Crafting'], [['H'], 'Health'], [['K'], 'Character & skills'], [['M'], 'Map'],
    [['Esc'], 'Close panel / pause'],
  ] },
  { group: 'Inventory', rows: [
    [['LMB'], 'Drag whole stack'], [['RMB'], 'Drag half / context menu'], [['Shift', 'LMB'], 'Quick move'],
    [['Dbl', 'LMB'], 'Use / equip'], [['1', '–', '9'], 'Hovered item to hotbar'],
  ] },
];

export class ControlsView {
  constructor(ui, onBack) {
    const cols = h('div.ctl-grid');
    for (const grp of CONTROLS) {
      cols.appendChild(h('div.ctl-group', h('div.set-group-title', grp.group),
        h('div.ctl-rows', grp.rows.map(([keys, label]) => [
          h('span.ctl-keys', keys.map((k) => (k === '–' ? h('span.ctl-dash', '–') : h('span.key', k)))),
          h('span.ctl-label', label)]))));
    }
    this.el = h('div.panel-box.controls-box',
      h('div.pb-title', 'Controls'), cols,
      h('div.pb-foot', ui.button('Back', () => onBack?.(), 'btn-wide')));
  }
  render() {}
}
