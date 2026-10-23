// Heads-up display while playing a soldier: crosshair that opens with the
// spread, hit and kill markers, health and stance, ammunition, a compass, the
// direction damage came from, a scope for the marksman rifle, missile lock,
// and the screens for pausing and for falling.

import { FACTION_INFO } from '../sim/world.js';
import { bearingDegrees } from '../core/math.js';
import * as THREE from 'three';
import { ROLES, VEHICLES } from '../app/Player.js';
import { VEHICLE_KEYS, kindOf } from '../app/Driver.js';

const _v = new THREE.Vector3();

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
    this.keysKind = null;
    // Gun line / bomb impact marker and the box around a locked target.
    this.mark = el('div', 'p-mark');
    this.lockBox = el('div', 'p-lockbox');
    this.cover = el('div', 'p-cover');
    this.coverTitle = el('div', 't');
    this.coverSub = el('div', 's');
    this.coverHint = el('div', 'h');
    this.coverRoles = el('div', 'roles');
    this.rolesT = 0;
    this.cover.append(this.coverTitle, this.coverSub, this.coverHint, this.coverRoles);
    r.append(this.mark, this.lockBox, this.dmg, this.supp, this.scope, this.clu, this.dir, this.xhair, this.hit, this.lock, this.msg, this.kill, this.compass, this.vitals, this.ammo, this.keys, this.cover);
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
    const inf = u.cat === 'inf';
    const missile = alive && w && w.def.kind === 'missile' && (!inf || p.adsT > 0.8);
    this.lock.hidden = !missile;
    if (missile) {
      const need = p.lockNeed(w.def);
      const k = p.lockOn ? Math.min(1, p.lockT / need) : 0;
      this.lock.textContent = !p.lockOn ? 'NO TARGET' : k >= 1 ? `LOCKED · ${p.lockOn.name.toUpperCase()}` : 'LOCKING';
      this.lock.classList.toggle('on', k >= 1);
    }
    // Lock box and the weapon's own aim mark, projected to the screen.
    const proj = (pos) => {
      _v.copy(pos).project(camera);
      return _v.z < 1 ? [((_v.x + 1) / 2) * width, ((1 - _v.y) / 2) * height] : null;
    };
    const lk = missile && p.lockOn ? proj(_v.set(p.lockOn.pos.x, p.lockOn.pos.y + (p.lockOn.cat === 'veh' ? p.lockOn.spec.height * 0.5 : 0), p.lockOn.pos.z)) : null;
    this.lockBox.hidden = !lk;
    if (lk) {
      this.lockBox.style.transform = `translate(${lk[0]}px, ${lk[1]}px)`;
      this.lockBox.classList.toggle('on', p.lockT >= p.lockNeed(w.def));
    }
    const d = p.driver;
    const mk = !inf && alive && d.markOn ? proj(d.mark) : null;
    this.mark.hidden = !mk;
    if (mk) {
      this.mark.style.transform = `translate(${mk[0]}px, ${mk[1]}px)`;
      this.mark.classList.toggle('ccip', !!d.ccip);
    }
    this.msg.textContent = p.msgT > 0 ? p.msg : '';
    this.kill.textContent = p.killT > 0 ? `${p.killName.toUpperCase()} ELIMINATED` : '';
    this.kill.style.opacity = String(Math.min(1, p.killT));
    // Damage: red edges, and an arc toward the shooter.
    this.dmg.style.opacity = String(Math.min(0.85, p.hurt + (alive ? Math.max(0, 0.35 - u.hp / u.maxHp) : 0)));
    this.supp.style.opacity = String(alive ? Math.min(0.7, (u.suppression || 0) * 0.8) : 0);
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
    let state;
    if (inf) {
      state = [STANCES[u.stance] || ''];
      if (p.sprintT > 0.5) state[0] = 'Sprinting';
      if (u.bleed > 0) state.push(p.bandageT > 0 ? 'dressing wound' : 'BLEEDING · B');
    } else {
      state = [`${Math.round(Math.abs(u.speed) * 3.6)} km/h`];
      if (u.cat === 'air') {
        state.push(`ALT ${Math.round(u.pos.y - this.app.world.terrain.heightAt(u.pos.x, u.pos.z))} m`, `flares ${u.flares}`);
        if (u.aclass === 'jet') state.push(`throttle ${Math.round(d.thr * 100)}%`);
      } else {
        state.push(`smoke ${u.smokeCharges}`);
        if (u.mobilityKill) state.push('IMMOBILIZED');
        if (u.firepowerKill) state.push('GUN OUT');
        if (u.burning > 0) state.push('ON FIRE');
      }
      if (u.passengers && u.passengers.length) state.push(`${u.passengers.length} troops · X`);
    }
    this.vState.textContent = state.join(' · ');
    this.vState.classList.toggle('bad', inf ? u.bleed > 0 : u.burning > 0 || u.hp / u.maxHp < 0.3);
    // Ammunition.
    if (w) {
      this.aName.textContent = w.def.name;
      this.aMag.textContent = w.reloadT > 0 ? '··' : String(w.mag);
      this.aRes.textContent = w.reserve === Infinity ? ' / ∞' : ` / ${w.reserve}`;
      const ex = [];
      if (w.ammoType) ex.push(w.ammoType.toUpperCase());
      if (w.reloadT > 0) ex.push('RELOADING');
      else if (w.mag === 0 && w.reserve > 0) ex.push('R TO RELOAD');
      else if (w.mag === 0) ex.push('EMPTY');
      const nade = u.weapons.find((k) => k.def.id === 'frag');
      if (nade) ex.push(`GRENADES ${u.grenades}`);
      if (p.weapons.length > 1) ex.push(`${p.slot + 1}/${p.weapons.length}`);
      this.aExtra.textContent = ex.join(' · ');
      this.aMag.classList.toggle('low', w.mag <= Math.max(1, (w.def.mag ?? 1) * 0.2));
    }
    this.keys.hidden = p.since > 14 || !alive || p.paused;
    const kk = inf ? 'inf' : kindOf(u);
    if (kk !== this.keysKind) {
      this.keysKind = kk;
      this.keys.textContent = '';
      for (const [k, v] of inf ? KEYS : VEHICLE_KEYS[kk]) {
        const kv = el('div');
        kv.append(el('kbd', '', v), el('span', '', k));
        this.keys.append(kv);
      }
    }
    // Pause and death screens.
    let cover = false;
    if (!alive) {
      cover = p.deathT > 1.2;
      this.coverTitle.textContent = inf ? (u.alive ? 'You are down' : 'Killed in action') : u.cat === 'air' ? 'Shot down' : 'Vehicle destroyed';
      const k = p.killer;
      this.coverSub.textContent = k ? `by ${k.name}${p.killerDef && p.killerDef.name ? ` · ${p.killerDef.name}` : ''}` : u.alive ? 'Bleeding out; a squadmate may reach you' : '';
      this.coverHint.textContent = `Enter: ${inf ? 'nearest soldier' : 'another one like it'} · 1–9 or ⇧1–0: pick · Esc: spectate`;
    } else if (p.paused) {
      cover = true;
      this.coverTitle.textContent = 'Paused';
      this.coverSub.textContent = 'Click to keep playing';
      this.coverHint.textContent = '1–9 or ⇧1–0: switch · Esc: hand back to the AI';
    }
    this.cover.hidden = !cover;
    // Roles to switch to, with how many of each are left.
    this.rolesT -= dt;
    if (cover && this.rolesT <= 0) {
      this.rolesT = 0.5;
      const counts = p.roleCounts();
      this.coverRoles.textContent = '';
      const add = (list, shift) =>
        list.forEach(([id, label], i) => {
          const n = counts[id] || 0;
          const row = el('div', n ? 'pe' : 'none');
          row.append(el('kbd', '', `${shift ? '⇧' : ''}${(i + 1) % 10}`), el('span', '', label), el('b', '', String(n)));
          // Rows can be clicked as well.
          if (n) row.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            p.next(id);
          });
          this.coverRoles.append(row);
        });
      add(ROLES, false);
      add(VEHICLES, true);
    }
    this.cover.classList.toggle('dead', !alive);
    void width;
  }
}
