// Animation clip classification + analysis. Clips come from the asset manifests (with metadata such as
// speed_mps / move_dir / loop) or from the fallback model; missing metadata is derived by sampling the clip
// (planted-foot velocity gives the ground speed and direction, so playback can be synced to movement).
import * as THREE from 'three';
import type { Rig } from './Rig';

export type ClipKind =
  | 'idle'
  | 'loco'
  | 'jump'
  | 'fall'
  | 'land'
  | 'swim'
  | 'swimIdle'
  | 'freefall'
  | 'parachute'
  | 'death'
  | 'hit'
  | 'reload'
  | 'vault'
  | 'climb'
  | 'knocked'
  | 'seated'
  | 'throw'
  | 'heal'
  | 'aim'
  | 'other';

export type ClipStance = 'stand' | 'crouch' | 'prone';
export type ClipStyle = 'unarmed' | 'rifle' | 'pistol';

export interface ClipMeta {
  name?: string;
  speed_mps?: number;
  move_dir?: [number, number];
  loop?: boolean;
  mode?: string;
  duration?: number;
}

export interface ClipInfo {
  name: string;
  clip: THREE.AnimationClip;
  kind: ClipKind;
  stance: ClipStance;
  style: ClipStyle;
  /** Ground speed (m/s) for locomotion clips. */
  speed: number;
  /** Local move direction (x = right, y = forward), unit, for locomotion clips. */
  dir: THREE.Vector2;
  /** Angle of dir (atan2(x, y)), 0 = forward, +π/2 = right. */
  angle: number;
  loop: boolean;
}

export function classifyKind(name: string, meta?: ClipMeta): ClipKind {
  const n = name.toLowerCase();
  if (/death|dying|die_|_die/.test(n)) return 'death';
  if (/knock|dbno|wounded|injured/.test(n)) return 'knocked';
  if (/skydiv|freefall|free_fall/.test(n)) return 'freefall';
  if (/parachut|chute/.test(n)) return 'parachute';
  if (/swim|tread/.test(n)) return /idle|tread/.test(n) ? 'swimIdle' : 'swim';
  if (/jump/.test(n)) return 'jump';
  if (/fall/.test(n)) return 'fall';
  if (/land/.test(n)) return 'land';
  if (/reload/.test(n)) return 'reload';
  if (/vault/.test(n)) return 'vault';
  if (/climb/.test(n)) return 'climb';
  if (/(^|_)(sit|seat|drive|driving|passenger)/.test(n)) return 'seated';
  if (/throw/.test(n)) return 'throw';
  if (/heal|bandage|drink|inject/.test(n)) return 'heal';
  if (/hit|damage|flinch/.test(n)) return 'hit';
  if (meta?.mode === 'loco' || /walk|jog|run|sprint|crawl|strafe|move/.test(n)) return 'loco';
  if (/idle|stand|pose/.test(n)) return 'idle';
  if (/aim|shoot|fire/.test(n)) return 'aim';
  return 'other';
}

export function classifyStance(name: string): ClipStance {
  const n = name.toLowerCase();
  if (/prone|crawl/.test(n)) return 'prone';
  if (/crouch|sneak/.test(n)) return 'crouch';
  return 'stand';
}

export function classifyStyle(name: string): ClipStyle {
  const n = name.toLowerCase();
  if (/pistol|handgun/.test(n)) return 'pistol';
  if (/rifle|(^|_)ar(_|$)|gun|weapon/.test(n)) return 'rifle';
  return 'unarmed';
}

/** Direction from a name suffix (_f, _b, _l, _r, _fl, _fr, _bl, _br) — x right, y forward. */
export function dirFromName(name: string): THREE.Vector2 | null {
  const m = /(?:^|_)(f|b|l|r|fl|fr|bl|br|fwd|bwd|left|right|forward|backward|back)(?:_|$|\d)/i.exec(name.toLowerCase().replace(/_ual$|_rpm$|_mx$/, ''));
  if (!m) return null;
  const t = m[1];
  const map: Record<string, [number, number]> = {
    f: [0, 1], fwd: [0, 1], forward: [0, 1],
    b: [0, -1], bwd: [0, -1], back: [0, -1], backward: [0, -1],
    l: [-1, 0], left: [-1, 0],
    r: [1, 0], right: [1, 0],
    fl: [-Math.SQRT1_2, Math.SQRT1_2], fr: [Math.SQRT1_2, Math.SQRT1_2],
    bl: [-Math.SQRT1_2, -Math.SQRT1_2], br: [Math.SQRT1_2, -Math.SQRT1_2],
  };
  const v = map[t];
  return v ? new THREE.Vector2(v[0], v[1]) : null;
}

