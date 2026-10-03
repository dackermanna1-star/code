// potato -> board -> cut x4 -> drag to fryer via dock -> fry -> plate -> serve
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(800);
  await g(() => { const G = window.game; const it = G.items.spawn(window.__mk('potato'), G.stations.board.center()); G.interaction.toStation(it, G.stations.board); });
  await t.wait(1500);
  for (let i = 0; i < 4; i++) {
    const p = await t.screenOf('game.stations.board.contents[0].position');
    await t.click(p.x, p.y - 4);
    await t.wait(650);
  }
  await t.shot('f1-sticks');
  console.log('board:', await g(() => window.game.stations.board.contents.map((i) => i.name + '/' + i.state.form).join(', ')));
  // drag the sticks to the fryer dock button
  const p = await t.screenOf('game.stations.board.contents[0].position');
  const dock = await (await t.page.$('.dock-btn[data-station="fryer"]')).boundingBox();
  await t.drag(p.x, p.y, dock.x + dock.width / 2, dock.y + dock.height / 2, 25);
  await t.wait(2500);
  await t.shot('f2-fryer');
  await t.wait(6000);
  await t.shot('f3-frying');
  console.log('fryer:', await g(() => window.game.stations.fryer.contents.map((i) => i.name + ' deepfry=' + i.state.cook.deepfry.toFixed(2)).join(', ')));
  // take it out onto the plate
  await g(() => { const G = window.game; const it = G.stations.fryer.contents[0]; G.stations.fryer.release(it); G.interaction.toStation(it, G.stations.plate, true); });
  await t.wait(2200);
  await t.shot('f4-plate');
  await g(() => window.game.stations.plate.ringBell());
  await t.wait(2200);
  await t.shot('f5-eating');
  await t.wait(3000);
  await t.shot('f6-reaction');
  await t.wait(3500);
  await t.shot('f7-after');
}
