// Doors, intercom (домофон), bells, elevator, garbage chute, radiators and pipes.

import { def } from '../registry.js'
import { tones, filt, addBurst, addModes, buf, thump, squeak, chirp, Biquad, Reso, Osc, TAU, smooth, diffuse, noiseFill, distant } from './lib.js'
import { Wander } from '../dsp.js'

/** Stick-slip creak through a set of body resonances (doors, hinges, swings). */
export function creak(d, sr, off, r, { dur = 1, rate0 = 60, rate1 = 160, modes = [[260, 50], [540, 70], [1150, 110], [2300, 180]], gain = 1, jitter = 0.35, burst = 0.25 } = {}) {
  const res = modes.map(([f, bw]) => new Reso(sr, f * r.range(0.95, 1.05), bw))
  const n = Math.min(d.length - off, Math.floor(dur * sr))
  const w = new Wander(r, sr, 6)
  const amp = new Wander(r, sr, 4)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const u = i / n
    const rate = (rate0 + (rate1 - rate0) * u) * (1 + jitter * w.next())
    ph += rate / sr
    let x = 0
    if (ph >= 1) { ph -= 1; x = 1 + r.bi() * 0.5 }
    x += r.bi() * 0.02
    const a = Math.max(0, 0.65 + 0.6 * amp.next()) * Math.sin(Math.PI * u) ** 0.6
    let y = 0
    for (let k = 0; k < res.length; k++) y += res[k].process(x) * (k === 0 ? 1 : 0.8)
    // resonators have unity DC gain → scale by bandwidth for a fair level
    d[off + i] += y * a * gain * 0.05
  }
  void burst
  return d
}

// ---- doors -----------------------------------------------------------------------------------

def('door_metal_open', {
  sr: 24000, variants: 3, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(1.6, sr)
    // lock release: soft «тук» + springing ajar
    thump(d, sr, Math.floor(0.01 * sr), { f: 75, dur: 0.05, gain: 0.5 })
    addModes(d, sr, Math.floor(0.012 * sr), [[r.range(1200, 1500), 0.12, 0.04], [r.range(2600, 3000), 0.06, 0.02]], 1, r)
    // handle / latch clack
    const h = Math.floor(r.range(0.09, 0.14) * sr)
    addBurst(d, sr, h, 0.004, r, { f: 3000, q: 1, gain: 0.6, tau: 0.001 })
    addModes(d, sr, h, [[r.range(900, 1100), 0.25, 0.06], [r.range(2300, 2600), 0.18, 0.04], [r.range(3800, 4300), 0.08, 0.02]], 1, r)
    // seal un-sticking
    addBurst(d, sr, h + Math.floor(0.06 * sr), 0.06, r, { type: 'lp', f: 500, gain: 0.35, tau: 0.02 })
    // hinge squeal while swinging
    const s0 = h + Math.floor(r.range(0.1, 0.18) * sr)
    creak(d, sr, s0, r, { dur: r.range(0.6, 1.0), rate0: r.range(90, 140), rate1: r.range(180, 300), modes: [[880, 40], [1760, 60], [2650, 90], [420, 60]], gain: r.range(0.35, 0.6), jitter: 0.2 })
    // the heavy panel's low body response to the motion
    addModes(d, sr, h, [[70, 0.08, 0.3], [140, 0.05, 0.2]], 1, r)
    return filt(d, sr, [['hp', 40, 0.7]])
  },
})

