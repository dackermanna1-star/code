// Game orchestration: renderer, world build, content modules, main loop.

import * as THREE from 'three'
import { VOXEL, WORLD_SIZE, PLAY_MIN, PLAY_MAX, TERRAIN_CELLS } from '../core/constants.js'
import { buildPaletteTexture, M, defineMaterial } from '../core/materials.js'
import { defineModel, allModelNames } from '../core/models.js'
import { VoxelModel } from '../core/VoxelModel.js'
import { Terrain } from '../core/Terrain.js'
import { World } from '../core/World.js'
import { Lights } from '../core/Lights.js'
import { Zones } from '../core/Zones.js'
import { Interactions } from '../core/Interactions.js'
import { RNG, smoothstep } from '../core/rng.js'
import { createSharedUniforms, createVoxelMaterials } from '../render/VoxelMaterial.js'
import { Sky } from '../render/Sky.js'
import { Snowfall } from '../render/Snow.js'
import { LampHalos } from '../render/Halos.js'
import { Footprints } from '../render/Footprints.js'
import { Signs } from '../render/Signs.js'
import { PostFX } from '../render/PostFX.js'
import { Wires } from '../render/Wires.js'
import { Breath } from '../render/Breath.js'
import { Atmosphere } from './Atmosphere.js'
import { Events } from './Events.js'
import { Player } from '../player/Player.js'
import { Input } from '../player/Input.js'
import { AudioEngine } from '../audio/AudioEngine.js'
import { UI } from '../ui/UI.js'
import { Menu } from '../ui/Menu.js'
import { loadContentModules } from '../content/index.js'

const QUALITY = {
  low: { lights: 10, snow: 22000, bloom: false, samples: 0 },
  medium: { lights: 16, snow: 40000, bloom: true, samples: 2 },
  high: { lights: 24, snow: 60000, bloom: true, samples: 4 },
}

export class Game {
  constructor(canvas, params = {}) {
    this.canvas = canvas
    this.params = params
    this.time = 0
    this.frame = 0
    this.running = false
    this.paused = false
    this.events = new Events()
    this.modules = []
    this.spawn = { x: 230, z: 400, yaw: 0 }
    this.zone = null
    this.state = {} // free-form shared state for content (anomaly counters, visited places, ...)
    this.flashlight = false
    this.phone = null // provided by content (ui-phone)
  }

