// Food, drinks and personal-care products.
import * as THREE from 'three';
import { G } from '../../game.js';
import { findOwned, behaviors } from './util.js';
import { rand } from '../../core/utils.js';

function eatenFraction(inst) {
  const u = inst.def.use;
  const total = u.bites || u.sips || 1;
  const left = inst.st.left ?? total;
  return { total, left, frac: left / total };
}

function applyShrink(inst) {
  if (!inst.built || !inst.model) return;
  const { frac } = eatenFraction(inst);
  // parts tagged with userData.bite get hidden in order; otherwise shrink
  const parts = [];
  inst.model.traverse((o) => { if (o.userData.bite != null) parts.push(o); });
  if (parts.length) {
    parts.sort((a, b) => a.userData.bite - b.userData.bite);
    const eaten = Math.round((1 - frac) * parts.length);
    parts.forEach((p, i) => (p.visible = i >= eaten));
  } else if (inst.def.use.type === 'eat') {
    const s = 0.35 + 0.65 * frac;
    inst.model.scale.set(s, 0.55 + 0.45 * frac, s);
  }
  // liquid level for drinks
  inst.model.traverse((o) => { if (o.userData.liquid) { o.scale.y = Math.max(0.001, frac); o.visible = frac > 0.01; } });
}

function finishConsumable(inst) {
  const u = inst.def.use;
  const left = u.leftover;
  const wasHeld = G.hand.held === inst;
  G.items.destroy(inst);
  if (left) {
    const l = G.items.spawn(left, { loc: 'storage' });
    if (l && wasHeld) G.hand.take(l);
  }
}

function isHot(inst) {
  return inst.def.use.hot && inst.st.madeAt != null && G.clock.total - inst.st.madeAt < 45;
}

const eat = {
  init(inst) { if (inst.def.use.hot && inst.st.madeAt == null) inst.st.madeAt = G.clock.total; applyShrink(inst); },
  subtitle(inst) {
    const { left, total } = eatenFraction(inst);
    const hot = isHot(inst) ? ' · 🔥 hot' : '';
    return left < total ? `${left}/${total} bites left${hot}` : `${total} bites${hot}`;
  },
  held(inst) {
    const { left } = eatenFraction(inst);
    return [{ key: 'LMB', label: left > 1 ? 'Take a bite' : 'Finish it', run: () => eat.bite(inst) }];
  },
  world(inst) { return [{ key: 'F', label: 'Eat', run: () => { G.items.pickUp(inst); eat.bite(inst); } }]; },
  async bite(inst) {
    if (G.hand.busy) return;
    const u = inst.def.use;
    G.hand.busy = true;
    await G.hand.play(u.anim || 'bite', {
      onMid: () => {
        G.audio.play(u.sound || 'bite', { pitch: rand(0.9, 1.1) });
        G.particles.crumbs(G.hand.mouthWorld(), u.crumbs || '#d9b07a', 5);
        const total = u.bites || 4;
        inst.st.left = (inst.st.left ?? total) - 1;
        const per = {};
        for (const [k, v] of Object.entries(u.needs || { hunger: 25 })) per[k] = v / total * (isHot(inst) ? 1.15 : 1);
        G.needs.add(per);
        applyShrink(inst);
      },
    });
    G.hand.busy = false;
    if ((inst.st.left ?? 1) <= 0) {
      G.state.stats.eaten++;
      if (u.buff) G.needs.addBuff(u.buff, u.buffMin || 120);
      G.events.emit('act', 'eat', { item: inst.def.id, tags: inst.def.tags, cuisine: u.cuisine, sweet: u.sweet, healthy: u.healthy, homemade: inst.st.homemade });
      G.ui.toast(`Finished ${inst.def.name} ${u.emoji || '😋'}`, { icon: '🍽️' });
      finishConsumable(inst);
    }
  },
  update(inst, dt) {
    if (isHot(inst) && Math.random() < dt * 4) {
      const p = inst.object.getWorldPosition(new THREE.Vector3());
      if (inst.data.loc === 'world') { p.y += 0.08; G.particles.steam(p, 1, { size: 0.03, sizeEnd: 0.14, alpha: 0.15, life: 1.6 }); }
    }
  },
};

