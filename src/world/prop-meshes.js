// Procedural meshes for props, furniture, traps, shrines and interactables.
import * as THREE from 'three';
import { sharedAssets } from '../render/materials.js';
import { TILE } from './constants.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const geoCache = new Map();
const cached = (key, fn) => {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function lathe(points, segs = 14) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

// ---------- flames ----------

export function makeFlame(scale = 1, color = 0xff9a4a) {
  // A marker; the level harvests these into the instanced FlameSystem after placing props.
  const marker = new THREE.Object3D();
  marker.userData.flameSpec = { scale, color };
  return marker;
}

export function animateFlame(f, t) {
  const d = f.userData.flame;
  if (!d) return;
  const k = Math.sin(t * 13 + d.seed) * 0.12 + Math.sin(t * 29 + d.seed * 2) * 0.08;
  d.outer.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
}

// ---------- lights & architecture ----------

export function makeTorch(color) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const plate = mesh(cached('torchPlate', () => new THREE.BoxGeometry(0.16, 0.3, 0.04)), A.darkMetal, 0, 0, 0.02);
  const arm = mesh(cached('torchArm', () => new THREE.BoxGeometry(0.05, 0.05, 0.22)), A.darkMetal, 0, -0.05, 0.12);
  const stick = mesh(cached('torchStick', () => new THREE.CylinderGeometry(0.035, 0.025, 0.55, 6)), A.darkWood, 0, 0.06, 0.24);
  stick.rotation.x = 0.35;
  const cup = mesh(cached('torchCup', () => new THREE.CylinderGeometry(0.07, 0.045, 0.1, 8, 1, true)), A.darkMetal, 0, 0.3, 0.33);
  cup.rotation.x = 0.35;
  const flame = makeFlame(1.15, color);
  flame.position.set(0, 0.34, 0.35);
  g.add(plate, arm, stick, cup, flame);
  g.userData.flames = [flame];
  g.userData.lightOffset = new THREE.Vector3(0, 0.55, 0.45);
  return g;
}

export function makeCandles(count = 4, color = 0xffb060) {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.userData.flames = [];
  for (let i = 0; i < count; i++) {
    const h = rnd(0.12, 0.38);
    const r = rnd(0.03, 0.05);
    const x = rnd(-0.25, 0.25), z = rnd(-0.25, 0.25);
    const c = mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8), A.candle, x, h / 2, z);
    const drip = mesh(cached('drip', () => new THREE.SphereGeometry(1, 6, 4)), A.candle, x + r * 0.7, h * 0.7, z);
    drip.scale.set(0.015, 0.03, 0.015);
    const f = makeFlame(0.35, color);
    f.position.set(x, h + 0.01, z);
    g.add(c, drip, f);
    g.userData.flames.push(f);
  }
  g.userData.lightOffset = new THREE.Vector3(0, 0.5, 0);
  return g;
}

export function makeBrazier(color) {
  const A = sharedAssets();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(cached('brLeg', () => new THREE.CylinderGeometry(0.035, 0.03, 1.0, 6)), A.darkMetal, Math.cos(a) * 0.25, 0.48, Math.sin(a) * 0.25);
    leg.rotation.z = Math.cos(a) * 0.25;
    leg.rotation.x = -Math.sin(a) * 0.25;
    g.add(leg);
  }
  const bowl = mesh(cached('brBowl', () => lathe([[0.05, 0], [0.35, 0.05], [0.48, 0.22], [0.5, 0.28], [0.45, 0.27], [0.3, 0.12], [0, 0.1]], 16)), A.darkMetal, 0, 0.85, 0);
  g.add(bowl);
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4010, emissiveIntensity: 1.2, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const c = mesh(cached('coal', () => new THREE.IcosahedronGeometry(0.09, 0)), coalMat, rnd(-0.25, 0.25), 1.02, rnd(-0.25, 0.25));
    c.rotation.set(rnd(0, 6), rnd(0, 6), 0);
    g.add(c);
  }
  g.userData.flames = [];
  for (let i = 0; i < 3; i++) {
    const f = makeFlame(rnd(1.6, 2.2), color);
    f.position.set(rnd(-0.15, 0.15), 1.0, rnd(-0.15, 0.15));
    g.add(f);
    g.userData.flames.push(f);
  }
  g.userData.lightOffset = new THREE.Vector3(0, 1.6, 0);
  return g;
}

export function makeColumn(height, mats) {
  const g = new THREE.Group();
  const shaft = mesh(cached('colShaft' + height.toFixed(2), () => new THREE.CylinderGeometry(0.36, 0.4, height - 0.7, 12)), mats.stone, 0, height / 2, 0);
  const base = mesh(cached('colBase', () => new THREE.BoxGeometry(1.0, 0.35, 1.0)), mats.stone, 0, 0.175, 0);
  const base2 = mesh(cached('colBase2', () => new THREE.CylinderGeometry(0.5, 0.52, 0.12, 12)), mats.stone, 0, 0.41, 0);
  const cap = mesh(cached('colCap', () => new THREE.BoxGeometry(0.95, 0.3, 0.95)), mats.stone, 0, height - 0.15, 0);
  const cap2 = mesh(cached('colCap2', () => new THREE.CylinderGeometry(0.52, 0.42, 0.2, 12)), mats.stone, 0, height - 0.4, 0);
  g.add(shaft, base, base2, cap, cap2);
  return g;
}

