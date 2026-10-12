// Special infected (zombie survival): rarer zombies, each with one trick, L4D style.
//  - BOOMER: bloated, slow and weak. Vomits bile over whoever gets close: the screen goes
//    green for a few seconds and a horde climbs out around you, after you; it bursts in a
//    cloud of bile when killed, so shoot it from a distance.
//  - CHARGER: one huge arm. Roars, then charges in a straight line: whoever it hits goes
//    flying; running into a wall stuns it.
//  - SPRINTER: chalk-white and skinny, red eyes. Outruns you, lunges, comes two or three
//    at a time, dies quickly.
//  - HUNTER: hooded, crouched. Pounces from range and pins you down, clawing, until
//    it's shot off (by you, point blank, or a teammate) or lets go after 3 s.
//  - SMOKER: tall, swallowed by tumours. Lassoes you with its tongue from far away and
//    drags you in; shoot it (or break the line of sight) to snap the tongue. Dies in a
//    choking cloud.
// Specials replace a common zombie now and then (more often later on), at most one of
// a kind up at once (sprinters: a pack); the difficulty sets both (zdiff.js specials).
// They are ordinary zombies to the rest of the
// mode (flow field, claws, kills, bodies); this module adds their looks' stats and tricks.
import * as THREE from 'three';
import { Player, TEAM_T } from './player.js';
import { createPlayerModel } from '../assets/playermodels.js';
import { CONTENTS_ZOMBIE, TraceResult, MASK_SHOT } from '../engine/collision.js';
import { IN_JUMP } from '../engine/pmove.js';
import * as CR from './combatrules.js';
import { specialChance } from './zdiff.js';

const DEG = 180 / Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const _tr = new TraceResult();
const _d = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);
// The warning call (IDLE below), from the special itself: as it comes in, and again once it
// is this close to its target, a moment (WARN_LEAD s) before it can use its trick.
const WARN_R = 900, WARN_LEAD = 0.9, WARN_VOL = 0.9;

/** name, first wave, pick weight, health / speed / damage (x the wave's), size. */
export const SPECIALS = {
  sprinter: { name: 'Sprinter', from: 2, weight: 4, hp: 0.55, speed: 330, cap: 360, dmg: 0.7, scale: [0.96, 0.96, 1.02], pack: [2, 3] },
  boomer: { name: 'Boomer', from: 3, weight: 3, hp: 0.6, speed: 150, dmg: 0.6, scale: [1.08, 1.08, 1.0] },
  hunter: { name: 'Hunter', from: 4, weight: 3, hp: 1.6, speed: 235, dmg: 0.8, scale: [1, 1, 1] },
  charger: { name: 'Charger', from: 5, weight: 2, hp: 3.0, speed: 200, dmg: 1.4, scale: [1.1, 1.1, 1.08] },
  smoker: { name: 'Smoker', from: 6, weight: 2, hp: 1.4, speed: 190, dmg: 0.8, scale: [0.94, 0.94, 1.12] },
};
const IDLE = { boomer: 'boomer_idle', smoker: 'smoker_cough', hunter: 'hunter_scream', sprinter: 'sprinter_shriek', charger: 'boss_growl' };
const BILE_TIME = 7, PIN_TIME = 3, TONGUE_TIME = 5;
const BOUNTY = 300; // $ for killing one

export class Specials {
  constructor(game) {
    this.game = game;
    this.tongues = new Map(); // smoker -> mesh
  }

  get Z() { return this.game.zombies; }

  clear() {
    for (const m of this.tongues.values()) { m.removeFromParent(); m.geometry.dispose(); }
    this.tongues.clear();
    for (const p of this.game.players) { p.pinnedBy = null; p.tonguedBy = null; p.biledUntil = 0; }
  }

  // ---------------------------------------------------------------- spawning
  /** Now and then a special instead of a common zombie: its kind, or null. */
  pick(wave) {
    const diff = this.Z.diff;
    if (Math.random() > specialChance(wave, diff)) return null;
    // how many of a kind may be up (a pack counts once)
    const full = (k, d) => {
      let n = 0;
      for (const z of this.Z.pool) if (z.alive && z.special === k) n++;
      return (d.pack ? Math.ceil(n / d.pack[1]) : n) >= diff.specials.perKind;
    };
    const kinds = Object.entries(SPECIALS).filter(([k, d]) => wave >= d.from && !full(k, d));
    if (!kinds.length) return null;
    let r = Math.random() * kinds.reduce((n, [, d]) => n + d.weight, 0);
    for (const [k, d] of kinds) { r -= d.weight; if (r <= 0) return k; }
    return kinds[0][0];
  }

