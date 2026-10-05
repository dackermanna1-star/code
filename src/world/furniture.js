// Household furniture for the building's rooms: bedrooms, kitchens, libraries, latrines, chapels...
// Convention: y = 0 is the floor, the front faces local +Z and the back sits at -depth/2 (against a wall).
// Wall-hung pieces have their back at z = 0 (the wall surface).
import * as THREE from 'three';
import { sharedAssets } from '../render/materials.js';
import { cached, mesh, lathe, makeFlame, makeCandles, makeBookshelf } from './prop-meshes.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const box = (key, w, h, d) => cached('fb_' + key, () => new THREE.BoxGeometry(w, h, d));
const cyl = (key, rt, rb, h, s = 10) => cached('fc_' + key, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sph = (key, r, w = 10, h = 8) => cached('fs_' + key, () => new THREE.SphereGeometry(r, w, h));

let F = null;
function fmats() {
  if (F) return F;
  const A = sharedAssets();
  F = {
    linen: new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.95 }),
    blankets: [0x9a3030, 0x3a5a8a, 0x5a7a34, 0x8a6a3a, 0x7a4070].map((c) => new THREE.MeshStandardMaterial({ normalMap: A.cloth.normalMap, color: c, roughness: 0.95 })),
    burlap: new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }),
    straw: new THREE.MeshStandardMaterial({ color: 0x8a7440, roughness: 1 }),
    parchment: new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9, side: THREE.DoubleSide }),
    ink: new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.3 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050403 }),
    soot: new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2a4a50, roughness: 0.2, metalness: 0.2 }),
    stew: new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.4 }),
    bread: new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.9 }),
    meat: new THREE.MeshStandardMaterial({ color: 0x7a3a1e, roughness: 0.6 }),
    apple: new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.5 }),
    cheese: new THREE.MeshStandardMaterial({ color: 0xb08a30, roughness: 0.7 }),
    wine: new THREE.MeshStandardMaterial({ color: 0x3a0a14, roughness: 0.2 }),
    brew: new THREE.MeshStandardMaterial({ color: 0x103a10, emissive: 0x3aff5a, emissiveIntensity: 0.9, roughness: 0.3 }),
    coals: new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4010, emissiveIntensity: 1.3, roughness: 1 }),
    glass: [0x3aff8a, 0xff3a6a, 0x3a8aff, 0xffc03a, 0xb05aff].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.15, transparent: true, opacity: 0.8 })),
    sea: new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.6 }),
    land: new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.8 }),
    cushion: new THREE.MeshStandardMaterial({ normalMap: A.cloth.normalMap, color: 0x8a1a1a, roughness: 0.9 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.7 }),
  };
  return F;
}

// ---------------------------------------------------------------- bedrooms

export function makeBed() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const L = 2.0, W = 1.25;
  const post = box('bedPost', 0.1, 1.1, 0.1);
  for (const x of [-W / 2, W / 2]) {
    g.add(mesh(post, A.darkWood, x, 0.55, -L / 2 + 0.05));
    g.add(mesh(box('bedFootPost', 0.1, 0.7, 0.1), A.darkWood, x, 0.35, L / 2 - 0.05));
    g.add(mesh(box('bedRail', 0.06, 0.18, L - 0.1), A.darkWood, x, 0.3, 0));
  }
  g.add(mesh(box('bedHead', W, 0.65, 0.06), A.darkWood, 0, 0.75, -L / 2 + 0.05));
  g.add(mesh(box('bedFoot', W, 0.3, 0.05), A.darkWood, 0, 0.45, L / 2 - 0.05));
  g.add(mesh(box('bedBase', W - 0.06, 0.06, L - 0.1), A.wood, 0, 0.3, 0));
  g.add(mesh(box('mattress', W - 0.12, 0.18, L - 0.16), M.linen, 0, 0.42, 0));
  const blanket = mesh(box('blanket', W - 0.04, 0.06, L * 0.64), pick(M.blankets), 0, 0.53, L * 0.16);
  blanket.rotation.z = rnd(-0.03, 0.03);
  const fold = mesh(box('blanketFold', W - 0.04, 0.08, 0.16), blanket.material, 0, 0.56, -L * 0.15);
  const pillow = mesh(sph('pillow', 0.5), M.linen, 0, 0.56, -L / 2 + 0.3);
  pillow.scale.set(0.55, 0.12, 0.25);
  g.add(blanket, fold, pillow);
  return g;
}

export function makeBunk() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const L = 2.0, W = 1.0;
  const post = box('bunkPost', 0.09, 2.0, 0.09);
  for (const x of [-W / 2, W / 2]) for (const z of [-L / 2 + 0.05, L / 2 - 0.05]) g.add(mesh(post, A.darkWood, x, 1.0, z));
  for (const y of [0.3, 1.3]) {
    g.add(mesh(box('bunkBase', W, 0.06, L - 0.1), A.wood, 0, y, 0));
    g.add(mesh(box('bunkMat', W - 0.1, 0.14, L - 0.16), M.straw, 0, y + 0.1, 0));
    const bl = mesh(box('bunkBlanket', W - 0.06, 0.05, L * 0.55), pick(M.blankets), 0, y + 0.19, L * 0.18);
    g.add(bl);
    for (const x of [-W / 2, W / 2]) g.add(mesh(box('bunkRail', 0.05, 0.12, L - 0.1), A.darkWood, x, y + 0.04, 0));
  }
  // ladder at the foot
  for (const x of [-0.18, 0.18]) g.add(mesh(box('ladRail', 0.05, 1.5, 0.05), A.darkWood, x + W / 2 - 0.25, 0.75, L / 2 + 0.02));
  for (let i = 1; i < 5; i++) g.add(mesh(box('ladRung', 0.36, 0.04, 0.04), A.darkWood, W / 2 - 0.25, i * 0.3, L / 2 + 0.02));
  return g;
}

export function makeWardrobe() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const W = 1.2, H = 2.15, D = 0.6;
  g.add(mesh(box('wardBody', W, H, D), A.darkWood, 0, H / 2 + 0.08, 0));
  g.add(mesh(box('wardCrown', W + 0.12, 0.1, D + 0.08), A.darkWood, 0, H + 0.13, 0.02));
  g.add(mesh(box('wardPlinth', W + 0.06, 0.1, D + 0.04), A.darkWood, 0, 0.05, 0.01));
  for (const s of [-1, 1]) {
    const door = mesh(box('wardDoor', W / 2 - 0.06, H - 0.2, 0.03), A.wood, s * (W / 4), H / 2 + 0.08, D / 2 + 0.01);
    const panel = mesh(box('wardPanel', W / 2 - 0.22, H * 0.35, 0.02), A.darkWood, s * (W / 4), H * 0.7, D / 2 + 0.03);
    const panel2 = mesh(box('wardPanel', W / 2 - 0.22, H * 0.35, 0.02), A.darkWood, s * (W / 4), H * 0.3, D / 2 + 0.03);
    const knob = mesh(sph('knob', 0.03, 6, 4), A.gold, s * 0.06, H / 2 + 0.1, D / 2 + 0.05);
    g.add(door, panel, panel2, knob);
  }
  return g;
}

