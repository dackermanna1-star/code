// Exhaustive smoke test: every item's tooltip, context menu, every action (run + finish), double-click useItem,
// in the player inventory and in a world container. Reports exceptions and suspicious tooltip text.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(800);
  const res = await ev(() => {
    const g = H.g, P = g.player, I = __items, inv = P.inv;
    g.noSpawn = true; g.zombies.clearAll?.();
    const problems = [];
    const menus = {};
    const keep = { ...P };
    for (const id of Object.keys(I.ITEMS)) {
      try {
        H.clearInv();
        inv.equipment.fill(null);
        inv.setEquipped('back', I.createItem('backpack_military'));
        P.dead = false; P.health = 80; P.hunger = 50; P.thirst = 50; P.wounds = []; g.survival.addWound('laceration', 'armL');
        const s = I.createItem(id); inv.addItem(s);
        const d = g.describeItem(s);
        const txt = d.name + ' ' + d.lines.join(' ');
        if (/undefined|NaN|null|\[object/.test(txt)) problems.push(`${id}: tooltip "${txt.slice(0, 160)}"`);
        const r = H.descOf(s);
        if (!r) { problems.push(id + ': not in inventory after addItem'); continue; }
        const acts = g.getItemActions(r.d, r.i);
        menus[I.ITEMS[id].category] = menus[I.ITEMS[id].category] || {};
        const sig = acts.map((a) => a.label.replace(/ \(.*\)$/, '') + (a.disabled ? '(x)' : '')).join(', ');
        (menus[I.ITEMS[id].category][sig] ||= []).push(id);
        for (const a of acts) {
          if (/^Drop/.test(a.label) || a.disabled) continue;
          const again = H.descOf(s) ? g.getItemActions(H.descOf(s).d, H.descOf(s).i).find((x) => x.label === a.label) : null;
          if (!again) continue;
          try { again.run(); H.finish(); } catch (e) { problems.push(`${id}: action "${a.label}" threw ${e.message}`); }
          if (g.ui.note?.isOpen) g.ui.closeNote?.();
          if (g.ui.dialogs?.isOpen) g.ui.dialogs.closeAll?.();
        }
        // double-click
        const s2 = I.createItem(id); inv.addItem(s2);
        const r2 = H.descOf(s2);
        if (r2) { try { g.useItem(r2.d, r2.i); H.finish(); } catch (e) { problems.push(`${id}: useItem threw ${e.message}`); } }
        if (g.ui.note?.isOpen) g.ui.closeNote?.();
        // from a world container
        const world = { key: 'test', name: 'Test', kind: 'world', slots: [I.createItem(id), null, null] };
        const wa = g.getItemActions(world, 0).map((a) => a.label);
        if (!wa.includes('Take')) problems.push(`${id}: no Take in world container`);
        g.useItem(world, 0);
        if (world.slots[0]) problems.push(`${id}: double-click in world container did not take it`);
      } catch (e) { problems.push(`${id}: threw ${e.message} ${e.stack?.split('\n')[1]}`); }
    }
    P.dead = false; P.health = 100;
    return { problems, menus };
  });
  console.log('PROBLEMS (' + res.problems.length + '):\n' + res.problems.join('\n'));
  for (const [cat, sigs] of Object.entries(res.menus)) {
    console.log('== ' + cat);
    for (const [sig, ids] of Object.entries(sigs)) console.log(`   [${sig}]  ${ids.slice(0, 8).join(' ')}${ids.length > 8 ? ' +' + (ids.length - 8) : ''}`);
  }
  dumpErrors(errors);
  await b.close();
})();
