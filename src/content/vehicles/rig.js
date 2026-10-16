// A moving vehicle "rig": one dynamic placement plus everything that travels with it — the
// headlight spot (lights the road, scatters in the snow), a red tail-lamp spill, an interior
// light for buses/trolleybuses/train cars, glow sprites on every lamp, plates & route boards
// (decal mesh), the exhaust plume (nature's steam, if loaded), a flashing beacon, and the
// looping engine/tyre sound. Placements are created in build() (meshed at load), the rest in
// init(). Everything is updated in place — no per-frame allocation.

import * as THREE from 'three'
import { makePlate, drawPlate, drawRouteBoard, drawPainted } from './plates.js'
import { buildDecalMesh } from './decals.js'

const PARK = -500 // hidden rigs wait far below the world

export class Rig {
  /**
   * o: { model, info, kind, tint, seed, rng, plate: 'civil'|'route'|null, route, fleet, board: bool,
   *      head: {intensity, range, cone, inner, color, scatter}, interior: {color, intensity, range},
   *      sound, soundNominal, beacon: bool, exhaust: bool, collide }
   */
  constructor(sys, o) {
    this.sys = sys
    this.o = o
    this.kind = o.kind
    this.info = o.info
    this.model = o.model
    this.active = false
    this.lit = false
    this.x = 0; this.y = PARK; this.z = 0; this.angle = 0
    this.speed = 0
    this.c = 1; this.s = 0
    const ctx = sys.ctx
    this.p = ctx.world.place(o.model, {
      x: 320, z: 320, y: PARK, dynamic: true, collide: !!o.collide, visible: false,
      tint: o.tint ?? 0xb0b0b0, seed: o.seed ?? 0.5, flag: 0, tag: o.tag ?? 'traffic',
    })
    if (o.beacon) {
      this.beacon = ctx.world.place('veh_beacon', { x: 320, z: 320, y: PARK, dynamic: true, collide: false, visible: false, flag: 0, tag: 'traffic' })
    }
    this.em = null
    this.shot = null
  }

  /** Runtime pieces (init). */
  init() {
    const { ctx, glows, atlas } = this.sys
    const o = this.o, info = this.info
    const L = ctx.lights
    if (o.head) {
      const h = o.head
      this.headLight = L.add({ x: 0, y: PARK, z: 0, type: 'spot', dir: [0, -0.1, -1], color: h.color ?? 0xfff0d6,
        intensity: h.intensity ?? 70, range: h.range ?? 36, cone: h.cone ?? 34, inner: h.inner ?? 15,
        scatter: h.scatter ?? 1.3, halo: false, schedule: 'always', tag: 'vehicle' })
      this.headLight.enabled = false
    }
    if (o.tailLight !== false) {
      // red spill on the slush behind (kept off the body so it does not paint the rear red)
      this.tailLight = L.add({ x: 0, y: PARK, z: 0, color: 0xff2412, intensity: o.tailIntensity ?? 1.4, range: 5, scatter: 0.2, halo: false, tag: 'vehicle' })
      this.tailLight.enabled = false
    }
    if (o.interior) {
      // domain 'all': lights the saloon (indoor faces), the frosted glass (it glows), and spills
      // onto the snow around the vehicle; the shell's outer faces face away from it
      const it = o.interior
      this.inLight = L.add({ x: 0, y: PARK, z: 0, color: it.color ?? 0xe6eedc, intensity: it.intensity ?? 9, range: it.range ?? 10,
        domain: 'all', scatter: 0.12, halo: false, tag: 'vehicle' })
      this.inLight.enabled = false
    }
    if (o.spark) {
      // trolley-pole arc flash (driven by the traffic system)
      this.sparkLight = L.add({ x: 0, y: PARK, z: 0, color: 0xc6dcff, intensity: 0, range: 15, scatter: 1.6, halo: false, tag: 'vehicle' })
      this.sparkLight.enabled = false
    }
    if (o.beacon) {
      this.beaconLight = L.add({ x: 0, y: PARK, z: 0, color: 0xff9a10, intensity: 0, range: 16, scatter: 0.8, halo: false, tag: 'vehicle' })
      this.beaconLight.enabled = false
    }
    // local anchor points (precomputed: no allocation per frame)
    this._lHead = [0, (info.head?.[0]?.[1] ?? 0.65) + 0.05, -info.L / 2 - 0.35]
    this._lTail = [0, 0.3, info.L / 2 + 1.1]
    // glows
    this.glowsHead = (info.head || []).map(() => glows.add({ color: o.glowColor ?? 0xfff2dc, intensity: o.glowHead ?? 80, size: o.glowSize ?? 0.7, dir: 'front', cone: 0.35 }))
    this.glowsTail = (info.tail || []).map(() => glows.add({ color: 0xff2a14, intensity: 30, size: 0.4, dir: 'back', cone: 0.2 }))
    if (o.beacon) this.glowBeacon = glows.add({ color: 0xffa020, intensity: 70, size: 1.0, dir: 'omni' })
    if (o.spark) this.glowSpark = glows.add({ color: 0xdce8ff, intensity: 80, size: 0.8, dir: 'omni' })
    // decals
    if (atlas) this._decals()
    // exhaust
    if (o.exhaust && this.sys.steam) {
      try {
        this.steam = this.sys.steam(ctx, { x: 0, y: PARK, z: 0, kind: 'exhaust', rate: o.kind === 'car' ? 7 : 10, maxDist: 70 })
        this.steam.stop?.()
      } catch { this.steam = null }
    }
  }

