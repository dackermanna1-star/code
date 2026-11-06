// Layout check: fully kitted survivor (all equipment slots, big backpack, vest pouches) with several loot
// sources, at 1280x720 and 1920x1080.
const { chromium } = require('playwright');
(async () => {
  const port = process.argv[2] || 5303;
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  for (const [w, hgt] of [[1280, 720], [1920, 1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: hgt } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://localhost:${port}/?autostart=1&test=1&seed=millbrook`);
    await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
    await p.evaluate(async () => {
      const g = window.game, inv = g.player.inv;
      const { createItem } = await import('/src/items/items.js');
      g.noSpawn = true;
      for (const [slot, id] of [['head', 'military_helmet'], ['face', 'bandana'], ['torso', 'military_shirt'], ['jacket', 'military_jacket'], ['vest', 'tactical_vest'], ['hands', 'tactical_gloves'], ['legs', 'military_pants'], ['feet', 'combat_boots'], ['back', 'backpack_military']]) inv.setEquipped(slot, createItem(id, { dur: 0.6 }));
      for (const id of ['rifle_m4', 'pistol_m9', 'fire_axe', 'canned_beans', 'water_bottle', 'bandage', 'ammo_556', 'ammo_9mm', 'mre', 'flashlight', 'lighter', 'painkillers', 'first_aid_kit', 'rope', 'duct_tape', 'can_opener', 'apple', 'map_millbrook']) inv.addItem(createItem(id, { count: 5, ammo: 30 }));
      g.afterInventoryChange();
      const crate = { key: 'test:crate', name: 'Military Crate', kind: 'world', slots: [createItem('frag_grenade'), createItem('ammo_556', { count: 40 }), createItem('ifak'), null, null, null, null, null, null, null] };
      const corpse = { key: 'test:corpse', name: 'Zombie', kind: 'corpse', slots: [createItem('dog_tags'), createItem('wallet'), null, null] };
      g.ui.openInventory([crate, corpse, g.groundItems.floorDesc()]);
    });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `dev/out/qa-survival-bigui-${w}.png` });
    console.log(w, 'errors', errors.length, errors.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
})();
