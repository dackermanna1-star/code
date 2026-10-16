// Private test lot for screenshots (only with ?pubtest=1 in the URL; never in the real game).
// Lays every public building out on flat snow; ?pubonly=shop,kiosks,... limits the set:
//   shop (320,300) · kiosks row z 281 · pharmacy (345,300) · school (200,200) · kindergarten (420,200)
//   boiler house (200,420) · garages (300,420) · warehouse (430,440) · substation (360,360)
//   dispatcher booth (280,360) · hockey box (520,330)

export function buildTestScene(ctx, api) {
  const { terrain, M } = ctx
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pubonly') : null
  const want = name => !q || q.split(',').includes(name)
  terrain.setHeightRect(40, 40, 600, 600, 0.25, M('snow'))
  terrain.setHeightRect(280, 276, 360, 293.5, 0.25, M('snow_packed'))
  if (want('shop')) api.placeShop(ctx, { x: 320, z: 300, rot: 0, seed: 1 })
  if (want('kiosks')) api.KIOSK_TYPES.forEach((type, i) => api.placeKiosk(ctx, { x: 297 + i * 4, z: 281, rot: 0, type, seed: i + 1 }))
  if (want('pharmacy')) api.placePharmacy(ctx, { x: 345, z: 300, rot: 0, seed: 2 })
  if (want('school')) api.placeSchool(ctx, { x: 200, z: 200, rot: 0, seed: 3, number: 1048 })
  if (want('kindergarten')) api.placeKindergarten(ctx, { x: 420, z: 200, rot: 0, seed: 4 })
  if (want('boiler')) api.placeBoilerHouse(ctx, { x: 200, z: 420, rot: 0, seed: 5, pipes: [[215, 412], [240, 412], [240, 380]], arches: [[240, 395]] })
  if (want('garages')) api.placeGarageRow(ctx, { x: 300, z: 420, rot: 0, count: 10, seed: 6 })
  if (want('warehouse')) api.placeWarehouse(ctx, { x: 430, z: 440, rot: 0, seed: 7 })
  if (want('substation')) api.placeSubstation(ctx, { x: 360, z: 360, rot: 0, seed: 8 })
  if (want('dispatcher')) api.placeDispatcherBooth(ctx, { x: 280, z: 360, rot: 0, seed: 9 })
  if (want('hockey')) api.placeHockeyBox(ctx, { x: 520, z: 330, rot: 0, seed: 10 })
  // rotation checks (only when asked for explicitly)
  if (q && q.includes('shoprot')) api.placeShop(ctx, { x: 150, z: 300, rot: 1, seed: 11 })
  if (q && q.includes('kioskrot')) api.placeKiosk(ctx, { x: 150, z: 330, angle: 0.4, type: 'flowers', seed: 12 })
}
