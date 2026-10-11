// Zombie survival bosses: one every 5 waves (5, 10, 15, 20, 25, then round again,
// stronger each time). Each has its own look (skins.js / body.js / extras.js) and
// powers, every power telegraphed so it can be dodged:
//  - THE BUTCHER: cleaver chops; roars and CHARGES in a straight line (dodge sideways);
//    hitting a wall stuns him and he takes extra damage. Enrages below 40%.
//  - THE SPITTER: keeps her distance and lobs volleys of acid that leave burning pools;
//    bursts a brood of fast crawlers at 75 / 50 / 25 %; dies in an acid explosion.
//  - THE BANSHEE: fast double claw; blinks around (often behind you); her SCREAM
//    hurts, slows and shakes everyone near and calls a pack of runners.
//  - THE INFERNO: immune to fire, burns what he touches, leaves burning footprints,
//    hurls fireballs and sets off a ring of fire; explodes when he dies.
//  - THE ABOMINATION: armoured (shoot the head, or the core when his chest opens);
//    GROUND SLAM shockwave (jump it); raises the dead around him.
import { Player, TEAM_T, TEAM_CT } from './player.js';
import { createPlayerModel } from '../assets/playermodels.js';
import { setDynamicBox, CONTENTS_ZOMBIE, TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import * as CR from './combatrules.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const _tr = new TraceResult();
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Bosses' health and every hit they deal, against the numbers below (tuned down 20%). */
export const BOSS_NERF = 0.8;

export const BOSSES = [
  { id: 'butcher', name: 'THE BUTCHER', title: 'He brought his cleaver. Dodge the charge.', skin: 'butcher', scale: 1.4, health: 3200, speed: 205, damage: 34, color: [230, 60, 40] },
  { id: 'spitter', name: 'THE SPITTER', title: 'Stay out of the acid.', skin: 'spitter', scale: 1.3, health: 2800, speed: 175, damage: 22, color: [140, 230, 40] },
  { id: 'banshee', name: 'THE BANSHEE', title: 'Watch your back. Hear her scream.', skin: 'banshee', scale: 1.2, stretch: 1.12, health: 2400, speed: 268, damage: 16, color: [180, 200, 255] },
  { id: 'inferno', name: 'THE INFERNO', title: 'Fire only makes him stronger.', skin: 'inferno', scale: 1.35, health: 3800, speed: 200, damage: 30, fireImmune: true, color: [255, 140, 30] },
  { id: 'abomination', name: 'THE ABOMINATION', title: 'Armoured. Aim for the head, or the core when it opens.', skin: 'abomination', scale: 1.65, health: 5600, speed: 185, damage: 42, color: [255, 50, 30] },
];

export class BossDirector {
  constructor(game) {
    this.game = game;
    this.boss = null;
    this.models = new Map(); // boss id -> PlayerModel (reused; the corpse is baked first)
  }

  get Z() { return this.game.zombies; }
  alive() { return !!(this.boss && this.boss.alive); }

  clear() {
    this.boss = null;
    this.pendingBoom = null;
    for (const m of this.models.values()) m.dispose(); // (guarded against double dispose)
    this.models.clear();
  }

  // ---------------------------------------------------------------- spawning
  /** Boss for wave n (n a multiple of 5). */
  spawn(n) {
    const g = this.game, Z = this.Z;
    const k = n / 5 - 1;
    const def = BOSSES[k % BOSSES.length];
    const cycle = Math.floor(k / BOSSES.length);
    const humans = Z.humans();
    const node = Z.pickSpawn();
    if (!node) return false;
    // the previous boss's body (if this one was used before) is made permanent first
    const old = this.boss;
    if (old && !old.alive) g.gore?.bakePlayer(old);
    if (old) g.removePlayer(old, true, true);
    const p = new Player({ name: def.name.replace('THE ', 'The ').replace(/\B[A-Z]+/g, (s) => s.toLowerCase()), team: TEAM_T, skin: def.skin, isBot: true });
    p.isZombie = true;
    p.isBoss = true;
    p.noRagdoll = true;
    g.addPlayer(p);
    p.box.contents = CONTENTS_ZOMBIE;
    let m = this.models.get(def.id);
    if (!m || m._disposed) { m = createPlayerModel(def.skin); this.models.set(def.id, m); }
    m.reset();
    m.setWeapon(null);
    m.object3D.scale.set(def.scale, def.scale, def.scale * (def.stretch || 1));
    m.object3D.visible = true;
    g.renderer.world.add(m.object3D);
    p.model = m;
    const crowd = Math.max(1, humans.length);
    const hp = Math.round(def.health * BOSS_NERF * (1 + 0.6 * cycle) * (1 + 0.35 * (crowd - 1)));
    const h = humans[0];
    const yaw = h ? Math.atan2(h.pm.origin[1] - node.y, h.pm.origin[0] - node.x) / DEG : 0;
    p.resetForSpawn([node.x, node.y, node.z + 37], yaw);
    p.health = p.maxHealth = hp;
    p.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
    p.active = null;
    p.zSpeed = def.speed * (1 + 0.08 * cycle);
    p.boss = {
      def, cycle, scale: def.scale, hpMax: hp, dmgK: 1 + 0.25 * cycle,
      state: 'intro', until: g.time + 1.6, cd: {}, status: '', enraged: false, exposedUntil: 0, stunUntil: 0,
      lastHurt: 0, recent: 0, brood: 0, trailT: 0, auraT: 0, novaDone: false,
    };
    // the zombie chase fields
    Object.assign(p, { target: null, targetT: 0, node: null, nodeT: 0, goal: null, goalT: 0, windup: 0, nextAttack: g.time + 2, progPos: p.pm.origin.slice(), progT: g.time, stuckSince: 0, nextGrowl: g.time + 3 });
    p.box.active = true;
    setDynamicBox(p.box, p.pm.origin, p.hull().mins, p.hull().maxs);
    this.boss = p;
    g.hud?.centerPrint?.(`${def.name}\n${def.title}`, 5);
    g.sound?.play('boss_intro', { volume: 1, attenuation: 'none' });
    g.sound?.play(def.id === 'banshee' ? 'banshee_scream' : 'boss_roar', { pos: p.eyePos(), volume: 1 });
    g.shakeAt?.(p.pm.origin, 6, 3000);
    g.announce?.(def.name);
    return true;
  }

  // ---------------------------------------------------------------- damage
  /** Damage taken by a boss, after its armour / weak spots / stun. Returns the new amount. */
  adjust(b, attacker, damage, hitgroup, weaponId, opts) {
    const B = b.boss, def = B.def, t = this.game.time;
    if (opts.fire && def.fireImmune) return 0;
    let k = 1;
    if (def.id === 'abomination') {
      if (opts.blast) k = 0.6;
      else if (hitgroup === CR.HITGROUP.HEAD) k = 1.25;
      else if ((hitgroup === CR.HITGROUP.CHEST || hitgroup === CR.HITGROUP.STOMACH) && t < B.exposedUntil) k = 2.2;
      else k = 0.35;
      if (opts.fire) k *= 0.5;
    }
    if (t < B.stunUntil) k *= 1.6;
    B.lastHurt = t;
    B.recent = (B.recent || 0) * Math.max(0, 1 - (t - (B.recentT || t))) + damage * k;
    B.recentT = t;
    return damage * k;
  }

  onKilled(b, attacker) {
    const g = this.game, B = b.boss, def = B.def;
    const o = b.pm.origin;
    g.sound?.play('boss_die', { pos: o, volume: 1, attenuation: 'none' });
    g.shakeAt?.(o, 8, 2500);
    g.effects.blood?.([o[0], o[1], o[2] + 30], [0, 0, 1], 150, { blast: true });
    const BF = g.effects.bloodFx;
    if (BF) for (let i = 0; i < 40; i++) BF.droplet([o[0] + rnd(-20, 20), o[1] + rnd(-20, 20), o[2] + rnd(0, 60)], [rnd(-400, 400), rnd(-400, 400), rnd(150, 600)], rnd(1.5, 3));
    BF?.puddle([o[0], o[1], o[2] - 36], { delay: 0.6, radius: 60 });
    if (def.id === 'spitter') {
      g.fire?.ignite(o, b, { kind: 'acid', radius: 170, duration: 8, dps: 25, weapon: 'acid', burn: 0 });
      for (const q of this.Z.humans()) if (dist2(q.pm.origin, o) < 200) g.fire?.hurt(q, b, 30, 'acid', 'acid');
    }
    if (def.id === 'inferno') {
      // he goes up a moment later
      B.boomAt = g.time + 1.4;
      this.pendingBoom = { pos: o.slice(), at: g.time + 1.4, owner: b };
    }
    const bonus = 5000;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || !p.alive) continue;
      g.rounds.addMoney(p, bonus);
      p.health = 100;
      p.armor = 100; p.helmet = true;
    }
    g.hud?.centerPrint?.(`${def.name} IS DEAD!\n+$${bonus}, full health and armour.`, 5);
    void attacker;
  }

  // ---------------------------------------------------------------- AI
  think() {
    const g = this.game, t = g.time;
    if (this.pendingBoom && t >= this.pendingBoom.at) {
      const pb = this.pendingBoom;
      this.pendingBoom = null;
      g.explode(pb.pos, { owner: pb.owner, damage: 90, radius: 330, weapon: 'fireball', sound: 'rocket_explode', scale: 1.8, shake: 12, noGore: false });
      g.fire?.ignite(pb.pos, pb.owner, { radius: 180, duration: 8, dps: 30, weapon: 'fireball' });
    }
    const b = this.boss;
    if (!b || !b.alive) return;
    const B = b.boss, def = B.def, Z = this.Z;
    const cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
    b.cmd = cmd;
    b.pm.speedCap = null;
    b.speedNow = null;
    const humans = Z.humans();
    const target = Z.pickTarget(b, humans, t);
    // glow pulse / enrage
    const pulse = 0.8 + 0.25 * Math.sin(t * (def.id === 'inferno' ? 7 : 3));
    const telegraph = /wind|charge_up|scream_up|slam_up|raise_up|nova_up|spit_up|fire_up/.test(B.state);
    b.model?.setGlow((telegraph ? 2.2 : 1) * pulse * (t < B.exposedUntil ? 1.8 : 1));
    if (!B.enraged && b.health < b.maxHealth * 0.4) {
      B.enraged = true;
      b.zSpeed *= 1.18;
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1 });
      g.hud?.centerPrint?.(`${def.name} IS ENRAGED!`, 2.5);
    }
    if (!target) return;
    if (t < B.stunUntil) { B.status = 'STUNNED'; this.face(b, target.pm.origin, 2); return; }
    B.status = t < B.exposedUntil ? 'CORE EXPOSED' : B.enraged ? 'ENRAGED' : '';
    if (B.state === 'intro') {
      this.face(b, target.pm.origin, 6);
      if (t >= B.until) B.state = 'chase';
      return;
    }
    switch (def.id) {
      case 'butcher': this.butcher(b, target, cmd, t); break;
      case 'spitter': this.spitter(b, target, cmd, t); break;
      case 'banshee': this.banshee(b, target, cmd, t); break;
      case 'inferno': this.inferno(b, target, cmd, t); break;
      case 'abomination': this.abomination(b, target, cmd, t); break;
      default: this.chaseAndHit(b, target, cmd, t);
    }
    if (t >= b.nextGrowl) {
      b.nextGrowl = t + rnd(4, 8);
      g.sound?.play(def.id === 'banshee' ? 'banshee_moan' : 'boss_growl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
    }
  }

  ready(B, name, t) { return t >= (B.cd[name] || 0); }
  cool(B, name, t, s) { B.cd[name] = t + s * (B.enraged ? 0.7 : 1); }

  face(b, pos, maxTurn = 9) {
    const o = b.pm.origin;
    const yaw = Math.atan2(pos[1] - o[1], pos[0] - o[0]) / DEG;
    const d = angDiff(yaw, b.pm.angles[1]);
    b.pm.angles[1] += Math.max(-maxTurn, Math.min(maxTurn, d));
    b.pm.angles[0] = 0;
    return Math.abs(d);
  }

  sees(b, target) {
    const g = this.game, e = b.eyePos();
    e[2] += (b.boss.scale - 1) * 50;
    return g.visible(e, target.eyePos()) || g.visible(e, target.pm.origin);
  }

  /** Walk at the target along the flow field and claw / chop when in reach. */
  chaseAndHit(b, target, cmd, t, o = {}) {
    const B = b.boss, Z = this.Z;
    Z.chase(b, target, cmd, t);
    const d = dist2(b.pm.origin, target.pm.origin), dz = Math.abs(target.pm.origin[2] - b.pm.origin[2]);
    const reach = 34 + 40 * B.scale;
    const onHead = d < 44 && target.pm.origin[2] - b.pm.origin[2] > 40 && dz < 72 * B.scale + 30;
    if ((d < reach + 12 && dz < 70) || onHead) {
      this.face(b, target.pm.origin, 12);
      if (d < reach - 10) cmd.forwardmove = 0;
      if (!b.windup && t >= b.nextAttack) {
        b.windup = t + (o.windup ?? 0.38);
        b.lastShot = t;
        this.game.sound?.play(o.attackSound || 'boss_attack', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      }
    }
    if (b.windup && t >= b.windup) {
      b.windup = 0;
      b.nextAttack = t + (o.cooldown ?? 1.1) * (B.enraged ? 0.75 : 1);
      if (((d < reach + 30 && dz < 80) || onHead) && this.sees(b, target)) {
        this.hit(b, target, (o.damage ?? B.def.damage) * B.dmgK, o.knock ?? 220, o.weapon || 'zombie');
        o.onHit?.(target);
        if (o.combo && !b.comboed) { b.comboed = true; b.windup = t + 0.22; b.lastShot = t; return; }
      } else this.game.sound?.play('knife_slash', { pos: b.eyePos(), volume: 0.8 });
      b.comboed = false;
    }
  }

  hit(b, q, dmg, knock, weapon) {
    const g = this.game;
    const o = b.pm.origin, to = q.pm.origin;
    const l = dist2(o, to);
    const y = b.pm.angles[1] * Math.PI / 180; // right on top of him: thrown off forwards
    const dir = l > 4 ? [(to[0] - o[0]) / l, (to[1] - o[1]) / l, 0.2] : [Math.cos(y), Math.sin(y), 0.2];
    g.damagePlayer(q, b, dmg, CR.HITGROUP.CHEST, weapon, dir, [to[0] - dir[0] * 14, to[1] - dir[1] * 14, to[2] + 12]);
    q.pm.velocity[0] += dir[0] * knock; q.pm.velocity[1] += dir[1] * knock; q.pm.velocity[2] += knock * 0.45;
    q.pm.velocityModifier = Math.max(q.pm.velocityModifier ?? 1, 0.7);
    g.shakeAt?.(to, 4, 600);
  }

  // ---- THE BUTCHER
  butcher(b, target, cmd, t) {
    const B = b.boss, g = this.game;
    const d = dist2(b.pm.origin, target.pm.origin);
    if (B.state === 'charge_wind') {
      this.face(b, target.pm.origin, 6);
      if (t >= B.until) {
        B.state = 'charging'; B.until = t + 1.7; B.chargeYaw = b.pm.angles[1]; B.chargeStart = t;
        b.progPos = b.pm.origin.slice(); b.progT = t;
        g.sound?.play('charge_go', { pos: b.eyePos(), volume: 1 });
      }
      return;
    }
    if (B.state === 'charging') {
      // a slight home-in, then straight on
      const want = Math.atan2(target.pm.origin[1] - b.pm.origin[1], target.pm.origin[0] - b.pm.origin[0]) / DEG;
      B.chargeYaw += Math.max(-0.35, Math.min(0.35, angDiff(want, B.chargeYaw)));
      b.pm.angles[1] = B.chargeYaw;
      b.pm.speedCap = 720;
      b.speedNow = 680;
      cmd.forwardmove = 1000;
      if (d < 46 * B.scale && Math.abs(target.pm.origin[2] - b.pm.origin[2]) < 70) {
        this.hit(b, target, 52 * B.dmgK, 650, 'zombie');
        g.sound?.play('charge_hit', { pos: target.pm.origin, volume: 1 });
        g.shakeAt?.(target.pm.origin, 12, 800);
        B.state = 'chase'; this.cool(B, 'charge', t, 8);
        return;
      }
      const sp = Math.hypot(b.pm.velocity[0], b.pm.velocity[1]);
      if (t - B.chargeStart > 0.35 && sp < 200) {
        // into a wall: stunned
        g.sound?.play('charge_wall', { pos: b.pm.origin, volume: 1 });
        g.shakeAt?.(b.pm.origin, 10, 1000);
        B.stunUntil = t + 2.4;
        B.state = 'chase'; this.cool(B, 'charge', t, 8);
        g.hud?.centerPrint?.('The Butcher is stunned - hit him now!', 2);
        return;
      }
      if (t >= B.until) { B.state = 'chase'; this.cool(B, 'charge', t, 8); }
      return;
    }
    if (this.ready(B, 'charge', t) && d > 260 && d < 1150 && b.pm.onground && this.sees(b, target)) {
      B.state = 'charge_wind'; B.until = t + 0.9;
      b.lastShot = t;
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (!B.cd.charge) B.cd.charge = t + 3;
    this.chaseAndHit(b, target, cmd, t, { knock: 280, attackSound: 'cleaver_swing' });
  }

  // ---- THE SPITTER
  spitter(b, target, cmd, t) {
    const B = b.boss, g = this.game, Z = this.Z;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    // brood bursts at 75 / 50 / 25 %
    const frac = b.health / b.maxHealth;
    const marks = [0.75, 0.5, 0.25];
    if (B.brood < marks.length && frac < marks[B.brood]) {
      B.brood++;
      g.sound?.play('spitter_burst', { pos: b.eyePos(), volume: 1 });
      g.fire?.ignite(o, b, { kind: 'acid', radius: 95, duration: 5, dps: 18, weapon: 'acid', burn: 0 });
      for (let i = 0; i < 3 + B.cycle; i++) Z.spawnZombie({ near: o, health: 70, speed: rnd(262, 285), crawler: true });
    }
    if (B.state === 'spit_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        const n = B.enraged ? 5 : 3;
        for (let i = 0; i < n; i++) this.lob(b, target, 'acid', 0.6, i === 0 ? 0 : rnd(40, 110), 22 * B.dmgK);
        g.sound?.play('spit', { pos: b.eyePos(), volume: 1 });
        this.cool(B, 'spit', t, 2.6);
      }
      return;
    }
    const sees = this.sees(b, target);
    if (sees && this.ready(B, 'spit', t) && d > 160 && d < 1100) {
      B.state = 'spit_up'; B.until = t + 0.55; b.lastShot = t;
      g.sound?.play('spitter_hurl', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (sees && d < 380) {
      // too close: back off (and claw if cornered)
      const away = Math.atan2(o[1] - target.pm.origin[1], o[0] - target.pm.origin[0]) / DEG;
      b.pm.angles[1] = away;
      cmd.forwardmove = 400;
      if (Math.hypot(b.pm.velocity[0], b.pm.velocity[1]) < 40 && d < 120) this.chaseAndHit(b, target, cmd, t);
      return;
    }
    if (sees && d < 750) { this.face(b, target.pm.origin, 8); Z.separate(b, cmd); cmd.sidemove = Math.sin(t * 1.3) * 200; return; }
    this.chaseAndHit(b, target, cmd, t);
  }

  /** A lobbed projectile at the target (led, with some spread). */
  lob(b, target, type, gravity, spread, damage) {
    const g = this.game;
    const e = b.eyePos();
    e[2] += (b.boss.scale - 1) * 45;
    const to = target.pm.origin;
    const d0 = Math.hypot(to[0] - e[0], to[1] - e[1]);
    const T = Math.max(0.55, Math.min(1.4, d0 / 650));
    const a = Math.random() * Math.PI * 2;
    const aim = [to[0] + target.pm.velocity[0] * T * 0.8 + Math.cos(a) * spread, to[1] + target.pm.velocity[1] * T * 0.8 + Math.sin(a) * spread, to[2] - 30];
    const G = gravity * 800;
    const vel = [(aim[0] - e[0]) / T, (aim[1] - e[1]) / T, (aim[2] - e[2] + 0.5 * G * T * T) / T];
    g.projectiles.launch(type, b, e, vel, { damage });
  }

  // ---- THE BANSHEE
  banshee(b, target, cmd, t) {
    const B = b.boss, g = this.game, Z = this.Z;
    const d = dist2(b.pm.origin, target.pm.origin);
    if (B.state === 'scream_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        this.scream(b);
        this.cool(B, 'scream', t, 12);
      }
      return;
    }
    const sees = this.sees(b, target);
    if (!sees) B.unseen = (B.unseen || 0) + 0.01; else B.unseen = 0;
    // blink: hurt badly, lost sight of you, or just because
    if (this.ready(B, 'blink', t) && (B.recent > 160 || B.unseen > 2.5 || (d > 500 && Math.random() < 0.004))) {
      if (this.blink(b, target)) { this.cool(B, 'blink', t, 5); B.recent = 0; return; }
    }
    if (this.ready(B, 'scream', t) && sees && d < 650) {
      B.state = 'scream_up'; B.until = t + 1.0; b.lastShot = t;
      g.sound?.play('banshee_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (!B.cd.scream) B.cd.scream = t + 6;
    this.chaseAndHit(b, target, cmd, t, { windup: 0.22, cooldown: 0.9, combo: true, knock: 120, attackSound: 'banshee_attack' });
    void Z;
  }

  scream(b) {
    const g = this.game, Z = this.Z, B = b.boss;
    const o = b.pm.origin;
    g.sound?.play('banshee_scream', { pos: b.eyePos(), volume: 1, attenuation: 'none' });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      g.fire?.emit('mist', [o[0] + Math.cos(a) * 30, o[1] + Math.sin(a) * 30, o[2] + 30], [Math.cos(a) * 500, Math.sin(a) * 500, 0], { life: 0.9, size: 30, size1: 120, drag: 2.5 });
    }
    for (const q of Z.humans()) {
      const dd = Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1], q.pm.origin[2] - o[2]);
      if (dd > 720) continue;
      const k = 1 - dd / 720;
      g.damagePlayer(q, b, (10 + 22 * k) * B.dmgK, CR.HITGROUP.GENERIC, 'scream', null, null, { blast: true });
      q.pm.velocityModifier = 0.35;
      if (q.isLocal) {
        g.shake = { until: g.time + 1.4, amp: 6 + 8 * k };
        q.flashStart = g.time; q.flashFull = g.time + 0.1; q.flashUntil = g.time + 0.9; q.flashMax = 0.35 + 0.3 * k;
      }
    }
    // the pack answers
    for (let i = 0; i < 4 + B.cycle; i++) Z.spawnZombie({ near: o, health: Math.round(Z.stats.health * 0.8), speed: rnd(258, 280) });
  }

  /** Vanish in a puff and reappear near (preferably behind) the target. */
  blink(b, target) {
    const g = this.game, nav = g.nav;
    const to = target.pm.origin;
    const tf = target.feet();
    const start = nav.nearest(tf, 200) || nav.nearestXY(tf, 260, 120);
    if (!start) return false;
    const ring = nav.around(start, 520, 900).filter((x) => x.dist > 220 && x.dist < 520);
    if (!ring.length) return false;
    const fy = target.pm.angles[1] * DEG;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 24; i++) {
      const c = ring[Math.floor(Math.random() * ring.length)].node;
      const behind = -((c.x - to[0]) * Math.cos(fy) + (c.y - to[1]) * Math.sin(fy)) / Math.max(1, Math.hypot(c.x - to[0], c.y - to[1]));
      const s = behind + Math.random() * 0.4;
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) return false;
    const o = b.pm.origin;
    const puff = (p) => { for (let i = 0; i < 18; i++) g.fire?.emit('mist', [p[0] + rnd(-20, 20), p[1] + rnd(-20, 20), p[2] + rnd(-30, 40)], [rnd(-90, 90), rnd(-90, 90), rnd(-20, 80)], { life: rnd(0.8, 1.4), size: 26, size1: 70, drag: 2 }); };
    puff(o);
    g.sound?.play('banshee_blink', { pos: o.slice(), volume: 1 });
    b.pm.origin = [best.x, best.y, best.z + 37];
    b.prevOrigin = b.pm.origin.slice();
    b.pm.velocity = [0, 0, 0];
    b.progPos = b.pm.origin.slice(); b.progT = g.time;
    b.node = null; b.goal = null;
    setDynamicBox(b.box, b.pm.origin, b.hull().mins, b.hull().maxs);
    puff(b.pm.origin);
    g.sound?.play('banshee_blink', { pos: b.pm.origin.slice(), volume: 1 });
    this.face(b, to, 180);
    return true;
  }

  // ---- THE INFERNO
  inferno(b, target, cmd, t) {
    const B = b.boss, g = this.game, F = g.fire;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    // body on fire, burning footprints, a burning aura
    if (F) {
      for (let i = 0; i < 2; i++) F.emit('fire', [o[0] + rnd(-12, 12), o[1] + rnd(-12, 12), o[2] - 30 + rnd(0, 90)], [rnd(-15, 15), rnd(-15, 15), rnd(40, 90)], { life: rnd(0.3, 0.55), size: rnd(12, 20), size1: 5, buoy: 90, frame: 1 });
      if (Math.random() < 0.05) F.emit('smoke', [o[0], o[1], o[2] + 60], [0, 0, 40], { life: 2, size: 30, size1: 80, buoy: 20 });
      if (t >= B.trailT && Math.hypot(b.pm.velocity[0], b.pm.velocity[1]) > 60 && b.pm.onground) {
        B.trailT = t + 0.55;
        F.ignite([o[0], o[1], o[2] - 30], b, { radius: 30, duration: 4, dps: 16, weapon: 'fireball', quiet: true, burn: 1.5 });
      }
      if (t >= B.auraT) {
        B.auraT = t + 0.25;
        for (const q of this.Z.humans()) if (Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1], q.pm.origin[2] - o[2]) < 120) { F.hurt(q, b, 4, 'fireball', 'fire'); F.burn(q, b, 1.5, 12, 'fireball'); }
      }
    }
    if (B.state === 'fire_up') {
      this.face(b, target.pm.origin, 10);
      if (t >= B.until) {
        B.state = 'chase';
        const e = b.eyePos(); e[2] += 20;
        const to = target.eyePos();
        const T = Math.max(0.3, Math.hypot(to[0] - e[0], to[1] - e[1]) / 900);
        const aim = [to[0] + target.pm.velocity[0] * T * 0.7, to[1] + target.pm.velocity[1] * T * 0.7, to[2] - 20];
        const l = Math.hypot(aim[0] - e[0], aim[1] - e[1], aim[2] - e[2]) || 1;
        const sp = 900;
        g.projectiles.launch('fireball', b, e, [(aim[0] - e[0]) / l * sp, (aim[1] - e[1]) / l * sp, (aim[2] - e[2]) / l * sp], { damage: 35 * B.dmgK });
        g.sound?.play('fireball_throw', { pos: e, volume: 1 });
        this.cool(B, 'fireball', t, 2.8);
      }
      return;
    }
    if (B.state === 'nova_up') {
      for (let i = 0; i < 3; i++) F?.emit('fire', [o[0] + rnd(-40, 40), o[1] + rnd(-40, 40), o[2] - 30], [rnd(-60, 60), rnd(-60, 60), rnd(100, 200)], { life: 0.5, size: 18, size1: 6, buoy: 100 });
      if (t >= B.until) {
        B.state = 'chase';
        g.explode(o, { owner: b, damage: 35 * B.dmgK, radius: 320, weapon: 'fireball', sound: 'rocket_explode', scale: 1.2, shake: 8, fire: true, noGore: true });
        for (const [r, n] of [[150, 8], [280, 14]]) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            g.fire?.ignite([o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r, o[2]], b, { radius: 45, duration: 5, dps: 22, weapon: 'fireball', quiet: i % 3 !== 0 });
          }
        }
        this.cool(B, 'nova', t, 14);
      }
      return;
    }
    const sees = this.sees(b, target);
    if ((this.ready(B, 'nova', t) && (b.health < b.maxHealth * 0.5 || B.novaDone) && d < 500)) {
      B.novaDone = true;
      B.state = 'nova_up'; B.until = t + 1.2; b.lastShot = t;
      g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (sees && this.ready(B, 'fireball', t) && d > 220 && d < 1500) {
      B.state = 'fire_up'; B.until = t + 0.6; b.lastShot = t;
      g.sound?.play('inferno_charge', { pos: b.eyePos(), volume: 0.8, channel: `${b.id}:voice` });
      return;
    }
    this.chaseAndHit(b, target, cmd, t, { knock: 200, weapon: 'fireball', attackSound: 'boss_attack', onHit: (q) => F?.burn(q, b, 3, 15, 'fireball') });
  }

  // ---- THE ABOMINATION
  abomination(b, target, cmd, t) {
    const B = b.boss, g = this.game, Z = this.Z;
    const o = b.pm.origin, d = dist2(o, target.pm.origin);
    if (B.state === 'slam_up') {
      this.face(b, target.pm.origin, 5);
      for (let i = 0; i < 2; i++) g.fire?.emit('dust', [o[0] + rnd(-30, 30), o[1] + rnd(-30, 30), o[2] - 34], [rnd(-40, 40), rnd(-40, 40), rnd(10, 40)], { life: 0.8, size: 16, size1: 40, drag: 2 });
      if (t >= B.until) {
        B.state = 'chase';
        this.slam(b);
        B.exposedUntil = t + 2.8;
        this.cool(B, 'slam', t, B.enraged ? 4.5 : 7);
      }
      return;
    }
    if (B.state === 'raise_up') {
      if (Math.random() < 0.5) g.fire?.emit('mist', [o[0] + rnd(-50, 50), o[1] + rnd(-50, 50), o[2] + rnd(0, 60)], [0, 0, rnd(30, 90)], { life: 1, size: 20, size1: 50, buoy: 20 });
      if (t >= B.until) {
        B.state = 'chase';
        this.raiseDead(b);
        B.exposedUntil = t + 2.5;
        this.cool(B, 'raise', t, 16);
      }
      return;
    }
    if (this.ready(B, 'slam', t) && d < 360 && Math.abs(target.pm.origin[2] - o[2]) < 80 && b.pm.onground) {
      B.state = 'slam_up'; B.until = t + 1.1; b.lastShot = t;
      g.sound?.play('boss_roar', { pos: b.eyePos(), volume: 1, channel: `${b.id}:voice` });
      return;
    }
    if (this.ready(B, 'raise', t) && t > (B.cd.firstRaise ??= t + 6)) {
      B.state = 'raise_up'; B.until = t + 1.4;
      g.sound?.play('abom_raise', { pos: b.eyePos(), volume: 1 });
      return;
    }
    this.chaseAndHit(b, target, cmd, t, { knock: 420, windup: 0.5, cooldown: 1.4, attackSound: 'boss_attack' });
    void Z;
  }

  slam(b) {
    const g = this.game, B = b.boss, o = b.pm.origin;
    g.sound?.play('slam', { pos: o, volume: 1, attenuation: 'none' });
    g.shakeAt?.(o, 14, 1400);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      g.fire?.emit('dust', [o[0] + Math.cos(a) * 30, o[1] + Math.sin(a) * 30, o[2] - 30], [Math.cos(a) * 520, Math.sin(a) * 520, rnd(20, 80)], { life: 0.9, size: 22, size1: 60, drag: 2.2 });
    }
    g.effects.decal?.('decal_scorch', [o[0], o[1], o[2] - 35], [0, 0, 1], 160);
    for (const q of this.Z.humans()) {
      const dd = Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1]);
      if (dd > 430 || Math.abs(q.pm.origin[2] - o[2]) > 90) continue;
      if (!q.pm.onground) continue; // jumped it
      const k = 1 - dd / 430;
      const dir = [(q.pm.origin[0] - o[0]) / (dd || 1), (q.pm.origin[1] - o[1]) / (dd || 1), 0.6];
      g.damagePlayer(q, b, (15 + 40 * k) * B.dmgK, CR.HITGROUP.GENERIC, 'slam', dir, null, { blast: true });
      q.pm.velocity[0] += dir[0] * 320 * k; q.pm.velocity[1] += dir[1] * 320 * k; q.pm.velocity[2] += 300 + 120 * k;
    }
  }

  raiseDead(b) {
    const g = this.game, Z = this.Z, o = b.pm.origin;
    const want = 6 + b.boss.cycle * 2;
    let n = 0;
    const recs = (g.gore?.records || []).filter((r) => r.skin === 'zombie' && dist2(r.center, o) < 900).sort((a, c) => dist2(a.center, o) - dist2(c.center, o));
    // they claw their way up out of the floor beside the bodies (which stay where they are)
    for (const r of recs) {
      if (n >= want) break;
      const at = this.standBeside(r.center);
      if (!at) continue;
      if (!Z.spawnZombie({ at, health: Math.round(Z.stats.health * 0.7), risen: true })) break;
      n++;
    }
    for (; n < want; n++) if (!Z.spawnZombie({ near: o, health: Math.round(Z.stats.health * 0.7), risen: true })) break;
    g.sound?.play('abom_raise', { pos: o, volume: 1 });
  }

  /** A free standing spot (player origin) right next to a body on the floor, or null. */
  standBeside(c) {
    const col = this.game.collision, mins = [-16, -16, -36], maxs = [16, 16, 36];
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      const a = a0 + k * Math.PI / 3;
      const p = [c[0] + Math.cos(a) * 30, c[1] + Math.sin(a) * 30, c[2] + 44];
      col.trace(p, p, mins, maxs, MASK_WORLD_PLAYER, _tr);
      if (_tr.startsolid || _tr.allsolid) continue;
      // settle onto the floor below
      col.trace(p, [p[0], p[1], p[2] - 64], mins, maxs, MASK_WORLD_PLAYER, _tr);
      if (_tr.fraction < 1 && _tr.normal[2] > 0.7) return [_tr.endpos[0], _tr.endpos[1], _tr.endpos[2] + 1];
    }
    return null;
  }

  hudInfo() {
    const b = this.boss;
    if (!b || !b.alive) return null;
    const B = b.boss;
    return { name: B.def.name, hp: Math.max(0, b.health), hpMax: b.maxHealth, status: B.status, color: B.def.color };
  }
}
