// Audio engine (raw Web Audio). Implements AudioSystem (src/core/context.ts).
//
// Graph:  voice sources ─► channel gain ─► low-pass (excitation · occlusion · air) ─► HRTF/
//         equal-power panner ─► sfx/ambience bus ─► master ─► compressor ─► limiter ─► out
//                                   └─► 3 reverb sends ─► HP ─► convolver (tiled/living/dead) ─► return ─► sfx
// * Voices live in a fixed pool of channels (default 48: 40 spatial, 6 self/2-D with reverb,
//   2 UI). New sounds are batched per synchronous burst (microtask) and per frame, ranked by
//   audibility at the listener (loudness × distance law × occlusion × priority); when the pool
//   is full the least audible voice is stolen (12 ms fade). Rate limits per sound family and
//   per island stop debris showers from machine-gunning.
// * Propagation: inverse-distance law (refDistance 1 m, rolloff by loudness class), speed of
//   sound delay, air absorption, occlusion through the integrator's hook (holes punched in
//   walls let sound through) plus diffraction through door/opening portals, reverb send level
//   from the SOURCE room, convolver returns crossfaded by the LISTENER room.
// * The AudioContext is created lazily on resume() (a user gesture): no autoplay warnings.
//   Before that, one-shots are dropped and loops are virtual; they fade in once running.
// * Never throws: every public method is guarded; without Web Audio everything is a no-op.
//
// Babylon note: create the engine with { audioEngine: false } so Babylon does not spin up its
// own legacy audio engine/context (see docs/api-notes/vfx-audio.md).

import type { Vector3 } from "@babylonjs/core";
import type { AudioSystem, LoopHandle, RoomAcoustics } from "../core/context.ts";
import type { EventBus, FractureEv, GameEvents, ImpactEv } from "../core/events.ts";
import type { Settings, SettingsData } from "../core/settings.ts";
import type { Vec3 } from "../geom/vec.ts";
import type { MaterialId, SoundProfile } from "../destruction/model/materials.ts";
import { Rng } from "../core/rng.ts";
import { FLOOR_LEVEL, STOREY_H } from "../world/plan.ts";
import { resolveSound, NORM_ONESHOT_DB, type SoundDef } from "./bank.ts";
import { SoundBank, type BankEntry, type BankStats } from "./soundbank.ts";
import { IR_SPECS, generateIR, irWeights } from "./reverb.ts";
import { SampleLibrary } from "./samples.ts";
import { defaultPortals } from "./portals.ts";
import { Biquad, maxWindowRms } from "./synth/dsp.ts";
import * as M from "./mapping.ts";

// ------------------------------------------------------------------------------ constants

const DEFAULT_ROOM: RoomAcoustics = { id: "default", rt60: 0.5, brightness: 0.5, wet: 0.2 };
const SPEED_OF_SOUND = 343;
const MAX_NEW_PER_FLUSH = 20;
const MAX_REAL_LOOPS = 14;
const RAY_BUDGET = 48;
const WET_SCALE = 1.1;
const STREET_Y = -FLOOR_LEVEL * STOREY_H;
const INAUDIBLE = 2e-4;
const HRTF_BY_QUALITY: Record<string, number> = { low: 8, medium: 16, high: 24, ultra: 32 };

const dbToGain = (db: number): number => Math.pow(10, db / 20);
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const finite = (v: Vec3 | null | undefined): v is Vec3 => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

type Bus = 0 | 1 | 2; // sfx, ambience, ui
const BUS_OF: Record<string, Bus> = { sfx: 0, ambience: 1, ui: 2 };

interface LayerReq {
  buffer: AudioBuffer;
  gain: number;
  rate: number;
  offset: number;
}

/** A pending one-shot voice (pooled). */
interface Req {
  layers: LayerReq[];
  n: number;
  x: number;
  y: number;
  z: number;
  pos: boolean;
  /** Channel pool: 0 spatial, 1 self (2-D + reverb), 2 UI (2-D dry). */
  kind: 0 | 1 | 2;
  bus: Bus;
  prio: number;
  cutoff: number;
  /** Internal-clock time at which to start. */
  at: number;
  rolloff: number;
  ref: number;
  occlude: boolean;
  reverb: number;
  /** Heard through the façade/windows (city horns, distant crash). */
  ext: boolean;
  loud: number;
  // evaluated at flush time
  dist: number;
  occ: number;
  audible: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Channel {
  kind: 0 | 1 | 2;
  hrtf: boolean;
  input: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode | null;
  /** Dry outputs: [sfx, ambience] or [ui]. */
  outs: GainNode[];
  sends: GainNode[];
  busyUntil: number;
  start: number;
  dur: number;
  prio: number;
  sources: AudioBufferSourceNode[];
}

export interface CreateAudioOpts {
  events: EventBus<GameEvents>;
  settings: Settings;
  /** Loading-bar progress (0..1) while the bank is generated. */
  onProgress?: (fraction: number) => void;
  /** Use this context (e.g. an OfflineAudioContext in tests) instead of a lazy AudioContext. */
  context?: BaseAudioContext;
  /** Reuse an already generated bank. */
  bank?: SoundBank;
  /** Load CC0 samples from `samplesBase` (default true). */
  samples?: boolean;
  samplesBase?: string;
  /** Bank generation time budget (ms). */
  budgetMs?: number;
  /** Generate the bank in Web Workers (default true). */
  workers?: boolean | number;
  /** Voice cap (default 48). */
  maxVoices?: number;
  /** Seed for variation choices. */
  seed?: number;
  /** Start the city / wind ambience beds automatically (default true). */
  ambience?: boolean;
  /** Number of HRTF voice channels (default by quality preset: 8/16/24/32); 0 = equal-power only. */
  hrtf?: number;
}

export interface AudioStats {
  running: boolean;
  state: string;
  voices: number;
  loops: number;
  realLoops: number;
  played: number;
  dropped: number;
  stolen: number;
  limited: number;
  rays: number;
  samplesLoaded: number;
  bank: BankStats;
  listenerRoom: string;
  wind: number;
  powered: boolean;
}

const NOOP_LOOP: LoopHandle = {
  setPosition() {},
  setGain() {},
  stop() {},
};

// ------------------------------------------------------------------------------ loops

/** A looping sound (ambience bed or positional emitter). Virtual until it may play. */
export class LoopVoice implements LoopHandle {
  x = 0;
  y = 0;
  z = 0;
  /** Internal gain multiplier (wind exposure, strain intensity …). */
  extra = 1;
  /** Routed through the exterior (window) filter. */
  ext = false;
  /** 0 virtual, 1 real, 2 stopped. */
  state: 0 | 1 | 2 = 0;
  audible = 0;
  occ = 1;
  occT = -1;
  src: AudioBufferSourceNode | null = null;
  input: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  panner: PannerNode | null = null;
  outs: GainNode[] = [];
  sends: GainNode[] = [];

  private readonly a: Audio;
  readonly def: SoundDef;
  readonly buffer: AudioBuffer;
  readonly positional: boolean;
  gain: number;
  pitch: number;
  /** Internal-clock creation time (keeps loop phase continuous across virtualisation). */
  readonly born: number;

  constructor(a: Audio, def: SoundDef, buffer: AudioBuffer, positional: boolean, gain: number, pitch: number, born: number) {
    this.a = a;
    this.def = def;
    this.buffer = buffer;
    this.positional = positional;
    this.gain = gain;
    this.pitch = pitch;
    this.born = born;
  }

  setPosition(p: Vec3): void {
    if (!finite(p) || this.state === 2) return;
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    if (this.panner && this.state === 1) this.a.setPannerPos(this.panner, p.x, p.y, p.z);
  }

  setGain(g: number): void {
    if (this.state === 2) return;
    this.gain = Number.isFinite(g) ? Math.max(0, g) : 0;
    this.a.applyLoopGain(this, 0.06);
  }

  setPitch(p: number): void {
    if (this.state === 2 || !Number.isFinite(p)) return;
    this.pitch = clamp(p, 0.25, 4);
    this.a.applyLoopPitch(this);
  }

  stop(fadeSec = 0.3): void {
    if (this.state === 2) return;
    this.a.stopLoop(this, Number.isFinite(fadeSec) ? Math.max(0, fadeSec) : 0.3);
  }
}

// ------------------------------------------------------------------------------ engine

export class Audio implements AudioSystem {
  readonly bank: SoundBank;
  readonly samples = new SampleLibrary();

  private readonly events: EventBus<GameEvents>;
  private readonly settings: Settings;
  private readonly rng: Rng;
  private readonly maxVoices: number;

  private ctx: BaseAudioContext | null = null;
  private offline = false;
  private ownsContext = false;
  private disabled = false;
  private wasRunning = false;

  // graph
  private master: GainNode | null = null;
  private buses: GainNode[] = [];
  private revIn: AudioNode[] = [];
  private revRet: GainNode[] = [];
  private channels: Channel[] = [];
  private masterUser = -1;

