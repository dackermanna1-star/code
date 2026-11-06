// Player: movement controller, camera feel (bob, shake, FOV), and the survival stat fields the UI reads.
import * as THREE from 'three';
import { moveBody } from '../core/physics.js';
import { BLOCKS } from '../world/blocks.js';
import { PlayerInventory } from '../inventory/Inventory.js';
import { clamp, lerp } from '../core/rng.js';
import { SKILL_IDS, xpForLevel } from './professions.js';

export const PLAYER_HW = 0.3;
export const STAND_H = 1.8, CROUCH_H = 1.45;
export const STAND_EYE = 1.62, CROUCH_EYE = 1.25;

export class Player {
  constructor() {
    // body
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = PLAYER_HW; this.h = STAND_H; this.onGround = false; this.stepHeight = 0.55;
    this.yaw = 0; this.pitch = 0;
    this.eye = STAND_EYE;
    this.crouching = false; this.sprinting = false; this.inWater = false; this.onLadder = false;
    this.moving01 = 0;
    this.fallStartY = null;
    this.stepDist = 0;
    this.lastStepSide = 0;

    // identity
    this.name = 'Survivor';
    this.profession = 'unemployed';
    this.professionName = 'Unemployed';
    this.bonus = {};
    this.xpMult = 1;

    // stats (see docs/UI_API.md)
    this.health = 100; this.maxHealth = 100;
    this.hunger = 85; this.thirst = 85;
    this.stamina = 100; this.maxStamina = 100;
    this.energy = 90;
    this.bodyTemp = 37; this.wetness = 0;
    this.sickness = 0; this.panic = 0; this.pain = 0;
    this.infection = 0; this.infected = false; this.infectionKnown = false;
    this.drunk = 0; this.caffeine = 0; this.painkiller = 0; this.adrenaline = 0;
    this.wounds = [];
    this.moodles = [];
    this.skills = {};
    for (const s of SKILL_IDS) this.skills[s] = { level: 0, xp: 0, next: xpForLevel(0) };
    this.kills = 0; this.daysSurvived = 0; this.headshots = 0;
    this.weight = 0; this.maxWeight = 22;
    this.armor = { bite: 0, scratch: 0 }; this.insulation = 0; this.waterResist = 0;
    this.flashlightOn = false; this.hasWatch = false; this.hasCompass = false;
    this.scopeActive = false; this.aiming = false;
    this.dead = false; this.deathCause = '';
    this.sleeping = false;
    this.inv = new PlayerInventory();
    this.noiseLevel = 0; // last movement noise radius
    this.visibility = 1; // how visible to zombies (0..1)

    // camera feel
    this.bobT = 0; this.bobAmt = 0;
    this.shake = 0; this.punch = new THREE.Vector2(); this.punchVel = new THREE.Vector2();
    this.landDip = 0; this.fov = 75; this.fovKick = 0;
    this.speedMult = 1;
  }

  get eyeY() { return this.y + this.eye; }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  skillLevel(s) { return this.skills[s]?.level || 0; }

  /** Add XP to a skill. Returns true on level up. */
  addXP(skill, amount) {
    const s = this.skills[skill];
    if (!s || s.level >= 10) return false;
    const boost = this.xpBoost && this.xpBoost[skill] > 0 ? 2 : 1;
    s.xp += amount * this.xpMult * boost;
    let up = false;
    while (s.level < 10 && s.xp >= s.next) {
      s.xp -= s.next; s.level++; s.next = xpForLevel(s.level); up = true;
    }
    if (up) this.onLevelUp?.(skill, s.level);
    return up;
  }

