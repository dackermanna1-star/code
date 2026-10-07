// You: moving about South Karevia. First person (or over the shoulder with
// V), walking, jogging and sprinting, crouching and lying prone, jumping,
// climbing ladders, swimming. Your camera bobs with your steps, dips when you
// land, widens when you sprint and narrows when you aim. Looking at a door, an
// item, a body or a well tells you what F will do. How much noise you make
// depends on how you move - the infected are listening.
import * as THREE from 'three';
import { O } from '../state.js';
import { def } from './inventory.js';

const EYE = { stand: 4.55, crouch: 3.05, prone: 0.95 };
const HEIGHT = { stand: 5.2, crouch: 3.6, prone: 1.6 };
const SPEED = { prone: 2.4, crouchWalk: 4.2, crouch: 7.5, walk: 6, jog: 13.5, sprint: 19.5, swim: 5.5 };
const NOISE = { prone: 1.5, crouch: 3.5, walk: 7, jog: 16, sprint: 28, swim: 8 };

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.stance = 'stand';
    this.eye = EYE.stand;
    this.grounded = true;
    this.stamina = 100;
    this.third = false;
    this.camDist = 0;
    this.bobT = 0; this.dip = 0;
    this.fov = 72;
    this.walkHeld = false;
    this.ladder = null;
    this.swimming = false;
    this.noise = 0;
    this.look = [0, 0];
    this.moving = 0;
    this.focus = null; // what F would act on
    this.fallFrom = null;
    this.indoors = false;
    this.alive = true;
    this.distance = 0;
    this._v = new THREE.Vector3();
  }

  /** Put the player somewhere. */
  place(x, z, yaw = 0, y) {
    const T = O.terrain;
    this.pos.set(x, y ?? T.heightAt(x, z), z);
    if (y === undefined) this.pos.y = O.phys.groundAt(x, this.pos.y + 50, z, 0.6, 60);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.grounded = true; this.ladder = null;
  }

  get height() { return HEIGHT[this.stance]; }
  get eyePos() { return this._v.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }

  /** Change stance if there's room to stand up. */
  setStance(s) {
    if (s === this.stance || this.ladder || this.swimming) return;
    if (HEIGHT[s] > HEIGHT[this.stance]) {
      // is there headroom?
      const h = O.phys.ray(this.pos.x, this.pos.y + HEIGHT[this.stance] - 0.2, this.pos.z, 0, 1, 0, HEIGHT[s] - HEIGHT[this.stance] + 0.3, { terrain: false });
      if (h) return;
    }
    this.stance = s;
    O.audio?.cloth(0.6);
  }

  update(dt, input) {
    const S = O.survival, inv = O.inv;
    const T = O.terrain;
    // --- looking about ---------------------------------------------------------------------------------------------
    const sens = (O.settings?.sens ?? 1) * 0.0022 * (O.weapons?.adsSens ?? 1);
    this.look = [input.mx, input.my];
    this.yaw -= input.mx * sens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - input.my * sens * (O.settings?.invert ? -1 : 1)));
    if (this.stance === 'prone') this.pitch = Math.max(-0.5, this.pitch);
    // --- moving -------------------------------------------------------------------------------------------------------
    const k = input.keys;
    let fx = 0, fz = 0;
    if (k.has('w')) fz -= 1; if (k.has('s')) fz += 1; if (k.has('a')) fx -= 1; if (k.has('d')) fx += 1;
    const len = Math.hypot(fx, fz); if (len > 0) { fx /= len; fz /= len; }
    const wantSprint = k.has('shift') && fz < 0 && !this.ladder;
    const broken = S?.brokenLeg && !(S.morphine > 0);
    const heavy = inv ? inv.weight() : 0;
    const enc = heavy > 45 ? 0.75 : heavy > 30 ? 0.9 : 1;
    let mode = this.walkHeld || k.has('control') || k.has('alt') ? 'walk' : 'jog';
    if (wantSprint && this.stamina > 2 && !broken && this.stance === 'stand' && heavy < 55 && !(O.weapons?.aiming)) mode = 'sprint';
    if (broken) mode = 'walk';
    let speed;
    if (this.swimming) { speed = SPEED.swim; mode = 'swim'; }
    else if (this.stance === 'prone') { speed = SPEED.prone; mode = 'prone'; }
    else if (this.stance === 'crouch') { speed = mode === 'walk' ? SPEED.crouchWalk : SPEED.crouch; mode = 'crouch'; }
    else speed = SPEED[mode];
    if (O.weapons?.aiming && mode !== 'prone') speed = Math.min(speed, 6.5);
    if (fx === 0 && fz === 0) mode = 'idle';
    speed *= enc * (broken ? 0.55 : 1) * (S?.slow ?? 1);
    this.mode = mode;
    // stamina
    if (mode === 'sprint' && len > 0) this.stamina = Math.max(0, this.stamina - dt * (11 + heavy * 0.12));
    else this.stamina = Math.min(S ? S.maxStamina : 100, this.stamina + dt * (mode === 'idle' ? 16 : mode === 'jog' ? 6 : 11));
    // wanted velocity, in the world
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const wx = (fx * c + fz * s) * speed, wz = (-fx * s + fz * c) * speed;
    const acc = this.grounded || this.swimming ? 10 : 1.5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (wz - this.vel.z) * Math.min(1, dt * acc);
    this.moving = Math.hypot(this.vel.x, this.vel.z) / 13.5;

    // --- ladders --------------------------------------------------------------------------------------------------------
    if (this.ladder) { this._climb(dt, fz, input); }
    else {
      // jumping
      if (input.pressed.has(' ') && this.grounded && this.stance === 'stand' && this.stamina > 10 && !broken && !this.swimming) { this.vel.y = 24; this.grounded = false; this.stamina -= 12; this.fallFrom = this.pos.y; O.audio?.jump(); }
      // grabbing a ladder you walk into
      this.ladderOff = Math.max(0, (this.ladderOff || 0) - dt);
      if (fz < 0 && this.ladderOff <= 0) this._findLadder();
      // water
      const wl = T.waterAt(this.pos.x, this.pos.z);
      const depth = wl - this.pos.y;
      this.swimming = depth > (this.swimming ? 2.9 : 3.6);
      if (this.swimming) {
        this.stance = 'stand';
        this.vel.y = (wl - 3.3 - this.pos.y) * 3;
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
        O.phys._push(this.pos, 1.05, 5, 0.8, this.vel);
        const g = O.phys.groundAt(this.pos.x, this.pos.y + 1, this.pos.z, 0.6, 2);
        if (g > this.pos.y) this.pos.y = g;
        this.pos.y += this.vel.y * dt;
        this.grounded = false; this.fallFrom = null;
        if (S) S.wet = Math.min(1, S.wet + dt * 0.6);
      } else {
        if (!this.grounded && this.fallFrom === null) this.fallFrom = this.pos.y;
        const res = O.phys.moveBody(this.pos, this.vel, dt, { r: this.stance === 'prone' ? 1.0 : 1.05, h: this.height, step: this.stance === 'prone' ? 0.8 : 1.7, grounded: this.grounded, fallFrom: this.fallFrom });
        if (res.landed) {
          const drop = (this.fallFrom ?? this.pos.y) - this.pos.y;
          this.dip = Math.min(1.2, drop * 0.06);
          if (drop > 3) O.audio?.land(drop);
          if (drop > 15) S?.fall(drop);
          this.fallFrom = null;
        }
        if (res.grounded) this.fallFrom = null;
        this.grounded = res.grounded;
        this.groundBox = res.box;
        if (depth > 1.2) { this.vel.x *= 1 - dt * 2; this.vel.z *= 1 - dt * 2; if (S) S.wet = Math.min(1, S.wet + dt * 0.08); }
      }
      // never fall out of the world
      const tg = T.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y < tg - 40 && !O.phys.holeAt(this.pos.x, this.pos.z, this.pos.y, tg)) { this.pos.y = tg; this.vel.y = 0; }
      // the edge of the map
      const lim = 3072 - 40;
      this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x)); this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    }
    // distance (for the stats on death)
    if (this._last) this.distance += Math.min(5, Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z));
    (this._last ||= new THREE.Vector3()).copy(this.pos);
    // --- noise for the infected ---------------------------------------------------------------------------------
    const surf = this.groundBox ? 1.2 : 1;
    this.noise = (NOISE[mode] ?? 0) * surf;
    // footsteps
    if (this.grounded && mode !== 'idle' && !this.ladder) {
      const before = this.bobT;
      this.bobT += dt * Math.hypot(this.vel.x, this.vel.z) * 0.55;
      if (Math.floor(before / Math.PI) !== Math.floor(this.bobT / Math.PI)) O.audio?.step(this._surface(), mode, this.pos);
    }
    // --- the camera -------------------------------------------------------------------------------------------------------
    const eyeTarget = this.swimming ? 4.2 : EYE[this.stance];
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 9);
    this.dip *= Math.exp(-dt * 7);
    if (input.pressed.has('v')) this.third = !this.third;
    this._camera(dt);
    // --- what you're looking at --------------------------------------------------------------------------------------------------
    this._focus();
  }

  _surface() {
    const b = this.groundBox;
    if (b) return b.mat === 'wood' ? 'wood' : b.mat === 'metal' ? 'metal' : 'concrete';
    const T = O.terrain;
    if (T.waterAt(this.pos.x, this.pos.z) > this.pos.y - 0.3) return 'water';
    if (T.sample(T.pavedW, this.pos.x, this.pos.z) > 0.4) return 'concrete';
    if (T.sample(T.roadW, this.pos.x, this.pos.z) > 0.4) return 'gravel';
    if (T.sample(T.forest, this.pos.x, this.pos.z) > 0.5) return 'leaves';
    return 'grass';
  }

  _camera(dt) {
    const cam = O.world.camera;
    const aiming = O.weapons?.aiming;
    const third = this.third && !aiming && this.alive;
    this.camDist += ((third ? 7.5 : 0) - this.camDist) * Math.min(1, dt * 8);
    const moving = Math.min(1, this.moving) * (this.grounded ? 1 : 0);
    const bob = this.ladder ? 0 : moving * (this.mode === 'sprint' ? 1.0 : 0.55) * (aiming ? 0.25 : 1);
    const by = -Math.abs(Math.sin(this.bobT)) * 0.16 * bob, bx = Math.cos(this.bobT) * 0.09 * bob;
    const eye = this.eyePos;
    eye.y += by - this.dip;
    // the camera's own turn: a little roll with the step, a lean when strafing
    const roll = Math.cos(this.bobT) * 0.006 * bob - (O.input?.keys.has('d') ? 0.012 : 0) + (O.input?.keys.has('a') ? 0.012 : 0);
    const sway = O.survival ? O.survival.sway : 0;
    const t = performance.now() / 1000;
    const swayY = Math.sin(t * 0.9) * 0.004 * sway + Math.sin(t * 2.3) * 0.002 * sway, swayX = Math.cos(t * 0.7) * 0.004 * sway;
    // shaken by something big going off nearby
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.5);
    const sh = this.shake * this.shake * 0.03, shX = (Math.random() - 0.5) * sh, shY = (Math.random() - 0.5) * sh;
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch + swayY + shY + (O.weapons?.kick ?? 0), this.yaw + swayX + shX, roll, 'YXZ'));
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    let px = eye.x + c * bx, pz = eye.z - s * bx;
    if (this.camDist > 0.05) {
      // over the right shoulder, pulled in if a wall's in the way
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      let side = 1.6 * Math.min(1, this.camDist / 7.5);
      const hs = O.phys.ray(px, eye.y + 0.6, pz, right.x, right.y, right.z, side + 0.4, { skip: (b) => b.noStand && b.y > eye.y + 4 });
      if (hs) side = Math.max(0, hs.d - 0.4);
      const o = new THREE.Vector3(px, eye.y + 0.6, pz).addScaledVector(right, side);
      let d = this.camDist;
      const h = O.phys.ray(o.x, o.y, o.z, back.x, back.y, back.z, d + 0.5, { skip: (b) => b.noStand && b.y > o.y + 4 });
      if (h) d = Math.max(0.3, h.d - 0.6);
      cam.position.copy(o).addScaledVector(back, d);
    } else cam.position.set(px, eye.y, pz);
    // the field of view: wider sprinting, narrower aiming
    const base = O.settings?.fov ?? 72;
    const target = aiming ? (O.weapons?.adsFov ?? base * 0.78) : this.mode === 'sprint' && moving > 0.5 ? base + 5 : base;
    this.fov += (target - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // indoors? (something solid overhead): your eyes adjust
    this._roofT = (this._roofT ?? 0) - dt;
    if (this._roofT <= 0) { this._roofT = 0.25; this.indoors = !!O.phys.ray(eye.x, eye.y + 0.5, eye.z, 0, 1, 0, 30, { terrain: false }) || eye.y < O.terrain.heightAt(eye.x, eye.z) - 3; }
  }

  _findLadder() {
    const L = O.buildings?.ladders;
    if (!L) return;
    for (const l of L) {
      const dx = this.pos.x - l.x, dz = this.pos.z - l.z;
      if (Math.abs(dx) > 2.4 || Math.abs(dz) > 2.4) continue;
      if (this.pos.y < l.y - 1 || this.pos.y > l.y + l.h - 1) continue;
      if (Math.hypot(dx, dz) > 1.9) continue;
      // facing it?
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (-(dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) < 0.4) continue;
      this.ladder = l; this.stance = 'stand';
      this.grab(l);
      return;
    }
  }
  /** Onto a ladder (from the top: a little way down it). You climb on the frame's -z side. */
  grab(l, fromTop = false) {
    this.ladder = l; this.stance = 'stand';
    this.ladderSide = [-Math.sin(l.yaw || 0), -Math.cos(l.yaw || 0)]; // you hang on its -z side; the top steps off to +z
    if (fromTop) { this.pos.set(l.x + this.ladderSide[0] * 1.15, l.y + l.h - 2.2, l.z + this.ladderSide[1] * 1.15); this.yaw = Math.atan2(this.ladderSide[0], this.ladderSide[1]); }
    this.vel.set(0, 0, 0);
    O.audio?.ladder();
  }
  _climb(dt, fz, input) {
    const l = this.ladder;
    const tx = l.x + this.ladderSide[0] * 1.15, tz = l.z + this.ladderSide[1] * 1.15;
    this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 10); this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 10);
    const up = fz < 0 ? 1 : fz > 0 ? -1 : 0;
    const before = this.pos.y;
    this.pos.y += up * 6.5 * dt;
    if (Math.floor(before / 0.9) !== Math.floor(this.pos.y / 0.9)) O.audio?.rung();
    this.grounded = false; this.fallFrom = null; this.vel.set(0, 0, 0);
    if (this.pos.y >= l.y + l.h - 0.2) {
      // off the top, onto whatever's there
      this.pos.y = l.y + l.h + 0.2;
      this.pos.x -= this.ladderSide[0] * 2.6; this.pos.z -= this.ladderSide[1] * 2.6;
      this.pos.y = O.phys.groundAt(this.pos.x, this.pos.y + 1.5, this.pos.z, 0.6, 3);
      this.ladder = null; this.grounded = true; this.ladderOff = 0.6;
    } else if (this.pos.y <= l.y + 0.05 && up < 0) { this.pos.y = l.y; this.ladder = null; this.grounded = true; }
    if (input.pressed.has(' ')) { this.ladder = null; this.ladderOff = 0.5; this.vel.set(this.ladderSide[0] * 6, 0, this.ladderSide[1] * 6); this.fallFrom = this.pos.y; }
  }

  /** What's in front of you that F would use: a door, an item, a body, a well. */
  _focus() {
    const cam = O.world.camera;
    const e = this.eyePos, d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const reach = 6.5;
    let best = null;
    const hit = O.phys.ray(e.x, e.y, e.z, d.x, d.y, d.z, reach, { terrain: true });
    const wallD = hit ? hit.d : reach;
    if (hit?.box?.door) best = { kind: 'door', door: hit.box.door, d: hit.d };
    // items lying about, close to where you're looking
    const items = O.loot?.near(e, reach + 1) || [];
    let bi = null, bs = 0.35;
    for (const w of items) {
      const vx = w.x - e.x, vy = w.y + 0.2 - e.y, vz = w.z - e.z, dist = Math.hypot(vx, vy, vz);
      if (dist > reach || dist > wallD + 0.8) continue;
      const along = (vx * d.x + vy * d.y + vz * d.z) / dist;
      const off = Math.sqrt(Math.max(0, 1 - along * along)) * dist;
      const score = off / Math.max(0.6, w.r || 0.5);
      if (along > 0.6 && score < bs) { bs = score; bi = w; }
    }
    if (bi && (!best || Math.hypot(bi.x - e.x, bi.z - e.z) < best.d + 0.5)) best = { kind: 'item', item: bi };
    // bodies
    if (!best) {
      const body = O.bodies?.lookAt(e, d, reach);
      if (body && Math.hypot(body.x - e.x, body.y + 0.6 - e.y, body.z - e.z) < wallD + 1.5) best = { kind: 'body', body };
    }
    // wells and pumps (water)
    if (!best && hit && hit.box && hit.box.well) best = { kind: 'well' };
    // the top of a ladder: climb down
    if (!best && !this.ladder) for (const l of O.buildings?.ladders || []) {
      if (Math.abs(this.pos.y - (l.y + l.h)) > 1.6 || Math.hypot(this.pos.x - l.x, this.pos.z - l.z) > 3.2) continue;
      best = { kind: 'ladder', ladder: l }; break;
    }
    this.focus = best;
  }
}

export const PLAYER_CONST = { EYE, HEIGHT, SPEED };
export { def };