  // listener
  private lis = { x: 0, y: 1.6, z: 0 };
  private lisF = { x: 0, y: 0, z: 1 };
  private lisU = { x: 0, y: 1, z: 0 };
  private lisRoom: RoomAcoustics | null = null;
  private lisW = [0, 1, 0];

  // hooks
  private roomFn: ((p: Vec3) => RoomAcoustics | null) | null = null;
  private occFn: ((from: Vec3, to: Vec3) => number) | null = null;
  private portals: Vec3[] = defaultPortals();

  // scheduling
  private pending: Req[] = [];
  private delayed: Req[] = [];
  private reqPool: Req[] = [];
  private flushQueued = false;
  private readonly flushBound = () => this.flush();
  private readonly srcGain = new WeakMap<AudioBufferSourceNode, GainNode>();
  private readonly onEnded = (e: Event) => {
    const s = e.target as AudioBufferSourceNode;
    try {
      s.disconnect();
      this.srcGain.get(s)?.disconnect();
    } catch {
      /* already disconnected */
    }
  };

  // loops & ambience
  private loops = new Set<LoopVoice>();
  private nextLoopUpdate = 0;
  private city: LoopVoice | null = null;
  private windBed: LoopVoice | null = null;
  private windowWind: LoopVoice[] = [];
  private water = new Map<string, LoopVoice>();
  private buzz = new Map<string, { lv: LoopVoice; until: number }>();
  private strains = new Map<string, { lv: LoopVoice; last: number; nextAccent: number }>();
  private wind = 0;
  private windTarget = 0;
  private windExplicit = false;
  private extCutoff = 350;
  private extGain = 0.45;
  private nextHorn = 0;
  private powered = true;

  // limiting / memory
  private buckets = new M.TokenBuckets();
  private islands = new M.IslandLimiter();
  private nextPrune = 0;
  private rayBudget = RAY_BUDGET;
  private rayReset = 0;
  private occCache = new Map<number, { occ: number; t: number; vx: number; vy: number; vz: number }>();
  private patches: Array<{ x: number; y: number; z: number; r: number }> = [];
  private recent: Array<{ x: number; y: number; z: number; p: SoundProfile; t: number }> = [];
  private warned = new Set<string>();
  private unsubs: Array<() => void> = [];
  private gestureOff: (() => void) | null = null;

  // scratch
  private readonly tmpLayers: M.Layer[] = [];
  private readonly tmpW = [0, 0, 0];
  private readonly tmpW2 = [0, 0, 0];
  private readonly tmpSend = [0, 0, 0];
  private readonly va = { x: 0, y: 0, z: 0 };
  private readonly vb = { x: 0, y: 0, z: 0 };

  private st = { played: 0, dropped: 0, stolen: 0, limited: 0, rays: 0 };

  private readonly ambienceOn: boolean;
  private readonly hrtfOpt: number | undefined;
  private hrtfLoops = true;

  constructor(opts: { events: EventBus<GameEvents>; settings: Settings; bank: SoundBank; maxVoices?: number; seed?: number; ambience?: boolean; hrtf?: number }) {
    this.ambienceOn = opts.ambience !== false;
    this.hrtfOpt = Number.isFinite(opts.hrtf) ? Math.max(0, Math.floor(opts.hrtf as number)) : undefined;
    this.events = opts.events;
    this.settings = opts.settings;
    this.bank = opts.bank;
    this.rng = new Rng(opts.seed ?? 0x5eed1234);
    this.maxVoices = clamp(Math.floor(opts.maxVoices ?? 48), 8, 128);
    if (!this.bank.size) this.disabled = true;
    try {
      this.settings.onChange((d) => this.applySettings(d));
    } catch {
      /* settings without listeners */
    }
    this.subscribe();
  }

  // ============================================================================ public API

  /** True when sounds can actually be heard (context created and running). */
  get running(): boolean {
    const c = this.ctx;
    return !!c && !this.disabled && (this.offline || c.state === "running");
  }

  get activeVoices(): number {
    const c = this.ctx;
    if (!c) return 0;
    const t = c.currentTime;
    let n = 0;
    for (const ch of this.channels) if (ch.busyUntil > t) n++;
    for (const lv of this.loops) if (lv.state === 1) n++;
    return n;
  }

  /** Must be called from a user gesture (creates the AudioContext on first call). */
  async resume(): Promise<void> {
    if (this.disabled) return;
    try {
      if (!this.ctx) this.createContext(); // synchronous: stays inside the gesture
      const c = this.ctx as AudioContext | null;
      if (c && !this.offline && c.state !== "running" && typeof c.resume === "function") await c.resume();
      if (this.running) this.onRunning();
    } catch {
      /* never throw: audio simply stays off */
    }
  }

  setListener(pos: Vector3, forward: Vector3, up: Vector3): void {
    if (!finite(pos) || !finite(forward) || !finite(up)) return;
    this.lis.x = pos.x;
    this.lis.y = pos.y;
    this.lis.z = pos.z;
    const fl = Math.hypot(forward.x, forward.y, forward.z);
    const ul = Math.hypot(up.x, up.y, up.z);
    if (fl > 1e-6) {
      this.lisF.x = forward.x / fl;
      this.lisF.y = forward.y / fl;
      this.lisF.z = forward.z / fl;
    }
    if (ul > 1e-6) {
      this.lisU.x = up.x / ul;
      this.lisU.y = up.y / ul;
      this.lisU.z = up.z / ul;
    }
    if (this.ctx) this.applyListener();
  }

  play(id: string, pos: Vec3 | null, opts?: { gain?: number; pitch?: number; size?: number; priority?: number }): void {
    try {
      if (!this.running) return; // dropped before resume()
      const r = resolveSound(id, opts?.size);
      const e = r ? this.bank.get(r.def.id) : undefined;
      if (!r || !e || !e.buffers.length) {
        this.warnOnce(id);
        return;
      }
      const g = opts?.gain ?? 1;
      if (!(g > 0) || !Number.isFinite(g)) return;
      const now = this.clock();
      if (!this.buckets.allow(M.familyKey(r.def.id), now, ...M.limitsFor(r.def.id))) {
        this.st.limited++;
        return;
      }
      const db = r.def.level + 20 * Math.log10(g);
      const positional = finite(pos);
      const req = this.newReq(positional ? pos : null, positional ? 0 : r.def.bus === "ui" ? 2 : 1, BUS_OF[r.def.bus] ?? 0);
      const rate = r.rate * clamp(opts?.pitch ?? 1, 0.25, 4) * this.jitter(0.03);
      this.addLayer(req, this.bank.pick(e, this.rand), dbToGain(db), rate, 0);
      this.addSampleLayer(req, M.SAMPLE_FOR_ID[r.def.id], db, rate);
      req.prio = Number.isFinite(opts?.priority) ? Math.max(0, opts!.priority!) : 1;
      req.loud = db;
      req.rolloff = M.rolloffFor(db);
      this.enqueue(req);
    } catch (err) {
      this.fail("play", err);
    }
  }

  loop(id: string, pos: Vec3 | null, opts?: { gain?: number; pitch?: number }): LoopHandle {
    try {
      if (this.disabled) return NOOP_LOOP;
      const r = resolveSound(id);
      const e = r ? this.bank.get(r.def.id) : undefined;
      if (!r || !e || !e.buffers.length) {
        this.warnOnce(id);
        return NOOP_LOOP;
      }
      const positional = finite(pos);
      const lv = new LoopVoice(this, r.def, this.bank.pick(e, this.rand), positional, Math.max(0, opts?.gain ?? 1), clamp((opts?.pitch ?? 1) * r.rate, 0.25, 4), this.clock());
      if (positional) {
        lv.x = pos.x;
        lv.y = pos.y;
        lv.z = pos.z;
      }
      lv.occ = 1;
      this.loops.add(lv);
      if (this.running) this.updateLoops(this.clock(), true);
      return lv;
    } catch (err) {
      this.fail("loop", err);
      return NOOP_LOOP;
    }
  }

  setMasterVolume(v: number): void {
    if (!Number.isFinite(v)) return;
    this.masterUser = clamp(v, 0, 1);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterUser * this.masterUser, this.ctx.currentTime, 0.03);
  }

  /** Integrator hook: room acoustics at a point (from plan.ts / world.roomAt). */
  setRoomResolver(fn: (p: Vec3) => RoomAcoustics | null): void {
    this.roomFn = typeof fn === "function" ? fn : null;
  }

  /** Integrator hook: 0 = fully blocked … 1 = clear line between two points (physics raycasts). */
  setOcclusion(fn: (from: Vec3, to: Vec3) => number): void {
    this.occFn = typeof fn === "function" ? fn : null;
    this.occCache.clear();
  }

  /** Override the diffraction portals (door/opening centres); [] disables portal paths. */
  setPortals(points: Vec3[]): void {
    this.portals = Array.isArray(points) ? points.filter(finite).map((p) => ({ x: p.x, y: p.y, z: p.z })) : [];
    this.occCache.clear();
  }

