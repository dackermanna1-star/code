export default async function (t) {
  await t.page.click('.play', { force: true });
  await t.wait(1200);
  await t.shot('01-overview');
  // open fridge, drag a potato to the board
  await t.page.click('.fridge-tab', { force: true });
  await t.wait(800);
  await t.shot('02-fridge');
  // tab: veggies
  await t.page.click('.tab[data-cat="veg"]', { force: true });
  await t.wait(1500);
  const card = await t.page.$('.food-card[data-id="potato"]');
  const box = await card.boundingBox();
  const board = await t.screenOf('game.stations.board.center()');
  await t.drag(box.x + box.width / 2, box.y + box.height / 2, board.x, board.y, 20);
  await t.wait(1500);
  await t.shot('03-board');
  // chop it a few times by tapping
  const item = await t.screenOf('game.stations.board.contents[0].position');
  for (let i = 0; i < 3; i++) { await t.click(item.x, item.y - 5); await t.wait(700); }
  await t.shot('04-chopped');
  console.log(await t.eval(() => window.game.stations.board.contents.map((i) => i.name + ' ' + i.state.form).join(', ')));
}
