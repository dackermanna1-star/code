// Delivery packaging: cardboard boxes, food bags, shoeboxes, poster tubes and
// flat-pack furniture boxes — each with its own unboxing animation.
import * as THREE from 'three';
import { G } from '../game.js';
import { defineItems, ITEMS } from '../items/registry.js';
import { registerBehaviors } from '../items/behaviors/index.js';
import { mat, MAT, box, rbox, cyl, at, group, decal, FONT, roundRect, fitText } from '../items/kit.js';
import { STORES } from './stores.js';
import { tween, Ease, wait } from '../core/tween.js';
import { rand } from '../core/utils.js';
import { worldPos, itemYaw } from '../items/behaviors/home.js';

function shippingLabel(storeId, w, h, key) {
  const s = STORES[storeId] || { name: 'Parcel', color: '#333', color2: '#fff', logo: '📦' };
  return decal(w, h, `ship:${storeId}:${key}`, (ctx, W, H) => {
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = s.color; ctx.fillRect(0, 0, W, H * 0.3);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${H * 0.18}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    fitText(ctx, `${s.logo} ${s.name}`, W * 0.5, H * 0.15, W * 0.9);
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.font = `600 ${H * 0.1}px ${FONT}`;
    ctx.fillText('SHIP TO: UNIT 2403', W * 0.06, H * 0.44);
    ctx.font = `400 ${H * 0.08}px ${FONT}`; ctx.fillText('88 Skyline Ave · Floor 24', W * 0.06, H * 0.56);
    for (let i = 0; i < 46; i++) { ctx.fillStyle = '#111'; const bw = 1 + ((i * 7) % 3); ctx.fillRect(W * 0.06 + i * (W * 0.85 / 46), H * 0.68, bw, H * 0.22); }
  }, { tw: 256, th: 160, transparent: false });
}

function cardboardBox(w, h, d, st, kind = 'box') {
  const card = MAT.cardboard();
  const inner = mat('#b38a5e', { rough: 0.95 });
  const g = new THREE.Group();
  const T = 0.006;
  g.add(at(box(w, T, d, card), 0, T / 2, 0));
  g.add(at(box(w, h, T, card), 0, h / 2, d / 2 - T / 2), at(box(w, h, T, card), 0, h / 2, -d / 2 + T / 2));
  g.add(at(box(T, h, d, card), w / 2 - T / 2, h / 2, 0), at(box(T, h, d, card), -w / 2 + T / 2, h / 2, 0));
  // inner tint so the open box reads as hollow
  g.add(at(box(w - 0.02, 0.002, d - 0.02, inner, { cast: false }), 0, T + 0.002, 0));
  // flaps on hinges along the long edges
  const flaps = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(0, h, s * d / 2);
    const f = box(w, T, d / 2, card); at(f, 0, 0, -s * d / 4); pivot.add(f);
    pivot.name = 'flap' + (s > 0 ? 0 : 1);
    g.add(pivot); flaps.push(pivot);
  }
  for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * w / 2, h - 0.002, 0);
    const f = box(w * 0.45, T, d - 0.01, card); at(f, -s * w * 0.225, 0, 0); pivot.add(f);
    pivot.name = 'flapS' + (s > 0 ? 0 : 1);
    g.add(pivot);
  }
  // tape
  const tape = box(0.05, 0.002, d + 0.01, mat('#d9c08a', { rough: 0.3, opacity: 0.85, transparent: true }), { cast: false });
  at(tape, 0, h + 0.005, 0); tape.name = 'tape'; g.add(tape);
  const lab = shippingLabel(st.store || 'primo', Math.min(w * 0.6, 0.2), Math.min(w * 0.6, 0.2) * 0.62, kind);
  lab.position.set(w * 0.12, h * 0.55, d / 2 + 0.002); g.add(lab);
  if (st.empty) openPose(g, true);
  return g;
}

function openPose(g, instant = false, cb) {
  const targets = [];
  g.traverse((o) => {
    if (o.name === 'flap0') targets.push([o, 'x', -2.2]);
    if (o.name === 'flap1') targets.push([o, 'x', 2.2]);
    if (o.name === 'flapS0') targets.push([o, 'z', 2.0]);
    if (o.name === 'flapS1') targets.push([o, 'z', -2.0]);
    if (o.name === 'tape' || o.name === 'seal') o.visible = false;
    if (o.name === 'lid' && instant) { o.position.y += 0.0; o.rotation.z = 0; }
  });
  if (instant) { for (const [o, ax, v] of targets) o.rotation[ax] = v; return; }
  tween({ duration: 0.55, ease: Ease.outBack, update: (t, e) => { for (const [o, ax, v] of targets) o.rotation[ax] = v * e; }, done: cb });
}

