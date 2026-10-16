// A stray dog (дворняга) that turns up in the courtyards now and then: it trots along the
// paths, stops to sniff the snow, keeps its distance (trots away when you come within ~16 m) and
// barks at you once it feels safe again, or at nothing in particular, far off.

import { clamp } from '../../core/rng.js'
import { DOG_MODELS } from './dog.js'
import { fixFine } from './vox.js'
import { life, sound } from './rt.js'

// frame index: 0–3 trot, 4 stand, 5 sniff, 6 bark (order of createDog's placements)
const PREFER = { courtyard: 1, path: 1, park: 0.8, trodden: 0.7, sidewalk: 0.45, driveway: 0.5, crossing: 0.2, entrance: 0, island: 0 }

export function createDog(ctx) {
  const names = [...DOG_MODELS.trot, DOG_MODELS.stand, DOG_MODELS.sniff, DOG_MODELS.bark]
  const frames = names.map(n => { fixFine(n); return ctx.world.place(n, { x: 320, z: 320, y: 0, dynamic: true, collide: false, visible: false, tag: 'dog' }) })
  if (!frames.every(Boolean)) return
  life.dog = {
    frames, shown: -1, state: 'absent', timer: life.rng.float(50, 200),
    e: -1, from: -1, to: -1, s: 0, x: 0, y: 0, z: 0, ang: 0, odo: 0, speed: 1.4,
    hops: 0, act: null, actT: 0, barkT: life.rng.float(20, 60), visible: false, visT: 0, hiddenFor: 0, roamLeft: 0,
    dogVoice: 2,
  }
}

function show(d, k) {
  const p = d.frames[k]
  p.set(d.x, d.y, d.z, d.ang)
  if (d.shown !== k) {
    if (d.shown >= 0) d.frames[d.shown].visible = false
    p.visible = true
    d.shown = k
  }
}
function hide(d) { for (const p of d.frames) p.visible = false; d.shown = -1 }

function pickEdge(d, n, away = null) {
  const g = life.graph, rng = life.rng
  let total = 0
  const c = []
  for (const e of g.nodes[n].adj) {
    const E = g.edges[e]
    let w = PREFER[E.kind] ?? 0.4
    if (w <= 0) continue
    const m = g.other(e, n)
    if (g.nodes[m].door) continue
    if (e === d.e) w *= 0.25
    if (away) {
      const ox = g.nodes[m].x - g.nodes[n].x, oz = g.nodes[m].z - g.nodes[n].z
      const dot = (ox * away[0] + oz * away[1]) / (Math.hypot(ox, oz) || 1)
      w *= Math.max(0.03, dot + 1) ** 3
    }
    c.push([e, w]); total += w
  }
  if (!c.length) return -1
  let r = rng.next() * total
  for (const [e, w] of c) { r -= w; if (r <= 0) return e }
  return c[c.length - 1][0]
}

function appear(ctx, d) {
  const g = life.graph, rng = life.rng, pl = ctx.player.pos
  for (let i = 0; i < 60; i++) {
    const s = g.sample(rng)
    if (!s) return false
    const E = g.edges[s.e]
    if ((PREFER[E.kind] ?? 0.4) < 0.4 && i < 40) continue
    const dist = Math.hypot(s.x - pl.x, s.z - pl.z)
    if (dist < 32 || dist > 85) continue
    const y = ctx.terrain.heightAt(s.x, s.z)
    if (!Number.isFinite(y)) continue
    if (life.view.seen(ctx.world, s.x, y, s.z, 0.7)) continue
    const fwd = rng.chance(0.5)
    d.e = s.e; d.from = fwd ? E.a : E.b; d.to = fwd ? E.b : E.a
    d.s = (fwd ? s.t : 1 - s.t) * E.len
    d.x = s.x; d.z = s.z; d.y = y
    d.state = 'roam'; d.roamLeft = rng.float(100, 280); d.act = 'trot'; d.actT = rng.float(4, 12)
    d.hiddenFor = 0
    return true
  }
  return false
}

function bark(ctx, d) {
  d.act = 'bark'; d.actT = life.rng.float(1.6, 3.2)
  sound('dog_bark', [d.x, d.y + 0.5, d.z], { dog: d.dogVoice })
  life.stats.barks++
}

