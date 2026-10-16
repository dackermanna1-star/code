// Sparse ambient music, synthesized live from a seed: soft analog drones, detuned pads with
// tape wobble and flutter, a degraded melancholic melody fragment (square/triangle lead through
// a lowpass) whose reverb tail is bit-crushed — cheap late-2000s electronics remembered badly.
// buildPiece() works on any BaseAudioContext (the test harness renders it offline).

import { makeRng, mtof } from './dsp.js'

const PROGS = [
  [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], // i VI III VII
  [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 10, 14]], // i iv VI v
  [[0, 3, 7], [10, 14, 17], [8, 12, 15], [10, 14, 17]], // i VII VI VII
  [[0, 3, 7], [8, 12, 15], [5, 8, 12], [0, 3, 7]], // i VI iv i
  [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [8, 12, 15, 19]], // i7 iv7 IIImaj7 VImaj7
]
const ROOTS = [38, 40, 42, 45, 36, 41]
const PENTA = [0, 3, 5, 7, 10]

function makeIR(ctx, seconds, r) {
  const sr = ctx.sampleRate
  const n = Math.floor(seconds * sr)
  const b = ctx.createBuffer(2, n, sr)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const a = Math.min(0.97, 0.55 + t / seconds * 0.4)
      lp = lp * a + (r() * 2 - 1) * (1 - a)
      d[i] = lp * Math.exp(-4.2 * t / seconds) * 2.2
    }
  }
  return b
}

function crushCurve(bits = 5) {
  const n = 2048
  const c = new Float32Array(n)
  const q = Math.pow(2, bits - 1)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.round(x * q) / q
  }
  return c
}
function tapeCurve() {
  const n = 1024
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6) }
  return c
}

// Per-context caches: the reverb IR (≈ 0.5 M samples) and the tape-hiss buffer are the expensive
// parts of a piece; they are made once (prewarmMusic during idle time) and shared by every piece.
const CACHE = new WeakMap()
function cacheFor(ctx) {
  let c = CACHE.get(ctx)
  if (!c) {
    const r = makeRng(0x7a9e)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const nd = nb.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1
    c = { ir: makeIR(ctx, 5.5, r), hiss: nb, curves: new Map() }
    CACHE.set(ctx, c)
  }
  return c
}
/** Make the shared buffers ahead of the first piece (call in idle time). */
export function prewarmMusic(ctx) { try { cacheFor(ctx) } catch { /* optional */ } }

/**
 * Build a piece on ctx into dest starting at t0. Returns
 * { duration, output (GainNode), pump(horizon), stop(fade), dispose() }.
 * Only the constant part of the graph (drone, buses, LFOs) is created here; the chords and melody
 * notes are created just in time by pump(horizon) — call it every ~0.1 s with
 * ctx.currentTime + a few seconds (opts.lazy = true), so starting a piece costs a few ms instead
 * of building hundreds of nodes in one frame. Without opts.lazy everything is scheduled at once
 * (offline rendering).
 */
