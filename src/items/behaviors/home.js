// Home & furniture behaviors: lamps, seating, beds, plants, candles, clocks,
// fans, diffusers, aquariums, robot vacuums, star projectors, decor.
import * as THREE from 'three';
import { G } from '../../game.js';
import { allLayers } from '../../core/engine.js';
import { findOwned, consumeUse } from './util.js';
import { rand, clamp, pick } from '../../core/utils.js';
import { tween, Ease } from '../../core/tween.js';
import { getDef } from '../registry.js';

const UP = new THREE.Vector3(0, 1, 0);
const gameMinutes = (dt) => dt * (G.state.settings.timeScale || 1) * G.clock.speedMult;
function itemYaw(inst) { return new THREE.Euler().setFromQuaternion(inst.object.quaternion, 'YXZ').y; }
function worldPos(inst, local = [0, 0, 0]) { return inst.object.localToWorld(new THREE.Vector3(...local)); }

// unique materials for parts that change (bulbs, flames, leaves)
function uniqueParts(inst, flag) {
  const out = [];
  inst.model.traverse((o) => {
    if (o.isMesh && o.userData[flag]) {
      if (!o.userData._uniq) { o.material = o.material.clone(); o.userData._uniq = true; }
      out.push(o);
    }
  });
  return out;
}

// ---------------------------------------------------------------- lamps & lights
export const SMART_COLORS = ['#ffd6a0', '#fff4e6', '#ff9eb5', '#a0c4ff', '#b8f2c9', '#d0a2ff', '#ffb347', '#ff5e5e', '#5ee7ff'];
const light = {
  init(inst) {
    const u = inst.def.use;
    if (inst.st.on === undefined) inst.st.on = u.startOn ?? true;
    const l = new THREE.PointLight(inst.st.color || u.color || '#ffd6a0', 0, u.distance || 5, 2);
    l.position.set(...(u.bulb || [0, 0.3, 0]));
    allLayers(l);
    inst.model.add(l);
    inst.runtime.light = l;
    inst.runtime.bulbs = uniqueParts(inst, 'bulb');
    light.apply(inst);
  },
  apply(inst) {
    const u = inst.def.use; const on = !!inst.st.on;
    const col = inst.st.color || u.color || '#ffd6a0';
    const l = inst.runtime.light;
    if (l) { l.color.set(col); l.intensity = on ? (u.intensity ?? 3) : 0; }
    for (const b of inst.runtime.bulbs || []) { b.material.emissive?.set(col); b.material.emissiveIntensity = on ? (u.ei ?? 2.5) : 0; }
  },
  dispose(inst) { inst.runtime.light?.parent?.remove(inst.runtime.light); inst.runtime.light?.dispose?.(); },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('switch', { pos: worldPos(inst) });
    light.apply(inst);
    G.events.emit('act', 'lamp', { on: inst.st.on });
  },
  cycle(inst) {
    const i = SMART_COLORS.indexOf(inst.st.color || inst.def.use.color);
    inst.st.color = SMART_COLORS[(i + 1) % SMART_COLORS.length];
    inst.st.on = true;
    G.audio.play('beep', { pitch: 1.2 });
    light.apply(inst);
  },
  world(inst) {
    const a = [{ key: 'E', label: inst.st.on ? 'Turn off' : 'Turn on', run: () => light.toggle(inst) }];
    if (inst.def.use.smart) a.push({ key: 'R', label: 'Change color', run: () => light.cycle(inst) });
    return a;
  },
  held(inst) {
    const a = [{ key: 'LMB', label: inst.st.on ? 'Switch off' : 'Switch on', run: () => light.toggle(inst) }];
    if (inst.def.use.smart) a.push({ key: 'R', label: 'Change color', run: () => light.cycle(inst) });
    return a;
  },
  update(inst, dt) {
    const u = inst.def.use;
    if (!inst.st.on) return;
    if (u.flicker && inst.runtime.light) inst.runtime.light.intensity = (u.intensity ?? 3) * (0.8 + Math.random() * 0.25);
    if (u.rainbow) {
      inst.runtime.hue = ((inst.runtime.hue || 0) + dt * 0.08) % 1;
      const c = new THREE.Color().setHSL(inst.runtime.hue, 0.9, 0.6);
      inst.runtime.light.color.copy(c);
      for (const b of inst.runtime.bulbs) b.material.emissive.copy(c);
    }
    if (u.lava) {
      inst.runtime.t = (inst.runtime.t || Math.random() * 10) + dt;
      let i = 0;
      inst.model.traverse((o) => { if (o.userData.blob) { const k = i++; o.position.y = o.userData.baseY + Math.sin(inst.runtime.t * 0.4 + k * 2.1) * o.userData.range; o.scale.setScalar(1 + Math.sin(inst.runtime.t * 0.7 + k) * 0.18); } });
    }
  },
};

