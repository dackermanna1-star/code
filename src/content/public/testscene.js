// Private test lot for screenshots (only with ?pubtest=1 in the URL; never in the real game).
// Lays every public building out on flat snow.

export function buildTestScene(ctx, api) {
  const { terrain, M } = ctx
  terrain.setHeightRect(40, 40, 600, 600, 0.25, M('snow'))
  // shop at (320, 300), entrance facing north; packed-snow sidewalk in front
  terrain.setHeightRect(280, 276, 360, 293.5, 0.25, M('snow_packed'))
  api.placeShop(ctx, { x: 320, z: 300, rot: 0, seed: 1 })
  // a row of kiosks across the sidewalk, facing north
  api.KIOSK_TYPES.forEach((type, i) => api.placeKiosk(ctx, { x: 297 + i * 4, z: 281, rot: 0, type, seed: i + 1 }))
  api.placePharmacy(ctx, { x: 345, z: 300, rot: 0, seed: 2 })
  api.placeSchool(ctx, { x: 200, z: 200, rot: 0, seed: 3, number: 1048 })
}
