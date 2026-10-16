// Rare distant pedestrians. The city is mostly empty, but not entirely: 0–2 figures in view at a
// time, more around 17–19 h, almost nobody after 1 am. People appear only far from the player
// (35–120 m) where nobody is looking, walk the nav graph with frame-swapped walk cycles, leave
// footprints, and vanish into the fog, around corners or into entrances. Sometimes a figure turns
// into a подъезд just as you arrive. Nobody ever reacts to the player.

import { clamp, smoothstep } from '../../core/rng.js'
import { PEOPLE } from './people.js'
import { fixFine } from './vox.js'
import { life, later, sound, groundInfo, swingDoor } from './rt.js'

/** How many actors (sets of frame placements) exist per type. */
const POOL = { man_coat: 2, woman_coat: 2, man_puffer: 1, man_jacket: 1, woman_puffer: 1, babushka_cart: 1, man_dog: 1, parent_sled: 1 }
const MAX_ACTIVE = 3
const MAX_VISIBLE = 2
const R_MIN = 35, R_MAX = 120
const LANE = { sidewalk: 0.55, driveway: 0.8, path: 0.22, courtyard: 0.25, park: 0.25, crossing: 0.3, trodden: 0, entrance: 0, fallback: 0.4 }
const KIND_W = { sidewalk: 1, path: 1, courtyard: 0.9, park: 0.8, crossing: 0.7, driveway: 0.6, trodden: 0.04, entrance: 0, island: 0 }

// expected number of people around the player through the day (hour → count)
const CURVE = [[0, 0.3], [1, 0.05], [2, 0.03], [5, 0.03], [6, 0.35], [7, 1.0], [8.5, 1.3], [10, 0.75], [13, 0.9], [16, 1.1], [17, 1.85], [19, 1.75], [20.5, 1.1], [22, 0.75], [23, 0.45], [24, 0.3]]

/** Expected walker count at a game time (minutes from midnight). */
export function peopleTarget(minutes, snow = 0.3) {
  const h = ((minutes / 60) % 24 + 24) % 24
  let v = CURVE[CURVE.length - 1][1]
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [h0, a] = CURVE[i], [h1, b] = CURVE[i + 1]
    if (h >= h0 && h <= h1) { v = a + (b - a) * smoothstep(0, 1, (h - h0) / (h1 - h0)); break }
  }
  // heavy snow keeps people indoors
  return v * (1 - 0.35 * clamp((snow - 0.5) * 2, 0, 1))
}

function typeOk(type, hour) {
  const P = PEOPLE[type]
  if (!P.hours) return true
  const [a, b] = P.hours
  return hour >= a && hour < b
}

function typeWeight(type, hour) {
  let w = PEOPLE[type].weight
  const commute = (hour >= 7 && hour < 9.5) || (hour >= 17 && hour < 20)
  if (commute && (type === 'man_coat' || type === 'woman_coat' || type === 'man_puffer')) w *= 1.6
  if ((hour >= 22 || hour < 6) && type === 'man_dog') w *= 2.0
  if (hour >= 21 && (type === 'woman_puffer' || type === 'parent_sled')) w *= 0.3
  return w
}

// ---- actors: frame placements created at build time (meshed with the world) ----------------------

export function createActors(ctx) {
  const { world } = ctx
  life.actors = []
  for (const [type, n] of Object.entries(POOL)) {
    const P = PEOPLE[type]
    if (!P) continue
    for (let i = 0; i < n; i++) {
      const names = [...P.frames, P.stand]
      const frames = names.map(name => {
        fixFine(name)
        return world.place(name, { x: 320, z: 320, y: 0, dynamic: true, collide: false, visible: false, tag: 'person' })
      })
      if (frames.every(Boolean)) life.actors.push({ type, frames, busy: false, shown: -1 })
    }
  }
}

function showFrame(actor, k, x, y, z, ang) {
  const p = actor.frames[k]
  p.set(x, y, z, ang)
  if (actor.shown !== k) {
    if (actor.shown >= 0) actor.frames[actor.shown].visible = false
    p.visible = true
    actor.shown = k
  }
}
function hideActor(actor) {
  for (const p of actor.frames) p.visible = false
  actor.shown = -1
}