  _decals() {
    const { ctx, atlas } = this.sys
    const o = this.o, info = this.info
    const rng = o.rng
    const items = []
    const plate = o.plate ? makePlate(rng, o.plate) : null
    this.plate = plate
    const PPM = 240
    const addPlate = (pos, normal) => {
      if (!pos) return
      const uv = atlas.alloc(0.52 * PPM, 0.112 * PPM, (c, W, H) => drawPlate(c, W, H, plate, { seed: rng.int(1, 999), dirt: 0.5 }))
      items.push({ pos, normal, w: 0.52, h: 0.112, uv })
    }
    if (plate) {
      addPlate(info.plateFront, [0, 0, -1])
      addPlate(info.plateRear, [0, 0, 1])
    }
    if (o.route && info.boardFront) {
      const r = o.route
      const led = o.kind === 'bus'
      const draw = (c, W, H) => drawRouteBoard(c, W, H, { num: r.num, from: r.from, to: r.to, led })
      const wF = 1.9, hF = 0.32
      items.push({ pos: info.boardFront, normal: [0, 0, -1], w: wF, h: hF, uv: atlas.alloc(wF * 110, hF * 110, draw), emissive: led ? 1.6 : 0.5, schedule: 'night' })
      if (info.boardSide) items.push({ pos: info.boardSide, normal: [1, 0, 0], w: 1.2, h: 0.28, uv: atlas.alloc(1.2 * 110, 0.28 * 110, draw), emissive: led ? 1.4 : 0.4, schedule: 'night' })
      if (info.boardRear) {
        const uvR = atlas.alloc(0.5 * 110, 0.3 * 110, (c, W, H) => drawPainted(c, W, H, r.num, { bg: led ? '#16120c' : '#e4e2d6', color: led ? '#ff9a2a' : '#121212' }))
        items.push({ pos: info.boardRear, normal: [0, 0, 1], w: 0.5, h: 0.3, uv: uvR, emissive: led ? 1.4 : 0.4, schedule: 'night' })
      }
    }
    if (o.fleet) {
      if (info.fleetSide) items.push({ pos: info.fleetSide, normal: [1, 0, 0], w: 0.55, h: 0.2, uv: atlas.alloc(0.55 * 160, 0.2 * 160, (c, W, H) => drawPainted(c, W, H, o.fleet, { color: '#e8e6dc' })) })
      if (info.fleetFront) items.push({ pos: info.fleetFront, normal: [0, 0, -1], w: 0.42, h: 0.15, uv: atlas.alloc(0.42 * 160, 0.15 * 160, (c, W, H) => drawPainted(c, W, H, o.fleet, { color: '#e8e6dc' })) })
    }
    if (o.doorText) {
      const draw = (c, W, H) => drawPainted(c, W, H, o.doorText, { color: '#1a1a1a' })
      if (info.doorLeft) items.push({ pos: info.doorLeft, normal: [-1, 0, 0], w: 0.9, h: 0.16, uv: atlas.alloc(0.9 * 160, 0.16 * 160, draw) })
      if (info.doorRight) items.push({ pos: info.doorRight, normal: [1, 0, 0], w: 0.9, h: 0.16, uv: atlas.alloc(0.9 * 160, 0.16 * 160, draw) })
    }
    if (o.boardText && info.boardFront) {
      // marshrutka: hand-lettered card behind the windshield
      const r = o.boardText
      const uv = atlas.alloc(0.7 * 140, 0.22 * 140, (c, W, H) => { c.fillStyle = '#e8e4d2'; c.fillRect(0, 0, W, H); drawPainted(c, W, H, r, { color: '#1b2a6a' }) })
      items.push({ pos: info.boardFront, normal: [0, 0, -1], w: 0.7, h: 0.22, uv })
    }
    if (!items.length) return
    this.decals = buildDecalMesh(atlas, items)
    ctx.scene.add(this.decals)
  }

