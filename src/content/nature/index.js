import './trees.js'
import { showcase } from './showcase.js'
export default {
  name: 'nature', order: 28,
  build(ctx) { if (ctx.game.params?.naturetest) showcase(ctx) },
  init() {}, update() {},
}
