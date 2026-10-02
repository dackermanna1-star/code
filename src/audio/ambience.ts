/**
 * Ambience mixer: turns the player's situation (set every frame) into smoothly crossfaded
 * background beds, a global environment filter (underwater / lava), the reverb mix
 * (open air vs. cave) and randomized ambient events (cave "mood" sounds, drips, birds,
 * Nether / End additions, distant thunder). No allocations in the per-frame path.
 */
import type { LoopHandle, PlayOptions, Vec3Like } from './types';

export interface AmbienceState {
  underwater: boolean;
  /** 0..1 enclosed / dark. */
  caveFactor: number;
  rain: number;
  thunder: number;
  /** 0..1 altitude / exposure. */
  wind: number;
  dimension: 'overworld' | 'nether' | 'end';
  biome: string;
  /** 0..1, 0 = sunrise. */
  timeOfDay: number;
  inLava?: boolean;
}

export interface AmbienceHost {
  /** Starts a global (non-positional) looping bed at volume 0. */
  bed(name: string): LoopHandle;
  oneShot(name: string, opts: PlayOptions): void;
  thunder(distance: number): void;
  /** Environment low-pass (Hz) and gain for world sounds. */
  setEnv(cutoff: number, gain: number): void;
  /** Reverb returns: open-air (short) and enclosed (long). */
  setReverb(small: number, large: number): void;
  listener(): Vec3Like;
}

interface Bed {
  name: string;
  level: number;
  cur: number;
  tgt: number;
  applied: number;
  idle: number;
  h: LoopHandle | null;
}

interface Traits {
  ocean: boolean;
  shore: boolean;
  cold: boolean;
  dry: boolean;
  birds: boolean;
  insects: boolean;
  netherBed: string;
  nether: string;
}

const NETHER_BEDS: Record<string, string> = {
  crimson_forest: 'loop.nether.crimson',
  warped_forest: 'loop.nether.warped',
  soul_sand_valley: 'loop.nether.soul',
  basalt_deltas: 'loop.nether.basalt',
};

const NETHER_BED_NAMES = Object.values(NETHER_BEDS);

function traitsOf(b: string): Traits {
  const has = (re: RegExp) => re.test(b);
  const ocean = has(/ocean/);
  const shore = has(/beach|shore/);
  const cold = has(/snow|frozen|ice|peaks|slopes|grove/);
  const dry = has(/desert|badlands/);
  const birds = !cold && !dry && !ocean && has(/forest|taiga|jungle|plains|meadow|cherry|swamp|river|savanna|mushroom|hills|lush/);
  const insects = !cold && !ocean && has(/forest|jungle|plains|meadow|cherry|swamp|savanna|river|desert|badlands|hills|taiga/);
  const nether = NETHER_BEDS[b] ? b : b === 'nether_wastes' ? b : 'nether_wastes';
  return { ocean, shore, cold, dry, birds, insects, netherBed: NETHER_BEDS[b] ?? '', nether };
}