function steelSlam(d, sr, r, at, gain = 1) {
  addBurst(d, sr, at, 0.006, r, { type: 'lp', f: 6000, gain: 1.2 * gain, tau: 0.0015 })
  const k = r.range(0.94, 1.06)
  addModes(d, sr, at, [
    [70 * k, 0.9, 0.32], [71.3 * k, 0.4, 0.3], [140 * k, 0.6, 0.28], [230 * k, 0.5, 0.26], [232.5 * k, 0.25, 0.24],
    [390 * k, 0.4, 0.24], [620 * k, 0.32, 0.22], [1040 * k, 0.25, 0.2], [1043 * k, 0.12, 0.19], [1530 * k, 0.15, 0.15],
    [2210 * k, 0.09, 0.12], [3120 * k, 0.05, 0.09], [4400 * k, 0.03, 0.06],
  ], 0.55 * gain, r)
  thump(d, sr, at, { f: 52, dur: 0.12, gain: 0.9 * gain, drop: 1.8, attack: 0.002 })
  // latch tongue hitting the strike plate
  const l = at + Math.floor(r.range(0.008, 0.02) * sr)
  addModes(d, sr, l, [[r.range(1700, 2100), 0.3, 0.05], [r.range(2900, 3400), 0.2, 0.035], [r.range(4800, 5600), 0.1, 0.02]], gain, r)
  // loose handle rattle
  let t = l
  for (let i = 0; i < r.int(2, 4); i++) {
    t += Math.floor(r.range(0.025, 0.06) * sr)
    addModes(d, sr, t, [[r.range(1100, 1500), 0.12, 0.03], [r.range(2500, 3200), 0.08, 0.02]], gain * Math.exp(-i * 0.5), r)
  }
}

def('door_metal_slam', {
  sr: 24000, variants: 3, prio: 1, norm: { peak: 0.9 }, fadeOut: 200,
  gen(r, sr) {
    const d = buf(2.6, sr)
    steelSlam(d, sr, r, Math.floor(0.01 * sr))
    // tambour / stairwell body: a little baked diffuse reverb (the engine adds the zone reverb)
    diffuse(d, sr, 1.2, 2200, 0.32)
    return filt(d, sr, [['hp', 35, 0.7]])
  },
})

def('door_magnet_lock', {
  sr: 32000, variants: 2, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.6, sr)
    const at = Math.floor(0.005 * sr)
    // armature plate snapping onto the electromagnet: «КЛАК»
    addBurst(d, sr, at, 0.004, r, { f: 2500, q: 0.8, gain: 1, tau: 0.001 })
    addModes(d, sr, at, [[r.range(1150, 1300), 0.45, 0.07], [r.range(1900, 2200), 0.35, 0.05], [r.range(2900, 3300), 0.22, 0.035], [r.range(4300, 4800), 0.1, 0.02]], 1, r)
    thump(d, sr, at, { f: 70, dur: 0.06, gain: 0.8 })
    // second smaller contact bounce
    const b = at + Math.floor(r.range(0.012, 0.022) * sr)
    addModes(d, sr, b, [[r.range(1150, 1300), 0.15, 0.04], [r.range(2900, 3300), 0.1, 0.02]], 1, r)
    // faint 50 Hz magnet hum after engaging
    for (let i = Math.floor(0.03 * sr); i < d.length; i++) d[i] += Math.sin(TAU * 100 * i / sr) * 0.015 * Math.exp(-(i / sr - 0.03) / 0.15)
    return d
  },
})

def('door_wood', {
  sr: 24000, variants: 3, prio: 2, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(1.9, sr)
    creak(d, sr, Math.floor(0.03 * sr), r, { dur: r.range(0.9, 1.5), rate0: r.range(30, 60), rate1: r.range(110, 240), modes: [[r.range(230, 280), 45], [r.range(500, 600), 60], [r.range(1000, 1250), 90], [r.range(2100, 2600), 160]], gain: 3.2, jitter: 0.5 })
    if (v !== 1) {
      const at = Math.floor(r.range(1.45, 1.75) * sr)
      addBurst(d, sr, at, 0.005, r, { f: 1800, q: 1, gain: 0.12, tau: 0.0015 })
      addModes(d, sr, at, [[r.range(180, 220), 0.1, 0.08], [r.range(420, 480), 0.05, 0.05], [r.range(1500, 1800), 0.03, 0.02]], 1, r)
    }
    return filt(d, sr, [['hp', 70, 0.7]])
  },
})

// ---- intercom (домофон) -------------------------------------------------------------------------

function panelSpeaker(d, sr) { return filt(d, sr, [['hp', 450, 0.8], ['peak', 2200, 1.4, 5], ['peak', 3600, 3, 3], ['lp', 6500, 0.7]]) }

