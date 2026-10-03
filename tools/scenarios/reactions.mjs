export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(500);
  await g(() => window.game.goTo('plate'));
  await t.wait(1500);
  const names = ['love', 'yum', 'spicy', 'sour', 'burnt', 'frozen', 'gross', 'weird-good', 'sugar-rush', 'tears'];
  for (let i = 0; i < names.length; i++) {
    await g((i) => { const G = window.game; const ids = ['strawberry', 'cookie', 'chili', 'lemon', 'bread', 'banana', 'steak', 'pineapple', 'donut', 'onion']; const it = G.items.spawn(window.__mk(ids[i]), G.stations.plate.center()); G.feed(it); }, i);
    // wait until Mochi is reacting
    for (let k = 0; k < 60; k++) { const m = await g(() => window.game.character.mood); if (m === 'reacting') break; await t.wait(250); }
    await t.wait(700);
    await t.shot('r-' + String(i).padStart(2, '0') + '-' + names[i]);
    for (let k = 0; k < 80; k++) { const m = await g(() => window.game.character.mood); if (m === 'idle') break; await t.wait(250); }
  }
}
