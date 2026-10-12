// Noita 3D audio: fully procedural (zero assets) Web Audio engine.
//
// Graph:
//   voice(vol) ─[lowpass → stereo pan when positional]─► sfx bus ─┐
//            └─ send ─► sfxRev ─┐                                ├─► master ─► limiter ─► out
//   ambience bed ───────────────┼─────────────► music bus ───────┤
//            └─ send ─► ambRev ─┴─► cave reverb (4-line FDN) ────┘
//
// Every public method is a safe no-op until unlock() has created a running AudioContext (and
// stays a no-op forever in Node / when Web Audio is missing). Nothing here ever throws.

import { AmbienceBed, BEDS, normalizeAmbienceId } from './ambience';
import { LOOP_SPECS, buildLoop, type LoopRecipe } from './loops';
import { SOUND_SPECS, renderSound } from './sfx';
import { spatialize, type ListenerPose } from './spatial';
import { CaveReverb, Kit, makeCurves, makeNoiseBank } from './synth';
import type { AmbienceId, AudioStats, LoopKey, PlayOpts, SoundName } from './types';
import { VoicePool, type VoiceRecord } from './voicePolicy';

export type { AmbienceId, AudioStats, LoopKey, PlayOpts, SoundName } from './types';
export { SOUND_NAMES, SOUND_SPECS } from './sfx';
export { LOOP_KEYS } from './loops';
export { MAX_AUDIBLE_DISTANCE } from './spatial';

/** Below this effective gain a positional play is culled before any node is created. */
const CULL_GAIN = 0.004;
/** Scheduling lookahead so envelopes always start cleanly in the future. */
const LOOKAHEAD = 0.012;
const AMBIENCE_FADE = 2.5;
/** A loop not refreshed by setLoop for this long fades out on its own. */
const LOOP_STALE = 0.3;
/** A silent loop is torn down after this long. */
const LOOP_IDLE_TEARDOWN = 2;

interface VoicePayload {
  vol: GainNode;
  tail: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  sfxRev: GainNode;
  ambRev: GainNode;
  reverb: CaveReverb;
  kit: Kit;
  ambKit: Kit;
}

interface LoopVoice {
  out: GainNode;
  lp: BiquadFilterNode;
  pan: StereoPannerNode | null;
  send: GainNode;
  sources: AudioScheduledSourceNode[];
  recipe: LoopRecipe;
  lastGain: number;
  lastPan: number;
  lastCutoff: number;
  lastIntensity: number;
  idle: number;
}

interface LoopState {
  target: number;
  lastSet: number;
  positional: boolean;
  x: number;
  y: number;
  z: number;
  voice: LoopVoice | null;
}

type CtxCtor = new (opts?: AudioContextOptions) => AudioContext;

