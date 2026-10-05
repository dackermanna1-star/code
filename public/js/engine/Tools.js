// Classic 2007/2008 "brickbattle" tools. Numbers follow the original tool
// scripts (LinkedSword, RocketLauncher, Superball, Slingshot, PaintballGun,
// Trowel, Timebomb); models are rebuilt from primitives.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { brickColor } from './BrickColor.js';
import { sounds } from './Sound.js';
import { GROUP, Part } from './Part.js';
import { TOOL_ICONS } from './icons.js';

const col = (n) => { const c = brickColor(n); return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace); };
const phong = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 30, specular: 0x333333, ...extra });

export class Tool {
  constructor(game, opts = {}) {
    this.game = game;
    this.name = opts.name || 'Tool';
    this.enabled = true;
    this.holder = null;
    this.model = this.build();
  }
  build() { return new THREE.Group(); }
  get icon() { return null; }
  get world() { return this.game.world; }
  equipped(ch) {
    this.holder = ch;
    ch.model.rightGrip.add(this.model);
    this.onEquipped?.(ch);
  }
  unequipped(ch) {
    ch.model.rightGrip.remove(this.model);
    this.onUnequipped?.(ch);
    this.holder = null;
  }
  /** Mouse click with the tool out. target = mouse hit point (Vector3). */
  activate(target) {
    if (!this.enabled || !this.holder || !this.holder.alive) return;
    this.onActivated(this.holder, target);
  }
  onActivated() {}
  cooldown(seconds) {
    this.enabled = false;
    this.world.delay(seconds, () => { this.enabled = true; });
  }
  owner() { return this.holder?.player || null; }
  canDamage(victim) {
    if (!victim || victim === this.holder) return false;
    const a = this.holder?.player?.team, b = victim.player?.team;
    if (a && b && a === b && !this.game.teamDamage) return false;
    return true;
  }
}

// --- LinkedSword -------------------------------------------------------------
export class Sword extends Tool {
  constructor(game) { super(game, { name: 'Sword' }); this.damage = 5; this.lastAttack = -1; this.hitCooldown = new Map(); }
  build() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 3.2), phong(0xd8d8d8, { shininess: 90, specular: 0xffffff }));
    blade.position.z = -2.0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), blade.material);
    tip.rotation.x = -Math.PI / 2; tip.position.z = -3.85;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.18), phong(0x3a3a3a));
    guard.position.z = -0.38;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), phong(0x5a3a1a));
    hilt.rotation.x = Math.PI / 2; hilt.position.z = 0.05;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), phong(0x3a3a3a));
    pommel.position.z = 0.5;
    g.add(blade, tip, guard, hilt, pommel);
    this.blade = blade;
    return g;
  }
  get icon() { return TOOL_ICONS.Sword(); }

  swordUp() { this.model?.rotation.set(0, 0, 0); this.out = false; }
  swordOut() { this.model?.rotation.set(-Math.PI / 2, 0, 0); this.out = true; }
  onEquipped() { sounds.play('unsheath', this.holder.rootPosition, 0.8); this.swordUp(); }
  onUnequipped() { this.swordUp(); }
  onActivated(ch) {
    const t = this.world.time;
    if (t - this.lastAttack < 0.2) this.lunge(ch); else this.attack(ch);
    this.lastAttack = t;
  }
  attack(ch) {
    this.damage = 10;
    sounds.play('slash', ch.rootPosition, 0.7);
    ch.playToolAnim('Slash');
  }
  lunge(ch) {
    this.damage = 30;
    sounds.play('lunge', ch.rootPosition, 0.6);
    ch.playToolAnim('Lunge');
    // BodyVelocity (0,10,0) on the Torso for 0.5 s: a little upward float
    ch.platformLift = 10;
    this.world.delay(0.5, () => { ch.platformLift = 0; });
    this.world.delay(0.25, () => this.swordOut());
    this.world.delay(1.0, () => { this.swordUp(); this.damage = 10; });
  }
  update(dt) {
    const ch = this.holder;
    if (!ch || !ch.alive) return;
    // Touch damage: the blade touching another character.
    const tipW = new THREE.Vector3(0, 0, -3.6).applyMatrix4(this.model.matrixWorld);
    const midW = new THREE.Vector3(0, 0, -1.8).applyMatrix4(this.model.matrixWorld);
    for (const other of this.world.characters) {
      if (other === ch || !other.alive) continue;
      if (other.hitTest(tipW, 0.3) || other.hitTest(midW, 0.3)) {
        const last = this.hitCooldown.get(other) || -1;
        if (this.world.time - last < 0.1) continue;
        this.hitCooldown.set(other, this.world.time);
        if (this.canDamage(other)) other.takeDamage(this.damage, ch);
      }
    }
  }
}

