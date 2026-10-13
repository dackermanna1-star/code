// Zombie survival arsenal (Milestone 3, owner: arsenal): the weapons that aren't plain guns.
// weaponsys.js runs their state machines (timing, animations, sounds, ammo); this module does
// what happens in the world:
//  - the blades (machete, fire axe, katana: they take the knife's slot) - a swing lands its
//    delay after the press: a fan of traces across the swing's arc (a downward fan for a chop),
//    the nearest bodies in it up to the weapon's targets (the katana cuts two), a forgiving
//    reach check behind the traces like the CS knife's; the fire axe staggers whatever it chops.
//    Headshot kills take the head off (gore.js HEAD_POPPERS). A fallen player keeps the blade
//    he paid for (back in hand when he respawns).
//  - crossbow bolts: a fast visible projectile with a little drop, silent; it goes through the
//    first body (pierceDamage of the hit to the next) and stops in the second, a boss or a wall;
//    a bolt stuck in the world can be picked up again (walk over it) for a while.
//  - the pipe bomb (grenades.js hands it over): it beeps and flashes, and every common zombie
//    within LURE_R that can walk to it drops what it's doing and crowds round it for def.lure
//    s (ZombieMode.think asks lured() first), then it blows (live bodies come apart). Bots
//    swarmed at close quarters throw theirs (bots.js combat asks bot()); they buy one in a break
//    when they have the money to spare.
//  - the cryo grenade: bursts after its fuse into a frost cloud that freezes the zombies in
//    def.radius solid for def.freeze s (they stand stock still, frosted over: the stagger hold
//    and a frozen pose; specials mid-trick shrug it off, bosses are only chilled). One a blast
//    or a blade kills while frozen - and alive - shatters into ice (gore's body pieces, frosted,
//    and shards that melt away); a bullet kill only cracks the ice off (bullets never gib
//    bodies); a corpse never does (death thaws it).
// Per zombie (written here only; read by zombies.js): z.lure (the bomb it walks to, or null),
// z.lureUntil, z.frozenUntil.
// Console: zm_arsenal (sv_cheats 1: every arsenal weapon, full ammo; taints the records).
import * as THREE from 'three';
import * as CR from './combatrules.js';
import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { angleVectors } from '../engine/coords.js';
import { createWorldWeapon } from '../assets/worldweapons.js';
import { WEAPON_DEFS } from './weaponsys.js';
import { MinHeap } from './nav.js';
import { inSquad } from './runstats.js';
import { IN_JUMP } from '../engine/pmove.js';

export const BLADES = new Set(['machete', 'fireaxe', 'katana']);
export const ARSENAL_IDS = ['machete', 'fireaxe', 'katana', 'crossbow', 'pipebomb', 'cryogrenade'];

const FALLBACK_REACH = 18; // u past the swing's range a body in front still counts (the CS knife's cone)
const LURE_R = 950, LURE_PATH = 1500, LURE_SCAN = 0.25, LURE_ARM = 0.7; // straight / walking reach; s between scans; s after the throw it starts beeping
const BOLT_GRAVITY = 260, BOLT_LIFE = 2.5, STUCK_LIFE = 30, STUCK_MAX = 24, BOLT_REACH = 40;
const SWARM_R = 330, SWARM_N = 5, BOT_PIPE_GAP = 9; // bots: this many zombies this close; s between their throws
const BOT_PIPE_KEEP = 1500; // $ a bot keeps back after buying a pipe bomb
const DEMO_SWARM_R = 460, DEMO_SWARM_N = 3, DEMO_RESCUE = 900; // the squad's Demo (zsquad.js): a looser trigger, and a downed teammate's pack
const SHARD_MAX = 140;
const SHATTER_MELEE = new Set(['knife', 'machete', 'fireaxe', 'katana', 'chainsaw', 'shove']); // (a frozen zombie these kill breaks apart; a blast does too, a bullet never)
const PIECES = ['head', 'chest', 'belly', 'uarm_r', 'farm_r', 'uarm_l', 'farm_l', 'thigh_r', 'shin_r', 'thigh_l', 'shin_l']; // (gore.js body pieces)
const rnd = (a, b) => a + Math.random() * (b - a);
const _f = [0, 0, 0], _r = [0, 0, 0], _u = [0, 0, 0], _eye = [0, 0, 0], _end = [0, 0, 0], _feet = [0, 0, 0];
const _tr = new TraceResult();
const ZERO3 = [0, 0, 0];

export class ZArsenal {
  constructor(game) {
    this.game = game;
    this.swings = []; // blades in the air: { p, w, s, at }
    this.bolts = []; // in flight: { owner, w, pos, vel, dmg, pierced, ignore, t0, obj, shot }
    this.stuck = []; // bolts in the world: { obj, pos, t }
    this.nades = []; // pipe bombs and cryo grenades: CR grenade + { kind, owner, obj, led, armAt, boomAt, ... }
    this.frozen = []; // zombies frozen solid
    this.shards = []; // ice shards in the air / melting
    this.hits = []; // (scratch: a swing's bodies)
    this.heap = new MinHeap();
    this.subscribed = false;
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('kill', (e) => this.onKill(e));
    ev.on('respawn', (e) => this.rearm(e.player));
  }

  /** A new run: nothing in the air, nothing frozen, no stashed blades. */
  reset() {
    for (const b of this.bolts) b.obj?.removeFromParent();
    for (const b of this.stuck) b.obj?.removeFromParent();
    for (const n of this.nades) this.dropNade(n);
    for (const s of this.shards) s.mesh.removeFromParent();
    for (const z of this.frozen) this.thaw(z);
    this.swings.length = 0; this.bolts.length = 0; this.stuck.length = 0; this.nades.length = 0; this.frozen.length = 0; this.shards.length = 0;
    for (const p of this.game.players || []) p.zmBlade = null;
    this.nextScan = 0; this.nextShop = 0; this.nextPick = 0;
    // tallies (tests, tuning)
    this.counts = { swings: 0, hits: 0, bolts: 0, boltHits: 0, pierced: 0, retrieved: 0, pipes: 0, lured: 0, cryos: 0, frozen: 0, shattered: 0, cracked: 0, botPipes: 0, botBuys: 0 };
  }

  // ---------------------------------------------------------------- blades
  /** weaponsys meleePrimary (ctx.melee): swing s of blade w just started; it lands s.delay s from now. */
  swing(p, w, s) {
    this.swings.push({ p, w, s, at: this.game.time + s.delay });
    this.counts.swings++;
  }

