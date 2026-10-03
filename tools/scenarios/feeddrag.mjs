export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(500);
  await g(() => window.game.goTo('plate'));
  await t.wait(1800);
  await g(() => { const G = window.game; const it = G.items.spawn(window.__mk('donut'), G.stations.plate.center().clone().setY(1.2)); G.interaction.toStation(it, G.stations.plate); });
  await t.wait(1500);
  for (let k = 0; k < 40; k++) { if (!(await g(() => window.game.camera.moving))) break; await t.wait(250); }
  await t.wait(400);
  const from = await t.screenOf('game.stations.plate.contents[0].position.clone().add({x:0,y:0.03,z:0,isVector3:true})');
  const to = await t.screenOf('game.character.mouthWorld()');
  await t.page.mouse.move(from.x, from.y); await t.page.mouse.down();
  for (let i = 1; i <= 20; i++) { await t.page.mouse.move(from.x + (to.x - from.x) * i / 20, from.y + (to.y - from.y) * i / 20); await t.wait(40); }
  await t.wait(1200);
  await t.shot('d1-anticipate');
  await t.page.mouse.up();
  await t.wait(2500);
  await t.shot('d2-eating');
  for (let k = 0; k < 60; k++) { const m = await g(() => window.game.character.mood); if (m === 'idle') break; await t.wait(300); }
  await t.page.click('.hud-tr .btn:first-child', { force: true });
  await t.wait(1200);
  await t.shot('d3-cookbook');
}