export function buildPiece(ctx, dest, seed, t0 = ctx.currentTime + 0.1, opts = {}) {
  const r = makeRng(seed)
  const C = cacheFor(ctx)
  const dur = opts.duration ?? r.range(65, 175)
  const end = t0 + dur
  const nodes = []
  const reg = n => { nodes.push(n); return n }
  // nodes of finished notes are released as the piece goes (keeps the graph small on long pieces)
  const transient = []
  const regT = (n, until) => { transient.push([until, n]); return n }

  const out = reg(ctx.createGain())
  out.gain.value = 0
  const fadeIn = r.range(9, 15), fadeOut = r.range(12, 20)
  out.gain.setValueAtTime(0, t0)
  out.gain.linearRampToValueAtTime(opts.level ?? 1, t0 + fadeIn)
  out.gain.setValueAtTime(opts.level ?? 1, end - fadeOut)
  out.gain.linearRampToValueAtTime(0, end)
  const tape = reg(ctx.createWaveShaper()); tape.curve = tapeCurve()
  const master = reg(ctx.createBiquadFilter()); master.type = 'lowpass'; master.frequency.value = r.range(4500, 7000); master.Q.value = 0.5
  const pre = reg(ctx.createGain()); pre.gain.value = 0.5
  pre.connect(tape); tape.connect(master); master.connect(out); out.connect(dest)

  // reverb with a bit-crushed, darkened tail
  const revIn = reg(ctx.createGain())
  const conv = reg(ctx.createConvolver()); conv.normalize = true; conv.buffer = C.ir
  const bits = r.int(4, 6)
  if (!C.curves.has(bits)) C.curves.set(bits, crushCurve(bits))
  const crush = reg(ctx.createWaveShaper()); crush.curve = C.curves.get(bits)
  const revLP = reg(ctx.createBiquadFilter()); revLP.type = 'lowpass'; revLP.frequency.value = 2400
  const revOut = reg(ctx.createGain()); revOut.gain.value = 0.55
  revIn.connect(conv); conv.connect(crush); crush.connect(revLP); revLP.connect(revOut); revOut.connect(pre)

  // tape wobble (slow) + flutter (fast) → detune of every oscillator (cents)
  const wob = reg(ctx.createOscillator()); wob.frequency.value = r.range(0.25, 0.5)
  const wobG = reg(ctx.createGain()); wobG.gain.value = r.range(5, 11)
  const flu = reg(ctx.createOscillator()); flu.frequency.value = r.range(4.5, 7)
  const fluG = reg(ctx.createGain()); fluG.gain.value = r.range(1, 2.5)
  wob.connect(wobG); flu.connect(fluG)
  const addOsc = (type, freq, start, stop, transientNode = false) => {
    const o = transientNode ? regT(ctx.createOscillator(), stop) : reg(ctx.createOscillator())
    o.type = type
    o.frequency.value = freq
    wobG.connect(o.detune); fluG.connect(o.detune)
    o.start(start); o.stop(stop)
    return o
  }
  wob.start(t0); flu.start(t0); wob.stop(end + 0.1); flu.stop(end + 0.1)

  const root = r.pick(ROOTS)
  const prog = r.pick(PROGS)

  // drone: root (triangle + saw) through a slowly breathing lowpass, plus a late fifth
  const dLP = reg(ctx.createBiquadFilter()); dLP.type = 'lowpass'; dLP.frequency.value = 320; dLP.Q.value = 0.9
  const dLfo = reg(ctx.createOscillator()); dLfo.frequency.value = r.range(0.03, 0.07)
  const dLfoG = reg(ctx.createGain()); dLfoG.gain.value = 140
  dLfo.connect(dLfoG); dLfoG.connect(dLP.frequency); dLfo.start(t0); dLfo.stop(end + 0.1)
  const dG = reg(ctx.createGain()); dG.gain.value = 0.075
  dLP.connect(dG); dG.connect(pre)
  const dSend = reg(ctx.createGain()); dSend.gain.value = 0.15; dG.connect(dSend); dSend.connect(revIn)
  addOsc('triangle', mtof(root + 12), t0, end).connect(dLP)
  const ds = addOsc('sawtooth', mtof(root) * 1.003, t0, end)
  const dsG = reg(ctx.createGain()); dsG.gain.value = 0.3; ds.connect(dsG); dsG.connect(dLP)
  const fifth = addOsc('triangle', mtof(root + 7), t0 + dur * 0.3, end)
  const fG = reg(ctx.createGain()); fG.gain.setValueAtTime(0, t0 + dur * 0.3); fG.gain.linearRampToValueAtTime(0.5, t0 + dur * 0.3 + 12)
  fifth.connect(fG); fG.connect(dLP)

  // the timed events (chords, melody notes), created by pump() shortly before they sound
  const events = [] // [startTime, fn]

  // pads: chord changes every 8–14 s, slow swells, overlapping
  const cd = r.range(8, 14)
  const padLP = reg(ctx.createBiquadFilter()); padLP.type = 'lowpass'; padLP.frequency.value = r.range(900, 1400); padLP.Q.value = 0.6
  const padG = reg(ctx.createGain()); padG.gain.value = 0.1
  padLP.connect(padG); padG.connect(pre)
  const padSend = reg(ctx.createGain()); padSend.gain.value = 0.35; padG.connect(padSend); padSend.connect(revIn)
  let ci = 0
  const padStart = t0 + r.range(2, 8)
  for (let t = padStart; t < end - 6; t += cd) {
    const ch = prog[ci++ % prog.length]
    const a = r.range(3, 5), rel = 6
    events.push([t, () => {
      const stopAt = Math.min(end, t + cd + rel + 0.1)
      const g = regT(ctx.createGain(), stopAt)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + a)
      g.gain.setValueAtTime(1, t + cd)
      g.gain.linearRampToValueAtTime(0, t + cd + rel)
      g.connect(padLP)
      for (const iv of ch) {
        const m = root + 12 + iv + (iv > 12 ? -12 : 0)
        for (const det of [-7, 7]) {
          const o = addOsc('sawtooth', mtof(m), t, stopAt, true)
          o.detune.value = det
          let tail = o
          if (ctx.createStereoPanner) { const p = regT(ctx.createStereoPanner(), stopAt); p.pan.value = det < 0 ? -0.5 : 0.5; o.connect(p); tail = p }
          const og = regT(ctx.createGain(), stopAt); og.gain.value = 0.25
          tail.connect(og); og.connect(g)
        }
      }
    }])
  }

  // melody fragment: a few pentatonic notes, repeated with variations, degraded
  const beat = r.range(0.85, 1.25)
  const motif = []
  const nNotes = r.int(4, 7)
  let deg = r.int(0, 4)
  for (let k = 0; k < nNotes; k++) {
    deg = Math.max(0, Math.min(9, deg + r.pick([-2, -1, -1, 1, 1, 2, 0])))
    motif.push({ m: root + 24 + PENTA[deg % 5] + 12 * Math.floor(deg / 5), len: r.pick([1, 1, 1.5, 2, 0.5]) })
  }
  const lead = reg(ctx.createBiquadFilter()); lead.type = 'lowpass'; lead.frequency.value = r.range(1400, 2200); lead.Q.value = 1.2
  const leadG = reg(ctx.createGain()); leadG.gain.value = 0.14
  lead.connect(leadG); leadG.connect(pre)
  const leadSend = reg(ctx.createGain()); leadSend.gain.value = 0.7; leadG.connect(leadSend); leadSend.connect(revIn)
  const leadType = r.chance(0.55) ? 'square' : 'triangle'
  const reps = r.int(1, 3)
  let mt = t0 + r.range(18, 35)
  for (let rep = 0; rep < reps && mt < end - 20; rep++) {
    for (const nt of motif) {
      if (rep > 0 && r.chance(0.2)) { mt += nt.len * beat; continue } // a note missing, as if remembered wrongly
      const len = nt.len * beat
      const freq = mtof(nt.m + (rep === 2 && r.chance(0.3) ? -12 : 0))
      const sag = r.chance(0.15)
      const at = mt
      events.push([at, () => {
        const o = addOsc(leadType, freq, at, at + len + 0.6, true)
        if (sag) o.detune.setTargetAtTime(-35, at + len * 0.5, 0.3) // tape sag
        const g = regT(ctx.createGain(), at + len + 0.6)
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(leadType === 'square' ? 0.5 : 0.9, at + 0.04)
        g.gain.setTargetAtTime(0.3, at + 0.05, len * 0.5)
        g.gain.setTargetAtTime(0, at + len, 0.15)
        o.connect(g); g.connect(lead)
      }])
      mt += len
    }
    mt += r.range(8, 20)
  }
  events.sort((x, y) => x[0] - y[0])

  // tape hiss
  const hiss = reg(ctx.createBufferSource()); hiss.buffer = C.hiss; hiss.loop = true
  const hHP = reg(ctx.createBiquadFilter()); hHP.type = 'highpass'; hHP.frequency.value = 3500
  const hG = reg(ctx.createGain()); hG.gain.value = 0.006
  hiss.connect(hHP); hHP.connect(hG); hG.connect(out)
  hiss.start(t0, r() * 1.5); hiss.stop(end + 0.1)

  let stopped = false
  let ei = 0
  const piece = {
    duration: dur,
    output: out,
    /** Create the events that start before `horizon` (s, context time); release finished notes. */
    pump(horizon) {
      if (stopped) return
      const now = ctx.currentTime
      while (ei < events.length && events[ei][0] < horizon) {
        // a note whose start already passed (the game was paused) is dropped: starting it late
        // would jump its envelope (a click)
        if (events[ei][0] >= now - 0.05) { try { events[ei][1]() } catch { /* skip a note */ } }
        ei++
      }
      for (let i = transient.length - 1; i >= 0; i--) {
        if (transient[i][0] + 0.5 < now) { try { transient[i][1].disconnect() } catch { /* ignore */ } transient.splice(i, 1) }
      }
    },
    stop(fade = 4) {
      if (stopped) return
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(out.gain.value, t)
      out.gain.linearRampToValueAtTime(0, t + fade)
      stopped = true
      setTimeout(() => piece.dispose(), (fade + 0.5) * 1000)
    },
    dispose() {
      stopped = true
      for (const n of nodes) { try { n.stop?.() } catch { /* not started / already stopped */ } try { n.disconnect() } catch { /* ignore */ } }
      for (const [, n] of transient) { try { n.stop?.() } catch { /* ignore */ } try { n.disconnect() } catch { /* ignore */ } }
      nodes.length = 0
      transient.length = 0
    },
  }
  if (!opts.lazy) piece.pump(Infinity)
  return piece
}