function findAudioContext(): CtxCtor | null {
  const g = globalThis as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function safeDisconnect(nodes: readonly AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function safeStop(sources: readonly AudioScheduledSourceNode[], when: number): void {
  for (const s of sources) {
    try {
      s.stop(when);
    } catch {
      /* not started / already stopped (older Safari throws on double stop) */
    }
  }
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private g: Graph | null = null;
  private readonly pool = new VoicePool<VoicePayload>();
  private readonly zombies: { at: number; nodes: AudioNode[] }[] = [];
  private readonly listener: ListenerPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly loops = new Map<LoopKey, LoopState>();
  private readonly vols = { master: 0.8, sfx: 1, music: 0.7 };
  private ambWanted: AmbienceId = 'none';
  private bed: AmbienceBed | null = null;
  private readonly dyingBeds: AmbienceBed[] = [];
  /** Seconds accumulated from update(dt); used for loop staleness independent of the audio clock. */
  private clock = 0;
  private readonly _stats: AudioStats = { voices: 0, played: 0, dropped: 0, merged: 0, culled: 0 };

  constructor() {
    // Intentionally empty: no AudioContext until unlock() (autoplay policies, Node tests).
  }

  /** True once an AudioContext exists, is running and the graph is built. */
  get ready(): boolean {
    return this.g !== null && this.ctx !== null && this.ctx.state === 'running';
  }

  get stats(): AudioStats {
    this._stats.voices = this.pool.size;
    return this._stats;
  }

  /** Create/resume the AudioContext; must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (this.ctx && this.ctx.state === 'closed') this.dropContext();
      if (!this.ctx) {
        const Ctor = findAudioContext();
        if (!Ctor) return;
        let ctx: AudioContext;
        try {
          ctx = new Ctor({ latencyHint: 'interactive' });
        } catch {
          ctx = new Ctor();
        }
        try {
          this.g = this.buildGraph(ctx);
        } catch {
          this.g = null;
          try {
            void ctx.close();
          } catch {
            /* ignore */
          }
          return;
        }
        this.ctx = ctx;
        try {
          ctx.addEventListener('statechange', () => this.onStateChange());
        } catch {
          /* ignore */
        }
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running') {
        this.primeOutput(ctx);
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(
            () => this.onStateChange(),
            () => {
              /* still blocked; a later gesture will retry */
            },
          );
        }
      }
      this.onStateChange();
    } catch {
      /* never throw from audio */
    }
  }

  /** Listener pose in world units. yaw radians around +Y (0 = looking toward -Z), pitch radians. */
  setListener(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const l = this.listener;
    if (finite(x)) l.x = x;
    if (finite(y)) l.y = y;
    if (finite(z)) l.z = z;
    if (finite(yaw)) l.yaw = yaw;
    if (finite(pitch)) l.pitch = pitch;
  }

  /** Fire-and-forget SFX. Positional when x,y,z are all given. */
  play(name: SoundName, opts?: PlayOpts): void {
    if (!this.ready) return;
    const g = this.g as Graph;
    const spec = SOUND_SPECS[name];
    if (!spec) return;
    try {
      const ctx = g.ctx;
      const now = ctx.currentTime;
      this.reap(now);

      const volIn = opts?.volume;
      let level = spec.vol * (finite(volIn) ? clamp(volIn, 0, 4) : 1);
      if (level <= 0) return;

      // Distance culling happens before anything is allocated.
      let positional = false;
      let pan = 0;
      let cutoff = 20000;
      let wet = 1;
      if (opts && finite(opts.x) && finite(opts.y) && finite(opts.z)) {
        const sp = spatialize(this.listener, opts.x, opts.y, opts.z, spec.range);
        if (sp.gain * level < CULL_GAIN) {
          this._stats.culled++;
          return;
        }
        positional = true;
        level *= sp.gain;
        pan = sp.pan;
        cutoff = sp.cutoff;
        wet = sp.wet;
      }

      const adm = this.pool.admit(name, spec.pri, spec.max, now, spec.poly);
      if (adm.kind === 'drop') {
        this._stats.dropped++;
        return;
      }
      if (adm.kind === 'merge') {
        this.mergeInto(adm.into, level, spec.boost, now);
        this._stats.merged++;
        return;
      }
      if (adm.steal) {
        this.kill(adm.steal, now);
        this.pool.remove(adm.steal);
      }

      // Build the voice output chain.
      const vol = ctx.createGain();
      vol.gain.value = level;
      const tail: AudioNode[] = [vol];
      let out: AudioNode = vol;
      if (positional) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = -3;
        lp.frequency.value = cutoff;
        out.connect(lp);
        out = lp;
        tail.push(lp);
        if (typeof ctx.createStereoPanner === 'function') {
          const p = ctx.createStereoPanner();
          p.pan.value = pan;
          out.connect(p);
          out = p;
          tail.push(p);
        }
      }
      out.connect(g.sfx);
      if (spec.wet > 0) {
        const send = ctx.createGain();
        send.gain.value = Math.min(1.5, spec.wet * wet);
        out.connect(send);
        send.connect(g.sfxRev);
        tail.push(send);
      }

      const pitchIn = opts?.pitch;
      const pitch = (finite(pitchIn) ? clamp(pitchIn, 0.1, 8) : 1) * (1 + (Math.random() * 2 - 1) * spec.vary);
      // Tiny start jitter for common sounds so stacked hits don't phase-lock into one click.
      const t0 = now + LOOKAHEAD + (spec.pri < 5 ? Math.random() * 0.006 : 0);
      const sources = g.kit.begin(vol, t0, pitch);
      renderSound(g.kit, name);
      const end = t0 + g.kit.end + 0.05;
      this.pool.commit(name, spec.pri, now, end, level, { vol, tail, sources });
      this._stats.played++;
    } catch {
      /* never let audio crash the game */
    }
  }

  /**
   * Continuous loop intensity (0 = silent), e.g. 'fire' = how much fire is near the player.
   * One instance per key: pass the aggregate intensity and the dominant (nearest/loudest) source
   * position, or omit the position for a non-positional bed. Call every frame while active; a key
   * not refreshed for ~0.3 s fades out by itself and is torn down after ~2 s of silence.
   */
  setLoop(key: LoopKey, intensity: number, x?: number, y?: number, z?: number): void {
    if (!LOOP_SPECS[key]) return;
    let st = this.loops.get(key);
    if (!st) {
      st = { target: 0, lastSet: this.clock, positional: false, x: 0, y: 0, z: 0, voice: null };
      this.loops.set(key, st);
    }
    st.target = finite(intensity) ? clamp(intensity, 0, 1) : 0;
    st.lastSet = this.clock;
    st.positional = finite(x) && finite(y) && finite(z);
    if (st.positional) {
      st.x = x as number;
      st.y = y as number;
      st.z = z as number;
    }
  }

  /** Biome ambience / music bed with crossfade. Unknown ids behave like 'none'. */
  setAmbience(id: string): void {
    const want = normalizeAmbienceId(typeof id === 'string' ? id : 'none');
    if (want === this.ambWanted) return;
    this.ambWanted = want;
    if (this.ready) {
      try {
        this.applyAmbience();
      } catch {
        /* ignore */
      }
    }
  }

  setVolumes(master: number, sfx: number, music: number): void {
    if (finite(master)) this.vols.master = clamp(master, 0, 1.5);
    if (finite(sfx)) this.vols.sfx = clamp(sfx, 0, 1.5);
    if (finite(music)) this.vols.music = clamp(music, 0, 1.5);
    this.applyVolumes(0.05);
  }

  /** Call once per frame. */
  update(dt: number): void {
    this.clock += finite(dt) ? clamp(dt, 0, 0.25) : 0;
    if (!this.ready) return;
    try {
      const now = (this.ctx as AudioContext).currentTime;
      this.reap(now);
      this.updateLoops(now, finite(dt) ? clamp(dt, 0, 0.25) : 0);
      this.updateAmbience(now);
    } catch {
      /* ignore */
    }
  }

  /** The current (requested) ambience id. */
  get ambience(): AmbienceId {
    return this.ambWanted;
  }

  // ======================================================================= internals

  private buildGraph(ctx: AudioContext): Graph {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.connect(limiter);
    const sfx = ctx.createGain();
    sfx.connect(master);
    const music = ctx.createGain();
    music.connect(master);

    const reverb = new CaveReverb(ctx);
    reverb.output.connect(master);
    const sfxRev = ctx.createGain();
    sfxRev.connect(reverb.input);
    const ambRev = ctx.createGain();
    ambRev.connect(reverb.input);
    reverb.setProfile(0.75, 2600, 0.45, 0.01);

    const bank = makeNoiseBank(ctx, 2);
    const curves = makeCurves();
    const graph: Graph = {
      ctx,
      master,
      sfx,
      music,
      sfxRev,
      ambRev,
      reverb,
      kit: new Kit(ctx, bank, curves),
      ambKit: new Kit(ctx, bank, curves),
    };
    this.g = graph;
    this.applyVolumes(0);
    return graph;
  }

  /** Forget a closed context and everything built on it (next unlock() starts fresh). */
  private dropContext(): void {
    this.pool.clear();
    this.zombies.length = 0;
    for (const st of this.loops.values()) st.voice = null;
    this.bed = null;
    this.dyingBeds.length = 0;
    this.g = null;
    this.ctx = null;
  }

  /** iOS/Safari unlock trick: start a 1-sample silent buffer inside the gesture. */
  private primeOutput(ctx: AudioContext): void {
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }

  private onStateChange(): void {
    if (!this.ready) return;
    try {
      this.applyVolumes(0.02);
      if ((this.bed ? this.bed.id : 'none') !== this.ambWanted) this.applyAmbience();
    } catch {
      /* ignore */
    }
  }

  private applyVolumes(tc: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    const set = (p: AudioParam, v: number): void => {
      if (tc <= 0) p.value = v;
      else p.setTargetAtTime(v, now, tc);
    };
    set(g.master.gain, this.vols.master * 0.9);
    set(g.sfx.gain, this.vols.sfx);
    set(g.sfxRev.gain, this.vols.sfx);
    set(g.music.gain, this.vols.music);
    set(g.ambRev.gain, this.vols.music);
  }

  private mergeInto(rec: VoiceRecord<VoicePayload>, addLevel: number, maxBoost: number, now: number): void {
    const next = VoicePool.mergeLevel(rec.level, addLevel, rec.baseLevel, maxBoost);
    if (next <= rec.level + 1e-4) return;
    rec.level = next;
    try {
      rec.payload.vol.gain.setTargetAtTime(next, now, 0.008);
    } catch {
      /* ignore */
    }
  }

  /** Fast fade-out of a stolen voice (no click), disconnect shortly after. */
  private kill(rec: VoiceRecord<VoicePayload>, now: number): void {
    const p = rec.payload;
    try {
      const gp = p.vol.gain;
      gp.cancelScheduledValues(now);
      gp.setValueAtTime(gp.value, now);
      gp.linearRampToValueAtTime(0, now + 0.025);
    } catch {
      /* ignore */
    }
    safeStop(p.sources, now + 0.04);
    this.zombies.push({ at: now + 0.08, nodes: p.tail });
  }

  private reap(now: number): void {
    this.pool.reap(now, (v) => safeDisconnect(v.payload.tail));
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].at <= now) {
        safeDisconnect(this.zombies[i].nodes);
        this.zombies.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------------------- loops

  private buildLoopVoice(key: LoopKey, now: number): LoopVoice {
    const g = this.g as Graph;
    const ctx = g.ctx;
    const spec = LOOP_SPECS[key];
    const input = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = 0;
    input.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3;
    lp.frequency.value = 20000;
    out.connect(lp);
    let last: AudioNode = lp;
    let pan: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      pan = ctx.createStereoPanner();
      lp.connect(pan);
      last = pan;
    }
    last.connect(g.sfx);
    const send = ctx.createGain();
    send.gain.value = spec.wet;
    last.connect(send);
    send.connect(g.sfxRev);
    const sources = g.kit.begin(input, now, 1);
    const recipe = buildLoop(key, g.kit);
    return { out, lp, pan, send, sources, recipe, lastGain: 0, lastPan: 0, lastCutoff: 20000, lastIntensity: -1, idle: 0 };
  }

  private disposeLoopVoice(v: LoopVoice, now: number): void {
    safeStop(v.sources, now + 0.05);
    const nodes: AudioNode[] = [v.out, v.lp, v.send];
    if (v.pan) nodes.push(v.pan);
    this.zombies.push({ at: now + 0.1, nodes });
  }

  private updateLoops(now: number, dt: number): void {
    for (const [key, st] of this.loops) {
      const stale = this.clock - st.lastSet > LOOP_STALE;
      const target = stale ? 0 : st.target;
      if (!st.voice) {
        if (target <= 0.001) continue;
        st.voice = this.buildLoopVoice(key, now);
      }
      const v = st.voice;
      const spec = LOOP_SPECS[key];
      let gain = target > 0.001 ? spec.level * Math.pow(target, 0.8) : 0;
      let pan = 0;
      let cutoff = 20000;
      if (st.positional && gain > 0) {
        const sp = spatialize(this.listener, st.x, st.y, st.z, spec.range);
        gain *= sp.gain;
        pan = sp.pan;
        cutoff = sp.cutoff;
      }
      if (Math.abs(gain - v.lastGain) > 0.002 || (gain === 0 && v.lastGain !== 0)) {
        v.out.gain.setTargetAtTime(gain, now, gain > v.lastGain ? 0.05 : 0.12);
        v.lastGain = gain;
      }
      if (v.pan && Math.abs(pan - v.lastPan) > 0.01) {
        v.pan.pan.setTargetAtTime(pan, now, 0.05);
        v.lastPan = pan;
      }
      if (Math.abs(cutoff - v.lastCutoff) > v.lastCutoff * 0.03) {
        v.lp.frequency.setTargetAtTime(cutoff, now, 0.08);
        v.lastCutoff = cutoff;
      }
      if (target > 0.001 && Math.abs(target - v.lastIntensity) > 0.01) {
        v.recipe.apply(target, now);
        v.lastIntensity = target;
      }
      if (gain <= 0.0005) {
        v.idle += dt;
        if (v.idle > LOOP_IDLE_TEARDOWN) {
          this.disposeLoopVoice(v, now);
          st.voice = null;
        }
      } else {
        v.idle = 0;
      }
    }
  }

  // ----------------------------------------------------------------------- ambience

  private applyAmbience(): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (this.bed && this.bed.id === this.ambWanted) return;
    if (this.bed) {
      this.bed.fadeOut(now, AMBIENCE_FADE);
      this.dyingBeds.push(this.bed);
      this.bed = null;
    }
    // Hard cap on overlapping beds if the game flips biomes rapidly.
    while (this.dyingBeds.length > 2) {
      const b = this.dyingBeds.shift() as AmbienceBed;
      b.dispose();
    }
    if (this.ambWanted === 'none') return;
    const def = BEDS[this.ambWanted];
    const bed = new AmbienceBed(this.ambWanted, def, g.ambKit, g.music, g.ambRev, now);
    bed.fadeIn(now, AMBIENCE_FADE);
    this.bed = bed;
    g.reverb.setProfile(def.reverb.feedback, def.reverb.damp, def.reverb.wet, AMBIENCE_FADE);
  }

  private updateAmbience(now: number): void {
    if ((this.bed ? this.bed.id : 'none') !== this.ambWanted) this.applyAmbience();
    if (this.bed) this.bed.update(now);
    for (let i = this.dyingBeds.length - 1; i >= 0; i--) {
      if (now >= this.dyingBeds[i].stopAt) {
        this.dyingBeds[i].dispose();
        this.dyingBeds.splice(i, 1);
      }
    }
  }
}

/** Shared game-wide instance. */
export const audio = new AudioManager();