  /** The blade lands: trace the arc, cut the nearest bodies (up to def.targets). */
  land(p, w, s) {
    const g = this.game, Z = this.Z, d = w.def;
    if (!p.alive || p.downed || p.active !== w) return;
    const eye = p.eyePos(_eye), ang = p.pm.angles, pu = p.pm.punch;
    const pitch = ang[0] + pu[0], yaw = ang[1] + pu[1], range = d.swingRange;
    const hits = this.hits;
    hits.length = 0;
    let wall = null;
    const n = s.rays || 1;
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      // a slash sweeps across; a chop comes down through the line of sight
      angleVectors(pitch + (s.vertical ? k * s.arc : 0), yaw + (s.vertical ? 0 : k * s.arc), _f, null, null);
      _end[0] = eye[0] + _f[0] * range; _end[1] = eye[1] + _f[1] * range; _end[2] = eye[2] + _f[2] * range;
      const r = g.traceShot(eye, _end, p, p);
      if (r.entity) {
        const q = r.entity;
        if (q.team === p.team && !g.rounds.friendlyFire) continue;
        const dist = r.fraction * range, old = hits.find((h) => h.q === q);
        if (!old) hits.push({ q, hg: r.hitgroup, point: r.endpos.slice(), dist, dir: _f.slice() });
        else if (r.hitgroup === CR.HITGROUP.HEAD && old.hg !== CR.HITGROUP.HEAD) { old.hg = r.hitgroup; old.point = r.endpos.slice(); old.dir = _f.slice(); } // (the ray that found the head counts)
      } else if (r.fraction < 1 && (!wall || r.fraction < wall.fraction)) wall = { fraction: r.fraction, point: r.endpos.slice(), normal: r.normal.slice(), surface: r.surface, dir: _f.slice() };
    }
    // forgiving reach: a zombie right in front the rays slipped past (between them, or a crawler low down)
    if (hits.length < d.targets) {
      angleVectors(0, yaw, _f, null, null);
      const cosA = Math.cos(((s.vertical ? 12 : s.arc) + 14) * Math.PI / 180);
      for (const q of g.players) {
        if (!q.alive || !q.isZombie || hits.some((h) => h.q === q)) continue;
        const o = q.pm.origin, dx = o[0] - eye[0], dy = o[1] - eye[1], dz = o[2] - eye[2];
        const dxy = Math.hypot(dx, dy), reach = range + FALLBACK_REACH + (q.boss ? 30 * q.boss.scale : 0);
        if (dxy > reach || dz > 40 || dz < -80 || (dx * _f[0] + dy * _f[1]) < cosA * dxy) continue;
        const chest = [o[0], o[1], o[2] + 10];
        if (!g.visible(eye, chest)) continue;
        const l = Math.hypot(dx, dy, dz + 10) || 1;
        hits.push({ q, hg: CR.HITGROUP.CHEST, point: [o[0] - dx / dxy * 10, o[1] - dy / dxy * 10, o[2] + 10], dist: dxy, dir: [dx / l, dy / l, (dz + 10) / l] });
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    if (hits.length > d.targets) hits.length = d.targets;
    const local = p === g.viewTarget;
    if (hits.length) {
      const dmg = s.damage * (w.mods?.damage ?? 1);
      let killed = 0;
      for (const h of hits) {
        const q = h.q;
        g.damagePlayer(q, p, dmg, h.hg, w.id, h.dir, h.point);
        this.counts.hits++;
        if (!q.alive) killed++;
        else if (s.stagger && q.isZombie && !q.isBoss) Z.stagger(q, s.stagger, h.dir, w.id, p); // (the fire axe: a chop drives it back)
      }
      g.weaponSound(p, d.sounds.hit, { channel: 'item', volume: 1, loud: false });
      // the blade bites: a kick in the view, a jolt for the big ones
      if (local) {
        pu[0] += s.vertical ? 2.4 : 0.9;
        pu[1] += s.vertical ? 0 : (w.swing % 2 ? -1.2 : 1.2);
        if (s.vertical) g.addShake(2.5, 0.25);
        if (killed && s.vertical) Z.feedback.stop?.(0.045);
      }
      g.bots.onNoise(p, p.eyePos(), 500);
    } else if (wall) {
      // steel on stone: sparks, a nick
      g.weaponSound(p, 'blade_wall', { channel: 'item', volume: 0.9, loud: false });
      const nn = wall.normal;
      for (let i = 0; i < 4; i++) g.effects.sprite({ tex: 'spr_spark', pos: wall.point.slice(), vel: [nn[0] * 120 + rnd(-150, 150), nn[1] * 120 + rnd(-150, 150), nn[2] * 120 + rnd(0, 180)], size: 2.2, life: rnd(0.2, 0.35), additive: true, gravity: 0.6, color: [1, 0.85, 0.5] });
      g.effects.decal('decal_bullet', wall.point, nn, 3.5);
      if (local) pu[0] += 0.8;
    }
  }

  /** A fallen squad member keeps the blade he paid for: it's back in his hand when he respawns. */
  rearm(p) {
    const b = p?.zmBlade;
    if (!b || !p.alive || p.weapons[3] === b) return;
    if (p.weapons[3] && p.weapons[3].id !== 'knife') return;
    const was = p.active === p.weapons[3];
    p.weapons[3] = b;
    b.swing = 0; b.retired = false;
    if (was) this.game.selectWeapon(p, b, true);
  }

  // ---------------------------------------------------------------- the crossbow
  /** weaponsys crossbowPrimary (ctx.bolt): loose a bolt from p's eye along the view (+ spread). */
  fireBolt(p, w, spread = 0) {
    const g = this.game, d = w.def;
    const ang = p.pm.angles, pu = p.pm.punch;
    angleVectors(ang[0] + pu[0], ang[1] + pu[1], _f, _r, _u);
    const a = Math.random() * Math.PI * 2, m = Math.random() * spread;
    const ca = Math.cos(a) * m, sa = Math.sin(a) * m;
    const dir = [_f[0] + _r[0] * ca + _u[0] * sa, _f[1] + _r[1] * ca + _u[1] * sa, _f[2] + _r[2] * ca + _u[2] * sa];
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const sp = d.boltSpeed;
    const shot = ++g.shotSeq;
    if (this.Z.enabled) this.Z.events.shot(p, w.id, shot, 1);
    const b = { owner: p, w, pos: p.eyePos(), vel: [dir[0] / l * sp, dir[1] / l * sp, dir[2] / l * sp], dmg: d.damage * (w.mods?.damage ?? 1), pierced: 0, ignore: p, t0: g.time, obj: null, shot };
    try { b.obj = createWorldWeapon('crossbow_bolt'); b.obj.rotation.order = 'ZYX'; g.renderer.world.add(b.obj); } catch { b.obj = null; }
    this.orient(b.obj, b.pos, b.vel);
    this.bolts.push(b);
    this.counts.bolts++;
    return b;
  }

  orient(obj, pos, v) {
    if (!obj) return;
    obj.position.set(pos[0], pos[1], pos[2]);
    obj.rotation.set(0, Math.atan2(-v[2], Math.hypot(v[0], v[1])), Math.atan2(v[1], v[0])); // nose (+X) along the flight
  }

  /** One tick of a bolt's flight. True: it's done (stopped in a body, stuck, or spent). */
  flyBolt(b, dt) {
    const g = this.game, v = b.vel;
    v[2] -= BOLT_GRAVITY * dt;
    _end[0] = b.pos[0] + v[0] * dt; _end[1] = b.pos[1] + v[1] * dt; _end[2] = b.pos[2] + v[2] * dt;
    const r = g.traceShot(b.pos, _end, b.ignore, b.owner);
    const sp = Math.hypot(v[0], v[1], v[2]) || 1;
    const dir = [v[0] / sp, v[1] / sp, v[2] / sp];
    if (r.entity) {
      const q = r.entity;
      g.damagePlayer(q, b.owner, b.dmg, r.hitgroup, 'crossbow', dir, r.endpos, { exit: true, shot: b.shot });
      g.sound.play('bolt_flesh', { pos: r.endpos, volume: 1 });
      this.counts.boltHits++;
      b.pierced++;
      if (q.isBoss || b.pierced >= 2) { b.obj?.removeFromParent(); return true; } // (in it to the fletching)
      // through the first one: on to whoever stands behind it
      this.counts.pierced++;
      b.dmg *= b.w.def.pierceDamage;
      b.ignore = q;
      b.pos = [r.endpos[0] + dir[0] * 2, r.endpos[1] + dir[1] * 2, r.endpos[2] + dir[2] * 2];
      this.orient(b.obj, b.pos, v);
      return false;
    }
    if (r.fraction < 1) {
      // into the wall, a hand's length deep: it stays there to be picked up
      const p = [r.endpos[0] - dir[0] * 6, r.endpos[1] - dir[1] * 6, r.endpos[2] - dir[2] * 6];
      this.orient(b.obj, p, v);
      g.sound.play('bolt_hit', { pos: r.endpos, volume: 0.9 });
      const n = r.normal;
      g.effects.sprite({ tex: 'spr_dust', pos: [r.endpos[0] + n[0] * 2, r.endpos[1] + n[1] * 2, r.endpos[2] + n[2] * 2], vel: [n[0] * 40, n[1] * 40, n[2] * 40 + 20], size: 7, grow: 16, life: 0.5, color: [0.85, 0.75, 0.6], alpha: 0.6, drag: 2 });
      if (r.brushEnt) g.mapEnts.damage(r.brushEnt, b.dmg * 0.3, r.endpos, dir);
      if (b.obj) {
        if (this.stuck.length >= STUCK_MAX) this.stuck.shift().obj?.removeFromParent();
        this.stuck.push({ obj: b.obj, pos: [r.endpos[0] - n[0] * 4, r.endpos[1] - n[1] * 4, r.endpos[2]], t: g.time });
      }
      return true;
    }
    b.pos[0] = _end[0]; b.pos[1] = _end[1]; b.pos[2] = _end[2];
    this.orient(b.obj, b.pos, v);
    if (g.time - b.t0 > BOLT_LIFE) { b.obj?.removeFromParent(); return true; }
    return false;
  }

  /** Bolts in the world go back in the quiver of whoever walks over them (with a crossbow, room for it). */
  pickBolts(t) {
    const g = this.game;
    for (let i = 0; i < this.stuck.length; i++) {
      const s = this.stuck[i];
      let gone = t - s.t > STUCK_LIFE;
      if (!gone) {
        for (const p of g.players) {
          const w = p.weapons?.[1];
          if (!p.alive || p.isZombie || p.downed || !w || w.id !== 'crossbow' || w.ammo >= w.def.maxAmmo) continue;
          const o = p.pm.origin;
          if (Math.abs(o[0] - s.pos[0]) > BOLT_REACH || Math.abs(o[1] - s.pos[1]) > BOLT_REACH || s.pos[2] - o[2] > 70 || o[2] - s.pos[2] > 60) continue;
          w.ammo++;
          this.counts.retrieved++;
          if (p === g.viewTarget) g.sound.play('ammo_pickup', { volume: 0.6 });
          gone = true;
          break;
        }
      }
      if (gone) { s.obj?.removeFromParent(); this.stuck.splice(i--, 1); }
    }
  }

  // ---------------------------------------------------------------- throwables
  /** grenades.throw: a pipe bomb or cryo grenade leaves p's hand at src with velocity v. */
  throw(p, type, src, v) {
    const g = this.game, t = g.time, d = WEAPON_DEFS[type];
    const n = CR.createGrenade(type, src, v, t, p);
    n.random = Math.random;
    n.kind = type;
    n.owner = p;
    n.spin = Math.random() * 6;
    if (type === 'pipebomb') {
      n.dmgtime = Infinity; // (we set it off ourselves)
      n.armAt = t + LURE_ARM;
      n.boomAt = 0;
      n.nextBeep = 0;
      this.counts.pipes++;
    } else {
      n.dmgtime = t + d.fuse;
      this.counts.cryos++;
    }
    try { n.obj = createWorldWeapon(type); g.renderer.world.add(n.obj); } catch { n.obj = null; }
    if (n.obj) {
      // the pipe bomb's LED, the cryo canister's glow window
      n.led = new THREE.Mesh(this.ledGeo || (this.ledGeo = new THREE.SphereGeometry(0.55, 6, 4)), new THREE.MeshBasicMaterial({ color: type === 'pipebomb' ? 0x400808 : 0x2a6aa0 }));
      n.led.userData.keepMaterial = true;
      if (type === 'pipebomb') n.led.position.set(0.6, 0, 1.75); else n.led.position.set(0, -0.85, -0.4); // (on the timer / the canister's window)
      n.obj.add(n.led);
    }
    if (type === 'pipebomb') g.sound.play('pipebomb_arm', { pos: src, volume: 0.8 });
    this.nades.push(n);
    return n;
  }

  dropNade(n) {
    n.obj?.removeFromParent();
    n.led?.material.dispose();
    n.obj = null; n.led = null;
    if (n.kind === 'pipebomb') for (const z of this.Z?.pool || []) if (z.lure === n) z.lure = null;
  }

  stepNade(n, t, dt) {
    const g = this.game;
    const res = CR.updateGrenade(n, t, dt, (a, b) => g.grenades.trace(a, b), (gr, speed) => g.sound.play('grenade_bounce', { pos: gr.origin, volume: Math.min(1, 0.25 + speed / 400) }));
    if (n.obj) {
      n.obj.position.set(n.origin[0], n.origin[1], n.origin[2] + (n.kind === 'pipebomb' ? 1.2 : 0));
      const moving = Math.hypot(n.velocity[0], n.velocity[1], n.velocity[2]) > 1;
      if (moving) n.spin += dt * 10;
      if (n.kind === 'pipebomb') n.obj.rotation.set(n.onGround ? 0 : n.spin * 0.7, 0, n.spin);
      else n.obj.rotation.set(0, n.onGround ? Math.PI / 2 : n.spin, n.spin * 0.5);
    }
    if (n.kind === 'cryogrenade') {
      if (res === 'explode') { this.cryoBurst(n); return true; }
      return n.removed;
    }
    // the pipe bomb: armed once it lands (or a moment after the throw), beeping faster and faster
    if (!n.boomAt && (n.onGround || t >= n.armAt + 0.5) && t >= n.armAt) this.armPipe(n, t);
    if (!n.boomAt) return false;
    if (t >= n.nextBeep) {
      const left = Math.max(0, n.boomAt - t), L = WEAPON_DEFS.pipebomb.lure;
      n.nextBeep = t + 0.08 + 0.5 * Math.pow(left / L, 1.3);
      n.flash = t;
      g.sound.play('pipebomb_beep', { pos: n.origin, volume: 0.9, pitch: 1 + 0.25 * (1 - left / L) });
      g.effects.sprite({ tex: 'spr_flare', pos: [n.origin[0], n.origin[1], n.origin[2] + 4], size: 18, life: 0.12, additive: true, color: [1, 0.15, 0.1] });
    }
    if (t >= n.nextScan) { n.nextScan = t + LURE_SCAN; this.lure(n); }
    if (t >= n.boomAt) { this.pipeBoom(n); return true; }
    return false;
  }

  /** The pipe bomb starts beeping where it lies: the walking distances to it, for the lured. */
  armPipe(n, t) {
    const g = this.game, Z = this.Z, nav = g.nav;
    n.boomAt = t + WEAPON_DEFS.pipebomb.lure;
    n.nextBeep = t;
    n.nextScan = t;
    n.pos = n.origin.slice();
    n.field = null;
    const nodes = nav?.nodes;
    if (!nodes?.length || !Z.rev) return;
    const start = nav.nearest(n.pos, 160) || nav.nearestXY(n.pos, 260, 120);
    if (!start) return;
    // up on a crate or a ledge: they crowd round the foot of it
    if (n.pos[2] - start.z > 20 || !nav.canWalk([start.x, start.y, start.z], [n.pos[0], n.pos[1], start.z])) { n.pos[0] = start.x; n.pos[1] = start.y; n.pos[2] = start.z; }
    else n.pos[2] = Math.min(n.pos[2], start.z + 4);
    // Dijkstra out from the bomb over the horde's reversed edges, as far as LURE_PATH
    const field = new Float32Array(nodes.length).fill(Infinity), heap = this.heap;
    heap.ids.length = 0; heap.ks.length = 0;
    field[start.id] = 0;
    heap.push(start.id, 0);
    while (heap.size) {
      const k = heap.ks[0], id = heap.pop();
      if (k > field[id] + 0.01 || k > LURE_PATH) continue;
      for (const r of Z.rev[id]) {
        const nd = k + r.cost;
        if (nd < field[r.from]) { field[r.from] = nd; heap.push(r.from, nd); }
      }
    }
    n.field = field;
  }

  /** Every common zombie in reach that can walk to the bomb comes for it. */
  lure(n) {
    const g = this.game, nav = g.nav, o = n.pos;
    for (const z of this.Z.pool) {
      if (!z.alive || z.special || z.isBoss || z.lure === n) continue;
      const zo = z.pm.origin, dx = zo[0] - o[0], dy = zo[1] - o[1], dz = zo[2] - o[2];
      if (dx * dx + dy * dy + dz * dz > LURE_R * LURE_R) continue;
      if (n.field) {
        const nd = nav.nearest(z.feet(_feet), 120) || nav.nearestXY(_feet, 200, 80);
        if (!nd || !(n.field[nd.id] < LURE_PATH)) continue;
      } else if (!g.visible(z.eyePos(), [o[0], o[1], o[2] + 8])) continue;
      z.lure = n;
      z.lureUntil = n.boomAt;
      z.goal = null; z.windup = 0;
      this.counts.lured++;
    }
  }

  /**
   * ZombieMode.think, for a zombie a pipe bomb has drawn: walk to it (down the bomb's own
   * walking distances, straight in once it's in sight) and crowd round it pawing at the thing.
   * True: nothing else this tick.
   */
  lured(z, cmd, t) {
    const L = z.lure;
    if (!L || !L.boomAt || t >= z.lureUntil) { z.lure = null; return false; }
    const g = this.game, nav = g.nav;
    const feet = z.feet(z._feet || (z._feet = [0, 0, 0])), o = L.pos;
    // a ring round it, each its own spot
    const a = (z.id * 2.39996) % (Math.PI * 2), ring = 22 + (z.id % 3) * 9;
    const gx = o[0] + Math.cos(a) * ring, gy = o[1] + Math.sin(a) * ring;
    const bx = o[0] - feet[0], by = o[1] - feet[1], close = Math.hypot(bx, by) < ring + 14;
    // getting nowhere (a ledge, a crate): down the bomb's walking distances instead; nowhere for long: it gives up
    const pp = z.lureProg || (z.lureProg = [0, 0, 0, 0, 0]); // x, y, last progress, route until, stuck count
    if (z.lureFor !== L) { z.lureFor = L; pp[0] = feet[0]; pp[1] = feet[1]; pp[2] = t; pp[3] = 0; pp[4] = 0; }
    else if (Math.hypot(feet[0] - pp[0], feet[1] - pp[1]) > 20) { pp[0] = feet[0]; pp[1] = feet[1]; pp[2] = t; }
    else if (!close && t - pp[2] > 0.6) {
      pp[2] = t; pp[3] = t + 1.5;
      if (++pp[4] >= 4) { z.lure = null; z.goal = null; return false; }
      if (z.pm.onground) cmd.buttons |= IN_JUMP;
    }
    const goal = z.lureGoal || (z.lureGoal = [0, 0, 0]);
    const ringPt = this._ring || (this._ring = [0, 0, 0]);
    ringPt[0] = gx; ringPt[1] = gy; ringPt[2] = o[2];
    const direct = Math.hypot(gx - feet[0], gy - feet[1]) < 360 && Math.abs(o[2] - feet[2]) < 48 && nav.canWalk(feet, ringPt);
    let jump = false;
    if (direct || !L.field) { goal[0] = gx; goal[1] = gy; goal[2] = o[2]; }
    else {
      // down the bomb's walking distances, as the horde walks its own field (zombies.js flowGoal):
      // the farthest of a few hops ahead it can walk straight to; hop by hop while it's been stuck
      if (!z.node || t >= z.nodeT || Math.hypot(z.node.x - feet[0], z.node.y - feet[1]) > 40) { z.node = nav.nearest(feet, 120) || nav.nearestXY(feet, 200, 80); z.nodeT = t + 0.25; }
      let first = null, best = null, nd = z.node;
      for (let i = 0; nd && i < 6; i++) {
        const h = this.Z.nextHop(nd, L.field);
        if (!h) break;
        nd = h.node;
        if (!first) { first = nd; if (h.edge.kind === 'jump') { jump = true; break; } }
        else if (t >= pp[3] && nav.canWalk(feet, [nd.x, nd.y, nd.z])) best = nd;
        if (h.edge.kind === 'jump') break;
      }
      const hop = best || first;
      if (hop) { goal[0] = hop.x; goal[1] = hop.y; goal[2] = hop.z; } else { goal[0] = gx; goal[1] = gy; goal[2] = o[2]; }
    }
    const yaw = Math.atan2(close ? by : goal[1] - feet[1], close ? bx : goal[0] - feet[0]) * 180 / Math.PI;
    const turn = ((yaw - z.pm.angles[1]) % 360 + 540) % 360 - 180, max = 10 * (z.lodK || 1);
    z.pm.angles[1] += Math.max(-max, Math.min(max, turn));
    z.pm.angles[0] = close ? 25 : 0;
    cmd.forwardmove = close ? 0 : Math.abs(turn) > 100 ? 60 : 400;
    if (jump && goal[2] - feet[2] > 12 && z.pm.onground) cmd.buttons |= IN_JUMP;
    if (!close) this.Z.separate(z, cmd);
    else if (t >= (z.nextAttack || 0)) { z.nextAttack = t + rnd(0.7, 1.2); z.lastShot = t; } // (pawing at it)
    z.windup = 0;
    return true;
  }
  pipeBoom(n) {
    const g = this.game, d = WEAPON_DEFS.pipebomb, o = n.origin;
    const pos = [o[0], o[1], o[2] + 6];
    this.dropNade(n);
    g.explode(pos, { owner: n.owner, damage: d.damage, radius: d.radius, weapon: 'pipebomb', selfScale: 0.5, push: 1.3, sound: 'pipebomb_explode', scale: 1.4, shake: 11 });
    // nails and casing: a spray of sparks
    for (let i = 0; i < 18; i++) g.fire.emit('spark', pos, [rnd(-900, 900), rnd(-900, 900), rnd(-100, 600)], { life: rnd(0.25, 0.5), size: 1.8, size1: 0.8, drag: 1.5, buoy: -500 });
  }

  // ---------------------------------------------------------------- cryo
  cryoBurst(n) {
    const g = this.game, Z = this.Z, d = WEAPON_DEFS.cryogrenade, t = g.time;
    const o = n.origin, pos = [o[0], o[1], o[2] + 8], up = [o[0], o[1], o[2] + 28]; // (the cloud billows up: a kerb doesn't shelter you)
    this.dropNade(n);
    g.sound.play('cryo_burst', { pos, volume: 1 });
    g.effects.sprite({ tex: 'spr_flare', pos: pos.slice(), size: 160, life: 0.22, additive: true, color: [0.55, 0.8, 1] });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, s = rnd(180, 420);
      g.fire.emit('cryo', [pos[0] + rnd(-12, 12), pos[1] + rnd(-12, 12), pos[2] + rnd(-4, 16)], [Math.cos(a) * s, Math.sin(a) * s, rnd(10, 140)], { life: rnd(1.2, 2.0), size: rnd(26, 40), size1: rnd(80, 120), drag: 2.6, buoy: 12 });
    }
    for (let i = 0; i < 34; i++) g.fire.emit('glint', pos, [rnd(-420, 420), rnd(-420, 420), rnd(60, 420)], { life: rnd(0.5, 0.9), size: rnd(1.6, 2.8), size1: 0.6, drag: 1.4, buoy: -380 });
    g.shakeAt(pos, 4);
    g.bots.onNoise(n.owner, pos, 1200);
    let froze = 0;
    for (const q of g.players) {
      if (!q.alive || !q.isZombie) continue;
      const qo = q.pm.origin, c = [qo[0], qo[1], qo[2] + 10];
      const dist = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
      if (dist > d.radius + (q.boss ? 30 * q.boss.scale : 0)) continue;
      if (!g.visible(up, c) && !g.visible(up, [c[0], c[1], c[2] + 30])) continue;
      if (q.isBoss) { this.chill(q, t, 1.2); continue; } // (bosses: a frost that doesn't hold them)
      if (q.special && !Z.staggers.trickable(q, t)) { this.chill(q, t, 0.8); continue; } // (mid-trick: it shrugs the cold off)
      this.freeze(q, d.freeze, n.owner);
      froze++;
    }
    if (froze) g.sound.play('freeze', { pos, volume: Math.min(1, 0.6 + froze * 0.1) });
  }

