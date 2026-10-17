// Median lamps (double-arm cobras), trolleybus support poles, span wires and the two contact-wire
// pairs of проспект Строителей. Stations every 37 m from x 0 to 629 (592 = 16 × 37), seeded by
// x mod 592, so the pattern is identical on both sides of the wrap.

import { placeStreetLamp } from '../street/api.js'
import { Z, LANES_W, LANES_E, MEDIAN_Z, PERIOD, stations, wrapSeed, safe, METRO, BEREZOVAYA, TERM, WALK_LAMPS } from './layout.js'

const SPAN_H = 7.25 // span-wire eyes on the poles
const WIRE_H = 5.8 // contact wire above the road
const POLE_N = Z.N_CURB - 0.8 // 523.2
const POLE_S = Z.S_CURB + 0.8 // 556.8

/** Side poles we leave out (street mouths, the terminal exit). */
function skipPole(x, side) {
  if (x > METRO.x0 - 1 && x < METRO.x1 + 1) return true
  if (side === 'n' && x > BEREZOVAYA.x0 - 1.5 && x < BEREZOVAYA.x1 + 1.5) return true
  if (side === 's' && x > 586 && x < 610) return true // terminal exit mouth
  if (side === 's' && x > 524 && x < 548) return true // terminal entry mouth
  return false
}

export function buildOverhead(ctx) {
  const { world, wires } = ctx
  const xs = stations()
  const out = { lamps: [], poles: [], contact: [] }
  const reg = ctx.registry
  reg.streetLamps = reg.streetLamps || []
  // one end-of-life sodium on the median (cycling), the same x on both sides of the wrap
  const cycling = new Set([wrapSeed(444)])
  for (const x of xs) {
    const s = wrapSeed(x)
    // ---- median double cobra
    safe('median lamp', () => {
      if (x > METRO.x0 - 2 && x < METRO.x1 + 2) return
      const L = placeStreetLamp(ctx, {
        x, z: MEDIAN_Z, y: 0.25, angle: 0, type: 'cobra_double', seed: s, broken: false,
        flicker: cycling.has(s) ? 'cycle' : false, flyers: false,
      })
      out.lamps.push(L)
    })
    // ---- side trolley poles (span eye toward the road = local +Z)
    for (const side of ['n', 's']) {
      if (skipPole(x, side)) continue
      safe('trolley pole', () => {
        const z = side === 'n' ? POLE_N : POLE_S
        const p = world.place('street_trolley_pole', { x, z, y: 0.25, angle: side === 'n' ? 0 : Math.PI, tag: 'trolley_pole', seed: (s % 997) / 997 })
        if (p) out.poles.push(p)
      })
    }
  }
  if (!wires) return out
  safe('span wires', () => {
    for (const x of xs) {
      const span = []
      if (!skipPole(x, 'n')) span.push([x, 0.25 + SPAN_H, POLE_N + 0.4])
      span.push([x, 0.25 + SPAN_H, MEDIAN_Z])
      if (!skipPole(x, 's')) span.push([x, 0.25 + SPAN_H, POLE_S - 0.4])
      if (span.length >= 2) wires.add(span, { sag: 0.18, color: 0x2a2a2c })
      // droppers from the span down to each contact pair
      for (const zc of [LANES_W[0], LANES_E[0]]) {
        wires.add([[x, 0.25 + SPAN_H - 0.14, zc], [x, WIRE_H + 0.03, zc]], { sag: 0, color: 0x2a2a2c, segments: 1 })
      }
    }
  })
  // contact wires: two per direction, 0.6 m apart, over the kerb lanes, from x 0 to 640
  safe('contact wires', () => {
    const xsAll = [...xs, 640]
    for (const zc of [LANES_W[0], LANES_E[0]]) {
      for (const dz of [-0.3, 0.3]) {
        const pts = xsAll.map(x => [x, WIRE_H, zc + dz])
        wires.add(pts, { sag: 0.12, color: 0x3a3530 })
        out.contact.push(pts)
        ;(reg.trolleyWires ||= []).push({ points: pts, height: WIRE_H })
      }
    }
  })
  return out
}