// --- Projectiles ---------------------------------------------------------------
/** Simple swept-sphere projectile against parts (cannon raycast) and characters. */
export class Projectile {
  constructor(game, opts) {
    this.game = game;
    this.world = game.world;
    this.pos = opts.position.clone();
    this.vel = opts.velocity.clone();
    this.gravity = opts.gravity ?? 0; // fraction of world gravity
    this.radius = opts.radius ?? 0.5;
    this.owner = opts.owner || null; // Character
    this.life = opts.lifetime ?? 5;
    this.mesh = opts.mesh;
    this.onHitCharacter = opts.onHitCharacter;
    this.onHitPart = opts.onHitPart;
    this.ignoreOwner = opts.ignoreOwner !== false;
    this.alive = true;
    this.mesh.position.copy(this.pos);
    this.world.scene.add(this.mesh);
    this.off = this.world.onUpdate((dt) => this.step(dt));
  }
  remove() {
    if (!this.alive) return;
    this.alive = false;
    this.world.scene.remove(this.mesh);
    this.off();
  }
  step(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.onExpire?.(); this.remove(); return; }
    const n = Math.max(1, Math.ceil(this.vel.length() * dt / 1.5));
    const h = dt / n;
    for (let i = 0; i < n && this.alive; i++) {
      this.vel.y -= 196.2 * this.gravity * h;
      const next = this.pos.clone().addScaledVector(this.vel, h);
      // characters
      for (const ch of this.world.characters) {
        if (!ch.alive || (this.ignoreOwner && ch === this.owner)) continue;
        if (ch.hitTest(next, this.radius) || ch.hitTest(this.pos.clone().lerp(next, 0.5), this.radius)) {
          this.pos.copy(next);
          this.onHitCharacter?.(ch, this);
          if (!this.alive) return;
        }
      }
      // world
      const dir = next.clone().sub(this.pos);
      const len = dir.length();
      if (len > 1e-6) {
        dir.normalize();
        const end = next.clone().addScaledVector(dir, this.radius);
        const hit = this.world.raycast(this.pos, end, { mask: GROUP.WORLD | GROUP.DYNAMIC });
        if (hit) {
          this.pos.copy(hit.point).addScaledVector(dir, -this.radius);
          this.onHitPart?.(hit, this);
          if (!this.alive) return;
          continue;
        }
      }
      this.pos.copy(next);
    }
    this.mesh.position.copy(this.pos);
    if (this.spin) this.mesh.rotation.x += dt * this.spin;
  }
}