const smooth01 = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Ambience {
  private s: AmbienceState = { underwater: false, caveFactor: 0, rain: 0, thunder: 0, wind: 0, dimension: 'overworld', biome: 'plains', timeOfDay: 0.25, inLava: false };
  private active = false;
  private traits: Traits = traitsOf('plains');
  private biomeSeen = 'plains';
  private beds: Bed[] = [];
  private byName: Record<string, Bed> = {};
  private env = { cut: 22000, gain: 1, small: 0.9, large: 0, appliedCut: -1, appliedGain: -1, appliedSmall: -1, appliedLarge: -1 };
  private t = 0;
  private applyTimer = 0;
  private mood = 0;
  private moodThreshold = 1;
  private timers = { drip: 6, bird: 5, under: 8, nether: 10, end: 15, thunder: 12 };
  private rnd: () => number;
  private pos = { x: 0, y: 0, z: 0 };
  private opts: PlayOptions = { pos: this.pos, volume: 1 };

  constructor(private host: AmbienceHost, rnd: () => number) {
    this.rnd = rnd;
    const add = (name: string, level: number) => {
      const b: Bed = { name, level, cur: 0, tgt: 0, applied: -1, idle: 0, h: null };
      this.beds.push(b);
      this.byName[name] = b;
    };
    add('loop.wind', 0.55);
    add('loop.rain', 0.75);
    add('loop.rain_indoor', 0.6);
    add('loop.underwater', 0.85);
    add('loop.cave', 0.5);
    add('loop.night', 0.3);
    add('loop.ocean', 0.45);
    add('loop.nether', 0.7);
    add('loop.nether.crimson', 0.7);
    add('loop.nether.warped', 0.6);
    add('loop.nether.soul', 0.65);
    add('loop.nether.basalt', 0.7);
    add('loop.end', 0.6);
    add('loop.lava', 0.9);
  }

  /** Copies the state (cheap; call every frame). */
  set(a: AmbienceState): void {
    const s = this.s;
    s.underwater = !!a.underwater;
    s.caveFactor = a.caveFactor > 0 ? (a.caveFactor < 1 ? a.caveFactor : 1) : 0;
    s.rain = a.rain > 0 ? (a.rain < 1 ? a.rain : 1) : 0;
    s.thunder = a.thunder > 0 ? (a.thunder < 1 ? a.thunder : 1) : 0;
    s.wind = a.wind > 0 ? (a.wind < 1 ? a.wind : 1) : 0;
    s.dimension = a.dimension;
    s.timeOfDay = a.timeOfDay;
    s.inLava = !!a.inLava;
    if (a.biome !== this.biomeSeen) {
      this.biomeSeen = a.biome;
      s.biome = a.biome;
      this.traits = traitsOf(a.biome);
    }
    this.active = true;
  }

  get state(): Readonly<AmbienceState> {
    return this.s;
  }

  private target(name: string, v: number): void {
    this.byName[name].tgt = v;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const s = this.s;
    const tr = this.traits;
    const ow = s.dimension === 'overworld' ? 1 : 0;
    const ne = s.dimension === 'nether' ? 1 : 0;
    const en = s.dimension === 'end' ? 1 : 0;
    const uw = s.underwater ? 1 : 0;
    const lava = s.inLava ? 1 : 0;
    const dry = (1 - uw) * (1 - lava);
    const cf = s.caveFactor;
    const outside = 1 - cf;
    const tod = s.timeOfDay - Math.floor(s.timeOfDay);
    const night = smooth01(0.48, 0.56, tod) * (1 - smooth01(0.94, 0.99, tod));
    const rainy = tr.cold || tr.dry ? 0 : s.rain;
    const gust = 0.75 + 0.25 * (0.6 * Math.sin(this.t * 0.31) + 0.4 * Math.sin(this.t * 0.77 + 1.3));

    this.target('loop.wind', dry * (ow * (s.wind * (tr.cold ? 1.2 : 1) + s.rain * 0.35) * outside * outside + en * 0.35) * gust);
    this.target('loop.rain', ow * dry * rainy * outside * outside);
    this.target('loop.rain_indoor', ow * dry * rainy * smooth01(0.15, 0.5, cf) * (1 - smooth01(0.75, 1, cf)));
    this.target('loop.underwater', uw * (1 - lava));
    this.target('loop.cave', ow * dry * smooth01(0.35, 0.9, cf));
    this.target('loop.night', ow * dry * outside * night * (tr.insects ? 1 : 0) * (1 - rainy));
    this.target('loop.ocean', ow * dry * outside * (tr.shore ? 1 : tr.ocean ? 0.6 : 0));
    const special = tr.netherBed;
    this.target('loop.nether', ne * dry * (special ? 0.45 : 1));
    for (const k of NETHER_BED_NAMES) this.target(k, ne * dry * (k === special ? 1 : 0));
    this.target('loop.end', en * dry);
    this.target('loop.lava', lava);

    // smoothing (crossfade ≈ 1.2 s)
    const k = 1 - Math.exp(-dt / 1.2);
    for (const b of this.beds) {
      b.cur += (b.tgt - b.cur) * k;
      if (b.tgt <= 0.0005 && b.cur < 0.0008) {
        b.cur = 0;
        b.idle += dt;
      } else b.idle = 0;
    }

    // environment filter & reverb mix
    const env = this.env;
    const ke = 1 - Math.exp(-dt / 0.18);
    const cutT = lava ? 320 : uw ? 650 : 22000;
    const gainT = lava ? 0.75 : uw ? 0.9 : 1;
    env.cut += (cutT - env.cut) * ke;
    env.gain += (gainT - env.gain) * ke;
    let smallT: number;
    let largeT: number;
    if (uw) {
      smallT = 0.4;
      largeT = 0.7;
    } else if (ne) {
      smallT = 0.35;
      largeT = 0.85;
    } else if (en) {
      smallT = 0.3;
      largeT = 0.75;
    } else {
      smallT = 0.9 * (1 - cf * 0.8);
      largeT = 1.15 * smooth01(0.1, 0.8, cf);
    }
    const kr = 1 - Math.exp(-dt / 0.8);
    env.small += (smallT - env.small) * kr;
    env.large += (largeT - env.large) * kr;

    this.applyTimer -= dt;
    if (this.applyTimer <= 0) {
      this.applyTimer = 0.08;
      this.apply();
    }
    this.events(dt, ow, ne, en, uw, cf, night, rainy);
  }

  private apply(): void {
    for (const b of this.beds) {
      const v = b.cur * b.level;
      if (v > 0.0005 && !b.h) b.h = this.host.bed(b.name);
      if (b.h && Math.abs(v - b.applied) > 0.002) {
        b.h.setVolume(v);
        b.applied = v;
      }
      if (b.h && b.idle > 8) {
        b.h.stop(0.5);
        b.h = null;
        b.applied = -1;
      }
    }
    const e = this.env;
    if (Math.abs(e.cut - e.appliedCut) > e.cut * 0.01 || Math.abs(e.gain - e.appliedGain) > 0.005) {
      this.host.setEnv(e.cut, e.gain);
      e.appliedCut = e.cut;
      e.appliedGain = e.gain;
    }
    if (Math.abs(e.small - e.appliedSmall) > 0.005 || Math.abs(e.large - e.appliedLarge) > 0.005) {
      this.host.setReverb(e.small, e.large);
      e.appliedSmall = e.small;
      e.appliedLarge = e.large;
    }
  }

  /** Places `this.pos` at a random point around the listener. */
  private around(rMin: number, rMax: number, yMin: number, yMax: number): void {
    const l = this.host.listener();
    const a = this.rnd() * Math.PI * 2;
    const d = rMin + (rMax - rMin) * this.rnd();
    this.pos.x = l.x + Math.cos(a) * d;
    this.pos.z = l.z + Math.sin(a) * d;
    this.pos.y = l.y + yMin + (yMax - yMin) * this.rnd();
  }

  private shot(name: string, vol: number): void {
    this.opts.volume = vol;
    this.opts.pos = this.pos;
    this.host.oneShot(name, this.opts);
  }

  private events(dt: number, ow: number, ne: number, en: number, uw: number, cf: number, night: number, rainy: number): void {
    const s = this.s;
    const T = this.timers;
    const rnd = this.rnd;
    // cave mood: accumulates while enclosed; releases an eerie sound somewhere nearby
    if (ow && !uw && cf > 0.5) {
      this.mood += (dt * (cf - 0.4)) / 70;
      if (this.mood >= this.moodThreshold) {
        this.mood = 0;
        this.moodThreshold = 0.6 + rnd() * 0.9;
        this.around(6, 14, -3, 3);
        this.shot('ambient.cave', 0.9);
      }
      T.drip -= dt * cf;
      if (T.drip <= 0) {
        T.drip = 4 + rnd() * 12;
        this.around(3, 10, 0, 4);
        this.shot('ambient.drip', 0.6);
      }
    } else this.mood = Math.max(0, this.mood - dt / 120);
    // birds by day outdoors
    if (ow && !uw && this.traits.birds && cf < 0.3 && night < 0.2 && rainy < 0.3) {
      T.bird -= dt;
      if (T.bird <= 0) {
        T.bird = 3 + rnd() * 10;
        this.around(8, 22, 3, 10);
        this.shot('ambient.bird', 0.7 * (1 - cf));
      }
    }
    if (uw) {
      T.under -= dt;
      if (T.under <= 0) {
        T.under = 6 + rnd() * 14;
        this.around(4, 12, -4, 4);
        this.shot('ambient.underwater.additions', 0.8);
      }
    }
    if (ne && !uw) {
      T.nether -= dt;
      if (T.nether <= 0) {
        T.nether = 8 + rnd() * 18;
        this.around(8, 20, -4, 6);
        this.shot(`ambient.${this.traits.nether}.additions`, 0.9);
      }
    }
    if (en && !uw) {
      T.end -= dt;
      if (T.end <= 0) {
        T.end = 14 + rnd() * 26;
        this.around(10, 24, -2, 8);
        this.shot('ambient.end.additions', 0.8);
      }
    }
    if (ow && s.thunder > 0.01) {
      T.thunder -= dt * s.thunder;
      if (T.thunder <= 0) {
        T.thunder = 8 + rnd() * 24;
        this.host.thunder(80 + rnd() * 520);
      }
    }
  }

  /** Debug: bed levels. */
  levels(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const b of this.beds) if (b.cur > 0.001) o[b.name] = Math.round(b.cur * 100) / 100;
    return o;
  }

  dispose(): void {
    for (const b of this.beds) {
      b.h?.stop(0.2);
      b.h = null;
    }
  }
}
