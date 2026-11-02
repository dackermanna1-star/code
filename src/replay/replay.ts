import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from '../combat/fighter';
import type { Weapon } from '../combat/weapons';
import { BONE_COUNT } from '../anim/skeleton';
import { Pose } from '../anim/pose';
import { writeWounds } from '../character/material';
import { Pistol } from '../combat/pistol';

/**
 * REPLAY: the last minute of the run, watched back after the player falls.
 *
 * While the fight goes on it is recorded at 30 frames per second of game time: every fighter's
 * root and full pose (and the boss auras, hit flashes, hair and skirt sway), each prop and weapon
 * (in a hand, flying, on the floor), Scarlet's pistol and the game camera. The sounds and the
 * particle effects are logged as they happen and fired again on the way through. Playback drives
 * the same character models (a body that has since been laid down as a corpse keeps its model
 * for as long as the replay can reach back to it), interpolated between frames, at a quarter to
 * double speed, through the camera as it was or a free one.
 */

/** Frames captured per second of game time (playback interpolates between them). */
const RATE = 30;
/** Seconds of the run kept. */
export const REPLAY_WINDOW = 60;
/** Recording runs on this long after the player falls: the fall, the slow motion, the room after. */
const AFTER_DEATH = 4;
/** Where a replay starts: this long before the fall (or as far back as it goes). */
const LEAD = 15;
// per fighter: root x, lift, z, yaw | hips xyz | rim rgba | sway xyz | flare | flash | bones
const FH = 16;
const FS = FH + BONE_COUNT * 4;
// per prop: x, y, z, qx, qy, qz, qw, shown
const PS = 8;
// per weapon: holder id (-1: none), x, y, z, qx, qy, qz, qw
const WS = 8;
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2];

interface Frame {
  t: number;
  /** Camera: x, y, z, qx, qy, qz, qw, fov. */
  cam: Float32Array;
  ids: Int32Array;
  f: Float32Array;
  p: Float32Array;
  wids: Int32Array;
  w: Float32Array;
  pistol: number;
}
interface Tracked {
  f: Fighter;
  /** Game time it left the fight (laid down as a corpse, fell off the roof); Infinity while in it. */
  gone: number;
}
interface Ev {
  t: number;
  to: 'fx' | 'audio' | 'pistol';
  name: string;
  args: unknown[];
}

const FX_CALLS = ['bloodSpray', 'bloodDrip', 'spit', 'impactFlash', 'sparks', 'splash', 'dust', 'shatter', 'woodBurst', 'teeth'];
const AUDIO_CALLS = ['play', 'gunshot', 'suppressedShot', 'thump', 'crack', 'swoosh', 'shatter', 'clink', 'thudSoft', 'splash', 'piano'];

/** A logged argument, copied (the callers pass scratch vectors they go on to reuse). */
function snap(a: unknown): unknown {
  if (a instanceof THREE.Vector3 || a instanceof THREE.Color || a instanceof THREE.Quaternion) return a.clone();
  if (Array.isArray(a)) return a.map(snap);
  if (a && typeof a === 'object' && Object.getPrototypeOf(a) === Object.prototype) {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(a)) o[k] = snap((a as Record<string, unknown>)[k]);
    return o;
  }
  return a;
}

