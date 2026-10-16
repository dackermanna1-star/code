// Residential runtime: entrance doors, intercoms, explorable stairwells (lights, doorbells,
// lift), the endless stairwell anomaly, muffled life behind doors. All state lives here; the
// package's update() (or a fallback runtime module) calls tick().

import { VOXEL } from '../../core/constants.js'
import { RNG, hash2, hashf } from '../../core/rng.js'
import { FH } from './series.js'
import { CAB } from './props.js'
import { aptDoorStyle, APT_DOOR_COLORS, perFloor } from './section.js'
import { DynPlate } from './plates.js'
import {
  drawAptDoor, drawBell, drawFloorNumber, drawMailboxes, drawCabinet, drawLiftCall, drawCabPanel,
  drawGraffiti, drawNotice, GRAFFITI, NOTICES,
} from './draw.js'

export const RT = {
  doors: [], // entrance doors (dynamic ones animate)
  lifts: [],
  loops: [],
  stairwells: [],
  emitters: [], // lazily created muffled loops {pos, name, gain, em}
  pendings: [], // delayed sounds [{t, fn}]
  ctx: null,
  time: 0,
}

const DOOR_OPEN = 1.85 // rad, outward
const _tmp = [0, 0, 0]

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

/** World angle (Signs convention: 0 faces +Z) of a section-local facing direction (dx, dz). */
export function faceAngle(p, dx, dz) {
  const wx = dx * p.c + dz * p.s, wz = -dx * p.s + dz * p.c
  return Math.atan2(wx, wz)
}

/** Interaction / zone box from a section-local voxel box → world AABB {x,y,z,size}. */
function worldBox(p, x0, y0, z0, x1, y1, z1) {
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const v = p.voxelToWorld(x, 0, z)
    mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mnz = Math.min(mnz, v.z); mxz = Math.max(mxz, v.z)
  }
  const ya = p.voxelToWorld(0, y0, 0).y, yb = p.voxelToWorld(0, y1, 0).y
  return { min: [mnx, ya, mnz], max: [mxx, yb, mxz], x: (mnx + mxx) / 2, y: (ya + yb) / 2, z: (mnz + mxz) / 2, size: [mxx - mnx, yb - ya, mxz - mnz] }
}

function play(name, opts) {
  const a = RT.ctx?.audio
  if (!a || !a.ready || !a.has || !a.has(name)) return null
  try { return a.play(name, opts) } catch { return null }
}
function later(t, fn) { RT.pendings.push({ t: RT.time + t, fn }) }

function playerIn(min, max, pad = 0) {
  const p = RT.ctx?.player?.pos
  if (!p) return false
  return p.x > min[0] - pad && p.x < max[0] + pad && p.y + 0.9 > min[1] - pad && p.y < max[1] + pad && p.z > min[2] - pad && p.z < max[2] + pad
}

// ---------------------------------------------------------------------------------------------
// entrance doors
// ---------------------------------------------------------------------------------------------

/** Register an entrance door. sec: section record; door: placement. */
export function addEntranceDoor(ctx, sec, doorP, opts) {
  const { L, p } = sec
  const hinge = p.voxelToWorld(L.door.x0, L.tambourY, L.F)
  const center = p.voxelToWorld(L.door.x0 + 2, L.tambourY + 4, L.F + 0.5)
  const d = {
    sec, p: doorP, hinge, center, base: p.angle, swing: 0, target: 0, timer: 0, enterable: !!opts.enterable,
    ringing: null, number: opts.number, flats: opts.flats,
  }
  RT.doors.push(d)
  const box = worldBox(p, L.door.x0 - 0.2, L.tambourY, L.F - 0.6, L.door.x1 + 0.2, L.tambourY + 8, L.F + 1.8)
  ctx.interactions.add({
    x: box.x, y: box.y, z: box.z, size: box.size, reach: 2.6, tag: 'entrance_door',
    prompt: () => d.enterable
      ? (d.swing > 0.3 ? { ru: 'Закрыть дверь', en: 'Close the door' } : { ru: 'Открыть дверь', en: 'Open the door' })
      : { ru: 'Заперто · домофон', en: 'Locked · intercom' },
    onUse: () => useEntrance(d),
    data: { entrance: opts.number },
  })
  return d
}