// ---- spawning --------------------------------------------------------------------------------------

export function trySpawn(ctx, force = null) {
  const g = life.graph
  if (!g || !g.total) return null
  const rng = life.rng
  const pl = ctx.player.pos
  const hour = ((ctx.atmos?.minutes ?? 1000) / 60) % 24
  if (!force) {
    if (life.walkers.length >= MAX_ACTIVE) return null
    if (life.walkers.filter(w => w.visible).length >= MAX_VISIBLE) return null
  }
  const free = life.actors.filter(a => !a.busy && (force?.type ? a.type === force.type : typeOk(a.type, hour)))
  if (!free.length) return null
  let total = 0
  for (const a of free) total += typeWeight(a.type, hour)
  let r = rng.next() * total, actor = free[0]
  for (const a of free) { r -= typeWeight(a.type, hour); if (r <= 0) { actor = a; break } }

  const world = ctx.world, terrain = ctx.terrain, view = life.view
  const rMin = force?.rMin ?? R_MIN, rMax = force?.rMax ?? R_MAX
  for (let i = 0; i < 48; i++) {
    const useDoor = g.doors.length && rng.chance(force?.door ? 1 : 0.28)
    if (useDoor) {
      const n = rng.pick(g.doors)
      const d = Math.hypot(n.x - pl.x, n.z - pl.z)
      if (d < rMin || d > Math.min(rMax, 110) || !n.adj.length) continue
      const y = n.door?.y ?? terrain.heightAt(n.x, n.z)
      if (!force?.visible && view.seen(world, n.x, y, n.z, 1.7)) continue
      return startWalker(ctx, actor, { door: n })
    }
    const s = g.sample(rng)
    if (!s) return null
    const d = Math.hypot(s.x - pl.x, s.z - pl.z)
    if (d < rMin || d > rMax) continue
    const y = terrain.heightAt(s.x, s.z)
    if (!Number.isFinite(y)) continue
    if (!force?.visible && view.seen(world, s.x, y, s.z, 1.7)) continue
    return startWalker(ctx, actor, { sample: s })
  }
  return null
}

function startWalker(ctx, actor, o) {
  const g = life.graph, rng = life.rng
  const P = PEOPLE[actor.type]
  const w = {
    actor, P, type: actor.type, speed: P.speed * rng.float(0.9, 1.08), stride: P.stride * rng.float(0.95, 1.05),
    e: -1, from: -1, to: -1, s: 0, x: 0, y: 0, z: 0, ang: 0, lx: 0, lz: 0, laneSide: 1,
    odo: rng.float(0, 4), frame: -1, state: 'walk', intent: 'pass', route: null, target: -1,
    life: 0, maxLife: rng.float(80, 240), hiddenFor: 0, visible: false, seenEver: false, visT: rng.float(0, 0.3), chkT: 0,
    wait: 0, pause: 0, triedDoor: false, barked: false, door: null, enterDir: null,
  }
  actor.busy = true
  const tint = rng.pick(P.tints)
  for (const p of actor.frames) p.tint.setHex(tint)
  if (o.door) {
    // someone comes out of a подъезд: the door opens, then the figure steps out
    const n = o.door
    const e = n.adj[0]
    w.e = e; w.from = n.id; w.to = g.other(e, n.id); w.s = -0.8
    w.state = 'exit'; w.wait = 0; w.door = n.door
    swingDoor(n.door, 1.8)
    life.stats.exited++
  } else {
    const s = o.sample
    const E = g.edges[s.e]
    const fwd = rng.chance(0.5)
    w.e = s.e; w.from = fwd ? E.a : E.b; w.to = fwd ? E.b : E.a
    w.s = (fwd ? s.t : 1 - s.t) * E.len
    // a third of people are on their way home: route them to a door some way off
    if (g.doors.length && rng.chance(0.3)) {
      const res = g.dijkstra(w.to, 230)
      const homes = [...res.keys()].filter(id => g.nodes[id].door && res.get(id).d > 30)
      if (homes.length) {
        w.target = rng.pick(homes)
        w.route = g.route(res, w.target)
        w.intent = 'home'
      }
    }
  }
  placeWalker(ctx, w, 0, true)
  life.walkers.push(w)
  life.stats.spawned++
  return w
}