def('intercom_beep', {
  // v0-2 key beep, v3 key accepted, v4 «пи-пи-пи» lock open, v5 wrong key
  sr: 22050, variants: 6, prio: 1, norm: { peak: 0.7 },
  gen(r, sr, v) {
    let d
    if (v <= 2) { d = buf(0.1, sr); tones(d, sr, [{ t: 0.003, dur: 0.06, f: 2200 * (1 + (v - 1) * 0.003), gain: 0.5 }], { attack: 0.002, release: 0.004 }) } else if (v === 3) { d = buf(0.35, sr); tones(d, sr, [1047, 1319, 1568].map((f, i) => ({ t: 0.01 + i * 0.09, dur: 0.085, f, gain: 0.5 }))) } else if (v === 4) {
      d = buf(3.2, sr)
      const notes = []
      for (let t = 0.01; t < 3.0; t += 0.2) notes.push({ t, dur: 0.1, f: 2000, gain: 0.45 })
      tones(d, sr, notes)
    } else { d = buf(0.55, sr); tones(d, sr, [{ t: 0.01, dur: 0.5, f: 400, gain: 0.45 }], { pw: 0.3 }) }
    return panelSpeaker(d, sr)
  },
})

def('intercom_call', {
  sr: 22050, prio: 1, norm: { peak: 0.7 }, loop: 0.01,
  gen(r, sr) {
    const d = buf(1.41, sr)
    const notes = []
    for (let k = 0; k < 8; k++) notes.push({ t: 0.005 + k * 0.1, dur: 0.1, f: k % 2 ? 1600 : 1200, gain: 0.45, attack: 0.001, release: 0.001 })
    tones(d, sr, notes, { pw: 0.5 })
    return panelSpeaker(d, sr)
  },
})

def('doorbell', {
  // v0 electronic bird trill, v1 electromechanical bell «дзынь», v2 two-tone chime
  sr: 24000, variants: 3, prio: 2, norm: { peak: 0.8 },
  gen(r, sr, v) {
    const d = buf(1.8, sr)
    if (v === 0) {
      const o = new Osc(sr)
      const n = Math.floor(1.3 * sr)
      for (let i = 0; i < n; i++) {
        const t = i / sr
        const chirpPh = (t * 11) % 1
        const f = 1650 + 700 * Math.pow(1 - chirpPh, 2) + 120 * Math.sin(TAU * 34 * t)
        const e = Math.min(1, t / 0.01, (1.3 - t) / 0.05) * (0.6 + 0.4 * Math.sin(Math.PI * chirpPh))
        d[i] += o.square(f, 0.4) * e * 0.35
      }
      filt(d, sr, [['hp', 500, 0.8], ['peak', 2400, 1.5, 4], ['lp', 5500, 0.7]])
    } else if (v === 1) {
      const strikes = Math.floor(1.1 * 24)
      for (let k = 0; k < strikes; k++) {
        const at = Math.floor((0.01 + k / 24) * sr)
        addModes(d, sr, at, [[1880, 0.35, 0.25], [1893, 0.2, 0.25], [2610, 0.18, 0.18], [4320, 0.1, 0.1], [5130, 0.05, 0.06]], 0.5, r)
        addBurst(d, sr, at, 0.003, r, { f: 3500, q: 1, gain: 0.15, tau: 0.001 })
      }
    } else {
      tones(d, sr, [{ t: 0.01, dur: 0.7, f: 784, gain: 0.5, release: 0.5 }, { t: 0.55, dur: 1.1, f: 622, gain: 0.5, release: 0.9 }], { wave: 'sine', attack: 0.003 })
      for (let i = 0; i < d.length; i++) d[i] += 0
    }
    // heard from the landing: the bell is inside the flat
    return filt(d, sr, [['lp', 3000, 0.7], ['peak', 400, 1, 2]])
  },
})

// ---- elevator --------------------------------------------------------------------------------

