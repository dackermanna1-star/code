// Portions on multi-count stacks: eating from 2 boxes of cereal opens one box instead of draining both;
// smoking with a stack of matchboxes opens one box; bandaging a burn with a stack of 2 burn creams.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, ev, errors } = await boot(process.argv[2] || 5303);
  const out = await ev(() => {
    const g = H.g, P = g.player, I = __items, inv = P.inv;
    g.noSpawn = true;
    const o = [];
    const list = (id) => inv.find(id).map((f) => `x${f.stack.count}u${f.stack.uses}`).join(' ');
    H.clearInv(); inv.setEquipped('back', I.createItem('backpack_hiking'));
    P.hunger = 30;
    H.give('cereal', { count: 2 });
    const use = (id) => { const f = H.find(id); const r = H.descOf(f.stack); g.useItem(r.d, r.i); H.finish(); };
    use('cereal'); o.push('cereal after 1 bowl: ' + list('cereal'));
    use('cereal'); use('cereal'); use('cereal'); o.push('after 4 bowls: ' + list('cereal'));
    use('cereal'); o.push('after 5 bowls: ' + list('cereal'));
    H.give('cigarettes'); H.give('matches', { count: 3 });
    P.panic = 50; use('cigarettes'); o.push('matches after a smoke: ' + list('matches') + ' cigs ' + list('cigarettes'));
    H.give('juice', { count: 2 }); P.thirst = 40; use('juice'); o.push('juice after a sip: ' + list('juice'));
    P.wounds = []; g.survival.addWound('burn', 'armL'); H.give('burn_cream', { count: 2 }); use('burn_cream'); o.push('burn cream after use: ' + list('burn_cream') + ' wound treated ' + P.wounds[0]?.burnTreated);
    return o;
  });
  console.log(out.join('\n'));
  dumpErrors(errors);
  await b.close();
})();