// ---------------------------------------------------------------- seating
const seat = {
  world(inst) {
    const u = inst.def.use;
    const a = [{ key: 'E', label: u.verb || 'Sit', run: () => seat.sit(inst) }];
    if (u.lie) a.push({ key: 'F', label: 'Lie down', run: () => seat.sit(inst, true) });
    return a;
  },
  sit(inst, lying = false) {
    const u = inst.def.use;
    const yaw = itemYaw(inst);
    const seats = (u.seats || [[0, 0]]).map(([x, z]) => worldPos(inst, [x, 0, z]));
    const pp = G.player.pos;
    seats.sort((a, b) => a.distanceTo(pp) - b.distanceTo(pp));
    const s = seats[0];
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const exit = s.clone().addScaledVector(fwd, 0.75); exit.y = 0;
    if (lying) {
      const head = worldPos(inst, u.lieHead || [-(u.width || 1.6) / 2 + 0.3, 0, 0]);
      G.player.sit({ pos: head, yaw: yaw - Math.PI / 2, seatHeight: (u.height || 0.45) + 0.1, name: inst.def.name, comfort: (u.comfort || 0.6) * 1.5, lying: true, exitPos: exit });
    } else {
      G.player.sit({ pos: s, yaw: yaw + Math.PI, seatHeight: u.height || 0.45, name: inst.def.name, comfort: u.comfort || 0.5, exitPos: exit });
    }
    if (u.sound) G.audio.play(u.sound, { pos: s });
  },
};

// ---------------------------------------------------------------- beds
const bed = {
  init(inst) { bed.applyBedding(inst); },
  applyBedding(inst) {
    const id = inst.st.bedding;
    if (!id) return;
    const u = getDef(id)?.use;
    if (!u) return;
    inst.model.traverse((o) => {
      if (o.isMesh && (o.name === 'duvet' || o.name === 'pillow' || o.name === 'sheet')) {
        if (!o.userData._uniq) { o.material = o.material.clone(); o.userData._uniq = true; }
        o.material.color.set(o.name === 'pillow' ? (u.color2 || u.color) : u.color);
        if (u.map) { o.material.map = u.map(); o.material.needsUpdate = true; }
      }
    });
  },
  world(inst) {
    const held = G.hand.held;
    const a = [
      { key: 'E', label: 'Sleep…', run: () => bed.sleepMenu(inst) },
      { key: 'F', label: 'Lie down', run: () => bed.lie(inst) },
    ];
    if (held?.def.use?.type === 'bedding') a.push({ key: 'R', label: `Put on ${held.def.name}`, run: () => bed.changeSheets(inst, held) });
    return a;
  },
  headPose(inst) {
    const u = inst.def.use;
    const yaw = itemYaw(inst);
    const head = worldPos(inst, [0, 0, -(u.length || 2.0) / 2 + 0.4]);
    return { head, yaw: yaw + Math.PI, height: u.height || 0.55 };
  },
  lie(inst) {
    const { head, yaw, height } = bed.headPose(inst);
    const fwd = new THREE.Vector3(Math.sin(itemYaw(inst) + Math.PI / 2), 0, Math.cos(itemYaw(inst) + Math.PI / 2));
    const side = worldPos(inst, [(inst.def.use.width || 1.6) / 2 + 0.5, 0, 0]); side.y = 0;
    void fwd;
    G.player.sit({ pos: head, yaw: yaw + Math.PI, seatHeight: height + 0.05, name: inst.def.name, comfort: 1.2 * (inst.def.use.quality || 1), lying: true, exitPos: side });
  },
  async sleepMenu(inst) {
    const h = G.clock.hour;
    const opts = [
      { label: 'Power nap', sub: '30 minutes', value: 0.5 },
      { label: 'Nap', sub: '2 hours', value: 2 },
      { label: 'Full night', sub: '8 hours', value: 8 },
    ];
    if (h >= 19 || h < 5) opts.push({ label: 'Until morning', sub: 'Wake at 7:30 AM', value: null, primary: true });
    const choice = await G.ui.choose('How long do you want to sleep?', opts, { icon: '🛏️' });
    if (choice === undefined) return;
    const { head, yaw } = bed.headPose(inst);
    const side = worldPos(inst, [(inst.def.use.width || 1.6) / 2 + 0.5, 0, 0]); side.y = 0;
    G.player.pos.copy(side);
    G.player.sleep({ pos: head, yaw: yaw + Math.PI, hours: choice, bed: inst });
  },
  changeSheets(inst, bedding) {
    const prev = inst.st.bedding;
    inst.st.bedding = bedding.def.id;
    G.hand.release(true);
    G.items.destroy(bedding);
    if (prev) G.items.spawn(prev, { loc: 'storage' });
    bed.applyBedding(inst);
    G.audio.play('rustle');
    G.particles.soft.emit({ pos: worldPos(inst, [0, 0.6, 0]), count: 12, velRand: 1, life: 0.8, size: 0.06, sizeEnd: 0.3, color: '#ffffff', alpha: 0.2 });
    G.ui.toast('Fresh sheets! So cozy.', { icon: '🛏️', kind: 'good' });
    G.needs.add({ comfort: 10 });
    G.events.emit('act', 'bedding');
  },
};