const drink = {
  init(inst) { if (inst.def.use.hot && inst.st.madeAt == null) inst.st.madeAt = G.clock.total; applyShrink(inst); },
  subtitle(inst) {
    const { left, total } = eatenFraction(inst);
    const open = inst.def.use.open && !inst.st.opened ? ' · sealed' : '';
    return `${Math.round(left / total * 100)}% full${open}${isHot(inst) ? ' · ☕ hot' : ''}`;
  },
  held(inst) {
    const u = inst.def.use;
    if (u.open && !inst.st.opened) return [{ key: 'LMB', label: u.open === 'can' ? 'Crack open' : u.open === 'bottle' ? 'Twist open' : 'Open', run: () => drink.open(inst) }];
    return [{ key: 'LMB', label: 'Take a sip', run: () => drink.sip(inst) }];
  },
  world(inst) { return [{ key: 'F', label: 'Drink', run: () => { G.items.pickUp(inst); if (!inst.def.use.open || inst.st.opened) drink.sip(inst); else drink.open(inst); } }]; },
  async open(inst) {
    const u = inst.def.use;
    G.hand.busy = true;
    await G.hand.play('flick', {
      onMid: () => {
        inst.st.opened = true;
        if (u.open === 'can') { G.audio.play('canopen'); G.particles.mist(G.hand.tipWorld(new THREE.Vector3(0, 0.12, 0)), new THREE.Vector3(0, 1, 0), 6, '#ffffff', { speed: 0.4, alpha: 0.4, sizeEnd: 0.05 }); }
        else if (u.open === 'bottle') { G.audio.play('click', { pitch: 0.6 }); if (u.fizzy) G.audio.play('fizz', { delay: 0.05 }); }
        else G.audio.play('paper');
        const tab = inst.model?.getObjectByName('tab'); if (tab) tab.rotation.x = -1.2;
        const cap = inst.model?.getObjectByName('cap'); if (cap) cap.visible = false;
      },
    });
    G.hand.busy = false;
  },
  async sip(inst) {
    if (G.hand.busy) return;
    const u = inst.def.use;
    G.hand.busy = true;
    await G.hand.play('sip', {
      mid: 0.5,
      onMid: () => {
        G.audio.play(u.sound || 'sip', { pitch: rand(0.9, 1.1) });
        const total = u.sips || 5;
        inst.st.left = (inst.st.left ?? total) - 1;
        const per = {};
        for (const [k, v] of Object.entries(u.needs || { thirst: 25 })) per[k] = v / total;
        G.needs.add(per);
        applyShrink(inst);
      },
    });
    G.hand.busy = false;
    if ((inst.st.left ?? 1) <= 0) {
      G.state.stats.drank++;
      if (u.buff) G.needs.addBuff(u.buff, u.buffMin || 120);
      G.events.emit('act', 'drink', { item: inst.def.id, tags: inst.def.tags, caffeine: u.buff === 'caffeinated' });
      G.ui.toast(`Finished ${inst.def.name}`, { icon: u.emoji || '🥤' });
      finishConsumable(inst);
    }
  },
  update: eat.update,
};

// ---------------------------------------------------------------- hygiene
function needsSinkHint() { G.ui.toast('Aim at a sink to use this', { icon: '🚰' }); }

const toothbrush = {
  held(inst) { return [{ key: 'LMB', label: 'Brush teeth (at a sink)', run: () => { if (G.interaction.focus?.isSink) toothbrush.brush(inst); else needsSinkHint(); } }]; },
  sink(inst) { return { key: 'E', label: 'Brush teeth', run: () => toothbrush.brush(inst) }; },
  async brush(inst) {
    if (G.hand.busy) return;
    const paste = findOwned((i) => i.def.use?.type === 'toothpaste');
    G.hand.busy = true;
    const loop = G.audio.loop('water', { volume: 0.25 });
    const foamT = setInterval(() => G.particles.burst(G.hand.mouthWorld(), 2, ['#ffffff', '#dff6ff'], { speed: 0.3, up: 0.1, size: 0.012, life: 0.6 }), 120);
    const scrub = setInterval(() => G.audio.play('rustle', { volume: 0.25 }), 260);
    await G.hand.play('brush');
    clearInterval(foamT); clearInterval(scrub); loop.stop();
    G.hand.busy = false;
    if (paste) {
      behaviors.consumeUse(paste);
      G.needs.add({ hygiene: 16, comfort: 3 });
      G.needs.addBuff('minty', 240);
      G.ui.toast(`Sparkling clean with ${paste.def.name}`, { icon: '🦷', kind: 'good' });
    } else {
      G.needs.add({ hygiene: 6 });
      G.ui.toast('Brushed... but toothpaste would help', { icon: '🪥' });
    }
    G.events.emit('act', 'brushTeeth', { paste: !!paste });
  },
};

const toothpaste = {
  subtitle: (inst) => `${behaviors.usesLeft(inst)} uses left`,
  held(inst) { return [{ key: 'LMB', label: 'Squeeze a little', run: async () => { await G.hand.play('squeeze'); G.audio.play('squish', { pitch: 1.4 }); G.particles.burst(G.hand.tipWorld(new THREE.Vector3(0, 0.1, 0)), 3, [inst.def.use.color || '#7fd3ff', '#ffffff'], { speed: 0.2, up: 0.2, size: 0.01 }); } }]; },
};

const spray = {
  subtitle: (inst) => `${behaviors.usesLeft(inst)} sprays left${inst.def.use.scent ? ' · ' + inst.def.use.scent : ''}`,
  held(inst) { return [{ key: 'LMB', label: inst.def.use.verb || 'Spritz', run: () => spray.go(inst) }]; },
  async go(inst) {
    if (G.hand.busy) return;
    const u = inst.def.use;
    G.hand.busy = true;
    await G.hand.play('spray', {
      mid: 0.35,
      onMid: () => {
        G.audio.play('spray', { pitch: rand(0.9, 1.15) });
        const f = G.hand.forwardWorld();
        G.particles.mist(G.hand.tipWorld(new THREE.Vector3(0, 0.15, 0)), f.clone().add(new THREE.Vector3(-0.3, 0.1, 0)).normalize(), 18, u.mist || '#ffffff', { alpha: 0.3, sizeEnd: 0.2 });
      },
    });
    G.hand.busy = false;
    if (u.needs) G.needs.add(u.needs);
    if (u.buff) G.needs.addBuff(u.buff, u.buffMin || 180);
    G.events.emit('act', 'spray', { item: inst.def.id });
    behaviors.consumeUse(inst);
  },
};