// ---------- breakables ----------

export function makeBarrel(explosive = false) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const body = mesh(cached('barrel', () => lathe([[0, -0.5], [0.34, -0.5], [0.4, -0.25], [0.42, 0], [0.4, 0.25], [0.34, 0.5], [0, 0.5]], 14)), explosive ? A.redBarrel : A.wood);
  g.add(body);
  for (const y of [-0.33, 0.33]) {
    const band = mesh(cached('band', () => new THREE.TorusGeometry(0.405, 0.02, 4, 18)), A.darkMetal, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 1, 1.4);
    g.add(band);
  }
  const lid = mesh(cached('lid', () => new THREE.CircleGeometry(0.33, 14)), A.darkWood, 0, 0.495, 0);
  lid.rotation.x = -Math.PI / 2;
  g.add(lid);
  if (explosive) {
    const mark = mesh(cached('xmark', () => new THREE.PlaneGeometry(0.28, 0.28)), new THREE.MeshBasicMaterial({ color: 0xffcc33, map: skullTexture(), transparent: true }), 0, 0, 0.425);
    g.add(mark);
    const fuse = mesh(cached('fuse', () => new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4)), A.darkMetal, 0.12, 0.58, 0);
    fuse.rotation.z = 0.4;
    g.add(fuse);
  }
  return g;
}

let _skull = null;
function skullTexture() {
  if (_skull) return _skull;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(32, 26, 18, 0, Math.PI * 2); x.fill();
  x.fillRect(22, 36, 20, 14);
  x.fillStyle = '#000';
  x.beginPath(); x.arc(25, 26, 5, 0, Math.PI * 2); x.arc(39, 26, 5, 0, Math.PI * 2); x.fill();
  x.fillRect(26, 44, 3, 6); x.fillRect(31, 44, 3, 6); x.fillRect(36, 44, 3, 6);
  _skull = new THREE.CanvasTexture(c);
  _skull.colorSpace = THREE.SRGBColorSpace;
  return _skull;
}

export function makeCrate(size = 0.8) {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('crate' + size, () => new THREE.BoxGeometry(size, size, size)), A.wood));
  const s = size / 2, t = 0.06;
  const edgeH = cached('edgeH' + size, () => new THREE.BoxGeometry(size + 0.02, t, t));
  for (const y of [-s, s]) for (const z of [-s, s]) g.add(mesh(edgeH, A.darkWood, 0, y, z));
  for (const y of [-s, s]) for (const x of [-s, s]) { const m = mesh(edgeH, A.darkWood, x, y, 0); m.rotation.y = Math.PI / 2; g.add(m); }
  for (const x of [-s, s]) for (const z of [-s, s]) { const m = mesh(edgeH, A.darkWood, x, 0, z); m.rotation.z = Math.PI / 2; g.add(m); }
  // diagonal brace
  const diag = mesh(cached('diag' + size, () => new THREE.BoxGeometry(size * 1.3, t, 0.02)), A.darkWood, 0, 0, s + 0.01);
  diag.rotation.z = Math.PI / 4;
  g.add(diag);
  return g;
}

export function makePot(variant = Math.floor(Math.random() * 3)) {
  const A = sharedAssets();
  const profiles = [
    [[0, 0], [0.16, 0], [0.24, 0.12], [0.26, 0.28], [0.18, 0.46], [0.11, 0.52], [0.13, 0.58], [0.11, 0.6]],
    [[0, 0], [0.12, 0], [0.2, 0.08], [0.22, 0.2], [0.14, 0.32], [0.12, 0.36], [0.15, 0.4]],
    [[0, 0], [0.14, 0], [0.18, 0.2], [0.17, 0.5], [0.12, 0.66], [0.07, 0.7], [0.09, 0.78], [0.08, 0.8]],
  ];
  const p = profiles[variant % profiles.length];
  const g = new THREE.Group();
  const mat = variant === 1 ? A.clayDark : A.clay;
  const m = mesh(cached('pot' + variant, () => { const geo = lathe(p, 12); geo.translate(0, -p[p.length - 1][1] / 2, 0); return geo; }), mat);
  g.add(m);
  g.userData.height = p[p.length - 1][1];
  g.userData.radius = Math.max(...p.map((q) => q[0]));
  return g;
}

