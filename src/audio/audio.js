// HW.audio — procedural WebAudio for HALLOWELL (TECH §10). No sample files: every sound is
// synthesised at runtime (buffer recipes rendered in JS, live node graphs, generated reverbs).
//
// Contract API: init · unlock · update · sfx · loop · ambience · music · silence · duck ·
// footstep · blip · murmur · setListener · setVolumes · renderOffline · occluder (set by engine).
// Additions (documented in the audio report / TECH changelog request):
//   setSpace(kind, fade)        shared reverb space ('room' 'corridor' 'hall' 'basement' 'cavern'
//                               'stairwell' 'tile' 'library' 'vault' 'outside' 'car' 'none';
//                               ambience() picks one automatically, setSpace overrides until the
//                               next ambience change)
//   layer(id, on, fade)         ambience layer over the bed (e.g. 'period_buzz'); ambience('period_buzz')
//                               is treated as layer('period_buzz', true)
//   stripAmbience(n, fade)      long hall: mute bed strata wind → creaks → drips → rain → events
//   level()                     output meter 0..1 (PA console VU needle)
//   stopAll(fade) · ready · ids · sfx opts { dur, delay, pan } · loop opts { bpm, rate }
//
// Everything before init()/unlock() is safe: one-shots are dropped (nothing piles up while the
// context is suspended); ambience/music/volume state is kept and plays once unlocked.
import { AudioEngine, NULL_HANDLE } from './engine.js';
import { SFX_IDS, EVENT_IDS } from './sfx.js';
import { BEDS } from './ambience.js';
import { TRACKS } from './music.js';
import { LOOPS } from './loops.js';
import { SPACES } from './mixer.js';
import { STEP_SURFACES } from './footsteps.js';
import { blipId } from './voices.js';

const TICK_MS = 50;
let ctx = null;
let eng = null;
let timer = null;
const pending = { volumes: null };

function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const audio = {
  /** (x0, y0, x1, y1) → 0..1 sound occlusion between two world points; set by the engine. */
  occluder: null,

  get ready() { return !!ctx && ctx.state === 'running'; },
  get context() { return ctx; },
  get engine() { return eng; },
  ids: {
    sfx: SFX_IDS, events: EVENT_IDS, ambience: Object.keys(BEDS), music: Object.keys(TRACKS),
    loops: Object.keys(LOOPS), spaces: Object.keys(SPACES).filter((k) => k !== 'music'), surfaces: STEP_SURFACES,
  },

  init() {
    if (ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { console.warn('[audio] Web Audio unavailable — running silent'); return; }
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] could not create AudioContext', e);
      ctx = null; return;
    }
    // Start suspended (TECH §4); unlock() resumes on the first gesture.
    if (ctx.state === 'running') ctx.suspend().catch(() => {});
    eng = new AudioEngine(ctx, { analyser: true, getOccluder: () => audio.occluder });
    if (pending.volumes) eng.setVolumes(pending.volumes);
    timer = setInterval(() => { try { eng.tick(); } catch (e) { console.error('[audio] tick failed', e); } }, TICK_MS);
  },

  /** Resume the context (call from a user gesture). Resolves true when running. */
  unlock() {
    if (!ctx) this.init();
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(() => { eng?.tick(); return true; }, () => false);
  },

  update() { if (eng) eng.tick(); },

  // ---- sounds ----------------------------------------------------------------------------------
  sfx(id, opts) { return eng ? eng.sfx(id, opts || {}) : NULL_HANDLE; },
  loop(id, opts) { return eng ? eng.loop(id, opts || {}) : NULL_HANDLE; },
  ambience(id, fade = 2) { eng?.ambience(id, fade); },
  layer(id, on = true, fade = 1) { eng?.layer(id, on, fade); },
  stripAmbience(n = 0, fade = 1.5) { eng?.stripAmbience(n, fade); },
  music(id, fade = 2) { eng?.music(id, fade); },
  silence(on = true, fade = 0.5) { eng?.silence(on, fade); },
  duck(level = 1, fade = 0.5) { eng?.duck(level, fade); },
  footstep(surface, opts) { eng?.footstep(surface, opts || {}); },
  blip(charId) { eng?.blip(charId); },
  murmur(sec) { return eng ? eng.murmur(sec) : NULL_HANDLE; },
  stopAll(fade = 0.3) { eng?.stopAll(fade); },

  // ---- mix ---------------------------------------------------------------------------------------
  setListener(x, y) { eng?.setListener(x, y); },
  setVolumes(v) {
    pending.volumes = { ...(pending.volumes || {}), ...(v || {}) };
    eng?.setVolumes(pending.volumes);
  },
  setSpace(kind, fade = 0.8) { return eng ? eng.setSpace(kind, fade) : null; },
  level() { return eng ? eng.level() : 0; },

  /** Render a sound offline through the same engine code (QA / tooling).
   *  kind: 'sfx' | 'ambience' | 'music' | 'loop' | 'layer' | 'footstep' | 'blip' | 'murmur'.
   *  opts: sampleRate, seed, dynamics (default true), space, x/y + listener [x, y],
   *        run (footstep), steps/interval (footstep/blip count & spacing), sfx (extra sfx opts).
   *  Resolves to a Float32Array mono mix-down with .channels = [L, R] and .sampleRate. */
  async renderOffline(kind, id, seconds = 4, opts = {}) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) return new Float32Array(0);
    const sr = opts.sampleRate || 44100, len = Math.max(1, Math.ceil(seconds * sr));
    const octx = new OAC(2, len, sr);
    const e = new AudioEngine(octx, { offline: true, seed: opts.seed ?? hashId(`${kind}:${id}`), dynamics: opts.dynamics !== false });
    if (opts.space) e.setSpace(opts.space, 0.01);
    if (opts.listener) e.setListener(opts.listener[0], opts.listener[1]);
    const t0 = 0.03;
    switch (kind) {
      case 'sfx': e.sfx(id, { ...(opts.sfx || {}), x: opts.x, y: opts.y, t: t0 }); break;
      case 'loop': e.loop(id, { ...(opts.sfx || {}), x: opts.x, y: opts.y, fade: 0.05 }); break;
      case 'ambience': e.ambience(id, opts.fade ?? 0.05); break;
      case 'layer': e.layer(id, true, opts.fade ?? 0.05); break;
      case 'music': e.music(id, opts.fade ?? 0.05); break;
      case 'footstep': {
        const n = opts.steps || 6, dt = opts.interval || (opts.run ? 0.24 : 0.32);
        for (let i = 0; i < n; i++) e.footstep(id, { run: !!opts.run, t: t0 + i * dt, id: 'qa' });
        break;
      }
      case 'blip': {
        const n = opts.steps || 14, dt = opts.interval || 0.075, bid = blipId(id);
        if (bid) for (let i = 0; i < n; i++) e.play(bid, { bus: 'ui', t: t0 + i * dt + (i % 5 === 4 ? 0.12 : 0) });
        break;
      }
      case 'murmur': e.play('colonel_murmur', { dur: Math.max(0.4, seconds - 0.8), t: t0 }); break;
      default: throw new Error(`renderOffline: unknown kind '${kind}'`);
    }
    e.pump(seconds + 1);
    const buf = await octx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) mono[i] = 0.5 * (L[i] + R[i]);
    mono.channels = [L, R];
    mono.sampleRate = sr;
    return mono;
  },

  /** Tear down (tests / hot reload). */
  close() {
    if (timer) clearInterval(timer);
    timer = null;
    try { eng?.stopAll(0.01); } catch { /* ignore */ }
    ctx?.close?.();
    ctx = null; eng = null;
  },
};

export default audio;