function foodBag(st) {
  const s = STORES[st.store] || STORES.grubhop;
  const paper = mat('#c9a57a', { rough: 0.95 });
  const g = new THREE.Group();
  const w = 0.3, h = 0.34, d = 0.18;
  g.add(at(box(w, h, d, paper), 0, h / 2, 0));
  const fold = box(w, 0.06, d * 0.4, paper); at(fold, 0, h + 0.02, 0); fold.name = 'seal'; g.add(fold);
  const sticker = decal(0.14, 0.14, 'bagsticker:' + st.store, (ctx, W, H) => {
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${H * 0.34}px ${FONT}`; ctx.fillText(s.logo, W / 2, H * 0.42);
    ctx.font = `800 ${H * 0.14}px ${FONT}`; fitText(ctx, s.name, W / 2, H * 0.74, W * 0.75);
  }, { tw: 128, th: 128 });
  sticker.position.set(0, h * 0.6, d / 2 + 0.002); g.add(sticker);
  const receipt = box(0.07, 0.12, 0.002, mat('#ffffff', { rough: 0.9 }), { cast: false }); at(receipt, 0.09, h * 0.85, d / 2 + 0.004); receipt.rotation.z = 0.15; receipt.name = 'seal'; g.add(receipt);
  if (st.empty) g.traverse((o) => { if (o.name === 'seal') o.visible = false; });
  return g;
}

function shoeBox(st) {
  const g = new THREE.Group();
  const col = st.store === 'stockpile' ? '#e8e2d8' : '#ef6c2f';
  const body = mat(col, { rough: 0.8 });
  const lidMat = mat(st.store === 'stockpile' ? '#1f1f1f' : '#2b2b2b', { rough: 0.7 });
  g.add(at(box(0.36, 0.13, 0.22, body), 0, 0.065, 0));
  const lid = group(at(box(0.37, 0.03, 0.23, lidMat), 0, 0, 0));
  lid.position.y = 0.135; lid.name = 'lid';
  const logo = decal(0.16, 0.05, 'shoelogo:' + st.store, (ctx, W, H) => { ctx.fillStyle = '#fff'; ctx.font = `900 ${H * 0.7}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.store === 'stockpile' ? 'VERIFIED ✓' : 'KICKS', W / 2, H / 2); }, { tw: 256, th: 80 });
  logo.rotation.x = -Math.PI / 2; logo.position.y = 0.016; lid.add(logo);
  g.add(lid);
  if (st.store === 'stockpile') { const tag = box(0.05, 0.03, 0.002, mat('#0d7a4b', { rough: 0.5 }), { cast: false }); at(tag, 0.12, 0.07, 0.111); g.add(tag); }
  if (st.empty) { lid.position.set(0.0, 0.015, 0.3); }
  return g;
}

function posterTube(st) {
  const g = new THREE.Group();
  const tube = cyl(0.045, 0.045, 0.72, MAT.cardboard(), 20); tube.rotation.z = Math.PI / 2; at(tube, 0, 0.045, 0); g.add(tube);
  const cap1 = cyl(0.048, 0.048, 0.03, mat('#222', { rough: 0.6 }), 20); cap1.rotation.z = Math.PI / 2; at(cap1, 0.37, 0.045, 0); cap1.name = 'cap'; g.add(cap1);
  const cap2 = cyl(0.048, 0.048, 0.03, mat('#222', { rough: 0.6 }), 20); cap2.rotation.z = Math.PI / 2; at(cap2, -0.37, 0.045, 0); g.add(cap2);
  if (st.empty) cap1.visible = false;
  return g;
}