function useEntrance(d) {
  if (!d.enterable) {
    // dial a flat: beeps, then the domofon rings and rings, and nobody answers
    if (d.ringing) return
    play('intercom_beep', { pos: [d.center.x, d.center.y, d.center.z], gain: 0.7 })
    d.ringing = true
    later(0.9, () => {
      const em = play('intercom_call', { pos: [d.center.x, d.center.y, d.center.z], gain: 0.6, loop: true })
      later(7.5, () => { em?.stop?.(0.1); d.ringing = null })
    })
    return
  }
  if (d.target > 0.5 && d.swing > 0.3) { d.target = 0; d.timer = 0; return }
  const pl = RT.ctx.player.pos
  const inside = insideOf(d, pl)
  play(inside ? 'door_magnet_lock' : 'intercom_beep', { pos: [d.center.x, d.center.y, d.center.z], gain: 0.6 })
  later(inside ? 0.15 : 0.35, () => play('door_metal_open', { pos: [d.center.x, d.center.y, d.center.z], gain: 0.8 }))
  d.target = DOOR_OPEN
  d.timer = 4.5
}

/** Is point on the inside (tambour side) of the door's facade plane? */
function insideOf(d, pos) {
  const p = d.sec.p
  p.toLocal(pos.x, pos.y, pos.z, _tmp)
  return _tmp[2] > d.sec.L.F + 1
}

function tickDoor(d, dt) {
  if (!d.enterable) return
  const pl = RT.ctx.player.pos
  if (d.target > 0) {
    d.timer -= dt
    const near = Math.hypot(pl.x - d.hinge.x, pl.z - d.hinge.z) < 1.5 && Math.abs(pl.y - d.hinge.y) < 2
    if (d.timer <= 0 && !near) d.target = 0
  }
  if (Math.abs(d.swing - d.target) < 1e-4) return
  const opening = d.target > d.swing
  const sp = opening ? 2.2 : 1.4 + (DOOR_OPEN - d.swing) * 1.6 // closes faster as it goes (broken closer)
  d.swing = opening ? Math.min(d.target, d.swing + sp * dt) : Math.max(d.target, d.swing - sp * dt)
  d.p.collide = false
  d.p.set(d.hinge.x, d.hinge.y, d.hinge.z, d.base + d.swing)
  if (d.swing === d.target) {
    if (d.target === 0) {
      d.p.collide = true
      play('door_metal_slam', { pos: [d.center.x, d.center.y, d.center.z], gain: 1.0 })
      later(0.18, () => play('door_magnet_lock', { pos: [d.center.x, d.center.y, d.center.z], gain: 0.7 }))
    }
  }
}

// ---------------------------------------------------------------------------------------------
// stairwells
// ---------------------------------------------------------------------------------------------

/**
 * Set up an explorable stairwell for a section record:
 * sec = { p, L, number, flats:[a,b], seed, mode:'ent'|'loop', address }
 */