  /**
   * Bring a special in (a sprinter pack: several). Returns how many came.
   * o: { max (no more than this many), near ([x,y,z]: close to there), extra (outside the
   * wave's count, like a boss's summons) }
   */
  spawn(kind, o = {}) {
    const def = SPECIALS[kind];
    if (!def) return 0;
    const n = Math.min(o.max ?? Infinity, def.pack ? Math.round(rnd(def.pack[0], def.pack[1])) : 1);
    let made = 0, near = o.near || null, first = null;
    for (let i = 0; i < n; i++) {
      const z = this.body(kind);
      if (!z || !this.Z.spawnZombie({ use: z, near, special: true })) break;
      near = near || z.pm.origin.slice(); // the pack comes together
      this.setup(z, def);
      z.extra = !!o.extra;
      first = first || z;
      z.sp.pack = first; // (a pack calls as one)
      made++;
    }
    if (made) this.warn(first, true); // a warning, from where it came in
    if (made) this.Z.events.mode('special', { phase: 'spawn', kind, zombie: first, count: made });
    return made;
  }

  /** A free body of this kind (a dead one whose corpse has settled, or a new one). */
  body(kind) {
    const t = this.game.time;
    const free = this.Z.pool.find((q) => q.special === kind && !q.alive && (!q.deathTime || q.baked || q.gibbed || t - q.deathTime > 4));
    if (free) return free;
    if (this.Z.pool.filter((q) => q.special === kind).length >= 4) return null;
    const g = this.game;
    const z = new Player({ name: SPECIALS[kind].name, team: TEAM_T, skin: kind, isBot: true });
    z.isZombie = true;
    z.special = kind;
    g.addPlayer(z);
    z.box.contents = CONTENTS_ZOMBIE;
    z.model = createPlayerModel(kind);
    z.model.object3D.visible = false;
    g.renderer.world.add(z.model.object3D);
    this.Z.pool.push(z);
    return z;
  }

  setup(z, def) {
    const S = this.Z.stats;
    z.name = def.name;
    z.health = z.maxHealth = Math.round(S.health * def.hp);
    z.zSpeed = def.speed;
    z.zDamage = Math.round(S.damage * def.dmg);
    z.pm.speedCap = def.cap ?? null;
    z.speedNow = null;
    z.model.object3D.scale.set(def.scale[0], def.scale[1], def.scale[2]);
    z.visualCrouch = z.special === 'hunter';
    z.sp = { state: 'chase', until: 0, cd: { vomit: this.game.time + 2, charge: this.game.time + 3, pounce: this.game.time + 2, tongue: this.game.time + 3, lunge: 0 }, took: 0 };
  }

  idleSound(z) { return IDLE[z.special]; }

  /**
   * The warning call, from the special (or its pack) itself, carrying far ('loud'). Once it
   * is close (WARN_R; or on coming in that close) it counts: its tricks wait WARN_LEAD s more.
   */
  warn(z, arrival = false) {
    const g = this.game, t = g.time, S = z.sp;
    g.sound?.play(IDLE[z.special], { pos: z.eyePos(), volume: WARN_VOL, attenuation: 'loud', channel: `${z.id}:voice` });
    z.nextGrowl = Math.max(z.nextGrowl || 0, t + 3); // (no idle growl right on top of it)
    if (arrival) {
      let near = false;
      for (const h of this.Z.humans()) if (dist2(h.pm.origin, z.pm.origin) < WARN_R) near = true;
      if (!near) return;
    }
    for (const q of this.Z.pool) {
      if (q !== z && !(q.alive && q.sp && q.sp.pack === S.pack)) continue;
      q.sp.warned = true;
      for (const k in q.sp.cd) if (q.sp.cd[k] < t + WARN_LEAD) q.sp.cd[k] = t + WARN_LEAD;
    }
  }

