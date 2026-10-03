// Title, fridge (with thumbnails), spice rack and cookbook at the current viewport size.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  const settle = () => t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
  await t.wait(800);
  await t.shot('u0-title');
  await g(() => window.game.ui.start());
  await settle();
  await t.wait(800);
  await t.shot('u1-overview');
  await g(() => window.game.ui.togglePantry(true));
  await t.page.waitForFunction(() => [...document.querySelectorAll('.food-card img')].every((i) => i.classList.contains('ready')), null, { timeout: 300000 }).catch(() => console.log('thumbs not all ready'));
  await t.wait(600);
  await t.shot('u2-fridge');
  // another tab
  await t.page.click('.tab[data-cat="meat"]', { force: true });
  await t.page.waitForFunction(() => [...document.querySelectorAll('.food-card img')].every((i) => i.classList.contains('ready')), null, { timeout: 300000 }).catch(() => console.log('meat thumbs not ready'));
  await t.wait(400);
  await t.shot('u3-fridge-meat');
  await g(() => { window.game.ui.togglePantry(false); window.game.goTo('board'); });
  await settle();
  await g(() => window.game.ui.toggleSpices(true));
  await t.page.waitForFunction(() => [...document.querySelectorAll('.spice-card img')].every((i) => i.classList.contains('ready')), null, { timeout: 300000 }).catch(() => console.log('spice thumbs not ready'));
  await t.wait(600);
  await t.shot('u4-spices');
  await g(() => window.game.ui.toggleSpices(false));
  await t.page.click('.settings button, .top-btn', { force: true }).catch(() => {});
  await g(() => window.game.ui.openCookbook?.());
  await t.wait(800);
  await t.shot('u5-cookbook');
}