function flatPack(st) {
  const g = new THREE.Group();
  const w = 1.1, h = 0.16, d = 0.65;
  g.add(at(box(w, h, d, MAT.cardboard()), 0, h / 2, 0));
  const s = STORES[st.store] || STORES.nestly;
  const top = decal(0.9, 0.5, 'flat:' + st.store, (ctx, W, H) => {
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 6;
    ctx.strokeRect(W * 0.3, H * 0.25, W * 0.4, H * 0.35); ctx.beginPath(); ctx.moveTo(W * 0.32, H * 0.6); ctx.lineTo(W * 0.32, H * 0.8); ctx.moveTo(W * 0.68, H * 0.6); ctx.lineTo(W * 0.68, H * 0.8); ctx.stroke();
    ctx.fillStyle = s.color; ctx.font = `900 ${H * 0.13}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`${s.logo} ${s.name.toUpperCase()}`, W / 2, H * 0.16);
    ctx.fillStyle = '#3b2a1a'; ctx.font = `600 ${H * 0.08}px ${FONT}`; ctx.fillText('SOME ASSEMBLY REQUIRED · 2 PERSON LIFT (or 1 determined homebody)', W / 2, H * 0.93);
  }, { tw: 512, th: 280 });
  top.rotation.x = -Math.PI / 2; top.position.y = h + 0.002; g.add(top);
  const strap = box(0.03, h + 0.004, d + 0.004, mat('#d14b4b', { rough: 0.6 })); at(strap, 0.3, h / 2, 0); strap.name = 'seal'; g.add(strap);
  return g;
}

defineItems([
  { id: 'pkg_box_s', name: 'Small Box', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable', 'soft'], build: (d, st) => cardboardBox(0.26, 0.16, 0.2, st), use: { type: 'package' } },
  { id: 'pkg_box_m', name: 'Box', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable'], build: (d, st) => cardboardBox(0.4, 0.26, 0.32, st), use: { type: 'package' } },
  { id: 'pkg_box_l', name: 'Big Box', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable'], build: (d, st) => cardboardBox(0.58, 0.4, 0.45, st, 'l'), use: { type: 'package' }, hold: { scale: 0.45 } },
  { id: 'pkg_bag', name: 'Takeout Bag', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable', 'soft'], build: (d, st) => foodBag(st), use: { type: 'package', bag: true } },
  { id: 'pkg_shoebox', name: 'Shoebox', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable'], build: (d, st) => shoeBox(st), use: { type: 'package', lid: true } },
  { id: 'pkg_tube', name: 'Poster Tube', category: 'package', price: 0, hidden: true, dynamic: true, tags: ['recyclable'], build: (d, st) => posterTube(st), use: { type: 'package', tube: true } },
  { id: 'pkg_flatpack', name: 'Flat-Pack Box', category: 'package', price: 0, hidden: true, dynamic: true, furniture: true, place: 'floor', tags: ['recyclable', 'anywhere'], build: (d, st) => flatPack(st), use: { type: 'package', flat: true } },
]);

const pkg = {
  subtitle(inst) {
    const c = inst.st.contents || [];
    if (inst.st.empty) return 'Empty · recycle me';
    const s = STORES[inst.st.store];
    const names = c.map((id) => ITEMS[id]?.name).filter(Boolean);
    return `${s ? 'From ' + s.name + ' · ' : ''}${names.length === 1 ? names[0] : names.length + ' items'}`;
  },
  world(inst) {
    if (inst.st.empty) return [{ key: 'E', label: 'Break down & recycle', run: () => pkg.recycle(inst) }];
    if (inst.def.use.flat) return [{ key: 'E', label: `Assemble ${ITEMS[inst.st.contents?.[0]]?.name || 'furniture'}`, run: () => pkg.assemble(inst) }];
    return [{ key: 'E', label: 'Open it', run: () => pkg.open(inst) }];
  },
  held(inst) {
    if (inst.st.empty) return [{ key: 'LMB', label: 'Flatten it', run: () => pkg.recycle(inst) }];
    return [{ key: 'LMB', label: 'Open it', run: () => pkg.openHeld(inst) }];
  },
  update(inst, dt) {
    if (inst.st.empty || inst.data.loc !== 'world') return;
    const hot = (inst.st.contents || []).some((id) => ITEMS[id]?.use?.hot);
    if (hot && Math.random() < dt * 2 && G.clock.total - (inst.st.at || G.clock.total) < 40) G.particles.steam(worldPos(inst, [0, 0.36, 0]), 1, { size: 0.03, sizeEnd: 0.15, alpha: 0.12 });
    if (inst.st.at == null) inst.st.at = G.clock.total;
  },
  async openHeld(inst) {
    // put it down in front of you, then open
    const f = G.camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
    const p = G.player.pos.clone().addScaledVector(f, 0.9);
    G.hand.release(true);
    G.items.toWorld(inst, p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.player.yaw));
    await wait(0.05);
    pkg.open(inst);
  },
  async open(inst) {
    if (inst.runtime.opening) return;
    inst.runtime.opening = true;
    const u = inst.def.use;
    const p = worldPos(inst);
    G.audio.play(u.bag ? 'paper' : 'tape', { pos: p });
    const m = inst.model;
    if (u.lid) {
      const lid = m.getObjectByName('lid');
      await new Promise((res) => tween({ duration: 0.6, ease: Ease.outCubic, update: (t, e) => { lid.position.y = 0.135 + Math.sin(e * Math.PI) * 0.2; lid.position.z = e * 0.3; lid.position.x = 0; lid.rotation.x = e * 0.2; if (t >= 1) lid.position.y = 0.015; }, done: res }));
    } else if (u.tube) {
      const cap = m.getObjectByName('cap');
      G.audio.play('pop', { pos: p });
      await new Promise((res) => tween({ duration: 0.4, ease: Ease.outCubic, update: (t, e) => { cap.position.x = 0.37 + e * 0.25; cap.position.y = 0.045 + Math.sin(e * Math.PI) * 0.15; }, done: () => { cap.visible = false; res(); } }));
    } else if (u.bag) {
      m.traverse((o) => { if (o.name === 'seal') o.visible = false; });
      G.audio.play('rustle', { pos: p });
      await wait(0.2);
    } else {
      await wait(0.25);
      G.audio.play('boxopen', { pos: p });
      await new Promise((res) => openPose(m, false, res));
    }
    // pop contents out
    const contents = inst.st.contents || [];
    const top = worldPos(inst, [0, (inst.def._bounds?.size.y || 0.2) + 0.05, 0]);
    G.particles.sparkle(top, 16);
    contents.forEach((id, i) => {
      setTimeout(() => {
        const item = G.items.spawn(id, { loc: 'storage' });
        if (!item) return;
        if (item.def.furniture) { G.ui.toast(`${item.def.name} → storage (place it from your phone's Storage app)`, { icon: '📦' }); return; }
        const a = (i / Math.max(1, contents.length)) * Math.PI * 2 + rand(-0.4, 0.4);
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rand(0.6, 1.2));
        G.physics.launch(item, top.clone().add(new THREE.Vector3(0, i * 0.05, 0)), new THREE.Vector3(out.x, rand(2.2, 3), out.z), new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)));
        G.audio.play('pop', { pos: top, pitch: 0.9 + i * 0.08 });
        if (item.def.rarity !== 'common' && item.def.rarity) G.particles.sparkle(top, 10, ['#ffffff', '#ffd27a', '#a259ff']);
      }, 120 + i * 140);
    });
    inst.st.empty = true;
    inst.st.contents = [];
    G.state.stats.boxesOpened = (G.state.stats.boxesOpened || 0);
    G.events.emit('act', 'unbox', { count: contents.length, store: inst.st.store });
    G.needs.add({ fun: 4 + contents.length });
    inst.runtime.opening = false;
  },
  async assemble(inst) {
    const id = inst.st.contents?.[0];
    const def = ITEMS[id];
    if (!def) return;
    const iv = setInterval(() => G.audio.play(Math.random() < 0.5 ? 'thud' : 'click', { pos: worldPos(inst), impact: 0.4, pitch: rand(1, 1.6) }), 330);
    const ok = await G.ui.progress(`Assembling ${def.name}`, 5, { icon: '🔨', cancelable: true });
    clearInterval(iv);
    if (!ok) return;
    const p = inst.object.position.clone();
    const yaw = itemYaw(inst);
    G.items.destroy(inst);
    const f = G.items.spawn(id, { loc: 'storage' });
    G.particles.soft.emit({ pos: p.clone().add(new THREE.Vector3(0, 0.2, 0)), count: 20, velRand: 1.4, life: 0.9, size: 0.1, sizeEnd: 0.4, color: '#e8dcc8', alpha: 0.3 });
    G.audio.play('sparkle');
    G.events.emit('act', 'unbox', { count: 1, store: 'nestly', furniture: true });
    // spawn a recyclable empty box next to it so the flow feels physical
    G.items.spawn('pkg_box_m', { loc: 'world', pos: p.clone().add(new THREE.Vector3(0.6, 0, 0.4)), yaw, st: { empty: true, store: inst.st.store } });
    G.placement.begin(f, { from: 'storage' });
    G.ui.toast('Pick a spot! Scroll / Q / R to rotate, click to place.', { icon: '🛋️', duration: 4 });
  },
  recycle(inst) {
    G.audio.play('rustle', { pos: worldPos(inst) });
    const o = inst.object;
    tween({ duration: 0.35, ease: Ease.inQuad, update: (t, e) => { o.scale.set(1 + e * 0.3, 1 - e * 0.95, 1 + e * 0.2); }, done: () => {
      G.items.destroy(inst);
      G.wallet.earn(0.25, 'Recycling refund', { quiet: true });
      G.ui.toast('Box broken down & recycled · +$0.25', { icon: '♻️', kind: 'good' });
      G.events.emit('act', 'recycle', { item: inst.def.id });
    } });
  },
};
registerBehaviors({ package: pkg });
void rbox; void roundRect;
