// Countertop appliances that turn groceries into food & drinks: coffee
// machines, kettles, toasters, microwaves, blenders, waffle irons...
//
// use: { type: 'station', recipes: [{ label, needs: [itemId...], makes: itemId, seconds, sound, free? }],
//        out: [x,y,z] (local spawn point), anim: 'spin'|'pop'|'glow'|'door', loop: 'hum' }
import * as THREE from 'three';
import { G } from '../../game.js';
import { worldPos, itemYaw } from './home.js';
import { consumeUse } from './util.js';
import { getDef } from '../registry.js';
import { tween, Ease } from '../../core/tween.js';

function ingredientsAvailable(needs = []) {
  const used = new Set();
  const found = [];
  for (const id of needs) {
    const inst = G.items.all().find((i) => !used.has(i) && i.def.id === id && !['package', 'gone', 'placing', 'worn'].includes(i.data.loc));
    if (!inst) return null;
    used.add(inst); found.push(inst);
  }
  return found;
}

function useIngredient(inst) {
  if (inst.def.use?.uses) consumeUse(inst);
  else G.items.destroy(inst);
}

const station = {
  init(inst) {
    const g = inst.model.getObjectByName('glow');
    if (g) { g.material = g.material.clone(); inst.runtime.glow = g; }
  },
  world(inst) {
    const u = inst.def.use;
    if (inst.runtime.busy) return [{ key: 'E', label: `${u.busyLabel || 'Working'}…`, run: () => {}, disabled: true }];
    const held = G.hand.held;
    const a = [];
    if (u.reheat && held?.def.use?.hot) a.push({ key: 'F', label: `Reheat ${held.def.name}`, run: () => station.reheat(inst, held) });
    const avail = u.recipes.filter((r) => r.free || ingredientsAvailable(r.needs));
    a.unshift({ key: 'E', label: u.recipes.length === 1 ? u.recipes[0].label : `${u.verb || 'Make'} something…`, run: () => station.menu(inst) });
    void avail;
    return a;
  },
  async menu(inst) {
    const u = inst.def.use;
    const opts = u.recipes.map((r) => {
      const ok = r.free || !!ingredientsAvailable(r.needs);
      const needNames = (r.needs || []).map((n) => getDef(n)?.name || n).join(' + ');
      return { label: r.label, sub: r.free ? 'Always available' : ok ? `Uses ${needNames}` : `Needs ${needNames}`, value: r, disabled: !ok, icon: getDef(r.makes)?.emoji };
    });
    let r;
    if (opts.length === 1 && !opts[0].disabled) r = opts[0].value;
    else r = await G.ui.choose(`${inst.def.name}`, opts, { icon: inst.def.emoji || '🍳' });
    if (!r) { if (opts.length === 1) G.ui.toast(opts[0].sub, { kind: 'bad', icon: '🛒' }); return; }
    station.make(inst, r);
  },
  async make(inst, r) {
    const u = inst.def.use;
    const ing = r.free ? [] : ingredientsAvailable(r.needs);
    if (!ing) return;
    inst.runtime.busy = true;
    ing.forEach(useIngredient);
    const p = worldPos(inst, [0, 0.2, 0]);
    const loop = (r.loop || u.loop) ? G.audio.loop(r.loop || u.loop, { pos: p, volume: 0.5 }) : null;
    if (r.sound || u.sound) G.audio.play(r.sound || u.sound, { pos: p });
    inst.runtime.anim = u.anim; inst.runtime.animT = 0;
    if (inst.runtime.glow) inst.runtime.glow.material.emissiveIntensity = 2;
    const ok = await G.ui.progress(r.label, r.seconds || u.seconds || 6, { icon: getDef(r.makes)?.emoji || '⏳', cancelable: true });
    loop?.stop();
    inst.runtime.anim = null;
    if (inst.runtime.glow) inst.runtime.glow.material.emissiveIntensity = 0;
    inst.runtime.busy = false;
    if (!ok) return;
    G.audio.play(u.doneSound || 'ding', { pos: p });
    if (u.anim === 'pop') { G.audio.play('toaster', { pos: p }); }
    const outLocal = new THREE.Vector3(...(r.out || u.out || [0.3, 0, 0.1]));
    const out = inst.object.localToWorld(outLocal.clone());
    const made = G.items.spawn(r.makes, { loc: 'world', pos: out, yaw: itemYaw(inst), st: { madeAt: G.clock.total, homemade: true } });
    if (made?.built) {
      const o = made.object; o.scale.setScalar(0.01);
      tween({ duration: 0.45, ease: Ease.outBack, update: (t, e) => o.scale.setScalar(Math.max(0.01, e)) });
      G.particles.sparkle(out.clone().add(new THREE.Vector3(0, 0.1, 0)), 10);
    }
    G.events.emit('act', 'cook', { item: r.makes, appliance: inst.def.id });
  },
  reheat(inst, food) {
    station.make(inst, { label: `Reheating ${food.def.name}`, free: true, makes: null, seconds: 4 }).catch(() => {});
    food.st.madeAt = G.clock.total + 4;
  },
  update(inst, dt) {
    const lever = inst.model.getObjectByName('lever');
    if (lever && lever.userData.baseY === undefined) lever.userData.baseY = lever.position.y;
    if (!inst.runtime.anim) {
      if (inst.runtime.animDirty) {
        inst.runtime.animDirty = false;
        inst.model.position.x = 0;
        if (lever) lever.position.y = lever.userData.baseY;
      }
      return;
    }
    inst.runtime.animDirty = true;
    inst.runtime.animT += dt;
    const t = inst.runtime.animT;
    if (inst.runtime.anim === 'spin') { const s = inst.model.getObjectByName('spin'); if (s) s.rotation.y += dt * (inst.def.use.spinSpeed || 2); }
    if (inst.runtime.anim === 'shake') inst.model.position.x = Math.sin(t * 60) * 0.003;
    if (inst.runtime.anim === 'steam' && Math.random() < dt * 6) G.particles.steam(worldPos(inst, [0, (inst.def._bounds?.size.y || 0.3), 0]), 1, { size: 0.03, sizeEnd: 0.18, alpha: 0.2 });
    if (lever) lever.position.y = lever.userData.baseY - 0.05;
  },
};

// make() with makes:null (reheat) shouldn't spawn anything
const _make = station.make;
station.make = async function (inst, r) {
  if (r.makes) return _make(inst, r);
  inst.runtime.busy = true;
  const loop = G.audio.loop(inst.def.use.loop || 'hum', { pos: worldPos(inst), volume: 0.4 });
  inst.runtime.anim = inst.def.use.anim; inst.runtime.animT = 0;
  const ok = await G.ui.progress(r.label, r.seconds || 4, { icon: '♨️' });
  loop.stop(); inst.runtime.anim = null; inst.runtime.busy = false;
  if (ok) { G.audio.play('ding', { pos: worldPos(inst) }); G.ui.toast('Piping hot again!', { icon: '♨️' }); }
};

export const kitchen = { station };
export { ingredientsAvailable, useIngredient };
