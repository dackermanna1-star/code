/**
 * LAST CALL audio system: procedural Web Audio synthesis for every sound in
 * the game (no audio files).
 *
 *   one-shots --+--> [air LP] -> PannerNode(HRTF) --> sfx dry --> sfx vol --+
 *               +--> reverb send ----------------+                         |
 *   ambience  ----------------------------------|--------> amb vol/duck --+--> world LP (slow-mo) --+
 *   jukebox / combat score --> music vol --> duck --> music LP ------------|------------------------+--> master
 *                                  +--> music reverb send --+              |                             |
 *                                     convolution room reverb (1.4s) ------+    HP -> compressor -> limiter -> soft clip -> out
 *
 * The constructor subscribes to the game event bus and turns combat, physics,
 * movement and voice events into positional sounds.
 */
import * as THREE from 'three';
import { events, type GameEvents } from '../game/events';
import { ctx } from '../game/ctx';
import { WEAPONS } from '../weapons/WeaponDefs';
import type { Combatant, HitInfo, HitResult } from '../game/Combat';
import { MusicSystem } from './Music';
import { Ambience } from './Ambience';
import { SFX, GROUP_CAP, type SfxParams } from './Sfx';
import { renderUtterance, vocalScript, VOCAL_PRIORITY, type VocalKind } from './Voice';
import { getKit, mkGain, mkFilter, makeRoomIR, makeCurve, kRate, clamp, rand, chance } from './dsp';

export interface PlayOptions extends Partial<Omit<SfxParams, 'vol'>> {
  /** linear volume multiplier (default 1) */
  volume?: number;
  /** pitch multiplier (default 1) */
  pitch?: number;
  /** absolute AudioContext time to start at (default: now) */
  at?: number;
}

interface Voice {
  name: string;
  group?: string;
  out: GainNode;
  extra: AudioNode[];
  hrtf: boolean;
  end: number;
  score: number;
  killed: boolean;
  speaker?: number;
  prio?: number;
}

const HEAD = 2;
const MAX_VOICES = 36;
const MAX_VOCALS = 6;
const MAX_DIST = 42;
const REF_DIST = 1.8;
const ROLLOFF = 1.2;
const PAN_MAX = 40;

const sq = (v: number): number => clamp(v, 0, 1) * clamp(v, 0, 1);

function voicePitchOf(c: Combatant): number {
  const p = (c as unknown as { app?: { voicePitch?: number } }).app?.voicePitch;
  return typeof p === 'number' ? p : 1;
}

export class AudioSystem {
  readonly ac: AudioContext;
  readonly music: MusicSystem;
  readonly ambience: Ambience;

  private readonly offline: boolean;
  private readonly ownsContext: boolean;
  private readonly master: GainNode;
  private readonly sfxDry: GainNode;
  private readonly sfxVol: GainNode;
  private readonly sfxRevIn: GainNode;
  private readonly musicRevIn: GainNode;
  private readonly revReturn: GainNode;
  private readonly worldLP: BiquadFilterNode;
  private readonly musicVol: GainNode;
  private readonly musicDuck: GainNode;
  private readonly musicLP: BiquadFilterNode;
  private readonly ambVol: GainNode;
  private readonly ambDuck: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly anaBuf: Float32Array<ArrayBuffer>;