export function setupStairwell(ctx, sec) {
  const { p, L } = sec
  const { world, lights, zones, interactions, signs } = ctx
  const S = L.series
  const N = L.N
  const X = xp => L.SX0 + xp, Z = zp => L.ZI + zp
  const rng = new RNG(hash2(sec.seed | 0, 9091))
  const loop = sec.mode === 'loop' && N >= 9
  const lp = loop ? { T: N - 3, m: 3 } : null
  // periodic floor index for the endless stairwell (identical geometry/lights/signs per period)
  const per = k => (loop ? perFloor(L, 'loop', k) : k)
  const sw = { sec, lights: [], lamps: [], loop: lp, rng, floorsFlats: [] }
  RT.stairwells.push(sw)

  // zone: stair core + landing halls (+ lift shaft gets its own)
  const zb = worldBox(p, X(-4), L.tambourY, Z(0), X(16), L.R0, Z(23))
  zones.add({ name: `stairwell_${sec.number}`, min: zb.min, max: zb.max, type: 'stairwell', indoor: true, reverb: 'stairwell', snow: false, wind: 0.06, traffic: 0.12, priority: 2, data: { entrance: sec.number } })
  if (L.shaft) {
    const sb = worldBox(p, L.shaft.x0, L.FL1 - 1, L.shaft.z0, L.shaft.x1, L.R0, L.shaft.z1)
    zones.add({ name: `lift_${sec.number}`, min: sb.min, max: sb.max, type: 'elevator', indoor: true, reverb: 'elevator', snow: false, wind: 0, traffic: 0.05, priority: 3 })
  }

  // lights: one bulb per landing, some on half-landings; ~40% dead, a few buzzing
  const lightCfg = k => {
    const h = hashf(per(k), sec.seed * 1000 | 0, 41)
    if (sec.homeLight && k === 1) return 'ok'
    if (h < 0.38) return 'dead'
    if (!loop && h < 0.52) return 'buzz'
    if (!loop && h < 0.6) return 'dying'
    return 'ok'
  }
  const addBulb = (vx, vy, vz, cfg, tag) => {
    const lp0 = p.voxelToWorld(vx, vy, vz)
    const lamp = world.place('res_lamp_ceiling', { x: lp0.x, y: lp0.y, z: lp0.z, angle: p.angle, flag: cfg === 'dead' ? 0 : 1, tag: 'stair_lamp' })
    sw.lamps.push(lamp)
    if (cfg === 'dead') return
    const l = lights.add({
      x: lp0.x, y: lp0.y - 0.45, z: lp0.z, color: 0xffcf8f, intensity: 5.2, range: 7.5, domain: 'indoor', schedule: 'always',
      flicker: cfg === 'buzz' ? 'buzz' : cfg === 'dying' ? 'dying' : 'none', placement: lamp, halo: true, haloSize: 0.5, tag,
    })
    sw.lights.push(l)
  }
  addBulb(X(9) + 0.5, L.HL(1) - 1, Z(2) + 0.5, 'ok', 'stair_light') // tambour: always works
  for (let k = 1; k <= N; k++) {
    addBulb(X(6) + 0.5, L.FL(k) + FH - 1, Z(19) + 0.5, lightCfg(k), 'stair_light')
    if (k < N && hashf(per(k), sec.seed * 1000 | 0, 77) < 0.45) addBulb(X(2) + 0.5, L.HL(k) + FH - 1, Z(2) + 0.5, lightCfg(k + 100), 'stair_light')
  }

  // entrance interior: propped-open tambour door, mailboxes, notices
  const idp = p.voxelToWorld(X(8), L.tambourY, Z(5))
  world.place('res_door_inner', { x: idp.x, y: idp.y, z: idp.z, angle: p.angle - 1.75, tag: 'door' })
  const fpf = S.flats
  const mbCol = rng.chance(0.5) ? '#3c5a9a' : '#8e9396'
  {
    const c0 = p.voxelToWorld(X(11), L.FL1 + 4.5, Z(12))
    signs.add({ x: c0.x, y: c0.y, z: c0.z, angle: faceAngle(p, -1, 0), w: 1.5, h: 1.25, ppm: 72, indoor: true, draw: drawMailboxes(sec.flats[0], sec.flats[1], mbCol, sec.seed | 0), aged: 0.35, seed: 3 })
    const n0 = p.voxelToWorld(X(5), L.tambourY + 5, Z(2))
    signs.add({ x: n0.x - 0.0, y: n0.y, z: n0.z, angle: faceAngle(p, 1, 0), w: 0.42, h: 0.3, ppm: 90, indoor: true, draw: drawNotice(NOTICES.closeDoor.ru.split('\n')), aged: 0.5, seed: 5 })
    interactions.add({ ...boxOf(p, X(10.6), L.FL1 + 2, Z(9), X(11.2), L.FL1 + 7, Z(15)), reach: 2.2, tag: 'mailboxes',
      prompt: { ru: 'Почтовые ящики', en: 'Mailboxes' },
      onUse: g => g.ui.showNote({ style: 'paper', title: 'Пицца «Мамма Миа»', ru: 'Бесплатная доставка от 500 руб.\nТел. 8-495-...\nКаждая 3-я пицца — в подарок!', en: '"Mamma Mia" pizza\nFree delivery over 500 rub.\nEvery 3rd pizza free!' }),
    })
  }

  // per floor: doors, bells, numbers, cabinet, chute, graffiti
  for (let k = 1; k <= N; k++) {
    const pk = per(k)
    const kNum = loop && k > lp.T - lp.m ? ((k - (lp.T - lp.m + 1)) % lp.m) + (lp.T - lp.m + 1) : k
    const first = sec.flats[0] + (kNum - 1) * fpf
    sw.floorsFlats[k] = first
    L.aptDoors.forEach((d, i) => {
      const num = first + i
      const style = aptDoorStyle(pk, i, L.key.length)
      const FLk = L.FL(k)
      let cx, cz, nx, nz, w = 1.0
      if (d.side === 'L') { cx = d.plane + 1; cz = (d.z0 + d.z1) / 2; nx = 1; nz = 0 }
      else if (d.side === 'R') { cx = d.plane; cz = (d.z0 + d.z1) / 2; nx = -1; nz = 0 }
      else { cx = (d.x0 + d.x1) / 2; cz = d.plane; nx = 0; nz = -1 }
      const c = p.voxelToWorld(cx, FLk + 4, cz)
      const ang = faceAngle(p, nx, nz)
      signs.add({ x: c.x, y: c.y, z: c.z, angle: ang, w, h: 2.0, ppm: 64, indoor: true, draw: drawAptDoor(style, APT_DOOR_COLORS[style], num, num * 13 + 7) })
      // doorbell on the wall beside the frame
      const bxv = d.side === 'B' ? [d.x1 + 0.6, FLk + 5.6, cz] : [cx, FLk + 5.6, d.side === 'L' ? d.z1 + 0.6 : d.z0 - 0.6]
      const b = p.voxelToWorld(bxv[0], bxv[1], bxv[2])
      signs.add({ x: b.x, y: b.y, z: b.z, angle: ang, w: 0.12, h: 0.16, ppm: 160, indoor: true, draw: drawBell(num) })
      const ib = d.side === 'B'
        ? boxOf(p, d.x0, FLk, cz - 0.6, d.x1 + 1.2, FLk + 8, cz + 0.1)
        : boxOf(p, d.side === 'L' ? cx : cx - 0.6, FLk, d.z0 - 1.2, d.side === 'L' ? cx + 0.6 : cx, FLk + 8, d.z1 + 1.2)
      const apt = { num, pos: [c.x, c.y, c.z], last: -99 }
      interactions.add({ ...ib, reach: 2.2, tag: 'apartment_door', prompt: { ru: `Позвонить · кв. ${num}`, en: `Ring the bell · flat ${num}` }, onUse: () => ringDoor(apt, sec) })
      // muffled life behind some doors (lazy emitters)
      const life = hashf(pk, i, (sec.seed * 1000) | 0)
      if (life < 0.16) {
        const e = p.voxelToWorld(cx - nx * 5, FLk + 5, cz - nz * 5)
        RT.emitters.push({ pos: [e.x, e.y, e.z], name: life < 0.1 ? 'tv_muffled' : 'voices_muffled', gain: 0.35, em: null, sw })
      }
    })
    // floor number painted near the lift / back door
    const fn = p.voxelToWorld(X(6), L.FL(k) + 9.1, Z(23))
    const color = ['#8e2a22', '#2a3e6e', '#1f1f1f'][sec.seed * 7 % 3 | 0]
    const fnAngle = faceAngle(p, 0, -1)
    if (loop) {
      const plate = new DynPlate(ctx.game, { w: 0.5, h: 0.4, ppm: 120, indoor: true, draw: drawFloorNumber(k, color) })
      plate.setTransform(fn.x, fn.y, fn.z, fnAngle)
      plate.mesh.position.addScaledVector({ x: Math.sin(fnAngle), y: 0, z: Math.cos(fnAngle) }, 0.012)
      plate.mesh.updateMatrix(); plate.mesh.updateMatrixWorld(true)
      sw.labels = sw.labels || []
      sw.labels[k] = { plate, value: k, color }
    } else signs.add({ x: fn.x, y: fn.y, z: fn.z, angle: fnAngle, w: 0.5, h: 0.4, ppm: 120, indoor: true, draw: drawFloorNumber(k, color), aged: 0.2, seed: k })
    // cabinet face
    const cb = p.voxelToWorld(X(14), L.FL(k) + 5.5, Z(16))
    signs.add({ x: cb.x, y: cb.y, z: cb.z, angle: faceAngle(p, 0, 1), w: 0.5, h: 1.25, ppm: 80, indoor: true, draw: drawCabinet(pk * 31 + 1), aged: 0.3, seed: pk })
    // graffiti, a few per floor (periodic in the endless stairwell)
    const gr = new RNG(hash2(pk, (sec.seed * 977) | 0))
    const ng = gr.int(0, 2)
    for (let i = 0; i < ng; i++) {
      const it = gr.pick(GRAFFITI)
      const onSide = gr.chance(0.5)
      // on the stair core walls along flight A (x' = -1 wall, facing +x) or flight B (x' = 12 wall)
      if (!onSide && k >= N) continue
      const zz = 6 + gr.next() * 7
      const yy = onSide ? L.FL(k) + (16 - zz) / 2 + 4 + gr.next() * 2 : L.HL(k) + (zz - 3) / 2 + 4 + gr.next() * 2
      const gx = onSide ? X(0) : X(12)
      const g = p.voxelToWorld(gx, yy, Z(zz))
      signs.add({ x: g.x, y: g.y, z: g.z, angle: faceAngle(p, onSide ? 1 : -1, 0), w: 0.9, h: 0.3, ppm: 80, indoor: true, draw: drawGraffiti(it, i + pk * 5, gr.pick(['#202020', '#3a3a8a', '#7a1a1a', '#2a5a2a'])) })
    }
    // chute hatch interaction
    if (S.chute === 'half' && k < N) {
      const hb = boxOf(p, X(0), L.HL(k) + 2.5, Z(2), X(2), L.HL(k) + 5.5, Z(3))
      const pos = [hb.x, hb.y, hb.z]
      interactions.add({ ...hb, reach: 2, tag: 'chute', prompt: { ru: 'Мусоропровод', en: 'Garbage chute' }, onUse: () => play('garbage_chute', { pos, gain: 0.8 }) })
    } else if (S.chute === 'landing') {
      const hb = boxOf(p, X(-2), L.FL(k) + 2.5, Z(15), X(-1.4), L.FL(k) + 5.5, Z(17))
      const pos = [hb.x, hb.y, hb.z]
      interactions.add({ ...hb, reach: 2, tag: 'chute', prompt: { ru: 'Мусоропровод', en: 'Garbage chute' }, onUse: () => play('garbage_chute', { pos, gain: 0.8 }) })
    }
  }
  // roof hatch notice on the top half-landing
  {
    const rn = p.voxelToWorld(X(12), L.HL(N) + 6, Z(3.5))
    signs.add({ x: rn.x, y: rn.y, z: rn.z, angle: faceAngle(p, -1, 0), w: 0.42, h: 0.26, ppm: 100, indoor: true, draw: drawNotice(NOTICES.roof.ru.split('\n'), { hand: true }), aged: 0.6, seed: 11 })
  }
  // lift
  if (L.shaft) setupLift(ctx, sec, sw, loop)
  if (loop) {
    sw.prev = null
    sw.virt = 0
    sw.lastFloor = 0
    RT.loops.push(sw)
  }
  return sw
}