  /** 0 = sealed apartment … 1 = windows blown out (wind louder, city brighter). */
  setWindExposure(v: number): void {
    if (!Number.isFinite(v)) return;
    this.windExplicit = true;
    this.windTarget = clamp(v, 0, 1);
  }

  update(dt: number): void {
    if (this.disabled) return;
    try {
      const now = this.clock();
      this.rayBudget = RAY_BUDGET;
      this.rayReset = now;
      if (!this.ctx) return;
      if (this.running && !this.wasRunning) this.onRunning();
      this.updateListenerRoom();
      if (this.delayed.length) this.promoteDelayed(now);
      if (this.pending.length) this.flush();
      const d = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0.016;
      this.updateAmbience(now, d);
      if (now >= this.nextLoopUpdate) {
        this.nextLoopUpdate = now + 0.1;
        this.updateLoops(now, false);
      }
      for (const [k, s] of this.strains) {
        if (now - s.last > 0.25) {
          s.lv.stop(0.25);
          this.strains.delete(k);
        }
      }
      for (const [k, b] of this.buzz) {
        if (now > b.until) {
          b.lv.stop(0.4);
          this.buzz.delete(k);
        }
      }
      if (now > this.nextPrune) {
        this.nextPrune = now + 2;
        this.buckets.prune(now);
        this.islands.prune(now);
        for (const [k, c] of this.occCache) if (now - c.t > 1) this.occCache.delete(k);
        const cut = now - 2;
        this.recent = this.recent.filter((r) => r.t > cut);
      }
    } catch (err) {
      this.fail("update", err);
    }
  }

  stats(): AudioStats {
    let real = 0;
    for (const l of this.loops) if (l.state === 1) real++;
    return {
      running: this.running,
      state: this.disabled ? "disabled" : this.ctx ? (this.offline ? "offline" : this.ctx.state) : "not-started",
      voices: this.activeVoices,
      loops: this.loops.size,
      realLoops: real,
      ...this.st,
      samplesLoaded: this.samples.loaded,
      bank: this.bank.stats,
      listenerRoom: this.lisRoom?.id ?? "none",
      wind: this.wind,
      powered: this.powered,
    };
  }

