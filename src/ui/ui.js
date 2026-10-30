import { WEAPONS } from '../game/weapons.js';
import { THROWABLES } from '../game/throwables.js';

/**
 * DOM interface: tool palette (interaction, firearms, throwables), simulation controls, settings
 * and a live medical monitor of the selected person (vitals, blood volume, injury log).
 */

const ICON = {
  grab: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1V4.5a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V13m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.6 14.6a1.6 1.6 0 0 1 2.6-1.8L8 14"/>',
  shove: '<path d="M4 12h11M11 7l5 5-5 5M19 5v14"/>',
};

const WEAPON_KEYS = ['pistol', 'revolver', 'shotgun', 'smg', 'rifle', 'sniper'];
const THROW_KEYS = Object.keys(THROWABLES);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class UI {
  constructor(root, handlers) {
    this.h = handlers;
    this.root = el('div', 'ui');
    root.appendChild(this.root);
    this.buttons = new Map();
    this.buildTopbar();
    this.buildToolbar();
    this.buildHud();
    this.buildSettings();
    this.hint = el('div', 'hint');
    this.hint.innerHTML =
      '<b>Left click</b> use tool &nbsp; <b>Right drag</b> orbit &nbsp; <b>Shift+right / middle drag</b> pan &nbsp; <b>Wheel</b> zoom &nbsp; <b>WASD</b> move &nbsp; <b>Shift+click</b> drop prop<br>' +
      '<b>1-6</b> firearms &nbsp; <b>G</b> grab &nbsp; <b>F</b> shove &nbsp; <b>Q/E</b> props &nbsp; <b>Space</b> pause &nbsp; <b>T</b> slow motion &nbsp; <b>.</b> step &nbsp; <b>R</b> reset &nbsp; <b>N</b> spawn &nbsp; <b>C</b> clear &nbsp; <b>H</b> hide UI';
    this.root.appendChild(this.hint);
    this.crosshair = el('div', 'crosshair');
    this.root.appendChild(this.crosshair);
    this.toast = el('div', 'toast');
    this.root.appendChild(this.toast);
    this.loading = el('div', 'loading', '<div class="spinner"></div><div>Sculpting body mesh…</div>');
    this.root.appendChild(this.loading);
    this.hudTimer = 0;
  }

  buildTopbar() {
    const bar = el('header', 'topbar');
    const mk = (label, act, title) => {
      const b = el('button', 'btn', label);
      b.title = title || '';
      b.addEventListener('click', () => this.h.onAction(act));
      bar.appendChild(b);
      this.buttons.set(act, b);
      return b;
    };
    mk('Spawn', 'spawn', 'Spawn another dummy (N)');
    mk('Reset', 'reset', 'Reset the simulation (R)');
    mk('Clear', 'clear', 'Remove all thrown objects (C)');
    bar.appendChild(el('span', 'sep'));
    mk('Pause', 'pause', 'Pause / resume (Space)');
    mk('Step', 'step', 'Advance one frame while paused (.)');
    mk('Slow-mo', 'slowmo', 'Toggle 0.25x time (T)');
    this.timeLabel = el('span', 'time', '1.00×');
    bar.appendChild(this.timeLabel);
    bar.appendChild(el('span', 'sep'));
    mk('Follow', 'follow', 'Camera follows the selected dummy (B)');
    mk('Physics', 'debug', 'Show colliders, centre of mass and support polygon (V)');
    this.root.appendChild(bar);
  }

  buildToolbar() {
    const bar = el('aside', 'toolbar');
    bar.appendChild(el('div', 'brand', 'RAGDOLL<span>LAB</span>'));
    const section = (title) => {
      const s = el('section');
      s.appendChild(el('h3', null, title));
      const grid = el('div', 'tools');
      s.appendChild(grid);
      bar.appendChild(s);
      return grid;
    };
    const tool = (grid, id, label, sub, icon) => {
      const b = el('button', 'tool');
      b.innerHTML = (icon ? `<svg viewBox="0 0 24 24">${icon}</svg>` : '') + `<span class="tl">${label}</span>` + (sub ? `<span class="ts">${sub}</span>` : '');
      b.addEventListener('click', () => this.h.onTool(id));
      grid.appendChild(b);
      this.buttons.set('tool:' + id, b);
    };
    const g1 = section('Interact');
    tool(g1, 'grab', 'Grab', 'drag body parts', ICON.grab);
    tool(g1, 'shove', 'Shove', 'push with force', ICON.shove);
    const g2 = section('Firearms');
    WEAPON_KEYS.forEach((k, i) => tool(g2, 'w:' + k, `${i + 1} · ${WEAPONS[k].label}`, WEAPONS[k].round));
    const g3 = section('Throw');
    for (const k of THROW_KEYS) tool(g3, 't:' + k, THROWABLES[k].label, `${THROWABLES[k].mass >= 1 ? THROWABLES[k].mass.toFixed(1) + ' kg' : Math.round(THROWABLES[k].mass * 1000) + ' g'}`);
    this.root.appendChild(bar);
  }

  buildSettings() {
    const box = el('div', 'settings');
    box.appendChild(el('h3', null, 'Settings'));
    const slider = (key, label, min, max, step, value, fmt) => {
      const row = el('label', 'row');
      const name = el('span', 'name', label);
      const val = el('span', 'val', fmt(value));
      const inp = el('input');
      inp.type = 'range';
      inp.min = min;
      inp.max = max;
      inp.step = step;
      inp.value = value;
      inp.addEventListener('input', () => {
        val.textContent = fmt(+inp.value);
        this.h.onSetting(key, +inp.value);
      });
      row.append(name, val, inp);
      box.appendChild(row);
    };
    slider('assist', 'Balance assist', 0, 1, 0.05, 1, (v) => `${Math.round(v * 100)}%`);
    slider('throwPower', 'Throw power', 0.4, 1.6, 0.05, 1, (v) => `${v.toFixed(2)}×`);
    slider('shove', 'Shove impulse', 20, 300, 5, 60, (v) => `${v} N·s`);
    slider('force', 'Bullet momentum', 1, 6, 0.5, 1, (v) => (v === 1 ? 'real' : `${v}×`));
    slider('bleed', 'Bleeding rate', 0.25, 4, 0.25, 1, (v) => `${v}×`);
    slider('volume', 'Sound', 0, 1, 0.05, 0.7, (v) => `${Math.round(v * 100)}%`);
    const toggles = el('div', 'toggles');
    const toggle = (key, label, on) => {
      const b = el('button', 'chip' + (on ? ' on' : ''), label);
      b.addEventListener('click', () => {
        b.classList.toggle('on');
        this.h.onSetting(key, b.classList.contains('on'));
      });
      toggles.appendChild(b);
      this.buttons.set('set:' + key, b);
    };
    toggle('tracers', 'Tracers', true);
    toggle('gore', 'Gore', true);
    box.appendChild(toggles);
    this.root.appendChild(box);
  }

  buildHud() {
    const hud = el('aside', 'hud');
    hud.innerHTML = `
      <div class="hud-head"><span class="who">Dummy</span><span class="status">—</span></div>
      <div class="vitals">
        <div class="v"><span class="k">HR</span><span class="n hr">—</span><span class="u">bpm</span></div>
        <div class="v"><span class="k">BP</span><span class="n bp">—</span><span class="u">mmHg</span></div>
        <div class="v"><span class="k">SpO₂</span><span class="n spo2">—</span><span class="u">%</span></div>
        <div class="v"><span class="k">Bleed</span><span class="n bleed">—</span><span class="u">mL/min</span></div>
      </div>
      <canvas class="ecg" width="300" height="46"></canvas>
      <div class="bars">
        <div class="bar"><span class="k">Blood volume</span><span class="b"><i class="blood"></i></span><span class="t blood-t">5000 mL</span></div>
        <div class="bar"><span class="k">Pain</span><span class="b"><i class="pain"></i></span><span class="t pain-t">0%</span></div>
        <div class="bar"><span class="k">Muscle tone</span><span class="b"><i class="tone"></i></span><span class="t tone-t">100%</span></div>
        <div class="bar" title="Injury Severity Score (0-75): sum of squares of the worst AIS grades in the three most injured body regions"><span class="k">Trauma (ISS)</span><span class="b"><i class="iss" style="width:0;background:linear-gradient(90deg,#b07cff,#ff4d4d)"></i></span><span class="t iss-t">0</span></div>
      </div>
      <div class="flags"></div>
      <h4>Injuries</h4>
      <ol class="injuries"><li class="none">No injuries</li></ol>`;
    this.hud = hud;
    this.root.appendChild(hud);
    const who = hud.querySelector('.who');
    who.title = 'Click to monitor the next dummy';
    who.style.cursor = 'pointer';
    who.addEventListener('click', () => this.h.onAction('nextDummy'));
    this.ecg = hud.querySelector('.ecg');
    this.ecgCtx = this.ecg.getContext('2d');
    this.ecgX = 0;
    this.ecgPhase = 0;
  }

  setActiveTool(id) {
    for (const [k, b] of this.buttons) if (k.startsWith('tool:')) b.classList.toggle('active', k === 'tool:' + id);
    this.crosshair.classList.toggle('gun', id.startsWith('w:'));
  }

  setFlag(act, on) {
    const b = this.buttons.get(act);
    if (b) b.classList.toggle('on', !!on);
  }

  setTime(scale, paused) {
    this.timeLabel.textContent = paused ? 'paused' : `${scale.toFixed(2)}×`;
    this.setFlag('pause', paused);
    this.buttons.get('pause').textContent = paused ? 'Resume' : 'Pause';
    this.setFlag('slowmo', scale < 0.99);
  }

  notify(text) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('show'), 1800);
  }

  setLoading(on) {
    this.loading.classList.toggle('show', on);
  }

  toggleHidden() {
    this.root.classList.toggle('hidden');
  }

  /** Live monitor, called every frame (internally throttled). */
  updateHud(person, dt, label) {
    this.drawEcg(person, dt);
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    const q = (s) => this.hud.querySelector(s);
    if (!person) {
      q('.who').textContent = 'No dummy';
      q('.status').textContent = '—';
      return;
    }
    const v = person.injury.vitals();
    q('.who').textContent = label;
    const st = q('.status');
    st.textContent = v.status.toUpperCase();
    st.dataset.s = v.status;
    q('.hr').textContent = v.alive ? v.hr : '0';
    q('.bp').textContent = v.alive ? v.bp : '0/0';
    q('.spo2').textContent = v.alive && v.spo2 !== null ? v.spo2 : '—'; // no pulse, no oximeter reading
    q('.bleed').textContent = (v.bleedRate * 60).toFixed(0);
    const bp = Math.max(0, Math.min(1, v.blood / 5000));
    q('.blood').style.width = `${bp * 100}%`;
    q('.blood').classList.toggle('low', bp < 0.7);
    q('.blood-t').textContent = `${v.blood} mL`;
    q('.pain').style.width = `${v.pain * 100}%`;
    q('.pain-t').textContent = `${Math.round(v.pain * 100)}%`;
    const tone = person.ctl.tone;
    q('.tone').style.width = `${tone * 100}%`;
    q('.tone-t').textContent = `${Math.round(tone * 100)}%`;
    q('.iss').style.width = `${Math.min(1, v.iss / 75) * 100}%`;
    q('.iss-t').textContent = v.iss ? `${v.iss} ${v.issLabel}` : '0';
    const flags = [];
    if (!v.alive) flags.push(['dead', `Dead — ${v.deathCause}`]);
    else if (v.status === 'cardiac arrest') flags.push(['bad', `No pulse (${v.rhythm}) — agonal gasps`]);
    else if (!v.conscious) flags.push(['bad', 'Unconscious']);
    if (v.alive) for (const c of v.conditions) flags.push(['bad', c]);
    if (v.alive && v.status !== 'cardiac arrest' && v.rr > 24) flags.push(['warn', `Breathing ${v.rr}/min`]);
    if (v.spinal) flags.push(['bad', `Spinal cord injury (${v.spinal})`]);
    if (v.concussion > 0.2) flags.push(['warn', 'Concussed']);
    if (v.externalRate > 3) flags.push(['bad', 'Heavy external bleeding']);
    if (person.injury.bleedRate - v.externalRate > 3) flags.push(['bad', 'Internal haemorrhage']);
    const holding = person.ctl.holding;
    if (holding.L || holding.R) flags.push(['info', 'Applying pressure to wound']);
    if (person.ctl.alive && person.ctl.conscious) {
      const c = person.ctl;
      let b = { balance: c.step ? 'stepping to recover' : 'standing', falling: 'falling, bracing', ground: 'down', getup: 'getting up' }[c.mode] || c.mode;
      if (c.threat && c.threat.tti < 0.65) b = 'flinching from incoming object';
      else if (c.mode === 'ground' && c.pain > 0.6) b = 'down, in pain';
      flags.push(['info', `Behaviour: ${b}`]);
    }
    q('.flags').innerHTML = flags.map(([c, t]) => `<span class="flag ${c}">${t}</span>`).join('');
    const list = q('.injuries');
    const inj = v.injuries;
    if (inj.length !== this._injCount || person !== this._injPerson) {
      this._injCount = inj.length;
      this._injPerson = person;
      list.innerHTML = inj.length
        ? inj
            .slice(-40)
            .map((i) => `<li class="s${i.severity}${i.text.startsWith('  ') ? ' sub' : ''}"><span class="tm">${i.time.toFixed(1)}s</span>${i.text.trim()}</li>`)
            .join('')
        : '<li class="none">No injuries</li>';
      list.scrollTop = list.scrollHeight;
    }
  }

  drawEcg(person, dt) {
    const c = this.ecgCtx;
    const W = this.ecg.width, H = this.ecg.height;
    const alive = person && person.injury.alive;
    const rhythm = person ? person.injury.rhythm : 'asystole';
    const pulse = alive && person.injury.arrestTime < 0;
    // pulseless electrical activity: slow, wide complexes; ventricular fibrillation: chaotic waves
    const hr = pulse ? person.injury.hr : rhythm === 'PEA' ? 34 : 0;
    const speed = 60; // px/s
    const steps = Math.max(1, Math.round(dt * speed));
    for (let s = 0; s < steps; s++) {
      this.ecgPhase += (hr / 60) * (1 / speed);
      this.ecgT = (this.ecgT || 0) + 1 / speed;
      const ph = this.ecgPhase % 1;
      // P-QRS-T waveform
      let y = 0;
      if (alive && rhythm === 'VF') {
        const t = this.ecgT;
        y = 0.38 * Math.sin(t * 2 * Math.PI * 5.1) + 0.22 * Math.sin(t * 2 * Math.PI * 7.7 + 1.3) + 0.12 * Math.sin(t * 2 * Math.PI * 2.3);
      } else if (alive && rhythm === 'PEA') {
        y += 0.5 * Math.exp(-Math.pow((ph - 0.25) / 0.035, 2));
        y -= 0.2 * Math.exp(-Math.pow((ph - 0.33) / 0.04, 2));
      } else if (pulse && hr > 5) {
        y += 0.12 * Math.exp(-Math.pow((ph - 0.12) / 0.025, 2));
        y -= 0.15 * Math.exp(-Math.pow((ph - 0.21) / 0.008, 2));
        y += 1.0 * Math.exp(-Math.pow((ph - 0.23) / 0.009, 2));
        y -= 0.25 * Math.exp(-Math.pow((ph - 0.25) / 0.01, 2));
        y += 0.28 * Math.exp(-Math.pow((ph - 0.45) / 0.04, 2));
      }
      y += (Math.random() - 0.5) * 0.02;
      const x = this.ecgX;
      c.fillStyle = 'rgba(8,14,12,1)';
      c.fillRect(x, 0, 3, H);
      c.strokeStyle = pulse ? '#4cff9a' : '#ff5a5a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x - 1, this._lastY ?? H * 0.65);
      const py = H * 0.68 - y * H * 0.55;
      c.lineTo(x, py);
      c.stroke();
      this._lastY = py;
      this.ecgX = (x + 1) % W;
      if (this.ecgX === 0) this._lastY = py;
    }
  }
}

export { WEAPON_KEYS, THROW_KEYS };