function relays(d, sr, r, off, count, gain = 1) {
  let t = off
  for (let k = 0; k < count; k++) {
    t += Math.floor(r.range(0.01, 0.08) * sr)
    addBurst(d, sr, t, 0.002, r, { f: r.range(2000, 5000), q: 1.5, gain: gain * r.range(0.4, 1), tau: 0.0006 })
    addModes(d, sr, t, [[r.range(1400, 2600), 0.15 * gain, 0.015]], 1, r)
  }
  return t
}

def('elevator_call', {
  sr: 22050, variants: 3, prio: 1, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(1.8, sr)
    // the plastic button: press + release clack
    const a = Math.floor(0.004 * sr)
    addBurst(d, sr, a, 0.003, r, { f: 2600, q: 1, gain: 0.8, tau: 0.0008 })
    addModes(d, sr, a, [[r.range(1300, 1600), 0.3, 0.012], [r.range(3200, 3800), 0.12, 0.008]], 1, r)
    thump(d, sr, a, { f: 200, dur: 0.006, gain: 0.3 })
    const b = a + Math.floor(r.range(0.09, 0.16) * sr)
    addBurst(d, sr, b, 0.003, r, { f: 2200, q: 1, gain: 0.45, tau: 0.0008 })
    // machine room above: relay cascade then brake solenoid, carried down the shaft (muffled)
    const far = buf(1.8, sr)
    const end = relays(far, sr, r, Math.floor(r.range(0.25, 0.45) * sr), r.int(4, 10), 0.6)
    const sol = end + Math.floor(r.range(0.1, 0.3) * sr)
    thump(far, sr, sol, { f: 70, dur: 0.06, gain: 0.7 })
    addModes(far, sr, sol, [[1500, 0.25, 0.05], [2300, 0.1, 0.03]], 1, r)
    filt(far, sr, [['lp', 1600, 0.7]])
    for (let i = 0; i < d.length; i++) d[i] += far[i] * 0.55
    return d
  },
})

function elevDoor(r, sr, close) {
  const d = buf(2.3, sr)
  const o = new Osc(sr)
  const whirLen = r.range(1.2, 1.6)
  const lp = new Biquad(sr, 'lp', 1400, 0.8), rum = new Biquad(sr, 'lp', 300, 0.7)
  const n = Math.floor(whirLen * sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / whirLen
    const f = 150 + 100 * Math.sin(Math.PI * Math.min(1, u * 1.1)) // ramps up then slows
    const e = Math.min(1, t / 0.08, (whirLen - t) / 0.1)
    const roller = rum.process(r.bi()) * (0.6 + 0.4 * Math.sin(TAU * 31 * t))
    d[i] += (lp.process(o.saw(f)) * 0.22 + roller * 0.7) * e
  }
  // little rattles of the door panels on their rollers
  for (let k = 0; k < r.int(4, 8); k++) addModes(d, sr, Math.floor(r.range(0.05, whirLen) * sr), [[r.range(700, 1200), 0.05, 0.03], [r.range(1800, 2600), 0.04, 0.02]], 1, r)
  const end = Math.floor(whirLen * sr)
  const g = close ? 1 : 0.45
  addBurst(d, sr, end, 0.005, r, { type: 'lp', f: 4000, gain: 0.7 * g, tau: 0.0015 })
  addModes(d, sr, end, [[180, 0.5, 0.35], [410, 0.35, 0.25], [760, 0.25, 0.18], [1340, 0.1, 0.1]], g, r)
  thump(d, sr, end, { f: 80, dur: 0.05, gain: 0.6 * g })
  return d
}
def('elevator_doors', {
  // even variants open, odd variants close (bang at the end)
  sr: 22050, variants: 4, prio: 1, norm: { peak: 0.85 },
  gen(r, sr, v) { return elevDoor(r, sr, v % 2 === 1) },
})

