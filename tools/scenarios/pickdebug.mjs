// What is under these screen points? (env VIEW=freezer, PTS="500,250;300,300")
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  const view = process.env.VIEW ?? 'freezer';
  await g((v) => window.game.goTo(v), view);
  await t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
  await t.wait(1500);
  const pts = (process.env.PTS ?? '500,250;500,350;300,300').split(';').map((p) => p.split(',').map(Number));
  const res = await g(async (pts) => {
    const G = window.game;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const rc = new THREE.Raycaster();
    const r = G.renderer.domElement.getBoundingClientRect();
    return pts.map(([x, y]) => {
      rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), G.camera.camera);
      const hits = rc.intersectObject(G.scene, true).filter((h) => h.object.visible).slice(0, 4);
      return [x, y, hits.map((h) => {
        const path = []; let o = h.object; while (o && path.length < 5) { path.push(o.name || o.type); o = o.parent; }
        const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
        return `${path.join('<')} d=${h.distance.toFixed(2)} col=#${m.color?.getHexString?.()} op=${m.opacity} tr=${m.transparent} p=${h.point.toArray().map((v) => v.toFixed(2))}`;
      })];
    });
  }, pts);
  for (const r of res) console.log(r[0], r[1], '\n   ' + r[2].join('\n   '));
  await t.shot('pick-' + view);
}
