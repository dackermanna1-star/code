// Buildings of the eastern blocks: the residential sections (towers, the 9-storeys, the
// 5-storey) and the public buildings (kindergarten, hockey box, shop, substation, brick garages),
// plus everything that dresses their entrances (notices, benches, lilac, story props).

import { placeResidential } from '../residential/api.js'
import { placeKindergarten, placeHockeyBox, placeShop, placeSubstation, placeGarageRow } from '../public/api.js'
import { placeBench, placeLitterBin, placePayphone, placeMailbox } from '../street/api.js'
import { placeBush } from '../nature/api.js'
import { addNoticeCluster, addNotice, addPoster, addGraffiti } from '../phone/api.js'
import { placeStory, placeStoryAtEntrance } from '../life/api.js'
import { SIGN_FONT } from '../../render/Signs.js'
import { BUILDINGS, PUBLIC } from './geo.js'
import { safe, keep, rngFor } from './lib.js'

/** Place every building. Returns { res: {key: building}, kg, hockey, shop, substation, garages }. */
export function placeBuildings(ctx) {
  const out = { res: {} }
  for (const [key, spec] of Object.entries(BUILDINGS)) {
    const b = safe(`residential ${key}`, () => placeResidential(ctx, { ...spec, y: 0.25 }))
    if (!b) continue
    out.res[key] = b
    const bb = b.bounds
    // facades: nothing taller than a bench within ~4 m (tree crowns spread 4–7 m)
    keep(bb.minX, bb.minZ, bb.maxX, bb.maxZ, 3.5, 'building')
  }
  out.kg = safe('kindergarten', () => placeKindergarten(ctx, { ...PUBLIC.kindergarten, y: 0.25 }))
  out.hockey = safe('hockey box', () => placeHockeyBox(ctx, { ...PUBLIC.hockey, y: 0.25 }))
  out.shop = safe('shop', () => placeShop(ctx, { ...PUBLIC.shop, y: 0.25 }))
  out.substation = safe('substation', () => placeSubstation(ctx, { ...PUBLIC.substation, y: 0.25 }))
  out.garages = safe('garage row', () => placeGarageRow(ctx, { ...PUBLIC.garages, y: 0 }))
  keep(470, 150, 592, 158.6, 0.5, 'garages')
  return out
}

// fixed notices that make a building feel inhabited (ids from the phone package library)
const FIXED = [
  ['notice_heating'], ['notice_meeting'], ['notice_lift'], ['notice_door'], ['notice_vigilance'],
  ['notice_debtors'], ['notice_intercom'], ['notice_phones'], ['notice_roofsnow'], ['notice_snowclearing'],
]

/** Notices, a bench and the odd bush at every entrance of every residential building. */
export function dressEntrances(ctx, out) {
  let n = 0
  for (const [key, b] of Object.entries(out.res)) {
    const rng = rngFor(b.entrances.length * 977 + key.length * 31 + (key.charCodeAt(1) | 0))
    for (const e of b.entrances) {
      n++
      const seed = 4100 + n * 37
      // the notice cluster on the wall beside the door
      safe('notices', () => {
        const s = e.noticeSpot
        const include = rng.chance(0.55) ? FIXED[(n * 7 + 3) % FIXED.length] : undefined
        addNoticeCluster(ctx, { x: s.x, y: s.y, z: s.z, angle: s.angle, w: 0.62, h: 0.55, count: rng.int(2, 3), seed, include, kinds: rng.chance(0.3) ? ['notice', 'ad'] : ['notice'] })
      })
      const a = e.angle
      const ax = Math.cos(a), az = -Math.sin(a)      // along the facade
      const fx = Math.sin(a), fz = Math.cos(a)       // out of the building
      // which side of the door the notice spot is on: put the bench on the other side
      const ns = e.noticeSpot ? Math.sign((e.noticeSpot.x - e.x) * ax + (e.noticeSpot.z - e.z) * az) || 1 : 1
      const side = -ns
      if (rng.chance(0.75)) {
        safe('entrance bench', () => {
          const s = 3.35 * side, o = 1.25
          placeBench(ctx, { x: e.x + ax * s + fx * o, z: e.z + az * s + fz * o, angle: a, type: 'entrance', seed: seed + 1, snow: rng.chance(0.25) ? 'brushed' : 'snow' })
        })
      }
      if (rng.chance(0.45)) {
        safe('lilac', () => {
          const s = (5.6 + rng.float(0, 1.5)) * (rng.chance(0.5) ? side : -side), o = 2.3
          placeBush(ctx, { x: e.x + ax * s + fx * o, z: e.z + az * s + fz * o, kind: rng.chance(0.75) ? 'lilac' : 'snowberry', seed: seed + 2 })
        })
      }
    }
  }
}

/** Story props at chosen entrances (sparingly: each should feel found, not placed). */
export function entranceStories(ctx, out) {
  const R = out.res
  const at = (key, i, kind, opts = {}) => safe(`story ${kind}`, () => {
    const e = R[key]?.entrances?.[i]
    if (e) placeStoryAtEntrance(ctx, e, kind, opts)
  })
  at('bt1', 0, 'sled', { seed: 11 })          // tower B1: someone is already home
  at('b9', 2, 'butts', { seed: 12 })
  at('b9', 4, 'cat', { seed: 13, note: true, along: 6.5, side: 1 })
  at('et2', 0, 'key', { seed: 14 })           // dropped intercom fob right outside the enterable tower
  at('et3', 0, 'butts', { seed: 15 })
  at('c9', 3, 'butts', { seed: 18 })
  at('c5', 1, 'cat', { seed: 19, along: 6.0 })
  at('c5', 2, 'bicycle', { seed: 20, along: 4.2, out: 1.6 })
  // the one dog-lost notice with a single tab left, on the long building
  safe('lostdog', () => {
    const s = R.c9?.entrances?.[2]?.noticeSpot
    if (s) addNotice(ctx, { x: s.x + Math.cos(s.angle) * -0.75, y: s.y - 0.1, z: s.z - Math.sin(s.angle) * -0.75, angle: s.angle, id: 'notice_lostdog', tornTabs: 'allButOne' })
  })
}

