// LAST LOOKOUT — TowerAudio: the game's sound, built on the sandbox's procedural AudioEngine
// (src/game/audio.js), which it composes: its voices, noise buffers, grain banks, limiter and
// reverb are reused; nothing here plays a file.
//
// Signal flow after unlock():
//   engine voices (dry) ┐
//   engine gun limiter  ├─> world low-pass (breath / slow-mo / low-HP muffle) -> duck -> sfx volume ┐
//   engine reverb       │     (the reverb's impulse response is replaced by the valley's)           │
//   ambience beds ──────┘                                                                            ├─> engine bus -> master
//   UI clicks, heartbeat, stings ── ui volume (= sfx) ───────────────────────────────────────────────┤
//   generative score ── music volume ────────────────────────────────────────────────────────────────┘
// Distances use a game curve (far impacts stay audible) applied through a "virtual position" on
// the same bearing, so the engine still pans and filters them; real speed-of-sound delays are
// scheduled for distant impacts, groans and explosions.
//
// Every public method is a silent no-op until unlock() succeeded and never throws.

import { AudioEngine } from '../../game/audio.js';
import { GenMusic } from './music.js';
import {
  renderValleyIR, renderCrickets, renderFrogs, renderHorde, renderRain, renderFire, renderWindNoise, loopCrossfade,
} from './dsp.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const rand = (a, b) => a + Math.random() * (b - a);
const vary = (x, amt) => x * (1 + (Math.random() * 2 - 1) * amt);
const pick = (a) => a[(Math.random() * a.length) | 0];

/** Loudness vs distance for the game: gentle, so a walker 250 m out still answers the shot. */
export function distanceGain(d) {
  return d <= 8 ? 1 : (1 + (d - 8) / 28) ** -0.8;
}
/** Air absorption: low-pass cutoff (Hz) for a sound `d` metres away. */
export function airCutoff(d) {
  return d <= 20 ? 20000 : clamp(20000 * (20 / d) ** 0.85, 1500, 20000);
}
/** Speed-of-sound delay (s), capped so the far valley stays responsive. */
export function soundDelay(d) {
  return clamp(num(d, 0) / 343, 0, 1.1);
}

/** Each rifle's voice: the same anatomy as the engine's guns, tuned per calibre. */
export const RIFLE_SOUND = {
  m91: {
    kind: 'bolt', blastMs: 1.9, blast: 1.1, nwave: 0.42, crack: 1.3, crackHP: 3300, crackTau: 0.0034,
    body: 1.05, bodyF: 1450, bodyQ: 0.8, bodyTau: 0.042, punch: 0.95, punchF: 330, punchTau: 0.055,
    boom: 0.8, boomF: 210, boomTau: 0.09, thump: 0.55, thumpF0: 118, thumpF1: 40, thumpTau: 0.09,
    drive: 2.8, level: 1, send: 0.7, echo: 1, heavy: 1,
  },
  sr10: {
    kind: 'semi', blastMs: 1.5, blast: 1, nwave: 0.38, crack: 1.35, crackHP: 3600, crackTau: 0.003,
    body: 1, bodyF: 1700, bodyQ: 0.9, bodyTau: 0.032, punch: 0.8, punchF: 380, punchTau: 0.042,
    boom: 0.55, boomF: 230, boomTau: 0.06, thump: 0.4, thumpF0: 130, thumpF1: 46, thumpTau: 0.06,
    drive: 2.6, level: 0.92, send: 0.6, echo: 0.8, mech: 'semi', heavy: 1.06,
  },
  whisper: {
    kind: 'bolt', suppressed: true, blastMs: 2.4, blast: 0.55, nwave: 0.6, crack: 0.95, crackHP: 4200, crackTau: 0.0022,
    body: 0.4, bodyF: 640, bodyQ: 0.7, bodyTau: 0.05, punch: 0.9, punchF: 180, punchTau: 0.07,
    boom: 0.75, boomF: 140, boomTau: 0.08, thump: 0.7, thumpF0: 95, thumpF1: 38, thumpTau: 0.08,
    drive: 2.2, level: 0.8, send: 0.3, echo: 0.42, heavy: 0.92,
  },
  anvil: {
    kind: 'semi', blastMs: 3.4, blast: 1.35, nwave: 0.65, crack: 1.25, crackHP: 2600, crackTau: 0.0045,
    body: 1.15, bodyF: 1000, bodyQ: 0.7, bodyTau: 0.06, punch: 1.15, punchF: 240, punchTau: 0.08,
    boom: 1.2, boomF: 150, boomTau: 0.16, thump: 0.95, thumpF0: 88, thumpF1: 26, thumpTau: 0.16,
    drive: 3.2, level: 1.05, send: 0.9, echo: 1.35, mech: 'heavy', debris: true, brake: true, heavy: 0.74,
  },
};

/** Slap-back and the roll of the report round the valley: [s, amp, cutoff Hz, smear s]. */
const VALLEY_ROLL = [[0.42, 0.34, 1500, 0.05], [0.78, 0.22, 1100, 0.09], [1.12, 0.17, 850, 0.13], [1.55, 0.13, 640, 0.18], [2.05, 0.09, 500, 0.24], [2.7, 0.055, 400, 0.3]];

/** Groan character per zombie kind. */
const VOICE = {
  walker: { f0: 82, dur: 1.2, fa: 520, fb: 1250, rasp: 0.35 },
  runner: { f0: 108, dur: 0.75, fa: 600, fb: 1500, rasp: 0.55 },
  crawler: { f0: 70, dur: 1.4, fa: 450, fb: 1000, rasp: 0.3, gurgle: 21 },
  climber: { f0: 122, dur: 0.6, fa: 700, fb: 1800, rasp: 0.85 },
  bloater: { f0: 60, dur: 1.6, fa: 380, fb: 820, rasp: 0.25, gurgle: 13 },
  screamer: { f0: 142, dur: 1, fa: 720, fb: 1650, rasp: 0.45 },
  armored: { f0: 78, dur: 1.2, fa: 500, fb: 1150, rasp: 0.35, muffled: true },
  brute: { f0: 55, dur: 1.8, fa: 380, fb: 900, rasp: 0.5 },
  juggernaut: { f0: 45, dur: 2.2, fa: 320, fb: 780, rasp: 0.55 },
};

/** Bullet strike reverb sends per material. */
const IMPACT_SEND = { flesh: 0.1, dirt: 0.3, wood: 0.25, metal: 0.4, concrete: 0.32, water: 0.2, bone: 0.12, glass: 0.3 };
const IMPACT_ALIAS = { ground: 'dirt', earth: 'dirt', grass: 'dirt', mud: 'dirt', sand: 'dirt', steel: 'metal', iron: 'metal', stone: 'concrete', brick: 'concrete', rock: 'concrete', body: 'flesh', skull: 'bone' };

function glide(param, t, a, b, dur) {
  param.setValueAtTime(Math.max(1, a), t);
  param.exponentialRampToValueAtTime(Math.max(1, b), t + Math.max(0.001, dur));
}

export class TowerAudio {
  /**
   * opts.volume (master 0..1), opts.music / opts.sfx (0..1), opts.context (an existing or
   * Offline AudioContext, mostly for tests), opts.maxVoices.
   */
  constructor(opts = {}) {
    this.eng = new AudioEngine({ volume: num(opts.volume, 0.8), maxVoices: num(opts.maxVoices, 32), context: opts.context });
    this.mix = { music: clamp(num(opts.music, 0.6), 0, 1), sfx: clamp(num(opts.sfx, 0.9), 0, 1) };
    this.built = false;
    this.buffers = {};
    this.beds = {};
    this.fires = [];
    this.echoes = [];
    this.amb = { tod: -1, wind: -1, rain: -1 };
    this.hordeState = { count: 0, near: 999, nextGroan: 0 };
    this.hb = { core: 0, breath: 0, bpm: 0, next: 0, timer: null };
    this.breathOn = false;
    this.slowOn = false;
    this.cashChain = { t: -9, n: 0 };
    this.musicState = 'off';
    this._vp = { x: 0, y: 0, z: 0 };
    this._hbPump = this._hbPump.bind(this);
    this._ambTick = this._ambTick.bind(this);
  }

  get ctx() {
    return this.eng.ctx;
  }

  /** True once the context runs. */
  get ready() {
    return this.eng.ready;
  }

  /** Creates / resumes the audio context; call from a user gesture. Resolves to `ready`. */
  unlock() {
    let p;
    try {
      p = this.eng.unlock();
      if (this.eng.ctx && !this.built) this._build();
    } catch (e) {
      this.eng._warn(e);
    }
    return p || Promise.resolve(false);
  }

  setVolume(v) {
    this.eng.setVolume(v);
  }