export function makeNightstand() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(box('nsBody', 0.5, 0.55, 0.45), A.darkWood, 0, 0.3, 0));
  g.add(mesh(box('nsTop', 0.56, 0.04, 0.5), A.wood, 0, 0.6, 0));
  g.add(mesh(box('nsDrawer', 0.42, 0.16, 0.02), A.wood, 0, 0.44, 0.235));
  g.add(mesh(sph('knob', 0.03, 6, 4), A.gold, 0, 0.44, 0.255));
  const c = makeCandles(1);
  c.position.set(0.08, 0.62, 0);
  c.scale.setScalar(0.8);
  g.add(c);
  g.userData.lightOffset = new THREE.Vector3(0, 0.95, 0);
  return g;
}

export function makeDesk() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 1.4, D = 0.7, H = 0.78;
  g.add(mesh(box('deskTop', W, 0.06, D), A.wood, 0, H, 0));
  g.add(mesh(box('deskDrawers', 0.42, H - 0.06, D - 0.06), A.darkWood, W / 2 - 0.24, (H - 0.06) / 2, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(box('deskDrawer', 0.36, 0.18, 0.02), A.wood, W / 2 - 0.24, 0.15 + i * 0.23, D / 2 - 0.02));
  g.add(mesh(box('deskLeg', 0.07, H - 0.06, 0.07), A.darkWood, -W / 2 + 0.06, (H - 0.06) / 2, D / 2 - 0.06));
  g.add(mesh(box('deskLeg', 0.07, H - 0.06, 0.07), A.darkWood, -W / 2 + 0.06, (H - 0.06) / 2, -D / 2 + 0.06));
  g.add(mesh(box('deskBack', W - 0.1, 0.4, 0.03), A.darkWood, -0.1, 0.5, -D / 2 + 0.03));
  // papers, quill, ink, a book
  for (let i = 0; i < 3; i++) {
    const p = mesh(box('paper', 0.22, 0.004, 0.3), M.parchment, rnd(-0.4, 0.1), H + 0.035 + i * 0.004, rnd(-0.05, 0.12));
    p.rotation.y = rnd(-0.4, 0.4);
    g.add(p);
  }
  g.add(mesh(cyl('inkwell', 0.035, 0.045, 0.07, 8), M.ink, 0.25, H + 0.065, -0.15));
  const quill = mesh(box('quill', 0.01, 0.01, 0.28), M.linen, 0.25, H + 0.14, -0.12);
  quill.rotation.x = -0.9;
  g.add(quill);
  const book = mesh(box('deskBook', 0.3, 0.07, 0.22), pick(A.books), 0.45, H + 0.065, 0.05);
  book.rotation.y = rnd(-0.3, 0.3);
  g.add(book);
  const c = makeCandles(2);
  c.position.set(-0.5, H + 0.03, -0.18);
  c.scale.setScalar(0.6);
  g.add(c);
  // a stool tucked in front
  const stool = new THREE.Group();
  stool.add(mesh(cyl('stoolTop', 0.2, 0.2, 0.05, 10), A.wood, 0, 0.46, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = mesh(cyl('stoolLeg', 0.025, 0.03, 0.46, 5), A.darkWood, Math.cos(a) * 0.13, 0.23, Math.sin(a) * 0.13);
    l.rotation.z = Math.cos(a) * 0.12; l.rotation.x = -Math.sin(a) * 0.12;
    stool.add(l);
  }
  stool.position.set(-0.15, 0, D / 2 + 0.25);
  g.add(stool);
  g.userData.lightOffset = new THREE.Vector3(-0.5, H + 0.5, 0);
  return g;
}

// ---------------------------------------------------------------- storage & kitchens

function jar(g, x, y, z, s = 1) {
  const A = sharedAssets();
  const v = Math.floor(Math.random() * 3);
  const m = mesh(cached('jar' + v, () => lathe(v === 0 ? [[0, 0], [0.08, 0], [0.1, 0.1], [0.07, 0.2], [0.05, 0.22], [0.06, 0.25]] : v === 1 ? [[0, 0], [0.1, 0], [0.12, 0.08], [0.1, 0.16], [0.08, 0.17]] : [[0, 0], [0.05, 0], [0.07, 0.15], [0.04, 0.26], [0.03, 0.32]], 8)), Math.random() < 0.5 ? A.clay : A.clayDark, x, y, z);
  m.scale.setScalar(s);
  g.add(m);
}

export function makeShelf() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 1.8, H = 1.95, D = 0.45;
  const side = box('shSide', 0.06, H, D);
  g.add(mesh(side, A.darkWood, -W / 2, H / 2, 0), mesh(side, A.darkWood, W / 2, H / 2, 0));
  for (let r = 0; r < 4; r++) {
    const y = 0.1 + r * 0.6;
    g.add(mesh(box('shBoard', W, 0.04, D), A.wood, 0, y, 0));
    if (r === 3) break;
    let x = -W / 2 + 0.12;
    while (x < W / 2 - 0.15) {
      const k = Math.random();
      if (k < 0.45) { jar(g, x, y + 0.02, rnd(-0.08, 0.08), rnd(0.8, 1.3)); x += rnd(0.2, 0.3); }
      else if (k < 0.65) {
        const s = mesh(sph('sackS', 0.5), M.burlap, x + 0.1, y + 0.13, 0);
        s.scale.set(0.2, 0.14, 0.17);
        g.add(s);
        x += 0.32;
      } else if (k < 0.8) {
        const c = mesh(cyl('cheeseW', 0.12, 0.12, 0.09, 10), M.cheese, x + 0.06, y + 0.065, 0);
        g.add(c);
        x += 0.28;
      } else x += rnd(0.15, 0.3);
    }
  }
  return g;
}

export function makeSacks() {
  const M = fmats();
  const g = new THREE.Group();
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group();
    const body = mesh(cached('sackBody', () => lathe([[0, 0], [0.22, 0.02], [0.28, 0.2], [0.26, 0.42], [0.16, 0.55], [0.06, 0.6], [0.09, 0.68], [0, 0.7]], 10)), M.burlap);
    s.add(body);
    const top = i === n - 1 && n > 2;
    s.position.set(top ? 0 : rnd(-0.35, 0.35), top ? 0.4 : 0, top ? 0 : rnd(-0.2, 0.2));
    s.rotation.set(top ? Math.PI / 2 - 0.2 : rnd(-0.12, 0.12), rnd(0, 6), rnd(-0.12, 0.12));
    s.scale.set(rnd(0.9, 1.1), top ? 0.9 : rnd(0.8, 1.05), rnd(0.9, 1.1));
    if (top) s.position.y = 0.55;
    g.add(s);
  }
  return g;
}

