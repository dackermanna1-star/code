export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(500);
  await g(() => window.game.goTo('plate'));
  await t.wait(2500);
  console.log(await g(() => { const G = window.game; const c = G.camera.camera; const p = G.stations.plate.center(); const q = p.clone().project(c); const r = G.renderer.domElement.getBoundingClientRect(); return JSON.stringify({ cam: c.position.toArray().map((v) => +v.toFixed(2)), aspect: c.aspect, fov: c.fov, view: G.camera.view, rect: [r.left, r.top, r.width, r.height], plate: p.toArray().map((v) => +v.toFixed(2)), ndc: q.toArray().map((v) => +v.toFixed(2)), win: [innerWidth, innerHeight] }); }));
}
