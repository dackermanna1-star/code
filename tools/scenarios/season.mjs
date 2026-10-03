export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(500);
  await g(() => { const G = window.game; const s = window.__mk('pancake'); const it = G.items.spawn(s, G.stations.plate.center()); G.interaction.toStation(it, G.stations.plate, true); });
  await t.wait(2500);
  await t.page.click('.spice-btn', { force: true });
  await t.wait(900);
  await t.shot('p1-rack');
  const target = await t.screenOf('game.stations.plate.contents[0].position.clone().add({x:0,y:0.05,z:0,isVector3:true})');
  for (const id of ['chocolate-syrup', 'sprinkles', 'whip']) {
    if (!(await t.page.$('.spice-rack.open'))) { await t.page.click('.spice-btn', { force: true }); await t.wait(700); }
    const idx = await g((id) => window.game && [...document.querySelectorAll('.spice-card')].findIndex((c) => c.textContent.includes(({ 'chocolate-syrup': 'Chocolate', sprinkles: 'Sprinkles', whip: 'Whipped' })[id])), id);
    const card = (await t.page.$$('.spice-card'))[idx];
    await card.scrollIntoViewIfNeeded();
    const b = await card.boundingBox();
    const sx = b.x + b.width / 2, sy = b.y + b.height / 2;
    await t.page.mouse.move(sx, sy); await t.page.mouse.down();
    for (let i = 1; i <= 10; i++) { await t.page.mouse.move(sx, sy - i * 8); await t.wait(20); }
    for (let i = 1; i <= 15; i++) { await t.page.mouse.move(sx + (target.x - sx) * i / 15, sy - 80 + (target.y - sy + 80) * i / 15); await t.wait(30); }
    for (let i = 0; i < 30; i++) { await t.page.mouse.move(target.x + Math.sin(i / 3) * 40, target.y + Math.cos(i / 4) * 12); await t.wait(60); }
    await t.shot('p2-pour-' + id);
    await t.page.mouse.up();
    await t.wait(800);
  }
  await t.shot('p3-result');
  console.log(await g(() => JSON.stringify(window.game.stations.plate.contents[0].state.season)));
}
