// Public API of the nature package. Layout packages import from here:
//   import { placeTree, scatterTrees, placePond, snowBank, addSteam, addCrows } from '../nature/api.js'
// Every helper takes the build ctx first. Call terrain-shaping helpers (pond, banks, drifts,
// piles) during build(); steam/crows/trees may also be added later at runtime.

import { RNG, hash2 } from '../../core/rng.js'
import { SPECIES, SPECIES_NAMES } from './trees.js'
import { PLANTS, HEDGE_LEN } from './plants.js'
import { BURIED } from './props.js'
import { placeTree, scatterTrees, samplePoints, pickVariant, areaOf, inPolygon, seedAt } from './place.js'
import { placePond, POND_SIGN } from './pond.js'
import { snowBank, snowDrift, plowedPile } from './snowfx.js'
import { SteamSystem, STEAM_PRESETS } from './steam.js'
import { addCrows } from './crows.js'
import { natureState, treesNear as _treesNear, placeModel, fineDef } from './state.js'
import { createClumps, dropClump as _dropClump } from './clumps.js'
import { addBag } from './bag.js'

export { SPECIES, SPECIES_NAMES, PLANTS, BURIED, STEAM_PRESETS, POND_SIGN }
export { placeTree, scatterTrees, samplePoints, pickVariant, areaOf, inPolygon }
export { placePond, snowBank, snowDrift, plowedPile, addCrows, addBag, placeModel, fineDef }

const TAU = Math.PI * 2

/**
 * A straight row of trees (avenue lindens, a line of poplars along a street).
 * o: { x0, z0, x1, z1, spacing (m, default 7), species (string or weights), jitter (m, default
 *      0.4), size, seed, skip(x,z) → true to leave a gap, missing (0..1 chance of a gap, default 0.08) }
 */
export function placeTreeRow(ctx, o) {
  const rng = new RNG(o.seed ?? seedAt(o.x0, o.z0, 11))
  const L = Math.hypot(o.x1 - o.x0, o.z1 - o.z0)
  const sp = o.spacing ?? 7
  const n = Math.max(1, Math.floor(L / sp) + 1)
  const list = typeof o.species === 'object' ? Object.entries(o.species) : [[o.species ?? 'linden', 1]]
  const out = []
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1)
    const j = o.jitter ?? 0.4
    const x = o.x0 + (o.x1 - o.x0) * f + rng.float(-j, j), z = o.z0 + (o.z1 - o.z0) * f + rng.float(-j, j)
    if (rng.chance(o.missing ?? 0.08)) continue
    if (o.skip && o.skip(x, z)) continue
    const t = placeTree(ctx, { x, z, species: rng.weighted(list), size: o.size, seed: hash2(i, rng.int(1, 1e9)) })
    if (t) out.push(t)
  }
  return out
}

/**
 * A bush. o: { x, z, kind: 'lilac'|'currant'|'snowberry', variant, rot | angle, seed }
 * Returns the placement.
 */
export function placeBush(ctx, o) {
  const list = PLANTS[o.kind ?? 'lilac'] || PLANTS.lilac
  const rng = new RNG(o.seed ?? seedAt(o.x, o.z, 5))
  const name = o.variant !== undefined ? list[o.variant % list.length] : rng.pick(list)
  return placeModel(ctx, name, { x: o.x, z: o.z, y: o.y, angle: o.angle ?? rng.int(0, 3) * Math.PI / 2, seed: rng.next(), tag: 'bush' })
}

/**
 * A trimmed hedge from (x0,z0) to (x1,z1), built from 2 m segments (snow-capped, solid stems
 * inside so the player cannot walk through). o: { x0, z0, x1, z1, low (0.75 m instead of 1 m),
 * seed, damaged (0..1 chance of a trampled gap segment) }
 */