export function makeTable() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('tableTop', () => new THREE.BoxGeometry(1.8, 0.1, 0.95)), A.wood, 0, 0.8, 0));
  const leg = cached('tableLeg', () => new THREE.BoxGeometry(0.1, 0.78, 0.1));
  for (const x of [-0.78, 0.78]) for (const z of [-0.38, 0.38]) g.add(mesh(leg, A.darkWood, x, 0.39, z));
  // clutter
  const cup = mesh(cached('cup', () => new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8)), A.darkMetal, rnd(-0.6, 0.6), 0.91, rnd(-0.2, 0.2));
  const plate = mesh(cached('plate', () => new THREE.CylinderGeometry(0.14, 0.12, 0.02, 12)), A.clayDark, rnd(-0.6, 0.6), 0.86, rnd(-0.2, 0.2));
  const book = mesh(cached('book', () => new THREE.BoxGeometry(0.28, 0.06, 0.2)), A.books[0], rnd(-0.5, 0.5), 0.88, rnd(-0.2, 0.2));
  book.rotation.y = rnd(0, 3);
  g.add(cup, plate, book);
  const candles = makeCandles(2);
  candles.position.set(rnd(-0.4, 0.4), 0.85, rnd(-0.15, 0.15));
  candles.scale.setScalar(0.7);
  g.add(candles);
  g.userData.flames = candles.userData.flames;
  return g;
}

export function makeChair() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('seat', () => new THREE.BoxGeometry(0.48, 0.06, 0.48)), A.wood, 0, 0, 0));
  const leg = cached('chairLeg', () => new THREE.BoxGeometry(0.05, 0.48, 0.05));
  for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) g.add(mesh(leg, A.darkWood, x, -0.24, z));
  const back = cached('chairBack', () => new THREE.BoxGeometry(0.05, 0.55, 0.05));
  for (const x of [-0.2, 0.2]) g.add(mesh(back, A.darkWood, x, 0.3, -0.21));
  g.add(mesh(cached('chairRail', () => new THREE.BoxGeometry(0.45, 0.12, 0.04)), A.wood, 0, 0.5, -0.21));
  return g;
}

export function makeBookshelf() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const w = 2.0, h = 2.5, d = 0.42;
  const side = cached('bsSide', () => new THREE.BoxGeometry(0.08, h, d));
  g.add(mesh(side, A.darkWood, -w / 2, h / 2, 0), mesh(side, A.darkWood, w / 2, h / 2, 0));
  g.add(mesh(cached('bsBack', () => new THREE.BoxGeometry(w, h, 0.04)), A.darkWood, 0, h / 2, -d / 2));
  const shelf = cached('bsShelf', () => new THREE.BoxGeometry(w, 0.06, d));
  const rows = 4;
  for (let r = 0; r <= rows; r++) g.add(mesh(shelf, A.darkWood, 0, 0.05 + (r * (h - 0.1)) / rows, 0));
  const bookGeo = cached('bookBox', () => new THREE.BoxGeometry(1, 1, 1));
  for (let r = 0; r < rows; r++) {
    let x = -w / 2 + 0.08;
    const y0 = 0.08 + (r * (h - 0.1)) / rows;
    while (x < w / 2 - 0.15) {
      const bw = rnd(0.05, 0.11), bh = rnd(0.32, 0.5);
      if (Math.random() < 0.12) { x += rnd(0.1, 0.3); continue; }
      const b = mesh(bookGeo, A.books[Math.floor(Math.random() * A.books.length)], x + bw / 2, y0 + bh / 2, rnd(-0.02, 0.04));
      b.scale.set(bw, bh, rnd(0.26, 0.34));
      if (Math.random() < 0.1) b.rotation.z = rnd(-0.3, 0.3);
      g.add(b);
      x += bw + 0.005;
    }
  }
  return g;
}

export function makeSarcophagus(mats) {
  const g = new THREE.Group();
  g.add(mesh(cached('sarcBody', () => new THREE.BoxGeometry(1.0, 0.85, 2.2)), mats.stone, 0, 0.425, 0));
  const lid = mesh(cached('sarcLid', () => new THREE.BoxGeometry(1.12, 0.16, 2.32)), mats.stone, 0, 0.93, 0);
  lid.rotation.y = rnd(-0.06, 0.06);
  g.add(lid);
  const effigy = mesh(cached('effigy', () => { const geo = new THREE.CapsuleGeometry(0.22, 1.3, 4, 8); geo.rotateX(Math.PI / 2); return geo; }), mats.stone, 0, 1.08, 0);
  effigy.scale.set(1, 0.45, 1);
  const head = mesh(cached('effHead', () => new THREE.SphereGeometry(0.16, 10, 8)), mats.stone, 0, 1.1, -0.85);
  g.add(effigy, head);
  return g;
}

export function makeStatue(mats) {
  const g = new THREE.Group();
  g.add(mesh(cached('statPed', () => new THREE.BoxGeometry(0.9, 0.6, 0.9)), mats.stone, 0, 0.3, 0));
  const robe = mesh(cached('statRobe', () => new THREE.CylinderGeometry(0.22, 0.42, 1.5, 10)), mats.stone, 0, 1.35, 0);
  const chest = mesh(cached('statChest', () => new THREE.BoxGeometry(0.5, 0.45, 0.3)), mats.stone, 0, 2.2, 0);
  const head = mesh(cached('statHead', () => new THREE.SphereGeometry(0.17, 10, 8)), mats.stone, 0, 2.6, 0.02);
  const hood = mesh(cached('statHood', () => new THREE.ConeGeometry(0.24, 0.45, 10)), mats.stone, 0, 2.72, -0.02);
  const sword = mesh(cached('statSword', () => new THREE.BoxGeometry(0.08, 1.4, 0.03)), mats.stone, 0, 1.55, 0.3);
  const guard = mesh(cached('statGuard', () => new THREE.BoxGeometry(0.4, 0.06, 0.06)), mats.stone, 0, 2.05, 0.3);
  g.add(robe, chest, head, hood, sword, guard);
  return g;
}

