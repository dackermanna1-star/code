// Catalogue: kitchen appliances — countertop `station` items that turn
// groceries into food & drinks (see behaviors/kitchen.js), and the hidden
// items they make. Every appliance has a mesh named `glow` (lights up while
// working); spinning parts are named `spin`.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, hemi, torus, cone, lathe, tube, plane, at, rot, group, named, decal, FONT, fitText } from '../items/kit.js';
import { mug, glassTumbler, plate } from './shared.js';
import { bite, F, GL, FLAT, bowlShell, fill, scatter, scoop, whip, noodles, ramenEgg, waffle, cookieModel, spoon, dipCup, lathe4, speckTex } from './food.js';
import { cupSaucer } from './drinks.js';

const PI = Math.PI;
const glowMat = (c) => mat('#222222', { emissive: c, ei: 0, rough: 0.3 });
const glowing = (m) => named(m, 'glow');
function label(key, w, h, draw, o = {}) { return decal(w, h, 'kitch:' + key, draw, { tw: 256, ...o }); }
function brand(key, w, h, text, fg = '#ffffff', font = 0.55) {
  return label(key, w, h, (ctx, W, H) => { ctx.clearRect(0, 0, W, H); ctx.fillStyle = fg; ctx.font = `800 ${H * font}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, text, W / 2, H / 2, W * 0.92); });
}
function display(key, w, h, text, color = '#7dff9a') {
  const d = decal(w, h, 'kitch:disp:' + key, (ctx, W, H) => { ctx.fillStyle = '#071008'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = color; ctx.font = `700 ${H * 0.62}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, H / 2 + 1); }, { tw: 128, emissive: true, ei: 0.7 });
  return d;
}
const knob = (r, h, m) => rot(cyl(r, r * 1.05, h, m, 20), PI / 2, 0, 0);