const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _c = new THREE.Vector3();
const _cq = new THREE.Quaternion();

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class Replay {
  private frames: Frame[] = [];
  private events: Ev[] = [];
  private tracked = new Map<number, Tracked>();
  private acc = Infinity;
  private stopAt = Infinity;
  /** When the player fell (game time; Infinity while alive). */
  deathT = Infinity;
  active = false;
  playing = false;
  speed = 1;
  /** The replay's clock (game time). */
  t = 0;
  cam: 'free' | 'game' = 'free';
  /** Nested logged calls (only the outermost is kept: a sound that plays others isn't doubled). */
  private depth = 0;
  /** Firing logged events again: they aren't logged a second time. */
  private firing = false;
  /** Logged sounds / effects fired again so far (tests). */
  fired = 0;
  private pose = new Pose();
  private weaponsSeen = new Map<number, Weapon>();
  private saved: { weapons: { w: Weapon; parent: THREE.Object3D | null; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; visible: boolean }[]; pistolOut: boolean } | null = null;

  constructor(public game: Game) {
    this.hook(game.fx, 'fx', FX_CALLS);
    this.hook(game.audio, 'audio', AUDIO_CALLS);
    // (the pistol is made on her first draw: the class itself is hooked)
    this.hook(Pistol.prototype, 'pistol', ['fire']);
  }

  /** Log calls of `names` on `obj` (sounds, effects) to fire them again in the replay. */
  private hook(obj: object, to: Ev['to'], names: string[]) {
    const self = this;
    const o = obj as Record<string, unknown>;
    for (const name of names) {
      const orig = o[name];
      if (typeof orig !== 'function') continue;
      o[name] = function (this: unknown, ...args: unknown[]) {
        if (self.depth === 0 && !self.firing && self.recording()) self.events.push({ t: self.game.time, to, name, args: args.map(snap) });
        self.depth++;
        try {
          return (orig as (...a: unknown[]) => unknown).apply(this, args);
        } finally {
          self.depth--;
        }
      };
    }
  }

  private recording() {
    const g = this.game;
    return g.started && !this.active && g.time <= this.stopAt;
  }

  /** Sounds / effects logged (tests). */
  get eventCount() {
    return this.events.length;
  }
  /** How much there is to watch (seconds). */
  get length() {
    return this.frames.length > 1 ? this.frames[this.frames.length - 1].t - this.frames[0].t : 0;
  }
  get start() {
    return this.frames.length ? this.frames[0].t : 0;
  }
  get end() {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  // ------------------------------------------------------------------ recording
  /** A fighter's model can be shown by the replay (call when it joins the fight). */
  track(f: Fighter) {
    this.tracked.set(f.id, { f, gone: Infinity });
  }

  /**
   * A fighter leaves the fight (its body baked into the floor, or gone over the roof's edge): the
   * model is kept, hidden, for as long as a replay can reach back to it.
   */
  retire(f: Fighter) {
    const t = this.tracked.get(f.id);
    if (!t) {
      f.model.dispose();
      return;
    }
    t.gone = this.game.time;
    f.model.group.visible = false;
  }

  /** The player is down: record on a few seconds more, then stop (the replay keeps that minute). */
  playerDown() {
    if (this.deathT !== Infinity) return;
    this.deathT = this.game.time;
    this.stopAt = this.game.time + AFTER_DEATH;
  }

  /** Capture a frame (end of each simulation step). */
  capture(dt: number) {
    const g = this.game;
    if (!this.recording() || dt <= 0) return;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc = Math.min(this.acc - 1 / RATE, 1 / RATE);
    const cam = new Float32Array(8);
    const c = g.cam.camera;
    cam.set([c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov]);
    // fighters
    const fs = g.fighters;
    const ids = new Int32Array(fs.length);
    const fd = new Float32Array(fs.length * FS);
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (!this.tracked.has(f.id)) this.track(f);
      ids[i] = f.id;
      const o = i * FS;
      const m = f.model, u = m.uniforms, out = f.anim.out;
      fd[o] = m.group.position.x;
      fd[o + 1] = m.group.position.y;
      fd[o + 2] = m.group.position.z;
      fd[o + 3] = m.group.rotation.y;
      fd[o + 4] = out.hips.x;
      fd[o + 5] = out.hips.y;
      fd[o + 6] = out.hips.z;
      const r = u.uRim.value;
      fd[o + 7] = r.x;
      fd[o + 8] = r.y;
      fd[o + 9] = r.z;
      fd[o + 10] = r.w;
      const s = u.uSway.value;
      fd[o + 11] = s.x;
      fd[o + 12] = s.y;
      fd[o + 13] = s.z;
      fd[o + 14] = u.uFlare.value;
      fd[o + 15] = u.uFlash.value;
      for (let b = 0; b < BONE_COUNT; b++) {
        const q = out.q[b], k = o + FH + b * 4;
        fd[k] = q.x;
        fd[k + 1] = q.y;
        fd[k + 2] = q.z;
        fd[k + 3] = q.w;
      }
    }
    // props (stable order: broken ones stay in the list)
    const props = g.props?.list ?? [];
    const pd = new Float32Array(props.length * PS);
    for (let i = 0; i < props.length; i++) {
      const pr = props[i], o = i * PS;
      if (pr.broken) continue;
      const t = pr.body.translation(), q = pr.body.rotation();
      pd[o] = t.x;
      pd[o + 1] = t.y;
      pd[o + 2] = t.z;
      pd[o + 3] = q.x;
      pd[o + 4] = q.y;
      pd[o + 5] = q.z;
      pd[o + 6] = q.w;
      pd[o + 7] = 1;
    }
    // weapons: held (by whom), or loose in the room
    const ws = new Set<Weapon>(g.weapons);
    for (const f of fs) if (f.weapon) ws.add(f.weapon);
    const wids = new Int32Array(ws.size);
    const wd = new Float32Array(ws.size * WS);
    let wi = 0;
    for (const w of ws) {
      this.weaponsSeen.set(w.id, w);
      wids[wi] = w.id;
      const o = wi * WS;
      wd[o] = w.holder ? w.holder.id : -1;
      if (!w.holder) {
        w.group.getWorldPosition(_p);
        w.group.getWorldQuaternion(_q);
        wd[o + 1] = _p.x;
        wd[o + 2] = _p.y;
        wd[o + 3] = _p.z;
        wd[o + 4] = _q.x;
        wd[o + 5] = _q.y;
        wd[o + 6] = _q.z;
        wd[o + 7] = _q.w;
      }
      wi++;
    }
    this.frames.push({ t: g.time, cam, ids, f: fd, p: pd, wids, w: wd, pistol: g.player.pistol?.out ? 1 : 0 });
    // keep a minute
    const cut = g.time - REPLAY_WINDOW;
    while (this.frames.length > 2 && this.frames[0].t < cut) this.frames.shift();
    while (this.events.length && this.events[0].t < cut) this.events.shift();
    const first = this.frames[0].t;
    for (const [id, tr] of this.tracked) {
      if (tr.gone < first) {
        tr.f.model.dispose();
        this.tracked.delete(id);
      }
    }
    for (const [id, w] of this.weaponsSeen) if (!g.weapons.includes(w) && !w.holder) this.weaponsSeen.delete(id);
  }

  // ------------------------------------------------------------------ playback
  /** Start watching (false: nothing recorded). */
  open(): boolean {
    const g = this.game;
    if (this.frames.length < 2 || this.active) return false;
    this.active = true;
    this.playing = true;
    this.speed = 1;
    // what's on screen now, to put back afterwards
    const weapons = [...this.weaponsSeen.values()].map((w) => ({ w, parent: w.group.parent, pos: w.group.position.clone(), quat: w.group.quaternion.clone(), scale: w.group.scale.clone(), visible: w.group.visible }));
    this.saved = { weapons, pistolOut: !!g.player.pistol?.out };
    g.weaponBatch.setVisible(false);
    g.fx.noStain = true;
    for (const tr of this.tracked.values()) tr.f.model.uniforms.uFade.value = 0;
    const from = Number.isFinite(this.deathT) ? Math.max(this.start, this.deathT - LEAD) : this.start;
    this.seek(from);
    // the camera starts where the game's was, and from there it's yours
    this.applyCamera(from);
    if (this.cam === 'free') g.cam.startFree(true);
    return true;
  }

  /** Back to the room as it is now. */
  close() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    this.playing = false;
    g.cam.stopFree();
    g.corpses.setReplayTime(Infinity);
    g.fx.noStain = false;
    g.weaponBatch.setVisible(true);
    g.props?.resyncAll();
    // fighters still in the fight as they are now; the rest hidden again
    for (const tr of this.tracked.values()) {
      const f = tr.f, m = f.model;
      if (tr.gone === Infinity && g.fighters.includes(f)) {
        m.group.visible = true;
        m.applyPose(f.anim.out);
        m.group.position.set(f.x, f.lift, f.z);
        m.group.rotation.y = f.yaw;
        writeWounds(m.uniforms, m.wounds, g.time);
      } else m.group.visible = false;
    }
    if (this.saved) {
      for (const s of this.saved.weapons) {
        const grp = s.w.group;
        if (s.parent) s.parent.add(grp);
        else grp.removeFromParent();
        grp.position.copy(s.pos);
        grp.quaternion.copy(s.quat);
        grp.scale.copy(s.scale);
        grp.visible = s.visible;
      }
      const pistol = g.player.pistol;
      if (pistol) {
        if (this.saved.pistolOut && !pistol.out) pistol.attach(g.player);
        else if (!this.saved.pistolOut && pistol.out) pistol.detach();
      }
      this.saved = null;
    }
  }

  /** Jump to a moment (game time; clamped to what was recorded). No sounds on the way. */
  seek(t: number) {
    this.t = Math.min(this.end, Math.max(this.start, t));
    this.apply(this.t);
  }

  /** Index of the frame at or before `t`. */
  private frameAt(t: number) {
    const F = this.frames;
    let lo = 0, hi = F.length - 1;
    if (t <= F[0].t) return 0;
    if (t >= F[hi].t) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (F[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Advance the replay by a frame of real time. */
  update(realDt: number) {
    const g = this.game;
    if (!this.active) return;
    const dt = this.playing ? realDt * this.speed : 0;
    if (dt > 0) {
      const t0 = this.t;
      this.t = Math.min(this.end, this.t + dt);
      this.fire(t0, this.t);
      if (this.t >= this.end) this.playing = false;
      this.apply(this.t);
    }
    // the effects run on the replay's clock (slow motion slows the sparks too)
    g.fx.update(dt);
    g.player.pistol?.update(dt);
    if (this.cam === 'game') this.applyCamera(this.t);
  }

  /** The sounds and effects logged in (t0, t1]. */
  private fire(t0: number, t1: number) {
    const g = this.game;
    // (a burst of them after a long frame would only be noise)
    if (t1 - t0 > 0.25) return;
    this.firing = true;
    try {
      for (const ev of this.events) {
        if (ev.t <= t0) continue;
        if (ev.t > t1) break;
        const target = (ev.to === 'fx' ? g.fx : ev.to === 'audio' ? g.audio : g.player.pistol) as unknown as Record<string, (...a: unknown[]) => unknown> | null;
        if (!target) continue;
        let args = ev.args;
        // slow motion lowers the sounds with it
        if (ev.to === 'audio' && ev.name === 'play' && this.speed < 1) {
          const o = { ...((args[1] as Record<string, unknown>) ?? {}) };
          o.pitch = ((o.pitch as number) ?? 1) * Math.sqrt(this.speed);
          args = [args[0], o];
        }
        try {
          target[ev.name](...args.map(snap));
          this.fired++;
        } catch {
          /* a logged call that no longer applies */
        }
      }
    } finally {
      this.firing = false;
    }
  }

  /** Put everything where it was at `t`. */
  private apply(t: number) {
    const g = this.game;
    const i = this.frameAt(t);
    const A = this.frames[i], Bf = this.frames[Math.min(this.frames.length - 1, i + 1)];
    const k = Bf.t > A.t ? Math.min(1, Math.max(0, (t - A.t) / (Bf.t - A.t))) : 0;
    g.corpses.setReplayTime(t);
    // fighters
    const shown = new Set<number>();
    for (let a = 0; a < A.ids.length; a++) {
      const id = A.ids[a];
      const tr = this.tracked.get(id);
      if (!tr) continue;
      shown.add(id);
      let b = -1;
      for (let j = 0; j < Bf.ids.length; j++) if (Bf.ids[j] === id) b = j;
      this.poseModel(tr.f, A.f, a * FS, b >= 0 ? Bf.f : A.f, (b >= 0 ? b : a) * FS, b >= 0 ? k : 0, t);
    }
    for (const [id, tr] of this.tracked) if (!shown.has(id)) tr.f.model.group.visible = false;
    // props
    const props = g.props?.list ?? [];
    for (let p = 0; p < props.length; p++) {
      const o = p * PS;
      if (o >= A.p.length) {
        // (not there yet when this frame was taken)
        g.props.replayPose(props[p], _p, _q, false);
        continue;
      }
      const on = A.p[o + 7] > 0;
      const onB = o < Bf.p.length && Bf.p[o + 7] > 0;
      const kk = onB ? k : 0;
      const P2 = onB ? Bf.p : A.p;
      _p.set(A.p[o], A.p[o + 1], A.p[o + 2]).lerp(_p2.set(P2[o], P2[o + 1], P2[o + 2]), kk);
      _q.set(A.p[o + 3], A.p[o + 4], A.p[o + 5], A.p[o + 6]).slerp(_q2.set(P2[o + 3], P2[o + 4], P2[o + 5], P2[o + 6]), kk);
      g.props.replayPose(props[p], _p, _q, on);
    }
    // weapons
    const seen = new Set<number>();
    for (let a = 0; a < A.wids.length; a++) {
      const w = this.weaponsSeen.get(A.wids[a]);
      if (!w) continue;
      seen.add(w.id);
      const o = a * WS;
      const holder = A.w[o];
      w.group.visible = true;
      if (holder >= 0) {
        const tr = this.tracked.get(holder);
        if (tr) w.placeInHand(tr.f);
        continue;
      }
      if (w.group.parent !== g.scene) g.scene.add(w.group);
      let b = -1;
      for (let j = 0; j < Bf.wids.length; j++) if (Bf.wids[j] === w.id) b = j;
      const W2 = b >= 0 && Bf.w[b * WS] < 0 ? Bf.w : A.w;
      const o2 = b >= 0 && Bf.w[b * WS] < 0 ? b * WS : o;
      const kk = W2 === A.w ? 0 : k;
      w.group.position.set(A.w[o + 1], A.w[o + 2], A.w[o + 3]).lerp(_p2.set(W2[o2 + 1], W2[o2 + 2], W2[o2 + 3]), kk);
      w.group.quaternion.set(A.w[o + 4], A.w[o + 5], A.w[o + 6], A.w[o + 7]).slerp(_q2.set(W2[o2 + 4], W2[o2 + 5], W2[o2 + 6], W2[o2 + 7]), kk);
      w.group.scale.setScalar(1);
    }
    for (const w of this.weaponsSeen.values()) if (!seen.has(w.id)) w.group.visible = false;
    // the pistol: in her hand while it was out
    const pistol = g.player.pistol;
    if (pistol) {
      if (A.pistol && !pistol.out) pistol.attach(g.player);
      else if (!A.pistol && pistol.out) pistol.detach();
    }
  }

  /** One fighter's model at the replay's moment: blended between two frames. */
  private poseModel(f: Fighter, A: Float32Array, a: number, B: Float32Array, b: number, k: number, t: number) {
    const m = f.model, u = m.uniforms, pose = this.pose;
    m.group.visible = true;
    m.group.position.set(A[a] + (B[b] - A[a]) * k, A[a + 1] + (B[b + 1] - A[a + 1]) * k, A[a + 2] + (B[b + 2] - A[a + 2]) * k);
    m.group.rotation.y = lerpAngle(A[a + 3], B[b + 3], k);
    pose.hips.set(A[a + 4], A[a + 5], A[a + 6]).lerp(_c.set(B[b + 4], B[b + 5], B[b + 6]), k);
    for (let i = 0; i < BONE_COUNT; i++) {
      const ka = a + FH + i * 4, kb = b + FH + i * 4;
      pose.q[i].set(A[ka], A[ka + 1], A[ka + 2], A[ka + 3]).slerp(_cq.set(B[kb], B[kb + 1], B[kb + 2], B[kb + 3]), k);
    }
    m.applyPose(pose);
    u.uRim.value.set(A[a + 7] + (B[b + 7] - A[a + 7]) * k, A[a + 8] + (B[b + 8] - A[a + 8]) * k, A[a + 9] + (B[b + 9] - A[a + 9]) * k, A[a + 10] + (B[b + 10] - A[a + 10]) * k);
    u.uSway.value.set(A[a + 11] + (B[b + 11] - A[a + 11]) * k, A[a + 12] + (B[b + 12] - A[a + 12]) * k, A[a + 13] + (B[b + 13] - A[a + 13]) * k);
    u.uFlare.value = A[a + 14] + (B[b + 14] - A[a + 14]) * k;
    u.uFlash.value = A[a + 15] + (B[b + 15] - A[a + 15]) * k;
    u.uHipC.value.copy(pose.hips);
    u.uFade.value = 0;
    // wounds as they were: none of the ones still to come
    writeWounds(u, m.wounds.filter((w) => w.born === undefined || w.born <= t), t);
  }

  /** The game camera as it was at `t`. */
  private applyCamera(t: number) {
    const i = this.frameAt(t);
    const A = this.frames[i], B = this.frames[Math.min(this.frames.length - 1, i + 1)];
    const k = B.t > A.t ? Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))) : 0;
    _p.set(A.cam[0], A.cam[1], A.cam[2]).lerp(_p2.set(B.cam[0], B.cam[1], B.cam[2]), k);
    _q.set(A.cam[3], A.cam[4], A.cam[5], A.cam[6]).slerp(_q2.set(B.cam[3], B.cam[4], B.cam[5], B.cam[6]), k);
    this.game.cam.setPose(_p, _q, A.cam[7] + (B.cam[7] - A.cam[7]) * k);
  }

  /** Switch between the game's own camera and a free one (starting from where the view is). */
  toggleCamera() {
    if (!this.active) return;
    this.cam = this.cam === 'free' ? 'game' : 'free';
    if (this.cam === 'free') this.game.cam.startFree(true);
    else {
      this.game.cam.stopFree();
      this.applyCamera(this.t);
    }
  }

  setSpeed(dir: number) {
    const i = REPLAY_SPEEDS.indexOf(this.speed);
    this.speed = REPLAY_SPEEDS[Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))];
  }

  togglePlay() {
    if (!this.active) return;
    // (at the end: from the top again)
    if (!this.playing && this.t >= this.end - 1e-3) this.seek(this.start);
    this.playing = !this.playing;
  }
}