function boxOf(p, x0, y0, z0, x1, y1, z1) {
  const b = worldBox(p, x0, y0, z0, x1, y1, z1)
  return { x: b.x, y: b.y, z: b.z, size: b.size.map(v => Math.max(0.12, v)) }
}

function ringDoor(apt, sec) {
  if (RT.time - apt.last < 2.5) return
  apt.last = RT.time
  play('doorbell', { pos: apt.pos, gain: 0.8 })
  // nobody answers; very rarely, slow steps come to the door and stop
  const h = hashf(apt.num, Math.floor(RT.time / 60), (sec.seed * 1000) | 0)
  if (h < 0.06) later(3.2, () => play('footsteps_phantom', { pos: apt.pos, gain: 0.45 }))
}

// ---------------------------------------------------------------------------------------------
// lift
// ---------------------------------------------------------------------------------------------

function setupLift(ctx, sec, sw, broken) {
  const { p, L } = sec
  const { world, interactions, signs, lights } = ctx
  const sh = L.shaft
  const N = L.N
  const lift = { sec, sw, broken, floor: 1, pos: 1, vel: 0, target: 0, queue: [], state: 'idle', doorT: 0, t: 0, leaves: [], motor: null, buttons: [] }
  // landing door leaves (static placements, relocated while they slide)
  const leafPos = (k, side, open) => {
    const x = side === 0 ? sh.door0 - 2 * open : sh.door0 + 2 + 2 * open
    return p.voxelToWorld(x, L.FL(k), L.ZI + 22)
  }
  lift.leafPos = leafPos
  for (let k = 1; k <= N; k++) {
    const pair = []
    for (const side of [0, 1]) {
      const v = leafPos(k, side, 0)
      pair.push(world.place('res_lift_leaf', { x: v.x, y: v.y, z: v.z, angle: p.angle, tag: 'lift_door' }))
    }
    lift.leaves[k] = pair
    // call button + floor stencil
    const cb = p.voxelToWorld(sh.door1 + 0.9, L.FL(k) + 5, L.ZI + 23)
    signs.add({ x: cb.x, y: cb.y, z: cb.z, angle: faceAngle(p, 0, -1), w: 0.14, h: 0.2, ppm: 160, indoor: true, draw: drawLiftCall() })
    const kk = k
    interactions.add({ ...boxOf(p, sh.door1 + 0.5, L.FL(k) + 4.4, L.ZI + 22.4, sh.door1 + 1.3, L.FL(k) + 5.6, L.ZI + 23), reach: 2.2, tag: 'lift_call',
      prompt: { ru: 'Вызвать лифт', en: 'Call the lift' }, onUse: () => callLift(lift, kk) })
    if (broken) {
      const bn = p.voxelToWorld((sh.door0 + sh.door1) / 2, L.FL(k) + 5.2, L.ZI + 22)
      signs.add({ x: bn.x, y: bn.y, z: bn.z, angle: faceAngle(p, 0, -1), w: 0.36, h: 0.24, ppm: 110, indoor: true, draw: drawNotice([NOTICES.liftBroken.ru], { hand: true }), aged: 0.5, seed: 21 })
    }
  }
  if (broken) { RT.lifts.push(lift); return }
  // cab
  const c0 = p.voxelToWorld(sh.x0, L.FL(1) - 1, sh.z0)
  lift.cab = world.place('res_lift_cab', { x: c0.x, y: c0.y, z: c0.z, angle: p.angle, dynamic: true, tag: 'lift_cab' })
  const lc = p.voxelToWorld(sh.x0 + 4, L.FL(1) + 8.6, sh.z0 + 3)
  lift.light = lights.add({ x: lc.x, y: lc.y, z: lc.z, color: 0xe8f2ff, intensity: 3.2, range: 3.6, domain: 'indoor', schedule: 'always', flicker: 'buzz', placement: lift.cab, halo: false, tag: 'lift_light' })
  // button panel rides with the cab
  lift.panel = new DynPlate(ctx.game, { w: 0.42, h: 1.2, ppm: 150, indoor: true, draw: drawCabPanel(N, sec.seed * 1000 | 0) })
  const rows = Math.ceil(N / 2)
  for (let k = 1; k <= N; k++) {
    const col = (k - 1) % 2, row = Math.floor((k - 1) / 2)
    const kk = k
    // panel: centre at cab-local (6.97, 5.6, 2) voxels, 0.42 m wide along +z, 1.2 m tall
    const u = col ? 0.7 : 0.3
    const v = 0.88 - row * (0.76 / Math.max(1, rows - 0.5))
    const lz = 2 + (u - 0.5) * (0.42 / VOXEL)
    const ly = 5.6 + 2.4 - v * 4.8
    lift.buttons.push({ it, lx: 6.9, ly, lz })
  }
  placeCab(lift)
  RT.lifts.push(lift)
}

