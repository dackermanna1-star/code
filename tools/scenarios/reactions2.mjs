// Serve engine-cooked dishes (src/viewer/engineDishes.ts, env DISHES="label1|label2") and shoot Mochi's reaction.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  await g(() => window.game.goTo('plate'));
  await t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
  const want = (process.env.DISHES ?? 'fries|burnt toast|chili|lemon|ice cream|fish milkshake|cheeseburger|raw chicken|weird pile|smoothie|sundae|tomato soup').split('|');
  for (let i = 0; i < want.length; i++) {
    const info = await g(async (label) => {
      const G = window.game;
      const { engineDishes } = await import('/src/viewer/engineDishes.ts');
      const { analyzeMeal } = await import('/src/recipes/index.ts');
      const row = engineDishes().find(([l]) => l === label);
      if (!row) return 'missing ' + label;
      const a = analyzeMeal(row[1]);
      const it = G.items.spawn(row[1], G.stations.plate.center());
      G.feed(it);
      return `${label}: ${a.name} -> ${a.reaction} "${a.quip}" (${a.eatStyle}, bites ${a.bites})`;
    }, want[i]);
    console.log(info);
    for (let k = 0; k < 120; k++) { const m = await g(() => window.game.character.mood); if (m === 'reacting') break; await t.wait(250); }
    await t.wait(+(process.env.REACT_WAIT ?? 900));
    await t.shot('r2-' + String(i).padStart(2, '0') + '-' + want[i].replace(/\W+/g, '_'));
    for (let k = 0; k < 160; k++) { const m = await g(() => window.game.character.mood); if (m === 'idle') break; await t.wait(250); }
  }
}