export function makeWeaponRack() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('rackBase', () => new THREE.BoxGeometry(1.4, 0.08, 0.35)), A.darkWood, 0, 0.04, 0));
  g.add(mesh(cached('rackTop', () => new THREE.BoxGeometry(1.4, 0.08, 0.12)), A.darkWood, 0, 1.4, -0.08));
  const post = cached('rackPost', () => new THREE.BoxGeometry(0.08, 1.45, 0.08));
  g.add(mesh(post, A.darkWood, -0.66, 0.72, -0.08), mesh(post, A.darkWood, 0.66, 0.72, -0.08));
  for (let i = 0; i < 3; i++) {
    const x = -0.4 + i * 0.4;
    if (i === 1) {
      const shaft = mesh(cached('rackSpear', () => new THREE.CylinderGeometry(0.02, 0.02, 1.7, 5)), A.darkWood, x, 0.9, 0);
      const tip = mesh(cached('rackTip', () => new THREE.ConeGeometry(0.05, 0.25, 4)), A.metal, x, 1.85, 0);
      g.add(shaft, tip);
    } else {
      const blade = mesh(cached('rackBlade', () => new THREE.BoxGeometry(0.07, 1.0, 0.015)), A.metal, x, 0.72, 0.02);
      const guard = mesh(cached('rackGuard', () => new THREE.BoxGeometry(0.25, 0.04, 0.04)), A.darkMetal, x, 1.22, 0.02);
      const grip = mesh(cached('rackGrip', () => new THREE.CylinderGeometry(0.02, 0.02, 0.2, 5)), A.darkWood, x, 1.34, 0.02);
      g.add(blade, guard, grip);
    }
  }
  return g;
}

function sigilTexture(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 64, 128);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 64; i += 4) x.fillRect(i, 0, 1, 128);
  x.strokeStyle = '#d9b45a';
  x.lineWidth = 3;
  x.strokeRect(5, 5, 54, 118);
  x.fillStyle = '#d9b45a';
  const kind = Math.floor(Math.random() * 3);
  x.beginPath();
  if (kind === 0) { x.moveTo(32, 30); x.lineTo(50, 60); x.lineTo(32, 90); x.lineTo(14, 60); x.closePath(); x.fill(); }
  else if (kind === 1) { x.arc(32, 58, 14, 0, Math.PI * 2); x.fill(); x.fillRect(29, 72, 6, 30); }
  else { x.fillRect(28, 28, 8, 64); x.fillRect(16, 46, 32, 8); }
  // ragged bottom
  x.clearRect(0, 116, 64, 12);
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(0, 116); x.lineTo(32, 127); x.lineTo(64, 116); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBanner() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const colors = ['#7a1f1f', '#1f3a7a', '#2a5a2a', '#5a2a6a', '#6a4a1a'];
  const geo = new THREE.PlaneGeometry(0.9, 2.0, 1, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) + 1) * 2.5) * 0.04);
  geo.computeVertexNormals();
  const cloth = mesh(geo, new THREE.MeshStandardMaterial({ map: sigilTexture(colors[Math.floor(Math.random() * colors.length)]), roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }), 0, 2.2, 0.06);
  const rod = mesh(cached('bannerRod', () => new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6)), A.darkMetal, 0, 3.22, 0.06);
  rod.rotation.z = Math.PI / 2;
  g.add(cloth, rod);
  g.userData.cloth = cloth;
  return g;
}

export function makeChains(length = 2) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const link = cached('link', () => new THREE.TorusGeometry(0.05, 0.014, 4, 8));
  const n = Math.floor(length / 0.08);
  for (let i = 0; i < n; i++) {
    const l = mesh(link, A.darkMetal, 0, -i * 0.08, 0);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
  }
  const hook = mesh(cached('hook', () => new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI * 1.4)), A.darkMetal, 0, -n * 0.08 - 0.08, 0);
  g.add(hook);
  return g;
}

let _web = null;
function webTexture() {
  if (_web) return _web;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * (Math.PI / 2);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 128, Math.sin(a) * 128); x.stroke();
  }
  for (let r = 14; r < 128; r += 14) {
    x.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      const rr = r + Math.sin(i * 3) * 3;
      if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else x.quadraticCurveTo(Math.cos(a - 0.1) * (rr - 5), Math.sin(a - 0.1) * (rr - 5), Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.stroke();
  }
  _web = new THREE.CanvasTexture(c);
  return _web;
}

