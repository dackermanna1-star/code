// Panel screenshots: crafting (category list, busy craft button), character/skills, encumbrance moodle.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(800);
  await ev(() => { H.g.noSpawn = true; H.g.zombies.clearAll?.(); for (const id of ['rag', 'rag', 'rag', 'rag', 'stick', 'stick', 'kitchen_knife', 'plank']) H.give(id); });
  await p.keyboard.press('x');
  await p.waitForTimeout(700);
  // click a craft button with the real mouse, then check the button state while it runs
  const btn = await p.$('.craft-btn:not(.disabled)');
  if (btn) { const bb = await btn.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await p.waitForTimeout(500);
  console.log('during craft:', await ev(() => ({ action: H.g.action?.label, btn: document.querySelector('.craft-btn')?.textContent, disabled: document.querySelector('.craft-btn')?.disabled })));
  await shot('panel-craft');
  // second click must not restart it
  const t0 = await ev(() => H.g.action?.t);
  if (btn) { const bb = await (await p.$('.craft-btn')).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await p.waitForTimeout(200);
  console.log('after 2nd click: t', t0, '->', await ev(() => H.g.action?.t));
  await ev(() => H.finish());
  await p.waitForTimeout(400);
  console.log('after craft:', await ev(() => ({ btn: document.querySelector('.craft-btn')?.textContent, inv: (() => { const o = []; H.g.player.inv.forEachStack((s) => o.push(s.id + 'x' + s.count)); return o.join(' '); })() })));
  await p.keyboard.press('k');
  await p.waitForTimeout(700);
  await shot('panel-skills');
  await p.keyboard.press('Escape');
  // encumbrance
  await ev(() => { const g = H.g; g.player.inv.setEquipped('back', __items.createItem('backpack_military')); for (let i = 0; i < 8; i++) H.give('log'); for (let i = 0; i < 3; i++) H.give('sledgehammer'); });
  await p.waitForTimeout(1500);
  console.log('encumbered:', await ev(() => ({ w: H.g.player.weight.toFixed(1), max: H.g.player.maxWeight, moodles: H.g.player.moodles.map((m) => m.id + m.level + ':' + m.label) })));
  await shot('encumbered');
  dumpErrors(errors);
  await b.close();
})();