const bedding = {
  held() { return [{ key: 'LMB', label: 'Feel the fabric (aim at a bed + R to use)', run: async () => { await G.hand.play('squeeze'); G.audio.play('rustle'); G.needs.add({ comfort: 1 }); } }]; },
};

// ---------------------------------------------------------------- plants
const plant = {
  init(inst) {
    if (inst.st.water === undefined) { inst.st.water = 0.8; inst.st.growth = 0.2; }
    inst.runtime.leaves = uniqueParts(inst, 'leaf');
    inst.runtime.leafBase = inst.runtime.leaves.map((l) => l.material.color.clone());
    plant.apply(inst);
  },
  apply(inst) {
    const g = inst.st.growth || 0;
    const s = 0.75 + g * 0.45;
    inst.model.scale.setScalar(s);
    const dry = clamp((0.25 - inst.st.water) / 0.25, 0, 1);
    inst.runtime.leaves.forEach((l, i) => l.material.color.copy(inst.runtime.leafBase[i]).lerp(new THREE.Color('#9b7b45'), dry * 0.75));
  },
  subtitle(inst) {
    const w = inst.st.water;
    const mood = w < 0.15 ? '🥀 Very thirsty!' : w < 0.35 ? '😟 Thirsty' : w > 0.95 ? '💧 Just watered' : '🌱 Happy';
    return `${mood} · Growth ${Math.round((inst.st.growth || 0) * 100)}%`;
  },
  world(inst) {
    const held = G.hand.held;
    if (held?.def.use?.type === 'wateringcan') return [{ key: 'E', label: 'Water plant', run: () => wateringcan.pour(held, inst) }];
    return [{ key: 'E', label: 'Water with a glass', run: () => plant.water(inst, 0.5) }, { key: 'R', label: 'Talk to it', run: () => { G.ui.toast(pick(['You tell it about your day. It seems to listen.', 'You compliment its leaves. 🌿', '"Grow strong, buddy."']), { icon: '🪴' }); G.needs.add({ fun: 2, comfort: 2 }); inst.st.growth = Math.min(1, (inst.st.growth || 0) + 0.01); } }];
  },
  water(inst, amt = 1) {
    inst.st.water = Math.min(1, (inst.st.water || 0) + amt);
    const p = worldPos(inst, [0, defH(inst) * 0.9, 0]);
    for (let i = 0; i < 6; i++) G.particles.drops(p.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0.2, rand(-0.05, 0.05))), new THREE.Vector3(0, -1, 0), 2, '#bfe6ff', { rand: 0.3, life: 0.5, size: 0.03 });
    G.audio.play('pour', { pos: p, volume: 0.5 });
    plant.apply(inst);
    G.needs.add({ comfort: 2 });
    G.events.emit('act', 'water', { item: inst.def.id });
  },
  update(inst, dt) {
    if (inst.data.loc !== 'world') return;
    const m = gameMinutes(dt);
    inst.st.water = Math.max(0, inst.st.water - m / 1440 * (inst.def.use.thirst || 1));
    if (inst.st.water > 0.3) inst.st.growth = Math.min(1, (inst.st.growth || 0) + m / 1440 * 0.08);
    inst.runtime.acc = (inst.runtime.acc || 0) + dt;
    if (inst.runtime.acc > 2) { inst.runtime.acc = 0; plant.apply(inst); }
    // gentle sway
    inst.runtime.t = (inst.runtime.t || Math.random() * 10) + dt;
    inst.model.rotation.z = Math.sin(inst.runtime.t * 0.8) * 0.01;
  },
};
function defH(inst) { return inst.def._bounds?.size.y || 0.4; }

