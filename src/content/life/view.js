// "Can the player see this spot?" — camera cone, fog and a coarse line-of-sight ray. Used to
// spawn and despawn people only where nobody is looking (or where the fog has swallowed them).

import * as THREE from 'three'

const _dir = new THREE.Vector3()

export class View {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0
    this.fx = 0; this.fy = 0; this.fz = -1
    this.cosHalf = 0.5
    this.fog = 0.008
  }

  /** Refresh from the camera once per frame. */
  update(ctx) {
    const cam = ctx.camera
    if (!cam) return
    this.x = cam.position.x; this.y = cam.position.y; this.z = cam.position.z
    cam.getWorldDirection(_dir)
    this.fx = _dir.x; this.fy = _dir.y; this.fz = _dir.z
    const vf = (cam.fov || 70) * Math.PI / 180
    const hf = 2 * Math.atan(Math.tan(vf / 2) * (cam.aspect || 1.6))
    // half the diagonal-ish field plus a margin, so figures at the screen edge count as seen
    this.cosHalf = Math.cos(Math.min(Math.PI * 0.49, Math.max(hf, vf) / 2 + 0.22))
    const u = ctx.game?.uniforms
    this.fog = u?.uFogDensity?.value ?? 0.008
  }

  /** Fog transmittance to a point at distance d (horizontal approximation of the shader). */
  fogT(d) { return Math.exp(-this.fog * 0.95 * d) }

  /** Is the point inside the (generous) view cone? */
  inCone(x, y, z) {
    const dx = x - this.x, dy = y - this.y, dz = z - this.z
    const d = Math.hypot(dx, dy, dz) || 1
    return (dx * this.fx + dy * this.fy + dz * this.fz) / d > this.cosHalf
  }

  /**
   * Could the player see a figure standing at (x, y, z) (feet)? Cone + fog + line of sight to
   * chest and head height. `world` may be null (no occlusion test).
   */
  seen(world, x, y, z, height = 1.6) {
    const d = Math.hypot(x - this.x, z - this.z)
    if (d < 3) return true
    if (this.fogT(d) < 0.16) return false
    if (!this.inCone(x, y + height * 0.6, z)) return false
    if (!world) return true
    if (world.lineOfSight(this.x, this.y, this.z, x, y + height * 0.65, z, 0.6)) return true
    return world.lineOfSight(this.x, this.y, this.z, x, y + height * 0.95, z, 0.6)
  }
}
