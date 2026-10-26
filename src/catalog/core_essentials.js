// Essentials: starter consumables, groceries, hygiene, basic clothing,
// books, art and utility items (empties, canvas, player paintings...).
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, lathe, tube, at, rot, group, plane, decal, FONT, fitText } from '../items/kit.js';
import { can, bottle, takeawayCup, mug, plate, burger, pizzaSlice, fruit, banana, wrapBar, carton, productBox, jar, pumpBottle, squeezeTube, foldedGarment, sneaker, bookModel, wallArt } from './shared.js';
import { canvas, toTexture } from '../core/textures.js';

const S = (o) => ({ ...o });

function eggCarton() {
  const g = group(at(rbox(0.26, 0.05, 0.11, 0.01, mat('#d8cbb5', { rough: 1 })), 0, 0.025, 0));
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const e = sph(0.022, mat('#f3e3c7', { rough: 0.6 }), 14, 10); e.scale.y = 1.3; e.userData.bite = i * 2 + j; at(e, -0.1 + i * 0.04, 0.06, -0.025 + j * 0.05); g.add(e); }
  return g;
}
function breadLoaf() {
  const g = group();
  const bag = rbox(0.28, 0.12, 0.12, 0.05, mat('#f5f0e6', { rough: 0.3, opacity: 0.7, transparent: true }));
  at(bag, 0, 0.06, 0); g.add(bag);
  for (let i = 0; i < 6; i++) { const sl = rbox(0.03, 0.105, 0.105, 0.03, mat('#d9a05b', { rough: 0.8 })); at(sl, -0.1 + i * 0.04, 0.055, 0); sl.userData.bite = i; g.add(sl); }
  g.add(at(box(0.012, 0.03, 0.03, mat('#1d70b8')), 0.15, 0.09, 0));
  return g;
}
function toast() {
  const g = group(plate({ r: 0.09 }));
  const t = rbox(0.1, 0.012, 0.1, 0.012, mat('#c98b45', { rough: 0.8 })); t.userData.bite = 1; at(t, 0, 0.022, 0); g.add(t);
  const b = rbox(0.08, 0.003, 0.08, 0.003, mat('#ffe08a', { rough: 0.4 })); b.userData.bite = 0; at(b, 0, 0.03, 0); g.add(b);
  return g;
}
function toothbrush(color = '#4cc9f0') {
  const g = group(at(rbox(0.17, 0.012, 0.016, 0.006, mat(color, { rough: 0.3, clearcoat: 0.6 })), 0, 0.008, 0));
  g.add(at(rbox(0.025, 0.014, 0.012, 0.003, mat('#ffffff', { rough: 0.9 })), 0.07, 0.02, 0));
  return g;
}
function wateringCan() {
  const m = mat('#7aa095', { rough: 0.4, metal: 0.4 });
  const g = group(at(cyl(0.08, 0.09, 0.18, m, 28), 0, 0.09, 0));
  g.add(tube([[0.08, 0.04, 0], [0.16, 0.12, 0], [0.22, 0.2, 0]], 0.012, m, 12, 8));
  g.add(at(rot(torus(0.07, 0.01, m, 8, 20, Math.PI), 0, 0, 0), -0.02, 0.18, 0));
  return g;
}
function spinner(color = '#ff4d6d') {
  const g = new THREE.Group();
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  const m = mat(color, { rough: 0.25, metal: 0.4, clearcoat: 0.6 });
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    rotor.add(at(cyl(0.022, 0.022, 0.012, m, 24), Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035));
    rotor.add(at(cyl(0.012, 0.012, 0.014, MAT.chrome(), 16), Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035));
    const arm = box(0.035, 0.012, 0.02, m); arm.rotation.y = -a; at(arm, Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018); rotor.add(arm);
  }
  rotor.add(at(cyl(0.012, 0.012, 0.016, MAT.chrome(), 16), 0, 0, 0));
  rotor.position.y = 0.008;
  g.add(rotor);
  return g;
}
function rubberDuck() {
  const y = mat('#ffd60a', { rough: 0.3, clearcoat: 0.7 });
  const g = group(at(sph(0.04, y, 20, 14), 0, 0.035, 0));
  g.children[0].scale.set(1.2, 0.85, 1);
  g.add(at(sph(0.026, y, 16, 12), 0.025, 0.075, 0));
  g.add(at(rot(cyl(0.004, 0.012, 0.02, mat('#f77f00', { rough: 0.4 }), 10), 0, 0, -Math.PI / 2), 0.055, 0.072, 0));
  for (const s of [-1, 1]) g.add(at(sph(0.004, mat('#111'), 8, 6), 0.042, 0.083, s * 0.012));
  return g;
}
function blankCanvas() {
  return group(at(box(0.4, 0.5, 0.02, mat('#fbfaf6', { rough: 0.95 })), 0, 0.25, 0));
}

