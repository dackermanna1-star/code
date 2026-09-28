// Black-disc bisect: list every visible renderable near the camera + black fraction, then hide candidates.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const near = await evalg(() => {
    const g = window.game; g.director.enabled = false; g.player.flashlight = true; g.player.pitch = -1.1; g.advance(0.3); g.player.pitch = -1.1; g.advance(0.05);
    const cam = g.renderer.camera || g.camera; const cp = cam.getWorldPosition(new cam.position.constructor());
    const out = []; const V = cam.position.constructor;
    const sc = g.renderer.scene || g.scene;
    sc.traverseVisible((o) => {
      if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      let r = 0; const c = new V();
      if (o.geometry) { o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere; if (s) { c.copy(s.center).applyMatrix4(o.matrixWorld); r = s.radius * o.getWorldScale(new V()).length() / 1.732; } } else o.getWorldPosition(c);
      const d = c.distanceTo(cp) - r;
      if (d < 2.5) { let p = o, path = []; while (p && path.length < 5) { path.push(p.name || p.type); p = p.parent; } out.push({ path: path.join('<'), d: +d.toFixed(2), r: +r.toFixed(2), layers: o.layers.mask, mat: o.material?.type, col: o.material?.color?.getHexString?.(), cw: o.material?.colorWrite, dw: o.material?.depthWrite, tr: o.material?.transparent, op: o.material?.opacity, side: o.material?.side, fc: o.frustumCulled }); }
    });
    return { cp: cp.toArray().map((x) => +x.toFixed(2)), camLayers: cam.layers.mask, near: out.slice(0, 60) };
  });
  console.log(JSON.stringify(near, null, 0));
};
