// Mounted minigun: a usable turret with limited traverse, spin-up and
// overheating. Survivors mount it with E; view is clamped to the gun's arc.
import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { cloneModel } from './weaponModels.js';
import { usable } from '../levels/kit.js';
import { wrapAngle, clamp } from '../core/math.js';

export class MountedGun {
  constructor(L, x, y, z, yaw, o = {}) {
    this.L = L;
    this.game = L.game;
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = yaw;
    this.arc = o.arc ?? 1.15;
    this.weapon = new Weapon('minigun');
    this.heat = 0;
    this.overheated = 0;
    this.spin = 0;
    this.user = null;
    // stand + gun visuals
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.45 });
    const legs = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), dark);
      leg.position.set(Math.sin(a) * 0.35, 0.5, Math.cos(a) * 0.35);
      leg.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
      legs.add(leg);
    }
    g.add(legs);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), dark);
    post.position.y = 1.05;
    g.add(post);
    this.head = new THREE.Group();
    this.head.position.y = 1.25;
    const gun = cloneModel('minigun');
    gun.position.set(0, 0, 0.2);
    this.head.add(gun);
    this.gunModel = gun;
    // bullet box + shield plate
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), dark);
    shield.position.set(0, 0.15, -0.35);
    this.head.add(shield);
    g.add(this.head);
    g.position.copy(this.pos);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    L.addObject(g);
    this.group = g;
    this.head.rotation.y = yaw;
    L.col.addBox(x - 0.35, y, z - 0.35, x + 0.35, y + 1.2, z + 0.35, 'metal');
    // seat position (where the survivor stands)
    const back = 0.95;
    this.seat = new THREE.Vector3(x + Math.sin(yaw) * back, y, z + Math.cos(yaw) * back);
    this.u = usable(L, x, y + 1.2, z, 'Use mounted minigun', (s) => this.mount(s), { once: false, radius: 1.8, sound: 'weaponPickup' });
    L.dynamics.push(this);
  }
  mount(s) {
    if (this.user || s.incapped || s.pinned) return;
    this.user = s;
    s.usingMounted = this;
    s.teleport(this.seat.x, this.seat.y, this.seat.z, this.yaw);
    this.u.enabled = false;
    s.onEvent?.('draw', -1);
    this.game.hud?.toast('Press E to dismount');
  }
  dismount() {
    const s = this.user;
    if (!s) return;
    s.usingMounted = null;
    this.user = null;
    this.u.enabled = true;
    this.spinSnd?.stop(0.3); this.spinSnd = null;
    s.onEvent?.('draw', s.slot);
  }
  // Called from Survivor.update before weapon logic: clamp view, handle heat.
  control(s, dt) {
    const c = s.cmd;
    const client = !!this.game.net?.client; // co-op client: host owns mounting, heat and sound
    if (!client && (s.incapped || s.pinned || s.dead)) { this.dismount(); return false; }
    s.phys.vx = s.phys.vz = 0;
    s.phys.x = this.seat.x; s.phys.z = this.seat.z;
    s.pos.x = this.seat.x; s.pos.z = this.seat.z;
    const rel = wrapAngle(s.yaw - this.yaw);
    s.yaw = this.yaw + clamp(rel, -this.arc, this.arc);
    s.pitch = clamp(s.pitch, -0.45, 0.35);
    this.head.rotation.set(0, s.yaw, 0);
    this.gunModel.rotation.x = s.pitch;
    const firing = c.fire && this.overheated <= 0;
    this.spin = Math.max(0, Math.min(1, this.spin + (c.fire ? dt * 2.5 : -dt * 1.2)));
    if (client) {
      const sp = this.gunModel.userData.spin;
      if (sp) sp.rotation.z += this.spin * dt * 40;
      return firing && this.spin > 0.4;
    }
    if (firing && this.spin > 0.4) this.heat += dt * 0.16;
    else this.heat = Math.max(0, this.heat - dt * 0.22);
    if (this.heat >= 1) { this.overheated = 3.5; this.heat = 1; this.game.audio.play('oxygenHiss', { pos: this.pos, vol: 0.6 }); this.game.hud?.toast('Minigun overheated!'); }
    if (this.overheated > 0) { this.overheated -= dt; if (this.overheated <= 0) this.heat = 0.6; }
    const sp = this.gunModel.userData.spin;
    if (sp) sp.rotation.z += this.spin * dt * 40;
    if (c.fire && !this.spinSnd) this.spinSnd = this.game.audio.loop('minigunSpin', { pos: this.pos, vol: 0.8 });
    if (!c.fire && this.spinSnd) { this.spinSnd.stop(0.4); this.spinSnd = null; }
    if (c.usePressed || c.jump) { this.dismount(); return false; }
    // allow firing only once spun up
    return firing && this.spin > 0.4;
  }
  update(dt) {
    if (!this.user) {
      this.heat = Math.max(0, this.heat - dt * 0.3);
      this.spin = Math.max(0, this.spin - dt);
    }
    // glow when hot
    const hot = this.heat;
    this.gunModel.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { /* shared mats: skip */ } });
  }
}
