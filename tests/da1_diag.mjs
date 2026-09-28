// Dead Air ch1: triangle/draw breakdown + frame timings (low quality).
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    const by = new Map();
    let total = 0, meshes = 0;
    L.root.traverse((o) => {
      if (!(o.isMesh || o.isPoints)) return;
      meshes++;
      const geo = o.geometry;
      let t = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      if (geo.isInstancedBufferGeometry) t *= geo.instanceCount;
      const k = (o.name || o.parent?.name || '?').slice(0, 30) + ' | ' + (o.material?.name || o.material?.type);
      by.set(k, (by.get(k) || 0) + t);
      total += t;
    });
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${Math.round(v)}  ${k}`);
    let sceneTris = 0; g.scene.traverse((o) => { if (o.isMesh && o.visible) { const geo = o.geometry; sceneTris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; } });
    const t0 = performance.now(); g.renderer.render(0.016); const t1 = performance.now();
    g.advance(1); const t2 = performance.now();
    return [`level meshes ${meshes} tris ${Math.round(total)} sceneTris ${Math.round(sceneTris)} render ${Math.round(t1 - t0)}ms advance1s ${Math.round(t2 - t1)}ms`, ...top];
  });
  console.log((r || []).join('\n'));
};
