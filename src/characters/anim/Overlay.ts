// Upper-body action overlays: samples a clip's spine/arm/hand tracks directly (interpolants) and blends
// them over the locomotion pose, so legs keep walking while healing, reviving, throwing or swinging.
// Only each clip's "active window" is used (where the upper body actually moves: 5–95 % of its motion),
// so long source clips with idle lead-in/out still read as a quick gesture. Time is synced to an action's
// progress (0..1), ping-pong looped at natural speed for long actions, or free-running for one-shot events.
import * as THREE from 'three';
import type { ClipInfo } from './Clips';
import type { ClipSet, OverlayRole } from './ClipSet';

/** Bones driven by overlays (everything above the hips). */
const UPPER = /^(mixamorig[:_]?)?(Spine|Spine1|Spine2|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand.*))$/;

interface Channel {
  bone: THREE.Object3D;
  interp: THREE.Interpolant;
}

/** Active time window of a clip (seconds). */
export interface ClipWindow {
  t0: number;
  t1: number;
}

export class Overlay {
  private readonly cache = new Map<ClipInfo, Channel[]>();
  private readonly windows = new Map<ClipInfo, ClipWindow>();
  /** Free-running time for looped (natural speed) playback. */
  private loopT = 0;
  private loopRole: OverlayRole | null = null;
  private readonly bones = new Map<string, THREE.Object3D>();
  private role: OverlayRole | null = null;
  private weight = 0;
  private time01 = 0;
  /** One-shot (event) playback state. */
  private shotRole: OverlayRole | null = null;
  private shotT = 0;
  private shotDur = 0;
  private readonly q = new THREE.Quaternion();

  constructor(model: THREE.Object3D, private readonly set: ClipSet) {
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o);
    });
  }

  private channels(c: ClipInfo): Channel[] {
    let ch = this.cache.get(c);
    if (!ch) {
      ch = [];
      for (const t of c.clip.tracks) {
        if (!t.name.endsWith('.quaternion')) continue;
        const name = t.name.slice(0, -'.quaternion'.length);
        if (!UPPER.test(name)) continue;
        const bone = this.bones.get(name);
        if (bone) ch.push({ bone, interp: (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant() });
      }
      this.cache.set(c, ch);
    }
    return ch;
  }

  /** Active window of a clip: where 5 %..95 % of its upper-body rotation happens (padded 0.1 s). */
  window(c: ClipInfo): ClipWindow {
    let w = this.windows.get(c);
    if (w) return w;
    const ch = this.channels(c);
    const D = c.clip.duration;
    const N = 60;
    const prev = ch.map(() => new THREE.Quaternion());
    const cum = new Float32Array(N + 1);
    const q = new THREE.Quaternion();
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * D;
      let m = 0;
      for (let k = 0; k < ch.length; k++) {
        const v = ch[k].interp.evaluate(t);
        q.set(v[0], v[1], v[2], v[3]);
        if (i > 0) m += 2 * Math.acos(Math.min(1, Math.abs(q.dot(prev[k]))));
        prev[k].copy(q);
      }
      cum[i] = (i > 0 ? cum[i - 1] : 0) + m;
    }
    const total = cum[N];
    if (total < 1e-3 || D < 0.3) {
      w = { t0: 0, t1: D };
    } else {
      let i0 = 0;
      while (i0 < N && cum[i0] < total * 0.05) i0++;
      let i1 = N;
      while (i1 > 0 && cum[i1] > total * 0.95) i1--;
      const pad = 0.1;
      const t0 = Math.max(0, (i0 / N) * D - pad);
      const t1 = Math.min(D, (i1 / N) * D + pad);
      w = t1 - t0 > 0.25 ? { t0, t1 } : { t0: 0, t1: D };
    }
    this.windows.set(c, w);
    return w;
  }

  /** Start a free-running one-shot (e.g. pickup, door), `dur` seconds long. */
  trigger(role: OverlayRole, dur: number): void {
    if (!this.set.overlays.has(role)) return;
    this.shotRole = role;
    this.shotT = 0;
    this.shotDur = dur;
  }

  /** True while an overlay is visibly active. */
  get active(): boolean {
    return this.weight > 0.02;
  }

  get current(): OverlayRole | null {
    return this.weight > 0.02 ? this.role : null;
  }

  /**
   * Per frame, after the mixer: `syncRole/sync01` from the character action (null when none).
   * Writes local quaternions of upper-body bones (restored by Rig.restorePostMixer next frame).
   */
  update(dt: number, syncRole: OverlayRole | null, sync01: number, loop = false): void {
    let role = syncRole;
    let t01 = sync01;
    if (loop && syncRole) {
      if (this.loopRole !== syncRole) this.loopT = 0;
      this.loopT += dt;
    }
    this.loopRole = loop ? syncRole : null;
    if (!role && this.shotRole) {
      this.shotT += dt;
      if (this.shotT >= this.shotDur) this.shotRole = null;
      else {
        role = this.shotRole;
        t01 = this.shotT / this.shotDur;
      }
    }
    const want = role && this.set.overlays.has(role) ? 1 : 0;
    if (role) this.role = role;
    // fade in 0.15 s, out 0.25 s (and near the end of one-shots)
    const tail = role && !syncRole ? Math.min(1, (1 - t01) * this.shotDur / 0.2) : 1;
    const target = want * tail;
    const rate = target > this.weight ? dt / 0.15 : dt / 0.25;
    this.weight = target > this.weight ? Math.min(target, this.weight + rate) : Math.max(target, this.weight - rate);
    if (role) this.time01 = Math.min(0.999, Math.max(0, t01));
    if (this.weight <= 0.001 || !this.role) return;
    const clip = this.set.overlays.get(this.role);
    if (!clip) return;
    const win = this.window(clip);
    const len = win.t1 - win.t0;
    let t: number;
    if (this.loopRole) {
      // Ping-pong over the active window at natural speed (no pop at the wrap).
      const k = (this.loopT % (2 * len)) / len;
      t = win.t0 + (k <= 1 ? k : 2 - k) * len;
    } else t = win.t0 + this.time01 * len;
    for (const ch of this.channels(clip)) {
      const v = ch.interp.evaluate(t);
      this.q.set(v[0], v[1], v[2], v[3]);
      ch.bone.quaternion.slerp(this.q, this.weight);
    }
  }
}
