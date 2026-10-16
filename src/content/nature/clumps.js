// Falling snow clumps: once in a while a clump of snow slides off a branch near the player,
// trailing powder, and lands with a soft "плюх" and a puff.

import { RNG } from '../../core/rng.js'
import { treesNear, placeModel } from './state.js'

const POOL = 3
const near = []

export function createClumps(ctx, s) {
  if (s.clumps) return s.clumps
  const pool = []
  for (let i = 0; i < POOL; i++) {
    const p = placeModel(ctx, 'nature_snow_clump', { x: 0, y: -50, z: 0, dynamic: true, collide: false, visible: false, tag: 'clump' })
    if (p) pool.push({ p, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, trail: 0, ground: 0 })
  }
  s.clumps = { pool, timer: 18, rng: new RNG(2008) }
  return s.clumps
}

function play(ctx, name, pos, gain = 1) {
  const a = ctx.audio
  if (!a || !a.ready || (a.has && !a.has(name))) return
  try { a.play(name, { pos, gain, refDistance: 3, maxDistance: 120 }) } catch { /* ignore */ }
}

/** Force a clump to fall from a given tree handle (or the nearest snowy tree). */
export function dropClump(ctx, s, tree) {
  const C = s.clumps
  if (!C) return false
  const c = C.pool.find(q => !q.active)
  if (!c || !tree) return false
  const spots = tree.meta.snowSpots
  if (!spots.length) return false
  const q = spots[C.rng.int(0, spots.length - 1)]
  const w = tree.placement.toWorld(q[0], q[1], q[2])
  c.active = true
  c.x = w.x; c.y = w.y; c.z = w.z
  c.vx = C.rng.float(-0.4, 0.4); c.vy = 0.2; c.vz = C.rng.float(-0.4, 0.4)
  c.trail = 0
  const g = ctx.terrain.heightAt(c.x, c.z)
  c.ground = Number.isFinite(g) ? g : 0
  c.p.visible = true
  c.p.set(c.x, c.y, c.z, C.rng.float(0, 6.28))
  tree.lastClump = ctx.game.time
  s.steam?.burst({ kind: 'powder', x: c.x, y: c.y, z: c.z, size: 0.35, life: 1.4 }, 6)
  return true
}

export function updateClumps(ctx, s, dt) {
  const C = s.clumps
  if (!C) return
  // fall
  for (const c of C.pool) {
    if (!c.active) continue
    c.vy -= 9.8 * dt
    if (c.vy < -6) c.vy = -6
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt
    c.trail += dt
    if (c.trail > 0.09) {
      c.trail = 0
      s.steam?.burst({ kind: 'powder', x: c.x, y: c.y + 0.1, z: c.z, size: 0.3, life: 1.2, speed: 0.15 }, 1)
    }
    if (c.y <= c.ground + 0.05) {
      c.active = false
      c.p.visible = false
      s.steam?.burst({ kind: 'powder', x: c.x, y: c.ground + 0.1, z: c.z, size: 0.5, life: 1.8, speed: 1.1, rise: 0.25, gravity: 0.6 }, 14)
      play(ctx, 'snow_fall_branch', [c.x, c.ground + 0.2, c.z], 0.9)
    } else c.p.set(c.x, c.y, c.z)
  }
  // rarely, somewhere close, ideally where the player is looking
  C.timer -= dt
  if (C.timer > 0) return
  C.timer = C.rng.float(28, 75)
  const game = ctx.game
  if (game.zone?.indoor) return
  const cam = ctx.camera
  const px = cam.position.x, pz = cam.position.z
  treesNear(s, px, pz, 22, near)
  if (!near.length) { C.timer = 8; return }
  const fx = -Math.sin(ctx.player?.yaw ?? 0), fz = -Math.cos(ctx.player?.yaw ?? 0)
  let best = null, bestScore = -1
  for (const t of near) {
    if (!t.meta.snowSpots.length || game.time - t.lastClump < 150) continue
    const dx = t.x - px, dz = t.z - pz
    const d = Math.hypot(dx, dz)
    if (d < 3) continue
    const facing = (dx * fx + dz * fz) / (d || 1)
    const score = (facing + 1.2) * C.rng.next() * (d < 16 ? 1.3 : 1)
    if (score > bestScore) { bestScore = score; best = t }
  }
  if (best) dropClump(ctx, s, best)
}
