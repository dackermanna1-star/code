// DOM interface: broadcast-style HUD, control dock, settings drawer and the
// end-of-battle card. Talks to main.js through the `actions` callbacks.

import { ENVIRONMENTS, CONDITIONS, DIFFICULTY_PRESETS } from '../config.js';
import { describe } from './feed.js';

const ICON = {
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10l5-3v10l-5-3z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
};

const CAMERA_LABELS = { director: 'Director', follow: 'Follow', wide: 'Wide', free: 'Free' };
const CAMERA_ORDER = ['director', 'follow', 'wide', 'free'];
const PERSONALITY_SHORT = {
  rusher: 'Rushers', brawler: 'Brawlers', flanker: 'Flankers', hesitant: 'Hesitant', tactician: 'Tacticians',
  grappler: 'Grapplers', brute: 'Brutes', speedster: 'Speedsters', weapon: 'Armed', thrower: 'Throwers', berserker: 'Berserkers',
};

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const SLIDERS = [
  // id, label, min, max, step, group, live, format
  ['simSpeed', 'Simulation speed', 0.25, 3, 0.05, 'sim', true, (v) => v.toFixed(2) + '×'],
  ['maxActive', 'Enemies at once', 4, 300, 1, 'enemies', true, (v) => String(v)],
  ['spawnRate', 'Spawn rate', 0.2, 4, 0.05, 'enemies', true, (v) => v.toFixed(2) + '×'],
  ['enemyStrength', 'Enemy strength', 0.5, 2, 0.05, 'enemies', false, (v) => v.toFixed(2) + '×'],
  ['enemyIntelligence', 'Enemy intelligence', 0.3, 2, 0.05, 'enemies', false, (v) => v.toFixed(2) + '×'],
  ['enemyAggression', 'Enemy aggression', 0.3, 2, 0.05, 'enemies', true, (v) => v.toFixed(2) + '×'],
  ['randomness', 'Variety', 0, 2, 0.05, 'enemies', false, (v) => v.toFixed(2) + '×'],
  ['escalation', 'Escalation', 0, 3, 0.05, 'enemies', true, (v) => v.toFixed(2) + '×'],
  ['heroSkill', 'Hero skill', 0.5, 1.5, 0.05, 'hero', false, (v) => v.toFixed(2) + '×'],
  ['heroEndurance', 'Hero endurance', 0.5, 3, 0.05, 'hero', false, (v) => v.toFixed(2) + '×'],
  ['heroReaction', 'Hero reaction speed', 0.5, 2, 0.05, 'hero', false, (v) => v.toFixed(2) + '×'],
  ['heroSpeed', 'Hero movement speed', 0.6, 1.5, 0.05, 'hero', false, (v) => v.toFixed(2) + '×'],
  ['hazardDensity', 'Hazards', 0, 2, 0.05, 'world', false, (v) => v.toFixed(2) + '×'],
  ['propDensity', 'Props & weapons', 0, 2, 0.05, 'world', false, (v) => v.toFixed(2) + '×'],
  ['gravity', 'Gravity', 0.4, 2, 0.05, 'world', false, (v) => v.toFixed(2) + ' g'],
  ['physicsIntensity', 'Impact force', 0.5, 2, 0.05, 'world', true, (v) => v.toFixed(2) + '×'],
  ['slowMo', 'Slow motion', 0, 2, 0.05, 'view', true, (v) => (v === 0 ? 'Off' : v.toFixed(2) + '×')],
  ['screenShake', 'Screen shake', 0, 2, 0.05, 'view', true, (v) => (v === 0 ? 'Off' : v.toFixed(2) + '×')],
  ['volume', 'Volume', 0, 1, 0.01, 'view', true, (v) => Math.round(v * 100) + '%'],
];

const TOGGLES = [
  ['autoNext', 'Start the next battle automatically', 'sim'],
  ['motionTrails', 'Motion trails', 'view'],
  ['showHud', 'Show HUD', 'view'],
  ['showStats', 'Performance stats', 'view'],
  ['debugAI', 'AI debug overlay', 'view'],
];

export class UI {
  constructor(root, settings, actions) {
    this.root = root;
    this.S = settings;
    this.actions = actions;
    this.feedItems = [];
    this.bannerT = 0;
    this.pendingRestart = false;
    this.build();
  }