// ------------------------------------------------------------------ microwave
function microwave() {
  const g = new THREE.Group();
  const W = 0.46, H = 0.27, D = 0.34;
  const shell = mat('#9fd8cb', { rough: 0.35, clearcoat: 0.6 }), inner = mat('#e9ecef', { rough: 0.5 }), dark = mat('#2b2d31', { rough: 0.4 });
  g.add(at(rbox(W, 0.02, D, 0.008, shell), 0, H - 0.01, 0), at(rbox(W, 0.02, D, 0.008, shell), 0, 0.01, 0));
  g.add(at(box(0.02, H, D, shell), -W / 2 + 0.01, H / 2, 0), at(box(W, H, 0.02, shell), 0, H / 2, -D / 2 + 0.01));
  g.add(at(box(0.11, H - 0.02, D, shell), W / 2 - 0.055, H / 2, 0));
  g.add(at(box(0.31, 0.003, D - 0.04, inner), -0.045, 0.022, 0.0));
  g.add(glowing(at(box(0.31, H - 0.04, 0.004, glowMat('#ffcf7a')), -0.045, H / 2, -D / 2 + 0.022)));
  // turntable with a little dish on it
  const spin = new THREE.Group(); spin.name = 'spin';
  spin.add(at(cyl(0.11, 0.11, 0.005, mat('#dfeff2', { rough: 0.05, opacity: 0.6, transparent: true }), 32), 0, 0, 0));
  spin.add(at(lathe([[0.001, 0], [0.03, 0], [0.045, 0.03], [0.042, 0.031], [0.028, 0.004], [0.001, 0.004]], MAT.ceramic('#f4a261'), 24), 0.045, 0.003, 0));
  spin.position.set(-0.045, 0.027, 0.0);
  g.add(spin);
  // door
  const dz = D / 2 + 0.006, dw = 0.345, dx = -W / 2 + dw / 2;
  g.add(at(box(dw, 0.035, 0.012, shell), dx, H - 0.0175, dz), at(box(dw, 0.035, 0.012, shell), dx, 0.0175, dz));
  g.add(at(box(0.03, H - 0.07, 0.012, shell), -W / 2 + 0.015, H / 2, dz), at(box(0.03, H - 0.07, 0.012, shell), dx + dw / 2 - 0.015, H / 2, dz));
  g.add(at(box(dw - 0.06, H - 0.07, 0.004, mat('#16181c', { rough: 0.05, opacity: 0.62, transparent: true, depthWrite: false })), dx, H / 2, dz));
  g.add(at(rbox(0.016, 0.16, 0.025, 0.006, MAT.chrome()), dx + dw / 2 - 0.012, H / 2, dz + 0.02));
  // controls
  const pz = D / 2 + 0.001;
  const disp = display('mw', 0.08, 0.03, '12:00'); g.add(at(disp, W / 2 - 0.055, H - 0.05, pz));
  g.add(at(knob(0.024, 0.02, dark), W / 2 - 0.055, 0.15, pz + 0.01), at(knob(0.018, 0.018, dark), W / 2 - 0.055, 0.08, pz + 0.009));
  for (let i = 0; i < 3; i++) g.add(at(rbox(0.018, 0.01, 0.006, 0.002, mat('#fbfaf7', { rough: 0.4 })), W / 2 - 0.075 + i * 0.02, 0.2, pz + 0.003));
  return g;
}
// ------------------------------------------------------------------ kettle
function kettle() {
  const g = new THREE.Group();
  const black = mat('#1f2124', { rough: 0.45, metal: 0.2 }), steel = MAT.metal('#d5d8dc', 0.2);
  g.add(at(cyl(0.08, 0.085, 0.02, black, 32), 0, 0.01, 0));
  g.add(glowing(at(rot(torus(0.081, 0.003, glowMat('#46b4ff'), 6, 40), PI / 2, 0, 0), 0, 0.012, 0)));
  g.add(at(lathe([[0.001, 0.02], [0.07, 0.02], [0.076, 0.04], [0.074, 0.13], [0.06, 0.158], [0.036, 0.168], [0.001, 0.168]], mat('#f3efe7', { rough: 0.5, clearcoat: 0.3 }), 32), 0, 0, 0));
  g.add(at(cyl(0.077, 0.077, 0.012, steel, 32), 0, 0.03, 0));
  g.add(at(cyl(0.02, 0.026, 0.012, black, 16), 0, 0.172, 0), at(sph(0.009, black, 12, 8), 0, 0.182, 0));
  g.add(tube([[0.07, 0.05, 0], [0.105, 0.07, 0], [0.122, 0.12, 0], [0.135, 0.165, 0], [0.165, 0.18, 0], [0.19, 0.178, 0]], 0.0065, steel, 30, 10));
  g.add(tube([[-0.07, 0.15, 0], [-0.115, 0.15, 0], [-0.13, 0.1, 0], [-0.11, 0.05, 0], [-0.075, 0.045, 0]], 0.009, black, 24, 10));
  g.add(at(rbox(0.03, 0.012, 0.012, 0.004, mat('#d4a373', { rough: 0.5 })), -0.12, 0.13, 0));
  return g;
}
// ------------------------------------------------------------------ blender
function blender() {
  const g = new THREE.Group();
  const base = mat('#2b2d31', { rough: 0.35, metal: 0.3 });
  g.add(at(rbox(0.17, 0.11, 0.17, 0.025, base), 0, 0.055, 0));
  g.add(at(knob(0.022, 0.02, MAT.chrome()), 0, 0.055, 0.092));
  g.add(glowing(at(rot(torus(0.03, 0.003, glowMat('#ff4d6d'), 6, 30), 0, 0, 0), 0, 0.055, 0.086)));
  g.add(at(cyl(0.065, 0.07, 0.02, base, 4), 0, 0.12, 0).rotateY(PI / 4));
  const jar = mat('#e8f4f6', { rough: 0.04, opacity: 0.28, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  g.add(at(lathe4([[0.001, 0], [0.065, 0], [0.085, 0.22], [0.082, 0.222], [0.062, 0.004], [0.001, 0.004]], jar), 0, 0.13, 0));
  g.add(at(rbox(0.125, 0.018, 0.125, 0.008, mat('#1d1d1d', { rough: 0.4 })), 0, 0.358, 0), at(cyl(0.022, 0.022, 0.025, mat('#1d1d1d', { rough: 0.4 }), 16), 0, 0.378, 0));
  g.add(tube([[-0.08, 0.32, 0], [-0.125, 0.31, 0], [-0.13, 0.2, 0], [-0.075, 0.16, 0]], 0.012, mat('#1d1d1d', { rough: 0.4 }), 20, 8));
  const spin = new THREE.Group(); spin.name = 'spin';
  const blade = MAT.metal('#e1e4e8', 0.15);
  spin.add(at(cyl(0.008, 0.01, 0.02, blade, 10), 0, 0, 0));
  for (let i = 0; i < 4; i++) { const b = box(0.05, 0.002, 0.012, blade); b.rotation.set(i % 2 ? 0.35 : -0.35, i * PI / 2, 0); spin.add(at(b, Math.cos(i * PI / 2) * 0.022, 0.008 + (i % 2) * 0.006, -Math.sin(i * PI / 2) * 0.022)); }
  spin.position.set(0, 0.145, 0);
  g.add(spin);
  g.add(at(brand('vortex', 0.07, 0.018, 'VORTEX', '#d5d8dc'), 0, 0.095, 0.0862));
  return g;
}
// ------------------------------------------------------------------ air fryer
function airFryer() {
  const g = new THREE.Group();
  const body = mat('#26282c', { rough: 0.55 }), gloss = mat('#16181b', { rough: 0.15, clearcoat: 0.8 });
  g.add(at(rbox(0.27, 0.31, 0.3, 0.07, body), 0, 0.155, 0));
  g.add(at(rbox(0.22, 0.13, 0.03, 0.02, gloss), 0, 0.085, 0.142));
  g.add(at(rbox(0.09, 0.03, 0.06, 0.012, gloss), 0, 0.105, 0.18));
  g.add(at(rbox(0.04, 0.016, 0.04, 0.006, MAT.chrome()), 0, 0.112, 0.19));
  g.add(at(rbox(0.18, 0.075, 0.012, 0.01, gloss), 0, 0.205, 0.148));
  g.add(glowing(at(box(0.11, 0.034, 0.003, glowMat('#ff8a3d')), 0, 0.212, 0.1545)));
  g.add(at(display('af', 0.06, 0.022, '200°', '#ffb070'), 0, 0.212, 0.1562));
  for (let i = 0; i < 4; i++) g.add(at(box(0.16, 0.004, 0.01, mat('#111')), 0, 0.311, -0.06 - i * 0.02));
  for (let i = 0; i < 3; i++) { const b = cyl(0.007, 0.007, 0.004, mat('#5a5d63', { rough: 0.4 }), 12); b.rotation.x = PI / 2; g.add(at(b, -0.05 + i * 0.05, 0.183, 0.155)); }
  return g;
}
// ------------------------------------------------------------------ waffle maker
function waffleMaker() {
  const g = new THREE.Group();
  const black = mat('#1d1f22', { rough: 0.3, clearcoat: 0.6 }), steel = MAT.metal('#c9ccd0', 0.25);
  g.add(at(rbox(0.3, 0.03, 0.26, 0.012, black), 0, 0.015, 0));
  g.add(at(cyl(0.11, 0.115, 0.04, steel, 36), 0, 0.05, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.075, -0.11);
  lid.add(at(cyl(0.112, 0.112, 0.02, steel, 36), 0, 0.01, 0.11));
  const dome = hemi(0.11, black); dome.scale.y = 0.28; lid.add(at(dome, 0, 0.02, 0.11));
  lid.add(at(rbox(0.05, 0.02, 0.1, 0.008, black), 0, 0.02, 0.24));
  lid.add(at(brand('waffle', 0.1, 0.024, 'BELGIAN', '#d5d8dc'), 0, 0.0505, 0.11).rotateX(-PI / 2));
  lid.rotation.x = -0.04;
  g.add(lid);
  g.add(at(rbox(0.05, 0.05, 0.04, 0.01, black), 0, 0.055, -0.13));
  g.add(glowing(at(sph(0.007, glowMat('#ff3b30'), 12, 8), 0.1, 0.03, 0.128)));
  g.add(at(sph(0.007, mat('#3a3a3a', { rough: 0.3 }), 12, 8), 0.08, 0.03, 0.128));
  return g;
}
// ------------------------------------------------------------------ espresso machine (luxe)
function espressoMachine() {
  const g = new THREE.Group();
  const steel = MAT.metal('#d9dcdf', 0.18), dark = mat('#1d1f22', { rough: 0.3 }), wood = MAT.wood('#7a4a2a');
  g.add(at(rbox(0.32, 0.34, 0.34, 0.02, steel), 0, 0.17, -0.02));
  g.add(at(box(0.3, 0.08, 0.28, dark), 0, 0.04, 0.03));
  g.add(at(box(0.26, 0.012, 0.12, MAT.metal('#b5b9be', 0.3)), 0, 0.086, 0.12));
  for (let i = 0; i < 6; i++) g.add(at(box(0.24, 0.004, 0.006, dark), 0, 0.093, 0.075 + i * 0.018));
  g.add(at(cyl(0.035, 0.04, 0.04, steel, 24), 0, 0.235, 0.17));
  const pf = group(at(cyl(0.034, 0.03, 0.03, steel, 24), 0, 0, 0), at(rot(rbox(0.024, 0.024, 0.12, 0.01, wood), 0.15, 0, 0), 0, -0.004, 0.08));
  pf.rotation.y = 0.3; g.add(at(pf, 0, 0.2, 0.17));
  g.add(at(rbox(0.012, 0.04, 0.012, 0.005, steel), -0.012, 0.165, 0.17), at(rbox(0.012, 0.04, 0.012, 0.005, steel), 0.012, 0.165, 0.17));
  g.add(tube([[0.12, 0.27, 0.15], [0.135, 0.26, 0.2], [0.14, 0.16, 0.21], [0.13, 0.12, 0.2]], 0.005, steel, 20, 8));
  g.add(at(knob(0.018, 0.03, wood), 0.12, 0.29, 0.16));
  const gauge = label('gauge', 0.07, 0.07, (ctx, W, H) => { ctx.fillStyle = '#fbfaf5'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, 7); ctx.fill(); ctx.strokeStyle = '#1d1f22'; ctx.lineWidth = 6; ctx.stroke(); ctx.lineWidth = 3; for (let i = 0; i <= 10; i++) { const a = PI * 0.75 + i / 10 * PI * 1.5; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * W * 0.36, H / 2 + Math.sin(a) * H * 0.36); ctx.lineTo(W / 2 + Math.cos(a) * W * 0.44, H / 2 + Math.sin(a) * H * 0.44); ctx.stroke(); } ctx.fillStyle = '#c1121f'; ctx.fillRect(W * 0.62, H * 0.25, 8, 8); ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W * 0.72, H * 0.3); ctx.stroke(); }, { tw: 128 });
  g.add(at(gauge, -0.09, 0.27, 0.151));
  g.add(at(brand('maestro', 0.16, 0.03, 'MAESTRO', '#1d1f22'), 0.0, 0.31, 0.151));
  g.add(glowing(at(sph(0.006, glowMat('#ffb347'), 10, 8), 0.09, 0.31, 0.152)));
  g.add(at(lathe([[0.03, 0], [0.04, 0.02], [0.065, 0.11], [0.062, 0.112], [0.038, 0.022], [0.028, 0.004]], mat('#e8f4f6', { rough: 0.04, opacity: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 28), -0.07, 0.34, -0.06));
  g.add(at(cyl(0.05, 0.035, 0.05, mat('#ffffff', { map: speckTex('beans', '#3b2414', ['#5a3a22', '#2a170b'], 80, 4, 2), rough: 0.5 }), 20), -0.07, 0.385, -0.06));
  g.add(at(cyl(0.066, 0.066, 0.012, dark, 28), -0.07, 0.458, -0.06));
  for (const x of [-0.14, 0.14]) g.add(at(cyl(0.006, 0.006, 0.18, steel, 8), x, 0.345, 0.03).rotateX(PI / 2));
  return g;
}
// ------------------------------------------------------------------ rice cooker
function riceCooker() {
  const g = new THREE.Group();
  const white = mat('#f7f5f0', { rough: 0.25, clearcoat: 0.6 }), dark = mat('#2b2d31', { rough: 0.3 });
  g.add(lathe([[0.001, 0], [0.11, 0], [0.13, 0.03], [0.13, 0.15], [0.12, 0.16], [0.001, 0.16]], white, 40));
  const lid = hemi(0.125, white); lid.scale.y = 0.42; g.add(at(lid, 0, 0.158, 0));
  g.add(at(rot(torus(0.05, 0.008, mat('#cfd3d8', { rough: 0.3 }), 8, 24, PI), 0, 0, 0), 0, 0.2, 0));
  g.add(at(cyl(0.016, 0.018, 0.012, dark, 14), 0.04, 0.205, -0.03));
  const panel = rbox(0.1, 0.06, 0.02, 0.01, dark); panel.rotation.x = -0.15; g.add(at(panel, 0, 0.09, 0.126));
  g.add(glowing(at(rot(sph(0.0055, glowMat('#ff9f1c'), 10, 8), 0, 0, 0), -0.03, 0.1, 0.138)));
  g.add(at(display('rc', 0.04, 0.016, 'WHITE', '#ffb703'), 0.015, 0.1, 0.1375));
  for (let i = 0; i < 2; i++) g.add(at(rot(cyl(0.007, 0.007, 0.004, mat('#cfd3d8'), 12), PI / 2 - 0.15, 0, 0), -0.02 + i * 0.04, 0.075, 0.137));
  g.add(at(rbox(0.03, 0.12, 0.006, 0.003, mat('#fbfaf7', { rough: 0.4 })), -0.14, 0.09, 0.0).rotateZ(0.08));
  return g;
}
// ------------------------------------------------------------------ ice cream maker
function iceCreamMaker() {
  const g = new THREE.Group();
  const white = mat('#fbfaf7', { rough: 0.3, clearcoat: 0.5 }), pastel = mat('#a0d8ef', { rough: 0.3, clearcoat: 0.5 });
  g.add(at(rbox(0.24, 0.06, 0.24, 0.03, white), 0, 0.03, 0));
  g.add(glowing(at(sph(0.007, glowMat('#4cd964'), 10, 8), 0.07, 0.04, 0.12)));
  g.add(at(knob(0.016, 0.014, pastel), -0.06, 0.035, 0.12));
  g.add(at(lathe([[0.001, 0], [0.09, 0], [0.1, 0.13], [0.092, 0.13], [0.082, 0.01], [0.001, 0.01]], pastel, 36), 0, 0.06, 0));
  g.add(at(cyl(0.08, 0.08, 0.06, F('#fbf1dc', 0.6), 32), 0, 0.12, 0));
  const spin = new THREE.Group(); spin.name = 'spin';
  for (let i = 0; i < 2; i++) { const p = box(0.12, 0.08, 0.008, mat('#ffffff', { rough: 0.4 })); p.rotation.y = i * PI / 2; spin.add(at(p, 0, 0.06, 0)); }
  spin.add(at(cyl(0.01, 0.01, 0.06, white, 12), 0, 0.12, 0));
  spin.position.set(0, 0.08, 0); g.add(spin);
  g.add(at(lathe([[0.104, 0], [0.104, 0.012], [0.07, 0.04], [0.03, 0.05], [0.03, 0.052]], mat('#e8f4f6', { rough: 0.04, opacity: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 36), 0, 0.19, 0));
  g.add(at(rbox(0.08, 0.06, 0.1, 0.02, white), 0, 0.255, 0));
  g.add(at(brand('scoopdream', 0.07, 0.02, 'SCOOP DREAM', '#5aa9d6'), 0, 0.255, 0.0505));
  return g;
}
// ------------------------------------------------------------------ citrus juicer
function juicer() {
  const g = new THREE.Group();
  const white = mat('#fbfaf7', { rough: 0.3, clearcoat: 0.5 }), steel = MAT.metal('#d5d8dc', 0.2);
  g.add(at(cyl(0.085, 0.095, 0.08, white, 36), 0, 0.04, 0));
  g.add(glowing(at(sph(0.006, glowMat('#ff9f1c'), 10, 8), 0, 0.03, 0.093)));
  g.add(at(lathe([[0.001, 0], [0.085, 0], [0.095, 0.05], [0.09, 0.052], [0.08, 0.006], [0.001, 0.006]], mat('#e8f4f6', { rough: 0.04, opacity: 0.35, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 36), 0, 0.08, 0));
  g.add(at(cyl(0.08, 0.08, 0.004, mat('#f5a524', { rough: 0.2, opacity: 0.85, transparent: true }), 30), 0, 0.09, 0));
  g.add(at(rot(cone(0.012, 0.03, mat('#e8f4f6', { rough: 0.04, opacity: 0.35, transparent: true }), 10), 0, 0, -PI / 2 + 0.3), 0.1, 0.11, 0));
  const spin = named(cone(0.04, 0.05, mat('#f3efe2', { rough: 0.3, flat: true }), 10), 'spin');
  g.add(at(spin, 0, 0.115, 0));
  g.add(at(rbox(0.032, 0.16, 0.045, 0.012, steel), -0.1, 0.15, 0));
  const arm = rbox(0.22, 0.022, 0.05, 0.01, steel); arm.rotation.z = 0.35; g.add(at(arm, 0.0, 0.262, 0));
  g.add(at(rot(hemi(0.045, steel), PI, 0, 0), 0.0, 0.245, 0));
  g.add(at(rot(cyl(0.012, 0.012, 0.03, mat('#1d1d1d', { rough: 0.4 }), 12), 0, 0, PI / 2 + 0.35), 0.11, 0.3, 0));
  return g;
}
// ------------------------------------------------------------------ stand mixer
function standMixer(color = '#8fd3c1', key = 'mint') {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.25, clearcoat: 0.9 }), steel = MAT.metal('#d9dcdf', 0.15);
  g.add(at(rbox(0.34, 0.05, 0.2, 0.025, paint), 0.0, 0.025, 0));
  g.add(at(rbox(0.1, 0.24, 0.12, 0.04, paint), -0.12, 0.16, 0));
  const head = rbox(0.34, 0.11, 0.12, 0.055, paint); g.add(at(head, -0.01, 0.31, 0));
  g.add(at(rot(cyl(0.035, 0.04, 0.03, steel, 24), 0, 0, PI / 2), 0.172, 0.31, 0));
  g.add(at(rot(torus(0.058, 0.004, steel, 6, 40), 0, PI / 2, 0), 0.1, 0.31, 0));
  g.add(at(lathe([[0.001, 0], [0.05, 0], [0.07, 0.02], [0.09, 0.08], [0.095, 0.15], [0.088, 0.152], [0.084, 0.08], [0.064, 0.022], [0.046, 0.006], [0.001, 0.006]], steel, 36), 0.06, 0.05, 0));
  g.add(at(rot(torus(0.012, 0.003, steel, 6, 16, PI), 0, 0, PI / 2), 0.158, 0.17, 0));
  const spin = new THREE.Group(); spin.name = 'spin';
  spin.add(at(cyl(0.006, 0.006, 0.08, steel, 10), 0, 0.04, 0));
  const beater = torus(0.03, 0.004, mat('#f4f4f4', { rough: 0.3 }), 6, 24); beater.scale.set(1, 1.5, 1); spin.add(at(beater, 0, -0.03, 0));
  spin.position.set(0.06, 0.12, 0); g.add(spin);
  g.add(at(rbox(0.012, 0.03, 0.012, 0.004, steel), -0.1, 0.35, 0.065));
  g.add(glowing(at(sph(0.006, glowMat('#ffffff'), 10, 8), -0.12, 0.2, 0.0605)));
  g.add(at(brand('mixer:' + key, 0.1, 0.022, 'ARTISAN', '#ffffff'), -0.02, 0.31, 0.0605));
  return g;
}

// ------------------------------------------------------------------ outputs (hidden)
function popcornBowl() {
  const g = group(bowlShell(0.09, 0.06, MAT.ceramic('#e63946')));
  const pm = [FLAT('#fff1c4', 0.7), FLAT('#ffe08a', 0.7), FLAT('#fff8e3', 0.7)];
  scatter(g, 20, (i) => { const p = sph(0.012, pm[i % 3], 7, 5); p.rotation.set(i, i * 2, 0); return p; }, { rad: 0.065, y: 0.05, tag: (i) => i % 5, seed: 71 });
  scatter(g, 8, (i) => { const p = sph(0.012, pm[i % 3], 7, 5); return p; }, { rad: 0.035, y: 0.068, tag: (i) => i % 5, seed: 72 });
  return g;
}
function mugCake() {
  const g = mug({ color: '#f4a261', liquid: '#3b1d10', h: 0.09, r: 0.042 });
  const top = sph(0.037, F('#4a2617', 0.8), 18, 10); top.scale.y = 0.45; g.add(bite(at(top, 0, 0.088, 0), 1));
  g.add(bite(at(whip(0.016), 0, 0.1, 0), 0));
  return g;
}
function teaMug() {
  const g = mug({ color: '#cfe3d8', liquid: '#9bae3c', h: 0.09, r: 0.042 });
  g.add(tube([[0.0, 0.08, 0.0], [0.02, 0.095, 0.02], [0.038, 0.09, 0.03], [0.045, 0.06, 0.036]], 0.0006, F('#ffffff'), 10, 3));
  g.add(at(rbox(0.016, 0.02, 0.002, 0.001, F('#2d6a4f', 0.6)), 0.045, 0.05, 0.037));
  return g;
}
function cocoaMug() {
  const g = mug({ color: '#c8102e', liquid: '#5a2d14', h: 0.09, r: 0.042 });
  for (let i = 0; i < 5; i++) g.add(bite(at(rot(rbox(0.011, 0.009, 0.011, 0.003, F('#fdf8f3', 0.7)), i, i * 2, 0), Math.cos(i * 1.3) * 0.02, 0.083, Math.sin(i * 1.3) * 0.02), i % 3));
  return g;
}
function instantRamenBowl() {
  const g = group(bowlShell(0.085, 0.06, MAT.ceramic('#fbfaf7')));
  g.add(bite(at(cyl(0.077, 0.045, 0.04, mat('#d9a14a', { rough: 0.25 }), 28), 0, 0.03, 0), 9));
  g.add(...noodles(5, { w: 0.09, d: 0.06, y: 0.051, r: 0.0024, m: F('#f2d27a', 0.45), seed: 81, amp: 0.008 }).map((n, i) => bite(n, i % 4)));
  g.add(bite(ramenEgg(0.03, 0.049, 0.02, 0.4), 2));
  for (let i = 0; i < 5; i++) g.add(bite(at(rot(torus(0.0035, 0.0013, F('#5cb340', 0.5), 5, 10), PI / 2, 0, 0), -0.02 + Math.cos(i * 2.3) * 0.012, 0.055, -0.02 + Math.sin(i * 2.3) * 0.012), 0));
  return g;
}
function homeSmoothie(color, garnish) {
  const g = glassTumbler({ liquid: color, h: 0.13, r: 0.035, ice: false });
  if (garnish === 'banana') g.add(at(rot(cyl(0.013, 0.013, 0.004, F('#f7e8b0', 0.5), 14), 1.2, 0, 0.2), 0.03, 0.13, 0));
  else g.add(at(sph(0.007, GL('#2b2d6e'), 10, 8), 0.012, 0.11, 0), at(sph(0.007, GL('#c71f37'), 10, 8), -0.008, 0.11, 0.008));
  g.add(at(rot(cyl(0.0035, 0.0035, 0.16, mat('#f48fb1', { rough: 0.4 }), 8), 0.12, 0, -0.15), 0.01, 0.1, 0));
  return g;
}
function homeFries() {
  const g = group(plate({ r: 0.1, color: '#f4efe6' }));
  g.add(at(rbox(0.12, 0.002, 0.1, 0.001, F('#fbf6ec', 0.9)), 0, 0.013, 0));
  const fm = [F('#e9a52c', 0.6), F('#d98a1c', 0.6)];
  for (let i = 0; i < 14; i++) { const f = box(0.008, 0.008, 0.075, fm[i % 2]); f.rotation.set(0.1 * (i % 3), i * 0.5, 0.1); g.add(bite(at(f, -0.02 + (i % 4) * 0.012, 0.018 + Math.floor(i / 4) * 0.007, -0.01 + (i % 3) * 0.01), i % 5)); }
  g.add(at(dipCup('#c1121f', 0.018), 0.06, 0.012, 0.045));
  return g;
}
function chickenBites() {
  const g = group(plate({ r: 0.1, color: '#f4efe6' }));
  const m = mat('#ffffff', { map: speckTex('tender', '#d08b36', ['#ad6a22', '#ebb562', '#93551a'], 90, 3, 3), rough: 0.9, flat: true });
  scatter(g, 9, (i) => { const c = sph(0.016, m, 8, 6); c.scale.set(1.2, 0.75, 0.95); c.rotation.y = i; return c; }, { rad: 0.05, y: 0.022, tag: (i) => i % 5, seed: 91 });
  g.add(at(dipCup('#e9b215', 0.018), 0.065, 0.012, 0.04));
  return g;
}
function homeWaffles() {
  const g = group(plate({ r: 0.11, color: '#cfe3ec' }));
  g.add(bite(at(rot(waffle(), 0, 0.3, 0), -0.01, 0.02, 0.005), 3), bite(at(rot(waffle(), 0.1, -0.5, 0.04), 0.02, 0.034, -0.01), 2));
  g.add(bite(at(rot(rbox(0.024, 0.009, 0.02, 0.003, F('#ffe08a', 0.35)), 0, 0.4, 0), 0.02, 0.048, -0.01), 0));
  g.add(bite(at(cyl(0.03, 0.035, 0.0025, mat('#9a4d0e', { rough: 0.08, clearcoat: 1, opacity: 0.85, transparent: true }), 20), 0.02, 0.0445, -0.01), 1));
  return g;
}
function espressoCup() { return cupSaucer({ cup: '#1d1f22', crema: '#a8662e', foam: '#c98a4a', art: 'none', r: 0.03, h: 0.045, key: 'espresso' }); }
function riceBowl() {
  const g = group(bowlShell(0.065, 0.05, MAT.ceramic('#2e4c6d')));
  const r = sph(0.058, mat('#ffffff', { map: speckTex('rice', '#fbf9f2', ['#efe9d8'], 80, 1.6, 4), rough: 0.9 }), 20, 12); r.scale.y = 0.38;
  g.add(bite(at(r, 0, 0.04, 0), 2));
  scatter(g, 10, (i) => box(0.0025, 0.0018, 0.0015, F(i % 2 ? '#1d1d1d' : '#f6efcf', 0.5)), { rad: 0.025, y: 0.062, tag: 0, seed: 101 });
  const cs = group(at(rot(cyl(0.0022, 0.0035, 0.2, F('#c9935a', 0.6), 8), 0, 0, PI / 2), 0, 0, -0.006), at(rot(cyl(0.0022, 0.0035, 0.2, F('#c9935a', 0.6), 8), 0, 0, PI / 2), 0, 0, 0.006));
  cs.rotation.y = -0.4; g.add(at(cs, 0.02, 0.053, 0));
  return g;
}
function congeeBowl() {
  const g = group(bowlShell(0.075, 0.055, MAT.ceramic('#d9e8f0')));
  g.add(bite(fill(0.068, 0.032, F('#f3ecd9', 0.6), 0.038), 9));
  scatter(g, 6, () => rbox(0.012, 0.006, 0.01, 0.002, F('#e0b88a', 0.6)), { rad: 0.03, y: 0.055, tag: (i) => i % 3, seed: 111 });
  for (let i = 0; i < 7; i++) g.add(bite(at(rot(torus(0.0035, 0.0013, F('#5cb340', 0.5), 5, 10), PI / 2, 0, 0), Math.cos(i * 2.3) * 0.02, 0.056, Math.sin(i * 2.3) * 0.02), 0));
  for (let i = 0; i < 5; i++) g.add(bite(at(box(0.012, 0.0015, 0.002, F('#f2c46a', 0.5)), -0.01 + i * 0.006, 0.0565, 0.02), 0));
  const sp = spoon(0.13, '#fbfaf7'); sp.rotation.set(0, 0.6, 0.3); g.add(at(sp, 0.05, 0.06, -0.02));
  return g;
}
function iceCreamDish(scoops) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.03, 0], [0.032, 0.004], [0.008, 0.01], [0.007, 0.03], [0.02, 0.036], [0.055, 0.055], [0.06, 0.07]], mat('#eef7f8', { rough: 0.03, opacity: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 32));
  scoops.forEach(([c, speck], i) => g.add(bite(at(scoop(c, 0.027, speck), i === 2 ? 0 : (i ? 0.02 : -0.02), i === 2 ? 0.085 : 0.05, i === 2 ? 0 : (i ? -0.006 : 0.008)), 2 - i)));
  const sp = spoon(0.12); sp.rotation.set(0, 0.5, 0.9); g.add(at(sp, 0.035, 0.09, 0.02));
  return g;
}
function cookieDoughBowl() {
  const g = group(lathe([[0.001, 0], [0.05, 0], [0.085, 0.05], [0.088, 0.06], [0.083, 0.06], [0.08, 0.05], [0.046, 0.006], [0.001, 0.006]], MAT.metal('#d9dcdf', 0.15), 36));
  const d = sph(0.065, mat('#ffffff', { map: speckTex('cdough', '#d9b07a', ['#3b2314', '#c49a62'], 70, 3, 5), rough: 0.7 }), 20, 12); d.scale.y = 0.45;
  g.add(bite(at(d, 0, 0.03, 0), 3));
  scatter(g, 4, () => { const b = sph(0.016, mat('#ffffff', { map: speckTex('cdough', '#d9b07a', ['#3b2314', '#c49a62'], 70, 3, 5), rough: 0.7 }), 12, 8); b.scale.y = 0.7; return b; }, { rad: 0.035, y: 0.055, tag: (i) => i % 3, seed: 121 });
  const sp = spoon(0.15, '#d4a373'); sp.rotation.set(0, -0.4, -0.7); g.add(at(sp, 0.03, 0.08, 0.0));
  void cookieModel;
  return g;
}

// ------------------------------------------------------------------ definitions
const out = (o) => ({ price: 0, hidden: true, stores: [], tags: ['homemade'], rarity: 'common', ...o });
const eat = (o) => out({ category: 'food', ...o, use: { type: 'eat', sound: 'bite', ...o.use } });
const drink = (o) => out({ category: 'drink', ...o, use: { type: 'drink', ...o.use } });
defineItems([
  eat({ id: 'popcorn_bowl_home', name: 'Fresh Popcorn', emoji: '🍿', desc: 'Hot, fluffy, freshly popped. Movie optional.', build: popcornBowl, use: { bites: 5, needs: { hunger: 14, fun: 10 }, sound: 'crunch', hot: true, crumbs: '#fff1c4' } }),
  eat({ id: 'mug_cake', name: 'Chocolate Mug Cake', emoji: '🧁', desc: 'Ninety seconds from craving to cake.', build: mugCake, use: { bites: 3, needs: { hunger: 16, fun: 8, comfort: 8 }, buff: 'sugarRush', buffMin: 120, hot: true, sweet: true, crumbs: '#4a2617' } }),
  drink({ id: 'tea_mug', name: 'Green Tea', emoji: '🍵', desc: 'Grassy, gentle, steaming. A tiny pause in a mug.', build: teaMug, use: { sips: 4, hot: true, needs: { thirst: 22, comfort: 6, energy: 6 }, buff: 'calm', buffMin: 180, emoji: '🍵' } }),
  drink({ id: 'cocoa_mug', name: 'Homemade Hot Cocoa', emoji: '☕', desc: 'Rich cocoa with marshmallows bobbing on top.', build: cocoaMug, use: { sips: 4, hot: true, needs: { thirst: 16, comfort: 14, fun: 5 }, buff: 'cozy', buffMin: 240, emoji: '☕' } }),
  eat({ id: 'ramen_bowl_instant', name: 'Upgraded Instant Ramen', emoji: '🍜', desc: 'Instant noodles, dressed up with an egg and scallions. Chef mode.', build: instantRamenBowl, use: { bites: 4, needs: { hunger: 32, comfort: 8, thirst: 4 }, buff: 'cozy', buffMin: 120, sound: 'slurp', hot: true, cuisine: 'japanese', crumbs: '#f2d27a' } }),
  drink({ id: 'smoothie_berry_home', name: 'Berry Yogurt Smoothie', emoji: '🫐', tags: ['homemade', 'healthy', 'glass'], desc: 'Blended berries and Greek yogurt. Thick, tangy, purple.', build: () => homeSmoothie('#7b2d6e', 'berry'), use: { sips: 5, needs: { thirst: 30, hunger: 12, energy: 8 }, buff: 'vitalized', buffMin: 240, sound: 'slurp', emoji: '🥤' } }),
  drink({ id: 'smoothie_banana_home', name: 'Banana Milk Smoothie', emoji: '🍌', tags: ['homemade', 'healthy', 'glass'], desc: 'Banana, milk and a little cinnamon. Breakfast in a glass.', build: () => homeSmoothie('#f2dfa0', 'banana'), use: { sips: 5, needs: { thirst: 28, hunger: 14, energy: 6 }, buff: 'vitalized', buffMin: 200, sound: 'slurp', emoji: '🥤' } }),
  eat({ id: 'fries_home', name: 'Air-Fried Fries', emoji: '🍟', desc: 'Golden and crisp with a fraction of the oil.', build: homeFries, use: { bites: 4, needs: { hunger: 24, fun: 5 }, sound: 'crunch', hot: true, crumbs: '#e9a52c' } }),
  eat({ id: 'chicken_bites_home', name: 'Crispy Chicken Bites', emoji: '🍗', desc: 'Crunchy popcorn chicken with honey mustard.', build: chickenBites, use: { bites: 5, needs: { hunger: 38, fun: 5 }, buff: 'wellFed', buffMin: 200, sound: 'crunch', hot: true, crumbs: '#d08b36' } }),
  eat({ id: 'waffles_home', name: 'Homemade Belgian Waffles', emoji: '🧇', desc: 'Deep pockets, perfect for butter and syrup.', build: homeWaffles, use: { bites: 4, needs: { hunger: 40, comfort: 10, fun: 6 }, buff: 'wellFed', buffMin: 260, hot: true, sweet: true, crumbs: '#c47a2c' } }),
  drink({ id: 'espresso_cup', name: 'Double Espresso', emoji: '☕', desc: 'Thick crema, syrupy body. Pure rocket fuel.', build: espressoCup, use: { sips: 2, hot: true, needs: { thirst: 6, energy: 32 }, buff: 'caffeinated', buffMin: 200, emoji: '☕' } }),
  drink({ id: 'cappuccino_home', name: 'Homemade Cappuccino', emoji: '☕', desc: 'Your own latte-art heart. It only looks a little like a potato.', build: () => cupSaucer({ art: 'heart', key: 'homecap' }), use: { sips: 4, hot: true, needs: { thirst: 14, energy: 26, comfort: 8 }, buff: 'caffeinated', buffMin: 220, emoji: '☕' } }),
  drink({ id: 'mocha_home', name: 'Homemade Mocha', emoji: '🍫', desc: 'Espresso, cocoa and steamed milk with a rosetta on top.', build: () => cupSaucer({ cup: '#2d6a4f', crema: '#6b3a1f', foam: '#f3e2c8', art: 'rosetta', key: 'homemocha' }), use: { sips: 4, hot: true, needs: { thirst: 14, energy: 22, fun: 6, comfort: 8 }, buff: 'caffeinated', buffMin: 200, emoji: '☕' } }),
  eat({ id: 'rice_bowl_home', name: 'Steamed Jasmine Rice', emoji: '🍚', desc: 'Fluffy, fragrant, with a sprinkle of sesame.', build: riceBowl, use: { bites: 3, needs: { hunger: 26, comfort: 4 }, hot: true, healthy: true, cuisine: 'chinese', crumbs: '#fbf9f2' } }),
  eat({ id: 'congee_home', name: 'Chicken Congee', emoji: '🥣', desc: 'Silky rice porridge with chicken, ginger and scallions. A hug in a bowl.', build: congeeBowl, use: { bites: 4, needs: { hunger: 45, comfort: 14, thirst: 6 }, buff: 'cozy', buffMin: 300, sound: 'slurp', hot: true, healthy: true, cuisine: 'chinese', crumbs: '#f3ecd9' } }),
  eat({ id: 'icecream_vanilla_home', name: 'Homemade Vanilla Ice Cream', emoji: '🍨', desc: 'Churned at home. Speckled with real vanilla.', build: () => iceCreamDish([['#f7ecd2', '#3b2314'], ['#f7ecd2', '#3b2314'], ['#f7ecd2', '#3b2314']]), use: { bites: 4, needs: { hunger: 14, fun: 10, comfort: 6 }, buff: 'treatYoself', buffMin: 150, sound: 'slurp', sweet: true, crumbs: '#f7ecd2' } }),
  eat({ id: 'icecream_berry_home', name: 'Homemade Berry Ice Cream', emoji: '🍓', desc: 'Swirled with crushed berries. Very pink, very good.', build: () => iceCreamDish([['#f27a8c', '#8a1538'], ['#f7a1b5', '#c71f37'], ['#f27a8c', '#8a1538']]), use: { bites: 4, needs: { hunger: 14, fun: 10, comfort: 6 }, buff: 'treatYoself', buffMin: 150, sound: 'slurp', sweet: true, crumbs: '#f27a8c' } }),
  eat({ id: 'icecream_choc_home', name: 'Homemade Chocolate Ice Cream', emoji: '🍫', desc: 'Deep, dark and dangerously scoopable.', build: () => iceCreamDish([['#6b3e26', null], ['#5a311c', null], ['#6b3e26', null]]), use: { bites: 4, needs: { hunger: 14, fun: 10, comfort: 6 }, buff: 'treatYoself', buffMin: 150, sound: 'slurp', sweet: true, crumbs: '#6b3e26' } }),
  drink({ id: 'juice_orange_home', name: 'Fresh-Squeezed Orange Juice', emoji: '🍊', tags: ['homemade', 'healthy', 'glass'], desc: 'Pulpy, bright, squeezed seconds ago.', build: () => glassTumbler({ liquid: '#f59e00', h: 0.12, r: 0.034, ice: false, garnish: '#f57c00' }), use: { sips: 4, needs: { thirst: 34, energy: 8 }, buff: 'vitalized', buffMin: 180, emoji: '🍊' } }),
  eat({ id: 'cookie_dough_bowl', name: 'Cookie Dough (Edible)', emoji: '🥄', desc: 'Egg-free, eat-it-with-a-spoon cookie dough. No oven required.', build: cookieDoughBowl, use: { bites: 4, needs: { hunger: 18, fun: 12, comfort: 6 }, buff: 'sugarRush', buffMin: 150, sweet: true, crumbs: '#d9b07a' } }),
]);

// ------------------------------------------------------------------ appliances
const appliance = (o) => ({ category: 'kitchen', rarity: 'common', tags: ['kitchen'], ...o, use: { type: 'station', ...o.use } });
defineItems([
  appliance({ id: 'microwave_retro', name: 'Retro Microwave', price: 129, stores: ['primo', 'volt'], emoji: '📟', desc: 'Mint-green and mid-century. Pops popcorn, bakes mug cakes, reheats leftovers.', build: microwave, use: { verb: 'Microwave', anim: 'spin', spinSpeed: 1.5, loop: 'hum', reheat: true, doneSound: 'ding', out: [0.36, 0, 0.05], recipes: [
    { label: 'Pop some popcorn', needs: ['popcorn_kernels'], makes: 'popcorn_bowl_home', seconds: 7, loop: 'crackle' },
    { label: 'Bake a mug cake', needs: ['flour', 'cocoa_powder', 'milk'], makes: 'mug_cake', seconds: 6 },
  ] } }),
  appliance({ id: 'kettle_gooseneck', name: 'Gooseneck Electric Kettle', price: 59, stores: ['primo', 'volt'], emoji: '🫖', desc: 'Precision pour, glowing base. Tea, cocoa and instant ramen in minutes.', build: kettle, use: { verb: 'Boil', anim: 'steam', loop: 'kettle', doneSound: 'ding', out: [0.26, 0, 0.06], recipes: [
    { label: 'Brew green tea', needs: ['tea_bags'], makes: 'tea_mug', seconds: 6 },
    { label: 'Make hot cocoa', needs: ['cocoa_powder', 'milk'], makes: 'cocoa_mug', seconds: 7 },
    { label: 'Make instant ramen', needs: ['ramen_packs'], makes: 'ramen_bowl_instant', seconds: 7 },
  ] } }),
  appliance({ id: 'blender_vortex', name: 'Vortex Blender', price: 89, stores: ['primo', 'volt'], emoji: '🥤', desc: '1200 watts of smoothie-making fury. Fruit in, vitality out.', build: blender, use: { verb: 'Blend', anim: 'spin', spinSpeed: 45, loop: 'vacuum', doneSound: 'ding', out: [0.2, 0, 0.06], recipes: [
    { label: 'Blend a berry smoothie', needs: ['berries', 'yogurt'], makes: 'smoothie_berry_home', seconds: 5 },
    { label: 'Blend a banana smoothie', needs: ['banana', 'milk'], makes: 'smoothie_banana_home', seconds: 5 },
  ] } }),
  appliance({ id: 'air_fryer', name: 'Crisp Air Fryer', price: 99, stores: ['primo', 'volt'], emoji: '🍟', desc: 'A tiny convection oven that makes everything crunchy.', build: airFryer, use: { verb: 'Air-fry', anim: 'steam', loop: 'fan', doneSound: 'ding', reheat: true, out: [0.27, 0, 0.06], recipes: [
    { label: 'Air-fry potato fries', needs: ['potatoes'], makes: 'fries_home', seconds: 8 },
    { label: 'Crispy chicken bites', needs: ['chicken_breast', 'flour'], makes: 'chicken_bites_home', seconds: 9 },
  ] } }),
  appliance({ id: 'waffle_maker', name: 'Belgian Waffle Maker', price: 49, stores: ['primo'], emoji: '🧇', desc: 'Deep-pocket waffles every weekend. The light goes off when they\'re golden.', build: waffleMaker, use: { verb: 'Cook', anim: 'steam', loop: 'sizzle', doneSound: 'ding', out: [0.26, 0, 0.05], recipes: [
    { label: 'Make Belgian waffles', needs: ['flour', 'eggs', 'milk'], makes: 'waffles_home', seconds: 8 },
  ] } }),
  appliance({ id: 'espresso_maestro', name: 'Maestro Espresso Machine', price: 1850, rarity: 'epic', stores: ['luxe'], emoji: '☕', desc: 'Dual-boiler, E61 group head, walnut handles. Your kitchen is now a café.', build: espressoMachine, use: { verb: 'Pull', anim: 'steam', loop: 'bubbling', doneSound: 'ding', out: [0, 0.095, 0.13], recipes: [
    { label: 'Pull a double espresso', needs: ['coffee_beans'], makes: 'espresso_cup', seconds: 5 },
    { label: 'Make a cappuccino', needs: ['coffee_beans', 'milk'], makes: 'cappuccino_home', seconds: 7 },
    { label: 'Make a mocha', needs: ['coffee_beans', 'milk', 'cocoa_powder'], makes: 'mocha_home', seconds: 8 },
  ] } }),
  appliance({ id: 'rice_cooker', name: 'Fuzzy Logic Rice Cooker', price: 79, stores: ['primo', 'volt'], emoji: '🍚', desc: 'Perfect rice every time. It plays a little song when it\'s done.', build: riceCooker, use: { verb: 'Cook', anim: 'steam', loop: 'bubbling', doneSound: 'chime', out: [0.25, 0, 0.06], recipes: [
    { label: 'Steam jasmine rice', needs: ['rice_jasmine'], makes: 'rice_bowl_home', seconds: 8 },
    { label: 'Simmer chicken congee', needs: ['rice_jasmine', 'chicken_breast'], makes: 'congee_home', seconds: 10 },
  ] } }),
  appliance({ id: 'icecream_maker', name: 'Scoop Dream Ice Cream Maker', price: 79, stores: ['primo', 'volt'], emoji: '🍨', desc: 'Churns cream into soft-serve bliss while you watch.', build: iceCreamMaker, use: { verb: 'Churn', anim: 'spin', spinSpeed: 4, loop: 'hum', doneSound: 'ding', out: [0.24, 0, 0.06], recipes: [
    { label: 'Churn vanilla ice cream', needs: ['heavy_cream', 'sugar'], makes: 'icecream_vanilla_home', seconds: 9 },
    { label: 'Churn berry ice cream', needs: ['heavy_cream', 'berries'], makes: 'icecream_berry_home', seconds: 9 },
    { label: 'Churn chocolate ice cream', needs: ['heavy_cream', 'cocoa_powder'], makes: 'icecream_choc_home', seconds: 9 },
  ] } }),
  appliance({ id: 'juicer_citrus', name: 'Citrus Press Juicer', price: 59, stores: ['primo'], emoji: '🍊', desc: 'Lever-action citrus press. Squeezes oranges into sunshine.', build: juicer, use: { verb: 'Juice', anim: 'spin', spinSpeed: 12, loop: 'hum', doneSound: 'ding', out: [0.2, 0, 0.06], recipes: [
    { label: 'Squeeze fresh OJ', needs: ['oranges'], makes: 'juice_orange_home', seconds: 5 },
  ] } }),
  appliance({ id: 'stand_mixer', name: 'Artisan Stand Mixer', price: 379, stores: ['primo', 'luxe'], rarity: 'uncommon', emoji: '🥣', desc: 'The countertop icon. Whips up cookie dough and fresh pizza dough.', build: () => standMixer(), use: { verb: 'Mix', anim: 'spin', spinSpeed: 10, loop: 'fan', doneSound: 'ding', out: [0.3, 0, 0.08], recipes: [
    { label: 'Mix edible cookie dough', needs: ['flour', 'sugar', 'butter', 'chocolate_chips'], makes: 'cookie_dough_bowl', seconds: 7 },
    { label: 'Knead pizza dough', needs: ['flour'], makes: 'pizza_dough', seconds: 8 },
  ] } }),
]);

void box; void plane; void sph; void cone;
