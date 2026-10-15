// World objects: pickups, projectiles (throwables, grenades, rocks, spit), hazards
// (fire, acid), carryable props (gas cans, propane, oxygen, cola), doors, lures, explosions.
import * as THREE from 'three';
import { WEAPONS, MELEE, ITEMS, THROWABLES, SURVIVOR, DIFFICULTY, U } from './config.js';
import { buildWeaponModel, buildItemModel } from './itemmodels.js';
import { DynamicBox, SURF } from '../engine/collision.js';
import { createPS1Material, clonePS1 } from '../engine/ps1material.js';
import { MeshKit } from '../engine/meshkit.js';
import { tex } from '../engine/textures.js';
import { makeItemGlowMaterial } from './glow.js';
import { charAtlas } from './rig.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

const glowMats = {};
function glowMat(key, color, alpha) { return glowMats[key] || (glowMats[key] = makeItemGlowMaterial(color, alpha)); }

function addGlowShell(model) {
  const shells = [];
  model.traverse((o) => {
    if (o.isMesh && !o.userData.isGlow) {
      const g = new THREE.Mesh(o.geometry, glowMat('item', [0.7, 0.7, 1.0], 0.5));
      g.userData.isGlow = true; g.renderOrder = 3; g.visible = false;
      o.add(g); shells.push(g);
    }
  });
  return shells;
}

export function displayName(id) {
  if (WEAPONS[id]) return WEAPONS[id].name;
  if (MELEE[id]) return MELEE[id].name;
  if (ITEMS[id]) return ITEMS[id].name;
  return { ammo_pile: 'Ammo', laser_sight: 'Laser Sight', upgrade_incendiary_deployed: 'Incendiary Ammo', upgrade_explosive_deployed: 'Explosive Ammo', gascan: 'Gas Can', propane: 'Propane Tank', oxygen: 'Oxygen Tank', cola: 'Cola', fireworks: 'Fireworks' }[id] || id;
}

// ===================================================================== Pickup
export class Pickup {
  constructor(world, id, pos, data = {}) {
    this.world = world; this.id = id;
    this.pos = pos.clone();
    this.count = data.count || 1;
    this.infinite = !!data.infinite;
    this.data = data;
    this.uses = data.uses || 0;
    this.usedBy = new Set();
    this.isWeapon = !!(WEAPONS[id] || MELEE[id]);
    let model;
    const modelId = id === 'ammo_pile' ? 'ammo_pile' : id === 'laser_sight' ? 'laser_sight' : id.startsWith('upgrade_') ? id.replace('_deployed', '') : id;
    try { model = this.isWeapon ? buildWeaponModel(id === 'dual_pistols' ? 'pistol' : id) : buildItemModel(modelId); }
    catch (e) { model = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), createPS1Material({ color: 0xff00ff })); }
    this.model = model;
    if (this.isWeapon) {
      // lie on its side on the ground
      model.rotation.set(0, data.yaw !== undefined ? data.yaw : Math.random() * Math.PI * 2, Math.PI / 2, 'YXZ');
      model.position.copy(pos).add(_v.set(0, 0.05, 0));
    } else {
      model.position.copy(pos);
      model.rotation.y = data.yaw !== undefined ? data.yaw : Math.random() * Math.PI * 2;
    }
    world.scene.add(model);
    this.glow = addGlowShell(model);
    this.radius = this.isWeapon ? 0.45 : 0.3;
    this.light = new THREE.Color();
    model.traverse((o) => { if (o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uAmbient && !o.userData.isGlow) { o.material = o.material.clone ? cloneMat(o.material) : o.material; this.mat = this.mat || o.material; o.material.uniforms.uAmbient.value.copy(world.probeAt(pos)); } });
  }
  focusPos() { return _v3.copy(this.pos).add(_v.set(0, 0.15, 0)); }
  usable(s) {
    if (this.taken) return false;
    if (this.id.endsWith('_deployed')) return !this.usedBy.has(s) && !!s.inv.primary && !s.inv.primary.def.melee;
    if (this.id === 'ammo_pile') return true;
    if (this.id === 'laser_sight') return !!s.inv.primary && !s.inv.primary.laser;
    return true;
  }
  takeBy(s) {
    const w = this.world;
    if (this.id === 'ammo_pile') {
      const p = s.inv.primary;
      if (p && p.def.reserve && p.def.reserve !== Infinity && p.id !== 'grenade_launcher' && p.id !== 'm60') {
        p.reserve = p.def.reserve + (p.def.clip - p.clip > 0 ? 0 : 0);
        w.sound('ammo_pickup', this.pos); w.message('Ammo refilled', 'item');
      } else if (p && p.id === 'grenade_launcher') { w.message('The grenade launcher can\'t use this ammo', 'item'); }
      return;
    }
    if (this.id === 'laser_sight') { s.inv.primary.laser = true; w.sound('laser_sight_on', this.pos); return; }
    if (this.id.endsWith('_deployed')) {
      const p = s.inv.primary;
      p.upgrade = { type: this.id.startsWith('upgrade_incendiary') ? 'incendiary' : 'explosive', rounds: p.def.clip };
      this.usedBy.add(s); w.sound('ammo_pickup', this.pos);
      if (this.usedBy.size >= 4) this.consume();
      return;
    }
    const old = s.give(this.id, this.data);
    w.sound(this.isWeapon ? 'pickup_weapon' : 'pickup_item', this.pos, { volume: 0.7 });
    w.events.emit('pickup', s, this.id);
    // swapped weapon/item stays where this one was
    if (old) {
      const oldId = old.id || old;
      if (oldId !== 'pistol' || this.isWeapon) {
        const data = old.id ? { clip: old.clip, reserve: old.reserve, fuel: old.fuel } : {};
        if (oldId === 'dual_pistols') { w.spawnPickup('pistol', this.pos, {}); }
        else w.spawnPickup(oldId, this.pos.clone().add(_v.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), data);
      }
    }
    if (!this.infinite) { this.count--; if (this.count <= 0) this.consume(); }
  }
  consume() { this.taken = true; this.world.removePickup(this); }
  update(dt) {
    const w = this.world;
    const p = w.player;
    if (!p) return;
    const d = p.body.pos.distanceTo(this.pos);
    const focused = p.useFocus === this;
    const show = !this.taken && (focused || d < 3.5);
    for (const g of this.glow) g.visible = show;
    const a = focused ? 0.75 : Math.max(0, 0.45 - d * 0.08);
    const col = p.blackAndWhite ? [1, 0.1, 0.1] : focused ? [0.7, 0.7, 1.0] : [0.3, 0.4, 1.0];
    if (this.glow.length) { const m = this.glow[0].material; if (!this.glowMatOwn) { this.glowMatOwn = makeItemGlowMaterial(col, a); for (const g of this.glow) g.material = this.glowMatOwn; } this.glowMatOwn.uniforms.uGlow.value.setRGB(...col); this.glowMatOwn.uniforms.uAlpha.value = a; }
  }
  dispose() { this.world.scene.remove(this.model); }
}

