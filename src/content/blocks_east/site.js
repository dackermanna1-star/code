// Block C's abandoned construction site («долгострой»): a corrugated fence round a dug pit that
// has stood since 2006, a strip foundation with rusty rebar, dumped foundation blocks, concrete
// rings, a site trailer with a cracked window, the object passport promising completion in 2007,
// and a gate left open so the kids get in. Weeds, a crow or two, a bag in the birch.

import { placeFence } from '../street/api.js'
import { scatterWeeds, placeTree, addBag, addCrows } from '../nature/api.js'
import { placeStory } from '../life/api.js'
import { addGraffiti, addNotice } from '../phone/api.js'
import { drawText, PLAIN_FONT, SIGN_FONT } from '../../render/Signs.js'
import { SITE } from './geo.js'
import { safe, keep } from './lib.js'

const PASSPORT = {
  ru: 'ПАСПОРТ ОБЪЕКТА\nСтроительство 17-этажного жилого дома\nпо адресу: 3-й Молодёжный пр., вл. 7\nЗаказчик: ООО «СтройИнвестГрупп»\nГенподрядчик: ЗАО «СМУ-14»\nНачало работ: апрель 2006 г.\nОкончание работ: IV кв. 2007 г.\nПрораб: Курбанов Р. А., тел. 8-495-...\nПриносим извинения за временные неудобства.',
  en: 'SITE PASSPORT\nConstruction of a 17-storey residential building\nat: 3rd Molodyozhny Lane, plot 7\nClient: StroyInvestGroup LLC\nGeneral contractor: SMU-14 CJSC\nWork started: April 2006\nCompletion: Q4 2007\nSite manager: R. A. Kurbanov, tel. 8-495-...\nWe apologise for the temporary inconvenience.',
}

