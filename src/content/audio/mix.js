// Mix inserts on top of the engine's master chain (no engine edits; rewired at runtime):
//
//   world buses + zone reverb → master → [duck] → [snow shelf] → muffle → compressor → out
//   ui bus (phone in hand, menu) → [ui out: master volume] ──────→ muffle   (bypasses duck + shelf)
//   foley (own footsteps, breath) ───────────────────────────────→ muffle   (bypasses duck + shelf)
//   foley reverb send → private convolvers, one per reverb kind (engine IRs, crossfaded on zone
//                       change; prepared once each, unused ones are taken off the graph) → foley
//
// The duck lets silence events and silence zones pull the whole world down to near-silence
// while the player's own footsteps, breathing and the phone in their hand stay. The shelf is the
// snow-absorption rule (fresh snow eats everything above ~3 kHz outdoors).

const MIX = new WeakMap()

export function getMix(engine) {
  if (!engine?.ctx) return null
  let m = MIX.get(engine.ctx)
  if (m) return m
  const ctx = engine.ctx
  m = { engine, ok: false, revName: null, convs: new Map(), foleyVol: -1 }
  m.duck = ctx.createGain()
  m.shelf = ctx.createBiquadFilter()
  m.shelf.type = 'highshelf'
  m.shelf.frequency.value = 3000
  m.shelf.gain.value = 0
  m.foley = ctx.createGain()
  m.foley.gain.value = (engine.volumes?.master ?? 0.9) * (engine.volumes?.sfx ?? 1)
  m.foleySend = ctx.createGain()
  m.uiOut = ctx.createGain()
  m.uiOut.gain.value = engine.volumes?.master ?? 0.9
  try {
    if (engine.master && engine.muffleFilter) {
      engine.master.disconnect()
      engine.master.connect(m.duck)
      m.duck.connect(m.shelf)
      m.shelf.connect(engine.muffleFilter)
      m.foley.connect(engine.muffleFilter)
      m.ok = true
      // the phone in the player's hand is not part of the world: a silence event must not mute
      // its key beeps, and the snow does not muffle it
      if (engine.bus?.ui) {
        engine.bus.ui.disconnect()
        engine.bus.ui.connect(m.uiOut)
        m.uiOut.connect(engine.muffleFilter)
        m.uiBypass = true
      }
    }
  } catch (e) {
    console.warn('[audio] mix insert failed', e)
    try { engine.master.connect(engine.muffleFilter) } catch { /* ignore */ }
  }
  if (!m.ok) { // fall back: foley through the normal sfx bus, no duck
    try { m.foley.connect(engine.bus?.sfx ?? ctx.destination) } catch { /* ignore */ }
  }
  // foley reverb: own convolvers fed with the engine's IRs
  if (typeof engine._ir === 'function') {
    m.hasIR = true
    setFoleyReverb(m, engine.reverbName || 'outdoor', true)
  } else if (engine.reverbIn) m.foleySend.connect(engine.reverbIn)
  if (engine.bus && !engine.bus.foley) engine.bus.foley = m.foley
  MIX.set(engine.ctx, m)
  return m
}

const WET = { outdoor: 0.16, courtyard: 0.26, park: 0.08, stairwell: 0.42, underpass: 0.45, metro: 0.45, tunnel: 0.5, shop: 0.14, room: 0.2, elevator: 0.25, hall: 0.3 }

export function setFoleyReverb(m, name, instant = false) {
  if (!m?.hasIR || name === m.revName) return
  const e = m.engine
  const ctx = e.ctx
  // one convolver per reverb kind: assigning an IR to a ConvolverNode FFT-partitions it on the
  // main thread, so each kind is prepared once and then only (re)connected
  let c = m.convs.get(name)
  if (!c) {
    let ir
    try { ir = e._ir(name) } catch { return }
    c = { conv: ctx.createConvolver(), g: ctx.createGain(), on: false, timer: 0 }
    c.conv.buffer = ir
    c.g.gain.value = 0
    c.conv.connect(c.g)
    m.convs.set(name, c)
  }
  m.revName = name
  const t = ctx.currentTime
  const tc = instant ? 0.01 : 0.25
  clearTimeout(c.timer)
  if (!c.on) { m.foleySend.connect(c.conv); c.g.connect(m.foley); c.on = true }
  c.g.gain.setTargetAtTime((WET[name] ?? 0.2) * 1.1, t, tc)
  for (const [k, o] of m.convs) {
    if (k === name || !o.on) continue
    o.g.gain.setTargetAtTime(0, t, tc)
    // once faded, take it off the graph (a disconnected convolver costs no CPU)
    clearTimeout(o.timer)
    o.timer = setTimeout(() => {
      if (m.revName === k || !o.on) return
      try { m.foleySend.disconnect(o.conv); o.g.disconnect(m.foley) } catch { /* ignore */ }
      o.on = false
    }, 2500)
  }
}

/** Per-frame upkeep: follow the zone reverb and the user's volume settings. */
export function updateMix(m) {
  if (!m) return
  const e = m.engine
  setFoleyReverb(m, e.reverbName || 'outdoor')
  const master = e.volumes?.master ?? 0.9
  const vol = master * (e.volumes?.sfx ?? 1)
  if (Math.abs(vol - m.foleyVol) > 1e-3) {
    m.foleyVol = vol
    m.foley.gain.setTargetAtTime(m.ok ? vol : 1, e.ctx.currentTime, 0.05)
  }
  if (m.uiBypass && Math.abs(master - (m.uiVol ?? -1)) > 1e-3) {
    m.uiVol = master
    m.uiOut.gain.setTargetAtTime(master, e.ctx.currentTime, 0.05)
  }
}

/** Duck everything except foley to `level` (0..1) with time constant tc (s). */
export function setDuck(m, level, tc = 1) {
  if (!m?.ok) return
  m.duck.gain.setTargetAtTime(level, m.engine.ctx.currentTime, tc)
}
export function setShelf(m, db, tc = 2) {
  if (!m?.ok) return
  m.shelf.gain.setTargetAtTime(db, m.engine.ctx.currentTime, tc)
}

/**
 * Play a buffer voice on the foley path (own steps, breath): {output} → gain → pan → foley dry +
 * foley reverb send. Returns the gain node.
 */
export function playFoley(engine, src, { gain = 1, pan = 0, send = 0.4, lowpass = 0 } = {}) {
  const m = getMix(engine)
  const ctx = engine.ctx
  const g = ctx.createGain()
  g.gain.value = gain
  let tail = g
  let f = null
  src.output.connect(g)
  if (lowpass) {
    f = ctx.createBiquadFilter()
    f.type = 'lowpass'; f.frequency.value = lowpass; f.Q.value = 0.5
    tail.connect(f); tail = f
  }
  let p = null
  if (pan && ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = pan; tail.connect(p); tail = p }
  const dest = m ? m.foley : engine.bus?.sfx
  tail.connect(dest)
  const s = ctx.createGain()
  s.gain.value = send
  tail.connect(s)
  s.connect(m ? m.foleySend : engine.reverbIn)
  const life = ((src.duration ?? 2) + 3.5) * 1000
  setTimeout(() => { try { src.output.disconnect(); g.disconnect(); f?.disconnect(); p?.disconnect(); s.disconnect() } catch { /* ignore */ } }, life)
  return g
}
