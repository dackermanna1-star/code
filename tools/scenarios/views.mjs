// Visit chosen stations (env VIEWS=freezer,blender,...) with food inside; screenshot once the camera settles.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  const plan = {
    freezer: ['banana', 'strawberry'],
    blender: ['strawberry', 'banana', 'milk'],
    oven: ['chicken'],
    microwave: ['corn'],
    bowl: ['flour', 'egg', 'milk'],
    fryer: ['shrimp', 'potato'],
    toaster: ['bread'],
    pot: ['tomato', 'carrot'],
    pan: ['egg', 'bacon'],
    grill: ['steak'],
    board: ['carrot'],
    plate: ['pancake'],
  };
  const want = (process.env.VIEWS ?? Object.keys(plan).join(',')).split(',');
  for (const st of want) {
    await g(([st, ids]) => {
      const G = window.game;
      G.goTo(st);
      for (const id of ids) {
        const s = window.__mk(id, id === 'bread' ? 'sliced' : 'whole');
        const it = G.items.spawn(s, G.stations[st].center().clone().setY(G.stations[st].center().y + 0.3));
        G.interaction.toStation(it, G.stations[st], true);
      }
    }, [st, plan[st] ?? []]);
    await t.page.waitForFunction(() => !window.game.camera.moving, null, { timeout: 120000 });
    await t.wait(+(process.env.SETTLE ?? 1500));
    await t.shot('v-' + st);
    if (process.env.ACTION) {
      await g((st) => window.game.stations[st].doAction?.(true), st);
      await t.wait(+(process.env.ACTION_WAIT ?? 2500));
      await t.shot('v-' + st + '-action');
    }
    console.log(st + ':', await g((st) => window.game.stations[st].contents.map((i) => `${i.name}/${i.state.form} ${i.mode} @${i.position.toArray().map((v) => v.toFixed(2))}`).join(', '), st));
  }
}
