// Time of day and weather. Drives all shared shader uniforms (ambient light, fog, sky glow,
// street lights, lit-window share) from a slowly advancing clock and a gentle weather cycle.

import * as THREE from 'three'
import { RNG, smoothstep, clamp } from '../core/rng.js'

// Linear-space colors. Minutes from midnight. Moscow in deep winter: sunrise ~9:00, sunset ~16:00.
const N_SKY = [0.026, 0.026, 0.037], N_GND = [0.020, 0.015, 0.012], N_FOG = [0.015, 0.0135, 0.019]
const N_HOR = [0.050, 0.034, 0.035], N_GLOW = [0.048, 0.021, 0.007]
const KEYS = [
  { t: 0, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.24, exp: 1.65 },
  { t: 180, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.06, exp: 1.7 },
  { t: 345, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.18, exp: 1.65 },
  { t: 420, sky: [0.036, 0.038, 0.052], gnd: N_GND, fog: [0.03, 0.03, 0.04], hor: [0.075, 0.055, 0.058], glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.42, exp: 1.6 },
  { t: 500, sky: [0.10, 0.115, 0.15], gnd: [0.05, 0.048, 0.05], fog: [0.10, 0.11, 0.135], hor: [0.14, 0.14, 0.16], glow: [0.03, 0.016, 0.006], sun: 0, street: 1, night: 0.7, lit: 0.36, exp: 1.3 },
  { t: 540, sky: [0.22, 0.235, 0.27], gnd: [0.09, 0.09, 0.09], fog: [0.22, 0.23, 0.26], hor: [0.29, 0.29, 0.31], glow: [0, 0, 0], sun: 0.02, street: 0.4, night: 0.25, lit: 0.18, exp: 1.05 },
  { t: 600, sky: [0.33, 0.35, 0.39], gnd: [0.12, 0.12, 0.12], fog: [0.33, 0.34, 0.37], hor: [0.42, 0.42, 0.44], glow: [0, 0, 0], sun: 0.05, street: 0, night: 0, lit: 0.1, exp: 0.95 },
  { t: 780, sky: [0.40, 0.42, 0.46], gnd: [0.14, 0.14, 0.14], fog: [0.39, 0.40, 0.43], hor: [0.48, 0.48, 0.50], glow: [0, 0, 0], sun: 0.07, street: 0, night: 0, lit: 0.08, exp: 0.9 },
  { t: 900, sky: [0.30, 0.31, 0.35], gnd: [0.11, 0.11, 0.11], fog: [0.30, 0.31, 0.34], hor: [0.38, 0.37, 0.39], glow: [0, 0, 0], sun: 0.04, street: 0, night: 0.05, lit: 0.14, exp: 0.95 },
  { t: 955, sky: [0.14, 0.15, 0.20], gnd: [0.06, 0.055, 0.06], fog: [0.13, 0.14, 0.18], hor: [0.21, 0.19, 0.21], glow: [0.02, 0.01, 0.004], sun: 0, street: 0.1, night: 0.45, lit: 0.36, exp: 1.15 },
  { t: 1000, sky: [0.06, 0.066, 0.095], gnd: [0.03, 0.025, 0.024], fog: [0.055, 0.058, 0.08], hor: [0.11, 0.085, 0.09], glow: [0.05, 0.024, 0.009], sun: 0, street: 1, night: 0.85, lit: 0.55, exp: 1.45 },
  { t: 1060, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.62, exp: 1.6 },
  { t: 1260, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.6, exp: 1.6 },
  { t: 1380, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.36, exp: 1.65 },
  { t: 1440, sky: N_SKY, gnd: N_GND, fog: N_FOG, hor: N_HOR, glow: N_GLOW, sun: 0, street: 1, night: 1, lit: 0.24, exp: 1.65 },
]

export const WEATHER = {
  still: { snow: 0.06, wind: 0.25, fog: 0.9, cover: 0.95, swirl: 0.1 },
  light: { snow: 0.28, wind: 0.9, fog: 1.25, cover: 1.0, swirl: 0.3 },
  steady: { snow: 0.6, wind: 1.6, fog: 1.9, cover: 1.0, swirl: 0.5 },
  heavy: { snow: 1.0, wind: 3.8, fog: 3.4, cover: 1.0, swirl: 1.0 },
  clear: { snow: 0.0, wind: 0.4, fog: 0.55, cover: 0.45, swirl: 0.05 },
  fog: { snow: 0.04, wind: 0.15, fog: 4.5, cover: 1.0, swirl: 0.05 },
}
const NEXT = {
  still: [['light', 4], ['steady', 2], ['clear', 1], ['fog', 1]],
  light: [['still', 2], ['steady', 3], ['heavy', 1]],
  steady: [['light', 3], ['heavy', 2], ['still', 1]],
  heavy: [['steady', 3], ['light', 1]],
  clear: [['still', 3], ['light', 1], ['fog', 1]],
  fog: [['still', 2], ['light', 2]],
}