  /** Freeze zombie z solid for secs: it stands stock still, frosted (the stagger hold and a frozen pose). */
  freeze(z, secs, by = null) {
    const t = this.game.time;
    if (!(z.frozenUntil > t)) {
      if (!this.frozen.includes(z)) this.frozen.push(z);
      z.frzRag = !!z.noRagdoll;
      z.noRagdoll = true; // (one that dies frozen shatters instead: onKill)
      z.frozenAt = t;
      this.counts.frozen++;
    }
    z.frozenUntil = Math.max(z.frozenUntil || 0, t + secs);
    z.chillUntil = 0;
    z.frozenBy = by;
    z.staggerUntil = Math.max(z.staggerUntil || 0, z.frozenUntil);
    z.staggerKind = 'frozen';
    z.staggerFree = Math.max(z.staggerFree || 0, z.frozenUntil + 0.3);
    z.windup = 0;
    z.nextAttack = Math.max(z.nextAttack || 0, z.frozenUntil + 0.25);
    z.panicUntil = 0;
    if (z.burn) z.burn.until = t; // (the cold puts the fire out)
    z.pm.velocity[0] = 0; z.pm.velocity[1] = 0;
    if (z.model) z.model.swipeT = -1;
  }

  /** A frost that doesn't hold (a boss, a special mid-trick): only the look of it. */
  chill(z, t, secs) {
    if (z.frozenUntil > t) return;
    if (!this.frozen.includes(z)) this.frozen.push(z);
    z.chillUntil = t + secs;
    z.frozenAt = t;
  }