export function despawn(w) {
  hideActor(w.actor)
  w.actor.busy = false
  w.dead = true
  const i = life.walkers.indexOf(w)
  if (i >= 0) life.walkers.splice(i, 1)
  life.stats.despawned++
}

// ---- movement ----------------------------------------------------------------------------------------

function chooseNext(w, n, ctx) {
  const g = life.graph, rng = life.rng
  const cur = g.edges[w.e]
  const dirx = g.nodes[w.to].x - g.nodes[w.from].x, dirz = g.nodes[w.to].z - g.nodes[w.from].z
  const dl = Math.hypot(dirx, dirz) || 1
  let total = 0
  const cands = []
  // someone leaving a подъезд follows the entrance stub (and its trodden link) out to the paths
  const leaving = cur.kind === 'entrance' || cur.kind === 'trodden'
  for (const e of n.adj) {
    if (e === w.e) continue
    const E = g.edges[e]
    let kw = KIND_W[E.kind] ?? 0.8
    if (leaving && (E.kind === 'entrance' || E.kind === 'trodden')) kw = 1
    if (kw <= 0) continue
    const m = g.other(e, n.id)
    if (g.nodes[m].door) continue
    const ox = g.nodes[m].x - n.x, oz = g.nodes[m].z - n.z
    const ol = Math.hypot(ox, oz) || 1
    const c = (dirx * ox + dirz * oz) / (dl * ol)
    const wt = kw * (0.25 + Math.max(0, c) ** 2 * 1.6)
    cands.push([e, wt]); total += wt
  }
  if (!cands.length) return -1
  let r = rng.next() * total
  for (const [e, wt] of cands) { r -= wt; if (r <= 0) return e }
  return cands[cands.length - 1][0]
}

/** Arrive at w.to. Returns false if the walker stopped following edges (door, despawn). */
function arrive(w, ctx) {
  const g = life.graph, rng = life.rng
  const n = g.nodes[w.to]
  const pl = ctx.player.pos
  // whoever walks up to a door goes in
  if (n.door && w.state === 'walk') { w.s = g.edges[w.e].len - 0.5; beginEnter(w); return false }
  let next = -1
  if (w.route && w.route.length) next = w.route.shift()
  else {
    if (w.intent === 'home') { w.intent = 'pass'; w.target = -1 }
    // as the player comes close, a figure may turn into a nearby entrance
    const d = Math.hypot(n.x - pl.x, n.z - pl.z)
    if (!w.triedDoor && d < 30 && g.doors.length) {
      w.triedDoor = true
      if (rng.chance(0.4)) {
        const res = g.dijkstra(n.id, 26)
        let best = -1, bd = Infinity
        for (const [id, r] of res) if (g.nodes[id].door && r.d < bd) { bd = r.d; best = id }
        if (best >= 0) {
          w.intent = 'home'; w.target = best
          w.route = g.route(res, best)
          if (w.route.length) next = w.route.shift()
        }
      }
    }
    if (next < 0) next = chooseNext(w, n, ctx)
    // now and then someone stops for a moment (catching breath, checking the time)
    if (next >= 0 && rng.chance(w.type === 'babushka_cart' ? 0.12 : 0.03)) w.pause = rng.float(1.5, 4.5)
  }
  if (next < 0) {
    if (!w.visible) { despawn(w); return false }
    next = w.e // dead end in plain view: turn back
  }
  w.from = w.to
  w.to = g.other(next, w.from)
  w.e = next
  return true
}

function beginEnter(w) {
  const g = life.graph
  const n = g.nodes[w.to]
  w.state = 'door_wait'
  w.wait = 0
  w.door = n.door
  const E = g.edges[w.e]
  // direction into the building = along the edge toward the door
  const A = g.nodes[w.from]
  w.enterDir = [(n.x - A.x) / E.len, (n.z - A.z) / E.len]
}

function terrainY(ctx, x, z, fallback) {
  const h = ctx.terrain.heightAt(x, z)
  return Number.isFinite(h) ? h : fallback
}