  // ---------------------------------------------------------------- AI
  /** The special's own move this tick; false: chase / claw like a common zombie. */
  think(z, target, cmd, t) {
    if (!z.sp) return false;
    if (!z.sp.warned && dist2(z.pm.origin, target.pm.origin) < WARN_R) this.warn(z); // it gives itself away first
    if (z.special === 'charger') { z.speedNow = null; z.pm.speedCap = null; }
    switch (z.special) {
      case 'boomer': return this.boomer(z, target, cmd, t);
      case 'charger': return this.charger(z, target, cmd, t);
      case 'sprinter': return this.sprinter(z, target, cmd, t);
      case 'hunter': return this.hunter(z, target, cmd, t);
      case 'smoker': return this.smoker(z, target, cmd, t);
      default: return false;
    }
  }

  face(z, pos, maxTurn = 12) {
    const o = z.pm.origin;
    const d = angDiff(Math.atan2(pos[1] - o[1], pos[0] - o[0]) * DEG, z.pm.angles[1]);
    z.pm.angles[1] += Math.max(-maxTurn, Math.min(maxTurn, d));
    z.pm.angles[0] = 0;
    return Math.abs(d);
  }

  sees(z, q) {
    const g = this.game;
    return g.visible(z.eyePos(), q.eyePos()) || g.visible(z.eyePos(), [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 10]);
  }

  mouth(z) {
    const e = z.eyePos(), y = z.pm.angles[1] / DEG;
    return [e[0] + Math.cos(y) * 8, e[1] + Math.sin(y) * 8, e[2] - 5];
  }

  // ---- BOOMER
  boomer(z, target, cmd, t) {
    const S = z.sp, g = this.game;
    const d = dist2(z.pm.origin, target.pm.origin);
    if (S.state === 'vomit') {
      this.face(z, target.pm.origin, 6);
      const m = this.mouth(z), y = z.pm.angles[1] / DEG;
      if (t >= S.from && t < S.until - 0.2) {
        for (let i = 0; i < 3; i++) {
          const sp = rnd(380, 520), a = y + rnd(-0.18, 0.18);
          g.fire?.emit('acid', m, [Math.cos(a) * sp, Math.sin(a) * sp, rnd(-60, 40)], { life: rnd(0.45, 0.7), size: rnd(5, 8), size1: rnd(16, 26), drag: 1.2, buoy: -500 });
        }
      }
      if (!S.hit && t >= S.from + 0.25) {
        S.hit = true;
        for (const h of this.Z.humans()) {
          const o = h.pm.origin, dd = dist2(z.pm.origin, o);
          const along = ((o[0] - z.pm.origin[0]) * Math.cos(y) + (o[1] - z.pm.origin[1]) * Math.sin(y)) / Math.max(1, dd);
          if (dd < 290 && along > 0.75 && g.visible(m, h.eyePos())) this.bile(h);
        }
      }
      if (t >= S.until) { S.state = 'chase'; S.cd.vomit = t + 9; }
      return true;
    }
    if (t >= S.cd.vomit && d < 230 && this.sees(z, target)) {
      S.state = 'vomit'; S.from = t + 0.3; S.until = t + 1.3; S.hit = false;
      z.lastShot = t;
      g.sound?.play('boomer_vomit', { pos: z.eyePos(), volume: 1, channel: `${z.id}:voice` });
      return true;
    }
    return false;
  }

  /** Covered in bile: green, half blind, and every zombie around wants you. */
  bile(h) {
    const g = this.game, t = g.time;
    const fresh = !(h.biledUntil > t);
    h.biledUntil = t + BILE_TIME;
    if (h === g.local) { g.hud?.centerPrint?.('You got puked on! Here they come...', 3); g.shakeAt?.(h.pm.origin, 6, 400); }
    g.sound?.play('acid_splash', { pos: h === g.viewTarget ? null : h.eyePos(), volume: 0.9 });
    // the horde comes for whoever got slimed (not too often)
    if (fresh && this.Z.state === 'wave' && t - (h.lastHorde || -99) > 12) {
      h.lastHorde = t;
      const n = Math.min(6, 3 + Math.floor(this.Z.wave / 4));
      for (let i = 0; i < n; i++) this.Z.spawnZombie({ near: h.pm.origin, health: Math.round(this.Z.stats.health * 0.8) });
    }
  }

