// Light registry. Hundreds of lights may exist (street lamps, entrance bulbs, stairwell
// bulbs, shop fluorescents, headlights); each frame the nearest MAX are uploaded to the shared
// uniforms. Lights near the selection cut-off are faded so nothing pops.
//
// Every light also gets a soft halo sprite (rendered by LampHalos) so far lamps still glow in
// the fog after they drop out of the per-pixel light set.

import * as THREE from 'three'
import { MAX_LIGHTS } from '../render/shaderChunks.js'
import { DOMAIN_OUTDOOR, DOMAIN_INDOOR, DOMAIN_ALL } from './constants.js'
import { hashf } from './rng.js'

const DOMAINS = { outdoor: DOMAIN_OUTDOOR, indoor: DOMAIN_INDOOR, all: DOMAIN_ALL }
let lightIds = 0

export class Light {
  constructor(o) {
    this.id = lightIds++
    this.pos = new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0)
    this.color = new THREE.Color(o.color ?? 0xffa040)
    this.intensity = o.intensity ?? 30
    this.range = o.range ?? 20
    this.type = o.type ?? 'point'
    this.dir = new THREE.Vector3(...(o.dir ?? [0, -1, 0])).normalize()
    this.cone = o.cone ?? 65 // outer half-angle, degrees
    this.inner = o.inner ?? Math.max(5, this.cone * 0.55)
    this.domain = DOMAINS[o.domain ?? 'outdoor'] ?? DOMAIN_OUTDOOR
    this.scatter = o.scatter ?? 1
    /** 'street' (on with street lights), 'always', 'night' (on when dark), or a function(game)→0..1 */
    this.schedule = o.schedule ?? 'always'
    /** 'none' | 'buzz' (fast flicker) | 'cycle' (failing sodium lamp) | 'dying' (random dropouts) */
    this.flicker = o.flicker ?? 'none'
    this.halo = o.halo ?? true
    this.haloSize = o.haloSize ?? 1
    this.enabled = o.enabled ?? true
    this.placement = o.placement ?? null // its emissive voxels follow this light's brightness
    this.tag = o.tag ?? null
    this.seed = hashf(this.id, 991)
    this.threshold = o.threshold ?? (0.15 + this.seed * 0.7) // street lights switch on staggered
    this.level = 0 // current brightness factor 0..1
    this.warm = -1 // sodium warm-up 0..1 (-1 = not yet initialised: lamps already on at load start warm)
  }
}

export class Lights {
  constructor(uniforms) {
    this.u = uniforms
    this.list = []
    this._sorted = []
    this.maxLights = MAX_LIGHTS
    this.halos = null
  }

  add(o) {
    const l = new Light(o)
    this.list.push(l)
    return l
  }

  remove(l) {
    const i = this.list.indexOf(l)
    if (i >= 0) this.list.splice(i, 1)
  }

  byTag(tag) { return this.list.filter(l => l.tag === tag) }

  /** Compute per-light brightness from schedule + flicker. env: { streetOn, night, time } */
  _level(l, env, dt) {
    if (!l.enabled) return 0
    let target = 1
    if (l.schedule === 'street') target = env.streetOn > l.threshold ? 1 : 0
    else if (l.schedule === 'night') target = env.night
    else if (typeof l.schedule === 'function') target = l.schedule(env)
    // sodium warm-up: lamps come on dim and pink, reach full orange over ~a minute
    if (l.schedule === 'street') {
      if (l.warm < 0) l.warm = target > 0 ? 1 : 0
      if (target > 0) l.warm = Math.min(1, l.warm + dt / 50)
      else l.warm = Math.max(0, l.warm - dt / 3)
      target *= 0.12 + 0.88 * l.warm * l.warm
    }
    const t = env.time
    switch (l.flicker) {
      case 'buzz': {
        const n = Math.sin(t * 91.0 + l.seed * 100) * Math.sin(t * 37.3 + l.seed * 7)
        target *= n > 0.6 ? 0.25 : 1
        if (hashf(Math.floor(t * 9), l.id) > 0.9) target *= 0.1
        break
      }
      case 'cycle': {
        const ph = (t / 47 + l.seed) % 1
        target *= ph < 0.7 ? Math.min(1, ph / 0.5) : ph < 0.78 ? (hashf(Math.floor(t * 14), l.id) > 0.5 ? 0.8 : 0.05) : 0
        break
      }
      case 'dying': {
        const b = hashf(Math.floor(t * 3), l.id + 5)
        if (b > 0.8) target *= hashf(Math.floor(t * 20), l.id) > 0.5 ? 0.2 : 0.9
        break
      }
    }
    return target
  }

  update(camera, env, dt) {
    const cam = camera.position
    const cand = this._sorted
    cand.length = 0
    for (const l of this.list) {
      l.level = this._level(l, env, dt)
      if (l.placement) l.placement.flag = l.level
      if (l.level <= 0.001) continue
      l._d = l.pos.distanceTo(cam) - l.range * 0.25
      cand.push(l)
    }
    cand.sort((a, b) => a._d - b._d)
    const n = Math.min(this.maxLights, cand.length)
    const cutoff = cand.length > n ? cand[n]._d : Infinity
    const u = this.u
    for (let i = 0; i < n; i++) {
      const l = cand[i]
      let fade = 1
      if (Number.isFinite(cutoff)) {
        const f0 = cutoff * 0.75
        fade = l._d < f0 ? 1 : Math.max(0, 1 - (l._d - f0) / Math.max(1, cutoff - f0))
      }
      const k = l.intensity * l.level * fade
      u.uLightPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.range)
      // sodium warm-up tint: pinkish red when cold
      let r = l.color.r, g = l.color.g, b = l.color.b
      if (l.schedule === 'street' && l.warm < 1) {
        const w = l.warm
        r = r * (0.7 + 0.3 * w) + 0.25 * (1 - w); g = g * w * w; b = b * w + 0.12 * (1 - w)
      }
      u.uLightCol.value[i].set(r * k, g * k, b * k, l.domain)
      if (l.type === 'spot') u.uLightDir.value[i].set(l.dir.x, l.dir.y, l.dir.z, Math.cos(l.cone * Math.PI / 180))
      else u.uLightDir.value[i].set(0, -1, 0, -2)
      u.uLightParam.value[i].set(Math.cos(l.inner * Math.PI / 180), l.scatter * (l.domain === DOMAIN_INDOOR ? 0.35 : 1), 0, 0)
    }
    u.uNumLights.value = n
    if (this.halos) this.halos.update(this.list)
  }
}