export function makeCounter() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 2.2, D = 0.8, H = 0.95;
  g.add(mesh(box('ctrBody', W, H - 0.06, D - 0.06), A.darkWood, 0, (H - 0.06) / 2, -0.03));
  g.add(mesh(box('ctrTop', W + 0.06, 0.07, D), A.wood, 0, H - 0.03, 0));
  for (const x of [-W / 4, W / 4]) g.add(mesh(box('ctrPanel', W / 2 - 0.2, H - 0.3, 0.02), A.wood, x, H / 2 - 0.05, D / 2 - 0.05));
  // kitchen clutter
  const board = mesh(box('cutBoard', 0.45, 0.04, 0.3), A.wood, rnd(-0.6, -0.2), H + 0.02, 0.05);
  board.rotation.y = rnd(-0.3, 0.3);
  const loaf = mesh(sph('loaf', 0.5), M.bread, board.position.x, H + 0.1, 0.05);
  loaf.scale.set(0.24, 0.12, 0.14);
  const knife = mesh(box('knife', 0.22, 0.01, 0.03), A.metal, board.position.x + 0.1, H + 0.05, 0.14);
  knife.rotation.y = 0.4;
  g.add(board, loaf, knife);
  const bowl = mesh(cached('bowl', () => lathe([[0, 0], [0.08, 0], [0.15, 0.06], [0.17, 0.11], [0.15, 0.11], [0.13, 0.06], [0, 0.03]], 10)), A.clay, rnd(0.2, 0.7), H, rnd(-0.15, 0.15));
  g.add(bowl);
  for (let i = 0; i < 3; i++) g.add(mesh(sph('apple', 0.045, 6, 5), M.apple, bowl.position.x + rnd(-0.06, 0.06), H + 0.08, bowl.position.z + rnd(-0.06, 0.06)));
  jar(g, rnd(-1, -0.8), H, -0.2);
  jar(g, rnd(0.85, 1.0), H, -0.25, 1.2);
  return g;
}

export function makeHearth(mats) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 2.1, D = 0.9, H = 2.5;
  const stone = mats.stone;
  g.add(mesh(box('hSide', 0.4, 1.4, D), stone, -W / 2 + 0.2, 0.7, 0), mesh(box('hSide', 0.4, 1.4, D), stone, W / 2 - 0.2, 0.7, 0));
  g.add(mesh(box('hLintel', W, 0.35, D), stone, 0, 1.57, 0));
  g.add(mesh(box('hMantel', W + 0.3, 0.1, D + 0.15), A.darkWood, 0, 1.8, 0.07));
  g.add(mesh(box('hChimney', W - 0.3, H - 1.85, D - 0.2), stone, 0, 1.85 + (H - 1.85) / 2, -0.1));
  g.add(mesh(box('hBack', W - 0.8, 1.4, 0.05), M.soot, 0, 0.7, -D / 2 + 0.05));
  g.add(mesh(box('hHearth', W + 0.2, 0.08, D + 0.35), stone, 0, 0.04, 0.17));
  // logs and embers
  for (let i = 0; i < 3; i++) {
    const log = mesh(cyl('log', 0.08, 0.09, 0.8, 7), A.darkWood, rnd(-0.15, 0.15), 0.16 + (i === 2 ? 0.12 : 0), rnd(-0.1, 0.1));
    log.rotation.set(Math.PI / 2, 0, (i - 1) * 0.6 + rnd(-0.2, 0.2));
    g.add(log);
  }
  for (let i = 0; i < 6; i++) g.add(mesh(cached('coal', () => new THREE.IcosahedronGeometry(0.09, 0)), M.coals, rnd(-0.4, 0.4), 0.1, rnd(-0.2, 0.15)));
  g.userData.flames = [];
  for (let i = 0; i < 4; i++) {
    const f = makeFlame(rnd(1.8, 2.6), 0xff8a3a);
    f.position.set(rnd(-0.3, 0.3), 0.2, rnd(-0.1, 0.1));
    g.add(f);
  }
  // a pot on a hook
  g.add(mesh(cyl('hookBar', 0.015, 0.015, 0.7, 4), A.darkMetal, 0, 1.05, -0.05));
  g.add(mesh(cached('hpot', () => lathe([[0, 0], [0.16, 0.02], [0.2, 0.12], [0.19, 0.24], [0.17, 0.26]], 10)), A.darkMetal, 0, 0.5, -0.05));
  // tools and things on the mantel
  jar(g, -0.7, 1.85, 0.05);
  jar(g, 0.75, 1.85, 0.05, 0.8);
  const c = makeCandles(2);
  c.position.set(0.3, 1.85, 0.05);
  c.scale.setScalar(0.6);
  g.add(c);
  g.userData.lightOffset = new THREE.Vector3(0, 0.7, 0.6);
  return g;
}

export function makeCauldron(brew = true) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(mesh(cyl('cldLeg', 0.04, 0.03, 0.3, 5), A.darkMetal, Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4));
  }
  const pot = mesh(cached('cauldron', () => lathe([[0, 0.05], [0.3, 0.08], [0.5, 0.25], [0.56, 0.45], [0.5, 0.68], [0.46, 0.72], [0.52, 0.76], [0.48, 0.78], [0.42, 0.72]], 16)), A.darkMetal, 0, 0.18, 0);
  g.add(pot);
  const surf = mesh(cyl('brewSurf', 0.44, 0.44, 0.02, 16), brew ? M.brew : M.stew, 0, 0.82, 0);
  g.add(surf);
  // fire beneath
  for (let i = 0; i < 4; i++) {
    const log = mesh(cyl('log', 0.08, 0.09, 0.8, 7), A.darkWood, 0, 0.06, 0);
    log.rotation.set(Math.PI / 2, 0, (i / 4) * Math.PI);
    log.scale.setScalar(0.8);
    g.add(log);
  }
  for (let i = 0; i < 2; i++) {
    const f = makeFlame(1.6, 0xff8a3a);
    f.position.set(rnd(-0.12, 0.12), 0.05, rnd(-0.12, 0.12));
    g.add(f);
  }
  const ladle = mesh(cyl('ladle', 0.015, 0.015, 0.9, 4), A.darkWood, 0.18, 0.95, 0);
  ladle.rotation.z = -0.45;
  g.add(ladle);
  g.userData.lightOffset = new THREE.Vector3(0, 0.5, 0);
  return g;
}

