// Small traces of other lives along the avenue: notices on every entrance of the 9-storey row,
// graffiti on plinths and kiosk backs, a huge faded ad on a gable, the discarded ticket at the spawn
// stop, a frozen bag on the south stop's bench, keys by the payphone, a cat in a plinth vent, a sled
// and a chained bicycle, cigarette ends, a glove on a post, the bus driver smoking at the terminal.

import { addNotice, addNoticeCluster, addPoster, addGraffiti } from '../phone/api.js'
import { placeStory, placeStoryAtEntrance, placePerson } from '../life/api.js'
import { addCrows } from '../nature/api.js'
import { STOP_N, STOP_S, ROW_Z, safe } from './layout.js'

export function placeDetails(ctx, ctxOut) {
  const blds = ctxOut.row || []

  // ---- notices on every entrance (beside the door, left of it) ----------------------------------
  let k = 0
  for (const b of blds) {
    for (const e of b.entrances || []) {
      const ns = e.noticeSpot
      if (!ns) continue
      k++
      safe('entrance notices', () => addNoticeCluster(ctx, {
        x: ns.x, y: ns.y - 0.05, z: ns.z, angle: ns.angle, w: 0.62, h: 0.62, count: 2 + (k % 3), seed: 700 + k * 13,
        kinds: k % 4 === 0 ? ['notice', 'ad'] : ['notice'],
        include: k === 2 ? ['notice_heating'] : k === 5 ? ['notice_snowclearing'] : k === 7 ? ['notice_lift'] : undefined,
      }))
    }
  }
  // the lost-dog notice with a single tab left, on the side entrance of д. 29
  safe('lost dog', () => {
    const e = blds[1]?.entrances?.[2]
    if (e?.noticeSpot) {
      const ns = e.noticeSpot
      const ax = Math.cos(ns.angle), az = -Math.sin(ns.angle) // along the wall
      addNotice(ctx, { x: ns.x - ax * 0.55, y: ns.y - 0.35, z: ns.z - az * 0.55, angle: ns.angle, id: 'notice_lostdog', tornTabs: 'allButOne', seed: 5 })
    }
  })

  // ---- graffiti -----------------------------------------------------------------------------------
  safe('graffiti', () => {
    // back plinths of the row, facing the avenue (body back face at z = ROW_Z − 12)
    const zb = ROW_Z - 12 - 0.02
    addGraffiti(ctx, { x: 101.5, y: 0.95, z: zb, angle: Math.PI, id: 'gr_tsoi', h: 0.42 })
    addGraffiti(ctx, { x: 232.5, y: 0.85, z: zb, angle: Math.PI, id: 'gr_spartak', h: 0.4 })
    addGraffiti(ctx, { x: 334.0, y: 0.9, z: zb, angle: Math.PI, id: 'gr_tag_dems' })
    addGraffiti(ctx, { x: 190.5, y: 1.05, z: zb, angle: Math.PI, id: 'gr_lenasasha' })
    // backs of the kiosks (south faces)
    addGraffiti(ctx, { x: 408.8, y: 1.3, z: 577.8, angle: 0, id: 'gr_kish', h: 0.35 })
    addGraffiti(ctx, { x: 423.4, y: 1.0, z: 577.8, angle: 0, id: 'gr_tag_zubr' })
    // the portable toilet at the terminal
    addGraffiti(ctx, { x: 544.75, y: 1.5, z: 586.0, angle: -Math.PI / 2, id: 'gr_vasya', look: 'marker', h: 0.12, readable: true })
  })

  // ---- a huge, faded advert painted on the east gable of д. 31, seen from the underpass exit -----
  safe('gable ad', () => addPoster(ctx, { x: 362.06, y: 13.5, z: 588, angle: Math.PI / 2, id: 'ad_megalink', w: 6.4, h: 8.96, fade: 0.55, aged: 0.6, seed: 31 }))

  // ---- story props ------------------------------------------------------------------------------
  safe('spawn ticket', () => placeStory(ctx, 'ticket', { x: STOP_N.x + 1.4, z: STOP_N.z + 1.75, angle: 0.7, seed: 3 }))
  safe('frozen bag', () => {
    // on the south stop's bench (under the roof, so no snow: seat top at ground + 0.5)
    const gy = ctx.terrain.heightAt(STOP_S.x, STOP_S.z)
    placeStory(ctx, 'frozen_bag', { x: STOP_S.x + 0.9, z: STOP_S.z + 0.42, y: gy + 0.5, angle: 2.6, seed: 4 })
  })
  safe('keys', () => placeStory(ctx, 'key', { x: 242.7, z: 511.0, angle: 0.4, seed: 7 }))
  safe('butts kiosk', () => placeStory(ctx, 'butts', { x: 433.2, z: 577.5, angle: 0.3, seed: 8 }))
  safe('butts booth', () => placeStory(ctx, 'butts', { x: 543.2, z: 582.9, angle: -1.2, seed: 9 }))
  safe('glove', () => placeStory(ctx, 'glove', { x: 541.2, z: 572.9, seed: 10 }))
  const ents = blds.flatMap(b => b.entrances || [])
  safe('row stories', () => {
    if (ents[1]) placeStoryAtEntrance(ctx, ents[1], 'sled', { side: 1, seed: 11 })
    if (ents[2]) placeStoryAtEntrance(ctx, ents[2], 'cat', { side: -1, along: 6.2, seed: 12 })
    if (ents[5]) placeStoryAtEntrance(ctx, ents[5], 'butts', { side: 1, seed: 13 })
    if (ents[6]) placeStoryAtEntrance(ctx, ents[6], 'cat', { side: 1, along: 7.4, seed: 14, note: true })
    if (ents[9]) placeStoryAtEntrance(ctx, ents[9], 'bicycle', { side: -1, along: 3.4, out: 0.7, seed: 15 })
  })

  // ---- the bus driver having a smoke by the nose of his LiAZ ---------------------------------------
  safe('driver', () => placePerson(ctx, 'man_jacket', { x: 586.8, z: 572.4, angle: -2.36, frame: 'stand', tint: 0x2a2a2e }))

  // ---- crows in the yard tree behind the kiosks -----------------------------------------------------
  safe('crows yard', () => {
    const tree = (ctxOut.treesS || []).find(t => Math.abs(t.x - 404) < 1.5 && Math.abs(t.z - 586.5) < 1.5)
    if (tree) addCrows(ctx, { perch: 'tree', tree, count: 3, seed: 77 })
  })
}