function cloneMat(m) { return m.isShaderMaterial ? clonePS1(m) : m.clone(); }

// ===================================================================== Lure (pipe bomb, bile, chainsaw...)
export class Lure {
  constructor(world, pos, kind, duration, radius = 30) {
    this.world = world; this.pos = pos.clone(); this.kind = kind; this.t = duration; this.active = true; this.radius = radius;
    const n = world.nav.nearest(pos.x, pos.y + 0.3, pos.z, 4);
    this.field = new Float32Array(world.nav.count);
    world.nav.flowField(n >= 0 ? [n] : [], this.field, true, radius + 20);
    this.recruit();
  }
  recruit() {
    for (const z of this.world.infected) {
      if (!z.alive || z.type !== 'common') continue;
      if (z.position.distanceTo(this.pos) < this.radius && this.field[z.node] < Infinity) { z.lure = this; if (z.state !== 'lured') z.setState('lured'); }
    }
  }
  update(dt) {
    this.t -= dt;
    if (Math.floor((this.t + dt) * 2) !== Math.floor(this.t * 2)) this.recruit();
    if (this.t <= 0) this.end();
  }
  end() { this.active = false; for (const z of this.world.infected) if (z.lure === this) { z.lure = null; if (z.state === 'lured') z.setState('chase'); } }
}

