// Doors, light switches and the thermostat.
import * as THREE from 'three';
import { G } from '../../game.js';
import { Interactable } from '../interactable.js';
import { mat, box, rbox, cyl, sph, at, group, decal, FONT } from '../../items/kit.js';
import { tween, Ease } from '../../core/tween.js';
import { ROOMS, H } from '../apartment.js';

export class Door extends Interactable {
  // hinge: world position of hinge; width; closedYaw; openYaw delta; axis
  constructor(apt, { id, name, hinge, width = 0.9, height = 2.12, yaw = 0, swing = 1.55, front = false, wallAxis = 'z' }) {
    super(name, 'door');
    this.apt = apt; this.id = id; this.front = front; this.isOpen = false; this.swing = swing; this.angle = 0;
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    pivot.rotation.y = yaw;
    this.baseYaw = yaw;
    const slabMat = front ? mat('#22262b', { rough: 0.4, clearcoat: 0.4 }) : mat('#f2efea', { rough: 0.5 });
    const slab = rbox(width - 0.01, height - 0.01, 0.045, 0.006, slabMat);
    at(slab, (width) / 2, height / 2, 0);
    pivot.add(slab);
    // panels / grooves
    const groove = mat(front ? '#1a1d21' : '#e6e2db', { rough: 0.6 });
    for (const y of front ? [0.65, 1.5] : [0.55, 1.45]) {
      for (const s of [1, -1]) {
        const p = box(width - 0.22, 0.012, 0.004, groove, { cast: false }); at(p, width / 2, y, s * 0.024); pivot.add(p);
      }
    }
    // lever handles both sides
    const chrome = front ? mat('#c9a66b', { rough: 0.25, metal: 1 }) : mat('#d8dbe0', { rough: 0.2, metal: 1 });
    for (const s of [1, -1]) {
      const rose = cyl(0.028, 0.028, 0.012, chrome, 20); rose.rotation.x = Math.PI / 2; at(rose, width - 0.08, 1.0, s * 0.03); pivot.add(rose);
      const lever = rbox(0.13, 0.018, 0.018, 0.008, chrome); at(lever, width - 0.13, 1.0, s * 0.05); pivot.add(lever);
    }
    if (front) {
      const peep = cyl(0.008, 0.008, 0.06, mat('#c9a66b', { rough: 0.2, metal: 1 }), 12); peep.rotation.x = Math.PI / 2; at(peep, width / 2, 1.55, 0); pivot.add(peep);
      const bolt = cyl(0.022, 0.022, 0.06, chrome, 16); bolt.rotation.x = Math.PI / 2; at(bolt, width - 0.08, 1.2, 0); pivot.add(bolt);
      const num = decal(0.12, 0.06, 'door-num', (ctx, w, h) => { ctx.fillStyle = '#c9a66b'; ctx.font = `600 ${h * 0.8}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2403', w / 2, h / 2); }, { tw: 128, th: 64 });
      num.rotation.y = Math.PI; at(num, width / 2, 1.72, -0.025); pivot.add(num);
    }
    // hinges
    for (const y of [0.25, 1.05, 1.85]) { const h = cyl(0.008, 0.008, 0.09, chrome, 8); at(h, 0, y, 0); pivot.add(h); }
    apt.root.add(pivot);
    this.pivot = pivot;
    this.attach(slab);
    this.outline = slab;
    // frame casing on both sides of the opening
    const caseMat = mat('#f4f2ee', { rough: 0.5 });
    const casing = new THREE.Group();
    const cw = 0.07, cd = (wallAxis === 'z' ? 0.16 : 0.34);
    casing.add(at(box(cw, height + cw, cd, caseMat), -cw / 2, (height + cw) / 2, 0));
    casing.add(at(box(cw, height + cw, cd, caseMat), width + cw / 2, (height + cw) / 2, 0));
    casing.add(at(box(width + cw * 2, cw, cd, caseMat), width / 2, height + cw / 2, 0));
    casing.position.copy(hinge); casing.rotation.y = yaw;
    apt.root.add(casing);
    // collider (closed)
    const a = new THREE.Vector3(0, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(hinge);
    const b = new THREE.Vector3(width, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(hinge);
    this.collider = apt.addCollider(Math.min(a.x, b.x) - 0.04, Math.max(a.x, b.x) + 0.04, Math.min(a.z, b.z) - 0.04, Math.max(a.z, b.z) + 0.04, 'door');
    apt.addSolid(slab);
    this.slab = slab;
    if (G.state.flags['door_' + id]) this.setOpen(true, true);
  }

  getActions() {
    const acts = [{ key: 'E', label: this.isOpen ? 'Close' : 'Open', run: () => this.toggle() }];
    if (this.front && !this.isOpen && G.player.pos.z < 5) acts.push({ key: 'F', label: 'Look through peephole', run: () => G.player.peephole?.() });
    return acts;
  }

  toggle() { this.setOpen(!this.isOpen); }

  setOpen(open, instant = false) {
    if (open === this.isOpen && !instant) return;
    this.isOpen = open;
    G.state.flags['door_' + this.id] = open;
    this.collider.enabled = !open;
    const from = this.angle, to = open ? this.swing : 0;
    if (!instant) G.audio.play(open ? 'door' : 'door', { pos: this.pivot.position, close: !open, delay: open ? 0 : 0.25 });
    if (!instant && this.front) G.audio.play('latch', { pos: this.pivot.position });
    this.tw?.cancel();
    if (instant) { this.angle = to; this.pivot.rotation.y = this.baseYaw + to; return; }
    this.tw = tween({ duration: 0.6, ease: Ease.inOutCubic, update: (t, e) => { this.angle = from + (to - from) * e; this.pivot.rotation.y = this.baseYaw + this.angle; } });
    if (this.front) G.events.emit('frontDoor', open);
  }
}

export function buildDoors(apt) {
  apt.doors = {};
  // bedroom door on wall x=1, opening z -0.25..0.65, swings into bedroom
  apt.doors.bedroom = new Door(apt, { id: 'bedroom', name: 'Bedroom Door', hinge: new THREE.Vector3(1, 0, -0.25), width: 0.9, yaw: -Math.PI / 2, swing: 1.5 });
  // bathroom door on wall x=1, opening z 2.6..3.5, swings into bathroom
  apt.doors.bath = new Door(apt, { id: 'bath', name: 'Bathroom Door', hinge: new THREE.Vector3(1, 0, 3.5), width: 0.9, yaw: Math.PI / 2, swing: -1.5 });
  // front door on wall z=5.15, opening x -1.1..-0.1, swings inward
  apt.doors.front = new Door(apt, { id: 'front', name: 'Front Door', hinge: new THREE.Vector3(-0.1, 0, 5.15), width: 1.0, height: 2.17, yaw: Math.PI, swing: -1.6, front: true, wallAxis: 'x' });
  // the front door's own collider blocks the doorway while it's shut; open it
  // to step out into the building hallway
}

// ------------------------------------------------------------------ switches
export class LightSwitch extends Interactable {
  constructor(apt, room, pos, yaw) {
    super(() => `${ROOMS[room]?.name || room} Lights`, 'switch');
    this.room = room;
    const plate = rbox(0.08, 0.12, 0.012, 0.004, mat('#f7f6f3', { rough: 0.4 }));
    const rocker = rbox(0.03, 0.06, 0.012, 0.003, mat('#ffffff', { rough: 0.35 }));
    at(rocker, 0, 0, 0.01);
    this.rocker = rocker;
    const g = group(plate, rocker);
    g.position.copy(pos); g.rotation.y = yaw;
    apt.root.add(g);
    this.attach(g);
    this.update();
    G.events.on('lightsChanged', () => this.update());
  }
  update() { this.rocker.rotation.x = G.state.home.lights[this.room] ? -0.25 : 0.25; }
  getActions() {
    const on = G.state.home.lights[this.room];
    return [{ key: 'E', label: on ? 'Turn off' : 'Turn on', run: () => { G.audio.play('switch', { pos: this.object.position }); G.apartment.setRoomLight(this.room, !on); G.events.emit('act', 'lightSwitch', { room: this.room, on: !on }); } }];
  }
}

export class Thermostat extends Interactable {
  constructor(apt, pos, yaw) {
    super('Smart Thermostat', 'thermostat');
    const body = cyl(0.055, 0.055, 0.025, mat('#1b1d20', { rough: 0.3, metal: 0.4 }), 32);
    body.rotation.x = Math.PI / 2;
    const ring = cyl(0.058, 0.058, 0.012, mat('#c9ccd1', { rough: 0.2, metal: 1 }), 32);
    ring.rotation.x = Math.PI / 2; ring.position.z = -0.006;
    this.screenMat = mat('#ff9a3d', { emissive: '#ff9a3d', ei: 1.2 });
    const scr = cyl(0.03, 0.03, 0.002, this.screenMat, 24); scr.rotation.x = Math.PI / 2; scr.position.z = 0.0135;
    const g = group(body, ring, scr);
    g.position.copy(pos); g.rotation.y = yaw;
    apt.root.add(g);
    this.attach(g);
    this.update();
  }
  update() {
    const t = G.state.home.thermostat;
    this.screenMat.emissive.set(t < 20 ? '#3da5ff' : t > 23 ? '#ff6a2d' : '#ffb347');
  }
  getActions() {
    const t = G.state.home.thermostat;
    return [
      { key: 'E', label: `Warmer (${t}°C)`, run: () => this.set(t + 1) },
      { key: 'F', label: 'Cooler', run: () => this.set(t - 1) },
    ];
  }
  set(v) {
    G.state.home.thermostat = Math.max(16, Math.min(27, v));
    G.audio.play('beep', { pos: this.object.position, pitch: v > G.state.home.thermostat ? 0.9 : 1.1 });
    this.update();
    G.ui.toast(`Thermostat set to ${G.state.home.thermostat}°C`, { icon: '🌡️' });
  }
}

export function buildSwitches(apt) {
  apt.switches = [
    new LightSwitch(apt, 'living', new THREE.Vector3(1 - 0.061, 1.25, -0.45), -Math.PI / 2),
    new LightSwitch(apt, 'bedroom', new THREE.Vector3(1 + 0.061, 1.25, -0.45), Math.PI / 2),
    new LightSwitch(apt, 'entry', new THREE.Vector3(0.25, 1.25, 5 - 0.006), Math.PI),
    new LightSwitch(apt, 'kitchen', new THREE.Vector3(-2 - 0.061, 1.25, 2.75), -Math.PI / 2),
    new LightSwitch(apt, 'bath', new THREE.Vector3(1 + 0.061, 1.25, 2.4), Math.PI / 2),
    new LightSwitch(apt, 'closet', new THREE.Vector3(4.75, 1.25, 1.5 + 0.061), 0),
  ];
  apt.thermostat = new Thermostat(apt, new THREE.Vector3(1 - 0.061, 1.45, 1.6), -Math.PI / 2);
  void H; void sph;
}