// A long table running along local Z with benches either side.
export function makeLongTable(len, feast = false) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const H = 0.82, W = 1.1;
  g.add(mesh(cached('ltTop' + len.toFixed(1), () => new THREE.BoxGeometry(W, 0.08, len)), A.wood, 0, H, 0));
  const legs = Math.max(2, Math.round(len / 2.4) + 1);
  for (let i = 0; i < legs; i++) {
    const z = -len / 2 + 0.3 + (i * (len - 0.6)) / (legs - 1);
    g.add(mesh(box('ltLeg', W - 0.2, H - 0.04, 0.1), A.darkWood, 0, (H - 0.04) / 2, z));
  }
  g.add(mesh(cached('ltStretch' + len.toFixed(1), () => new THREE.BoxGeometry(0.08, 0.08, len - 0.5)), A.darkWood, 0, 0.2, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(cached('ltBench' + len.toFixed(1), () => new THREE.BoxGeometry(0.36, 0.06, len - 0.2)), A.wood, s * 0.9, 0.46, 0));
    for (let i = 0; i < legs; i++) {
      const z = -len / 2 + 0.3 + (i * (len - 0.6)) / (legs - 1);
      g.add(mesh(box('ltBenchLeg', 0.3, 0.43, 0.06), A.darkWood, s * 0.9, 0.215, z));
    }
  }
  g.userData.flames = [];
  // place settings along both sides
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 0.45 + i * ((len - 0.9) / Math.max(1, n - 1));
    for (const s of [-1, 1]) {
      if (Math.random() < 0.25) continue;
      g.add(mesh(cyl('plate', 0.14, 0.12, 0.02, 12), A.clayDark, s * 0.32, H + 0.05, z + rnd(-0.05, 0.05)));
      if (Math.random() < 0.7) g.add(mesh(cached('goblet', () => lathe([[0, 0], [0.05, 0], [0.01, 0.02], [0.01, 0.09], [0.045, 0.12], [0.05, 0.18]], 8)), Math.random() < 0.3 ? A.gold : A.darkMetal, s * 0.42 + rnd(-0.03, 0.03), H + 0.04, z + 0.2));
    }
  }
  // centrepieces
  for (let z = -len / 2 + 1.0; z < len / 2 - 0.6; z += rnd(1.0, 1.6)) {
    const k = Math.random();
    if (feast && k < 0.3) {
      const platter = mesh(cyl('platter', 0.28, 0.24, 0.03, 14), A.darkMetal, 0, H + 0.055, z);
      const roast = mesh(sph('roast', 0.5), M.meat, 0, H + 0.15, z);
      roast.scale.set(0.2, 0.13, 0.28);
      g.add(platter, roast);
    } else if (feast && k < 0.55) {
      for (let j = 0; j < 3; j++) {
        const b = mesh(sph('loaf', 0.5), M.bread, rnd(-0.12, 0.12), H + 0.09, z + rnd(-0.2, 0.2));
        b.scale.set(0.2, 0.1, 0.12);
        b.rotation.y = rnd(0, 3);
        g.add(b);
      }
    } else if (k < 0.75) {
      const c = makeCandles(3);
      c.position.set(0, H + 0.04, z);
      c.scale.setScalar(0.65);
      g.add(c);
    } else {
      g.add(mesh(cached('jug', () => lathe([[0, 0], [0.08, 0], [0.11, 0.1], [0.09, 0.22], [0.06, 0.26], [0.07, 0.3]], 10)), A.clay, rnd(-0.15, 0.15), H + 0.04, z));
      if (feast) for (let j = 0; j < 4; j++) g.add(mesh(sph('apple', 0.045, 6, 5), M.apple, rnd(-0.12, 0.12), H + 0.08, z + 0.25 + rnd(-0.08, 0.08)));
    }
  }
  return g;
}

export function makeBench() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(box('benchTop', 1.6, 0.07, 0.42), A.wood, 0, 0.46, 0));
  for (const x of [-0.65, 0.65]) g.add(mesh(box('benchLeg', 0.07, 0.43, 0.36), A.darkWood, x, 0.215, 0));
  g.add(mesh(box('benchStretch', 1.3, 0.06, 0.05), A.darkWood, 0, 0.15, 0));
  return g;
}

// ---------------------------------------------------------------- latrines & baths

export function makePrivy() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 1.0, D = 0.85;
  // the box seat
  g.add(mesh(box('pvFront', W, 0.5, 0.05), A.wood, 0, 0.25, D / 2 - 0.4));
  g.add(mesh(box('pvSeat', W, 0.06, 0.5), A.wood, 0, 0.5, D / 2 - 0.65));
  const hole = mesh(cyl('pvHole', 0.14, 0.14, 0.01, 12), M.hole, 0, 0.535, D / 2 - 0.65);
  hole.scale.set(1, 1, 1.25);
  g.add(hole);
  g.add(mesh(box('pvBackBox', W, 0.5, 0.35), A.darkWood, 0, 0.25, -D / 2 + 0.175));
  // stall partitions and a back board
  for (const s of [-1, 1]) g.add(mesh(box('pvPart', 0.05, 1.6, D + 0.15), A.darkWood, s * (W / 2 + 0.03), 0.85, 0.07));
  g.add(mesh(box('pvBackBoard', W, 1.1, 0.04), A.wood, 0, 1.05, -D / 2 + 0.02));
  // a ragged curtain rod
  g.add(mesh(cyl('pvRod', 0.015, 0.015, W + 0.1, 4), A.darkMetal, 0, 1.6, D / 2 + 0.12).rotateZ(Math.PI / 2));
  if (Math.random() < 0.6) {
    const cur = mesh(box('pvCurtain', W * 0.45, 1.1, 0.02), pick(M.blankets), (Math.random() < 0.5 ? -1 : 1) * W * 0.27, 1.05, D / 2 + 0.12);
    g.add(cur);
  }
  // a bucket of rags
  const b = makeBucket();
  b.position.set(W / 2 - 0.2, 0.55, -D / 2 + 0.2);
  b.scale.setScalar(0.55);
  g.add(b);
  return g;
}

export function makeBucket() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  g.add(mesh(cached('bucket', () => lathe([[0, 0], [0.14, 0], [0.18, 0.35], [0.16, 0.35], [0.12, 0.03], [0, 0.03]], 12)), A.wood));
  for (const y of [0.08, 0.28]) {
    const band = mesh(cached('bkBand' + y, () => new THREE.TorusGeometry(0.15 + y * 0.1, 0.008, 3, 14)), A.darkMetal, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  const handle = mesh(cached('bkHandle', () => new THREE.TorusGeometry(0.17, 0.008, 3, 10, Math.PI)), A.darkMetal, 0, 0.35, 0);
  handle.rotation.y = rnd(0, 3);
  g.add(handle);
  g.add(mesh(cyl('bkWater', 0.165, 0.165, 0.01, 12), M.water, 0, 0.26, 0));
  return g;
}

export function makeBathtub() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const tub = mesh(cached('tub', () => lathe([[0, 0.06], [0.45, 0.06], [0.52, 0.2], [0.55, 0.62], [0.5, 0.62], [0.47, 0.2], [0, 0.12]], 18)), A.wood, 0, 0, 0);
  tub.scale.set(1.5, 1, 0.85);
  g.add(tub);
  for (const y of [0.18, 0.5]) {
    const band = mesh(cached('tubBand', () => new THREE.TorusGeometry(0.545, 0.012, 3, 20)), A.darkMetal, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.5, 0.85, 1);
    g.add(band);
  }
  const water = mesh(cyl('tubWater', 0.49, 0.49, 0.01, 18), M.water, 0, 0.45, 0);
  water.scale.set(1.5, 1, 0.85);
  g.add(water);
  for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.3]) g.add(mesh(box('tubFoot', 0.12, 0.08, 0.12), A.darkWood, x, 0.04, z));
  const towel = mesh(box('towel', 0.3, 0.5, 0.02), M.linen, 0.55, 0.42, 0.47);
  g.add(towel);
  return g;
}

// ---------------------------------------------------------------- chapels & halls of state

export function makePew() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const L = 2.0;
  g.add(mesh(box('pewSeat', L, 0.07, 0.42), A.wood, 0, 0.46, 0.04));
  g.add(mesh(box('pewBack', L, 0.6, 0.05), A.wood, 0, 0.82, -0.2));
  g.add(mesh(box('pewRail', L + 0.04, 0.06, 0.1), A.darkWood, 0, 1.13, -0.2));
  for (const x of [-L / 2, L / 2]) g.add(mesh(box('pewEnd', 0.07, 0.95, 0.5), A.darkWood, x, 0.48, -0.02));
  // kneeler shelf at the back for the row behind
  g.add(mesh(box('pewShelf', L - 0.1, 0.04, 0.14), A.darkWood, 0, 0.75, -0.3));
  return g;
}