// ===================================================================== Projectiles
const projGeo = {};
function rockGeo() {
  if (projGeo.rock) return projGeo.rock;
  const k = new MeshKit(); k.defaultUV = charAtlas().cloth; k.blob([0, 0, 0], 0.45, 0x7a7670, { detail: 1, scale: [1, 0.8, 1.1] }); return (projGeo.rock = k.toGeometry());
}
export class Projectile {
  constructor(world, kind, pos, vel, owner, opts = {}) {
    this.world = world; this.kind = kind; this.pos = pos.clone(); this.vel = vel.clone(); this.owner = owner; this.opts = opts;
    this.t = 0; this.dead = false; this.bounces = 0; this.resting = false;
    let mesh;
    if (kind === 'rock') mesh = new THREE.Mesh(rockGeo(), createPS1Material({ map: charAtlas().texture, tint: true }));
    else if (kind === 'spit') { mesh = new THREE.Object3D(); this.spr = world.effects.bbAdd.add({ x: pos.x, y: pos.y, z: pos.z, w: 0.35, h: 0.35, life: 99, persist: true, r: 0.6, g: 1, b: 0.2, a: 1, uv: world.effects.bbAtlas.glow }); }
    else if (kind === 'grenade') { const k = new MeshKit(); k.defaultUV = charAtlas().cloth; k.box([0, 0, 0], [0.06, 0.06, 0.1], 0x4a5a3a); mesh = new THREE.Mesh(k.toGeometry(), createPS1Material({ map: charAtlas().texture, tint: true })); }
    else { try { mesh = buildItemModel(kind); } catch (e) { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1)); } }
    this.mesh = mesh; mesh.position.copy(pos);
    world.scene.add(mesh);
    this.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    if (kind === 'pipebomb') { this.fuse = THROWABLES.pipebomb.fuse; this.beepT = 0; this.beepInt = 0.5; this.lure = new Lure(world, pos, 'pipebomb', this.fuse + 0.2, 32); world.lures.push(this.lure); this.light = world.addLight(pos, new THREE.Color(1, 0.1, 0.05), 3, 99, 1.2, { persist: true }); }
    if (kind === 'molotov') { this.light = world.addLight(pos, new THREE.Color(1, 0.6, 0.2), 4, 99, 0.8, { persist: true, flicker: 1 }); }
    if (kind === 'rock') { this.hp = 50; this.radius = 0.45; }
  }
  update(dt) {
    const w = this.world;
    this.t += dt;
    if (this.kind === 'pipebomb') {
      this.fuse -= dt; this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = this.beepInt; this.beepInt = Math.max(0.1, this.beepInt - 0.025); w.sound('pipebomb_beep', this.pos, { volume: 0.8, priority: 2 }); this.blink = 0.06; }
      this.blink = Math.max(0, (this.blink || 0) - dt);
      if (this.light) { this.light.pos.copy(this.pos); this.light.base.setRGB(this.blink > 0 ? 1.5 : 0.1, 0.05, 0.02); }
      if (this.lure) this.lure.pos.copy(this.pos);
      if (this.fuse <= 0) { this.explodePipe(); return; }
    }
    if (this.kind === 'molotov' && this.light) { this.light.pos.copy(this.pos); if (Math.random() < 0.5) w.effects.fireSprite(this.pos.x, this.pos.y + 0.15, this.pos.z, 0.15, 0.25, { life: 0.2 }); }
    if (this.kind === 'spit') { if (Math.random() < 0.6) w.effects.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), 0.5, 0.9, 0.1, 1, 2.5, 0.4, 6, 0.5); }
    if (this.resting) { this.mesh.position.copy(this.pos); return; }
    const g = this.kind === 'grenade' ? 6 : this.kind === 'rock' ? 9 : 13;
    this.vel.y -= g * dt;
    const step = _v.copy(this.vel).multiplyScalar(dt);
    const len = step.length();
    // rock / spit / grenade can hit characters
    if (this.kind === 'rock' || this.kind === 'grenade' || this.kind === 'spit') {
      for (const s of w.survivors) {
        if (s.state === 'dead' || s === this.owner) continue;
        const c = s.center(_v2);
        if (c.distanceTo(this.pos) < (this.kind === 'rock' ? 1.0 : 0.6)) { this.hitCharacter(s); return; }
      }
      if (this.kind === 'grenade') {
        for (const z of w.infected) { if (z.alive && z.center(_v2).distanceTo(this.pos) < 0.6 + z.radius) { this.explodeGrenade(); return; } }
      }
    }
    if (len > 1e-5) {
      const dir = _v2.copy(step).multiplyScalar(1 / len);
      const hit = w.collision.raycast(this.pos, dir, len + 0.05, { move: true });
      if (hit) {
        this.pos.copy(hit.point).addScaledVector(hit.normal, 0.05);
        this.onImpact(hit);
        if (this.dead) return;
      } else this.pos.add(step);
    }
    if (this.spr) { this.spr.x = this.pos.x; this.spr.y = this.pos.y; this.spr.z = this.pos.z; }
    this.mesh.position.copy(this.pos);
    if (this.kind !== 'spit') { this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.z += this.spin.z * dt; }
    if (this.t > 12 && this.kind !== 'pipebomb') this.kill();
  }
  onImpact(hit) {
    const w = this.world;
    switch (this.kind) {
      case 'molotov': w.sound('molotov_shatter', hit.point); spawnFire(w, hit.point, THROWABLES.molotov.radius, THROWABLES.molotov.burn, this.owner); this.kill(); break;
      case 'bilejar': this.bile(hit.point); break;
      case 'grenade': this.explodeGrenade(); break;
      case 'rock': w.sound('rock_impact', hit.point); w.effects.explosion(hit.point, 0.4); for (let i = 0; i < 6; i++) w.effects.gibs.spawn('concrete', hit.point, new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6)); this.splashDamage(hit.point, 2.2); this.kill(); break;
      case 'spit': this.landSpit(hit); break;
      default: {
        // bounce (pipe bomb)
        const vn = this.vel.dot(hit.normal);
        this.vel.addScaledVector(hit.normal, -1.5 * vn).multiplyScalar(0.4);
        this.spin.multiplyScalar(0.5);
        if (this.bounces++ < 4) w.sound('melee_hit_world', hit.point, { volume: 0.3 });
        if (this.vel.length() < 1 && hit.normal.y > 0.6) this.resting = true;
      }
    }
  }
  hitCharacter(s) {
    const w = this.world;
    if (this.kind === 'rock') {
      const dmg = w.diff.tankPunch;
      s.takeDamage(dmg, { type: 'tank', attacker: this.owner, dir: this.vel.clone().normalize() });
      w.flingSurvivor(s, this.vel.clone().setY(0).normalize(), 6, 3);
      w.sound('tank_punch', s.body.pos);
      for (let i = 0; i < 5; i++) w.effects.gibs.spawn('concrete', this.pos, new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5));
      this.kill();
    } else if (this.kind === 'grenade') this.explodeGrenade();
    else if (this.kind === 'spit') { const g = w.collision.groundAt(s.body.pos.x, s.body.pos.y + 0.5, s.body.pos.z, 3); this.landSpit({ point: new THREE.Vector3(s.body.pos.x, g ? g.y : s.body.pos.y, s.body.pos.z), normal: new THREE.Vector3(0, 1, 0) }); }
  }
  splashDamage(p, r) {
    for (const s of this.world.survivors) {
      if (s.state === 'dead') continue;
      if (s.center(_v3).distanceTo(p) < r) { s.takeDamage(this.world.diff.tankPunch * 0.6, { type: 'tank', attacker: this.owner, dir: _v2.copy(s.body.pos).sub(p).normalize() }); this.world.flingSurvivor(s, _v2.copy(s.body.pos).sub(p).setY(0).normalize(), 4, 2); }
    }
  }
  landSpit(hit) {
    const w = this.world;
    // drip down to the floor
    let p = hit.point.clone();
    if (hit.normal.y < 0.6) { const g = w.collision.groundAt(p.x, p.y, p.z, 6); if (g) p.y = g.y; }
    w.hazards.push(new AcidPool(w, p, this.owner));
    w.sound('acid_sizzle', p, { volume: 0.8 });
    this.kill();
  }
  bile(p) {
    const w = this.world;
    w.sound('bile_shatter', p);
    w.effects.bileSplash(p);
    const g = w.collision.groundAt(p.x, p.y + 0.5, p.z, 3);
    if (g) w.effects.decals.add(new THREE.Vector3(p.x, g.y, p.z), g.normal, 2.4, 'bile');
    const r = THROWABLES.bilejar.radius * 1.4;
    let coatedSpecial = null;
    for (const z of w.infected) {
      if (!z.alive) continue;
      if (z.position.distanceTo(p) < r + 0.5) { z.biled = THROWABLES.bilejar.duration; if (z.type !== 'common') coatedSpecial = z; }
    }
    for (const s of w.survivors) if (s.state !== 'dead' && s.body.pos.distanceTo(p) < r) { s.biled = 5; s.bileScreen = 5; }
    const lure = new Lure(w, p, 'bile', THROWABLES.bilejar.duration, 40);
    lure.biledTargets = true;
    w.lures.push(lure);
    w.director.spawnMob(15, { near: p, reason: 'bile' });
    this.kill();
  }
  explodePipe() {
    const w = this.world;
    spawnExplosion(w, this.pos, { radius: THROWABLES.pipebomb.radius, damage: THROWABLES.pipebomb.damage, owner: this.owner, selfScale: 0.15, stumble: true });
    if (this.lure) this.lure.end();
    this.kill();
  }
  explodeGrenade() {
    const w = this.world;
    spawnExplosion(w, this.pos, { radius: 180 * U, outer: 250 * U, damage: 400, owner: this.owner, selfScale: 0.12, stumble: true, noTankStumble: true, special: this.opts.special });
    this.kill();
  }
  kill() {
    this.dead = true;
    if (this.light) this.world.removeLight(this.light);
    if (this.spr) this.spr.life = 0, this.spr.persist = false;
  }
  dispose() { this.world.scene.remove(this.mesh); }
}

