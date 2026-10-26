// Kitchen appliances: fridge, range + oven, sink, trash & recycling, pantry.
import * as THREE from 'three';
import { G } from '../../game.js';
import { Interactable, makeInteractable } from '../interactable.js';
import { mat, MAT, box, rbox, cyl, sph, at, group, tube, torus, lathe, plane } from '../../items/kit.js';
import { allLayers } from '../../core/engine.js';
import { tween, Ease } from '../../core/tween.js';
import { Container } from '../../items/container.js';
import { rand } from '../../core/utils.js';

const STEEL = () => mat('#c9ccd0', { rough: 0.32, metal: 0.9 });
const DARK = () => mat('#1d1f22', { rough: 0.35, metal: 0.3 });
const FOODISH = (def) => ['food', 'drink', 'grocery'].includes(def.category);

// ------------------------------------------------------------------ Fridge
class Fridge extends Interactable {
  constructor(apt) {
    super('Refrigerator', 'fridge');
    const W = 0.9, Hh = 1.98, D = 0.74;
    const root = new THREE.Group();
    root.position.set(-2.58, 0, 5 - D / 2 - 0.01);
    const steel = STEEL();
    // shell
    const back = box(W, Hh, 0.04, steel); at(back, 0, Hh / 2, D / 2 - 0.02); root.add(back);
    const sideL = box(0.04, Hh, D, steel); at(sideL, -W / 2 + 0.02, Hh / 2, 0); root.add(sideL);
    const sideR = box(0.04, Hh, D, steel); at(sideR, W / 2 - 0.02, Hh / 2, 0); root.add(sideR);
    const topP = box(W, 0.04, D, steel); at(topP, 0, Hh - 0.02, 0); root.add(topP);
    const bot = box(W, 0.6, D, steel); at(bot, 0, 0.3, 0); root.add(bot);
    // interior liner + light
    const liner = mat('#f4f6f8', { rough: 0.4, emissive: '#eaf3ff', ei: 0 });
    this.liner = liner;
    const inner = box(W - 0.08, Hh - 0.66, 0.01, liner); at(inner, 0, 0.6 + (Hh - 0.64) / 2, D / 2 - 0.045); root.add(inner);
    const innerL = box(0.01, Hh - 0.66, D - 0.1, liner); at(innerL, -W / 2 + 0.045, 0.6 + (Hh - 0.64) / 2, 0.0); root.add(innerL);
    const innerR = box(0.01, Hh - 0.66, D - 0.1, liner); at(innerR, W / 2 - 0.045, 0.6 + (Hh - 0.64) / 2, 0.0); root.add(innerR);
    const shelfMat = mat('#dff0f6', { rough: 0.05, opacity: 0.45, transparent: true });
    const shelfYs = [0.62, 0.95, 1.27, 1.58];
    for (const y of shelfYs.slice(1)) { const s = box(W - 0.1, 0.008, D - 0.12, shelfMat, { cast: false }); at(s, 0, y - 0.004, 0.0); root.add(s); }
    this.light = new THREE.PointLight('#eaf4ff', 0, 1.6, 2); this.light.position.set(0, 1.75, -0.1); allLayers(this.light); root.add(this.light);
    // freezer drawer front
    const fd = rbox(W - 0.01, 0.58, 0.05, 0.01, steel); at(fd, 0, 0.3, -D / 2 - 0.02); root.add(fd);
    const fh = rbox(0.6, 0.025, 0.035, 0.01, MAT.chrome()); at(fh, 0, 0.52, -D / 2 - 0.07); root.add(fh);
    // main door on hinge (west side, swings toward the island)
    const pivot = new THREE.Group(); pivot.position.set(-W / 2, 0, -D / 2 - 0.0);
    const door = rbox(W - 0.01, Hh - 0.62, 0.06, 0.012, steel); at(door, W / 2, 0.61 + (Hh - 0.62) / 2, -0.03); pivot.add(door);
    const handle = rbox(0.025, 0.7, 0.03, 0.01, MAT.chrome()); at(handle, W - 0.07, 1.3, -0.09); pivot.add(handle);
    for (const y of [1.0, 1.6]) { const st = box(0.02, 0.02, 0.05, MAT.chrome()); at(st, W - 0.07, y, -0.065); pivot.add(st); }
    // door bins (inside face)
    const bin = mat('#e8f4f8', { rough: 0.1, opacity: 0.6, transparent: true });
    for (const y of [0.8, 1.15, 1.5]) { const b = box(W - 0.16, 0.08, 0.08, bin, { cast: false }); at(b, W / 2, y, 0.06); pivot.add(b); }
    // little water/ice display
    const disp = rbox(0.12, 0.08, 0.005, 0.005, mat('#0d1b26', { emissive: '#42b6ff', ei: 0.5, rough: 0.2 })); at(disp, W / 2, 1.55, -0.063); pivot.add(disp);
    root.add(pivot);
    this.pivot = pivot; this.door = door;
    apt.root.add(root);
    this.root = root;
    this.attach(door);
    this.outline = door;
    // interior acts as a separate interactable for storing items
    const interior = box(W - 0.1, Hh - 0.68, D - 0.12, mat('#000', { opacity: 0, transparent: true, depthWrite: false }), { cast: false, receive: false });
    at(interior, 0, 0.61 + (Hh - 0.68) / 2, 0.02);
    interior.visible = true; interior.material.colorWrite = false;
    root.add(interior);
    this.interior = makeInteractable(interior, 'Fridge Shelves', () => this.interiorActions(), { outline: false });
    apt.addCollider(-2.58 - W / 2, -2.58 + W / 2, 5 - D - 0.02, 5, 'fridge');
    for (const m of [back, sideL, sideR, topP, bot, door]) apt.addSolid(m);
    // slots: 4 shelves x 3 columns x 2 rows
    const slots = [];
    for (let s = 0; s < 4; s++) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) slots.push([-0.27 + c * 0.27, shelfYs[s] + 0.002, -0.14 + r * 0.24]);
    this.container = new Container('fridge', 'Fridge', { parent: root, slots, slotSize: [0.25, 0.3, 0.22], accepts: FOODISH, icon: '🧊', isOpen: () => this.isOpen });
    this.isOpen = false;
    this.angle = 0;
    this.hum = null;
    G.events.on('started', () => { this.hum = G.audio.loop('hum', { pos: new THREE.Vector3(-2.58, 1.8, 4.7), volume: 0.035, freq: 55 }); });
  }
  getActions() {
    const acts = [{ key: 'E', label: this.isOpen ? 'Close' : 'Open', run: () => this.setOpen(!this.isOpen) }];
    const held = G.hand.held;
    if (this.isOpen && held && FOODISH(held.def)) acts.push({ key: 'F', label: `Put ${held.def.name} inside`, run: () => this.store(held) });
    else if (held && FOODISH(held.def)) acts.push({ key: 'F', label: 'Store in fridge', run: () => { this.setOpen(true); setTimeout(() => this.store(held), 350); } });
    return acts;
  }
  interiorActions() {
    if (!this.isOpen) return this.getActions();
    const held = G.hand.held;
    const acts = [{ key: 'E', label: 'Close fridge', run: () => this.setOpen(false) }];
    if (held && FOODISH(held.def)) acts.unshift({ key: 'F', label: `Put ${held.def.name} inside`, run: () => this.store(held) });
    if (!held) acts.push({ key: 'F', label: `Contents (${this.container.count()}/${this.container.capacity})`, run: () => G.ui.openContainer(this.container) });
    return acts;
  }
  store(inst) {
    if (!this.container.canStore(inst)) { G.ui.toast(this.container.full() ? 'The fridge is full!' : 'That doesn\'t belong in the fridge.', { kind: 'bad' }); return; }
    G.hand.release();
    G.items.toContainer(inst, this.container);
    G.audio.play('clink', { pos: this.root.position, pitch: rand(0.8, 1.1) });
  }
  setOpen(open) {
    if (open === this.isOpen) return;
    this.isOpen = open;
    G.audio.play('fridge', { pos: this.root.position, close: !open, delay: open ? 0 : 0.35 });
    const from = this.angle, to = open ? 1.75 : 0;
    this.tw?.cancel();
    this.tw = tween({ duration: 0.55, ease: Ease.inOutCubic, update: (t, e) => { this.angle = from + (to - from) * e; this.pivot.rotation.y = this.angle; } });
    this.light.intensity = open ? 1.2 : 0;
    this.liner.emissiveIntensity = open ? 0.35 : 0;
    this.hum?.setVolume(open ? 0.06 : 0.035);
  }
}