  // ---- CHARGER
  charger(z, target, cmd, t) {
    const S = z.sp, g = this.game;
    const o = z.pm.origin, d = dist2(o, target.pm.origin);
    if (S.state === 'wind') {
      this.face(z, target.pm.origin, 8);
      if (t >= S.until) { S.state = 'charge'; S.until = t + 1.6; S.yaw = z.pm.angles[1]; S.start = t; S.hitList = new Set(); }
      return true;
    }
    if (S.state === 'charge') {
      const want = Math.atan2(target.pm.origin[1] - o[1], target.pm.origin[0] - o[0]) * DEG;
      S.yaw += Math.max(-0.3, Math.min(0.3, angDiff(want, S.yaw)));
      z.pm.angles[1] = S.yaw;
      z.pm.speedCap = 600;
      z.speedNow = 560;
      cmd.forwardmove = 1000;
      const y = S.yaw / DEG;
      for (const h of this.Z.humans()) {
        if (S.hitList.has(h)) continue;
        const ho = h.pm.origin;
        if (dist2(o, ho) < 46 && Math.abs(ho[2] - o[2]) < 64) {
          S.hitList.add(h);
          g.damagePlayer(h, z, Math.min(35, Math.round(15 + 1.5 * this.Z.wave)), CR.HITGROUP.CHEST, 'zombie', [Math.cos(y), Math.sin(y), 0.3], [ho[0], ho[1], ho[2] + 10]);
          h.pm.velocity[0] = Math.cos(y) * 650; h.pm.velocity[1] = Math.sin(y) * 650; h.pm.velocity[2] = 280;
          h.pm.onground = false;
          g.sound?.play('charge_hit', { pos: ho, volume: 1 });
          g.shakeAt?.(ho, 12, 600);
          S.state = 'recover'; S.until = t + 0.9; S.cd.charge = t + 7;
          return true;
        }
      }
      const sp = Math.hypot(z.pm.velocity[0], z.pm.velocity[1]);
      if (t - S.start > 0.3 && sp < 170) { // into a wall
        g.sound?.play('charge_wall', { pos: o, volume: 0.9 });
        g.shakeAt?.(o, 8, 800);
        S.state = 'recover'; S.until = t + 1.6; S.cd.charge = t + 7;
        return true;
      }
      if (t >= S.until) { S.state = 'recover'; S.until = t + 0.5; S.cd.charge = t + 7; }
      return true;
    }
    if (S.state === 'recover') {
      if (t >= S.until) S.state = 'chase';
      return true;
    }
    if (t >= S.cd.charge && d > 200 && d < 900 && z.pm.onground && Math.abs(target.pm.origin[2] - o[2]) < 48 && this.sees(z, target)) {
      S.state = 'wind'; S.until = t + 0.75;
      z.lastShot = t;
      g.sound?.play('charger_roar', { pos: z.eyePos(), volume: 1, channel: `${z.id}:voice` });
      return true;
    }
    return false;
  }

  // ---- SPRINTER: a lunge now and then on top of the normal chase
  sprinter(z, target, cmd, t) {
    const S = z.sp;
    const d = dist2(z.pm.origin, target.pm.origin);
    if (t >= S.cd.lunge && d > 110 && d < 260 && z.pm.onground && Math.abs(target.pm.origin[2] - z.pm.origin[2]) < 40 && this.sees(z, target)) {
      S.cd.lunge = t + rnd(2, 3.5);
      const y = Math.atan2(target.pm.origin[1] - z.pm.origin[1], target.pm.origin[0] - z.pm.origin[0]);
      z.pm.velocity[0] += Math.cos(y) * 230; z.pm.velocity[1] += Math.sin(y) * 230; z.pm.velocity[2] = 230;
      z.pm.onground = false;
      this.game.sound?.play('sprinter_shriek', { pos: z.eyePos(), volume: 0.9, channel: `${z.id}:voice` });
    }
    return false;
  }

