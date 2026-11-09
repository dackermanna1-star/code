// DOM user interface: menus, character & level select, HUD, overlays, touch controls.

import { CHARACTERS, characterById } from '../characters/index.js';
import { LEVELS } from '../levels/index.js';
import { THEMES } from '../level/themes.js';
import { Autopilot } from '../core/autopilot.js';
import { Physics } from '../physics/physics.js';
import { Particles } from '../core/particles.js';
import { formatTime, pick } from '../core/math.js';
import { LevelBuilder } from '../level/builder.js';

/** Number of checkpoints in a level definition (cached). */
const cpCounts = new Map();
function checkpointCount(lv) {
  if (!cpCounts.has(lv.id)) {
    const b = new LevelBuilder(lv);
    lv.build(b);
    cpCounts.set(lv.id, b.objects.filter((o) => o.type === 'checkpoint').length);
  }
  return cpCounts.get(lv.id);
}

const $ = (sel, root = document) => root.querySelector(sel);

const TOOTH_SVG = `<svg viewBox="0 0 24 28" class="tooth"><path d="M3 6c0-3 3-4 5-3 2 1 3 1 4 1s2 0 4-1c2-1 5 0 5 3 0 4-1 8-2 13-.5 3-1.5 6-3 6-1.5 0-1.5-4-2.5-7-.5-1.5-1-1.5-1.5 0-1 3-1 7-2.5 7-1.5 0-2.5-3-3-6C4 14 3 10 3 6z"/></svg>`;

