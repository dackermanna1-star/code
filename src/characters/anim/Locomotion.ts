// Locomotion blend layer: picks clips per stance/style (ClipSet), blends idle / aim-idle ↔ directional
// gaits by speed and direction (8-way when available), and advances a shared cycle phase by distance
// travelled — playback is synced to the actual ground speed through each clip's metres-per-cycle, so feet
// don't slide. Special states (air, swim, freefall, parachute, seated, knocked) play their own clips.
// The mixer is driven manually (action.time set explicitly, timeScale 0).
import * as THREE from 'three';
import type { ClipInfo, ClipKind, ClipStance, ClipStyle } from './Clips';
import type { CharacterLibrary } from './CharacterLibrary';
import { ClipSet, type SpecialRole } from './ClipSet';

/** What the locomotion layer should show this frame (filled by the visual from the character state). */
export interface LocoInput {
  stance: ClipStance;
  style: ClipStyle;
  /** Local velocity: x = right, y = forward (m/s) relative to the body facing. */
  localVel: THREE.Vector2;
  /** Special pose kind (fall, swim, swimIdle, freefall, parachute, seated, knocked, vault, climb) or null. */
  special: ClipKind | null;
  sprinting: boolean;
  aiming: boolean;
  /** Seated in the driver seat (vs passenger). */
  driver: boolean;
  /** Seconds since the last jump (air phase). */
  sinceJump: number;
}

export interface LocoOutput {
  /** True when the stance group was synthesized from stand clips (procedural crouch/prone needed). */
  synthCrouch: boolean;
  synthProne: boolean;
  /** Only forward-direction clips exist: procedural hips orientation required. */
  forwardOnly: boolean;
  /** Signed lower-body yaw offset the procedural layer should apply (rad), and whether playback is reversed. */
  hipYaw: number;
  reversed: boolean;
  /** True if a clip covers the special pose (else the procedural layer must synthesize it). */
  specialCovered: boolean;
  /** 0..1 how much of the pose is idle (vs moving). */
  idleWeight: number;
  /** Normalized locomotion phase 0..1. */
  phase: number;
  /** Ground speed shown by the animation. */
  speed: number;
}

const WEIGHT_RATE = 7; // 1/s crossfade speed

export class Locomotion {
  readonly mixer: THREE.AnimationMixer;
  readonly set: ClipSet;
  private readonly actions = new Map<ClipInfo, THREE.AnimationAction>();
  private readonly target = new Map<ClipInfo, number>();
  private readonly weights = new Map<ClipInfo, number>();
  private phase = 0;
  private idleTime = 0;
  private specialTime = 0;
  private lastSpecial: string | null = null;
  readonly out: LocoOutput = {
    synthCrouch: false,
    synthProne: false,
    forwardOnly: true,
    hipYaw: 0,
    reversed: false,
    specialCovered: false,
    idleWeight: 1,
    phase: 0,
    speed: 0,
  };
  /** Debug: play exactly this clip (by name) and nothing else. */
  forceClip: string | null = null;
  private forceTime = 0;

  constructor(root: THREE.Object3D, private readonly lib: CharacterLibrary, phaseOffset = 0) {
    this.mixer = new THREE.AnimationMixer(root);
    this.phase = phaseOffset;
    this.set = new ClipSet(lib);
  }

  private action(c: ClipInfo): THREE.AnimationAction {
    let a = this.actions.get(c);
    if (!a) {
      a = this.mixer.clipAction(c.clip);
      a.setLoop(THREE.LoopRepeat, Infinity); // time is set explicitly (clamped for one-shots)
      a.play();
      a.timeScale = 0;
      a.setEffectiveWeight(0);
      this.actions.set(c, a);
      this.weights.set(c, 0);
    }
    return a;
  }

  private setTime(c: ClipInfo, t: number, loop = c.loop): void {
    const a = this.action(c);
    const d = Math.max(1e-3, c.clip.duration);
    a.time = loop ? ((t % d) + d) % d : Math.min(Math.max(0, t), d - 1e-3);
  }

  update(dt: number, inp: LocoInput): void {
    const o = this.out;
    this.target.clear();
    o.specialCovered = false;
    o.hipYaw = 0;
    o.reversed = false;
    o.synthCrouch = o.synthProne = false;

    if (this.forceClip) {
      const c = this.lib.clipByName.get(this.forceClip);
      if (c) {
        this.forceTime += dt;
        this.setTime(c, this.forceTime);
        this.target.set(c, 1);
        this.apply(1e9);
        o.specialCovered = true;
        return;
      }
    } else this.forceTime = 0;

    const sp = inp.special;
    const key = sp ? `${sp}${sp === 'seated' ? (inp.driver ? 'D' : 'P') : ''}` : null;
    if (key !== this.lastSpecial) this.specialTime = 0;
    this.lastSpecial = key;
    this.specialTime += dt;

    if (sp) this.updateSpecial(dt, inp, sp);
    if (!o.specialCovered) this.updateGround(dt, inp);
    this.apply(dt);
  }