/**
 * Position the walker from its edge state and update its frame / footprints.
 * moved: metres travelled this frame (drives the walk cycle).
 */
function placeWalker(ctx, w, dt, snap = false) {
  const g = life.graph
  const E = g.edges[w.e]
  const A = g.nodes[w.from], B = g.nodes[w.to]
  const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len
  const px = A.x + dx * w.s, pz = A.z + dz * w.s
  // keep to the right of the path; step aside if the player stands in the way
  let lane = (LANE[E.kind] ?? 0.3) * w.laneSide
  const pl = ctx.player.pos
  const rx = -dz, rz = dx
  const ox = pl.x - px, oz = pl.z - pz
  const ahead = ox * dx + oz * dz, side = ox * rx + oz * rz
  if (ahead > -0.8 && ahead < 3.5 && Math.abs(side - lane) < 1.1) lane = side > lane ? side - 1.15 : side + 1.15
  const k = snap ? 1 : Math.min(1, dt * 2.2)
  w.lx += (rx * lane - w.lx) * k
  w.lz += (rz * lane - w.lz) * k
  const x = px + w.lx, z = pz + w.lz
  // height: terrain, rising onto the porch near a door
  let ty = terrainY(ctx, x, z, w.y)
  const door = A.door || B.door
  if (door && Number.isFinite(door.y)) {
    const dn = A.door ? A : B
    const dd = Math.hypot(x - dn.x, z - dn.z)
    ty = door.y + (ty - door.y) * smoothstep(0.5, 2.9, dd)
  }
  w.y = snap ? ty : w.y + (ty - w.y) * Math.min(1, dt * 9)
  const target = Math.atan2(dx, dz)
  if (snap) w.ang = target
  else {
    let da = target - w.ang
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    w.ang += clamp(da, -dt * 3.6, dt * 3.6)
  }
  w.x = x; w.z = z
  // walk cycle: a new frame every half step
  const standing = w.pause > 0 || w.state === 'door_wait'
  const f = standing ? 4 : Math.floor(w.odo / (w.stride / 2)) % 4
  if (f !== w.frame) {
    if ((f === 0 || f === 2) && !snap && w.frame >= 0) footfall(ctx, w, f === 0 ? -1 : 1)
    w.frame = f
  }
  showFrame(w.actor, f, x, w.y, z, w.ang)
}

function footfall(ctx, w, side) {
  const pl = ctx.player.pos
  const d = Math.hypot(w.x - pl.x, w.z - pl.z)
  if (d > 95) return
  const fx = w.x + Math.sin(w.ang) * 0.24, fz = w.z + Math.cos(w.ang) * 0.24
  const th = ctx.terrain.heightAt(fx, fz)
  if (!Number.isFinite(th)) return
  const gi = groundInfo(ctx.terrain, fx, fz)
  if (gi.print > 0 && Math.abs(w.y - th) < 0.12 && ctx.footprints) {
    const heading = Math.atan2(-Math.sin(w.ang), -Math.cos(w.ang))
    ctx.footprints.add(fx, th, fz, heading, side, gi.print)
  }
  if (d < 14) sound('step_' + gi.surf, [fx, th + 0.05, fz], { gain: 0.42 + (w.type === 'man_puffer' ? 0.08 : 0) })
}

