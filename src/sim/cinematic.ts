/**
 * Cinematic camera paths: keyframes are saved locations (so they follow
 * moving planets and survive reloads); playback interpolates positions with
 * a centripetal-free uniform Catmull–Rom spline in the first keyframe's
 * frame and orientations with eased slerps. Optional time-lapse advances
 * simulation time faster while the path plays.
 */
import { Quaternion, Vector3 } from 'three';
import type { World } from './world';
import type { Cosmos } from './cosmos';
import type { StarField } from '../render/starfield';
import { captureLocation, restoreLocation, type SavedLocation } from './locations';
import { UPos } from '../core/upos';
import { load, save } from '../ui/storage';

export interface CameraPath {
  id: string;
  name: string;
  keys: SavedLocation[];
  /** seconds per segment */
  segment: number;
  /** simulation seconds per real second during playback (1 = real time) */
  timeLapse: number;
}

function catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
    .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
    .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
    .addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
}

export class CinematicDirector {
  current: CameraPath;
  saved: CameraPath[];
  playing = false;
  private t = 0;
  private pts: Vector3[] = [];
  private qs: Quaternion[] = [];
  private savedTimeScale = 1;
  /** frame the keyframes were expressed in at the start of playback */
  private frameKind: 'universe' | 'inertial' | 'rotating' = 'universe';
  private frameBody: import('../astro/body').Body | null = null;
  onChange: () => void = () => {};

  constructor(readonly storageKey: string) {
    this.saved = load<CameraPath[]>(`paths:${storageKey}`, []);
    this.current = this.blank();
  }

  private blank(): CameraPath {
    return { id: `p${Date.now().toString(36)}`, name: 'Untitled path', keys: [], segment: 5, timeLapse: 1 };
  }

  addKey(world: World, cosmos: Cosmos) {
    this.current.keys.push(captureLocation(world, cosmos));
    this.onChange();
  }

  clear() {
    this.current = this.blank();
    this.onChange();
  }

  saveCurrent(name: string) {
    if (this.current.keys.length < 2) return false;
    this.current.name = name;
    this.saved = [this.current, ...this.saved.filter((p) => p.id !== this.current.id)].slice(0, 50);
    save(`paths:${this.storageKey}`, this.saved);
    this.current = { ...this.current, id: `p${Date.now().toString(36)}`, keys: [...this.current.keys] };
    this.onChange();
    return true;
  }

  remove(id: string) {
    this.saved = this.saved.filter((p) => p.id !== id);
    save(`paths:${this.storageKey}`, this.saved);
    this.onChange();
  }

  /**
   * Start playback. Restores the first keyframe (building its system if
   * needed), then expresses every keyframe in that frame.
   */
  play(path: CameraPath, world: World, cosmos: Cosmos, field: StarField): boolean {
    if (path.keys.length < 2) return false;
    if (!restoreLocation(world, cosmos, field, path.keys[0])) return false;
    this.current = path;
    const v = world.view;
    const base = v.toUPos(new UPos());
    const frameQ = v.frameRotation(new Quaternion());
    const inv = frameQ.clone().invert();
    this.pts = [];
    this.qs = [];
    for (const k of path.keys) {
      // absolute position of the key now (bodies may have moved since recording)
      const sys = world.system;
      let p: UPos;
      let q: Quaternion;
      if (k.bodyId && sys && sys.byId.has(k.bodyId) && k.kind !== 'universe') {
        const b = sys.byId.get(k.bodyId)!;
        p = sys.bodyUPos(b, new UPos());
        const local = new Vector3(...k.local);
        const rot = k.kind === 'rotating' ? sys.bodyRotation(b, new Quaternion()) : new Quaternion();
        p.add(local.clone().applyQuaternion(rot));
        q = rot.clone().multiply(new Quaternion(...k.orient));
      } else {
        p = UPos.fromJSON(k.upos);
        q = new Quaternion(...k.orient);
      }
      // into the first keyframe's frame (relative to its origin and axes)
      const off = p.sub(base, new Vector3()).applyQuaternion(inv).add(v.kind === 'universe' ? new Vector3() : v.local);
      this.pts.push(off);
      this.qs.push(inv.clone().multiply(q));
    }
    this.frameKind = v.kind;
    this.frameBody = v.body;
    this.t = 0;
    this.playing = true;
    this.savedTimeScale = world.timeScale;
    if (path.timeLapse > 1) world.timeScale = path.timeLapse;
    this.onChange();
    return true;
  }

  stop(world: World) {
    if (!this.playing) return;
    this.playing = false;
    world.timeScale = this.savedTimeScale;
    this.onChange();
  }

  /** Advance playback; returns false when finished. */
  update(dt: number, world: World): boolean {
    if (!this.playing) return false;
    const n = this.pts.length;
    this.t += dt / Math.max(this.current.segment, 0.5);
    if (this.t >= n - 1) {
      this.stop(world);
      return false;
    }
    const i = Math.floor(this.t);
    const f = this.t - i;
    const P = (k: number) => this.pts[Math.max(0, Math.min(n - 1, k))];
    const pos = catmull(P(i - 1), P(i), P(i + 1), P(i + 2), f, new Vector3());
    const e = f * f * (3 - 2 * f);
    const q = this.qs[i].clone().slerp(this.qs[i + 1], e);
    const v = world.view;
    v.kind = this.frameKind;
    v.body = this.frameBody;
    if (v.kind === 'universe') {
      // pts are offsets from the first key's universe position
      const k0 = UPos.fromJSON(this.current.keys[0].upos);
      v.upos.copy(k0).add(pos);
    } else {
      v.local.copy(pos);
    }
    v.orient.copy(q);
    return true;
  }

  get progress() {
    return this.pts.length > 1 ? this.t / (this.pts.length - 1) : 0;
  }
}
