// Item QA part 2: purification, tweezers, burns, bashing cans open, pocket rules, equip swaps / pocket spill,
// tooltips, and long survival simulations (wound healing, infections, temperature, death causes).
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(800);
  await ev(() => {
    const g = H.g;
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true; g.zombies.clearAll?.();
  });
  const out = await ev(() => {
    const g = H.g, P = g.player, I = __items, S = g.survival, inv = P.inv;
    const o = [];
    const use = (st) => { const r = H.descOf(st); if (!r) return 'not found'; g.useItem(r.d, r.i); const a = g.action?.label; H.finish(); return a || '-'; };
    o.push('nearFire at spawn: ' + g.nearFire());
    // ---- purification
    H.clearInv(); inv.setEquipped('back', I.createItem('backpack_hiking'));
    const pot = I.createItem('pot', { data: { liquid: 'dirty_water' }, uses: 8 }); inv.addItem(pot);
    H.give('purification_tablets', { count: 1 });
    o.push('pot actions: ' + H.actions(pot).join(', '));
    H.run(pot, 'Purify'); o.push(`purify pot(8) with 1 tablet -> ${pot.data.liquid} tablets ${inv.count('purification_tablets')} | ${__toasts.slice(-1)}`);
    H.give('purification_tablets', { count: 2 }); H.run(pot, 'Purify'); o.push(`purify pot(8) with 3 tablets -> ${pot.data.liquid} tablets ${inv.count('purification_tablets')} | ${__toasts.slice(-1)}`);
    const wb = I.createItem('water_bottle', { data: { liquid: 'dirty_water' }, uses: 4 }); inv.addItem(wb);
    const bl = I.createItem('bleach'); inv.addItem(bl);
    o.push('bleach actions: ' + H.actions(bl).join(', ') + ' | dbl-click -> ' + use(bl) + ` bottle=${wb.data.liquid} bleach uses=${bl.uses} tablets=${inv.count('purification_tablets')}`);
    // ---- tweezers / glass, burn cream
    P.wounds = []; S.addWound('glass', 'legL'); S.addWound('burn', 'armR');
    H.give('tweezers'); H.give('burn_cream');
    o.push('glass treatments: ' + g.getTreatments(0).map((t) => t.label).join(', '));
    const tw = H.find('tweezers').stack; o.push('tweezers use -> ' + use(tw) + ' wounds ' + JSON.stringify(P.wounds.map((w) => w.type + (w.embedded ? '+emb' : '') + (w.bleeding ? '+bleed' : '') + (w.burnTreated ? '+treated' : ''))) + ' tweezers dur ' + tw.dur + ' | ' + __toasts.slice(-1));
    const bc = H.find('burn_cream').stack; o.push('burn cream -> ' + use(bc) + ' ' + JSON.stringify(P.wounds.map((w) => w.type + (w.burnTreated ? '+treated' : ''))) + ' uses ' + bc.uses);
    // ---- bashing a can open
    H.clearInv(); P.hunger = 40; __toasts.length = 0;
    H.give('canned_beans'); H.give('hammer');
    const can = H.find('canned_beans').stack; o.push('beans + hammer actions: ' + H.actions(can).join(', '));
    o.push('bash: ' + use(can) + ` hunger ${P.hunger.toFixed(1)} | ${__toasts.join(' | ')}`);
    // ---- pocket rules
    H.clearInv(); inv.setEquipped('back', null);
    for (const id of ['leather_jacket', 'backpack_school', 'baseball_bat', 'pistol_m9', 'kitchen_knife', 'log', 'canned_beans', 'work_boots', 'bandana', 'water_jug', 'water_bottle']) H.give(id);
    const where = (id) => { const f = H.find(id); if (!f) return 'GROUND'; if (f.slots === inv.hotbar) return 'hotbar'; const d = inv.storageDescs().find((d) => d.slots === f.slots); return d ? d.name : '?'; };
    o.push('placement (no bag): ' + ['leather_jacket', 'backpack_school', 'baseball_bat', 'pistol_m9', 'kitchen_knife', 'log', 'canned_beans', 'work_boots', 'bandana', 'water_jug', 'water_bottle'].map((id) => id + '→' + where(id)).join(' '));
    // ---- equip swaps
    H.clearInv(); inv.equipment[8] = null;
    inv.setEquipped('back', I.createItem('backpack_school'));
    const school = inv.getEquipped('back');
    for (const id of ['canned_beans', 'canned_soup', 'apple']) H.give(id);
    const hike = I.createItem('backpack_hiking'); school.contents[11] = hike; inv.changed();
    o.push('before swap: school=' + school.contents.filter(Boolean).map((s) => s.id).join(','));
    const r = H.descOf(hike); g.useItem(r.d, r.i);
    o.push(`after dbl-click hiking pack: back=${inv.getEquipped('back')?.id} hiking=${inv.getEquipped('back').contents.filter(Boolean).map((s) => s.id).join(',')} school at ${where('backpack_school')} with ${school.contents.filter(Boolean).length} | ${__toasts.slice(-1)}`);
    // jacket swap: hoodie with stuff in pockets -> wear leather jacket
    inv.setEquipped('jacket', I.createItem('hoodie'));
    const hood = inv.getEquipped('jacket'); hood.contents[0] = I.createItem('lighter'); hood.contents[1] = I.createItem('chocolate');
    const lj = I.createItem('leather_jacket'); inv.addItem(lj);
    { const r2 = H.descOf(lj); g.useItem(r2.d, r2.i); }
    o.push(`jacket swap: jacket=${inv.getEquipped('jacket')?.id} lj pockets=${inv.getEquipped('jacket').contents.filter(Boolean).map((s) => s.id).join(',')} hoodie at ${where('hoodie')} contents ${hood.contents.filter(Boolean).length} | ${__toasts.slice(-1)}`);
    // unequip jacket via double-click on the equipment slot
    { const ed = inv.equipmentDesc(); g.useItem(ed, 3); }
    o.push(`unequip leather jacket: at ${where('leather_jacket')} lighter at ${where('lighter')} choc at ${where('chocolate')} | ${__toasts.slice(-1)}`);
    // ---- tooltips
    for (const id of ['multitool', 'can_opener', 'first_aid_kit', 'tweezers', 'purification_tablets', 'cigarettes', 'backpack_hiking', 'jeans', 'apple', 'book_aiming', 'torch', 'water_jug']) {
      const d = g.describeItem(I.createItem(id));
      o.push(`tip ${id}: ${d.name} :: ${d.lines.slice(1).join(' / ')}`);
    }
    return o;
  });
  console.log(out.join('\n'));

  // ---------------------------------------------------------------- long simulations
  const sims = await ev(() => {
    const g = H.g, P = g.player, S = g.survival, I = __items, inv = P.inv;
    const o = [];
    const base = () => { P.dead = false; P.health = 100; P.hunger = 80; P.thirst = 80; P.energy = 80; P.bodyTemp = 37; P.wetness = 0; P.sickness = 0; P.infection = 0; P.infected = false; P.infectionKnown = false; P.wounds = []; P.pain = 0; P.painkiller = 0; P.antiviralProtect = 0; P.drunk = 0; P.panic = 0; };
    const run = (hours, ctx = {}, every = 0, cb) => {
      for (let h = 0; h < hours * 60; h++) {
        S.update({ dt: 1, dtH: 1 / 60, ambient: 14, indoor: false, raining: 0, nearFire: false, threat: 0, sleeping: false, carryFactor: 1, ...ctx });
        if (P.dead) break;
        if (every && h % (every * 60) === 0 && cb) cb(h / 60);
        P.hunger = Math.max(P.hunger, 60); P.thirst = Math.max(P.thirst, 60);
      }
    };
    S.onDeath = (c) => o.push('   DEATH: ' + c);
    // bandaged laceration healing timeline
    base(); S.addWound('laceration', 'armL'); Object.assign(P.wounds[0], { bleeding: false, bandaged: true, bandageAge: 0 });
    const tl = []; run(24, {}, 2, (h) => tl.push(`${h}h:${P.wounds[0] ? (P.wounds[0].heal * 100).toFixed(0) + '%' + (P.wounds[0].bandageDirty ? 'D' : '') + (P.wounds[0].infected ? 'I' : '') : 'healed'}`));
    o.push('laceration bandaged: ' + tl.join(' '));
    // untreated scratch: bleeding stops by itself? infection?
    let inf = 0, healedT = [];
    for (let k = 0; k < 20; k++) { base(); S.addWound('scratch', 'armR'); let t = 0; for (; t < 30 * 60 && P.wounds.length; t++) { S.update({ dt: 1, dtH: 1 / 60, ambient: 14, indoor: false, raining: 0, nearFire: false, threat: 0, sleeping: false, carryFactor: 1 }); if (P.wounds[0]?.infected) { inf++; break; } } healedT.push((t / 60).toFixed(1)); }
    o.push(`untreated scratch x20: infected ${inf}, time to heal/infect (h) ${healedT.join(',')}; hp after one scratch ~${(() => { base(); S.addWound('scratch', 'armR'); run(2); return P.health.toFixed(1); })()}`);
    base(); S.addWound('laceration', 'armR'); run(4); o.push(`untreated laceration: hp after 4h ${P.health.toFixed(1)} bleeding ${P.wounds[0]?.bleeding}`);
    base(); S.addWound('deep', 'torso'); run(4); o.push(`untreated deep wound: dead ${P.dead} cause ${P.deathCause} hp ${P.health.toFixed(1)}`);
    // infected wound -> sickness
    base(); S.addWound('laceration', 'legL'); Object.assign(P.wounds[0], { bleeding: false, bandaged: true, infected: true });
    const sk = []; run(30, {}, 5, (h) => sk.push(`${h}h:sick${P.sickness.toFixed(0)} T${P.bodyTemp.toFixed(1)} hp${P.health.toFixed(0)}`)); o.push('infected wound: ' + sk.join(' '));
    // zombie infection progression
    base(); P.infected = true; P.infection = 1; const zi = []; run(90, {}, 10, (h) => zi.push(`${h}h:${P.infection.toFixed(0)}${P.infectionKnown ? 'K' : ''} hp${P.health.toFixed(0)}`)); o.push('zombie infection: ' + zi.join(' ') + ` dead=${P.dead} ${P.deathCause}`);
    base(); P.infected = true; P.infection = 1; P.antiviralProtect = 24; run(24); o.push(`infection with antiviral protection 24h: ${P.infection.toFixed(1)}`);
    // temperature
    const temp = (label, outfit, ctx, hours = 8) => {
      base(); inv.equipment.fill(null); for (const id of outfit) inv.setEquipped(I.getItemDef(id).clothing.slot, I.createItem(id));
      const tl2 = []; run(hours, ctx, 2, (h) => tl2.push(`${h}h:${P.bodyTemp.toFixed(1)}/${P.wetness.toFixed(0)}`));
      o.push(`${label.padEnd(34)} ins ${P.insulation.toFixed(2)} -> ${tl2.join(' ')} end ${P.bodyTemp.toFixed(1)} hp ${P.health.toFixed(0)} [${P.moodles.filter((m) => ['cold', 'hot', 'wet'].includes(m.id)).map((m) => m.label).join(',')}]`);
    };
    const start = ['tshirt', 'jeans', 'sneakers', 'hoodie'];
    temp('night 4C dry, starter outfit', start, { ambient: 4 });
    temp('night 4C rain, starter outfit', start, { ambient: 4, raining: 1 });
    temp('night 4C rain, raincoat', ['tshirt', 'jeans', 'sneakers', 'raincoat'], { ambient: 4, raining: 1 });
    temp('night 4C, t-shirt only', ['tshirt'], { ambient: 4 });
    temp('night 4C, winter outfit', ['thermal_shirt', 'winter_coat', 'jeans', 'hiking_boots', 'beanie', 'winter_gloves'], { ambient: 4 });
    temp('day 16C, winter outfit, moving', ['thermal_shirt', 'winter_coat', 'jeans', 'hiking_boots', 'beanie', 'winter_gloves'], { ambient: 16 });
    temp('night 4C wet, near fire', start, { ambient: 4, nearFire: true });
    temp('night 4C indoors', start, { ambient: 4, indoor: true });
    // starvation / dehydration time-to-death
    base(); P.hunger = 0; P.thirst = 100; let t = 0; for (; t < 100 * 60 && !P.dead; t++) { S.update({ dt: 1, dtH: 1 / 60, ambient: 14, indoor: false, raining: 0, nearFire: false, threat: 0, sleeping: false, carryFactor: 1 }); P.thirst = 100; } o.push(`starving from 0: dead after ${(t / 60).toFixed(1)}h (${P.deathCause})`);
    base(); P.thirst = 0; t = 0; for (; t < 100 * 60 && !P.dead; t++) { S.update({ dt: 1, dtH: 1 / 60, ambient: 14, indoor: false, raining: 0, nearFire: false, threat: 0, sleeping: false, carryFactor: 1 }); P.hunger = 100; } o.push(`dehydrated from 0: dead after ${(t / 60).toFixed(1)}h (${P.deathCause})`);
    base(); P.dead = false;
    return o;
  });
  console.log(sims.join('\n'));
  dumpErrors(errors);
  await b.close();
})();
