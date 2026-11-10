// Electronics and appliances: laptop, desktop PC setup, 75" television, washing machine.
import * as THREE from 'three';
import * as F from '../core/fracture.js';
import { PropBuilder } from './builder.js';
import { makeScreenMaterials, surface, tinted, PHYS } from '../core/materials.js';
import { fitUV, boxUV, applyUV } from '../core/geometry.js';
import { screenBehavior, sparkBehavior } from './behaviors.js';
import { domePoly, glowMat, mergeSlots, roundedBox } from './parts.js';
import { addDesk } from './furniture.js';
import { addMug } from './fragile.js';
import { getTexture } from '../render/textures.js';

const silver = () => tinted('plastic_grey', 0xa9aeb6, { roughness: 0.42, metalness: 0.55 });

/** Material triple for a textured decal face (top/front), plain plastic elsewhere. */
function decalMats(texName, base = 'plastic_black', extra = {}) {
  const s = surface(base);
  const m = new THREE.MeshStandardMaterial({ map: getTexture(texName), roughness: 0.55, ...extra });
  return [m, s.mats[1], s.mats[2]];
}

// ---------------------------------------------------------------------------
// 2. Laptop
// ---------------------------------------------------------------------------

export function buildLaptop() {
  const b = new PropBuilder('laptop', 'Laptop');
  const W = 0.36, D = 0.245;
  const body = silver();
  const scr = makeScreenMaterials('screen_code', 1.0);
  // base shell
  b.box('bottom', [W, 0.004, D], [0, 0.002, 0], body, { thick: 0.002, mass: 0.22 });
  b.box('wall', [W, 0.01, 0.004], [0, 0.009, D / 2 - 0.002], body, { thick: 0.002, mass: 0.015 });
  b.box('wall', [W, 0.01, 0.004], [0, 0.009, -D / 2 + 0.002], body, { thick: 0.002, mass: 0.015 });
  b.box('wall', [0.004, 0.01, D - 0.008], [-W / 2 + 0.002, 0.009, 0], body, { thick: 0.002, mass: 0.012 });
  b.box('wall', [0.004, 0.01, D - 0.008], [W / 2 - 0.002, 0.009, 0], body, { thick: 0.002, mass: 0.012 });
  // internals, exposed when the shell breaks
  const mobo = b.box('mobo', [0.2, 0.003, 0.11], [-0.055, 0.0057, -0.055], 'pcb_green', { tags: ['elec'], uv: fitUV(0, 2, -0.1, -0.055, 0.2, 0.11), mass: 0.11, thick: 0.0016 });
  const battery = b.box('battery', [0.3, 0.007, 0.075], [0, 0.0077, 0.07], 'plastic_black', { fracturable: false, mass: 0.3 });
  b.cyl('fan', 0.026, 0.007, [0.125, 0.0077, -0.07], 'darksteel', { segs: 12, hull: true, mass: 0.03 });
  b.box('ssd', [0.022, 0.003, 0.08], [0.075, 0.0057, -0.04], 'pcb_blue', { tags: ['elec'], uv: fitUV(0, 2, -0.011, -0.04, 0.022, 0.08), mass: 0.008, thick: 0.0016 });
  b.box('heatpipe', [0.15, 0.004, 0.01], [0.03, 0.0092, -0.092], 'brass', { mass: 0.03 });
  b.box('speaker', [0.04, 0.007, 0.018], [-0.15, 0.0077, 0.02], 'plastic_black', { fracturable: false, mass: 0.012 });
  b.box('speaker', [0.04, 0.007, 0.018], [0.15, 0.0077, 0.02], 'plastic_black', { fracturable: false, mass: 0.012 });
  // top case, keyboard, trackpad
  b.box('deck', [W, 0.004, D], [0, 0.016, 0], body, { thick: 0.002, mass: 0.2 });
  b.box('keyboard', [0.29, 0.003, 0.108], [0, 0.0193, -0.04], 'plastic_black', {
    mats: decalMats('laptop_keyboard'), uv: fitUV(0, 2, -0.145, -0.054, 0.29, 0.108, false, true), thick: 0.002, mass: 0.09, bond: 0.35,
  });
  b.box('trackpad', [0.11, 0.0016, 0.07], [0, 0.0186, 0.075], 'plastic_gloss', { fracturable: false, mass: 0.02, bond: 0.4 });
  const barrel = b.cyl('hinge_barrel', 0.0065, 0.3, [0, 0.0185, -D / 2 + 0.008], 'plastic_black', { axis: 0, segs: 8, hull: true, fracturable: false, mass: 0.03 });
  // lid, opened ~110°
  let lid;
  b.at([0, 0.0185, -D / 2 + 0.008], [-0.36, 0, 0], () => {
    lid = b.box('lid', [W, 0.236, 0.0035], [0, 0.118, -0.003], body, { thick: 0.002, mass: 0.26 });
    b.box('backlight', [0.342, 0.216, 0.0015], [0, 0.123, -0.0005], 'plastic_white', { mats: [scr.backlight, scr.backlight, scr.backlight], thick: 0.002, mass: 0.05, strength: 2, bond: 0.5 });
    b.box('lcd', [0.344, 0.218, 0.003], [0, 0.123, 0.0018], 'glass', {
      mats: [scr.live, scr.edge, scr.edge], uv: fitUV(0, 1, -0.172, -0.109, 0.344, 0.218), tags: ['screen'], strength: 2.2, mass: 0.22, castShadow: true, release: 0.7,
    });
  });
  b.bond(lid, barrel, { strength: 9, ductile: true, maxBend: 1.25 });
  b.behave(screenBehavior({ tag: 'screen', mats: scr, driver: 'lid', power: ['mobo', 'battery'], maxDamage: 3 }));
  b.behave(sparkBehavior('elec'));
  void mobo; void battery;
  return b.build();
}