// ------------------------------------------------------------------ Range / oven
class Range extends Interactable {
  constructor(apt) {
    super('Gas Range & Oven', 'stove');
    const x0 = -5.0, x1 = -3.9, W = x1 - x0, D = 0.64, CH = 0.94;
    const root = new THREE.Group(); root.position.set((x0 + x1) / 2, 0, 5 - D / 2);
    const steel = STEEL();
    const body = box(W, CH - 0.05, D, steel); at(body, 0, (CH - 0.05) / 2, 0); root.add(body);
    // oven door with window
    const ovenDoor = rbox(W - 0.06, 0.55, 0.04, 0.01, steel); at(ovenDoor, 0, 0.42, -D / 2 - 0.02); root.add(ovenDoor);
    this.ovenGlow = mat('#120d0a', { rough: 0.2, emissive: '#ff7a26', ei: 0 });
    const win = box(W - 0.3, 0.28, 0.01, this.ovenGlow); at(win, 0, 0.44, -D / 2 - 0.042); root.add(win);
    const oh = cyl(0.014, 0.014, W - 0.2, MAT.chrome(), 12); oh.rotation.z = Math.PI / 2; at(oh, 0, 0.72, -D / 2 - 0.08); root.add(oh);
    // control strip with knobs
    const strip = box(W, 0.1, 0.04, DARK()); at(strip, 0, 0.83, -D / 2 - 0.02); root.add(strip);
    this.knobs = [];
    for (let i = 0; i < 5; i++) {
      const k = cyl(0.025, 0.028, 0.035, MAT.chrome(), 16); k.rotation.x = Math.PI / 2; at(k, -W / 2 + 0.15 + i * ((W - 0.3) / 4), 0.83, -D / 2 - 0.06); root.add(k); this.knobs.push(k);
    }
    // cooktop: black glass with burners
    const top = box(W, 0.02, D + 0.02, mat('#0b0c0e', { rough: 0.08, clearcoat: 1 })); at(top, 0, CH - 0.04, -0.01); root.add(top);
    apt.addSolid(top, { surface: true });
    this.burners = [];
    const bpos = [[-0.3, -0.12], [0.3, -0.12], [-0.3, 0.16], [0.3, 0.16]];
    for (const [bx, bz] of bpos) {
      const m = mat('#2a0c06', { emissive: '#ff3b12', ei: 0, rough: 0.3 });
      const ring = torus(0.085, 0.006, m, 6, 32); ring.rotation.x = Math.PI / 2; at(ring, bx, CH - 0.028, bz); root.add(ring);
      const ring2 = torus(0.05, 0.005, m, 6, 24); ring2.rotation.x = Math.PI / 2; at(ring2, bx, CH - 0.028, bz); root.add(ring2);
      // cast iron grates
      for (const a of [0, Math.PI / 2]) { const gbar = box(0.24, 0.015, 0.015, mat('#1a1a1a', { rough: 0.7 })); gbar.rotation.y = a; at(gbar, bx, CH - 0.015, bz); root.add(gbar); }
      this.burners.push({ mat: m, pos: new THREE.Vector3((x0 + x1) / 2 + bx, CH, 5 - D / 2 + bz), on: false });
    }
    // range hood
    const hood = group(
      at(box(W + 0.02, 0.12, 0.5, steel), 0, 0, 0),
      at(box(0.36, 0.9, 0.3, steel), 0, 0.5, 0.1),
    );
    hood.position.set(0, 1.78, 0.06); root.add(hood);
    this.hoodLight = mat('#fff4e0', { emissive: '#ffe8c4', ei: 0 });
    const hl = box(0.3, 0.005, 0.05, this.hoodLight, { cast: false }); at(hl, 0, 1.718, -0.05); root.add(hl);
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    this.outline = false;
    this.pan = null;
    this.cooking = false;
    this.sizzle = null;
    this.ovenOn = false;
    apt.updaters.push((dt) => this.update(dt));
  }
  getActions() {
    if (this.cooking) return [{ key: 'E', label: 'Cooking…', run: () => {} , disabled: 'busy' }];
    const anyOn = this.burners.some((b) => b.on);
    return [
      { key: 'E', label: 'Cook a meal…', run: () => G.ui.openCooking(this) },
      { key: 'F', label: anyOn ? 'Turn burners off' : 'Turn a burner on', run: () => this.setBurner(0, !anyOn) },
    ];
  }
  setBurner(i, on) {
    const b = this.burners[i];
    if (!on) { this.burners.forEach((bb) => { bb.on = false; bb.mat.emissiveIntensity = 0; }); this.knobs.forEach((k) => (k.rotation.y = 0)); }
    else { b.on = true; b.mat.emissiveIntensity = 2.2; this.knobs[i].rotation.y = 1.2; G.audio.play('match', { pos: b.pos }); }
    G.audio.play('click', { pos: b.pos, pitch: 0.6 });
  }
  // recipe: { name, method: 'stove'|'oven', seconds, result (item id), cookware: 'pan'|'pot' }
  async cook(recipe, onDone) {
    this.cooking = true;
    const oven = recipe.method === 'oven';
    let pan = null;
    if (!oven) {
      this.setBurner(0, true);
      const b = this.burners[0];
      pan = recipe.cookware === 'pot'
        ? group(at(cyl(0.12, 0.11, 0.14, STEEL(), 24, undefined, true), 0, 0.07, 0), at(cyl(0.11, 0.11, 0.01, mat('#b5643a', { rough: 0.6 }), 24), 0, 0.1, 0), at(torus(0.12, 0.006, STEEL(), 6, 24), 0, 0.14, 0))
        : group(at(cyl(0.14, 0.12, 0.04, mat('#2a2a2c', { rough: 0.4, metal: 0.5 }), 28), 0, 0.02, 0), at(rot(cyl(0.012, 0.012, 0.28, mat('#1a1a1a')), 0, 0, Math.PI / 2), 0.27, 0.035, 0), at(cyl(0.12, 0.12, 0.012, mat(recipe.color || '#e8c070', { rough: 0.7 }), 24), 0, 0.03, 0));
      pan.position.copy(b.pos);
      G.scene.add(pan);
      this.pan = pan;
      this.sizzle = G.audio.loop(recipe.cookware === 'pot' ? 'bubbling' : 'sizzle', { pos: b.pos, volume: 0.7 });
    } else {
      this.ovenOn = true; this.ovenGlow.emissiveIntensity = 1.6;
      this.sizzle = G.audio.loop('hum', { pos: this.root.position, volume: 0.3, freq: 70 });
    }
    this.hoodLight.emissiveIntensity = 2;
    const ok = await G.ui.progress(`${oven ? 'Baking' : 'Cooking'} ${recipe.name}`, recipe.seconds, { icon: oven ? '🔥' : '🍳', minigame: 'stir' });
    this.sizzle?.stop(); this.sizzle = null;
    if (pan) { G.scene.remove(pan); this.pan = null; }
    this.setBurner(0, false);
    this.ovenOn = false; this.ovenGlow.emissiveIntensity = 0; this.hoodLight.emissiveIntensity = 0;
    this.cooking = false;
    if (ok !== false) {
      G.audio.play('ding', { pos: this.root.position });
      onDone?.(typeof ok === 'number' ? ok : 1);
    }
  }
  // where cooked dishes appear: on the counter right of the range
  servePos(i = 0) { return new THREE.Vector3(-3.45 - (i % 2) * 0.28, 0.94, 4.62 - Math.floor(i / 2) * 0.25); }
  update(dt) {
    if (this.pan || this.ovenOn) {
      this._t = (this._t || 0) + dt;
      if (this._t > 0.12) {
        this._t = 0;
        const p = this.pan ? this.pan.position.clone().add(new THREE.Vector3(rand(-0.08, 0.08), 0.12, rand(-0.08, 0.08))) : this.root.position.clone().add(new THREE.Vector3(0, 0.95, -0.2));
        G.particles.steam(p, 1, { size: 0.05, sizeEnd: 0.35, alpha: 0.18 });
      }
    }
    for (const b of this.burners) if (b.on) b.mat.emissiveIntensity = 2 + Math.sin(performance.now() * 0.02) * 0.2;
  }
}
function rot(o, x, y, z) { o.rotation.set(x, y, z); return o; }