def('elevator_motor', {
  sr: 16000, prio: 1, norm: { rms: 0.16 }, loop: 0.3,
  gen(r, sr) {
    const len = 8.4, x = 0.3
    const d = buf(len + x, sr)
    const rattle = new Biquad(sr, 'lp', 220, 0.7), wind = new Biquad(sr, 'bp', 700, 0.7)
    const w = new Wander(r, sr, 0.7)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const am = 1 + 0.05 * w.next()
      const hum = Math.sin(TAU * 100 * t) * 0.5 + Math.sin(TAU * 200 * t) * 0.18 + Math.sin(TAU * 300 * t) * 0.09 + Math.sin(TAU * 50 * t) * 0.12
      const whine = Math.sin(TAU * 640 * t + 0.3 * Math.sin(TAU * 0.8 * t)) * 0.06
      const rumble = rattle.process(r.bi()) * 1.6 * (0.7 + 0.3 * Math.sin(TAU * 13 * t))
      d[i] = (hum * 0.6 + whine) * am + rumble + wind.process(r.bi()) * 0.05
    }
    // guide shoes clicking over rail joints, one per floor (2.8 s)
    for (let k = 0; k < 4; k++) {
      const at = Math.floor((0.9 + k * 2.8) * sr)
      if (at >= d.length) continue
      addModes(d, sr, at, [[r.range(380, 460), 0.4, 0.06], [r.range(900, 1100), 0.2, 0.04]], 1, r)
      thump(d, sr, at, { f: 90, dur: 0.03, gain: 0.5 })
    }
    // random cable/cab rattles
    for (let k = 0; k < 9; k++) addModes(d, sr, Math.floor(r() * (d.length - sr * 0.1)), [[r.range(600, 1400), 0.08, 0.03], [r.range(1800, 2600), 0.05, 0.02]], 1, r)
    return d
  },
})

def('elevator_stop', {
  sr: 22050, variants: 2, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(1.8, sr)
    // two-speed motor drops to low speed: hum glides down
    let ph = 0
    const n = Math.floor(0.7 * sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = t / 0.7
      const f = 100 * Math.pow(0.3, u)
      ph += (TAU * f) / sr
      d[i] += (Math.sin(ph) + 0.4 * Math.sin(2 * ph)) * 0.25 * (1 - u) * Math.min(1, t / 0.02)
    }
    const at = Math.floor(r.range(0.6, 0.75) * sr)
    // the stop «бух» and the cab settling on its springs
    thump(d, sr, at, { f: 58, dur: 0.1, gain: 1, drop: 1.6 })
    addBurst(d, sr, at, 0.02, r, { type: 'lp', f: 800, gain: 0.5, tau: 0.008 })
    addModes(d, sr, at, [[r.range(240, 280), 0.2, 0.12], [r.range(520, 600), 0.12, 0.08], [r.range(1100, 1300), 0.08, 0.05]], 1, r)
    // brake solenoid clack + a relay or two
    const b = at + Math.floor(r.range(0.05, 0.12) * sr)
    addModes(d, sr, b, [[1500, 0.3, 0.05], [2300, 0.15, 0.03]], 1, r)
    thump(d, sr, b, { f: 70, dur: 0.04, gain: 0.4 })
    relays(d, sr, r, b + Math.floor(0.15 * sr), r.int(2, 4), 0.35)
    return d
  },
})

// ---- pipes, chute, radiators -------------------------------------------------------------------