const wateringcan = {
  subtitle: (inst) => `${Math.round((inst.st.fill ?? 1) * 100)}% full`,
  held(inst) {
    return [{ key: 'LMB', label: 'Pour', run: () => { const f = G.interaction.focus; if (f?.inst?.def.use?.type === 'plant') wateringcan.pour(inst, f.inst); else wateringcan.pour(inst, null); } }];
  },
  sink(inst) { return { key: 'E', label: 'Fill watering can', run: async () => { if (await G.ui.progress('Filling', 2, { icon: '🚰' })) { inst.st.fill = 1; G.audio.play('pour'); } } }; },
  async pour(inst, target) {
    if (G.hand.busy) return;
    if ((inst.st.fill ?? 1) <= 0.05) { G.ui.toast('Empty! Refill it at a sink.', { icon: '🚿' }); return; }
    G.hand.busy = true;
    const t = setInterval(() => G.particles.drops(G.hand.tipWorld(new THREE.Vector3(0.12, 0.15, 0)), G.hand.forwardWorld().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.5, 0)), 2, '#bfe6ff', { rand: 0.1, life: 0.8, size: 0.03, floor: 0.01 }), 50);
    await G.hand.play('sip', { duration: 1.4 });
    clearInterval(t);
    G.hand.busy = false;
    inst.st.fill = Math.max(0, (inst.st.fill ?? 1) - 0.2);
    if (target) plant.water(target, 1);
  },
};

// ---------------------------------------------------------------- candles & scents
const candle = {
  init(inst) {
    if (inst.st.burn === undefined) inst.st.burn = inst.def.use.burn || 600;
    const l = new THREE.PointLight('#ffab4d', 0, 3, 2); l.position.set(...(inst.def.use.flame || [0, 0.15, 0])); allLayers(l);
    inst.model.add(l); inst.runtime.light = l;
    inst.runtime.flames = []; inst.model.traverse((o) => { if (o.userData.flame) inst.runtime.flames.push(o); });
    candle.apply(inst);
  },
  apply(inst) {
    const lit = !!inst.st.lit;
    inst.runtime.flames.forEach((f) => (f.visible = lit));
    inst.runtime.light.intensity = lit ? 1.2 : 0;
  },
  dispose(inst) { inst.runtime.light?.parent?.remove(inst.runtime.light); },
  subtitle: (inst) => `${inst.def.use.scent || 'Unscented'} · ${Math.round(inst.st.burn / 60)}h of burn time${inst.st.lit ? ' · lit' : ''}`,
  toggle(inst) {
    inst.st.lit = !inst.st.lit;
    G.audio.play(inst.st.lit ? 'match' : 'whoosh', { pos: worldPos(inst), volume: 0.4 });
    if (!inst.st.lit) G.particles.smoke(worldPos(inst, inst.def.use.flame || [0, 0.15, 0]), 3);
    else { G.needs.addBuff('cozy', 240); G.events.emit('act', 'candle'); }
    candle.apply(inst);
  },
  world(inst) { return [{ key: 'E', label: inst.st.lit ? 'Blow out' : 'Light', run: () => candle.toggle(inst) }]; },
  held(inst) { return [{ key: 'LMB', label: inst.st.lit ? 'Blow out' : 'Light', run: () => candle.toggle(inst) }]; },
  update(inst, dt) {
    if (!inst.st.lit) return;
    const l = inst.runtime.light;
    l.intensity = 1.0 + Math.sin(performance.now() * 0.013) * 0.15 + Math.random() * 0.2;
    for (const f of inst.runtime.flames) f.scale.set(1 + Math.random() * 0.08, 0.9 + Math.random() * 0.25, 1);
    inst.st.burn -= gameMinutes(dt);
    if (Math.random() < dt * 0.6) G.particles.smoke(worldPos(inst, [0, (inst.def.use.flame?.[1] || 0.15) + 0.05, 0]), 1, '#cfcfcf');
    if (inst.st.burn <= 0) { G.ui.toast(`${inst.def.name} burned out`, { icon: '🕯️' }); G.items.destroy(inst); }
  },
};

