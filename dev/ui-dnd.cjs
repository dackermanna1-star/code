// Interaction test for the inventory UI (drag & drop, shift-click, half-drag, drop outside, equip, hotkeys, menus).
// Usage: node dev/ui-dnd.cjs [port]
const { chromium } = require('playwright');
const path = require('path');

const port = process.argv[2] || '5207';
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/dev/ui-test.html?screen=inventory`);
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(400);

  const center = async (key, i) => {
    const el = await page.$(`.inv-panel .slot[data-key="${key}"][data-i="${i}"]`);
    if (!el) throw new Error(`slot ${key}[${i}] not found`);
    const b = await el.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const drag = async (from, to, button = 'left') => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button });
    for (let s = 1; s <= 8; s++) await page.mouse.move(from.x + ((to.x - from.x) * s) / 8, from.y + ((to.y - from.y) * s) / 8);
    await page.mouse.up({ button });
    await page.waitForTimeout(120);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // 1. drag hotbar[0] (bat) -> backpack slot 11 (empty)
  const before1 = await ev(() => ({ hb0: game.player.inv.hotbar[0]?.id, bp11: game.player.inv.getEquipped('back').contents[11] }));
  await drag(await center('hotbar', 0), await center('equip:back', 11));
  const after1 = await ev(() => ({ hb0: game.player.inv.hotbar[0], bp11: game.player.inv.getEquipped('back').contents[11]?.id }));
  check('drag hotbar[0] -> backpack[11]', before1.hb0 === 'baseball_bat' && before1.bp11 === null && after1.hb0 === null && after1.bp11 === 'baseball_bat');

  // 2. drag onto occupied slot swaps (backpack[11] bat <-> hotbar[2] knife)
  await drag(await center('equip:back', 11), await center('hotbar', 2));
  const after2 = await ev(() => ({ hb2: game.player.inv.hotbar[2]?.id, bp11: game.player.inv.getEquipped('back').contents[11]?.id }));
  check('drag onto occupied slot swaps', after2.hb2 === 'baseball_bat' && after2.bp11 === 'kitchen_knife', JSON.stringify(after2));

  // 3. shift-click loot -> player
  const beansBefore = await ev(() => game.player.inv.count('canned_beans'));
  const cab0 = await center('world:412,21,233', 0);
  await page.keyboard.down('Shift');
  await page.mouse.click(cab0.x, cab0.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  const r3 = await ev(() => ({ beans: game.player.inv.count('canned_beans'), cab: game.getLootSources()[0].slots[0] }));
  check('shift-click quick move cabinet -> player', r3.cab === null && r3.beans === beansBefore + 2, `beans ${beansBefore} -> ${r3.beans}`);

  // 4. shift-click player -> loot (hotbar[4] water bottle goes to first loot container)
  await page.keyboard.down('Shift');
  const hb4 = await center('hotbar', 4);
  await page.mouse.click(hb4.x, hb4.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  const r4 = await ev(() => ({ hb4: game.player.inv.hotbar[4], inCab: game.getLootSources()[0].slots.some((s) => s && s.id === 'water_bottle') }));
  check('shift-click player -> loot', r4.hb4 === null && r4.inCab);

  // 5. right-drag half: vest 9mm x30 -> an empty vest slot
  const vestFree = async () => ev(() => game.player.inv.getEquipped('vest').contents.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0));
  const ammoIdx = await ev(() => game.player.inv.getEquipped('vest').contents.findIndex((x) => x && x.id === 'ammo_9mm'));
  let free = await vestFree();
  await drag(await center('equip:vest', ammoIdx), await center('equip:vest', free[0]), 'right');
  const r5 = await ev(([a, b]) => { const v = game.player.inv.getEquipped('vest').contents; return [v[a]?.count, v[b]?.count, v[b]?.id]; }, [ammoIdx, free[0]]);
  check('right-drag splits half', r5[0] === 15 && r5[1] === 15 && r5[2] === 'ammo_9mm', JSON.stringify(r5));
  const halfIdx = free[0];

  // 6. ctrl-drag also half: 15 -> 8 moved into the next empty slot of the backpack
  const bpFree = await ev(() => game.player.inv.getEquipped('back').contents.findIndex((x) => !x));
  await page.keyboard.down('Control');
  await drag(await center('equip:vest', halfIdx), await center('equip:back', bpFree));
  await page.keyboard.up('Control');
  const r6 = await ev(([a, b]) => [game.player.inv.getEquipped('vest').contents[a]?.count, game.player.inv.getEquipped('back').contents[b]?.count], [halfIdx, bpFree]);
  check('ctrl-drag splits half across containers', r6[0] === 7 && r6[1] === 8, JSON.stringify(r6));

  // 6b. partial stack onto a different item is refused (no swap of half stacks)
  const otherIdx = await ev(() => game.player.inv.getEquipped('back').contents.findIndex((x) => x && x.id === 'canned_peaches'));
  await drag(await center('equip:vest', ammoIdx), await center('equip:back', otherIdx), 'right');
  const r6b = await ev(([a, b]) => [game.player.inv.getEquipped('vest').contents[a]?.count, game.player.inv.getEquipped('back').contents[b]?.id], [ammoIdx, otherIdx]);
  check('half-stack onto different item refused', r6b[0] === 15 && r6b[1] === 'canned_peaches', JSON.stringify(r6b));

  // 6c. drop on a container header area merges / fills first free slot
  const secHead = await page.$('.inv-section[data-key="equip:back"] .sec-head');
  const shb = await secHead.boundingBox();
  await drag(await center('equip:vest', halfIdx), { x: shb.x + 60, y: shb.y + shb.height / 2 });
  const r6c = await ev(([a, b]) => [game.player.inv.getEquipped('vest').contents[a], game.player.inv.getEquipped('back').contents[b]?.count], [halfIdx, bpFree]);
  check('drop on section header merges into that container', r6c[0] === null && r6c[1] === 15, JSON.stringify(r6c));

  // 7. drag outside the window drops on the ground
  const groundBefore = await ev(() => game.getLootSources()[3].slots.filter(Boolean).length);
  await drag(await center('hotbar', 6), { x: 20, y: 700 });
  const r7 = await ev(() => ({ hb6: game.player.inv.hotbar[6], g: game.getLootSources()[3].slots.filter(Boolean).map((s) => s.id) }));
  check('drag outside drops to ground', r7.hb6 === null && r7.g.includes('molotov') && r7.g.length === groundBefore + 1, JSON.stringify(r7.g));

  // 8. drag clothing from corpse onto the paper-doll figure equips it (swap with hoodie)
  const fig = await page.$('.doll-fig');
  const fb = await fig.boundingBox();
  await drag(await center('corpse:17', 2), { x: fb.x + fb.width / 2, y: fb.y + fb.height * 0.4 });
  const r8 = await ev(() => ({ jacket: game.player.inv.getEquipped('jacket')?.id, corpse2: game.getLootSources()[1].slots[2]?.id }));
  check('drag clothing onto doll equips it', r8.jacket === 'leather_jacket' && r8.corpse2 === 'hoodie', JSON.stringify(r8));

  // 9. wrong equipment slot is redirected to the right one (boots onto the head slot -> feet)
  await drag(await center('corpse:17', 6), await center('equipment', 0));
  const r9 = await ev(() => ({ feet: game.player.inv.getEquipped('feet')?.id, head: game.player.inv.getEquipped('head')?.id }));
  check('equip redirect to correct slot', r9.feet === 'work_boots' && r9.head === 'baseball_cap', JSON.stringify(r9));

  // 10. non-clothing on an equipment slot is refused
  const snapHead = await ev(() => game.player.inv.getEquipped('head')?.id);
  await drag(await center('hotbar', 2), await center('equipment', 0));
  const r10 = await ev(() => ({ head: game.player.inv.getEquipped('head')?.id, hb2: game.player.inv.hotbar[2]?.id }));
  check('non-clothing refused by equipment slot', r10.head === snapHead && r10.hb2 === 'baseball_bat');

  // 11. hover + number key moves into hotbar
  const cab1 = await center('world:412,21,233', 1);
  await page.mouse.move(cab1.x, cab1.y);
  await page.mouse.move(cab1.x + 1, cab1.y + 1);
  await page.keyboard.press('6');
  await page.waitForTimeout(100);
  const r11 = await ev(() => game.player.inv.hotbar[5]?.id);
  check('hover + number key -> hotbar', r11 === 'chips', r11);

  // 12. tooltip visible on hover (over a filled slot)
  const cab2 = await center('world:412,21,233', 2);
  await page.mouse.move(cab2.x, cab2.y);
  await page.mouse.move(cab2.x + 1, cab2.y);
  await page.waitForTimeout(80);
  const tt = await ev(() => !document.querySelector('.tooltip').classList.contains('hidden') && document.querySelector('.tooltip .tt-name')?.textContent);
  check('tooltip shows on hover', !!tt, String(tt));

  // 13. right click -> context menu from getItemActions, click "Eat"
  const hb5 = await center('hotbar', 5);
  await page.mouse.click(hb5.x, hb5.y, { button: 'right' });
  await page.waitForTimeout(100);
  const items = await ev(() => [...document.querySelectorAll('.ctxmenu:not(.hidden) .ctx-item')].map((e) => e.textContent));
  check('context menu lists actions', items.includes('Eat'), items.join(' | '));
  const chipsBefore = await ev(() => game.player.inv.hotbar[5].count);
  const eat = await page.$('.ctxmenu .ctx-item:has-text("Eat")');
  await eat.click();
  await page.waitForTimeout(100);
  const chipsAfter = await ev(() => game.player.inv.hotbar[5]?.count ?? 0);
  check('context action runs', chipsAfter === chipsBefore - 1 && await ev(() => document.querySelector('.ctxmenu').classList.contains('hidden')));

  // 14. double click -> useItem
  const hb3 = await center('hotbar', 3);
  await page.mouse.dblclick(hb3.x, hb3.y);
  await page.waitForTimeout(100);
  const used = await ev(() => game.calls.some((c) => c[0] === 'useItem' && c[1] === 'hotbar' && c[2] === 3));
  check('double-click calls game.useItem', used);

  // 15. onItemMoved called after moves
  const moves = await ev(() => window.__moves || 0);
  check('game.onItemMoved called for every move', moves === 10, `count ${moves}`);

  // 16. keyboard: X crafting, Esc closes, Tab inventory, K skills toggles off
  await page.mouse.move(5, 5);
  const keyRes = await ev(() => {
    const out = [];
    const k = (key) => ui.handleKey(new KeyboardEvent('keydown', { key, cancelable: true }));
    out.push(k('x'), ui.panels.current);
    out.push(k('Escape'), ui.panels.current, ui.isBlocking());
    out.push(k('Escape'));
    out.push(k('Tab'), ui.panels.current);
    out.push(k('k'), ui.panels.current, k('k'), ui.panels.current);
    out.push(k('c'));
    return out;
  });
  check('keys: X opens crafting, Esc closes, Esc with nothing open -> false, Tab/K toggle, C not consumed',
    JSON.stringify(keyRes) === JSON.stringify([true, 'crafting', true, null, false, false, true, 'inventory', true, 'skills', true, null, false]), JSON.stringify(keyRes));

  // 17. pause: Esc resumes
  const pauseRes = await ev(() => {
    game.state = 'paused'; ui.showPause();
    const blocking = ui.isBlocking();
    const ev2 = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(ev2);
    const consumed = ui.handleKey(ev2);
    return [blocking, consumed, ui.pause.isOpen, game.state];
  });
  check('pause: Esc resumes (once)', JSON.stringify(pauseRes) === JSON.stringify([true, true, false, 'playing']) && (await ev(() => game.calls.filter((c) => c[0] === 'resume').length)) === 1, JSON.stringify(pauseRes));

  await page.screenshot({ path: path.join(__dirname, 'out', 'ui-dnd-final-1280.png') });
  if (errors.length) { console.log('CONSOLE ERRORS:'); errors.forEach((e) => console.log('  ' + e)); failures += errors.length; }
  await browser.close();
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
