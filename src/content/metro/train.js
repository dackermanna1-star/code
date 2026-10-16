// 81-717/714-style cars («номерной»): blue-green lower body, grey upper body and roof, four
// double doors per side, longitudinal leatherette benches, two rows of fluorescent strips, a
// head car with a central windshield and amber headlamps. A 5-car train is a set of dynamic
// placements (cars, platform-side door leaves, lamp blocks, riders) moved together.
//
// Car-local frame (meters): x along the car (−9.5..9.5, cab of a head car at +x), y up from the
// rail head (0..3.75; floor top at 1.0), z across (−1.375..1.375). Pivot: centre at rail height.
// Variant a: openable doors on local +z; variant b (head only): openable doors on local −z.

import { defineModel } from '../../core/models.js'
import { MAT } from './materials.js'
import { WB, V } from './vox.js'
import { Y, TRACK, CAR } from './layout.js'

const HL = 9.5, HZ = 1.375
export const DOORS_MID = [-7.0, -2.5, 2.5, 7.0]
export const DOORS_HEAD = [-7.0, -2.5, 2.5, 6.5]
const FLOOR = 1.0, ROOF = 3.25, WIN0 = 1.75, WIN1 = 3.0

function buildCar(head, doorSide) {
  const b = new WB(-HL, 0, -HZ, HL, 3.75, HZ)
  const m = b.m
  const doors = head ? DOORS_HEAD : DOORS_MID
  const cabX = head ? 7.75 : HL
  const inDoor = x => doors.some(c => x >= c - 0.75 && x < c + 0.75)
  const nearDoor = x => doors.some(c => x >= c - 1.5 && x < c + 1.5)
  // ---- running gear
  for (const bc of [-6.25, 6.25]) {
    b.fill(bc - 1.5, 0.25, -1.125, bc + 1.5, 0.75, 1.125, MAT.metalDark)
    for (const wx of [bc - 1.25, bc + 0.75]) for (const z of [-0.875, 0.625]) b.fill(wx, 0, z, wx + 0.5, 0.75, z + V, MAT.rubber)
  }
  for (let x = -4.5; x < 4.5; x += 1.5) b.fill(x, 0.5, -1.0, x + 1.0, 0.75, 1.0, (Math.abs(x) % 3) < 1 ? MAT.metalDark : MAT.rubber)
  b.fill(-HL, 0.75, -HZ, HL, FLOOR, HZ, MAT.metalDark) // floor frame
  // ---- body shell (doors on the open side are left as openings; the far side has them built in)
  for (const zs of [-1, 1]) {
    const z0 = zs < 0 ? -HZ : HZ - V
    const openSide = (zs > 0) === (doorSide > 0)
    for (let x = -HL; x < HL; x += V) {
      const xc = x + V / 2
      const dc = doors.find(c => xc >= c - 0.75 && xc < c + 0.75)
      for (let y = 0.75; y < ROOF; y += V) {
        const yc = y + V / 2
        let mat = yc < WIN0 ? MAT.carLower : MAT.carUpper
        if (dc !== undefined && yc >= FLOOR) {
          if (openSide) continue
          const rel = Math.abs(xc - dc)
          if (yc >= WIN0 && yc < WIN1 && rel < 0.5) mat = MAT.glass
        }
        b.fill(x, y, z0, x + V, y + V, z0 + V, mat)
      }
    }
    if (head) b.fill(8.25, WIN0, z0, 9.0, WIN1, z0 + V, MAT.glass) // cab side window
  }
  // windows between the doors: shrink each run to leave pockets of 0.75 m beside the doors
  for (const zs of [-1, 1]) {
    const z0 = zs < 0 ? -HZ : HZ - V
    for (let x = -HL + 0.5; x < cabX - 0.5; x += V) {
      if (inDoor(x + 0.01) || nearDoor(x + 0.01)) continue
      b.fill(x, WIN0, z0, x + V, WIN1, z0 + V, MAT.glass)
    }
  }
  // ends: intermediate end walls with a closed gangway door; the head car's cab
  for (const xe of head ? [-HL] : [-HL, HL - V]) {
    b.fill(xe, 0.75, -HZ, xe + V, ROOF, HZ, MAT.carUpper)
    b.fill(xe, 0.75, -HZ, xe + V, WIN0, HZ, MAT.carLower)
    b.fill(xe, FLOOR, -0.5, xe + V, 3.0, 0.5, MAT.metalGray)
    b.fill(xe, 2.0, -0.25, xe + V, 2.75, 0.25, MAT.glass)
  }
  if (head) {
    b.fill(cabX - V, FLOOR, -HZ, cabX, ROOF, HZ, MAT.carWall) // cab partition
    b.fill(cabX - V, FLOOR, -0.375, cabX, 3.0, 0.375, MAT.woodDark) // cab door
    const xf = HL - V
    b.fill(xf, 0.75, -HZ, HL, ROOF, HZ, MAT.carUpper)
    b.fill(xf, 0.75, -HZ, HL, 1.75, HZ, MAT.carLower)
    b.fill(xf, 2.0, -0.875, HL, 3.0, 0.875, MAT.glass) // windshield
    b.fill(xf, 2.0, -0.125, HL, 3.0, 0.125, MAT.carUpper) // centre post
    b.fill(xf, 3.0, -0.375, HL, 3.25, 0.375, MAT.plasticDark) // route box
    b.fill(xf, 1.25, -1.0, HL, 1.5, -0.5, MAT.chrome) // headlamp housings
    b.fill(xf, 1.25, 0.5, HL, 1.5, 1.0, MAT.chrome)
    b.fill(xf, 1.25, -1.375, HL, 1.5, -1.125, MAT.metalRed) // marker glass (lit by the marker block)
    b.fill(xf, 1.25, 1.125, HL, 1.5, 1.375, MAT.metalRed)
    b.fill(xf + V, 0.25, -0.25, HL + V, 1.0, 0.25, MAT.metalDark) // coupler (sticks out a little)
    // cab interior: console and driver's seat
    b.fill(8.5, FLOOR, -0.875, 9.25, 1.75, 0.875, MAT.metalDark)
    b.fill(8.0, FLOOR, -0.25, 8.5, 1.5, 0.25, MAT.leatherette)
    b.fill(cabX, ROOF - V, -0.25, HL - V, ROOF, 0.25, MAT.lampBulb) // dim cab lamp
  }
  // ---- roof (two layers, the upper narrower) with the fluorescent strips underneath
  b.fill(-HL, ROOF, -HZ, HL, ROOF + V, HZ, MAT.carUpper)
  b.fill(-HL, ROOF + V, -1.0, HL, ROOF + 2 * V, 1.0, MAT.metalGray)
  for (const z of [-0.625, 0.375]) b.fill(-HL + 0.5, ROOF, z, cabX - 0.5, ROOF + V, z + V, MAT.fluorescent)
  // ---- interior
  b.fill(-HL + V, 0.75, -HZ + V, cabX - V, FLOOR, HZ - V, MAT.linoleum)
  for (const zs of [-1, 1]) {
    const zi = zs < 0 ? -HZ + V : HZ - 2 * V // inner layer next to the wall
    const zs0 = zs < 0 ? -HZ + V : HZ - 3 * V // seat depth: two voxels
    for (let x = -HL + V; x < cabX - V; x += V) {
      const near = nearDoor(x + 0.01)
      const door = inDoor(x + 0.01)
      if (door) continue
      // beige lining above the windows and in the door pockets (the open leaves hide inside)
      b.fill(x, WIN1, zi, x + V, ROOF, zi + V, MAT.carWall)
      if (near) { b.fill(x, FLOOR, zi, x + V, ROOF, zi + V, MAT.carWall); continue }
      // benches: base, cushion, backrest
      b.fill(x, FLOOR, zs0, x + V, FLOOR + V, zs0 + 2 * V, MAT.metalGray)
      b.fill(x, FLOOR + V, zs0, x + V, FLOOR + 2 * V, zs0 + 2 * V, MAT.leatherette)
      b.fill(x, FLOOR + 2 * V, zi, x + V, WIN0, zi + V, MAT.leatherette)
      b.fill(x, WIN0, zi, x + V, WIN0 + V, zi + V, MAT.carWall)
    }
  }
  // grab poles at the door edges and the overhead rails
  for (const c of doors) for (const x of [c - 1.0, c + 0.75]) for (const z of [-0.5, 0.25]) b.fill(x, FLOOR, z, x + V, ROOF, z + V, MAT.chrome)
  for (const z of [-0.875, 0.625]) b.fill(-HL + 0.5, 2.75, z, cabX - 0.5, 3.0, z + V, MAT.chrome)
  return m
}