// ---------------------------------------------------------------------------
// 3. Office table with a PC setup
// ---------------------------------------------------------------------------

function addMonitor(b, pos, yaw) {
  const scr = makeScreenMaterials('screen_desktop', 1.0);
  const SW = 0.615, SH = 0.365;
  b.body('monitor', {});
  b.at(pos, yaw, () => {
    b.box('mon_base', [0.26, 0.012, 0.2], [0, 0.006, -0.02], 'darksteel', { mass: 1.3 });
    b.box('mon_neck', [0.05, 0.27, 0.028], [0, 0.145, -0.07], 'darksteel', { mass: 0.6 });
    const cy = 0.32;
    b.box('mon_shell', [SW + 0.012, SH + 0.012, 0.03], [0, cy, -0.04], 'plastic_black', { thick: 0.0035, mass: 1.5, hollow: true });
    b.box('mon_board', [0.2, 0.12, 0.004], [0, cy, -0.027], 'pcb_green', { tags: ['elec'], uv: fitUV(0, 1, -0.1, -0.06, 0.2, 0.12), mass: 0.2, thick: 0.0016 });
    b.box('mon_backlight', [SW - 0.006, SH - 0.006, 0.004], [0, cy, -0.023], 'plastic_white', { mats: [scr.backlight, scr.backlight, scr.backlight], thick: 0.003, mass: 0.35, strength: 2 });
    b.box('mon_lcd', [SW, SH, 0.004], [0, cy, -0.019], 'glass', {
      mats: [scr.live, scr.edge, scr.edge], uv: fitUV(0, 1, -SW / 2, -SH / 2, SW, SH), tags: ['screen'], strength: 2.0, mass: 0.8, castShadow: true, release: 0.7,
    });
    b.box('mon_chin', [SW + 0.012, 0.018, 0.012], [0, cy - SH / 2 - 0.004, -0.019], 'plastic_gloss', { thick: 0.003, mass: 0.05, fracturable: false });
  });
  b.behave(screenBehavior({ tag: 'screen', mats: scr, driver: 'mon_shell', power: ['mon_board'], maxDamage: 4 }));
}

function addKeyboard(b, pos, yaw) {
  b.body('keyboard', {});
  b.at(pos, yaw, () => {
    b.box('kb_base', [0.445, 0.014, 0.14], [0, 0.007, 0], 'plastic_black', { thick: 0.003, mass: 0.45 });
    b.box('kb_keys', [0.435, 0.009, 0.13], [0, 0.0185, 0], 'plastic_black', {
      mats: decalMats('keyboard'), uv: fitUV(0, 2, -0.2175, -0.065, 0.435, 0.13, false, true), thick: 0.003, mass: 0.3, bond: 0.5,
    });
  });
}