  /** Stop everything, unsubscribe, close an owned context (tests / teardown). */
  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.gestureOff?.();
    this.samples.abort();
    for (const lv of [...this.loops]) lv.stop(0);
    const c = this.ctx as AudioContext | null;
    if (c && this.ownsContext && typeof c.close === "function") void c.close().catch(() => undefined);
    this.disabled = true;
  }

  // ============================================================================ setup

  /** Use an externally provided context (OfflineAudioContext in tests). */
  attachContext(c: BaseAudioContext): void {
    if (this.ctx || this.disabled) return;
    this.ctx = c;
    this.offline = typeof OfflineAudioContext !== "undefined" && c instanceof OfflineAudioContext;
    this.ownsContext = false;
    this.buildGraph();
  }

  /** Resume automatically on the first user gesture (in case the integrator does not). */
  installGestureResume(): void {
    if (typeof window === "undefined" || this.gestureOff) return;
    const h = () => {
      void this.resume().then(() => {
        if (this.running) this.gestureOff?.();
      });
    };
    const evs = ["pointerdown", "keydown", "touchstart"] as const;
    for (const e of evs) window.addEventListener(e, h, { capture: true, passive: true });
    this.gestureOff = () => {
      for (const e of evs) window.removeEventListener(e, h, { capture: true });
      this.gestureOff = null;
    };
  }

  private createContext(): void {
    const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      this.disabled = true;
      return;
    }
    try {
      this.ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      try {
        this.ctx = new Ctor();
      } catch {
        this.disabled = true;
        return;
      }
    }
    this.ownsContext = true;
    this.offline = false;
    const c = this.ctx as AudioContext;
    try {
      c.addEventListener("statechange", () => {
        if (c.state === "running") this.onRunning();
      });
    } catch {
      /* old browsers */
    }
    this.buildGraph();
  }

  private buildGraph(): void {
    const c = this.ctx;
    if (!c) return;
    try {
      const master = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -2;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.08;
      master.connect(comp);
      comp.connect(lim);
      lim.connect(c.destination);
      this.master = master;
      this.buses = [0, 1, 2].map(() => {
        const b = c.createGain();
        b.connect(master);
        return b;
      });
      // Reverbs: high-passed input → convolver (pre-normalised IR) → return gain → sfx bus.
      this.revIn = [];
      this.revRet = [];
      for (const spec of IR_SPECS) {
        const hp = c.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 90;
        const conv = c.createConvolver();
        conv.normalize = false;
        const ir = generateIR(spec, c.sampleRate);
        const b = c.createBuffer(2, ir[0].length, c.sampleRate);
        b.copyToChannel(ir[0] as Float32Array<ArrayBuffer>, 0);
        b.copyToChannel(ir[1] as Float32Array<ArrayBuffer>, 1);
        conv.buffer = b;
        const ret = c.createGain();
        hp.connect(conv);
        conv.connect(ret);
        ret.connect(this.buses[0]);
        this.revIn.push(hp);
        this.revRet.push(ret);
      }
      // Voice channels.
      const q = (this.settings?.data?.quality as string) ?? "high";
      const hrtfN = this.hrtfOpt ?? HRTF_BY_QUALITY[q] ?? 24;
      this.hrtfLoops = hrtfN > 0;
      const nUi = 2;
      const nSelf = 6;
      const nSpatial = Math.max(4, this.maxVoices - nUi - nSelf);
      this.channels = [];
      for (let i = 0; i < nSpatial; i++) this.channels.push(this.makeChannel(0, i < hrtfN));
      for (let i = 0; i < nSelf; i++) this.channels.push(this.makeChannel(1, false));
      for (let i = 0; i < nUi; i++) this.channels.push(this.makeChannel(2, false));
      this.applySettings(this.settings.data);
      this.applyListener();
      this.updateListenerRoom(true);
      if (hrtfN > 0 && !this.offline) this.prewarmHrtf();
      this.startAmbience();
    } catch (err) {
      console.warn("audio: graph construction failed, audio disabled", err);
      this.disabled = true;
    }
  }

  /**
   * Load the HRTF database right away (a muted oscillator through an HRTF panner) so the first
   * real sounds are not silent while it loads — see docs/api-notes/vfx-audio.md §6.
   */
  private prewarmHrtf(): void {
    const c = this.ctx;
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const mute = c.createGain();
      mute.gain.value = 0;
      const p = c.createPanner();
      p.panningModel = "HRTF";
      this.setPannerPos(p, 1, 0, 0);
      osc.connect(mute);
      mute.connect(p);
      p.connect(c.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          mute.disconnect();
          p.disconnect();
        } catch {
          /* ignore */
        }
      };
      osc.start();
      osc.stop(c.currentTime + 0.5);
    } catch {
      /* optional */
    }
  }

  private makeChannel(kind: 0 | 1 | 2, hrtf: boolean): Channel {
    const c = this.ctx!;
    const input = c.createGain();
    input.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 20000;
    filter.Q.value = 0.5;
    input.connect(filter);
    let panner: PannerNode | null = null;
    let dryFrom: AudioNode = filter;
    if (kind === 0) {
      panner = c.createPanner();
      panner.panningModel = hrtf ? "HRTF" : "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      filter.connect(panner);
      dryFrom = panner;
    }
    const outs: GainNode[] = [];
    const targets = kind === 2 ? [this.buses[2]] : [this.buses[0], this.buses[1]];
    for (const t of targets) {
      const o = c.createGain();
      o.gain.value = outs.length === 0 ? 1 : 0;
      dryFrom.connect(o);
      o.connect(t);
      outs.push(o);
    }
    const sends: GainNode[] = [];
    if (kind !== 2) {
      for (const r of this.revIn) {
        const s = c.createGain();
        s.gain.value = 0;
        filter.connect(s);
        s.connect(r);
        sends.push(s);
      }
    }
    return { kind, hrtf, input, filter, panner, outs, sends, busyUntil: 0, start: 0, dur: 0, prio: 0, sources: [] };
  }

  private applySettings(d: SettingsData): void {
    const c = this.ctx;
    if (!c || !this.master || this.buses.length < 3 || !d) return;
    const sq = (v: unknown) => {
      const n = typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 1) : 1;
      return n * n;
    };
    const t = c.currentTime;
    const mv = this.masterUser >= 0 ? this.masterUser * this.masterUser : sq(d.masterVolume);
    this.masterUser = -1; // settings changes win after an explicit setMasterVolume
    this.master.gain.setTargetAtTime(mv, t, 0.03);
    this.buses[0].gain.setTargetAtTime(sq(d.sfxVolume), t, 0.03);
    this.buses[1].gain.setTargetAtTime(sq(d.ambienceVolume), t, 0.03);
    this.buses[2].gain.setTargetAtTime(sq(d.sfxVolume), t, 0.03);
  }

  private subscribe(): void {
    const ev = this.events;
    const on = <K extends keyof GameEvents>(k: K, f: (e: GameEvents[K]) => void) => {
      this.unsubs.push(
        ev.on(k, (e) => {
          if (!this.running || !e) return;
          try {
            f(e);
          } catch (err) {
            this.fail(String(k), err);
          }
        }),
      );
    };
    on("impact", (e) => this.onImpact(e));
    on("fracture", (e) => this.onFracture(e));
    on("chip", (e) => this.playLayers(M.chipLayers(e.mat, e.energy, this.rand, this.tmpLayers), e.pos, 0));
    on("crack", (e) => this.playLayers(M.crackLayers(e.mat, e.severity, e.size, this.tmpLayers), e.pos, 0));
    on("dent", (e) => this.playLayers(M.dentLayers(e.energy, e.depth, e.size, this.tmpLayers), e.pos, 0));
    on("bondBreak", (e) => {
      this.playLayers(M.bondLayers(e.kind, e.matA, e.matB, e.energy, this.tmpLayers), e.pos, 0);
      this.noteMaterial(e.pos, M.profileOf(e.matA));
    });
    on("split", (e) => this.playLayers(M.splitLayers(e.mass, this.recentProfile(e.pos), this.tmpLayers), e.pos, 0));
    on("toolSwing", (e) => {
      const L = this.tmpLayers;
      L.length = 0;
      L.push(M.swingLayer(e.tool ?? "hands", e.power));
      this.playLayers(L, e.pos, 0, { occlude: false, prio: 1.5 });
    });
    on("toolHit", (e) => this.playLayers(M.toolHitLayers(e.tool, e.energy, e.hard, this.tmpLayers), e.pos, 0, { occlude: false, prio: 2 }));
    on("footstep", (e) => this.onFootstep(e.pos, e.mat, e.speed));
    on("land", (e) => {
      const L = this.tmpLayers;
      L.length = 0;
      const db = M.landDb(e.speed);
      L.push({ id: "land", db }, { id: M.stepIdFor(e.mat), db: db + 2, sample: M.SAMPLE_FOR_ID[M.stepIdFor(e.mat)] });
      if (this.nearPatch(e.pos)) L.push({ id: "step.debris", db: db + 1 });
      this.playLayers(L, null, 1);
    });
    on("grab", (e) => this.simple("cloth.grab", -24 + 3 * clamp(Math.log10(Math.max(e.mass, 0.1)), -1, 2), null, 1));
    on("throw", (e) => this.simple("cloth.throw", clamp(-20 + 5 * Math.log10(Math.max(e.energy, 0.1) / 50), -28, -10), null, 1));
    on("drop", () => this.simple("cloth.drop", -26, null, 1));
    on("strain", (e) => this.onStrain(e.pos, e.stress, e.kind, e.mat));
    on("feature", (e) => this.onFeature(e.kind, e.pos, e.intensity));
    on("fellOut", (e) => this.onFellOut(e.pos, e.mass, e.mat));
  }

  // ============================================================================ event handlers

  private onImpact(e: ImpactEv): void {
    if (!(e.energy >= 2e-3) || !finite(e.pos)) return;
    const now = this.clock();
    // Rate-limit per dynamic island (structure-sized parts are not limited: everything lands on them).
    const limA = e.idA >= 0 && !M.isStructure(e.sizeA, e.massA);
    const limB = e.idB >= 0 && !M.isStructure(e.sizeB, e.massB);
    if ((limA && !this.islands.check(e.idA, now, e.energy)) || (limB && !this.islands.check(e.idB, now, e.energy))) {
      this.st.limited++;
      return;
    }
    const layers = M.impactLayers(e, this.tmpLayers);
    if (!layers.length) return;
    if (limA) this.islands.record(e.idA, now, e.energy);
    if (limB) this.islands.record(e.idB, now, e.energy);
    this.playLayers(layers, e.pos, 0);
    this.noteMaterial(e.pos, M.profileOf(e.matA));
    // Sympathetic rattle: a really heavy blow makes nearby dishes / panes buzz.
    if (e.energy > 150 && this.rand() < 0.3) {
      const a = this.rand() * Math.PI * 2;
      const r = 1.2 + this.rand() * 1.8;
      const p = { x: e.pos.x + Math.cos(a) * r, y: e.pos.y + (this.rand() - 0.3), z: e.pos.z + Math.sin(a) * r };
      const L = this.tmpLayers;
      L.length = 0;
      L.push({ id: this.rand() < 0.5 ? "rattle.ceramic" : "rattle.glass", db: M.energyDb(e.energy) - 22, delay: 0.04 + 0.1 * this.rand() });
      this.playLayers(L, p, 0);
    }
  }

  private onFracture(e: FractureEv): void {
    if (!finite(e.pos)) return;
    this.playLayers(M.fractureLayers(e, this.rand, this.tmpLayers), e.pos, 0, { prio: 1.5 });
    const prof = M.profileOf(e.mat);
    this.noteMaterial(e.pos, prof);
    const n = (e.pieces || 0) + 0.3 * (e.micro || 0);
    const dp = M.debrisOf(prof);
    if (n > 1 && (dp === "glass" || dp === "ceramic" || dp === "drywall" || dp === "concrete")) this.addPatch(e.pos, n);
    // Glass of exterior windows / balcony door broken: let the wind in.
    if (prof === "glass" && e.mat !== "lcd" && /window|slid|balcony|glazing|exterior|facade/i.test(e.assembly ?? "")) {
      if (!this.windExplicit) this.windTarget = clamp(this.windTarget + 0.15 + Math.min(0.35, (e.volume || 0) * 60), 0, 1);
      this.addWindowWind(e.pos);
    }
  }

  private onFootstep(pos: Vec3, mat: MaterialId | null, speed: number): void {
    const L = this.tmpLayers;
    L.length = 0;
    const id = M.stepIdFor(mat);
    const db = M.footstepDb(speed);
    L.push({ id, db, sample: M.SAMPLE_FOR_ID[id] });
    if (finite(pos) && this.nearPatch(pos)) L.push({ id: "step.debris", db: db + 2 });
    this.playLayers(L, null, 1);
  }

  private onStrain(pos: Vec3, stress: number, kind: string, mat: MaterialId): void {
    if (!finite(pos)) return;
    const s = clamp(Number.isFinite(stress) ? stress : 0, 0, 1);
    const prof = M.profileOf(mat);
    const fam = kind === "hinge" || kind === "slider" || kind === "latch" ? "hinge" : prof === "metal" || prof === "metalThin" ? "metal" : prof === "drywall" || prof === "concrete" ? "drywall" : "wood";
    const now = this.clock();
    let st = this.strains.get(fam);
    if (!st) {
      const h = this.loop(`strain.${fam}`, pos, { gain: 0 });
      if (!(h instanceof LoopVoice)) return;
      st = { lv: h, last: now, nextAccent: now + 0.3 };
      this.strains.set(fam, st);
    }
    st.last = now;
    st.lv.setPosition(pos);
    // Absolute level −32 … −8 dB with stress; pitch rises as the joint is loaded.
    st.lv.setGain(dbToGain(-32 + 24 * s - st.lv.def.level));
    st.lv.setPitch(0.8 + 0.5 * s);
    if (s > 0.45 && now > st.nextAccent) {
      st.nextAccent = now + 0.25 + this.rand() * 0.8 * (1.2 - s);
      this.simple(fam === "metal" ? "creak.metal" : fam === "hinge" ? "creak.hinge" : fam === "drywall" ? "crack.dull" : "creak.wood", -20 + 10 * s, pos, 0);
    }
  }

  private onFeature(kind: GameEvents["feature"]["kind"], pos: Vec3, intensity?: number): void {
    const I = clamp(Number.isFinite(intensity) ? (intensity as number) : 1, 0, 2);
    const p = finite(pos) ? pos : null;
    switch (kind) {
      case "lightBroken":
        this.simple("bulb.pop", -8, p, 0);
        this.simple("crack.glass", -18, p, 0);
        break;
      case "lightFlicker":
        if (p) this.buzzAt(p, 0.5, -30);
        break;
      case "screenBroken":
        this.simple("crack.glass", -8, p, 0);
        this.simple("bulb.pop", -14, p, 0, 0.7);
        this.simple("spark.crackle", -16, p, 0);
        break;
      case "waterStart": {
        if (!p) break;
        const k = this.posKey(p, 0.5);
        if (!this.water.has(k)) {
          const h = this.loop("water.spray", p, { gain: 0.35 + 0.65 * clamp(I, 0, 1) });
          if (h instanceof LoopVoice) this.water.set(k, h);
        }
        break;
      }
      case "waterStop": {
        let best: string | null = null;
        let bd = 1.0;
        for (const [k, lv] of this.water) {
          const d = p ? Math.hypot(lv.x - p.x, lv.y - p.y, lv.z - p.z) : 0;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
        if (best) {
          this.water.get(best)!.stop(0.6);
          this.water.delete(best);
          if (p) this.simple("water.drip", -20, p, 0);
        }
        break;
      }
      case "sparks":
        this.simple("spark.crackle", clamp(-12 + 6 * Math.log10(I + 0.1), -24, -4), p, 0);
        if (p) this.buzzAt(p, 2 + 3 * this.rand(), -24);
        break;
      case "powerOut":
        this.simple("elec.clunk", -8, p, 0);
        this.setPowered(false);
        break;
      case "powerOn":
        this.simple("elec.clunk", -10, p, 0);
        this.setPowered(true);
        break;
      case "alarm":
        this.simple("alarm.chirp", -10, p, 0);
        break;
      case "motorStop":
        this.simple("motor.stop", -14, p, 0);
        break;
    }
  }

  private onFellOut(pos: Vec3, mass: number, mat: MaterialId): void {
    if (!finite(pos)) return;
    const delay = M.fallOutDelay(pos.y, STREET_Y);
    const E = Math.max(0.1, mass || 1) * 9.81 * Math.abs(STREET_Y);
    const db = clamp(8 * Math.log10(E / 300) - 40, -42, -8);
    const L = this.tmpLayers;
    L.length = 0;
    L.push({ id: "fall.distant", db, delay });
    const prof = M.profileOf(mat);
    if (prof === "glass" || prof === "ceramic") L.push({ id: "shatter.glass.l", db: db - 10, rate: 0.8, delay: delay + 0.02 });
    else if (prof === "metal" || prof === "metalThin") L.push({ id: "metal.clang", db: db - 8, rate: 0.85, delay: delay + 0.01 });
    this.playLayers(L, null, 1, { ext: true, cutoff: 1500, reverb: 0.3 });
  }

  // ============================================================================ plans → voices

  /** Play a single sound id at an absolute level (dB). */
  private simple(id: string, db: number, pos: Vec3 | null, kind: 0 | 1 | 2, rate = 1): void {
    const L = this.tmpLayers;
    L.length = 0;
    L.push({ id, db, rate });
    this.playLayers(L, pos, pos ? kind : kind === 0 ? 1 : kind);
  }

  /**
   * Turn layers into voices: immediate layers share one channel (same position, filter and
   * panner); delayed layers become their own (delayed) voices.
   */
  private playLayers(layers: readonly M.Layer[], pos: Vec3 | null, kind: 0 | 1 | 2, o?: { occlude?: boolean; prio?: number; ext?: boolean; cutoff?: number; reverb?: number }): void {
    if (!layers.length || !this.running) return;
    const now = this.clock();
    const positional = finite(pos) && kind === 0;
    let main: Req | null = null;
    for (const L of layers) {
      if (!Number.isFinite(L.db) || L.db < -70) continue;
      const r = resolveSound(L.id, L.size);
      const e = r ? this.bank.get(r.def.id) : undefined;
      if (!r || !e || !e.buffers.length) {
        this.warnOnce(L.id);
        continue;
      }
      if (!this.buckets.allow(M.familyKey(r.def.id), now, ...M.limitsFor(r.def.id))) {
        this.st.limited++;
        continue;
      }
      const delayed = (L.delay ?? 0) > 0.03;
      let req: Req;
      if (delayed || !main) {
        req = this.newReq(positional ? pos : null, positional ? 0 : kind === 0 ? 1 : kind, BUS_OF[r.def.bus] ?? 0);
        req.at = now + (delayed ? (L.delay as number) : 0);
        if (o?.occlude === false) req.occlude = false;
        if (o?.prio !== undefined) req.prio = o.prio;
        if (o?.ext) req.ext = true;
        if (o?.cutoff) req.cutoff = o.cutoff;
        if (o?.reverb !== undefined) req.reverb = o.reverb;
        if (!delayed) main = req;
      } else req = main;
      const rate = r.rate * (L.rate ?? 1) * this.jitter(0.035);
      this.addLayer(req, this.bank.pick(e, this.rand), dbToGain(L.db), rate, 0);
      this.addSampleLayer(req, L.sample ?? M.SAMPLE_FOR_ID[r.def.id], L.db, rate);
      if (L.cutoff) req.cutoff = Math.min(req.cutoff, L.cutoff);
      req.loud = Math.max(req.loud, L.db);
      req.rolloff = M.rolloffFor(req.loud);
      if (delayed) this.enqueue(req);
    }
    if (main) this.enqueue(main);
  }

  private addLayer(req: Req, buffer: AudioBuffer, gain: number, rate: number, offset: number): void {
    if (!buffer || !(gain > 0)) return;
    if (req.n >= req.layers.length) req.layers.push({ buffer, gain, rate, offset });
    else {
      const l = req.layers[req.n];
      l.buffer = buffer;
      l.gain = gain;
      l.rate = rate;
      l.offset = offset;
    }
    req.n++;
  }

  /** Blend a matching CC0 sample (when loaded) under a synthesized layer. */
  private addSampleLayer(req: Req, key: string | undefined, db: number, rate: number): void {
    if (!key || this.samples.loaded === 0 || this.rand() > 0.75) return;
    const s = this.samples.pick(key, clamp((db + 30) / 30, 0, 1), this.rand);
    if (!s) return;
    this.addLayer(req, s.buffer, dbToGain(db) * 0.7 * s.norm, Math.sqrt(clamp(rate, 0.25, 4)) * this.jitter(0.04), 0);
  }

  private newReq(pos: Vec3 | null, kind: 0 | 1 | 2, bus: Bus): Req {
    const r: Req =
      this.reqPool.pop() ??
      ({ layers: [], n: 0, x: 0, y: 0, z: 0, pos: false, kind: 0, bus: 0, prio: 1, cutoff: 20000, at: 0, rolloff: 1, ref: 1, occlude: true, reverb: 1, ext: false, loud: -99, dist: 0, occ: 1, audible: 0, vx: 0, vy: 0, vz: 0 } as Req);
    r.n = 0;
    r.pos = !!pos;
    r.x = pos ? pos.x : 0;
    r.y = pos ? pos.y : 0;
    r.z = pos ? pos.z : 0;
    r.kind = kind;
    r.bus = kind === 2 ? 2 : bus === 2 ? 0 : bus;
    r.prio = 1;
    r.cutoff = 20000;
    r.at = this.clock();
    r.rolloff = 1;
    r.ref = 1;
    r.occlude = true;
    r.reverb = 1;
    r.ext = false;
    r.loud = -99;
    r.dist = 0;
    r.occ = 1;
    r.audible = 0;
    return r;
  }

  private release(r: Req): void {
    for (let i = 0; i < r.n; i++) (r.layers[i] as { buffer: AudioBuffer | null }).buffer = null;
    r.n = 0;
    if (this.reqPool.length < 256) this.reqPool.push(r);
  }

  private enqueue(r: Req): void {
    if (r.n === 0) {
      this.release(r);
      return;
    }
    if (r.at > this.clock() + 0.005) {
      this.delayed.push(r);
      return;
    }
    if (this.pending.length > 256) {
      this.st.dropped++;
      this.release(r);
      return;
    }
    this.pending.push(r);
    if (!this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(this.flushBound);
    }
  }

  private promoteDelayed(now: number): void {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const r = this.delayed[i];
      if (r.at <= now + 0.005) {
        this.delayed.splice(i, 1);
        if (this.running) this.pending.push(r);
        else this.release(r);
      }
    }
  }

  /** Start the most audible pending voices (called from a microtask and from update()). */
  private flush(): void {
    this.flushQueued = false;
    const c = this.ctx;
    const pend = this.pending;
    if (!c || !pend.length) return;
    try {
      const now = this.clock();
      if (now - this.rayReset > 0.016) {
        this.rayBudget = RAY_BUDGET;
        this.rayReset = now;
      }
      if (!this.running) {
        for (const r of pend) this.release(r);
        pend.length = 0;
        return;
      }
      // Pass 1: cheap audibility (level × distance law).
      for (const r of pend) {
        let g = 0;
        for (let i = 0; i < r.n; i++) g = Math.max(g, r.layers[i].gain);
        if (r.pos) {
          const dx = r.x - this.lis.x,
            dy = r.y - this.lis.y,
            dz = r.z - this.lis.z;
          r.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          r.audible = g * M.inverseDistanceGain(r.dist, r.ref, r.rolloff) * r.prio;
        } else {
          r.dist = 0;
          r.audible = g * r.prio * 1.5;
        }
        r.vx = r.x;
        r.vy = r.y;
        r.vz = r.z;
        r.occ = 1;
      }
      pend.sort((a, b) => b.audible - a.audible);
      // Pass 2: occlusion for the candidates that may actually start.
      const n = Math.min(pend.length, MAX_NEW_PER_FLUSH);
      for (let i = 0; i < n; i++) {
        const r = pend[i];
        if (r.pos && r.occlude && r.audible > INAUDIBLE) {
          r.occ = this.occlusion(r);
          r.audible *= M.occlusionGain(r.occ);
        }
      }
      if (n > 1) {
        const head = pend.slice(0, n).sort((a, b) => b.audible - a.audible);
        for (let i = 0; i < n; i++) pend[i] = head[i];
      }
      for (let i = 0; i < pend.length; i++) {
        const r = pend[i];
        if (i >= n || r.audible < INAUDIBLE) {
          this.st.dropped++;
          this.release(r);
          continue;
        }
        const ch = this.allocate(r);
        if (ch) {
          this.startVoice(ch, r);
          this.st.played++;
        } else this.st.dropped++;
        this.release(r);
      }
    } catch (err) {
      this.fail("flush", err);
      for (const r of pend) this.release(r);
    }
    pend.length = 0;
  }

  /** Free channel of the right pool, or steal the least audible one if the new voice wins. */
  private allocate(r: Req): Channel | null {
    const c = this.ctx!;
    const t = c.currentTime;
    let free: Channel | null = null;
    let freeHrtf: Channel | null = null;
    let victim: Channel | null = null;
    let vp = Infinity;
    for (const ch of this.channels) {
      if (ch.kind !== r.kind) continue;
      if (ch.busyUntil <= t) {
        if (ch.hrtf) freeHrtf ??= ch;
        else free ??= ch;
        continue;
      }
      const left = 1 - (t - ch.start) / Math.max(ch.dur, 1e-3);
      const p = ch.prio * clamp(left, 0, 1) ** 2;
      if (p < vp) {
        vp = p;
        victim = ch;
      }
    }
    // Loud / close voices get the HRTF channels; quiet ones use equal-power when possible.
    if (freeHrtf && (r.audible > 0.02 || !free)) return freeHrtf;
    if (free) return free;
    if (freeHrtf) return freeHrtf;
    if (victim && vp < r.audible) {
      this.st.stolen++;
      return victim;
    }
    return null;
  }

  private startVoice(ch: Channel, r: Req): void {
    const c = this.ctx!;
    const now = c.currentTime;
    let when = now + (r.pos ? Math.min(r.dist / SPEED_OF_SOUND, 0.12) : 0);
    if (ch.busyUntil > now) {
      // Steal: 12 ms fade of the old voice, then start the new one.
      holdParam(ch.input.gain, now);
      ch.input.gain.linearRampToValueAtTime(0, now + 0.012);
      for (const s of ch.sources) {
        try {
          s.stop(now + 0.014);
        } catch {
          /* already stopped */
        }
      }
      when = Math.max(when, now + 0.015);
    } else ch.input.gain.cancelScheduledValues(now);
    ch.sources.length = 0;
    let gain = r.pos ? M.occlusionGain(r.occ) : 1;
    let cut = r.cutoff;
    if (r.pos) cut = Math.min(cut, M.airCutoff(r.dist), M.occlusionCutoff(r.occ));
    if (r.ext) {
      gain *= this.extGain;
      cut = Math.min(cut, this.extCutoff * 1.5);
    }
    ch.input.gain.setValueAtTime(gain, when);
    ch.filter.frequency.setValueAtTime(clamp(cut, 60, 20000), when);
    if (ch.panner) {
      this.setPannerPos(ch.panner, r.vx, r.vy, r.vz, when);
      ch.panner.refDistance = r.ref;
      ch.panner.rolloffFactor = r.rolloff;
    }
    // Dry routing (sfx vs ambience bus).
    if (ch.outs.length > 1) {
      ch.outs[0].gain.setValueAtTime(r.bus === 1 ? 0 : 1, when);
      ch.outs[1].gain.setValueAtTime(r.bus === 1 ? 1 : 0, when);
    }
    if (ch.sends.length) {
      const room = r.pos ? this.roomAt(r.x, r.y, r.z) : this.lisRoom;
      const w = this.sendWeights(room, r.pos ? r.occ : 1, this.tmpSend);
      for (let i = 0; i < ch.sends.length; i++) ch.sends[i].gain.setValueAtTime(w[i] * r.reverb, when);
    }
    let end = when;
    for (let i = 0; i < r.n; i++) {
      const L = r.layers[i];
      const src = c.createBufferSource();
      src.buffer = L.buffer;
      src.playbackRate.value = clamp(L.rate, 0.25, 4);
      if (Math.abs(L.gain - 1) > 1e-4) {
        const g = c.createGain();
        g.gain.value = L.gain;
        src.connect(g);
        g.connect(ch.input);
        this.srcGain.set(src, g);
      } else src.connect(ch.input);
      src.onended = this.onEnded;
      src.start(when + L.offset);
      ch.sources.push(src);
      end = Math.max(end, when + L.offset + L.buffer.duration / src.playbackRate.value);
    }
    ch.start = when;
    ch.dur = Math.max(0.01, end - when);
    ch.busyUntil = end + 0.03;
    ch.prio = r.audible;
  }

  // ============================================================================ propagation

  private roomAt(x: number, y: number, z: number): RoomAcoustics | null {
    const fn = this.roomFn;
    if (!fn) return null;
    try {
      this.va.x = x;
      this.va.y = y;
      this.va.z = z;
      const r = fn(this.va);
      return r && Number.isFinite(r.rt60) && Number.isFinite(r.wet) ? r : null;
    } catch {
      return null;
    }
  }

  private updateListenerRoom(force = false): void {
    const r = this.roomAt(this.lis.x, this.lis.y, this.lis.z);
    if (!r && !force && this.lisRoom) return; // inside a wall / doorway: keep the last room
    const room = r ?? this.lisRoom ?? DEFAULT_ROOM;
    if (!force && room === this.lisRoom) return;
    if (!force && this.lisRoom && room.id === this.lisRoom.id && room.rt60 === this.lisRoom.rt60) {
      this.lisRoom = room;
      return;
    }
    this.lisRoom = room;
    irWeights(room, this.lisW);
    const c = this.ctx;
    if (!c) return;
    // Convolver returns crossfade with the listener's room (you hear the room you are in).
    for (let i = 0; i < this.revRet.length; i++) this.revRet[i].gain.setTargetAtTime(0.6 + 0.4 * this.lisW[i], c.currentTime, force ? 0.01 : 0.35);
  }

  /** Reverb send weights for a source room heard from the listener's room. */
  private sendWeights(src: RoomAcoustics | null, occ: number, out: number[]): number[] {
    const lis = this.lisRoom ?? DEFAULT_ROOM;
    const s = src ?? lis;
    const same = s.id === lis.id;
    irWeights(s, this.tmpW);
    const leak = same ? 1 : 0.35 + 0.65 * occ;
    const wet = clamp(s.wet, 0, 1);
    for (let i = 0; i < 3; i++) out[i] = wet * this.tmpW[i] * leak * WET_SCALE;
    if (!same) {
      // Sound leaking into the listener's room excites its reverb too.
      irWeights(lis, this.tmpW2);
      const lw = clamp(lis.wet, 0, 1);
      for (let i = 0; i < 3; i++) out[i] += lw * this.tmpW2[i] * occ * 0.5 * WET_SCALE;
    }
    return out;
  }

  /**
   * Occlusion (0..1) of a source at the listener, via the integrator's hook: the direct line,
   * else the best listener→portal→source path (diffraction loss × path-length ratio). When a
   * portal path wins, the voice is placed at a virtual position in the portal's direction so
   * the sound appears to come through the doorway. Cached on a 0.3 m grid for 0.3 s.
   */
  private occlusion(r: Req): number {
    const fn = this.occFn;
    if (!fn) return 1;
    const now = this.clock();
    const key = qkey(r.x, r.y, r.z, this.lis.x, this.lis.y, this.lis.z);
    const cached = this.occCache.get(key);
    if (cached && now - cached.t < 0.3) {
      r.vx = cached.vx;
      r.vy = cached.vy;
      r.vz = cached.vz;
      return cached.occ;
    }
    if (this.rayBudget <= 0) return cached ? cached.occ : 1;
    const L = this.lis;
    const S = { x: r.x, y: r.y, z: r.z };
    const direct = this.ray(L, S);
    let best = direct;
    let vx = r.x,
      vy = r.y,
      vz = r.z;
    if (direct < 0.85 && this.portals.length && this.rayBudget >= 2) {
      const dDir = Math.max(0.1, r.dist);
      const cands: Array<{ p: Vec3; len: number }> = [];
      for (const p of this.portals) {
        const a = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z);
        const b = Math.hypot(S.x - p.x, S.y - p.y, S.z - p.z);
        const len = a + b;
        if (len < dDir * 2.2 + 3) cands.push({ p, len });
      }
      cands.sort((u, v) => u.len - v.len);
      for (let i = 0; i < cands.length && i < 3 && this.rayBudget >= 2; i++) {
        const { p, len } = cands[i];
        const a = this.ray(L, p);
        if (a < 0.05) continue;
        const b = this.ray(p, S);
        const ax = p.x - L.x,
          ay = p.y - L.y,
          az = p.z - L.z;
        const bx = S.x - p.x,
          by = S.y - p.y,
          bz = S.z - p.z;
        const la = Math.hypot(ax, ay, az) || 1;
        const lb = Math.hypot(bx, by, bz) || 1;
        const cos = (ax * bx + ay * by + az * bz) / (la * lb);
        const val = a * b * M.diffraction(cos) * Math.min(1, dDir / len);
        if (val > best) {
          best = val;
          vx = L.x + (ax / la) * len;
          vy = L.y + (ay / la) * len;
          vz = L.z + (az / la) * len;
        }
      }
    }
    r.vx = vx;
    r.vy = vy;
    r.vz = vz;
    this.occCache.set(key, { occ: best, t: now, vx, vy, vz });
    return best;
  }

  private ray(a: Vec3, b: Vec3): number {
    const fn = this.occFn;
    if (!fn) return 1;
    this.rayBudget--;
    this.st.rays++;
    try {
      this.va.x = a.x;
      this.va.y = a.y;
      this.va.z = a.z;
      this.vb.x = b.x;
      this.vb.y = b.y;
      this.vb.z = b.z;
      const v = fn(this.va, this.vb);
      return Number.isFinite(v) ? clamp(v, 0, 1) : 1;
    } catch {
      return 1;
    }
  }

  // ============================================================================ loops

  /** (Re)decide which loops are real, refresh their occlusion / room / gains. */
  private updateLoops(now: number, quick: boolean): void {
    if (!this.running) return;
    const list = [...this.loops];
    for (const lv of list) {
      if (lv.state === 2) continue;
      let a = this.loopGain(lv);
      if (lv.positional) {
        const d = Math.hypot(lv.x - this.lis.x, lv.y - this.lis.y, lv.z - this.lis.z);
        a *= M.inverseDistanceGain(d, 1, 1);
        if (!quick && now - lv.occT > 0.3 + 0.2 * this.rand()) {
          lv.occT = now;
          const req = this.newReq(lv, 0, 0);
          req.dist = d;
          lv.occ = this.occFn ? this.occlusion(req) : 1;
          this.release(req);
        }
        a *= M.occlusionGain(lv.occ);
      } else a *= 4; // beds are always wanted
      lv.audible = a;
    }
    list.sort((p, q) => q.audible - p.audible);
    let real = 0;
    for (const lv of list) {
      if (lv.state === 2) continue;
      const want = real < MAX_REAL_LOOPS && lv.audible > INAUDIBLE * 0.5;
      if (want) {
        real++;
        if (lv.state === 0) this.realize(lv, this.wasRunning ? 0.25 : 1.5);
        else if (!quick) this.refreshLoop(lv);
      } else if (lv.state === 1) this.virtualize(lv);
    }
  }

  private loopGain(lv: LoopVoice): number {
    const mains = lv.def.mains && !this.powered ? 0 : 1;
    return dbToGain(lv.def.level) * lv.gain * lv.extra * mains * (lv.ext ? this.extGain : 1);
  }

  private realize(lv: LoopVoice, fade: number): void {
    const c = this.ctx;
    if (!c) return;
    try {
      const src = c.createBufferSource();
      src.buffer = lv.buffer;
      src.loop = true;
      src.playbackRate.value = lv.pitch;
      const input = c.createGain();
      input.gain.value = 0;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.5;
      src.connect(input);
      input.connect(filter);
      let dry: AudioNode = filter;
      lv.sends = [];
      if (lv.positional) {
        const p = c.createPanner();
        p.panningModel = this.hrtfLoops ? "HRTF" : "equalpower";
        p.distanceModel = "inverse";
        p.refDistance = 1;
        p.rolloffFactor = 1;
        p.maxDistance = 10000;
        filter.connect(p);
        dry = p;
        lv.panner = p;
        this.setPannerPos(p, lv.x, lv.y, lv.z);
        for (const r of this.revIn) {
          const s = c.createGain();
          s.gain.value = 0;
          filter.connect(s);
          s.connect(r);
          lv.sends.push(s);
        }
      }
      const out = c.createGain();
      dry.connect(out);
      out.connect(this.buses[BUS_OF[lv.def.bus] ?? 0]);
      lv.outs = [out];
      lv.src = src;
      lv.input = input;
      lv.filter = filter;
      lv.state = 1;
      // Continue where the (virtual) loop would be, so re-realised loops don't restart.
      const off = (((this.clock() - lv.born) * lv.pitch) % lv.buffer.duration + lv.buffer.duration) % lv.buffer.duration;
      src.start(c.currentTime, off);
      this.refreshLoop(lv);
      this.applyLoopGain(lv, fade);
    } catch (err) {
      this.fail("loop realize", err);
    }
  }

  private refreshLoop(lv: LoopVoice): void {
    const c = this.ctx;
    if (!c || lv.state !== 1 || !lv.filter) return;
    const t = c.currentTime;
    let cut = 20000;
    if (lv.positional) {
      const d = Math.hypot(lv.x - this.lis.x, lv.y - this.lis.y, lv.z - this.lis.z);
      cut = Math.min(M.airCutoff(d), M.occlusionCutoff(lv.occ));
      if (lv.sends.length) {
        const w = this.sendWeights(this.roomAt(lv.x, lv.y, lv.z), lv.occ, this.tmpSend);
        for (let i = 0; i < lv.sends.length; i++) lv.sends[i].gain.setTargetAtTime(w[i], t, 0.2);
      }
    }
    if (lv.ext) cut = Math.min(cut, this.extCutoff);
    lv.filter.frequency.setTargetAtTime(clamp(cut, 60, 20000), t, 0.15);
    this.applyLoopGain(lv, 0.15);
  }

  /** @internal */
  applyLoopGain(lv: LoopVoice, tau: number): void {
    const c = this.ctx;
    if (!c || lv.state !== 1 || !lv.input) return;
    const occ = lv.positional ? M.occlusionGain(lv.occ) : 1;
    lv.input.gain.setTargetAtTime(this.loopGain(lv) * occ, c.currentTime, Math.max(0.01, tau / 3));
  }

  /** @internal */
  applyLoopPitch(lv: LoopVoice): void {
    const c = this.ctx;
    if (!c || lv.state !== 1 || !lv.src) return;
    lv.src.playbackRate.setTargetAtTime(lv.pitch, c.currentTime, 0.05);
  }

  private virtualize(lv: LoopVoice): void {
    this.teardownLoop(lv, 0.3);
    lv.state = 0;
  }

  /** @internal */
  stopLoop(lv: LoopVoice, fade: number): void {
    if (lv.state === 1) this.teardownLoop(lv, fade);
    lv.state = 2;
    this.loops.delete(lv);
  }

  private teardownLoop(lv: LoopVoice, fade: number): void {
    const c = this.ctx;
    const src = lv.src;
    const nodes: AudioNode[] = [lv.input, lv.filter, lv.panner, ...lv.outs, ...lv.sends].filter(Boolean) as AudioNode[];
    lv.src = null;
    lv.input = null;
    lv.filter = null;
    lv.panner = null;
    lv.outs = [];
    lv.sends = [];
    if (!c || !src) return;
    const t = c.currentTime;
    const g = nodes[0] as GainNode | undefined;
    try {
      if (g && g.gain) {
        holdParam(g.gain, t);
        g.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fade));
      }
      src.onended = () => {
        try {
          src.disconnect();
          for (const n of nodes) n.disconnect();
        } catch {
          /* ignore */
        }
      };
      src.stop(t + Math.max(0.006, fade) + 0.01);
    } catch {
      /* ignore */
    }
  }

  // ============================================================================ ambience

  private startAmbience(): void {
    if (this.city || this.disabled || !this.ambienceOn) return;
    const city = this.loop("amb.city", null, { gain: 1 });
    const wind = this.loop("amb.wind", null, { gain: 1 });
    if (city instanceof LoopVoice) {
      city.ext = true;
      this.city = city;
    }
    if (wind instanceof LoopVoice) {
      wind.ext = true;
      wind.extra = 0.04;
      this.windBed = wind;
    }
    this.nextHorn = this.clock() + 12 + 20 * this.rand();
  }

  private updateAmbience(now: number, dt: number): void {
    const k = 1 - Math.exp(-dt / 1.5);
    this.wind += (this.windTarget - this.wind) * k;
    const outdoor = !!this.lisRoom && (this.lisRoom.id === "balcony" || this.lisRoom.rt60 < 0.15);
    const ex = Math.max(this.wind, outdoor ? 1 : 0);
    const cut = 350 * Math.pow(8000 / 350, ex);
    const g = 0.45 + 0.55 * ex;
    const changed = Math.abs(cut - this.extCutoff) > this.extCutoff * 0.02 || Math.abs(g - this.extGain) > 0.005;
    this.extCutoff = cut;
    this.extGain = g;
    if (this.windBed) this.windBed.extra = 0.04 + 0.96 * ex;
    if (changed) {
      if (this.city) this.refreshLoop(this.city);
      if (this.windBed) this.refreshLoop(this.windBed);
    }
    if (now > this.nextHorn) {
      this.nextHorn = now + 18 + 50 * this.rand();
      const L = this.tmpLayers;
      L.length = 0;
      L.push({ id: "amb.horn", db: -30 + 8 * ex, rate: 0.9 + 0.2 * this.rand() });
      this.playLayers(L, null, 1, { ext: true, reverb: 0 });
    }
  }

  private addWindowWind(pos: Vec3): void {
    for (const w of this.windowWind) if (Math.hypot(w.x - pos.x, w.z - pos.z) < 1.2) return;
    if (this.windowWind.length >= 4) return;
    const h = this.loop("amb.wind", pos, { gain: 0.5, pitch: 0.9 + 0.25 * this.rand() });
    if (h instanceof LoopVoice) this.windowWind.push(h);
  }

  private buzzAt(p: Vec3, seconds: number, db: number): void {
    const k = this.posKey(p, 0.5);
    const now = this.clock();
    const b = this.buzz.get(k);
    if (b) {
      b.until = Math.max(b.until, now + seconds);
      return;
    }
    const h = this.loop("elec.buzz", p, { gain: dbToGain(db + 22) });
    if (h instanceof LoopVoice) this.buzz.set(k, { lv: h, until: now + seconds });
  }

  private setPowered(on: boolean): void {
    if (this.powered === on) return;
    this.powered = on;
    for (const lv of this.loops) if (lv.def.mains) this.applyLoopGain(lv, on ? 0.6 : 0.4);
  }

  private onRunning(): void {
    if (!this.running) return;
    const first = !this.wasRunning;
    this.wasRunning = true;
    if (first) this.updateLoops(this.clock(), true);
  }

  // ============================================================================ memory of the scene

  private noteMaterial(p: Vec3, prof: SoundProfile): void {
    if (!finite(p)) return;
    if (this.recent.length >= 24) this.recent.shift();
    this.recent.push({ x: p.x, y: p.y, z: p.z, p: prof, t: this.clock() });
  }

  private recentProfile(p: Vec3): SoundProfile | null {
    if (!finite(p)) return null;
    const now = this.clock();
    let best: SoundProfile | null = null;
    let bd = 1.5;
    for (const r of this.recent) {
      if (now - r.t > 1) continue;
      const d = Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z);
      if (d < bd) {
        bd = d;
        best = r.p;
      }
    }
    return best;
  }

  /** Debris on the floor: later footsteps here crunch. */
  private addPatch(p: Vec3, n: number): void {
    const r = clamp(0.5 + 0.25 * Math.log10(1 + n), 0.5, 1.6);
    for (const q of this.patches) {
      if (Math.hypot(q.x - p.x, q.z - p.z) < q.r * 0.7) {
        q.r = Math.min(2, Math.max(q.r, r) + 0.1);
        return;
      }
    }
    if (this.patches.length >= 48) this.patches.shift();
    this.patches.push({ x: p.x, y: p.y, z: p.z, r });
  }

  private nearPatch(p: Vec3): boolean {
    for (const q of this.patches) if (p.y <= q.y + 0.6 && p.y >= q.y - 3.2 && Math.hypot(q.x - p.x, q.z - p.z) < q.r) return true;
    return false;
  }

  // ============================================================================ helpers

  private applyListener(): void {
    const c = this.ctx;
    if (!c) return;
    const L = c.listener as AudioListener & { setPosition?: (x: number, y: number, z: number) => void; setOrientation?: (a: number, b: number, c: number, d: number, e: number, f: number) => void };
    const p = this.lis,
      f = this.lisF,
      u = this.lisU;
    // Babylon is left-handed (+z forward); Web Audio is right-handed (−z forward): negate z.
    try {
      if (L.positionX) {
        L.positionX.value = p.x;
        L.positionY.value = p.y;
        L.positionZ.value = -p.z;
        L.forwardX.value = f.x;
        L.forwardY.value = f.y;
        L.forwardZ.value = -f.z;
        L.upX.value = u.x;
        L.upY.value = u.y;
        L.upZ.value = -u.z;
      } else {
        L.setPosition?.(p.x, p.y, -p.z);
        L.setOrientation?.(f.x, f.y, -f.z, u.x, u.y, -u.z);
      }
    } catch {
      /* ignore */
    }
  }

  /** @internal Set a panner position (Babylon coordinates). */
  setPannerPos(p: PannerNode, x: number, y: number, z: number, when?: number): void {
    try {
      if (p.positionX) {
        if (when !== undefined) {
          p.positionX.setValueAtTime(x, when);
          p.positionY.setValueAtTime(y, when);
          p.positionZ.setValueAtTime(-z, when);
        } else {
          p.positionX.value = x;
          p.positionY.value = y;
          p.positionZ.value = -z;
        }
      } else (p as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(x, y, -z);
    } catch {
      /* ignore */
    }
  }

  private clock(): number {
    return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  }

  private readonly rand = (): number => this.rng.next();

  private jitter(amount: number): number {
    return 1 + amount * (this.rng.next() * 2 - 1);
  }

  private posKey(p: Vec3, q: number): string {
    return `${Math.round(p.x / q)},${Math.round(p.y / q)},${Math.round(p.z / q)}`;
  }

  private warnOnce(id: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    if (this.bank.size) console.warn(`audio: unknown sound id '${id}'`);
  }

  private failures = 0;
  private fail(where: string, err: unknown): void {
    if (this.failures++ < 5) console.error(`audio: ${where} failed`, err);
  }
}

