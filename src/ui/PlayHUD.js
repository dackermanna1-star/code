// Heads-up display while playing a soldier: crosshair that opens with the
// spread, hit and kill markers, health and stance, ammunition, a compass, the
// direction damage came from, a scope for the marksman rifle, missile lock,
// and the screens for pausing and for falling.

import { FACTION_INFO } from '../sim/world.js';
import { bearingDegrees } from '../core/math.js';

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const STANCES = ['Standing', 'Crouched', 'Prone'];
const KEYS = [
  ['Move', 'W A S D'],
  ['Sprint', 'Shift'],
  ['Look', 'Mouse'],
  ['Fire', 'Left click'],
  ['Aim down sights', 'E'],
  ['Reload', 'R'],
  ['Crouch / prone / stand', 'C / Z / Space'],
  ['Grenade', 'G'],
  ['Rifle butt', 'F'],
  ['Switch weapon', 'Q · 1 2 3 · wheel'],
  ['Dress a wound', 'B'],
  ['Shoulder view', 'V'],
  ['Stop playing', 'Esc'],
];

export class PlayHUD {
  constructor(root, app) {
    this.app = app;
    const r = el('div', 'play keep');
    r.hidden = true;
    this.root = r;
    this.dmg = el('div', 'p-dmg');
    this.supp = el('div', 'p-supp');
    this.dir = el('div', 'p-dir');
    this.scope = el('div', 'p-scope');
    this.scope.innerHTML = '<svg viewBox="-100 -100 200 200" aria-hidden="true"><g stroke="#0b0b0b" fill="none"><path d="M-100 0H-6M6 0H100M0 -100V-6M0 6V100" stroke-width="0.7"/><path d="M-100 0H-40M40 0H100M0 40V100" stroke-width="3"/><path d="M-3 18H3M-3 30H3M-3 42H3" stroke-width="0.6"/></g></svg>';
    // Launch tube sight: a framed day/thermal view with a seeker box.
    this.clu = el('div', 'p-clu');
    this.clu.innerHTML = '<svg viewBox="-160 -100 320 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M-150 -90H-110M-150 -90V-60M150 -90H110M150 -90V-60M-150 90H-110M-150 90V60M150 90H110M150 90V60"/><path d="M-60 0H-12M12 0H60M0 -40V-12M0 12V40"/><rect class="seek" x="-22" y="-16" width="44" height="32"/></g></svg>';
    this.xhair = el('div', 'p-x');
    this.ticks = ['t', 'b', 'l', 'r'].map((k) => {
      const t = el('i', k);
      this.xhair.append(t);
      return t;
    });
    this.xhair.append(el('b'));
    this.hit = el('div', 'p-hit');
    for (let i = 0; i < 4; i++) this.hit.append(el('i'));
    this.lock = el('div', 'p-lock');
    this.msg = el('div', 'p-msg');
    this.kill = el('div', 'p-kill');
    this.compass = el('div', 'p-compass');
    this.vitals = el('div', 'p-vitals');
    this.vName = el('div', 'nm');
    const bar = el('div', 'hpbar');
    this.hp = el('i');
    bar.append(this.hp);
    this.vState = el('div', 'st');
    this.vitals.append(this.vName, bar, this.vState);
    this.ammo = el('div', 'p-ammo');
    this.aName = el('div', 'nm');
    this.aNum = el('div', 'num');
    this.aMag = el('b');
    this.aRes = el('span');
    this.aNum.append(this.aMag, this.aRes);
    this.aExtra = el('div', 'ex');
    this.ammo.append(this.aName, this.aNum, this.aExtra);
    this.keys = el('div', 'p-keys');
    for (const [k, v] of KEYS) {
      const kv = el('div');
      kv.append(el('kbd', '', v), el('span', '', k));
      this.keys.append(kv);
    }
    this.cover = el('div', 'p-cover');
    this.coverTitle = el('div', 't');
    this.coverSub = el('div', 's');
    this.coverHint = el('div', 'h');
    this.cover.append(this.coverTitle, this.coverSub, this.coverHint);
    r.append(this.dmg, this.supp, this.scope, this.clu, this.dir, this.xhair, this.hit, this.lock, this.msg, this.kill, this.compass, this.vitals, this.ammo, this.keys, this.cover);
    root.append(r);
  }

  show(on) {
    this.root.hidden = !on;
  }

