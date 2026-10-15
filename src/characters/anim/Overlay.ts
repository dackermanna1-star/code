// Upper-body action overlays: samples a clip's spine/arm/hand tracks directly (interpolants) and blends
// them over the locomotion pose, so legs keep walking while healing, reviving, throwing or swinging.
// Time is either synced to an action's progress (0..1) or free-running for one-shot events.
import * as THREE from 'three';
import type { ClipInfo } from './Clips';
import type { ClipSet, OverlayRole } from './ClipSet';

/** Bones driven by overlays (everything above the hips). */
const UPPER = /^(mixamorig[:_]?)?(Spine|Spine1|Spine2|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand.*))$/;

interface Channel {
  bone: THREE.Object3D;
  interp: THREE.Interpolant;
}

export class Overlay {
  private readonly cache = new Map<ClipInfo, Channel[]>();
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
  update(dt: number, syncRole: OverlayRole | null, sync01: number): void {
    let role = syncRole;
    let t01 = sync01;
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
    const t = this.time01 * clip.clip.duration;
    for (const ch of this.channels(clip)) {
      const v = ch.interp.evaluate(t);
      this.q.set(v[0], v[1], v[2], v[3]);
      ch.bone.quaternion.slerp(this.q, this.weight);
    }
  }
}
