// The screens around the game: the title (the coast behind it at dusk),
// pause, settings and controls, and the one nobody wants - you died.
import { O } from '../state.js';

const KEYS = [
  ['W A S D', 'Move'], ['Shift', 'Sprint (hold) / hold breath (scoped)'], ['Ctrl', 'Walk (hold)'], ['C', 'Crouch'], ['Z', 'Go prone'], ['Space', 'Jump / let go of a ladder'],
  ['Left mouse', 'Fire / swing (hold for a heavy swing) / use'], ['Right mouse', 'Aim down sights / block'], ['R', 'Reload / clear a jam'], ['B', 'Fire mode'],
  ['F', 'Open doors, pick up, search bodies'], ['Tab', 'Inventory'], ['M', 'Map'], ['V', 'First / third person'], ['L', 'Flashlight'], ['1 – 9', 'Hotbar'], ['H', 'Put away what’s in your hands'], ['Esc', 'Pause'],
];

export class Menus {
  constructor(root) {
    this.root = root;
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = 'ob-screen ' + cls + ' hide'; d.innerHTML = html; root.appendChild(d); return d; };
    this.title = mk('ob-title', `<div class="logo">THE <b>OUTBREAK</b></div><div class="tag">South Karevia · three weeks after</div><div class="menu"></div>
      <div class="foot">Find food, water and shelter. Avoid the infected. Trust no one.<br>When you die, you lose everything.</div>`);
    this.pause = mk('ob-pause', '<div class="logo" style="font-size:38px;letter-spacing:.3em;margin-bottom:30px">PAUSED</div><div class="menu" style="width:320px"></div>');
    this.dead = mk('ob-dead', '<div class="big">YOU DIED</div><div class="cause"></div><div class="stats"></div><div class="menu" style="width:320px"></div>');
    this.settings = mk('ob-pause', '<div class="ob-panel ob-set"><div class="ob-h">Settings</div><div class="body"></div></div><div class="menu" style="width:440px;margin-top:10px"></div>');
    this.controls = mk('ob-pause', '<div class="ob-panel" style="width:520px"><div class="ob-h">Controls</div><div class="ob-keys"></div></div><div class="menu" style="width:520px;margin-top:10px"></div>');
    this.controls.querySelector('.ob-keys').innerHTML = KEYS.map(([k, v]) => `<span class="ob-key" style="justify-self:start">${k}</span><span>${v}</span>`).join('');
    this.loading = document.createElement('div'); this.loading.className = 'ob-loading hide';
    this.loading.innerHTML = '<div style="font-size:40px;letter-spacing:.35em;font-weight:300">THE <b style="color:#e8c070;font-weight:700">OUTBREAK</b></div><div class="bar"><i></i></div><div class="msg" style="margin-top:12px;font-size:12px;letter-spacing:.2em;color:#8a867c;text-transform:uppercase"></div>';
    root.appendChild(this.loading);
    this.back = null;
  }
  _buttons(el, list) {
    const m = el.querySelector('.menu'); m.innerHTML = '';
    for (const [label, fn, dis] of list) { const b = document.createElement('button'); b.className = 'ob-btn'; b.textContent = label; if (dis) b.disabled = true; b.addEventListener('click', (e) => { e.stopPropagation(); O.audio?.ui(); fn(); }); m.appendChild(b); }
  }
  hideAll() { for (const e of [this.title, this.pause, this.dead, this.settings, this.controls]) e.classList.add('hide'); }
  get open() { return [this.title, this.pause, this.dead, this.settings, this.controls].find((e) => !e.classList.contains('hide')) || null; }

  showTitle(hasSave) {
    this.hideAll();
    this._buttons(this.title, [
      ['Continue', () => O.session.continueGame(), !hasSave],
      [hasSave ? 'New life (lose your character)' : 'New life', () => O.session.newGame()],
      ['Settings', () => this.showSettings(() => this.showTitle(hasSave))],
      ['Controls', () => this.showControls(() => this.showTitle(hasSave))],
      ['Back to ROBLOX', () => O.session.exit()],
    ]);
    this.title.classList.remove('hide');
  }
  showPause() {
    this.hideAll();
    this._buttons(this.pause, [
      ['Resume', () => O.session.resume()],
      ['Settings', () => this.showSettings(() => this.showPause())],
      ['Controls', () => this.showControls(() => this.showPause())],
      ['Save and quit to title', () => O.session.quitToTitle()],
    ]);
    this.pause.classList.remove('hide');
  }
  showDead(cause, stats) {
    this.hideAll();
    this.dead.querySelector('.cause').textContent = 'Killed by ' + cause;
    const secs = Math.floor(stats.time), mins = Math.floor(secs / 60), hrs = Math.floor(mins / 60);
    const lived = hrs ? `${hrs}h ${mins % 60}m` : mins ? `${mins}m ${secs % 60}s` : `${secs}s`;
    this.dead.querySelector('.stats').innerHTML = `<div><b>${lived}</b>Survived</div><div><b>${stats.zombies}</b>Infected killed</div><div><b>${stats.bandits}</b>Bandits killed</div><div><b>${(stats.distance * 0.33 / 1000).toFixed(1)} km</b>Travelled</div>`;
    this._buttons(this.dead, [['Start a new life', () => O.session.newGame()], ['Quit to title', () => O.session.quitToTitle()]]);
    this.dead.classList.remove('hide');
  }
  showSettings(back) {
    this.hideAll();
    const S = O.settings;
    const body = this.settings.querySelector('.body');
    body.innerHTML = `
      <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" data-k="sens" value="${S.sens}"></label>
      <label>Field of view <input type="range" min="60" max="95" step="1" data-k="fov" value="${S.fov}"></label>
      <label>Invert mouse <input type="checkbox" data-k="invert" ${S.invert ? 'checked' : ''}></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${S.volume}"></label>
      <label>Brightness <input type="range" min="0.6" max="1.6" step="0.05" data-k="brightness" value="${S.brightness}"></label>
      <label>Graphics <select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Show frame rate <input type="checkbox" data-k="fps" ${S.fps ? 'checked' : ''}></label>`;
    body.querySelector('select').value = S.quality;
    for (const inp of body.querySelectorAll('[data-k]')) inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      S[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : +inp.value;
      O.session.applySettings();
    });
    this._buttons(this.settings, [['Back', () => { O.session.saveSettings(); back(); }]]);
    this.settings.classList.remove('hide');
  }
  showControls(back) { this.hideAll(); this._buttons(this.controls, [['Back', back]]); this.controls.classList.remove('hide'); }
  setLoading(frac, msg) {
    this.loading.classList.toggle('hide', frac >= 1);
    this.loading.querySelector('i').style.width = Math.round(frac * 100) + '%';
    if (msg) this.loading.querySelector('.msg').textContent = msg;
  }
}