def('garbage_chute', {
  sr: 22050, variants: 3, prio: 3, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const len = r.range(3.8, 5)
    const d = buf(len, sr)
    let t0 = 0.05
    if (v !== 2) { // hopper hinge squeal then its clang
      const sq = buf(0.5, sr)
      creak(sq, sr, 0, r, { dur: 0.32, rate0: 300, rate1: 520, modes: [[1500, 60], [2600, 90]], gain: 0.8, jitter: 0.15 })
      for (let i = 0; i < sq.length; i++) d[i] += sq[i]
      t0 = 0.4
      addModes(d, sr, Math.floor(t0 * sr), [[r.range(300, 360), 0.4, 0.4], [r.range(820, 900), 0.3, 0.3], [r.range(1500, 1700), 0.15, 0.2]], 1, r)
      t0 += 0.25
    }
    // the bag tumbling down 9–17 floors: impacts get sparser, darker and quieter
    const fall = r.range(2.0, 3.4)
    const lp = new Biquad(sr, 'lp', 3000, 0.7)
    const tmp = buf(len, sr)
    let t = t0
    while (t < t0 + fall) {
      const u = (t - t0) / fall
      const g = Math.exp(-u * 2.2) * r.range(0.3, 1)
      const at = Math.floor(t * sr)
      addModes(tmp, sr, at, [[r.range(380, 460), 0.5 * g, 0.12], [r.range(950, 1150), 0.3 * g, 0.08], [r.range(1900, 2400), 0.15 * g, 0.04]], 1, r)
      addBurst(tmp, sr, at, 0.02, r, { type: 'lp', f: 1200, gain: 0.4 * g, tau: 0.006 })
      if (v === 1 && r.chance(0.08)) addModes(tmp, sr, at, [[r.range(3000, 5000), 0.2 * g, 0.05], [r.range(5200, 7000), 0.15 * g, 0.03]], 1, r)
      t += 1 / r.range(10, 25)
    }
    for (let i = 0; i < tmp.length; i++) {
      const u = Math.min(1, Math.max(0, (i / sr - t0) / fall))
      if ((i & 15) === 0) lp.set('lp', 3000 * Math.pow(500 / 3000, u), 0.7)
      d[i] += lp.process(tmp[i])
    }
    thump(d, sr, Math.floor((t0 + fall + 0.05) * sr), { f: 70, dur: 0.12, gain: 0.5 })
    // heard through the stairwell walls
    return filt(d, sr, [['lp', 2600, 0.6]])
  },
})

def('radiator_knock', {
  // v0-2: a neighbour tapping the riser with a key; v3: thermal expansion ticks
  sr: 22050, variants: 4, prio: 3, norm: { peak: 0.8 },
  gen(r, sr, v) {
    const d = buf(2.6, sr)
    if (v < 3) {
      const hits = r.int(3, 5)
      const f = r.range(800, 1300)
      for (let k = 0; k < hits; k++) {
        const at = Math.floor((0.02 + k * r.range(0.22, 0.28)) * sr)
        addBurst(d, sr, at, 0.003, r, { f: 3000, q: 0.8, gain: 0.8, tau: 0.0008 })
        addModes(d, sr, at, [[f, 0.5, 0.42], [f * 1.004, 0.2, 0.38], [f * 2.76, 0.25, 0.22], [f * 5.4, 0.1, 0.09], [f * 0.42, 0.15, 0.2], [f * 1.63, 0.1, 0.15]], 1, r)
      }
      return filt(d, sr, [['lp', 3200, 0.7]])
    }
    let t = 0.02
    for (let k = 0; k < r.int(5, 9); k++) {
      addBurst(d, sr, Math.floor(t * sr), 0.0015, r, { f: 3000, q: 2, gain: r.range(0.3, 1), tau: 0.0004 })
      addModes(d, sr, Math.floor(t * sr), [[r.range(1800, 2600), 0.12, 0.03]], 1, r)
      t += r.range(0.05, 0.35)
    }
    return d
  },
})

def('water_pipe', {
  sr: 16000, prio: 3, norm: { rms: 0.14 }, loop: 0.6,
  gen(r, sr) {
    const len = 12, x = 0.6
    const d = buf(len + x, sr)
    const lp = new Biquad(sr, 'lp', 900, 0.7), bp = new Biquad(sr, 'bp', 450, 1.2)
    const w = new Wander(r, sr, 0.25), w2 = new Wander(r, sr, 3)
    for (let i = 0; i < d.length; i++) {
      const s = 0.55 + 0.35 * w.next() + 0.1 * w2.next()
      const nz = r.bi()
      d[i] = lp.process(nz) * s * 1.2 + bp.process(nz) * s * s * 0.4
    }
    // gurgles: bursts of rising chirps (air in the riser)
    let t = 0.3
    while (t < len + x - 0.5) {
      const nb = r.int(2, 9)
      for (let k = 0; k < nb; k++) chirp(d, sr, Math.floor((t + k * r.range(0.05, 0.2)) * sr), { f0: r.range(280, 420), f1: r.range(800, 1300), dur: r.range(0.012, 0.03), gain: r.range(0.08, 0.25) })
      t += r.range(0.8, 3.0)
    }
    return filt(d, sr, [['lp', 1800, 0.7], ['hp', 60, 0.7]])
  },
})