const CAR_OPTS = { indoor: true, contact: false, dynamic: true, lods: [1, 2], lodDistances: [70], maxDistance: 260 }
defineModel('metro_car_head_a', () => buildCar(true, 1), CAR_OPTS)
defineModel('metro_car_head_b', () => buildCar(true, -1), CAR_OPTS)
defineModel('metro_car_mid', () => buildCar(false, 1), CAR_OPTS)

/** Door leaves (0.75 × 2.25 m), left and right (glass toward the seam). Pivot: lower −x corner. */
function leaf(glassLo) {
  const b = new WB(0, 0, 0, 0.75, 2.25, V)
  b.fill(0, 0, 0, 0.75, 0.75, V, MAT.carLower)
  b.fill(0, 0.75, 0, 0.75, 2.25, V, MAT.carUpper)
  b.fill(glassLo, 0.75, 0, glassLo + 0.5, 1.75, V, MAT.glass)
  return b.m
}
const LEAF_OPTS = { indoor: true, contact: false, dynamic: true, lods: [1], maxDistance: 120 }
defineModel('metro_car_leaf_l', () => leaf(0.25), LEAF_OPTS)
defineModel('metro_car_leaf_r', () => leaf(0), LEAF_OPTS)

/** Lit lamps overlaid on a head car's front: headlamps (amber) or tail markers (red). Pivot: back centre. */
defineModel('metro_car_headlamps', () => {
  const b = new WB(0, 0, -HZ, V, 0.5, HZ)
  b.fill(0, 0, -1.0, V, V, -0.5, MAT.lampWarm)
  b.fill(0, 0, 0.5, V, V, 1.0, MAT.lampWarm)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, collide: false, dynamic: true, lods: [1], maxDistance: 300 })
