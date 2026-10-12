// Sound system: original DMX sound effects through Web Audio with 3D
// positioning (DOOM's 200..1200 unit falloff), line-of-sight occlusion,
// room-size reverb, optional pitch variation, synthesized supplementary
// layers, and the OPL music player.

import { SFX_DEFS } from '../game/info.js';
import { MusicPlayer } from './music.js';
import { buildSynth } from './synth.js';
import { sightTrace } from '../game/sight.js';

const MAX_VOICES = 40;
const CLOSE_DIST = 200;
const CLIP_DIST = 1200;

// Extra layers mixed under certain original sounds.
const LAYERS = {
  rxplod: [['x_sub', 0.9], ['x_debris', 0.5]],
  barexp: [['x_sub', 1.0], ['x_debris', 0.6]],
  shotgn: [['x_sub_small', 0.35]],
  dshtgn: [['x_sub_small', 0.5]],
  rlaunc: [['x_sub_small', 0.3]],
  bfg: [['x_sub', 0.4]],
  firxpl: [['x_sub_small', 0.4]],
};

const NO_PITCH = new Set(['sawup', 'sawidl', 'sawful', 'sawhit', 'itemup', 'wpnup', 'getpow', 'tink', 'swtchn', 'swtchx', 'pstop', 'pistol_ui']);

