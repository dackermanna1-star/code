// Model registry for the residential package (definitions are cheap closures; geometry is built
// lazily only for models that are actually placed).

import './materials.js'
import { defineModel, hasModel } from '../../core/models.js'
import { SERIES } from './series.js'
import { buildSection } from './section.js'
import { buildPorch, buildEntranceDoor, buildInnerDoor, buildLampEntrance, buildLampCeiling, buildLiftCab, buildLiftLeaf } from './props.js'

export const VARIANTS = ['a', 'b', 'c']
export const MODES = ['plain', 'ent', 'loop']

/** Model name of a section: res_<series>_<floors>_<variant>[_ent|_loop]. */
export function sectionModelName(series, floors, variant = 'a', mode = 'plain') {
  return `res_${series}_${floors}_${variant}${mode === 'plain' ? '' : '_' + mode}`
}

const SECTION_OPTS = { lods: [1, 2, 4], lodDistances: [75, 190], maxDistance: 1400, occludesSnow: true }

/** Define a section model (idempotent). Used at import for the standard set and on demand. */
export function ensureSectionModel(series, floors, variant = 'a', mode = 'plain') {
  const name = sectionModelName(series, floors, variant, mode)
  if (hasModel(name)) return name
  const vi = Math.max(0, VARIANTS.indexOf(variant))
  defineModel(name, () => buildSection(series, floors, vi, mode), SECTION_OPTS)
  return name
}

// standard set ('loop' models of the optional endless stairwell are defined on demand)
for (const S of Object.values(SERIES))
  for (const f of S.floors)
    for (const v of VARIANTS)
      for (const mode of ['plain', 'ent']) ensureSectionModel(S.key, f, v, mode)

for (let v = 0; v < 3; v++) defineModel(`res_porch_${VARIANTS[v]}`, () => buildPorch(v), { lods: [1, 2], maxDistance: 260, occludesSnow: true })
defineModel('res_door_entrance', buildEntranceDoor, { lods: [1], maxDistance: 160, dynamic: true, contact: false })
defineModel('res_door_inner', buildInnerDoor, { lods: [1], maxDistance: 60, contact: false })
defineModel('res_lamp_entrance', buildLampEntrance, { lods: [1], maxDistance: 400, collide: false, contact: false })
defineModel('res_lamp_ceiling', buildLampCeiling, { lods: [1], maxDistance: 120, collide: false, contact: false, indoor: true })
defineModel('res_lift_cab', buildLiftCab, { lods: [1], maxDistance: 80, dynamic: true, indoor: true, contact: false })
defineModel('res_lift_leaf', buildLiftLeaf, { lods: [1], maxDistance: 80, contact: false, indoor: true })