export { smooth, noiseFill, distant }

// ---- neighbours -----------------------------------------------------------------------------

def('neighbour_drill', {
  // a перфоратор somewhere in the building (allowed 9:00–21:00, and everybody knows it):
  // rotary-hammer impacts at ~40–50 per second with the motor whine spinning up and down, in
  // 2–4 bursts, carried through floors of reinforced concrete
  sr: 11025, variants: 2, prio: 7, lazy: true, norm: { peak: 0.85 }, maxDur: 10.8,
  gen(r, sr) {
    const len = r.range(7, 10)
    const d = buf(len + 0.6, sr)
    const fImp = r.range(38, 50)
    const fWhine = r.range(1050, 1350)
    let t = r.range(0.1, 0.4)
    while (t < len - 1) {
      const L = Math.min(len - 0.4 - t, r.range(1.4, 4))
      const n = Math.floor(L * fImp)
      for (let k = 0; k < n; k++) {
        const u = k / fImp
        const env = Math.min(1, u / 0.15, (L - u) / 0.1) * r.range(0.8, 1)
        const at = Math.floor((t + u + r.range(-0.002, 0.002)) * sr)
        thump(d, sr, at, { f: r.range(90, 130), dur: 0.008, gain: 0.5 * env, drop: 1.3, attack: 0.0005 })
        addBurst(d, sr, at, 0.004, r, { f: 900, q: 1, gain: 0.22 * env, tau: 0.0015 })
      }
      // the motor: a saw whine that spins up, holds, spins down
      const o = new Osc(sr)
      const i0 = Math.floor(t * sr), i1 = Math.min(d.length, Math.floor((t + L) * sr))
      for (let i = i0; i < i1; i++) {
        const spin = Math.min(1, (i - i0) / sr / 0.25) * Math.min(1, (i1 - i) / sr / 0.2)
        d[i] += o.saw(fWhine * (0.6 + 0.4 * spin)) * 0.035 * spin
      }
      t += L + r.range(0.6, 2.2)
    }
    return filt(d, sr, [['lp', 1400, 0.7], ['peak', 120, 1.2, 6], ['peak', 260, 1.5, 3], ['hp', 50, 0.7]])
  },
})

def('wind_rattle', {
  // a loose sheet of roof tin / balcony cladding banging in a strong gust: clusters of hits on a
  // thin metal plate (inharmonic plate modes), heard across a courtyard with its flutter echo
  sr: 16000, variants: 4, prio: 6, norm: { peak: 0.85 }, maxDur: 4,
  gen(r, sr) {
    const len = r.range(1.0, 2.2)
    const d = buf(len + 1.4, sr)
    const base = r.range(150, 260)
    // thin, loosely fixed tin: heavily damped modes (a rattle, not a bell)
    const modes = [[base, 0.45, 0.07], [base * 2.31, 0.35, 0.055], [base * 3.93, 0.25, 0.04], [base * 6.17, 0.14, 0.03], [base * 9.1, 0.08, 0.02]]
    let t = 0.02
    for (let k = 0, n = r.int(3, 9); k < n && t < len; k++) {
      const g = r.range(0.4, 1)
      const at = Math.floor(t * sr)
      addBurst(d, sr, at, 0.02, r, { f: r.range(500, 1600), q: 0.8, gain: g * 0.75, tau: 0.005 })
      addModes(d, sr, at, modes.map(([f, a, dc]) => [f * r.range(0.97, 1.03), a * g, dc]), 0.5, r)
      t += r.chance(0.6) ? r.range(0.05, 0.14) : r.range(0.2, 0.45) // flapping clusters
    }
    return distant(d, sr, 30)
  },
})