  /**
   * Movement update. input: {fwd, strafe, jump, sprint, crouch}. ctx: {world, vehicles, dt, carryFactor, fatigue}
   * Returns events {footstep: surfaceMat|null, landed: fallDistance|0}
   */
  updateMovement(dt, input, ctx) {
    const { world } = ctx;
    const ev = { footstep: null, landed: 0, splash: false };
    // ladder / water detection
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    const feetId = world.get(fx, Math.floor(this.y + 0.1), fz);
    const bodyId = world.get(fx, Math.floor(this.y + 1.0), fz);
    const fd = BLOCKS[feetId], bd = BLOCKS[bodyId];
    this.onLadder = fd.climbable || bd.climbable;
    const wasInWater = this.inWater;
    this.inWater = fd.render === 'liquid' || bd.render === 'liquid';
    if (this.inWater && !wasInWater && this.vy < -3) ev.splash = true;
    const slow = Math.min(fd.slow, bd.slow);

    // crouch
    const wantCrouch = input.crouch;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) { this.crouching = true; this.h = CROUCH_H; }
      else {
        // stand up only if there is headroom
        let free = true;
        world.forEachSolidBox(this.x - this.hw, this.y + CROUCH_H, this.z - this.hw, this.x + this.hw, this.y + STAND_H, this.z + this.hw, () => { free = false; });
        if (free) { this.crouching = false; this.h = STAND_H; }
      }
    }
    this.eye = lerp(this.eye, this.crouching ? CROUCH_EYE : STAND_EYE, 1 - Math.exp(-dt * 14));

    // speed
    let speed = 4.3;
    const canSprint = !this.crouching && input.fwd > 0 && this.stamina > 2 && !ctx.noSprint;
    this.sprinting = input.sprint && canSprint && (Math.abs(input.fwd) + Math.abs(input.strafe) > 0);
    if (this.sprinting) speed = 6.2 + this.skillLevel('fitness') * 0.06;
    if (this.crouching) speed = 1.9;
    if (this.aiming) speed *= 0.55;
    speed *= slow * ctx.carryFactor * this.speedMult;
    if (this.inWater) speed *= 0.75;

    // wish direction
    let wx = 0, wz = 0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    wx += -sy * input.fwd + cy * input.strafe;
    wz += -cy * input.fwd - sy * input.strafe;
    const len = Math.hypot(wx, wz);
    if (len > 1e-3) { wx /= len; wz /= len; }
    const accel = this.onGround ? 14 : 3.2;
    const targetVx = wx * speed, targetVz = wz * speed;
    const k = 1 - Math.exp(-accel * dt);
    this.vx = lerp(this.vx, targetVx, k);
    this.vz = lerp(this.vz, targetVz, k);

    // vertical
    if (this.onLadder) {
      this.vy = input.fwd > 0 || input.jump ? 3 : input.crouch ? -3 : -1.2;
      if (this.onLadder && !input.fwd && !input.jump && !input.crouch) this.vy = 0;
      this.fallStartY = null;
    } else if (this.inWater) {
      this.vy = lerp(this.vy, input.jump ? 2.8 : -1.0, 1 - Math.exp(-dt * 4));
      this.fallStartY = null;
    } else {
      if (input.jump && this.onGround && this.stamina > 3) {
        this.vy = 8.4;
        this.onGround = false;
        this.stamina -= 4;
        ev.jumped = true;
      }
      this.vy -= 27 * dt;
      if (this.vy < -55) this.vy = -55;
    }

    const wasGround = this.onGround;
    if (!this.onGround && this.fallStartY === null) this.fallStartY = this.y;
    moveBody(world, this, dt, ctx.vehicles);
    if (this.onGround) {
      if (!wasGround && this.fallStartY !== null) {
        const fall = this.fallStartY - this.y;
        if (fall > 0.6) { ev.landed = fall; this.landDip = Math.min(0.25, fall * 0.04); }
      }
      this.fallStartY = null;
    } else if (this.fallStartY !== null && this.y > this.fallStartY) this.fallStartY = this.y;

    // footsteps / bob
    const hs = Math.hypot(this.vx, this.vz);
    this.moving01 = clamp(hs / 4.3, 0, 1.5);
    if (this.onGround && hs > 0.5) {
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 1.9 : this.crouching ? 1.1 : 1.55;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const below = world.get(fx, Math.floor(this.y - 0.05), fz);
        const bdef = BLOCKS[below];
        ev.footstep = this.inWater ? 'water' : (bdef.stepSound || bdef.mat);
      }
      this.bobT += dt * hs * (this.sprinting ? 1.55 : 1.8);
    }
    this.bobAmt = lerp(this.bobAmt, this.onGround ? clamp(hs / 6, 0, 1) : 0, 1 - Math.exp(-dt * 8));
    // movement noise radius for zombie hearing
    this.noiseLevel = !this.onGround || hs < 0.5 ? 0 : this.sprinting ? 14 : this.crouching ? 1.5 : 6;
    return ev;
  }

  /** Camera transform incl. bob / shake / recoil punch / landing dip. */
  applyCamera(camera, dt, settings) {
    // recoil punch spring
    this.punchVel.x += (-this.punch.x * 90 - this.punchVel.x * 14) * dt;
    this.punchVel.y += (-this.punch.y * 90 - this.punchVel.y * 14) * dt;
    this.punch.x += this.punchVel.x * dt;
    this.punch.y += this.punchVel.y * dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.landDip = Math.max(0, this.landDip - dt * 0.9);
    const bob = settings.headBob === false ? 0 : this.bobAmt;
    const bx = Math.cos(this.bobT) * 0.045 * bob;
    const by = Math.abs(Math.sin(this.bobT)) * 0.06 * bob;
    const s = this.shake * this.shake;
    const t = performance.now() / 1000;
    const shx = (Math.sin(t * 37) + Math.sin(t * 23.3)) * 0.02 * s;
    const shy = (Math.cos(t * 31) + Math.sin(t * 19.7)) * 0.02 * s;
    const sx = Math.cos(this.yaw), sz = -Math.sin(this.yaw);
    camera.position.set(this.x + sx * bx, this.y + this.eye + by - this.landDip, this.z + sz * bx);
    camera.rotation.set(this.pitch + this.punch.x + shy, this.yaw + this.punch.y + shx, Math.sin(this.bobT * 0.5) * 0.004 * bob + shx * 0.5);
    // fov
    const targetFov = (settings.fov || 75) + (this.sprinting ? 6 : 0) + this.fovKick;
    this.fov = lerp(this.fov, targetFov, 1 - Math.exp(-dt * 10));
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }

  addPunch(pitch, yaw) {
    this.punchVel.x += pitch;
    this.punchVel.y += yaw;
  }
}