  /** Crossfade weights toward targets, normalize, push to the mixer. */
  private apply(dt: number): void {
    let total = 0;
    const k = Math.min(1, dt * WEIGHT_RATE);
    for (const c of this.target.keys()) this.action(c);
    for (const c of this.actions.keys()) {
      const t = this.target.get(c) ?? 0;
      const w = this.weights.get(c) ?? 0;
      let nw = w + (t - w) * k;
      if (nw < 1e-3 && t === 0) nw = 0;
      this.weights.set(c, nw);
      total += nw;
    }
    for (const [c, a] of this.actions) {
      const w = total > 1e-6 ? this.weights.get(c)! / total : 0;
      a.enabled = true; // setEffectiveWeight is ignored while disabled
      a.setEffectiveWeight(w);
      a.enabled = w > 0;
    }
    this.mixer.update(0);
  }

  private special(role: SpecialRole): ClipInfo | null {
    return this.set.specials.get(role) ?? null;
  }

  private updateSpecial(_dt: number, inp: LocoInput, sp: ClipKind): void {
    const o = this.out;
    const t = this.specialTime;
    let c: ClipInfo | null = null;
    switch (sp) {
      case 'fall': {
        const jump = this.special('jump');
        if (jump && inp.sinceJump < jump.clip.duration * 0.85) {
          c = jump;
          this.setTime(c, inp.sinceJump, false);
        } else {
          c = (inp.style === 'rifle' ? this.special('fallRifle') : null) ?? this.special('fall');
          if (c) this.setTime(c, t);
        }
        break;
      }
      case 'swim':
      case 'swimIdle': {
        const v = inp.localVel;
        const speed = v.length();
        if (sp === 'swimIdle' || speed < 0.3) c = this.special('swimIdle');
        else {
          const ang = Math.atan2(v.x, v.y);
          const role: SpecialRole = Math.abs(ang) < Math.PI / 4 ? 'swimF' : Math.abs(ang) > (Math.PI * 3) / 4 ? 'swimB' : ang > 0 ? 'swimR' : 'swimL';
          c = this.special(role) ?? this.special('swimF');
          if (c) {
            const rate = Math.min(1.6, Math.max(0.7, speed / Math.max(0.5, c.speed || 1.4)));
            this.phase = (this.phase + (_dt * rate) / Math.max(0.1, c.clip.duration)) % 1;
            this.setTime(c, this.phase * c.clip.duration);
            this.target.set(c, 1);
            o.specialCovered = true;
            return;
          }
        }
        if (c) this.setTime(c, t);
        break;
      }
      case 'freefall':
        c = this.special('freefall');
        if (c) this.setTime(c, t);
        break;
      case 'parachute':
        c = this.special('parachute');
        if (c) this.setTime(c, t);
        break;
      case 'seated':
        c = inp.driver ? this.special('driveSit') : this.special('passengerSit');
        if (c) this.setTime(c, t);
        break;
      case 'knocked': {
        const speed = inp.localVel.length();
        const idle = this.special('knockedIdle');
        const crawl = this.special('knockedCrawl');
        if (crawl && speed > 0.1) {
          // The crawl clip's measured root speed is unreliable: use a nominal 0.55 m per second of clip.
          const rate = Math.min(1.8, Math.max(0.5, speed / 0.55));
          this.phase = (this.phase + (_dt * rate) / Math.max(0.1, crawl.clip.duration)) % 1;
          this.setTime(crawl, this.phase * crawl.clip.duration);
          const mw = Math.min(1, speed / 0.3);
          this.target.set(crawl, mw);
          if (idle) {
            this.setTime(idle, t);
            this.target.set(idle, 1 - mw);
          }
          o.specialCovered = true;
          return;
        }
        c = idle;
        if (c) this.setTime(c, t);
        break;
      }
      default:
        return; // vault / climb: ground locomotion + procedural
    }
    if (c) {
      this.target.set(c, 1);
      o.specialCovered = true;
    }
  }

