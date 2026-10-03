// Build a burger on the plate by dropping parts onto each other, then serve it.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  await g(() => window.game.goTo('plate'));
  await t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
  const build = await g(async () => {
    const G = window.game;
    const P = await import('/src/food/process.ts');
    const mk = window.__mk;
    const cook = (f, m, s) => { for (let x = 0; x < s; x += 0.05) P.applyHeat(f, m, 0.05); return f; };
    const plate = G.stations.plate;
    const bun = G.items.spawn(P.cut(mk('bun')), plate.center().clone().setY(plate.center().y + 0.2));
    G.interaction.toStation(bun, plate, true);
    return 'ok';
  });
  await t.wait(1500);
  for (const step of ['patty', 'cheese', 'lettuce', 'tomato']) {
    await g(async (step) => {
      const G = window.game;
      const P = await import('/src/food/process.ts');
      const mk = window.__mk;
      const cook = (f, m, s) => { for (let x = 0; x < s; x += 0.05) P.applyHeat(f, m, 0.05); return f; };
      const s = step === 'patty' ? cook(mk('patty'), 'grill', 8) : step === 'tomato' ? P.cut(P.cut(mk('tomato'))) : P.cut(mk(step));
      const base = G.stations.plate.contents[0];
      const it = G.items.spawn(s, base.position.clone().add({ x: 0.1, y: 0.25, z: 0.05, isVector3: true }));
      G.interaction.combineInto(it, base);
    }, step);
    await t.wait(1800);
    console.log(step, '->', await g(() => window.game.stations.plate.contents.map((i) => i.name).join(', ')));
  }
  await t.shot('b1-burger');
  await g(() => window.game.stations.plate.ringBell());
  for (let k = 0; k < 120; k++) { const m = await g(() => window.game.character.mood); if (m === 'reacting') break; await t.wait(250); }
  await t.wait(600);
  await t.shot('b2-reaction');
}