  /** Make the rig appear (and reset per-run state). */
  show(x, y, z, angle) {
    this.active = true
    this.p.visible = true
    if (this.beacon) this.beacon.visible = true
    if (this.decals) this.decals.visible = true
    this.set(x, y, z, angle)
    if (this.steam) try { this.steam.start?.() } catch { /* optional */ }
  }

  hide() {
    this.active = false
    this.p.visible = false
    this.p.set(320, PARK, 320, 0)
    if (this.beacon) { this.beacon.visible = false; this.beacon.set(320, PARK, 320, 0) }
    if (this.decals) this.decals.visible = false
    for (const l of [this.headLight, this.tailLight, this.inLight, this.beaconLight, this.sparkLight]) if (l) { l.enabled = false; l.pos.y = PARK }
    for (const g of this.glowsHead || []) g.on = 0
    for (const g of this.glowsTail || []) g.on = 0
    if (this.glowBeacon) this.glowBeacon.on = 0
    if (this.glowSpark) this.glowSpark.on = 0
    this.spark = 0
    if (this.steam) try { this.steam.stop?.() } catch { /* optional */ }
    this.stopSound()
  }

  /** local metres → world, written into out (THREE.Vector3). */
  w(l, out) {
    out.x = this.x + l[0] * this.c + l[2] * this.s
    out.y = this.y + l[1]
    out.z = this.z - l[0] * this.s + l[2] * this.c
    return out
  }

  set(x, y, z, angle) {
    this.x = x; this.y = y; this.z = z; this.angle = angle
    this.c = Math.cos(angle); this.s = Math.sin(angle)
    this.p.set(x, y, z, angle)
    if (this.decals) { this.decals.position.set(x, y, z); this.decals.rotation.y = angle }
  }

