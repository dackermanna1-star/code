// Thrown grenades: MOVETYPE_BOUNCE physics, HE explosion, flashbang blinding, smoke.

import { TraceResult, MASK_WORLD_PLAYER, MASK_SHOT } from '../engine/collision.js';
import { angleVectors } from '../engine/coords.js';
import { createWorldWeapon } from '../assets/worldweapons.js';
import * as CR from './combatrules.js';

const tr = new TraceResult();
const BOX = { mins: [-1, -1, -1], maxs: [1, 1, 1] };

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.smokes = []; // active smoke volumes for vision blocking
  }

  clear() {
    for (const n of this.list) n.obj.removeFromParent();
    this.list = [];
    this.smokes = [];
  }

  throw(p, type, params = {}) {
    const g = this.game;
    // CS 1.6 ThrowGrenade
    const yaw = p.pm.angles[1] + p.pm.punch[1];
    // v_angle pitch is + down; CS lifts the throw by 10 degrees and remaps
    let ax = p.pm.angles[0] + p.pm.punch[0];
    if (ax < 0) ax = -10 + ax * ((90 - 10) / 90);
    else ax = -10 + ax * ((90 + 10) / 90);
    let vel = (90 - ax) * 6;
    if (vel > 750) vel = 750;
    const f = [0, 0, 0];
    angleVectors(ax, yaw, f, null, null);
    const eye = p.eyePos();
    const src = params.src || [eye[0] + f[0] * 16, eye[1] + f[1] * 16, eye[2] + f[2] * 16];
    const v = params.vel || [f[0] * vel + p.pm.velocity[0], f[1] * vel + p.pm.velocity[1], f[2] * vel + p.pm.velocity[2]];
    let obj;
    try { obj = createWorldWeapon(type); } catch { obj = null; }
    if (obj) g.renderer.world.add(obj);
    const fuse = params.fuse ?? (type === 'smokegrenade' ? 1.5 : 1.5);
    const n = { type, owner: p, pos: src.slice(), vel: v, obj, detonate: g.time + fuse, spin: Math.random() * 10, rest: false, bounces: 0 };
    this.list.push(n);
    if (type === 'hegrenade' || type === 'flashbang' || type === 'smokegrenade') {
      g.rounds.radio(p, 'Fire in the hole!');
    }
    return n;
  }

  update(dt) {
    const g = this.game;
    for (const n of this.list) {
      if (!n.rest) {
        n.vel[2] -= 800 * 0.55 * dt; // pev->gravity 0.55
        const end = [n.pos[0] + n.vel[0] * dt, n.pos[1] + n.vel[1] * dt, n.pos[2] + n.vel[2] * dt];
        g.collision.trace(n.pos, end, BOX.mins, BOX.maxs, MASK_WORLD_PLAYER, tr);
        if (tr.fraction < 1) {
          n.pos = tr.endpos.slice();
          const nn = tr.normal;
          const d = n.vel[0] * nn[0] + n.vel[1] * nn[1] + n.vel[2] * nn[2];
          // reflect then damp (CGrenade::BounceTouch: velocity *= 0.45 ... floor friction)
          n.vel = [n.vel[0] - 2 * d * nn[0], n.vel[1] - 2 * d * nn[1], n.vel[2] - 2 * d * nn[2]];
          const k = nn[2] > 0.7 ? 0.45 : 0.55;
          n.vel = n.vel.map((c) => c * k);
          const speed = Math.hypot(...n.vel);
          if (n.bounces < 6 && speed > 40) g.sound.play('grenade_bounce', { pos: n.pos, volume: Math.min(1, speed / 300) });
          n.bounces++;
          if (nn[2] > 0.7 && speed < 30) { n.rest = true; n.vel = [0, 0, 0]; }
        } else {
          n.pos = end;
        }
        n.spin += dt * 12;
      }
      if (n.obj) {
        n.obj.position.set(n.pos[0], n.pos[1], n.pos[2]);
        n.obj.rotation.set(0, n.rest ? Math.PI / 2 : n.spin, n.spin * 0.5);
      }
      if (g.time >= n.detonate && !n.done) {
        // smoke grenades only go off once they settle
        if (n.type === 'smokegrenade' && !n.rest && g.time < n.detonate + 3) continue;
        n.done = true;
        this.detonate(n);
      }
    }
    for (const n of this.list) if (n.done && n.obj) { n.obj.removeFromParent(); n.obj = null; }
    this.list = this.list.filter((n) => !n.done);
    const now = g.time;
    this.smokes = this.smokes.filter((s) => now < s.end);
  }

  detonate(n) {
    const g = this.game;
    const pos = n.pos;
    if (n.type === 'hegrenade') {
      g.effects.explosion([pos[0], pos[1], pos[2] - 4], 1);
      g.sound.play('he_explode', { pos, volume: 1 });
      const dmg = CR.HE?.damage ?? 100;
      const radius = CR.HE?.radius ?? dmg * 3.5;
      for (const p of g.players) {
        if (!p.alive) continue;
        const c = p.pm.origin;
        const d = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
        if (d > radius) continue;
        // needs line of sight to the body centre
        g.collision.trace(pos, c, [0, 0, 0], [0, 0, 0], MASK_SHOT, tr);
        if (tr.fraction < 1) continue;
        const amount = dmg * (1 - d / radius);
        if (amount < 1) continue;
        g.damagePlayer(p, n.owner, Math.round(amount), 0, 'hegrenade', [(c[0] - pos[0]) / (d || 1), (c[1] - pos[1]) / (d || 1), 0.3]);
      }
      g.bots.onNoise(n.owner, pos, 2500);
    } else if (n.type === 'flashbang') {
      g.sound.play('flashbang_explode', { pos, volume: 1 });
      g.effects.sprite({ tex: 'spr_flare', pos: pos.slice(), size: 220, life: 0.25, additive: true });
      for (const p of g.players) {
        if (!p.alive) continue;
        const eye = p.eyePos();
        const dx = eye[0] - pos[0], dy = eye[1] - pos[1], dz = eye[2] - pos[2];
        const d = Math.hypot(dx, dy, dz);
        if (d > 1500) continue;
        g.collision.trace(pos, eye, [0, 0, 0], [0, 0, 0], MASK_SHOT, tr);
        if (tr.fraction < 1) continue;
        const f = [0, 0, 0];
        angleVectors(p.pm.angles[0], p.pm.angles[1], f, null, null);
        const dot = -(f[0] * dx + f[1] * dy + f[2] * dz) / (d || 1); // facing the flash
        const strength = 1 - d / 1500;
        const facing = dot > 0.6 ? 1 : dot > 0.3 ? 0.55 : 0.25;
        const hold = 2.2 * strength * facing;
        const fade = 1.5 + 3.5 * strength * facing;
        p.flashStart = g.time;
        p.flashFull = g.time + hold;
        p.flashUntil = g.time + hold + fade;
        p.flashMax = facing >= 1 ? 1 : 0.85;
        if (p.isBot) g.bots.onFlashed(p, hold + fade * 0.5);
      }
    } else if (n.type === 'smokegrenade') {
      g.sound.play('smoke_explode', { pos, volume: 1 });
      g.effects.smokeCloud(pos);
      this.smokes.push({ pos: pos.slice(), radius: 150, start: g.time + 1.5, end: g.time + 22 });
    }
  }

  // does a line pass through active smoke?
  blocksVision(a, b) {
    const t = this.game.time;
    for (const s of this.smokes) {
      if (t < s.start) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len2 = dx * dx + dy * dy + dz * dz || 1;
      let u = ((s.pos[0] - a[0]) * dx + (s.pos[1] - a[1]) * dy + (s.pos[2] + 50 - a[2]) * dz) / len2;
      u = Math.max(0, Math.min(1, u));
      const cx = a[0] + dx * u - s.pos[0], cy = a[1] + dy * u - s.pos[1], cz = a[2] + dz * u - (s.pos[2] + 50);
      if (cx * cx + cy * cy + cz * cz < s.radius * s.radius) return true;
    }
    return false;
  }
}