export function buildSite(ctx) {
  const { x0, z0, x1, z1 } = SITE.fence
  const [g0, g1] = SITE.gate
  const { world, signs, interactions } = ctx

  // ---- the fence, open at the gate on the west side -----------------------------------------
  safe('site fence', () => {
    placeFence(ctx, { points: [[x0, g1], [x0, z1], [x1, z1], [x1, z0], [x0, z0], [x0, g0]], type: 'construction', seed: 141, sign: false })
    // one leaf of the gate dragged open and frozen into the snow
    placeFence(ctx, { points: [[x0 - 0.2, g0], [x0 - 2.4, g0 + 1.4]], type: 'construction', seed: 142, sign: false })
    keep(x0, z0, x1, z1, 1.2, 'site')
  })
  // the warning plate and graffiti on the outside of the west fence
  safe('site signs', () => {
    if (!signs) return
    const fy = ctx.terrain.heightAt(x0 - 1, 225)
    signs.add({ x: x0 - 0.15, y: fy + 1.45, z: 226, angle: -Math.PI / 2, w: 1.1, h: 0.45, ppm: 96, aged: 0.45, seed: 5,
      draw: (c, W, H) => drawText(c, W, H, { lines: ['ВЕДУТСЯ', 'СТРОИТЕЛЬНЫЕ РАБОТЫ'], bg: '#e8e2c8', color: '#a8261e', border: '#a8261e', font: SIGN_FONT }) })
    addGraffiti(ctx, { x: x0 - 0.15, y: fy + 1.1, z: 254, angle: -Math.PI / 2, id: 'gr_koni', h: 0.5 })
    addGraffiti(ctx, { x: x0 - 0.15, y: fy + 0.9, z: 218.5, angle: -Math.PI / 2, kind: 'graffiti', seed: 143, look: 'tag' })
    addNotice(ctx, { x: x0 - 0.15, y: fy + 1.5, z: 231.4, angle: -Math.PI / 2, kind: 'notice', sub: 'tearoff', seed: 144 })
  })

  // ---- the object passport board by the gate --------------------------------------------------
  safe('passport', () => {
    const px = x0 - 2.6, pz = g0 - 7.5
    const p = world.place('be_passport', { x: px, z: pz, angle: Math.PI / 2, tag: 'sign' }) // board faces west
    if (!p || !signs) return
    signs.add({ x: px - 0.02, y: p.y + 1.62, z: pz, angle: -Math.PI / 2, w: 2.2, h: 1.2, ppm: 110, aged: 0.6, seed: 9,
      draw: (c, W, H) => {
        c.fillStyle = '#e7e3d4'; c.fillRect(0, 0, W, H)
        c.fillStyle = '#1d3a66'; c.fillRect(0, 0, W, H * 0.16)
        drawText(c, W, H * 0.16, { lines: ['ПАСПОРТ ОБЪЕКТА'], color: '#efe9d6', font: SIGN_FONT })
        c.save(); c.translate(0, H * 0.18)
        drawText(c, W, H * 0.8, {
          lines: ['Строительство 17-этажного жилого дома', '3-й Молодёжный пр., вл. 7', 'Заказчик: ООО «СтройИнвестГрупп»', 'Генподрядчик: ЗАО «СМУ-14»', 'Начало работ: апрель 2006 г.', 'Окончание работ: IV кв. 2007 г.', 'Прораб: Курбанов Р. А.'],
          color: '#1c2440', font: PLAIN_FONT, align: 'left', pad: 10,
        })
        c.restore()
      } })
    interactions?.add({ x: px - 0.4, y: p.y + 1.6, z: pz, size: [0.6, 1.4, 2.4], reach: 2.6, tag: 'notice', prompt: { ru: 'Читать', en: 'Read' },
      onUse(game) { game.ui.showNote({ ru: PASSPORT.ru, en: PASSPORT.en, style: 'sign' }) } })
    keep(px - 1, pz - 1.6, px + 1, pz + 1.6, 0.4)
  })

  // ---- inside: the pit and what was left ---------------------------------------------------------
  safe('site props', () => {
    const P = SITE.pit
    const fy = SITE.floorY
    // strip foundation sections on the pit floor (two runs at a right angle)
    for (let i = 0; i < 3; i++) world.place('be_foundation', { x: P.x0 + 9 + i * 6.05, z: P.z0 + 9.5, y: fy, rot: 0, tag: 'site' })
    for (let i = 0; i < 2; i++) world.place('be_foundation', { x: P.x0 + 6.6, z: P.z0 + 13.5 + i * 6.05, y: fy, rot: 1, tag: 'site' })
    // loose foundation blocks on the floor, one tipped
    world.place('be_fbs', { x: P.x1 - 9, z: P.z1 - 9.5, y: fy, angle: 0.35, tag: 'site' })
    world.place('be_fbs', { x: P.x1 - 7.5, z: P.z1 - 7.2, y: fy, angle: 1.4, tag: 'site' })
    // up on the rim inside the fence: the trailer, a heap of blocks, concrete rings
    const y0 = 0.5
    const bx = (P.x1 + x1) / 2 + 0.5                                                        // on the east rim
    world.place('be_bytovka', { x: bx, z: 228, y: y0 - 0.05, rot: 1, tag: 'site' })        // door faces west, toward the pit
    world.place('be_fbs_pile', { x: x0 + 5.2, z: 262.5, y: y0 - 0.1, rot: 1, tag: 'site' })
    world.place('be_rings', { x: x0 + 30, z: 264.0, y: y0 - 0.15, rot: 0, tag: 'site' })
    world.place('be_fbs', { x: x0 + 15, z: 218.2, y: y0 - 0.1, rot: 0, tag: 'site' })
    // the trailer's notice and a scratched "закрыто"
    addNotice(ctx, { x: bx - 1.26, y: y0 + 1.5, z: 227.6, angle: -Math.PI / 2, id: 'notice_door', aged: 0.85 })
  })

  // ---- weeds, a self-seeded maple, a birch with a bag, crows ------------------------------------
  const P0 = SITE.pit
  safe('site nature', () => {
    scatterWeeds(ctx, { rect: [x0 + 0.8, z0 + 0.8, x1 - 0.8, SITE.pit.z0 - 0.6], count: 10, kinds: { burdock: 0.4, tansy: 0.3, grass: 0.3 }, seed: 151 })
    scatterWeeds(ctx, { rect: [x0 + 0.8, SITE.pit.z1 + 0.6, x1 - 0.8, z1 - 0.8], count: 8, kinds: { burdock: 0.4, tansy: 0.3, grass: 0.3 }, seed: 152 })
    scatterWeeds(ctx, { rect: [x0 - 3, z0, x0 - 0.6, z1], count: 6, kinds: { grass: 0.6, burdock: 0.4 }, avoid: (x, z) => z > g0 - 2 && z < g1 + 2, seed: 153 })
    placeTree(ctx, { x: x1 - 3.5, z: 263, species: 'maple:negundo', rot: 1, seed: 154 })
    placeTree(ctx, { x: x0 + 4.5, z: 218.5, species: 'maple:negundo', rot: 2, seed: 155 })
    const birch = placeTree(ctx, { x: x0 - 9, z: 264, species: 'birch:single', size: 'medium', rot: 3, seed: 156 })
    if (birch) addBag(ctx, { tree: birch, seed: 157 })
    addCrows(ctx, { perch: 'ground', x: (P0.x0 + P0.x1) / 2 + 8, z: 247, y: SITE.floorY, count: 3, seed: 158 })
  })

  // ---- the lost glove on a lone post by the gate ---------------------------------------------
  safe('site glove', () => {
    const px = x0 - 1.0, pz = g0 - 1.4
    const p = world.place('be_post', { x: px, z: pz, tag: 'site' })
    if (p) placeStory(ctx, 'glove', { x: px, z: pz, y: p.y + 1.0, seed: 159 })
  })
}