// --- Rocket Launcher --------------------------------------------------------------
export class RocketLauncher extends Tool {
  constructor(game) { super(game, { name: 'Rocket' }); }
  build() {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.6, 12, 1, true), phong(0x4a5a3a, { side: THREE.DoubleSide }));
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.25, -0.6);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.3), phong(0x2a2a2a));
    grip.position.set(0, -0.15, 0);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.4), phong(0x2a2a2a));
    sight.position.set(0, 0.75, -0.2);
    g.add(tube, grip, sight);
    g.rotation.x = -Math.PI / 2; // points forward with the arm raised
    return g;
  }
  get icon() { return TOOL_ICONS.Rocket(); }

  onActivated(ch, target) {
    this.cooldown(7); // the server script waited 7 s
    const handle = new THREE.Vector3(); this.model.getWorldPosition(handle);
    const dir = target.clone().sub(handle).normalize();
    const start = handle.clone().addScaledVector(dir, 8);
    const color = ch.player?.team ? ch.player.team.color : 23;
    // 1x1x4 rocket, Studs on all six faces
    const mesh = new Part(this.world, { size: [1, 1, 4], color, noPhysics: true, surfaces: { Top: 'Studs', Bottom: 'Studs', Front: 'Studs', Back: 'Studs', Left: 'Studs', Right: 'Studs' } }).mesh;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    const whoosh = sounds.loop('whoosh', 0.35);
    const game = this.game;
    const explode = (p) => {
      p.remove();
      whoosh.stop();
      sounds.play('explosion', p.pos, 1);
      game.world.explode(p.pos, 4, 500000, { creator: ch });
    };
    // flight: a point advances ~1 stud per 30 Hz step; the rocket servos to it
    const p = new Projectile(game, {
      position: start, velocity: dir.multiplyScalar(32), radius: 0.6, owner: ch, lifetime: 10, mesh,
      onHitCharacter: (victim, proj) => explode(proj),
      onHitPart: (hit, proj) => explode(proj),
    });
    p.onExpire = () => whoosh.stop();
    return p;
  }
}

// --- Superball ----------------------------------------------------------------------
export class Superball extends Tool {
  constructor(game) { super(game, { name: 'Superball' }); }
  build() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), phong(col(21), { shininess: 80, specular: 0x666666 }));
    m.position.set(0, 0, -0.2);
    g.add(m);
    return g;
  }
  get icon() { return TOOL_ICONS.Superball(); }

  onActivated(ch, target) {
    this.cooldown(2);
    const head = ch.headPosition;
    const dir = target.clone().sub(head).normalize();
    const start = ch.rootPosition.clone().addScaledVector(dir, 5);
    const colors = Object.keys({ 21: 1, 23: 1, 24: 1, 37: 1, 104: 1, 106: 1, 1: 1, 26: 1 }).map(Number);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), phong(col(colors[Math.floor(Math.random() * colors.length)]), { shininess: 80, specular: 0x777777 }));
    sounds.play('boing', start, 0.7);
    let damage = 25;
    let lastBounce = -1;
    const game = this.game;
    new Projectile(game, {
      position: start, velocity: dir.multiplyScalar(200), gravity: 1, radius: 1, owner: ch, lifetime: 5, mesh, ignoreOwner: false,
      onHitCharacter: (victim, p) => {
        if (victim === ch && game.world.time - (p.born || 0) < 0.3) return;
        if (victim.player?.team && ch.player?.team === victim.player.team && victim !== ch) { p.remove(); return; }
        sounds.play('boing', p.pos, 0.6);
        victim.takeDamage(damage, ch);
        victim.body.velocity.x += p.vel.x / 4; victim.body.velocity.z += p.vel.z / 4;
        p.remove();
      },
      onHitPart: (hit, p) => {
        // perfectly elastic bounce, damage halves each bounce
        const vn = hit.normal.clone().multiplyScalar(p.vel.dot(hit.normal));
        p.vel.sub(vn.multiplyScalar(2));
        if (game.world.time - lastBounce > 0.1) {
          sounds.play('boing', p.pos, 0.5);
          lastBounce = game.world.time;
          damage /= 2;
        }
        if (hit.part && !hit.part.anchored && hit.part.body) {
          hit.part.body.wakeUp();
          hit.part.body.velocity.x -= vn.x * 0.1; hit.part.body.velocity.z -= vn.z * 0.1;
        }
      },
    }).born = game.world.time;
  }
}

