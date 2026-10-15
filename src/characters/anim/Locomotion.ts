// Locomotion blend layer: picks clips per stance/style, blends idle ↔ directional gaits by speed and
// direction, and advances a shared cycle phase by distance travelled (no foot sliding: playback is synced
// to the actual ground speed through each clip's metres-per-cycle). Drives an AnimationMixer manually.
import * as THREE from 'three';
import type { ClipInfo, ClipKind, ClipStance, ClipStyle } from './Clips';
import type { CharacterLibrary } from './CharacterLibrary';

/** What the locomotion layer should show this frame (filled by the visual from the character state). */
export interface LocoInput {
  stance: ClipStance;
  style: ClipStyle;
  /** Local velocity: x = right, y = forward (m/s) relative to the body facing. */
  localVel: THREE.Vector2;
  /** Override pose kind (air, swim, freefall, parachute, seated, knocked) or null for ground locomotion. */
  special: ClipKind | null;
  sprinting: boolean;
}

export interface LocoOutput {
  /** True when the ground stance group was synthesized from stand clips (procedural crouch/prone needed). */
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
  /** Normalized locomotion phase 0..1 (left foot contact ≈ 0). */
  phase: number;
  /** Ground speed shown by the animation (for procedural cycles). */
  speed: number;
}

interface Group {
  idle: ClipInfo | null;
  loco: ClipInfo[];
}

const WEIGHT_RATE = 6; // 1/s crossfade speed

export class Locomotion {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipInfo, THREE.AnimationAction>();
  private readonly target = new Map<ClipInfo, number>();
  private readonly weights = new Map<ClipInfo, number>();
  private readonly groups = new Map<string, Group>();
  private readonly specials = new Map<ClipKind, ClipInfo>();
  private phase = 0;
  private idleTime = 0;
  private specialTime = 0;
  private lastSpecial: ClipKind | null = null;
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

  constructor(root: THREE.Object3D, private readonly lib: CharacterLibrary, phaseOffset = 0) {
    this.mixer = new THREE.AnimationMixer(root);
    this.phase = phaseOffset;
    for (const stance of ['stand', 'crouch', 'prone'] as const)
      for (const style of ['unarmed', 'rifle', 'pistol'] as const) {
        const idle = lib.clips.find((c) => c.kind === 'idle' && c.stance === stance && c.style === style) ?? null;
        const loco = lib.clips.filter((c) => c.kind === 'loco' && c.stance === stance && c.style === style && c.speed > 0.05);
        if (idle || loco.length) this.groups.set(`${stance}/${style}`, { idle, loco });
      }
    for (const c of lib.clips) if (c.kind !== 'loco' && c.kind !== 'idle' && !this.specials.has(c.kind)) this.specials.set(c.kind, c);
  }

  private action(c: ClipInfo): THREE.AnimationAction {
    let a = this.actions.get(c);
    if (!a) {
      a = this.mixer.clipAction(c.clip);
      a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.play();
      a.setEffectiveWeight(0);
      a.timeScale = 0; // time is driven manually
      this.actions.set(c, a);
      this.weights.set(c, 0);
    }
    return a;
  }

  /** Find the best group for a stance/style: exact, then unarmed, then stand (synthesized). */
  private group(stance: ClipStance, style: ClipStyle): { g: Group | null; stance: ClipStance } {
    const exact = this.groups.get(`${stance}/${style}`);
    if (exact && exact.loco.length) return { g: exact, stance };
    const un = this.groups.get(`${stance}/unarmed`);
    if (un && un.loco.length) return { g: un, stance };
    if (exact?.idle || un?.idle) return { g: exact ?? un!, stance };
    const st = this.groups.get(`stand/${style}`);
    if (st && st.loco.length) return { g: st, stance: 'stand' };
    return { g: this.groups.get('stand/unarmed') ?? st ?? null, stance: 'stand' };
  }

  /** Debug: play exactly this clip (by name) and nothing else. */
  forceClip: string | null = null;
  private forceTime = 0;