export function makeCobweb() {
  const m = new THREE.Mesh(cached('web', () => new THREE.PlaneGeometry(1.4, 1.4)), new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  const g = new THREE.Group();
  m.position.set(0.7, -0.7, 0);
  m.rotation.z = Math.PI;
  const p = new THREE.Group();
  p.add(m);
  p.rotation.x = 0.6;
  g.add(p);
  return g;
}

export function makeBones() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const skull = mesh(cached('skullS', () => new THREE.SphereGeometry(0.11, 10, 8)), A.bone, 0, 0.1, 0);
  skull.scale.set(1, 0.9, 1.15);
  const jaw = mesh(cached('jaw', () => new THREE.BoxGeometry(0.12, 0.04, 0.1)), A.bone, 0, 0.03, 0.06);
  const eye = cached('socket', () => new THREE.SphereGeometry(0.03, 6, 4));
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
  g.add(skull, jaw, mesh(eye, dark, -0.04, 0.11, 0.1), mesh(eye, dark, 0.04, 0.11, 0.1));
  for (let i = 0; i < 5; i++) {
    const b = mesh(cached('boneC', () => new THREE.CylinderGeometry(0.022, 0.022, 0.38, 5)), A.bone, rnd(-0.4, 0.4), 0.03, rnd(-0.4, 0.4));
    b.rotation.set(Math.PI / 2, 0, rnd(0, 6));
    g.add(b);
  }
  g.rotation.y = rnd(0, 6);
  return g;
}

export function makeCage() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const bar = cached('cageBar', () => new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(mesh(bar, A.darkMetal, Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5));
  }
  for (const y of [0.02, 1.8]) {
    const ring = mesh(cached('cageRing', () => new THREE.TorusGeometry(0.5, 0.03, 4, 16)), A.darkMetal, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const top = mesh(cached('cageTop', () => new THREE.ConeGeometry(0.55, 0.4, 10, 1, true)), A.darkMetal, 0, 2.0, 0);
  g.add(top);
  const bones = makeBones();
  bones.position.y = 0.02;
  g.add(bones);
  return g;
}

function rugTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const x = c.getContext('2d');
  const cols = [['#5a1a1a', '#c8a050'], ['#1a2a4a', '#b09060'], ['#2a3a1a', '#c0a060'], ['#3a1a3a', '#c0904a']];
  const [bg, fg] = cols[Math.floor(Math.random() * cols.length)];
  x.fillStyle = bg;
  x.fillRect(0, 0, 128, 256);
  x.strokeStyle = fg;
  x.lineWidth = 6;
  x.strokeRect(8, 8, 112, 240);
  x.lineWidth = 2;
  x.strokeRect(18, 18, 92, 220);
  x.fillStyle = fg;
  for (let i = 0; i < 4; i++) {
    const cy = 50 + i * 52;
    x.beginPath(); x.moveTo(64, cy - 20); x.lineTo(84, cy); x.lineTo(64, cy + 20); x.lineTo(44, cy); x.closePath(); x.fill();
  }
  for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeRug(w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

// ---------- interactables ----------

export function makeChest(tier = 0) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const trim = tier >= 2 ? A.gold : A.darkMetal;
  const wood = tier >= 3 ? new THREE.MeshStandardMaterial({ color: 0x3a1a4a, roughness: 0.5, metalness: 0.2 }) : A.wood;
  const w = 1.1, h = 0.55, d = 0.7;
  g.add(mesh(cached('chestBase', () => new THREE.BoxGeometry(w, h, d)), wood, 0, h / 2, 0));
  const band = cached('chestBand', () => new THREE.BoxGeometry(0.08, h + 0.02, d + 0.02));
  for (const x of [-0.42, 0.42]) g.add(mesh(band, trim, x, h / 2, 0));
  const lid = new THREE.Group();
  lid.position.set(0, h, -d / 2);
  const lidMesh = mesh(cached('chestLid', () => { const geo = new THREE.CylinderGeometry(d / 2, d / 2, w, 12, 1, false, 0, Math.PI); geo.rotateZ(Math.PI / 2); geo.rotateX(Math.PI / 2); return geo; }), wood, 0, 0, d / 2);
  lid.add(lidMesh);
  const lband = cached('chestLBand', () => { const geo = new THREE.CylinderGeometry(d / 2 + 0.012, d / 2 + 0.012, 0.08, 12, 1, true, 0, Math.PI); geo.rotateZ(Math.PI / 2); geo.rotateX(Math.PI / 2); return geo; });
  for (const x of [-0.42, 0.42]) lid.add(mesh(lband, trim, x, 0, d / 2));
  const lock = mesh(cached('chestLock', () => new THREE.BoxGeometry(0.14, 0.18, 0.05)), trim, 0, h - 0.04, d / 2 + 0.02);
  g.add(lid, lock);
  if (tier >= 1) {
    // inner glow revealed when opened
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color: [0xffffff, 0x66aaff, 0xcc66ff, 0xffaa22][tier], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    glow.position.y = 0.7;
    g.add(glow);
    g.userData.glow = glow;
  }
  g.userData.lid = lid;
  return g;
}

export function makeDoor() {
  const A = sharedAssets();
  const pivot = new THREE.Group();
  const w = 1.66, h = 2.95, t = 0.12;
  const panel = mesh(cached('doorPanel', () => new THREE.BoxGeometry(w, h, t)), A.wood, w / 2, h / 2, 0);
  pivot.add(panel);
  const band = cached('doorBand', () => new THREE.BoxGeometry(w * 0.85, 0.09, t + 0.03));
  for (const y of [0.5, 1.5, 2.5]) pivot.add(mesh(band, A.darkMetal, w * 0.45, y, 0));
  const ring = mesh(cached('doorRing', () => new THREE.TorusGeometry(0.08, 0.015, 4, 10)), A.darkMetal, w - 0.25, 1.2, 0.09);
  const ring2 = ring.clone();
  ring2.position.z = -0.09;
  pivot.add(ring, ring2);
  pivot.userData.panel = panel;
  return pivot;
}

export function makeLockedDoor() {
  const A = sharedAssets();
  const pivot = makeDoor();
  pivot.children[0].material = A.darkWood;
  const lock = mesh(cached('lockBox', () => new THREE.BoxGeometry(0.25, 0.3, 0.2)), A.gold, 1.4, 1.3, 0);
  const keyhole = mesh(cached('keyhole', () => new THREE.BoxGeometry(0.04, 0.1, 0.22)), new THREE.MeshBasicMaterial({ color: 0x000000 }), 1.4, 1.28, 0);
  pivot.add(lock, keyhole);
  return pivot;
}

export function makeGate(height = 3.4) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const bar = cached('gateBar' + height, () => new THREE.CylinderGeometry(0.035, 0.035, height, 6));
  for (let i = 0; i < 9; i++) {
    const b = mesh(bar, A.darkMetal, -TILE / 2 + 0.15 + i * ((TILE - 0.3) / 8), height / 2, 0);
    g.add(b);
    const tip = mesh(cached('gateTip', () => new THREE.ConeGeometry(0.06, 0.18, 4)), A.darkMetal, b.position.x, -0.05, 0);
    tip.rotation.x = Math.PI;
    g.add(tip);
  }
  const hbar = cached('gateH', () => new THREE.BoxGeometry(TILE, 0.08, 0.08));
  for (const y of [0.6, 1.6, 2.6]) g.add(mesh(hbar, A.darkMetal, 0, y, 0));
  return g;
}

