// Fire (zombie survival): molotov / fireball floor fires that spread out from where they
// land and stop at walls, acid pools, people and zombies set on fire (damage over time,
// flames on the body, slowly charred black), and the flamethrower's stream (a cone of
// damage along the aim, cut short by walls). Particles are in firefx.js; logic runs at
// the 100 Hz tick, the particles every rendered frame.
import { TraceResult, MASK_SHOT, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { angleVectors } from '../engine/coords.js';
import { FireFX } from './firefx.js';

const tr = new TraceResult();
const ZERO = [0, 0, 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const _f = [0, 0, 0], _r = [0, 0, 0], _u = [0, 0, 0];

export const STREAM_RANGE = 430;

const BURN_STAIN = [1, 1, 1], ACID_STAIN = [0.32, 0.62, 0.1];

export class FireSystem {
  constructor(game) {
    this.game = game;
    this.fx = typeof document !== 'undefined' ? new FireFX(game.effects.group) : null;
    this.patches = [];
    this.burning = new Set();
    this.streamers = new Set();
  }

  clear() {
    for (const p of this.patches) this.endPatch(p);
    this.patches = [];
    for (const p of this.burning) p.burn = null;
    this.burning.clear();
    for (const p of this.streamers) this.stopStream(p);
    this.fx?.clear();
  }

  emit(kind, pos, vel, o) { this.fx?.emit(kind, pos, vel, o); }

  // ---------------------------------------------------------------- area fires
  /**
   * Start a fire (or acid pool) on the floor at pos. o: { kind: 'fire' | 'acid', radius,
   * duration, dps, weapon, burn (afterburn seconds) }. Spreads out in rings over ~0.4 s,
   * never through walls, following steps and slopes.
   */
  ignite(pos, owner, o = {}) {
    const g = this.game, c = g.collision, t = g.time;
    const kind = o.kind || 'fire';
    const radius = o.radius ?? 120;
    c.trace([pos[0], pos[1], pos[2] + 16], [pos[0], pos[1], pos[2] - 240], ZERO, ZERO, MASK_WORLD_PLAYER, tr);
    const floor = tr.fraction < 1 ? tr.endpos.slice() : pos.slice();
    const pts = [];
    const rings = radius < 40 ? [[0, 1]] : radius < 60 ? [[0, 1], [radius * 0.8, 4]] : [[0, 1], [radius * 0.38, 6], [radius * 0.7, 10], [radius, 15]];
    const mid = [floor[0], floor[1], floor[2] + 20];
    for (const [r, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const rr = r * rnd(0.85, 1.12);
        let x = floor[0] + Math.cos(a) * rr, y = floor[1] + Math.sin(a) * rr;
        if (r > 0) {
          c.trace(mid, [x, y, mid[2]], ZERO, ZERO, MASK_SHOT, tr);
          if (tr.fraction < 1) { if (tr.fraction * rr < 20) continue; x = tr.endpos[0] - Math.cos(a) * 8; y = tr.endpos[1] - Math.sin(a) * 8; }
        }
        c.trace([x, y, floor[2] + 40], [x, y, floor[2] - 90], ZERO, ZERO, MASK_WORLD_PLAYER, tr);
        if (tr.fraction >= 1 || tr.startsolid || tr.normal[2] < 0.6) continue;
        pts.push({ x, y, z: tr.endpos[2], on: (r / Math.max(1, radius)) * 0.4 });
      }
    }
    if (!pts.length) pts.push({ x: floor[0], y: floor[1], z: floor[2], on: 0 });
    const patch = {
      kind, owner, weapon: o.weapon || 'molotov', pts, center: floor, radius,
      start: t, end: t + (o.duration ?? 7), dps: o.dps ?? 40, burnFor: o.burn ?? (kind === 'fire' ? 2.5 : 0), nextDmg: t,
      glow: this.fx ? this.fx.glow(floor, radius * 1.2, kind === 'acid' ? 0x50ff20 : 0xff7020) : null,
      sound: g.sound?.loop(kind === 'acid' ? 'acid_loop' : 'fire_loop', { pos: floor, volume: o.quiet ? 0.45 : 0.9 }),
    };
    if (!o.quiet) {
      g.sound?.play(kind === 'acid' ? 'acid_splash' : 'fire_ignite', { pos: floor, volume: 1 });
      for (let i = 0; i < 26; i++) {
        this.emit(kind, [floor[0] + rnd(-20, 20), floor[1] + rnd(-20, 20), floor[2] + 6], [rnd(-180, 180), rnd(-180, 180), rnd(60, 260)], { life: rnd(0.4, 0.8), size: rnd(14, 24), size1: rnd(30, 50), drag: 3, buoy: 120 });
      }
    }
    // what it leaves behind: a burn (or acid) stain that darkens in as it burns, for good
    if (g.effects?.decal && this.fx) {
      patch.mark = g.effects.decal('decal_scorch', floor, [0, 0, 1], Math.max(40, radius * 1.7), [...(kind === 'acid' ? ACID_STAIN : BURN_STAIN), 0], undefined, true);
      patch.markA = 0;
    }
    this.patches.push(patch);
    return patch;
  }

  endPatch(p) {
    p.sound?.stop?.(0.6);
    p.glow?.removeFromParent();
    p.glow?.material.dispose();
    p.glow = null;
  }

  // ---------------------------------------------------------------- burning
  /** Set someone on fire (refreshes; the stronger burn wins). */
  burn(q, attacker, seconds, dps, weapon) {
    if (!q.alive || this.immune(q, 'fire')) return;
    const t = this.game.time;
    const b = q.burn;
    q.burn = { until: Math.max(b?.until ?? 0, t + seconds), dps: Math.max(b && b.until > t ? b.dps : 0, dps), by: attacker, weapon, next: b?.next ?? t + 0.25 };
    this.burning.add(q);
  }

  immune(q, kind) { return kind === 'fire' && !!q.boss?.def.fireImmune; }

  /** Fire / acid damage (the blast path: no hitgroups, no blood; armour absorbs some). */
  hurt(q, attacker, dmg, weapon, kind) {
    if (!q.alive || this.immune(q, kind)) return;
    const g = this.game;
    if (attacker && q !== attacker && attacker.team === q.team && !g.rounds.friendlyFire) return;
    if (q === attacker) dmg *= 0.35; // your own fire hurts, less
    g.damagePlayer(q, attacker, dmg, 0, weapon, null, null, { blast: true, fire: kind !== 'acid', acid: kind === 'acid' });
  }

  inPatch(q, patch, t) {
    const o = q.pm.origin, fz = o[2] - 36;
    for (const pt of patch.pts) {
      if (t < patch.start + pt.on) continue;
      const dx = o[0] - pt.x, dy = o[1] - pt.y;
      if (dx * dx + dy * dy < 40 * 40 && fz > pt.z - 18 && fz < pt.z + 48) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- flamethrower
  /** One tick of the flamethrower's stream from player p (weaponsys calls it every 0.05 s while firing). */
  stream(p) {
    const g = this.game, t = g.time;
    const a = p.pm.angles;
    angleVectors(a[0], a[1], _f, _r, _u);
    const eye = p.eyePos();
    const nz = [eye[0] + _f[0] * 22 + _r[0] * 5 - _u[0] * 7, eye[1] + _f[1] * 22 + _r[1] * 5 - _u[1] * 7, eye[2] + _f[2] * 22 + _r[2] * 5 - _u[2] * 7];
    g.collision.trace(eye, [eye[0] + _f[0] * STREAM_RANGE, eye[1] + _f[1] * STREAM_RANGE, eye[2] + _f[2] * STREAM_RANGE], ZERO, ZERO, MASK_SHOT, tr);
    const maxD = tr.fraction * STREAM_RANGE;
    const hit = tr.fraction < 1 ? tr.endpos.slice() : null;
    const hitN = tr.normal.slice();
    for (let i = 0; i < 7; i++) {
      const sx = rnd(-0.08, 0.08), sy = rnd(-0.07, 0.07);
      const d = [_f[0] + _r[0] * sx + _u[0] * sy, _f[1] + _r[1] * sx + _u[1] * sy, _f[2] + _r[2] * sx + _u[2] * sy];
      const sp = rnd(800, 980);
      const life = Math.min(0.62, maxD / 650 + 0.08) * rnd(0.85, 1.12);
      const k = Math.random() * 30;
      this.emit('fire', [nz[0] + d[0] * k, nz[1] + d[1] * k, nz[2] + d[2] * k], [d[0] * sp, d[1] * sp, d[2] * sp], { life, size: 7, size1: rnd(60, 85), drag: 1.5, buoy: 120, frame: i % 3 ? 0 : 1 });
    }
    if (Math.random() < 0.35) this.emit('smoke', [nz[0] + _f[0] * 60, nz[1] + _f[1] * 60, nz[2] + 10], [_f[0] * 200, _f[1] * 200, 60], { life: 1.4, size: 20, size1: 70, drag: 1.5, buoy: 30 });
    if (hit) {
      // splashing on the wall / floor
      for (let i = 0; i < 2; i++) this.emit('fire', [hit[0] + hitN[0] * 6, hit[1] + hitN[1] * 6, hit[2] + hitN[2] * 6], [hitN[0] * 60 + rnd(-90, 90), hitN[1] * 60 + rnd(-90, 90), rnd(20, 90)], { life: rnd(0.3, 0.6), size: 14, size1: 34, drag: 2, buoy: 90 });
    }
    // damage: everyone in the cone, in sight
    if (t >= (p.flameDmgT || 0)) {
      p.flameDmgT = t + 0.05;
      for (const q of g.players) {
        if (!q.alive || q === p || q.team === p.team) continue;
        const o = q.pm.origin;
        const rx = o[0] - eye[0], ry = o[1] - eye[1], rz = o[2] - eye[2];
        const along = rx * _f[0] + ry * _f[1] + rz * _f[2];
        if (along < 0 || along > maxD + 30) continue;
        const px = rx - _f[0] * along, py = ry - _f[1] * along, pz = rz - _f[2] * along;
        const scale = q.boss ? q.boss.scale : 1;
        if (Math.hypot(px, py, pz) > 16 * scale + along * 0.2) continue;
        if (along > 60 && !g.visible(eye, o)) continue;
        this.hurt(q, p, 7, 'flamethrower', 'fire');
        this.burn(q, p, 3, 16, 'flamethrower');
      }
    }
    if (!p.flameSound) {
      const local = p === g.viewTarget;
      p.flameSound = g.sound?.loop('flame_loop', { pos: local ? null : eye, volume: 0.85, channel: `${p.id}:flame` });
      g.sound?.play('flame_start', { pos: local ? null : eye, volume: 0.8 });
      this.streamers.add(p);
    } else if (p !== g.viewTarget) p.flameSound.setPosition?.(eye);
    p.flameLast = t;
    g.bots?.onNoise(p, eye, 900);
  }

  stopStream(p) {
    p.flameSound?.stop?.(0.15);
    if (p.flameSound) this.game.sound?.play('flame_stop', { pos: p === this.game.viewTarget ? null : p.eyePos(), volume: 0.6 });
    p.flameSound = null;
    this.streamers.delete(p);
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    const g = this.game, t = g.time;
    for (let i = 0; i < this.patches.length; i++) {
      const pa = this.patches[i];
      if (t >= pa.end) { this.endPatch(pa); this.patches.splice(i--, 1); continue; }
      const fade = Math.min(1, (pa.end - t) / 1.2);
      const acid = pa.kind === 'acid';
      for (const pt of pa.pts) {
        if (t < pa.start + pt.on) continue;
        if (Math.random() < dt * (acid ? 5 : 9) * fade) {
          this.emit(pa.kind, [pt.x + rnd(-14, 14), pt.y + rnd(-14, 14), pt.z + 3], [rnd(-12, 12), rnd(-12, 12), acid ? rnd(10, 30) : rnd(40, 90)],
            acid ? { life: rnd(0.5, 0.9), size: rnd(8, 14), size1: 4, drag: 1, buoy: 20 } : { life: rnd(0.5, 0.9), size: rnd(16, 26), size1: rnd(5, 9), drag: 1, buoy: 70, frame: 1 });
        }
        if (Math.random() < dt * (acid ? 0.25 : 0.7) * fade) this.emit(acid ? 'mist' : 'smoke', [pt.x, pt.y, pt.z + 40], [rnd(-8, 8), rnd(-8, 8), 35], { life: 2.4, size: 28, size1: 90, drag: 0.5, buoy: 12 });
        if (!acid && Math.random() < dt * 0.6 * fade) this.emit('ember', [pt.x, pt.y, pt.z + 10], [rnd(-40, 40), rnd(-40, 40), rnd(80, 200)], { life: rnd(0.6, 1.2), size: 2.5, size1: 1, drag: 0.6, buoy: 40 });
      }
      if (pa.glow) pa.glow.material.opacity = (acid ? 0.4 : 0.55) * fade * Math.min(1, (t - pa.start) / 0.4) * (0.85 + 0.15 * Math.sin(t * 13 + i));
      if (pa.mark) {
        const a = Math.round(Math.min(1, (t - pa.start) / Math.max(1, (pa.end - pa.start) * 0.6)) * 20) / 20; // steps: few uploads
        if (a !== pa.markA) { pa.markA = a; g.effects.marks.get('decal_scorch')?.setColor(pa.mark, acid ? ACID_STAIN : BURN_STAIN, a * (acid ? 0.6 : 0.75)); }
      }
      if (t >= pa.nextDmg) {
        pa.nextDmg = t + 0.2;
        for (const q of g.players) {
          if (!q.alive || !this.inPatch(q, pa, t)) continue;
          this.hurt(q, pa.owner, pa.dps * 0.2, pa.weapon, pa.kind);
          if (pa.burnFor) this.burn(q, pa.owner, pa.burnFor, 15, pa.weapon);
        }
      }
    }
    for (const q of this.burning) {
      const b = q.burn;
      if (!b || !q.alive || t >= b.until) { q.burn = null; this.burning.delete(q); continue; }
      const sc = q.boss ? q.boss.scale : 1;
      if (Math.random() < dt * 70 * sc) {
        const o = q.pm.origin;
        this.emit('fire', [o[0] + rnd(-10, 10) * sc, o[1] + rnd(-10, 10) * sc, o[2] - 32 + rnd(0, 70) * sc], [rnd(-15, 15), rnd(-15, 15), rnd(40, 90)], { life: rnd(0.35, 0.65), size: rnd(16, 26) * sc, size1: 6, drag: 1, buoy: 110, frame: 1 });
        if (Math.random() < 0.1) this.emit('smoke', [o[0], o[1], o[2] + 40 * sc], [0, 0, 40], { life: 1.6, size: 18, size1: 60, buoy: 20 });
      }
      if (q.model && !q.boss) { q.char = Math.min(0.85, (q.char || 0) + dt * 0.3); q.model.setChar(q.char); }
      if (t >= b.next) { b.next = t + 0.25; this.hurt(q, b.by, b.dps * 0.25, b.weapon, 'fire'); }
    }
    for (const p of this.streamers) if (!p.alive || t - (p.flameLast ?? -9) > 0.12) this.stopStream(p);
  }

  /** Per rendered frame. */
  render(dt) { this.fx?.update(dt); }

  /** Firelight on models near fires: [r, g, b] to add to their ambient light. */
  lightAt(pos, out = [0, 0, 0]) {
    out[0] = out[1] = out[2] = 0;
    const t = this.game.time;
    for (const pa of this.patches) {
      const d = Math.hypot(pos[0] - pa.center[0], pos[1] - pa.center[1], (pos[2] - pa.center[2]) * 0.7);
      const k = Math.max(0, 1 - d / (pa.radius * 1.8 + 60)) * Math.min(1, (pa.end - t) / 1.2) * 0.7;
      if (k <= 0) continue;
      if (pa.kind === 'acid') { out[0] += k * 0.25; out[1] += k * 0.6; out[2] += k * 0.1; } else { out[0] += k; out[1] += k * 0.5; out[2] += k * 0.15; }
    }
    for (const q of this.burning) {
      const d = Math.hypot(pos[0] - q.pm.origin[0], pos[1] - q.pm.origin[1], pos[2] - q.pm.origin[2]);
      const k = Math.max(0, 1 - d / 160) * 0.5;
      out[0] += k; out[1] += k * 0.5; out[2] += k * 0.15;
    }
    for (const p of this.streamers) {
      const d = Math.hypot(pos[0] - p.pm.origin[0], pos[1] - p.pm.origin[1], pos[2] - p.pm.origin[2]);
      const k = Math.max(0, 1 - d / 320) * 0.7;
      out[0] += k; out[1] += k * 0.5; out[2] += k * 0.15;
    }
    out[0] = Math.min(1.2, out[0]); out[1] = Math.min(0.8, out[1]); out[2] = Math.min(0.4, out[2]);
    return out;
  }
}
