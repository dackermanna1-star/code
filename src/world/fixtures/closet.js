// Walk-in closet: clothing rack (wardrobe), shoe wall, storage shelving, full-length mirror.
import * as THREE from 'three';
import { G } from '../../game.js';
import { Interactable, makeInteractable } from '../interactable.js';
import { mat, MAT, box, rbox, cyl, at, group, extrude, torus } from '../../items/kit.js';
import { Container } from '../../items/container.js';
import { makeMirror } from '../mirror.js';
import { allLayers } from '../../core/engine.js';

const WEARABLE = (def) => def.use?.type === 'wear';

// flat garment silhouettes used on hangers
const TOP_SHAPE = [[-0.1, 0.0], [-0.24, -0.06], [-0.3, -0.24], [-0.22, -0.27], [-0.17, -0.17], [-0.17, -0.62], [0.17, -0.62], [0.17, -0.17], [0.22, -0.27], [0.3, -0.24], [0.24, -0.06], [0.1, 0.0], [0.05, -0.04], [-0.05, -0.04]];
const LONG_SHAPE = [[-0.1, 0.0], [-0.24, -0.06], [-0.3, -0.55], [-0.22, -0.57], [-0.18, -0.2], [-0.18, -0.66], [0.18, -0.66], [0.18, -0.2], [0.22, -0.57], [0.3, -0.55], [0.24, -0.06], [0.1, 0.0], [0.05, -0.05], [-0.05, -0.05]];
const PANTS_SHAPE = [[-0.17, 0.0], [0.17, 0.0], [0.19, -0.5], [0.03, -0.5], [0.0, -0.12], [-0.03, -0.5], [-0.19, -0.5]];

export function garmentMesh(def) {
  const u = def.use;
  const col = u.color || '#888';
  const m = u.fabric === 'knit' ? MAT.knit(col) : MAT.fabric(col);
  let shape = TOP_SHAPE;
  if (u.slot === 'bottom') shape = PANTS_SHAPE;
  else if (['hoodie', 'jacket', 'sweater', 'coat', 'shirt'].includes(u.style)) shape = LONG_SHAPE;
  const g = new THREE.Group();
  const body = extrude(shape, 0.02, m, 0.01);
  g.add(body);
  if (u.color2) {
    const trim = box(0.2, 0.05, 0.03, MAT.fabric(u.color2)); at(trim, 0, -0.3, 0); g.add(trim);
  }
  return g;
}