  private voices: Voice[] = [];
  private hrtfActive = 0;
  private readonly speakers = new Map<number, Voice>();
  private readonly lpos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private unsubs: (() => void)[] = [];
  private volumes = { master: 0.85, sfx: 1, music: 0.75 };
  private duckLevel = 0;
  private lastDuckApplied = 0;
  private slow = 0;
  private lastScale = 1;
  private slowPitch = 1;
  private deathMuffle = 0;
  private lastUpdateMs = 0;
  private lastAudioT = 0;
  private tinyBudget = 10;
  private housekeepT = 0;
  private recentHits: { pos: THREE.Vector3; time: number; material: boolean }[] = [];
  private pendingBlocks: { target: Combatant; pos: THREE.Vector3; parry: boolean; handled: boolean }[] = [];
  private readonly lastRagdoll = new Map<number, { t: number; s: number }>();
  private readonly lastCarve = new Map<number, number>();
  private lastDrip = 0;
  private killStreak = { n: 0, t: -10 };
  private readonly warned = new Set<string>();
  private readonly lastTargets: Record<string, number> = {};
  /** tests: override "now" (offline rendering schedules ahead of time) */
  clockOverride: number | null = null;
  /** max concurrent HRTF-panned one-shots (nearest sounds); the rest use cheap equal-power panning. 0 = never HRTF. */
  hrtfLimit = 8;

  /** Pass an OfflineAudioContext for offline rendering / tests; by default a realtime AudioContext is created. */
  constructor(context?: BaseAudioContext) {
    const AC: typeof AudioContext | undefined =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!context && !AC) throw new Error('Web Audio is not supported');
    this.ownsContext = !context;
    this.ac = (context ?? new AC!({ latencyHint: 'interactive' })) as AudioContext;
    this.offline = !('close' in this.ac);
    const ac = this.ac;
    getKit(ac); // build shared noise buffers / curves / waves now
    // the listener moves every frame: k-rate keeps panners from recomputing per sample
    const L = ac.listener;
    if (L.positionX) for (const p of [L.positionX, L.positionY, L.positionZ, L.forwardX, L.forwardY, L.forwardZ, L.upX, L.upY, L.upZ]) kRate(p);

