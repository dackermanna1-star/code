// Visit every station with some food in it and screenshot.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(600);
  const put = (station, ids, form) => g(([station, ids, form]) => {
    const G = window.game;
    for (const id of ids) {
      const s = window.__mk(id, form || 'whole');
      const it = G.items.spawn(s, G.stations[station].center().clone().add({ x: 0, y: 0.3, z: 0, isVector3: true }));
      it.snapTo(G.stations[station].center().clone().setY(G.stations[station].center().y + 0.3));
      G.interaction.toStation(it, G.stations[station], true);
    }
  }, [station, ids, form]);
  const plan = [
    ['pan', ['egg', 'bacon', 'sausage']],
    ['grill', ['steak', 'corn']],
    ['pot', ['tomato', 'carrot', 'onion']],
    ['oven', ['chicken']],
    ['fryer', ['shrimp']],
    ['blender', ['strawberry', 'banana', 'milk']],
    ['toaster', ['bread'], 'sliced'],
    ['microwave', ['corn']],
    ['freezer', ['banana']],
    ['bowl', ['flour', 'egg', 'milk']],
  ];
  for (const [st, ids, form] of plan) {
    await put(st, ids, form);
    await t.wait(1800);
    await g((st) => { const G = window.game; const s = G.stations[st]; if (s.doAction && ['blender', 'toaster', 'microwave', 'bowl'].includes(st)) s.doAction(true); }, st);
    await t.wait(2600);
    await t.shot('s-' + st);
    console.log(st + ':', await g((st) => window.game.stations[st].contents.map((i) => i.name).join(', '), st));
  }
  await g(() => window.game.goTo('overview'));
  await t.wait(1500);
  await t.shot('s-overview');
}
