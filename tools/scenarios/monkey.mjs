// Random play for N steps (env STEPS, SEED): spawn, move between stations, act, combine, season,
// serve, tap. Reports errors and a summary; the harness prints page errors at the end.
export default async function (t) {
  const g = (fn, a) => t.eval(fn, a);
  await g(() => window.game.ui.start());
  const steps = +(process.env.STEPS ?? 120);
  const seed = +(process.env.SEED ?? 7);
  const out = await g(async ([steps, seed]) => {
    const G = window.game;
    const { INGREDIENTS, SEASONINGS } = await import('/src/food/catalog.ts');
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const stations = Object.values(G.stations);
    const log = [];
    const errors = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < steps; i++) {
      const r = rnd();
      try {
        if (r < 0.3 || G.items.list.length < 2) {
          const st = pick(stations);
          const it = G.items.spawn(window.__mk(pick(INGREDIENTS).id), st.center().clone().setY(st.center().y + 0.3));
          if (st.accepts(it)) G.interaction.toStation(it, st, true);
          else G.interaction.parkOnCounter(it);
          log.push('spawn ' + it.name + ' -> ' + st.id);
        } else if (r < 0.5) {
          const it = pick(G.items.list);
          const st = pick(stations);
          if (it.mode === 'rest' && st.accepts(it)) {
            it.holder?.release(it);
            G.interaction.toStation(it, st, true);
            log.push('move ' + it.name + ' -> ' + st.id);
          }
        } else if (r < 0.65) {
          const st = pick(stations);
          G.goTo(st.id === 'plate' ? 'plate' : st.id);
          st.doAction?.(true);
          if (rnd() < 0.3) st.doAction?.(false);
          log.push('action ' + st.id);
        } else if (r < 0.75) {
          const a = pick(G.items.list), b = pick(G.items.list);
          if (a !== b && a.mode === 'rest' && b.mode === 'rest') {
            G.interaction.combineInto(a, b);
            log.push('combine');
          }
        } else if (r < 0.83) {
          const it = pick(G.items.list);
          const def = pick(SEASONINGS);
          const { addSeasoning } = await import('/src/food/process.ts');
          addSeasoning(it.state, def.id, rnd() * 2);
          it.refresh?.();
          it.visual.refreshDecals();
          log.push('season ' + def.id);
        } else if (r < 0.9) {
          const it = pick(G.items.list);
          if (it.mode === 'rest') { G.feed(it); log.push('feed ' + it.name); }
        } else if (r < 0.95) {
          const st = G.stations.board;
          const it = st.contents[0];
          if (it) { G.goTo('board'); st.useTool(it, false); log.push('chop'); }
        } else {
          if (rnd() < 0.2) { G.reset(); log.push('reset'); } else { G.goTo('overview'); log.push('overview'); }
        }
      } catch (e) {
        errors.push(i + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
      }
      await sleep(120 + rnd() * 300);
    }
    // let Mochi finish whatever is queued
    for (let k = 0; k < 240 && (G.character.mood !== 'idle' || G.character.queue?.length); k++) await sleep(250);
    return { mood: G.character.mood, queued: G.character.queue?.length, items: G.items.list.length, errors, last: log.slice(-12), meals: G.discoveries.meals, calls: G.renderer.info.render.calls, programs: G.renderer.info.programs.length, textures: G.renderer.info.memory.textures, geometries: G.renderer.info.memory.geometries };
  }, [steps, seed]);
  console.log(JSON.stringify(out, null, 1));
  await t.shot('monkey-end');
}