function addMouse(b, pos, yaw) {
  b.body('mouse', {});
  b.at(pos, yaw, () => {
    b.poly('mouse', domePoly(0.032, 0.036, 0.056, 10, 4), [0, 0, 0], 'plastic_gloss', { thick: 0.003, mass: 0.09, minRefracture: 0.05 });
    b.cyl('mouse_wheel', 0.008, 0.008, [0, 0.03, -0.028], tinted('plastic_grey', 0x55585e), { axis: 0, segs: 8, hull: true, fracturable: false, mass: 0.004 });
  });
}

function addTower(b, pos, yaw) {
  const steel = 'blacksteel';
  const W = 0.21, H = 0.43, D = 0.42;
  b.body('tower', {});
  b.at(pos, yaw, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('pc_foot', 0.014, 0.012, [sx * 0.075, 0.006, sz * 0.17], 'rubber', { segs: 8, hull: true, mass: 0.01 });
    b.box('pc_bottom', [W, 0.01, D], [0, 0.017, 0], steel, { mass: 0.8, hollow: true });
    b.box('pc_top', [W, 0.01, D], [0, H - 0.005, 0], steel, { mass: 0.8, hollow: true, dentable: true, dentCell: 0.04 });
    const ih = H - 0.032, iy = 0.022 + ih / 2;
    b.box('pc_back', [W, ih, 0.008], [0, iy, -D / 2 + 0.004], steel, { mass: 0.7, hollow: true });
    b.box('pc_front', [W, ih, 0.014], [0, iy, D / 2 - 0.007], 'plastic_black', { thick: 0.0035, mass: 0.5, hollow: true });
    b.box('pc_tray', [0.006, ih, D - 0.022], [W / 2 - 0.003, iy, -0.003], steel, { mass: 1.1, hollow: true, dentable: true, dentCell: 0.04 });
    b.box('pc_glass', [0.005, ih, D - 0.022], [-W / 2 + 0.0025, iy, -0.003], 'glass_tinted', { mass: 1.6, strength: 0.9 });
    // internals
    const mx = W / 2 - 0.008;
    b.box('pc_mobo', [0.004, 0.3, 0.25], [mx, 0.25, -0.05], 'pcb_green', { tags: ['elec'], uv: fitUV(2, 1, -0.125, -0.15, 0.25, 0.3), mass: 0.7, thick: 0.002 });
    b.box('pc_gpu', [0.125, 0.042, 0.25], [mx - 0.064, 0.2, -0.05], 'plastic_gloss', { fracturable: false, mass: 1.1 });
    b.box('pc_gpu_led', [0.004, 0.006, 0.2], [mx - 0.128, 0.213, -0.05], 'plastic_white', { mats: [glowMat(0x30d0ff, 2.6)], fracturable: false, mass: 0.005, castShadow: false });
    b.cyl('pc_cooler', 0.046, 0.06, [mx - 0.034, 0.315, -0.07], 'aluminium', { axis: 0, segs: 14, mass: 0.5 });
    b.cyl('pc_cooler_ring', 0.048, 0.006, [mx - 0.067, 0.315, -0.07], 'plastic_white', { axis: 0, segs: 14, hull: true, mats: [glowMat(0xff3aa8, 2.4)], fracturable: false, mass: 0.01, castShadow: false });
    for (let i = 0; i < 2; i++) b.box('pc_ram', [0.034, 0.125, 0.006], [mx - 0.019, 0.315, 0.012 + i * 0.016], 'pcb_blue', { tags: ['elec'], mass: 0.04, thick: 0.002, texScale: 0.2 });
    b.box('pc_psu', [0.15, 0.086, 0.15], [0.015, 0.065, -0.12], 'darksteel', { mass: 1.6, hollow: true });
    b.box('pc_drive', [0.1, 0.026, 0.146], [0.02, 0.035, 0.09], 'steel', { mass: 0.45 });
    for (let i = 0; i < 2; i++) {
      b.cyl('pc_fan', 0.056, 0.025, [0, 0.14 + i * 0.16, D / 2 - 0.0265], 'plastic_black', { axis: 2, segs: 14, hull: true, fracturable: false, mass: 0.1 });
      b.cyl('pc_fan_ring', 0.058, 0.005, [0, 0.14 + i * 0.16, D / 2 - 0.041], 'plastic_white', { axis: 2, segs: 14, hull: true, mats: [glowMat(i ? 0x30d0ff : 0x9a5cff, 2.4)], fracturable: false, mass: 0.01, castShadow: false });
    }
  });
  b.behave(sparkBehavior('elec'));
}