// --- Slingshot ---------------------------------------------------------------------------
export class Slingshot extends Tool {
  constructor(game) { super(game, { name: 'Slingshot' }); }
  build() {
    const g = new THREE.Group();
    const wood = phong(0x7a4a22);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.0), wood);
    stem.position.z = 0;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.0), wood); l.position.set(-0.35, 0, -0.85); l.rotation.y = 0.4;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.0), wood); r.position.set(0.35, 0, -0.85); r.rotation.y = -0.4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), phong(0x332211)); band.position.set(0, 0, -1.3);
    g.add(stem, l, r, band);
    return g;
  }
  get icon() { return TOOL_ICONS.Slingshot(); }

  onActivated(ch, target) {
    this.cooldown(0.2);
    const V = 85;
    const head = ch.headPosition;
    const dir = target.clone().sub(head).normalize();
    const launch = head.clone().addScaledVector(dir, 5);
    const delta = target.clone().sub(launch);
    const dy = delta.y; delta.y = 0;
    const dx = delta.length();
    const g = 196.2;
    let theta = Math.PI / 4;
    const inRoot = V ** 4 - g * (g * dx * dx + 2 * dy * V * V);
    if (inRoot > 0 && dx > 0.01) {
      const root = Math.sqrt(inRoot);
      theta = Math.min(Math.atan((V * V + root) / (g * dx)), Math.atan((V * V - root) / (g * dx)));
    }
    const u = delta.normalize();
    const vel = new THREE.Vector3(u.x * Math.cos(theta), Math.sin(theta), u.z * Math.cos(theta)).multiplyScalar(V);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), phong(col(2)));
    sounds.play('slingshot', launch, 0.6);
    let damage = 8;
    new Projectile(this.game, {
      position: launch, velocity: vel, gravity: 1, radius: 0.5, owner: ch, lifetime: 2, mesh,
      onHitCharacter: (victim, p) => { if (this.canDamage(victim)) victim.takeDamage(damage, ch); p.remove(); },
      onHitPart: (hit, p) => {
        const vn = hit.normal.clone().multiplyScalar(p.vel.dot(hit.normal));
        p.vel.sub(vn.multiplyScalar(1.6));
        damage /= 2;
        if (damage < 1) p.remove();
      },
    });
  }
}

// --- Paintball Gun (stock 2007 tool) -----------------------------------------------------
export const PAINT_COLORS = [45, 119, 21, 24, 23, 105, 104];
export class PaintballGun extends Tool {
  constructor(game, opts = {}) {
    super(game, { name: opts.name || 'PaintballGun' });
    this.reload = opts.reload ?? 0.5;
    this.speed = opts.speed ?? 100;
    this.damageAmount = opts.damage ?? 2;
  }
  build() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 2.2), phong(0x3c3c3c));
    body.position.set(0, 0.35, -0.7);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 10), phong(0x222222));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.45, -2.4);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.8, 12), phong(0xffd23a, { transparent: true, opacity: 0.85 }));
    hopper.position.set(0, 1.05, -0.6);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), phong(0x222222));
    grip.position.set(0, -0.2, 0);
    g.add(body, barrel, hopper, grip);
    g.rotation.x = -Math.PI / 2;
    return g;
  }
  get icon() { return TOOL_ICONS.PaintballGun(); }

  colorFor(ch) { return ch.player?.team ? ch.player.team.color : PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)]; }
  onActivated(ch, target) {
    this.cooldown(this.reload);
    this.fireBall(ch, target, { speed: this.speed, damage: this.damageAmount });
  }
  fireBall(ch, target, { speed = 100, damage = 20, spread = 0, color = null, gravity = 0.56 } = {}) {
    const origin = ch.rootPosition.clone();
    const dir = target.clone().sub(origin).normalize();
    if (spread) {
      dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
    }
    const start = origin.clone().addScaledVector(dir, 4);
    const c = color ?? this.colorFor(ch);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), phong(col(c)));
    sounds.play('paintball', start, 0.8);
    const game = this.game;
    new Projectile(game, {
      position: start, velocity: dir.multiplyScalar(speed), gravity: Math.max(0.2, gravity), radius: 0.5, owner: ch, lifetime: 8, mesh,
      onHitCharacter: (victim, p) => {
        if (this.canDamage(victim)) victim.takeDamage(damage, ch);
        paintSplat(game, p.pos, c, null);
        p.remove();
      },
      onHitPart: (hit, p) => {
        if (hit.part && hit.part.paintable !== false && !hit.part.tags.has('nopaint') && hit.part.size.x * hit.part.size.y * hit.part.size.z * 0.7 < 240) {
          hit.part.setColor(c);
        }
        paintSplat(game, hit.point, c, hit.normal);
        p.remove();
      },
    });
  }
}

