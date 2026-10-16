// The player's own footsteps: one synthesized variant per step from the surface's pool (no
// immediate repeats), alternating feet (slight pan and level), speed-dependent level and
// pitch, played non-spatially on the foley path with the zone reverb. Snow makes the soles
// wet: the next steps on indoor tile/linoleum sometimes squeak.

import { SURF } from '../../core/materials.js'
import { bufferVoice } from './sounds.js'
import { playFoley } from './mix.js'
import { makeRng, clamp } from './dsp.js'
import { bank } from './bank.js'

/** surface → [recipe key, level dB] */
export const STEP_SOUNDS = {
  [SURF.NONE]: ['step_concrete', -16],
  [SURF.SNOW]: ['step_snow', -14],
  [SURF.SNOW_PACKED]: ['step_snow_packed', -15],
  [SURF.ICE]: ['step_ice', -17],
  [SURF.SLUSH]: ['step_slush', -15],
  [SURF.CONCRETE]: ['step_concrete', -16],
  [SURF.ASPHALT]: ['step_asphalt', -16],
  [SURF.METAL]: ['step_metal', -14],
  [SURF.TILE]: ['step_tile', -16],
  [SURF.WOOD]: ['step_wood', -15],
  [SURF.LINOLEUM]: ['step_linoleum', -17],
  [SURF.GRAVEL]: ['step_gravel', -15],
  [SURF.CARPET]: ['step_carpet', -19],
  [SURF.METAL_GRATE]: ['step_metal_grate', -14],
}

const r = makeRng(1801)
const last = new Map()
let wet = 0
export const stepState = { count: 0, lastSurface: SURF.SNOW, lastTime: 0 }

function pick(key) {
  const n = bank.spec(key)?.variants ?? 1
  let v = Math.floor(r() * n)
  if (v === last.get(key)) v = (v + 1) % n
  last.set(key, v)
  return v
}

export function footstep(engine, surface, info = {}) {
  if (!engine?.ready) return
  try {
    const [key, db] = STEP_SOUNDS[surface] || STEP_SOUNDS[SURF.CONCRETE]
    const speed = info.speed ?? 1.38
    const sp = clamp((speed - 0.4) / (2.25 - 0.4), 0, 1)
    const side = info.side ?? 1
    const levelDb = db - 6 + 9 * sp + side * 0.7 + r.range(-1.5, 1.2)
    const rate = (1 + (speed - 1.38) * 0.045) * r.range(0.95, 1.05)
    const zone = info.zone
    const indoor = !!zone?.indoor
    const src = bufferVoice(engine, key, pick(key), { rate, sync: true })
    playFoley(engine, src, { gain: Math.pow(10, levelDb / 20), pan: side * 0.07, send: indoor ? 0.75 : 0.4 })
    // wet soles after snow/slush → occasional squeak on hard indoor floors
    if (surface === SURF.SNOW || surface === SURF.SLUSH || surface === SURF.SNOW_PACKED) wet = Math.min(1, wet + 0.1)
    else if (indoor && (surface === SURF.TILE || surface === SURF.LINOLEUM || surface === SURF.CONCRETE)) {
      if (r() < wet * 0.5) {
        const sq = bufferVoice(engine, 'step_wet_squeak', pick('step_wet_squeak'), { rate: r.range(0.9, 1.1), delay: r.range(0.04, 0.09), sync: true })
        playFoley(engine, sq, { gain: Math.pow(10, (levelDb - 6) / 20), pan: side * 0.07, send: 0.7 })
      }
      wet *= 0.85
    } else wet *= 0.97
    stepState.count++
    stepState.lastSurface = surface
    stepState.lastTime = engine.ctx.currentTime
  } catch (e) {
    if (!footstep._warned) { footstep._warned = true; console.error('[audio] footstep', e) }
  }
}

/** Install as the engine's footstep handler. */
export function installFootsteps(engine) {
  engine.setFootstep((eng, surface, info) => footstep(eng, surface, info))
}