export function buildDesk() {
  const b = new PropBuilder('desk', 'Office Table + PC');
  const main = b.cur;
  const H = addDesk(b) + 0.0008;
  addMonitor(b, [-0.12, H, -0.13], 0.06);
  addKeyboard(b, [-0.14, H, 0.17], 0.03);
  addMouse(b, [0.2, H, 0.18], -0.15);
  addTower(b, [0.56, H, -0.04], -0.08);
  b.body('mug', {});
  addMug(b, 'mug', [-0.58, H, 0.08], 'ceramic_white', 2.4);
  b.use(main);
  return b.build();
}

// ---------------------------------------------------------------------------
// 4. 75-inch television
// ---------------------------------------------------------------------------

export function buildTV() {
  const b = new PropBuilder('tv', '75" Television');
  const scr = makeScreenMaterials('screen_tv', 1.15);
  const W = 1.68, H = 0.96;
  const feetY = 0.105;
  const cy = feetY + H / 2;
  // feet
  for (const sx of [-1, 1]) {
    b.box('tv_foot', [0.05, 0.022, 0.4], [sx * 0.62, 0.011, 0.01], 'blacksteel', { mass: 0.9 });
    b.box('tv_riser', [0.04, 0.09, 0.03], [sx * 0.62, 0.066, -0.012], 'blacksteel', { mass: 0.3 });
  }
  // rear cover in three sections + electronics bulge
  const third = (W - 0.004) / 3;
  for (let i = -1; i <= 1; i++) b.box('tv_back', [third, H - 0.004, 0.022], [i * third, cy, -0.024], 'plastic_black', { thick: 0.003, mass: 1.5, hollow: true });
  b.box('tv_bulge', [0.95, 0.5, 0.022], [0, cy - 0.12, -0.046], 'plastic_black', { thick: 0.003, mass: 1.2, hollow: true });
  // steel chassis that everything hangs off
  b.box('tv_chassis', [W - 0.03, H - 0.03, 0.006], [0, cy, -0.01], 'steel', { mass: 7.5, dentable: true, dentCell: 0.06, hollow: true });
  // boards and speakers on the back of the chassis
  b.box('tv_power', [0.3, 0.26, 0.006], [-0.3, cy - 0.1, -0.0155], 'pcb_green', { tags: ['elec'], uv: fitUV(0, 1, -0.15, -0.13, 0.3, 0.26), mass: 0.5, thick: 0.002 });
  b.box('tv_main', [0.26, 0.2, 0.006], [0.24, cy - 0.08, -0.0155], 'pcb_blue', { tags: ['elec'], uv: fitUV(0, 1, -0.13, -0.1, 0.26, 0.2), mass: 0.35, thick: 0.002 });
  b.box('tv_tcon', [0.32, 0.05, 0.005], [0, cy - 0.37, -0.0155], 'pcb_green', { tags: ['elec'], texScale: 0.35, mass: 0.1, thick: 0.002 });
  for (const sx of [-1, 1]) b.box('tv_speaker', [0.22, 0.06, 0.026], [sx * 0.6, cy - 0.4, -0.027], 'plastic_gloss', { fracturable: false, mass: 0.45 });
  // optical stack
  b.box('tv_backlight', [W - 0.05, H - 0.05, 0.005], [0, cy, -0.0045], 'plastic_white', { mats: [scr.backlight, scr.backlight, scr.backlight], thick: 0.003, mass: 3, strength: 3 });
  b.box('tv_lcd', [W - 0.036, H - 0.036, 0.005], [0, cy, 0.0006], 'glass', {
    mats: [scr.live, scr.edge, scr.edge], uv: fitUV(0, 1, -(W - 0.036) / 2, -(H - 0.036) / 2, W - 0.036, H - 0.036),
    tags: ['screen'], strength: 1.5, mass: 9, castShadow: true, release: 0.62,
  });
  // bezel
  const bz = 0.018;
  b.box('tv_bezel', [W, bz, 0.02], [0, cy + H / 2 - bz / 2, 0.0], 'plastic_gloss', { thick: 0.003, mass: 0.3 });
  b.box('tv_bezel', [W, bz, 0.02], [0, cy - H / 2 + bz / 2, 0.0], 'plastic_gloss', { thick: 0.003, mass: 0.3 });
  b.box('tv_bezel', [bz, H - 2 * bz, 0.02], [-W / 2 + bz / 2, cy, 0.0], 'plastic_gloss', { thick: 0.003, mass: 0.2 });
  b.box('tv_bezel', [bz, H - 2 * bz, 0.02], [W / 2 - bz / 2, cy, 0.0], 'plastic_gloss', { thick: 0.003, mass: 0.2 });
  b.box('tv_led', [0.03, 0.004, 0.004], [0, cy - H / 2 + 0.006, 0.011], 'plastic_white', { mats: [glowMat(0xff3030, 2)], fracturable: false, mass: 0.002, castShadow: false });
  b.behave(screenBehavior({ tag: 'screen', mats: scr, driver: 'tv_chassis', power: ['tv_power', 'tv_main'], maxDamage: 5 }));
  b.behave(sparkBehavior('elec'));
  return b.build();
}

