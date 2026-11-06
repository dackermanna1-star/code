// Item QA: eat every food, drink every drink, use every medical item; context menus for every item.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(1000);
  await ev(() => {
    const g = H.g;
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true;
    g.zombies.clearAll?.();
    g.player.inv.setEquipped('back', __items.createItem('backpack_military'));
  });

  // ---------------------------------------------------------------- foods
  const foods = await ev(() => {
    const g = H.g, P = g.player, I = __items;
    const out = [];
    const ids = Object.keys(I.ITEMS).filter((id) => I.ITEMS[id].food);
    for (const id of ids) {
      H.clearInv();
      __toasts.length = 0;
      P.hunger = 40; P.thirst = 60; P.sickness = 0; P.panic = 30; P.energy = 50; P.health = 80;
      H.give(id);
      const st = H.find(id).stack;
      const acts = H.actions(st);
      const before = { h: P.hunger, t: P.thirst, s: P.sickness, pa: P.panic, e: P.energy, hp: P.health };
      const r = H.descOf(st);
      g.useItem(r.d, r.i);
      let started = !!g.action;
      let note = '';
      if (!started) {
        note = 'blocked: ' + __toasts.join('|');
        // give the requirement and retry
        H.give('can_opener'); H.give('lighter');
        const r2 = H.descOf(st);
        g.useItem(r2.d, r2.i);
        started = !!g.action;
      }
      const label = g.action?.label, time = g.action?.time;
      H.finish();
      const left = H.find(id);
      out.push(`${id.padEnd(16)} [${acts.join(', ')}] ${label} ${time}s  dH ${(P.hunger - before.h).toFixed(1)} dT ${(P.thirst - before.t).toFixed(1)} dS ${(P.sickness - before.s).toFixed(1)} dPan ${(P.panic - before.pa).toFixed(1)} dE ${(P.energy - before.e).toFixed(1)} dHP ${(P.health - before.hp).toFixed(1)} left:${left ? (left.stack.uses ?? left.stack.count) : 'none'} leaves:${H.find('tin_can') ? 'tin_can' : ''}${H.find('soda_can') ? 'soda_can' : ''} ${note} ${__toasts.slice(-2).join('|')}`);
    }
    return out;
  });
  console.log('=== FOODS\n' + foods.join('\n'));

  // spoilage + full
  const spoil = await ev(() => {
    const g = H.g, P = g.player, I = __items, now = g.time.totalHours;
    const out = [];
    for (const [id, ageAgo] of [['apple', 400], ['bread', 60], ['raw_meat', 5], ['milk', 100], ['cooked_meat', 10]]) {
      H.clearInv(); __toasts.length = 0;
      P.hunger = 40; P.thirst = 50; P.sickness = 0;
      const s = I.createItem(id, { age: now - ageAgo });
      P.inv.addItem(s);
      const d = g.describeItem(s);
      const name = I.itemDisplayName(s, now);
      const r = H.descOf(s);
      g.useItem(r.d, r.i); H.finish();
      out.push(`${id} age-${ageAgo}: name="${name}" tip=[${d.lines.join(' / ')}] -> hunger ${P.hunger.toFixed(1)} thirst ${P.thirst.toFixed(1)} sick ${P.sickness.toFixed(1)} toasts:${__toasts.join('|')}`);
    }
    // too full
    H.clearInv(); __toasts.length = 0; P.hunger = 99; H.give('chips'); const st = H.find('chips').stack; const r = H.descOf(st); g.useItem(r.d, r.i); out.push('full: action=' + !!g.action + ' ' + __toasts.join('|')); g.cancelAction();
    // cooking near no fire
    H.clearInv(); H.give('raw_meat'); out.push('raw_meat actions (no fire): ' + H.actions(H.find('raw_meat').stack).join(', '));
    return out;
  });
  console.log('=== SPOIL\n' + spoil.join('\n'));

  // ---------------------------------------------------------------- drinks
  const drinks = await ev(() => {
    const g = H.g, P = g.player, I = __items;
    const out = [];
    const ids = Object.keys(I.ITEMS).filter((id) => I.ITEMS[id].drink || I.ITEMS[id].liquidContainer);
    const variants = [];
    for (const id of ids) variants.push([id, {}]);
    variants.push(['water_bottle', { data: { liquid: 'dirty_water' }, uses: 3 }]);
    variants.push(['water_bottle', { uses: 0 }]);
    variants.push(['pot', { data: { liquid: 'dirty_water' }, uses: 6 }]);
    for (const [id, o] of variants) {
      H.clearInv(); __toasts.length = 0;
      P.thirst = 40; P.hunger = 50; P.sickness = 0; P.drunk = 0; P.energy = 50;
      const s = I.createItem(id, o); P.inv.addItem(s);
      const acts = H.actions(s);
      const tip = g.describeItem(s).lines.slice(1).join(' / ');
      const before = { t: P.thirst, h: P.hunger, s: P.sickness, d: P.drunk, e: P.energy };
      const r = H.descOf(s);
      g.useItem(r.d, r.i);
      const started = !!g.action;
      H.finish();
      const left = H.find(id);
      out.push(`${id.padEnd(14)} ${JSON.stringify(o)} [${acts.join(', ')}] started:${started} dT ${(P.thirst - before.t).toFixed(1)} dH ${(P.hunger - before.h).toFixed(1)} dS ${(P.sickness - before.s).toFixed(1)} drunk ${(P.drunk - before.d).toFixed(1)} dE ${(P.energy - before.e).toFixed(1)} left:${left ? 'uses=' + left.stack.uses + ' liq=' + left.stack.data?.liquid + ' name=' + I.itemDisplayName(left.stack) : 'none'} empties:${['soda_can', 'glass_bottle', 'plastic_bottle'].filter((x) => H.find(x)).join(',')} tip:${tip} ${__toasts.join('|')}`);
    }
    return out;
  });
  console.log('=== DRINKS\n' + drinks.join('\n'));

  // ---------------------------------------------------------------- medical
  const med = await ev(() => {
    const g = H.g, P = g.player, I = __items, S = g.survival;
    const out = [];
    const reset = () => { H.clearInv(); __toasts.length = 0; P.wounds = []; P.health = 70; P.pain = 50; P.panic = 50; P.sickness = 30; P.energy = 50; P.infected = false; P.infection = 0; P.infectionKnown = false; };
    const ids = Object.keys(I.ITEMS).filter((id) => I.ITEMS[id].medical || I.ITEMS[id].purify);
    for (const id of ids) {
      reset();
      S.addWound('laceration', 'armL'); S.addWound('deep', 'torso'); S.addWound('fracture', 'legL');
      P.wounds[0].infected = true;
      P.infected = false; P.infection = 0;
      const s = I.createItem(id); P.inv.addItem(s);
      const acts = H.actions(s);
      const r = H.descOf(s);
      g.useItem(r.d, r.i);
      const lbl = g.action?.label;
      H.finish();
      const left = H.find(id);
      out.push(`${id.padEnd(20)} [${acts.join(', ')}] ${lbl || '-'} -> ${JSON.stringify(H.stats().wounds)} hp ${P.health.toFixed(0)} pain ${P.pain.toFixed(0)} panic ${P.panic.toFixed(0)} sick ${P.sickness.toFixed(0)} en ${P.energy.toFixed(0)} pk ${P.painkiller} left:${left ? (left.stack.uses ?? left.stack.count) : 'none'} ${__toasts.join('|')}`);
    }
    // antiviral vs zombie infection
    reset(); P.infected = true; P.infection = 30; P.infectionKnown = true; H.give('antiviral'); { const r = H.descOf(H.find('antiviral').stack); g.useItem(r.d, r.i); H.finish(); }
    out.push(`antiviral @30: infected ${P.infected} inf ${P.infection.toFixed(1)} known ${P.infectionKnown} ${__toasts.join('|')}`);
    reset(); P.infected = true; P.infection = 70; P.infectionKnown = true; H.give('antiviral'); { const r = H.descOf(H.find('antiviral').stack); g.useItem(r.d, r.i); H.finish(); }
    out.push(`antiviral @70: infected ${P.infected} inf ${P.infection.toFixed(1)} known ${P.infectionKnown} ${__toasts.join('|')}`);
    // treatments for each wound type
    reset();
    for (const t of ['scratch', 'laceration', 'bite', 'deep', 'bullet', 'fracture', 'burn', 'glass']) S.addWound(t, 'armR');
    for (const id of ['bandage', 'sterile_bandage', 'rag', 'rag_dirty', 'disinfectant', 'alcohol_wipes', 'whiskey', 'suture_kit', 'splint', 'antibiotics', 'tweezers', 'burn_cream', 'hemostatic_gauze', 'moonshine']) H.give(id);
    P.wounds[1].infected = true;
    P.wounds.forEach((w, i) => out.push(`treat ${w.type}: ${g.getTreatments(i).map((t) => t.label + (t.disabled ? '(x)' : '')).join(', ')}`));
    return out;
  });
  console.log('=== MEDICAL\n' + med.join('\n'));
  dumpErrors(errors);
  await b.close();
})();
