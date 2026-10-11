// Thrown grenades using the ported CS 1.6 rules (combatrules.js): MOVETYPE_BOUNCE
// physics, HE RadiusDamage, RadiusFlash blinding and smoke clouds.

import { TraceResult, MASK_WORLD_PLAYER, MASK_SHOT } from '../engine/collision.js';
import { angleVectors } from '../engine/coords.js';
import { createWorldWeapon } from '../assets/worldweapons.js';
import * as CR from './combatrules.js';

const tr = new TraceResult();

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.smokes = []; // active smoke volumes for vision blocking
  }

  clear() {
    for (const n of this.list) n.obj?.removeFromParent();
    this.list = [];
    this.smokes = [];
  }

  trace(a, b) {
    this.game.collision.trace(a, b, [0, 0, 0], [0, 0, 0], MASK_WORLD_PLAYER, tr);
    return { fraction: tr.fraction, endpos: tr.endpos.slice(), normal: tr.normal.slice(), allsolid: tr.allsolid, startsolid: tr.startsolid };
  }

  // params from weaponsys: { angles, speed, fuse, forwardOffset, addOwnerVelocity }
  throw(p, type, params = {}) {
    const g = this.game;
    const ang = params.angles || [p.pm.angles[0], p.pm.angles[1], 0];
    const speed = params.speed ?? 600;
    const f = [0, 0, 0];
    angleVectors(ang[0], ang[1], f, null, null);
    const eye = p.eyePos();
    const off = params.forwardOffset ?? 16;
    const src = [eye[0] + f[0] * off, eye[1] + f[1] * off, eye[2] + f[2] * off];
    const v = [f[0] * speed, f[1] * speed, f[2] * speed];
    if (params.addOwnerVelocity !== false) { v[0] += p.pm.velocity[0]; v[1] += p.pm.velocity[1]; v[2] += p.pm.velocity[2]; }
    // a molotov flies as a projectile and shatters where it lands (projectiles.js)
    if (type === 'molotov') { g.sound.play('lighter', { pos: p.isLocal ? null : eye, volume: 0.5 }); return g.projectiles.launch('molotov', p, src, v); }
    const n = CR.createGrenade(type, src, v, g.time, p);
    n.random = Math.random;
    try { n.obj = createWorldWeapon(type); g.renderer.world.add(n.obj); } catch { n.obj = null; }
    n.spin = Math.random() * 6;
    this.list.push(n);
    return n;
  }

  update(dt) {
    const g = this.game;
    for (const n of this.list) {
      const res = CR.updateGrenade(n, g.time, dt, (a, b) => this.trace(a, b), (gr, speed) => {
        g.sound.play('grenade_bounce', { pos: gr.origin, volume: Math.min(1, 0.25 + speed / 400) });
      });
      if (n.obj) {
        n.obj.position.set(n.origin[0], n.origin[1], n.origin[2]);
        const moving = Math.hypot(...n.velocity) > 1;
        if (moving) n.spin += dt * 10;
        n.obj.rotation.set(0, n.onGround ? Math.PI / 2 : n.spin, n.spin * 0.5);
      }
      if (res === 'explode') this.detonate(n);
      else if (res === 'smoke') this.smoke(n);
    }
    for (const n of this.list) if (n.removed && n.obj) { n.obj.removeFromParent(); n.obj = null; }
    this.list = this.list.filter((n) => !n.removed);
    const now = g.time;
    this.smokes = this.smokes.filter((s) => now < s.end);
  }

  detonate(n) {
    const g = this.game;
    if (n.type === 'hegrenade') {
      const pos = CR.explosionOrigin(n.origin, (a, b) => this.trace(a, b), CR.HE.dmg);
      g.effects.explosion([n.origin[0], n.origin[1], n.origin[2]], 1);
      g.sound.play('he_explode', { pos, volume: 1 });
      const targets = g.players.filter((p) => p.alive).map((p) => ({ origin: p.pm.origin, player: p }));
      for (const { target, damage } of CR.radiusDamage(pos, CR.HE.damage, CR.HE.radius, targets)) {
        const q = target.player;
        const d = [q.pm.origin[0] - pos[0], q.pm.origin[1] - pos[1], q.pm.origin[2] - pos[2]];
        const l = Math.hypot(...d) || 1;
        g.damagePlayer(q, n.owner, damage, 0, 'hegrenade', [d[0] / l, d[1] / l, d[2] / l], null, { blast: true });
      }
      g.bots.onNoise(n.owner, pos, 2500);
      g.shakeAt?.(pos, 6);
    } else if (n.type === 'flashbang') {
      const pos = CR.explosionOrigin(n.origin, (a, b) => this.trace(a, b), CR.FLASHBANG.dmg);
      g.sound.play('flashbang_explode', { pos, volume: 1 });
      g.effects.sprite({ tex: 'spr_flare', pos: pos.slice(), size: 260, life: 0.2, additive: true });
      const players = g.players.filter((p) => p.alive).map((p) => ({
        origin: p.pm.origin, viewOffset: [0, 0, p.pm.viewOfs], viewAngles: p.pm.angles, alive: true, player: p,
        blind: p.flashStart ? { startTime: p.flashStart, holdTime: p.flashHold || 0, fadeTime: p.flashFade || 0, alpha: p.flashAlpha || 0 } : null,
      }));
      const traceFn = (a, b, ignore) => {
        const r = g.traceShot(a, b, ignore ? ignore.player : null);
        const ent = r.entity ? players.find((x) => x.player === r.entity) : null;
        return { fraction: r.fraction, endpos: r.endpos, entity: ent, startsolid: r.startsolid };
      };
      for (const f of CR.radiusFlash(pos, players, traceFn, { time: g.time })) {
        const p = f.target.player;
        p.flashStart = g.time;
        p.flashHold = f.holdTime;
        p.flashFade = f.fadeTime;
        p.flashAlpha = f.alpha;
        p.flashFull = g.time + f.holdTime;
        p.flashUntil = g.time + f.holdTime + f.fadeTime;
        p.flashMax = f.alpha / 255;
        if (p.isBot) g.bots.onFlashed(p, f.holdTime + f.blindDuration);
      }
    }
  }

  smoke(n) {
    const g = this.game;
    g.sound.play('smoke_explode', { pos: n.origin, volume: 1 });
    g.effects.smokeCloud(n.origin.slice());
    this.smokes.push({ pos: n.origin.slice(), radius: 150, start: g.time + 1.2, end: g.time + (CR.SMOKE.approxVisibleDuration || 25) - 3 });
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