// ---------------------------------------------------------------------------
// 9. Washing machine
// ---------------------------------------------------------------------------

function drumGeometry(R, depth) {
  const tubeOuter = new THREE.CylinderGeometry(R, R, depth, 32, 1, true);
  const back = new THREE.CircleGeometry(R, 32);
  back.rotateX(Math.PI / 2);
  back.translate(0, -depth / 2, 0);
  const frontRing = new THREE.RingGeometry(R * 0.72, R, 32);
  frontRing.rotateX(-Math.PI / 2);
  frontRing.translate(0, depth / 2, 0);
  const tub = mergeSlots([tubeOuter, back, frontRing]);
  const inner = new THREE.CylinderGeometry(R * 0.86, R * 0.86, depth * 0.92, 32, 1, true);
  const innerBack = new THREE.CircleGeometry(R * 0.86, 32);
  innerBack.rotateX(-Math.PI / 2);
  innerBack.translate(0, -depth * 0.46, 0);
  const lifters = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.BoxGeometry(0.03, depth * 0.8, 0.04);
    const a = (i / 3) * Math.PI * 2;
    l.translate(Math.cos(a) * R * 0.82, 0, Math.sin(a) * R * 0.82);
    lifters.push(l);
  }
  const drum = mergeSlots([inner, innerBack, ...lifters]);
  // pulley on the back
  const pulley = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.015, 24);
  pulley.translate(0, -depth / 2 - 0.012, 0);
  // collapse sub-groups: slot 0 tub, slot 1 drum, slot 2 pulley
  const one = (g, slot) => {
    const x = g.index ? g.toNonIndexed() : g;
    x.clearGroups();
    x.userData.slot = slot;
    return x;
  };
  const parts = [one(tub, 0), one(drum, 1), one(pulley, 2)];
  const merged = mergeSlots(parts);
  merged.rotateX(Math.PI / 2); // axis Y -> Z (front towards +z)
  applyUV(merged, boxUV(0.25, 1));
  return merged;
}