  async init(onProgress = () => {}) {
    const p = this.params
    onProgress(0.02, 'renderer')
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!p.shot })
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.setClearColor(0x000000, 1)
    renderer.info.autoReset = false
    this.renderer = renderer
    const scene = new THREE.Scene()
    scene.matrixWorldAutoUpdate = true
    this.scene = scene
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2400)
    camera.rotation.order = 'YXZ'
    this.camera = camera
    scene.add(camera)

    // settings
    this.menu = new Menu(this)
    this.settings = this.menu.settings
    if (p.quality) this.settings.quality = p.quality

    // shared rendering state
    this.uniforms = createSharedUniforms()
    this.input = new Input(this.canvas)
    this.ui = new UI(this)
    this.audio = new AudioEngine()

    // content modules (imports define materials/models at module top level)
    onProgress(0.05, 'content')
    this.modules = await loadContentModules(p.only ? p.only.split(',') : null, (n, name) => onProgress(0.05 + 0.1 * n, name))
    buildPaletteTexture()
    this.mats = createVoxelMaterials(this.uniforms)

    this.terrain = new Terrain(TERRAIN_CELLS)
    this.world = new World(this.terrain)
    this.lights = new Lights(this.uniforms)
    this.zones = new Zones()
    this.interactions = new Interactions()
    this.signs = new Signs(this.uniforms)
    this.footprints = new Footprints(this.uniforms)
    this.wires = new Wires(this.uniforms)
    this.atmos = new Atmosphere(this.uniforms, {
      startMinutes: p.t ? parseClock(p.t) : 16 * 60 + 38,
      weather: p.weather ?? 'light',
      timeScale: p.timescale !== undefined ? parseFloat(p.timescale) : 0.5,
    })
    if (p.weather) this.atmos.overrideWeather = p.weather
    this.player = new Player(this)

    const ctx = this.ctx = {
      game: this, THREE, world: this.world, terrain: this.terrain, lights: this.lights, zones: this.zones,
      interactions: this.interactions, signs: this.signs, footprints: this.footprints, wires: this.wires, audio: this.audio,
      ui: this.ui, scene, camera, player: this.player, atmos: this.atmos, events: this.events,
      M, defineMaterial, defineModel, VoxelModel, VOXEL, RNG, rng: seed => new RNG(seed),
      /** Pedestrian polylines [{points:[[x,z],...], kind:'sidewalk'|'path'|'courtyard'|'indoor', y?}] for NPCs */
      navPaths: this.navPaths = [],
      /** Free-form registry so packages can expose things to each other (e.g. entrances, stops). */
      registry: this.registry = {},
    }

    // build
    const mods = this.viewerBuild ? [] : [...this.modules].sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
    if (this.viewerBuild) { this.viewerBuild(ctx); this.modules = [] }
    let i = 0
    for (const mod of mods) {
      onProgress(0.15 + 0.4 * (i++ / Math.max(1, mods.length)), mod.name)
      await nextFrame()
      if (!mod.build) continue
      try { await mod.build(ctx) } catch (e) { console.error(`[content:${mod.name}] build failed`, e); this.buildErrors = (this.buildErrors || []).concat(`${mod.name}: ${e.message}`) }
    }

    onProgress(0.6, 'meshing world')
    await nextFrame()
    await this.world.finalize(scene, this.mats, (f, name) => onProgress(0.6 + 0.25 * f, name))
    onProgress(0.86, 'terrain')
    await nextFrame()
    for (const m of this.terrain.buildMeshes(this.mats.terrain)) scene.add(m)
    scene.add(this._farGround())
    onProgress(0.9, 'signs')
    this.signs.build(scene)
    this.wires.build(scene)

    // effects
    this.sky = new Sky(this.uniforms)
    scene.add(this.sky.mesh)
    const q = QUALITY[this.settings.quality] || QUALITY.high
    this.snow = new Snowfall(this.uniforms, p.shot ? Math.min(q.snow, 30000) : q.snow)
    this.snow.uniforms.uRoof.value = this.world.roofTexture
    scene.add(this.snow.points)
    this.halos = new LampHalos(this.uniforms)
    this.lights.halos = this.halos
    scene.add(this.halos.points)
    scene.add(this.footprints.mesh)
    this.breath = new Breath(this.uniforms)
    scene.add(this.breath.points)

    this.post = new PostFX(renderer, scene, camera, this.uniforms, { samples: p.shot && !p.msaa ? 0 : q.samples })
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.applySettings(this.settings)

    // player
    const sp = this.spawn
    const sx = p.x !== undefined ? parseFloat(p.x) : sp.x
    const sz = p.z !== undefined ? parseFloat(p.z) : sp.z
    const yaw = p.yaw !== undefined ? parseFloat(p.yaw) : sp.yaw
    const sy = p.y !== undefined ? parseFloat(p.y) : (sp.y ?? this._spawnHeight(sx, sz))
    this.player.teleport(sx, sy, sz, yaw)
    if (p.pitch !== undefined) this.player.pitch = parseFloat(p.pitch)
    this.player.onStep = (surface, info) => this._onStep(surface, info)
    this.player.settings = this.settings

    onProgress(0.95, 'init')
    for (const mod of mods) {
      if (!mod.init) continue
      try { await mod.init(ctx) } catch (e) { console.error(`[content:${mod.name}] init failed`, e) }
    }
    // pre-warm: one update + compile
    this._updateWorld(0.016)
    renderer.compile(scene, camera)
    onProgress(1, 'ready')
    this.ready = true
    window.game = this
  }

  _spawnHeight(x, z) {
    const g = this.world.groundBelow(x, 60, z, 120)
    return g ?? Math.max(0, this.terrain.heightAt(x, z))
  }

  _farGround() {
    // ring of flat snow outside the terrain so the world never shows an edge
    const g = new THREE.BufferGeometry()
    const S = WORLD_SIZE, F = 3000
    const rects = [[-F, -F, S + F, 0], [-F, S, S + F, S + F], [-F, 0, 0, S], [S, 0, S + F, S]]
    const pos = [], dat = [], siz = [], idx = []
    const snow = M('snow')
    let v = 0
    for (const [x0, z0, x1, z1] of rects) {
      const y = 0.25
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1)
      for (let k = 0; k < 4; k++) { dat.push(snow, 2 | (k << 3) | (3 << 5), 0, 0); siz.push(255, 255) }
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
      v += 4
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aData', new THREE.Uint8BufferAttribute(dat, 4))
    g.setAttribute('aSize', new THREE.Uint8BufferAttribute(siz, 2))
    g.setIndex(idx)
    const mesh = new THREE.Mesh(g, this.mats.terrain)
    mesh.frustumCulled = false
    mesh.name = 'far-ground'
    return mesh
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight
    const s = this.settings || {}
    const pr = Math.min(window.devicePixelRatio || 1, 2) * (s.retro ? 0.42 : (s.renderScale ?? 1))
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.canvas.style.imageRendering = s.retro ? 'pixelated' : 'auto'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.post?.setSize(w, h, pr)
    const hp = h * pr
    this.snow?.setPixelScale(hp, this.camera.fov)
    this.halos?.setPixelScale(hp, this.camera.fov)
    this.breath?.setPixelScale(hp, this.camera.fov)
  }

  applySettings(s) {
    this.settings = s
    this.player.settings = s
    this.ui.translations = s.translations
    this.audio.volumes.master = s.master
    this.audio.volumes.ambience = s.ambience
    this.audio.volumes.music = s.music
    this.audio.applyVolumes()
    const q = QUALITY[s.quality] || QUALITY.high
    this.lights.maxLights = q.lights
    if (this.post) {
      this.post.bloom.enabled = q.bloom
      this.post.uniforms.uGrain.value = 0.035 * s.grain
    }
    this.resize()
  }

  start() {
    if (this.running) return
    this.running = true
    this.audio.init()
    this.audio.resume()
    this.input.onLockChange = locked => {
      if (!locked && !this.menu.open && !this.params.shot && !this.input.lockFailed && !this.ui.noteOpen && !this.phone?.open) this.menu.show()
    }
    this.input.requestLock()
    this.canvas.addEventListener('click', () => {
      this.audio.resume()
      if (!this.menu.open && !this.input.locked) this.input.requestLock()
    })
    this.events.emit('start')
    this._last = performance.now()
    const loop = () => {
      if (!this.running) return
      requestAnimationFrame(loop)
      const now = performance.now()
      const dt = Math.min(0.1, (now - this._last) / 1000)
      this._last = now
      this.tick(dt)
    }
    requestAnimationFrame(loop)
  }

  onMenu(open) {
    this.paused = open
    this.audio.muffle = open ? 0.8 : 0
    if (!open && !this.params.shot) this.input.requestLock()
    if (open) this.input.exitLock()
  }

  respawn() {
    const sp = this.spawn
    this.player.mode = 'walk'
    this.player.seat = null
    this.player.teleport(sp.x, sp.y ?? this._spawnHeight(sp.x, sp.z), sp.z, sp.yaw)
  }

  _onStep(surface, info) {
    const p = this.player
    this.events.emit('step', { surface, ...info })
    this.audio.footstep(surface, { ...info, pos: p.pos, zone: this.zone })
    // footprints on terrain snow
    const tmat = this.terrain.materialAt(p.pos.x, p.pos.z)
    const th = this.terrain.heightAt(p.pos.x, p.pos.z)
    if (Math.abs(th - p.pos.y) < 0.05) {
      const name = matName(tmat)
      if (name && (name.startsWith('snow'))) {
        const depth = name === 'snow_packed' || name === 'snow_dirty' ? 0.45 : 1
        this.footprints.add(p.pos.x, th, p.pos.z, p.yaw, info.side, depth)
      }
    }
  }

  tick(dt) {
    this.frame++
    this.renderer.info.reset()
    const input = this.input
    if (input.hit('Escape')) {
      if (this.ui.noteOpen) this.ui.closeNote()
      else if (this.phone?.open) this.phone.close()
      else if (this.menu.open) this.menu.close()
      else this.menu.show()
    }
    if (!this.paused) {
      this.time += dt
      this.uniforms.uTime.value = this.time
      this._updateGameplay(dt)
    }
    this._updateWorld(this.paused ? 0 : dt)
    this.audio.update(this.paused ? 0 : dt, this.camera, this)
    this.ui.update(dt)
    this.post.uniforms.uExposure.value = this.atmos.exposure
    this.post.render(dt, this.time)
    if (this.settings.showStats || this.params.stats) this._stats(dt)
    input.endFrame()
  }

  _updateGameplay(dt) {
    const input = this.input
    const p = this.player
    if (this.ui.noteOpen) {
      if (input.hit('KeyE') || input.hit('Space')) this.ui.closeNote()
      input.consumeMouse()
    } else if (this.phone?.open) {
      this.phone.handleInput?.(input, dt)
    } else {
      p.update(dt, input)
      // interaction
      const cam = this.camera
      const o = cam.position, d = cam.getWorldDirection(this._dir || (this._dir = new THREE.Vector3()))
      const hit = p.mode === 'locked' ? null : this.interactions.pick(o, d, this.world, this)
      if (hit) {
        const pr = typeof hit.item.prompt === 'function' ? hit.item.prompt(this, hit.item) : hit.item.prompt
        this.ui.setPrompt(pr)
        if (input.hit('KeyE') || (input.clicked && input.locked)) {
          try { hit.item.onUse?.(this, hit.item) } catch (e) { console.error('interaction', e) }
          this.events.emit('interact', hit.item)
        }
      } else {
        this.ui.setPrompt(p.mode === 'seated' ? { ru: 'Встать — W', en: 'Stand up — W' } : null)
      }
      if (input.hit('KeyQ') || input.hit('Tab')) this.phone?.toggle?.()
      if (input.hit('KeyF')) this.toggleFlashlight()
    }
    this.phone?.update?.(dt)

    // zones
    const z = this.zones.at(p.pos.x, p.pos.y + 1, p.pos.z)
    if (z !== this.zone) {
      const prev = this.zone
      this.zone = z
      this.audio.setReverb(z.reverb)
      this.events.emit('zone', { zone: z, prev })
    }

    // world wrap with a whiteout at the edges
    const span = PLAY_MAX - PLAY_MIN
    let wrapped = false
    if (p.pos.x < PLAY_MIN) { p.pos.x += span; wrapped = true }
    else if (p.pos.x > PLAY_MAX) { p.pos.x -= span; wrapped = true }
    if (p.pos.z < PLAY_MIN) { p.pos.z += span; wrapped = true }
    else if (p.pos.z > PLAY_MAX) { p.pos.z -= span; wrapped = true }
    if (wrapped) {
      const g = this._spawnHeight(p.pos.x, p.pos.z)
      p.pos.y = g
      this.events.emit('wrap', { x: p.pos.x, z: p.pos.z })
    }
    const edge = Math.min(p.pos.x - PLAY_MIN, PLAY_MAX - p.pos.x, p.pos.z - PLAY_MIN, PLAY_MAX - p.pos.z)
    this.uniforms.uWhiteout.value = smoothstep(34, 2, edge)

    for (const mod of this.modules) {
      if (!mod.update) continue
      try { mod.update(dt, this.ctx) } catch (e) {
        if (!mod._errored) { console.error(`[content:${mod.name}] update failed`, e); mod._errored = true }
      }
    }
  }

  toggleFlashlight(on) {
    this.flashlight = on ?? !this.flashlight
    this.audio.play('click', { gain: 0.4, bus: 'ui' })
  }

  _updateWorld(dt) {
    const cam = this.camera
    this.atmos.update(dt)
    if (this.cameraOverride) {
      cam.position.copy(this.cameraOverride.pos)
      cam.lookAt(this.cameraOverride.target)
    } else this.player.applyCamera(cam, this.time)
    // flashlight follows the camera
    const u = this.uniforms
    u.uFlashOn.value += ((this.flashlight ? 1 : 0) - u.uFlashOn.value) * Math.min(1, dt * 12)
    if (u.uFlashOn.value > 0.001) {
      u.uFlashPos.value.copy(cam.position).add(this._v1 || (this._v1 = new THREE.Vector3(0, -0.25, 0)))
      cam.getWorldDirection(u.uFlashDir.value)
    }
    this.lights.update(cam, { streetOn: u.uStreetOn.value, night: u.uNight.value, time: this.time, game: this }, dt)
    this.world.update(cam)
    const zone = this.zone
    const indoorSnow = zone && zone.snow === false ? 0 : 1
    const a = this.atmos
    this.snow.update(dt, a.cur.snow * indoorSnow, a.wind, 0.9 + a.cur.snow * 0.7, a.cur.swirl)
    this.snow.points.visible = indoorSnow > 0 || true
    this.sky.update(dt, a.wind)
    this.sky.uniforms.uCloudCover.value = a.cur.cover
    this.sky.uniforms.uStars.value = (1 - a.cur.cover) * u.uNight.value
    this.footprints.update(dt, a.cur.snow)
    const cold = !zone || !zone.indoor || zone.reverb === 'underpass' || zone.reverb === 'stairwell'
    this.breath.update(dt, cam, { active: cold && !this.cameraOverride, exertion: Math.min(1, this.player.speedNow / 2.25), wind: a.wind })
  }

  _stats(dt) {
    if (!this._statsEl) {
      this._statsEl = document.createElement('div')
      this._statsEl.className = 'stats'
      document.body.appendChild(this._statsEl)
      this._fps = 60
    }
    this._fps = this._fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05
    if (this.frame % 15) return
    const info = this.renderer.info
    const p = this.player.pos
    this._statsEl.textContent = `${this._fps.toFixed(0)} fps  calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k
inst ${this.world.stats.instancesDrawn}  lights ${this.uniforms.uNumLights.value}
pos ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)} yaw ${this.player.yaw.toFixed(2)}
${this.atmos.clock} ${this.atmos.state} zone ${this.zone?.name}`
  }
}

function nextFrame() { return new Promise(r => setTimeout(r, 0)) }
function parseClock(s) {
  const [h, m] = String(s).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
import { materialById } from '../core/materials.js'
function matName(id) { return materialById(id)?.name }

export { allModelNames, defineModel, VoxelModel }
