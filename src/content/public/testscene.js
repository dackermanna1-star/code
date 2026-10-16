// Private test lot for screenshots (only with ?pubtest=1 in the URL; never in the real game).
// Lays every public building out on flat packed snow around x 60..600, z 60..600.

export function buildTestScene(ctx, api) {
  const { terrain, M } = ctx
  terrain.setHeightRect(40, 40, 600, 600, 0.25, M('snow'))
  // shop at (320, 300), entrance facing north
  api.placeShop(ctx, { x: 320, z: 300, rot: 0, seed: 1 })
  terrain.setHeightRect(300, 280, 340, 293.5, 0.25, M('snow_packed'))
}
