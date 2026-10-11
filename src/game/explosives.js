// Claymores and remote C4 (zombie survival).
//  - CLAYMORE: put down on the floor in front of you, facing where you look. It arms in
//    1.5 s (the red LED stops blinking and a faint laser shows its tripwire); the first
//    zombie that walks into the cone in front (to 150 units) sets it off: a sheet of steel
//    balls into a ~110 degree cone, 240 damage falling off to a third at 340 units, a
//    little behind it too. Your own and your team's mines never hurt you. At most 4 of
//    yours down at once (putting down a 5th takes the oldest back into your pack).
//  - REMOTE C4: thrown (a bit shorter than a grenade); sticks to whatever it hits, a
//    zombie too, and rides along. Arms in 1 s. Press V (or right-click with the C4 in
//    hand) to set off every charge you have out, a short ripple apart: 220 damage over
//    260 units each (a third of it to yourself if you're too close). At most 3 out at once.
// Zombies they kill come apart like anything else that explodes.
import * as THREE from 'three';
import { createWorldWeapon } from '../assets/worldweapons.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import * as CR from './combatrules.js';

const _tr = new TraceResult();
const ZERO = [0, 0, 0];
const DEG = Math.PI / 180;

export const CLAYMORE = { arm: 1.5, trigger: 150, cone: 0.57 /* cos 55 deg */, damage: 240, range: 340, max: 4 };
export const REMOTE_C4 = { arm: 1.0, damage: 220, radius: 260, max: 3, ripple: 0.12 };

export class Explosives {
  constructor(game) {
    this.game = game;
    this.mines = []; // { owner, pos, yaw, armAt, obj, laser, led }
    this.charges = []; // { owner, pos, normal, on (player | null), off, armAt, obj, led }
    this.boom = []; // charges set off, waiting their turn: { c, at }
    this.ledGeo = typeof document !== 'undefined' ? new THREE.SphereGeometry(0.45, 6, 4) : null;
  }

  clear() {
    for (const m of this.mines) this.drop(m);
    for (const c of this.charges) this.drop(c);
    this.mines = []; this.charges = []; this.boom = [];
  }

  drop(x) {
    for (const o of [x.obj, x.laser, x.led]) {
      if (!o) continue;
      o.removeFromParent();
      o.userData?.dispose?.();
      if (o.isMesh && o.geometry !== this.ledGeo) o.geometry?.dispose();
      if (o.material && (o.isLine || o === x.led)) o.material.dispose();
    }
  }

  count(list, p) { return list.reduce((n, x) => n + (x.owner === p ? 1 : 0), 0); }

