// Second-wave special infected: Charger (armoured-arm bull rush, carry and
// pummel), Jockey (leaps onto a survivor's head and steers them into trouble)
// and Spitter (lobs acid globs that burst into spreading, damaging pools).
// Built on the shared SpecialInfected base (nav agent, rig, ragdoll, burning,
// stumble); registered into SPECIAL_CLASSES so the Director, co-op and the
// scripted spawns can use them like the originals.
import * as THREE from 'three';
import { SpecialInfected, SPECIAL_CLASSES } from './specials.js';
import { J } from './body.js';
import { acidOf } from './acid.js';
import { FR } from '../render/particles.js';
import { clamp, damp, randRange, wrapAngle } from '../core/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const GRAV = 16;

// A survivor that can see `sp` calls it out (callout category from lines.js).
function callout(g, sp, cat, prio = 2, cooldown = 6, exclude = null) {
  if (!g.voice) return;
  for (const s of g.survivors) {
    if (s.dead || s.incapped || s.pinned || s === exclude) continue;
    if (s.pos.distanceTo(sp.pos) > 32) continue;
    if (!g.level.col.lineOfSight(s.pos.x, s.pos.y + 1.6, s.pos.z, sp.pos.x, sp.pos.y + 1.2, sp.pos.z)) continue;
    g.voice.say(s, cat, prio, { cooldown });
    return;
  }
}
// Keep custom hand targets within arm's reach (an unreachable IK target would
// stretch the skinned arm). Shoulder estimated from the pose parameters the
// same way animateHumanoid builds the spine.
function clampReach(a, body) {
  if (a.arms !== 'custom') return;
  const sc = body.scale, bw = body.build;
  const crouch = a.crouch || 0;
  const hip = (0.97 - crouch * 0.42 - (a.sink || 0)) * sc;
  const lean = (a.lean || 0) + crouch * 0.35 + (a.hunch || 0);
  const up = hip + Math.cos(lean) * 0.43 * sc - 0.04 * sc, fw = Math.sin(lean) * 0.43 * sc - 0.02;
  const reach = (0.29 + 0.3) * sc * 0.97;
  for (const [h, sg] of [[a.handL, -1], [a.handR, 1]]) {
    if (!h) continue;
    const dx = h[0] - sg * 0.19 * sc * bw, dy = h[1] - up, dz = h[2] - fw;
    const d = Math.hypot(dx, dy, dz);
    if (d > reach) { const k = reach / d; h[0] = sg * 0.19 * sc * bw + dx * k; h[1] = up + dy * k; h[2] = fw + dz * k; }
  }
}
function shakeNear(g, pos, amt, range) {
  const p = g.player;
  if (!p || p.dead) return;
  const d = p.pos.distanceTo(pos);
  if (d < range) g.shake?.(amt * (1 - d / range));
}