/** Three little splat plates flung out, as the 2007 paintball did. */
export function paintSplat(game, pos, color, normal) {
  sounds.play('splat', pos, 0.6);
  const world = game.world;
  for (let i = 0; i < 3; i++) {
    const p = world.add({
      size: [1, 0.4, 1], position: [pos.x, pos.y + 0.5, pos.z], color, anchored: false,
      top: 'Smooth', bottom: 'Smooth',
    });
    p.body.collisionFilterGroup = GROUP.DEBRIS;
    p.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC;
    const a = Math.random() * Math.PI * 2;
    p.body.velocity.set(Math.cos(a) * 15, 8 + Math.random() * 6, Math.sin(a) * 15);
    world.delay(4 + Math.random() * 2, () => p.destroy());
  }
}

// --- Trowel ---------------------------------------------------------------------------
export class Trowel extends Tool {
  constructor(game) { super(game, { name: 'Trowel' }); }
  build() {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), phong(0x7a4a22));
    handle.rotation.x = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 1.6), phong(0xb8b8b8, { shininess: 60 }));
    blade.position.set(0, -0.1, -1.4);
    g.add(handle, blade);
    return g;
  }
  get icon() { return TOOL_ICONS.Trowel(); }

  onActivated(ch, target) {
    this.enabled = false;
    sounds.play('bass', target, 0.8);
    const look = target.clone().sub(ch.headPosition);
    // snap to the nearest axis
    const axis = Math.abs(look.x) > Math.abs(look.z) ? new THREE.Vector3(Math.sign(look.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(look.z) || 1);
    const right = new THREE.Vector3(axis.z, 0, -axis.x);
    const colors = [1, 21, 23, 24, 26, 37, 104, 106, 192, 194, 199, 5];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    let k = 0;
    const bricks = [];
    for (let y = 0; y < 4; y += 1.2) {
      for (let x = -6; x < 6; x += 4) {
        const at = target.clone().addScaledVector(right, x + 2).add(new THREE.Vector3(0, y + 0.6, 0));
        this.world.delay(0.04 * k++, () => {
          const b = this.world.add({ size: [4, 1.2, 2], position: [at.x, at.y, at.z], color, anchored: true });
          b.setQuaternion(quat);
          bricks.push(b);
          this.world.delay(15, () => b.destroy());
        });
      }
    }
    this.world.delay(5, () => { this.enabled = true; });
  }
}

// --- Timebomb ----------------------------------------------------------------------
export class Timebomb extends Tool {
  constructor(game) { super(game, { name: 'Timebomb' }); }
  build() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), phong(0x1b2a35, { shininess: 70 }));
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), phong(0xaaaaaa));
    fuse.position.y = 1.1;
    g.add(ball, fuse);
    this.ball = ball;
    return g;
  }
  get icon() { return TOOL_ICONS.Timebomb(); }

  onActivated(ch) {
    this.cooldown(6);
    this.model.visible = false;
    this.world.delay(6, () => { this.model.visible = true; });
    const pos = new THREE.Vector3(); this.model.getWorldPosition(pos);
    const bomb = this.world.add({ shape: 'Ball', size: [2, 2, 2], position: [pos.x, pos.y + 3, pos.z], color: 21, anchored: false, reflectance: 1, top: 'Smooth', bottom: 'Smooth' });
    let interval = 0.4, k = 0;
    const tick = () => {
      if (bomb.destroyed) return;
      if (interval < 0.1) {
        sounds.play('bigboom', bomb.position, 1);
        this.world.explode(bomb.position.clone(), 12, 1000000, { creator: ch });
        bomb.destroy();
        return;
      }
      bomb.setColor(k++ % 2 ? 21 : 26);
      sounds.play('tick', bomb.position, 0.6);
      interval *= 0.9;
      this.world.delay(interval, tick);
    };
    this.world.delay(interval, tick);
  }
}

export const TOOL_CLASSES = { Sword, RocketLauncher, Superball, Slingshot, PaintballGun, Trowel, Timebomb };