  update(dt: number, inp: LocoInput): void {
    const o = this.out;
    this.target.clear();
    if (this.forceClip) {
      const c = this.lib.clipByName.get(this.forceClip);
      if (c) {
        this.forceTime += dt;
        const a = this.action(c);
        a.time = c.loop ? this.forceTime % Math.max(0.01, c.clip.duration) : Math.min(this.forceTime, c.clip.duration);
        for (const [cc, aa] of this.actions) {
          aa.setEffectiveWeight(cc === c ? 1 : 0);
          aa.enabled = cc === c;
          this.weights.set(cc, cc === c ? 1 : 0);
        }
        this.mixer.update(0);
        o.specialCovered = true;
        return;
      }
    } else this.forceTime = 0;
    o.specialCovered = false;
    o.hipYaw = 0;
    o.reversed = false;

    if (inp.special) {
      const sc = this.specials.get(inp.special);
      if (inp.special !== this.lastSpecial) this.specialTime = 0;
      this.lastSpecial = inp.special;
      this.specialTime += dt;
      if (sc) {
        o.specialCovered = true;
        this.target.set(sc, 1);
        const a = this.action(sc);
        a.time = sc.loop ? this.specialTime % Math.max(0.01, sc.clip.duration) : Math.min(this.specialTime, sc.clip.duration);
      }
    } else this.lastSpecial = null;

    if (!o.specialCovered) this.updateGround(dt, inp);

    // Crossfade weights toward targets, normalize, push to the mixer.
    let total = 0;
    for (const c of this.actions.keys()) {
      const t = this.target.get(c) ?? 0;
      const w = this.weights.get(c) ?? 0;
      const k = Math.min(1, dt * WEIGHT_RATE);
      const nw = w + (t - w) * k;
      this.weights.set(c, nw < 1e-3 && t === 0 ? 0 : nw);
      total += this.weights.get(c)!;
    }
    for (const [c, a] of this.actions) {
      const w = total > 1e-6 ? this.weights.get(c)! / total : 0;
      a.setEffectiveWeight(w);
      a.enabled = w > 0;
    }
    this.mixer.update(0);
  }

  private updateGround(dt: number, inp: LocoInput): void {
    const o = this.out;
    const { g, stance } = this.group(inp.stance, inp.style);
    o.synthCrouch = inp.stance === 'crouch' && stance !== 'crouch';
    o.synthProne = inp.stance === 'prone' && stance !== 'prone';
    const speed = inp.localVel.length();
    o.speed = speed;
    this.idleTime += dt;
    if (!g) return;
    const loco = g.loco;
    const idle = g.idle;
    if (idle) {
      const a = this.action(idle);
      a.time = this.idleTime % Math.max(0.01, idle.clip.duration);
    }
    if (loco.length === 0 || speed < 0.05) {
      if (idle) this.target.set(idle, 1);
      o.idleWeight = 1;
      o.forwardOnly = true;
      return;
    }

    // Direction: angle of movement in body space (0 = forward, + = right).
    let ang = Math.atan2(inp.localVel.x, inp.localVel.y);
    const dirs = uniqueAngles(loco);
    o.forwardOnly = dirs.length === 1;
    let clipsForBlend: { c: ClipInfo; w: number }[] = [];
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
      // Residual angle the clips don't cover (e.g. only f/b/l/r for a diagonal) → small hip twist.
      o.hipYaw = 0;
      ang = 0;
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
      const a = this.action(c);
      a.time = this.phase * c.clip.duration;
    }
    // Clips that are fading out keep following the phase so they don't freeze.
    for (const [c, a] of this.actions) if (c.kind === 'loco' && !this.target.has(c)) a.time = this.phase * c.clip.duration;
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

function uniqueAngles(clips: ClipInfo[]): number[] {
  const out: number[] = [];
  for (const c of clips) if (!out.some((a) => Math.abs(wrap(a - c.angle)) < 0.2)) out.push(c.angle);
  return out.sort((a, b) => a - b);
}

/** Two nearest angles around `ang` and the interpolation factor. */
function bracket(dirs: number[], ang: number): [number, number, number] {
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
function speedBlend(clips: ClipInfo[], speed: number): { c: ClipInfo; w: number }[] {
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

export { speedBlend, bracket, uniqueAngles };
