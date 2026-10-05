// Projectiles: arrows, fireballs, thrown knives, slash waves and firebolts. Reflectable by parries.
import * as THREE from 'three';
import { sharedAssets } from '../render/materials.js';
import { rand } from '../core/math.js';
import { explode, playerHitsEnemy } from '../game/combat.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const geos = {};
const G = (k, f) => geos[k] || (geos[k] = f());

function arrowMesh() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(G('arShaft', () => new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4).rotateX(Math.PI / 2)), A.darkWood);
  const tip = new THREE.Mesh(G('arTip', () => new THREE.ConeGeometry(0.03, 0.1, 4).rotateX(Math.PI / 2)), A.metal);
  tip.position.z = 0.42;
  const fl = new THREE.Mesh(G('arFl', () => new THREE.BoxGeometry(0.08, 0.002, 0.12)), new THREE.MeshStandardMaterial({ color: 0xccbbaa }));
  fl.position.z = -0.32;
  const fl2 = fl.clone();
  fl2.rotation.z = Math.PI / 2;
  g.add(shaft, tip, fl, fl2);
  return g;
}

function knifeMesh() {
  const A = sharedAssets();
  const g = new THREE.Group();
  const b = new THREE.Mesh(G('knB', () => new THREE.ConeGeometry(0.03, 0.25, 4).rotateX(Math.PI / 2)), A.metal);
  b.position.z = 0.08;
  const h = new THREE.Mesh(G('knH', () => new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5).rotateX(Math.PI / 2)), A.darkWood);
  h.position.z = -0.08;
  g.add(b, h);
  return g;
}

function orbMesh(color, size) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const core = new THREE.Mesh(G('orb', () => new THREE.SphereGeometry(1, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  core.scale.setScalar(size * 0.55);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(size * 4);
  const c = new THREE.Color(color).multiplyScalar(2);
  core.material.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.4);
  g.add(core, glow);
  return g;
}

function waveMesh(color) {
  const geo = G('wave', () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 1, Math.PI * 0.15, Math.PI * 0.85, false);
    s.absarc(0, -0.25, 0.85, Math.PI * 0.85, Math.PI * 0.15, true);
    const g = new THREE.ShapeGeometry(s, 12);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    return g;
  });
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.scale.set(1.4, 1, 1.4);
  return m;
}

export class Projectile {
  constructor(game, kind, pos, vel, dmg, owner, ownerType) {
    this.game = game;
    this.kind = kind;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.dmg = dmg;
    this.owner = owner;
    this.ownerType = ownerType;
    this.alive = true;
    this.life = 6;
    this.grav = 0;
    this.radius = 0.15;
    this.hitSet = new Set();
    this.light = null;
    switch (kind) {
      case 'arrow':
        this.mesh = arrowMesh();
        this.grav = 3;
        break;
      case 'knife':
        this.mesh = knifeMesh();
        this.grav = 2;
        this.spin = true;
        break;
      case 'fireball':
      case 'firebolt':
        this.mesh = orbMesh(0xff6a20, kind === 'firebolt' ? 0.18 : 0.14);
        this.radius = 0.25;
        this.light = game.renderer.addDynamic(this.pos.clone(), 0xff7a30, 14, 8, 0.5);
        break;
      case 'wave':
        this.mesh = waveMesh(owner && owner.fxColor ? owner.fxColor : 0xbfd6ff);
        this.radius = 1.1;
        this.life = 0.8;
        break;
      default:
        this.mesh = orbMesh(0xffffff, 0.1);
    }
    this.mesh.position.copy(this.pos);
    this._orient();
    game.renderer.scene.add(this.mesh);
  }

  _orient() {
    if (this.kind === 'arrow' || this.kind === 'knife' || this.kind === 'wave') {
      _v.copy(this.pos).add(this.vel);
      this.mesh.lookAt(_v);
    }
  }

  reflect(game) {
    if (!this.alive) return;
    this.ownerType = this.ownerType === 'enemy' ? 'player' : 'enemy';
    const target = this.owner && !this.owner.dead && this.owner.chestPos ? this.owner.chestPos() : null;
    const speed = this.vel.length() * 1.3;
    if (target) this.vel.copy(target).sub(this.pos).normalize().multiplyScalar(speed);
    else this.vel.negate().multiplyScalar(1.3);
    this.dmg = Math.round(this.dmg * 2);
    this.life = 4;
    this.hitSet.clear();
    game.fx.sparks(this.pos, this.vel.clone().normalize(), 12, 0xfff0a0, 5);
    game.fx.numbers.add(this.pos.clone(), 'REFLECTED', 'parry');
  }