// ===================================================================== Explosions
export function spawnExplosion(w, pos, o) {
  const r = o.radius || 4, outer = o.outer || r * 1.5;
  w.effects.explosion(pos, o.small ? 0.4 : 1);
  w.sound(o.small ? 'explosion_small' : 'explosion', pos, { volume: 1, priority: 3 });
  if (!o.small) w.events.emit('shake', pos, 1.0);
  for (const z of w.infected) {
    if (!z.alive) continue;
    const d = z.center(_v).distanceTo(pos);
    if (d > outer) continue;
    const k = d < r ? 1 : 1 - (d - r) / (outer - r);
    const dir = _v2.copy(z.position).sub(pos).setY(0).normalize();
    if (z.type === 'common') {
      if (d < r) z.takeDamage(o.small ? o.damage : 9999, { type: 'explosion', attacker: o.owner, dir: dir.clone(), weapon: null });
      else z.takeShove(o.owner, dir.clone(), true);
    } else {
      let dmg = o.damage * k;
      if (z.type === 'tank' && o.noTankStumble) dmg *= 3;
      z.takeDamage(dmg, { type: 'explosion', attacker: o.owner, dir: dir.clone() });
      if (z.alive && o.stumble && !(z.type === 'tank' && o.noTankStumble)) z.takeShove(o.owner, dir.clone(), true);
    }
    if (o.special === 'incendiary' && z.alive) z.ignite(o.owner);
  }
  for (const s of w.survivors) {
    if (s.state === 'dead') continue;
    const d = s.center(_v).distanceTo(pos);
    if (d > outer) continue;
    const k = d < r ? 1 : 1 - (d - r) / (outer - r);
    let dmg = (o.small ? 8 : 30) * k;
    if (o.owner && o.owner.isSurvivor) dmg *= o.selfScale !== undefined ? o.selfScale * 3 : w.diff.ff;
    if (o.boomer) dmg = 0;
    if (dmg > 0.5) s.takeDamage(dmg, { type: 'explosion', attacker: o.owner, dir: _v2.copy(s.body.pos).sub(pos).normalize(), interrupt: true });
    if (!o.small && s.state === 'alive' && !s.pinnedBy && d < r) w.flingSurvivor(s, _v2.copy(s.body.pos).sub(pos).setY(0).normalize(), 3 * k, 0.8);
  }
  // chain reactions
  for (const c of w.carryables) if (!c.carrier && c.pos.distanceTo(pos) < r && c.onShot) c.onShot(100, o.owner, c.pos, null, true);
  for (const g of w.breakables || []) if (g.center.distanceTo(pos) < r) g.break();
}