  // ---- HUNTER
  hunter(z, target, cmd, t) {
    const S = z.sp, g = this.game;
    const o = z.pm.origin;
    if (S.state === 'wind') {
      this.face(z, target.pm.origin, 15);
      if (t >= S.until) {
        // a ballistic leap at where he stands
        const to = target.pm.origin, dx = to[0] - o[0], dy = to[1] - o[1], dz = to[2] - o[2];
        const T = Math.max(0.62, Math.min(0.95, Math.hypot(dx, dy) / 640)); // (vz well over 180: airborne)
        z.pm.velocity = [dx / T, dy / T, (dz + 0.5 * 800 * T * T) / T];
        z.pm.onground = false;
        z.pm.speedCap = 1200;
        S.state = 'air'; S.start = t;
        g.sound?.play('hunter_pounce', { pos: z.eyePos(), volume: 1, channel: `${z.id}:voice` });
      }
      return true;
    }
    if (S.state === 'air') {
      cmd.forwardmove = 0;
      for (const h of this.Z.humans()) {
        const ho = h.pm.origin;
        if (dist2(o, ho) < 52 && Math.abs(ho[2] - o[2]) < 64 && !h.pinnedBy) { this.pin(z, h); return true; }
      }
      if ((z.pm.onground && t - S.start > 0.15) || t - S.start > 2) { S.state = 'recover'; S.until = t + 0.7; S.cd.pounce = t + 3; z.pm.speedCap = null; }
      return true;
    }
    if (S.state === 'pin') {
      const v = S.victim;
      cmd.forwardmove = 0; cmd.sidemove = 0;
      z.speedNow = 1;
      if (!v.alive || !z.alive || t >= S.until || S.took - S.tookAt >= 45) { this.unpin(z); return true; }
      // on top of him, clawing
      const vo = v.pm.origin, dir = S.dir;
      z.pm.origin = [vo[0] - dir[0] * 26, vo[1] - dir[1] * 26, Math.max(vo[2], z.pm.origin[2] - 8)];
      z.pm.velocity = [0, 0, 0];
      this.face(z, vo, 30);
      if (t >= S.nextClaw) {
        S.nextClaw = t + 0.35;
        z.lastShot = t;
        g.damagePlayer(v, z, Math.min(10, 4 + 0.3 * this.Z.wave), CR.HITGROUP.CHEST, 'zombie', [dir[0], dir[1], -0.3], [vo[0], vo[1], vo[2] + 6]);
        if (v === g.local) g.shakeAt?.(vo, 4, 300);
      }
      return true;
    }
    if (S.state === 'recover') {
      z.pm.speedCap = null;
      if (t >= S.until) S.state = 'chase';
      return true;
    }
    const d = dist2(o, target.pm.origin);
    if (t >= S.cd.pounce && d > 140 && d < 560 && z.pm.onground && !target.pinnedBy && this.sees(z, target)) {
      S.state = 'wind'; S.until = t + 0.35;
      g.sound?.play('hunter_scream', { pos: z.eyePos(), volume: 1, channel: `${z.id}:voice` });
      return true;
    }
    return false;
  }

  pin(z, h) {
    const g = this.game, S = z.sp, t = g.time;
    const o = z.pm.origin, ho = h.pm.origin;
    const l = dist2(o, ho) || 1;
    S.state = 'pin'; S.victim = h; S.until = t + PIN_TIME; S.nextClaw = t + 0.15; S.tookAt = S.took;
    S.dir = [(ho[0] - o[0]) / l, (ho[1] - o[1]) / l];
    z.pm.speedCap = null;
    h.pinnedBy = z;
    h.pm.velocity = [0, 0, 0];
    g.sound?.play('charge_hit', { pos: ho, volume: 0.7 });
    if (h === g.local) g.hud?.centerPrint?.('A Hunter has you pinned! Shoot it off!', 2.5);
  }

  unpin(z) {
    const S = z.sp, v = S.victim;
    if (v && v.pinnedBy === z) v.pinnedBy = null;
    S.victim = null;
    S.state = 'recover'; S.until = this.game.time + 0.8; S.cd.pounce = this.game.time + 6;
    z.speedNow = null;
    // knocked back off him
    if (S.dir) { z.pm.velocity[0] = -S.dir[0] * 220; z.pm.velocity[1] = -S.dir[1] * 220; z.pm.velocity[2] = 180; }
  }

