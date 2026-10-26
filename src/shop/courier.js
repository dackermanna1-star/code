// Delivery couriers: a uniformed person walks from the elevator to your door,
// drops the package, knocks and heads back. Seen through the peephole or an open door.
import * as THREE from 'three';
import { G } from '../game.js';
import { STORES } from './stores.js';
import { buildPerson } from '../player/avatar.js';
import { rbox, mat, at } from '../items/kit.js';
import { pick } from '../core/utils.js';

const ELEVATOR = new THREE.Vector3(2.8, 0, 6.45);
const DOOR = new THREE.Vector3(-0.45, 0, 6.05);

export class Couriers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    G.events.on('courierArriving', (o) => this.spawn(o, false));
    G.events.on('delivered', (o) => {
      const c = this.list.find((x) => x.order === o.id);
      if (c) c.state = 'drop';
      else this.spawn(o, true);
    });
  }

  spawn(order, atDoor) {
    if (this.list.length > 2) return;
    const s = STORES[order.store] || { color: '#333', color2: '#eee' };
    const p = buildPerson({
      skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 6), hairColor: Math.floor(Math.random() * 6),
      top: { style: pick(['tee', 'jacket', 'hoodie']), color: s.color, color2: s.color2 }, bottom: { style: 'pants', color: '#2b2d31' },
      shoes: { style: 'sneakers', color: '#222', color2: '#eee' }, hat: { style: 'cap', color: s.color, color2: s.color2 }, layer: 0,
    });
    const box = rbox(0.34, 0.24, 0.26, 0.02, mat(s.kind === 'food' ? '#c9a57a' : '#c49a6c', { rough: 0.9 }));
    at(box, 0, 1.0, 0.28);
    p.body.add(box);
    const g = new THREE.Group(); g.add(p.body);
    g.position.copy(atDoor ? DOOR : ELEVATOR);
    this.scene.add(g);
    this.list.push({ order: order.id, g, p, box, state: atDoor ? 'drop' : 'in', t: 0, wait: 0 });
  }

  update(dt) {
    for (const c of [...this.list]) {
      c.t += dt;
      let target = null;
      if (c.state === 'in') target = DOOR;
      if (c.state === 'out') target = ELEVATOR;
      let moving = false;
      if (target) {
        const d = target.clone().sub(c.g.position); d.y = 0;
        const dist = d.length();
        if (dist > 0.05) {
          moving = true;
          d.normalize();
          c.g.position.addScaledVector(d, Math.min(dist, 1.35 * dt));
          c.g.rotation.y = Math.atan2(d.x, d.z);
        } else if (c.state === 'out') { this.scene.remove(c.g); this.list = this.list.filter((x) => x !== c); continue; }
      }
      if (c.state === 'drop') {
        c.wait += dt;
        c.g.rotation.y = THREE.MathUtils.damp(c.g.rotation.y, Math.PI, 6, dt);
        c.box.visible = c.wait < 0.8;
        c.p.body.position.y = -Math.sin(Math.min(1, c.wait / 0.8) * Math.PI) * 0.12;
        if (c.wait > 1.2 && c.wait < 1.3) { c.p.arms[1].shoulder.rotation.z = 2.4; }
        if (c.wait > 2.6) { c.state = 'out'; c.p.arms[1].shoulder.rotation.z = 0.12; }
      }
      // walk cycle
      const sw = moving ? Math.sin(c.t * 9) : 0;
      for (const a of c.p.arms) if (c.state !== 'drop' || a.s < 0) { a.shoulder.rotation.x = c.box.visible ? -0.9 : sw * 0.5 * a.s; a.elbow.rotation.x = c.box.visible ? -0.9 : -0.2; }
      const hips = c.p.body.children.filter((h) => h.isGroup && Math.abs(h.position.y - 0.94) < 0.01);
      hips.forEach((h, i) => { h.rotation.x = sw * 0.45 * (i ? 1 : -1); });
      if (moving) c.p.body.position.y = Math.abs(Math.sin(c.t * 9)) * 0.02;
    }
  }
}