function placeCab(lift) {
  const { p, L } = lift.sec
  const sh = L.shaft
  const yv = L.FL(1) - 1 + (lift.pos - 1) * FH
  const c = p.voxelToWorld(sh.x0, yv, sh.z0)
  lift.cab.set(c.x, c.y, c.z, p.angle)
  const lc = p.voxelToWorld(sh.x0 + 4, yv + 9.6, sh.z0 + 3)
  lift.light.pos.set(lc.x, lc.y, lc.z)
  const pc = p.voxelToWorld(sh.x0 + 6.97, yv + 5.6, sh.z0 + 2)
  lift.panel.setTransform(pc.x, pc.y, pc.z, faceAngle(p, -1, 0))
  for (const b of lift.buttons) {
    const v = p.voxelToWorld(sh.x0 + b.lx, yv + b.ly, sh.z0 + b.lz)
    RT.ctx.interactions.move(b.it, v.x, v.y, v.z)
  }
}

function callLift(lift, k) {
  const { p, L } = lift.sec
  const pos = p.voxelToWorld(L.shaft.door1 + 0.9, L.FL(k) + 5, L.ZI + 23)
  play('elevator_call', { pos: [pos.x, pos.y, pos.z], gain: 0.7 })
  if (lift.broken) return
  if (lift.state === 'moving' && lift.target === k) return
  if (lift.floor === k && lift.state !== 'moving') {
    if (lift.state === 'idle' || lift.state === 'closing') { lift.state = 'opening'; play('elevator_doors', { pos: [pos.x, pos.y, pos.z], gain: 0.7 }) }
    lift.t = 0
    return
  }
  if (!lift.queue.includes(k)) lift.queue.push(k)
}

