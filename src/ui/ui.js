// DOM interface: spawn menu, toolbar, contextual tool options, settings, read-outs.
import { PROPS, PROJECTILES } from '../props/index.js';
import { TOOLS } from '../interaction/tools.js';
import { QUALITY } from '../core/sim.js';

const $ = (id) => document.getElementById(id);
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra}<path d="${d}"/></svg>`;

const ICON = {
  pause: svg('M8 5v14M16 5v14'),
  play: svg('M7 4.5v15l12-7.5z'),
  step: svg('M6 5v14l9-7zM18 5v14'),
  slow: svg('M12 7v5l3 2', '<circle cx="12" cy="12" r="8.5"/>'),
  reset: svg('M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5'),
  broom: svg('M14 4l6 6M12.5 5.5l6 6-3 3-6-6zM9.5 8.5L4 14l6 6 5.5-5.5M7 17l-2 2'),
  trash: svg('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'),
  gear: svg('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1.2-1.6-3-2.3.6-1.5-1.2-.3-2.4h-3.4l-.4 2.4-1.5 1.2-2.3-.6-1.6 3L7 12l-2 1.2 1.6 3 2.3-.6 1.5 1.2.4 2.4h3.4l.3-2.4 1.5-1.2 2.3.6 1.6-3z'),
  help: svg('M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.9M12 17.2v.3', '<circle cx="12" cy="12" r="9"/>'),
  grid: svg('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
  grab: svg('M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5v-6a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7.5M17 10a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2c-2 0-3.3-.8-4.4-2.3L4.5 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5'),
  launch: svg('M3 15l11-6 2 3.5-11 6zM14 9l4-2.2 2 3.5L16 12.5M7 17.5L6 21M11 15.5l1 4.5', '<circle cx="20.2" cy="6" r="1.3"/>'),
  hammer: svg('M13.5 9.5L4 19l1.8 1.8 9.5-9.5M11 7l5-4 5 5-4 5-1.5-1.5-3-3z'),
  bomb: svg('M14.5 8.5l2-2M17.5 5.5l1.5-1.5M19 7.5h2M17 3.5V2', '<circle cx="10.5" cy="13.5" r="6.5"/>'),
};

function fmt(v, digits = 0) {
  return Number(v).toFixed(digits);
}

export class UI {
  constructor(app) {
    this.app = app;
    this.cards = new Map();
    this.toast = $('toast');
    this.toastTimer = 0;
    this.buildTopbar();
    this.buildProps();
    this.buildToolbar();
    this.buildSettings();
    this.buildHelp();
    this.refreshTool();
    this.refreshPause();
  }

  // --- top bar -------------------------------------------------------------

  buildTopbar() {
    const app = this.app;
    $('btnStep').innerHTML = ICON.step + '<span class="hide-narrow">Step</span>';
    $('btnSlow').innerHTML = ICON.slow + '<span class="hide-narrow">Slow-mo</span><kbd>T</kbd>';
    $('btnReset').innerHTML = ICON.reset + '<span class="hide-narrow">Reset scene</span>';
    $('btnDebris').innerHTML = ICON.broom + '<span class="hide-narrow">Clear debris</span>';
    $('btnClear').innerHTML = ICON.trash + '<span class="hide-narrow">Clear all</span>';
    $('btnSettings').innerHTML = ICON.gear + '<span class="hide-narrow">Settings</span>';
    $('btnHelp').innerHTML = ICON.help + '<span class="hide-narrow">Controls</span><kbd>H</kbd>';
    $('btnProps').innerHTML = ICON.grid + 'Props';
    $('btnPause').onclick = () => app.togglePause();
    $('btnStep').onclick = () => app.stepOnce();
    $('btnSlow').onclick = () => app.toggleSlowMo();
    $('btnReset').onclick = () => app.resetScene();
    $('btnDebris').onclick = () => app.clearDebris();
    $('btnClear').onclick = () => app.clearAll();
    $('btnHelp').onclick = () => app.toggleHelp();
    $('btnHelpClose').onclick = () => app.toggleHelp(false);
    $('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) app.toggleHelp(false); });
    $('btnSettings').onclick = () => {
      const el = $('settings');
      const open = el.hidden || !el.classList.contains('open') && window.matchMedia('(max-width: 820px)').matches;
      el.hidden = !open;
      el.classList.toggle('open', open);
      $('btnSettings').classList.toggle('on', open);
      if (open) $('spawn').classList.remove('open');
    };
    $('btnProps').onclick = () => {
      const el = $('spawn');
      const open = !el.classList.contains('open');
      el.classList.toggle('open', open);
      if (open) { $('settings').classList.remove('open'); $('settings').hidden = true; $('btnSettings').classList.remove('on'); }
    };
    for (const b of document.querySelectorAll('button')) b.addEventListener('pointerdown', () => app.audio.unlock());
  }

  refreshPause() {
    const p = this.app.paused;
    $('btnPause').innerHTML = (p ? ICON.play : ICON.pause) + `<span class="hide-narrow">${p ? 'Resume' : 'Pause'}</span><kbd>Space</kbd>`;
    $('btnPause').classList.toggle('on', p);
    $('pausedTag').hidden = !p;
    $('btnStep').disabled = !p;
    $('btnStep').style.opacity = p ? 1 : 0.4;
  }

  refreshTime() {
    const ts = this.app.timeScale;
    $('timeRead').textContent = fmt(ts, 2) + '×';
    $('btnSlow').classList.toggle('on', ts < 0.99);
    const r = this.inputs?.timeScale;
    if (r) { r.input.value = ts; r.out.textContent = fmt(ts, 2) + '×'; }
  }

  // --- props ---------------------------------------------------------------

  buildProps() {
    const grid = $('propGrid');
    PROPS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.title = p.hint;
      b.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><div class="thumb"></div><span>${p.label}</span>`;
      b.onclick = () => {
        this.app.audio.unlock();
        this.app.tools.beginPlacement(p.type);
        if (window.matchMedia('(max-width: 820px)').matches) $('spawn').classList.remove('open');
      };
      grid.appendChild(b);
      this.cards.set(p.type, b);
    });
    $('propCount').textContent = PROPS.length + ' props';
  }

  setThumb(type, url) {
    const card = this.cards.get(type);
    if (!card || !url) return;
    card.querySelector('.thumb').innerHTML = `<img alt="" src="${url}">`;
  }

  // --- toolbar + contextual options ----------------------------------------

  buildToolbar() {
    const bar = $('toolbar');
    this.toolBtns = new Map();
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML = `${ICON[t.id]}<span>${t.label}</span><kbd>${t.key}</kbd>`;
      b.title = t.hint;
      b.onclick = () => this.app.tools.setTool(t.id);
      bar.appendChild(b);
      this.toolBtns.set(t.id, b);
    }
  }

  slider(label, obj, key, min, max, step, unit, digits = 0, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'opt';
    const id = 'opt_' + key;
    wrap.innerHTML = `<label class="label" for="${id}">${label}</label><output></output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}">`;
    const input = wrap.querySelector('input'), out = wrap.querySelector('output');
    input.value = obj[key];
    const show = () => { out.textContent = fmt(obj[key], digits) + unit; };
    show();
    input.oninput = () => { obj[key] = parseFloat(input.value); show(); if (onInput) onInput(obj[key]); };
    return wrap;
  }

  refreshTool() {
    const tools = this.app.tools;
    if (!tools) return;
    for (const [id, b] of this.toolBtns) b.classList.toggle('on', id === tools.tool && !tools.placing);
    for (const [type, c] of this.cards) c.classList.toggle('on', !!tools.placing && tools.placing.type === type);
    const s = tools.settings;
    const box = $('toolOpts');
    box.innerHTML = '';
    const t = TOOLS.find((x) => x.id === tools.tool);
    if (tools.placing) {
      $('hint').textContent = 'Click to place · wheel or R to rotate · Shift-click to keep placing · Esc to cancel';
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('hint').textContent = t.hint;
    if (tools.tool === 'grab') {
      box.appendChild(this.slider('Interaction strength', s, 'grabStrength', 300, 15000, 100, ' N'));
      box.appendChild(this.slider('Throw speed', s, 'launchSpeed', 4, 90, 1, ' m/s'));
    } else if (tools.tool === 'launch') {
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const p of PROJECTILES) {
        const c = document.createElement('button');
        c.className = 'chip' + (s.projectile === p.type ? ' on' : '');
        c.textContent = `${p.label} · ${p.mass} kg`;
        c.onclick = () => { s.projectile = p.type; this.refreshTool(); };
        chips.appendChild(c);
      }
      box.appendChild(chips);
      box.appendChild(this.slider('Launch speed', s, 'launchSpeed', 4, 90, 1, ' m/s'));
    } else if (tools.tool === 'hammer') {
      box.appendChild(this.slider('Strike impulse', s, 'hammerImpulse', 10, 3000, 10, ' N·s'));
    } else if (tools.tool === 'bomb') {
      box.appendChild(this.slider('Charge', s, 'bombPower', 100, 4000, 50, ''));
      box.appendChild(this.slider('Blast radius', s, 'bombRadius', 2, 10, 0.5, ' m', 1));
    }
  }

  // --- settings ------------------------------------------------------------

  buildSettings() {
    const body = $('settingsBody');
    const app = this.app;
    this.inputs = {};
    const sec = (title) => {
      const s = document.createElement('div');
      s.className = 'sec';
      s.innerHTML = `<div class="label">${title}</div>`;
      body.appendChild(s);
      return s;
    };
    const range = (parent, key, label, min, max, step, get, set, f) => {
      const row = document.createElement('div');
      row.className = 'row';
      const id = 'set_' + key;
      row.innerHTML = `<label for="${id}">${label}</label><output></output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}">`;
      const input = row.querySelector('input'), out = row.querySelector('output');
      input.value = get();
      out.textContent = f(get());
      input.oninput = () => { set(parseFloat(input.value)); out.textContent = f(get()); };
      parent.appendChild(row);
      this.inputs[key] = { input, out, f, get };
      return row;
    };
    const select = (parent, key, label, options, get, set) => {
      const row = document.createElement('div');
      row.className = 'row';
      const id = 'set_' + key;
      row.innerHTML = `<label for="${id}">${label}</label><select id="${id}">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      const sel = row.querySelector('select');
      sel.value = get();
      sel.onchange = () => set(sel.value);
      parent.appendChild(row);
      return row;
    };
    const check = (parent, key, label, get, set) => {
      const row = document.createElement('div');
      row.className = 'row';
      const id = 'set_' + key;
      row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="checkbox">`;
      const cb = row.querySelector('input');
      cb.checked = get();
      cb.onchange = () => set(cb.checked);
      parent.appendChild(row);
      return row;
    };
    const sim = app.sim, st = app.stage.settings, fx = app.fx;

    const s1 = sec('Simulation');
    select(s1, 'quality', 'Physics quality', [['low', 'Low · 60 Hz'], ['medium', 'Medium · 90 Hz'], ['high', 'High · 120 Hz'], ['ultra', 'Ultra · 240 Hz']], () => sim.settings.quality, (v) => {
      sim.applyQuality(v);
      this.syncInputs();
      app.flash(`Physics: ${v} · ${Math.round(1 / QUALITY[v].substep)} Hz, ${QUALITY[v].iters} solver iterations`);
    });
    range(s1, 'timeScale', 'Time scale', 0.05, 1.5, 0.05, () => app.timeScale, (v) => app.setTimeScale(v), (v) => fmt(v, 2) + '×');
    range(s1, 'gravity', 'Gravity', 0, 25, 0.1, () => sim.settings.gravity, (v) => { sim.setGravity(v); fx.gravity = Math.max(v, 0.5); }, (v) => fmt(v, 1) + ' m/s²');
    range(s1, 'strength', 'Material strength', 0.25, 3, 0.05, () => sim.settings.strength, (v) => { sim.settings.strength = v; }, (v) => fmt(v * 100) + '%');
    range(s1, 'detail', 'Fracture detail', 0.5, 1.6, 0.05, () => sim.settings.detail, (v) => { sim.settings.detail = v; }, (v) => fmt(v * 100) + '%');
    range(s1, 'maxDebris', 'Fragment budget', 150, 4000, 50, () => sim.settings.maxDebris, (v) => { sim.settings.maxDebris = v; }, (v) => fmt(v));
    check(s1, 'debrisCollide', 'Small shards collide with each other', () => sim.settings.debrisCollide, (v) => { sim.settings.debrisCollide = v; });

    const s2 = sec('Graphics');
    select(s2, 'shadows', 'Shadows', [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => st.shadows, (v) => app.stage.setShadowQuality(v));
    range(s2, 'renderScale', 'Resolution', 0.5, 1, 0.05, () => st.renderScale, (v) => { st.renderScale = v; app.stage.resize(); }, (v) => fmt(v * 100) + '%');
    check(s2, 'bloom', 'Bloom', () => st.bloom, (v) => { st.bloom = v; });
    check(s2, 'motionBlur', 'Motion blur', () => st.motionBlur, (v) => { st.motionBlur = v; });
    range(s2, 'blurAmount', 'Blur strength', 0.05, 0.6, 0.01, () => st.motionBlurAmount, (v) => { st.motionBlurAmount = v; }, (v) => fmt(v * 100) + '%');
    check(s2, 'shake', 'Screen shake', () => fx.shakeEnabled, (v) => { fx.shakeEnabled = v; });
    range(s2, 'density', 'Particle density', 0.2, 1.6, 0.05, () => fx.density, (v) => { fx.density = v; }, (v) => fmt(v * 100) + '%');

    const s3 = sec('Audio');
    range(s3, 'volume', 'Volume', 0, 1, 0.01, () => app.volume, (v) => { app.volume = v; app.audio.setMasterVolume(v); }, (v) => fmt(v * 100) + '%');
  }

  syncInputs() {
    for (const k of Object.keys(this.inputs)) {
      const r = this.inputs[k];
      r.input.value = r.get();
      r.out.textContent = r.f(r.get());
    }
  }

  // --- help ----------------------------------------------------------------

  buildHelp() {
    const rows = [
      ['h', 'Camera'],
      ['Right-drag', 'Orbit'],
      ['Middle-drag', 'Pan (or Shift + right-drag)'],
      ['Wheel', 'Zoom'],
      ['W A S D', 'Move the focus point'],
      ['Q / E', 'Lower / raise'],
      ['Shift', 'Move faster'],
      ['h', 'Objects'],
      ['Left-drag', 'Grab and carry (Grab tool)'],
      ['Wheel', 'Push / pull while carrying'],
      ['R + move', 'Rotate the carried object'],
      ['F / right-click', 'Throw at the set speed'],
      ['X / Delete', 'Remove the prop under the cursor'],
      ['h', 'Tools'],
      ['1', 'Grab'],
      ['2', 'Projectile launcher'],
      ['3', 'Sledgehammer'],
      ['4', 'Explosive charge'],
      ['h', 'Simulation'],
      ['Space', 'Pause / resume'],
      ['.', 'Single step while paused'],
      ['T', 'Toggle slow motion'],
      ['H', 'This panel'],
      ['Touch', 'One finger uses the tool, two fingers orbit and pinch-zoom'],
    ];
    $('helpBody').innerHTML = rows
      .map(([k, v]) => (k === 'h' ? `<h4 class="label">${v}</h4>` : `<div class="k"><b>${k}</b><span>${v}</span></div>`))
      .join('');
  }

  // --- read-outs -----------------------------------------------------------

  flash(text, ms = 2200) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  setStats(fps, st) {
    $('stFps').textContent = fmt(fps);
    $('stBodies').textContent = st.bodies;
    $('stChunks').textContent = st.chunks;
    $('stAwake').textContent = st.awake;
    $('stMs').textContent = fmt(st.stepMs, 1) + ' ms';
  }

  setInfo(d) {
    const el = $('info');
    if (!d) { el.hidden = true; return; }
    el.hidden = false;
    const mass = d.mass >= 1 ? fmt(d.mass, 1) + ' kg' : fmt(d.mass * 1000) + ' g';
    el.innerHTML =
      `<h3>${d.prop}</h3><dl>` +
      `<dt>Part</dt><dd>${d.part}</dd>` +
      `<dt>Material</dt><dd>${d.material}</dd>` +
      `<dt>Mass</dt><dd>${mass}</dd>` +
      `<dt>Pieces in body</dt><dd>${d.pieces}</dd>` +
      `<dt>Speed</dt><dd>${fmt(d.speed, 1)} m/s</dd>` +
      (d.held ? `<dt>Grip force</dt><dd>${fmt(d.force)} N</dd>` : '') +
      `</dl>`;
  }
}
