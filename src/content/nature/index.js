// Nature package: winter trees, bushes, weeds, frozen ponds, snow banks/drifts/piles, steam
// plumes, crows and falling snow clumps. build() places nothing by itself — layout packages call
// src/content/nature/api.js. This module runs the shared systems (steam, crows, clumps, ice).

import './materials.js'
import './trees.js'
import './plants.js'
import './props.js'
import './crows.js'
import { natureState } from './state.js'
import { steamSystem } from './api.js'
import { updateCrows } from './crows.js'
import { createClumps, updateClumps } from './clumps.js'
import { MAT } from './materials.js'
import { showcase } from './showcase.js'

const ICE = new Set([MAT.icePond, MAT.iceDark, MAT.iceCrack])

function updateIce(ctx, s, dt) {
  // walking on pond ice: now and then a deep crack runs somewhere under the snow
  if (!s.ponds.length) return
  const p = ctx.player
  if (!p || !p.pos) return
  s.iceTimer = (s.iceTimer ?? 6) - dt
  if (s.iceTimer > 0) return
  s.iceTimer = 1
  if (!ICE.has(ctx.terrain.materialAt(p.pos.x, p.pos.z))) return
  const speed = Math.hypot(p.vel?.x ?? 0, p.vel?.z ?? 0)
  if (speed < 0.3 && (s.iceStill = (s.iceStill ?? 0) + 1) < 8) return
  s.iceStill = 0
  const g = ctx.game
  if (g.time - (s.lastCrack ?? -1e9) < 14) return
  const h = Math.sin(g.time * 12.9898) * 43758.5453
  if (h - Math.floor(h) > 0.22) return
  s.lastCrack = g.time
  const a = g.time * 2.39
  const pos = [p.pos.x + Math.cos(a) * 5, p.pos.y - 0.2, p.pos.z + Math.sin(a) * 5]
  const au = ctx.audio
  if (au?.ready && (!au.has || au.has('ice_crack'))) {
    try { au.play('ice_crack', { pos, gain: 0.8, refDistance: 6, maxDistance: 200 }) } catch { /* ignore */ }
  }
}

export default {
  name: 'nature',
  order: 28,

  build(ctx) {
    const s = natureState(ctx)
    steamSystem(ctx)
    createClumps(ctx, s)
    if (ctx.game.params?.naturetest) showcase(ctx)
  },

  init(ctx) {
    natureState(ctx)
  },

  update(dt, ctx) {
    const s = natureState(ctx)
    const cam = ctx.camera.position
    if (s.steam) s.steam.update(dt, ctx.game.time, cam, ctx.atmos.wind)
    if (s.crowGroups.length) {
      const p = ctx.player?.pos || cam
      updateCrows(ctx, s, dt, p.x, p.y, p.z)
    }
    updateClumps(ctx, s, dt)
    updateIce(ctx, s, dt)
  },
}
