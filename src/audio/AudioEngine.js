// Web Audio engine: buses, zone reverb (procedurally generated impulse responses, crossfaded),
// spatial emitters with distance air-absorption and voxel occlusion, and a registry of
// procedural sound generators supplied by content modules (no audio files needed).

import * as THREE from 'three'
import { mulberry32 } from '../core/rng.js'

/** Reverb presets: decay (s), predelay (s), brightness (0..1, high-frequency survival), early reflections. */
export const REVERBS = {
  outdoor: { decay: 1.6, pre: 0.02, bright: 0.35, wet: 0.16, echoes: [0.11, 0.23, 0.41], density: 0.5 },
  courtyard: { decay: 2.4, pre: 0.03, bright: 0.45, wet: 0.26, echoes: [0.08, 0.17, 0.29, 0.46], density: 0.6 },
  park: { decay: 1.2, pre: 0.02, bright: 0.3, wet: 0.08, echoes: [0.2], density: 0.4 },
  stairwell: { decay: 2.6, pre: 0.008, bright: 0.65, wet: 0.42, echoes: [0.018, 0.035, 0.05], density: 1 },
  underpass: { decay: 2.0, pre: 0.01, bright: 0.75, wet: 0.45, echoes: [0.02, 0.045], density: 1 },
  metro: { decay: 3.4, pre: 0.02, bright: 0.6, wet: 0.45, echoes: [0.05, 0.09, 0.15], density: 1 },
  tunnel: { decay: 2.8, pre: 0.01, bright: 0.5, wet: 0.5, echoes: [0.03], density: 1 },
  shop: { decay: 0.6, pre: 0.005, bright: 0.4, wet: 0.14, echoes: [], density: 1 },
  room: { decay: 0.8, pre: 0.005, bright: 0.45, wet: 0.2, echoes: [0.012], density: 1 },
  elevator: { decay: 0.35, pre: 0.002, bright: 0.5, wet: 0.25, echoes: [0.004], density: 1 },
  hall: { decay: 1.8, pre: 0.01, bright: 0.55, wet: 0.3, echoes: [0.03, 0.06], density: 1 },
}