export function makeSecretWall(mats, height) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(TILE, height, TILE), mats.cracked);
  m.position.y = height / 2;
  const uv = m.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * (height / TILE));
  return m;
}

export function makeSpikeTrap() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const plate = mesh(cached('spikePlate', () => new THREE.BoxGeometry(TILE * 0.82, 0.05, TILE * 0.82)), A.rust, 0, 0.02, 0);
  g.add(plate);
  const holes = new THREE.MeshBasicMaterial({ color: 0x050403 });
  const spikes = new THREE.Group();
  const cone = cached('trapSpike', () => { const geo = new THREE.ConeGeometry(0.07, 0.75, 5); geo.translate(0, 0.375, 0); return geo; });
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    const px = x * 0.38, pz = z * 0.38;
    g.add(mesh(cached('hole', () => new THREE.CircleGeometry(0.07, 6).rotateX(-Math.PI / 2)), holes, px, 0.051, pz));
    spikes.add(mesh(cone, A.metal, px, 0, pz));
  }
  spikes.position.y = -0.8;
  g.add(spikes);
  g.userData.spikes = spikes;
  return g;
}

export function makePressurePlate(mats) {
  const m = mesh(cached('pplate', () => new THREE.BoxGeometry(TILE * 0.6, 0.06, TILE * 0.6)), mats.stone, 0, 0.02, 0);
  return m;
}

export function makeBlade() {
  const A = sharedAssets();
  const pivot = new THREE.Group();
  const arm = mesh(cached('bladeArm', () => new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6)), A.darkMetal, 0, -1.15, 0);
  pivot.add(arm);
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, 0);
  shape.quadraticCurveTo(0, -0.75, 0.7, 0);
  shape.quadraticCurveTo(0, -0.35, -0.7, 0);
  const blade = mesh(cached('bladeGeo', () => new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.02, bevelSegments: 1 })), A.metal, 0, -2.2, -0.015);
  pivot.add(blade);
  pivot.userData.blade = blade;
  return pivot;
}

export function makeFlameVent() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('vent', () => new THREE.CylinderGeometry(0.45, 0.5, 0.08, 10)), A.darkMetal, 0, 0.04, 0));
  const glow = mesh(cached('ventGlow', () => new THREE.CircleGeometry(0.32, 10).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0xff5010 }), 0, 0.085, 0);
  g.add(glow);
  const bar = cached('ventBar', () => new THREE.BoxGeometry(0.7, 0.03, 0.05));
  for (let i = -2; i <= 2; i++) g.add(mesh(bar, A.darkMetal, 0, 0.1, i * 0.12));
  g.userData.glow = glow;
  return g;
}

export function makeDartShooter() {
  const g = new THREE.Group();
  g.add(mesh(cached('dartSlot', () => new THREE.BoxGeometry(0.3, 0.12, 0.05)), new THREE.MeshBasicMaterial({ color: 0x050403 }), 0, 0, 0));
  return g;
}

export function makePedestal(mats) {
  const g = new THREE.Group();
  g.add(mesh(cached('pedBase', () => new THREE.BoxGeometry(0.8, 0.2, 0.8)), mats.stone, 0, 0.1, 0));
  g.add(mesh(cached('pedShaft', () => new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8)), mats.stone, 0, 0.6, 0));
  g.add(mesh(cached('pedTop', () => new THREE.BoxGeometry(0.65, 0.12, 0.65)), mats.stone, 0, 1.06, 0));
  return g;
}

