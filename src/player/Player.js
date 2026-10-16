// First-person walker. Leisurely pace, restrained head bob, voxel collision with step-up and
// smoothed stair climbing, carried by moving platforms (elevator cab, metro car).

import * as THREE from 'three'
import { VOXEL } from '../core/constants.js'
import { SURFACE, SURF } from '../core/materials.js'

const HALF_W = 0.22
const HEIGHT = 1.74
const EYE = 1.62
const STEP_MAX = 0.3
const GRAVITY = 18

export class Player {
  constructor(game) {
    this.game = game
    this.pos = new THREE.Vector3(0, 0, 0) // feet position
    this.vel = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.grounded = false
    this.mode = 'walk' // 'walk' | 'seated' | 'locked'
    this.camOffsetY = 0 // smoothing for steps
    this.bobPhase = 0
    this.bobAmp = 0
    this.stepIndex = 0
    this.surface = SURF.SNOW
    this.groundMat = 0
    this.groundPlacement = null
    this._lastGroundPos = null
    this.idleTime = 0
    this.walkedDistance = 0
    this.speedNow = 0
    this.seat = null
    this.seatBlend = 0
    this.lookSmoothing = 0.35
    this._lookV = [0, 0]
    this.onStep = null // (surface, info) => void
    this.settings = { sensitivity: 1, invertY: false, headBob: 1, fov: 70 }
    this.sprintAllowed = true
    this.speedScale = 1
  }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z)
    this.vel.set(0, 0, 0)
    if (yaw !== undefined) this.yaw = yaw
    this.camOffsetY = 0
    this.groundPlacement = null
    this._lastGroundPos = null
  }

  /** Sit down at a seat {x,y,z (eye-level target feet pos), yaw}. Any movement key stands up. */
  sit(seat) {
    this.mode = 'seated'
    this.seat = seat
    this.vel.set(0, 0, 0)
  }
  stand() {
    if (this.mode !== 'seated') return
    this.mode = 'walk'
    if (this.seat?.standPos) this.pos.copy(this.seat.standPos)
    this.seat = null
  }

  box(x, y, z) {
    return [x - HALF_W, y, z - HALF_W, x + HALF_W, y + HEIGHT, z + HALF_W]
  }
  hits(x, y, z) {
    const b = this.box(x, y, z)
    return this.game.world.boxHit(b[0], b[1], b[2], b[3], b[4], b[5])
  }

  update(dt, input) {
    const world = this.game.world
    // ---- look
    const [mx, my] = input.consumeMouse()
    const s = 0.0022 * this.settings.sensitivity
    const sm = this.lookSmoothing
    this._lookV[0] = this._lookV[0] * sm + mx * (1 - sm)
    this._lookV[1] = this._lookV[1] * sm + my * (1 - sm)
    if (this.mode !== 'locked') {
      this.yaw -= this._lookV[0] * s
      this.pitch -= this._lookV[1] * s * (this.settings.invertY ? -1 : 1)
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch))
    }

    // ---- seated
    if (this.mode === 'seated') {
      this.seatBlend = Math.min(1, this.seatBlend + dt * 1.5)
      const moving = input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD') ||
        input.down('ArrowUp') || input.down('ArrowDown')
      if (moving && this.seatBlend > 0.5) this.stand()
      this.speedNow = 0
      this._updateBob(dt, 0)
      return
    }
    this.seatBlend = Math.max(0, this.seatBlend - dt * 2)

    // ---- moving platform carry
    if (this.groundPlacement && this.groundPlacement.dynamic) {
      const gp = this.groundPlacement
      if (this._lastGroundPos) {
        const dx = gp.x - this._lastGroundPos[0], dy = gp.y - this._lastGroundPos[1], dz = gp.z - this._lastGroundPos[2]
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 5) {
          // vertical first (elevators), then horizontal
          if (dy > 0) this.pos.y += dy
          else if (!this.hits(this.pos.x, this.pos.y + dy, this.pos.z)) this.pos.y += dy
          if (!this.hits(this.pos.x + dx, this.pos.y, this.pos.z + dz)) { this.pos.x += dx; this.pos.z += dz }
        }
      }
      this._lastGroundPos = [gp.x, gp.y, gp.z]
    } else this._lastGroundPos = null

    // ---- wish direction
    let fx = 0, fz = 0
    if (this.mode === 'walk') {
      if (input.down('KeyW') || input.down('ArrowUp') || input.touchWalk) fz -= 1
      if (input.down('KeyS') || input.down('ArrowDown')) fz += 1
      if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1
      if (input.down('KeyD') || input.down('ArrowRight')) fx += 1
    }
    const len = Math.hypot(fx, fz)
    if (len > 0) { fx /= len; fz /= len }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    // rotate (fx,fz) by yaw: forward (0,-1) → (-sin, -cos)
    const wx = fx * cy + fz * sy
    const wz = -fx * sy + fz * cy
    const brisk = this.sprintAllowed && (input.down('ShiftLeft') || input.down('ShiftRight'))
    let speed = (brisk ? 2.25 : 1.38) * this.speedScale
    const surf = this.surface
    let accel = 5.5, decel = 7
    if (surf === SURF.SNOW) speed *= 0.9
    if (surf === SURF.ICE) { accel = 2.0; decel = 1.6 }
    if (surf === SURF.SLUSH) speed *= 0.95
    const tvx = wx * speed, tvz = wz * speed
    const k = len > 0 ? accel : decel
    this.vel.x += (tvx - this.vel.x) * Math.min(1, k * dt)
    this.vel.z += (tvz - this.vel.z) * Math.min(1, k * dt)

    // conveyor (escalators)
    const zone = this.game.zone
    let cvx = 0, cvy = 0, cvz = 0
    if (zone && zone.conveyor && this.grounded) { cvx = zone.conveyor[0]; cvy = zone.conveyor[1]; cvz = zone.conveyor[2] }

    // ---- horizontal movement with step-up
    const mvx = (this.vel.x + cvx) * dt, mvz = (this.vel.z + cvz) * dt
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mvx), Math.abs(mvz)) / 0.1))
    for (let i = 0; i < steps; i++) {
      this._moveAxis(mvx / steps, 0)
      this._moveAxis(0, mvz / steps)
    }

    // ---- vertical
    if (cvy > 0 && this.grounded) {
      // riding up: lift with the conveyor if free
      const up = cvy * dt
      if (!this.hits(this.pos.x, this.pos.y + up, this.pos.z)) this.pos.y += up
    }
    this.vel.y -= GRAVITY * dt
    if (this.vel.y < -30) this.vel.y = -30
    const dy = this.vel.y * dt
    const wasGrounded = this.grounded
    if (!this.hits(this.pos.x, this.pos.y + dy, this.pos.z)) {
      this.pos.y += dy
      this.grounded = false
      // stick to stairs/curbs when walking down
      if (wasGrounded && this.vel.y < 0) {
        for (let d = 0.04; d <= STEP_MAX + 0.05; d += 0.04) {
          if (this.hits(this.pos.x, this.pos.y - d, this.pos.z)) {
            const drop = d - 0.04
            this.pos.y -= drop
            this.camOffsetY += drop
            this.grounded = true
            this.vel.y = 0
            break
          }
        }
      }
    } else {
      // landed: find contact
      if (dy < 0) {
        let lo = 0, hi = dy // binary search for the free position just above contact
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2
          if (this.hits(this.pos.x, this.pos.y + mid, this.pos.z)) hi = mid
          else lo = mid
        }
        this.pos.y += lo
        this.grounded = true
      }
      this.vel.y = 0
    }
    // un-stick if inside geometry (e.g. elevator pushed into us)
    if (this.hits(this.pos.x, this.pos.y, this.pos.z)) {
      for (let up = VOXEL / 2; up <= 1.0; up += VOXEL / 2) {
        if (!this.hits(this.pos.x, this.pos.y + up, this.pos.z)) { this.pos.y += up; break }
      }
    }

    // ---- ground material & platform
    this.groundMat = world.materialAt(this.pos.x, this.pos.y - 0.06, this.pos.z)
    this.groundPlacement = this.grounded ? world.placementAt(this.pos.x, this.pos.y - 0.06, this.pos.z) : null
    if (this.groundMat) this.surface = zone?.surface ?? SURFACE[this.groundMat]

    // ---- bob & steps
    const hs = Math.hypot(this.vel.x, this.vel.z)
    this.speedNow = hs
    this.walkedDistance += hs * dt
    if (hs < 0.1) this.idleTime += dt
    else this.idleTime = 0
    this._updateBob(dt, this.grounded ? hs : 0)
    this.camOffsetY *= Math.exp(-dt * 10)
  }

  _moveAxis(dx, dz) {
    if (dx === 0 && dz === 0) return
    const p = this.pos
    if (!this.hits(p.x + dx, p.y, p.z + dz)) { p.x += dx; p.z += dz; return }
    // step up
    if (this.grounded || this.vel.y >= -2) {
      for (let up = VOXEL * 0.5; up <= STEP_MAX + 1e-6; up += VOXEL * 0.5) {
        if (!this.hits(p.x, p.y + up, p.z) && !this.hits(p.x + dx, p.y + up, p.z + dz)) {
          p.x += dx; p.z += dz
          // settle down onto the step surface
          let settle = 0
          for (let d = 0.02; d <= up; d += 0.02) { if (this.hits(p.x, p.y + up - d, p.z)) break; settle = d }
          const rise = up - settle
          p.y += rise
          this.camOffsetY -= rise
          return
        }
      }
    }
    // blocked: kill velocity along this axis
    if (dx !== 0) this.vel.x = 0
    if (dz !== 0) this.vel.z = 0
  }

  _updateBob(dt, speed) {
    const stride = 0.74
    const target = Math.min(1, speed / 1.4)
    this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 6)
    if (speed > 0.05) {
      const prev = Math.floor(this.bobPhase / Math.PI)
      this.bobPhase += (speed / stride) * Math.PI * dt
      const now = Math.floor(this.bobPhase / Math.PI)
      if (now !== prev) {
        this.stepIndex++
        this.onStep?.(this.surface, { speed, side: this.stepIndex % 2 ? 1 : -1, mat: this.groundMat })
      }
    } else {
      // settle phase to a rest point so the next step starts cleanly
      const target2 = Math.round(this.bobPhase / Math.PI) * Math.PI
      this.bobPhase += (target2 - this.bobPhase) * Math.min(1, dt * 4)
    }
  }

  /** Apply camera transform. t = time (s) for idle breathing sway. */
  applyCamera(camera, t) {
    const hb = this.settings.headBob
    const a = this.bobAmp * hb
    const ph = this.bobPhase
    const bobY = (Math.cos(2 * ph) - 1) * 0.5 * 0.028 * a
    const bobX = Math.sin(ph) * 0.016 * a
    const roll = Math.sin(ph) * 0.0035 * a
    const breathe = Math.sin(t * 1.35) * 0.004 * (1 - a)
    let eye = EYE
    let px = this.pos.x, py = this.pos.y, pz = this.pos.z
    if (this.seat) {
      const k = this.seatBlend * this.seatBlend * (3 - 2 * this.seatBlend)
      eye = EYE - 0.48 * k
      px += (this.seat.x - px) * k
      pz += (this.seat.z - pz) * k
      py += ((this.seat.y ?? py) - py) * k
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    camera.position.set(px + cy * bobX, py + eye + bobY + breathe + this.camOffsetY, pz - sy * bobX)
    camera.rotation.set(this.pitch + Math.sin(t * 0.9) * 0.002 * (1 - a), this.yaw, roll, 'YXZ')
    if (camera.fov !== this.settings.fov) { camera.fov = this.settings.fov; camera.updateProjectionMatrix() }
  }

  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z) }
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
  }
}

export const PLAYER_DIMS = { HALF_W, HEIGHT, EYE }