  build() {
    const S = this.S;
    this.hud = el(`
      <div class="hud" id="hud">
        <section class="plate" aria-label="Hero status">
          <div class="plate-head">
            <span class="plate-name">ONYX</span>
            <span class="plate-sub">the black stickman</span>
          </div>
          <div class="bar bar-hp" title="Health">
            <span class="bar-label">HP</span>
            <div class="bar-track"><div class="bar-cap"></div><div class="bar-trail"></div><div class="bar-fill"></div></div>
            <span class="bar-num" id="hpNum">190</span>
          </div>
          <div class="bar bar-st" title="Stamina">
            <span class="bar-label">ST</span>
            <div class="bar-track"><div class="bar-fill"></div></div>
            <span class="bar-num" id="stNum">100</span>
          </div>
          <div class="bar bar-fa" title="Fatigue">
            <span class="bar-label">FAT</span>
            <div class="bar-track thin"><div class="bar-fill"></div></div>
            <span class="bar-num" id="faNum">0%</span>
          </div>
          <div class="mind"><span class="mind-dot"></span><span id="mind">Sizing them up</span></div>
          <div class="chips" id="heroChips"></div>
        </section>
        <section class="clock" aria-label="Battle clock">
          <div class="clock-time" id="clock">00:00.0</div>
          <div class="clock-meta" id="simMeta">SIM #1</div>
          <div class="chips center" id="worldChips"></div>
        </section>
        <section class="board" aria-label="Enemy board">
          <div class="stat"><span class="stat-num" id="active">0</span><span class="stat-label">active</span></div>
          <div class="stat"><span class="stat-num accent" id="defeated">0</span><span class="stat-label">defeated</span></div>
          <div class="stat"><span class="stat-num" id="engaged">0</span><span class="stat-label">engaged</span></div>
          <div class="wave"><span class="wave-label" id="waveLabel">Building</span><div class="wave-track"><div class="wave-fill" id="waveFill"></div></div></div>
          <div class="mix" id="mix"></div>
        </section>
        <ol class="feed" id="feed" aria-live="polite"></ol>
        <div class="banner" id="banner" hidden><span id="bannerText"></span><small id="bannerSub"></small></div>
        <pre class="perf" id="perf" hidden></pre>
      </div>`);
    this.dock = el(`
      <nav class="dock" aria-label="Simulation controls">
        <button class="btn primary" id="btnNew" title="Generate a new simulation (N)">${ICON.refresh}<span>New battle</span></button>
        <button class="btn icon" id="btnPause" title="Pause / resume (Space)" aria-label="Pause">${ICON.pause}</button>
        <div class="seg" role="group" aria-label="Speed">
          <button class="seg-btn" data-speed="0.5">½×</button>
          <button class="seg-btn" data-speed="1">1×</button>
          <button class="seg-btn" data-speed="2">2×</button>
        </div>
        <button class="btn" id="btnCam" title="Camera mode (C)">${ICON.camera}<span id="camLabel">Director</span></button>
        <button class="btn icon" id="btnSound" title="Sound (M)" aria-label="Sound">${ICON.mute}</button>
        <button class="btn" id="btnSettings" title="Settings (S)">${ICON.sliders}<span>Settings</span></button>
      </nav>`);
    this.soundHint = el(`<button class="sound-hint" id="soundHint">${ICON.sound}<span>Turn on sound</span></button>`);
    this.drawer = el(`<aside class="drawer" id="drawer" aria-label="Simulation settings" hidden></aside>`);
    this.end = el(`
      <div class="endcard" id="endcard" hidden role="dialog" aria-labelledby="endTitle">
        <div class="end-inner">
          <p class="end-kicker" id="endKicker">SIMULATION #1</p>
          <h2 class="end-title" id="endTitle">Defeated</h2>
          <p class="end-sub" id="endSub"></p>
          <dl class="end-grid" id="endGrid"></dl>
          <div class="end-actions">
            <button class="btn primary" id="endNew">${ICON.refresh}<span>New battle</span></button>
            <button class="btn" id="endReplay">${ICON.replay}<span>Replay this seed</span></button>
          </div>
          <p class="end-count" id="endCount"></p>
        </div>
      </div>`);
    this.root.append(this.hud, this.dock, this.soundHint, this.drawer, this.end);
    this.buildDrawer();
    this.q = (id) => this.root.querySelector('#' + id);
    this.cache = {
      hpFill: this.hud.querySelector('.bar-hp .bar-fill'),
      hpTrail: this.hud.querySelector('.bar-hp .bar-trail'),
      hpCap: this.hud.querySelector('.bar-hp .bar-cap'),
      stFill: this.hud.querySelector('.bar-st .bar-fill'),
      faFill: this.hud.querySelector('.bar-fa .bar-fill'),
      hpNum: this.q('hpNum'),
      stNum: this.q('stNum'),
      faNum: this.q('faNum'),
      mind: this.q('mind'),
      clock: this.q('clock'),
      active: this.q('active'),
      defeated: this.q('defeated'),
      engaged: this.q('engaged'),
      waveLabel: this.q('waveLabel'),
      waveFill: this.q('waveFill'),
      feed: this.q('feed'),
      perf: this.q('perf'),
      heroChips: this.q('heroChips'),
      mix: this.q('mix'),
    };
    this.trail = 1;
    this.bind();
    this.syncDock();
    this.applyVisibility();
  }