export function makeAltar(mats) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  g.add(mesh(box('altBody', 1.8, 0.95, 0.9), mats.stone, 0, 0.475, 0));
  g.add(mesh(box('altTop', 2.0, 0.1, 1.0), mats.stone, 0, 1.0, 0));
  g.add(mesh(box('altCloth', 0.7, 0.012, 1.02), A.cloth, 0, 1.056, 0));
  g.add(mesh(box('altClothDrop', 0.7, 0.5, 0.01), A.cloth, 0, 0.8, 0.505));
  const book = mesh(box('altBook', 0.36, 0.06, 0.26), M.parchment, 0, 1.09, 0.1);
  book.rotation.x = -0.15;
  g.add(book);
  g.add(mesh(cached('chalice', () => lathe([[0, 0], [0.08, 0], [0.02, 0.03], [0.02, 0.14], [0.08, 0.18], [0.09, 0.26]], 10)), A.gold, 0.45, 1.05, 0));
  for (const x of [-0.75, 0.75]) {
    const c = makeCandles(3);
    c.position.set(x, 1.05, -0.1);
    c.scale.setScalar(0.7);
    g.add(c);
  }
  g.userData.lightOffset = new THREE.Vector3(0, 1.6, 0.3);
  return g;
}

export function makeArmorStand() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cyl('asBase', 0.3, 0.34, 0.08, 10), A.darkWood, 0, 0.04, 0));
  g.add(mesh(cyl('asPole', 0.04, 0.04, 1.5, 6), A.darkWood, 0, 0.8, 0));
  g.add(mesh(box('asShoulders', 0.62, 0.06, 0.08), A.darkWood, 0, 1.45, 0));
  const cuirass = mesh(cached('cuirass', () => { const geo = lathe([[0.12, 0], [0.24, 0.05], [0.27, 0.3], [0.3, 0.48], [0.18, 0.56], [0.08, 0.58]], 12); return geo; }), A.metal, 0, 0.95, 0);
  cuirass.scale.set(1, 1, 0.75);
  g.add(cuirass);
  for (const s of [-1, 1]) {
    const pauldron = mesh(sph('pauldron', 0.14, 8, 6), A.metal, s * 0.32, 1.47, 0);
    pauldron.scale.set(1, 0.7, 1);
    g.add(pauldron);
  }
  const helm = mesh(cached('helm', () => lathe([[0.15, 0], [0.16, 0.12], [0.14, 0.22], [0.08, 0.28], [0, 0.3]], 12)), A.metal, 0, 1.62, 0);
  g.add(helm);
  g.add(mesh(box('helmSlit', 0.18, 0.025, 0.02), sharedAssets().darkMetal, 0, 1.73, 0.15));
  g.add(mesh(box('tasset', 0.36, 0.2, 0.04), A.darkMetal, 0, 0.88, 0.2));
  return g;
}

export function makeAnvil() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cyl('stump', 0.3, 0.34, 0.55, 10), A.darkWood, 0, 0.275, 0));
  g.add(mesh(box('anvFoot', 0.36, 0.1, 0.24), A.darkMetal, 0, 0.6, 0));
  g.add(mesh(box('anvWaist', 0.22, 0.14, 0.16), A.darkMetal, 0, 0.72, 0));
  g.add(mesh(box('anvFace', 0.5, 0.12, 0.2), A.darkMetal, -0.04, 0.85, 0));
  const horn = mesh(cached('anvHorn', () => { const geo = new THREE.ConeGeometry(0.08, 0.3, 8); geo.rotateZ(-Math.PI / 2); return geo; }), A.darkMetal, 0.35, 0.86, 0);
  g.add(horn);
  const hammer = new THREE.Group();
  hammer.add(mesh(cyl('hamHandle', 0.018, 0.02, 0.4, 5), A.darkWood, 0, 0, 0));
  hammer.add(mesh(box('hamHead', 0.08, 0.08, 0.16), A.metal, 0, 0.2, 0));
  hammer.rotation.set(Math.PI / 2, 0, 0.6);
  hammer.position.set(-0.1, 0.94, 0.02);
  g.add(hammer);
  return g;
}

export function makeThrone(mats) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  g.add(mesh(box('thStep', 1.6, 0.18, 1.3), mats.stone, 0, 0.09, 0.1));
  g.add(mesh(box('thSeat', 1.0, 0.45, 0.8), mats.stone, 0, 0.4, 0));
  g.add(mesh(box('thCushion', 0.8, 0.1, 0.65), M.cushion, 0, 0.67, 0.04));
  g.add(mesh(box('thBack', 1.0, 2.0, 0.22), mats.stone, 0, 1.4, -0.32));
  g.add(mesh(box('thBackCloth', 0.6, 1.3, 0.02), M.cushion, 0, 1.3, -0.2));
  const crest = mesh(cached('thCrest', () => new THREE.ConeGeometry(0.25, 0.5, 4)), A.gold, 0, 2.6, -0.32);
  crest.rotation.y = Math.PI / 4;
  g.add(crest);
  for (const s of [-1, 1]) {
    g.add(mesh(box('thArm', 0.16, 0.35, 0.8), mats.stone, s * 0.55, 0.8, 0));
    g.add(mesh(sph('thKnob', 0.1, 8, 6), A.gold, s * 0.55, 1.0, 0.38));
    g.add(mesh(cached('thFinial', () => new THREE.ConeGeometry(0.1, 0.4, 6)), A.gold, s * 0.45, 2.55, -0.32));
  }
  return g;
}

// ---------------------------------------------------------------- wall decor