export function updateDog(ctx, dt) {
  const d = life.dog
  const g = life.graph
  if (!d || !g || !g.total || life.noDog) return
  const rng = life.rng, pl = ctx.player.pos
  if (d.state === 'absent') {
    d.timer -= dt
    if (d.timer > 0) return
    // strays are about more at dusk and at night, less in heavy snow
    const h = ((ctx.atmos?.minutes ?? 1000) / 60) % 24
    const ok = (h >= 6 && h < 10) || h >= 15 || h < 2
    if (!ok || (ctx.atmos?.cur?.snow ?? 0) > 0.9 || !appear(ctx, d)) { d.timer = rng.float(60, 160); return }
  }
  const dist = Math.hypot(d.x - pl.x, d.z - pl.z)
  // visibility
  d.visT -= dt
  if (d.visT <= 0) {
    d.visT = 0.35
    d.visible = d.shown >= 0 && life.view.seen(ctx.world, d.x, d.y, d.z, 0.7)
    d.hiddenFor = d.visible ? 0 : d.hiddenFor + 0.35
  }
  d.roamLeft -= dt
  if (d.state === 'roam' && d.roamLeft <= 0) d.state = 'leave'
  if ((d.state === 'leave' && !d.visible && dist > 30) || dist > 140 || (d.state === 'flee' && !d.visible && dist > 70)) {
    d.state = 'absent'; d.timer = rng.float(180, 600); hide(d); return
  }
  // keep away from the player
  if (dist < 16 && d.state !== 'flee') {
    d.state = 'flee'; d.act = 'trot'; d.actT = 99; d.fleeFrom = [pl.x, pl.z]
    // turn round if heading toward the player
    const A = g.nodes[d.from], B = g.nodes[d.to]
    if ((B.x - A.x) * (pl.x - d.x) + (B.z - A.z) * (pl.z - d.z) > 0) { const t = d.from; d.from = d.to; d.to = t; d.s = g.edges[d.e].len - d.s }
  }
  if (d.state === 'flee' && dist > 34) {
    d.state = 'roam'; d.act = 'stand'; d.actT = rng.float(1.0, 2.0); d.turnTo = true
    d.roamLeft = Math.max(d.roamLeft, 30)
    d.barkAfter = rng.chance(0.65)
  }
  // activities
  d.actT -= dt
  if (d.actT <= 0 && d.state !== 'flee') {
    if (d.barkAfter) { d.barkAfter = false; bark(ctx, d) } else {
      const r = rng.next()
      if (d.state === 'leave' || r < 0.55) { d.act = 'trot'; d.actT = rng.float(4, 14) }
      else if (r < 0.85) { d.act = 'sniff'; d.actT = rng.float(1.5, 5) }
      else { d.act = 'stand'; d.actT = rng.float(1, 3) }
    }
  }
  // barking at the distant player now and then (or at nothing)
  d.barkT -= dt
  if (d.barkT <= 0) {
    d.barkT = rng.float(35, 110)
    if (dist > 30 && d.act !== 'trot' && rng.chance(0.6)) bark(ctx, d)
  }
  // movement along the graph
  let pose = 4
  if (d.act === 'trot') {
    const sp = d.state === 'flee' ? 2.7 : 1.35
    const v = sp * dt
    d.s += v; d.odo += v
    let guard = 0
    while (d.s >= g.edges[d.e].len && guard++ < 6) {
      const rest = d.s - g.edges[d.e].len
      const n = d.to
      const away = d.state === 'flee' ? [g.nodes[n].x - pl.x, g.nodes[n].z - pl.z].map(v2 => v2 / (Math.hypot(g.nodes[n].x - pl.x, g.nodes[n].z - pl.z) || 1)) : null
      let next = pickEdge(d, n, away)
      if (next < 0) next = d.e
      d.from = n; d.to = g.other(next, n); d.e = next; d.s = rest
    }
    pose = Math.floor(d.odo / 0.24) % 4
  } else if (d.act === 'sniff') pose = 5
  else if (d.act === 'bark') pose = 6
  const E = g.edges[d.e], A = g.nodes[d.from], B = g.nodes[d.to]
  const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len
  // a dog wanders off the centre line a little
  const off = Math.sin(d.odo * 0.37) * 0.5
  d.x = A.x + dx * d.s - dz * off; d.z = A.z + dz * d.s + dx * off
  const ty = ctx.terrain.heightAt(d.x, d.z)
  if (Number.isFinite(ty)) d.y += (ty - d.y) * Math.min(1, dt * 10)
  // facing: along the path while trotting; toward the player when barking/standing after a flight
  let target = Math.atan2(dx, dz)
  if (d.act !== 'trot' && (d.act === 'bark' || d.turnTo)) target = Math.atan2(pl.x - d.x, pl.z - d.z)
  let da = target - d.ang
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  d.ang += clamp(da, -dt * 4.5, dt * 4.5)
  if (d.act === 'trot') d.turnTo = false
  show(d, pose)
}