function sunsetArt(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b2d42'); g.addColorStop(0.45, '#ef8354'); g.addColorStop(0.7, '#ffd6a5'); g.addColorStop(1, '#f7ede2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(w / 2, h * 0.58, w * 0.18, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#4f5d75';
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 + i * 0.25; ctx.beginPath(); ctx.moveTo(0, h * (0.62 + i * 0.08)); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * (0.62 + i * 0.08) - Math.sin(x * 0.02 + i) * 14 - i * 6); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2b2d42'; ctx.font = `800 ${w * 0.07}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('GOLDEN HOUR', w / 2, h * 0.94);
}
function cityPrint(ctx, w, h) {
  ctx.fillStyle = '#f1e9da'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e07a5f'; ctx.beginPath(); ctx.arc(w * 0.7, h * 0.3, w * 0.13, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d405b';
  let x = 0;
  while (x < w) { const bw = 20 + Math.random() * 40, bh = h * (0.25 + Math.random() * 0.4); ctx.fillRect(x, h * 0.85 - bh, bw - 4, bh); x += bw; }
  ctx.fillRect(0, h * 0.85, w, h * 0.15);
}

defineItems([
  // -------------------------------------------------------------- drinks
  S({ id: 'water_bottle', name: 'Spring Water', category: 'drink', price: 1.5, stores: ['freshcart', 'primo', 'dashr'], restaurant: 'nightowl', tags: ['healthy'], desc: 'Crisp mountain spring water.', build: () => bottle({ liquid: '#d9f0ff', cap: '#2a9d8f', label: 'AQUA', opacity: 0.3 }), use: { type: 'drink', sips: 4, open: 'bottle', needs: { thirst: 35 }, leftover: 'empty_bottle', emoji: '💧' } }),
  S({ id: 'soda_cola', name: 'Fizz Cola', category: 'drink', price: 1.99, stores: ['freshcart', 'dashr'], restaurant: 'nightowl', desc: 'Classic cola with an aggressive fizz.', build: () => can({ color: '#c1121f', label: 'FIZZ' }), use: { type: 'drink', sips: 5, open: 'can', fizzy: true, needs: { thirst: 25, fun: 3 }, buff: 'sugarRush', buffMin: 60, leftover: 'empty_can' } }),
  S({ id: 'soda_lime', name: 'Zest Lime Soda', category: 'drink', price: 1.99, stores: ['freshcart', 'dashr'], restaurant: 'nightowl', desc: 'Lime-forward sparkling soda.', build: () => can({ color: '#80b918', color2: '#fffbe6', label: 'ZEST' }), use: { type: 'drink', sips: 5, open: 'can', fizzy: true, needs: { thirst: 28, fun: 2 }, leftover: 'empty_can' } }),
  S({ id: 'coffee_mug', name: 'Fresh Coffee', category: 'drink', price: 0, hidden: true, desc: 'Hot, home-brewed coffee.', build: () => mug({ color: '#f4f1de', liquid: '#3b2414' }), use: { type: 'drink', sips: 4, hot: true, needs: { thirst: 12, energy: 22 }, buff: 'caffeinated', buffMin: 150, emoji: '☕' } }),
  S({ id: 'latte_mug', name: 'Homemade Latte', category: 'drink', price: 0, hidden: true, desc: 'Silky milk and espresso.', build: () => mug({ color: '#c9ada7', liquid: '#b08968', foam: '#f5ebe0' }), use: { type: 'drink', sips: 4, hot: true, needs: { thirst: 15, energy: 20, comfort: 5 }, buff: 'caffeinated', buffMin: 150, emoji: '☕' } }),
  S({ id: 'iced_coffee', name: 'Cold Brew', category: 'drink', price: 4.75, stores: ['dashr'], restaurant: 'beanery', desc: 'Slow-steeped for 18 hours. Smooth & strong.', build: () => takeawayCup({ clear: true, liquid: '#3b2414', straw: '#2b2b2b', h: 0.16 }), use: { type: 'drink', sips: 5, needs: { thirst: 20, energy: 25 }, buff: 'caffeinated', buffMin: 180, emoji: '🧊' } }),
  // -------------------------------------------------------------- food
  S({ id: 'pizza_slice', name: 'Pepperoni Slice', category: 'food', price: 4.5, stores: ['grubhop'], restaurant: 'slicehouse', desc: 'A huge, foldable NY-style slice.', build: () => pizzaSlice({}), use: { type: 'eat', bites: 3, needs: { hunger: 25, fun: 3 }, sound: 'bite', crumbs: '#d4924a', hot: true } }),
  S({ id: 'smash_burger', name: 'Classic Smash Burger', category: 'food', price: 11.5, stores: ['grubhop'], restaurant: 'smashbros', desc: 'Two crispy-edged patties, American cheese, house sauce.', build: () => burger({ double: true }), use: { type: 'eat', bites: 5, needs: { hunger: 55, fun: 5 }, buff: 'wellFed', buffMin: 180, sound: 'bite', crumbs: '#d4924a', hot: true, emoji: '🍔' } }),
  S({ id: 'apple', name: 'Honeycrisp Apple', category: 'food', price: 0.99, stores: ['freshcart'], tags: ['healthy'], desc: 'Snappy, sweet and juicy.', build: () => fruit({ color: '#c1121f' }), use: { type: 'eat', bites: 4, needs: { hunger: 12, thirst: 4 }, sound: 'crunch', crumbs: '#f2e8cf', healthy: true } }),
  S({ id: 'banana', name: 'Banana', category: 'food', price: 0.39, stores: ['freshcart'], tags: ['healthy'], desc: 'Nature\'s pre-wrapped snack.', build: banana, use: { type: 'eat', bites: 3, needs: { hunger: 14, energy: 3 }, sound: 'bite', crumbs: '#fff3b0', healthy: true } }),
  S({ id: 'toast', name: 'Buttered Toast', category: 'food', price: 0, hidden: true, desc: 'Golden, buttery, perfect.', build: toast, use: { type: 'eat', bites: 3, needs: { hunger: 15, comfort: 3 }, sound: 'crunch', crumbs: '#c98b45', hot: true } }),
  S({ id: 'granola_bar', name: 'Oat & Honey Bar', category: 'food', price: 1.49, stores: ['freshcart', 'primo', 'dashr'], restaurant: 'nightowl', tags: ['healthy'], desc: 'Chewy, crunchy, good enough.', build: () => wrapBar({ color: '#e9c46a', print: '#6a4c2a', label: 'OATY' }), use: { type: 'eat', bites: 2, needs: { hunger: 12, energy: 4 }, sound: 'crunch', crumbs: '#c9a66b', healthy: true, leftover: 'wrapper' } }),
  // -------------------------------------------------------------- groceries (ingredients)
  S({ id: 'eggs', name: 'Free-Range Eggs (12)', category: 'grocery', price: 4.99, stores: ['freshcart'], desc: 'A dozen eggs for breakfast and baking.', build: eggCarton, use: { type: 'ingredient', uses: 6 }, emoji: '🥚' }),
  S({ id: 'bread', name: 'Sourdough Loaf', category: 'grocery', price: 5.49, stores: ['freshcart'], desc: 'Tangy sourdough. Makes great toast.', build: breadLoaf, use: { type: 'ingredient', uses: 6 }, emoji: '🍞' }),
  S({ id: 'milk', name: 'Whole Milk', category: 'grocery', price: 3.49, stores: ['freshcart'], desc: 'For lattes, cereal and baking.', build: () => carton({ label: 'MILK', accent: '#1d70b8' }), use: { type: 'ingredient', uses: 5 }, emoji: '🥛' }),
  S({ id: 'coffee_beans', name: 'Single-Origin Beans', category: 'grocery', price: 14.99, stores: ['freshcart', 'dashr'], restaurant: 'beanery', desc: 'Whole bean Ethiopian coffee, notes of blueberry.', build: () => productBox({ w: 0.12, h: 0.18, d: 0.07, color: '#3b2414', accent: '#e9c46a', label: 'BEANS', sub: 'ETHIOPIA' }), use: { type: 'ingredient', uses: 10 }, emoji: '🫘' }),
  // -------------------------------------------------------------- hygiene
  S({ id: 'toothbrush', name: 'Bamboo Toothbrush', category: 'hygiene', price: 4.99, stores: ['primo', 'glow'], desc: 'Hold at a sink with toothpaste in your bathroom.', build: () => toothbrush('#e9c46a'), use: { type: 'toothbrush' }, emoji: '🪥' }),
  S({ id: 'toothbrush_sonic', name: 'Sonic Electric Toothbrush', category: 'hygiene', price: 59, stores: ['glow', 'volt'], rarity: 'uncommon', desc: 'Buzzes 31,000 times a minute. Your dentist will be proud.', build: () => toothbrush('#f1faee'), use: { type: 'toothbrush', electric: true } }),
  S({ id: 'toothpaste', name: 'Arctic Mint Toothpaste', category: 'hygiene', price: 3.99, stores: ['primo', 'glow', 'freshcart'], desc: 'Extra-strength mint. 20 brushes.', build: () => squeezeTube({ color: '#ffffff', cap: '#0077b6', accent: '#0077b6', label: 'ARCTIC' }), use: { type: 'toothpaste', uses: 20, color: '#7fd3ff' } }),
  S({ id: 'hand_soap', name: 'Lavender Hand Soap', category: 'hygiene', price: 6.5, stores: ['primo', 'glow', 'freshcart'], desc: 'Foamy lavender soap. Use at any sink.', build: () => pumpBottle({ color: '#e0d4f5', label: 'LAVENDER', accent: '#6d597a' }), use: { type: 'soap', uses: 25, scent: 'lavender' } }),
  S({ id: 'shampoo', name: 'Coconut Shampoo', category: 'hygiene', price: 9.99, stores: ['primo', 'glow'], desc: 'Used automatically when you shower. 12 washes.', build: () => pumpBottle({ color: '#fefae0', label: 'COCONUT', accent: '#bc6c25', h: 0.22 }), use: { type: 'shampoo', uses: 12, scent: 'coconut & vanilla' } }),
  S({ id: 'body_wash', name: 'Eucalyptus Body Wash', category: 'hygiene', price: 8.99, stores: ['primo', 'glow'], desc: 'Spa-day eucalyptus. Used automatically in the shower.', build: () => pumpBottle({ color: '#d8f3dc', label: 'EUCALYPTUS', accent: '#2d6a4f', h: 0.22 }), use: { type: 'bodywash', uses: 12, scent: 'eucalyptus mint' } }),
  // -------------------------------------------------------------- clothes (starter)
  S({ id: 'tee_white', name: 'Essential White Tee', category: 'clothing', price: 18, stores: ['threadline', 'primo'], desc: 'The perfect plain white tee.', build: () => foldedGarment({ color: '#f8f8f6', style: 'tee' }), use: { type: 'wear', slot: 'top', style: 'tee', color: '#f8f8f6', vibe: ['basic', 'cozy'], points: 4 } }),
  S({ id: 'hoodie_gray', name: 'Heather Grey Hoodie', category: 'clothing', price: 45, stores: ['threadline'], desc: 'Brushed fleece, oversized fit. Maximum cozy.', build: () => foldedGarment({ color: '#9a9ea3', style: 'hoodie' }), use: { type: 'wear', slot: 'top', style: 'hoodie', color: '#9a9ea3', vibe: ['cozy', 'street'], points: 6, comfy: true } }),
  S({ id: 'sweatpants_gray', name: 'Lounge Sweatpants', category: 'clothing', price: 35, stores: ['threadline', 'primo'], desc: 'Officially your work-from-home uniform.', build: () => foldedGarment({ color: '#7d8187', style: 'pants' }), use: { type: 'wear', slot: 'bottom', style: 'sweats', color: '#7d8187', vibe: ['cozy'], points: 4, comfy: true } }),
  S({ id: 'jeans_blue', name: 'Straight-Leg Jeans', category: 'clothing', price: 68, stores: ['threadline'], desc: 'Mid-wash denim with just enough stretch.', build: () => foldedGarment({ color: '#4a6fa5', style: 'jeans', fabricKind: 'denim' }), use: { type: 'wear', slot: 'bottom', style: 'jeans', color: '#4a6fa5', vibe: ['basic', 'street'], points: 6 } }),
  S({ id: 'slippers', name: 'Shearling Slippers', category: 'shoes', price: 39, stores: ['threadline', 'primo'], desc: 'Like walking on clouds made of sheep.', build: () => sneaker({ upper: '#c8b69f', accent: '#efe6da', sole: '#7a6a58', swoosh: false }), use: { type: 'wear', slot: 'shoes', style: 'slippers', color: '#c8b69f', color2: '#efe6da', vibe: ['cozy'], points: 3, comfy: true } }),
  // -------------------------------------------------------------- books & art
  S({ id: 'book_novel_lighthouse', name: 'The Lighthouse Keeper', category: 'books', price: 16.99, stores: ['primo'], desc: 'A quiet novel about solitude, storms and finding home.', build: () => bookModel({ color: '#264653', accent: '#e9c46a', title: 'The Lighthouse Keeper', author: 'Mara Vell', style: 1 }), use: { type: 'book', genre: 'Literary Fiction', pages: 10, seed: 3 } }),
  S({ id: 'book_cozy_mystery', name: 'Murder at the Bakery', category: 'books', price: 12.99, stores: ['primo'], desc: 'A cozy mystery with croissants and a surprisingly sharp cat.', build: () => bookModel({ color: '#bc4749', accent: '#f2e8cf', title: 'Murder at the Bakery', author: 'Pip Halloway', style: 0 }), use: { type: 'book', genre: 'Cozy Mystery', pages: 12, seed: 7 } }),
  S({ id: 'poster_sunset', name: '"Golden Hour" Print', category: 'art', price: 35, stores: ['arthaus', 'nestly'], place: 'wall', tags: ['framed'], desc: 'Framed screenprint of a warm sunset over hills.', build: () => wallArt({ w: 0.5, h: 0.7, draw: sunsetArt, key: 'goldenhour', frame: '#1b1b1b' }) }),
  S({ id: 'poster_city', name: 'City Silhouette Print', category: 'art', price: 29, stores: ['arthaus'], place: 'wall', desc: 'Minimal skyline print — taped, gallery-casual.', build: () => wallArt({ w: 0.45, h: 0.6, draw: cityPrint, key: 'cityprint', frame: null }) }),
  // -------------------------------------------------------------- toys
  S({ id: 'fidget_spinner', name: 'Neon Fidget Spinner', category: 'toys', price: 7.99, stores: ['primo', 'kollectiv'], desc: 'Flick it. Flick it again. Achieve inner peace.', build: () => spinner('#ff4d6d'), use: { type: 'spinner' }, emoji: '🌀' }),
  S({ id: 'rubber_duck', name: 'Classic Rubber Duck', category: 'toys', price: 4.99, stores: ['primo'], tags: ['soft'], desc: 'Squeaks with conviction.', build: rubberDuck, use: { type: 'squeak', verb: 'Squeak' }, emoji: '🦆' }),
  // -------------------------------------------------------------- utility & leftovers
  S({ id: 'empty_can', name: 'Empty Can', category: 'misc', price: 0, hidden: true, tags: ['trash', 'recyclable'], desc: 'Recycle me for a deposit refund.', build: () => can({ color: '#9aa3ad', label: '', key: 'empty' }) }),
  S({ id: 'empty_bottle', name: 'Empty Bottle', category: 'misc', price: 0, hidden: true, tags: ['trash', 'recyclable'], desc: 'Recycle me.', build: () => bottle({ liquid: '#ffffff', label: '', opacity: 0.25 }), initState: () => ({ left: 0 }) }),
  S({ id: 'wrapper', name: 'Wrapper', category: 'misc', price: 0, hidden: true, tags: ['trash'], desc: 'Toss it in the trash.', build: () => rbox(0.1, 0.004, 0.04, 0.002, mat('#d4d4d4', { rough: 0.3, metal: 0.5 })) }),
  S({ id: 'takeout_box_empty', name: 'Empty Takeout Box', category: 'misc', price: 0, hidden: true, tags: ['trash'], desc: 'Toss it in the trash.', build: () => rbox(0.14, 0.07, 0.11, 0.01, mat('#e9e2d6', { rough: 0.9 })) }),
  S({ id: 'watering_can', name: 'Watering Can', category: 'plants', price: 24, stores: ['greenhouse', 'primo'], desc: 'Keep your plants happy. Refill at any sink.', build: wateringCan, use: { type: 'wateringcan' }, emoji: '🚿' }),
  S({ id: 'blank_canvas', name: 'Blank Canvas', category: 'hobby', price: 12, stores: ['arthaus', 'primo'], desc: 'Needed to paint at an easel.', build: blankCanvas }),
  S({
    id: 'custom_painting', name: 'Your Painting', category: 'art', price: 0, hidden: true, place: 'wall', dynamic: true, desc: 'An original work by you!',
    build: (d, st = {}) => {
      const w = 0.4, h = 0.5;
      if (!st.img) return wallArt({ w, h, key: 'blankpaint', draw: (ctx, W, H) => { ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, W, H); }, frame: '#c9a86a' });
      const img = new Image(); img.src = st.img;
      const c = canvas(256, 320); const tex = toTexture(c, { wrap: false });
      img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 256, 320); tex.needsUpdate = true; };
      const g = new THREE.Group();
      const fm = mat('#c9a86a', { rough: 0.35, metal: 0.8 });
      g.add(at(box(w + 0.05, 0.025, 0.03, fm), 0, h / 2 + 0.012, 0.015), at(box(w + 0.05, 0.025, 0.03, fm), 0, -h / 2 - 0.012, 0.015), at(box(0.025, h, 0.03, fm), -w / 2 - 0.012, 0, 0.015), at(box(0.025, h, 0.03, fm), w / 2 + 0.012, 0, 0.015));
      g.add(at(plane(w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), { cast: false, receive: true }), 0, 0, 0.006));
      g.add(at(box(w, h, 0.005, mat('#f4f1ea')), 0, 0, 0.002));
      return g;
    },
  }),
]);


