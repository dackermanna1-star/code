// Mix inserts on top of the engine's master chain (no engine edits; rewired at runtime):
//
//   buses + zone reverb → master → [duck] → [snow shelf] → muffle → compressor → out
//   foley (own footsteps, breath) ──────────────────────→ muffle   (bypasses the duck)
//   foley reverb send → two private convolvers (engine IRs, crossfaded on zone change) → foley
//
// The duck lets silence events and silence zones pull the whole world down to near-silence
// while the player's own footsteps and breathing stay. The shelf is the snow-absorption rule
// (fresh snow eats everything above ~3 kHz outdoors).

const MIX = new WeakMap()

export function getMix(engine) {
  if (!engine?.ctx) return null
  let m = MIX.get(engine.ctx)
  if (m) return m
  const ctx = engine.ctx
  m = { engine, ok: false, revName: null, revActive: 'A', foleyVol: -1 }
  m.duck = ctx.createGain()
  m.shelf = ctx.createBiquadFilter()
  m.shelf.type = 'highshelf'
  m.shelf.frequency.value = 3000
  m.shelf.gain.value = 0
  m.foley = ctx.createGain()
  m.foley.gain.value = (engine.volumes?.master ?? 0.9) * (engine.volumes?.sfx ?? 1)
  m.foleySend = ctx.createGain()
  try {
    if (engine.master && engine.muffleFilter) {
      engine.master.disconnect()
      engine.master.connect(m.duck)
      m.duck.connect(m.shelf)
      m.shelf.connect(engine.muffleFilter)
      m.foley.connect(engine.muffleFilter)
      m.ok = true
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
    m.convA = ctx.createConvolver(); m.convB = ctx.createConvolver()
    m.gA = ctx.createGain(); m.gB = ctx.createGain()
    m.gA.gain.value = 0; m.gB.gain.value = 0
    m.foleySend.connect(m.convA); m.foleySend.connect(m.convB)
    m.convA.connect(m.gA); m.convB.connect(m.gB)
    m.gA.connect(m.foley); m.gB.connect(m.foley)
    setFoleyReverb(m, engine.reverbName || 'outdoor', true)
  } else if (engine.reverbIn) m.foleySend.connect(engine.reverbIn)
  if (engine.bus && !engine.bus.foley) engine.bus.foley = m.foley
  MIX.set(engine.ctx, m)
  return m
}

const WET = { outdoor: 0.16, courtyard: 0.26, park: 0.08, stairwell: 0.42, underpass: 0.45, metro: 0.45, tunnel: 0.5, shop: 0.14, room: 0.2, elevator: 0.25, hall: 0.3 }

export function setFoleyReverb(m, name, instant = false) {
  if (!m?.convA || name === m.revName) return
  const e = m.engine
  let ir
  try { ir = e._ir(name) } catch { return }
  m.revName = name
  const t = e.ctx.currentTime
  const wet = (WET[name] ?? 0.2) * 1.1
  const tc = instant ? 0.01 : 0.25
  const [on, onG, off, offG] = m.revActive === 'A' ? [m.convB, m.gB, m.convA, m.gA] : [m.convA, m.gA, m.convB, m.gB]
  try { on.buffer = ir } catch { /* older engines: buffer set once */ }
  onG.gain.setTargetAtTime(wet, t, tc); offG.gain.setTargetAtTime(0, t, tc)
  m.revActive = m.revActive === 'A' ? 'B' : 'A'
  // free the faded-out convolver's CPU once the crossfade is over
  clearTimeout(m._revTimer)
  m._revTimer = setTimeout(() => { if (offG.gain.value < 0.01) { try { off.buffer = null } catch { /* keep */ } } }, 2500)
}

/** Per-frame upkeep: follow the zone reverb and the user's volume settings. */
export function updateMix(m) {
  if (!m) return
  const e = m.engine
  setFoleyReverb(m, e.reverbName || 'outdoor')
  const vol = (e.volumes?.master ?? 0.9) * (e.volumes?.sfx ?? 1)
  if (Math.abs(vol - m.foleyVol) > 1e-3) {
    m.foleyVol = vol
    m.foley.gain.setTargetAtTime(m.ok ? vol : 1, e.ctx.currentTime, 0.05)
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