  private updateGround(dt: number, inp: LocoInput): void {
    const o = this.out;
    const { g, stance } = this.set.group(inp.stance, inp.style);
    o.synthCrouch = inp.stance === 'crouch' && stance !== 'crouch';
    o.synthProne = inp.stance === 'prone' && stance !== 'prone';
    const speed = inp.localVel.length();
    o.speed = speed;
    this.idleTime += dt;
    if (!g) return;
    // Synthesized prone uses the plain idle (legs straight) — the crawl is procedural.
    const loco = o.synthProne ? [] : g.loco;
    const idle = (inp.aiming && g.aimIdle) || g.idle || g.aimIdle;
    if (idle) this.setTime(idle, this.idleTime);
    if (loco.length === 0 || speed < 0.05) {
      if (idle) this.target.set(idle, 1);
      o.idleWeight = 1;
      o.forwardOnly = true;
      return;
    }

    // Direction: angle of movement in body space (0 = forward, + = right).
    const ang = Math.atan2(inp.localVel.x, inp.localVel.y);
    const dirs = uniqueAngles(loco);
    o.forwardOnly = dirs.length === 1;
    let clipsForBlend: { c: ClipInfo; w: number }[];
    if (o.forwardOnly) {
      // Forward clips only: play them forward (reversed when moving backward) and twist the hips.
      const back = Math.abs(ang) > Math.PI * 0.6;
      o.reversed = back;
      const legAng = back ? wrap(ang + Math.PI) : ang;
      o.hipYaw = Math.max(-1.25, Math.min(1.25, legAng));
      clipsForBlend = speedBlend(loco, speed);
    } else {
      // Blend the two nearest direction sets by angle, each with its own speed blend.
      const [a0, a1, t] = bracket(dirs, ang);
      const s0 = speedBlend(loco.filter((c) => Math.abs(wrap(c.angle - a0)) < 0.2), speed);
      const s1 = speedBlend(loco.filter((c) => Math.abs(wrap(c.angle - a1)) < 0.2), speed);
      clipsForBlend = [...s0.map((x) => ({ c: x.c, w: x.w * (1 - t) })), ...s1.map((x) => ({ c: x.c, w: x.w * t }))];
      // Residual angle between sparse directions (e.g. 4-way sets): small hip twist.
      const span = Math.abs(wrap(a1 - a0));
      if (span > 1.0) o.hipYaw = Math.max(-0.5, Math.min(0.5, wrap(ang - (t < 0.5 ? a0 : a1)) * 0.6));
    }

    // Distance-synced phase: metres per cycle blended over the participating clips.
    let cycleDist = 0, wsum = 0, slowest = Infinity;
    for (const { c, w } of clipsForBlend) {
      cycleDist += c.speed * c.clip.duration * w;
      wsum += w;
      slowest = Math.min(slowest, c.speed);
    }
    cycleDist = wsum > 0 ? cycleDist / wsum : 1;
    const dPhase = (speed * dt) / Math.max(0.05, cycleDist);
    this.phase = (this.phase + (o.reversed ? -dPhase : dPhase)) % 1;
    if (this.phase < 0) this.phase += 1;
    o.phase = this.phase;

    // Idle blend below the slowest clip speed.
    const moveW = Math.min(1, speed / Math.max(0.3, slowest * 0.6));
    o.idleWeight = 1 - moveW;
    if (idle && moveW < 1) this.target.set(idle, 1 - moveW);
    for (const { c, w } of clipsForBlend) {
      if (w <= 1e-4) continue;
      this.target.set(c, (this.target.get(c) ?? 0) + w * moveW);
      this.setTime(c, this.phase * c.clip.duration);
    }
    // Clips fading out keep following the phase so they don't freeze.
    for (const c of this.actions.keys()) if (c.kind === 'loco' && !this.target.has(c)) this.setTime(c, this.phase * c.clip.duration);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function uniqueAngles(clips: ClipInfo[]): number[] {
  const out: number[] = [];
  for (const c of clips) if (!out.some((a) => Math.abs(wrap(a - c.angle)) < 0.2)) out.push(c.angle);
  return out.sort((a, b) => a - b);
}

/** Two nearest angles around `ang` (one on each side) and the interpolation factor toward the second. */
export function bracket(dirs: number[], ang: number): [number, number, number] {
  let best0 = dirs[0], best1 = dirs[0], d0 = Infinity, d1 = Infinity;
  for (const a of dirs) {
    const d = wrap(ang - a);
    if (d >= 0 && d < d0) {
      d0 = d;
      best0 = a;
    }
    if (d <= 0 && -d < d1) {
      d1 = -d;
      best1 = a;
    }
  }
  if (!isFinite(d0)) return [best1, best1, 0];
  if (!isFinite(d1)) return [best0, best0, 0];
  const span = d0 + d1;
  return [best0, best1, span > 1e-4 ? d0 / span : 0];
}

/** Weights over clips (same direction) bracketing `speed`. */
export function speedBlend(clips: ClipInfo[], speed: number): { c: ClipInfo; w: number }[] {
  if (clips.length === 0) return [];
  const sorted = [...clips].sort((a, b) => a.speed - b.speed);
  if (speed <= sorted[0].speed) return [{ c: sorted[0], w: 1 }];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (speed <= b.speed) {
      const t = (speed - a.speed) / Math.max(1e-4, b.speed - a.speed);
      return [
        { c: a, w: 1 - t },
        { c: b, w: t },
      ];
    }
  }
  return [{ c: sorted[sorted.length - 1], w: 1 }];
}