// ===================================================================== Fire & acid
export function spawnFire(w, p, radius, duration, owner, opts = {}) {
  const g = w.collision.groundAt(p.x, p.y + 0.6, p.z, 4);
  const pos = new THREE.Vector3(p.x, g ? g.y : p.y, p.z);
  const f = new FireArea(w, pos, radius, duration, owner, opts);
  w.hazards.push(f);
  return f;
}

export class FireArea {
  constructor(w, pos, radius, duration, owner, opts = {}) {
    this.world = w; this.pos = pos; this.radius = radius; this.t = duration; this.max = duration; this.owner = owner; this.dead = false;
    this.permanent = !!opts.permanent;
    this.flames = [];
    const n = opts.flames || Math.round(radius * radius * 1.6) + 4;
    // flames on a jittered disc; only where there's floor nearby
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * radius;
      const x = pos.x + Math.cos(a) * rr, z = pos.z + Math.sin(a) * rr;
      const gg = w.collision.groundAt(x, pos.y + 1, z, 2.5);
      if (!gg || Math.abs(gg.y - pos.y) > 1.2) continue;
      const h = 0.6 + Math.random() * 0.8;
      this.flames.push({ x, y: gg.y, z, h, spr: w.effects.fireSprite(x, gg.y + h * 0.45, z, h * 0.55, h, { persist: true }) });
      if (i % 3 === 0) w.effects.decals.add(new THREE.Vector3(x, gg.y, z), gg.normal, 1.2, 'scorch');
    }
    this.light = w.addLight(pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Color(1, 0.55, 0.2), radius * 3 + 4, 99, 1.5, { persist: true, flicker: 1 });
    this.snd = w.sound('fire_loop', pos, { loop: true, volume: 0.8 });
    w.sound('fire_burst', pos);
    this.tick = 0;
  }
  update(dt) {
    const w = this.world;
    if (!this.permanent) this.t -= dt;
    const fade = this.permanent ? 1 : Math.min(1, this.t / 2);
    for (const f of this.flames) { f.spr.a = 0.95 * fade; f.spr.h = f.h * (0.6 + 0.4 * fade); f.spr.w = f.h * 0.55; f.spr.y = f.y + f.spr.h * 0.45; }
    if (Math.random() < dt * 4 * fade) w.effects.smokePuff(this.pos.x + (Math.random() - 0.5) * this.radius, this.pos.y + 1.5, this.pos.z + (Math.random() - 0.5) * this.radius, { size: 1.2, life: 3, a: 0.4 });
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.2;
      const r2 = this.radius * this.radius;
      for (const z of w.infected) {
        if (!z.alive) continue;
        const dx = z.position.x - this.pos.x, dz = z.position.z - this.pos.z;
        if (dx * dx + dz * dz < r2 && Math.abs(z.position.y - this.pos.y) < 1.5) { z.ignite(this.owner); if (z.fireproof && z.type === 'common') z.takeDamage(4, { type: 'heat' }); }
      }
      for (const s of w.survivors) {
        if (s.state === 'dead') continue;
        const dx = s.body.pos.x - this.pos.x, dz = s.body.pos.z - this.pos.z;
        if (dx * dx + dz * dz < r2 * 0.85 && Math.abs(s.body.pos.y - this.pos.y) < 1.5) {
          s.takeDamage(40 * w.diff.burn * 0.2, { type: 'fire', attacker: this.owner, interrupt: false });
          s.onFire = 0.4;
        }
      }
      for (const c of w.carryables) if (!c.carrier && c.pos.distanceTo(this.pos) < this.radius && c.onShot) c.onShot(10, this.owner, c.pos, null, true);
    }
    if (this.t <= 0) this.dead = true;
  }
  dispose() {
    for (const f of this.flames) { f.spr.persist = false; f.spr.life = 0; }
    this.world.removeLight(this.light);
    if (this.snd) this.snd.stop(1);
  }
}

