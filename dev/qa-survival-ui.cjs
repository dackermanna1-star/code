// UI QA in the real game: health panel with wounds (click a treatment), inventory tooltip / context menu,
// drag & drop (pocket -> hotbar, clothing -> doll, backpack swap, drop outside), HUD moodles.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(1000);
  await ev(() => {
    const g = H.g;
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true; g.zombies.clearAll?.();
    g.ui.hud.hintsT = 0;
  });
  const center = async (sel) => {
    const el = await p.$(sel);
    if (!el) return null;
    const bb = await el.boundingBox();
    return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  };
  const drag = async (from, to) => {
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    for (let s = 1; s <= 8; s++) await p.mouse.move(from.x + ((to.x - from.x) * s) / 8, from.y + ((to.y - from.y) * s) / 8);
    await p.mouse.up(); await p.waitForTimeout(200);
  };
  // ---------------------------------------------------------------- health panel
  await ev(() => {
    const g = H.g, S = g.survival;
    S.addWound('laceration', 'armL'); S.addWound('scratch', 'head'); S.addWound('fracture', 'legR'); S.addWound('bite', 'armR'); S.addWound('glass', 'legL');
    g.player.infected = false; g.player.infection = 0;
    for (const id of ['bandage', 'rag', 'disinfectant', 'splint', 'suture_kit', 'tweezers']) H.give(id);
  });
  await p.keyboard.press('h');
  await p.waitForTimeout(900);
  await shot('health');
  // click the first treatment button of the first wound (real mouse)
  const btn = await center('.wound .wound-actions .btn:not(.disabled)');
  const lbl = await ev(() => document.querySelector('.wound .wound-actions .btn:not(.disabled)')?.textContent);
  if (btn) { await p.mouse.move(btn.x, btn.y); await p.waitForTimeout(300); await p.mouse.down(); await p.waitForTimeout(140); await p.mouse.up(); }
  await p.waitForTimeout(300);
  console.log('clicked treatment', lbl, '-> action', await ev(() => H.g.action?.label || null));
  await ev(() => H.finish());
  await p.waitForTimeout(500);
  console.log('wounds after', JSON.stringify(await ev(() => H.stats().wounds)));
  await shot('health-after');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // ---------------------------------------------------------------- HUD moodles
  await ev(() => { const P = H.g.player; P.hunger = 30; P.thirst = 20; P.energy = 25; P.bodyTemp = 35.6; P.wetness = 60; P.panic = 50; });
  await p.waitForTimeout(1500);
  await shot('hud-moodles');
  // ---------------------------------------------------------------- inventory
  await ev(() => {
    const g = H.g, P = g.player, I = __items;
    P.wounds = []; P.hunger = 70; P.thirst = 70; P.energy = 70; P.bodyTemp = 37; P.wetness = 0; P.panic = 0;
    H.clearInv();
    P.inv.setEquipped('back', I.createItem('backpack_school'));
    for (const id of ['canned_beans', 'kitchen_knife', 'water_bottle', 'apple', 'bandage', 'leather_jacket', 'backpack_hiking', 'painkillers']) H.give(id);
    g.ui.openPanel('inventory');
  });
  await p.waitForTimeout(800);
  await shot('inv');
  // tooltip on beans
  const beans = await ev(() => { const r = H.descOf(H.find('canned_beans').stack); return { key: r.d.key, i: r.i }; });
  const bc = await center(`.inv-panel .slot[data-key="${beans.key}"][data-i="${beans.i}"]`);
  await p.mouse.move(bc.x, bc.y); await p.waitForTimeout(100); await p.mouse.move(bc.x + 2, bc.y + 1); await p.waitForTimeout(500);
  await shot('tooltip');
  // context menu
  await p.mouse.click(bc.x, bc.y, { button: 'right' });
  await p.waitForTimeout(400);
  await shot('ctxmenu');
  console.log('ctx items', await ev(() => [...document.querySelectorAll('.ctx-menu .ctx-item, .ctx .ctx-item, .ctxmenu button')].map((e) => e.textContent).join(' | ')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  // drag beans -> hotbar slot 5
  await drag(bc, await center('.inv-panel .slot[data-key="hotbar"][data-i="4"]'));
  console.log('hotbar[4] after drag:', await ev(() => H.g.player.inv.hotbar[4]?.id));
  // drag leather jacket onto the doll
  const lj = await ev(() => { const r = H.descOf(H.find('leather_jacket').stack); return { key: r.d.key, i: r.i }; });
  await drag(await center(`.inv-panel .slot[data-key="${lj.key}"][data-i="${lj.i}"]`), await center('.doll-fig'));
  console.log('jacket after doll drop:', await ev(() => H.g.player.inv.getEquipped('jacket')?.id), 'storage:', await ev(() => H.g.player.inv.storageDescs().map((d) => d.name).join(',')));
  // double-click hiking backpack (stored inside the school backpack) -> should be worn
  const hb = await ev(() => { const r = H.descOf(H.find('backpack_hiking').stack); return { key: r.d.key, i: r.i }; });
  const hbc = await center(`.inv-panel .slot[data-key="${hb.key}"][data-i="${hb.i}"]`);
  await p.mouse.dblclick(hbc.x, hbc.y);
  await p.waitForTimeout(400);
  console.log('back after dblclick:', await ev(() => H.g.player.inv.getEquipped('back')?.id), 'school pack at:', await ev(() => { const f = H.find('backpack_school'); return f ? (f.slots === H.g.player.inv.hotbar ? 'hotbar' : 'storage') : 'ground?'; }), await ev(() => __toasts.slice(-2).join(' | ')));
  await shot('inv-after');
  // drag apple outside the window -> dropped
  const ap = await ev(() => { const f = H.find('apple'); if (!f) return null; const r = H.descOf(f.stack); return r ? { key: r.d.key, i: r.i } : null; });
  if (ap) {
    await drag(await center(`.inv-panel .slot[data-key="${ap.key}"][data-i="${ap.i}"]`), { x: 1260, y: 700 });
    console.log('apple after drop outside:', await ev(() => !!H.find('apple')), 'ground has apple:', await ev(() => H.g.groundItems.floorDesc().slots.some((s) => s?.id === 'apple')));
  }
  console.log('toasts:', await ev(() => __toasts.join(' | ')));
  dumpErrors(errors);
  await b.close();
})();
