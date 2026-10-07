// The heads-up display, kept out of the way: a dot in the middle; what F will
// do; your stamina while it's not full; the weapon in your hands and its
// ammunition; a compass strip; and in the corner a row of small icons that
// stay dim while you're fine and light up (amber, then red) when you're
// hungry, thirsty, cold, bleeding, broken or sick.
import { O } from '../state.js';
import { def } from '../game/inventory.js';
import { iconURL } from './icons.js';

const SVG = {
  health: '<path d="M16 28s-11-7-11-15a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-11 15-11 15z" fill="currentColor"/>',
  blood: '<path d="M16 4c5 8 9 12 9 17a9 9 0 0 1-18 0c0-5 4-9 9-17z" fill="currentColor"/>',
  food: '<path d="M9 4v9a3 3 0 0 0 2 3v12h2V16a3 3 0 0 0 2-3V4h-1.5v8h-1V4h-1v8h-1V4zM21 4c-2 0-3.5 3-3.5 7s1.5 6 3 6v11h2V4z" fill="currentColor"/>',
  water: '<path d="M8 6h16l-2 22H10z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 14h13.6l-1.3 13H10.5z" fill="currentColor"/>',
  heat: '<path d="M14 5a2 2 0 0 1 4 0v14a5 5 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="23" r="3" fill="currentColor"/><rect x="15" y="10" width="2" height="12" fill="currentColor"/>',
  bleed: '<path d="M16 3c4 7 7 10 7 14a7 7 0 0 1-14 0c0-4 3-7 7-14z" fill="currentColor"/><path d="M10 26l12-4" stroke="#000" stroke-width="2"/>',
  leg: '<path d="M10 4l4 4-3 9 4 11h-3l-4-11 3-9-3-3zM20 6l2 3-2 4 3 4-2 2 1 9" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  sick: '<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M11 13h2M19 13h2M11 21c3-3 7-3 10 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  wet: '<path d="M8 10c2-3 4-3 6 0M18 7c2-3 4-3 6 0M12 18c2-3 4-3 6 0" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 24h16" stroke="currentColor" stroke-width="2"/>',
};