function pressCab(lift, k) {
  const cab = lift.cab
  play('elevator_call', { pos: [cab.x, cab.y + 1.2, cab.z], gain: 0.5 })
  if (lift.state === 'moving') return
  if (k === lift.floor) { if (lift.state !== 'open') { lift.state = 'opening'; lift.t = 0 } return }
  lift.queue = [k]
  if (lift.state === 'open' || lift.state === 'opening') { lift.state = 'closing'; play('elevator_doors', { pos: [cab.x, cab.y + 1, cab.z], gain: 0.7 }) }
}

function liftDoorway(lift) {
  const { p, L } = lift.sec
  const sh = L.shaft
  const b = worldBox(p, sh.door0 - 0.3, L.FL(lift.floor), L.ZI + 21.2, sh.door1 + 0.3, L.FL(lift.floor) + 8, L.ZI + 25.2)
  return playerIn(b.min, b.max)
}

function setLeaves(lift, k, f) {
  const { p } = lift.sec
  const pair = lift.leaves[k]
  if (!pair) return
  for (const side of [0, 1]) {
    const a = lift.leafPos(k, side, 0), b = lift.leafPos(k, side, 1)
    RT.ctx.world.relocate(pair[side], a.x + (b.x - a.x) * f, a.y, a.z + (b.z - a.z) * f, p.angle)
  }
}

