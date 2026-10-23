// Battle setup screen.

import { SCENARIOS } from '../world/mapgen.js';
import { Noise2D } from '../world/noise.js';

const SIZES = [
  { id: 250, name: 'Skirmish', note: '≈250 / side' },
  { id: 600, name: 'Battalion', note: '≈600 / side' },
  { id: 1100, name: 'Brigade', note: '≈1,100 / side' },
  { id: 1800, name: 'Division', note: '≈1,800 / side' },
];

const MIX = [
  ['infantry', 'Infantry'],
  ['armor', 'Armor'],
  ['air', 'Air power'],
  ['artillery', 'Artillery'],
  ['drones', 'Drones'],
];

const TAGS = { town: 'ATTACK · URBAN', base: 'ATTACK · AIRFIELD', ridge: 'MEETING · HIGH GROUND', valley: 'MEETING · OPEN FIELD' };

const STORE = 'battlespace.settings.v1';

export function defaultSettings() {
  return {
    scenario: 'town',
    size: 600,
    mix: { infantry: 1, armor: 1, air: 1, artillery: 1, drones: 1 },
    time: 'morning',
    weather: 'clear',
    dynamicWeather: true,
    quality: 'high',
    audio: true,
    gore: true,
    endless: false,
    seed: Math.floor(Math.random() * 99999),
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && typeof s === 'object') return { ...defaultSettings(), ...s, seed: Math.floor(Math.random() * 99999) };
  } catch (e) {
    // Storage unavailable: use defaults.
  }
  return defaultSettings();
}

function save(s) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch (e) {
    // Ignore (private mode etc.).
  }
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
}