export function placeHedge(ctx, o) {
  const rng = new RNG(o.seed ?? seedAt(o.x0, o.z0, 9))
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0
  const L = Math.hypot(dx, dz)
  const ang = Math.atan2(-dz, dx) // model +X along the line
  const n = Math.max(1, Math.round(L / HEDGE_LEN))
  const out = []
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n
    const name = o.low ? 'nature_hedge_low' : rng.chance(o.damaged ?? 0.08) ? 'nature_hedge_gap' : 'nature_hedge'
    const x = o.x0 + dx * f, z = o.z0 + dz * f, angle = ang + (rng.chance(0.5) ? Math.PI : 0)
    const p = placeModel(ctx, name, { x, z, angle, tag: 'hedge' })
    if (!p) continue
    // the fine twig mass rides on the same transform as the solid stems
    placeModel(ctx, `${name}_twigs`, { x, z, y: p.y, angle, tag: 'hedge_twigs' })
    out.push(p)
  }
  return out
}

/**
 * Dry weeds poking out of the snow. o: { x, z, kind: 'grass'|'burdock'|'tansy'|'reeds'|'cattail',
 * variant, angle, seed }
 */
export function placeWeeds(ctx, o) {
  const list = PLANTS[o.kind ?? 'grass'] || PLANTS.grass
  const rng = new RNG(o.seed ?? seedAt(o.x, o.z, 13))
  const name = o.variant !== undefined ? list[o.variant % list.length] : rng.pick(list)
  return placeModel(ctx, name, { x: o.x, z: o.z, y: o.y, angle: o.angle ?? rng.float(0, TAU), tag: 'weeds' })
}

/**
 * Scatter weeds/bushes. o: { rect | polygon, count | density (per 100 m², default 2),
 * kinds: {grass: 0.6, burdock: 0.2, tansy: 0.2} (any PLANTS kind incl. lilac/currant/snowberry),
 * avoid(x,z), minSpacing (default 1.5), seed }
 */
export function scatterWeeds(ctx, o) {
  const pts = samplePoints({ ...o, density: o.density ?? 2, minSpacing: o.minSpacing ?? 1.5 })
  const rng = new RNG((o.seed ?? 3) * 7 + 1)
  const kinds = Object.entries(o.kinds ?? { grass: 0.6, burdock: 0.2, tansy: 0.2 })
  const out = []
  for (const [x, z] of pts) {
    const kind = rng.weighted(kinds)
    const bush = kind === 'lilac' || kind === 'currant' || kind === 'snowberry'
    out.push(bush ? placeBush(ctx, { x, z, kind, seed: rng.int(1, 1e9) }) : placeWeeds(ctx, { x, z, kind, seed: rng.int(1, 1e9) }))
  }
  return out
}

/** The shared steam particle system (created on first use). */
export function steamSystem(ctx) {
  const s = natureState(ctx)
  if (!s.steam) s.steam = new SteamSystem(ctx)
  return s.steam
}

/**
 * A steam plume. o: { x, y, z, kind: 'manhole'|'vent'|'pipe'|'chimney'|'exhaust'|'breath'|'kettle',
 * rate (particles/s), size (m), rise (m/s), life (s), opacity, spread, color, vel:[vx,vz],
 * maxDist (emit only within this camera distance), gust (bool: irregular puffs), tag }
 * Returns a handle { set(x,y,z), setVelocity(vx,vz), setRate(r), setOpacity(a), start(), stop(), remove() }.
 * Cheap: one draw call for every plume in the city; plumes beyond maxDist cost nothing.
 */
export function addSteam(ctx, o) {
  const h = steamSystem(ctx).add(o)
  if (ctx.registry) (ctx.registry.steam ||= []).push({ x: o.x, y: o.y, z: o.z, kind: o.kind ?? 'manhole', handle: h })
  return h
}

/** A one-off puff (snow powder from a roof, a door opening onto frost...). o: { x, y, z, kind:'powder'|..., size, speed } */
export function steamPuff(ctx, o, count = 10) {
  steamSystem(ctx).burst(o, count)
}

/** Trees (handles) with trunks within r metres of (x, z). */
export function treesNear(ctx, x, z, r) {
  return _treesNear(natureState(ctx), x, z, r, [])
}

/** Make a clump of snow fall from this tree now (e.g. an anomaly, a slammed door). */
export function dropClump(ctx, tree) {
  const s = natureState(ctx)
  createClumps(ctx, s)
  return _dropClump(ctx, s, tree)
}