  update(dt, camera, width, height) {
    const p = this.app.player;
    const u = p.u;
    if (!u) return;
    const alive = p.alive;
    const w = p.weapon;
    const optic = alive && p.view === 'first' && p.adsT > 0.85 ? p.variant() : -1;
    const sniperScope = optic === 2;
    // Crosshair: the gap follows the spread at this field of view.
    const px = (height / 2) / Math.tan((camera.fov * Math.PI) / 360);
    const gap = Math.max(3, p.spread() * px * 2.2);
    const showX = alive && !sniperScope && (p.adsT < 0.6 || p.view === 'third');
    this.xhair.hidden = !alive || optic === 2 || optic === 4 || p.sprintT > 0.5;
    this.xhair.classList.toggle('ads', !showX);
    const [t, b, l, r] = this.ticks;
    t.style.transform = `translate(-50%, ${-gap - 8}px)`;
    b.style.transform = `translate(-50%, ${gap}px)`;
    l.style.transform = `translate(${-gap - 8}px, -50%)`;
    r.style.transform = `translate(${gap}px, -50%)`;
    this.scope.hidden = !sniperScope;
    this.clu.hidden = optic !== 4;
    this.clu.classList.toggle('locked', !!(w && w.def.kind === 'missile' && p.lockOn && p.lockT >= p.lockNeed(w.def)));
    this.hit.hidden = p.hitT <= 0;
    this.hit.classList.toggle('head', p.hitHead);
    this.hit.classList.toggle('kill', p.killT > 1.7);
    // Missile lock.
    const missile = alive && w && w.def.kind === 'missile' && p.adsT > 0.8;
    this.lock.hidden = !missile;
    if (missile) {
      const need = p.lockNeed(w.def);
      const k = p.lockOn ? Math.min(1, p.lockT / need) : 0;
      this.lock.textContent = !p.lockOn ? 'NO TARGET' : k >= 1 ? `LOCKED · ${p.lockOn.name.toUpperCase()}` : 'LOCKING';
      this.lock.classList.toggle('on', k >= 1);
    }
    this.msg.textContent = p.msgT > 0 ? p.msg : '';
    this.kill.textContent = p.killT > 0 ? `${p.killName.toUpperCase()} ELIMINATED` : '';
    this.kill.style.opacity = String(Math.min(1, p.killT));
    // Damage: red edges, and an arc toward the shooter.
    this.dmg.style.opacity = String(Math.min(0.85, p.hurt + (alive ? Math.max(0, 0.35 - u.hp / u.maxHp) : 0)));
    this.supp.style.opacity = String(alive ? Math.min(0.7, u.suppression * 0.8) : 0);
    this.dir.hidden = !(p.hurt > 0.05 && alive);
    if (!this.dir.hidden) {
      this.dir.style.opacity = String(Math.min(1, p.hurt * 1.6));
      this.dir.style.transform = `translate(-50%, -50%) rotate(${(-(p.hurtDir - p.yaw) * 180) / Math.PI}deg)`;
    }
    // Compass.
    const brg = Math.round(bearingDegrees(Math.sin(p.yaw), Math.cos(p.yaw))) % 360;
    const card = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(brg / 45) % 8];
    this.compass.textContent = `${card} ${String(brg).padStart(3, '0')}°`;
    // Vitals.
    const f = FACTION_INFO[u.faction];
    this.vName.textContent = `${u.name}${u.squad && u.squad.callsign ? ` · ${u.squad.callsign}` : ''}`;
    this.vName.style.color = f.color;
    const hp = Math.max(0, u.hp / u.maxHp);
    this.hp.style.width = `${hp * 100}%`;
    this.hp.style.background = hp > 0.6 ? 'var(--ok)' : hp > 0.3 ? 'var(--warn)' : 'var(--bad)';
    const state = [STANCES[u.stance] || ''];
    if (p.sprintT > 0.5) state[0] = 'Sprinting';
    if (u.bleed > 0) state.push(p.bandageT > 0 ? 'dressing wound' : 'BLEEDING · B');
    this.vState.textContent = state.join(' · ');
    this.vState.classList.toggle('bad', u.bleed > 0);
    // Ammunition.
    if (w) {
      this.aName.textContent = w.def.name;
      this.aMag.textContent = w.reloadT > 0 ? '··' : String(w.mag);
      this.aRes.textContent = w.reserve === Infinity ? ' / ∞' : ` / ${w.reserve}`;
      const ex = [];
      if (w.reloadT > 0) ex.push('RELOADING');
      else if (w.mag === 0 && w.reserve > 0) ex.push('R TO RELOAD');
      else if (w.mag === 0) ex.push('EMPTY');
      const nade = u.weapons.find((k) => k.def.id === 'frag');
      if (nade) ex.push(`GRENADES ${u.grenades}`);
      if (p.weapons.length > 1) ex.push(`${p.slot + 1}/${p.weapons.length}`);
      this.aExtra.textContent = ex.join(' · ');
      this.aMag.classList.toggle('low', w.mag <= Math.max(1, (w.def.mag ?? 1) * 0.2));
    }
    this.keys.hidden = p.since > 14 || !alive;
    // Pause and death screens.
    let cover = false;
    if (!alive) {
      cover = p.deathT > 1.2;
      this.coverTitle.textContent = u.alive ? 'You are down' : 'Killed in action';
      const k = p.killer;
      this.coverSub.textContent = k ? `by ${k.name}${p.killerDef && p.killerDef.name ? ` · ${p.killerDef.name}` : ''}` : u.alive ? 'Bleeding out; a squadmate may reach you' : '';
      this.coverHint.textContent = 'Enter: take over the nearest soldier · Esc: spectate';
    } else if (p.paused) {
      cover = true;
      this.coverTitle.textContent = 'Paused';
      this.coverSub.textContent = 'Click to keep playing';
      this.coverHint.textContent = 'Esc: hand the soldier back to the AI and spectate';
    }
    this.cover.hidden = !cover;
    this.cover.classList.toggle('dead', !alive);
    void width;
  }
}