  buildDrawer() {
    const S = this.S;
    const group = (g) => SLIDERS.filter((s) => s[5] === g);
    const slider = ([id, label, min, max, step, , live, fmt]) => `
      <label class="field" for="s_${id}">
        <span class="field-row"><span class="field-label">${label}${live ? '' : ' <em class="next" title="Applies to the next battle">next</em>'}</span><output id="o_${id}">${fmt(S[id])}</output></span>
        <input type="range" id="s_${id}" min="${min}" max="${max}" step="${step}" value="${S[id]}">
      </label>`;
    const toggle = ([id, label]) => `
      <label class="toggle" for="t_${id}"><input type="checkbox" id="t_${id}" ${S[id] ? 'checked' : ''}><span class="toggle-ui" aria-hidden="true"></span><span>${label}</span></label>`;
    const sel = (id, label, opts, val, next) => `
      <label class="field" for="${id}"><span class="field-row"><span class="field-label">${label}${next ? ' <em class="next">next</em>' : ''}</span></span>
        <select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>`;
    this.drawer.innerHTML = `
      <header class="drawer-head">
        <h2>Simulation settings</h2>
        <button class="btn icon ghost" id="btnClose" aria-label="Close settings">${ICON.close}</button>
      </header>
      <div class="drawer-body">
        <section class="group">
          <h3>Battle</h3>
          <div class="row-actions">
            <button class="btn primary wide" id="dNew">${ICON.refresh}<span>Generate new simulation</span></button>
            <button class="btn" id="dReplay" title="Restart with the same seed">${ICON.replay}<span>Replay</span></button>
          </div>
          <p class="hint" id="nextHint" hidden>Some changes apply to the next battle.</p>
          ${sel('difficulty', 'Difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal'], ['nightmare', 'Nightmare'], ['custom', 'Custom']], S.difficulty, true)}
          ${sel('timeLimit', 'Battle length', [[0, 'Until Onyx falls'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes']], S.timeLimit, true)}
          ${sel('totalEnemies', 'Total enemies', [[0, 'Endless'], [50, '50'], [100, '100'], [250, '250'], [500, '500'], [1000, '1,000']], S.totalEnemies, true)}
          <label class="field" for="seedInput"><span class="field-row"><span class="field-label">Seed</span></span>
            <span class="seed-row"><input type="text" id="seedInput" inputmode="text" spellcheck="false" autocomplete="off"><button class="btn small" id="seedGo">Run seed</button></span>
          </label>
          ${group('sim').map(slider).join('')}
          ${TOGGLES.filter((t) => t[2] === 'sim').map(toggle).join('')}
        </section>
        <section class="group">
          <h3>Enemies</h3>
          ${group('enemies').map(slider).join('')}
        </section>
        <section class="group">
          <h3>The black stickman</h3>
          ${group('hero').map(slider).join('')}
        </section>
        <section class="group">
          <h3>World &amp; physics</h3>
          ${sel('environment', 'Environment', [['random', 'Random']].concat(ENVIRONMENTS.map((e) => [e.id, e.label])), S.environment, true)}
          ${sel('condition', 'Conditions', [['random', 'Random']].concat(CONDITIONS.map((c) => [c.id, c.label])), S.condition, true)}
          ${group('world').map(slider).join('')}
        </section>
        <section class="group">
          <h3>Presentation</h3>
          ${sel('cameraMode', 'Camera', CAMERA_ORDER.map((c) => [c, CAMERA_LABELS[c]]), S.cameraMode)}
          ${sel('quality', 'Render quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], S.quality)}
          ${group('view').map(slider).join('')}
          ${TOGGLES.filter((t) => t[2] === 'view').map(toggle).join('')}
        </section>
        <section class="group keys">
          <h3>Keyboard</h3>
          <dl class="keylist">
            <dt>Space</dt><dd>Pause</dd><dt>N</dt><dd>New battle</dd><dt>R</dt><dd>Replay seed</dd>
            <dt>C</dt><dd>Camera mode</dd><dt>M</dt><dd>Sound</dd><dt>H</dt><dd>Hide interface</dd>
            <dt>S</dt><dd>Settings</dd><dt>1 2 3</dt><dd>Speed</dd><dt>D</dt><dd>AI overlay</dd>
          </dl>
        </section>
      </div>`;
  }