// ------------------------------------------------------------------ Sink
class KitchenSink extends Interactable {
  constructor(apt) {
    super('Kitchen Sink', 'sink');
    this.isSink = true;
    const root = new THREE.Group(); root.position.set(-6.69, 0.94, 3.0);
    const steel = mat('#b9bec4', { rough: 0.25, metal: 0.95 });
    // basin (open box)
    const bw = 0.42, bl = 0.7, bd = 0.22;
    const bottom = box(bw, 0.01, bl, steel); at(bottom, 0, -bd, 0); root.add(bottom);
    const walls = [[bw, bd, 0.01, 0, -bd / 2, bl / 2], [bw, bd, 0.01, 0, -bd / 2, -bl / 2], [0.01, bd, bl, bw / 2, -bd / 2, 0], [0.01, bd, bl, -bw / 2, -bd / 2, 0]];
    for (const [w, h, d, x, y, z] of walls) { const m = box(w, h, d, steel); at(m, x, y, z); root.add(m); }
    const drain = cyl(0.035, 0.035, 0.005, mat('#666', { metal: 1, rough: 0.3 }), 20); at(drain, 0, -bd + 0.008, 0); root.add(drain);
    // gooseneck faucet
    const chrome = MAT.chrome();
    const base = cyl(0.028, 0.032, 0.05, chrome, 20); at(base, -0.27, 0.025, 0); root.add(base);
    const neck = tube([[-0.27, 0.04, 0], [-0.27, 0.32, 0], [-0.22, 0.42, 0], [-0.1, 0.42, 0], [-0.05, 0.34, 0]], 0.014, chrome, 40, 10); root.add(neck);
    const lever = rbox(0.015, 0.012, 0.09, 0.005, chrome); at(lever, -0.27, 0.12, 0.05); root.add(lever);
    this.lever = lever;
    // water stream
    const wm = new THREE.MeshPhysicalMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.55, roughness: 0.05, transmission: 0, emissive: '#9fd4ff', emissiveIntensity: 0.15, depthWrite: false });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.55, 10, 1, true), wm);
    stream.position.set(-0.05, 0.06, 0); stream.visible = false; root.add(stream);
    this.stream = stream;
    // soap dispenser + sponge (small props)
    const soap = group(at(cyl(0.03, 0.032, 0.14, mat('#e9e2d4', { rough: 0.2, clearcoat: 0.6 })), 0, 0.07, 0), at(cyl(0.008, 0.008, 0.04, chrome), 0, 0.16, 0), at(box(0.05, 0.008, 0.01, chrome), 0.02, 0.18, 0));
    soap.position.set(-0.27, 0, 0.22); root.add(soap);
    const sponge = rbox(0.1, 0.035, 0.065, 0.01, mat('#f2c94c', { rough: 1 })); at(sponge, -0.27, 0.018, -0.22); root.add(sponge);
    apt.root.add(root);
    this.root = root;
    const hit = box(0.5, 0.4, 0.8, mat('#000', { transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false });
    hit.material.colorWrite = false;
    at(hit, -0.05, 0.05, 0); root.add(hit);
    this.attach(hit);
    this.outline = false;
    this.running = false;
    this.water = null;
    apt.updaters.push((dt) => this.update(dt));
  }
  getActions() {
    const held = G.hand.held;
    const acts = [];
    const hb = held && G.behaviors.sinkAction?.(held, this);
    if (hb) acts.push(hb);
    acts.push({ key: hb ? 'F' : 'E', label: 'Wash hands', run: () => this.washHands() });
    if (!hb) acts.push({ key: 'F', label: 'Drink a glass of water', run: () => this.drinkWater() });
    acts.push({ key: 'R', label: this.running ? 'Turn tap off' : 'Turn tap on', run: () => this.setRunning(!this.running) });
    return acts;
  }
  setRunning(on) {
    this.running = on;
    this.stream.visible = on;
    this.lever.rotation.y = on ? 0.6 : 0;
    if (on && !this.water) this.water = G.audio.loop('water', { pos: this.root.position, volume: 0.5 });
    if (!on && this.water) { this.water.stop(); this.water = null; }
    G.audio.play('click', { pos: this.root.position, pitch: 0.7 });
  }
  async run(label, secs, icon) {
    const was = this.running;
    if (!was) this.setRunning(true);
    const ok = await G.ui.progress(label, secs, { icon });
    if (!was) this.setRunning(false);
    return ok;
  }
  async washHands() {
    if (await this.run('Washing hands', 3, '🫧')) {
      G.needs.add({ hygiene: 8 });
      G.events.emit('act', 'washHands');
    }
  }
  async drinkWater() {
    if (await this.run('Pouring a glass of water', 2.5, '🚰')) {
      G.audio.play('sip', {}); G.needs.add({ thirst: 22 });
      G.events.emit('act', 'drink', { id: 'tap_water' });
    }
  }
  update(dt) {
    if (this.running) {
      this.stream.material.emissiveIntensity = 0.12 + Math.random() * 0.08;
      this.stream.scale.x = this.stream.scale.z = 0.9 + Math.random() * 0.2;
      this._t = (this._t || 0) + dt;
      if (this._t > 0.05) { this._t = 0; const p = this.root.position.clone().add(new THREE.Vector3(-0.05, -0.2, 0)); G.particles.drops(p, new THREE.Vector3(0, 0.6, 0), 1, '#e6f6ff', { rand: 1.2, life: 0.3, size: 0.02, floor: 0.73 }); }
    }
  }
}