export class AcidPool {
  constructor(w, pos, owner, opts = {}) {
    this.world = w; this.pos = pos; this.owner = owner; this.dead = false;
    this.radius = opts.radius || 1.9; this.t = 0; this.dur = opts.duration || 7;
    w.effects.decals.add(pos, new THREE.Vector3(0, 1, 0), this.radius * 2.1, 'acid');
    this.light = w.addLight(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Color(0.4, 1, 0.15), 4, 99, 0.6, { persist: true, flicker: 0.5 });
    this.snd = w.sound('acid_sizzle', pos, { loop: true, volume: 0.6 });
    this.tick = 0;
  }
  update(dt) {
    const w = this.world;
    this.t += dt;
    if (Math.random() < dt * 30) w.effects.particles.spawn(this.pos.x + (Math.random() - 0.5) * this.radius * 1.6, this.pos.y + 0.05, this.pos.z + (Math.random() - 0.5) * this.radius * 1.6, 0, 0.5 + Math.random(), 0, 0.45, 0.9, 0.1, 1, 2, 0.5, 3, 0.5);
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      // ramp up then taper: ~81 total over the pool life on Normal+
      const k = this.t / this.dur;
      const perTick = (k < 0.5 ? k / 0.5 * 6 : 6 - (k - 0.5) / 0.5 * 2) * (w.difficulty === 'easy' ? 0.55 : 1);
      for (const s of w.survivors) {
        if (s.state === 'dead') continue;
        const dx = s.body.pos.x - this.pos.x, dz = s.body.pos.z - this.pos.z;
        if (dx * dx + dz * dz < this.radius * this.radius && Math.abs(s.body.pos.y - this.pos.y) < 1.2) {
          s.takeDamage(perTick * (s.isBot ? 0.55 : 1) * (s.state === 'incap' ? 0.5 : 1), { type: 'acid', attacker: this.owner, interrupt: false });
          s.inAcid = 0.4;
        }
      }
    }
    if (this.t >= this.dur) this.dead = true;
  }
  dispose() { this.world.removeLight(this.light); if (this.snd) this.snd.stop(0.5); }
}

// ===================================================================== Carryable props
export class Carryable {
  constructor(w, type, pos, data = {}) {
    this.world = w; this.type = type; this.pos = pos.clone(); this.data = data;
    this.vel = new THREE.Vector3(); this.carrier = null; this.resting = true;
    this.heavy = type === 'propane' || type === 'oxygen';
    this.scavenge = !!data.scavenge;
    this.home = pos.clone();
    let model;
    try { model = buildItemModel(type, { scavenge: this.scavenge }); } catch (e) { model = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.2)); }
    if (this.scavenge) model.traverse((o) => { if (o.isMesh && o.material.uniforms) { o.material = cloneMat(o.material); o.material.uniforms.uColor.value.setRGB(1.6, 1.4, 0.4); } });
    this.mesh = model; model.position.copy(pos); w.scene.add(model);
    this.glow = addGlowShell(model);
    this.dyn = w.collision.addDynamic(new DynamicBox([pos.x - 0.2, pos.y, pos.z - 0.2], [pos.x + 0.2, pos.y + 0.45, pos.z + 0.2], { owner: this, blocksSurvivors: false, blocksInfected: false, surface: SURF.METAL }));
    this.hissT = -1;
    this.burnT = -1;
  }
  focusPos() { return _v3.copy(this.pos).add(_v.set(0, 0.2, 0)); }
  carriedBy(s) {
    this.carrier = s; s.inv.carry = this; this.dyn.enabled = false;
    this.mesh.visible = false;
    s.switchSlot(s.slot, true);
    this.world.sound('pickup_item', this.pos);
    this.world.events.emit('carry', s, this);
  }
  drop(s, throwSpeed) {
    this.carrier = null; s.inv.carry = null;
    const eye = s.eyePos(_v); const dir = s.aimDir(_v2);
    this.pos.copy(eye).addScaledVector(dir, 0.5); this.pos.y -= 0.4;
    this.vel.copy(dir).multiplyScalar(throwSpeed).add(_v.set(0, throwSpeed > 2 ? 2.5 : 0, 0));
    this.resting = false;
    this.mesh.visible = true;
    s.switchSlot(s.bestSlot(), true);
    this.world.events.emit('dropCarry', s, this);
  }
  update(dt) {
    const w = this.world;
    if (this.carrier) { this.pos.copy(this.carrier.body.pos); this.pos.y += 1; return; }
    if (!this.resting) {
      this.vel.y -= 13 * dt;
      const step = _v.copy(this.vel).multiplyScalar(dt);
      const len = step.length();
      const hit = len > 1e-5 ? w.collision.raycast(this.pos, _v2.copy(step).normalize(), len + 0.05, { move: true, dynamic: false }) : null;
      if (hit) {
        this.pos.copy(hit.point).addScaledVector(hit.normal, 0.02);
        const vn = this.vel.dot(hit.normal);
        this.vel.addScaledVector(hit.normal, -1.3 * vn).multiplyScalar(0.35);
        if (Math.abs(vn) > 2) w.sound('melee_hit_world', this.pos, { volume: 0.4 });
        if (this.vel.length() < 0.6 && hit.normal.y > 0.6) { this.resting = true; this.vel.set(0, 0, 0); }
      } else this.pos.add(step);
      if (this.pos.y < -200) { this.respawn(); }
    }
    this.mesh.position.copy(this.pos);
    this.dyn.box.min.set(this.pos.x - 0.2, this.pos.y, this.pos.z - 0.2); this.dyn.box.max.set(this.pos.x + 0.2, this.pos.y + 0.45, this.pos.z + 0.2);
    this.dyn.enabled = true;
    // glow
    const p = w.player;
    if (p) { const d = p.body.pos.distanceTo(this.pos); for (const g of this.glow) g.visible = d < 4 || (this.scavenge && d < 30) || p.useFocus === this; }
    if (this.hissT >= 0) {
      this.hissT -= dt;
      if (Math.random() < 0.5) w.effects.smokePuff(this.pos.x, this.pos.y + 0.4, this.pos.z, { size: 0.3, life: 0.8, r: 0.9, g: 0.9, b: 0.9, a: 0.4, vy: 2 });
      if (this.hissT <= 0) this.explode(this.lastOwner);
    }
    if (this.burnT >= 0) {
      this.burnT -= dt;
      if (Math.random() < 0.6) w.effects.fireSprite(this.pos.x, this.pos.y + 0.4, this.pos.z, 0.3, 0.5, { life: 0.3 });
      if (this.burnT <= 0) this.explode(this.lastOwner);
    }
  }
  onShot(dmg, owner, point, special, chain = false) {
    if (this.carrier || this.dead) return;
    this.lastOwner = owner;
    if (this.type === 'cola' || (this.scavenge && !chain && false)) return;
    if (this.type === 'oxygen') { if (this.hissT < 0) { this.hissT = 2.5; this.hissSnd = this.world.sound('propane_hiss', this.pos, { volume: 0.8 }); this.world.noise(this.pos, 25); } return; }
    this.explode(owner);
  }
  explode(owner) {
    if (this.dead) return;
    const w = this.world;
    this.dead = true;
    if (this.type === 'gascan' || this.type === 'fireworks') { spawnFire(w, this.pos, 3.6, 15, owner); w.sound('fire_burst', this.pos); }
    else spawnExplosion(w, this.pos, { radius: 3.8, damage: 300, owner, stumble: true, selfScale: 0.4 });
    this.remove();
    if (this.scavenge) w.after(1.5, () => { w.spawnCarry(this.type, this.home, this.data); });
  }
  respawn() { this.pos.copy(this.home); this.vel.set(0, 0, 0); this.resting = true; }
  remove() {
    this.world.scene.remove(this.mesh);
    this.world.collision.removeDynamic(this.dyn);
    const i = this.world.carryables.indexOf(this); if (i >= 0) this.world.carryables.splice(i, 1);
  }
}

