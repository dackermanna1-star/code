// Development scene, built only with ?phonetest=1: two plastered wall sections north of the
// spawn stop carrying a sample of every kind of text the package can draw.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { addNotice, addPoster, addGraffiti, addPriceTag, addPlate, addNoticeCluster, addText } from './api.js'

defineModel('phone_test_wall', () => {
  const m = new VoxelModel(48, 16, 2) // 12 × 4 × 0.5 m
  m.fill(0, 0, 0, 48, 16, 2, M('panel_gray'))
  m.fill(0, 0, 0, 48, 2, 2, M('concrete_dark'))
  for (let x = 0; x < 48; x += 12) m.fill(x, 0, 0, 1, 16, 2, M('panel_seam'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { maxDistance: 200 })

export function buildTestScene(ctx) {
  const { world, terrain } = ctx
  const cx = 248, cz = 505
  terrain.setHeightRect(cx - 14, cz - 2, cx + 14, cz + 8, 0.25, ctx.M('snow_packed'))
  world.place('phone_test_wall', { x: cx - 6, z: cz, y: 0.25 })
  world.place('phone_test_wall', { x: cx + 6, z: cz, y: 0.25 })
  const fz = cz + 0.25 // front face of the wall, facing south
  const y0 = 0.25
  // a row of notices at eye level
  addNotice(ctx, { x: cx - 5.2, y: y0 + 1.55, z: fz, id: 'notice_heating', seed: 1 })
  addNotice(ctx, { x: cx - 4.85, y: y0 + 1.5, z: fz, id: 'notice_lostdog', seed: 2, tornTabs: 'allButOne' })
  addNotice(ctx, { x: cx - 4.5, y: y0 + 1.55, z: fz, id: 'notice_sledge', seed: 3 })
  addNotice(ctx, { x: cx - 4.15, y: y0 + 1.5, z: fz, id: 'notice_garage', seed: 4 })
  addNotice(ctx, { x: cx - 3.8, y: y0 + 1.55, z: fz, id: 'notice_debtors', seed: 5 })
  addNotice(ctx, { x: cx - 3.45, y: y0 + 1.5, z: fz, id: 'notice_light5', seed: 6 })
  addNotice(ctx, { x: cx - 3.1, y: y0 + 1.55, z: fz, id: 'notice_kittens', seed: 7 })
  addNoticeCluster(ctx, { x: cx - 2.0, y: y0 + 1.45, z: fz, w: 0.95, h: 0.75, count: 4, seed: 11 })
  // posters
  addPoster(ctx, { x: cx - 0.6, y: y0 + 1.6, z: fz, id: 'ad_mobitel', seed: 1 })
  addPoster(ctx, { x: cx + 0.1, y: y0 + 1.6, z: fz, id: 'ad_pizza', seed: 2 })
  addPoster(ctx, { x: cx + 0.8, y: y0 + 1.6, z: fz, id: 'ad_credit', seed: 3 })
  addPoster(ctx, { x: cx + 1.5, y: y0 + 1.6, z: fz, id: 'ad_concert', seed: 4 })
  addPoster(ctx, { x: cx + 2.2, y: y0 + 1.6, z: fz, id: 'ad_luch', seed: 5 })
  addPoster(ctx, { x: cx + 2.75, y: y0 + 1.4, z: fz, id: 'ad_locks', seed: 6 })
  // graffiti
  addGraffiti(ctx, { x: cx - 4.0, y: y0 + 0.8, z: fz, id: 'gr_tsoi', seed: 1 })
  addGraffiti(ctx, { x: cx - 1.7, y: y0 + 0.75, z: fz, id: 'gr_lenasasha', seed: 2 })
  addGraffiti(ctx, { x: cx - 0.6, y: y0 + 0.75, z: fz, id: 'gr_tag_zubr', seed: 3, h: 0.4 })
  addGraffiti(ctx, { x: cx + 1.4, y: y0 + 0.62, z: fz, id: 'gr_locks_stencil', seed: 4 })
  addGraffiti(ctx, { x: cx - 2.7, y: y0 + 2.5, z: fz, id: 'gr_anarchy', seed: 5 })
  addGraffiti(ctx, { x: cx + 3.6, y: y0 + 2.7, z: fz, id: 'gr_dasha', seed: 6 })
  addGraffiti(ctx, { x: cx + 1.4, y: y0 + 1.0, z: fz, id: 'gr_vasya', seed: 7 })
  addGraffiti(ctx, { x: cx - 5.4, y: y0 + 0.75, z: fz, id: 'gr_nezabudu', seed: 8 })
  addGraffiti(ctx, { x: cx + 3.3, y: y0 + 0.62, z: fz, id: 'gr_masha', seed: 9 })
  // plates and signs
  addPlate(ctx, { x: cx - 4.2, y: y0 + 3.2, z: fz, id: 'street_house12k2', seed: 1 })
  addPlate(ctx, { x: cx - 2.0, y: y0 + 2.4, z: fz, id: 'street_entrance3', w: 0.5, h: 0.26, seed: 2 })
  addText(ctx, { x: cx + 1.0, y: y0 + 3.3, z: fz, id: 'metro_exit', seed: 3, emissive: 0.6 })
  addPlate(ctx, { x: cx + 4.4, y: y0 + 1.6, z: fz, id: 'street_danger', seed: 4 })
  addPlate(ctx, { x: cx + 4.9, y: y0 + 1.2, z: fz, id: 'shop_hours', seed: 5 })
  addPlate(ctx, { x: cx + 4.2, y: y0 + 1.05, z: fz, id: 'shop_base', seed: 6 })
  addText(ctx, { x: cx + 5.3, y: y0 + 1.75, z: fz, id: 'metro_rules', seed: 7, w: 0.5, h: 0.66 })
  // price tags in a row
  for (let i = 0; i < 4; i++) addPriceTag(ctx, { x: cx + 3.2 + i * 0.09, y: y0 + 1.0, z: fz, seed: 20 + i })
}