export function buildWasher() {
  const b = new PropBuilder('washer', 'Washing Machine');
  const W = 0.6, H = 0.85, D = 0.58;
  const en = 'enamel';
  const T = 0.012;
  const sheet = { dentable: true, hollow: true };
  // feet + base
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('foot', 0.022, 0.044, [sx * (W / 2 - 0.05), 0.022, sz * (D / 2 - 0.05)], 'rubber', { segs: 10, hull: true, mass: 0.05, bond: 4 });
  b.box('base', [W, T, D], [0, 0.05, 0], 'darksteel', { mass: 2.6, hollow: true });
  const sideH = H - 0.056 - 0.02;
  const sy = 0.056 + sideH / 2;
  b.box('side', [T, sideH, D], [-(W / 2 - T / 2), sy, 0], en, { ...sheet, mass: 4.2 });
  b.box('side', [T, sideH, D], [W / 2 - T / 2, sy, 0], en, { ...sheet, mass: 4.2 });
  b.box('top', [W, 0.02, D], [0, H - 0.01, 0], en, { ...sheet, mass: 3.4 });
  const iw = W - 2 * T;
  b.box('back', [iw, sideH, 0.01], [0, sy, -D / 2 + 0.005], 'steel', { ...sheet, mass: 3 });
  // front: fascia strip, panel pieces around an octagonal door opening
  const fz = D / 2 - T / 2;
  const doorY = 0.44, half = 0.185;
  const topY = H - 0.02;
  const fasciaH = 0.125;
  const panelTex = decalMats('washer_panel', 'plastic_white', { roughness: 0.4 });
  b.box('fascia', [iw, fasciaH, T], [0, topY - fasciaH / 2, fz], 'plastic_white', {
    mats: panelTex, uv: fitUV(0, 1, -iw / 2, -fasciaH / 2, iw, fasciaH), thick: 0.004, mass: 0.7, hollow: true,
  });
  b.cyl('knob', 0.03, 0.026, [0.005, topY - fasciaH / 2, fz + T / 2 + 0.013], 'chrome', { axis: 2, segs: 16, mass: 0.06 });
  const upperH = topY - fasciaH - (doorY + half);
  b.box('front', [iw, upperH, T], [0, doorY + half + upperH / 2, fz], en, { ...sheet, mass: 0.8 });
  const lowerH = doorY - half - 0.056;
  b.box('front', [iw, lowerH, T], [0, 0.056 + lowerH / 2, fz], en, { ...sheet, mass: 1.6 });
  const stripW = iw / 2 - half;
  const stripL = b.box('front', [stripW, 2 * half, T], [-(half + stripW / 2), doorY, fz], en, { ...sheet, mass: 0.6 });
  const stripR = b.box('front', [stripW, 2 * half, T], [half + stripW / 2, doorY, fz], en, { ...sheet, mass: 0.6 });
  // corner fillers turn the square hole into an octagon
  const cut = 0.105;
  for (const sx of [-1, 1]) {
    for (const syy of [-1, 1]) {
      const tri = [[0, 0], [sx * -cut, 0], [0, syy * -cut]];
      // triangle in the (x,y) plane -> prism along z (axis 2: (a,b) = (x,y))
      const poly = F.prismPoly(tri, 2, -T / 2, T / 2, 0, 0);
      b.poly('front_corner', poly, [sx * half, doorY + syy * half, fz], en, { mass: 0.08, fracturable: false });
    }
  }
  // door seal (visual ring; no collision so the opening stays open)
  const gasket = new THREE.TorusGeometry(0.168, 0.02, 10, 36);
  applyUV(gasket, boxUV(0.2, 1));
  const g = b.box('gasket', [0.3, 0.3, 0.02], [0, doorY, fz - 0.006], 'rubber', { geometry: gasket, mass: 0.4, fracturable: false });
  g.ghost = true;
  b.bond(g, stripL, { strength: 20 });
  b.bond(g, stripR, { strength: 20 });

  // --- internals ----------------------------------------------------------
  const R = 0.235, depth = 0.36;
  const drumZ = -0.03;
  const tubMat = surface('plastic_grey').mats[0];
  const drumMat = new THREE.MeshStandardMaterial({ map: getTexture('drum_steel'), roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide });
  const drum = b.cyl('drum', R, depth, [0, doorY + 0.005, drumZ], 'steel', {
    axis: 2, segs: 18, geometry: drumGeometry(R, depth), mats: [tubMat, drumMat, surface('darksteel').mats[0]], mass: 15, hollow: true, fracturable: false,
  });
  // suspension: two dampers below, two springs above (thin steel that bends and tears)
  const sideX = 0.15;
  const tubBottom = doorY + 0.005 - Math.sqrt(R * R - sideX * sideX);
  const tubTop = doorY + 0.005 + Math.sqrt(R * R - sideX * sideX);
  for (const sx of [-1, 1]) {
    const dh = tubBottom - 0.056 + 0.012;
    b.cyl('damper', 0.012, dh, [sx * sideX, 0.056 + dh / 2 - 0.002, drumZ], 'chrome', { segs: 8, hull: true, mass: 0.25 });
    const sh = topY - tubTop + 0.014;
    b.cyl('spring', 0.009, sh, [sx * sideX, topY - sh / 2 + 0.002, drumZ], 'chrome', { segs: 8, hull: true, mass: 0.12 });
  }
  // concrete counterweights clamped to the tub
  b.box('counterweight', [0.36, 0.07, 0.13], [0, doorY + R + 0.028, drumZ + 0.09], 'concrete', { mass: 11 });
  b.box('counterweight', [0.3, 0.06, 0.07], [0, doorY - R - 0.02, drumZ + 0.13], 'concrete', { mass: 6 });
  b.cyl('motor', 0.055, 0.13, [0.13, 0.056 + 0.057, drumZ - 0.06], 'darksteel', { axis: 2, segs: 12, mass: 5.5 });
  b.cyl('pump', 0.04, 0.06, [-0.2, 0.056 + 0.041, 0.17], 'plastic_grey', { axis: 0, segs: 10, hull: true, fracturable: false, mass: 0.6 });
  b.box('control_board', [0.26, 0.085, 0.004], [0.1, topY - fasciaH / 2, fz - T / 2 - 0.004], 'pcb_green', { tags: ['elec'], uv: fitUV(0, 1, -0.13, -0.0425, 0.26, 0.085), mass: 0.2, thick: 0.002 });
  b.box('drawer', [0.15, 0.085, 0.2], [-0.19, topY - fasciaH / 2 - 0.005, fz - T / 2 - 0.1], 'plastic_white', { thick: 0.003, mass: 0.5, hollow: true });

  // --- door ---------------------------------------------------------------
  b.body('door', {});
  const dz = D / 2 + 0.002 + 0.02;
  const ringGeo = new THREE.LatheGeometry(
    [[0.128, -0.02], [0.2, -0.02], [0.205, -0.008], [0.2, 0.014], [0.185, 0.02], [0.14, 0.02], [0.128, 0.006], [0.128, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)),
    40
  );
  ringGeo.rotateX(Math.PI / 2);
  applyUV(ringGeo, boxUV(0.25, 1));
  const ringMat = silver().mats[0].clone();
  ringMat.side = THREE.DoubleSide;
  const ring = b.cyl('door_ring', 0.2, 0.04, [0, doorY, dz], 'plastic_white', { axis: 2, segs: 18, geometry: ringGeo, mats: [ringMat], fracturable: false, mass: 1.3 });
  // porthole glass: bowl shape visually, breaks as a radial-cracked disc
  const bowl = new THREE.SphereGeometry(0.2, 28, 10, 0, Math.PI * 2, 0, 0.72);
  bowl.rotateX(-Math.PI / 2); // dome towards -z (into the drum)
  bowl.translate(0, 0, 0.2 * Math.cos(0.72) + 0.0);
  applyUV(bowl, boxUV(0.3, 1));
  bowl.clearGroups();
  bowl.addGroup(0, bowl.index.count, 0);
  const pts = [];
  for (let i = 0; i < 14; i++) pts.push([Math.cos((i / 14) * Math.PI * 2) * 0.131, Math.sin((i / 14) * Math.PI * 2) * 0.131]);
  b.poly('door_glass', F.prismPoly(pts, 2, -0.005, 0.005, 0, 1), [0, doorY, dz - 0.004], 'glass_porthole', { geometry: bowl, strength: 2.2, mass: 1.1, castShadow: false });
  b.box('door_handle', [0.02, 0.07, 0.016], [0.186, doorY, dz + 0.024], 'plastic_white', { mats: [silver().mats[0]], fracturable: false, mass: 0.05 });
  for (const hy of [doorY - 0.07, doorY + 0.07]) {
    b.box('door_hinge', [0.03, 0.04, 0.018], [-0.205, hy, dz - 0.012], 'steel', { mass: 0.1 }).ghost = true;
    b.hinge(ring, stripL, [-0.21, hy, D / 2 + 0.001], { strength: 58, axis: [0, 1, 0], span: 0.4 });
  }
  b.latch(ring, stripR, [0.2, doorY, D / 2 + 0.001], 13);
  b.behave(sparkBehavior('elec'));
  void drum; void PHYS; void roundedBox;
  return b.build();
}