// ===================================================================== Doors
let doorGeoCache = {};
function doorMesh(type, w, h, number) {
  const key = type + w + h + number;
  const k = new MeshKit();
  const A = charAtlas();
  k.defaultUV = A.cloth;
  const col = type === 'saferoom' ? 0x8a2a22 : type === 'metal' ? 0x6a7078 : 0x6b4528;
  k.box([w / 2, h / 2, 0], [w, h, 0.07], col);
  if (type === 'saferoom') { k.box([w / 2, h / 2, 0], [w * 0.92, 0.05, 0.1], 0x5a1a14); k.box([w - 0.12, h * 0.48, 0.07], [0.06, 0.25, 0.06], 0xb8b8b0); k.box([w * 0.5, h * 0.72, 0.045], [0.3, 0.12, 0.02], 0x202020); }
  else { k.box([w - 0.1, h * 0.47, 0.06], [0.08, 0.03, 0.05], 0xc8a040); k.box([w - 0.1, h * 0.47, -0.06], [0.08, 0.03, 0.05], 0xc8a040); k.box([w / 2, h * 0.75, 0.04], [w * 0.7, h * 0.3, 0.02], type === 'metal' ? 0x5a6068 : 0x5a3a20); k.box([w / 2, h * 0.3, 0.04], [w * 0.7, h * 0.35, 0.02], type === 'metal' ? 0x5a6068 : 0x5a3a20); }
  return k.toGeometry();
}