// ================================================================ CHARGER ==
// Hulking, one massive armour-plated right arm and a withered left. Charges in
// a straight line, bowling survivors aside and scooping up the first one it
// hits, then slams and pummels them into the ground until killed. Can't be
// shoved while winding up, charging or pummelling.
const CHARGE_SPEED = 13.5;
export class Charger extends SpecialInfected {
  constructor(mgr) {
    super(mgr, 'charger', { id: 'charger' }, { hp: 600, speed: 5, scale: 1.08, build: 1.3, height: 1.95, radius: 0.5, hitScale: 1.15, torsoScale: 1.15, headScale: 0.95 });
    this.chargeCd = randRange(3, 6);
    this.punchCd = 0;
    this.chargeDir = new THREE.Vector3(0, 0, -1);
    this.bowled = [];
    this.slamT = 0;
    this.stepT = 0;
    this.chargeDist = 0;
    this.explosiveMult = 1;
  }
  get shoveable() { return this.state === 'stalk' || this.state === 'stunned' || this.state === 'punch'; }
  set shoveable(v) { /* derived from state */ }
  get carrying() { return this.state === 'charge' && !!this.pinning; }
  get charging() { return this.state === 'windup' || this.state === 'charge'; }
  vocalInterval() { return this.state === 'pummel' ? randRange(1.2, 2) : randRange(2.5, 5); }
  vocalize() {
    if (this.state === 'charge' || this.state === 'windup') return;
    this.game.audio.play('chargerIdle', { pos: this.pos, vol: this.state === 'pummel' ? 1 : 0.9 });
  }
  onDamaged(h) {
    // a blast knocks it off its victim (a shove or bullets won't)
    if (h.kind === 'explosion' && this.state === 'pummel' && (h.damage || 0) > 100) {
      this.dropVictim();
      this.state = 'stunned'; this.stateT = 0;
      this.stumble = { t: 1.2, vx: h.dir.x * 4, vz: h.dir.z * 4 };
    }
  }
  laneClear(t) {
    const nav = this.nav;
    return !nav || nav.walkable(this.pos.x, this.pos.y, this.pos.z, t.pos.x, t.pos.y, t.pos.z);
  }
  think(dt) {
    const g = this.game;
    this.chargeCd -= dt;
    this.punchCd -= dt;
    // heavy footfalls
    this.stepT -= dt * (this.curSpeed / (this.state === 'charge' ? 2.2 : 1.8));
    if (this.stepT <= 0 && this.curSpeed > 0.8) {
      this.stepT = 1;
      g.audio.play('chargerStep', { pos: this.pos, vol: this.state === 'charge' ? 1.1 : 0.6 });
      if (this.state === 'charge') shakeNear(g, this.pos, 0.35, 16);
    }
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.5; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const d = this.chase(dt, 5.2, t);
        const dy = Math.abs(t.pos.y - this.pos.y);
        if (d < 2.2 && dy < 1.5 && this.punchCd <= 0) { this.state = 'punch'; this.stateT = 0; this.hitDone = false; break; }
        if (this.chargeCd <= 0 && d > 4 && d < 24 && dy < 1.2 && !t.pinned && this.canSee(t, 1.2) && this.laneClear(t)) {
          this.state = 'windup'; this.stateT = 0;
          g.audio.play('chargerWarn', { pos: this.pos, vol: 1.3 });
          callout(g, this, 'chargerCharging', 2, 5);
        }
        break;
      }
      case 'punch': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 8, dt);
        if (t) this.faceTowards(t.pos.x, t.pos.z, 8, dt);
        if (this.stateT > 0.3 && !this.hitDone) {
          this.hitDone = true;
          const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
          let hit = false;
          for (const s of this.mgr.targets) {
            const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 2.4 || Math.abs(s.pos.y - this.pos.y) > 1.6 || (dx * fx + dz * fz) / (d || 1) < 0.25) continue;
            hit = true;
            s.takeDamage(10 * g.difficulty.siDmg, this, 'claw');
            if (!s.incapped && !s.pinned) s.knock = { x: fx * 3, y: 1.5, z: fz * 3 };
            g.fx.blood(s.pos.x, s.pos.y + 1.2, s.pos.z, fx, 0.3, fz, 1);
            if (s.isHuman) g.shake?.(0.5);
          }
          g.audio.play(hit ? 'chargerImpact' : 'swing', { pos: this.pos, vol: hit ? 0.9 : 0.7 });
        }
        if (this.stateT > 0.75) { this.state = 'stalk'; this.punchCd = 1.3; }
        break;
      }
      case 'windup': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 10, dt);
        if (t && !t.dead) this.faceTowards(t.pos.x, t.pos.z, 10, dt);
        if (this.stateT < 0.6 && Math.random() < 0.3) g.fx.dust(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + 0.05, this.pos.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, [0.4, 0.38, 0.34], 2, 0.3);
        if (this.stateT > 0.75) {
          if (!t || t.dead) { this.state = 'stalk'; break; }
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
          this.chargeDir.set(dx / dl, 0, dz / dl);
          this.yaw = Math.atan2(-dx, -dz);
          this.state = 'charge'; this.stateT = 0; this.chargeDist = 0;
          this.bowled.length = 0;
          this.curSpeed = 6;
          g.audio.play('chargerCharge', { pos: this.pos, vol: 1.3 });
        }
        break;
      }
      case 'charge': this.updateCharge(dt); break;
      case 'pummel': this.updatePummel(dt); break;
      case 'stunned':
        this.curSpeed = damp(this.curSpeed, 0, 6, dt);
        if (this.stateT > 1.6) { this.state = 'stalk'; this.stateT = 0; }
        break;
    }
  }
  updateCharge(dt) {
    const g = this.game;
    const d = this.chargeDir;
    this.curSpeed = Math.min(CHARGE_SPEED, this.curSpeed + dt * 28);
    // barely steerable: drift a little towards the target while empty-handed
    const t = this.target;
    if (!this.pinning && t && !t.dead && this.stateT < 1.2) {
      const want = Math.atan2(-(t.pos.x - this.pos.x), -(t.pos.z - this.pos.z));
      const dy = clamp(wrapAngle(want - this.yaw), -0.35 * dt, 0.35 * dt);
      this.yaw += dy;
      d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    } else this.yaw = Math.atan2(-d.x, -d.z);
    const step = this.curSpeed * dt;
    const ox = this.pos.x, oz = this.pos.z;
    this.moveOnNav(d.x * step, d.z * step);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    const along = ((this.pos.x - ox) * d.x + (this.pos.z - oz) * d.z);
    this.chargeDist += moved;
    // survivors in the path: the first is scooped up, the rest bowled aside
    const fx = d.x, fz = d.z, rx = -fz, rz = fx;
    for (const s of this.mgr.targets) {
      if (s.dead || s === this.pinning || this.bowled.includes(s)) continue;
      const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
      const fwd = dx * fx + dz * fz, side = dx * rx + dz * rz;
      if (fwd < -0.3 || fwd > 1.3 || Math.abs(side) > 0.95 || Math.abs(s.pos.y - this.pos.y) > 1.5) continue;
      if (!this.pinning && !s.pinned && !s.incapped) this.grab(s);
      else if (!s.pinned) this.bowl(s, side >= 0 ? 1 : -1, fx, fz, rx, rz);
    }
    // commons are ploughed out of the way
    g.infected.forEachNear(this.pos.x + fx * 0.8, this.pos.z + fz * 0.8, 1.4, (e) => {
      if (e.special || e.dead) return;
      e.takeHit({ damage: 150, part: 0, zone: 'torso', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, dir: _v.set(fx + rx * (Math.random() - 0.5), 0.6, fz + rz * (Math.random() - 0.5)), kind: 'explosion', knockback: 9, attacker: null });
    });
    // carried victim rides in the big arm
    const v = this.pinning;
    if (v) this.holdVictim(v, 0.8, 0.3, fx * this.curSpeed, fz * this.curSpeed, 12, 22);
    // wall / edge / out of steam
    const blocked = this.stateT > 0.12 && along < step * 0.35;
    if (blocked || this.stateT > 3 || this.chargeDist > 38) this.endCharge(blocked);
  }
  holdVictim(v, fwd, side, bvx, bvz, k, maxV) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const cx = this.pos.x + fx * fwd + rx * side, cz = this.pos.z + fz * fwd + rz * side;
    let mx = bvx + (cx - v.pos.x) * k, mz = bvz + (cz - v.pos.z) * k;
    const ml = Math.hypot(mx, mz);
    if (ml > maxV) { mx *= maxV / ml; mz *= maxV / ml; }
    v.pinnedMove = { x: mx, z: mz };
  }
  grab(s) {
    const g = this.game;
    this.pinning = s;
    s.pinned = this; s.pinType = 'charger';
    s.cancelAction();
    s.takeDamage(10 * g.difficulty.siDmg, this, 'charger');
    g.audio.play('chargerImpact', { pos: s.pos, vol: 1.3 });
    g.fx.blood(s.pos.x, s.pos.y + 1.1, s.pos.z, this.chargeDir.x, 0.4, this.chargeDir.z, 1.2);
    if (s.isHuman) { g.shake?.(1); g.renderer?.bloodSplat?.(0.5); }
    g.onPinned?.(s, this);
  }
  bowl(s, sgn, fx, fz, rx, rz) {
    const g = this.game;
    this.bowled.push(s);
    s.takeDamage(10 * g.difficulty.siDmg, this, 'charger');
    if (!s.incapped) {
      s.knock = { x: rx * sgn * 7 + fx * 4, y: 4.5, z: rz * sgn * 7 + fz * 4 };
      s.stunT = Math.max(s.stunT || 0, 1.3);
      s.cancelAction?.();
    }
    g.audio.play('chargerImpact', { pos: s.pos, vol: 1.1 });
    if (s.isHuman) g.shake?.(0.9);
    g.voice?.say(s, 'bowled', 2, { cooldown: 6 });
  }
  endCharge(wall) {
    const g = this.game;
    this.curSpeed = 0;
    this.chargeCd = randRange(11, 14);
    if (wall) {
      g.audio.play('chargerImpact', { pos: this.pos, vol: 1.4 });
      g.fx.dust(this.pos.x + this.chargeDir.x * 0.7, this.pos.y + 1.2, this.pos.z + this.chargeDir.z * 0.7, -this.chargeDir.x, 0.3, -this.chargeDir.z, [0.42, 0.4, 0.36], 8, 0.6);
      g.fx.chips(this.pos.x + this.chargeDir.x * 0.7, this.pos.y + 1.2, this.pos.z + this.chargeDir.z * 0.7, -this.chargeDir.x, 0.3, -this.chargeDir.z, [0.35, 0.33, 0.3], 10);
      shakeNear(g, this.pos, 1, 18);
    }
    const v = this.pinning;
    if (v && !v.dead) {
      // slam the victim down and start pummelling
      this.state = 'pummel'; this.stateT = 0; this.slamT = 0.25;
      v.pinnedMove = { x: 0, z: 0 };
    } else {
      this.releasePin();
      this.state = 'stunned'; this.stateT = wall ? 0 : 0.8;
      if (wall) this.stumble = { t: 0.6, vx: -this.chargeDir.x * 2, vz: -this.chargeDir.z * 2 };
    }
  }
  updatePummel(dt) {
    const g = this.game;
    const v = this.pinning;
    this.curSpeed = 0;
    if (!v || v.dead) { this.dropVictim(); this.state = 'stalk'; this.chargeCd = Math.max(this.chargeCd, 6); return; }
    this.faceTowards(v.pos.x, v.pos.z, 6, dt);
    this.holdVictim(v, 1.0, 0.15, 0, 0, 6, 4);
    this.slamT -= dt;
    if (this.slamT <= 0) {
      this.slamT = 1.35;
      this.slamHit = 0.42; // impact lands partway through the swing
    }
    if (this.slamHit > 0) {
      this.slamHit -= dt;
      if (this.slamHit <= 0) {
        v.takeDamage(15 * g.difficulty.siDmg * (v.incapped ? 1 : 1), this, 'charger');
        g.audio.play('chargerSlam', { pos: v.pos, vol: 1.2 });
        g.fx.blood(v.pos.x, v.pos.y + 0.3, v.pos.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 1.4);
        g.fx.dust(v.pos.x, v.pos.y + 0.05, v.pos.z, 0, 1, 0, [0.4, 0.38, 0.34], 4, 0.5);
        shakeNear(g, v.pos, v.isHuman ? 1 : 0.5, 10);
        if (v.isHuman) g.renderer?.bloodSplat?.(0.4);
      }
    }
  }
  dropVictim() {
    const v = this.pinning;
    this.releasePin();
    if (v && !v.dead && !v.incapped) v.stunT = Math.max(v.stunT || 0, 1.1); // getting back up
  }
  releasePin() {
    const v = this.pinning;
    if (v && v.pinned === this) v.pinnedMove = null;
    super.releasePin();
  }
  release() { this.dropVictim(); this.state = 'stunned'; this.stateT = 0; }
  onShoved(s, fx, fz) {
    if (!this.shoveable) return; // immovable mid-charge / while pummelling
    this.stumble = { t: 0.45, vx: fx * 1.8, vz: fz * 1.8 };
    this.punchCd = Math.max(this.punchCd, 0.8);
  }
  onDeath(h) {
    const g = this.game;
    const v = this.pinning;
    this.dropVictim();
    g.audio.play('chargerDeath', { pos: this.pos, vol: 1.2 });
    const b = this.body;
    g.fx.blood(b.jx(J.CHEST), b.jy(J.CHEST), b.jz(J.CHEST), 0, 0.6, 0, 2.2);
    if (this.state === 'charge' && this.ragdoll) this.ragdoll.impulse(J.CHEST, this.chargeDir.x * 9, 2, this.chargeDir.z * 9); // momentum carries the corpse
    if (v) g.voice?.say(v, 'thanks', 1, { cooldown: 6 });
  }
  animParams(a) {
    const sc = this.body.scale;
    const ph = this.phase;
    a.lean = 0.32; a.hunch = 0.3; a.runLean = 0.6; a.twitch = 0.08; a.sway = 0.03; a.footS = 0.05;
    a.arms = 'custom';
    a.poleR = [1, -0.4, -1]; a.poleL = [-1, -1, 0.3];
    // withered left arm clutched to the chest; the huge right arm drags low
    a.handL = [-0.1 * sc, 1.12 * sc, 0.26 * sc];
    const sw = Math.sin(ph) * Math.min(1, this.curSpeed / 3);
    a.handR = [0.36 * sc, 0.72 * sc + Math.abs(sw) * 0.06, 0.34 * sc + sw * 0.3];
    switch (this.state) {
      case 'windup': {
        const k = clamp(this.stateT / 0.75, 0, 1);
        a.crouch = 0.25 * k; a.lean = 0.1 + 0.5 * k; a.speed = 0;
        a.handR = [0.42 * sc, (0.75 + Math.sin(this.stateT * 14) * 0.08) * sc, (0.25 + 0.3 * k) * sc];
        a.headPitch = -0.35 * (1 - k);
        a.twitch = 0.4;
        break;
      }
      case 'charge':
        a.lean = 0.72; a.runLean = 0.3;
        if (this.pinning) { a.handR = [0.12 * sc, 0.95 * sc, 0.62 * sc]; a.poleR = [1, 0, -0.5]; }
        else { a.handR = [0.24 * sc, 0.75 * sc, 0.85 * sc]; a.poleR = [1, 0.2, -0.3]; }
        a.handL = [-0.14 * sc, 1.02 * sc, 0.2 * sc];
        break;
      case 'pummel': {
        const k = clamp(1 - this.slamT / 1.35, 0, 1);
        const up = k < 0.25 ? k / 0.25 : k < 0.31 ? 1 - (k - 0.25) / 0.06 : 0;
        a.legs = 'wide'; a.speed = 0; a.lean = 0.45 + (1 - up) * 0.25; a.crouch = 0.2;
        a.handR = [0.12 * sc, (0.6 + up * 1.4) * sc, (0.8 - up * 0.4) * sc];
        a.poleR = [1, -0.2, -0.6];
        a.twitch = 0.3;
        break;
      }
      case 'punch': {
        const k = clamp(this.stateT / 0.45, 0, 1);
        a.handR = [(0.55 - 0.45 * k) * sc, (1.05 + Math.sin(k * Math.PI) * 0.25) * sc, (-0.05 + 1.0 * k) * sc];
        a.twist = -0.35 + k * 0.7; a.speed = 0;
        break;
      }
      case 'stunned': a.arms = 'flail'; a.lean = -0.1; a.twitch = 0.6; break;
    }
    a.handL = a.handL.slice(); a.handR = a.handR.slice();
    clampReach(a, this.body);
  }
}