const _fwd = new THREE.Vector3()
const _up = new THREE.Vector3()

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.ready = false
    this.sounds = new Map() // name → factory(engine, opts) → handle
    this.emitters = new Set()
    this.listener = new THREE.Vector3()
    this.listenerDir = new THREE.Vector3(0, 0, -1)
    this.volumes = { master: 0.9, ambience: 1, sfx: 1, music: 0.7 }
    this.reverbName = 'outdoor'
    this._irCache = new Map()
    this._noiseCache = new Map()
    this.controllers = [] // objects with update(dt, engine, game)
    this.footstepFn = null
    this.world = null
    this._occlTimer = 0
    this.muffle = 0 // global muffling (e.g. pause menu)
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC({ latencyHint: 'playback' })
    this.ctx = ctx
    this.sampleRate = ctx.sampleRate
    // master chain: buses → masterGain → muffle LPF → compressor → destination
    this.master = ctx.createGain()
    this.muffleFilter = ctx.createBiquadFilter()
    this.muffleFilter.type = 'lowpass'
    this.muffleFilter.frequency.value = 20000
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -14
    this.comp.ratio.value = 3
    this.comp.attack.value = 0.01
    this.comp.release.value = 0.25
    this.master.connect(this.muffleFilter)
    this.muffleFilter.connect(this.comp)
    this.comp.connect(ctx.destination)
    this.bus = {}
    for (const name of ['ambience', 'sfx', 'music', 'ui']) {
      const g = ctx.createGain()
      g.connect(this.master)
      this.bus[name] = g
    }
    // reverb: two convolvers, crossfaded on zone change
    this.reverbIn = ctx.createGain()
    this.revA = ctx.createConvolver(); this.revB = ctx.createConvolver()
    this.revGainA = ctx.createGain(); this.revGainB = ctx.createGain()
    this.reverbIn.connect(this.revA); this.reverbIn.connect(this.revB)
    this.revA.connect(this.revGainA); this.revB.connect(this.revGainB)
    this.revGainA.connect(this.master); this.revGainB.connect(this.master)
    this.revA.buffer = this._ir('outdoor')
    this.revB.buffer = this._ir('outdoor')
    this.revGainA.gain.value = REVERBS.outdoor.wet
    this.revGainB.gain.value = 0
    this._revActive = 'A'
    this.applyVolumes()
    this.ready = true
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume() }

  applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05)
    this.bus.ambience.gain.setTargetAtTime(this.volumes.ambience, t, 0.05)
    this.bus.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05)
    this.bus.music.gain.setTargetAtTime(this.volumes.music, t, 0.05)
    this.bus.ui.gain.setTargetAtTime(Math.min(1, this.volumes.sfx), t, 0.05)
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0 }

  // ---- buffers ---------------------------------------------------------------------------
  /** Create a mono (or stereo) buffer from a generator fn(i, t, ch) → sample. */
  makeBuffer(seconds, fn, channels = 1) {
    const n = Math.max(1, Math.floor(seconds * this.sampleRate))
    const b = this.ctx.createBuffer(channels, n, this.sampleRate)
    for (let ch = 0; ch < channels; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < n; i++) d[i] = fn(i, i / this.sampleRate, ch)
    }
    return b
  }

  /** Cached looping noise buffer: 'white' | 'pink' | 'brown'. */
  noise(color = 'white', seconds = 4, seed = 1) {
    const key = color + seconds + ':' + seed
    if (this._noiseCache.has(key)) return this._noiseCache.get(key)
    const rnd = mulberry32(seed * 7919)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    const buf = this.makeBuffer(seconds, () => {
      const w = rnd() * 2 - 1
      if (color === 'white') return w * 0.5
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; return last * 3.5 }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
      const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
      b6 = w * 0.115926
      return p * 0.11
    })
    this._noiseCache.set(key, buf)
    return buf
  }

  _ir(name) {
    if (this._irCache.has(name)) return this._irCache.get(name)
    const p = REVERBS[name] || REVERBS.outdoor
    const sr = this.sampleRate
    const len = Math.ceil((p.decay + p.pre + 0.1) * sr)
    const buf = this.ctx.createBuffer(2, len, sr)
    const rnd = mulberry32(name.length * 131 + 7)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let lp = 0
      const pre = Math.floor(p.pre * sr)
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr
        const env = Math.exp((-6.9 * t) / p.decay)
        // high frequencies decay faster: one-pole lowpass whose cutoff closes over time
        const a = Math.min(0.98, (1 - p.bright) * 0.6 + t / p.decay * 0.5)
        const w = (rnd() * 2 - 1) * (rnd() < p.density ? 1 : 0)
        lp = lp * a + w * (1 - a)
        d[i] = lp * env * (1.4 - a)
      }
      for (const e of p.echoes) {
        const at = Math.floor((p.pre + e * (ch ? 1.07 : 1)) * sr)
        for (let k = 0; k < 90 && at + k < len; k++) d[at + k] += (rnd() * 2 - 1) * 0.55 * Math.exp(-k / 25) * Math.exp(-e * 3)
      }
    }
    this._irCache.set(name, buf)
    return buf
  }

  setReverb(name) {
    if (!this.ready || name === this.reverbName) return
    if (!REVERBS[name]) name = 'outdoor'
    this.reverbName = name
    const t = this.ctx.currentTime
    const p = REVERBS[name]
    if (this._revActive === 'A') {
      this.revB.buffer = this._ir(name)
      this.revGainB.gain.setTargetAtTime(p.wet, t, 0.25)
      this.revGainA.gain.setTargetAtTime(0, t, 0.25)
      this._revActive = 'B'
    } else {
      this.revA.buffer = this._ir(name)
      this.revGainA.gain.setTargetAtTime(p.wet, t, 0.25)
      this.revGainB.gain.setTargetAtTime(0, t, 0.25)
      this._revActive = 'A'
    }
  }

  // ---- registry ----------------------------------------------------------------------------
  /**
   * Register a procedural sound. factory(engine, opts) is called on play() and must return
   * { output: AudioNode, stop?(when), duration? }. The engine wires output through gain,
   * filters, panner and reverb send.
   */
  register(name, factory) { this.sounds.set(name, factory) }
  has(name) { return this.sounds.has(name) }

  /** Add a controller with update(dt, engine, game) — ambience directors, music, etc. */
  addController(c) { this.controllers.push(c) }

  /**
   * Play a registered sound.
   * opts: { pos: Vector3|[x,y,z] (omit for non-spatial), gain=1, bus='sfx', reverb=1 (send multiplier),
   *   refDistance=2, maxDistance=300, rolloff=1, occlude=true, loop (passed to factory), ...factory opts }
   * Returns an emitter handle { setPosition, setGain, stop, node }.
   */
  play(name, opts = {}) {
    if (!this.ready) return null
    const f = this.sounds.get(name)
    if (!f) { if (!this._warned?.has(name)) { (this._warned ||= new Set()).add(name); console.warn('Unknown sound', name) } return null }
    let src
    try { src = f(this, opts) } catch (e) { console.error('sound', name, e); return null }
    if (!src || !src.output) return null
    return this.connectSource(src, opts)
  }

  /** Wire an arbitrary source {output, stop?, duration?} into the spatial chain. */
  connectSource(src, opts = {}) {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = opts.gain ?? 1
    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 20000
    lpf.Q.value = 0.5
    src.output.connect(gain)
    gain.connect(lpf)
    let tail = lpf
    let panner = null
    const pos = opts.pos ? (Array.isArray(opts.pos) ? new THREE.Vector3(...opts.pos) : opts.pos.clone()) : null
    if (pos) {
      panner = ctx.createPanner()
      panner.panningModel = opts.hrtf ? 'HRTF' : 'equalpower'
      panner.distanceModel = 'inverse'
      panner.refDistance = opts.refDistance ?? 2
      panner.maxDistance = opts.maxDistance ?? 400
      panner.rolloffFactor = opts.rolloff ?? 1
      panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z
      lpf.connect(panner)
      tail = panner
    }
    const busName = opts.bus ?? 'sfx'
    tail.connect(this.bus[busName] || this.bus.sfx)
    const send = ctx.createGain()
    send.gain.value = (opts.reverb ?? 1)
    tail.connect(send)
    send.connect(this.reverbIn)
    const em = {
      src, gain, lpf, panner, send, pos, occlude: opts.occlude ?? true, occluded: 0,
      maxDistance: opts.maxDistance ?? 400, alive: true, baseCutoff: opts.cutoff ?? 20000,
      setPosition: (x, y, z) => {
        if (!em.pos) return
        em.pos.set(x, y, z)
        const t = ctx.currentTime
        panner.positionX.setTargetAtTime(x, t, 0.03); panner.positionY.setTargetAtTime(y, t, 0.03); panner.positionZ.setTargetAtTime(z, t, 0.03)
      },
      setGain: (g, tc = 0.1) => gain.gain.setTargetAtTime(g, ctx.currentTime, tc),
      setRate: r => { if (src.setRate) src.setRate(r) },
      stop: (fade = 0.05) => {
        if (!em.alive) return
        em.alive = false
        const t = ctx.currentTime
        gain.gain.setTargetAtTime(0, t, fade)
        setTimeout(() => {
          try { src.stop?.(ctx.currentTime) } catch { /* already stopped */ }
          try { gain.disconnect(); lpf.disconnect(); send.disconnect(); panner?.disconnect() } catch { /* ignore */ }
          this.emitters.delete(em)
        }, fade * 1000 * 6 + 50)
      },
    }
    if (pos) this.emitters.add(em)
    if (src.duration && !opts.loop) setTimeout(() => em.stop(0.02), (src.duration + (REVERBS[this.reverbName]?.decay ?? 1)) * 1000 + 200)
    return em
  }

  /** Footstep dispatch: content registers fn(engine, surface, info). */
  setFootstep(fn) { this.footstepFn = fn }
  footstep(surface, info) { if (this.ready && this.footstepFn) this.footstepFn(this, surface, info) }

  update(dt, camera, game) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const L = ctx.listener
    camera.getWorldDirection(_fwd)
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const p = camera.position
    this.listener.copy(p)
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02)
      L.forwardX.setTargetAtTime(_fwd.x, t, 0.02); L.forwardY.setTargetAtTime(_fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(_fwd.z, t, 0.02)
      L.upX.setTargetAtTime(_up.x, t, 0.02); L.upY.setTargetAtTime(_up.y, t, 0.02); L.upZ.setTargetAtTime(_up.z, t, 0.02)
    } else {
      L.setPosition(p.x, p.y, p.z)
      L.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z)
    }
    // air absorption + occlusion, a few emitters per frame
    this._occlTimer += dt
    const doOccl = this._occlTimer > 0.15
    if (doOccl) this._occlTimer = 0
    for (const em of this.emitters) {
      if (!em.alive || !em.pos) continue
      const d = em.pos.distanceTo(p)
      if (doOccl && em.occlude && game?.world && d < 120 && d > 1.5) {
        const free = game.world.lineOfSight(p.x, p.y, p.z, em.pos.x, em.pos.y, em.pos.z, 0.6)
        em.occluded += ((free ? 0 : 1) - em.occluded) * 0.6
      }
      const air = 18000 * Math.exp(-d / 90) + 900
      const occ = em.occlude ? 1 - em.occluded * 0.85 : 1
      const cutoff = Math.min(em.baseCutoff, air) * occ + 120
      em.lpf.frequency.setTargetAtTime(cutoff, t, 0.12)
    }
    const m = this.muffle
    this.muffleFilter.frequency.setTargetAtTime(m > 0 ? 20000 * Math.pow(0.03, m) + 200 : 20000, t, 0.15)
    for (const c of this.controllers) {
      try { c.update(dt, this, game) } catch (e) { console.error('audio controller', e) }
    }
  }
}