/** Freeze an AudioParam's current value at time t (cancelAndHoldAtTime fallback). */
function holdParam(p: AudioParam, t: number): void {
  const q = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof q.cancelAndHoldAtTime === "function") q.cancelAndHoldAtTime(t);
  else {
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
}

/** Numeric cache key for a (source, listener) pair quantised to 0.3 m. */
function qkey(x: number, y: number, z: number, lx: number, ly: number, lz: number): number {
  const q = (v: number) => Math.round(v / 0.3) & 0x3ff;
  let h = q(x) | (q(y) << 10) | (q(z) << 20);
  h = Math.imul(h ^ (q(lx) * 73856093), 0x9e3779b1) ^ (q(ly) * 19349663) ^ (q(lz) * 83492791);
  return h >>> 0;
}

/**
 * Weighted loudness gain for a decoded sample so it matches the bank's reference level.
 * Analyses at most 4 s of the first channel.
 */
export function sampleNormGain(b: AudioBuffer): number {
  try {
    const ch = b.getChannelData(0);
    const n = Math.min(ch.length, Math.round(b.sampleRate * 4));
    const w = new Biquad().highpass(b.sampleRate, 200, 0.6).run(ch.slice(0, n));
    const loud = maxWindowRms(w, b.sampleRate, 0.05);
    let pk = 0;
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[i]));
    if (!(loud > 0) || !(pk > 0)) return 0;
    return Math.min(dbToGain(NORM_ONESHOT_DB) / loud, dbToGain(-1) / pk);
  } catch {
    return 0;
  }
}