const lerp3 = (a, b, t, out) => out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

export class Atmosphere {
  constructor(uniforms, opts = {}) {
    this.u = uniforms
    this.minutes = opts.startMinutes ?? 16 * 60 + 40
    this.timeScale = opts.timeScale ?? 0.5 // game minutes per real second
    this.paused = false
    this.rng = new RNG(opts.seed ?? 2008)
    this.state = opts.weather ?? 'light'
    this.from = { ...WEATHER[this.state] }
    this.cur = { ...WEATHER[this.state] }
    this.to = WEATHER[this.state]
    this.blend = 1
    this.stateTime = 0
    this.stateDuration = this.rng.float(200, 420)
    this.windDir = this.rng.float(0, Math.PI * 2)
    this.wind = new THREE.Vector3()
    this.gust = 0
    this.snowCover = 0.2
    this.exposure = 1.5
    this.overrideWeather = null
    this.fogMul = 1
    this._c = new THREE.Color()
    this.values = {}
    this.locked = false // e.g. title screen
    this.update(0)
  }

  get hour() { return Math.floor(this.minutes / 60) % 24 }
  get clock() {
    const m = Math.floor(this.minutes) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  setWeather(name, instant = false) {
    if (!WEATHER[name]) return
    this.from = { ...this.cur }
    this.to = WEATHER[name]
    this.state = name
    this.blend = instant ? 1 : 0
    if (instant) this.cur = { ...this.to }
    this.stateTime = 0
    this.stateDuration = this.rng.float(220, 520)
  }

  setTime(minutes) { this.minutes = ((minutes % 1440) + 1440) % 1440 }

  _key(m) {
    let i = 0
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= m) i++
    const a = KEYS[i], b = KEYS[i + 1]
    const t = smoothstep(0, 1, (m - a.t) / (b.t - a.t))
    return { a, b, t }
  }

  update(dt) {
    if (!this.paused) this.minutes = (this.minutes + dt * this.timeScale) % 1440
    // weather state machine
    this.stateTime += dt
    if (!this.overrideWeather && this.stateTime > this.stateDuration) this.setWeather(this.rng.weighted(NEXT[this.state]))
    this.blend = Math.min(1, this.blend + dt / 90)
    const bt = smoothstep(0, 1, this.blend)
    for (const k of Object.keys(this.to)) this.cur[k] = this.from[k] + (this.to[k] - this.from[k]) * bt

    // wind: slowly wandering direction, gusts
    this.windDir += (Math.sin(this.minutes * 0.05) * 0.02 + (this.rng.next() - 0.5) * 0.01) * dt
    this.gust += ((this.rng.next() < dt * 0.15 ? 1 : 0) - this.gust * 0.4 * dt)
    this.gust = clamp(this.gust, 0, 1.5)
    const ws = this.cur.wind * (1 + 0.6 * this.gust)
    this.wind.set(Math.cos(this.windDir) * ws, 0, Math.sin(this.windDir) * ws)
    this.windSpeed = ws

    // snow cover settles while it snows
    this.snowCover = clamp(this.snowCover + (this.cur.snow - 0.25) * dt * 0.0025, 0, 0.85)

    const m = this.minutes
    const { a, b, t } = this._key(m)
    const u = this.u
    lerp3(a.sky, b.sky, t, u.uSkyAmb.value)
    lerp3(a.gnd, b.gnd, t, u.uGroundAmb.value)
    lerp3(a.fog, b.fog, t, u.uFogColor.value)
    lerp3(a.hor, b.hor, t, u.uFogHorizon.value)
    lerp3(a.glow, b.glow, t, u.uFogGlow.value)
    const sun = a.sun + (b.sun - a.sun) * t
    u.uSunCol.value.setRGB(sun, sun * 0.98, sun * 0.95)
    const street = a.street + (b.street - a.street) * t
    const night = a.night + (b.night - a.night) * t
    u.uStreetOn.value = street
    u.uNight.value = night
    u.uLitFraction.value = a.lit + (b.lit - a.lit) * t
    this.exposure = a.exp + (b.exp - a.exp) * t

    // snowfall greys and brightens the fog; heavy snow closes visibility down
    const snow = this.cur.snow
    const fogMul = this.cur.fog * this.fogMul
    u.uFogDensity.value = 0.0062 * fogMul
    u.uFogFalloff.value = 0.03 / Math.max(0.6, Math.sqrt(fogMul))
    u.uScatter.value = 0.0012 + snow * 0.0045 + Math.max(0, fogMul - 1) * 0.0008
    // in daylight snow haze is whitish; at night it takes the sodium glow
    const hz = u.uFogHorizon.value
    u.uFogColor.value.lerp(hz, Math.min(0.5, snow * 0.35))
    u.uSnowCover.value = this.snowCover
    u.uGameMinutes.value = m + Math.floor(this.days ?? 0) * 1440
    this.values = { street, night, snow, fogMul, sun }
  }
}