function stepWalker(ctx, w, dt) {
  const g = life.graph
  w.life += dt
  const pl = ctx.player.pos
  if (w.state === 'exit') {
    w.wait += dt
    if (w.wait < 0.45) { placeHidden(w); return }
    w.state = 'walk'
  }
  if (w.state === 'door_wait') {
    w.wait += dt
    const pos = [w.x, w.y + 0.3, w.z]
    const near = Math.hypot(w.x - pl.x, w.z - pl.z) < 45
    if (!w._stamped && w.wait > 0.2) { w._stamped = true; if (near) sound('stamp_snow', pos, { gain: 0.7 }) }
    if (!w._beeped && w.wait > 1.1) { w._beeped = true; if (near) sound('intercom_beep', pos, { kind: 'ok', gain: 0.5 }) }
    if (!w._opened && w.wait > 1.45) { w._opened = true; swingDoor(w.door, 1.2) }
    if (w.wait > 1.75) {
      // step in through the doorway
      w.state = 'enter'
      w.wait = 0
    }
    placeWalker(ctx, w, dt)
    return
  }
  if (w.state === 'enter') {
    w.wait += dt
    const v = w.speed * 0.7 * dt
    w.s += v; w.odo += v
    placeWalker(ctx, w, dt)
    if (w.wait > 0.95) { life.stats.entered++; despawn(w) }
    return
  }
  // ---- walking
  if (w.pause > 0) {
    w.pause -= dt
    placeWalker(ctx, w, dt)
  } else {
    const v = w.speed * dt * (ctx.atmos?.cur?.snow > 0.8 ? 0.88 : 1)
    w.s += v
    w.odo += v
    let guard = 0
    while (guard++ < 8) {
      const E = g.edges[w.e]
      // stop at the door of the target entrance
      if (w.intent === 'home' && w.to === w.target && g.nodes[w.to].door && w.s >= E.len - 0.5) {
        w.s = E.len - 0.5
        beginEnter(w)
        break
      }
      if (w.s < E.len) break
      const rest = w.s - E.len
      if (!arrive(w, ctx)) return
      w.s = rest
    }
    placeWalker(ctx, w, dt)
  }
  // leashed dog grumbles at a passer-by now and then
  if (w.type === 'man_dog' && !w.barked) {
    const d = Math.hypot(w.x - pl.x, w.z - pl.z)
    if (d < 16) {
      w.barked = true
      if (life.rng.chance(0.45)) {
        const dx = w.x + Math.sin(w.ang) * 1.2 + Math.cos(w.ang) * 0.45, dz = w.z + Math.cos(w.ang) * 1.2 - Math.sin(w.ang) * 0.45
        sound('dog_bark', [dx, w.y + 0.45, dz], { dog: 4, gain: 0.55 })
      }
    }
  }
}

function placeHidden(w) { hideActor(w.actor); w.frame = -1 }

/** Visibility and despawn bookkeeping (throttled). */
function checkWalker(ctx, w, dt) {
  w.visT -= dt
  if (w.visT <= 0) {
    w.visT = 0.3
    const vis = w.actor.shown >= 0 && life.view.seen(ctx.world, w.x, w.y, w.z, 1.7)
    if (vis) { w.visible = true; w.hiddenFor = 0; w.seenEver = true } else { w.visible = false; w.hiddenFor += 0.3 }
  }
  w.chkT -= dt
  if (w.chkT > 0 || w.state !== 'walk') return
  w.chkT = 0.5
  const pl = ctx.player.pos
  const d = Math.hypot(w.x - pl.x, w.z - pl.z)
  if (d > 165) { despawn(w); return }
  if (w.visible) return
  if (d > 125 || (w.hiddenFor > 22 && d > 45) || (w.life > w.maxLife && d > 35)) despawn(w)
}

export function updateWalkers(ctx, dt) {
  if (!life.graph || !life.actors.length) return
  // spawn ticks
  life.spawnT = (life.spawnT ?? 4) - dt
  if (life.spawnT <= 0) {
    const interval = life.rng.float(5, 11)
    life.spawnT = interval
    const T = peopleTarget(ctx.atmos?.minutes ?? 1000, ctx.atmos?.cur?.snow ?? 0.3) * (life.density ?? 1)
    const n = life.walkers.length
    const p = clamp(T - n, 0, 1) * interval / 12
    life.stats.target = Math.round(T * 100) / 100
    if (life.rng.chance(p)) { life.stats.tries = (life.stats.tries || 0) + 1; if (!trySpawn(ctx)) life.stats.failed = (life.stats.failed || 0) + 1 }
  }
  for (let i = life.walkers.length - 1; i >= 0; i--) {
    const w = life.walkers[i]
    stepWalker(ctx, w, dt)
    if (!w.dead) checkWalker(ctx, w, dt)
  }
}

/** Debug / storytelling: spawn a walker now. opts { type, rMin, rMax, visible, door } */
export function spawnWalker(ctx, opts = {}) { return trySpawn(ctx, { rMin: 8, rMax: 60, ...opts }) }

void later