function friedEggs() {
  const g = group(plate({ r: 0.11 }));
  for (const [x, z] of [[-0.035, 0], [0.04, 0.02]]) {
    const w = cyl(0.045, 0.048, 0.006, mat('#fbfaf5', { rough: 0.4 }), 20); w.scale.z = 0.85; w.userData.bite = 1; at(w, x, 0.016, z); g.add(w);
    const y = sph(0.018, mat('#ffb703', { rough: 0.25, clearcoat: 0.8 }), 14, 10); y.scale.y = 0.55; y.userData.bite = 0; at(y, x, 0.022, z); g.add(y);
  }
  const t = rbox(0.07, 0.012, 0.05, 0.01, mat('#c98b45', { rough: 0.8 })); t.userData.bite = 2; at(t, 0, 0.02, -0.06); g.add(t);
  return g;
}
function frenchToast() {
  const g = group(plate({ r: 0.11 }));
  for (let i = 0; i < 3; i++) { const t = rbox(0.09, 0.02, 0.09, 0.02, mat('#c27c3a', { rough: 0.6 })); t.rotation.y = i * 0.4; t.userData.bite = 3 - i; at(t, 0, 0.02 + i * 0.02, 0); g.add(t); }
  const syrup = cyl(0.04, 0.045, 0.004, mat('#7f3b08', { rough: 0.1, clearcoat: 1 }), 18); syrup.userData.bite = 0; at(syrup, 0, 0.083, 0); g.add(syrup);
  for (let i = 0; i < 5; i++) { const b = sph(0.01, mat('#3a0ca3', { rough: 0.3 }), 8, 6); b.userData.bite = 0; at(b, Math.cos(i) * 0.03, 0.088, Math.sin(i) * 0.03); g.add(b); }
  return g;
}
function soupPot() {
  const g = group(lathe([[0.001, 0], [0.08, 0], [0.085, 0.09], [0.08, 0.09], [0.075, 0.008], [0.001, 0.008]], MAT.ceramic('#e76f51'), 28));
  const s = cyl(0.074, 0.074, 0.05, mat('#c1440e', { rough: 0.5 }), 24); s.userData.bite = 9; at(s, 0, 0.055, 0); g.add(s);
  for (let i = 0; i < 4; i++) { const b = sph(0.008, mat('#52b788', { rough: 0.6 }), 8, 6); b.scale.y = 0.4; b.userData.bite = i; at(b, Math.cos(i * 1.6) * 0.04, 0.081, Math.sin(i * 1.6) * 0.04); g.add(b); }
  g.add(at(rot(cyl(0.008, 0.008, 0.18, MAT.metal('#c9ccd0'), 8), 0.4, 0, 0.3), 0.04, 0.12, 0));
  return g;
}
function bubbleWand() {
  const g = new THREE.Group();
  g.add(at(cyl(0.035, 0.035, 0.11, mat('#ff70a6', { rough: 0.2, opacity: 0.8, transparent: true }), 20), 0, 0.055, 0));
  g.add(at(cyl(0.036, 0.036, 0.02, mat('#ffd166', { rough: 0.4 }), 20), 0, 0.12, 0));
  g.add(at(cyl(0.003, 0.003, 0.16, mat('#ffd166', { rough: 0.4 }), 8), 0.0, 0.2, 0));
  g.add(at(torus(0.028, 0.004, mat('#ffd166', { rough: 0.4 }), 8, 24), 0, 0.3, 0));
  return g;
}
function stressBall() { const g = group(at(sph(0.035, mat('#ffbe0b', { rough: 0.6 }), 24, 16), 0, 0.035, 0)); for (const s of [-1, 1]) g.add(at(sph(0.005, mat('#111'), 8, 6), s * 0.012, 0.045, 0.031)); g.add(at(rot(torus(0.01, 0.002, mat('#111'), 6, 12, Math.PI), 0, 0, Math.PI), 0, 0.03, 0.033)); return g; }
function fidgetCube() {
  const g = group(at(rbox(0.04, 0.04, 0.04, 0.008, mat('#4361ee', { rough: 0.35 })), 0, 0.02, 0));
  for (let i = 0; i < 3; i++) g.add(at(cyl(0.004, 0.004, 0.004, mat('#ffffff', { rough: 0.3 }), 10), -0.01 + i * 0.01, 0.041, 0));
  g.add(at(rot(cyl(0.008, 0.008, 0.004, mat('#ef476f', { rough: 0.4 }), 14), Math.PI / 2, 0, 0), 0, 0.02, 0.021));
  return g;
}