const diffuser = {
  world(inst) { return [{ key: 'E', label: inst.st.on ? 'Turn off' : 'Turn on', run: () => diffuser.toggle(inst) }]; },
  held(inst) { return [{ key: 'LMB', label: inst.st.on ? 'Turn off' : 'Turn on', run: () => diffuser.toggle(inst) }]; },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('beep', { pos: worldPos(inst) });
    if (inst.st.on) { G.needs.addBuff(inst.def.use.buff || 'cozy', 300); G.events.emit('act', 'diffuser'); }
    for (const b of uniqueParts(inst, 'bulb')) { b.material.emissiveIntensity = inst.st.on ? 1.5 : 0; }
  },
  update(inst, dt) {
    if (!inst.st.on) return;
    if (Math.random() < dt * 8) G.particles.soft.emit({ pos: worldPos(inst, [0, (inst.def._bounds?.size.y || 0.2) + 0.02, 0]), count: 1, vel: { x: 0, y: 0.25, z: 0 }, velRand: 0.05, life: 3, size: 0.03, sizeEnd: 0.25, color: inst.def.use.mist || '#ffffff', alpha: 0.18, wobble: 0.15 });
  },
};

// ---------------------------------------------------------------- clocks & neon
const clock = {
  update(inst) {
    const m = G.clock.minuteOfDay;
    const h = inst.model.getObjectByName('hourHand'), mi = inst.model.getObjectByName('minuteHand');
    if (h) h.rotation.z = -((m / 60) % 12) / 12 * Math.PI * 2;
    if (mi) mi.rotation.z = -(m % 60) / 60 * Math.PI * 2;
    const digital = inst.model.getObjectByName('digital');
    if (digital && inst.runtime.lastM !== Math.floor(m)) {
      inst.runtime.lastM = Math.floor(m);
      digital.userData.draw?.(G.clock.fmt());
    }
  },
  world(inst) { return [{ key: 'E', label: 'Check the time', run: () => G.ui.toast(`It's ${G.clock.fmt()} on ${G.clock.dayName}`, { icon: '🕰️' }) }]; },
};

const neon = {
  init(inst) {
    if (inst.st.on === undefined) inst.st.on = true;
    inst.runtime.tubes = uniqueParts(inst, 'neon');
    const l = new THREE.PointLight(inst.def.use.color || '#ff4fd8', 0, 3, 2); l.position.set(0, inst.def._bounds?.center.y || 0.2, 0.25); allLayers(l);
    inst.model.add(l); inst.runtime.light = l;
    neon.apply(inst);
  },
  apply(inst, k = 1) {
    const on = inst.st.on;
    for (const t of inst.runtime.tubes) t.material.emissiveIntensity = on ? 3.2 * k : 0.05;
    inst.runtime.light.intensity = on ? 1.6 * k : 0;
  },
  dispose(inst) { inst.runtime.light?.parent?.remove(inst.runtime.light); },
  world(inst) { return [{ key: 'E', label: inst.st.on ? 'Switch off' : 'Switch on', run: () => neon.toggle(inst) }]; },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('switch', { pos: worldPos(inst) });
    if (inst.st.on) { let n = 0; const iv = setInterval(() => { neon.apply(inst, n % 2 ? 1 : 0.1); if (++n > 5) { clearInterval(iv); neon.apply(inst); } }, 70); }
    else neon.apply(inst);
  },
};