export class AudioSystem {
  constructor(stack, settings) {
    this.stack = stack;
    this.settings = settings;
    this.ctx = null;
    this.buffers = new Map();
    this.voices = [];
    this.world = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mo: null };
    this.priority = new Map();
    for (const s of SFX_DEFS) if (s && s.name) this.priority.set(s.name, s.priority);
    this.musicName = null;
    this.occlusionIndex = 0;
    this.envSmoothed = { small: 0.4, large: 0.1, outdoor: 0 };
  }

  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // Gentle bus compression keeps stacked explosions from clipping.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.15;
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // Reverb: two convolvers crossfaded by environment.
    this.revSend = ctx.createGain();
    this.revSmall = ctx.createConvolver();
    this.revLarge = ctx.createConvolver();
    this.revSmall.buffer = this.impulse(0.55, 2.2, 0.0);
    this.revLarge.buffer = this.impulse(2.4, 3.2, 0.02);
    this.revSmallGain = ctx.createGain();
    this.revLargeGain = ctx.createGain();
    this.revSend.connect(this.revSmall);
    this.revSend.connect(this.revLarge);
    this.revSmall.connect(this.revSmallGain);
    this.revLarge.connect(this.revLargeGain);
    this.revSmallGain.connect(this.comp);
    this.revLargeGain.connect(this.comp);
    this.applyVolumes();
    this.settings.onChange(() => this.applyVolumes());
    try {
      this.music = await MusicPlayer.create(ctx, this.musicBus);
      const genmidi = this.stack.data('GENMIDI');
      if (genmidi) this.music.setGenmidi(genmidi);
      this.music.setVolume(1);
    } catch (e) {
      console.warn('music unavailable', e);
      this.music = null;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(s.get('sfxVolume') * 0.9, t, 0.02);
    this.musicBus.gain.setTargetAtTime(s.get('musicVolume'), t, 0.02);
    this.revSend.gain.setTargetAtTime(s.get('reverb') ? 1 : 0, t, 0.05);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // Exponentially decaying stereo noise impulse response.
  impulse(seconds, decayPow, predelay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const pre = i / rate < predelay ? 0 : 1;
        lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.4 * t);
        d[i] = lp * Math.pow(1 - t, decayPow) * pre * 0.5;
      }
    }
    return b;
  }

  // --- Buffers ------------------------------------------------------------

  buffer(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    let b = null;
    if (this.ctx) {
      if (name.startsWith('x_')) {
        const s = buildSynth(name);
        if (s) {
          b = this.ctx.createBuffer(1, s.data.length, s.rate);
          b.copyToChannel(s.data, 0);
        }
      } else {
        const data = this.stack.data(`DS${name.toUpperCase()}`);
        if (data && data.length > 8) b = this.decodeDmx(data);
      }
    }
    this.buffers.set(name, b);
    return b;
  }

  decodeDmx(data) {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const format = v.getUint16(0, true);
    if (format !== 3) return null;
    const rate = v.getUint16(2, true) || 11025;
    let count = v.getUint32(4, true);
    let start = 8;
    if (count > data.length - 8) count = data.length - 8;
    if (count > 48) { start += 16; count -= 32; }
    if (count <= 0) return null;
    const b = this.ctx.createBuffer(1, count, rate);
    const ch = b.getChannelData(0);
    for (let i = 0; i < count; i++) ch[i] = (data[start + i] - 128) / 128;
    return b;
  }

  // --- Playback -------------------------------------------------------------

  setWorld(w) {
    this.world = w;
    if (!w) this.stopAll(0.05);
  }

  isPlayerOrigin(origin) {
    return origin && this.listener.mo && origin === this.listener.mo;
  }

  // origin: mobj, {x,y,z} or null. opts: channel, volume, ui, pitch
  start(origin, name, opts = {}) {
    if (!this.ctx || !name) return;
    if (this.ctx.state === 'suspended') return;
    const s = this.settings;
    if (name.startsWith('x_') && !s.get('extraSounds') && !opts.force) return;
    const buffer = this.buffer(name);
    if (!buffer) return;
    const channel = opts.channel || 'default';
    // One sound per origin+channel, like DOOM's per-origin channels.
    if (origin) {
      for (const v of this.voices) {
        if (v.origin === origin && v.channel === channel && !v.stopped) this.stopVoice(v, 0.01);
      }
    }
    const prio = this.priority.get(name) ?? 100;
    if (this.voices.length >= MAX_VOICES) {
      let worst = null;
      for (const v of this.voices) if (!worst || v.prio > worst.prio || (v.prio === worst.prio && v.started < worst.started)) worst = v;
      if (worst && worst.prio >= prio) this.stopVoice(worst, 0.01, true);
      else return;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    let rate = opts.pitch || 1;
    if (s.get('pitchVariation') && !opts.ui && !NO_PITCH.has(name) && !opts.noPitch) rate *= 1 + (Math.random() * 2 - 1) * 0.035;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    const positional = origin && !opts.ui && !this.isPlayerOrigin(origin) && origin.x !== undefined;
    const voice = { src, gain, origin, channel, name, prio, started: ctx.currentTime, positional, stopped: false };
    let node = src;
    if (positional) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 22000;
      const panner = ctx.createPanner();
      panner.panningModel = s.get('hrtf') ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'linear';
      panner.refDistance = CLOSE_DIST;
      panner.maxDistance = this.world && this.world.map === 8 && !this.world.commercial ? CLIP_DIST * 6 : CLIP_DIST;
      panner.rolloffFactor = 1;
      this.placePanner(panner, origin);
      node.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      voice.panner = panner;
      voice.filter = filter;
      if (s.get('occlusion')) this.updateOcclusion(voice, true);
    } else {
      node.connect(gain);
    }
    gain.connect(this.sfxBus);
    if (!opts.ui) {
      const send = ctx.createGain();
      send.gain.value = positional ? 0.6 : 0.35;
      gain.connect(send);
      send.connect(this.revSend);
      voice.send = send;
    }
    src.onended = () => { voice.stopped = true; this.cleanup(voice); };
    src.start();
    this.voices.push(voice);
    // Supplementary layers
    const layers = LAYERS[name];
    if (layers && s.get('extraSounds') && !opts.noLayers) {
      for (const [lname, vol] of layers) {
        this.start(origin && origin.x !== undefined ? { x: origin.x, y: origin.y, z: origin.z } : origin, lname,
          { channel: `layer-${lname}`, volume: vol * (opts.volume ?? 1), noLayers: true });
      }
    }
  }

  ui(name, opts = {}) { this.start(null, name, { ...opts, ui: true }); }

  placePanner(panner, o) {
    const z = (o.z ?? 0) + (o.height ? o.height * 0.6 : 0);
    if (panner.positionX) {
      panner.positionX.value = o.x;
      panner.positionY.value = z;
      panner.positionZ.value = -o.y;
    } else panner.setPosition(o.x, z, -o.y);
  }

  stopVoice(v, fade = 0.02, remove = false) {
    if (v.stopped) return;
    v.stopped = true;
    try {
      const t = this.ctx.currentTime;
      v.gain.gain.setTargetAtTime(0, t, fade);
      v.src.stop(t + fade * 6);
    } catch {
      // already stopped
    }
    if (remove) this.cleanup(v);
  }

  cleanup(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  // A removed object's sound keeps playing from its last position.
  stopOrigin(origin) {
    for (const v of this.voices) {
      if (v.origin === origin) {
        v.origin = { x: origin.x, y: origin.y, z: origin.z, height: origin.height };
      }
    }
  }

  stopAll(fade = 0.05) {
    for (const v of this.voices.slice()) this.stopVoice(v, fade, true);
  }

  // --- Listener / environment ------------------------------------------------

  setListener(cam, player) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listener.x = cam.x; this.listener.y = cam.y; this.listener.z = cam.z;
    this.listener.yaw = cam.yaw;
    this.listener.mo = player ? player.mo : null;
    this.listener.sector = cam.sector;
    const fx = Math.cos(cam.yaw), fz = -Math.sin(cam.yaw);
    if (L.positionX) {
      L.positionX.value = cam.x; L.positionY.value = cam.z; L.positionZ.value = -cam.y;
      L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.x, cam.z, -cam.y);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  updateOcclusion(v, immediate = false) {
    const w = this.world;
    if (!w || !v.filter || !v.origin) return;
    const o = v.origin;
    const L = this.listener;
    let open = true;
    try {
      open = sightTrace(w, L.x, L.y, L.z, o.x, o.y, (o.z ?? 0) + 2, (o.z ?? 0) + Math.max(16, o.height || 32));
    } catch {
      open = true;
    }
    const f = open ? 22000 : 700;
    const t = this.ctx.currentTime;
    if (immediate) v.filter.frequency.value = f;
    else v.filter.frequency.setTargetAtTime(f, t, 0.06);
    v.occluded = !open;
  }

  // Reverb character from the listener's sector size and openness.
  updateEnvironment() {
    const sec = this.listener.sector;
    const w = this.world;
    if (!sec || !w) return;
    const b = sec.bbox;
    const area = Math.max(1, (b.maxx - b.minx) * (b.maxy - b.miny));
    const height = sec.ceilingheight - sec.floorheight;
    const outdoor = w.isSkyFlat(sec.ceilingpic) ? 1 : 0;
    const size = Math.min(1, Math.sqrt(area) / 1400 + height / 600);
    const target = {
      small: outdoor ? 0.08 : 0.45 * (1 - size) + 0.15,
      large: outdoor ? 0.18 : 0.12 + 0.55 * size,
    };
    const e = this.envSmoothed;
    e.small += (target.small - e.small) * 0.08;
    e.large += (target.large - e.large) * 0.08;
    const t = this.ctx.currentTime;
    this.revSmallGain.gain.setTargetAtTime(e.small, t, 0.1);
    this.revLargeGain.gain.setTargetAtTime(e.large * 0.6, t, 0.1);
  }

  // Called every tic.
  update() {
    if (!this.ctx || !this.voices.length) {
      if (this.ctx && this.world) this.updateEnvironment();
      return;
    }
    for (const v of this.voices) {
      if (v.panner && v.origin) this.placePanner(v.panner, v.origin);
    }
    if (this.settings.get('occlusion') && this.world) {
      const pos = this.voices.filter((v) => v.filter);
      for (let k = 0; k < Math.min(4, pos.length); k++) {
        this.occlusionIndex = (this.occlusionIndex + 1) % pos.length;
        this.updateOcclusion(pos[this.occlusionIndex]);
      }
    }
    if (this.world) this.updateEnvironment();
  }

  // --- Music ------------------------------------------------------------------

  playMusic(lumpName, loop = true) {
    if (!this.music) return;
    if (this.musicName === lumpName) return;
    const data = this.stack.data(lumpName);
    this.musicName = lumpName;
    if (!data) { this.music.stop(); return; }
    this.music.play(data, { loop });
  }

  stopMusic() {
    if (this.music) this.music.stop();
    this.musicName = null;
  }
}