function drawTopo(canvas) {
  const w = 320;
  const h = 200;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n = new Noise2D(7);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n.fbm(x / 90, y / 90, 4) * 0.5 + 0.5;
      const band = Math.abs(((v * 14) % 1) - 0.5);
      const line = band > 0.44 ? 1 : 0;
      const major = Math.abs(((v * 14 / 5) % 1) - 0.5) > 0.47 ? 1 : 0;
      const i = (y * w + x) * 4;
      img.data[i] = 150 + major * 70;
      img.data[i + 1] = 160 + major * 40;
      img.data[i + 2] = 120;
      img.data[i + 3] = line ? (major ? 70 : 34) : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export class Menu {
  constructor(root, onDeploy) {
    this.root = root;
    this.onDeploy = onDeploy;
    this.s = load();
    this.build();
  }

  build() {
    const s = this.s;
    const topo = el('canvas', { class: 'topo', 'aria-hidden': 'true' });
    drawTopo(topo);
    const scen = el('div', { class: 'scenarios' });
    const scenButtons = [];
    for (const sc of Object.values(SCENARIOS)) {
      const b = el(
        'button',
        { class: 'scen', type: 'button', 'aria-pressed': String(s.scenario === sc.id), id: `scen-${sc.id}` },
        el('span', { class: 'tag', text: TAGS[sc.id] || '' }),
        el('span', { class: 'name', text: sc.name }),
        el('span', { class: 'blurb', text: sc.blurb }),
      );
      b.addEventListener('click', () => {
        s.scenario = sc.id;
        scenButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      scenButtons.push(b);
      scen.append(b);
    }
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Force size' });
    const segButtons = [];
    for (const sz of SIZES) {
      const b = el('button', { type: 'button', 'aria-pressed': String(s.size === sz.id), id: `size-${sz.id}` }, el('span', { text: sz.name }), el('span', { class: 'v', text: sz.note }));
      b.addEventListener('click', () => {
        s.size = sz.id;
        segButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      segButtons.push(b);
      seg.append(b);
    }
    const mixRows = MIX.map(([key, label]) => {
      const out = el('output', { text: `${Math.round(s.mix[key] * 100)}%` });
      const input = el('input', { type: 'range', min: '0', max: '200', step: '10', value: String(Math.round(s.mix[key] * 100)), id: `mix-${key}`, 'aria-label': label });
      input.addEventListener('input', () => {
        s.mix[key] = Number(input.value) / 100;
        out.textContent = `${input.value}%`;
      });
      return el('div', { class: 'row' }, el('label', { class: 'label', for: `mix-${key}`, text: label }), input, out);
    });
    const select = (id, label, value, options, onChange) => {
      const sel = el('select', { id });
      for (const [v, t] of options) {
        const o = el('option', { value: v, text: t });
        if (v === value) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => onChange(sel.value));
      return el('div', { class: 'field' }, el('label', { class: 'label', for: id, text: label }), sel);
    };
    const toggle = (id, label, checked, onChange) => {
      const input = el('input', { type: 'checkbox', id });
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      return el('label', { class: 'toggle', for: id }, input, el('span', { text: label }));
    };
    const seedInput = el('input', { type: 'text', id: 'seed', value: String(s.seed), inputmode: 'numeric', 'aria-label': 'Map seed' });
    seedInput.addEventListener('change', () => {
      const v = parseInt(seedInput.value, 10);
      s.seed = Number.isFinite(v) ? v : Math.floor(Math.random() * 99999);
      seedInput.value = String(s.seed);
    });
    const deploy = el('button', { class: 'deploy', type: 'button', id: 'deploy', text: 'Deploy' });
    deploy.addEventListener('click', () => {
      save(s);
      this.onDeploy({ ...s, mix: { ...s.mix } });
    });

    const left = el(
      'div',
      { style: 'display:grid;gap:22px;min-width:0' },
      el('section', { class: 'panel section' }, el('h2', { text: 'Theater' }), scen),
      el('section', { class: 'panel section' }, el('h2', { text: 'Order of battle' }), seg, ...mixRows),
    );
    const right = el(
      'div',
      { style: 'display:grid;gap:22px;min-width:0' },
      el(
        'section',
        { class: 'panel section' },
        el('h2', { text: 'Conditions' }),
        el(
          'div',
          { class: 'pair' },
          select('time', 'Time of day', s.time, [['dawn', 'Dawn 06:06'], ['morning', 'Morning 09:00'], ['noon', 'Noon 13:00'], ['afternoon', 'Afternoon 16:12'], ['dusk', 'Dusk 19:06'], ['night', 'Night 23:18']], (v) => (s.time = v)),
          select('weather', 'Weather', s.weather, [['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['storm', 'Thunderstorm'], ['fog', 'Fog']], (v) => (s.weather = v)),
        ),
        el('div', { class: 'toggles' }, toggle('dyn', 'Weather changes during the battle', s.dynamicWeather, (v) => (s.dynamicWeather = v)), toggle('endless', 'Endless battle (no tickets, no victory)', s.endless, (v) => (s.endless = v))),
      ),
      el(
        'section',
        { class: 'panel section' },
        el('h2', { text: 'System' }),
        el(
          'div',
          { class: 'pair' },
          select('quality', 'Graphics', s.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], (v) => (s.quality = v)),
          el('div', { class: 'field' }, el('label', { class: 'label', for: 'seed', text: 'Map seed' }), seedInput),
        ),
        el('div', { class: 'toggles' }, toggle('audio', 'Battlefield audio', s.audio, (v) => (s.audio = v)), toggle('gore', 'Blood and wounds', s.gore, (v) => (s.gore = v))),
      ),
      el(
        'section',
        { class: 'panel section' },
        el('h2', { text: 'Spectator controls' }),
        el(
          'div',
          { class: 'keys-mini' },
          ...[
            ['WASD · Q/E', 'fly · down/up'],
            ['Right-drag', 'look around'],
            ['Wheel', 'camera speed / zoom'],
            ['Click unit', 'select · F follow · V eyes'],
            ['1–6', 'free · orbit · chase · eyes · cinematic · map'],
            ['Enter', 'play as the selected soldier (E aims, Esc leaves)'],
            ['Space · − / +', 'pause · time scale'],
            ['H', 'all controls'],
          ].map(([k, v]) => el('div', {}, el('b', { text: k }), document.createTextNode(`  ${v}`))),
        ),
      ),
    );
    this.node = el(
      'div',
      { id: 'menu' },
      topo,
      el(
        'div',
        { class: 'menu-inner' },
        el('header', { class: 'brand' }, el('h1', {}, document.createTextNode('Battle'), el('span', { text: 'space' })), el('div', { class: 'sub', text: 'Autonomous combined-arms warfare at scale. Pick a theater, set the order of battle, then watch it unfold from anywhere.' })),
        el('div', { class: 'menu-grid' }, left, right),
        el('div', { style: 'display:flex;gap:18px;align-items:center;flex-wrap:wrap' }, deploy, el('span', { class: 'foot', text: 'Both armies are fully AI-controlled. You are an observer.' })),
      ),
    );
    this.root.append(this.node);
  }

  show() {
    this.node.hidden = false;
  }

  hide() {
    this.node.hidden = true;
  }
}