defineModel('metro_car_markers', () => {
  const b = new WB(0, 0, -HZ, V, 0.5, HZ)
  b.fill(0, 0, -HZ, V, V, -1.125, MAT.taillight)
  b.fill(0, 0, 1.125, V, V, HZ, MAT.taillight)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, collide: false, dynamic: true, lods: [1], maxDistance: 300 })

// ---------------------------------------------------------------------------------------------
// Train: placements + kinematics helpers
// ---------------------------------------------------------------------------------------------

export class Train {
  constructor(ctx) {
    this.ctx = ctx
    const { world, lights } = ctx
    const ud = { pkg: 'metro', noRelocate: true }
    const mk = (name) => world.place(name, { x: 0, y: -60, z: 0, dynamic: true, visible: false, collide: true, tag: 'metro_car', userData: ud })
    // car models are swapped by track: keep one of each needed variant per slot
    this.slots = []
    for (let i = 0; i < CAR.n; i++) {
      const head = i === 0 || i === CAR.n - 1
      this.slots.push({ i, head, a: mk(head ? 'metro_car_head_a' : 'metro_car_mid'), b: head ? mk('metro_car_head_b') : null, cur: null, cx: 0, rot: 0 })
    }
    this.leaves = []
    for (let i = 0; i < CAR.n; i++) for (let d = 0; d < 4; d++) {
      this.leaves.push({ car: i, door: d, l: mk('metro_car_leaf_l'), r: mk('metro_car_leaf_r') })
    }
    this.headlamps = world.place('metro_car_headlamps', { x: 0, y: -60, z: 0, dynamic: true, visible: false, collide: false, tag: 'metro_car', userData: ud })
    this.markers = world.place('metro_car_markers', { x: 0, y: -60, z: 0, dynamic: true, visible: false, collide: false, tag: 'metro_car', userData: ud })
    this.lightsIn = [0, 1].map(() => lights.add({ x: 0, y: -60, z: 0, color: 0xeef3ee, intensity: 1.5, range: 13, domain: 'indoor', halo: false, enabled: false, tag: 'metro_train' }))
    this.headLight = lights.add({ x: 0, y: -60, z: 0, color: 0xffd08a, intensity: 7, range: 34, type: 'spot', dir: [1, -0.05, 0], cone: 22, inner: 10, domain: 'indoor', halo: true, haloSize: 0.6, scatter: 0.8, enabled: false, tag: 'metro_train' })
    this.track = 'N'
    this.dir = 1
    this.head = 0
    this.doorF = 0 // 0 closed .. 1 open
    this.visible = false
    this.riders = [] // { person, car, dx, dz (world offsets from the car centre), angle }
  }

