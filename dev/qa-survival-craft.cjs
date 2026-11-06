// Crafting QA: craft every recipe through game.craft() (timed action), check inputs consumed / results added,
// then drive the real crafting panel (X key) and take screenshots.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(1000);
  const res = await ev(async () => {
    const g = H.g, P = g.player, I = __items;
    const { RECIPES } = await import('/src/items/crafting.js');
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true;
    const origCtx = g.craftCtx.bind(g);
    g.craftCtx = () => ({ ...origCtx(), nearFire: true, nearWorkbench: true });
    for (const k of Object.keys(P.skills)) P.skills[k].level = 5;
    P.inv.setEquipped('back', I.createItem('backpack_military'));
    const out = [];
    const arr = (x) => (Array.isArray(x) ? x : [x]);
    const tagItem = (tag) => Object.keys(I.ITEMS).find((id) => I.ITEMS[id].tags.includes(tag) && !I.ITEMS[id].clothing?.slot?.includes('back')) || Object.keys(I.ITEMS).find((id) => I.ITEMS[id].tags.includes(tag));
    for (const r of RECIPES) {
      H.clearInv(); __toasts.length = 0;
      P.inv.equipment.forEach((s, i) => { if (i !== 8) P.inv.equipment[i] = null; });
      for (const spec of r.inputs) {
        if (spec.liquid) { const liq = arr(spec.liquid)[0]; H.give(liq === 'gasoline' ? 'gas_can' : 'water_bottle', { data: { liquid: liq }, uses: liq === 'gasoline' ? 4 : Math.max(spec.uses, 2) }); continue; }
        const id = spec.item ? arr(spec.item)[0] : tagItem(arr(spec.tag)[0]);
        const n = spec.uses != null ? 1 : spec.count || 1;
        const def = I.getItemDef(id);
        for (let k = 0; k < n; k++) H.give(id, def.durability && r.repair ? {} : {});
      }
      for (const spec of r.tools || []) H.give(spec.item ? arr(spec.item)[0] : tagItem(arr(spec.tag)[0]));
      if (r.repair) {
        const rep = r.repair;
        const id = rep.firearm ? 'pistol_m9' : rep.clothing ? 'jeans' : rep.tags?.includes('wood') ? 'baseball_bat' : rep.tags ? 'machete' : 'crowbar';
        H.give(id, { dur: 0.3 });
      }
      const before = [];
      P.inv.forEachStack((s) => before.push(s.id + 'x' + (s.count || 1) + (s.uses != null ? 'u' + s.uses : '') + (s.dur != null ? 'd' + s.dur : '') + (s.data?.liquid ? ':' + s.data.liquid : '')));
      const st = g.getRecipes().find((s) => s.recipe.id === r.id);
      g.craft(r.id);
      const started = !!g.action;
      const time = g.action?.time;
      H.finish();
      const after = [];
      P.inv.forEachStack((s) => after.push(s.id + 'x' + (s.count || 1) + (s.uses != null ? 'u' + s.uses : '') + (s.dur != null ? 'd' + s.dur : '') + (s.data?.liquid ? ':' + s.data.liquid : '')));
      const ground = g.groundItems.list?.length;
      out.push(`${r.id.padEnd(24)} can=${st?.canCraft} started=${started} t=${time} missing=[${(st?.missing || []).map((m) => m.label).join(';')}]\n    before: ${before.filter((x) => !x.startsWith('backpack_military')).join(' ')}\n    after:  ${after.filter((x) => !x.startsWith('backpack_military')).join(' ')}  | ${__toasts.join(' | ')}`);
    }
    return out;
  });
  console.log(res.join('\n'));
  // the real panel
  await ev(() => { H.clearInv(); for (const id of ['rag', 'rag', 'rag', 'rag', 'stick', 'stick', 'kitchen_knife', 'plank', 'plank', 'duct_tape']) H.give(id); });
  await p.keyboard.press('x');
  await p.waitForTimeout(800);
  await shot('craft-panel');
  // click first craftable recipe's craft button
  const clicked = await ev(() => { const btn = document.querySelector('.craft-btn:not(.disabled)'); if (!btn) return 'no button'; btn.click(); return 'clicked ' + document.querySelector('.cd-name')?.textContent; });
  console.log(clicked);
  await p.waitForTimeout(1200);
  await shot('craft-progress');
  await p.waitForTimeout(5000);
  await shot('craft-done');
  console.log('after panel craft', await ev(() => { const o = []; H.g.player.inv.forEachStack((s) => o.push(s.id + 'x' + s.count)); return o.join(' ') + ' | ' + __toasts.slice(-3).join(' | '); }));
  dumpErrors(errors);
  await b.close();
})();
