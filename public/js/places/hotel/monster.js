// The Night Manager's mind. He rides the lifts between floors (the dials
// over the doors show where he is), walks the corridors with a dragging
// step, listens for footsteps, doors and breathing, and looks for you -
// better if your flashlight is in his face, worse if you're crouched in the
// dark. When he sees you he stops, tilts his head, screams, and comes for
// you on all fours. He opens wardrobes. He doesn't take the stairs.
import * as THREE from 'three';
import { H } from './state.js';
import { Rig } from './rig.js';
import { GROUP } from '../../engine/Part.js';

const SPEED = { patrol: 5.6, search: 6.4, investigate: 9.5, chase: 15.8, rage: 17.4 };
const CARS = { F3: ['e3w', 'e3e'], F1: ['e1w', 'e1e'], B: ['eBw'] };
const FNUM = { F3: 3, F1: 1, B: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angDiff = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function playerFloor(p) {
  if (H.stairBox?.containsPoint(p)) return 'S';
  return p.y > 22 ? 'F3' : p.y > 8 ? 'F2' : p.y > -8 ? 'F1' : 'B';
}

export class Monster {
  constructor() {
    this.rig = new Rig();
    this.root = this.rig.root;
    H.world.scene.add(this.root);
    this.root.visible = false;
    this.active = false; this.state = 'off'; this.visibleBody = false;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.head = new THREE.Vector3();
    this.node = null; this.path = null; this.pi = 0;
    this.aware = 0; this.lastSeen = null; this.seenT = -99; this.lostT = 0;
    this.t = 0; this.st = 0; // time in state
    this.rage = false; this.finale = false;
    this.recent = [];
    this.anim = { gait: 'stand', hunch: 0.5, jaw: 0, reach: 0, spread: 0, crouch: 0, headYaw: 0, headPitch: 0.1, headRoll: 0.15, sniff: 0, lean: 0, shake: 0 };
    this.speedNow = 0;
    this.stepAcc = 0;
    this.checking = null;
    H.monster = this;
    H.noise = (pos, r, kind) => this.hear(pos, r, kind);
  }
  get floor() { return this.node?.floor || null; }

  // --- director's controls --------------------------------------------------------------------------------------------------------
  /** Bring him up (or down) in a lift to a floor. o: {car: id, then: fn | 'patrol', delay, ride (seconds)} */
  arrive(floor, o = {}) {
    if (this.state !== 'off') this.despawn();
    const cars = CARS[floor];
    let id = o.car;
    if (!id) {
      const pp = H.player.pos;
      id = cars.slice().sort((a, b) => H.nav.get(a + ':o').p.distanceTo(pp) - H.nav.get(b + ':o').p.distanceTo(pp))[o.far ? cars.length - 1 : 0];
    }
    const car = H.nav.get(id + ':i'), front = H.nav.get(id + ':o');
    const lift = this._lift(id);
    const from = o.from ?? (floor === 'F3' ? 1 : 3);
    this.patrolT = 0;
    this.state = 'ride'; this.st = 0; this.ride = { id, car, front, lift, floor, from, to: FNUM[floor], t: 0, dur: o.ride ?? 5, then: o.then || 'patrol', opened: false };
    this.node = car; this.pos.copy(car.p); this.yaw = Math.PI; // facing out of the car (+z)
    this.active = true; this.visibleBody = true; this.root.visible = true;
    this.aware = 0; this.lastSeen = null;
    H.audio?.motor(front.p, this.ride.dur);
    H.story?.event('m:ride', floor);
  }
  _lift(id) {
    const shaft = id[2] === 'w' ? 0 : 1, f = { 3: 3, 1: 1, B: 0 }[id[1]];
    return { me: H.elev[f]?.[shaft], all: [3, 1, 0].map((n) => H.elev[n]?.[shaft]).filter(Boolean) };
  }
  /** Walk back to a lift on this floor and ride away. */
  leave(o = {}) {
    if (!this.active || this.state === 'leave' || this.state === 'kill') return;
    const cars = CARS[this.floor];
    if (!cars) { this.despawn(); return; }
    const id = cars.slice().sort((a, b) => H.nav.get(a + ':o').p.distanceTo(this.pos) - H.nav.get(b + ':o').p.distanceTo(this.pos))[0];
    this.state = 'leave'; this.st = 0; this.leaving = { id, front: H.nav.get(id + ':o'), car: H.nav.get(id + ':i'), lift: this._lift(id), stage: 0, to: o.to ?? (this.floor === 'F3' ? 1 : 3) };
    this.goTo(this.leaving.front);
  }
  despawn() {
    this.state = 'off'; this.active = false; this.visibleBody = false; this.root.visible = false; this.path = null; this.checking = null;
    H.lights.drainAt = null;
  }
  /** Story control: walk this route (node ids), then call done. */
  script(ids, o = {}) {
    this.state = 'script'; this.st = 0;
    this.scr = { ids: ids.slice(), o, i: 0 };
    this._nextScript();
  }
  _nextScript() {
    const s = this.scr;
    if (s.i >= s.ids.length) { const d = s.o.done; this.state = 'patrol'; this.st = 0; this.path = null; d?.(); return; }
    const step = s.ids[s.i++];
    if (typeof step === 'function') { step(this); if (this.state === 'script') this._nextScript(); return; }
    if (typeof step === 'number') { this.wait = step; this.path = null; return; }
    this.goTo(H.nav.get(step), { speed: s.o.speed });
  }
  investigate(p, loud = false) {
    if (!this.active || ['off', 'ride', 'kill', 'spot', 'script', 'leave', 'chase', 'recoil'].includes(this.state)) return;
    const n = H.nav.nearest(p, { floor: this.floor, maxDy: 6 });
    if (!n) return;
    this.state = 'investigate'; this.st = 0; this.target = p.clone(); this.loud = loud;
    this.goTo(n);
    if (Math.random() < 0.5 || loud) H.audio?.sniff(this.head);
  }
  startChase() {
    // if you've already vanished (into a wardrobe he didn't see you get into), he hunts round instead
    if (H.player?.hidden && this.t - this.seenT > 0.8) { this._search(this.lastSeen || this.pos); return; }
    this.state = 'chase'; this.st = 0; this.aware = Math.max(this.aware, 1); this.repath = 0;
    H.story?.event('m:chase');
  }

  // --- moving about -------------------------------------------------------------------------------------------------------------------------
  goTo(target, o = {}) {
    const from = this.path && this.pi < this.path.length && this.path[this.pi] ? this.path[this.pi] : (this.node || H.nav.nearest(this.pos, { floor: this.floor }));
    // (at the end he follows you anywhere - up the stairs included - so he looks for the point nearest you on your floor)
    let to = target;
    if (target instanceof THREE.Vector3) {
      const fl = this.finale ? playerFloor(target) : this.floor;
      to = H.nav.nearest(target, { floor: fl === 'F2' ? 'S' : fl, maxDy: 8 }) || (this.finale ? H.nav.nearest(target, { maxDy: 8 }) : null);
    }
    if (!from || !to) { this.path = null; return false; }
    const p = H.nav.path(from, to, { stairs: this.finale || o.stairs, elevator: o.elevator });
    if (!p) { this.path = null; return false; }
    // keep walking to the node we were heading for (no turning on the spot mid-corridor)
    if (from !== this.node && this.pos.distanceTo(from.p) > 0.3) { this.path = p; this.pi = 0; }
    else { this.path = p; this.pi = 1; }
    this.pathSpeed = o.speed;
    return true;
  }
  /** Step along the path. Returns 'done', 'moving' or 'door'. */
  _move(dt, speed) {
    if (!this.path || this.pi >= this.path.length) return 'done';
    const next = this.path[this.pi], prev = this.pi > 0 ? this.path[this.pi - 1] : this.node;
    const link = prev && prev !== next ? H.nav.edge(prev, next) : null;
    if (link?.door && !this._door(link.door, dt)) { this.speedNow = 0; return 'door'; }
    _v.copy(next.p).sub(this.pos); _v.y = 0;
    const dist = _v.length(), step = speed * dt;
    const want = Math.atan2(_v.x, _v.z);
    if (dist > 0.05) this.yaw += clamp(angDiff(want, this.yaw), -dt * (this.state === 'chase' ? 9 : 4.5), dt * (this.state === 'chase' ? 9 : 4.5));
    // he slows to turn corners
    const turn = Math.abs(angDiff(want, this.yaw));
    const sp = step * (turn > 1.2 ? 0.35 : 1);
    if (dist <= sp) { this.pos.copy(next.p); this.node = next; this.pi++; this.speedNow = speed; this._walked(dist); return this.pi >= this.path.length ? 'done' : 'moving'; }
    const startY = prev ? prev.p.y : this.pos.y, total = prev ? Math.hypot(next.p.x - prev.p.x, next.p.z - prev.p.z) : dist;
    this.pos.addScaledVector(_v, sp / dist);
    if (prev && Math.abs(next.p.y - startY) > 0.01 && total > 0.01) this.pos.y = startY + (next.p.y - startY) * clamp(1 - (dist - sp) / total, 0, 1);
    this.speedNow = speed * (turn > 1.2 ? 0.35 : 1);
    this._walked(sp);
    return 'moving';
  }
  _walked(d) {
    this.moved = (this.moved || 0) + d;
    this.stepAcc += d;
    const crawl = this.anim.gait === 'crawl';
    const stride = crawl ? 3.75 : 2.6;
    if (this.stepAcc > stride) {
      this.stepAcc -= stride;
      if (crawl) H.audio?.mRun(this.pos); else { this._limp = !this._limp; H.audio?.mStep(this.pos, this._limp ? 1 : 0.7, this._limp); if (Math.random() < 0.3) H.audio?.keys(this.pos, 0.5); }
      if (H.player && this.pos.distanceTo(H.player.pos) < 14) H.player.shake(crawl ? 0.25 : 0.12);
    }
  }
  /** A door in the way: open it (or smash through it when he's after you). */
  _door(door, dt) {
    if (door.isOpen && door.openAmount > 0.55) return true;
    const d = Math.hypot(door.center.x - this.pos.x, door.center.z - this.pos.z);
    if (this.state === 'chase' || this.finale) {
      if (d < 5.5) { door.burst(); H.audio?.burst(door.center); H.player?.shake(0.6); }
      return d >= 5.5 ? true : door.openAmount > 0.25;
    }
    if (d > 3.2) return true;
    if (!this.doorT) { this.doorT = 0.7; H.audio?.button(door.center); }
    this.doorT -= dt;
    if (this.doorT <= 0 && !door.isOpen) { door.locked = false; door.setOpen(true); }
    if (door.openAmount > 0.55) { this.doorT = 0; return true; }
    return false;
  }

  // --- senses --------------------------------------------------------------------------------------------------------------------------------
  /** How clearly he can see you right now (0 = not at all). */
  sight() {
    const P = H.player;
    if (!P || P.mode === 'dead' || P.mode === 'intro' || P.mode === 'end' || P.mode === 'cut') return 0;
    if (P.hidden) return 0;
    const pp = P.pos;
    if (!this.finale && H.stairBox?.containsPoint(pp)) return 0;
    const eye = this.head, tgt = P.chest;
    const d = eye.distanceTo(tgt);
    if (d > 58) return 0;
    _v.copy(tgt).sub(eye).normalize();
    const look = this.yaw + this.anim.headYaw * 0.8;
    const cos = Math.sin(look) * _v.x + Math.cos(look) * _v.z;
    const wide = this.state === 'chase' || this.state === 'search' || this.state === 'investigate';
    if (d > 4.5 && cos < (wide ? -0.25 : 0.38)) return 0;
    const hit = H.world.raycast(eye, tgt, { mask: GROUP.WORLD });
    if (hit && hit.distance < d - 0.6) {
      const h2 = H.world.raycast(eye, P.camPos, { mask: GROUP.WORLD });
      if (h2 && h2.distance < eye.distanceTo(P.camPos) - 0.6) return 0;
    }
    let vis = 0.22 + Math.min(1.3, P.lit || 0) * 0.75;
    if (P.flashOn) { _w.copy(eye).sub(P.camPos).normalize(); vis += _w.dot(P.camDir) > 0.82 ? 1.7 : 0.5; }
    if (P.crouch > 0.5) vis *= 0.5;
    if (P.running) vis *= 1.35;
    vis *= clamp(1.45 - d / 38, 0.18, 1.45);
    if (d < 6.5) vis = 8;
    return vis;
  }
  hear(pos, r, kind) {
    if (!this.active || ['off', 'ride', 'kill', 'spot', 'leave', 'recoil'].includes(this.state)) return;
    if (Math.abs(pos.y - this.pos.y) > 9) return;
    const d = pos.distanceTo(this.pos);
    let R = r * (this.rage ? 1.3 : 1);
    if (d > R) return;
    const hit = H.world.raycast(this.head, _v.copy(pos).setY(pos.y + 2), { mask: GROUP.WORLD });
    if (hit && hit.distance < d - 1) R *= 0.55;
    if (d > R) return;
    if (this.state === 'chase') { this.lastSeen = pos.clone(); return; }
    if (this.state === 'script') return;
    if (this.state === 'check' && (kind === 'breath' || kind === 'gasp') && this.checking === H.player?.spot) { this.heardT = 9; return; }
    this.investigate(pos, r >= 18);
  }

  // --- the frame -------------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.state === 'off') { this.rig.root.visible = false; return; }
    const P = H.player;
    const A = this.anim;
    A.gait = 'stand'; A.jaw = 0; A.reach = 0; A.spread = 0; A.crouch = 0; A.lean = 0; A.sniff = 0; A.shake = 0; A.headPitch = 0.08; A.hunch = 0.5; A.headRoll = 0.3;
    let speed = 0;
    const vis = this.state !== 'ride' ? this.sight() : 0;
    const seen = vis > 0;
    if (seen) { this.aware = Math.min(1.5, this.aware + vis * dt * 1.7); this.lastSeen = P.pos.clone(); this.seenT = this.t; }
    else this.aware = Math.max(0, this.aware - dt * 0.22);
    // look at you if he can see you, otherwise where he's going (and round about)
    const lookAt = (p, k = 1) => { const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); A.headYaw = clamp(angDiff(a, this.yaw), -1.2, 1.2) * k; };
    switch (this.state) {
      case 'ride': {
        const r = this.ride;
        r.t += dt;
        const k = clamp(r.t / r.dur, 0, 1);
        const f = r.from + (r.to - r.from) * (k * k * (3 - 2 * k));
        for (const e of r.lift.all) e.setFloor(f);
        A.headPitch = 0.45; A.headRoll = 0.1;
        if (r.t >= r.dur && !r.opened) { r.opened = true; H.audio?.ding(r.front.p); r.lift.me?.setOpen(true); H.story?.event('m:arrive', r.floor); }
        if (r.opened) { A.headPitch = r.t > r.dur + 1.2 ? -0.05 : 0.45; if (P) lookAt(P.pos, r.t > r.dur + 1.2 ? 0.6 : 0); }
        if (r.opened && r.t > r.dur + 2.2) {
          this.node = r.car; this.state = 'arrive'; this.st = 0; this.goTo(r.front, { elevator: true });
        }
        break;
      }
      case 'arrive': {
        speed = SPEED.patrol;
        const res = this._move(dt, speed);
        if (res === 'done') {
          this.ride.lift.me?.setOpen(false);
          const then = this.ride.then;
          if (typeof then === 'function') { this.state = 'patrol'; this.st = 0; this.path = null; then(this); } else { this.state = 'patrol'; this.st = 0; this.path = null; }
        }
        break;
      }
      case 'patrol': {
        // at the end there's no giving up: the moment you're out of hiding he's coming again
        if (this.finale && P && !P.hidden && P.mode === 'play' && this.st > 1.2) { this.startChase(); break; }
        // he doesn't stay on one floor all night: after a while without finding anyone he moves on
        this.patrolT = (this.patrolT || 0) + dt;
        if (this.patrolT > (this.patrolMax || 75) && !this.finale && !H.story?.keepHunting?.()) { this.patrolT = 0; this.leave(); break; }
        if (this.wait > 0) { this.wait -= dt; A.headYaw = Math.sin(this.t * 0.9) * 0.9; A.headRoll = 0.25; if (this.wait <= 0) this.path = null; break; }
        if (!this.path || this.pi >= this.path.length) { if (!this._pickPatrol()) { this.wait = 2; } else if (Math.random() < 0.3) H.audio?.mHum(this.head); }
        speed = SPEED.patrol * (this.rage ? 1.15 : 1);
        if (this._move(dt, speed) === 'done') { this.wait = rnd(2, 5); this.path = null; if (Math.random() < 0.4) H.audio?.sniff(this.head); }
        if (this.pendingCheck && this.path === null) { const sp = this.pendingCheck; this.pendingCheck = null; this._beginCheck(sp); break; }
        A.gait = 'walk'; A.headRoll = 0.12 + Math.sin(this.t * 0.4) * 0.12;
        A.headYaw = Math.sin(this.t * 0.6) * 0.5;
        this._maybeCheckNearby(dt);
        if (this.aware >= 1 && seen) this._spot();
        break;
      }
      case 'investigate': {
        speed = this.loud ? SPEED.investigate * 1.25 : SPEED.investigate;
        A.gait = 'walk'; A.hunch = 0.5; A.headPitch = 0.0;
        if (this.target) lookAt(this.target, 0.7);
        if (this._move(dt, speed) === 'done') { this._search(this.target); }
        if (this.aware >= 1 && seen) this._spot();
        break;
      }
      case 'spot': {
        // the moment he sees you: he stops, his head tips over, then the scream
        if (P) lookAt(P.pos, 1);
        const s = this.st;
        A.headRoll = s < 0.55 ? 0.15 + s * 2.2 : 1.35;
        A.jaw = s > 0.65 ? Math.min(1.15, (s - 0.65) * 4) : 0;
        A.spread = s > 0.7 ? 1 : 0; A.shake = s > 0.7 ? 0.5 : 0;
        A.hunch = 0.15;
        if (s > 0.65 && !this.screamed) { this.screamed = true; H.audio?.scream(this.head, 1); H.audio?.stinger(1); H.post?.hit(0.25, 0x400000); }
        const want = P ? Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) : this.yaw;
        this.yaw += clamp(angDiff(want, this.yaw), -dt * 5, dt * 5);
        if (s > (this.rage ? 1.0 : 1.45)) this.startChase();
        break;
      }
      case 'chase': {
        A.gait = 'crawl'; A.jaw = 0.35; A.hunch = 0.4;
        speed = this.finale ? this._finaleSpeed() : this.rage ? SPEED.rage : SPEED.chase;
        if (P) lookAt(P.pos, 0.9);
        // you hear him the whole way: snarling, and at the end shrieking
        this.raspT = (this.raspT ?? 0.8) - dt;
        if (this.raspT <= 0) { this.raspT = rnd(2, 3.8); H.audio?.mRasp(this.head, this.finale ? 1.25 : 1); }
        if (this.finale) { this.shriekT = (this.shriekT ?? 6) - dt; if (this.shriekT <= 0) { this.shriekT = rnd(6, 10); H.audio?.scream(this.head, 0.5); } }
        const pp = P?.pos;
        this.repath -= dt;
        // (at the end he doesn't need to see you: he knows)
        const goal = seen || this.finale ? pp : this.lastSeen;
        if (goal && (this.repath <= 0 || !this.path)) { this.repath = seen ? 0.3 : this.finale ? 0.5 : 1; this.goTo(goal); }
        if (this.finale && P?.hidden && !this.ripSpot && this.t - this.seenT > 0.8) { this._search(pp); break; }
        if (P?.hidden && this.t - this.seenT < 0.8 && !this.ripSpot) this.ripSpot = P.spot; // he saw you get in
        if (this.ripSpot) { this._rip(this.ripSpot, dt); break; }
        const res = this._move(dt, speed);
        // in reach: that's it
        if (pp && !P.hidden && P.mode === 'play' && Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z) < 2.9 && Math.abs(pp.y - this.pos.y) < 4) { this.kill(); break; }
        // the stairs are safe (until the end)
        if (!this.finale && P && H.stairBox?.containsPoint(pp) && !seen) { this._stareAtStairs(); break; }
        if (!seen && !this.finale && (res === 'done' || !this.path)) {
          if (this.t - this.seenT > 1.5) this._search(this.lastSeen);
        }
        if (!seen && !this.finale && this.t - this.seenT > 9) this._search(this.lastSeen);
        break;
      }
      case 'search': {
        speed = SPEED.search;
        A.gait = 'walk'; A.hunch = 0.55; A.sniff = this.st % 4 < 1.2 ? 1 : 0;
        A.headYaw = Math.sin(this.t * 1.3) * 1.0;
        if (this.wait > 0) { this.wait -= dt; A.gait = 'stand'; if (this.wait <= 0) this.path = null; }
        else if (!this.path || this.pi >= this.path.length) this._nextSearch();
        else { const res = this._move(dt, speed); if (res === 'done') { if (this.pendingCheck) { this._beginCheck(this.pendingCheck); this.pendingCheck = null; } else this.wait = rnd(1, 2.5); } }
        if (this.aware >= 0.7 && seen) this._spot(true);
        if (this.st > 32) this._endSearch();
        break;
      }
      case 'check': {
        const sp = this.checking;
        A.gait = 'stand'; A.lean = 0.75; A.crouch = 0.3; A.sniff = this.st > 0.6 ? 1 : 0; A.headRoll = 0.55 + Math.sin(this.t * 0.7) * 0.25;
        const want = Math.atan2(sp.inside.x - this.pos.x, sp.inside.z - this.pos.z);
        this.yaw += clamp(angDiff(want, this.yaw), -dt * 4, dt * 4);
        if (this.st > 0.6 && !this.sniffed) { this.sniffed = true; H.audio?.sniff(this.head); }
        const inside = H.player?.spot === sp;
        if (inside && this.st > 0.8) {
          if (!H.player.holding) this.heardT = (this.heardT || 0) + dt;
          if (H.player.gasped) this.heardT = 9;
          if (this.heardT > 0.8) { this._rip(sp); break; }
        }
        if (this.st > this.checkDur) {
          this.checking = null;
          if (!inside && Math.random() < 0.45) { sp.setOpen(1, 10); H.audio?.wardrobe(sp.front, true, sp.kind); this.world_delay(1.2, () => { if (!sp.occupied) sp.setOpen(0, 2); }); }
          H.story?.event('m:checked', sp);
          this.st = 0;
          const ac = this.afterCheck;
          if (ac) { this.afterCheck = null; this.state = 'patrol'; this.path = null; ac(); }
          else if (this.searching) { this.state = 'search'; this.wait = 0.8; this.path = null; }
          else { this.state = 'patrol'; this.wait = 1; this.path = null; }
        }
        break;
      }
      case 'rip': {
        // tearing the doors open
        const sp = this.ripping;
        A.reach = 1; A.jaw = 1; A.shake = 0.3; A.lean = 0.5;
        const want = Math.atan2(sp.inside.x - this.pos.x, sp.inside.z - this.pos.z);
        this.yaw += clamp(angDiff(want, this.yaw), -dt * 8, dt * 8);
        if (this.st > 0.35 && !this.ripped) { this.ripped = true; sp.setOpen(1, 12); H.audio?.burst(sp.front); H.player?.shake(1); }
        if (this.st > 0.55) { if (H.player?.spot === sp) this.kill(); else { this.ripSpot = null; this._search(sp.front); } }
        break;
      }
      case 'stare': {
        A.headRoll = 0.9; A.jaw = 0.15;
        if (this.aware >= 1 && seen) { this._spot(); break; }
        if (P) { lookAt(P.pos, 1); const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); this.yaw += clamp(angDiff(want, this.yaw), -dt * 1.5, dt * 1.5); }
        if (this.st > (this.stareFor || 5)) { this.stareFor = 0; if (this.afterStare) { const f = this.afterStare; this.afterStare = null; f(); } else this.leave(); }
        break;
      }
      case 'leave': {
        const L = this.leaving;
        A.gait = 'walk';
        if (L.stage === 0) {
          speed = SPEED.patrol * 1.1;
          if (this._move(dt, speed) === 'done') { L.stage = 1; L.t = 0; L.lift.me?.setOpen(true); H.audio?.ding(L.front.p); }
          if (this.aware >= 1 && seen) this._spot();
        } else if (L.stage === 1) {
          A.gait = 'stand'; L.t += dt;
          if (L.t > 1.6) { L.stage = 2; this.path = [L.front, L.car]; this.pi = 1; }
        } else if (L.stage === 2) {
          speed = SPEED.patrol;
          if (this._move(dt, speed) === 'done') { L.stage = 3; L.t = 0; }
        } else {
          // he turns round to face out as the doors close on him
          A.gait = 'stand'; L.t += dt;
          this.yaw += clamp(angDiff(0, this.yaw), -dt * 2.5, dt * 2.5);
          A.headPitch = 0.4;
          if (L.t > 1.2 && !L.closing) { L.closing = true; L.lift.me?.setOpen(false); }
          if (L.t > 3.2) {
            const fromF = FNUM[this.floor] ?? 1;
            this.despawn();
            let k = 0; const all = L.lift.all;
            const tick = () => { k += 0.05; const f = fromF + (L.to - fromF) * Math.min(1, k / 3); for (const e of all) e.setFloor(f); if (k < 3) H.world.delay(0.05, tick); };
            tick();
            H.story?.event('m:left');
          }
        }
        break;
      }
      case 'script': {
        if (this.wait > 0) { this.wait -= dt; A.gait = 'stand'; A.headYaw = Math.sin(this.t * 0.8) * 0.7; A.sniff = this.scr?.o.sniff ? 1 : 0; if (this.wait <= 0) this._nextScript(); break; }
        speed = this.pathSpeed || SPEED.patrol;
        A.gait = speed > 12 ? 'crawl' : 'walk';
        if (this._move(dt, speed) === 'done') this._nextScript();
        if (this.scr?.o.watch && this.aware >= 1 && seen) this._spot();
        break;
      }
      case 'recoil': {
        // the doors open on the night and he rears back from it, shrieking - the hotel won't let him out
        const s = this.st;
        A.gait = 'stand'; A.jaw = 1.25; A.spread = s < 1.1 ? 1 : 0.4; A.shake = s < 1.3 ? 1 : 0.3; A.hunch = 0.05; A.headPitch = -0.35; A.headRoll = 0.25 + Math.sin(this.t * 9) * 0.15;
        const back = Math.max(0, 1 - s) * 3.2 * dt;
        this.pos.x -= Math.sin(this.yaw) * back; this.pos.z -= Math.cos(this.yaw) * back;
        if (P) lookAt(P.pos, 1);
        if (s > 1.9) { this.path = null; this.startChase(); }
        break;
      }
      case 'kill': this._killFrame(dt); break;
      case 'pose': Object.assign(A, this.poseAnim || {}); if (this.poseAnim?.gait === 'crawl' || this.poseAnim?.gait === 'walk') { this.moved = (this.poseAnim.v || 8) * dt; this.speedNow = this.poseAnim.v || 8; } break;
      default: break;
    }
    // where he's looking from
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.visible = this.visibleBody;
    A.speed = this.speedNow / 6; A.moved = this.state === 'kill' ? 0 : (this.moved || 0); this.moved = 0;
    A.look = P?.camPos;
    if (A.gait === 'stand') A.speed = 0;
    this.rig.update(dt, A);
    this.rig.headWorld(this.head);
    this.speedNow = 0;
    // the lights gutter round him
    H.lights.drainAt = this.visibleBody ? this.pos : null;
    H.lights.drainR = this.state === 'chase' ? 22 : 16;
  }
  world_delay(s, f) { H.world.delay(s, f); }

  // --- behaviours ---------------------------------------------------------------------------------------------------------------------------
  _pickPatrol() {
    const pois = H.nav.pois(this.floor).filter((n) => !this.recent.includes(n));
    if (!pois.length) return false;
    const P = H.player, pp = P?.pos, same = pp && playerFloor(pp) === this.floor;
    let tot = 0;
    const w = pois.map((n) => { let x = 1; if (same) { const d = n.p.distanceTo(pp); x += 4 * Math.exp(-((d - 16) * (d - 16)) / 260); } x *= 0.5 + Math.random(); tot += x; return x; });
    let r = Math.random() * tot, pick = pois[0];
    for (let i = 0; i < pois.length; i++) { r -= w[i]; if (r <= 0) { pick = pois[i]; break; } }
    this.recent.push(pick); if (this.recent.length > 3) this.recent.shift();
    return this.goTo(pick);
  }
  _maybeCheckNearby(dt) {
    this._chk = (this._chk || 0) - dt;
    if (this._chk > 0) return;
    this._chk = 1.2;
    for (const sp of H.spots) {
      if (!sp.node || sp.node.floor !== this.floor) continue;
      if (sp.front.distanceTo(this.pos) > 6.5) continue;
      if (this.lastChecked === sp && this.t - this.lastCheckT < 40) continue;
      const inside = H.player?.spot === sp;
      if (Math.random() < (inside ? 0.33 : 0.08)) { this.searching = false; this.goTo(sp.node); this.pendingCheck = sp; this.state = 'search'; this.st = 0; this.searchList = []; return; }
    }
  }
  _spot(fromSearch = false) {
    if (this.state === 'spot' || this.state === 'chase') return;
    this.patrolT = 0;
    this.state = 'spot'; this.st = 0; this.screamed = false; this.path = null;
    if (fromSearch) this.st = 0.5;
    H.story?.event('m:spot');
  }
  _search(around) {
    this.state = 'search'; this.st = 0; this.searching = true; this.ripSpot = null;
    this.aware = Math.min(this.aware, 0.35);
    const at = around || this.pos;
    // the hiding places nearest where he lost you (the one you're in is likely among them)
    const spots = H.spots.filter((s) => s.node && s.node.floor === this.floor && s.front.distanceTo(at) < 26).sort((a, b) => a.front.distanceTo(at) - b.front.distanceTo(at)).slice(0, 3);
    if (H.player?.spot && spots.includes(H.player.spot) === false && H.player.spot.node?.floor === this.floor && H.player.spot.front.distanceTo(at) < 34 && Math.random() < 0.6) spots.push(H.player.spot);
    this.searchList = spots;
    this.searchAt = at.clone();
    this.path = null; this.wait = 0.6;
    H.story?.event('m:search');
  }
  _nextSearch() {
    this.pendingCheck = null;
    const sp = this.searchList?.shift();
    if (sp) { this.goTo(sp.node); this.pendingCheck = sp; return; }
    // nothing left to look in: wander round where you were, then give up
    if (this.st < 18 && this.searchAt) { const n = H.nav.nearest(this.searchAt.clone().add(new THREE.Vector3(rnd(-10, 10), 0, rnd(-10, 10))), { floor: this.floor }); if (n) { this.goTo(n); return; } }
    this._endSearch();
  }
  _endSearch() {
    this.searching = false;
    H.story?.event('m:lost');
    if (H.story?.keepHunting?.()) { this.state = 'patrol'; this.st = 0; this.path = null; }
    else this.leave();
  }
  _beginCheck(sp) {
    if (sp.occupied && H.player?.spot !== sp) { this.state = 'search'; return; }
    this.state = 'check'; this.st = 0; this.checking = sp; this.heardT = 0; this.sniffed = false;
    this.checkDur = rnd(3.2, 5.0);
    this.lastChecked = sp; this.lastCheckT = this.t;
    if (H.player?.spot === sp) H.story?.event('m:checking', sp);
  }
  _rip(sp, dt = 1 / 60) {
    if (this.state !== 'rip') {
      // first walk up to it
      const d = sp.front.distanceTo(this.pos);
      if (d > 2.6) { if (!this.path || this.path[this.path.length - 1] !== sp.node) this.goTo(sp.node); this._move(dt, SPEED.chase); this.anim.gait = 'crawl'; if (this.path && this.pi >= this.path.length && d > 2.6) { this.pos.lerp(sp.front, Math.min(1, dt * 3)); } return; }
      this.state = 'rip'; this.st = 0; this.ripping = sp; this.ripped = false; this.checking = null;
    }
  }
  _stareAtStairs() {
    const door = H.nav.nearest(H.player.pos.clone().setX(-70), { floor: this.floor });
    this.state = 'script'; this.st = 0;
    this.scr = { ids: [door?.id || this.node.id], o: { speed: SPEED.investigate, done: () => { this.state = 'stare'; this.st = 0; this.stareFor = 6; this.afterStare = () => { H.audio?.knock(H.obj.dStairs3?.center || this.pos, 3, 1.2, 0.25); this.leave(); }; } }, i: 0 };
    this._nextScript();
  }
  _finaleSpeed() {
    // rubber-banded: never far behind, never quite as fast as you running flat out (you have to keep going)
    const P = H.player; if (!P) return SPEED.chase;
    const d = this.pos.distanceTo(P.pos);
    // while you're cutting the chain he closes in - he's right at your back as it gives
    if (H.story?.cutting) return clamp((d - 2.6) / 1.2, 1, 15);
    return d > 20 ? 19.5 : d > 11 ? 17 : d < 6 ? 14 : 16;
  }
  /** The front doors swing open: he flinches back from the outside. */
  recoil() {
    if (!this.active || ['off', 'kill', 'recoil'].includes(this.state)) return;
    this.state = 'recoil'; this.st = 0; this.path = null; this.ripSpot = null;
    H.audio?.scream(this.head, 1.15);
  }

  // --- the end of you --------------------------------------------------------------------------------------------------------------------------
  kill() {
    if (this.state === 'kill') return;
    const P = H.player;
    this.state = 'kill'; this.st = 0; this.checking = null;
    P.mode = 'dead';
    if (P.spot) { P.spot.setOpen(1, 12); }
    this.killFrom = this.pos.clone();
    this.killCam = P.camPos.clone();
    this.killDir = P.camDir.clone().setY(0).normalize();
    if (this.killDir.lengthSq() < 0.01) this.killDir.set(0, 0, -1);
    // he comes at you from where he is
    _v.copy(this.pos).sub(this.killCam).setY(0);
    if (_v.lengthSq() > 0.1) this.killDir.copy(_v.normalize());
    P.override = { pos: this.killCam.clone(), look: this.head.clone(), fov: 66 };
    H.audio?.jumpscare();
    H.post?.hit(1.0, 0x5a0000);
    P.shake(1.6);
    H.story?.event('m:kill');
  }
  _killFrame(dt) {
    const s = this.st, A = this.anim, P = H.player;
    // (arms flung wide to take you from both sides - not straight at you, where they'd put his face in shadow)
    A.gait = 'stand'; A.jaw = 1.25; A.reach = 0.5; A.spread = 0.9; A.shake = 1; A.hunch = 0.35; A.headRoll = 0.4; A.lean = 0.45; A.crouch = 0.5;
    // lunge in until his face fills your eyes
    const target = this.killCam.clone().addScaledVector(this.killDir, 1.9);
    const want = Math.atan2(this.killCam.x - this.pos.x, this.killCam.z - this.pos.z);
    this.yaw += clamp(angDiff(want, this.yaw), -dt * 20, dt * 20);
    const k = Math.min(1, s * 5);
    // place him so his head lands on target
    this.root.position.copy(this.pos); this.root.rotation.set(0, this.yaw, 0); A.look = this.killCam; this.rig.update(0, A);
    this.rig.headWorld(_w);
    const want2 = this.pos.clone().add(target.clone().sub(_w).multiplyScalar(k));
    want2.y = Math.max(this.killFrom.y - 1.2, Math.min(this.killFrom.y + 1, want2.y));
    this.pos.lerp(want2, Math.min(1, dt * 18));
    // (framed on the mouth, so the eyes and the whole open jaw are in your face)
    if (P?.override) { P.override.look = this.head.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, -0.32 + (Math.random() - 0.5) * 0.06, 0)); P.override.pos = this.killCam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12 * (1 - s), (Math.random() - 0.5) * 0.12 * (1 - s), 0)); }
    if (s > 1.35 && !this.blacked) { this.blacked = true; H.post?.fadeOut(0.06); }
    if (s > 1.6) { this.blacked = false; this.despawn(); H.story?.died(); }
  }
}

/** One of the "is that him?" moments: his body standing somewhere, stock still. */
export class Apparition {
  constructor() {
    this.rig = new Rig();
    this.rig.root.visible = false;
    H.world.scene.add(this.rig.root);
    this.on = false;
  }
  show(pos, yaw, o = {}) {
    this.rig.root.position.copy(pos); this.rig.root.rotation.set(0, yaw, 0); this.rig.root.visible = true; this.on = true;
    this.pose = { gait: 'stand', hunch: o.hunch ?? 0.25, headRoll: o.roll ?? 0.9, headYaw: 0, headPitch: o.pitch ?? 0.05, jaw: o.jaw ?? 0, reach: 0, spread: o.spread ?? 0, crouch: 0, lean: 0, sniff: 0, shake: 0, speed: 0, moved: 0 };
    for (let i = 0; i < 20; i++) this.rig.update(0.05, this.pose);
  }
  hide() { this.rig.root.visible = false; this.on = false; }
  update(dt) { if (this.on) { this.pose.look = H.player?.camPos; this.rig.update(dt * 0.3, this.pose); } }
}