/**
 * Create the audio system: generates the procedural bank (workers / time-sliced, reporting
 * progress), subscribes to gameplay events and starts loading optional CC0 samples in the
 * background. Never throws; without Web Audio it resolves to a silent no-op system.
 */
export async function createAudio(opts: CreateAudioOpts): Promise<Audio> {
  let bank = opts.bank;
  const hasWebAudio =
    typeof globalThis !== "undefined" &&
    (typeof (globalThis as { AudioContext?: unknown }).AudioContext !== "undefined" || typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined" || !!opts.context);
  if (!bank) {
    try {
      bank = hasWebAudio ? await SoundBank.generate({ sr: 48000, budgetMs: opts.budgetMs, onProgress: opts.onProgress, workers: opts.workers }) : new SoundBank(48000);
    } catch (err) {
      console.warn("audio: bank generation failed", err);
      bank = new SoundBank(48000);
    }
  }
  const audio = new Audio({ events: opts.events, settings: opts.settings, bank, maxVoices: opts.maxVoices, seed: opts.seed, ambience: opts.ambience, hrtf: opts.hrtf });
  if (opts.context) audio.attachContext(opts.context);
  else audio.installGestureResume();
  if (opts.samples !== false && hasWebAudio && bank.size) {
    try {
      const OAC = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
      if (OAC) {
        const dec = new OAC(1, 1, 48000);
        const base = opts.samplesBase ?? "assets/sounds/";
        void audio.samples.load(base, (d) => dec.decodeAudioData(d), sampleNormGain);
      }
    } catch {
      /* samples are optional */
    }
  }
  opts.onProgress?.(1);
  return audio;
}
