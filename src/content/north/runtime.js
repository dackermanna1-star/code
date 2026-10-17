// Per-frame life of the north district: the level-crossing signals flash and the bell rings while
// an elektrichka approaches or passes x 300; the chained dog at the garage cooperative turns to
// watch the player and barks (more when you come close, sometimes at nothing at night).
// Everything is guarded: no audio → silent; no vehicles package → the signals stay dark.

import { RNG } from '../../core/rng.js'
import { signal } from './railway.js'
import { CROSSING, RAIL } from './layout.js'

const rng = new RNG(0x7e57)
const S = { dog: null, bell: null, bellGain: 0, phaseT: 0, barkT: 6, barkShow: 0, near: false, lastBark: -99, time: 0 }

/** Electromechanical crossing bell «дзынь-дзынь», 2.5 strikes/s, looped. */
function crossingBell(e, o = {}) {
  const ctx = e.ctx
  if (!e._northBellBuf) {
    let seed = 12345
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const TAU = Math.PI * 2
    e._northBellBuf = e.makeBuffer(2.0, (i, t) => {
      const k = Math.floor(t / 0.4), tt = t - k * 0.4
      const env = Math.exp(-tt * 8.5)
      const s = Math.sin(TAU * 1183 * tt) * 0.5 + Math.sin(TAU * 2861 * tt) * 0.28 * Math.exp(-tt * 5) + Math.sin(TAU * 4307 * tt) * 0.14 * Math.exp(-tt * 13)
      const click = tt < 0.005 ? (rnd() * 2 - 1) * (1 - tt / 0.005) : 0
      return (s * env * 0.42 + click * 0.25)
    })
  }
  const src = ctx.createBufferSource()
  src.buffer = e._northBellBuf
  src.loop = o.loop !== false
  const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 500
  const out = ctx.createGain(); out.gain.value = 0.8
  src.connect(bp); bp.connect(out)
  src.start()
  return { output: out, stop(when = 0) { try { src.stop(ctx.currentTime + Math.max(0, when)) } catch { /* already stopped */ } } }
}

export function initRuntime(ctx, built) {
  S.dog = built?.garages?.dog ?? null
  try { if (ctx.audio?.register && !ctx.audio.has?.('north_crossing_bell')) ctx.audio.register('north_crossing_bell', crossingBell) } catch { /* optional */ }
}

function updateCrossing(dt, ctx) {
  const tr = ctx.registry?.train
  let want = 0
  if (tr && tr.active && Number.isFinite(tr.headX)) {
    const lo = Math.min(tr.headX, tr.tailX), hi = Math.max(tr.headX, tr.tailX)
    const toCross = (CROSSING.x - tr.headX) * (tr.dir || 1)
    if ((toCross > 0 && toCross < 280) || (CROSSING.x > lo - 6 && CROSSING.x < hi + 6)) want = 1
  }
  signal.active += (want - signal.active) * Math.min(1, dt * (want ? 6 : 2.5))
  if (signal.active < 0.02) signal.active = 0
  S.phaseT += dt
  if (S.phaseT > 0.55) { S.phaseT = 0; signal.phase = (signal.phase + 1) % 2 }
  // the bell
  const audio = ctx.audio
  if (!audio?.ready) return
  const cam = ctx.camera?.position
  const near = cam ? Math.hypot(cam.x - CROSSING.x, cam.z - 48) < 260 : false
  if (signal.active > 0.3 && near && !S.bell) {
    S.bell = audio.play('north_crossing_bell', { pos: [CROSSING.x + 3.6, RAIL.bed + 3.6, 54.5], loop: true, refDistance: 5, maxDistance: 260, gain: 0.0, bus: 'sfx' })
    S.bellGain = 0
  }
  if (S.bell) {
    const target = signal.active > 0.3 && near ? 0.85 : 0
    S.bellGain += (target - S.bellGain) * Math.min(1, dt * 3)
    S.bell.setGain?.(S.bellGain)
    if (target === 0 && S.bellGain < 0.02) { try { S.bell.stop(0.2) } catch { /* ignore */ } S.bell = null }
  }
}

function updateDog(dt, ctx) {
  const d = S.dog
  if (!d?.stand || !d?.bark) return
  const cam = ctx.camera?.position
  if (!cam) return
  const dx = cam.x - d.x, dz = cam.z - d.z
  const dist = Math.hypot(dx, dz)
  // turn to watch the player when they're near the gate
  if (dist < 32) {
    const target = Math.atan2(dx, dz)
    let a = d.angle + Math.atan2(Math.sin(target - d.angle), Math.cos(target - d.angle)) * Math.min(1, dt * 2.2)
    d.angle = a
    d.stand.set(d.x, d.y, d.z, a)
    d.bark.set(d.x, d.y, d.z, a)
  }
  S.barkShow -= dt
  const barking = S.barkShow > 0
  if (d.stand.visible === barking) { d.stand.visible = !barking; d.bark.visible = barking }
  // bark timing: a burst when the player first comes within ~16 m, then now and then while near
  S.barkT -= dt
  const nearNow = dist < 16
  if (nearNow && !S.near && S.time - S.lastBark > 6) bark(ctx, d, 1)
  S.near = nearNow
  if (S.barkT <= 0) {
    const night = (ctx.atmos?.values?.night ?? 0.5) > 0.4
    if (dist < 60) bark(ctx, d, 0.9)
    else if (dist < 220 && rng.chance(night ? 0.5 : 0.25)) bark(ctx, d, 0.75)
    S.barkT = dist < 60 ? rng.float(7, 18) : rng.float(20, 55)
  }
}

function bark(ctx, d, gain) {
  S.barkShow = 1.4
  S.lastBark = S.time
  const audio = ctx.audio
  if (audio?.ready) { try { audio.play('dog_bark', { pos: [d.x, 0.8, d.z], dog: 1, gain }) } catch { /* optional */ } }
}

export function updateRuntime(dt, ctx) {
  S.time += dt
  try { updateCrossing(dt, ctx) } catch { /* never throw from update */ }
  try { updateDog(dt, ctx) } catch { /* never throw from update */ }
}

export { S as runtimeState }