  /** Configure for a run on a track; dir +1 = heading east. */
  setTrack(track) {
    this.track = track
    this.dir = TRACK[track].dir
    const T = TRACK[track]
    for (const s of this.slots) {
      const lead = s.i === 0, tail = s.i === CAR.n - 1
      let p, rot
      if (track === 'N') { // heading east, platform on +z
        if (lead) { p = s.a; rot = 0 } else if (tail) { p = s.b; rot = 2 } else { p = s.a; rot = 0 }
      } else { // heading west, platform on −z
        if (lead) { p = s.a; rot = 2 } else if (tail) { p = s.b; rot = 0 } else { p = s.a; rot = 2 }
      }
      for (const q of [s.a, s.b]) if (q && q !== p) { q.visible = false; q.collide = false; q.set(0, -60, 0, 0) }
      s.cur = p; s.rot = rot
      p.collide = true
    }
    this.z = T.axis
    this.platSide = T.platSide
  }

  /** World x of car i's centre for the current head position. */
  carX(i) { return this.head - this.dir * (CAR.pitch / 2 + CAR.pitch * i) }

  /** Local door centres of car i (in the car's own frame). */
  doorsOf(i) { return (i === 0 || i === CAR.n - 1) ? DOORS_HEAD : DOORS_MID }

  /** World x of a door centre (car i, door d). */
  doorX(i, d) {
    const s = this.slots[i]
    const c = this.doorsOf(i)[d]
    return this.carX(i) + (s.rot === 0 ? c : -c)
  }

  /** World x-extent [x0, x1] of the whole train. */
  extent() {
    const a = this.head, b = this.head - this.dir * CAR.pitch * CAR.n
    return [Math.min(a, b), Math.max(a, b)]
  }

  show(on) {
    this.visible = on
    for (const s of this.slots) { s.cur.visible = on; s.cur.collide = on }
    for (const L of this.leaves) { L.l.visible = on; L.r.visible = on; L.l.collide = on; L.r.collide = on }
    this.headlamps.visible = on; this.markers.visible = on
    for (const l of this.lightsIn) l.enabled = on
    this.headLight.enabled = on
    for (const r of this.riders) r.person.setVisible(on)
  }

  /** Place everything for the current head position and door opening. */
  update() {
    if (!this.visible) return
    const y = Y.RAIL, z = this.z
    for (const s of this.slots) s.cur.set(this.carX(s.i), y, z, s.rot * Math.PI / 2)
    // door leaves on the platform side, sliding inside the wall
    const zl = this.platSide > 0 ? z + HZ - V - 0.02 : z - HZ + 0.02
    const f = this.doorF
    for (const L of this.leaves) {
      const xc = this.doorX(L.car, L.door)
      const x0 = xc - 0.75
      L.l.set(x0 - 0.75 * f, y + FLOOR, zl, 0)
      L.r.set(x0 + 0.75 + 0.75 * f, y + FLOOR, zl, 0)
    }
    // lamps: amber headlamps at the leading end, red markers at the tail
    const front = this.head - this.dir * ((CAR.pitch - CAR.len) / 2 - 0.01)
    const rear = this.head - this.dir * (CAR.pitch * CAR.n - (CAR.pitch - CAR.len) / 2 + 0.01)
    this.headlamps.set(front, y + 1.25, z, this.dir > 0 ? 0 : Math.PI)
    this.markers.set(rear, y + 1.25, z, this.dir > 0 ? Math.PI : 0)
    // lights
    this.lightsIn[0].pos.set(this.carX(1), y + 2.9, z)
    this.lightsIn[1].pos.set(this.carX(3), y + 2.9, z)
    this.headLight.pos.set(this.head + this.dir * 0.6, y + 1.4, z)
    this.headLight.dir.set(this.dir, -0.06, 0).normalize()
    for (const r of this.riders) r.person.place(this.carX(r.car) + r.dx, y + FLOOR, z + r.dz, r.angle)
  }
}

/** Position along a braking approach: start at distance D from the stop, cruise v, then brake a. */
export function approach(t, D, v, a) {
  const db = v * v / (2 * a)
  const tc = Math.max(0, (D - db) / v)
  if (t <= tc) return { s: v * t, v, done: false }
  const tb = t - tc
  const tStop = v / a
  if (tb >= tStop) return { s: D, v: 0, done: true }
  return { s: (D - db) + v * tb - 0.5 * a * tb * tb, v: v - a * tb, done: false }
}
export function approachDuration(D, v, a) { return Math.max(0, (D - v * v / (2 * a)) / v) + v / a }