// ================================================================= JOCKEY ==
// Small, hunched and cackling. Skitters in on a zig-zag, leaps onto a
// survivor's shoulders and steers them away from the team and into hazards
// (acid, fire, the horde) until shoved off or killed.
export class Jockey extends SpecialInfected {
  constructor(mgr) {
    super(mgr, 'jockey', { id: 'jockey' }, { hp: 325, speed: 6.4, scale: 0.74, build: 0.85, height: 1.25, radius: 0.3, headScale: 1.1 });
    this.leapCd = randRange(1, 2);
    this.shoveable = true;
    this.airborne = false;
    this.steer = new THREE.Vector3();
    this.steerT = 0;
    this.zig = Math.random() * 6;
  }
  vocalInterval() {
    if (this.state === 'ride') return randRange(0.9, 1.6);
    const t = this.target;
    const d = t ? t.pos.distanceTo(this.pos) : 99;
    return d < 18 ? randRange(0.9, 1.8) : randRange(2.5, 4.5);
  }
  vocalize() {
    const g = this.game;
    g.audio.play(this.state === 'ride' ? 'jockeyRide' : 'jockeyLaugh', { pos: this.pos, vol: this.state === 'ride' ? 1 : 0.95 });
  }
  think(dt) {
    const g = this.game;
    this.leapCd -= dt;
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.5; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const dist = t.pos.distanceTo(this.pos);
        // erratic skittering approach once close
        if (dist < 14 && dist > 3 && this.canSee(t, 0.8)) {
          this.zig += dt * 3.2;
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
          const s = Math.sin(this.zig) * 0.9;
          const mx = dx / dl - dz / dl * s, mz = dz / dl + dx / dl * s, ml = Math.hypot(mx, mz) || 1;
          this.curSpeed = damp(this.curSpeed, 6.6, 6, dt);
          this.yaw = this.yaw + wrapAngle(Math.atan2(-mx, -mz) - this.yaw) * Math.min(1, dt * 10);
          this.moveOnNav(mx / ml * this.curSpeed * dt, mz / ml * this.curSpeed * dt);
        } else this.chase(dt, 6.2, t);
        if (this.leapCd <= 0 && dist < 6.5 && dist > 1 && !t.pinned && Math.abs(t.pos.y - this.pos.y) < 2.5 && this.canSee(t, 0.8)) this.leap(t);
        break;
      }
      case 'leap': this.updateLeap(dt); break;
      case 'ride': this.updateRide(dt); break;
    }
  }
  leap(t) {
    const g = this.game;
    this.state = 'leap'; this.stateT = 0;
    const tx = t.pos.x + t.phys.vx * 0.3, ty = t.pos.y + 1.2, tz = t.pos.z + t.phys.vz * 0.3;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, dy = ty - this.pos.y;
    const T = clamp(Math.hypot(dx, dz) / 11, 0.3, 0.8);
    this.vel.set(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T);
    this.airborne = true;
    this.yaw = Math.atan2(-dx, -dz);
    g.audio.play('jockeyLeap', { pos: this.pos, vol: 1.1 });
  }
  updateLeap(dt) {
    const g = this.game;
    const col = g.level.col;
    this.vel.y -= GRAV * dt;
    // light mid-air homing on the chosen victim (it can still be sidestepped)
    const t = this.target;
    if (t && !t.dead && this.stateT < 0.6) {
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const k = Math.min(1, dt * 4);
      this.vel.x += (dx / dl * hs - this.vel.x) * k;
      this.vel.z += (dz / dl * hs - this.vel.z) * k;
    }
    const tryMount = () => {
      for (const s of this.mgr.targets) {
        if (s.pinned || s.dead || s.incapped) continue;
        const dh = Math.hypot(s.pos.x - this.pos.x, s.pos.z - this.pos.z), dy = this.pos.y - s.pos.y;
        if (dh < 0.95 && dy > -0.3 && dy < 2.2) { this.mount(s); return true; }
      }
      return false;
    };
    if (tryMount()) return;
    const sp = this.vel.length() || 1;
    const h = col.raycast(this.pos.x, this.pos.y + 0.5, this.pos.z, this.vel.x / sp, this.vel.y / sp, this.vel.z / sp, sp * dt + 0.25);
    // bounce off real walls only (not the survivor it's about to land on)
    if (h && h.ny < 0.5 && !(t && Math.hypot(h.x - t.pos.x, h.z - t.pos.z) < 1.2)) { this.vel.x *= -0.15; this.vel.z *= -0.15; }
    this.pos.addScaledVector(this.vel, dt);
    if (tryMount()) return;
    const gy = col.groundHeight(this.pos.x, this.pos.y + 0.5, this.pos.z, 30, 0.2);
    if ((this.vel.y < 0 && this.pos.y <= gy + 0.02) || this.stateT > 3 || this.pos.y < -100) {
      if (gy > -1e8) this.pos.y = Math.max(this.pos.y, gy);
      this.land();
      this.stumble = { t: 0.25, vx: this.vel.x * 0.1, vz: this.vel.z * 0.1 };
    }
  }
  land() {
    this.airborne = false;
    this.state = 'stalk'; this.stateT = 0;
    this.leapCd = 1.4;
    this.vel.set(0, 0, 0);
    this.placeAt(this.pos.x, this.pos.y, this.pos.z);
  }
  mount(s) {
    const g = this.game;
    this.airborne = false;
    this.state = 'ride'; this.stateT = 0;
    this.pinning = s;
    s.pinned = this; s.pinType = 'jockey';
    s.cancelAction();
    s.takeDamage(4 * g.difficulty.siDmg, this, 'jockey');
    this.steerT = 0;
    this.steer.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    g.audio.play('jockeyRide', { pos: s.pos, vol: 1.2 });
    if (s.isHuman) g.renderer?.bloodSplat?.(0.3);
    g.onPinned?.(s, this);
  }
  // Pick where to drive the victim: away from their team, towards hazards.
  chooseSteer(v) {
    const g = this.game;
    const nav = this.nav;
    let cx = 0, cz = 0, n = 0;
    for (const o of g.survivors) if (o !== v && !o.dead) { cx += o.pos.x; cz += o.pos.z; n++; }
    const hz = [];
    const acid = g.acid;
    if (acid) for (const p of acid.pools) hz.push([p.x, p.z, 3]);
    for (const f of g.combat?.fires || []) hz.push([f.x, f.z, 2.5]);
    let best = null, bs = -1e9;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      let sc = (dx * this.steer.x + dz * this.steer.z) * 0.6 + Math.random() * 0.5;
      if (n) {
        const ax = v.pos.x - cx / n, az = v.pos.z - cz / n, al = Math.hypot(ax, az) || 1;
        sc += (dx * ax + dz * az) / al * 1.1;
      }
      for (const [hx, hzz, w] of hz) {
        const ex = hx - v.pos.x, ez = hzz - v.pos.z, el = Math.hypot(ex, ez);
        if (el > 14 || el < 0.5) continue;
        sc += (dx * ex + dz * ez) / el * w * (1 - el / 14);
      }
      if (nav && !nav.walkable(v.pos.x, v.pos.y, v.pos.z, v.pos.x + dx * 2.5, v.pos.y, v.pos.z + dz * 2.5)) sc -= 6;
      if (sc > bs) { bs = sc; best = [dx, dz]; }
    }
    if (best) this.steer.set(best[0], 0, best[1]);
  }
  updateRide(dt) {
    const g = this.game;
    const v = this.pinning;
    if (!v || v.dead || v.incapped) { this.dismount(); return; }
    this.steerT -= dt;
    if (this.steerT <= 0) { this.steerT = randRange(0.5, 0.9); this.chooseSteer(v); }
    // victim fights back: human input (or a bot pulling towards the team)
    let rx = 0, rz = 0;
    if (v.isHuman && v.cmd) {
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), sx = Math.cos(v.yaw), sz = -Math.sin(v.yaw);
      rx = (fx * (v.cmd.my || 0) + sx * (v.cmd.mx || 0)) * 1.7;
      rz = (fz * (v.cmd.my || 0) + sz * (v.cmd.mx || 0)) * 1.7;
    } else {
      let near = null, nd = 1e9;
      for (const o of g.survivors) { if (o === v || o.dead) continue; const d = o.pos.distanceTo(v.pos); if (d < nd) { nd = d; near = o; } }
      if (near && nd > 1) { rx = (near.pos.x - v.pos.x) / nd * 1.1; rz = (near.pos.z - v.pos.z) / nd * 1.1; }
    }
    const lurch = 0.75 + 0.35 * Math.sin(this.stateT * 5.3);
    v.pinnedMove = { x: this.steer.x * 2.9 * lurch + rx, z: this.steer.z * 2.9 * lurch + rz };
    // perch on the victim's shoulders, facing where they face
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    this.yaw = v.yaw;
    this.pos.set(v.pos.x - fx * 0.14, v.pos.y + 0.8 + (v.crouching ? -0.3 : 0), v.pos.z - fz * 0.14);
    this.targetY = this.pos.y;
    this.curSpeed = Math.hypot(v.phys.vx, v.phys.vz);
    this.node = this.nav ? this.nav.nearestNode(v.pos.x, v.pos.y, v.pos.z, 2) : -1;
    this.dmgT = (this.dmgT || 0) - dt;
    if (this.dmgT <= 0) {
      this.dmgT = 0.25;
      v.takeDamage(1 * g.difficulty.siDmg, this, 'jockey', true);
      if (Math.random() < 0.25) g.fx.blood(v.pos.x, v.pos.y + 1.6, v.pos.z, fx, 0.3, fz, 0.4, false);
    }
  }
  dismount(fx = 0, fz = 0, shoved = false) {
    const v = this.pinning;
    if (v && v.pinned === this) v.pinnedMove = null;
    this.releasePin();
    const g = this.game;
    this.state = 'stalk'; this.stateT = 0;
    this.leapCd = shoved ? 3.5 : 2.5;
    // drop off behind the victim onto the nav mesh
    const ox = v ? v.pos.x : this.pos.x, oy = v ? v.pos.y : this.pos.y, oz = v ? v.pos.z : this.pos.z;
    const bx = fx || (v ? Math.sin(v.yaw) : 0), bz = fz || (v ? Math.cos(v.yaw) : 0);
    const n = this.nav ? this.nav.nearestNode(ox + bx * 0.9, oy, oz + bz * 0.9, 3) : -1;
    if (n >= 0) this.placeAt(this.nav.nodeX(n), this.nav.nodeY[n], this.nav.nodeZ(n));
    else this.placeAt(ox, oy, oz);
    this.stumble = { t: shoved ? 1.2 : 0.5, vx: bx * (shoved ? 3.5 : 1.5), vz: bz * (shoved ? 3.5 : 1.5) };
    if (shoved) g.audio.play('jockeyLeap', { pos: this.pos, vol: 0.7 });
  }
  release() { this.dismount(); }
  onShoved(s, fx, fz) {
    const g = this.game;
    if (this.state === 'ride') { this.dismount(fx, fz, true); g.onSkeet?.(s, this); return; }
    if (this.state === 'leap') {
      this.land();
      this.stumble = { t: 1.0, vx: fx * 3, vz: fz * 3 };
      this.leapCd = 2.5;
      return;
    }
    this.stumble = { t: 0.9, vx: fx * 4, vz: fz * 4 };
    this.leapCd = Math.max(this.leapCd, 1.2);
  }
  onDeath() {
    const g = this.game;
    const v = this.pinning;
    if (v && v.pinned === this) v.pinnedMove = null;
    this.airborne = false;
    g.audio.play('jockeyDeath', { pos: this.pos, vol: 1.1 });
    if (this.ragdoll && v) this.ragdoll.impulse(J.CHEST, Math.sin(v.yaw) * 3, 1, Math.cos(v.yaw) * 3); // topples off the back
  }
  animParams(a) {
    const g = this.game;
    const sc = this.body.scale;
    a.crouch = 0.32; a.lean = 0.5; a.hunch = 0.35; a.runLean = 0.5; a.twitch = 0.5; a.sway = 0.05;
    a.arms = this.curSpeed > 2 ? 'reach' : 'hang';
    a.sink = Math.abs(Math.sin(this.phase * 0.5)) * 0.06 * Math.min(1, this.curSpeed / 3); // springy skitter
    a.headPitch = -0.25;
    if (this.state === 'leap') { a.legs = 'air'; a.arms = 'reach'; a.lean = 0.3; a.crouch = 0; }
    if (this.state === 'ride') {
      const b = Math.sin(g.time * 11) * 0.03;
      a.legs = 'air'; a.footS = 0.1; a.footF = 0.32; a.crouch = 0; a.sink = 0.05; a.speed = 0;
      a.lean = 0.35; a.hunch = 0.2; a.headPitch = 0.1;
      a.arms = 'custom';
      a.handL = [-0.11 * sc, (0.86 + b) / 0.74 * sc, 0.46 * sc];
      a.handR = [0.11 * sc, (0.86 - b) / 0.74 * sc, 0.46 * sc];
      a.poleL = [-1, 0, -0.4]; a.poleR = [1, 0, -0.4];
      a.twitch = 0.8;
      clampReach(a, this.body);
    }
  }
}