  bind() {
    const a = this.actions;
    const $ = (id) => this.root.querySelector('#' + id);
    $('btnNew').addEventListener('click', () => a.newSim());
    $('btnPause').addEventListener('click', () => a.togglePause());
    $('btnCam').addEventListener('click', () => a.cycleCamera());
    $('btnSound').addEventListener('click', () => a.toggleSound());
    this.soundHint.addEventListener('click', () => a.toggleSound(true));
    $('btnSettings').addEventListener('click', () => this.toggleDrawer());
    $('btnClose').addEventListener('click', () => this.toggleDrawer(false));
    $('dNew').addEventListener('click', () => a.newSim());
    $('dReplay').addEventListener('click', () => a.replay());
    $('endNew').addEventListener('click', () => a.newSim());
    $('endReplay').addEventListener('click', () => a.replay());
    $('seedGo').addEventListener('click', () => {
      const v = $('seedInput').value.trim();
      const seed = /^[0-9a-f]{1,8}$/i.test(v) ? parseInt(v, 16) : hashSeed(v);
      a.newSim(seed);
    });
    this.dock.querySelectorAll('.seg-btn').forEach((b) =>
      b.addEventListener('click', () => {
        this.S.simSpeed = parseFloat(b.dataset.speed);
        this.syncInputs();
        a.settingsChanged('simSpeed');
      }),
    );
    for (const [id, , , , , , live, fmt] of SLIDERS) {
      const input = $('s_' + id);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        this.S[id] = v;
        $('o_' + id).textContent = fmt(v);
        if (['maxActive', 'spawnRate', 'enemyStrength', 'enemyIntelligence', 'enemyAggression', 'escalation', 'heroEndurance'].includes(id)) {
          this.S.difficulty = 'custom';
          $('difficulty').value = 'custom';
        }
        if (!live) $('nextHint').hidden = false;
        a.settingsChanged(id);
      });
    }
    for (const [id] of TOGGLES) {
      $('t_' + id).addEventListener('change', (e) => {
        this.S[id] = e.target.checked;
        this.applyVisibility();
        a.settingsChanged(id);
      });
    }
    for (const id of ['difficulty', 'timeLimit', 'totalEnemies', 'environment', 'condition', 'cameraMode', 'quality']) {
      $(id).addEventListener('change', (e) => {
        let v = e.target.value;
        if (id === 'timeLimit' || id === 'totalEnemies') v = parseInt(v, 10);
        this.S[id] = v;
        if (id === 'difficulty' && DIFFICULTY_PRESETS[v]) {
          Object.assign(this.S, DIFFICULTY_PRESETS[v]);
          this.syncInputs();
        }
        if (['difficulty', 'timeLimit', 'totalEnemies', 'environment', 'condition'].includes(id)) $('nextHint').hidden = false;
        if (id === 'cameraMode') this.syncDock();
        a.settingsChanged(id);
      });
    }
  }

  syncInputs() {
    const $ = (id) => this.root.querySelector('#' + id);
    for (const [id, , , , , , , fmt] of SLIDERS) {
      $('s_' + id).value = this.S[id];
      $('o_' + id).textContent = fmt(this.S[id]);
    }
    for (const [id] of TOGGLES) $('t_' + id).checked = !!this.S[id];
    for (const id of ['difficulty', 'timeLimit', 'totalEnemies', 'environment', 'condition', 'cameraMode', 'quality']) $(id).value = String(this.S[id]);
    this.syncDock();
  }

  syncDock() {
    const S = this.S;
    this.dock.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', Math.abs(parseFloat(b.dataset.speed) - S.simSpeed) < 0.01));
    const cl = this.root.querySelector('#camLabel');
    if (cl) cl.textContent = CAMERA_LABELS[S.cameraMode];
    const sb = this.root.querySelector('#btnSound');
    if (sb) {
      sb.innerHTML = S.muted ? ICON.mute : ICON.sound;
      sb.setAttribute('aria-label', S.muted ? 'Turn sound on' : 'Mute sound');
    }
    this.soundHint.hidden = !S.muted || this.soundHintDismissed;
  }

  setPaused(p) {
    const b = this.root.querySelector('#btnPause');
    b.innerHTML = p ? ICON.play : ICON.pause;
    b.setAttribute('aria-label', p ? 'Resume' : 'Pause');
    this.root.classList.toggle('paused', p);
  }

  toggleDrawer(force) {
    const open = force !== undefined ? force : this.drawer.hidden;
    this.drawer.hidden = !open;
    this.root.classList.toggle('drawer-open', open);
  }

  applyVisibility() {
    this.hud.hidden = !this.S.showHud;
    this.root.querySelector('#perf').hidden = !this.S.showStats;
    this.root.classList.toggle('ui-hidden', !this.S.showHud);
  }

  // ------------------------------------------------------------ per battle
  onNewSim(sim) {
    this.feedItems.length = 0;
    this.cache.feed.innerHTML = '';
    this.trail = 1;
    this.banner(null);
    this.end.hidden = true;
    this.lastStand = false;
    this.root.querySelector('#nextHint').hidden = true;
    this.root.querySelector('#seedInput').value = sim.seed.toString(16).toUpperCase().padStart(8, '0');
    this.root.querySelector('#simMeta').textContent = `SIM #${sim.number} · SEED ${sim.seed.toString(16).toUpperCase().padStart(8, '0')}`;
    const env = ENVIRONMENTS.find((e) => e.id === sim.level.theme);
    const cond = CONDITIONS.find((c) => c.id === sim.level.condition);
    this.root.querySelector('#worldChips').innerHTML = `<span class="chip">${env ? env.label : sim.level.theme}</span><span class="chip ${sim.level.condition !== 'clear' ? 'warn' : ''}">${cond ? cond.label : sim.level.condition}</span>`;
  }

  event(e) {
    const d = describe(e);
    if (d) this.pushFeed(d.text, d.level);
    if (e.t === 'wave') this.banner(`WAVE ${e.n}`, `${e.count} incoming`, 2.2);
    else if (e.t === 'chain' && e.count >= 3) this.banner(`CHAIN ×${e.count + 1}`, null, 1.4);
    else if (e.t === 'heroDefeated') this.banner('DEFEATED', null, 3.5);
    else if (e.t === 'victory') this.banner(e.reason === 'cleared' ? 'CLEARED' : 'SURVIVED', null, 3.5);
  }

  pushFeed(text, level) {
    const li = document.createElement('li');
    li.className = 'feed-item lvl' + level;
    li.textContent = text;
    this.cache.feed.prepend(li);
    this.feedItems.unshift({ li, t: 0, life: 5 + level * 1.5 });
    while (this.feedItems.length > 6) {
      const old = this.feedItems.pop();
      old.li.remove();
    }
  }

  banner(text, sub, dur) {
    const b = this.root.querySelector('#banner');
    if (!text) {
      b.hidden = true;
      this.bannerT = 0;
      return;
    }
    this.root.querySelector('#bannerText').textContent = text;
    this.root.querySelector('#bannerSub').textContent = sub || '';
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerT = dur || 2;
  }

  update(dt, sim, perf) {
    const c = this.cache;
    const h = sim.heroState();
    const hpK = Math.max(0, h.hp / h.maxHp);
    if (hpK < this.trail) this.trail = Math.max(hpK, this.trail - dt * 0.35);
    else this.trail = hpK;
    c.hpFill.style.transform = `scaleX(${hpK})`;
    c.hpTrail.style.transform = `scaleX(${this.trail})`;
    c.hpCap.style.left = `${Math.max(0, (1 - h.injury / h.maxHp)) * 100}%`;
    c.hpNum.textContent = Math.ceil(h.hp);
    c.stFill.style.transform = `scaleX(${Math.max(0, h.stamina / 100)})`;
    c.stNum.textContent = Math.max(0, Math.round(h.stamina));
    c.faFill.style.transform = `scaleX(${h.fatigue})`;
    c.faNum.textContent = Math.round(h.fatigue * 100) + '%';
    this.hud.classList.toggle('critical', hpK < 0.25 && !sim.hero.dead);
    if (c.mind.textContent !== h.mind) c.mind.textContent = h.mind;
    c.clock.textContent = fmtTime(sim.over ? sim.over.time : sim.time);
    c.active.textContent = sim.enemiesAlive;
    c.defeated.textContent = sim.stats.defeated;
    c.engaged.textContent = h.engaged;
    const D = sim.director;
    const phase = D.phase === 'peak' ? 'Wave ' + D.wave : D.phase === 'relax' ? 'Lull' : 'Building';
    if (c.waveLabel.textContent !== phase) c.waveLabel.textContent = phase;
    const prog = D.phase === 'build' ? D.phaseT / D.phaseDur : D.phase === 'peak' ? 1 : 1 - D.phaseT / D.phaseDur;
    c.waveFill.style.transform = `scaleX(${Math.max(0, Math.min(1, prog))})`;
    c.waveFill.classList.toggle('hot', D.phase === 'peak');
    // hero chips
    const chips = [];
    if (h.weapon) chips.push(`<span class="chip good">${h.weapon}</span>`);
    if (h.state === 'held') chips.push('<span class="chip bad">Grabbed</span>');
    if (h.fatigue > 0.45) chips.push('<span class="chip warn">Exhausted</span>');
    else if (h.fatigue > 0.22) chips.push('<span class="chip warn">Winded</span>');
    if (h.injury > h.maxHp * 0.35) chips.push('<span class="chip bad">Injured</span>');
    const ch = chips.join('');
    if (ch !== this._chips) {
      c.heroChips.innerHTML = ch;
      this._chips = ch;
    }
    if (!this.lastStand && hpK < 0.2 && !sim.hero.dead && !sim.over) {
      this.lastStand = true;
      this.banner('LAST STAND', null, 2);
    }
    // enemy mix (refresh twice a second)
    this._mixT = (this._mixT || 0) - dt;
    if (this._mixT <= 0) {
      this._mixT = 0.5;
      const counts = {};
      for (const e of sim.enemies) if (!e.dead && !e.removed) counts[e.personality] = (counts[e.personality] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      c.mix.innerHTML = top.map(([k, v]) => `<span>${v} ${PERSONALITY_SHORT[k] || k}</span>`).join('');
    }
    // feed aging
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const it = this.feedItems[i];
      it.t += dt;
      if (it.t > it.life) {
        it.li.classList.add('gone');
        if (it.t > it.life + 0.6) {
          it.li.remove();
          this.feedItems.splice(i, 1);
        }
      }
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.root.querySelector('#banner').hidden = true;
    }
    if (this.S.showStats && perf) c.perf.textContent = perf;
  }

  showEnd(sim, countdown) {
    const o = sim.over;
    const st = sim.stats;
    const hero = sim.hero;
    this.root.querySelector('#endKicker').textContent = `SIMULATION #${sim.number} · ${sim.level.theme.toUpperCase()}`;
    this.root.querySelector('#endTitle').textContent = o.victory ? (o.reason === 'cleared' ? 'Cleared' : 'Survived') : 'Defeated';
    const causes = { electric: 'electrocuted', fell: 'fell from a height', explosion: 'caught in an explosion', window: 'thrown out a window', body: 'flattened by flying bodies', slam: 'slammed into the floor', beaten: 'overwhelmed' };
    this.root.querySelector('#endSub').textContent = o.victory
      ? `Onyx held on for ${fmtTime(o.time)} and put down ${st.defeated} opponents.`
      : `Onyx was ${causes[o.cause] || 'overwhelmed'}${o.by ? ` (final blow: ${o.by})` : ''} after ${fmtTime(o.time)}.`;
    const env = Object.entries(st.byCause).filter(([k]) => ['electric', 'fell', 'window', 'explosion', 'steam', 'wall', 'object'].includes(k)).reduce((a, [, v]) => a + v, 0);
    const rows = [
      ['Survival time', fmtTime(o.time)],
      ['Enemies defeated', st.defeated],
      ['Enemies faced', st.spawned],
      ['Hits landed', hero.stats.hits],
      ['Blocks & parries', hero.stats.blocks],
      ['Dodges', hero.stats.dodges],
      ['Environmental KOs', env],
      ['Best chain reaction', st.bestChain ? st.bestChain + 1 : '—'],
      ['Most engaged at once', st.maxEngaged],
      ['Friendly-fire KOs', st.friendlyKOs],
    ];
    this.root.querySelector('#endGrid').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.end.hidden = false;
    this.setCountdown(countdown);
  }

  setCountdown(sec) {
    const ec = this.root.querySelector('#endCount');
    ec.textContent = sec !== null && sec !== undefined && this.S.autoNext ? `Next battle in ${Math.ceil(sec)}s` : '';
  }

  hideEnd() {
    this.end.hidden = true;
  }
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
