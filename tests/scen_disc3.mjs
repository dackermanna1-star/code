export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game; g.director.enabled = false; g.advance(0.2);
    const cam = g.renderer.camera || g.camera; const cp = cam.getWorldPosition(new cam.position.constructor());
    const near = [];
    g.renderer.scene.traverse((o) => {
      if (!(o.isMesh || o.isSprite || o.isPoints) || !o.visible) return;
      const p = o.getWorldPosition(new cp.constructor());
      o.geometry?.computeBoundingSphere?.();
      const rad = (o.geometry?.boundingSphere?.radius || 0) * o.getWorldScale(new cp.constructor()).x;
      if (p.distanceTo(cp) - rad < 1.0 && rad < 50) near.push({ o, d: +p.distanceTo(cp).toFixed(2), rad: +rad.toFixed(2), name: o.name, type: o.type, mat: o.material?.type + ':' + (o.material?.name || ''), parent: o.parent?.name });
    });
    window.__near = near.map((n) => n.o);
    return near.map(({ o, ...x }) => x);
  });
  console.log('NEAR', JSON.stringify(r));
  await evalg(() => { window.__near.forEach((o) => { o.visible = false; }); window.game.advance(0.1); });
  await wait(300); await shot('disc_nonear');
};