const soap = {
  subtitle: (inst) => `${behaviors.usesLeft(inst)} washes left`,
  held(inst) { return [{ key: 'LMB', label: 'Wash hands (at a sink)', run: () => { if (G.interaction.focus?.isSink) soap.wash(inst); else needsSinkHint(); } }]; },
  sink(inst) { return { key: 'E', label: `Wash with ${inst.def.name}`, run: () => soap.wash(inst) }; },
  async wash(inst) {
    const sink = G.interaction.focus;
    G.hand.busy = true;
    const bub = setInterval(() => G.particles.bubble(G.hand.tipWorld(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(rand(-0.1, 0.1), 0.15, rand(-0.1, 0.1)), { size: rand(0.02, 0.04), life: 2, onDie: (q) => G.audio.play('bubblepop', { pos: new THREE.Vector3(q.x, q.y, q.z), volume: 0.3 }) }), 160);
    const ok = sink?.withWater ? await sink.withWater('Lathering up', 3.5, '🧼') : sink?.run ? await sink.run('Lathering up', 3.5, '🧼') : await G.ui.progress('Lathering up', 3.5, { icon: '🧼' });
    clearInterval(bub);
    G.hand.busy = false;
    if (!ok) return;
    G.needs.add({ hygiene: 22, comfort: 3 });
    G.needs.addBuff('clean', 150);
    G.events.emit('act', 'washHands', { soap: true });
    behaviors.consumeUse(inst);
  },
};

const showerProduct = {
  subtitle: (inst) => `${behaviors.usesLeft(inst)} uses · used automatically when you shower`,
  held(inst) { return [{ key: 'LMB', label: 'Smell it', run: async () => { await G.hand.play('raise'); G.ui.toast(`Mmm, ${inst.def.use.scent || 'fresh'}.`, { icon: '👃' }); G.needs.add({ comfort: 2 }); } }]; },
};

const skincare = {
  subtitle: (inst) => (inst.def.use.uses ? `${behaviors.usesLeft(inst)} uses left` : ''),
  held(inst) { return [{ key: 'LMB', label: inst.def.use.verb || 'Apply', run: () => skincare.apply(inst) }]; },
  async apply(inst) {
    if (G.hand.busy) return;
    const u = inst.def.use;
    G.hand.busy = true;
    await G.hand.play('raise', { onMid: () => G.audio.play(u.sound || 'squish', { pitch: 1.3 }) });
    G.hand.busy = false;
    if (u.overlay) G.ui.faceOverlay(u.overlay, u.overlaySec || 25);
    if (u.needs) G.needs.add(u.needs);
    if (u.buff) G.needs.addBuff(u.buff, u.buffMin || 180);
    G.events.emit('act', 'selfcare', { item: inst.def.id });
    if (u.uses) behaviors.consumeUse(inst);
    else if (u.single) { G.items.destroy(inst); if (u.leftover) G.hand.take(G.items.spawn(u.leftover)); }
  },
};

const bathbomb = {
  held() { return [{ key: 'LMB', label: 'Sniff (use it in the bathtub: F)', run: async () => { await G.hand.play('raise'); G.ui.toast('Smells amazing. Take it to the bathtub!', { icon: '🛁' }); } }]; },
};

const hairdryer = {
  held(inst) {
    return [{
      key: 'LMB', label: 'Blow-dry hair', run: async () => {
        if (G.hand.busy) return;
        G.hand.busy = true;
        const l = G.audio.loop('fan', { volume: 0.6 });
        await G.hand.play('wave', { duration: 2.5 });
        l.stop(); G.hand.busy = false;
        G.needs.addBuff('goodHair', 240); G.needs.add({ comfort: 4 });
        G.events.emit('act', 'selfcare', { item: inst.def.id });
      },
    }];
  },
};

const vitamins = {
  subtitle: (inst) => `${behaviors.usesLeft(inst)} left`,
  held(inst) {
    return [{ key: 'LMB', label: 'Take one', run: async () => { await G.hand.play('bite', { onMid: () => G.audio.play('glug') }); G.needs.addBuff(inst.def.use.buff || 'vitalized', 360); if (inst.def.use.needs) G.needs.add(inst.def.use.needs); behaviors.consumeUse(inst); } }];
  },
};

export const consumables = { eat, drink, toothbrush, toothpaste, spray, soap, shampoo: showerProduct, bodywash: showerProduct, conditioner: showerProduct, skincare, bathbomb, hairdryer, vitamins };
export { applyShrink };