function tickLift(lift, dt) {
  if (lift.broken) return
  const SPEED = 1.0 / (FH * VOXEL) // floors per second at 1 m/s
  switch (lift.state) {
    case 'idle':
      if (lift.queue.length) {
        lift.target = lift.queue.shift()
        if (lift.target === lift.floor) { lift.state = 'opening'; play('elevator_doors', { pos: [lift.cab.x, lift.cab.y + 1, lift.cab.z], gain: 0.7 }) }
        else {
          lift.state = 'moving'
          lift.motor = play('elevator_motor', { pos: [lift.cab.x, lift.cab.y + 1, lift.cab.z], gain: 0.6, loop: true, refDistance: 2, maxDistance: 60 })
        }
      }
      break
    case 'moving': {
      const dir = Math.sign(lift.target - lift.pos)
      const dist = Math.abs(lift.target - lift.pos)
      const vmax = dist < 0.35 ? Math.max(0.12, dist * 2.4) * SPEED : SPEED
      lift.vel += (dir * vmax - lift.vel) * Math.min(1, dt * 2.5)
      lift.pos += lift.vel * dt
      if ((dir > 0 && lift.pos >= lift.target) || (dir < 0 && lift.pos <= lift.target) || dist < 0.003) {
        lift.pos = lift.target
        lift.vel = 0
        lift.floor = lift.target
        lift.motor?.stop?.(0.2)
        lift.motor = null
        play('elevator_stop', { pos: [lift.cab.x, lift.cab.y + 1, lift.cab.z], gain: 0.8 })
        lift.state = 'opening'
        lift.t = -0.8 // a beat before the doors move
        later(0.8, () => play('elevator_doors', { pos: [lift.cab.x, lift.cab.y + 1, lift.cab.z], gain: 0.7 }))
      }
      placeCab(lift)
      lift.motor?.setPosition?.(lift.cab.x, lift.cab.y + 1, lift.cab.z)
      break
    }
    case 'opening':
      lift.t += dt
      if (lift.t < 0) break
      lift.doorT = Math.min(1, lift.doorT + dt / 1.3)
      setLeaves(lift, lift.floor, lift.doorT)
      if (lift.doorT >= 1) { lift.state = 'open'; lift.t = 0 }
      break
    case 'open':
      lift.t += dt
      if ((lift.t > 6 || (lift.queue.length && lift.t > 2.5)) && !liftDoorway(lift)) {
        lift.state = 'closing'
        play('elevator_doors', { pos: [lift.cab.x, lift.cab.y + 1, lift.cab.z], gain: 0.7 })
      }
      break
    case 'closing':
      if (liftDoorway(lift)) { lift.state = 'opening'; lift.t = 0; break }
      lift.doorT = Math.max(0, lift.doorT - dt / 1.3)
      setLeaves(lift, lift.floor, lift.doorT)
      if (lift.doorT <= 0) lift.state = 'idle'
      break
  }
}

// ---------------------------------------------------------------------------------------------
// the stairwell that does not end
// ---------------------------------------------------------------------------------------------

/** "…9, 9, 10, 7, 12…": mostly counting up, sometimes not. */
export function oddFloor(n, seed) {
  const h = hashf(n, seed, 313)
  if (h < 0.16) return n - 1
  if (h < 0.24) return Math.max(2, n - 3)
  if (h < 0.28) return n + 2
  return Math.min(99, n)
}

function setLabel(sw, k, value) {
  const lab = sw.labels?.[k]
  if (!lab || lab.value === value) return
  lab.value = value
  lab.plate.redraw(drawFloorNumber(value, lab.color))
}