// ---------------------------------------------------------------- fans / heaters / purifiers
const fan = {
  world(inst) { return [{ key: 'E', label: inst.st.on ? 'Turn off' : 'Turn on', run: () => fan.toggle(inst) }]; },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('click', { pos: worldPos(inst) });
    if (inst.st.on) inst.runtime.snd = G.audio.loop(inst.def.use.sound || 'fan', { pos: worldPos(inst), volume: 0.25 });
    else { inst.runtime.snd?.stop(); inst.runtime.snd = null; }
    if (inst.st.on) { G.needs.add({ comfort: 3 }); G.events.emit('act', 'fan'); }
  },
  onLeaveWorld(inst) { inst.runtime.snd?.stop(); inst.runtime.snd = null; },
  dispose(inst) { inst.runtime.snd?.stop(); },
  onEnterWorld(inst) { if (inst.st.on && !inst.runtime.snd) inst.runtime.snd = G.audio.loop(inst.def.use.sound || 'fan', { pos: worldPos(inst), volume: 0.25 }); },
  update(inst, dt) {
    const r = inst.model.getObjectByName('rotor');
    inst.runtime.spd = THREE.MathUtils.damp(inst.runtime.spd || 0, inst.st.on ? 18 : 0, 1.5, dt);
    if (r) r.rotation.z += inst.runtime.spd * dt;
    const osc = inst.model.getObjectByName('head');
    if (osc && inst.st.on) osc.rotation.y = Math.sin(performance.now() * 0.0004) * 0.6;
    if (inst.st.on) {
      inst.runtime.acc = (inst.runtime.acc || 0) + dt;
      if (inst.runtime.acc > 5) { inst.runtime.acc = 0; const warm = G.state.home.thermostat > 22 || G.clock.season === 'summer'; G.needs.add({ comfort: warm ? 0.8 : 0.2 }, { silent: true }); }
    }
  },
};

// ---------------------------------------------------------------- aquarium
const aquarium = {
  init(inst) {
    inst.runtime.fish = [];
    inst.model.traverse((o) => { if (o.userData.fish) inst.runtime.fish.push({ o, a: Math.random() * 6, r: o.userData.r || 0.15, y: o.position.y, s: 0.4 + Math.random() * 0.5 }); });
  },
  world(inst) { return [{ key: 'E', label: 'Feed the fish', run: () => aquarium.feed(inst) }, { key: 'R', label: 'Watch them swim', run: () => { G.needs.add({ comfort: 6, fun: 4 }); G.ui.toast('Mesmerizing… 🐠', { icon: '🐟' }); G.needs.addBuff('calm', 120); } }]; },
  feed(inst) {
    const p = worldPos(inst, [0, (inst.def._bounds?.size.y || 0.4), 0]);
    G.particles.dots.emit({ pos: p, count: 14, velRand: 0.1, life: 4, size: 0.008, sizeEnd: 0.008, color: '#d4864a', gravity: 0.05, drag: 2, spread: 0.12 });
    G.audio.play('rustle', { pos: p, volume: 0.4 });
    inst.st.fed = G.clock.total;
    G.needs.add({ fun: 4, comfort: 3 });
    G.events.emit('act', 'feedFish');
  },
  subtitle: (inst) => (inst.st.fed && G.clock.total - inst.st.fed < 720 ? 'Fish are happy and fed' : 'The fish look hungry'),
  update(inst, dt) {
    for (const f of inst.runtime.fish) {
      f.a += dt * f.s;
      f.o.position.x = Math.cos(f.a) * f.r;
      f.o.position.z = Math.sin(f.a * 1.3) * f.r * 0.4;
      f.o.position.y = f.y + Math.sin(f.a * 2) * 0.02;
      f.o.rotation.y = -f.a + Math.PI / 2;
    }
    if (Math.random() < dt * 3) G.particles.bubble(worldPos(inst, [rand(-0.1, 0.1), 0.05, 0]), new THREE.Vector3(0, 0.1, 0), { size: 0.012, life: 1.6, gravity: -0.15 });
  },
};

// ---------------------------------------------------------------- robot vacuum
const vacuum = {
  world(inst) { return [{ key: 'E', label: inst.st.on ? 'Send back to dock' : 'Start cleaning', run: () => vacuum.toggle(inst) }]; },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('beep', { pos: worldPos(inst), pitch: inst.st.on ? 1.2 : 0.8 });
    if (inst.st.on) { inst.runtime.snd = G.audio.loop('vacuum', { pos: worldPos(inst), volume: 0.35 }); inst.runtime.dir = Math.random() * Math.PI * 2; inst.runtime.timer = 0; }
    else { inst.runtime.snd?.stop(); inst.runtime.snd = null; G.items.toWorld(inst, inst.object.position.clone(), inst.object.quaternion.clone()); }
  },
  onLeaveWorld(inst) { if (inst.st.on) { inst.st.on = false; inst.runtime.snd?.stop(); } },
  dispose(inst) { inst.runtime.snd?.stop(); },
  update(inst, dt) {
    if (!inst.st.on || inst.data.loc !== 'world') return;
    const o = inst.object;
    inst.runtime.timer += dt;
    const sp = 0.35;
    const dx = Math.sin(inst.runtime.dir) * sp * dt, dz = Math.cos(inst.runtime.dir) * sp * dt;
    const nx = o.position.x + dx, nz = o.position.z + dz;
    const r = 0.2;
    const blocked = [...G.apartment.colliders, ...G.items.colliders].some((c) => c.enabled && c.item !== inst && nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ && (c.yMax ?? 3) > 0.12) || Math.abs(nx) > 6.75 || nz < -4.75 || nz > 4.8;
    if (blocked) inst.runtime.dir += Math.PI * 0.5 + Math.random() * Math.PI;
    else { o.position.x = nx; o.position.z = nz; }
    o.rotation.y = inst.runtime.dir;
    inst.runtime.snd?.setPos(o.position);
    if (inst.runtime.timer > 1) {
      inst.runtime.timer = 0;
      G.needs.add({ comfort: 0.15 }, { silent: true });
      if (Math.random() < 0.1) inst.runtime.dir += rand(-1, 1);
    }
    const brush = inst.model.getObjectByName('brush'); if (brush) brush.rotation.y += dt * 20;
  },
};