  /** Thawed (or gone): the look and the ragdoll back. */
  thaw(z) {
    if (z.frozenUntil) { z.noRagdoll = z.frzRag; z.frozenUntil = 0; }
    z.chillUntil = 0;
    z.model?.setFrost?.(0);
    if (z.staggerKind === 'frozen' && z.staggerUntil > this.game.time) z.staggerUntil = this.game.time;
  }

  /**
   * The bus: a zombie killed while frozen (and alive till now) by a blast or a blade shatters;
   * one a bullet (or a flame, a bolt...) kills cracks - a burst of ice - and falls whole (bullets
   * never gib bodies).
   */
  onKill(e) {
    const z = e.victim, t = this.game.time;
    if (z.isZombie && z.frozenUntil > t) {
      const dir = z.lastHit?.dir || [1, 0, 0];
      this.thaw(z);
      if (z.gibbed) return;
      if (z.lastHit?.blast || SHATTER_MELEE.has(e.weapon)) this.shatter(z, dir);
      else this.crack(z, dir);
    } else if (z.frozenUntil || z.chillUntil) this.thaw(z);
  }

  /** A frozen zombie a bullet killed: the ice bursts off it (a few shards, a softer crack); the body stays whole. */
  crack(z, dir) {
    const g = this.game, o = z.pm.origin, c = [o[0], o[1], o[2] + 6];
    this.counts.cracked++;
    g.sound.play('ice_shatter', { pos: c, volume: 0.6 });
    for (let i = 0; i < 6; i++) g.fire.emit('cryo', [c[0] + rnd(-10, 10), c[1] + rnd(-10, 10), c[2] + rnd(-20, 30)], [rnd(-80, 80), rnd(-80, 80), rnd(0, 90)], { life: rnd(0.6, 1), size: rnd(12, 18), size1: rnd(30, 44), drag: 3, buoy: 20 });
    for (let i = 0; i < 14; i++) g.fire.emit('glint', [c[0], c[1], c[2] + rnd(-20, 30)], [rnd(-260, 260), rnd(-260, 260), rnd(40, 300)], { life: rnd(0.35, 0.7), size: rnd(1.2, 2), size1: 0.5, drag: 1.2, buoy: -420 });
    for (let i = 0; i < 7; i++) this.shard([c[0] + rnd(-8, 8), c[1] + rnd(-8, 8), c[2] + rnd(-25, 30)], dir);
  }