export class Door {
  /** d: {pos:[hinge x,y,z], width, height, rotY (closed facing), openDir (1|-1), type, locked, open, name} */
  constructor(w, d) {
    this.world = w; this.d = d;
    this.type = d.type || 'wood';
    this.width = d.width || 1.1; this.height = d.height || 2.2;
    this.pivot = new THREE.Object3D();
    this.pivot.position.set(...(d.pos.isVector3 ? d.pos.toArray() : d.pos));
    this.baseYaw = d.rotY || 0;
    this.pivot.rotation.y = this.baseYaw;
    const mat = createPS1Material({ map: charAtlas().texture, tint: true });
    this.mesh = new THREE.Mesh(doorMesh(this.type, this.width, this.height), mat);
    this.pivot.add(this.mesh);
    w.scene.add(this.pivot);
    this.angle = 0; this.targetAngle = 0;
    this.closed = !d.open; if (d.open) { this.angle = this.targetAngle = (d.openDir || 1) * Math.PI / 2 * 0.95; }
    this.locked = !!d.locked;
    this.health = this.type === 'wood' ? 600 : this.type === 'metal' ? 1500 : Infinity;
    this.broken = false;
    // closed collision box (axis aligned for rotY multiple of 90deg)
    this.pivot.updateMatrixWorld(true);
    const a = new THREE.Vector3(0, 0, -0.06).applyMatrix4(this.pivot.matrixWorld), b = new THREE.Vector3(this.width, this.height, 0.06).applyMatrix4(this.pivot.matrixWorld);
    const min = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)], max = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
    this.dyn = w.collision.addDynamic(new DynamicBox(min, max, { owner: this, surface: this.type === 'wood' ? SURF.WOOD : SURF.METAL }));
    this.dyn.enabled = this.closed;
    this.box = this.dyn.box;
    this.center = new THREE.Vector3(this.width / 2, this.height / 2, 0).applyMatrix4(this.pivot.matrixWorld);
    mat.uniforms.uAmbient.value.copy(w.probeAt(this.center));
    this.onOpen = d.onOpen || null; this.onClose = d.onClose || null;
    this.name = d.name;
  }
  usable(s) { return !this.broken && !this.locked && s.body.pos.distanceTo(this.center) < SURVIVOR.useRange + 0.5 && !this.busy; }
  focusPos() { return this.center; }
  onUsed(s) {
    if (this.closed) this.open(s); else this.close(s);
  }
  open(s) {
    if (!this.closed || this.broken) return;
    // swing away from the user
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.baseYaw);
    const side = s ? Math.sign(n.dot(_v.copy(s.body.pos).sub(this.center))) || 1 : (this.d.openDir || 1);
    this.targetAngle = -side * Math.PI / 2 * 0.95 * (this.d.flip ? -1 : 1);
    this.closed = false; this.dyn.enabled = false;
    this.world.sound(this.type === 'wood' ? 'door_open' : 'door_metal_open', this.center);
    if (this.onOpen) this.onOpen(this.world, s, this);
    this.world.events.emit('doorOpen', this, s);
  }
  close(s) {
    if (this.closed || this.broken) return;
    // don't close on somebody
    for (const o of this.world.survivors) if (o.state !== 'dead' && this.box.distanceToPoint(_v.copy(o.body.pos).setY(o.body.pos.y + 1)) < 0.35) return;
    this.targetAngle = 0; this.closed = true;
    this.closingT = 0.3;
    this.world.sound(this.type === 'wood' ? 'door_close' : 'door_metal_close', this.center);
    if (this.onClose) this.onClose(this.world, s, this);
    this.world.events.emit('doorClose', this, s);
  }
  damage(amount, by) {
    if (this.broken || !this.closed) return;
    if (this.type === 'saferoom' && !(by && by.type === 'tank')) { if (Math.random() < 0.3) this.world.sound('door_bang', this.center, { volume: 0.6 }); return; }
    this.health -= amount;
    this.world.sound('door_bang', this.center, { volume: 0.7, randomPitch: 0.1 });
    this.shake = 0.15;
    if (this.health <= 0) this.breakDoor();
  }
  breakDoor() {
    this.broken = true; this.closed = false; this.dyn.enabled = false;
    this.world.sound('door_break', this.center);
    for (let i = 0; i < 8; i++) this.world.effects.gibs.spawn('wood', this.center.clone().add(_v.set((Math.random() - 0.5) * this.width, (Math.random() - 0.5) * this.height, 0)), new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6));
    this.pivot.visible = false;
  }
  update(dt) {
    if (this.broken) return;
    if (this.closingT > 0) {
      this.closingT -= dt;
      if (this.closingT <= 0) this.dyn.enabled = this.closed;
    }
    this.angle += (this.targetAngle - this.angle) * Math.min(1, dt * 7);
    let shake = 0;
    if (this.shake > 0) { this.shake -= dt; shake = Math.sin(this.shake * 80) * 0.02; }
    this.pivot.rotation.y = this.baseYaw + this.angle + shake;
  }
}

// ===================================================================== Breakable glass
/** A pane of glass that blocks movement until shot, shoved or hit with melee. */
export class Breakable {
  /** d: {min:[x,y,z], max:[x,y,z], onBreak, alarm} — axis aligned thin box */
  constructor(w, d) {
    this.world = w; this.d = d; this.broken = false;
    const min = new THREE.Vector3(...d.min), max = new THREE.Vector3(...d.max);
    this.center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const geo = new THREE.BoxGeometry(Math.max(size.x, 0.02), size.y, Math.max(size.z, 0.02));
    const n = geo.getAttribute('position').count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    this.mesh = new THREE.Mesh(geo, createPS1Material({ map: tex('glass', {}), transparent: true, opacity: 0.85, tint: true, color: 0xb8d0d8 }));
    this.mesh.position.copy(this.center);
    this.mesh.renderOrder = 2;
    this.mesh.material.uniforms.uAmbient.value.copy(w.probeAt(this.center)).multiplyScalar(1.2);
    w.scene.add(this.mesh);
    this.dyn = w.collision.addDynamic(new DynamicBox(d.min, d.max, { owner: this, surface: SURF.GLASS }));
    this.onBreak = d.onBreak || null;
  }
  onShot(dmg, owner) { this.break(owner); }
  break(by) {
    if (this.broken) return;
    const w = this.world;
    this.broken = true; this.dyn.enabled = false; this.mesh.visible = false;
    w.sound('glass_break', this.center, { volume: 1 });
    for (let i = 0; i < 10; i++) w.effects.gibs.spawn('glass', this.center.clone().add(_v.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8)), new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), { life: 6 });
    for (let i = 0; i < 20; i++) w.effects.particles.spawn(this.center.x, this.center.y, this.center.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.8, 0.9, 0.95, 1, 2, 0.8, 9.8, 0.3, this.center.y - 2);
    w.noise(this.center, 18);
    if (this.onBreak) this.onBreak(w, by, this);
    w.events.emit('glassBroken', this, by);
  }
}