  update(dt) {
    const game = this.game;
    this.life -= dt;
    if (this.life <= 0) return this.die(false);
    this.vel.y -= this.grav * dt;
    const step = this.vel.length() * dt;
    const dir = _n.copy(this.vel).normalize();
    const world = game.world;
    // walls / floor
    const h = world.raycast(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, step + 0.05);
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    // actors
    if (this.ownerType === 'enemy') {
      const p = game.player;
      if (!p.dead) {
        const cy = Math.min(Math.max(next.y, p.pos.y + 0.3), p.pos.y + 1.7);
        const dx = next.x - p.pos.x, dy = next.y - cy, dz = next.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < (this.radius + 0.4) ** 2) {
          const res = p.takeDamage({ amount: this.dmg, dir: dir.clone().setY(0).normalize(), knock: 2, attacker: this.owner, projectile: this, type: this.kind === 'fireball' ? 'fire' : 'phys' });
          if (this.ownerType !== 'enemy') return true; // got reflected by parry
          if (this.kind === 'fireball') return this.die(true, false);
          if (res.blocked) { game.audio.block(this.pos); return this.die(false); }
          if (res.dodged) return this._move(next);
          game.audio.thunk(this.pos);
          return this.die(false);
        }
      }
    } else {
      for (const e of game.level.enemies) {
        if (e.dead || this.hitSet.has(e)) continue;
        const c = e.chestPos();
        if (c.distanceToSquared(next) < (this.radius + e.radius * 1.3) ** 2) {
          this.hitSet.add(e);
          const d = dir.clone().setY(0).normalize();
          if (this.kind === 'firebolt' || this.kind === 'fireball') return this.die(true);
          playerHitsEnemy(game, e, { base: this.dmg, dir: d, point: c, knockback: this.kind === 'wave' ? 5 : 2.5, stagger: this.kind === 'wave' ? 30 : 12, source: 'player', melee: false, swingDir: d });
          if (this.kind !== 'wave') return this.die(false);
        }
      }
    }
    if (h) {
      this.pos.set(h.x, h.y, h.z);
      if (this.kind === 'fireball' || this.kind === 'firebolt') return this.die(true);
      if (this.kind === 'arrow' || this.kind === 'knife') {
        game.audio.thunk(this.pos);
        game.fx.dust(this.pos, 2, 0x8a8070, 0.1);
        game.level.stickProjectile(this.mesh, this.pos, dir);
        this.mesh = null;
      }
      return this.die(false);
    }
    return this._move(next);
  }

  _move(next) {
    const game = this.game;
    this.pos.copy(next);
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      this._orient();
      if (this.spin) this.mesh.rotateX(this.life * 0);
    }
    if (this.light) this.light.pos.copy(this.pos);
    if (this.kind === 'fireball' || this.kind === 'firebolt') {
      game.fx.fire(this.pos, 0.6, 0.05);
      if (Math.random() < 0.4) game.fx.puff(this.pos, new THREE.Vector3(0, 0.5, 0), 0x222222, 0.6, 0.2, 0.6, 0.3);
    } else if (this.kind === 'wave') {
      const f = this.life / 0.8;
      this.mesh.material.opacity = Math.min(1, f * 1.5) * 0.85;
      this.mesh.scale.set(1.4 + (1 - f) * 0.8, 1, 1.4 + (1 - f) * 0.8);
    }
    return true;
  }

  die(boom, hurtPlayer = true) {
    const game = this.game;
    if (!this.alive) return false;
    this.alive = false;
    if (boom) {
      const big = this.kind === 'firebolt';
      explode(game, this.pos, big ? 2.6 : 1.7, this.dmg, { hurtsPlayer: this.ownerType === 'enemy' && hurtPlayer, source: this.ownerType === 'player' ? 'player' : 'enemy', color: 0xff6a20, knock: big ? 9 : 5, fire: true });
    }
    if (this.mesh) this.mesh.removeFromParent();
    if (this.light) game.renderer.removeDynamic(this.light);
    return false;
  }
}

export { rand };
