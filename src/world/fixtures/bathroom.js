// Bathroom: vanity + mirror cabinet, toilet, bathtub with shower, towel rail.
import * as THREE from 'three';
import { G } from '../../game.js';
import { Interactable, makeInteractable } from '../interactable.js';
import { mat, MAT, box, rbox, cyl, sph, at, group, tube, torus, lathe, plane } from '../../items/kit.js';
import { tween, Ease, wait } from '../../core/tween.js';
import { Container } from '../../items/container.js';
import { makeMirror } from '../mirror.js';
import { rand } from '../../core/utils.js';
import { fabric } from '../../core/textures.js';

const CER = () => MAT.ceramic('#f7f6f2');
const HYGIENE = (def) => def.category === 'hygiene' || def.tags?.includes('bathroom');

class Vanity extends Interactable {
  constructor(apt) {
    super('Bathroom Sink', 'sink');
    this.isSink = true;
    const root = new THREE.Group(); root.position.set(2.45, 0, 1.56);
    const wood = MAT.wood('#8a6446');
    const cab = rbox(1.0, 0.5, 0.48, 0.01, wood); at(cab, 0, 0.55, 0.24); root.add(cab);
    for (const s of [-1, 1]) { const dr = box(0.47, 0.2, 0.01, mat('#7b583c', { rough: 0.6, map: wood.map })); at(dr, s * 0.245, 0.55, 0.485); root.add(dr); const hd = box(0.14, 0.012, 0.015, MAT.gold()); at(hd, s * 0.245, 0.6, 0.495); root.add(hd); }
    const top = rbox(1.04, 0.04, 0.52, 0.01, mat('#ece9e3', { rough: 0.25 })); at(top, 0, 0.82, 0.26); root.add(top);
    apt.addSolid(top, { surface: true });
    // vessel basin
    const basin = lathe([[0.0, 0], [0.16, 0.005], [0.2, 0.04], [0.21, 0.12], [0.2, 0.125], [0.185, 0.04], [0.15, 0.015], [0.0, 0.015]], CER(), 40);
    at(basin, 0, 0.84, 0.27); root.add(basin);
    // wall faucet
    const chrome = MAT.chrome();
    const spout = tube([[0, 1.08, 0.0], [0, 1.08, 0.16], [0, 1.03, 0.2]], 0.012, chrome, 12, 8); root.add(spout);
    const knob = cyl(0.025, 0.025, 0.03, chrome, 16); knob.rotation.x = Math.PI / 2; at(knob, 0.12, 1.08, 0.015); root.add(knob);
    this.knob = knob;
    const wm = new THREE.MeshStandardMaterial({ color: '#dff2ff', transparent: true, opacity: 0.5, emissive: '#9fd4ff', emissiveIntensity: 0.15, depthWrite: false });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.16, 8, 1, true), wm);
    at(stream, 0, 0.95, 0.2); stream.visible = false; root.add(stream);
    this.stream = stream;
    // toothbrush cup + soap dish
    const cup = lathe([[0.03, 0], [0.034, 0.1], [0.032, 0.1], [0.028, 0.005], [0, 0.005]], mat('#a9c6c0', { rough: 0.3 }), 20); at(cup, -0.38, 0.84, 0.2); root.add(cup);
    const dish = cyl(0.05, 0.04, 0.015, CER(), 20); at(dish, 0.38, 0.85, 0.22); root.add(dish);
    const soap = rbox(0.07, 0.022, 0.045, 0.01, mat('#f3d7c6', { rough: 0.5 })); at(soap, 0.38, 0.868, 0.22); root.add(soap);
    // mirror cabinet
    const cabBox = new THREE.Group(); cabBox.position.set(0, 1.25, 0);
    const cw = 0.8, ch = 0.72, cd = 0.13;
    const body = mat('#f3f1ec', { rough: 0.5 });
    cabBox.add(at(box(cw, 0.015, cd, body), 0, 0.0075, cd / 2), at(box(cw, 0.015, cd, body), 0, ch - 0.0075, cd / 2), at(box(0.015, ch, cd, body), -cw / 2 + 0.0075, ch / 2, cd / 2), at(box(0.015, ch, cd, body), cw / 2 - 0.0075, ch / 2, cd / 2));
    const shelfMat = mat('#e7f2f4', { rough: 0.05, opacity: 0.5, transparent: true });
    cabBox.add(at(box(cw - 0.03, 0.006, cd - 0.02, shelfMat, { cast: false }), 0, 0.25, cd / 2), at(box(cw - 0.03, 0.006, cd - 0.02, shelfMat, { cast: false }), 0, 0.49, cd / 2));
    // backlight strip (tied to bathroom lights)
    const led = mat('#f6f8ff', { emissive: '#f4f6ff', ei: 0 });
    const ledStrip = box(cw - 0.04, 0.012, 0.01, led, { cast: false }); at(ledStrip, 0, -0.01, cd - 0.01); cabBox.add(ledStrip);
    (apt.roomLights.bath ||= []).push({ light: null, base: 0, emissive: led, emissiveBase: 2.2 });
    // mirror door
    const doorPivot = new THREE.Group(); doorPivot.position.set(-cw / 2, ch / 2, cd + 0.005);
    const mirror = makeMirror(cw - 0.02, ch - 0.02, { res: 700, fogable: true });
    mirror.group.position.set(cw / 2, 0, 0.012);
    const backPanel = box(cw, ch, 0.012, body); at(backPanel, cw / 2, 0, 0.0); doorPivot.add(backPanel);
    doorPivot.add(mirror.group);
    cabBox.add(doorPivot);
    this.mirror = mirror;
    this.mirrorDoor = doorPivot;
    root.add(cabBox);
    apt.root.add(root);
    this.root = root;
    this.attach(group());
    // interactables: basin area & mirror cabinet
    const hit = box(1.0, 0.45, 0.52, mat('#000', { transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false });
    hit.material.colorWrite = false; at(hit, 0, 1.0, 0.26); root.add(hit);
    this.attach(hit);
    this.outline = false;
    this.cabinetOpen = false;
    this.cabinetIt = makeInteractable(mirror.reflector, 'Mirror Cabinet', () => this.cabinetActions(), { outline: false });
    makeInteractable(backPanel, 'Mirror Cabinet', () => this.cabinetActions(), { outline: false });
    const slots = [];
    for (const y of [0.02, 0.26, 0.5]) for (let i = 0; i < 4; i++) slots.push([-0.3 + i * 0.2, y, 0.06]);
    this.cabinet = new Container('cabinet', 'Mirror Cabinet', { parent: cabBox, slots, slotSize: [0.17, 0.2, 0.1], accepts: HYGIENE, icon: '🪥', isOpen: () => this.cabinetOpen });
    apt.addCollider(1.95, 2.95, 1.5, 2.06, 'vanity', 0.85);
    this.running = false;
    apt.updaters.push((dt) => this.update(dt));
  }
  getActions() {
    const held = G.hand.held;
    const acts = [];
    const hb = held && G.behaviors.sinkAction?.(held, this);
    if (hb) acts.push(hb);
    acts.push({ key: hb ? 'F' : 'E', label: 'Wash face & hands', run: () => this.wash() });
    acts.push({ key: 'R', label: this.running ? 'Turn tap off' : 'Turn tap on', run: () => this.setRunning(!this.running) });
    return acts;
  }
  cabinetActions() {
    const held = G.hand.held;
    const acts = [{ key: 'E', label: this.cabinetOpen ? 'Close cabinet' : 'Open cabinet', run: () => this.setCabinet(!this.cabinetOpen) }];
    if (held && HYGIENE(held.def)) acts.push({ key: 'F', label: `Put ${held.def.name} away`, run: () => this.store(held) });
    else if (!held) acts.push({ key: 'F', label: 'Check yourself out', run: () => G.player.admireMirror?.(this.mirror) });
    return acts;
  }
  store(inst) {
    if (!this.cabinet.canStore(inst)) { G.ui.toast(this.cabinet.full() ? 'The cabinet is full' : 'That doesn\'t go in here', { kind: 'bad' }); return; }
    if (!this.cabinetOpen) this.setCabinet(true);
    G.hand.release();
    G.items.toContainer(inst, this.cabinet);
    G.audio.play('clink', { pos: this.root.position, pitch: 1.2 });
  }
  setCabinet(open) {
    this.cabinetOpen = open;
    G.audio.play('click', { pos: this.root.position, pitch: open ? 1 : 0.8 });
    const from = this.mirrorDoor.rotation.y, to = open ? -1.7 : 0;
    tween({ duration: 0.5, ease: Ease.inOutCubic, update: (t, e) => { this.mirrorDoor.rotation.y = from + (to - from) * e; } });
  }
  setRunning(on) {
    this.running = on; this.stream.visible = on; this.knob.rotation.z = on ? 1.2 : 0;
    if (on && !this.water) this.water = G.audio.loop('water', { pos: this.root.position.clone().setY(1), volume: 0.4 });
    if (!on && this.water) { this.water.stop(); this.water = null; }
  }
  async withWater(label, secs, icon) {
    const was = this.running; if (!was) this.setRunning(true);
    const ok = await G.ui.progress(label, secs, { icon });
    if (!was) this.setRunning(false);
    return ok;
  }
  async wash() {
    if (await this.withWater('Washing up', 3.5, '💦')) { G.needs.add({ hygiene: 12 }); G.events.emit('act', 'washFace'); }
  }
  update() { if (this.running) this.stream.scale.x = this.stream.scale.z = 0.85 + Math.random() * 0.3; }
}

