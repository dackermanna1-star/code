// Lamp glow sprites for vehicles (headlamps, tail lamps, markers, beacons, the train's
// прожектор). Uses the engine's halo renderer in a private instance so the glows never take a
// per-pixel light slot, and adds directionality: a headlamp blazes when it faces you and is a
// dim lens from the side.

import * as THREE from 'three'
import { LampHalos } from '../../render/Halos.js'

export class Glows {
  constructor(ctx) {
    this.ctx = ctx
    this.halos = new LampHalos(ctx.game.uniforms)
    this.halos.points.name = 'vehicle-glows'
    this.halos.points.renderOrder = 6
    ctx.scene.add(this.halos.points)
    this.list = []
    this._size = new THREE.Vector2()
  }

  /**
   * Add a glow. o: { color, intensity (≈ halo brightness, ≤ 80), size, dir: 'front'|'back'|'omni', cone }
   * Returns a handle; set handle.on (0..1), the owner updates handle.pos / handle.fwd each frame.
   */
  add(o) {
    const h = {
      halo: true, level: 0, on: 0, domain: 1,
      pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
      color: new THREE.Color(o.color ?? 0xfff0d8), intensity: o.intensity ?? 50, haloSize: o.size ?? 0.6,
      dir: o.dir ?? 'omni', cone: o.cone ?? 0.25,
    }
    this.list.push(h)
    return h
  }

  update(cam) {
    const r = this.ctx.game.renderer
    if (r) {
      r.getDrawingBufferSize(this._size)
      this.halos.setPixelScale(this._size.y, cam.fov)
    }
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z
    for (const h of this.list) {
      if (h.on <= 0.001) { h.level = 0; continue }
      let k = h.on
      if (h.dir !== 'omni') {
        let dx = cx - h.pos.x, dy = cy - h.pos.y, dz = cz - h.pos.z
        const d = Math.hypot(dx, dy, dz) || 1
        dx /= d; dy /= d; dz /= d
        let dot = dx * h.fwd.x + dy * h.fwd.y + dz * h.fwd.z
        if (h.dir === 'back') dot = -dot
        // a lamp lens: bright inside its cone, a faint lit lens from the side, nothing from behind
        const t = Math.min(1, Math.max(0, (dot - h.cone) / (1 - h.cone)))
        k *= dot < -0.05 ? 0 : 0.12 + 0.88 * t * t
      }
      h.level = k
    }
    this.halos.update(this.list)
  }
}