  // ---- SMOKER
  smoker(z, target, cmd, t) {
    const S = z.sp, g = this.game;
    const o = z.pm.origin, d = dist2(o, target.pm.origin);
    if (S.state === 'wind') {
      this.face(z, target.pm.origin, 10);
      if (t >= S.until) {
        S.state = 'fly'; S.tip = this.mouth(z); S.victim = target; S.start = t;
        g.sound?.play('tongue_shot', { pos: z.eyePos(), volume: 1 });
      }
      return true;
    }
    if (S.state === 'fly' || S.state === 'pull') {
      cmd.forwardmove = 0; cmd.sidemove = 0;
      const v = S.victim, m = this.mouth(z);
      const chest = [v.pm.origin[0], v.pm.origin[1], v.pm.origin[2] + 8];
      this.face(z, v.pm.origin, 10);
      const blocked = () => { g.collision.trace(m, chest, [0, 0, 0], [0, 0, 0], MASK_SHOT, _tr); return _tr.fraction < 0.97; };
      if (!v.alive || !z.alive) { this.release(z); return true; }
      if (S.state === 'fly') {
        const dx = chest[0] - S.tip[0], dy = chest[1] - S.tip[1], dz = chest[2] - S.tip[2], l = Math.hypot(dx, dy, dz);
        const step = 1500 * 0.01;
        if (l <= step + 16) {
          if (v.tonguedBy || blocked()) { this.release(z); return true; }
          S.state = 'pull'; S.grab = t; S.tookAt = S.took; S.nextHurt = t + 0.5; S.hidden = 0;
          v.tonguedBy = z;
          g.sound?.play('hit_flesh', { pos: chest, volume: 0.8 });
          if (v === g.local) g.hud?.centerPrint?.('A Smoker has you! Shoot it to snap the tongue!', 2.5);
        } else {
          S.tip = [S.tip[0] + dx / l * step, S.tip[1] + dy / l * step, S.tip[2] + dz / l * step];
          g.collision.trace(m, S.tip, [0, 0, 0], [0, 0, 0], MASK_SHOT, _tr);
          if (_tr.fraction < 1 || t - S.start > 1) { this.release(z); return true; }
        }
        return true;
      }
      // pulling: the tongue snaps when he's shot up, out of sight a moment, or after a while
      S.tip = chest;
      S.hidden = blocked() ? S.hidden + 0.01 : 0;
      if (S.took - S.tookAt >= 40 || S.hidden > 0.35 || t - S.grab > TONGUE_TIME) { this.release(z); return true; }
      if (t >= S.nextHurt) {
        S.nextHurt = t + 0.5;
        const close = dist2(o, v.pm.origin) < 70;
        if (close) z.lastShot = t;
        g.damagePlayer(v, z, close ? 7 : 3, CR.HITGROUP.CHEST, 'zombie', null, null, { blast: !close });
      }
      return true;
    }
    if (S.state === 'recover') { if (t >= S.until) S.state = 'chase'; return true; }
    if (t >= S.cd.tongue && d > 180 && d < 850 && this.sees(z, target) && !target.tonguedBy) {
      S.state = 'wind'; S.until = t + 0.55;
      z.lastShot = t;
      g.sound?.play('smoker_cough', { pos: z.eyePos(), volume: 1, channel: `${z.id}:voice` });
      return true;
    }
    // hangs back at range while the tongue recharges
    if (d < 420 && d > 120 && this.sees(z, target)) { this.face(z, target.pm.origin, 8); cmd.forwardmove = 0; return true; }
    return false;
  }

  release(z) {
    const S = z.sp, v = S.victim;
    if (v && v.tonguedBy === z) v.tonguedBy = null;
    S.victim = null; S.tip = null;
    S.state = 'recover'; S.until = this.game.time + 0.8; S.cd.tongue = this.game.time + 7;
  }

  // ---------------------------------------------------------------- hooks
  onDamage(z, dmg) { if (z.sp) z.sp.took += dmg; }

