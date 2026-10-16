// Per-game runtime state for the life package: a game-time timer queue, guarded sound playback,
// terrain surface lookups and the entrance-door swing used when someone goes in or comes out.

import { materialById, SURFACE } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import { View } from './view.js'

export const life = {
  ctx: null,
  t: 0,
  rng: new RNG(70708),
  view: new View(),
  queue: [], // [{t, fn}]
  doors: new Map(),
  graph: null,
  walkers: [],
  actors: [],
  dog: null,
  story: [],
  test: false,
  stats: { spawned: 0, despawned: 0, entered: 0, exited: 0, barks: 0 },
}

/** Run fn after `delay` seconds of game time (paused with the game). */
export function later(delay, fn) { life.queue.push({ t: life.t + delay, fn }) }

export function tickQueue() {
  const q = life.queue
  if (!q.length) return
  for (let i = q.length - 1; i >= 0; i--) {
    if (life.t >= q[i].t) {
      const it = q[i]
      q.splice(i, 1)
      try { it.fn() } catch { /* never let a delayed call break update */ }
    }
  }
}

/** Play a sound if audio runs and the sound exists. pos: [x,y,z]. */
export function sound(name, pos, opts = {}) {
  const a = life.ctx?.audio
  if (!a || !a.ready || (a.has && !a.has(name))) return null
  try { return a.play(name, pos ? { ...opts, pos } : opts) } catch { return null }
}

const SURF_NAMES = ['', 'snow', 'snow_packed', 'ice', 'slush', 'concrete', 'asphalt', 'metal', 'tile', 'wood', 'linoleum', 'gravel', 'carpet', 'metal_grate']

/** Terrain material info at (x, z): { name, surf (step sound suffix), print (footprint depth 0..1) }. */
export function groundInfo(terrain, x, z) {
  const id = terrain.materialAt(x, z)
  const m = materialById(id)
  const name = m?.name ?? ''
  const surf = SURF_NAMES[SURFACE[id]] || 'snow'
  let print = 0
  if (name === 'snow' || name === 'snow_fresh' || name === 'snow_bank') print = 0.9
  else if (name === 'snow_packed' || name === 'snow_dirty') print = 0.45
  return { name, surf, print }
}

// ---- entrance doors ------------------------------------------------------------------------------

const DOOR_SWING = 1.2 // rad outward, like a person pushing it open just enough

/**
 * Swing an entrance's steel door open for `hold` seconds, then let it slam. Only doors that the
 * residential runtime does not animate itself (non-enterable, static) are moved; for the others
 * only the sounds play. Returns true if the door leaf moves.
 */
export function swingDoor(e, hold = 1.5, opts = {}) {
  if (!e) return false
  const pos = [e.x, (e.y ?? 0) + 1.0, e.z]
  if (opts.sound !== false) sound('door_metal_open', pos, { gain: 0.75 })
  const p = e.doorPlacement
  const world = life.ctx?.world
  let moving = false
  if (p && !e.enterable && !p.dynamic && !p.removed && world) {
    let d = life.doors.get(p)
    if (!d) {
      d = { p, e, x: p.x, y: p.y, z: p.z, base: p.angle, col: p.collide, swing: 0, target: 0, hold: 0 }
      life.doors.set(p, d)
    }
    d.target = DOOR_SWING
    d.hold = Math.max(d.hold, hold)
    moving = true
  } else {
    later(hold + 0.9, () => slam(e))
  }
  return moving
}

function slam(e) {
  const pos = [e.x, (e.y ?? 0) + 1.0, e.z]
  sound('door_metal_slam', pos, { gain: 0.9 })
  later(0.18, () => sound('door_magnet_lock', pos, { gain: 0.6 }))
}

export function tickDoors(dt) {
  const world = life.ctx?.world
  if (!world || !life.doors.size) return
  for (const [p, d] of life.doors) {
    // someone else moved the door: leave it alone
    if (Math.abs(p.x - d.x) > 1e-4 || Math.abs(p.z - d.z) > 1e-4 || Math.abs(p.angle - (d.base + d.swing)) > 1e-3) { life.doors.delete(p); continue }
    if (d.target > 0 && d.swing >= d.target - 1e-4) {
      d.hold -= dt
      if (d.hold <= 0) d.target = 0
    }
    if (d.swing === d.target) continue
    const opening = d.target > d.swing
    const sp = opening ? 2.4 : 1.5 + (DOOR_SWING - d.swing) * 2.0
    d.swing = opening ? Math.min(d.target, d.swing + sp * dt) : Math.max(0, d.swing - sp * dt)
    p.collide = d.col && d.swing < 0.05
    world.relocate(p, d.x, d.y, d.z, d.base + d.swing)
    if (d.swing === 0 && d.target === 0) {
      p.collide = d.col
      world.relocate(p, d.x, d.y, d.z, d.base)
      life.doors.delete(p)
      slam(d.e)
    }
  }
}