class Wardrobe extends Interactable {
  constructor(apt) {
    super('Wardrobe Rack', 'wardrobe');
    const root = new THREE.Group(); root.position.set(6.65, 0, 3.4);
    const wood = MAT.wood('#c2a07c');
    const metal = mat('#2b2b2b', { rough: 0.35, metal: 0.8 });
    // frame: side panels, top shelf, rod, bottom drawers
    root.add(at(box(0.56, 2.3, 0.03, wood), 0, 1.15, -1.45), at(box(0.56, 2.3, 0.03, wood), 0, 1.15, 1.45));
    const shelf = box(0.56, 0.03, 2.9, wood); at(shelf, 0, 2.02, 0); root.add(shelf);
    apt.addSolid(shelf, { surface: true });
    const rod = cyl(0.014, 0.014, 2.88, metal, 12); rod.rotation.x = Math.PI / 2; at(rod, 0, 1.82, 0); root.add(rod);
    const drawers = box(0.56, 0.5, 2.88, wood); at(drawers, 0, 0.25, 0); root.add(drawers);
    apt.addSolid(drawers, { surface: true });
    for (let i = 0; i < 4; i++) { const f = box(0.01, 0.4, 0.68, mat('#b8946e', { rough: 0.55, map: wood.map })); at(f, -0.285, 0.25, -1.08 + i * 0.72); root.add(f); const h = box(0.015, 0.012, 0.18, MAT.gold()); at(h, -0.295, 0.38, -1.08 + i * 0.72); root.add(h); }
    // folded sweaters & boxes on top shelf
    const cols = ['#c9b8a6', '#7f8fa6', '#e2d4c0', '#5e6b5b'];
    cols.forEach((c, i) => root.add(at(rbox(0.32, 0.08, 0.28, 0.02, MAT.knit(c)), 0, 2.075 + (i % 2) * 0.08, -1.1 + Math.floor(i / 2) * 0.4)));
    root.add(at(rbox(0.38, 0.22, 0.32, 0.01, mat('#e9e2d6', { rough: 0.9 })), 0, 2.145, 0.55), at(rbox(0.38, 0.2, 0.3, 0.01, mat('#2b2b2b', { rough: 0.8 })), 0, 2.135, 1.05));
    // LED under the shelf
    const led = mat('#fff4e0', { emissive: '#ffe8c4', ei: 0 });
    root.add(at(box(0.02, 0.01, 2.8, led, { cast: false }), -0.2, 2.0, 0));
    (apt.roomLights.closet ||= []).push({ light: null, base: 0, emissive: led, emissiveBase: 2.5 });
    this.hangers = new THREE.Group(); root.add(this.hangers);
    apt.root.add(root);
    this.root = root;
    const hit = box(0.6, 1.4, 2.9, mat('#000', { transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false });
    hit.material.colorWrite = false; at(hit, -0.02, 1.2, 0); root.add(hit);
    this.attach(hit);
    this.outline = false;
    apt.addCollider(6.37, 6.94, 1.9, 4.9, 'wardrobe', 2.3);
    this.container = new Container('wardrobe', 'Wardrobe', { accepts: WEARABLE, capacity: 300, icon: '👕' });
    G.events.on('inventoryChanged', () => this.refresh());
    G.events.on('outfitChanged', () => this.refresh());
  }
  getActions() {
    const held = G.hand.held;
    const acts = [{ key: 'E', label: 'Change outfit…', run: () => G.ui.openWardrobe() }];
    if (held && WEARABLE(held.def)) {
      acts.push({ key: 'F', label: `Hang up ${held.def.name}`, run: () => { G.hand.release(); G.items.toContainer(held, this.container); G.audio.play('rustle'); } });
      acts.push({ key: 'R', label: `Put on ${held.def.name}`, run: () => G.outfit.wear(held) });
    }
    return acts;
  }
  refresh() {
    while (this.hangers.children.length) this.hangers.remove(this.hangers.children[0]);
    const items = G.items.inLoc('wardrobe').filter((i) => ['top', 'bottom'].includes(i.def.use.slot)).slice(0, 18);
    const metal = mat('#a8a8a8', { rough: 0.3, metal: 1 });
    const n = Math.max(items.length, 1);
    const span = Math.min(2.6, n * 0.17);
    items.forEach((it, i) => {
      const hz = -span / 2 + (i + 0.5) * (span / n);
      const hanger = group(
        at(torus(0.02, 0.004, metal, 6, 16, Math.PI * 1.5), 0, 0.02, 0),
        at(box(0.38, 0.008, 0.008, mat('#c9a77c', { rough: 0.5 })), 0, -0.04, 0),
      );
      const gm = garmentMesh(it.def);
      gm.position.y = -0.04; if (it.def.use.slot === 'bottom') gm.position.y = -0.05;
      hanger.add(gm);
      hanger.position.set(0, 1.79, hz);
      hanger.rotation.z = (Math.random() - 0.5) * 0.04;
      this.hangers.add(hanger);
    });
  }
}

class StorageShelves extends Interactable {
  constructor(apt) {
    super('Storage Shelves', 'storage');
    const root = new THREE.Group(); root.position.set(5.2, 0, 4.78);
    const wood = MAT.wood('#d7bd98');
    const W = 1.9, D = 0.42;
    for (const x of [-W / 2, W / 2]) root.add(at(box(0.03, 2.1, D, wood), x, 1.05, 0));
    for (const y of [0.05, 0.55, 1.05, 1.55, 2.08]) { const s = box(W, 0.03, D, wood); at(s, 0, y, 0); root.add(s); }
    // baskets & bins
    const binCols = ['#d9cbb4', '#b9a789', '#8ea39b'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if ((r + c) % 4 === 3) continue;
      const b = rbox(0.5, 0.36, 0.36, 0.03, mat(binCols[(r + c) % 3], { rough: 1, map: wood.map }));
      at(b, -0.62 + c * 0.62, 0.25 + r * 0.5, 0); root.add(b);
    }
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    this.outline = false;
    apt.addCollider(5.2 - W / 2, 5.2 + W / 2, 4.55, 5.0, 'shelves', 2.1);
    this.container = new Container('storage', 'Storage', { capacity: 500, icon: '📦' });
  }
  getActions() {
    const held = G.hand.held;
    const acts = [{ key: 'E', label: `Open storage (${this.container.count()} items)`, run: () => G.ui.openContainer(this.container) }];
    if (held) acts.push({ key: 'F', label: `Store ${held.def.name}`, run: () => { G.hand.release(); G.items.toContainer(held, this.container); G.audio.play('rustle'); G.ui.toast(`${held.def.name} stored`, { icon: '📦' }); } });
    return acts;
  }
}

class ShoeWall extends Interactable {
  constructor(apt) {
    super('Sneaker Wall', 'shoewall');
    const root = new THREE.Group(); root.position.set(4.06, 0, 3.35);
    const shelfMat = mat('#f4f1ec', { rough: 0.4 });
    const ledMat = mat('#ffffff', { emissive: '#fff3e2', ei: 0 });
    const L = 2.2, D = 0.34;
    root.add(at(box(0.02, 2.0, L + 0.04, mat('#2c2f33', { rough: 0.6 })), 0.01, 1.05, 0));
    for (const y of [0.35, 0.72, 1.09, 1.46, 1.83]) {
      const s = box(D, 0.025, L, shelfMat); at(s, D / 2 + 0.02, y, 0); root.add(s);
      apt.addSolid(s, { surface: true });
      const led = box(0.01, 0.008, L - 0.05, ledMat, { cast: false }); at(led, D - 0.02, y + 0.355, 0); root.add(led);
    }
    (apt.roomLights.closet ||= []).push({ light: null, base: 0, emissive: ledMat, emissiveBase: 1.6 });
    apt.root.add(root);
    this.attach(root);
    this.outline = false;
    apt.addCollider(4.06, 4.06 + D + 0.03, 3.35 - L / 2, 3.35 + L / 2, 'shoewall', 2);
  }
  getActions() { return [{ key: 'E', label: 'Display shoes & collectibles here (hold item, press F)', run: () => G.ui.toast('Hold a pair of sneakers and press F to place them on the shelf.', { icon: '👟' }) }]; }
}

class FullMirror extends Interactable {
  constructor(apt) {
    super('Full-Length Mirror', 'mirror');
    const root = new THREE.Group(); root.position.set(4.52, 0.12, 1.56 + 0.025);
    const frame = mat('#b08d57', { rough: 0.3, metal: 0.8 });
    const w = 0.62, h = 1.85;
    root.add(at(box(w + 0.05, 0.03, 0.03, frame), 0, h + 0.015, 0), at(box(w + 0.05, 0.03, 0.03, frame), 0, -0.015, 0), at(box(0.03, h, 0.03, frame), -w / 2 - 0.01, h / 2, 0), at(box(0.03, h, 0.03, frame), w / 2 + 0.01, h / 2, 0));
    const m = makeMirror(w, h, { res: 720 });
    m.group.position.set(0, h / 2, 0.004);
    root.add(m.group);
    this.mirror = m;
    apt.root.add(root);
    this.attach(m.reflector);
    this.outline = false;
    makeInteractable(root.children[0], 'Full-Length Mirror', () => this.getActions(), { outline: false });
  }
  getActions() {
    return [
      { key: 'E', label: 'Check your fit', run: () => G.player.admireMirror?.(this.mirror) },
      { key: 'F', label: 'Change outfit…', run: () => G.ui.openWardrobe() },
      { key: 'R', label: 'Mirror selfie 📸', run: () => G.phone?.mirrorSelfie?.() },
    ];
  }
}

class Ottoman extends Interactable {
  constructor(apt) {
    super('Closet Ottoman', 'seat');
    const root = new THREE.Group(); root.position.set(5.35, 0, 3.3);
    const seat = rbox(0.9, 0.42, 0.5, 0.06, mat('#b98b73', { rough: 0.6, sheen: 0.5 }));
    at(seat, 0, 0.25, 0); root.add(seat);
    for (const sx of [-0.38, 0.38]) for (const sz of [-0.18, 0.18]) root.add(at(cyl(0.02, 0.015, 0.06, MAT.gold(), 10), sx, 0.03, sz));
    apt.root.add(root);
    apt.addSolid(seat, { surface: true });
    this.attach(root);
    apt.addCollider(4.9, 5.8, 3.05, 3.55, 'ottoman', 0.45);
    this.root = root;
  }
  getActions() {
    return [{ key: 'E', label: 'Sit', run: () => G.player.sit({ pos: new THREE.Vector3(5.35, 0, 3.3), yaw: Math.PI / 2, seatHeight: 0.46, name: 'ottoman' }) }];
  }
}

export function buildCloset(apt) {
  apt.wardrobe = new Wardrobe(apt);
  apt.storage = new StorageShelves(apt);
  apt.shoeWall = new ShoeWall(apt);
  apt.fullMirror = new FullMirror(apt);
  apt.ottoman = new Ottoman(apt);
  void allLayers; void rbox;
}
