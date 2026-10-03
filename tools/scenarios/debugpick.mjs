export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await t.page.click('.play', { force: true });
  await t.wait(500);
  await g(() => window.game.goTo('plate'));
  await t.wait(1800);
  await g(() => { const G = window.game; const it = G.items.spawn(window.__mk('donut'), G.stations.plate.center().clone().setY(1.2)); G.interaction.toStation(it, G.stations.plate); });
  await t.wait(2000);
  const from = await t.screenOf('game.stations.plate.contents[0].position.clone().add({x:0,y:0.03,z:0,isVector3:true})');
  console.log('from', JSON.stringify(from));
  console.log(await g(([x, y]) => { const G = window.game; const h = G.interaction.pick(x, y); const el = document.elementFromPoint(x, y); return JSON.stringify({ item: h.item?.name, part: !!h.part, ch: h.character, st: h.station?.id, el: el?.className, mode: G.interaction.mode, pid: G.interaction.pointerId }); }, [from.x, from.y]));
}