class Toilet extends Interactable {
  constructor(apt) {
    super('Toilet', 'toilet');
    const root = new THREE.Group(); root.position.set(1.62, 0, 4.98); root.rotation.y = Math.PI; // faces -z
    const c = CER();
    const bowl = lathe([[0.0, 0.0], [0.15, 0.0], [0.17, 0.18], [0.2, 0.36], [0.21, 0.4], [0.0, 0.4]], c, 32); bowl.scale.z = 1.3; at(bowl, 0, 0, 0.32); root.add(bowl);
    const tank = rbox(0.42, 0.38, 0.18, 0.03, c); at(tank, 0, 0.62, 0.1); root.add(tank);
    const tankLid = rbox(0.44, 0.04, 0.2, 0.015, c); at(tankLid, 0, 0.83, 0.1); root.add(tankLid);
    const btn = cyl(0.025, 0.025, 0.01, MAT.chrome(), 16); at(btn, 0, 0.855, 0.1); root.add(btn);
    this.btn = btn;
    const seatMat = mat('#fbfbf9', { rough: 0.3 });
    const seat = torus(0.155, 0.03, seatMat, 10, 32); seat.rotation.x = Math.PI / 2; seat.scale.y = 1.3; at(seat, 0, 0.415, 0.34); root.add(seat);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.43, 0.15);
    const lid = cyl(0.19, 0.19, 0.02, seatMat, 32); lid.scale.z = 1.3; at(lid, 0, 0.0, 0.2); lidPivot.add(lid);
    root.add(lidPivot);
    this.lid = lidPivot; this.lidOpen = false;
    const water = cyl(0.12, 0.12, 0.005, mat('#bfe4f2', { rough: 0.05, opacity: 0.8, transparent: true }), 24); water.scale.z = 1.3; at(water, 0, 0.3, 0.34); root.add(water);
    this.water = water;
    // toilet paper holder on the wall beside it
    const tp = group(at(cyl(0.006, 0.006, 0.14, MAT.chrome()), 0, 0, 0), at(cyl(0.055, 0.055, 0.11, mat('#ffffff', { rough: 0.95 }), 24), 0, 0, 0));
    tp.rotation.z = Math.PI / 2; tp.position.set(0.42, 0.72, 0.25); root.add(tp);
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    apt.addCollider(1.62 - 0.22, 1.62 + 0.22, 4.98 - 0.62, 5, 'toilet', 0.85);
    apt.addSolid(tankLid, { surface: true });
  }
  getActions() {
    return [
      { key: 'E', label: 'Use the toilet', run: () => this.use() },
      { key: 'F', label: 'Flush', run: () => this.flush() },
      { key: 'R', label: this.lidOpen ? 'Close lid' : 'Lift lid', run: () => this.setLid(!this.lidOpen) },
    ];
  }
  setLid(open) {
    this.lidOpen = open;
    G.audio.play('click', { pos: this.root.position, pitch: 0.6 });
    const from = this.lid.rotation.x, to = open ? -1.65 : 0;
    tween({ duration: 0.35, ease: open ? Ease.outCubic : Ease.outBounce, update: (t, e) => { this.lid.rotation.x = from + (to - from) * e; } });
  }
  async use() {
    if (!this.lidOpen) this.setLid(true);
    await G.ui.fadeOut(0.5);
    await wait(0.8);
    await G.ui.fadeIn(0.5);
    this.flush();
    G.needs.add({ comfort: 6 });
    G.events.emit('act', 'toilet');
    G.ui.toast('Much better.', { icon: '🚽' });
  }
  flush() {
    G.audio.play('flush', { pos: this.root.position });
    this.btn.position.y = 0.85; setTimeout(() => (this.btn.position.y = 0.855), 300);
    tween({ duration: 2.4, ease: (t) => t, update: (t) => { this.water.rotation.y = t * 18; this.water.position.y = 0.3 - Math.sin(t * Math.PI) * 0.05; } });
  }
}