const KEYS_HELP = [
  ['↑ / W', 'Accelerate'],
  ['↓ / S', 'Brake / reverse'],
  ['← → / A D', 'Lean back / forward'],
  ['SPACE', 'Primary ability'],
  ['SHIFT / X', 'Secondary ability'],
  ['Z', 'Eject (abandon vehicle)'],
  ['ENTER', 'Respawn at checkpoint'],
  ['R', 'Restart level'],
  ['ESC / P', 'Pause'],
  ['M', 'Mute'],
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.charId = game.store.data.character || 'marco';
    this.screen = null;
    this.toastQ = [];
    this.build();
    this.bindGame();
    this.showMain();
  }

  // ------------------------------------------------------------------ DOM

  build() {
    this.root.innerHTML = `
      <div id="hud" class="hidden">
        <div class="hud-tl">
          <div id="hud-level"></div>
          <div id="hud-time">0:00.00</div>
        </div>
        <div class="hud-tr"><div id="hud-teeth"></div><button class="icon-btn" id="hud-pause" title="Pause">II</button></div>
        <div class="hud-bl">
          <div id="hud-name"></div>
          <div class="bar"><span>BLOOD</span><div class="track"><div id="hud-hp"></div></div></div>
          <div class="bar" id="hud-meter-row"><span id="hud-meter-label"></span><div class="track"><div id="hud-meter"></div></div></div>
        </div>
        <div id="hud-hint"></div>
        <div id="toasts"></div>
        <div id="death" class="hidden"><h2></h2><p></p></div>
      </div>

      <div id="screen-main" class="screen main-screen">
        <div class="logo">
          <div class="logo-top">BRITTLE</div>
          <div class="logo-bottom">BONES</div>
          <div class="logo-sub">a physics-based obstacle course of poor decisions</div>
        </div>
        <div class="menu-buttons">
          <button class="btn big" data-act="play">PLAY</button>
          <button class="btn" data-act="chars">CHARACTERS</button>
          <button class="btn" data-act="help">HOW TO PLAY</button>
          <button class="btn" data-act="settings">SETTINGS</button>
        </div>
        <div class="footer-note">Turn your sound on. Gore warning: cartoon blood &amp; dismemberment.</div>
      </div>

      <div id="screen-chars" class="screen panel-screen">
        <h1>CHOOSE YOUR VICTIM</h1>
        <div id="char-grid" class="card-grid"></div>
        <div class="row-buttons">
          <button class="btn ghost" data-act="back-main">BACK</button>
          <button class="btn big" data-act="to-levels">SELECT LEVEL →</button>
        </div>
      </div>

      <div id="screen-levels" class="screen panel-screen">
        <h1>SELECT A LEVEL</h1>
        <div class="level-sub">Playing as <b id="lvl-char"></b> · <a href="#" data-act="chars">change</a></div>
        <div id="level-grid" class="card-grid levels"></div>
        <div class="row-buttons"><button class="btn ghost" data-act="back-main">BACK</button></div>
      </div>

      <div id="screen-pause" class="screen modal">
        <div class="modal-box">
          <h1>PAUSED</h1>
          <div class="col-buttons">
            <button class="btn big" data-act="resume">RESUME</button>
            <button class="btn" data-act="restart">RESTART LEVEL</button>
            <button class="btn" data-act="help">CONTROLS</button>
            <button class="btn" data-act="settings">SETTINGS</button>
            <button class="btn ghost" data-act="to-levels">LEVEL SELECT</button>
            <button class="btn ghost" data-act="quit">MAIN MENU</button>
          </div>
        </div>
      </div>

      <div id="screen-results" class="screen modal">
        <div class="modal-box results">
          <h1>LEVEL COMPLETE</h1>
          <div class="res-rating" id="res-rating"></div>
          <div class="res-grid">
            <div><label>TIME</label><b id="res-time"></b></div>
            <div><label>BEST</label><b id="res-best"></b></div>
            <div><label>GOLD TEETH</label><b id="res-teeth"></b></div>
            <div><label>BODY PARTS LOST</label><b id="res-limbs"></b></div>
          </div>
          <div class="col-buttons">
            <button class="btn big" data-act="next">NEXT LEVEL →</button>
            <button class="btn" data-act="restart">RETRY</button>
            <button class="btn ghost" data-act="to-levels">LEVEL SELECT</button>
          </div>
        </div>
      </div>

      <div id="screen-settings" class="screen modal">
        <div class="modal-box">
          <h1>SETTINGS</h1>
          <div class="settings">
            <label>Volume <input type="range" min="0" max="1" step="0.05" id="set-volume"></label>
            <label><input type="checkbox" id="set-muted"> Mute</label>
            <label><input type="checkbox" id="set-blood"> Blood &amp; gore effects</label>
            <label><input type="checkbox" id="set-shake"> Screen shake</label>
            <label><input type="checkbox" id="set-unlock"> Unlock all levels</label>
            <label><input type="checkbox" id="set-touch"> On-screen touch controls</label>
            <button class="btn ghost small" data-act="reset">Reset progress</button>
          </div>
          <div class="col-buttons"><button class="btn" data-act="close-modal">DONE</button></div>
        </div>
      </div>

      <div id="screen-help" class="screen modal">
        <div class="modal-box help">
          <h1>HOW TO PLAY</h1>
          <p>Get to the <b>FINISH</b> flag. Your vehicle is optional. Your limbs are optional. Being alive is not.</p>
          <div class="keys">${KEYS_HELP.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
          <p class="tips">Lean in the air to land on your wheels. Every character handles differently and has a special ability.
          Collect the three hidden <b>gold teeth</b> in each level. Checkpoint flags let you respawn with ENTER.</p>
          <div class="col-buttons"><button class="btn" data-act="close-modal">GOT IT</button></div>
        </div>
      </div>

      <div id="touch" class="hidden">
        <div class="tleft">
          <button data-k="left">◀</button><button data-k="right">▶</button>
        </div>
        <div class="tright">
          <button data-k="secondary" class="small">✦</button>
          <button data-k="primary">★</button>
          <button data-k="down">▼</button>
          <button data-k="up" class="gas">▲</button>
        </div>
        <div class="ttop"><button data-k="eject">⏏</button><button data-k="respawn">↺</button></div>
      </div>
    `;

    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      e.preventDefault();
      this.game.audio.init();
      this.game.audio.click();
      this.action(el.dataset.act, el);
    });
    $('#hud-pause').addEventListener('click', () => this.game.togglePause());

    // settings
    const s = this.game.settings;
    const vol = $('#set-volume');
    vol.value = s.volume;
    vol.addEventListener('input', () => {
      s.volume = parseFloat(vol.value);
      this.game.audio.setVolume(s.volume);
      this.game.store.save();
    });
    const bind = (id, key, after) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => {
        s[key] = el.checked;
        this.game.store.save();
        if (after) after(el.checked);
      });
    };
    bind('#set-muted', 'muted', (v) => this.game.audio.setMuted(v));
    bind('#set-blood', 'blood');
    bind('#set-shake', 'shake');
    bind('#set-unlock', 'unlockAll', () => this.renderLevels());
    const touchEl = $('#set-touch');
    touchEl.checked = this.touchEnabled();
    touchEl.addEventListener('change', () => {
      s.touch = touchEl.checked ? 'on' : 'off';
      this.game.store.save();
      this.updateTouch();
    });

    // touch buttons
    for (const b of this.root.querySelectorAll('#touch [data-k]')) {
      const k = b.dataset.k;
      const on = (e) => {
        e.preventDefault();
        this.game.audio.init();
        this.game.input.setVirtual(k, true);
        b.classList.add('on');
      };
      const off = (e) => {
        e.preventDefault();
        this.game.input.setVirtual(k, false);
        b.classList.remove('on');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    }

    // unlock audio on first interaction
    const unlock = () => this.game.audio.init();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // keyboard shortcuts on menus
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'main' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        this.action('play');
      } else if (this.screen === 'results' && e.code === 'Enter') {
        e.preventDefault();
        this.action('next');
      } else if (this.screen === 'results' && e.code === 'KeyR') {
        this.action('restart');
      } else if ((this.screen === 'help' || this.screen === 'settings') && e.code === 'Escape') {
        this.action('close-modal');
      } else if ((this.screen === 'chars' || this.screen === 'levels') && e.code === 'Escape') {
        this.action('back-main');
      }
    });
  }

  touchEnabled() {
    const t = this.game.settings.touch;
    if (t === 'on') return true;
    if (t === 'off') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  updateTouch() {
    const show = this.touchEnabled() && this.screen === 'game';
    $('#touch').classList.toggle('hidden', !show);
  }

  show(id) {
    for (const el of this.root.querySelectorAll('.screen')) el.classList.remove('active');
    if (id) $('#screen-' + id).classList.add('active');
  }

  // ------------------------------------------------------------------ navigation

  action(act, el) {
    const g = this.game;
    switch (act) {
      case 'play':
        this.showChars();
        break;
      case 'chars':
        this.showChars();
        break;
      case 'to-levels':
        if (g.state === 'paused' || this.screen === 'results') {
          g.quit();
        }
        this.showLevels();
        break;
      case 'back-main':
        this.showMain();
        break;
      case 'help':
        this.modalReturn = this.screen;
        this.screen = 'help';
        this.show('help');
        break;
      case 'settings':
        this.modalReturn = this.screen;
        this.screen = 'settings';
        this.show('settings');
        break;
      case 'close-modal':
        this.screen = this.modalReturn || 'main';
        if (this.screen === 'pause') this.show('pause');
        else if (this.screen === 'main') this.show('main');
        else this.show(this.screen);
        break;
      case 'resume':
        g.togglePause();
        break;
      case 'restart':
        this.enterGame();
        g.restart();
        break;
      case 'quit':
        this.showMain();
        break;
      case 'next': {
        const i = LEVELS.indexOf(g.levelDef);
        if (i >= 0 && i < LEVELS.length - 1) this.startLevel(LEVELS[i + 1]);
        else this.showLevels();
        break;
      }
      case 'pick-char':
        this.charId = el.dataset.id;
        g.store.data.character = this.charId;
        g.store.save();
        this.renderChars();
        break;
      case 'pick-level': {
        const lv = LEVELS[parseInt(el.dataset.i, 10)];
        const card = el.closest('.level-card');
        if (card && !card.classList.contains('locked')) this.startLevel(lv, parseInt(el.dataset.cp || '0', 10));
        break;
      }
      case 'reset':
        // two-step confirmation inside the page (no browser dialogs)
        if (el.dataset.armed === '1') {
          g.store.reset();
          this.renderLevels();
          el.dataset.armed = '';
          el.textContent = 'Progress reset';
        } else {
          el.dataset.armed = '1';
          el.textContent = 'Click again to erase all progress';
          setTimeout(() => {
            el.dataset.armed = '';
            el.textContent = 'Reset progress';
          }, 4000);
        }
        break;
      default:
        break;
    }
  }

  showMain() {
    this.screen = 'main';
    this.show('main');
    $('#hud').classList.add('hidden');
    this.updateTouch();
    this.startAttract();
  }

  startAttract() {
    const g = this.game;
    if (this.autopilot) this.autopilot.detach();
    this.autopilot = new Autopilot(g.input, { boost: true });
    g.autopilot = this.autopilot;
    const Ch = pick(CHARACTERS.filter((c) => c.id !== 'gary'));
    g.start(LEVELS[0], Ch, { attract: true });
  }

  stopAttract() {
    if (this.autopilot) this.autopilot.detach();
    this.autopilot = null;
    this.game.autopilot = null;
  }

  showChars() {
    this.screen = 'chars';
    this.show('chars');
    this.renderChars();
  }

  showLevels() {
    if (this.game.state === 'idle' || !this.game.attract) this.startAttract();
    this.screen = 'levels';
    this.show('levels');
    $('#hud').classList.add('hidden');
    this.updateTouch();
    this.renderLevels();
  }

  startLevel(lv, checkpoint = 0) {
    this.stopAttract();
    this.enterGame();
    this.game.start(lv, characterById(this.charId), { checkpoint });
  }

  enterGame() {
    this.screen = 'game';
    this.show(null);
    $('#hud').classList.remove('hidden');
    $('#death').classList.add('hidden');
    this.updateTouch();
  }

  // ------------------------------------------------------------------ cards

  renderChars() {
    const grid = $('#char-grid');
    grid.innerHTML = '';
    for (const C of CHARACTERS) {
      const card = document.createElement('div');
      card.className = 'card char-card' + (C.id === this.charId ? ' selected' : '');
      card.dataset.act = 'pick-char';
      card.dataset.id = C.id;
      const stat = (k, label) =>
        `<div class="stat"><span>${label}</span><div class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= C.stats[k] ? 'on' : ''}"></i>`).join('')}</div></div>`;
      card.innerHTML = `
        <canvas width="320" height="260" style="background:linear-gradient(180deg, ${C.portraitColor}33, ${C.portraitColor}11)"></canvas>
        <div class="card-body">
          <h3>${C.displayName}</h3>
          <div class="vehicle">${C.vehicleName}</div>
          <p>${C.blurb}</p>
          ${stat('speed', 'SPEED')}${stat('accel', 'ACCEL')}${stat('handling', 'HANDLING')}${stat('toughness', 'TOUGHNESS')}
          <div class="ability">${C.ability}${C.ability2 ? '<br>' + C.ability2 : ''}</div>
        </div>`;
      grid.appendChild(card);
      drawPortrait(card.querySelector('canvas'), C);
    }
  }

  renderLevels() {
    const grid = $('#level-grid');
    if (!grid) return;
    $('#lvl-char').textContent = characterById(this.charId).displayName;
    grid.innerHTML = '';
    const store = this.game.store;
    LEVELS.forEach((lv, i) => {
      const rec = store.level(lv.id);
      const unlocked = store.isUnlocked(i, LEVELS);
      const th = THEMES[lv.theme];
      const card = document.createElement('div');
      card.className = 'card level-card' + (unlocked ? '' : ' locked') + (rec.completed ? ' done' : '');
      card.dataset.act = 'pick-level';
      card.dataset.i = i;
      const teeth = [0, 1, 2].map((k) => `<span class="${rec.teeth && rec.teeth[k] ? 'got' : ''}">${TOOTH_SVG}</span>`).join('');
      card.innerHTML = `
        <div class="thumb" style="background:linear-gradient(180deg, ${th.sky[0]}, ${th.sky[1]} 60%, ${th.ground.top} 61%, ${th.ground.fill})">
          <div class="num">${i + 1}</div>
          ${unlocked ? '' : '<div class="lock">\u{1F512}</div>'}
        </div>
        <div class="card-body">
          <h3>${lv.name}</h3>
          <div class="skulls">${'☠'.repeat(lv.difficulty)}<span>${'☠'.repeat(5 - lv.difficulty)}</span></div>
          <p>${lv.blurb}</p>
          ${unlocked ? `<div class="starts"><span>START AT</span>${['\u25B6'].concat(Array.from({ length: checkpointCount(lv) }, (_, k) => '\u2691' + (k + 1))).map((t, k) => `<button class="chip" data-act="pick-level" data-i="${i}" data-cp="${k}" title="${k ? 'Start at checkpoint ' + k + ' (practice: no best time)' : 'Start from the beginning'}">${t}</button>`).join('')}</div>` : ''}
          <div class="lvl-foot"><span class="best">${rec.best != null ? 'BEST ' + formatTime(rec.best) : rec.completed ? 'FINISHED FROM A CHECKPOINT' : unlocked ? 'NOT FINISHED' : 'LOCKED'}</span><span class="teeth">${teeth}</span></div>
        </div>`;
      grid.appendChild(card);
    });
  }

  // ------------------------------------------------------------------ game events

  bindGame() {
    const g = this.game;
    g.on('levelstart', ({ level, character }) => {
      if (g.attract) return;
      $('#hud-level').textContent = `${LEVELS.indexOf(level) + 1}. ${level.name}`;
      $('#hud-name').textContent = character.displayName;
      $('#death').classList.add('hidden');
      this.renderTeeth();
      const ab = [character.ability, character.ability2].filter(Boolean).join(' · ');
      this.hint(`↑↓ drive · ←→ lean · ${ab} · Z eject · R restart`, 7);
    });
    g.on('respawn', () => {
      $('#death').classList.add('hidden');
    });
    g.on('death', ({ text, hasCheckpoint }) => {
      if (g.attract) return;
      const d = $('#death');
      $('h2', d).textContent = text;
      $('p', d).innerHTML = hasCheckpoint
        ? '<kbd>ENTER</kbd> respawn at checkpoint &nbsp; <kbd>R</kbd> restart level'
        : '<kbd>ENTER</kbd> / <kbd>R</kbd> restart level';
      setTimeout(() => {
        if (g.state === 'dead') d.classList.remove('hidden');
      }, 700);
    });
    g.on('teeth', () => this.renderTeeth());
    g.on('toast', ({ text, kind }) => {
      if (!g.attract) this.toast(text, kind);
    });
    g.on('pause', () => {
      this.screen = 'pause';
      this.show('pause');
    });
    g.on('resume', () => {
      this.screen = 'game';
      this.show(null);
    });
    g.on('finish', (r) => {
      setTimeout(() => this.showResults(r), 1400);
    });
  }

  renderTeeth() {
    const g = this.game;
    const n = g.teeth.length;
    $('#hud-teeth').innerHTML = g.teeth.map((t) => `<span class="${t ? 'got' : ''}">${TOOTH_SVG}</span>`).join('') || '';
    if (!n) $('#hud-teeth').innerHTML = '';
  }

  showResults(r) {
    if (this.game.state !== 'finished') return;
    this.screen = 'results';
    this.show('results');
    $('#res-time').textContent = formatTime(r.time);
    $('#res-best').innerHTML = r.best != null ? formatTime(r.best) + (r.newBest ? ' <em>NEW!</em>' : '') : '--';
    $('#res-teeth').textContent = `${r.teeth.filter(Boolean).length} / ${r.teeth.length}`;
    $('#res-limbs').textContent = r.limbsLost;
    let rating;
    if (r.limbsLost === 0 && r.hp > 85) rating = 'FLAWLESS. SUSPICIOUSLY SO.';
    else if (r.limbsLost === 0) rating = 'BRUISED BUT WHOLE';
    else if (r.limbsLost <= 2) rating = 'SOME ASSEMBLY REQUIRED';
    else rating = 'HELD TOGETHER BY SPITE';
    if (r.practice) rating = 'CHECKPOINT START \u2014 NO BEST TIME';
    $('#res-rating').textContent = rating;
    const i = LEVELS.indexOf(this.game.levelDef);
    $('[data-act="next"]', $('#screen-results')).textContent = i < LEVELS.length - 1 ? 'NEXT LEVEL →' : 'ALL LEVELS';
  }

  hint(text, seconds) {
    const h = $('#hud-hint');
    h.textContent = text;
    h.classList.add('show');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => h.classList.remove('show'), seconds * 1000);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  update() {
    const g = this.game;
    if (this.screen !== 'game' && this.screen !== 'pause') return;
    if (!g.player) return;
    $('#hud-time').textContent = formatTime(g.levelTime);
    const hp = Math.max(0, g.player.rider.hp);
    const hpEl = $('#hud-hp');
    hpEl.style.width = hp + '%';
    hpEl.style.background = hp > 50 ? '#e2333b' : hp > 25 ? '#ff7a1a' : '#ffd23f';
    const m = g.player.meter;
    const row = $('#hud-meter-row');
    if (m) {
      row.style.display = '';
      $('#hud-meter-label').textContent = m.label;
      const me = $('#hud-meter');
      me.style.width = Math.round(m.value * 100) + '%';
      me.style.background = m.color;
    } else row.style.display = 'none';
  }
}

/** Render a static portrait of a character using a throwaway physics world. */
function drawPortrait(canvas, C) {
  const fake = {
    phys: new Physics(),
    settings: { blood: true },
    audio: new Proxy({}, { get: () => () => null }),
    camera: { shake() {} },
    killY: -100,
    onPlayerDeath() {},
    onDismount() {},
    onGore() {},
    spawnGibs() {},
    spawnDebris() {},
  };
  fake.particles = new Particles(fake);
  let ch;
  try {
    ch = new C(fake, 0, 0);
  } catch (e) {
    console.error(e);
    return;
  }
  const ctx = canvas.getContext('2d');
  const k = 82;
  ctx.setTransform(k, 0, 0, -k, canvas.width / 2 + 10, canvas.height - 18);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.4, 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ch.draw(ctx);
}
