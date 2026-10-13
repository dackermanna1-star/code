// Projectiles (zombie survival): RPG rockets and 40 mm grenades that explode on contact,
// thrown molotovs that shatter into a floor fire (bouncing off walls), and the bosses'
// fireballs and acid globs. Swept against the world and against people's hulls.
import * as THREE from 'three';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { createWorldWeapon } from '../assets/worldweapons.js';

const tr = new TraceResult();
const ZERO = [0, 0, 0];
const rnd = (a, b) => a + Math.random() * (b - a);

export const PROJECTILES = {
  rocket: { gravity: 0, life: 6, model: 'rpg_rocket', loop: 'rocket_fly' },
  grenade40: { gravity: 0.5, life: 8, model: 'grenade40' },
  molotov: { gravity: 0.5, life: 5, model: 'molotov', bounces: 2 },
  fireball: { gravity: 0, life: 4, glow: 0xff7a20, size: 9 },
  acid: { gravity: 0.6, life: 5, glow: 0x70ff20, size: 6 },
  stickyc4: { gravity: 0.8, life: 6, model: 'remotec4' },
};

/** Segment p0->p1 against an axis-aligned box: entry fraction or -1. */
function segBox(p0, p1, mn, mx) {
  let t0 = 0, t1 = 1;
  for (let a = 0; a < 3; a++) {
    const d = p1[a] - p0[a];
    if (Math.abs(d) < 1e-9) { if (p0[a] < mn[a] || p0[a] > mx[a]) return -1; continue; }
    let ta = (mn[a] - p0[a]) / d, tb = (mx[a] - p0[a]) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.glowGeo = typeof document !== 'undefined' ? new THREE.SphereGeometry(1, 8, 6) : null;
  }

  clear() {
    for (const pr of this.list) this.remove(pr);
    this.list = [];
  }

  /** Fire a projectile of `type` from pos with velocity vel. o: { damage, ... } carried to the impact. */
  launch(type, owner, pos, vel, o = {}) {
    const g = this.game, def = PROJECTILES[type];
    const pr = { type, def, owner, pos: pos.slice(), vel: vel.slice(), born: g.time, bounces: 0, spin: Math.random() * 6, obj: null, ...o };
    if (pr.dmgK == null) pr.dmgK = (type === 'rocket' || type === 'grenade40') && owner?.active?.mods?.damage || 1; // the launcher's forge tier (zforge.js), fixed at launch
    if (typeof document !== 'undefined') {
      if (def.model) {
        try { pr.obj = createWorldWeapon(def.model); g.renderer.world.add(pr.obj); } catch (e) { console.warn('projectile model', e); }
      } else if (def.glow) {
        pr.obj = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        pr.obj.scale.setScalar(def.size);
        g.renderer.world.add(pr.obj);
      }
      if (pr.obj) pr.obj.rotation.order = 'ZYX';
    }
    if (def.loop) pr.sound = g.sound?.loop(def.loop, { pos, volume: 0.9 });
    this.list.push(pr);
    return pr;
  }

  remove(pr) {
    pr.sound?.stop?.(0.05);
    if (pr.obj) {
      pr.obj.removeFromParent();
      if (pr.obj.isMesh && pr.obj.geometry === this.glowGeo) pr.obj.material.dispose();
      else pr.obj.userData?.dispose?.();
    }
    pr.obj = null;
    pr.dead = true;
  }

  /** People whose hull the segment crosses first (not the shooter early on, not his team). */
  hitPeople(pr, a, b) {
    const g = this.game;
    let best = null;
    for (const q of g.players) {
      if (!q.alive) continue;
      if (q === pr.owner && (pr.type === 'stickyc4' || g.time - pr.born < 0.3)) continue;
      if (pr.owner && q !== pr.owner && q.team === pr.owner.team) continue;
      const o = q.pm.origin, h = q.hull(), sc = q.boss ? q.boss.scale : 1;
      const mn = [o[0] + h.mins[0] * sc, o[1] + h.mins[1] * sc, o[2] + h.mins[2]];
      const mx = [o[0] + h.maxs[0] * sc, o[1] + h.maxs[1] * sc, o[2] + h.maxs[2] + (sc - 1) * 72];
      const t = segBox(a, b, mn, mx);
      if (t >= 0 && (!best || t < best.t)) best = { q, t };
    }
    return best;
  }

  update(dt) {
    const g = this.game, t = g.time;
    for (const pr of this.list) {
      if (pr.dead) continue;
      const p = pr.pos, v = pr.vel;
      v[2] -= pr.def.gravity * 800 * dt;
      const next = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      g.collision.trace(p, next, ZERO, ZERO, MASK_SHOT, tr);
      const wf = tr.startsolid ? 0 : tr.fraction;
      const wn = tr.normal.slice(), wend = tr.endpos.slice();
      const ph = this.hitPeople(pr, p, next);
      if (ph && ph.t <= wf) {
        const k = ph.t;
        this.impact(pr, [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k, p[2] + (next[2] - p[2]) * k], null, ph.q);
        continue;
      }
      if (wf < 1) {
        if (pr.type === 'molotov' && wn[2] < 0.6 && pr.bounces < (pr.def.bounces ?? 0)) {
          // off a wall: bounce (bottles only break on the floor or on somebody)
          const vn = v[0] * wn[0] + v[1] * wn[1] + v[2] * wn[2];
          for (let a = 0; a < 3; a++) v[a] = (v[a] - 2 * vn * wn[a]) * 0.45;
          p[0] = wend[0] + wn[0]; p[1] = wend[1] + wn[1]; p[2] = wend[2] + wn[2];
          pr.bounces++;
          g.sound?.play('grenade_bounce', { pos: p, volume: 0.6 });
        } else {
          this.impact(pr, wend, wn, null);
          continue;
        }
      } else { p[0] = next[0]; p[1] = next[1]; p[2] = next[2]; }
      if (t - pr.born > pr.def.life) { this.impact(pr, p.slice(), null, null); continue; }
      this.trail(pr, dt);
      if (pr.obj) {
        pr.obj.position.set(p[0], p[1], p[2]);
        const sp = Math.hypot(v[0], v[1], v[2]);
        if (pr.type === 'molotov' || pr.type === 'stickyc4') { pr.spin += dt * 12; pr.obj.rotation.set(pr.spin * 0.5, pr.spin, 0); }
        else if (sp > 1) pr.obj.rotation.set(0, Math.atan2(-v[2], Math.hypot(v[0], v[1])), Math.atan2(v[1], v[0])); // nose (+X) along the flight
      }
      pr.sound?.setPosition?.(p);
    }
    this.list = this.list.filter((pr) => !pr.dead);
  }

  trail(pr, dt) {
    const F = this.game.fire;
    if (!F) return;
    const p = pr.pos, v = pr.vel, sp = Math.hypot(v[0], v[1], v[2]) || 1;
    const back = [p[0] - v[0] / sp * 14, p[1] - v[1] / sp * 14, p[2] - v[2] / sp * 14];
    switch (pr.type) {
      case 'rocket':
        F.emit('trail', back, [rnd(-15, 15), rnd(-15, 15), rnd(5, 20)], { life: rnd(1.4, 2.2), size: 6, size1: rnd(26, 40), drag: 2, buoy: 8 });
        F.emit('fire', back, [-v[0] * 0.15, -v[1] * 0.15, -v[2] * 0.15], { life: 0.07, size: 12, size1: 4, drag: 0 });
        break;
      case 'grenade40':
        if (Math.random() < dt * 40) F.emit('trail', back, [0, 0, 5], { life: 0.9, size: 3, size1: 12, drag: 2 });
        break;
      case 'molotov':
        if (Math.random() < dt * 60) F.emit('fire', [p[0], p[1], p[2] + 4], [rnd(-10, 10), rnd(-10, 10), 30], { life: 0.22, size: 7, size1: 3, buoy: 60, frame: 1 });
        break;
      case 'fireball':
        F.emit('fire', [p[0] + rnd(-4, 4), p[1] + rnd(-4, 4), p[2] + rnd(-4, 4)], [rnd(-30, 30), rnd(-30, 30), rnd(-30, 30)], { life: 0.3, size: 24, size1: 8, drag: 2 });
        if (Math.random() < dt * 30) F.emit('smoke', back, [0, 0, 20], { life: 1.2, size: 14, size1: 40, buoy: 20 });
        if (Math.random() < dt * 25) F.emit('ember', p, [rnd(-80, 80), rnd(-80, 80), rnd(-80, 80)], { life: 0.6, size: 2.5, size1: 1 });
        break;
      case 'acid':
        F.emit('acid', [p[0] + rnd(-3, 3), p[1] + rnd(-3, 3), p[2] + rnd(-3, 3)], [rnd(-20, 20), rnd(-20, 20), rnd(-20, 20)], { life: 0.25, size: 12, size1: 5, drag: 2 });
        if (Math.random() < dt * 20) F.emit('acid', p, [rnd(-30, 30), rnd(-30, 30), -60], { life: 0.5, size: 3, size1: 2, drag: 0.5, buoy: -400 });
        break;
      default:
    }
  }

  impact(pr, point, normal, victim) {
    const g = this.game;
    this.remove(pr);
    const v = pr.vel, sp = Math.hypot(v[0], v[1], v[2]) || 1;
    const back = [point[0] - v[0] / sp * 6 + (normal ? normal[0] * 4 : 0), point[1] - v[1] / sp * 6 + (normal ? normal[1] * 4 : 0), point[2] - v[2] / sp * 6 + (normal ? normal[2] * 4 : 0)];
    switch (pr.type) {
      case 'rocket':
        g.explode(back, { owner: pr.owner, damage: 240 * pr.dmgK, radius: 330, weapon: 'rpg', selfScale: 0.5, push: 1.6, sound: 'rocket_explode', scale: 1.6, shake: 12 });
        break;
      case 'grenade40':
        g.explode(back, { owner: pr.owner, damage: 170 * pr.dmgK, radius: 240, weapon: 'm32', selfScale: 0.5, sound: 'he_explode', scale: 1.1, shake: 7 });
        break;
      case 'molotov': {
        g.sound?.play('molotov_break', { pos: point, volume: 1 });
        for (let i = 0; i < 10; i++) g.fire?.emit('spark', point, [rnd(-160, 160), rnd(-160, 160), rnd(40, 200)], { life: 0.4, size: 2, size1: 1, drag: 1, buoy: -500 });
        if (victim) g.fire?.burn(victim, pr.owner, 4, 18, 'molotov');
        g.fire?.ignite(point, pr.owner, { radius: 130, duration: 7, dps: 42, weapon: 'molotov' });
        break;
      }
      case 'fireball':
        g.explode(back, { owner: pr.owner, damage: pr.damage ?? 30, radius: 140, weapon: 'fireball', sound: 'fireball_hit', scale: 0.6, shake: 4, fire: true, noGore: true });
        g.fire?.ignite(point, pr.owner, { radius: 70, duration: 4.5, dps: 24, weapon: 'fireball', quiet: true });
        break;
      case 'stickyc4':
        g.explosives?.plant(pr.owner, point, normal, victim);
        break;
      case 'acid': {
        g.sound?.play('acid_splash', { pos: point, volume: 1 });
        for (const q of g.players) {
          if (!q.alive || (pr.owner && q.team === pr.owner.team)) continue;
          const d = Math.hypot(q.pm.origin[0] - point[0], q.pm.origin[1] - point[1], q.pm.origin[2] - point[2]);
          if (d < 100 || q === victim) g.fire?.hurt(q, pr.owner, (pr.damage ?? 22) * (q === victim ? 1 : 1 - d / 140), 'acid', 'acid', point);
        }
        for (let i = 0; i < 16; i++) g.fire?.emit('acid', point, [rnd(-150, 150), rnd(-150, 150), rnd(30, 200)], { life: rnd(0.3, 0.6), size: rnd(5, 10), size1: 3, drag: 1, buoy: -300 });
        g.fire?.ignite(point, pr.owner, { kind: 'acid', radius: 85, duration: 6, dps: 22, weapon: 'acid', burn: 0, quiet: true });
        break;
      }
      default:
    }
  }
}
