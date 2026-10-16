// Runtime systems of the public package: lazily started looping sound emitters (only near the
// player), working doors (dynamic placements that swing), and fallback synth sounds for the
// few names this package needs if the audio package has not registered them.



export const RT = {
  emitters: [],
  doors: [],
  ticks: [],
  later: [],
  pendingSteam: [],
  fallbacks: false,
  checkT: 0,
}

/**
 * Looping (or periodic) positional emitter, started lazily when the player comes within
 * `radius` and stopped beyond radius * 1.3.
 * o: { name, pos: [x,y,z], gain=0.5, radius=40, refDistance=2, maxDistance=60, bus='ambience', cutoff, reverb }
 */
export function addEmitter(o) {
  const e = { gain: 0.5, radius: 40, refDistance: 2, maxDistance: 70, bus: 'ambience', ...o, handle: null }
  RT.emitters.push(e)
  return e
}

/** Per-frame callback fn(dt, ctx) (kept tiny; guarded). */
export function addTick(fn) { RT.ticks.push(fn) }

/** Run fn(game) after `seconds` of game time. */
export function later(seconds, fn) { RT.later.push({ t: seconds, fn }) }

/**
 * Working door. The door model is a dynamic placement whose pivot is the hinge.
 * o: { placement, closed (angle), swing (+1 = rotate positive), open (radians, default 1.45),
 *      width (m), center: [x,y,z] (world, closed position, for interaction), sounds: {open, close, chime},
 *      autoClose (s), label: {ru, en}, locked: {ru, en} (message instead of opening) }
 */
export function addDoor(ctx, o) {
  const d = {
    swing: 1, open: 1.45, width: 1, autoClose: 6, ...o,
    t: 0, target: 0, idle: 0,
  }
  d.placement.set(d.placement.x, d.placement.y, d.placement.z, d.closed)
  const c = d.center
  ctx.interactions.add({
    x: c[0], y: c[1], z: c[2],
    size: d.size ?? [1.1, 2.2, 1.1],
    reach: 2.6,
    tag: 'door',
    prompt: game => (d.target < 0.5 && isLocked(d, game)) ? (d.lockedLabel ?? d.label ?? { ru: 'Дверь', en: 'Door' }) : d.target > 0.5 ? { ru: 'Закрыть дверь', en: 'Close the door' } : (d.label ?? { ru: 'Открыть дверь', en: 'Open the door' }),
    onUse(game) {
      if (d.target < 0.5 && isLocked(d, game)) {
        game.audio?.play?.('door_metal_open', { pos: c, gain: 0.25, rate: 1.4 })
        if (d.lockedNote) game.ui.say(d.lockedNote, 3.5)
        return
      }
      d.target = d.target > 0.5 ? 0 : 1
      d.idle = 0
      const snd = d.target ? d.sounds?.open : d.sounds?.close
      if (snd) game.audio?.play?.(snd, { pos: c, gain: d.target ? 0.55 : 0.7 })
      if (d.target && d.sounds?.chime) game.audio?.play?.(d.sounds.chime, { pos: [c[0], c[1] + 0.9, c[2]], gain: 0.35 })
    },
  })
  RT.doors.push(d)
  return d
}

function isLocked(d, game) {
  if (typeof d.isLocked === 'function') { try { return !!d.isLocked(game) } catch { return false } }
  return !!d.locked
}

function updateDoors(dt, ctx) {
  const p = ctx.player?.pos
  for (const d of RT.doors) {
    const pl = d.placement
    // auto-close (door closer) once the player is clear
    if (d.target > 0.5 && d.autoClose > 0 && p) {
      const dx = p.x - d.center[0], dz = p.z - d.center[2]
      if (dx * dx + dz * dz > 9) d.idle += dt
      else d.idle = 0
      if (d.idle > d.autoClose) {
        d.target = 0
        d.idle = 0
        if (d.sounds?.close) ctx.audio?.play?.(d.sounds.close, { pos: d.center, gain: 0.6 })
      }
    }
    if (d.t !== d.target) {
      const speed = d.target > d.t ? 1.6 : 1.1
      d.t = d.target > d.t ? Math.min(d.target, d.t + dt * speed) : Math.max(d.target, d.t - dt * speed)
      const k = d.t * d.t * (3 - 2 * d.t)
      pl.set(pl.x, pl.y, pl.z, d.closed + d.swing * d.open * k)
    }
    // Never trap or shove the player: no collision while the leaf swings, or while the leaf
    // actually intersects the player's body (it swung into someone standing in the doorway).
    // A closed door touched from either side stays solid, so a locked door really is locked.
    let overlap = false
    if (p) {
      const a = pl.aabb, hw = 0.2
      overlap = p.x + hw > a[0] && p.x - hw < a[3] && p.z + hw > a[2] && p.z - hw < a[5] && p.y < a[4] && p.y + 1.7 > a[1]
    }
    pl.collide = !overlap && (d.t === 0 || d.t === 1)
  }
}