defineItems([
  S({ id: 'dish_fried_eggs', name: 'Sunny-Side Eggs', category: 'food', price: 0, hidden: true, tags: ['homemade'], desc: 'Homemade, runny yolks, a little toast on the side.', build: friedEggs, use: { type: 'eat', bites: 4, needs: { hunger: 40, energy: 5, comfort: 5 }, buff: 'wellFed', buffMin: 180, sound: 'bite', hot: true, healthy: true, emoji: '🍳' } }),
  S({ id: 'dish_french_toast', name: 'French Toast Stack', category: 'food', price: 0, hidden: true, tags: ['homemade'], desc: 'Golden, custardy, drowning in syrup and berries.', build: frenchToast, use: { type: 'eat', bites: 5, needs: { hunger: 50, fun: 8, comfort: 6 }, buff: 'wellFed', buffMin: 200, sound: 'bite', hot: true, sweet: true, emoji: '🍞' } }),
  S({ id: 'soup_gift', name: 'Bea\'s Tomato Basil Soup', category: 'food', price: 0, hidden: true, desc: 'Made with love by your neighbor. Still warm.', build: soupPot, use: { type: 'eat', bites: 5, needs: { hunger: 45, comfort: 12, thirst: 5 }, buff: 'cozy', buffMin: 240, sound: 'slurp', hot: true, healthy: true, emoji: '🍲' } }),
  S({ id: 'bubble_wand', name: 'Rainbow Bubble Wand', category: 'toys', price: 6.99, stores: ['primo', 'kollectiv'], desc: 'Blow streams of iridescent bubbles. They float, drift and pop.', build: bubbleWand, use: { type: 'bubbles', uses: 40, count: 14 }, emoji: '🫧' }),
  S({ id: 'stress_ball', name: 'Smiley Stress Ball', category: 'toys', price: 4.99, stores: ['primo'], tags: ['soft', 'ball'], desc: 'Squeeze away your worries. Or throw it at a wall.', build: stressBall, use: { type: 'squish', verb: 'Squeeze', sound: 'squish', comfort: 2.5, fun: 1 }, emoji: '😊' }),
  S({ id: 'fidget_cube', name: 'Fidget Cube', category: 'toys', price: 9.99, stores: ['primo', 'kollectiv'], desc: 'Six sides of clicky, rolly, flippy satisfaction.', build: fidgetCube, use: { type: 'clicker', verb: 'Click', sound: 'click' }, emoji: '🎲' }),
  S({
    id: 'custom_photo', name: 'Framed Photo', category: 'art', price: 0, hidden: true, place: 'wall', dynamic: true, desc: 'A memory, printed and framed.',
    build: (d, st = {}) => {
      const w = 0.32, h = 0.24;
      const c = canvas(320, 240); const tex = toTexture(c, { wrap: false });
      if (st.img) { const img = new Image(); img.src = st.img; img.onload = () => { const x = c.getContext('2d'); x.drawImage(img, 0, 0, 320, 240); tex.needsUpdate = true; }; }
      const g = new THREE.Group();
      const fm = mat('#f4f1ea', { rough: 0.5 });
      g.add(at(box(w + 0.06, h + 0.06, 0.02, fm), 0, 0, 0.01));
      g.add(at(plane(w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), { cast: false, receive: true }), 0, 0, 0.0205));
      return g;
    },
  }),
]);

// a tiny handler so groceries explain themselves
import { registerBehaviors } from '../items/behaviors/index.js';
import { RECIPES } from '../world/cooking.js';
registerBehaviors({
  ingredient: {
    subtitle: (inst) => (inst.def.use.uses ? `${inst.st.uses ?? inst.def.use.uses} uses left` : ''),
    held(inst) {
      return [{ key: 'LMB', label: 'What can I make?', run: () => {
        const r = RECIPES.filter((x) => x.ingredients.includes(inst.def.id)).map((x) => x.name);
        G.ui.toast(r.length ? `${inst.def.name}: ${r.slice(0, 4).join(', ')}${r.length > 4 ? '…' : ''} (stove)` : `${inst.def.name} is used by kitchen appliances`, { icon: '👩‍🍳', duration: 4 });
      } }];
    },
  },
});
import { G } from '../game.js';

void sph; void lathe; void decal; void fitText; void jar; void takeawayCup; void box;