export function makeRuneCircle(color, radius = 1.6) {
  const A = sharedAssets();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: A.tex.rune, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

export function makeShrine(kind, mats) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const colors = { blood: 0xff2030, fortune: 0xffcc44, fountain: 0x44ccff, anvil: 0xff8833, gamble: 0x55ff99, challenge: 0xbb55ff };
  const color = colors[kind] || 0xffffff;
  const rune = makeRuneCircle(color, 1.7);
  g.add(rune);
  g.userData.rune = rune;
  g.userData.color = color;
  if (kind === 'blood') {
    g.add(mesh(cached('altar', () => new THREE.BoxGeometry(1.4, 0.9, 0.8)), mats.stone, 0, 0.45, 0));
    const basin = mesh(cached('basin', () => new THREE.CylinderGeometry(0.35, 0.3, 0.1, 14)), new THREE.MeshStandardMaterial({ color: 0x6a0008, roughness: 0.1, emissive: 0x300004 }), 0, 0.92, 0);
    g.add(basin);
    const c = makeCandles(3, 0xff6060); c.position.set(-0.5, 0.9, 0.2); c.scale.setScalar(0.6); g.add(c);
    const c2 = makeCandles(3, 0xff6060); c2.position.set(0.5, 0.9, -0.1); c2.scale.setScalar(0.6); g.add(c2);
    g.userData.flames = [...c.userData.flames, ...c2.userData.flames];
  } else if (kind === 'fortune') {
    const s = makeStatue(mats);
    g.add(s);
    const orb = mesh(cached('orb', () => new THREE.SphereGeometry(0.22, 16, 12)), new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffaa22, emissiveIntensity: 2.5, roughness: 0.2 }), 0, 3.1, 0.1);
    g.add(orb);
    g.userData.orb = orb;
  } else if (kind === 'fountain') {
    g.add(mesh(cached('fBasin', () => lathe([[0, 0], [1.1, 0], [1.15, 0.5], [1.0, 0.55], [0.95, 0.15], [0, 0.15]], 20)), mats.stone, 0, 0, 0));
    const water = mesh(cached('fWater', () => new THREE.CircleGeometry(0.97, 20).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ color: 0x2a8aaa, emissive: 0x0a4a6a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }), 0, 0.42, 0);
    g.add(water);
    g.add(mesh(cached('fSpout', () => new THREE.CylinderGeometry(0.12, 0.2, 1.4, 8)), mats.stone, 0, 0.7, 0));
    g.add(mesh(cached('fTop', () => lathe([[0, 0], [0.4, 0.05], [0.45, 0.2], [0, 0.15]], 12)), mats.stone, 0, 1.4, 0));
    g.userData.water = water;
  } else if (kind === 'anvil') {
    g.add(mesh(cached('anvilBase', () => new THREE.BoxGeometry(0.5, 0.6, 0.4)), A.darkWood, 0, 0.3, 0));
    const top = mesh(cached('anvilTop', () => new THREE.BoxGeometry(0.9, 0.25, 0.32)), A.darkMetal, 0, 0.72, 0);
    const horn = mesh(cached('anvilHorn', () => new THREE.ConeGeometry(0.13, 0.4, 8)), A.darkMetal, 0.62, 0.74, 0);
    horn.rotation.z = -Math.PI / 2;
    g.add(top, horn);
    const forge = makeBrazier(0xff7030);
    forge.position.set(-1.3, 0, 0.4);
    g.add(forge);
    g.userData.flames = forge.userData.flames;
  } else if (kind === 'gamble') {
    g.add(mesh(cached('gPed', () => new THREE.CylinderGeometry(0.45, 0.55, 1.0, 8)), mats.stone, 0, 0.5, 0));
    const idol = mesh(cached('idol', () => new THREE.CapsuleGeometry(0.22, 0.35, 4, 10)), A.gold, 0, 1.45, 0);
    const ihead = mesh(cached('idolHead', () => new THREE.SphereGeometry(0.2, 12, 10)), A.gold, 0, 1.95, 0);
    g.add(idol, ihead);
    const eye = new THREE.MeshBasicMaterial({ color: 0x66ff99 });
    g.add(mesh(cached('idolEye', () => new THREE.SphereGeometry(0.035, 6, 4)), eye, -0.07, 1.98, 0.17), mesh(cached('idolEye', () => new THREE.SphereGeometry(0.035, 6, 4)), eye, 0.07, 1.98, 0.17));
  } else {
    // challenge obelisk
    const ob = mesh(cached('obelisk', () => new THREE.CylinderGeometry(0.25, 0.5, 3.0, 4)), new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.3, metalness: 0.3 }), 0, 1.5, 0);
    ob.rotation.y = Math.PI / 4;
    g.add(ob);
    const gem = mesh(cached('obGem', () => new THREE.OctahedronGeometry(0.2)), new THREE.MeshStandardMaterial({ color: 0xbb55ff, emissive: 0xaa33ff, emissiveIntensity: 3 }), 0, 3.4, 0);
    g.add(gem);
    g.userData.orb = gem;
  }
  return g;
}