    // ---- master: DC block -> glue compressor -> limiter -> safety soft clip
    this.master = mkGain(ac, sq(this.volumes.master));
    const dc = mkFilter(ac, 'highpass', 22, 0.7);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    const trim = mkGain(ac, 0.9);
    const clip = ac.createWaveShaper();
    clip.curve = makeCurve((x) => {
      const a = Math.abs(x);
      return a < 0.8 ? x : Math.sign(x) * (0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19));
    }, 4097);
    this.master.connect(dc);
    dc.connect(comp);
    comp.connect(lim);
    lim.connect(trim);
    trim.connect(clip);
    clip.connect(ac.destination);

    // ---- slow-mo low-pass on the world (sfx + ambience + reverb)
    this.worldLP = mkFilter(ac, 'lowpass', 20000, 0.5);
    this.worldLP.connect(this.master);

    // ---- shared room reverb (medium wooden room ~1.4s)
    const conv = ac.createConvolver();
    conv.normalize = false;
    conv.buffer = makeRoomIR(ac, { seconds: 1.6, rt60: 1.4, preDelay: 0.012, hfStart: 7000, hfEnd: 1500, early: 0.55 });
    this.sfxRevIn = mkGain(ac, sq(this.volumes.sfx));
    this.musicRevIn = mkGain(ac, sq(this.volumes.music) * 0.7);
    const revHP = mkFilter(ac, 'highpass', 220, 0.7);
    const revLP = mkFilter(ac, 'lowpass', 6500, 0.7);
    this.revReturn = mkGain(ac, 0.6);
    this.sfxRevIn.connect(revHP);
    this.musicRevIn.connect(revHP);
    revHP.connect(revLP);
    revLP.connect(conv);
    conv.connect(this.revReturn);
    this.revReturn.connect(this.worldLP);

    // ---- sfx bus
    this.sfxDry = mkGain(ac, 1);
    this.sfxVol = mkGain(ac, sq(this.volumes.sfx));
    this.sfxDry.connect(this.sfxVol);
    this.sfxVol.connect(this.worldLP);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 512;
    this.anaBuf = new Float32Array(512);
    this.sfxVol.connect(this.analyser);

    // ---- music bus
    this.musicVol = mkGain(ac, sq(this.volumes.music));
    this.musicDuck = mkGain(ac, 1);
    this.musicLP = mkFilter(ac, 'lowpass', 20000, 0.5);
    this.musicVol.connect(this.musicDuck);
    this.musicDuck.connect(this.musicLP);
    this.musicLP.connect(this.master);
    this.music = new MusicSystem(ac, this.musicVol, this.musicRevIn, { manual: this.offline });

    // ---- ambience bus (follows the sfx volume)
    this.ambVol = mkGain(ac, sq(this.volumes.sfx));
    this.ambDuck = mkGain(ac, 1);
    this.ambVol.connect(this.ambDuck);
    this.ambDuck.connect(this.worldLP);
    this.ambience = new Ambience(ac, this.ambVol, this.sfxRevIn);

    this.subscribe();
  }

  // ====================================================================== public API

  /** Call on the first user gesture (browser autoplay policy). */
  async resume(): Promise<void> {
    try {
      if (this.ac.state !== 'running') await this.ac.resume();
    } catch (err) {
      console.warn('[audio] resume failed', err);
    }
  }

  /** Volumes 0..1 (perceptual: squared internally). */
  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = { master, sfx, music };
    const now = this.ac.currentTime;
    this.master.gain.setTargetAtTime(sq(master), now, 0.05);
    this.sfxVol.gain.setTargetAtTime(sq(sfx), now, 0.05);
    this.sfxRevIn.gain.setTargetAtTime(sq(sfx), now, 0.05);
    this.ambVol.gain.setTargetAtTime(sq(sfx), now, 0.05);
    this.musicVol.gain.setTargetAtTime(sq(music), now, 0.05);
    this.musicRevIn.gain.setTargetAtTime(sq(music) * 0.7, now, 0.05);
  }

  /** Per frame: listener from the camera, ducking, slow-mo filtering, schedulers. */
  update(dt: number, camera: THREE.Camera): void {
    const ac = this.ac;
    camera.updateWorldMatrix(true, false); // not the children (view model hangs off the camera)
    const e = camera.matrixWorld.elements;
    const px = e[12];
    const py = e[13];
    const pz = e[14];
    let fx = -e[8];
    let fy = -e[9];
    let fz = -e[10];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    let ux = e[4];
    let uy = e[5];
    let uz = e[6];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    this.lpos.set(px, py, pz);
    const L = ac.listener;
    if (L.positionX) {
      L.positionX.value = px;
      L.positionY.value = py;
      L.positionZ.value = pz;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }

    // real time step (the game's dt may be scaled by slow motion): audio clock when it runs, else wall clock
    const ms = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = ac.currentTime;
    let rdt = this.lastUpdateMs ? (ms - this.lastUpdateMs) / 1000 : dt;
    if (this.lastAudioT > 0 && now > this.lastAudioT) rdt = now - this.lastAudioT;
    rdt = clamp(rdt, 0, 0.1);
    this.lastUpdateMs = ms;
    this.lastAudioT = now;

    // ---- slow motion: subtle low-pass + pitch-down for new sounds (hit-stop ignored)
    const tc = ctx.time as unknown as { scale?: number; inHitStop?: boolean; slowness?: number } | undefined;
    let slowness = 0;
    if (tc) {
      if (typeof tc.slowness === 'number') slowness = tc.slowness;
      else {
        let sc = tc.scale ?? 1;
        if (tc.inHitStop) sc = this.lastScale;
        else this.lastScale = sc;
        if (sc <= 0.001) sc = 1;
        slowness = 1 - clamp(sc, 0, 1);
      }
    }
    this.slow += (clamp(slowness, 0, 1) - this.slow) * (1 - Math.exp(-rdt / 0.08));
    this.slowPitch = 1 - 0.18 * this.slow;
    this.deathMuffle = Math.max(0, this.deathMuffle - rdt);
    const muffle = Math.max(this.slow, this.deathMuffle > 0 ? 0.85 : 0);
    this.setTarget(this.worldLP.frequency, 'wlp', 20000 * Math.pow(0.13, muffle), now, 0.04, 0.01);
    this.setTarget(this.musicLP.frequency, 'mlp', 20000 * Math.pow(0.3, muffle), now, 0.06, 0.01);

    // ---- ducking: event ducks + loud-sfx side-chain
    this.duckLevel *= Math.exp(-rdt / 0.45);
    let side = 0;
    if (!this.offline) {
      this.analyser.getFloatTimeDomainData(this.anaBuf);
      let s = 0;
      for (let i = 0; i < this.anaBuf.length; i++) s += this.anaBuf[i] * this.anaBuf[i];
      side = clamp((Math.sqrt(s / this.anaBuf.length) - 0.04) * 3, 0, 0.35);
    }
    const d = clamp(this.duckLevel + side, 0, 0.75);
    const tcd = d > this.lastDuckApplied ? 0.02 : 0.25;
    this.setTarget(this.musicDuck.gain, 'mduck', 1 - 0.5 * d, now, tcd, 0.004);
    this.setTarget(this.ambDuck.gain, 'aduck', 1 - 0.6 * d, now, tcd, 0.004);
    this.lastDuckApplied = d;

    this.tinyBudget = Math.min(10, this.tinyBudget + rdt * 12);
    this.reap(now);
    this.housekeepT += rdt;
    if (this.housekeepT > 2) {
      this.housekeepT = 0;
      this.housekeep(ms);
    }
    this.music.update(rdt);
    this.ambience.update(rdt);
  }

  /** Positional one-shot by name (`pos` null = 2D). See SFX in Sfx.ts for the names. */
  play(name: string, pos: THREE.Vector3 | null, opts: PlayOptions = {}): void {
    const def = SFX[name];
    if (!def) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[audio] unknown sound "${name}"`);
      }
      return;
    }
    if (!this.ready()) return;
    const p: SfxParams = {
      vol: opts.volume ?? 1,
      pitch: (opts.pitch ?? 1) * this.slowPitch,
      strength: opts.strength ?? 1,
      heavy: opts.heavy,
      kick: opts.kick,
      head: opts.head,
      crit: opts.crit,
      material: opts.material,
      other: opts.other,
      part: opts.part,
      variant: opts.variant,
    };
    this.spawn(name, pos, p.vol * def.gain, def.wet, def.prio, (ac, out, t) => def.gen(ac, out, t, p), opts.at, def.group);
  }

  /** 0..1 crowd chatter amount and how panicked / rowdy it is. */
  setCrowd(level: number, panic: number): void {
    this.ambience.setCrowd(level, panic);
  }

  /** Indoors = full room reverb + room tone; outside on the porch = drier, muffled crowd, crickets. */
  setRoom(indoor: boolean): void {
    this.revReturn.gain.setTargetAtTime(indoor ? 0.6 : 0.18, this.ac.currentTime, 0.4);
    this.ambience.setIndoor(indoor);
  }

  /** Make a character say something (bypasses the event bus). */
  say(who: Combatant, kind: VocalKind, pitch = voicePitchOf(who)): void {
    this.vocalize(who, kind, pitch, 0);
  }

  /** Number of active one-shot voices (debug HUD). */
  get activeVoices(): number {
    return this.voices.length;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.music.dispose();
    this.ambience.dispose();
    for (const v of this.voices) this.disconnectVoice(v);
    this.voices = [];
    if (this.ownsContext && !this.offline) this.ac.close().catch(() => undefined);
  }

  // ====================================================================== voices

  private now(): number {
    return this.clockOverride ?? this.ac.currentTime;
  }

  private ready(): boolean {
    return this.offline || this.ac.state === 'running';
  }

  private spawn(name: string, pos: THREE.Vector3 | null, vol: number, wet: number, prio: number, gen: (ac: BaseAudioContext, out: AudioNode, t: number) => number, at?: number, group?: string): Voice | null {
    const ac = this.ac;
    const now = this.now();
    const t = Math.max(at ?? now, now) + 0.004;
    let dist = 0;
    if (pos) {
      dist = pos.distanceTo(this.lpos);
      if (dist > MAX_DIST) return null;
    }
    const att = pos ? REF_DIST / (REF_DIST + ROLLOFF * (Math.max(dist, REF_DIST) - REF_DIST)) : 1;
    if (vol * att < 0.006) return null;
    const score = prio + 3 * vol * att;
    this.reap(now);
    if (group) {
      const cap = GROUP_CAP[group];
      if (cap) {
        let count = 0;
        let worst: Voice | null = null;
        for (const v of this.voices) {
          if (v.killed || v.group !== group) continue;
          count++;
          if (!worst || v.score < worst.score) worst = v;
        }
        if (count >= cap && worst) {
          // hysteresis: equal sounds (a crowd's footsteps) must not keep stealing each other
          if (worst.score + 0.3 > score) return null;
          this.killVoice(worst, now);
        }
      }
    }
    const live = this.voices.filter((v) => !v.killed);
    if (live.length >= MAX_VOICES) {
      let worst = live[0];
      for (const v of live) if (v.score < worst.score) worst = v;
      if (worst.score + 0.3 > score) return null;
      this.killVoice(worst, now);
    }

    const out = ac.createGain();
    out.gain.value = vol;
    const extra: AudioNode[] = [];
    let hrtf = false;
    if (pos) {
      let node: AudioNode = out;
      if (dist > 7) {
        // air absorption / occlusion-ish dulling with distance
        const lp = mkFilter(ac, 'lowpass', clamp(16000 * Math.pow(0.5, (dist - 7) / 8), 1800, 16000), 0.5);
        out.connect(lp);
        node = lp;
        extra.push(lp);
      }
      const pn = ac.createPanner();
      hrtf = this.hrtfActive < this.hrtfLimit && dist < 16;
      pn.panningModel = hrtf ? 'HRTF' : 'equalpower';
      pn.distanceModel = 'inverse';
      pn.refDistance = REF_DIST;
      pn.rolloffFactor = ROLLOFF;
      pn.maxDistance = PAN_MAX;
      if (pn.positionX) {
        kRate(pn.positionX);
        kRate(pn.positionY);
        kRate(pn.positionZ);
        pn.positionX.value = pos.x;
        pn.positionY.value = pos.y;
        pn.positionZ.value = pos.z;
      } else pn.setPosition(pos.x, pos.y, pos.z);
      node.connect(pn);
      pn.connect(this.sfxDry);
      extra.push(pn);
      if (hrtf) this.hrtfActive++;
    } else out.connect(this.sfxDry);
    if (wet > 0) {
      const send = ac.createGain();
      // reverberant level falls off slower than the direct sound: far = wetter
      send.gain.value = pos ? (wet * (0.65 + (Math.min(dist, 15) / 15) * 0.6)) / (1 + dist / 14) : wet * 0.7;
      out.connect(send);
      send.connect(this.sfxRevIn);
      extra.push(send);
    }
    let dur: number;
    try {
      dur = gen(ac, out, t);
    } catch (err) {
      console.warn('[audio]', name, err);
      out.disconnect();
      for (const n of extra) n.disconnect();
      if (hrtf) this.hrtfActive--;
      return null;
    }
    const v: Voice = { name, group, out, extra, hrtf, end: t + Math.max(dur, 0.05) + 0.05, score, killed: false };
    this.voices.push(v);
    return v;
  }

  private killVoice(v: Voice, now: number): void {
    if (v.killed) return;
    v.killed = true;
    const g = v.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.03);
    v.end = Math.min(v.end, now + 0.05);
  }

  private disconnectVoice(v: Voice): void {
    try {
      v.out.disconnect();
    } catch {
      /* ignore */
    }
    for (const n of v.extra) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private reap(_now: number): void {
    // always the real audio clock (tests may pre-schedule with clockOverride)
    const now = this.ac.currentTime;
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.end < now) {
        this.disconnectVoice(v);
        if (v.hrtf) this.hrtfActive--;
        if (v.speaker !== undefined && this.speakers.get(v.speaker) === v) this.speakers.delete(v.speaker);
      } else this.voices[w++] = v;
    }
    this.voices.length = w;
  }

  private housekeep(ms: number): void {
    for (const [k, v] of this.lastRagdoll) if (ms - v.t > 5000) this.lastRagdoll.delete(k);
    for (const [k, t] of this.lastCarve) if (ms - t > 5000) this.lastCarve.delete(k);
  }

  /** setTargetAtTime only when the target moved (keeps automation timelines short) */
  private setTarget(p: AudioParam, key: string, v: number, now: number, tc: number, rel: number): void {
    const last = this.lastTargets[key];
    if (last !== undefined && Math.abs(v - last) <= rel * Math.max(Math.abs(last), 1e-3)) return;
    this.lastTargets[key] = v;
    p.setTargetAtTime(v, now, tc);
  }

  private duck(amount: number): void {
    this.duckLevel = Math.max(this.duckLevel, amount);
  }

  // ====================================================================== vocals

  private vocalize(who: Combatant, kind: VocalKind, pitch: number, delay: number): void {
    if (!this.ready()) return;
    const now = this.now();
    const prio = VOCAL_PRIORITY[kind] ?? 1;
    const cur = this.speakers.get(who.id);
    if (cur && !cur.killed && cur.end > now) {
      if (prio <= (cur.prio ?? 0)) return;
      this.killVoice(cur, now);
    } else if (cur && now - cur.end < 0.12 && prio < 3) return;
    let pos: THREE.Vector3 | null = null;
    let dist = 0;
    if (!who.isPlayer) {
      pos = who.headPosition(this.tmp);
      dist = pos.distanceTo(this.lpos);
      if (dist > 34 && prio < 4) return;
    }
    const score = prio * 2 - dist * 0.15 + (who.isPlayer ? 6 : 0);
    let active = 0;
    let worst: Voice | null = null;
    for (const v of this.voices) {
      if (v.killed || v.speaker === undefined || v.end <= now) continue;
      active++;
      if (!worst || v.score < worst.score) worst = v;
    }
    if (active >= MAX_VOCALS && worst) {
      if (worst.score >= score) return;
      this.killVoice(worst, now);
    }
    const u = vocalScript(kind);
    const p = clamp(pitch, 0.5, 2.2) * this.slowPitch * rand(0.97, 1.03);
    const v = this.spawn('vocal:' + kind, pos ? pos.clone() : null, who.isPlayer ? 0.62 : 0.95, 0.28, score, (ac, out, t) => renderUtterance(ac, out, t, u, p) - t, now + delay);
    if (v) {
      v.score = score;
      v.speaker = who.id;
      v.prio = prio;
      this.speakers.set(who.id, v);
    }
  }

  // ====================================================================== events

  private subscribe(): void {
    const on = <K extends keyof GameEvents>(k: K, fn: (e: GameEvents[K]) => void): void => {
      this.unsubs.push(
        events.on(k, (e) => {
          try {
            fn(e);
          } catch (err) {
            console.warn('[audio] ' + String(k), err);
          }
        }),
      );
    };
    on('hit', (e) => this.onHit(e.target, e.hit, e.result));
    on('block', (e) => this.onBlock(e));
    on('death', (e) => this.onDeath(e));
    on('knockdown', (e) => {
      if (!e.victim.isPlayer && e.victim.alive && chance(0.5)) this.vocalize(e.victim, 'grunt', voicePitchOf(e.victim), 0.05);
    });
    on('carve', (e) => this.onCarve(e));
    on('sever', (e) => {
      this.play('gore_sever', e.point);
      this.duck(0.25);
    });
    on('headExplode', (e) => {
      this.play('gore_head', e.point);
      this.duck(0.4);
    });
    on('bleed', (e) => this.onBleed(e));
    on('impact', (e) => this.onImpact(e));
    on('whiff', (e) => this.play('whoosh', e.pos, { heavy: e.heavy, strength: e.attacker.isPlayer ? 1 : 0.8, volume: e.attacker.isPlayer ? 0.8 : 0.65 }));
    on('footstep', (e) => this.onFootstep(e));
    on('ragdollImpact', (e) => this.onRagdoll(e));
    on('vocal', (e) => this.vocalize(e.who, e.kind, e.pitch, 0));
    on('kill', (e) => this.onKill(e));
  }

  private matchHit(pos: THREE.Vector3): { material: boolean } | null {
    const ms = performance.now();
    this.recentHits = this.recentHits.filter((h) => ms - h.time < 120);
    for (const h of this.recentHits) if (h.pos.distanceToSquared(pos) < 2.25) return h;
    return null;
  }

  private onHit(target: Combatant, hit: HitInfo, res: HitResult): void {
    const pos = hit.point;
    if (res.blocked) {
      const pb = this.pendingBlocks.find((b) => b.target === target && !b.handled);
      if (pb) pb.handled = true;
      const heavy = !!(hit.heavy || hit.kick);
      this.play(res.parried ? 'parry' : 'block', pos, { heavy, strength: heavy ? 1.2 : 0.8 });
      if (res.parried) this.duck(0.2);
      return;
    }
    const head = hit.part === HEAD;
    const s = clamp(0.45 + res.damage / 30, 0.4, 1.6);
    const wdef = hit.weaponId ? WEAPONS[hit.weaponId] : undefined;
    const big = !!(hit.heavy || hit.kick || hit.crit);
    const o: PlayOptions = { strength: s, heavy: !!hit.heavy, kick: !!hit.kick, head, crit: !!hit.crit, volume: target.isPlayer ? 0.85 : 1 };
    let name = 'punch';
    let hasMaterial = true;
    if (wdef) {
      name = 'hit_' + wdef.sound;
      o.heavy = o.heavy || wdef.heavy;
      if (wdef.sound === 'blade' && hit.type === 'pierce') o.variant = 'pierce';
    } else if (hit.source === 'thrown') {
      // the prop's own material arrives as an `impact` event: keep only the body layer here
      if (hit.type === 'pierce' || hit.type === 'sharp') {
        name = 'hit_blade';
        o.variant = 'pierce';
      } else hasMaterial = false;
      o.strength = s * 0.85;
    } else if (hit.type === 'fall' || hit.type === 'crush' || hit.type === 'force') {
      name = 'body_fall';
      o.part = hit.part;
    }
    this.play(name, pos, o);
    this.recentHits.push({ pos: pos.clone(), time: performance.now(), material: hasMaterial });
    if (target.isPlayer) {
      this.play('player_hurt', null, { strength: s });
      this.duck(0.25);
      if (chance(0.35)) this.vocalize(target, 'pain', 1, 0.02);
    } else if (target.alive && !res.killed && chance(big ? 0.9 : 0.6)) {
      this.vocalize(target, res.damage < 6 && chance(0.5) ? 'grunt' : 'pain', voicePitchOf(target), 0.03);
    }
    if (big) this.duck(0.2);
  }

  private onBlock(e: GameEvents['block']): void {
    const pb = { target: e.target, pos: e.pos.clone(), parry: e.parry, handled: false };
    this.pendingBlocks.push(pb);
    // the matching `hit` (with full info) normally follows synchronously; fall back if it does not
    queueMicrotask(() => {
      const i = this.pendingBlocks.indexOf(pb);
      if (i >= 0) this.pendingBlocks.splice(i, 1);
      if (!pb.handled) this.play(pb.parry ? 'parry' : 'block', pb.pos);
    });
  }

  private onDeath(e: GameEvents['death']): void {
    const v = e.victim;
    if (v.isPlayer) {
      this.play('player_death', null);
      this.duck(0.8);
      this.deathMuffle = 3;
      return;
    }
    if (e.cause !== 'headExplode' && e.cause !== 'decapitated') this.vocalize(v, chance(0.4) ? 'gurgle' : 'death', voicePitchOf(v), rand(0.03, 0.12));
    // body slumping
    this.play('body_fall', v.position, { strength: 0.6, part: 1, volume: 0.5, at: this.now() + rand(0.3, 0.5) });
  }

  private onKill(e: GameEvents['kill']): void {
    if (!e.killer || !e.killer.isPlayer) return;
    const now = this.now();
    this.killStreak.n = now - this.killStreak.t < 4 ? this.killStreak.n + 1 : 1;
    this.killStreak.t = now;
    this.play('kill_sting', null, { strength: 1 + Math.min(this.killStreak.n - 1, 4) * 0.2, at: now + 0.03 });
    this.duck(0.5);
  }

  private onCarve(e: GameEvents['carve']): void {
    const n = e.removed.length;
    if (!n) return;
    const ms = performance.now();
    if (ms - (this.lastCarve.get(e.target.id) ?? 0) < 90) return;
    this.lastCarve.set(e.target.id, ms);
    this.play('gore_carve', e.hit.point, { strength: clamp(n / 12, 0.2, 1.5) });
  }

  private onBleed(e: GameEvents['bleed']): void {
    const ms = performance.now();
    if (ms - this.lastDrip < 250 || !chance(0.25)) return;
    if (e.pos.distanceTo(this.lpos) > 7) return;
    this.lastDrip = ms;
    this.play('drip', e.pos, { volume: 0.3 + 0.4 * clamp(e.amount, 0, 1) });
  }

  private onImpact(e: GameEvents['impact']): void {
    const other = e.otherMaterial as string | undefined;
    if (other === 'break') {
      this.play('break', e.pos, { material: e.material, strength: e.strength });
      this.duck(0.12);
      return;
    }
    const s = e.strength;
    if (s < 0.04) return;
    const o: PlayOptions = { material: e.material, strength: s, other };
    if (other === 'flesh') {
      // weapon / prop against a body: the `hit` event already played the full layered sound
      const r = this.matchHit(e.pos);
      if (r) {
        if (!r.material) this.play('impact', e.pos, { ...o, volume: 0.75 });
        return;
      }
      const pos = e.pos.clone();
      queueMicrotask(() => {
        const r2 = this.matchHit(pos);
        if (r2?.material) return;
        this.play('impact', pos, { ...o, volume: r2 ? 0.75 : 1 });
      });
      return;
    }
    if (s < 0.15) {
      if (this.tinyBudget < 1) return;
      this.tinyBudget--;
    }
    this.play('impact', e.pos, o);
  }

  private onFootstep(e: GameEvents['footstep']): void {
    const k = clamp(e.intensity, 0, 1);
    if (e.isPlayer) this.play('footstep', null, { material: e.material, strength: 0.6 + 0.5 * k, volume: 0.5 });
    else if (e.pos.distanceToSquared(this.lpos) < 18 * 18) this.play('footstep', e.pos, { material: e.material, strength: 0.5 + 0.5 * k, volume: 0.4 });
  }

  private onRagdoll(e: GameEvents['ragdollImpact']): void {
    const s = clamp((e.strength - 4) / 40, 0.05, 1.5);
    const ms = performance.now();
    const last = this.lastRagdoll.get(e.target.id);
    if (last && ms - last.t < 70 && s < last.s * 1.5) return;
    this.lastRagdoll.set(e.target.id, { t: ms, s });
    this.play('body_fall', e.pos, { strength: s, part: e.part, volume: 0.5 + 0.5 * Math.min(s, 1) });
  }
}