  led(color) {
    if (!this.ledGeo) return null;
    const m = new THREE.Mesh(this.ledGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.game.renderer.world.add(m);
    return m;
  }

  // ---------------------------------------------------------------- claymores
  /** Where p would put a claymore down (floor just in front), or null. */
  mineSpot(p) {
    const g = this.game, o = p.pm.origin, y = p.pm.angles[1] * DEG;
    const a = [o[0] + Math.cos(y) * 34, o[1] + Math.sin(y) * 34, o[2]];
    g.collision.trace(o, a, ZERO, ZERO, MASK_SHOT, _tr);
    if (_tr.fraction < 1) return null; // a wall right there
    g.collision.trace(a, [a[0], a[1], a[2] - 90], ZERO, ZERO, MASK_SHOT, _tr);
    if (_tr.fraction >= 1 || _tr.normal[2] < 0.7) return null;
    return { pos: _tr.endpos.slice(), yaw: p.pm.angles[1] };
  }

  placeMine(p) {
    const g = this.game, at = this.mineSpot(p);
    if (!at) return false;
    // a fifth one down: the oldest comes back into the pack
    const mine = this.mines.filter((m) => m.owner === p);
    if (mine.length >= CLAYMORE.max) { this.drop(mine[0]); this.mines = this.mines.filter((m) => m !== mine[0]); }
    const m = { owner: p, pos: at.pos, yaw: at.yaw, armAt: g.time + CLAYMORE.arm, obj: null, laser: null, led: null };
    if (typeof document !== 'undefined') {
      try { m.obj = createWorldWeapon('claymore'); m.obj.position.set(at.pos[0], at.pos[1], at.pos[2]); m.obj.rotation.set(0, 0, at.yaw * DEG); g.renderer.world.add(m.obj); } catch { m.obj = null; }
      const y = at.yaw * DEG, fwd = [Math.cos(y), Math.sin(y)];
      const z = at.pos[2] + 3;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(at.pos[0] + fwd[0] * 3, at.pos[1] + fwd[1] * 3, z), new THREE.Vector3(at.pos[0] + fwd[0] * CLAYMORE.trigger, at.pos[1] + fwd[1] * CLAYMORE.trigger, z)]);
      m.laser = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.45, depthWrite: false }));
      m.laser.visible = false;
      g.renderer.world.add(m.laser);
      m.led = this.led(0xff2010);
      m.led?.position.set(at.pos[0] - fwd[0] * 0.6, at.pos[1] - fwd[1] * 0.6, at.pos[2] + 7.2);
    }
    this.mines.push(m);
    g.sound?.play('c4_planted', { pos: at.pos, volume: 0.5 });
    return true;
  }

  /** Steel balls into the cone in front (and a little behind). */
  blowMine(m) {
    const g = this.game, y = m.yaw * DEG, f = [Math.cos(y), Math.sin(y)];
    const c = [m.pos[0] + f[0] * 4, m.pos[1] + f[1] * 4, m.pos[2] + 6];
    this.drop(m);
    g.effects.explosion([c[0] + f[0] * 20, c[1] + f[1] * 20, c[2]], 0.7);
    g.sound?.play('he_explode', { pos: c, volume: 1 });
    g.shakeAt?.(c, 8);
    for (let i = 0; i < 24; i++) {
      const a = y + (Math.random() - 0.5) * 1.9;
      g.fire?.emit('spark', c, [Math.cos(a) * 1400, Math.sin(a) * 1400, (Math.random() - 0.3) * 240], { life: 0.22, size: 2, size1: 1, drag: 0.5, buoy: -100 });
    }
    for (const q of g.players) {
      if (!q.alive || (m.owner && q.team === m.owner.team)) continue;
      const sc = q.boss ? q.boss.scale : 1;
      const t = [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 10 * sc];
      const v = [t[0] - c[0], t[1] - c[1], t[2] - c[2]];
      const d = Math.hypot(v[0], v[1], v[2]) || 1;
      const along = (v[0] * f[0] + v[1] * f[1]) / Math.max(1, Math.hypot(v[0], v[1]));
      const front = along > CLAYMORE.cone && d < CLAYMORE.range + 20 * sc;
      const back = d < 70;
      if ((!front && !back) || !g.visible(c, t)) continue;
      const dmg = front ? CLAYMORE.damage * (1 - 0.67 * Math.min(1, d / CLAYMORE.range)) : 60;
      const dir = [v[0] / d, v[1] / d, Math.max(0.2, v[2] / d)];
      const kb = Math.min(500, dmg * 2.5) * (q.boss ? 0.12 : 1);
      q.pm.velocity[0] += dir[0] * kb; q.pm.velocity[1] += dir[1] * kb; q.pm.velocity[2] += kb * 0.4;
      g.damagePlayer(q, m.owner, dmg, CR.HITGROUP.GENERIC, 'claymore', dir, null, { blast: true, explode: true });
    }
    g.effects.scorch?.([m.pos[0], m.pos[1], m.pos[2] + 4], 70);
  }

  // ---------------------------------------------------------------- remote C4
  /** A thrown charge came down (projectiles.js): it sticks there, or to whoever it hit. */
  plant(owner, point, normal, on) {
    const g = this.game;
    const n = normal || [0, 0, 1];
    const pos = [point[0] + n[0] * 1.2, point[1] + n[1] * 1.2, point[2] + n[2] * 1.2];
    const c = { owner, pos, normal: n, on: on && on.alive ? on : null, off: null, armAt: g.time + REMOTE_C4.arm, obj: null, led: null };
    if (c.on) c.off = [pos[0] - c.on.pm.origin[0], pos[1] - c.on.pm.origin[1], pos[2] - c.on.pm.origin[2]];
    if (typeof document !== 'undefined') {
      try {
        c.obj = createWorldWeapon('remotec4');
        c.obj.position.set(pos[0], pos[1], pos[2]);
        // lie flat against the surface it stuck to
        c.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]));
        g.renderer.world.add(c.obj);
      } catch { c.obj = null; }
      c.led = this.led(0x30ff40);
    }
    this.charges.push(c);
    g.sound?.play(c.on ? 'hit_flesh' : 'c4_plant_press', { pos, volume: 0.7 });
    if (owner === g.local && c.on) g.hud?.centerPrint?.('Stuck it on one! Press V to blow it', 2);
  }

  /** Whoever it was stuck to died: it falls to the floor under it. */
  fall(c) {
    const g = this.game;
    c.on = null;
    g.collision.trace(c.pos, [c.pos[0], c.pos[1], c.pos[2] - 200], ZERO, ZERO, MASK_SHOT, _tr);
    if (_tr.fraction >= 1) return;
    c.pos = [_tr.endpos[0], _tr.endpos[1], _tr.endpos[2] + 1.2];
    c.normal = _tr.normal.slice();
    c.obj?.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(c.normal[0], c.normal[1], c.normal[2]));
  }

  canThrow(p) { return this.count(this.charges, p) < REMOTE_C4.max; }

  /** Set off every charge p has out (armed ones go; a ripple a few frames apart). */
  detonate(p) {
    const g = this.game, t = g.time;
    const mine = this.charges.filter((c) => c.owner === p);
    if (!mine.length) { if (p === g.local) g.hud?.centerPrint?.('No charges out', 1.5); return false; }
    g.sound?.play('c4_plant_press', { pos: p === g.viewTarget ? null : p.eyePos(), volume: 0.8 });
    let k = 0;
    for (const c of mine) {
      if (t < c.armAt) continue; // not armed yet: stays out
      this.charges = this.charges.filter((x) => x !== c);
      this.boom.push({ c, at: t + 0.08 + k++ * REMOTE_C4.ripple });
    }
    return k > 0;
  }

  blowCharge(c) {
    const g = this.game;
    this.drop(c);
    g.explode(c.pos, { owner: c.owner, damage: REMOTE_C4.damage, radius: REMOTE_C4.radius, weapon: 'remotec4', selfScale: 0.35, sound: 'he_explode', scale: 1.0, shake: 9 });
  }

  // ---------------------------------------------------------------- per tick
  update() {
    const g = this.game, t = g.time;
    // claymores: arm, then watch the cone
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      const armed = t >= m.armAt;
      if (m.led) m.led.visible = armed ? Math.floor(t * 1.2) % 2 === 0 : Math.floor(t * 8) % 2 === 0;
      if (m.laser) m.laser.visible = armed;
      if (!armed) continue;
      const y = m.yaw * DEG, f = [Math.cos(y), Math.sin(y)];
      const c = [m.pos[0], m.pos[1], m.pos[2] + 8];
      const hit = g.players.some((q) => {
        if (!q.alive || !q.isZombie) return false;
        const v = [q.pm.origin[0] - c[0], q.pm.origin[1] - c[1]];
        const d = Math.hypot(v[0], v[1]);
        return d < CLAYMORE.trigger && (v[0] * f[0] + v[1] * f[1]) / Math.max(1, d) > CLAYMORE.cone && Math.abs(q.pm.origin[2] - 36 - m.pos[2]) < 60 && g.visible(c, [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2]]);
      });
      if (hit) { this.mines.splice(i, 1); this.blowMine(m); }
    }
    // charges: ride along on whoever they're stuck to, blink, go off when told
    for (const c of this.charges) {
      if (c.on) {
        if (c.on.alive) { const o = c.on.pm.origin; c.pos = [o[0] + c.off[0], o[1] + c.off[1], o[2] + c.off[2]]; } else this.fall(c); // drops with the body
        c.obj?.position.set(c.pos[0], c.pos[1], c.pos[2]);
      }
      if (c.led) { c.led.position.set(c.pos[0] + c.normal[0] * 1.6, c.pos[1] + c.normal[1] * 1.6, c.pos[2] + c.normal[2] * 1.6); c.led.visible = t >= c.armAt ? Math.floor(t * 2) % 2 === 0 : Math.floor(t * 10) % 2 === 0; }
    }
    for (let i = this.boom.length - 1; i >= 0; i--) {
      if (t < this.boom[i].at) continue;
      const { c } = this.boom[i];
      this.boom.splice(i, 1);
      if (c.on?.alive) { const o = c.on.pm.origin; c.pos = [o[0] + c.off[0], o[1] + c.off[1], o[2] + c.off[2]]; }
      this.blowCharge(c);
    }
  }
}