// ================================================================ SPITTER ==
// Tall and gaunt with a distended, glowing jaw. Keeps her distance, rears back
// and lobs a glob of acid that splashes into a spreading pool; flees between
// spits and leaves a small puddle when she dies.
export class Spitter extends SpecialInfected {
  constructor(mgr) {
    super(mgr, 'spitter', { id: 'spitter' }, { hp: 100, speed: 5.1, scale: 1.1, build: 0.8, height: 2.0, radius: 0.32 });
    this.spitCd = randRange(1.5, 3);
    this.clawCd = 0;
    this.shoveable = true;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }
  vocalInterval() { return randRange(2, 4); }
  vocalize() { this.game.audio.play('spitterIdle', { pos: this.pos, vol: 0.85 }); }
  mouth(out) { return out.set(this.body.jx(J.HEAD), this.body.jy(J.HEAD) - 0.08, this.body.jz(J.HEAD)); }
  think(dt) {
    const g = this.game;
    this.spitCd -= dt;
    this.clawCd -= dt;
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.6; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const d = this.pos.distanceTo(t.pos);
        const sees = this.canSee(t, 1.8);
        if (sees && d < 30 && d > 3 && this.spitCd <= 0) {
          this.state = 'spit'; this.stateT = 0; this.spat = false;
          g.audio.play('spitterHock', { pos: this.pos, vol: 1.1 });
          break;
        }
        if (d < 1.8 && this.clawCd <= 0 && Math.abs(t.pos.y - this.pos.y) < 1.5) {
          this.clawCd = 1.2;
          t.takeDamage(4 * g.difficulty.siDmg, this, 'claw');
          g.audio.play('swing', { pos: this.pos, vol: 0.6 });
        }
        if (!sees || d > 26) this.chase(dt, 5.1, t);
        else if (d < 9) this.retreat(dt, 4.8);
        else {
          // side-step at range
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
          this.curSpeed = damp(this.curSpeed, 2.2, 4, dt);
          this.faceTowards(t.pos.x, t.pos.z, 5, dt);
          if (!this.moveOnNav(-dz / dl * this.strafe * this.curSpeed * dt, dx / dl * this.strafe * this.curSpeed * dt) || Math.random() < dt * 0.3) this.strafe *= -1;
        }
        break;
      }
      case 'spit': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 10, dt);
        if (!t || t.dead) { this.state = 'stalk'; break; }
        this.faceTowards(t.pos.x, t.pos.z, 8, dt);
        if (this.stateT < 0.8 && Math.random() < 0.4) {
          this.mouth(_v);
          g.fx.alpha.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 0.2, vy: -0.4, vz: (Math.random() - 0.5) * 0.2, life: 0.8, size: 0.03, size1: 0.012, frame: FR.MIST, color: [0.35, 0.9, 0.1], alpha: 1, alpha1: 0.3, grav: 9, stretch: 0.03, lit: 0.2 });
        }
        if (this.stateT > 0.85 && !this.spat) { this.spat = true; this.spit(t); }
        if (this.stateT > 1.3) { this.state = 'flee'; this.stateT = 0; this.spitCd = randRange(18, 22); }
        break;
      }
      case 'flee':
        this.retreat(dt, 5);
        if (this.stateT > 3.5) this.state = 'stalk';
        break;
    }
  }
  spit(t) {
    const g = this.game;
    const m = this.mouth(_v);
    const dist0 = Math.hypot(t.pos.x - m.x, t.pos.z - m.z);
    const T = clamp(dist0 / 15, 0.45, 1.6);
    const tx = t.pos.x + t.phys.vx * T * 0.8, ty = t.pos.y, tz = t.pos.z + t.phys.vz * T * 0.8;
    const vx = (tx - m.x) / T, vz = (tz - m.z) / T, vy = (ty - m.y + 0.5 * GRAV * T * T) / T;
    acidOf(g).spit(m.x, m.y, m.z, vx, vy, vz, this);
    g.audio.play('spitterSpit', { pos: this.pos, vol: 1.1 });
  }
  onShoved(s, fx, fz) {
    this.stumble = { t: 0.9, vx: fx * 3.5, vz: fz * 3.5 };
    if (this.state === 'spit' && !this.spat) { this.state = 'stalk'; this.spitCd = Math.max(this.spitCd, 2); }
  }
  onDeath() {
    const g = this.game;
    const b = this.body;
    const x = b.jx(J.CHEST), y = b.jy(J.CHEST), z = b.jz(J.CHEST);
    g.audio.play('spitterDeath', { pos: this.pos, vol: 1.1 });
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5;
      g.fx.alpha.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.8, size: 0.05, size1: 0.02, frame: FR.MIST, color: [0.35, 0.95, 0.1], alpha: 1, alpha1: 0.2, grav: 12, stretch: 0.02, lit: 0.2 });
    }
    g.fx.cloud(x, y - 0.8, z, 1.2, [0.3, 0.55, 0.12], 8, 2.5);
    if (!g.net?.client) {
      const gy = g.level.col.groundHeight(this.pos.x, this.pos.y + 0.5, this.pos.z, 4, 0.2);
      acidOf(g).pool(this.pos.x, gy > -1e8 ? gy : this.pos.y, this.pos.z, { rMax: 1.5, life: 4, small: true, owner: this });
    }
  }
  animParams(a) {
    a.lean = 0.18; a.hunch = 0.22; a.twitch = 0.25; a.sway = 0.04; a.headPitch = 0.25;
    a.arms = this.curSpeed > 1 ? 'swing' : 'hang';
    if (this.state === 'spit') {
      const k = this.stateT;
      if (k < 0.85) { a.headPitch = -0.2 - 0.7 * clamp(k / 0.85, 0, 1); a.lean = -0.1 * clamp(k / 0.5, 0, 1); a.arms = 'custom'; a.handL = [-0.38, 1.05, 0.12]; a.handR = [0.38, 1.05, 0.12]; clampReach(a, this.body); }
      else { a.headPitch = 0.6; a.lean = 0.45; a.arms = 'hang'; }
      a.speed = 0;
    }
  }
}

Object.assign(SPECIAL_CLASSES, { charger: Charger, jockey: Jockey, spitter: Spitter });
export const L4D2_SPECIALS = ['charger', 'jockey', 'spitter'];