  /** Blow a frozen zombie into ice: its body pieces (frosted, no blood) and shards that melt. */
  shatter(z, dir) {
    const g = this.game, gore = g.gore, o = z.pm.origin;
    this.counts.shattered++;
    const c = [o[0], o[1], o[2] + 6];
    g.sound.play('ice_shatter', { pos: c, volume: 1 });
    for (let i = 0; i < 12; i++) g.fire.emit('cryo', [c[0] + rnd(-10, 10), c[1] + rnd(-10, 10), c[2] + rnd(-20, 30)], [rnd(-120, 120), rnd(-120, 120), rnd(0, 120)], { life: rnd(0.7, 1.2), size: rnd(14, 22), size1: rnd(40, 60), drag: 3, buoy: 20 });
    for (let i = 0; i < 26; i++) g.fire.emit('glint', [c[0], c[1], c[2] + rnd(-20, 30)], [rnd(-380, 380), rnd(-380, 380), rnd(40, 380)], { life: rnd(0.4, 0.8), size: rnd(1.4, 2.4), size1: 0.5, drag: 1.2, buoy: -420 });
    for (let i = 0; i < 18; i++) this.shard([c[0] + rnd(-8, 8), c[1] + rnd(-8, 8), c[2] + rnd(-25, 30)], dir);
    if (!gore?.enabled || !z.model) return;
    // the body comes apart along gore's pieces, one at a time (no blood with `only`), frosted over
    z.model.object3D.position.set(o[0], o[1], o[2] + z.hull().mins[2]);
    z.model.object3D.rotation.set(0, 0, z.pm.angles[1] * Math.PI / 180);
    const snap = gore.snapshot(z.model);
    z.gibbed = true;
    z.model.object3D.visible = false;
    if (z.model.ragdoll) { z.model.ragdoll.detach(); z.model.ragdoll = null; }
    const from = [o[0] - dir[0] * 18, o[1] - dir[1] * 18, o[2] - 8], d = [dir[0], dir[1], Math.max(0.2, dir[2] || 0)];
    for (const piece of PIECES) {
      for (const gb of gore.burst(snap, z.model.skin, from, d, 0.8, piece)) {
        gb.bleedUntil = 0; gb.bounces = 4; // (ice: no trail, no splat)
        const col = gb.mesh.geometry.attributes.color, a = col.array;
        for (let k = 0; k < a.length; k += 3) {
          const l = (a[k] + a[k + 1] + a[k + 2]) / 3;
          a[k] = Math.min(1, l * 0.62 + 0.16); a[k + 1] = Math.min(1, l * 0.8 + 0.24); a[k + 2] = Math.min(1, l * 0.95 + 0.34);
        }
        col.needsUpdate = true;
      }
    }
  }