// ------------------------------------------------------------------ Trash & recycling
class Bin extends Interactable {
  constructor(apt, { recycle, pos }) {
    super(recycle ? 'Recycling Bin' : 'Trash Can', 'bin');
    this.recycle = recycle;
    const root = new THREE.Group(); root.position.copy(pos);
    const bodyMat = recycle ? mat('#2f6fb3', { rough: 0.45 }) : mat('#c4c8cc', { rough: 0.25, metal: 0.9 });
    const body = recycle ? rbox(0.32, 0.55, 0.38, 0.03, bodyMat) : cyl(0.16, 0.15, 0.55, bodyMat, 32);
    at(body, 0, 0.275, 0); root.add(body);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.56, 0.17);
    const lid = recycle ? rbox(0.34, 0.03, 0.4, 0.012, bodyMat) : cyl(0.165, 0.165, 0.03, bodyMat, 32);
    at(lid, 0, 0, -0.17); lidPivot.add(lid);
    if (recycle) {
      const sym = sph(0.035, mat('#ffffff', { rough: 0.5 }), 12, 8); sym.scale.y = 0.2; at(sym, 0, 0.016, -0.17); lidPivot.add(sym);
    } else {
      const pedal = box(0.12, 0.02, 0.06, mat('#222')); at(pedal, 0, 0.03, -0.17); root.add(pedal);
    }
    root.add(lidPivot);
    this.lid = lidPivot;
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    apt.addCollider(pos.x - 0.18, pos.x + 0.18, pos.z - 0.2, pos.z + 0.2, 'bin', 0.6);
  }
  getActions() {
    const held = G.hand.held;
    if (!held) return [{ key: 'E', label: this.recycle ? 'Recycle cans, bottles & boxes' : 'Throw away trash', run: () => G.ui.toast('Hold something to put it in here.', { icon: this.recycle ? '♻️' : '🗑️' }) }];
    const isTrash = held.def.tags?.includes('trash') || held.def.category === 'package';
    const recyclable = held.def.tags?.includes('recyclable') || held.def.category === 'package';
    if (this.recycle) {
      if (!recyclable) return [{ key: 'E', label: `${held.def.name} isn't recyclable`, run: () => G.audio.play('error'), disabled: true }];
      return [{ key: 'E', label: `Recycle ${held.def.name}`, run: () => this.dispose(held) }];
    }
    if (isTrash) return [{ key: 'E', label: `Throw away ${held.def.name}`, run: () => this.dispose(held) }];
    return [{ key: 'E', label: `Throw away ${held.def.name}`, hold: 0.8, run: () => this.dispose(held) }];
  }
  dispose(inst) {
    this.lidAnim();
    G.hand.release();
    G.items.destroy(inst);
    G.audio.play(this.recycle ? 'rustle' : 'thud', { pos: this.root.position, soft: true });
    if (this.recycle) {
      const refund = inst.def.category === 'package' ? 0.25 : 0.1;
      G.wallet.earn(refund, 'Recycling refund', { quiet: true });
      G.events.emit('act', 'recycle', { item: inst.def.id });
      G.ui.toast(`Recycled! +$${refund.toFixed(2)}`, { icon: '♻️', kind: 'good' });
    } else G.events.emit('act', 'trash', { item: inst.def.id });
  }
  lidAnim() {
    G.audio.play('click', { pos: this.root.position, pitch: 0.5 });
    tween({ duration: 0.9, ease: (t) => t, update: (t) => { this.lid.rotation.x = -Math.sin(Math.min(1, t * 1.4) * Math.PI) * 1.2; } });
  }
}

