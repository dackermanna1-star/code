// Procedural zombie animation: each state produces a target pose (joint angles + hip offsets);
// state changes cross-fade from the current pose; hit reactions / twitches are additive damped springs.
import { PX } from './layout.js';

// pose channels (offsets in skin pixels, angles in radians)
export const CH = {
  RY: 0, RZ: 1, RX: 2, RRX: 3, RRY: 4, RRZ: 5,
  CX: 6, CY: 7, CZ: 8, HX: 9, HY: 10, HZ: 11, JAW: 12,
  ARX: 13, ARY: 14, ARZ: 15, ER: 16, ALX: 17, ALY: 18, ALZ: 19, EL: 20,
  LRX: 21, LRZ: 22, KR: 23, LLX: 24, LLZ: 25, KL: 26,
};
export const N_CH = 27;
const {
  RY, RZ, RX, RRX, RRY, RRZ, CX, CY, CZ, HX, HY, HZ, JAW,
  ARX, ARY, ARZ, ER, ALX, ALY, ALZ, EL, LRX, LRZ, KR, LLX, LLZ, KL,
} = CH;

const TRANS = {
  idle: 0.35, walk: 0.28, run: 0.22, crawl: 0.3, attack: 0.09, bash: 0.15, stagger: 0.05, knockdown: 0.07,
  down: 0.18, getup: 0.08, feed: 0.45, scream: 0.15, crawlIdle: 0.3, crawlAttack: 0.1, crawlFeed: 0.4,
};
const VARIANT_STYLE = {
  walker: { lean: 0.06, headX: 0, armOut: 0, crouch: 0, sway: 1, speedMul: 1 },
  crawler: { lean: 0.06, headX: 0, armOut: 0, crouch: 0, sway: 1, speedMul: 1 },
  runner: { lean: 0.22, headX: -0.18, armOut: 0.06, crouch: -0.8, sway: 0.8, speedMul: 1.15 },
  brute: { lean: 0.2, headX: -0.08, armOut: 0.16, crouch: -0.6, sway: 1.3, speedMul: 0.85 },
  screamer: { lean: 0.02, headX: 0.12, armOut: 0.04, crouch: 0, sway: 1, speedMul: 1 },
  bloater: { lean: -0.14, headX: 0.05, armOut: 0.34, crouch: -0.4, sway: 1.9, speedMul: 0.8 },
};

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class ZombieAnimator {
  /**
   * @param variant zombie variant
   * @param rng seeded rng (personality + twitch timing)
   * @param dims VARIANT_DIMS entry
   */
  constructor(variant, rng, dims) {
    this.variant = variant;
    this.rng = rng;
    this.dims = dims;
    this.V = VARIANT_STYLE[variant] || VARIANT_STYLE.walker;
    this.legLen = 12 * PX * dims.scale;
    // personality
    this.limpSide = rng.chance(0.5) ? 1 : -1;
    this.limp = variant === 'runner' ? rng.range(0, 0.15) : rng.range(0.1, 0.65);
    this.headTilt = rng.range(-0.24, 0.24);
    this.armAsym = rng.range(-0.18, 0.18);
    this.po = rng.range(0, 6.283);
    this.lean = rng.range(0.02, 0.2);
    this.twitchiness = rng.range(0.6, 1.4) * (variant === 'runner' ? 1.5 : 1);
    this.downSide = rng.chance(0.5) ? 1 : -1;
    this.brokenLegs = false;
    this.crawlMode = variant === 'crawler';

    this.state = 'idle';
    this.prevState = 'idle';
    this.stateTime = 0;
    this.blend = 1;
    this.blendDur = 0.3;
    this.t = rng.range(0, 100);
    this.phase = rng.range(0, 6.283);
    this.bashPhase = 0;
    this.aggro = 0;
    this.speed = 0;
    this.amp = 0;
    this.staggerSide = 1;
    this.twitchT = rng.range(0.5, 3);

    this.from = new Float32Array(N_CH);
    this.target = new Float32Array(N_CH);
    this.out = new Float32Array(N_CH);
    this.sp = new Float32Array(N_CH); // spring offsets
    this.sv = new Float32Array(N_CH); // spring velocities
    this.first = true;
  }

  _mapState(s) {
    if (!this.crawlMode) return s;
    switch (s) {
      case 'walk': case 'run': case 'crawl': return 'crawl';
      case 'attack': case 'bash': return 'crawlAttack';
      case 'feed': return 'crawlFeed';
      default: return 'crawlIdle';
    }
  }

  setState(s) {
    if (s === this.state) return;
    this.from.set(this.out);
    this.prevState = this.state;
    this.state = s;
    this.stateTime = 0;
    this.blend = 0;
    this.blendDur = TRANS[s] ?? 0.22;
    if (s === 'bash') this.bashPhase = 0.1;
  }

  /** anim: {state, speed, attackT, aggro, lookYaw, lookPitch} → this.out */
  update(dt, anim) {
    if (dt > 0.1) dt = 0.1;
    const st = this._mapState(anim.state || 'idle');
    this.setState(st);
    this.t += dt;
    this.stateTime += dt;
    // smoothed inputs
    const k = 1 - Math.exp(-dt * 6);
    this.aggro += ((anim.aggro ?? 0) - this.aggro) * k;
    const spd = Math.max(0, anim.speed ?? 0);
    this.speed += (spd - this.speed) * (1 - Math.exp(-dt * 10));

    // gait phase driven by real ground speed (no foot sliding)
    const s = this.speed;
    const L = this.legLen;
    let ampTarget = 0;
    if (st === 'walk') {
      ampTarget = s < 0.02 ? 0 : clamp(0.2 + s * 0.22, 0.2, 0.55);
      const a = Math.max(this.amp, 0.15);
      const cycle = 4 * L * Math.sin(a) * 0.95;
      this.phase += 2 * PI * s * dt / cycle;
    } else if (st === 'run') {
      ampTarget = s < 0.05 ? 0.2 : clamp(0.45 + s * 0.08, 0.5, 0.95);
      const a = Math.max(this.amp, 0.3);
      const cycle = 4 * L * Math.sin(a) * 0.85;
      this.phase += 2 * PI * s * dt / cycle;
    } else if (st === 'crawl') {
      ampTarget = 1;
      this.phase += 2 * PI * s * dt / (0.8 * this.dims.scale);
    }
    this.amp += (ampTarget - this.amp) * (1 - Math.exp(-dt * 5));
    if (st === 'bash') this.bashPhase += dt * 1.25;

    // target pose
    const T = this.target;
    T.fill(0);
    switch (st) {
      case 'walk': this.poseWalk(T); break;
      case 'run': this.poseRun(T); break;
      case 'attack': this.poseAttack(T, anim.attackT ?? 0); break;
      case 'bash': this.poseBash(T); break;
      case 'stagger': this.poseStagger(T, this.stateTime); break;
      case 'knockdown': this.poseKnockdown(T, this.stateTime); break;
      case 'down': this.poseDown(T, this.t); break;
      case 'getup': this.poseGetup(T, this.stateTime); break;
      case 'feed': this.poseFeed(T, this.t); break;
      case 'scream': this.poseScream(T, this.stateTime); break;
      case 'crawl': this.poseCrawl(T, this.phase, 1); break;
      case 'crawlIdle': this.poseCrawl(T, this.po + this.t * 0.4, 0); break;
      case 'crawlAttack': this.poseCrawlAttack(T, anim.attackT ?? ((this.t * 1.2) % 1)); break;
      case 'crawlFeed': this.poseCrawlFeed(T, this.t); break;
      default: this.poseIdle(T, this.t);
    }

    // cross-fade
    const O = this.out;
    if (this.first) { O.set(T); this.from.set(T); this.first = false; this.blend = 1; }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const w = sstep(0, 1, this.blend);
      for (let i = 0; i < N_CH; i++) O[i] = this.from[i] + (T[i] - this.from[i]) * w;
    } else O.set(T);

    // twitches
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      const r = this.rng;
      const ch = r.pick([HX, HY, HZ, HZ, ARX, ALX, CZ, ARZ, ALZ]);
      this.sv[ch] += (r.next() - 0.5) * 9 * this.twitchiness;
      const busy = st === 'down' || st === 'feed' || st === 'crawlIdle' || st === 'idle';
      this.twitchT = r.range(0.8, busy ? 3.5 : 6) / this.twitchiness;
    }
    // springs (additive hit reactions)
    let h = dt;
    while (h > 0) {
      const step = Math.min(h, 1 / 60);
      for (let i = 0; i < N_CH; i++) {
        const x = this.sp[i], v = this.sv[i];
        if (x === 0 && v === 0) continue;
        const nv = v + (-170 * x - 14 * v) * step;
        let nx = x + nv * step;
        if (Math.abs(nx) < 1e-5 && Math.abs(nv) < 1e-4) { this.sp[i] = 0; this.sv[i] = 0; continue; }
        this.sp[i] = nx; this.sv[i] = nv;
      }
      h -= step;
    }
    for (let i = 0; i < N_CH; i++) O[i] += this.sp[i];

    // look-at offsets (only when upright)
    const upright = !(st === 'down' || st === 'knockdown' || st === 'getup');
    if (upright) {
      const ly = clamp(anim.lookYaw ?? 0, -1.2, 1.2);
      const lp = clamp(anim.lookPitch ?? 0, -0.8, 0.8);
      O[HY] += ly * 0.65; O[CY] += ly * 0.25;
      O[HX] -= lp * 0.7;
    }
    return O;
  }

  /** Additive hit reaction. localDir = push direction in zombie space (z forward), strength 0..1 */
  hit(part, lx, ly, lz, strength) {
    const s = 3 + 9 * clamp(strength, 0, 1);
    const r = this.rng.next() - 0.5;
    const sv = this.sv;
    this.staggerSide = lx >= 0 ? 1 : -1;
    switch (part) {
      case 'head':
        sv[HX] += lz * s * 1.4 - Math.abs(ly) * s * 0.3; sv[HZ] += -lx * s * 1.2; sv[HY] += r * s * 0.8;
        sv[CX] += lz * s * 0.3; sv[JAW] += s * 0.12;
        break;
      case 'armR':
        sv[ARX] += -lz * s * 1.1; sv[ARZ] += -lx * s * 0.8; sv[ER] -= s * 0.2; sv[CY] += lz * s * 0.35;
        break;
      case 'armL':
        sv[ALX] += -lz * s * 1.1; sv[ALZ] += -lx * s * 0.8; sv[EL] -= s * 0.2; sv[CY] -= lz * s * 0.35;
        break;
      case 'legR':
        sv[LRX] += -lz * s * 0.6; sv[KR] += s * 0.4; sv[RY] -= s * 1.5; sv[RRZ] += s * 0.05;
        break;
      case 'legL':
        sv[LLX] += -lz * s * 0.6; sv[KL] += s * 0.4; sv[RY] -= s * 1.5; sv[RRZ] -= s * 0.05;
        break;
      default: // torso
        sv[CX] += lz * s * 0.8; sv[CZ] += -lx * s * 0.5; sv[CY] += r * s * 0.7;
        sv[ARX] -= s * 0.35; sv[ALX] -= s * 0.3; sv[ARZ] -= s * 0.2; sv[ALZ] += s * 0.2;
        sv[HX] += -lz * s * 0.4; sv[RZ] += lz * s * 2.0;
    }
  }

  // ---------------------------------------------------------------- helpers
  arms(T, xR, oR, eR, xL, oL, eL) {
    T[ARX] = xR; T[ARZ] = -oR; T[ER] = Math.min(0, eR);
    T[ALX] = xL; T[ALZ] = oL; T[EL] = Math.min(0, eL);
  }
  legs(T, xR, oR, kR, xL, oL, kL) {
    T[LRX] = xR; T[LRZ] = -oR; T[KR] = Math.max(0, kR);
    T[LLX] = xL; T[LLZ] = oL; T[KL] = Math.max(0, kL);
  }
  get torsoHalfDepth() { return this.dims.torso[2] / 2; }

  // ---------------------------------------------------------------- poses
  poseIdle(T, t) {
    const V = this.V, a = this.aggro, po = this.po;
    const s1 = Math.sin(t * 1.1 + po), s2 = Math.sin(t * 0.7 + po * 1.3), s3 = Math.sin(t * 0.45 + po * 0.7);
    T[RY] = -0.35 + 0.15 * s1 + V.crouch;
    T[RRZ] = 0.025 * s2 * V.sway + this.limpSide * this.limp * 0.05;
    T[RX] = 0.3 * s2 * V.sway;
    T[CX] = this.lean * 0.7 + V.lean + 0.03 * s1;
    T[CZ] = 0.04 * s2; T[CY] = 0.06 * s3;
    T[HX] = 0.12 + 0.1 * s3 + V.headX; T[HY] = 0.28 * s3; T[HZ] = this.headTilt + 0.1 * s2;
    T[JAW] = 0.02 + 0.1 * Math.max(0, Math.sin(t * 0.8 + po)) ** 2;
    const raise = -1.25;
    this.arms(T,
      lerp(-0.1 + 0.05 * s1, raise + 0.08 * s1 + this.armAsym, a), 0.07 + 0.08 * a + V.armOut, lerp(-0.12, -0.3, a),
      lerp(-0.08 + 0.05 * s2, raise + 0.08 * s2 - this.armAsym, a), 0.07 + 0.08 * a + V.armOut, lerp(-0.1, -0.28, a));
    this.legs(T, 0.03, 0.04, 0.06 - V.crouch * 0.1, -0.04, 0.04, 0.06 - V.crouch * 0.1);
  }

  poseWalk(T) {
    const V = this.V, a = this.aggro, A = this.amp, ph = this.phase;
    const sp = Math.sin(ph), cp = Math.cos(ph);
    const limpR = this.limpSide > 0 ? 1 - this.limp * 0.45 : 1;
    const limpL = this.limpSide < 0 ? 1 - this.limp * 0.45 : 1;
    const stanceLimp = this.limpSide > 0 ? Math.max(0, cp) : Math.max(0, -cp);
    const bob = 1.2 * (A / 0.45);
    T[RY] = -bob * sp * sp - 0.3 - this.limp * 1.3 * stanceLimp + V.crouch;
    T[RRZ] = 0.05 * sp * V.sway + this.limpSide * this.limp * 0.1 * stanceLimp;
    T[RX] = -0.5 * cp * V.sway;
    T[RRY] = 0.05 * sp;
    T[CX] = this.lean + V.lean + 0.05 + 0.04 * Math.cos(2 * ph);
    T[CY] = -0.14 * sp; T[CZ] = -0.04 * cp * V.sway;
    T[HX] = 0.1 + 0.06 * Math.cos(2 * ph) + V.headX;
    T[HY] = 0.18 * Math.sin(ph * 0.5 + this.po);
    T[HZ] = this.headTilt + 0.13 * Math.sin(ph * 0.5 + 1.3);
    T[JAW] = 0.03 + 0.1 * Math.max(0, Math.sin(this.t * 1.3 + this.po)) ** 2;
    const hangR = -0.75 * A * sp - 0.08, hangL = 0.75 * A * sp - 0.08;
    const raR = -1.3 + 0.1 * Math.sin(ph + 0.6) + this.armAsym, raL = -1.25 + 0.1 * Math.sin(ph + 0.6 + PI) - this.armAsym;
    this.arms(T,
      lerp(hangR, raR, a), 0.08 + V.armOut, lerp(-0.15, -0.35, a) - 0.12 * Math.max(0, sp),
      lerp(hangL, raL, a), 0.08 + V.armOut, lerp(-0.15, -0.32, a) - 0.12 * Math.max(0, -sp));
    this.legs(T,
      A * sp * limpR, 0.03, 0.1 + 1.35 * A * Math.max(0, -cp) * limpR - V.crouch * 0.1,
      -A * sp * limpL, 0.03, 0.1 + 1.35 * A * Math.max(0, cp) * limpL - V.crouch * 0.1);
  }

  poseRun(T) {
    const V = this.V, A = this.amp, ph = this.phase, t = this.t;
    const sp = Math.sin(ph), cp = Math.cos(ph);
    T[RY] = -1.6 - 0.8 * Math.cos(2 * ph) + V.crouch;
    T[RRY] = 0.1 * sp;
    T[RRZ] = 0.04 * cp;
    T[CX] = 0.42 + V.lean * 0.6 + 0.05 * Math.cos(2 * ph);
    T[CY] = -0.24 * sp;
    T[HX] = -0.38 + 0.06 * Math.cos(2 * ph) + V.headX * 0.5;
    T[HZ] = 0.08 * Math.sin(ph) + this.headTilt * 0.4;
    T[JAW] = 0.3 + 0.18 * Math.sin(t * 7);
    this.arms(T,
      -1.05 - 0.85 * A * sp, 0.22 + V.armOut, -0.75 - 0.35 * Math.max(0, sp),
      -1.05 + 0.85 * A * sp, 0.22 + V.armOut, -0.75 - 0.35 * Math.max(0, -sp));
    this.legs(T,
      1.05 * A * sp - 0.2, 0.04, 0.3 + 1.9 * A * Math.max(0, -cp) + 0.5 * A * Math.max(0, sp),
      -1.05 * A * sp - 0.2, 0.04, 0.3 + 1.9 * A * Math.max(0, cp) + 0.5 * A * Math.max(0, -sp));
  }

  poseAttack(T, w) {
    const V = this.V;
    const windup = sstep(0, 0.38, w) * (1 - sstep(0.38, 0.52, w));
    const strike = sstep(0.36, 0.52, w) * (1 - sstep(0.64, 1.0, w));
    T[RY] = -0.4 - 1.3 * strike + V.crouch;
    T[RZ] = 2.6 * strike;
    T[CX] = this.lean + V.lean + 0.05 - 0.28 * windup + 0.55 * strike;
    T[CY] = 0.12 * windup - 0.12 * strike;
    T[HX] = -0.3 * windup + 0.12 * strike + V.headX;
    T[HZ] = this.headTilt * 0.5;
    T[JAW] = 0.15 + 0.45 * windup + 0.4 * strike;
    this.arms(T,
      -1.25 - 1.2 * windup + 0.85 * strike, 0.15 + 0.4 * windup - 0.5 * strike + V.armOut, -0.3 - 0.85 * windup + 0.25 * strike,
      -1.2 - 1.1 * windup + 0.9 * strike, 0.15 + 0.38 * windup - 0.48 * strike + V.armOut, -0.3 - 0.8 * windup + 0.25 * strike);
    this.legs(T, -0.45 * strike + 0.08 * windup, 0.05, 0.15 + 0.35 * strike, 0.3 * strike, 0.05, 0.1 + 0.25 * strike);
  }

  poseBash(T) {
    const V = this.V;
    const p = this.bashPhase % 1;
    const raise = p < 0.62 ? sstep(0, 0.62, p) : 1 - sstep(0.62, 0.76, p);
    const imp = sstep(0.66, 0.74, p) * (1 - sstep(0.74, 0.95, p));
    T[RY] = -1 - 1.1 * imp + V.crouch;
    T[RZ] = 1.5 * imp;
    T[CX] = this.lean + 0.12 - 0.2 * raise + 0.38 * imp;
    T[HX] = -0.18 * raise + 0.22 * imp;
    T[JAW] = 0.2 + 0.35 * imp + 0.1 * raise;
    T[HZ] = this.headTilt * 0.5;
    this.arms(T,
      -1.15 - 1.6 * raise + 0.15 * imp, 0.1 + 0.15 * raise, -0.25 - 0.75 * raise,
      -1.2 - 1.55 * raise + 0.1 * imp, 0.1 + 0.15 * raise, -0.25 - 0.7 * raise);
    this.legs(T, -0.28, 0.05, 0.28, 0.22, 0.05, 0.12);
  }

  poseStagger(T, tau) {
    const e = tau < 0.1 ? easeOut(tau / 0.1) : Math.exp(-(tau - 0.1) * 3.0);
    const sd = this.staggerSide;
    T[RY] = -0.8 * e - 0.3;
    T[RZ] = -2.6 * e;
    T[CX] = this.lean + this.V.lean - 0.55 * e;
    T[CZ] = 0.12 * e * sd;
    T[HX] = -0.5 * e; T[HZ] = -0.22 * e * sd + this.headTilt * 0.5;
    T[JAW] = 0.1 + 0.35 * e;
    this.arms(T,
      -0.5 - 1.1 * e * (0.6 + 0.4 * Math.sin(tau * 13)), 0.2 + 0.7 * e, -0.2 - 0.4 * e,
      -0.4 - 1.0 * e * (0.6 + 0.4 * Math.cos(tau * 11)), 0.2 + 0.6 * e, -0.2 - 0.35 * e);
    this.legs(T, 0.42 * e, 0.06, 0.2 + 0.35 * e, -0.25 * e, 0.06, 0.15);
  }

  lyingPose(T, t, reach) {
    const lift = this.torsoHalfDepth;
    T[RRX] = -PI / 2;
    T[RY] = -(12 - lift - 0.2);
    T[RZ] = -5;
    T[RRY] = 0.12 * this.downSide;
    T[CX] = 0;
    T[HX] = -0.15 + 0.05 * Math.sin(t * 0.7);
    T[HY] = 0.55 * this.downSide;
    T[JAW] = 0.22 + 0.1 * Math.max(0, Math.sin(t * 1.1));
    // arms rest above the head / by the side, or claw at the sky when aggressive
    const restR = this.downSide > 0 ? -2.6 : -0.15, restL = this.downSide > 0 ? -0.2 : -2.5;
    this.arms(T,
      lerp(restR, -1.45 + 0.18 * Math.sin(t * 2.3), reach), lerp(0.55, 0.15, reach), lerp(-0.15, -0.5 - 0.2 * Math.sin(t * 2.9), reach),
      lerp(restL, -1.35 + 0.18 * Math.sin(t * 2.1 + 1), reach), lerp(0.5, 0.15, reach), lerp(-0.1, -0.5 - 0.2 * Math.sin(t * 2.5), reach));
    this.legs(T, -0.18, 0.14, 0.3, 0.04, 0.12, 0.1);
  }

  poseKnockdown(T, tau) {
    // keyframes: standing → knees buckle & fall back → on the back (bounce)
    const K1 = this._k1 || (this._k1 = new Float32Array(N_CH));
    const K2 = this._k2 || (this._k2 = new Float32Array(N_CH));
    const K0 = this._k0 || (this._k0 = new Float32Array(N_CH));
    K0.fill(0); K1.fill(0); K2.fill(0);
    this.poseStagger(K0, 0.1);
    // buckled
    K1[RY] = -4.5; K1[RRX] = -0.4; K1[RZ] = -2; K1[CX] = -0.25; K1[HX] = 0.35; K1[JAW] = 0.4;
    this.arms(K1, -2.0, 0.6, -0.4, -1.9, 0.55, -0.35);
    this.legs(K1, -0.75, 0.1, 1.05, -0.6, 0.1, 0.95);
    // on the ground
    this.lyingPose(K2, this.t, 0);
    K2[HX] = 0.25;
    this.arms(K2, -2.45, 0.75, -0.2, -2.3, 0.7, -0.25);
    if (tau < 0.3) {
      const f = sstep(0, 1, tau / 0.3);
      for (let i = 0; i < N_CH; i++) T[i] = lerp(K0[i], K1[i], f);
    } else if (tau < 0.62) {
      const f = easeIn((tau - 0.3) / 0.32);
      for (let i = 0; i < N_CH; i++) T[i] = lerp(K1[i], K2[i], f);
    } else {
      // small impact bounce
      const b = Math.exp(-(tau - 0.62) * 9) * Math.sin((tau - 0.62) * 22) * 0.06;
      for (let i = 0; i < N_CH; i++) T[i] = K2[i];
      T[RRX] += b; T[HX] += b * 3; T[ARX] -= b * 3; T[ALX] -= b * 3;
      if (tau > 0.9) { const w = sstep(0.9, 1.3, tau); const D = this._kd || (this._kd = new Float32Array(N_CH)); D.fill(0); this.lyingPose(D, this.t, this.aggro); for (let i = 0; i < N_CH; i++) T[i] = lerp(T[i], D[i], w); }
    }
  }

  poseDown(T, t) {
    this.lyingPose(T, t, this.aggro);
  }

  poseGetup(T, tau) {
    const G0 = this._g0 || (this._g0 = new Float32Array(N_CH));
    const G1 = this._g1 || (this._g1 = new Float32Array(N_CH));
    const G2 = this._g2 || (this._g2 = new Float32Array(N_CH));
    const G3 = this._g3 || (this._g3 = new Float32Array(N_CH));
    G0.fill(0); G1.fill(0); G2.fill(0); G3.fill(0);
    this.lyingPose(G0, this.t, 0);
    // sitting up, propped on the arms
    G1[RRX] = -0.2; G1[RY] = -(12 - this.dims.leg[1] / 2 - 0.3); G1[RZ] = -3; G1[CX] = 0.35; G1[HX] = 0.25; G1[JAW] = 0.3;
    this.arms(G1, 0.55, 0.3, -0.1, 0.5, 0.3, -0.1);
    this.legs(G1, -1.55, 0.12, 0.35, -1.45, 0.1, 0.2);
    // kneeling on the left knee, right foot planted
    G2[RY] = -5.2; G2[RZ] = -1; G2[CX] = 0.55; G2[HX] = -0.05; G2[JAW] = 0.25;
    this.arms(G2, -0.75, 0.2, -0.5, -0.5, 0.25, -0.3);
    this.legs(G2, -1.35, 0.08, 1.45, 0.05, 0.08, 1.5);
    // standing
    this.poseIdle(G3, this.t);
    let a, b, f;
    if (tau < 0.5) { a = G0; b = G1; f = sstep(0, 1, tau / 0.5); }
    else if (tau < 1.0) { a = G1; b = G2; f = sstep(0, 1, (tau - 0.5) / 0.5); }
    else { a = G2; b = G3; f = sstep(0, 1, (tau - 1.0) / 0.5); }
    for (let i = 0; i < N_CH; i++) T[i] = lerp(a[i], b[i], f);
  }

  poseFeed(T, t) {
    const po = this.po;
    const tear = Math.max(0, Math.sin(t * 4.2 + po));
    T[RY] = -5.0; T[RZ] = -1.5;
    T[CX] = 0.95 + 0.12 * Math.sin(t * 2.1 + po);
    T[CZ] = 0.05 * Math.sin(t * 1.3);
    T[HX] = 0.55 + 0.35 * tear; T[HY] = 0.2 * Math.sin(t * 1.3 + po); T[HZ] = this.headTilt * 0.5 + 0.1 * Math.sin(t * 3.1);
    T[JAW] = 0.18 + 0.28 * Math.abs(Math.sin(t * 6.5));
    this.arms(T,
      -0.95 - 0.35 * Math.sin(t * 2.1 + po), 0.22, -0.55 - 0.35 * tear,
      -0.85 - 0.35 * Math.sin(t * 2.1 + po + 2.0), 0.22, -0.6 - 0.3 * Math.max(0, Math.sin(t * 4.2 + po + 1.5)));
    this.legs(T, -0.28, 0.12, 1.55, -0.18, 0.12, 1.5);
  }

  poseScream(T, tau) {
    const inhale = sstep(0, 0.35, tau) * (1 - sstep(0.35, 0.55, tau));
    const scr = sstep(0.35, 0.6, tau);
    const vib = Math.sin(tau * 41) * scr;
    T[RY] = -0.8 * scr - 0.3;
    T[CX] = this.lean + 0.28 * inhale - 0.45 * scr + 0.03 * vib;
    T[HX] = 0.25 * inhale - 0.8 * scr; T[HZ] = 0.05 * Math.sin(tau * 31) * scr; T[HY] = 0.04 * Math.sin(tau * 23) * scr;
    T[JAW] = 0.1 + 0.15 * inhale + 0.78 * scr;
    this.arms(T,
      -0.35 * inhale + 0.38 * scr, 0.2 + 0.95 * scr, -0.6 * inhale - 0.35 * scr + 0.06 * vib,
      -0.3 * inhale + 0.36 * scr, 0.2 + 0.9 * scr, -0.6 * inhale - 0.35 * scr - 0.06 * vib);
    this.legs(T, 0.02, 0.06 + 0.12 * scr, 0.06 + 0.15 * scr, -0.02, 0.06 + 0.12 * scr, 0.06 + 0.15 * scr);
  }

  poseCrawl(T, ph, moving) {
    const lift = this.torsoHalfDepth;
    const sp = Math.sin(ph);
    T[RRX] = 1.42;
    T[RY] = -(12 - lift - 0.6);
    T[RZ] = -9;
    T[RX] = 0.8 * sp * moving;
    T[RRZ] = 0.1 * sp * moving;
    T[RRY] = 0.06 * sp * moving;
    T[CX] = -0.48 - 0.06 * Math.sin(2 * ph) * moving;
    T[HX] = -0.62 + 0.08 * Math.sin(ph * 0.5);
    T[HY] = 0.15 * Math.sin(ph * 0.5 + this.po);
    T[HZ] = 0.1 * Math.sin(ph + 1) + this.headTilt * 0.4;
    T[JAW] = 0.25 + 0.15 * Math.max(0, Math.sin(this.t * 2));
    const reachR = 0.5 + 0.5 * Math.cos(ph), reachL = 0.5 + 0.5 * Math.cos(ph + PI);
    const liftR = Math.max(0, Math.sin(ph)), liftL = Math.max(0, Math.sin(ph + PI));
    const m = moving;
    this.arms(T,
      lerp(-2.0, -1.6 - 1.25 * reachR, m), lerp(0.3, 0.38 - 0.15 * reachR, m), lerp(-0.4, -0.25 - 1.0 * liftR, m),
      lerp(-1.85, -1.6 - 1.25 * reachL, m), lerp(0.3, 0.38 - 0.15 * reachL, m), lerp(-0.45, -0.25 - 1.0 * liftL, m));
    if (this.brokenLegs) this.legs(T, 0.15 + 0.05 * sp, 0.3, 0.9, 0.35, 0.05, 0.2);
    else this.legs(T, 0.16 + 0.06 * sp * m, 0.1, 0.15, 0.16 - 0.06 * sp * m, 0.1, 0.12);
  }

  poseCrawlAttack(T, w) {
    this.poseCrawl(T, this.phase, 0);
    const windup = sstep(0, 0.4, w) * (1 - sstep(0.4, 0.55, w));
    const strike = sstep(0.38, 0.55, w) * (1 - sstep(0.7, 1.0, w));
    T[CX] += -0.25 * windup - 0.1 * strike;
    T[HX] += -0.2 * windup;
    T[JAW] = 0.3 + 0.5 * windup + 0.3 * strike;
    T[RZ] += 2.5 * strike;
    this.arms(T, -2.3 - 0.4 * windup + 0.6 * strike, 0.5 * windup + 0.1, -0.6 * windup - 0.1, -2.2 - 0.4 * windup + 0.6 * strike, 0.5 * windup + 0.1, -0.6 * windup - 0.1);
  }

  poseCrawlFeed(T, t) {
    this.poseCrawl(T, this.po, 0);
    const tear = Math.max(0, Math.sin(t * 4.2 + this.po));
    T[CX] = -0.3; T[HX] = 0.15 + 0.25 * tear; T[JAW] = 0.2 + 0.25 * Math.abs(Math.sin(t * 6.5));
    this.arms(T, -2.0 - 0.3 * Math.sin(t * 2.1), 0.25, -0.7 - 0.3 * tear, -1.95 - 0.3 * Math.sin(t * 2.1 + 2), 0.25, -0.7);
  }
}