const paintingMats = [];
function paintingTexture(v) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 80;
  const x = c.getContext('2d');
  const kind = v % 4;
  if (kind === 0) { // landscape
    const sky = x.createLinearGradient(0, 0, 0, 50);
    sky.addColorStop(0, ['#4a5a7a', '#7a5a4a', '#3a4a5a'][v % 3]); sky.addColorStop(1, '#c0a070');
    x.fillStyle = sky; x.fillRect(0, 0, 64, 80);
    x.fillStyle = '#3a4a2a';
    x.beginPath(); x.moveTo(0, 52); for (let i = 0; i <= 8; i++) x.lineTo(i * 8, 44 + Math.sin(i * 1.7 + v) * 7); x.lineTo(64, 80); x.lineTo(0, 80); x.fill();
    x.fillStyle = '#2a3020'; x.fillRect(0, 62, 64, 18);
    x.fillStyle = '#e8d8a0'; x.beginPath(); x.arc(46, 18, 5, 0, 7); x.fill();
  } else if (kind === 1) { // portrait
    x.fillStyle = ['#2a1a14', '#14202a', '#201a2a'][v % 3]; x.fillRect(0, 0, 64, 80);
    x.fillStyle = ['#5a1a1a', '#1a2a4a', '#2a2a2a'][(v >> 2) % 3];
    x.beginPath(); x.moveTo(8, 80); x.quadraticCurveTo(32, 40, 56, 80); x.fill();
    x.fillStyle = '#c8a080'; x.beginPath(); x.ellipse(32, 34, 10, 13, 0, 0, 7); x.fill();
    x.fillStyle = ['#3a2a1a', '#8a8a8a', '#a07a3a'][v % 3]; x.beginPath(); x.ellipse(32, 26, 11, 8, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#2a1a10'; x.fillRect(27, 33, 3, 2); x.fillRect(34, 33, 3, 2);
  } else if (kind === 2) { // still life
    x.fillStyle = '#1a140e'; x.fillRect(0, 0, 64, 80);
    x.fillStyle = '#4a3220'; x.fillRect(0, 56, 64, 24);
    x.fillStyle = '#8a2a1a'; x.beginPath(); x.arc(22, 52, 7, 0, 7); x.fill();
    x.fillStyle = '#8a8a3a'; x.beginPath(); x.arc(34, 54, 6, 0, 7); x.fill();
    x.fillStyle = '#6a6a70'; x.fillRect(42, 30, 10, 26);
    x.fillStyle = '#c8b080'; x.beginPath(); x.ellipse(28, 44, 12, 4, 0, 0, 7); x.fill();
  } else { // a hunt / battle scene in reds
    x.fillStyle = '#3a2a1a'; x.fillRect(0, 0, 64, 80);
    x.fillStyle = '#6a3a1a'; x.fillRect(0, 50, 64, 30);
    for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#1a1410' : '#8a6a4a'; x.fillRect(8 + i * 11, 34 + (i % 2) * 6, 6, 18); x.beginPath(); x.arc(11 + i * 11, 31 + (i % 2) * 6, 4, 0, 7); x.fill(); }
    x.strokeStyle = '#c8c0b0'; x.lineWidth = 1; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(10 + i * 14, 30); x.lineTo(16 + i * 14, 10); x.stroke(); }
  }
  // varnish and age
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(40,25,10,${Math.random() * 0.2})`; x.fillRect(Math.random() * 64, Math.random() * 80, 2, 2); }
  x.fillStyle = 'rgba(60,40,10,0.18)'; x.fillRect(0, 0, 64, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makePainting(seed = 0) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const v = seed % 12;
  if (!paintingMats[v]) paintingMats[v] = new THREE.MeshStandardMaterial({ map: paintingTexture(v), roughness: 0.75 });
  const big = seed % 5 === 0;
  const w = big ? 1.3 : 0.8, h = big ? 1.6 : 1.0;
  const cy = big ? 2.0 : 1.85;
  g.add(mesh(cached('pCanvas' + big, () => new THREE.PlaneGeometry(w, h)), paintingMats[v], 0, cy, 0.05));
  const fw = 0.09;
  const fm = seed % 3 === 0 ? A.darkWood : A.gold;
  g.add(mesh(box('pFrameH' + big, w + fw * 2, fw, 0.07), fm, 0, cy + h / 2 + fw / 2, 0.035), mesh(box('pFrameH' + big, w + fw * 2, fw, 0.07), fm, 0, cy - h / 2 - fw / 2, 0.035));
  g.add(mesh(box('pFrameV' + big, fw, h, 0.07), fm, -w / 2 - fw / 2, cy, 0.035), mesh(box('pFrameV' + big, fw, h, 0.07), fm, w / 2 + fw / 2, cy, 0.035));
  return g;
}

export function makeShieldDecor(seed = 0) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const shield = mesh(cached('wallShield', () => { const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16); geo.rotateX(Math.PI / 2); return geo; }), seed % 2 ? A.wood : M.blankets[seed % M.blankets.length], 0, 2.0, 0.06);
  const boss = mesh(sph('shBoss', 0.1, 8, 6), A.metal, 0, 2.0, 0.1);
  const rim = mesh(cached('shRim', () => new THREE.TorusGeometry(0.42, 0.025, 4, 18)), A.darkMetal, 0, 2.0, 0.085);
  g.add(shield, boss, rim);
  for (const s of [-1, 1]) {
    const sw = new THREE.Group();
    sw.add(mesh(box('dsBlade', 0.06, 1.1, 0.012), A.metal, 0, 0, 0));
    sw.add(mesh(box('dsGuard', 0.24, 0.04, 0.04), A.darkMetal, 0, -0.55, 0));
    sw.add(mesh(cyl('dsGrip', 0.018, 0.018, 0.18, 5), A.darkWood, 0, -0.66, 0));
    sw.rotation.z = s * 0.7;
    sw.position.set(0, 2.0, 0.03);
    g.add(sw);
  }
  return g;
}

export function makePans() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(box('panRail', 1.4, 0.05, 0.05), A.darkWood, 0, 1.9, 0.04));
  for (let i = 0; i < 5; i++) {
    const x = -0.55 + i * 0.275;
    g.add(mesh(cyl('panHook', 0.006, 0.006, 0.12, 3), A.darkMetal, x, 1.83, 0.06));
    const k = Math.random();
    if (k < 0.5) {
      const pan = mesh(cached('pan', () => { const geo = lathe([[0, 0], [0.13, 0], [0.15, 0.05], [0.14, 0.05]], 12); geo.rotateX(Math.PI / 2); return geo; }), A.darkMetal, x, 1.48, 0.06);
      g.add(pan, mesh(box('panHandle', 0.03, 0.22, 0.015), A.darkMetal, x, 1.68, 0.07));
    } else if (k < 0.8) {
      g.add(mesh(cyl('ladleS', 0.01, 0.01, 0.4, 4), A.darkWood, x, 1.6, 0.07), mesh(sph('ladleB', 0.05, 6, 4), A.darkMetal, x, 1.4, 0.08));
    } else {
      const sausage = mesh(cyl('sausage', 0.03, 0.03, 0.35, 6), sharedAssets().paper, x, 1.6, 0.07);
      g.add(sausage);
    }
  }
  return g;
}

export function makeShackles() {
  const A = sharedAssets();
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(mesh(box('shkPlate', 0.12, 0.12, 0.03), A.darkMetal, s * 0.35, 1.9, 0.015));
    const link = cached('link', () => new THREE.TorusGeometry(0.05, 0.014, 4, 8));
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const l = mesh(link, A.rust, s * 0.35, 1.84 - i * 0.08, 0.04);
      l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      g.add(l);
    }
    const cuff = mesh(cached('cuff', () => new THREE.TorusGeometry(0.07, 0.02, 4, 10)), A.rust, s * 0.35, 1.84 - n * 0.08 - 0.05, 0.05);
    cuff.rotation.x = Math.PI / 2 + rnd(-0.4, 0.4);
    g.add(cuff);
  }
  return g;
}

// ---------------------------------------------------------------- odds and ends

export function makeBust(mats) {
  const g = new THREE.Group();
  g.add(mesh(box('bustPlinth', 0.5, 0.08, 0.5), mats.stone, 0, 0.04, 0));
  g.add(mesh(cyl('bustPed', 0.18, 0.22, 1.05, 10), mats.stone, 0, 0.6, 0));
  g.add(mesh(box('bustTop', 0.42, 0.06, 0.42), mats.stone, 0, 1.15, 0));
  const chest = mesh(sph('bustChest', 0.5, 12, 8), mats.stone, 0, 1.28, 0);
  chest.scale.set(0.42, 0.26, 0.24);
  const neck = mesh(cyl('bustNeck', 0.07, 0.08, 0.16, 8), mats.stone, 0, 1.45, 0);
  const head = mesh(sph('bustHead', 0.14, 12, 10), mats.stone, 0, 1.62, 0.01);
  head.scale.set(0.95, 1.15, 1.05);
  const nose = mesh(box('bustNose', 0.04, 0.06, 0.05), mats.stone, 0, 1.6, 0.15);
  g.add(chest, neck, head, nose);
  if (Math.random() < 0.5) {
    const laurel = mesh(cached('laurel', () => new THREE.TorusGeometry(0.14, 0.025, 4, 12)), mats.stone, 0, 1.7, 0);
    laurel.rotation.x = Math.PI / 2;
    g.add(laurel);
  }
  return g;
}

// Hangs from y = 0 (the ceiling) down hangLen.
export function makeChandelier(hangLen = 1.5) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const link = cached('link', () => new THREE.TorusGeometry(0.05, 0.014, 4, 8));
  const n = Math.floor(hangLen / 0.09);
  for (let i = 0; i < n; i++) {
    const l = mesh(link, A.darkMetal, 0, -i * 0.09 - 0.05, 0);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
  }
  const y = -hangLen;
  const ring = mesh(cached('chRing', () => new THREE.TorusGeometry(0.75, 0.035, 5, 24)), A.darkMetal, 0, y, 0);
  ring.rotation.x = Math.PI / 2;
  const ring2 = mesh(cached('chRing2', () => new THREE.TorusGeometry(0.4, 0.025, 5, 16)), A.darkMetal, 0, y - 0.15, 0);
  ring2.rotation.x = Math.PI / 2;
  g.add(ring, ring2, mesh(cyl('chHub', 0.06, 0.1, 0.3, 8), A.darkMetal, 0, y - 0.05, 0));
  for (let i = 0; i < 4; i++) {
    const spoke = mesh(box('chSpoke', 1.5, 0.025, 0.025), A.darkMetal, 0, y, 0);
    spoke.rotation.y = (i / 4) * Math.PI;
    g.add(spoke);
  }
  g.userData.flames = [];
  const cn = 8;
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * Math.PI * 2;
    const x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.75;
    g.add(mesh(cyl('chCup', 0.05, 0.03, 0.04, 6), A.darkMetal, x, y + 0.03, z));
    g.add(mesh(cyl('chCandle', 0.025, 0.028, 0.16, 6), A.candle, x, y + 0.13, z));
    const f = makeFlame(0.45, 0xffb060);
    f.position.set(x, y + 0.22, z);
    g.add(f);
  }
  g.userData.lightOffset = new THREE.Vector3(0, y - 0.3, 0);
  return g;
}

export function makeAlchemy() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const W = 1.8, D = 0.8, H = 0.85;
  g.add(mesh(box('alTop', W, 0.07, D), A.darkWood, 0, H, 0));
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) g.add(mesh(box('alLeg', 0.08, H, 0.08), A.darkWood, x, H / 2, z));
  g.add(mesh(box('alShelf', W - 0.1, 0.04, D - 0.1), A.darkWood, 0, 0.2, 0));
  // flasks, an alembic and a burner
  for (let i = 0; i < 6; i++) {
    const v = i % 3;
    const geo = cached('flask' + v, () => lathe(v === 0 ? [[0, 0], [0.08, 0], [0.09, 0.08], [0.03, 0.18], [0.025, 0.26], [0.035, 0.27]] : v === 1 ? [[0, 0], [0.05, 0], [0.05, 0.22], [0.02, 0.26]] : [[0, 0], [0.06, 0.02], [0.1, 0.1], [0.06, 0.17], [0.025, 0.2], [0.025, 0.28]], 10));
    g.add(mesh(geo, pick(M.glass), rnd(-W / 2 + 0.15, W / 2 - 0.15), H + 0.035, rnd(-0.25, 0.25)));
  }
  const ret = mesh(sph('retort', 0.13, 10, 8), pick(M.glass), 0.3, H + 0.3, -0.12);
  const tube = mesh(cyl('retTube', 0.015, 0.015, 0.5, 5), pick(M.glass), 0.55, H + 0.33, -0.12);
  tube.rotation.z = 1.1;
  g.add(ret, tube, mesh(cyl('burner', 0.06, 0.08, 0.12, 8), A.darkMetal, 0.3, H + 0.1, -0.12));
  g.add(mesh(cyl('retStand', 0.01, 0.01, 0.35, 4), A.darkMetal, 0.18, H + 0.2, -0.12));
  const f = makeFlame(0.4, 0x6ab0ff);
  f.position.set(0.3, H + 0.16, -0.12);
  g.add(f);
  const book = mesh(box('alBook', 0.32, 0.06, 0.24), pick(A.books), -0.5, H + 0.065, 0.15);
  book.rotation.y = 0.3;
  g.add(book);
  for (let i = 0; i < 4; i++) jar(g, rnd(-0.8, 0.8), 0.22, rnd(-0.2, 0.2), 0.8);
  g.userData.lightOffset = new THREE.Vector3(0.3, H + 0.5, 0);
  return g;
}

export function makeStraw() {
  const M = fmats();
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = mesh(sph('strawLump', 0.5, 8, 5), M.straw, rnd(-0.35, 0.35), 0.03, rnd(-0.3, 0.3));
    s.scale.set(rnd(0.6, 0.95), rnd(0.18, 0.28), rnd(0.5, 0.8));
    s.rotation.y = rnd(0, 3);
    g.add(s);
  }
  if (Math.random() < 0.6) {
    const bl = mesh(box('strawBlanket', 0.8, 0.03, 1.1), pick(M.blankets), rnd(-0.1, 0.1), 0.13, rnd(-0.1, 0.1));
    bl.rotation.set(rnd(-0.1, 0.1), rnd(-0.5, 0.5), rnd(-0.1, 0.1));
    g.add(bl);
  }
  return g;
}

export function makeDummy() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  g.add(mesh(box('dmFoot', 0.7, 0.08, 0.12), A.darkWood, 0, 0.04, 0), mesh(box('dmFoot2', 0.12, 0.08, 0.7), A.darkWood, 0, 0.04, 0));
  g.add(mesh(cyl('dmPost', 0.05, 0.06, 1.6, 6), A.darkWood, 0, 0.8, 0));
  const torso = mesh(cached('dmTorso', () => lathe([[0.1, 0], [0.22, 0.05], [0.25, 0.3], [0.24, 0.55], [0.16, 0.62], [0.06, 0.64]], 10)), M.burlap, 0, 0.85, 0);
  torso.scale.set(1, 1, 0.75);
  g.add(torso);
  g.add(mesh(box('dmArms', 1.1, 0.07, 0.07), A.darkWood, 0, 1.38, 0));
  const head = mesh(sph('dmHead', 0.16, 8, 6), M.burlap, 0, 1.68, 0);
  head.scale.set(1, 1.15, 1);
  g.add(head);
  const rope = mesh(cached('dmRope', () => new THREE.TorusGeometry(0.23, 0.02, 4, 12)), M.straw, 0, 1.15, 0);
  rope.rotation.x = Math.PI / 2;
  rope.scale.set(1, 0.75, 1);
  g.add(rope);
  return g;
}

export function makeBookPile() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  const stacks = 1 + Math.floor(Math.random() * 3);
  for (let s = 0; s < stacks; s++) {
    const sx = rnd(-0.25, 0.25), sz = rnd(-0.15, 0.15);
    let y = 0;
    const n = 2 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const h = rnd(0.05, 0.09);
      const b = mesh(cached('bookBox', () => new THREE.BoxGeometry(1, 1, 1)), pick(A.books), sx + rnd(-0.03, 0.03), y + h / 2, sz + rnd(-0.03, 0.03));
      b.scale.set(rnd(0.24, 0.34), h, rnd(0.18, 0.24));
      b.rotation.y = rnd(-0.4, 0.4);
      g.add(b);
      y += h;
    }
  }
  if (Math.random() < 0.5) {
    const p = mesh(box('scroll', 0.06, 0.06, 0.4), M.parchment, rnd(-0.3, 0.3), 0.03, rnd(0.15, 0.25));
    p.rotation.y = rnd(0, 3);
    g.add(p);
  }
  return g;
}

export function makeGlobe() {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = mesh(cyl('glLeg', 0.025, 0.02, 0.85, 5), A.darkWood, Math.cos(a) * 0.15, 0.42, Math.sin(a) * 0.15);
    l.rotation.z = Math.cos(a) * 0.15; l.rotation.x = -Math.sin(a) * 0.15;
    g.add(l);
  }
  g.add(mesh(cyl('glRingBase', 0.3, 0.3, 0.04, 16), A.darkWood, 0, 0.85, 0));
  const globe = new THREE.Group();
  globe.add(mesh(sph('globe', 0.26, 16, 12), M.sea));
  for (let i = 0; i < 5; i++) {
    const c = mesh(sph('continent', 0.1, 6, 5), M.land, 0, 0, 0);
    const a = rnd(0, 6.28), b = rnd(-0.8, 0.8);
    c.position.set(Math.cos(a) * Math.cos(b) * 0.2, Math.sin(b) * 0.2, Math.sin(a) * Math.cos(b) * 0.2);
    c.scale.set(rnd(0.6, 1.2), rnd(0.5, 1), rnd(0.6, 1.2));
    globe.add(c);
  }
  const mer = mesh(cached('meridian', () => new THREE.TorusGeometry(0.29, 0.012, 4, 24)), A.gold, 0, 0, 0);
  globe.add(mer);
  globe.rotation.set(0, rnd(0, 6), 0.4);
  globe.position.y = 1.12;
  g.add(globe);
  return g;
}

export function makeCoinPile() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const heap = mesh(cached('coinHeap', () => lathe([[0, 0], [0.6, 0], [0.45, 0.12], [0.25, 0.28], [0, 0.36]], 14)), A.gold, 0, 0, 0);
  heap.scale.set(1, rnd(0.7, 1.2), 1);
  g.add(heap);
  const coin = cyl('coinD', 0.06, 0.06, 0.012, 10);
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, 6.28), r = rnd(0.45, 0.85);
    const c = mesh(coin, A.gold, Math.cos(a) * r, 0.006, Math.sin(a) * r);
    c.rotation.set(rnd(-0.2, 0.2), 0, rnd(-0.2, 0.2));
    g.add(c);
  }
  g.add(mesh(cached('goblet', () => lathe([[0, 0], [0.05, 0], [0.01, 0.02], [0.01, 0.09], [0.045, 0.12], [0.05, 0.18]], 8)), A.gold, rnd(-0.3, 0.3), 0.15, 0.45));
  if (Math.random() < 0.5) {
    const crown = mesh(cached('crown', () => new THREE.CylinderGeometry(0.11, 0.1, 0.1, 8, 1, true)), A.gold, 0.1, 0.38, 0);
    crown.rotation.z = 0.3;
    g.add(crown);
  }
  return g;
}

export function makeSlimColumn(height, mats) {
  const g = new THREE.Group();
  g.add(mesh(cached('scShaft' + height.toFixed(2), () => new THREE.CylinderGeometry(0.2, 0.23, height - 0.5, 10)), mats.stone, 0, height / 2, 0));
  g.add(mesh(box('scBase', 0.6, 0.25, 0.6), mats.stone, 0, 0.125, 0));
  g.add(mesh(box('scCap', 0.6, 0.25, 0.6), mats.stone, 0, height - 0.125, 0));
  g.add(mesh(cyl('scCap2', 0.32, 0.22, 0.15, 10), mats.stone, 0, height - 0.32, 0));
  return g;
}

// A plain table dressed for the room: books (library), food (kitchen) or tools (workshop).
export function makeDressedTable(opts = {}) {
  const A = sharedAssets(), M = fmats();
  const g = new THREE.Group();
  g.add(mesh(box('dtTop', 1.8, 0.1, 0.95), A.wood, 0, 0.8, 0));
  for (const x of [-0.78, 0.78]) for (const z of [-0.38, 0.38]) g.add(mesh(box('dtLeg', 0.1, 0.78, 0.1), A.darkWood, x, 0.39, z));
  const H = 0.85;
  if (opts.books) {
    const p = makeBookPile();
    p.position.set(rnd(-0.5, 0.5), H, rnd(-0.1, 0.1));
    g.add(p);
    const open = mesh(box('openBook', 0.42, 0.03, 0.28), M.parchment, rnd(-0.3, 0.3), H + 0.015, 0.1);
    open.rotation.y = rnd(-0.3, 0.3);
    g.add(open);
  }
  if (opts.food) {
    const board = mesh(box('cutBoard', 0.45, 0.04, 0.3), A.wood, -0.4, H + 0.02, 0);
    const meat = mesh(sph('roast', 0.5), M.meat, -0.4, H + 0.1, 0);
    meat.scale.set(0.16, 0.1, 0.22);
    g.add(board, meat);
    for (let i = 0; i < 2; i++) { const b = mesh(sph('loaf', 0.5), M.bread, rnd(0.1, 0.6), H + 0.07, rnd(-0.25, 0.25)); b.scale.set(0.22, 0.11, 0.13); g.add(b); }
    g.add(mesh(cached('jug', () => lathe([[0, 0], [0.08, 0], [0.11, 0.1], [0.09, 0.22], [0.06, 0.26], [0.07, 0.3]], 10)), A.clay, 0.65, H - 0.05, 0.25));
    g.add(mesh(cyl('cheeseW', 0.12, 0.12, 0.09, 10), M.cheese, 0.3, H + 0.0, -0.3));
  }
  if (opts.tools) {
    const hammer = new THREE.Group();
    hammer.add(mesh(cyl('hamHandle', 0.018, 0.02, 0.4, 5), A.darkWood, 0, 0, 0), mesh(box('hamHead', 0.08, 0.08, 0.16), A.metal, 0, 0.2, 0));
    hammer.rotation.set(Math.PI / 2, 0, 0.8);
    hammer.position.set(-0.4, H + 0.03, 0);
    g.add(hammer);
    for (let i = 0; i < 3; i++) { const b = mesh(box('plank', 0.7, 0.04, 0.14), A.wood, rnd(-0.2, 0.5), H + 0.02 + i * 0.04, rnd(-0.2, 0.2)); b.rotation.y = rnd(-0.2, 0.2); g.add(b); }
    g.add(mesh(box('saw', 0.5, 0.12, 0.01), A.metal, 0.3, H + 0.12, 0.3));
  }
  if (!opts.books && !opts.food && !opts.tools) return null;
  const c = makeCandles(2);
  c.position.set(rnd(-0.6, 0.6), H, -0.3);
  c.scale.setScalar(0.65);
  g.add(c);
  return g;
}

// Two bookcases back to back, so a free-standing stack shows books from either side.
export function makeDoubleBookshelf() {
  const g = new THREE.Group();
  const a = makeBookshelf();
  a.position.z = 0.23;
  const b = makeBookshelf();
  b.position.z = -0.23;
  b.rotation.y = Math.PI;
  g.add(a, b);
  return g;
}