// ------------------------------------------------------------------ Pantry (upper cabinets)
class Pantry extends Interactable {
  constructor(apt) {
    super('Pantry Cabinets', 'pantry');
    const hit = box(0.4, 0.9, 2.2, mat('#000', { transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false });
    hit.material.colorWrite = false;
    at(hit, -7 + 0.2, 1.62 + 0.45, 2.9);
    apt.root.add(hit);
    this.attach(hit);
    this.outline = false;
    this.container = new Container('pantry', 'Pantry', { accepts: (def) => ['food', 'drink', 'grocery'].includes(def.category) || def.tags?.includes('kitchen'), capacity: 40, icon: '🥫' });
  }
  getActions() {
    const held = G.hand.held;
    const acts = [{ key: 'E', label: `Open pantry (${this.container.count()})`, run: () => { G.audio.play('door', { pos: this.object.position }); G.ui.openContainer(this.container); } }];
    if (held && this.container.accepts(held.def)) acts.push({ key: 'F', label: `Store ${held.def.name}`, run: () => { G.hand.release(); G.items.toContainer(held, this.container); G.audio.play('click', { pos: this.object.position }); G.ui.toast(`${held.def.name} put in the pantry`, { icon: '🥫' }); } });
    return acts;
  }
}

export function buildKitchen(apt) {
  apt.fridge = new Fridge(apt);
  apt.range = new Range(apt);
  apt.kitchenSink = new KitchenSink(apt);
  apt.trash = new Bin(apt, { recycle: false, pos: new THREE.Vector3(-2.3, 0, 3.55) });
  apt.recycling = new Bin(apt, { recycle: true, pos: new THREE.Vector3(-2.3, 0, 3.0) });
  apt.pantry = new Pantry(apt);
  void lathe; void plane;
}