  /** Per-frame dressing: lights, glows, beacon, exhaust. cam = camera position. */
  dress(cam, time, dt) {
    if (!this.active) return
    const info = this.info
    const fx = -this.s, fz = -this.c
    const dx = this.x - cam.x, dz = this.z - cam.z
    const d = Math.sqrt(dx * dx + dz * dz)
    const lit = this.lit
    this.p.flag = lit ? 1 : 0
    if (this.headLight) {
      const l = this.headLight
      l.enabled = lit && d < 320
      if (l.enabled) {
        this.w(this._lHead, l.pos)
        l.dir.set(fx, -0.11, fz).normalize()
      }
    }
    if (this.tailLight) {
      const l = this.tailLight
      l.enabled = lit && d < 45
      if (l.enabled) this.w(this._lTail, l.pos)
    }
    if (this.inLight) {
      const near = lit && d < (this.o.interior.near ?? 80)
      this.inLight.enabled = near
      if (near) this.w(info.lightInterior || [0, 2.3, 0], this.inLight.pos)
    }
    // lamp glows are a dusk/night thing: in daylight a lit lamp is only a faint spark
    const on = lit ? 0.25 + 0.75 * Math.min(1, this.sys.night() * 1.6) : 0
    const gh = this.glowsHead
    for (let i = 0; i < gh.length; i++) { gh[i].on = on; this.w(info.head[i], gh[i].pos); gh[i].fwd.set(fx, 0, fz) }
    const gt = this.glowsTail
    for (let i = 0; i < gt.length; i++) { gt[i].on = on; this.w(info.tail[i], gt[i].pos); gt[i].fwd.set(fx, 0, fz) }
    if (this.beacon) {
      const bl = info.beacon
      const v = this._tmp || (this._tmp = new THREE.Vector3())
      this.w(bl, v)
      this.beacon.set(v.x, v.y, v.z, this.angle)
      // two rotating amber beacons ≈ 1.5 Hz: sharp flashes, slightly out of phase
      const ph = time * 1.5
      const f1 = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6), f2 = Math.pow(Math.max(0, Math.sin((ph + 0.37) * Math.PI * 2)), 6)
      const f = Math.max(f1, f2)
      this.beacon.flag = this.beaconOn ? 0.15 + 0.85 * f : 0
      if (this.beaconLight) {
        this.beaconLight.enabled = !!this.beaconOn && d < 160
        this.beaconLight.intensity = 26 * f
        this.beaconLight.pos.set(v.x, v.y + 0.3, v.z)
      }
      if (this.glowBeacon) { this.glowBeacon.on = this.beaconOn ? 0.1 + 0.9 * f : 0; this.glowBeacon.pos.set(v.x, v.y + 0.25, v.z) }
    }
    if (this.steam && info.exhaust) {
      const v = this._tmp2 || (this._tmp2 = new THREE.Vector3())
      this.w(info.exhaust, v)
      try { this.steam.set(v.x, v.y, v.z) } catch { /* optional */ }
    }
    if (this.decals) {
      this.decals.visible = d < 90
      this.decals.material.uniforms.uLit.value = lit ? 1 : 0
    }
  }

  // ---- sound ------------------------------------------------------------------------------
  updateSound(audio, cam, opts = {}) {
    const o = this.o
    if (!o.sound || !audio || !audio.ready) return
    const dx = this.x - cam.x, dz = this.z - cam.z
    const d = Math.sqrt(dx * dx + dz * dz)
    const kmh = Math.abs(this.speed) * 3.6
    const range = opts.range ?? 170
    if (this.active && !this.em && d < range && !opts.mute) {
      try {
        this.em = audio.play(o.sound, { pos: [this.x, this.y + 0.8, this.z], loop: true, speed: Math.max(5, kmh), variant: o.soundVariant, gain: 0.0001 })
      } catch { this.em = null }
      this._g = 0
    }
    if (!this.em) return
    if (!this.active || d > range + 30 || opts.mute) { this.stopSound(); return }
    try {
      this.em.setPosition(this.x, this.y + 0.8, this.z)
      const nominal = o.soundNominal ?? 50
      if (o.sound !== 'car_idle') this.em.setRate(Math.min(1.45, Math.max(0.55, Math.sqrt(Math.max(4, kmh) / nominal))))
      else this.em.setRate(opts.rate ?? 1)
      const g = (opts.gain ?? 1) * (o.sound === 'car_idle' ? 1 : 0.3 + 0.7 * Math.min(1, kmh / 25))
      if (Math.abs(g - this._g) > 0.02) { this.em.setGain(g, 0.35); this._g = g }
    } catch { /* never throw from update */ }
  }

  stopSound(fade = 0.6) {
    if (this.em) { try { this.em.stop(fade) } catch { /* ignore */ } this.em = null }
  }
}