/** Remove horizontal root motion from the hips position track (keeps vertical bob). Returns the net XZ motion. */
export function stripRootMotion(clip: THREE.AnimationClip, hipsName: string): THREE.Vector3 {
  const net = new THREE.Vector3();
  const track = clip.tracks.find((t) => t.name === `${hipsName}.position`);
  if (!track) return net;
  const v = track.values;
  const n = v.length / 3;
  if (n < 2) return net;
  const x0 = v[0], z0 = v[2];
  net.set(v[(n - 1) * 3] - x0, v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - z0);
  // Remove the linear drift (root motion) so the loop stays in place, keep the sway around it.
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    v[i * 3] -= net.x * t;
    v[i * 3 + 2] -= net.z * t;
  }
  return net;
}

const _fl = new THREE.Vector3();
const _fr = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/**
 * Estimate ground speed + direction of an in-place locomotion clip by sampling the planted foot.
 * `root` must be a dedicated clone (its pose is overwritten). Returns null if no clear stance phase.
 */
export function analyseLocomotion(clip: THREE.AnimationClip, root: THREE.Object3D, rig: Rig, facing: number): { speed: number; dir: THREE.Vector2 } | null {
  const footL = rig.bones.footL, footR = rig.bones.footR;
  if (!footL || !footR) return null;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const N = 48;
  const dur = clip.duration;
  const pts: { l: THREE.Vector3; r: THREE.Vector3 }[] = [];
  for (let i = 0; i <= N; i++) {
    mixer.setTime((dur * i) / N);
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    _fl.setFromMatrixPosition(footL.matrixWorld).applyMatrix4(_inv);
    _fr.setFromMatrixPosition(footR.matrixWorld).applyMatrix4(_inv);
    pts.push({ l: _fl.clone(), r: _fr.clone() });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const minL = Math.min(...pts.map((p) => p.l.y));
  const minR = Math.min(...pts.map((p) => p.r.y));
  const dt = dur / N;
  let sx = 0, sz = 0, cnt = 0;
  for (let i = 0; i < N; i++) {
    for (const [k, min] of [['l', minL], ['r', minR]] as const) {
      const a = pts[i][k], b = pts[i + 1][k];
      if (a.y - min < 0.035 && b.y - min < 0.035) {
        sx += (b.x - a.x) / dt;
        sz += (b.z - a.z) / dt;
        cnt++;
      }
    }
  }
  if (cnt < 4) return null;
  // Planted foot moves opposite to the body. Root space: +Z forward*facing, +X = character left.
  const vz = (-sz / cnt) * facing;
  const vx = (-sx / cnt) * facing;
  const speed = Math.hypot(vx, vz);
  if (speed < 0.2) return { speed: 0, dir: new THREE.Vector2(0, 1) };
  // Local dir: x = right = -X(root) when facing +Z.
  return { speed, dir: new THREE.Vector2(-vx / speed, vz / speed) };
}

export function makeClipInfo(clip: THREE.AnimationClip, meta: ClipMeta | undefined, analysed: { speed: number; dir: THREE.Vector2 } | null): ClipInfo {
  const name = clip.name;
  const kind = classifyKind(name, meta);
  const named = dirFromName(name);
  let dir = new THREE.Vector2(0, 1);
  let speed = 0;
  if (kind === 'loco' || kind === 'swim' || kind === 'knocked') {
    speed = meta?.speed_mps && meta.speed_mps > 0.05 ? meta.speed_mps : analysed?.speed ?? 0;
    if (named) dir = named;
    else if (meta?.move_dir && (meta.speed_mps ?? 0) > 0.05) dir = new THREE.Vector2(meta.move_dir[0], meta.move_dir[1]).normalize();
    else if (analysed && analysed.speed > 0.2) dir = analysed.dir.clone();
    if (speed < 0.05) {
      // Last resort: nominal speeds by gait name.
      const n = name.toLowerCase();
      speed = /sprint/.test(n) ? 6.3 : /run|jog/.test(n) ? 4.5 : /crawl|prone/.test(n) ? 1.1 : 1.5;
    }
  }
  return {
    name,
    clip,
    kind,
    stance: classifyStance(name),
    style: classifyStyle(name),
    speed,
    dir,
    angle: Math.atan2(dir.x, dir.y),
    loop: meta?.loop ?? (kind === 'loco' || kind === 'idle' || kind === 'swim' || kind === 'swimIdle' || kind === 'freefall' || kind === 'parachute' || kind === 'seated' || kind === 'fall'),
  };
}