export function makeMerchant() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.9 });
  const robe = mesh(cached('mRobe', () => new THREE.CylinderGeometry(0.28, 0.6, 1.5, 10)), robeMat, 0, 0.75, 0);
  const torso = mesh(cached('mTorso', () => new THREE.SphereGeometry(0.36, 10, 8)), robeMat, 0, 1.55, 0);
  torso.scale.set(1, 0.9, 0.85);
  const hood = mesh(cached('mHood', () => new THREE.ConeGeometry(0.3, 0.65, 10)), robeMat, 0, 2.05, -0.03);
  const face = mesh(cached('mFace', () => new THREE.SphereGeometry(0.19, 10, 8)), new THREE.MeshBasicMaterial({ color: 0x050308 }), 0, 1.92, 0.08);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc55 });
  const eyeL = mesh(cached('mEye', () => new THREE.SphereGeometry(0.025, 6, 4)), eyeMat, -0.06, 1.95, 0.25);
  const eyeR = mesh(cached('mEye', () => new THREE.SphereGeometry(0.025, 6, 4)), eyeMat, 0.06, 1.95, 0.25);
  const pack = mesh(cached('mPack', () => new THREE.BoxGeometry(0.7, 0.8, 0.45)), A.darkWood, 0, 1.5, -0.45);
  const lantern = new THREE.Group();
  lantern.add(mesh(cached('lantern', () => new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6)), A.darkMetal));
  const lf = makeFlame(0.6, 0xffcc66);
  lf.position.y = -0.06;
  lantern.add(lf);
  lantern.position.set(0.5, 1.3, 0.3);
  g.add(robe, torso, hood, face, eyeL, eyeR, pack, lantern);
  g.userData.flames = [lf];
  g.userData.torso = torso;
  g.userData.head = [hood, face, eyeL, eyeR];
  return g;
}

export function makeExitPortal() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const ring = makeRuneCircle(0x88aaff, 2.0);
  g.add(ring);
  const hole = mesh(cached('portalHole', () => new THREE.CircleGeometry(1.2, 32).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.02, 0);
  g.add(hole);
  const beam = mesh(cached('beam', () => new THREE.CylinderGeometry(1.1, 1.2, 6, 24, 1, true)), new THREE.MeshBasicMaterial({ color: 0x6688ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: A.tex.softGlow }), 0, 3, 0);
  g.add(beam);
  g.userData.ring = ring;
  g.userData.beam = beam;
  return g;
}

// ---------- small loot meshes ----------

export function makeCoin() {
  const A = sharedAssets();
  return mesh(cached('coin', () => new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10)), A.gold);
}

export function makeKey() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const bow = mesh(cached('keyBow', () => new THREE.TorusGeometry(0.07, 0.02, 6, 12)), A.gold, 0, 0.12, 0);
  const shaft = mesh(cached('keyShaft', () => new THREE.CylinderGeometry(0.018, 0.018, 0.25, 6)), A.gold, 0, -0.06, 0);
  const t1 = mesh(cached('keyT', () => new THREE.BoxGeometry(0.06, 0.03, 0.02)), A.gold, 0.035, -0.15, 0);
  const t2 = mesh(cached('keyT', () => new THREE.BoxGeometry(0.06, 0.03, 0.02)), A.gold, 0.035, -0.1, 0);
  g.add(bow, shaft, t1, t2);
  return g;
}

export function makePotion(color = 0xff3344) {
  const g = new THREE.Group();
  const glass = mesh(cached('flask', () => lathe([[0, 0], [0.09, 0.01], [0.11, 0.07], [0.1, 0.13], [0.04, 0.17], [0.035, 0.24], [0.045, 0.25]], 12)), new THREE.MeshStandardMaterial({ color: 0xccddee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }), 0, -0.12, 0);
  const liquid = mesh(cached('liquid', () => lathe([[0, 0.01], [0.085, 0.02], [0.1, 0.07], [0.09, 0.12], [0, 0.12]], 12)), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2 }), 0, -0.12, 0);
  const cork = mesh(cached('cork', () => new THREE.CylinderGeometry(0.035, 0.03, 0.05, 6)), sharedAssets().darkWood, 0, 0.14, 0);
  g.add(liquid, glass, cork);
  return g;
}

export function makeBomb() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(mesh(cached('bomb', () => new THREE.SphereGeometry(0.14, 12, 10)), new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.6 })));
  g.add(mesh(cached('bombCap', () => new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8)), A.darkMetal, 0, 0.14, 0));
  const fuse = mesh(cached('bombFuse', () => new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4)), A.paper, 0.02, 0.2, 0);
  fuse.rotation.z = -0.4;
  g.add(fuse);
  return g;
}

export function makeHeart() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.12);
  s.bezierCurveTo(-0.2, 0.02, -0.12, 0.16, 0, 0.07);
  s.bezierCurveTo(0.12, 0.16, 0.2, 0.02, 0, -0.12);
  const geo = cached('heart', () => { const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); g.center(); return g; });
  return mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xaa0011, emissiveIntensity: 1.2, roughness: 0.3 }));
}