export class Hud {
  constructor(root) {
    this.root = document.createElement('div'); this.root.className = 'ob-hud'; root.appendChild(this.root);
    root = this.root;
    const el = (cls, html = '', parent = root) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
    this.el = el;
    this.dmg = el('ob-dmg');
    this.dot = el('ob-dot');
    this.hitEl = el('ob-hit');
    this.prompt = el('ob-prompt');
    this.action = el('ob-action', '<div class="l"></div><div class="bar"><i></i></div>');
    this.status = el('ob-status');
    this.st = {};
    for (const k of ['sick', 'leg', 'bleed', 'wet', 'heat', 'water', 'food', 'blood', 'health']) {
      const d = el('ob-st ok', `<svg viewBox="0 0 32 32">${SVG[k]}</svg><div class="lvl"><i></i></div><div class="n"></div>`, this.status);
      this.st[k] = d;
    }
    this.stam = el('ob-stam', '<i></i><div class="cap"></div>');
    this.weap = el('ob-weap');
    this.comp = el('ob-comp', '<div class="strip"></div><div class="mark"></div>');
    this._buildCompass();
    this.notes = el('ob-notes');
    this.loc = el('ob-loc', '<div class="big"></div><div class="small"></div>');
    this.hot = el('ob-hot');
    this.hotT = 0;
    this.fps = el('ob-fps');
    this._changed = true;
    this.hitT = 0;
  }
  changed() { this._changed = true; this.hotT = Math.max(this.hotT, 2.5); }
  /** A message in the corner. */
  note(text, secs = 4) {
    // the same message twice in a row just refreshes
    const last = this.notes.lastChild;
    if (last && last.textContent === text) { last.dataset.t = String(secs); last.style.opacity = 1; return; }
    const d = document.createElement('div'); d.className = 'ob-note'; d.textContent = text; d.dataset.t = String(secs);
    this.notes.appendChild(d);
    while (this.notes.children.length > 5) this.notes.firstChild.remove();
  }
  hitmark(head, kill) { this.hitEl.className = 'ob-hit' + (kill ? ' kill' : ''); this.hitEl.style.opacity = 1; this.hitEl.style.transform = `scale(${head ? 1.3 : 1})`; this.hitT = 0.18; }
  /** A place's name, big, when you arrive. */
  location(name, sub) { this.loc.querySelector('.big').textContent = name.toUpperCase(); this.loc.querySelector('.small').textContent = sub || ''; this.loc.style.opacity = 1; this.locT = 4; }
  _buildCompass() {
    const strip = this.comp.querySelector('.strip');
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let a = -360; a <= 720; a += 15) {
      const deg = ((a % 360) + 360) % 360, x = (a + 360) * 3;
      if (names[deg] !== undefined) html += `<div class="t ${deg % 90 === 0 ? 'c' : ''} ${deg === 0 ? 'n' : ''}" style="left:${x}px">${names[deg]}</div>`;
      else if (deg % 45 !== 0) html += `<div class="t" style="left:${x}px;font-size:10px;color:#8a867c">${deg}</div>`;
      html += `<div class="tk" style="left:${x}px"></div>`;
    }
    strip.innerHTML = html;
    this.strip = strip;
  }

  update(dt) {
    const P = O.player, S = O.survival, W = O.weapons;
    const show = (e, v) => e.classList.toggle('hide', !v);
    const playing = O.session?.state === 'play';
    this.root.classList.toggle('hide', !playing && O.session?.state !== 'dead');
    if (!P || !S) return;
    const ui = O.ui?.open;
    // the dot: not while aiming down the sights or in a screen
    this.dot.style.opacity = W?.aim > 0.3 || ui || !P.alive || P.third ? 0 : 0.85;
    // hit marker fades
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitEl.style.opacity = 0; }
    // the prompt
    const f = P.focus;
    let pr = '';
    if (f && !ui && P.alive) {
      if (f.kind === 'door') pr = `<span class="ob-key">F</span>${f.door.broken ? 'Broken door' : f.door.open > 0.5 ? 'Close door' : 'Open door'}`;
      else if (f.kind === 'item') { const d = def(f.item.it); pr = `<span class="ob-key">F</span>Take ${d.name}${f.item.it.n > 1 ? ' (' + f.item.it.n + ')' : ''}<span class="ob-key">TAB</span><span class="sub">Inventory</span>`; }
      else if (f.kind === 'body') pr = `<span class="ob-key">F</span>Search ${f.body.name.toLowerCase()} <span class="sub">(${f.body.items.length} item${f.body.items.length === 1 ? '' : 's'})</span>`;
      else if (f.kind === 'well') pr = `<span class="ob-key">F</span>Drink / fill a bottle`;
    }
    if (P.ladder) pr = '<span class="ob-key">W</span>Climb <span class="ob-key">S</span>Down <span class="ob-key">SPACE</span>Let go';
    if (pr !== this._pr) { this.prompt.innerHTML = pr; this._pr = pr; }
    // an action in progress
    const A = O.actions?.cur;
    show(this.action, !!A);
    if (A) { this.action.querySelector('.l').textContent = A.label + '…'; this.action.querySelector('i').style.width = Math.min(100, A.t / A.time * 100) + '%'; }
    // status icons
    const st = S.status();
    const lv = (k, v, cls, n = '') => { const d = this.st[k]; d.className = 'ob-st ' + cls; d.querySelector('.lvl i').style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; d.querySelector('.n').textContent = n; };
    lv('health', st.health, st.health < 0.3 ? 'bad' : st.health < 0.7 ? 'warn' : 'ok');
    lv('blood', st.blood, st.blood < 0.45 ? 'bad' : st.blood < 0.8 ? 'warn' : 'ok');
    lv('food', st.energy, st.energy < 0.12 ? 'bad' : st.energy < 0.3 ? 'warn' : 'ok');
    lv('water', st.water, st.water < 0.12 ? 'bad' : st.water < 0.3 ? 'warn' : 'ok');
    lv('heat', (st.heat + 1) / 2, st.heat < -0.55 ? 'bad' : st.heat < -0.3 || st.heat > 0.6 ? 'warn' : 'ok');
    lv('wet', st.wet, st.wet > 0.6 ? 'warn' : 'ok');
    this.st.wet.classList.toggle('hide', st.wet < 0.15);
    lv('bleed', 1, st.wounds ? 'bad' : 'ok', st.wounds > 1 ? st.wounds : '');
    this.st.bleed.classList.toggle('hide', !st.wounds);
    lv('leg', 1, 'bad'); this.st.leg.classList.toggle('hide', !st.brokenLeg);
    lv('sick', st.sick, 'warn'); this.st.sick.classList.toggle('hide', st.sick < 0.05);
    // stamina: only when it isn't full
    const sm = S.maxStamina;
    this.stam.style.opacity = P.stamina < sm - 1 ? 1 : 0;
    this.stam.querySelector('i').style.width = (P.stamina) + '%';
    this.stam.querySelector('.cap').style.width = (100 - sm) + '%';
    // weapon
    if (this._changed || this._wt === undefined || (this._wt -= dt) <= 0) {
      this._wt = 0.15; this._changed = false;
      const s = W?.status();
      let h = '';
      if (s) {
        h = `<div class="nm">${s.name}</div>`;
        if (s.ammo !== undefined) {
          h += `<div class="am ${s.jammed ? 'warn' : ''}">${s.noMag ? '–' : s.ammo}<small> / ${s.spareKind === 'mags' ? s.spare + ' mag' + (s.spare === 1 ? '' : 's') : s.spare + ' rds'}</small></div>`;
          h += `<div class="md">${s.jammed ? '<span class="warn">jammed – R</span>' : s.fire}${s.loose && s.spareKind === 'mags' ? ' · ' + s.loose + ' loose' : ''} · <span style="color:${s.cond[2]}">${s.cond[1]}</span></div>`;
        } else if (s.light) h += `<div class="md">${s.light.on ? 'on' : 'off'} · battery ${Math.round(s.light.charge * 100)}%</div>`;
        else h += `<div class="md" style="color:${s.cond[2]}">${s.cond[1]}</div>`;
      }
      if (h !== this._wh) { this.weap.innerHTML = h; this._wh = h; }
      this._hot();
    }
    // compass: your heading
    const deg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.strip.style.left = (210 - (deg + 360) * 3) + 'px';
    // notes fade
    for (const n of [...this.notes.children]) { n.dataset.t = String(+n.dataset.t - dt); if (+n.dataset.t < 0.6) n.style.opacity = Math.max(0, +n.dataset.t / 0.6); if (+n.dataset.t <= 0) n.remove(); }
    if (this.locT > 0) { this.locT -= dt; if (this.locT <= 0) this.loc.style.opacity = 0; }
    // hotbar shows for a moment after a change, or when you press a number
    this.hotT = Math.max(0, this.hotT - dt);
    this.hot.style.opacity = this.hotT > 0 && !O.invUI?.isOpen ? 1 : 0;
    // hurt: red at the edges
    this.dmg.style.opacity = Math.max(0, Math.min(0.9, (1 - st.health) * 0.6 + (O.post?.flash || 0)));
  }
  _hot() {
    const inv = O.inv;
    if (!inv) return;
    let h = '';
    for (let i = 0; i < 9; i++) {
      const it = inv.hot(i);
      h += `<div class="s ${it && it === inv.slots.hands ? 'on' : ''}"><b>${i + 1}</b>${it ? `<img src="${iconURL(it)}">` : ''}</div>`;
    }
    if (h !== this._hh) { this.hot.innerHTML = h; this._hh = h; }
  }
}