  shard(pos, dir) {
    const g = this.game;
    if (this.shards.length >= SHARD_MAX) { this.shards[0].mesh.removeFromParent(); this.shards.shift(); }
    this.shardGeo ??= new THREE.OctahedronGeometry(1, 0);
    this.shardMat ??= [0xd8f0ff, 0xb4dcff, 0x9ccaf0].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.88 }));
    const m = new THREE.Mesh(this.shardGeo, this.shardMat[(Math.random() * 3) | 0]);
    const s = rnd(0.7, 2.0);
    m.scale.set(s * rnd(0.5, 0.9), s * rnd(0.5, 0.9), s * rnd(1.4, 2.6));
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    g.renderer.world.add(m);
    const sp = rnd(140, 380);
    const a = Math.random() * Math.PI * 2;
    this.shards.push({ mesh: m, pos: pos.slice(), vel: [Math.cos(a) * sp * 0.7 + dir[0] * 160, Math.sin(a) * sp * 0.7 + dir[1] * 160, rnd(120, 360)], w: [rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)], age: 0, rest: false, s: m.scale.clone() });
  }

  stepShards(dt) {
    const c = this.game.collision;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.age += dt;
      if (!s.rest) {
        s.vel[2] -= 800 * dt;
        _end[0] = s.pos[0] + s.vel[0] * dt; _end[1] = s.pos[1] + s.vel[1] * dt; _end[2] = s.pos[2] + s.vel[2] * dt;
        c.trace(s.pos, _end, [0, 0, 0], [0, 0, 0], MASK_WORLD_PLAYER, _tr);
        if (_tr.fraction < 1) {
          s.pos[0] = _tr.endpos[0]; s.pos[1] = _tr.endpos[1]; s.pos[2] = _tr.endpos[2];
          const n = _tr.normal, vn = s.vel[0] * n[0] + s.vel[1] * n[1] + s.vel[2] * n[2];
          s.vel[0] = (s.vel[0] - 1.4 * vn * n[0]) * 0.35; s.vel[1] = (s.vel[1] - 1.4 * vn * n[1]) * 0.35; s.vel[2] = (s.vel[2] - 1.4 * vn * n[2]) * 0.35;
          s.w[0] *= 0.5; s.w[1] *= 0.5; s.w[2] *= 0.5;
          if (n[2] > 0.7 && Math.hypot(s.vel[0], s.vel[1], s.vel[2]) < 40) s.rest = true;
        } else { s.pos[0] = _end[0]; s.pos[1] = _end[1]; s.pos[2] = _end[2]; }
        s.mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
        s.mesh.rotation.x += s.w[0] * dt; s.mesh.rotation.y += s.w[1] * dt; s.mesh.rotation.z += s.w[2] * dt;
      }
      // they melt: shrink away from a second and a half on
      const k = Math.max(0, 1 - Math.max(0, s.age - 1.5) / 2);
      s.mesh.scale.set(s.s.x * k, s.s.y * k, s.s.z * k);
      if (k <= 0) { s.mesh.removeFromParent(); this.shards.splice(i--, 1); }
    }
  }

  // ---------------------------------------------------------------- bots
  /**
   * bots.js combat, zombie mode: a bot with a pipe bomb, swarmed at close quarters, throws it
   * out past the crowd so they turn round and follow it. True: the throw is under way.
   */
  bot(b, e, d) {
    const p = b.p, g = this.game, t = g.time;
    // (the squad's Demo, zsquad.js: throws sooner, from farther, and pulls a pack off a downed teammate)
    const demo = p.role === 'demo', R = demo ? DEMO_SWARM_R : SWARM_R;
    if (b.nade || p.downed || t < (p.zmPipeT || 0) || (d > R && !demo)) return false;
    p.zmPipeT = t + 0.5;
    const w = p.weapons[4].find((x) => x.id === 'pipebomb' && (x.count ?? 1) > 0);
    if (!w) return false;
    const o = p.pm.origin;
    let target = demo ? this.rescueSpot(p) : null;
    if (!target) {
      if (d > R) return false;
      let n = 0, cx = 0, cy = 0;
      for (const z of this.Z.pool) {
        if (!z.alive || z.isBoss || z.lure) continue;
        const dx = z.pm.origin[0] - o[0], dy = z.pm.origin[1] - o[1];
        if (dx * dx + dy * dy > R * R || Math.abs(z.pm.origin[2] - o[2]) > 80) continue;
        n++; cx += dx; cy += dy;
      }
      if (n < (demo ? DEMO_SWARM_N : SWARM_N)) return false;
      // out past the crowd, where it came from (on the nav)
      const l = Math.hypot(cx, cy) || 1, nav = g.nav;
      const at = [o[0] + cx / l * 430, o[1] + cy / l * 430, o[2] - 36];
      const node = nav.nearest(at, 220) || nav.nearestXY(at, 300, 120);
      target = node ? [node.x, node.y, node.z + 4] : at;
    }
    for (const q of this.nades) if (q.kind === 'pipebomb' && Math.hypot(q.origin[0] - target[0], q.origin[1] - target[1]) < 500) return false; // (one's beeping out there already)
    // a quick toss (no wind-up: the bot is in a fight), along the arc the bot planner finds
    const eye = p.eyePos(), sol = b.K?.throwSolution?.(eye, target, 'pipebomb');
    if (!sol || sol.err > 280) return false;
    const th = CR.grenadeThrow([sol.pitch, sol.yaw, 0], ZERO3, eye, p.pm.velocity);
    p.pm.angles[0] = sol.pitch; p.pm.angles[1] = sol.yaw;
    this.throw(p, 'pipebomb', th.origin, th.velocity);
    p.lastShot = t; // (the model's throw)
    w.count = (w.count ?? 1) - 1;
    if (w.count <= 0) {
      g.removeWeaponFromInventory(p, w);
      if (p.active === w) g.selectWeapon(p, p.weapons[1] || p.weapons[2] || p.weapons[3], true);
    }
    b.mgr?.radio?.(b, 'Fire in the hole!', { gap: 1 });
    p.zmPipeT = t + BOT_PIPE_GAP;
    this.counts.botPipes++;
    return true;
  }

  /**
   * The Demo: a downed teammate within DEMO_RESCUE u with DEMO_SWARM_N+ zombies on him - a spot
   * on the nav 420 u past him (away from the Demo, outside the blast), so the pack turns its back on him. Or null.
   */
  rescueSpot(p) {
    const o = p.pm.origin, nav = this.game.nav;
    for (const q of this.game.players) {
      if (q === p || !q.downed || !q.alive || !inSquad(q)) continue;
      const qo = q.pm.origin, dx = qo[0] - o[0], dy = qo[1] - o[1], l = Math.hypot(dx, dy);
      if (l > DEMO_RESCUE) continue;
      let n = 0;
      for (const z of this.Z.pool) if (z.alive && !z.isBoss && !z.lure && Math.hypot(z.pm.origin[0] - qo[0], z.pm.origin[1] - qo[1]) < 260) n++;
      if (n < DEMO_SWARM_N) continue;
      const k = 420 / (l || 1), at = [qo[0] + dx * k, qo[1] + dy * k, qo[2] - 36];
      const node = nav.nearest(at, 220) || nav.nearestXY(at, 300, 120);
      return node ? [node.x, node.y, node.z + 4] : at;
    }
    return null;
  }

  /** In a break, the squad's Demo (a bot with no role yet too) with money to spare carries a pipe bomb (one). */
  botShop() {
    const g = this.game, Z = this.Z;
    if (Z.state !== 'break' || Z.wave < 1) return;
    for (const p of g.players) {
      if (!p.isBot || !p.alive || p.downed || !inSquad(p) || p.weapons[4].some((x) => x.id === 'pipebomb')) continue;
      if (p.role && p.role !== 'demo') continue; // (M3 integration: the squad's Demo carries them - zsquad.js; a whole squad lobbing lures carried the run)
      const c = Z.economy.cost(p, 'pipebomb') ?? WEAPON_DEFS.pipebomb.price;
      if (p.money < c + BOT_PIPE_KEEP || !p.weapons[1]) continue; // (a gun first)
      if (g.rounds.buy(p, 'pipebomb')) this.counts.botBuys++;
    }
  }

  // ---------------------------------------------------------------- the hooks
  tick(t) {
    const g = this.game, dt = 0.01;
    // blades landing
    for (let i = 0; i < this.swings.length; i++) {
      const s = this.swings[i];
      if (t < s.at) continue;
      this.swings.splice(i--, 1);
      this.land(s.p, s.w, s.s);
    }
    for (let i = 0; i < this.bolts.length; i++) if (this.flyBolt(this.bolts[i], dt)) this.bolts.splice(i--, 1);
    if (this.stuck.length && t >= this.nextPick) { this.nextPick = t + 0.1; this.pickBolts(t); }
    for (let i = 0; i < this.nades.length; i++) if (this.stepNade(this.nades[i], t, dt)) { this.dropNade(this.nades[i]); this.nades.splice(i--, 1); }
    // the frozen thaw
    for (let i = 0; i < this.frozen.length; i++) {
      const z = this.frozen[i];
      if (z.alive && z.frozenUntil > t) { z.pm.velocity[0] = 0; z.pm.velocity[1] = 0; continue; } // (frozen to the spot: no sliding, no shoving it about)
      if (z.alive && z.chillUntil > t) continue;
      if (z.alive && z.frozenUntil && z.model) {
        const o = z.pm.origin;
        for (let k = 0; k < 4; k++) g.fire.emit('cryo', [o[0] + rnd(-10, 10), o[1] + rnd(-10, 10), o[2] + rnd(-20, 30)], [rnd(-30, 30), rnd(-30, 30), rnd(10, 50)], { life: 0.8, size: 12, size1: 30, drag: 2, buoy: 20 });
      }
      this.thaw(z);
      this.frozen.splice(i--, 1);
    }
    // the blades the squad carries (kept through a death: rearm)
    for (const p of g.players) if (p.weapons?.[3] && BLADES.has(p.weapons[3].id)) p.zmBlade = p.weapons[3];
    if (t >= this.nextShop) { this.nextShop = t + 1; this.botShop(); }
  }

  hud(s) { void s; }

  /** Per frame: the frost on the frozen, the pipe bomb's LED, the shards. */
  frame(dt) {
    const t = this.game.time;
    for (const z of this.frozen) {
      if (!z.model) continue;
      const until = Math.max(z.frozenUntil || 0, z.chillUntil || 0);
      const k = Math.min(1, (t - (z.frozenAt || t)) / 0.12) * Math.min(1, Math.max(0, until - t) / 0.45);
      z.model.setFrost?.(z.frozenUntil > t ? 0.35 + 0.65 * k : 0.6 * k);
      if (z.frozenUntil > t && Math.random() < dt * 4) {
        const o = z.pm.origin;
        this.game.fire.emit('glint', [o[0] + rnd(-10, 10), o[1] + rnd(-10, 10), o[2] + rnd(-30, 30)], [0, 0, rnd(-10, 10)], { life: 0.35, size: rnd(1.2, 2.2), size1: 0.4, drag: 2 });
      }
    }
    for (const n of this.nades) {
      if (!n.led) continue;
      if (n.kind === 'pipebomb') n.led.material.color.setHex(n.boomAt && t - (n.flash || -9) < 0.07 ? 0xff2a1a : 0x400808);
      else n.led.material.color.setRGB(0.25 + 0.2 * Math.sin(t * 9), 0.6 + 0.25 * Math.sin(t * 9), 1);
    }
    if (this.shards.length && dt > 0) this.stepShards(Math.min(dt, 0.05));
  }

  /** zm_arsenal (sv_cheats 1): every arsenal weapon, full ammo. */
  command(p, cmd, args) {
    void args;
    if (cmd !== 'zm_arsenal') return false;
    const g = this.game;
    if (!g.console?.cheats) { g.console?.print?.('zm_arsenal needs sv_cheats 1'); return true; }
    for (const id of ARSENAL_IDS) {
      const d = WEAPON_DEFS[id];
      if (d.slot === 4) { while ((p.weapons[4].find((x) => x.id === id)?.count ?? 0) < 2) if (!g.giveWeapon(p, id, { select: false })) break; } else if (d.slot !== 3 || id === 'katana') g.giveWeapon(p, id, { select: false, fullAmmo: true }); // (one blade: the katana)
    }
    this.Z.taint?.();
    g.console?.print?.('The arsenal: katana, crossbow, 2 pipe bombs, 2 cryo grenades (the machete and fire axe are in the buy menu: Equipment > Melee).');
    return true;
  }
}
