// Spawn/cook/cut/serve rounds with a reset in between; GPU memory counts should return to baseline.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  await t.wait(1500);
  const res = await g(async () => {
    const G = window.game;
    const { INGREDIENTS } = await import('/src/food/catalog.ts');
    const P = await import('/src/food/process.ts');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const mem = () => ({ geo: G.renderer.info.memory.geometries, tex: G.renderer.info.memory.textures, items: G.items.list.length });
    const out = [['start', mem()]];
    for (let round = 0; round < 4; round++) {
      const stations = Object.values(G.stations);
      for (let i = 0; i < 24; i++) {
        const def = INGREDIENTS[(round * 24 + i * 7) % INGREDIENTS.length];
        const st = stations[i % stations.length];
        let s = window.__mk(def.id);
        if (i % 3 === 0 && P.canCut(s)) s = P.cut(s);
        const it = G.items.spawn(s, st.center().clone().setY(st.center().y + 0.3));
        if (st.accepts(it)) G.interaction.toStation(it, st, true); else G.interaction.parkOnCounter(it);
        if (i % 4 === 0) { P.addSeasoning(it.state, 'ketchup', 1); it.visual.refreshDecals(); }
      }
      await sleep(4000);
      for (const it of G.items.list.slice(0, 6)) { it.visual.addBite(it.position.clone(), 0.03); }
      out.push(['round' + round + ' full', mem()]);
      G.reset();
      await sleep(2500);
      out.push(['round' + round + ' reset', mem()]);
    }
    return out;
  });
  for (const [k, v] of res) console.log(k.padEnd(16), JSON.stringify(v));
}
