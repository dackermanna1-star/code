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

function angDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Door sound position (about hand height in the doorway). */
function doorPos(e) {
  let y = e.y
  if (!Number.isFinite(y)) { const h = life.ctx?.terrain?.heightAt(e.x, e.z); y = Number.isFinite(h) ? h : 0 }
  return [e.x, y + 1.0, e.z]
}

/**
 * The door leaf life may swing for an entrance record, or null. Static (non-enterable) doors are
 * moved with world.relocate; an enterable door is a dynamic placement run by the residential
 * runtime, so it is only borrowed while it stands closed (its closed angle is the section's).
 */
function leafOf(e) {
  const p = e?.doorPlacement
  if (!p || p.removed) return null
  if (life.doors.has(p)) return p
  if (!p.dynamic) return e.enterable ? null : p
  const base = e.sectionPlacement?.angle
  if (!Number.isFinite(base)) return null
  return Math.abs(angDiff(p.angle, base)) < 0.28 ? p : null // closed, or propped ajar on its brick
}

/**
 * What a passer-by at this entrance looks like to the player: 'swing' (the leaf can be swung
 * open), 'open' (the door already stands open: someone, maybe the player, opened it) or null
 * (nothing would move: a door life cannot animate).
 */
export function doorVisual(e) {
  if (leafOf(e)) return 'swing'
  const p = e?.doorPlacement
  if (p && p.dynamic && !p.removed && Number.isFinite(e.sectionPlacement?.angle) && Math.abs(angDiff(p.angle, e.sectionPlacement.angle)) > 0.3) return 'open'
  return null
}

/**
 * Swing an entrance's door open for `hold` seconds, then let it fall shut. opts: { sound=true,
 * kind: 'home' (steel door + magnetic lock) | 'shop' (chime) | 'public' }. A door life cannot move
 * only plays the sounds. Returns true if the leaf moves.
 */
export function swingDoor(e, hold = 1.5, opts = {}) {
  if (!e) return false
  const kind = opts.kind ?? 'home'
  const pos = doorPos(e)
  const vis = doorVisual(e)
  if (vis === 'open') return false // already open: they simply walk through
  if (opts.sound !== false) {
    sound('door_metal_open', pos, { gain: 0.75 })
    if (kind === 'shop') later(0.15, () => sound('shop_bell', [pos[0], pos[1] + 0.9, pos[2]], { gain: 0.3 }))
  }
  const p = leafOf(e)
  const world = life.ctx?.world
  if (p && world) {
    let d = life.doors.get(p)
    if (!d) {
      d = { p, e, kind, x: p.x, y: p.y, z: p.z, base: p.angle, col: p.collide, dyn: !!p.dynamic, swing: 0, target: 0, hold: 0 }
      life.doors.set(p, d)
    }
    d.target = DOOR_SWING
    d.hold = Math.max(d.hold, hold)
    return true
  }
  later(hold + 0.9, () => slam(e, kind))
  return false
}

function slam(e, kind = 'home') {
  const pos = doorPos(e)
  sound('door_metal_slam', pos, { gain: kind === 'home' ? 0.9 : 0.6 })
  if (kind === 'home') later(0.18, () => sound('door_magnet_lock', pos, { gain: 0.6 }))
}

function moveLeaf(world, d, angle) {
  if (d.dyn) d.p.set(d.x, d.y, d.z, angle)
  else world.relocate(d.p, d.x, d.y, d.z, angle)
}

export function tickDoors(dt) {
  const world = life.ctx?.world
  if (!world || !life.doors.size) return
  const pl = life.ctx.player?.pos
  for (const [p, d] of life.doors) {
    // someone else moved the door (the player opened it, another package): leave it alone
    if (p.removed || Math.abs(p.x - d.x) > 1e-4 || Math.abs(p.z - d.z) > 1e-4 || Math.abs(p.angle - (d.base + d.swing)) > 1e-3) { life.doors.delete(p); continue }
    if (d.target > 0 && d.swing >= d.target - 1e-4) {
      d.hold -= dt
      // never swing the leaf shut through the player standing in the doorway
      const inWay = pl && Math.hypot(pl.x - d.e.x, pl.z - d.e.z) < 1.7 && Math.abs(pl.y - d.y) < 2.5
      if (d.hold <= 0 && !inWay) d.target = 0
    }
    if (d.swing === d.target) continue
    const opening = d.target > d.swing
    const sp = opening ? 2.4 : 1.5 + (DOOR_SWING - d.swing) * 2.0
    d.swing = opening ? Math.min(d.target, d.swing + sp * dt) : Math.max(0, d.swing - sp * dt)
    p.collide = d.col && d.swing < 0.05
    moveLeaf(world, d, d.base + d.swing)
    if (d.swing === 0 && d.target === 0) {
      p.collide = d.col
      moveLeaf(world, d, d.base)
      life.doors.delete(p)
      slam(d.e, d.kind)
    }
  }
}