class Tub extends Interactable {
  constructor(apt) {
    super('Bathtub & Shower', 'tub');
    const x0 = 3.18, x1 = 3.94, z0 = 3.22, z1 = 5.0;
    const W = x1 - x0, L = z1 - z0, Ht = 0.56, T = 0.07;
    const root = new THREE.Group(); root.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const c = CER();
    root.add(at(rbox(W, Ht, T, 0.03, c), 0, Ht / 2, -L / 2 + T / 2));
    root.add(at(rbox(W, Ht, T, 0.03, c), 0, Ht / 2, L / 2 - T / 2));
    root.add(at(rbox(T, Ht, L, 0.03, c), -W / 2 + T / 2, Ht / 2, 0));
    root.add(at(rbox(T, Ht, L, 0.03, c), W / 2 - T / 2, Ht / 2, 0));
    root.add(at(box(W - 0.1, 0.08, L - 0.1, c), 0, 0.04, 0));
    // water body
    this.waterMat = new THREE.MeshPhysicalMaterial({ color: '#bfe3f0', roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1, depthWrite: false });
    const water = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - 0.01, 1, L - 2 * T - 0.01), this.waterMat);
    water.position.y = 0.08; water.scale.y = 0.001; water.visible = false; root.add(water);
    this.water = water;
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T - 0.02, L - 2 * T - 0.02), new THREE.MeshStandardMaterial({ color: '#ffffff', map: fabric({ base: '#ffffff', seed: 22, scale: 2 }), roughness: 1, transparent: true, opacity: 0 }));
    this.foam.rotation.x = -Math.PI / 2; this.foam.visible = false; root.add(this.foam);
    // shower: head & arm on east wall near the south end
    const chrome = MAT.chrome();
    const arm = tube([[W / 2, 2.05, 0.55], [W / 2 - 0.25, 2.1, 0.55], [W / 2 - 0.32, 2.05, 0.55]], 0.012, chrome, 12, 8); root.add(arm);
    const head = cyl(0.11, 0.11, 0.015, chrome, 32); at(head, W / 2 - 0.34, 2.03, 0.55); root.add(head);
    this.headPos = new THREE.Vector3((x0 + x1) / 2 + W / 2 - 0.34, 2.0, (z0 + z1) / 2 + 0.55);
    const valve = cyl(0.04, 0.04, 0.03, chrome, 20); valve.rotation.z = Math.PI / 2; at(valve, W / 2 - 0.015, 1.05, 0.55); root.add(valve);
    const spout = tube([[W / 2, 0.68, 0.55], [W / 2 - 0.14, 0.68, 0.55], [W / 2 - 0.16, 0.64, 0.55]], 0.016, chrome, 10, 8); root.add(spout);
    // glass screen
    const glass = box(0.012, 1.4, 0.9, MAT.glass('#e3f1f6', 0.18), { cast: false }); at(glass, -W / 2 + 0.03, Ht + 0.7, L / 2 - 0.45); root.add(glass);
    const glassTrim = box(0.02, 0.02, 0.9, chrome); at(glassTrim, -W / 2 + 0.03, Ht + 1.4, L / 2 - 0.45); root.add(glassTrim);
    // shelf niche with bottles
    const bottles = [['#7ec4cf', 0.2], ['#f2b5d4', 0.17], ['#e9e3c9', 0.15]];
    bottles.forEach(([col, h], i) => { const b = rbox(0.06, h, 0.04, 0.015, mat(col, { rough: 0.3, clearcoat: 0.5 })); at(b, W / 2 - 0.05, Ht + h / 2, -L / 2 + 0.15 + i * 0.08); root.add(b); });
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    this.outline = false;
    apt.addCollider(x0, x1, z0, z1, 'tub', Ht);
    this.showerOn = false;
    this.showerSound = null;
    apt.updaters.push((dt) => this.update(dt));
    // bath mat
    const matRug = rbox(0.5, 0.012, 0.8, 0.005, mat('#cfd9d3', { rough: 1, map: fabric({ base: '#ffffff', seed: 31, knit: true }) }), { cast: false });
    at(matRug, 2.75, 0.006, 4.1); apt.root.add(matRug);
  }
  getActions() {
    const held = G.hand.held;
    const acts = [
      { key: 'E', label: 'Take a shower', run: () => this.shower() },
      { key: 'F', label: held?.def.use?.type === 'bathbomb' ? `Bath with ${held.def.name}` : 'Run a bath', run: () => this.bath() },
      { key: 'R', label: this.showerOn ? 'Shower off' : 'Shower on', run: () => this.setShower(!this.showerOn) },
    ];
    return acts;
  }
  setShower(on) {
    this.showerOn = on;
    if (on && !this.showerSound) this.showerSound = G.audio.loop('shower', { pos: this.headPos, volume: 0.8 });
    if (!on && this.showerSound) { this.showerSound.stop(); this.showerSound = null; }
    G.audio.play('click', { pos: this.headPos, pitch: 0.7 });
  }
  // gather shower products owned (cabinet/storage/world) for a bonus
  _products(type) {
    return G.items.all().filter((i) => i.def.use?.type === type && i.data.loc !== 'world-trash' && (i.data.st.uses ?? 1) > 0 && ['cabinet', 'storage', 'world', 'hand'].includes(i.data.loc));
  }
  async shower() {
    const tubCenter = this.root.position.clone();
    const release = G.player.occupy({ pos: new THREE.Vector3(tubCenter.x - 0.05, 0.08, tubCenter.z + 0.15), yaw: -Math.PI / 2 + 0.3, pitch: 0.1, eye: 1.62, label: 'Showering' });
    this.setShower(true);
    G.ui.setSteam(true);
    const ok = await G.ui.progress('Showering', 7, { icon: '🚿' });
    this.setShower(false);
    G.ui.setSteam(false);
    release();
    G.apartment.vanity.mirror.fogLevel = 0.9;
    if (!ok) return;
    const gain = { hygiene: 100, comfort: 8 };
    const used = [];
    for (const t of ['shampoo', 'bodywash', 'conditioner']) {
      const p = this._products(t)[0];
      if (p) { used.push(p); G.behaviors.consumeUse(p); }
    }
    G.needs.add(gain);
    G.needs.addBuff(used.length ? 'pampered' : 'fresh', used.length ? 240 : 120);
    if (used.length) G.ui.toast(`Used ${used.map((u) => u.def.name).join(', ')} ✨`, { icon: '🧴', kind: 'good' });
    G.state.stats.showers++;
    G.events.emit('act', 'shower', { products: used.length });
  }
  async bath() {
    const held = G.hand.held;
    const bomb = held?.def.use?.type === 'bathbomb' ? held : null;
    this.water.visible = true;
    const fill = G.audio.loop('bath', { pos: this.root.position, volume: 0.7 });
    const color = bomb ? new THREE.Color(bomb.def.use.color || '#ff8fc8') : new THREE.Color('#bfe3f0');
    this.waterMat.color.copy(new THREE.Color('#bfe3f0'));
    await new Promise((res) => tween({ duration: 2.5, ease: Ease.inOutQuad, update: (t, e) => { this.water.scale.y = 0.4 * e; this.water.position.y = 0.08 + 0.2 * e; }, done: res }));
    fill.stop();
    this.foam.visible = true; this.foam.position.y = 0.481;
    if (bomb) {
      G.hand.release(); G.items.destroy(bomb);
      G.audio.play('fizz', { pos: this.root.position });
      const p = this.root.position.clone().setY(0.5);
      G.particles.burst(p, 30, [bomb.def.use.color || '#ff8fc8', '#ffffff'], { speed: 0.6, up: 0.4, size: 0.02, floor: 0.48 });
      tween({ duration: 3, update: (t) => { this.waterMat.color.copy(new THREE.Color('#bfe3f0').lerp(color, t)); this.foam.material.opacity = t * 0.8; } });
      G.particles.sparkle(p, 25, [bomb.def.use.color || '#ff8fc8', '#ffffff']);
    } else tween({ duration: 2, update: (t) => { this.foam.material.opacity = t * 0.35; } });
    const c = this.root.position;
    const release = G.player.occupy({ pos: new THREE.Vector3(c.x, 0.15, c.z - 0.3), yaw: Math.PI, pitch: -0.25, eye: 0.62, label: 'Relaxing in the bath' });
    G.ui.setSteam(true, 0.4);
    const ok = await G.ui.progress(bomb ? `Soaking in ${bomb.def.name}` : 'Soaking in the bath', 10, { icon: '🛁' });
    G.ui.setSteam(false);
    release();
    G.audio.play('glug', { pos: this.root.position });
    tween({ duration: 2.5, update: (t, e) => { this.water.scale.y = 0.4 * (1 - e) + 0.001; this.water.position.y = 0.28 - 0.2 * e; this.foam.position.y = 0.481 - 0.4 * e; this.foam.material.opacity *= 0.98; }, done: () => { this.water.visible = false; this.foam.visible = false; } });
    if (!ok) return;
    G.needs.add({ hygiene: 80, comfort: 30, fun: bomb ? 25 : 10, energy: 10 });
    G.needs.addBuff(bomb ? 'blissful' : 'relaxed', bomb ? 300 : 180);
    G.events.emit('act', 'bath', { bomb: !!bomb });
  }
  update(dt) {
    if (this.showerOn) {
      this._t = (this._t || 0) + dt;
      while (this._t > 0.02) {
        this._t -= 0.02;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.09;
        G.particles.drops(this.headPos.clone().add(new THREE.Vector3(Math.cos(a) * r, -0.03, Math.sin(a) * r)), new THREE.Vector3(Math.cos(a) * 0.3, -2.5, Math.sin(a) * 0.3), 1, '#e8f6ff', { rand: 0.1, life: 0.9, size: 0.06, floor: 0.09, alpha: 0.5 });
      }
      if (Math.random() < 0.15) G.particles.steam(this.headPos.clone().setY(rand(0.5, 1.4)), 1, { size: 0.15, sizeEnd: 0.6, alpha: 0.1, life: 3 });
    }
  }
}