  /** Music and effects volumes 0..1 ({ music, sfx }; either may be omitted). */
  setMix(m = {}) {
    if (m.music !== undefined) this.mix.music = clamp(num(m.music, this.mix.music), 0, 1);
    if (m.sfx !== undefined) this.mix.sfx = clamp(num(m.sfx, this.mix.sfx), 0, 1);
    if (m.master !== undefined) this.eng.setVolume(m.master);
    if (!this.built) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.mix.music * 0.8, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.mix.sfx, now, 0.05);
    this.uiBus.gain.setTargetAtTime(this.mix.sfx, now, 0.05);
  }

  setListener(pos, forward) {
    this.eng.setListener(pos, forward);
    if (!this.built) return;
    try {
      for (const f of this.fires) this._firePlace(f);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  // -------------------------------------------------------------------------------------------
  // The rifle

  /** The shot. id: catalog rifle id; opts.suppressed forces the suppressed treatment. */
  rifle(id = 'm91', opts = {}) {
    if (!this._ok() || !this.eng._allow('ll-rifle', 0.05, 2)) return;
    try {
      const base = RIFLE_SOUND[id] || RIFLE_SOUND.m91;
      const P = opts && opts.suppressed && !base.suppressed ? { ...base, suppressed: true, blast: base.blast * 0.5, body: base.body * 0.4, echo: base.echo * 0.45, send: base.send * 0.4 } : base;
      this._shot(id, P);
      this._roll(P);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _shot(id, P) {
    const E = this.eng;
    const v = E._voice(100, null, { send: P.send * vary(1, 0.08), bus: E.gunBus, propagate: false });
    if (!v) return;
    try {
      const t = v.t;
      const k = vary(1, 0.06);
      const sat = v.shaper(E._curve(P.drive));
      const post = v.gain(P.level * vary(1, 0.08));
      sat.connect(post);
      post.connect(v.out);
      const crackIn = v.gain(0.55);
      crackIn.connect(sat);
      // the muzzle side goes through the can when suppressed
      let muz = v.gain(0.55);
      if (P.suppressed) {
        const lp = v.filter('lowpass', 1100, -3);
        muz.connect(lp);
        lp.connect(sat);
      } else muz.connect(sat);
      v.bankHit(muz, null, { t, peak: P.blast, rate: vary(1, 0.06), buf: E._blast('ll-' + id, P.blastMs) });
      if (P.nwave) v.bankHit(crackIn, null, { t, peak: 0.95, rate: vary(1, 0.04), buf: E._nwave(P.nwave) });
      v.noiseHit(crackIn, { t, peak: P.crack, att: 0.0002, tau: P.crackTau * k, filters: [['highpass', vary(P.crackHP, 0.08), -3]] });
      v.noiseHit(muz, { t, peak: P.body, att: 0.0004, tau: P.bodyTau * k, filters: [['bandpass', vary(P.bodyF / k, 0.08), P.bodyQ]] });
      v.noiseHit(muz, { buf: 'pink', t, peak: P.punch, att: 0.0008, tau: P.punchTau * k, filters: [['bandpass', vary(P.punchF / k, 0.08), 0.8]] });
      v.noiseHit(muz, { buf: 'brown', t, peak: P.boom, att: 0.0015, tau: P.boomTau * k, filters: [['lowpass', vary(P.boomF, 0.08), 0]] });
      v.toneHit(muz, { t, f0: P.thumpF0 / k, f1: P.thumpF1 / k, glideT: P.thumpTau * 1.6, peak: P.thump, att: 0.0008, tau: P.thumpTau * k });
      const o = v.out;
      if (P.mech === 'semi' || P.mech === 'heavy') {
        // the action cycling: carrier slamming back and home, a little ring of steel
        const h = P.heavy || 1, t1 = t + rand(0.03, 0.045) / h;
        this._click(v, t1, 2400 * h, 2.5, 0.12, 0.006, o);
        this._click(v, t1 + 0.018, 3800 * h, 3, 0.1, 0.004, o);
        v.bankHit(o, 'metal', { t: t1 + 0.02, rate: 2.2 * h, peak: 0.04, tau: 0.035 });
      }
      if (P.brake) {
        // muzzle brake: the gas hiss thrown sideways
        v.noiseHit(o, { t: t + 0.002, peak: 0.28, att: 0.001, tau: 0.028, filters: [['highpass', 2800, -3]] });
      }
      if (P.debris) {
        // dust and grit shaken off the cabin roof, a loose fitting rattling
        v.bankHit(o, 'debris', { t: t + rand(0.08, 0.14), rate: rand(0.75, 0.9), peak: 0.22, filters: [['highpass', 900, -3]] });
        v.bankHit(o, 'metal', { t: t + rand(0.05, 0.1), rate: rand(1.4, 1.8), peak: 0.05, tau: 0.12 });
        v.noiseHit(o, { buf: 'crackle', t: t + 0.06, peak: 0.12, att: 0.02, tau: 0.22, filters: [['highpass', 2200, -3]] });
      }
    } finally {
      v.commit();
    }
  }

  /** The report rolling round the valley: its own low-priority voice, at most three at once. */
  _roll(P) {
    const E = this.eng;
    for (let i = this.echoes.length - 1; i >= 0; i--) if (this.echoes[i].disposed) this.echoes.splice(i, 1);
    if (this.echoes.length >= 3) this.echoes.shift().kill(0.3);
    const v = E._voice(32, null, { send: 0.2 * P.echo, propagate: false, level: P.echo });
    if (!v) return;
    this.echoes.push(v);
    try {
      const t = v.t;
      const side = Math.random() < 0.5 ? -1 : 1;
      VALLEY_ROLL.forEach(([dt, amp, fc, smear], i) => {
        const te = t + dt * vary(1, 0.06);
        const pan = this._pan(v, side * (i % 2 ? -1 : 1) * (0.35 + 0.4 * Math.random()));
        v.noiseHit(pan, {
          buf: i < 2 ? 'pink' : 'brown', t: te, peak: amp, att: Math.min(0.04, smear * 0.25), tau: smear,
          filters: [['bandpass', vary(fc * 0.7, 0.1), 0.6], ['lowpass', fc, -3]],
        });
        if (i < 2) v.toneHit(pan, { t: te, f0: 85, f1: 42, glideT: 0.12, peak: amp * 0.55, att: 0.006, tau: 0.07 + smear * 0.5 });
      });
    } finally {
      v.commit();
    }
  }

  /** Bolt throw (bolt rifles) or charging handle (semi-autos). */
  bolt(id = 'm91') {
    if (!this._ok() || !this.eng._allow('ll-bolt', 0.2, 1)) return;
    const P = RIFLE_SOUND[id] || RIFLE_SOUND.m91;
    const v = this._ui(60, 0.85);
    if (!v) return;
    try {
      const t = v.t, h = P.heavy || 1, o = v.out;
      if (P.kind === 'bolt') {
        this._click(v, t, 2300 * h, 2.5, 0.35, 0.006, o); // handle up
        this._slide(v, t + 0.07, 0.11, 1500 * h, 3200 * h, 0.2, o); // drawn back
        this._click(v, t + 0.18, 3400 * h, 4, 0.42, 0.004, o); // extractor at the rear
        v.bankHit(o, 'metal', { t: t + 0.2, rate: 2.6 * h, peak: 0.05, tau: 0.04 }); // case flicked out
        this._slide(v, t + 0.3, 0.09, 3000 * h, 1700 * h, 0.16, o); // pushed home
        this._click(v, t + 0.41, 1700 * h, 2, 0.6, 0.01, o); // locked down
        v.toneHit(o, { t: t + 0.41, f0: 320 * h, f1: 220 * h, peak: 0.12, att: 0.001, tau: 0.02 });
      } else {
        this._slide(v, t, 0.12, 1400 * h, 2800 * h, 0.18, o);
        this._click(v, t + 0.13, 3000 * h, 3, 0.35, 0.005, o);
        this._click(v, t + 0.21, 1500 * h, 1.8, 0.75, 0.012, o); // slammed home
        v.toneHit(o, { t: t + 0.21, f0: 260 * h, f1: 160 * h, peak: 0.16, att: 0.001, tau: 0.03 });
      }
    } finally {
      v.commit();
    }
  }

  magOut(id = 'm91') {
    if (!this._ok()) return;
    const P = RIFLE_SOUND[id] || RIFLE_SOUND.m91;
    const v = this._ui(58, 0.8);
    if (!v) return;
    try {
      const t = v.t, h = P.heavy || 1, o = v.out;
      if (id === 'm91') {
        this._click(v, t, 2200, 2.5, 0.3, 0.006, o);
        this._slide(v, t + 0.06, 0.1, 1600, 3000, 0.15, o);
      } else {
        this._click(v, t, 3200 * h, 4, 0.35, 0.004, o); // release
        this._slide(v, t + 0.03, 0.13, 2300 * h, 1300 * h, 0.2, o); // drawn out
        v.bankHit(o, 'metal', { t: t + 0.05, rate: 1.9 * h, peak: 0.03, tau: 0.05 });
      }
    } finally {
      v.commit();
    }
  }

  magIn(id = 'm91') {
    if (!this._ok()) return;
    const P = RIFLE_SOUND[id] || RIFLE_SOUND.m91;
    const v = this._ui(58, 0.8);
    if (!v) return;
    try {
      const t = v.t, h = P.heavy || 1, o = v.out;
      if (id === 'm91') {
        // stripper clip: seated, five rounds thumbed down, the clip flicked away
        this._slide(v, t, 0.08, 1800, 2600, 0.14, o);
        this._click(v, t + 0.08, 2400, 3, 0.3, 0.005, o);
        for (let i = 0; i < 5; i++) this._click(v, t + 0.17 + i * 0.07, 2900 - i * 120, 3.5, 0.22, 0.005, o);
        v.bankHit(o, 'metal', { t: t + 0.55, rate: 2.1, peak: 0.07, tau: 0.06 });
      } else {
        this._slide(v, t, 0.1, 1400 * h, 2400 * h, 0.18, o);
        this._click(v, t + 0.11, 1600 * h, 2, 0.7, 0.01, o); // seated
        v.toneHit(o, { t: t + 0.11, f0: 240 * h, f1: 150 * h, peak: 0.14, att: 0.001, tau: 0.025 });
        this._click(v, t + 0.13, 3600 * h, 4, 0.25, 0.004, o);
      }
    } finally {
      v.commit();
    }
  }

  dryFire() {
    if (!this._ok() || !this.eng._allow('ll-dry', 0.12, 1)) return;
    const v = this._ui(55, 0.8);
    if (!v) return;
    try {
      this._click(v, v.t, 4300, 5, 0.5, 0.004, v.out);
      this._click(v, v.t + 0.014, 2600, 3, 0.16, 0.008, v.out);
    } finally {
      v.commit();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Out in the valley

  /**
   * A bullet striking `material` ('dirt' | 'wood' | 'metal' | 'concrete' | 'flesh' | 'bone' |
   * 'water' | 'glass') at pos, `dist` metres away: heard after the sound has crossed the valley.
   */
  bulletImpact(material = 'dirt', pos, dist) {
    if (!this._ok() || !this.eng._allow('ll-imp', 0.02, 4)) return;
    try {
      const m0 = String(material || 'dirt').toLowerCase();
      const mat = IMPACT_SEND[m0] !== undefined ? m0 : IMPACT_ALIAS[m0] || 'dirt';
      const d = Number.isFinite(dist) ? dist : this._dist(pos);
      const v = this._far(78, pos, d, { send: IMPACT_SEND[mat], level: 1.1 });
      if (!v) return;
      try {
        const t = v.t, o = this._air(v, d);
        if (mat === 'flesh' || mat === 'bone') {
          v.toneHit(o, { t, f0: vary(115, 0.08), f1: 55, glideT: 0.06, peak: 0.55, att: 0.002, tau: 0.045 });
          v.noiseHit(o, { buf: 'pink', t, peak: 0.6, att: 0.001, tau: 0.032, filters: [['bandpass', vary(650, 0.12), 0.9]] });
          v.noiseHit(o, { t, peak: 0.28, att: 0.0003, tau: 0.006, filters: [['bandpass', vary(2200, 0.15), 1.2]] });
          if (mat === 'bone') v.bankHit(o, 'crunch', { t: t + 0.001, rate: rand(0.9, 1.15), peak: 0.5, filters: [['lowpass', 5000, -3]] });
        } else if (mat === 'dirt') {
          v.noiseHit(o, { buf: 'brown', t, peak: 0.7, att: 0.002, tau: 0.06, filters: [['lowpass', 420, 0]] });
          v.noiseHit(o, { buf: 'pink', t, peak: 0.42, att: 0.0008, tau: 0.018, filters: [['bandpass', vary(1100, 0.15), 0.8]] });
          v.noiseHit(o, { buf: 'crackle', t: t + 0.004, peak: 0.2, att: 0.004, tau: 0.06, filters: [['highpass', 2400, -3]] });
          v.toneHit(o, { t, f0: 82, f1: 45, glideT: 0.05, peak: 0.25, att: 0.002, tau: 0.04 });
        } else if (mat === 'wood') {
          v.bankHit(o, 'wood', { t, rate: rand(0.8, 1.2), peak: 0.6, tau: 0.06 });
          v.noiseHit(o, { t, peak: 0.5, att: 0.0005, tau: 0.02, filters: [['bandpass', vary(900, 0.15), 2]] });
          v.noiseHit(o, { t, peak: 0.3, att: 0.0002, tau: 0.002, filters: [['highpass', 3200, -3]] });
        } else if (mat === 'metal') {
          v.bankHit(o, 'metal', { t, rate: rand(1.1, 1.8), peak: 0.55, tau: rand(0.15, 0.4) });
          v.noiseHit(o, { t, peak: 0.42, att: 0.0003, tau: 0.008, filters: [['bandpass', vary(2600, 0.15), 1.4]] });
          if (Math.random() < 0.35) this.eng._ricochet(v, t + 0.01, 1);
        } else if (mat === 'concrete') {
          v.noiseHit(o, { t, peak: 0.6, att: 0.0005, tau: 0.03, filters: [['bandpass', vary(600, 0.12), 0.9]] });
          v.noiseHit(o, { t, peak: 0.35, att: 0.0002, tau: 0.002, filters: [['highpass', 2800, -3]] });
          v.bankHit(o, 'debris', { t: t + 0.003, rate: rand(0.85, 1.15), peak: 0.38, filters: [['highpass', 900, -3]] });
        } else if (mat === 'water') {
          v.bankHit(o, 'droplets', { t, rate: rand(0.8, 1), peak: 0.55 });
          v.noiseHit(o, { buf: 'pink', t, peak: 0.45, att: 0.002, tau: 0.05, filters: [['bandpass', 1300, 0.9]] });
        } else {
          v.bankHit(o, 'glass', { t, rate: rand(0.9, 1.2), peak: 0.4, tau: 0.08 });
          v.bankHit(o, 'shards', { t: t + 0.004, rate: rand(0.9, 1.1), peak: 0.4, filters: [['highpass', 1500, -3]] });
        }
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** The kill confirmation: a sharp, wet, bony THWACK, played at once (not delayed). */
  headshotCrack(pos) {
    if (!this._ok() || !this.eng._allow('ll-hs', 0.06, 2)) return;
    try {
      const v = this.eng._voice(92, this._place(pos, 6), { send: 0.12, level: 1, propagate: false });
      if (!v) return;
      try {
        const t = v.t, o = v.out;
        v.noiseHit(o, { t, peak: 0.55, att: 0.0002, tau: 0.0016, filters: [['highpass', 4200, -3]] });
        v.noiseHit(o, { t, peak: 0.75, att: 0.0003, tau: 0.007, filters: [['bandpass', vary(2100, 0.1), 1.1]] });
        v.bankHit(o, 'crunch', { t: t + 0.001, rate: rand(1, 1.2), peak: 0.55, filters: [['lowpass', 6000, -3]] });
        v.toneHit(o, { t, f0: 170, f1: 58, glideT: 0.07, peak: 0.62, att: 0.002, tau: 0.05 });
        v.noiseHit(o, { buf: 'pink', t, peak: 0.55, att: 0.001, tau: 0.04, filters: [['bandpass', 430, 0.9]] });
        v.bankHit(o, 'droplets', { t: t + 0.02, rate: rand(1.1, 1.3), peak: 0.16, filters: [['lowpass', 3000, -3]] });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A dull, distant thud (something heavy coming down far off). */
  distantThump(pos) {
    if (!this._ok() || !this.eng._allow('ll-thump', 0.08, 2)) return;
    try {
      const d = this._dist(pos);
      const v = this._far(40, pos, d, { send: 0.35 });
      if (!v) return;
      try {
        const t = v.t, o = this._air(v, d);
        v.noiseHit(o, { buf: 'brown', t, peak: 0.6, att: 0.006, tau: 0.09, filters: [['lowpass', 220, 0]] });
        v.toneHit(o, { t, f0: 64, f1: 34, glideT: 0.12, peak: 0.4, att: 0.004, tau: 0.08 });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A zombie's moan; kind sets the voice (see VOICE). */
  zombieGroan(kind = 'walker', pos) {
    if (!this._ok() || !this.eng._allow('ll-groan', 0.22, 4)) return;
    try {
      this._groan(VOICE[kind] || VOICE.walker, pos, 0.75);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _groan(V, pos, intensity, dOverride) {
    const E = this.eng;
    const d = dOverride ?? this._dist(pos);
    const v = this._far(40, pos, d, { send: 0.3, level: 0.95 });
    if (!v) return;
    try {
      const t = v.t, out = this._air(v, d);
      const dur = V.dur * rand(0.8, 1.25);
      const f0 = V.f0 * rand(0.88, 1.12);
      const N = 40, pitch = new Float32Array(N);
      let jit = 0;
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1);
        jit = jit * 0.85 + (Math.random() * 2 - 1) * 0.03;
        pitch[i] = f0 * (1.08 - 0.3 * x + 0.06 * Math.sin(x * 19) + jit);
      }
      const src = v.osc(E._glottalWave(), f0, t, t + dur + 0.02);
      src.frequency.setValueCurveAtTime(pitch, t, dur);
      const shape = (x) => (x < 0.3 ? Math.sin((0.5 * Math.PI * x) / 0.3) ** 2 : Math.cos((0.5 * Math.PI * (x - 0.3)) / 0.7) ** 1.5);
      const env = new Float32Array(32);
      for (let i = 0; i < 31; i++) {
        const x = i / 31;
        const gur = V.gurgle ? 0.55 + 0.45 * Math.sin(x * dur * V.gurgle * 6.283) ** 2 : 1;
        env[i] = 0.5 * intensity * shape(x) * gur;
      }
      const g = v.gain(0);
      g.gain.setValueCurveAtTime(env, t, dur);
      const fa = v.filter('bandpass', V.fa * rand(0.9, 1.1), 1.6);
      const fb = v.filter('bandpass', V.fb * rand(0.9, 1.1), 2.2);
      const mix = v.gain(1);
      src.connect(fa);
      src.connect(fb);
      fa.connect(mix);
      fb.connect(mix);
      mix.connect(g);
      let dest = out;
      if (V.muffled) {
        const lp = v.filter('lowpass', 900, 2);
        const ring = v.filter('peaking', 1800, 8, 9);
        lp.connect(ring);
        ring.connect(out);
        dest = lp;
      }
      g.connect(dest);
      const n = v.noise('pink', t, dur + 0.02);
      const bp = v.filter('bandpass', V.fa * 2, 0.9);
      const ng = v.gain(0);
      const renv = new Float32Array(32);
      const comp = E._bandComp('pink', [['bandpass', V.fa * 2, 0.9]]);
      for (let i = 0; i < 31; i++) {
        const x = i / 31;
        renv[i] = V.rasp * 0.5 * intensity * comp * shape(x) * (0.6 + 0.4 * Math.sin(x * 40) ** 2);
      }
      ng.gain.setValueCurveAtTime(renv, t, dur);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(dest);
    } finally {
      v.commit();
    }
  }

  /** The screamer's shriek: rising, wavering, harsh, ringing round the valley. */
  zombieScream(pos) {
    if (!this._ok() || !this.eng._allow('ll-scream', 1, 1)) return;
    try {
      const d = this._dist(pos);
      const v = this._far(88, pos, d, { send: 0.75, level: 1.15 });
      if (!v) return;
      try {
        const t = v.t, out = this._air(v, d * 0.6), dur = rand(1.5, 1.9);
        const sat = v.shaper(this.eng._curve(3));
        const g = v.gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.12);
        g.gain.setValueAtTime(0.2, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, t + dur);
        for (const det of [-14, 9]) {
          const o = v.osc('sawtooth', 600, t, t + dur + 0.05);
          o.detune.value = det;
          o.frequency.setValueAtTime(520, t);
          o.frequency.exponentialRampToValueAtTime(1120, t + 0.35);
          o.frequency.setValueAtTime(1120, t + 0.35);
          o.frequency.linearRampToValueAtTime(980, t + dur * 0.7);
          o.frequency.exponentialRampToValueAtTime(640, t + dur);
          const vib = v.osc('sine', 7.5, t, t + dur + 0.05);
          const vg = v.gain(38);
          vib.connect(vg);
          vg.connect(o.frequency);
          o.connect(sat);
        }
        const f1 = v.filter('bandpass', 1300, 3), f2 = v.filter('bandpass', 2700, 4);
        sat.connect(f1);
        sat.connect(f2);
        f1.connect(g);
        f2.connect(g);
        g.connect(out);
        v.noiseHit(out, { t, peak: 0.25, att: 0.08, tau: dur * 0.45, filters: [['bandpass', 3200, 1.5]] });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A boss announcing itself: 'brute' (a deep, grinding roar) or 'juggernaut' (deeper, armour, stomps). */
  bossRoar(kind = 'brute', pos) {
    if (!this._ok() || !this.eng._allow('ll-roar', 1.2, 1)) return;
    try {
      const jug = kind === 'juggernaut';
      const d = this._dist(pos);
      const v = this._far(94, pos, d * 0.6, { send: 0.8, level: 1.3 });
      if (!v) return;
      try {
        const E = this.eng, t = v.t, out = this._air(v, d * 0.5);
        const dur = jug ? 3 : 2.2, f0 = jug ? 38 : 48;
        const src = v.osc(E._glottalWave(), f0, t, t + dur + 0.05);
        src.frequency.setValueAtTime(f0 * 0.8, t);
        src.frequency.linearRampToValueAtTime(f0 * 1.3, t + dur * 0.35);
        src.frequency.linearRampToValueAtTime(f0 * 0.95, t + dur);
        // growl: amplitude modulation at 20-30 Hz
        const am = v.gain(0.55);
        const lfo = v.osc('sine', jug ? 21 : 29, t, t + dur + 0.05);
        const lg = v.gain(0.45);
        lfo.connect(lg);
        lg.connect(am.gain);
        const sat = v.shaper(E._curve(3.4));
        const env = v.gain(0);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.55, t + 0.25);
        env.gain.setValueAtTime(0.55, t + dur * 0.6);
        env.gain.linearRampToValueAtTime(0, t + dur);
        src.connect(am);
        am.connect(sat);
        for (const [f, q, a] of [[jug ? 320 : 380, 2, 1], [jug ? 780 : 880, 3, 0.6], [2300, 5, 0.25]]) {
          const bp = v.filter('bandpass', f, q);
          const bg = v.gain(a);
          sat.connect(bp);
          bp.connect(bg);
          bg.connect(env);
        }
        env.connect(out);
        const rasp = v.noiseHit(out, { buf: 'pink', t, peak: 0.35, att: 0.2, tau: dur * 0.5, filters: [['bandpass', 650, 1.2]] });
        lg.connect(rasp.gain.gain);
        v.toneHit(out, { t, f0: f0, f1: f0 * 0.8, glideT: dur, peak: 0.35, att: 0.15, tau: dur * 0.4 });
        if (jug) {
          v.bankHit(out, 'metal', { t: t + 0.4, rate: 0.5, peak: 0.12, tau: 0.5 });
          for (const s of [dur * 0.8, dur + 0.45]) {
            v.toneHit(out, { t: t + s, f0: 70, f1: 30, glideT: 0.2, peak: 0.55, att: 0.003, tau: 0.14 });
            v.noiseHit(out, { buf: 'brown', t: t + s, peak: 0.5, att: 0.003, tau: 0.12, filters: [['lowpass', 260, 0]] });
          }
        }
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** The gate being battered (intensity 0..1): a heavy thud, timbers, chain, sometimes a creak. */
  gateHit(intensity = 0.6) {
    if (!this._ok() || !this.eng._allow('ll-gate', 0.12, 2)) return;
    try {
      const I = clamp(num(intensity, 0.6), 0.05, 1);
      const v = this.eng._voice(58, null, { send: 0.3, level: 0.55 + 0.6 * I });
      if (!v) return;
      try {
        const t = v.t, o = v.filter('lowpass', 6000, -3);
        o.connect(v.out);
        v.toneHit(o, { t, f0: vary(98, 0.08), f1: 52, glideT: 0.08, peak: 0.5, att: 0.002, tau: 0.07 });
        v.noiseHit(o, { buf: 'pink', t, peak: 0.6, att: 0.002, tau: 0.08, filters: [['bandpass', vary(220, 0.1), 0.8]] });
        v.bankHit(o, 'wood', { t, rate: rand(0.55, 0.8), peak: 0.45, tau: 0.08 });
        if (Math.random() < 0.4) v.bankHit(o, 'metal', { t: t + rand(0.02, 0.06), rate: rand(1.6, 2.2), peak: 0.06, tau: 0.15 });
        if (Math.random() < 0.25 + 0.3 * I) this._creak(v, t + rand(0.08, 0.2), o);
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _creak(v, t, dest) {
    const dur = rand(0.35, 0.7);
    const o = v.osc('sawtooth', rand(70, 110), t, t + dur + 0.02);
    o.frequency.setValueAtTime(o.frequency.value, t);
    o.frequency.linearRampToValueAtTime(o.frequency.value * rand(0.7, 1.3), t + dur);
    const bp = v.filter('bandpass', 700, 7);
    glide(bp.frequency, t, rand(500, 700), rand(800, 1100), dur);
    const g = v.gain(0);
    const N = 24, c = new Float32Array(N);
    for (let i = 0; i < N - 1; i++) c[i] = 0.18 * Math.sin((Math.PI * i) / (N - 1)) * (0.4 + 0.6 * Math.random());
    g.gain.setValueCurveAtTime(c, t, dur);
    o.connect(bp);
    bp.connect(g);
    g.connect(dest);
  }

  /** The gate gives way: splintering timbers, a crash, iron clanging, debris settling. */
  gateBreak() {
    if (!this._ok() || !this.eng._allow('ll-gbreak', 1, 1)) return;
    try {
      const v = this.eng._voice(95, null, { send: 0.6, level: 1.2 });
      if (!v) return;
      try {
        const t = v.t, o = v.out;
        v.noiseHit(o, { buf: 'crackle', t, peak: 0.8, att: 0.002, tau: 0.16, filters: [['highpass', 1500, -3]] });
        v.noiseHit(o, { t, peak: 0.5, att: 0.001, tau: 0.03, filters: [['bandpass', 2200, 1]] });
        v.toneHit(o, { t: t + 0.04, f0: 75, f1: 28, glideT: 0.25, peak: 0.8, att: 0.004, tau: 0.16 });
        v.noiseHit(o, { buf: 'brown', t: t + 0.04, peak: 0.9, att: 0.004, tau: 0.2, filters: [['lowpass', 300, 0]] });
        for (let i = 0; i < 4; i++) v.bankHit(o, 'wood', { t: t + 0.05 + i * rand(0.07, 0.16), rate: rand(0.5, 0.9), peak: 0.5 - i * 0.08, tau: 0.08 });
        for (let i = 0; i < 3; i++) v.bankHit(o, 'metal', { t: t + 0.12 + i * rand(0.1, 0.25), rate: rand(0.4, 0.7), peak: 0.22 - i * 0.05, tau: 0.6 });
        v.bankHit(o, 'debris', { t: t + 0.3, rate: 0.7, peak: 0.4 });
        this._creak(v, t + 0.6, o);
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A blast at pos (power ~0.5..2): crack, boom, debris raining down, the roll round the hills. */
  explosion(pos, power = 1) {
    if (!this._ok() || !this.eng._allow('ll-boom', 0.08, 3)) return;
    try {
      const P = clamp(num(power, 1), 0.3, 2.5);
      const d = this._dist(pos);
      const v = this._far(98, pos, d, { send: 0.85, level: 1.25 });
      if (!v) return;
      try {
        const E = this.eng, t = v.t, out = this._air(v, d * 0.7);
        const sat = v.shaper(E._curve(2.6));
        const pre = v.gain(0.6);
        pre.connect(sat);
        const post = v.gain(0.9);
        sat.connect(post);
        post.connect(out);
        v.bankHit(pre, null, { t, peak: 1.2, rate: vary(1, 0.06), buf: E._blast('ll-ex', 7 + 4 * P) });
        if (d < 90) v.noiseHit(pre, { t, peak: 0.8, att: 0.0003, tau: 0.004, filters: [['highpass', 2000, -3]] });
        v.noiseHit(pre, { buf: 'brown', t, peak: 1.1, att: 0.004, tau: 0.32 * P, filters: [['lowpass', 170, 0]] });
        v.noiseHit(pre, { buf: 'pink', t, peak: 0.8, att: 0.002, tau: 0.09, filters: [['bandpass', 500, 0.7]] });
        v.toneHit(pre, { t, f0: 58, f1: 22, glideT: 0.55, peak: 0.85, att: 0.003, tau: 0.3 * P });
        // dirt and debris coming back down
        v.bankHit(out, 'debris', { t: t + rand(0.35, 0.55), rate: rand(0.65, 0.8), peak: 0.35 / (1 + d / 120), filters: [['highpass', 700, -3]] });
        v.noiseHit(out, { buf: 'crackle', t: t + 0.25, peak: 0.22 / (1 + d / 120), att: 0.12, tau: 0.5, filters: [['highpass', 1400, -3]] });
        // the rumble rolling round the valley
        const side = Math.random() < 0.5 ? -1 : 1;
        [[0.55, 0.32, 300], [1.15, 0.24, 240], [1.85, 0.17, 200], [2.6, 0.1, 170]].forEach(([dt, a, fc], i) => {
          const pan = this._pan(v, side * (i % 2 ? -0.5 : 0.5));
          v.noiseHit(pan, { buf: 'brown', t: t + dt * vary(1, 0.08), peak: a * P, att: 0.08, tau: 0.35 + i * 0.15, filters: [['lowpass', fc, 0]] });
        });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A fire burning at pos (on) or put out (off): a looping crackle bed, up to four at once. */
  fire(pos, on = true) {
    if (!this._ok() || !pos) return;
    try {
      const near = this.fires.find((f) => Math.hypot(f.x - pos.x, f.z - pos.z) < 4);
      if (!on) {
        if (near) this._fireStop(near);
        return;
      }
      if (near) return;
      if (this.fires.length >= 4) this._fireStop(this.fires[0]);
      const buf = this.buffers.fire;
      if (!buf) return; // still rendering; fires are long, the next call will start it
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(lp);
      lp.connect(g);
      if (pan) {
        g.connect(pan);
        pan.connect(this.ambBus);
      } else g.connect(this.ambBus);
      const send = ctx.createGain();
      send.gain.value = 0.15;
      g.connect(send);
      send.connect(this.eng.verbIn);
      src.start(0, Math.random() * buf.duration);
      const f = { x: num(pos.x, 0), y: num(pos.y, 0), z: num(pos.z, 0), src, lp, g, pan, send };
      this.fires.push(f);
      this._firePlace(f, 1.2);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _firePlace(f, tau = 0.08) {
    const d = this._dist(f);
    const now = this.ctx.currentTime;
    f.g.gain.setTargetAtTime(0.9 * distanceGain(d), now, tau);
    f.lp.frequency.setTargetAtTime(airCutoff(d), now, 0.1);
    if (f.pan) f.pan.pan.setTargetAtTime(this._panOf(f), now, 0.05);
  }

  _fireStop(f) {
    const now = this.ctx.currentTime;
    f.g.gain.setTargetAtTime(0, now, 0.6);
    try {
      f.src.stop(now + 3);
    } catch (e) {
      // already stopped
    }
    f.src.onended = () => {
      for (const n of [f.src, f.lp, f.g, f.pan, f.send]) if (n) n.disconnect();
    };
    this.fires.splice(this.fires.indexOf(f), 1);
  }

  /** A body hitting the ground (intensity 0..1). */
  bodyFall(pos, i = 1) {
    this._later(pos, () => this.eng.bodyFall(clamp(num(i, 1), 0, 1), this._place(pos)));
  }

  /** A bone snapping (intensity 0..1). */
  boneCrack(pos, i = 1) {
    this._later(pos, () => this.eng.boneCrack(clamp(num(i, 1), 0, 1), this._place(pos)));
  }

  // -------------------------------------------------------------------------------------------
  // Ambience, the horde, the score

  /**
   * The valley's bed by time of day (0 dusk .. 1 night), wind (m/s) and rain (0..1): wind in the
   * grass, crickets and frogs at dusk, owls and near-silence at night, rain. Cheap to call often.
   */
  ambience(timeOfDay = 0, wind = 2, rain = 0) {
    if (!this._ok()) return;
    try {
      const A = this.amb;
      const t = clamp(num(timeOfDay, 0), 0, 1), w = clamp(num(wind, 2), 0, 20), r = clamp(num(rain, 0), 0, 1);
      A.on = true;
      if (Math.abs(t - A.tod) < 0.01 && Math.abs(w - A.wind) < 0.1 && Math.abs(r - A.rain) < 0.01) return;
      A.tod = t;
      A.wind = w;
      A.rain = r;
      const ss = (a, b, x) => {
        const u = clamp((x - a) / (b - a), 0, 1);
        return u * u * (3 - 2 * u);
      };
      const windAmt = clamp(0.18 + w / 9, 0, 1);
      this._bed('wind', 0.5 * windAmt);
      this._bed('crickets', 0.55 * ss(0, 0.25, t) * (1 - 0.65 * ss(0.6, 1, t)) * (1 - 0.8 * r));
      this._bed('frogs', 0.4 * (1 - ss(0.3, 0.7, t)) * (1 - 0.5 * r));
      this._bed('rain', 0.75 * r);
      if (this.beds.wind && this.beds.wind.lfo) this.beds.wind.amp = windAmt;
      if (!this.ambTimer) {
        this.ambTimer = setInterval(this._ambTick, 900);
        if (this.ambTimer.unref) this.ambTimer.unref();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** Occasional living details: owls at night, the cabin creaking in the wind, nearby groans. */
  _ambTick() {
    if (!this._ok()) return;
    try {
      const A = this.amb;
      if (A.tod > 0.5 && Math.random() < 0.05 * A.tod * (1 - A.rain)) this._owl();
      if (A.wind > 4 && Math.random() < 0.03 * (A.wind / 8)) {
        const v = this.eng._voice(15, this._place({ x: rand(-3, 3), y: rand(19, 23), z: rand(-3, 3) }, 4), { send: 0.25, level: 0.5 });
        if (v) {
          this._creak(v, v.t, v.out);
          v.commit();
        }
      }
      const H = this.hordeState;
      if (H.count > 6 && H.near < 70 && Math.random() < 0.35 * clamp(H.count / 30, 0.2, 1)) {
        const d = clamp(H.near * rand(1, 1.6), 5, 200);
        const kinds = ['walker', 'walker', 'walker', 'runner', 'crawler'];
        const a = Math.random() * Math.PI * 2;
        const L = this.eng._listener;
        const p = { x: L.x + Math.cos(a) * d, y: 0.8, z: L.z + Math.sin(a) * d };
        if (this.eng._allow('ll-groan', 0.22, 4)) this._groan(VOICE[pick(kinds)], p, 0.55, d);
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _owl() {
    const L = this.eng._listener;
    const a = Math.random() * Math.PI * 2, d = rand(80, 220);
    const pos = { x: L.x + Math.cos(a) * d, y: 8, z: L.z + Math.sin(a) * d };
    const v = this._far(12, pos, d, { send: 0.6, level: 0.7 });
    if (!v) return;
    try {
      const out = this._air(v, d);
      const f = rand(360, 420);
      // "hoo ... hoo-hoo-hooo"
      const notes = [[0, 0.32, 1], [0.62, 0.14, 0.8], [0.8, 0.14, 0.85], [0.98, 0.5, 0.95]];
      for (const [dt, dur, a2] of notes) {
        const t = v.t + dt;
        const o = v.osc('sine', f, t, t + dur + 0.1);
        o.frequency.setValueAtTime(f * 1.03, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.94, t + dur);
        const g = v.gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16 * a2, t + 0.05);
        g.gain.setTargetAtTime(0, t + dur * 0.7, 0.06);
        o.connect(g);
        g.connect(out);
      }
    } finally {
      v.commit();
    }
  }

  /** The horde's murmur: swells with how many there are and how close the nearest one is (m). */
  horde(count = 0, nearest = 999) {
    if (!this._ok()) return;
    try {
      const H = this.hordeState;
      H.count = Math.max(0, num(count, 0));
      H.near = Math.max(0, num(nearest, 999));
      const prox = clamp(1.15 - H.near / 220, 0.12, 1);
      const amt = clamp(H.count / 45, 0, 1) ** 0.6 * prox;
      this._bed('horde', 0.9 * amt, 1.2);
      const b = this.beds.horde;
      if (b && b.lp) b.lp.frequency.setTargetAtTime(380 + 2600 * prox * prox, this.ctx.currentTime, 0.8);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _bed(name, target, tau = 1.5) {
    let b = this.beds[name];
    if (target <= 0.001) {
      if (b && b.playing) {
        b.gain.gain.setTargetAtTime(0, this.ctx.currentTime, tau);
        b.stopAt = this.ctx.currentTime + tau * 6;
        if (!b.stopTimer) {
          b.stopTimer = setTimeout(() => this._bedStop(name), tau * 6000 + 100);
          if (b.stopTimer.unref) b.stopTimer.unref();
        }
      }
      return;
    }
    if (!b || !b.playing) b = this._bedStart(name);
    if (!b) return;
    if (b.stopTimer) {
      clearTimeout(b.stopTimer);
      b.stopTimer = null;
    }
    b.gain.gain.setTargetAtTime(target, this.ctx.currentTime, tau);
  }

  _bedStart(name) {
    const buf = this.buffers[name === 'wind' ? 'windNoise' : name];
    if (!buf) return null;
    const ctx = this.ctx;
    const nodes = [];
    const mk = (n) => {
      nodes.push(n);
      return n;
    };
    const gain = mk(ctx.createGain());
    gain.gain.value = 0;
    gain.connect(this.ambBus);
    const b = { name, gain, nodes, playing: true, stopTimer: null };
    const loop = (rate = 1) => {
      const s = mk(ctx.createBufferSource());
      s.buffer = buf;
      s.loop = true;
      if (buf._loopEnd) {
        s.loopStart = 0;
        s.loopEnd = buf._loopEnd;
      }
      s.playbackRate.value = rate;
      s.start(0, Math.random() * (buf._loopEnd || buf.duration));
      return s;
    };
    if (name === 'wind') {
      // two layers: the low body of the wind and the hiss of grass, both gusting together
      const s1 = loop(1), s2 = loop(1.7);
      const bp = mk(ctx.createBiquadFilter());
      bp.type = 'bandpass';
      bp.frequency.value = 380;
      bp.Q.value = 0.6;
      const hp = mk(ctx.createBiquadFilter());
      hp.type = 'highpass';
      hp.frequency.value = 2600;
      const gust = mk(ctx.createGain());
      gust.gain.value = 0.7;
      const lfo1 = mk(ctx.createOscillator()), lfo2 = mk(ctx.createOscillator());
      lfo1.frequency.value = 0.071;
      lfo2.frequency.value = 0.13;
      const lg1 = mk(ctx.createGain()), lg2 = mk(ctx.createGain());
      lg1.gain.value = 0.22;
      lg2.gain.value = 0.12;
      lfo1.connect(lg1);
      lfo2.connect(lg2);
      lg1.connect(gust.gain);
      lg2.connect(gust.gain);
      const fm = mk(ctx.createGain());
      fm.gain.value = 160;
      lfo1.connect(fm);
      fm.connect(bp.frequency);
      const grass = mk(ctx.createGain());
      grass.gain.value = 0.28;
      s1.connect(bp);
      bp.connect(gust);
      s2.connect(hp);
      hp.connect(grass);
      grass.connect(gust);
      gust.connect(gain);
      lfo1.start();
      lfo2.start();
      b.lfo = true;
    } else if (name === 'horde') {
      const s1 = loop(1), s2 = loop(0.83);
      const lp = mk(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      const g2 = mk(ctx.createGain());
      g2.gain.value = 0.7;
      s1.connect(lp);
      s2.connect(g2);
      g2.connect(lp);
      lp.connect(gain);
      b.lp = lp;
      const send = mk(ctx.createGain());
      send.gain.value = 0.25;
      gain.connect(send);
      send.connect(this.eng.verbIn);
    } else {
      const s = loop(1);
      s.connect(gain);
    }
    this.beds[name] = b;
    return b;
  }

  _bedStop(name) {
    const b = this.beds[name];
    if (!b) return;
    for (const n of b.nodes) {
      try {
        if (n.stop) n.stop();
      } catch (e) {
        // not started
      }
      try {
        n.disconnect();
      } catch (e) {
        // fine
      }
    }
    delete this.beds[name];
  }

  /** The score: 'calm' | 'fight' | 'boss' | 'off' (layers cross-fade). */
  music(state = 'calm') {
    this.musicState = state;
    if (!this._ok() || !this.score) return;
    try {
      this.score.setState(state);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Stings, money, interface

  /** Air-raid siren winding up, wailing and running down across the valley (~7 s). */
  waveSiren() {
    if (!this._ok() || !this.eng._allow('ll-siren', 4, 1)) return;
    try {
      const v = this.eng._voice(96, this._place({ x: 0, y: 30, z: 0 }, 18), { send: 0.9, level: 0.9, propagate: false });
      if (!v) return;
      try {
        const ctx = this.ctx, t = v.t, up = 2.4, hold = 2, down = 2.6, end = t + up + hold + down;
        if (!this._sirenWave) {
          const n = 24, re = new Float32Array(n), im = new Float32Array(n);
          for (let k = 1; k < n; k++) im[k] = k % 2 ? 1 / k ** 1.15 : 0.12 / k;
          this._sirenWave = ctx.createPeriodicWave(re, im);
        }
        const g = v.gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + up * 0.6);
        g.gain.setValueAtTime(0.16, t + up + hold);
        g.gain.linearRampToValueAtTime(0, end);
        const sat = v.shaper(this.eng._curve(1.6));
        const bp = v.filter('bandpass', 900, 0.8);
        for (const [ratio, det] of [[1, -6], [1.19, 5]]) {
          const o = v.osc(this._sirenWave, 110 * ratio, t, end + 0.05);
          o.detune.value = det;
          const f = o.frequency;
          f.setValueAtTime(110 * ratio, t);
          f.exponentialRampToValueAtTime(470 * ratio, t + up);
          f.setValueAtTime(470 * ratio, t + up);
          f.linearRampToValueAtTime(455 * ratio, t + up + hold);
          f.exponentialRampToValueAtTime(130 * ratio, end);
          const wob = v.osc('sine', 4.2, t, end + 0.05);
          const wg = v.gain(5 * ratio);
          wob.connect(wg);
          wg.connect(f);
          o.connect(sat);
        }
        glide(bp.frequency, t, 300, 1300, up);
        bp.frequency.setValueAtTime(1300, t + up + hold);
        bp.frequency.exponentialRampToValueAtTime(380, end);
        sat.connect(bp);
        bp.connect(g);
        g.connect(v.out);
        // the rotor's air rush
        const n = v.noiseHit(v.out, { buf: 'pink', t, peak: 0.12, att: up, tau: hold + down * 0.4, filters: [['bandpass', 600, 1.4]] });
        glide(n.filters[0].frequency, t, 300, 1200, up);
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** Wave cleared: a warm minor-to-major swell with a bell. */
  waveCleared() {
    if (!this._ok() || !this.eng._allow('ll-clear', 2, 1)) return;
    try {
      const v = this.eng._voice(95, null, { send: 0, level: 0.9, propagate: false, bus: this.musicBus });
      if (!v) return;
      try {
        const t = v.t;
        const D3 = 146.83;
        const chords = [[[1, 1.1892, 1.4983], 0], [[1, 1.2599, 1.4983, 2], 0.9]]; // Dm -> D
        for (const [ratios, dt] of chords) {
          const lp = v.filter('lowpass', 600, 0.8);
          lp.frequency.setValueAtTime(400, t + dt);
          lp.frequency.linearRampToValueAtTime(2200, t + dt + 1);
          lp.frequency.linearRampToValueAtTime(700, t + dt + 2.6);
          const g = v.gain(0);
          g.gain.setValueAtTime(0, t + dt);
          g.gain.linearRampToValueAtTime(dt ? 0.07 : 0.05, t + dt + 0.4);
          g.gain.setTargetAtTime(0, t + dt + (dt ? 1.2 : 0.7), dt ? 0.6 : 0.25);
          for (const r of ratios) {
            v.osc('sawtooth', D3 * r, t + dt, t + dt + 3.2).connect(lp);
            const o2 = v.osc('sawtooth', D3 * r * 1.004, t + dt, t + dt + 3.2);
            o2.connect(lp);
          }
          lp.connect(g);
          g.connect(v.out);
        }
        for (const [f, dt, a] of [[1174.7, 0.9, 0.08], [1760, 0.95, 0.04]]) {
          const o = v.osc('sine', f, t + dt, t + dt + 2.4);
          const g = v.gain(0);
          g.gain.setValueAtTime(0, t + dt);
          g.gain.linearRampToValueAtTime(a, t + dt + 0.005);
          g.gain.setTargetAtTime(0, t + dt + 0.01, 0.5);
          o.connect(g);
          g.connect(v.out);
        }
        v.toneHit(v.out, { t: t + 0.9, f0: 80, f1: 45, glideT: 0.2, peak: 0.25, att: 0.004, tau: 0.25 });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** Ka-ching. Quick successions climb in pitch. */
  cash() {
    if (!this._ok() || !this.eng._allow('ll-cash', 0.07, 3)) return;
    try {
      const now = this.ctx.currentTime;
      const C = this.cashChain;
      C.n = now - C.t < 1.4 ? Math.min(C.n + 1, 6) : 0;
      C.t = now;
      const p = 2 ** (C.n / 12);
      const v = this._ui(70, 0.9);
      if (!v) return;
      try {
        const t = v.t, o = v.out;
        // "ka": the drawer mechanism
        this._click(v, t, 1800, 1.5, 0.45, 0.005, o);
        v.toneHit(o, { t, f0: 190, f1: 120, glideT: 0.03, peak: 0.18, att: 0.001, tau: 0.02 });
        v.noiseHit(o, { t: t + 0.01, peak: 0.12, att: 0.005, tau: 0.03, filters: [['bandpass', 1000, 1]] });
        // "ching": two bell strikes
        for (const [dt, f0, a] of [[0.055, 2350 * p, 1], [0.085, 2490 * p, 0.7]]) {
          for (const [r, tau, amp] of [[1, 0.45, 0.13], [1.5, 0.3, 0.07], [2.0, 0.25, 0.06], [2.76, 0.18, 0.05], [3.9, 0.12, 0.03]]) {
            const oo = v.osc('sine', f0 * r, t + dt, t + dt + tau * 5);
            const g = v.gain(0);
            g.gain.setValueAtTime(0, t + dt);
            g.gain.linearRampToValueAtTime(amp * a, t + dt + 0.002);
            g.gain.setTargetAtTime(0, t + dt + 0.003, tau);
            oo.connect(g);
            g.connect(o);
          }
        }
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /**
   * Interface sounds: 'hover' | 'click' | 'tab' | 'open' | 'close' | 'back' | 'buy' | 'deny' |
   * 'equip' | 'place' | 'tick' | 'confirm' | 'bonus' | 'banner' | 'alarm' | 'cleared'.
   */
  ui(kind = 'click') {
    if (!this._ok() || !this.eng._allow('ll-ui:' + kind, 0.03, 2)) return;
    try {
      if (kind === 'cleared') return; // waveCleared() plays the sting
      const v = this._ui(kind === 'deny' || kind === 'alarm' ? 75 : 50, 0.6);
      if (!v) return;
      try {
        const t = v.t, o = v.out;
        const blip = (f, dt, dur, a, type = 'square', f1) => {
          const os = v.osc(type, f, t + dt, t + dt + dur + 0.02);
          if (f1) glide(os.frequency, t + dt, f, f1, dur);
          const g = v.gain(0);
          g.gain.setValueAtTime(0, t + dt);
          g.gain.linearRampToValueAtTime(a, t + dt + 0.002);
          g.gain.setTargetAtTime(0, t + dt + dur * 0.5, dur * 0.25);
          const lp = v.filter('lowpass', 3500, 0);
          os.connect(lp);
          lp.connect(g);
          g.connect(o);
        };
        switch (kind) {
          case 'hover': blip(2200, 0, 0.012, 0.035); break;
          case 'tick': blip(3000, 0, 0.01, 0.04); break;
          case 'click': this._click(v, t, 1500, 1.4, 0.3, 0.004, o); blip(880, 0, 0.03, 0.05); break;
          case 'tab': blip(1600, 0, 0.02, 0.05); blip(2400, 0.045, 0.02, 0.045); break;
          case 'open':
            blip(200, 0, 0.14, 0.05, 'sine', 1300);
            v.noiseHit(o, { t, peak: 0.08, att: 0.01, tau: 0.08, filters: [['bandpass', 3000, 0.7]] });
            this._click(v, t + 0.12, 1800, 2, 0.25, 0.005, o);
            break;
          case 'close': case 'back': blip(900, 0, 0.06, 0.05, 'square', 420); break;
          case 'buy': blip(659, 0, 0.05, 0.06); blip(988, 0.06, 0.09, 0.06); break;
          case 'deny': blip(110, 0, 0.09, 0.1); blip(104, 0.12, 0.12, 0.1); break;
          case 'equip': this._click(v, t, 2200, 2.5, 0.35, 0.006, o); this._click(v, t + 0.06, 1500, 2, 0.45, 0.01, o); blip(1320, 0.08, 0.04, 0.04); break;
          case 'place': v.toneHit(o, { t, f0: 160, f1: 90, glideT: 0.06, peak: 0.25, att: 0.002, tau: 0.04 }); blip(1100, 0.03, 0.05, 0.04); break;
          case 'confirm': blip(440, 0, 0.07, 0.05); blip(660, 0.08, 0.07, 0.05); blip(880, 0.16, 0.16, 0.055); break;
          case 'bonus': blip(1760, 0, 0.03, 0.03, 'triangle'); blip(2637, 0.035, 0.05, 0.03, 'triangle'); break;
          case 'banner':
            v.noiseHit(o, { t, peak: 0.12, att: 0.003, tau: 0.05, filters: [['bandpass', 1300, 1.2]] });
            this._click(v, t + 0.07, 1200, 1.5, 0.25, 0.006, o);
            break;
          case 'alarm': for (let i = 0; i < 2; i++) { blip(220, i * 0.36, 0.16, 0.07, 'sawtooth'); blip(233, i * 0.36 + 0.18, 0.16, 0.07, 'sawtooth'); } break;
          default: this._click(v, t, 1500, 1.4, 0.3, 0.004, o);
        }
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  // -------------------------------------------------------------------------------------------
  // The body: heartbeat, breath, focus

  /** Heartbeat at `rate` bpm (0 stops); above ~95 bpm the world also starts to close in. */
  heartbeat(rate = 0) {
    try {
      const r = num(rate, 0);
      this.hb.core = r > 0 ? clamp(r, 30, 200) : 0;
      this._hbUpdate();
      this._muffle();
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** Holding the breath (Shift): an inhale, the world muffled, the pulse in the ears; opts.gasp when it ran out. */
  breathHold(on, opts = {}) {
    if (!this._ok()) return;
    try {
      const was = this.breathOn;
      this.breathOn = !!on;
      this.hb.breath = on ? 66 : 0;
      this._hbUpdate();
      this._muffle();
      if (!!on === was) return;
      const v = this._ui(65, 0.8);
      if (!v) return;
      try {
        const t = v.t, o = v.out, gasp = !!(opts && opts.gasp);
        const dur = on ? 0.45 : gasp ? 0.35 : 0.9;
        const f0 = on ? 900 : gasp ? 1700 : 700, f1 = on ? 1500 : gasp ? 1100 : 380;
        const n = v.noise('pink', t, dur + 0.05);
        const bp1 = v.filter('bandpass', f0, 1.4);
        glide(bp1.frequency, t, f0, f1, dur);
        const bp2 = v.filter('bandpass', f0 * 2.1, 2.2);
        glide(bp2.frequency, t, f0 * 2.1, f1 * 2.1, dur);
        const g = v.gain(0);
        const peak = (gasp ? 0.5 : 0.28) * this.eng._bandComp('pink', [['bandpass', f0, 1.4]]) * 0.5;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + (on ? dur * 0.7 : gasp ? 0.04 : dur * 0.2));
        g.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(bp1);
        n.connect(bp2);
        bp1.connect(g);
        bp2.connect(g);
        g.connect(o);
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** Focus (bullet time) on: a deep "whoomp", the world dulls and the reverb opens; off: snaps back. */
  slowMo(on) {
    if (!this._ok()) return;
    try {
      if (!!on === this.slowOn) return;
      this.slowOn = !!on;
      this._muffle();
      const now = this.ctx.currentTime;
      this.eng.wet.gain.setTargetAtTime(on ? 0.85 : 0.5, now, 0.2);
      const v = this._ui(85, 1);
      if (!v) return;
      try {
        const t = v.t, o = v.out;
        if (on) {
          // reverse swell, then the drop
          const n = v.noiseHit(o, { buf: 'pink', t, peak: 0.25, att: 0.22, tau: 0.03, filters: [['lowpass', 300, 2]] });
          glide(n.filters[0].frequency, t, 200, 2600, 0.24);
          v.toneHit(o, { t: t + 0.22, f0: 90, f1: 28, glideT: 0.9, peak: 0.75, att: 0.004, tau: 0.45 });
          v.noiseHit(o, { buf: 'brown', t: t + 0.22, peak: 0.5, att: 0.004, tau: 0.3, filters: [['lowpass', 160, 0]] });
          // a tape-stop sigh
          for (const r of [1, 1.5]) {
            const os = v.osc('sawtooth', 220 * r, t + 0.22, t + 1.3);
            glide(os.frequency, t + 0.22, 220 * r, 70 * r, 1);
            const lp = v.filter('lowpass', 900, 1);
            const g = v.gain(0);
            g.gain.setValueAtTime(0.04, t + 0.22);
            g.gain.setTargetAtTime(0, t + 0.5, 0.25);
            os.connect(lp);
            lp.connect(g);
            g.connect(o);
          }
        } else {
          const n = v.noiseHit(o, { buf: 'pink', t, peak: 0.2, att: 0.12, tau: 0.04, filters: [['bandpass', 400, 1]] });
          glide(n.filters[0].frequency, t, 300, 3000, 0.16);
          v.toneHit(o, { t, f0: 40, f1: 160, glideT: 0.18, peak: 0.25, att: 0.08, tau: 0.06 });
        }
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Extras the core may use

  /** A spent case tinkling on the cabin floor (TowerFx's casing hook). */
  casing(pos) {
    if (!this._ok() || !this.eng._allow('ll-case', 0.08, 2)) return;
    try {
      const v = this.eng._voice(12, this._place(pos, 2), { send: 0.15, level: 0.8, propagate: false });
      if (!v) return;
      try {
        v.bankHit(v.out, 'casing', { t: v.t, rate: rand(0.85, 1.15), peak: rand(0.06, 0.09), filters: [['highpass', 1800, -3]] });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** One round from the sentry gun at pos. */
  sentry(pos) {
    if (!this._ok() || !this.eng._allow('ll-sentry', 0.05, 3)) return;
    try {
      this.eng.gunshot('rifle', this._place(pos, 6));
    } catch (e) {
      this.eng._warn(e);
    }
  }

  /** A climber's hands and boots on the tower steel at pos. */
  climb(pos) {
    if (!this._ok() || !this.eng._allow('ll-climb', 0.25, 2)) return;
    try {
      const v = this.eng._voice(48, this._place(pos, 3), { send: 0.2, level: 0.8 });
      if (!v) return;
      try {
        v.bankHit(v.out, 'metal', { t: v.t, rate: rand(0.45, 0.7), peak: 0.22, tau: 0.08 });
        v.toneHit(v.out, { t: v.t, f0: 140, f1: 90, glideT: 0.04, peak: 0.15, att: 0.002, tau: 0.03 });
      } finally {
        v.commit();
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  playerHurt(intensity = 0.5) {
    this.eng.playerHurt(intensity);
  }

  /** Hit-marker tick (kill: heavier, head: brighter). */
  hitMarker(head = false, kill = false) {
    this.eng.hitTick(kill, head);
  }

  /** Raising (on) / lowering the scope: cloth and steel. */
  scope(on = true) {
    if (!this._ok() || !this.eng._allow('ll-scope', 0.1, 1)) return;
    const v = this._ui(30, 0.6);
    if (!v) return;
    try {
      v.bankHit(v.out, 'cloth', { t: v.t, rate: rand(0.9, 1.1), peak: 0.12, filters: [['highpass', 900, -3]] });
      if (on) this._click(v, v.t + 0.1, 3200, 4, 0.08, 0.004, v.out);
    } finally {
      v.commit();
    }
  }

  /** A zoom-turret detent. */
  zoomClick() {
    if (!this._ok() || !this.eng._allow('ll-zoom', 0.04, 2)) return;
    const v = this._ui(25, 0.5);
    if (!v) return;
    try {
      this._click(v, v.t, 3600, 5, 0.12, 0.003, v.out);
    } finally {
      v.commit();
    }
  }

  /** Thermal sight switched on (a rising whine) or off. */
  thermal(on = true) {
    if (!this._ok()) return;
    const v = this._ui(40, 0.6);
    if (!v) return;
    try {
      const t = v.t;
      const o = v.osc('sine', on ? 1800 : 5200, t, t + 0.4);
      glide(o.frequency, t, on ? 1800 : 5200, on ? 6200 : 1500, 0.32);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.05);
      g.gain.linearRampToValueAtTime(0, t + 0.38);
      o.connect(g);
      g.connect(v.out);
      this._click(v, t, 2500, 2, 0.15, 0.004, v.out);
    } finally {
      v.commit();
    }
  }

  dispose() {
    try {
      if (this.score) this.score.dispose();
      if (this.ambTimer) clearInterval(this.ambTimer);
      if (this.hb.timer) clearInterval(this.hb.timer);
      for (const k of Object.keys(this.beds)) this._bedStop(k);
    } catch (e) {
      // closing anyway
    }
    this.eng.dispose();
    this.built = false;
    this.score = null;
    this.ambTimer = null;
    this.hb.timer = null;
  }

  // -------------------------------------------------------------------------------------------
  // Internals

  _ok() {
    return this.built && this.eng._live();
  }

  _build() {
    const E = this.eng, ctx = E.ctx;
    this.built = true;
    // world chain: everything diegetic passes the muffle and the effects volume
    this.world = ctx.createBiquadFilter();
    this.world.type = 'lowpass';
    this.world.frequency.value = 20000;
    this.world.Q.value = 0.5;
    this.duck = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.mix.sfx;
    this.world.connect(this.duck);
    this.duck.connect(this.sfxBus);
    this.sfxBus.connect(E.bus);
    for (const n of [E.dry, E.gunComp, E.wet]) {
      n.disconnect();
      n.connect(this.world);
    }
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.world);
    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = this.mix.sfx;
    this.uiBus.connect(E.bus);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.mix.music * 0.8;
    this.musicBus.connect(E.bus);
    this.score = new GenMusic(ctx, this.musicBus);
    if (this.musicState && this.musicState !== 'off') this.score.setState(this.musicState);
    this._prewarm();
  }

  /** Renders the long buffers in small idle slices (valley first: it replaces the room reverb). */
  _prewarm() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const mono = (sec, rate, fn, fade) => {
      const n = Math.ceil(sec * rate);
      const d = new Float32Array(n);
      fn(d, rate);
      const L = fade ? loopCrossfade(d, rate, fade) : n;
      const b = ctx.createBuffer(1, L, rate);
      b.getChannelData(0).set(d.subarray(0, L));
      return b;
    };
    const stereo = (sec, rate, fn, fade) => {
      const n = Math.ceil(sec * rate);
      const l = new Float32Array(n), r = new Float32Array(n);
      fn(l, r, rate);
      let L = n;
      if (fade) {
        L = loopCrossfade(l, rate, fade);
        loopCrossfade(r, rate, fade);
      }
      const b = ctx.createBuffer(2, L, rate);
      b.getChannelData(0).set(l.subarray(0, L));
      b.getChannelData(1).set(r.subarray(0, L));
      return b;
    };
    const tasks = [
      () => {
        const b = stereo(3.4, sr, (l, r, rate) => renderValleyIR(l, r, rate));
        this.eng.verb.buffer = b;
        this.buffers.valley = b;
      },
      () => { this.buffers.windNoise = mono(6.2, sr / 2, renderWindNoise, 0.2); },
      () => { this.buffers.crickets = stereo(6, sr, renderCrickets); },
      () => { this.buffers.horde = stereo(7.3, sr / 2, renderHorde); },
      () => { this.buffers.frogs = stereo(8, sr / 2, renderFrogs); },
      () => { this.buffers.fire = mono(3.4, sr / 2, renderFire, 0.2); },
      () => { this.buffers.rain = stereo(4.4, sr, renderRain, 0.25); },
      () => {
        // beds requested before their buffers existed start now
        const A = this.amb;
        if (A.on) {
          A.tod = -1;
          this.ambience(A.tod < 0 ? 0 : A.tod, A.wind, A.rain);
        }
      },
    ];
    if (E_offline(ctx) || typeof setTimeout !== 'function') {
      for (const t of tasks) t();
      return;
    }
    const step = () => {
      if (!this.built || !tasks.length) return;
      try {
        tasks.shift()();
      } catch (e) {
        this.eng._warn(e);
      }
      setTimeout(step, 30);
    };
    setTimeout(step, 0);
  }

  /** A UI-bus voice (not muffled, not positioned). */
  _ui(prio, level = 1) {
    return this.eng._voice(prio, null, { send: 0, level, propagate: false, bus: this.uiBus });
  }

  /** A voice for something `d` metres out at pos: game-curve level, real delay, air filter. */
  _far(prio, pos, d, opts = {}) {
    const when = this.ctx.currentTime + 0.004 + soundDelay(d);
    return this.eng._voice(prio, this._place(pos), { ...opts, when, propagate: false });
  }

  /** The node a far voice's layers connect to (an air low-pass when it is far enough to matter). */
  _air(v, d) {
    const fc = airCutoff(d);
    if (fc >= 19000) return v.out;
    const lp = v.filter('lowpass', fc, -3);
    lp.connect(v.out);
    return lp;
  }

  _pan(v, p) {
    const ctx = this.ctx;
    if (!ctx.createStereoPanner) return v.out;
    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(p, -1, 1);
    v.nodes.push(pn);
    pn.connect(v.out);
    return pn;
  }

  _click(v, t, f, q, peak, tau, dest) {
    return v.noiseHit(dest || v.out, { t, peak, att: 0.0003, tau, filters: [['bandpass', f, q]] });
  }

  _slide(v, t, dur, f0, f1, peak, dest) {
    const n = v.noiseHit(dest || v.out, { t, peak, att: dur * 0.3, tau: dur * 0.35, filters: [['bandpass', f0, 2.2]] });
    glide(n.filters[0].frequency, t, f0, f1, dur);
    return n;
  }

  _dist(pos) {
    const L = this.eng._listener;
    if (!pos || !L.set) return 0;
    return Math.hypot(num(pos.x, L.x) - L.x, num(pos.y, L.y) - L.y, num(pos.z, L.z) - L.z);
  }

  _panOf(pos) {
    const L = this.eng._listener;
    if (!pos || !L.set) return 0;
    const dx = num(pos.x, L.x) - L.x, dz = num(pos.z, L.z) - L.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    return clamp(((dx * L.rx + dz * L.rz) / d) * 0.85, -0.85, 0.85);
  }

  /**
   * Virtual position on the same bearing as pos whose engine attenuation (2/d) equals our game
   * curve; never closer than `minD`. Reuses one object (consumed immediately by _voice).
   */
  _place(pos, minD = 0) {
    const L = this.eng._listener;
    if (!pos || !L.set) return null;
    const dx = num(pos.x, L.x) - L.x, dy = num(pos.y, L.y) - L.y, dz = num(pos.z, L.z) - L.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return null;
    const dv = Math.max(minD, Math.min(d, 2 / distanceGain(d)));
    const o = this._vp;
    o.x = L.x + (dx / d) * dv;
    o.y = L.y + (dy / d) * dv;
    o.z = L.z + (dz / d) * dv;
    return o;
  }

  /** Runs fn after the sound from pos has had time to arrive. */
  _later(pos, fn) {
    if (!this._ok()) return;
    try {
      const dt = soundDelay(this._dist(pos));
      if (dt < 0.03 || typeof setTimeout !== 'function') fn();
      else setTimeout(() => {
        try {
          fn();
        } catch (e) {
          this.eng._warn(e);
        }
      }, dt * 1000);
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _muffle() {
    if (!this.built) return;
    let fc = 20000, g = 1;
    if (this.breathOn) {
      fc = 820;
      g = 0.78;
    }
    if (this.slowOn) {
      fc = Math.min(fc, 1500);
      g = Math.min(g, 0.88);
    }
    const r = this.hb.core;
    if (r > 95) fc = Math.min(fc, clamp(5200 - (r - 95) * 40, 1400, 5200));
    const now = this.ctx.currentTime;
    this.world.frequency.setTargetAtTime(fc, now, 0.12);
    this.duck.gain.setTargetAtTime(g, now, 0.12);
  }

  _hbUpdate() {
    const H = this.hb;
    H.bpm = Math.max(H.core, H.breath);
    if (H.bpm > 0 && !H.timer && typeof setInterval === 'function') {
      H.timer = setInterval(this._hbPump, 50);
      if (H.timer.unref) H.timer.unref();
    }
  }

  _hbPump() {
    const H = this.hb;
    if (!H.bpm || !this._ok()) {
      if (!H.bpm && H.timer) {
        clearInterval(H.timer);
        H.timer = null;
      }
      return;
    }
    try {
      const now = this.ctx.currentTime;
      if (H.next < now) H.next = now + 0.04;
      while (H.next < now + 0.2) {
        this._beat(H.next, H.bpm);
        H.next += 60 / H.bpm;
      }
    } catch (e) {
      this.eng._warn(e);
    }
  }

  _beat(time, bpm) {
    const v = this.eng._voice(66, null, { when: time, propagate: false, bus: this.uiBus, level: 1 });
    if (!v) return;
    try {
      const t = v.t;
      const s2 = t + clamp(0.3 * Math.sqrt(60 / bpm), 0.16, 0.36);
      const lp = v.filter('lowpass', 260, -3);
      lp.connect(v.out);
      const lvl = 0.3 + 0.12 * clamp((bpm - 60) / 80, 0, 1);
      v.toneHit(lp, { t, f0: 60, f1: 42, glideT: 0.08, peak: lvl, att: 0.012, tau: 0.05 });
      v.noiseHit(lp, { buf: 'brown', t, peak: lvl * 0.8, att: 0.01, tau: 0.045, filters: [['lowpass', 200, 0]] });
      v.toneHit(lp, { t: s2, f0: 76, f1: 58, glideT: 0.05, peak: lvl * 0.7, att: 0.008, tau: 0.035 });
      v.noiseHit(lp, { buf: 'brown', t: s2, peak: lvl * 0.5, att: 0.006, tau: 0.03, filters: [['lowpass', 240, 0]] });
    } finally {
      v.commit();
    }
  }
}

function E_offline(ctx) {
  return typeof ctx.startRendering === 'function';
}
