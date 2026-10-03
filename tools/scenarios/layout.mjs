export default async function (t) {
  await t.page.click('.play', { force: true });
  await t.wait(1200);
  await t.shot('L1-overview');
  await t.page.click('.fridge-tab', { force: true });
  await t.wait(1500);
  await t.shot('L2-fridge');
  await t.eval(() => { window.game.ui.togglePantry(false); window.game.goTo('board'); });
  await t.wait(1500);
  await t.page.click('.spice-btn', { force: true });
  await t.wait(1200);
  await t.shot('L3-board-spices');
}