function updateEmitters(dt, ctx) {
  const audio = ctx.audio
  if (!audio || !audio.ready) return
  if (!RT.fallbacks) { RT.fallbacks = true; registerFallbacks(audio) }
  RT.checkT -= dt
  if (RT.checkT > 0) return
  RT.checkT = 0.5
  const p = ctx.camera.position
  for (const e of RT.emitters) {
    const dx = p.x - e.pos[0], dy = p.y - e.pos[1], dz = p.z - e.pos[2]
    const d2 = dx * dx + dy * dy + dz * dz
    if (!e.handle && d2 < e.radius * e.radius) {
      if (!audio.has(e.name)) continue
      e.handle = audio.play(e.name, {
        pos: e.pos, gain: e.gain, loop: true, bus: e.bus, refDistance: e.refDistance,
        maxDistance: e.maxDistance, cutoff: e.cutoff, reverb: e.reverb ?? 1, rolloff: e.rolloff ?? 1.2,
      })
    } else if (e.handle && d2 > e.radius * e.radius * 1.69) {
      try { e.handle.stop(0.4) } catch { /* ignore */ }
      e.handle = null
    }
  }
}

export function updateRuntime(dt, ctx) {
  if (RT.later.length) {
    for (let i = RT.later.length - 1; i >= 0; i--) {
      const l = RT.later[i]
      l.t -= dt
      if (l.t <= 0) {
        RT.later.splice(i, 1)
        try { l.fn(ctx.game) } catch (e) { void e }
      }
    }
  }
  try { updateDoors(dt, ctx) } catch (e) { if (!RT._e1) { RT._e1 = true; console.error('[public] doors', e) } }
  try { updateEmitters(dt, ctx) } catch (e) { if (!RT._e2) { RT._e2 = true; console.error('[public] emitters', e) } }
  for (let i = 0; i < RT.ticks.length; i++) {
    try { RT.ticks[i](dt, ctx) } catch (e) { if (!RT._e3) { RT._e3 = true; console.error('[public] tick', e) } }
  }
}

// ---------------------------------------------------------------------------------------
// Fallback synths (only registered when the audio package lacks a name)
// ---------------------------------------------------------------------------------------
const cache = new Map()
function cached(engine, key, seconds, fn) {
  if (!cache.has(key)) cache.set(key, engine.makeBuffer(seconds, fn))
  return cache.get(key)
}
function bufSource(engine, buf, loop) {
  const s = engine.ctx.createBufferSource()
  s.buffer = buf
  s.loop = !!loop
  s.start()
  return s
}

