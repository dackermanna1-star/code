// Baseline: draw calls in chapter 1 (for comparison with chapter 4).
import { boot } from './ch4_util.mjs';
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait, 0);
  const r = await evalg(() => {
    const g = window.game; const out = {};
    for (const [k, x, y, z, yaw] of [['roof', 15, 14.4, 12, 0.3], ['street', 19, 0.15, 22, -1.9], ['lobby', 12, 0, 17, -1.2]]) {
      g.player.teleport(x, y, z, yaw); g.advance(0.2, 1 / 30);
      g.renderer.render(0.016);
      const info = g.renderer.r.info; info.autoReset = false; info.reset(); g.renderer.render(0.016);
      out[k] = { calls: info.render.calls, tris: info.render.triangles }; info.autoReset = true;
    }
    out.meshes = g.level.meshes.length; out.objs = g.level.root.children.length;
    return out;
  });
  console.log(JSON.stringify(r));
};