class TowelRail extends Interactable {
  constructor(apt) {
    super('Heated Towel Rail', 'towel');
    const root = new THREE.Group(); root.position.set(3.93, 0, 2.55); root.rotation.y = -Math.PI / 2;
    const chrome = MAT.chrome();
    for (const s of [-1, 1]) root.add(at(cyl(0.012, 0.012, 0.8, chrome, 12), s * 0.28, 1.2, 0.06));
    for (let i = 0; i < 6; i++) { const b = cyl(0.009, 0.009, 0.56, chrome, 8); b.rotation.z = Math.PI / 2; at(b, 0, 0.85 + i * 0.13, 0.06); root.add(b); }
    const towelMat = mat('#e8d9c7', { rough: 1, map: fabric({ base: '#ffffff', seed: 40, knit: true }), sheen: 0.6 });
    const towel = rbox(0.46, 0.55, 0.03, 0.01, towelMat); at(towel, 0, 1.25, 0.08); root.add(towel);
    const towel2 = rbox(0.4, 0.32, 0.03, 0.01, mat('#8fb3ad', { rough: 1, map: fabric({ base: '#ffffff', seed: 41, knit: true }) })); at(towel2, 0, 0.98, 0.1); root.add(towel2);
    apt.root.add(root);
    this.attach(root);
  }
  getActions() { return [{ key: 'E', label: 'Dry off with a warm towel', run: async () => { if (await G.ui.progress('Drying off', 2, { icon: '🧖' })) { G.needs.add({ comfort: 8 }); G.audio.play('rustle'); } } }]; }
}

export function buildBathroom(apt) {
  apt.vanity = new Vanity(apt);
  apt.toilet = new Toilet(apt);
  apt.tub = new Tub(apt);
  apt.towelRail = new TowelRail(apt);
  void sph; void plane; void rand;
}