/** Small things around the public buildings. */
export function dressPublic(ctx, out) {
  // shop: a bench on the forecourt facing the courtyard with a loaf someone forgot, a litter urn,
  // flyers on the shop's north end wall
  safe('shop bench', () => {
    const bench = placeBench(ctx, { x: 414.5, z: 465.2, angle: -Math.PI / 2, type: 'courtyard', seed: 71, snow: 'brushed' })
    if (bench) placeStory(ctx, 'bread', { bench: { ...bench, angle: -Math.PI / 2 }, seed: 72, benchSnow: 0, along: 0.05 })
    placeLitterBin(ctx, { x: 417.6, z: 480.2, angle: -Math.PI / 2, type: 'concrete' })
  })
  // the roof letters «ПРОДУКТЫ», facing west across the vast yard toward Block D (they are what
  // you see first from the far side of the courtyard: red, lit from dusk)
  safe('shop roof sign', () => {
    const { x: sx, z: sz } = PUBLIC.shop
    const fx = sx - 3.25, roofY = 0.25 + 3.75                    // 1.75 m behind the west facade
    ctx.world.place('be_roof_sign', { x: fx, z: sz - 0.5, y: roofY, rot: 1, tag: 'sign', userData: { pkg: 'blocks_east', kind: 'roof_sign' } })
    ctx.signs?.add({
      x: fx - 0.27, y: roofY + 1.15, z: sz - 0.5, angle: -Math.PI / 2, w: 8.6, h: 1.25, ppm: 40,
      emissive: 1.35, schedule: 'street', seed: 77,
      draw: (c, W, H) => {
        c.clearRect(0, 0, W, H)
        // individual box letters: a darker red return round each glyph, the lit face on top
        c.font = `bold ${Math.round(H * 0.92)}px ${SIGN_FONT}`
        c.textAlign = 'center'; c.textBaseline = 'middle'
        const text = 'ПРОДУКТЫ'
        let fw = c.measureText(text).width
        const sx2 = Math.min(1, (W * 0.96) / fw)
        c.save(); c.translate(W / 2, H / 2 + H * 0.03); c.scale(sx2, 1)
        c.fillStyle = '#5a1410'; c.fillText(text, 2, 2)
        c.fillStyle = '#c8281e'; c.fillText(text, 0, 0)
        c.restore()
        // one letter (the «Д») half dead: a darker band across it
        c.save(); c.globalCompositeOperation = 'source-atop'
        c.fillStyle = 'rgba(40,10,8,0.55)'; c.fillRect(W * 0.4, H * 0.45, W * 0.1, H * 0.55)
        c.restore()
      },
    })
  })
  // a payphone on the forecourt by the shop's north corner (its front toward the yard) and a
  // blue «ПОЧТА» box on the north end wall
  safe('shop payphone', () => {
    placePayphone(ctx, { x: 416.2, z: 461.4, angle: -Math.PI / 2, seed: 81 })
    placeMailbox(ctx, { x: 421.3, z: 462.99, angle: Math.PI, wall: true, y: 0.25 + 1.05 })
    keep(415, 460.2, 417.4, 462.6, 0.6, 'payphone')
  })
  safe('shop flyers', () => {
    addPoster(ctx, { x: 425.6, y: 1.75, z: 462.99, angle: Math.PI, kind: 'ad', seed: 21, fade: 0.45 })
    addNoticeCluster(ctx, { x: 423.4, y: 1.55, z: 462.99, angle: Math.PI, w: 0.7, h: 0.6, count: 3, seed: 22, kinds: ['notice', 'ad'], subs: ['tearoff'] })
    addGraffiti(ctx, { x: 428.6, y: 0.95, z: 462.99, angle: Math.PI, kind: 'graffiti', seed: 23, h: 0.36 })
  })
  // substation (y 0.25, walls at x 324.75–329.25, z 483–489; doors face east)
  safe('substation dressing', () => {
    addGraffiti(ctx, { x: 327, y: 1.55, z: 482.99, angle: Math.PI, id: 'gr_tsoi' })
    addGraffiti(ctx, { x: 324.74, y: 1.35, z: 486.8, angle: -Math.PI / 2, kind: 'graffiti', seed: 31, look: 'tag' })
    addNotice(ctx, { x: 328.65, y: 1.75, z: 489.01, angle: 0, kind: 'notice', sub: 'tearoff', seed: 32 })
  })
  // brick garages: tags low on a few closed doors (door faces at z ≈ 158.0, facing south)
  safe('garage graffiti', () => {
    const g = out.garages
    if (!g) return
    const P = PUBLIC.garages, W = P.count * 3.25
    const ids = ['gr_spartak', 'gr_tag_dems', 'gr_kish', 'gr_tag_zubr']
    ;[5, 12, 19, 27].forEach((i, k) => {
      if (i === g.open || i >= P.count) return
      const x = P.x + W / 2 - (i + 0.5) * 3.25
      addGraffiti(ctx, { x: x + 0.1, y: 1.0, z: 158.02, angle: 0, id: ids[k], h: 0.4 })
    })
  })
  // kindergarten: a snowman the children built in the yard today
  safe('kg snowman', () => placeStory(ctx, 'snowman', { x: 397.5, z: 268.5, angle: Math.PI * 0.85, seed: 41 }))
}