function registerFallbacks(audio) {
  const reg = (name, f) => { if (!audio.has(name)) audio.register(name, f) }
  const TAU = Math.PI * 2
  // 50 Hz-family hums (fridge, transformer, boiler)
  const hum = (key, partials, noiseAmt, wobble) => (engine, opts) => {
    let n = 0
    const buf = cached(engine, key, 4, (i, t) => {
      let v = 0
      for (const [f, a] of partials) v += Math.sin(TAU * f * t) * a
      n = n * 0.97 + (Math.random() * 2 - 1) * 0.03
      return (v * (1 + wobble * Math.sin(TAU * 0.25 * t)) + n * noiseAmt) * 0.35
    })
    const src = bufSource(engine, buf, true)
    return { output: src, stop: w => src.stop(w) }
  }
  reg('fridge_hum', hum('pub_fridge', [[50, 0.5], [100, 0.35], [150, 0.12], [247, 0.05]], 0.8, 0.08))
  reg('transformer_hum', hum('pub_trans', [[100, 0.6], [200, 0.3], [300, 0.2], [400, 0.1], [500, 0.05]], 0.2, 0.05))
  reg('boiler_hum', hum('pub_boiler', [[33, 0.5], [50, 0.4], [66, 0.2], [100, 0.1]], 2.5, 0.15))
  reg('fluorescent_buzz', (engine) => {
    const buf = cached(engine, 'pub_fluor', 3, (i, t) => {
      const saw = ((t * 100) % 1) * 2 - 1
      const tick = Math.random() < 0.00002 ? 1 : 0
      return saw * 0.08 + Math.sin(TAU * 200 * t) * 0.05 + (Math.random() * 2 - 1) * 0.03 * (0.5 + 0.5 * Math.sin(TAU * 100 * t)) + tick
    })
    const src = bufSource(engine, buf, true)
    const bp = engine.ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5
    src.connect(bp)
    return { output: bp, stop: w => src.stop(w) }
  })
  reg('ventilation', (engine) => {
    const src = bufSource(engine, engine.noise('pink', 4, 31), true)
    const lp = engine.ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 700
    const g = engine.ctx.createGain(); g.gain.value = 0.5
    src.connect(lp); lp.connect(g)
    return { output: g, stop: w => src.stop(w) }
  })
  // short muffled voice phrase: formant-filtered buzz with a speech-like pitch contour
  const voice = (key, f0, len) => (engine) => {
    const buf = cached(engine, key, len, (i, t) => {
      const syll = Math.sin(TAU * 4.2 * t) * 0.5 + 0.5
      const env = Math.min(1, t * 20) * Math.min(1, (len - t) * 6) * (0.35 + 0.65 * syll)
      const f = f0 * (1.15 - 0.3 * t / len + 0.08 * Math.sin(TAU * 2.1 * t))
      const ph = (t * f) % 1
      return (ph < 0.35 ? 1 : -0.4) * env * 0.25
    })
    const src = bufSource(engine, buf, false)
    const out = engine.ctx.createGain()
    for (const [fr, q, g] of [[700, 4, 1], [1200, 5, 0.6], [2600, 6, 0.25]]) {
      const bp = engine.ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q
      const gg = engine.ctx.createGain(); gg.gain.value = g
      src.connect(bp); bp.connect(gg); gg.connect(out)
    }
    return { output: out, duration: len, stop: w => src.stop(w) }
  }
  reg('cashier_voice', voice('pub_cash_v', 220, 1.3))
  reg('kiosk_voice', voice('pub_kiosk_v', 190, 1.1))
  reg('shop_bell', (engine) => {
    const b = cached(engine, 'pub_bell2', 1.8, (i, t) => {
      const a = t < 0.55 ? Math.sin(TAU * 659 * t) * Math.exp(-t * 3) : 0
      const b2 = t > 0.45 ? Math.sin(TAU * 523 * (t - 0.45)) * Math.exp(-(t - 0.45) * 2.5) : 0
      return (a + b2) * 0.3
    })
    const src = bufSource(engine, b, false)
    return { output: src, duration: 1.8 }
  })
  const thump = (key, f, decay, noise, len) => (engine) => {
    const b = cached(engine, key, len, (i, t) => {
      const e = Math.exp(-t * decay)
      return (Math.sin(TAU * f * t * (1 - t * 0.3)) * 0.6 + (Math.random() * 2 - 1) * noise * Math.exp(-t * decay * 3)) * e * 0.6
    })
    return { output: bufSource(engine, b, false), duration: len }
  }
  reg('door_metal_open', thump('pub_dmo', 180, 9, 0.5, 0.5))
  reg('door_metal_slam', thump('pub_dms', 70, 5, 0.8, 1.0))
  reg('door_wood', thump('pub_dw', 240, 12, 0.3, 0.4))
  reg('doorbell', (engine) => {
    const b = cached(engine, 'pub_doorbell', 1.2, (i, t) => {
      const f = t % 0.3 < 0.15 ? 1400 : 1100
      return (((t * f) % 1) < 0.5 ? 0.12 : -0.12) * Math.min(1, (1.2 - t) * 5)
    })
    return { output: bufSource(engine, b, false), duration: 1.2 }
  })
  reg('scale_beep', (engine) => {
    const b = cached(engine, 'pub_beep', 0.2, (i, t) => Math.sin(TAU * 2400 * t) * 0.15 * Math.min(1, (0.2 - t) * 30))
    return { output: bufSource(engine, b, false), duration: 0.2 }
  })
}