function tickLoop(sw) {
  const { p, L } = sw.sec
  const pl = RT.ctx.player.pos
  p.toLocal(pl.x, pl.y + 0.05, pl.z, _tmp)
  const lx = _tmp[0] - L.SX0, ly = _tmp[1], lz = _tmp[2] - L.ZI
  const inCore = lx > -5 && lx < 17 && lz > -1 && lz < 24
  const prev = sw.prev
  sw.prev = inCore ? [lx, ly, lz] : null
  if (!inCore || !prev) return
  const { T, m } = sw.loop
  // which landing are we on? arriving on a new floor while going up advances the virtual count
  const f = Math.floor((ly - L.FL1 + 0.5) / FH) + 1
  if (lz > 13 && f >= 1 && f <= L.N && Math.abs(ly - L.FL(f)) < 0.6) {
    if (sw.lastFloor && f === sw.lastFloor + 1) {
      sw.virt += 1
      setLabel(sw, f + 1, sw.virt + 1 > L.N - 3 ? oddFloor(sw.virt + 1, sw.sec.seed * 1000 | 0) : sw.virt + 1)
    } else if (f !== sw.lastFloor) {
      sw.virt = f
    }
    sw.lastFloor = f
  }
  // trigger: crossing the middle of flight B between half-landing T and floor T+1, going up
  const HLT = L.HL(T)
  const zt = 9
  if (lx >= 6.5 && lx < 12.5 && prev[2] < zt && lz >= zt && ly >= HLT - 0.5 && ly < L.FL(T + 1) + 0.5) {
    const dy = m * FH * VOXEL
    // the destination landings must show what the player has just seen
    setLabel(sw, T - m + 1, sw.labels[T + 1].value)
    setLabel(sw, T - m, sw.labels[T].value)
    setLabel(sw, T - m + 2, sw.labels[T + 2]?.value ?? sw.labels[T - m + 2].value)
    RT.ctx.player.pos.y -= dy
    sw.prev[1] -= m * FH
    sw.lastFloor = T - m
    RT.ctx.game.state.endlessStairs = (RT.ctx.game.state.endlessStairs || 0) + 1
    RT.ctx.events?.emit?.('anomaly', { kind: 'endless_stairs', entrance: sw.sec.number })
  }
}

// ---------------------------------------------------------------------------------------------
// tick
// ---------------------------------------------------------------------------------------------

export function tick(dt, ctx) {
  RT.ctx = ctx
  RT.time += dt
  if (RT.pendings.length) {
    for (let i = RT.pendings.length - 1; i >= 0; i--) {
      const it = RT.pendings[i]
      if (RT.time >= it.t) { RT.pendings.splice(i, 1); try { it.fn() } catch { /* ignore */ } }
    }
  }
  for (const d of RT.doors) if (d.enterable && (d.swing !== d.target || d.target > 0)) tickDoor(d, dt)
  for (const l of RT.lifts) tickLift(l, dt)
  for (const sw of RT.loops) tickLoop(sw)
  // the building's own noises while inside a stairwell: radiators knocking, the chute far above
  const z = ctx.game?.zone
  if (z && z.type === 'stairwell' && ctx.audio?.ready) {
    RT._knock = (RT._knock ?? 12) - dt
    if (RT._knock <= 0) {
      const r = RT.rng || (RT.rng = new RNG(20081))
      RT._knock = r.float(22, 70)
      const pl = ctx.player.pos
      const pos = [pl.x + r.float(-3, 3), pl.y + r.pick([-5.5, -2.7, 2.7, 5.5, 8.2]), pl.z + r.float(-3, 3)]
      play(r.chance(0.8) ? 'radiator_knock' : 'garbage_chute', { pos, gain: r.float(0.25, 0.5) })
    }
  }
  // muffled TVs / voices behind doors: created lazily near the player once audio runs
  if (ctx.audio?.ready && RT.emitters.length) {
    RT._emT = (RT._emT || 0) - dt
    if (RT._emT <= 0) {
      RT._emT = 1.0
      const pl = ctx.player.pos
      for (const e of RT.emitters) {
        const d = Math.hypot(pl.x - e.pos[0], pl.y - e.pos[1], pl.z - e.pos[2])
        if (!e.em && d < 30) e.em = play(e.name, { pos: e.pos, gain: e.gain, loop: true, refDistance: 1.2, maxDistance: 25, rolloff: 1.6 })
        else if (e.em && d > 40) { e.em.stop?.(0.5); e.em = null }
      }
    }
  }
}
