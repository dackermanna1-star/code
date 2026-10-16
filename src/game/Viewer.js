// Model viewer for content authoring: ?viewer=model_a,model_b&view=0..3&t=12:00
// Places the models side by side on flat snow and frames them from one of four angles.
// view: 0 front-left, 1 front-right, 2 back-left, 3 close-up front. ?dist=1.0 scales distance.
// ?lamp=1 adds a street lamp light above the models (useful at night).

import * as THREE from 'three'
import { Game } from './Game.js'
import { getModelDef } from '../core/models.js'
import { VOXEL } from '../core/constants.js'

export async function runViewer(canvas, params) {
  const names = params.viewer.split(',').filter(Boolean)
  const game = new Game(canvas, { ...params, shot: 1, timescale: params.timescale ?? '0', t: params.t ?? '12:00', weather: params.weather ?? 'still' })
  game.viewerBuild = ctx => {
    const { world, terrain, lights } = ctx
    terrain.setHeightRect(0, 0, 640, 640, 0.25)
    let x = 320
    const placed = []
    let minX = Infinity, maxX = -Infinity, maxH = 0, maxD = 0
    for (const n of names) {
      const d = getModelDef(n)
      if (!d) { console.warn('viewer: no model', n); continue }
      const w = d.max[0] - d.min[0]
      const p = world.place(n, { x: x - d.min[0], z: 320, y: 0.25, seed: parseFloat(params.seed ?? '0.37'), tint: params.tint ? parseInt(params.tint, 16) : 0x7a8a6a })
      placed.push(p)
      minX = Math.min(minX, p.aabb[0]); maxX = Math.max(maxX, p.aabb[3])
      maxH = Math.max(maxH, p.aabb[4] - p.aabb[1]); maxD = Math.max(maxD, p.aabb[5] - p.aabb[2])
      x += w + 1.5
    }
    if (!placed.length) return
    const cx = (minX + maxX) / 2, cy = 0.25 + maxH * 0.45, cz = 320
    const size = Math.max(maxX - minX, maxH, maxD, 1.2)
    const view = parseInt(params.view ?? '0', 10)
    const distK = parseFloat(params.dist ?? '1')
    const angles = [-0.65, 0.65, Math.PI - 0.7, -0.25]
    const elev = [0.32, 0.25, 0.3, 0.12]
    const dist = size * (view === 3 ? 0.75 : 1.35) * distK + 1.2
    const a = angles[view % 4]
    const pos = new THREE.Vector3(cx + Math.sin(a) * dist, cy + dist * elev[view % 4] + 0.4, cz + Math.cos(a) * dist + maxD / 2)
    game.cameraOverride = { pos, target: new THREE.Vector3(cx, cy, cz + (view === 2 ? 0 : 0)) }
    game.spawn = { x: pos.x, z: pos.z, yaw: 0 }
    if (params.lamp) {
      lights.add({ x: cx + 2, y: 0.25 + Math.max(6, maxH + 3), z: cz + maxD, type: 'spot', dir: [-0.2, -1, -0.35], cone: 70, intensity: 70, range: 30, color: 0xffa040 })
    }
    void VOXEL
  }
  await game.init(() => {})
  game.start()
  let frames = parseInt(params.frames || '12', 10)
  const wait = () => { if (--frames <= 0) { window.__shotReady = true; return } requestAnimationFrame(wait) }
  requestAnimationFrame(wait)
}