// ---------------------------------------------------------------- star projector
const projector = {
  world(inst) { return [{ key: 'E', label: inst.st.on ? 'Turn off' : 'Project the galaxy', run: () => projector.toggle(inst) }]; },
  toggle(inst) {
    inst.st.on = !inst.st.on;
    G.audio.play('beep', { pos: worldPos(inst) });
    if (inst.st.on) projector.make(inst); else projector.clear(inst);
    if (inst.st.on) { G.events.emit('act', 'projector'); G.needs.addBuff('dreamy', 180); }
  },
  make(inst) {
    projector.clear(inst);
    const N = 900; const pos = []; const col = [];
    const p = worldPos(inst);
    const palette = (inst.def.use.colors || ['#7b5cff', '#3fd2ff', '#ff5ec8', '#ffffff']).map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      const c = palette[Math.floor(Math.random() * palette.length)];
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.position.set(p.x, 2.88, p.z);
    G.scene.add(pts);
    inst.runtime.stars = pts;
    const nebula = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: palette[0], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    nebula.rotation.x = Math.PI / 2; nebula.position.set(p.x, 2.885, p.z);
    G.scene.add(nebula); inst.runtime.nebula = nebula;
  },
  clear(inst) {
    for (const k of ['stars', 'nebula']) { const o = inst.runtime[k]; if (o) { G.scene.remove(o); o.geometry.dispose(); o.material.dispose(); inst.runtime[k] = null; } }
  },
  onEnterWorld(inst) { if (inst.st.on) projector.make(inst); },
  onLeaveWorld(inst) { projector.clear(inst); },
  dispose(inst) { projector.clear(inst); },
  update(inst, dt) {
    const s = inst.runtime.stars;
    if (!s) return;
    s.rotation.y += dt * 0.03;
    if (inst.runtime.nebula) inst.runtime.nebula.material.opacity = 0.1 + Math.sin(performance.now() * 0.0008) * 0.04;
  },
};

// ---------------------------------------------------------------- decor (admire)
const decor = {
  world(inst) {
    return [{ key: 'E', label: inst.def.use?.verb || 'Admire', run: () => {
      const lines = inst.def.use?.lines || [inst.def.desc || 'It really ties the room together.'];
      G.ui.toast(pick(lines), { icon: inst.def.emoji || '✨' });
      if (!inst.st.admired || G.clock.total - inst.st.admired > 120) { G.needs.add({ comfort: 3, fun: 2 }); inst.st.admired = G.clock.total; }
      G.events.emit('act', 'admire', { item: inst.def.id });
    } }];
  },
  held(inst) {
    if (!inst.def.use?.squish) return [];
    return [{ key: 'LMB', label: 'Hug', run: async () => { await G.hand.play('squeeze'); G.audio.play('squish'); G.needs.add({ comfort: 3 }); } }];
  },
};

// ---------------------------------------------------------------- generic toggle device (LED strips, string lights, etc.)
const toggleDevice = light;

export const home = { light, lamp: light, seat, bed, bedding, plant, wateringcan, candle, diffuser, clock, neon, fan, aquarium, vacuum, projector, decor, toggle: toggleDevice };
export { worldPos, itemYaw, gameMinutes, uniqueParts };
void UP; void findOwned; void consumeUse; void tween; void Ease;