  /** A special went down: its bounty, and the Boomer's burst / the Smoker's cloud. */
  onDeath(z, attacker) {
    const g = this.game, S = z.sp;
    if (S?.victim) { if (z.special === 'hunter') this.unpin(z); else if (z.special === 'smoker') this.release(z); }
    if (attacker && !attacker.isZombie && attacker.team !== z.team) g.rounds.addMoney(attacker, BOUNTY);
    const o = z.pm.origin;
    if (z.special === 'boomer') {
      const c = [o[0], o[1], o[2] + 10];
      g.sound?.play('boomer_burst', { pos: c, volume: 1 });
      for (let i = 0; i < 40; i++) g.fire?.emit(i % 3 ? 'acid' : 'mist', c, [rnd(-420, 420), rnd(-420, 420), rnd(60, 420)], { life: rnd(0.5, 1.1), size: rnd(8, 16), size1: rnd(30, 60), drag: 2, buoy: -300 });
      for (const h of this.Z.humans()) if (Math.hypot(h.pm.origin[0] - c[0], h.pm.origin[1] - c[1], h.pm.origin[2] - c[2]) < 180 && g.visible(c, h.eyePos())) this.bile(h);
      g.effects.decal?.('decal_scorch', [o[0], o[1], o[2] - 35.5], [0, 0, 1], 150, [0.42, 0.62, 0.12, 0.7], undefined, true);
      g.gore?.gibPlayer(z, [0, 0, 1], 1.4);
      g.shakeAt?.(c, 6, 700);
    } else if (z.special === 'smoker') {
      for (let i = 0; i < 22; i++) g.fire?.emit('smoke', [o[0] + rnd(-40, 40), o[1] + rnd(-40, 40), o[2] + rnd(-10, 40)], [rnd(-30, 30), rnd(-30, 30), rnd(10, 40)], { life: rnd(3, 4.5), size: rnd(30, 50), size1: rnd(90, 140), drag: 0.8, buoy: 8 });
      g.sound?.play('smoker_cough', { pos: o, volume: 0.8 });
    }
  }

  /** People held by a special: pinned flat, or dragged along a tongue (before they move). */
  constrain(p, cmd) {
    const t = this.game.time;
    if (p.pinnedBy) {
      const h = p.pinnedBy;
      if (!h.alive || h.sp?.victim !== p || h.sp.state !== 'pin') p.pinnedBy = null;
      else { p.pm.frozen = true; cmd.forwardmove = cmd.sidemove = cmd.upmove = 0; p.pm.velocity[0] = p.pm.velocity[1] = 0; return; }
    }
    if (p.tonguedBy) {
      const s = p.tonguedBy;
      if (!s.alive || s.sp?.victim !== p || s.sp.state !== 'pull') { p.tonguedBy = null; return; }
      const o = p.pm.origin, so = s.pm.origin;
      const dx = so[0] - o[0], dy = so[1] - o[1], l = Math.hypot(dx, dy) || 1;
      cmd.forwardmove = cmd.sidemove = cmd.upmove = 0;
      cmd.buttons &= ~IN_JUMP;
      const sp = l > 60 ? 150 : 0;
      p.pm.velocity[0] = dx / l * sp; p.pm.velocity[1] = dy / l * sp;
    }
    void t;
  }

  /** Zombies go for someone covered in bile first (distance weight). */
  lure(h, t) { return h.biledUntil > t ? 0.3 : 1; }

  // ---------------------------------------------------------------- per frame
  /** The Smokers' tongues. */
  render() {
    const g = this.game;
    for (const z of this.Z.pool) {
      if (z.special !== 'smoker') continue;
      const S = z.sp;
      let mesh = this.tongues.get(z);
      const on = z.alive && S && S.tip && (S.state === 'fly' || S.state === 'pull');
      if (!on) { if (mesh) mesh.visible = false; continue; }
      if (!mesh) {
        const geo = new THREE.CylinderGeometry(0.55, 0.75, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a2a36 }));
        mesh.frustumCulled = false;
        g.renderer.world.add(mesh);
        this.tongues.set(z, mesh);
      }
      const a = this.mouth(z), b = S.tip;
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const l = _d.length();
      mesh.visible = true;
      mesh.position.set(a[0], a[1], a[2]);
      mesh.quaternion.setFromUnitVectors(_Z, _d.normalize()); // (GS space, like the parent)
      mesh.scale.set(1, 1, Math.max(0.1, l));
    }
  }

  /** HUD: covered in bile (0..1). */
  bileOf(p) { return p && p.biledUntil > this.game.time ? Math.min(1, (p.biledUntil - this.game.time) / 1.5) : 0; }
}
