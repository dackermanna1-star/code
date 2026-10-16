// Base layer: fills the world with deep snow and sets the spawn. District packages carve
// roads, sidewalks and courtyards on top of this.

export default {
  name: 'base',
  order: 10,
  build(ctx) {
    const { terrain, M, game } = ctx
    // deep untouched snow everywhere (y = 0.5); layouts lower roads to 0.0 and paths to 0.25
    terrain.setHeightRect(0, 0, 640, 640, 0.5, M('snow'))
    // gentle drifts in the open wrap bands so the whiteout has something to swallow
    const rng = ctx.rng(77)
    for (let i = 0; i < 90; i++) {
      const edge = rng.int(0, 3)
      const t = rng.float(0, 640)
      const d = rng.float(4, 34)
      const x = edge === 0 ? d : edge === 1 ? 640 - d : t
      const z = edge === 2 ? d : edge === 3 ? 640 - d : t
      terrain.mound(x, z, rng.float(3, 9), rng.float(2, 6), rng.float(0.25, 0.6), M('snow_fresh'), 0.4, i)
    }
    game.spawn = { x: 248, z: 515.5, yaw: 0 }
  },
}