/**
 * Cobra lamps along the back of both walks (heads reaching over the walk), every 74 m, seeded by
 * x mod 592 so the wrapped copies match. One on the south walk is dead.
 */
export function buildWalkLamps(ctx) {
  const out = []
  for (const side of ['n', 's']) {
    const W = WALK_LAMPS[side]
    for (let x = W.x0; x <= 640; x += WALK_LAMPS.pitch) {
      if (x < 0 || W.skip.some(([a, b]) => x > a && x < b)) continue
      const s = wrapSeed(x, side === 'n' ? 3 : 5)
      safe('walk lamp', () => out.push(placeStreetLamp(ctx, {
        x, z: W.z, angle: side === 'n' ? 0 : Math.PI, type: 'cobra', seed: s,
        broken: side === 's' && Math.round(x) === 218, flicker: false, flyers: undefined,
      })))
    }
  }
  return out
}

/**
 * Trolleybus wires of the terminal: a pair from the eastbound line into the loop and round it,
 * a branch over the trolleybus layover bay, and the pair back out to the avenue; support poles on
 * the outside of the loop with short span arms.
 */
export function buildTerminalWires(ctx) {
  const { wires, world } = ctx
  if (!wires) return
  safe('terminal wires', () => {
    const zc = LANES_E[0]
    // centreline: from the eastbound pair, through the entry mouth, round the loop, back out
    const path = [[526, zc], [529, zc], [535, 559.25], ...TERM.loop, [596, 559.25], [604, zc], [612, zc]]
    const pts = resample(path, 4)
    const pairs = offsets(pts, [-0.3, 0.3])
    for (const line of pairs) {
      wires.add(line.map(([x, z]) => [x, WIRE_H, z]), { sag: 0.05, color: 0x3a3530 })
      ;(ctx.registry.trolleyWires ||= []).push({ points: line.map(([x, z]) => [x, WIRE_H, z]), height: WIRE_H })
    }
    // the layover bay branch (trolleybus heading east, poles trailing west)
    const bay = TERM.trolleyBay
    const bpath = resample([[544, 596], [549, 594.5], [553, bay.z], [bay.x + 4, bay.z]], 3)
    for (const line of offsets(bpath, [-0.3, 0.3])) wires.add(line.map(([x, z]) => [x, WIRE_H, z]), { sag: 0.04, color: 0x3a3530 })
    // poles on the outside of the loop, each with a span to the wire pair
    const polePts = [[531.5, 570.5], [529.2, 593.4], [552, 600.2], [572, 600.2], [597.6, 590], [597.6, 573], [560, 587.6]]
    for (const [px, pz] of polePts) {
      // nearest point of the wire centreline
      let best = null, bd = 1e9
      for (const q of [...pts, ...bpath]) { const d = Math.hypot(q[0] - px, q[1] - pz); if (d < bd) { bd = d; best = q } }
      const ang = Math.atan2(best[0] - px, best[1] - pz) // face the wire (street convention)
      const ty = ctx.terrain.heightAt(px, pz)
      world.place('street_trolley_pole', { x: px, z: pz, y: Number.isFinite(ty) ? ty : 0.25, angle: ang, tag: 'trolley_pole' })
      const gy = (Number.isFinite(ty) ? ty : 0.25) + SPAN_H
      wires.add([[px + Math.sin(ang) * 0.4, gy, pz + Math.cos(ang) * 0.4], [best[0], WIRE_H + 0.35, best[1]]], { sag: 0.06, color: 0x2a2a2c })
    }
  })
}

function resample(path, step) {
  const out = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i]
    const L = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(L / step))
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n])
  }
  return out
}

function offsets(pts, offs) {
  return offs.map(o => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1
    return [p[0] - dz / L * o, p[1] + dx / L * o]
  }))
}

export { PERIOD }
