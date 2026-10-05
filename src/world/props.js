// Interactive & physical props: breakables, explosive barrels, chests, doors, gates, secret walls,
// traps, shrines, merchant, pedestals and the exit portal.
import * as THREE from 'three';
import * as M from './prop-meshes.js';
import { harvestFlames, mergeStatic } from '../render/batching.js';
import { RigidBody } from '../physics/bodies.js';
import { TILE } from './constants.js';
import { raySphere, rand, randInt } from '../core/math.js';
import { explode } from '../game/combat.js';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- breakable physics props
export class Breakable {
  // kind: barrel | crate | pot | chair | explosiveBarrel
  constructor(game, kind, x, z, opts = {}) {
    this.game = game;
    this.isProp = true;
    this.kind = kind;
    this.solidHit = kind !== 'pot';
    let mesh, shape, mass, hp, y;
    switch (kind) {
      case 'barrel': mesh = M.makeBarrel(); shape = { type: 'cyl', r: 0.4, hy: 0.5 }; mass = 5; hp = 3; y = 0.5; break;
      case 'explosiveBarrel': mesh = M.makeBarrel(true); shape = { type: 'cyl', r: 0.4, hy: 0.5 }; mass = 5; hp = 1; y = 0.5; break;
      case 'crate': {
        const s = opts.small ? 0.6 : 0.8;
        mesh = M.makeCrate(s); shape = { type: 'box', hx: s / 2, hy: s / 2, hz: s / 2 }; mass = 4; hp = 2; y = s / 2; break;
      }
      case 'chair': mesh = M.makeChair(); shape = { type: 'box', hx: 0.24, hy: 0.45, hz: 0.24 }; mass = 1.5; hp = 1; y = 0.5; break;
      default: {
        mesh = M.makePot();
        const h = mesh.userData.height, r = mesh.userData.radius;
        shape = { type: 'cyl', r, hy: h / 2 }; mass = 1; hp = 1; y = h / 2; break;
      }
    }
    if (kind !== 'pot') mesh = mergeStatic(mesh);
    this.hp = hp;
    this.mesh = mesh;
    game.renderer.scene.add(mesh);
    const body = (this.body = new RigidBody(shape, { mass, mesh, owner: this, restitution: 0.2, onImpact: (b, sp) => this._impact(sp) }));
    body.pos.set(x, y + (opts.stack ? 0.85 : 0), z);
    body.quat.setFromAxisAngle(UP, opts.rot || 0);
    body.sleeping = !opts.stack;
    game.physics.add(body);
    this.fuse = -1;
    this.lootTable = opts.loot || null;
  }

  get pos() { return this.body.pos; }

  meleeRay(o, d, maxDist, pad) {
    if (!this.body.alive) return null;
    const t = raySphere(o, d, this.body.pos, this.body.hRadius + 0.05 + pad * 0.5);
    return t >= 0 && t <= maxDist ? { dist: t } : null;
  }

  _impact(speed) {
    const g = this.game;
    if (this.kind === 'pot') { if (speed > 4.5) this.smash(); else g.audio.thunk(this.body.pos); return; }
    g.audio.woodHit(this.body.pos, false);
    if (speed > 9 && this.kind !== 'explosiveBarrel') this.damage(1);
  }

  onMeleeHit(game, h, dir, power, mult = 1) {
    const b = this.body;
    b.applyImpulse(dir.clone().multiplyScalar(power * 0.9 * b.mass * 0.6).setY(power * 0.25 * b.mass), h.point);
    this.damage(mult, h.point, dir);
  }

  onKick(game, h, dir, power) {
    const b = this.body;
    b.applyImpulse(dir.clone().multiplyScalar(power * b.mass * 0.9).setY(power * 0.35 * b.mass), h.point);
    if (this.kind === 'pot') this.damage(1, h.point, dir);
  }

  damage(n = 1, point = null, dir = null) {
    if (!this.body.alive) return;
    const g = this.game;
    const p = point || this.body.pos;
    if (this.kind === 'explosiveBarrel') {
      if (this.fuse < 0) {
        this.fuse = 0.9;
        g.audio.fire(this.body.pos, false);
      }
      return;
    }
    this.hp -= n;
    if (this.kind === 'pot') g.audio.potteryBreak(p);
    else g.audio.woodHit(p, this.hp <= 0);
    if (this.hp <= 0) this.smash(dir);
    else g.fx.debris(p, 'wood', 3, 2);
  }

  smash(dir = null) {
    const g = this.game;
    if (!this.body.alive) return;
    const p = this.body.pos.clone();
    this.body.alive = false;
    this.mesh.removeFromParent();
    if (this.kind === 'pot') {
      g.audio.potteryBreak(p);
      g.fx.debris(p, 'clay', 14, 3);
      this._shards(p, 5, 0x8a6048, 0.12);
    } else {
      g.audio.woodHit(p, true);
      g.fx.debris(p, 'wood', 10, 4);
      this._planks(p, dir);
    }
    g.fx.dust(p, 3, 0x9a8a70, 0.3);
    g.level.onPropBroken(this, p);
  }

  _planks(p, dir) {
    const g = this.game;
    const A = M.makeCrate; void A;
    const n = this.kind === 'barrel' ? 6 : this.kind === 'chair' ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const len = rand(0.35, 0.8);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, len, 0.035), (this.kind === 'barrel' ? g.assets.wood : g.assets.darkWood));
      g.renderer.scene.add(mesh);
      const body = new RigidBody({ type: 'box', hx: 0.06, hy: len / 2, hz: 0.02 }, { mass: 0.4, mesh, life: rand(10, 16), fade: 1.5, collideBodies: false, restitution: 0.3 });
      body.pos.copy(p).add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3)));
      body.quat.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
      body.vel.set(rand(-3, 3), rand(2, 5), rand(-3, 3));
      if (dir) body.vel.addScaledVector(dir, 4);
      body.ang.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      g.physics.add(body);
    }
  }

  _shards(p, n, color, size) {
    const g = this.game;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size * rand(0.8, 1.5), size * rand(0.8, 1.5), 0.02), mat);
      g.renderer.scene.add(mesh);
      const body = new RigidBody({ type: 'box', hx: size * 0.5, hy: size * 0.5, hz: 0.01 }, { mass: 0.1, mesh, life: rand(6, 10), fade: 1, collideBodies: false, restitution: 0.3 });
      body.pos.copy(p);
      body.vel.set(rand(-2.5, 2.5), rand(1.5, 4), rand(-2.5, 2.5));
      body.ang.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
      g.physics.add(body);
    }
  }

  update(dt) {
    if (this.fuse >= 0 && this.body.alive) {
      this.fuse -= dt;
      const p = this.body.pos;
      this.game.fx.spark(p.clone().add(new THREE.Vector3(0.12, 0.6, 0)), new THREE.Vector3(rand(-1, 1), rand(2, 4), rand(-1, 1)), 0xffcc55, 0.3, 0.07);
      this.body.wake();
      if (this.fuse <= 0) {
        this.body.alive = false;
        this.mesh.removeFromParent();
        const pos = p.clone();
        explode(this.game, pos, 3.6, 45 + this.game.floor * 12, { source: 'player', color: 0xff7722, fire: true, knock: 15 });
        this.game.fx.debris(pos, 'wood', 12, 8);
        this.game.level.onPropBroken(this, pos, true);
      }
    }
  }

  // explosions / area impulses ignite explosive barrels
  areaHit(center, radius, power) {
    if (!this.body.alive) return;
    const d = this.body.pos.distanceTo(center);
    if (d > radius) return;
    const dir = _v.subVectors(this.body.pos, center).normalize();
    const f = 1 - d / radius;
    this.body.applyImpulse(dir.multiplyScalar(power * f * this.body.mass * 0.8).setY(power * f * 0.6 * this.body.mass), this.body.pos.clone().add(new THREE.Vector3(0, 0.2, 0)));
    if (this.kind === 'explosiveBarrel' && f > 0.15) { if (this.fuse < 0) this.fuse = rand(0.15, 0.35); }
    else if (f > 0.5) this.damage(this.kind === 'pot' ? 1 : 2);
  }
}

// ---------------------------------------------------------------- chests
export class Chest {
  constructor(game, x, z, opts) {
    this.game = game;
    this.isInteractable = true;
    this.tier = opts.tier || 0;
    this.hasKey = !!opts.key;
    this.mimic = !!opts.mimic;
    this.hidden = !!opts.hidden;
    this.roomId = opts.roomId;
    this.mesh = M.makeChest(this.tier);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = opts.rot || 0;
    this.pos = this.mesh.position;
    this.opened = false;
    this.openT = -1;
    this.radius = 0.75;
    if (!this.hidden) game.renderer.scene.add(this.mesh);
    this.obstacle = { type: 'circle', x, z, r: 0.55, h: 0.8, owner: this };
    if (!this.hidden) game.level.addObstacle(this.obstacle);
  }

  reveal() {
    if (!this.hidden) return;
    this.hidden = false;
    this.game.renderer.scene.add(this.mesh);
    this.game.level.addObstacle(this.obstacle);
    this.game.fx.magic(this.pos.clone().setY(0.6), 0xffdd66, 40, 3);
    this.game.fx.ring(this.pos, 0xffdd66, 3, 0.6, 0.8);
    this.game.audio.secret();
  }

  label() {
    if (this.hidden || this.opened) return null;
    return ['Open Chest', 'Open Iron Chest', 'Open Gilded Chest', 'Open Royal Chest'][this.tier] || 'Open Chest';
  }

  interact(game) {
    if (this.opened || this.hidden) return;
    this.opened = true;
    game.player.vm.reach();
    if (this.mimic) {
      game.level.removeObstacle(this.obstacle);
      this.mesh.removeFromParent();
      game.audio.voice(this.pos, 'brute', 'roar');
      game.ui.toast('It was a MIMIC!', 'neg');
      game.level.spawnEnemy('mimic', this.pos.x, this.pos.z, { roomId: this.roomId, alerted: true, elite: game.floor >= 3 ? 1 : 0 });
      return;
    }
    this.openT = 0;
    game.audio.chestOpen(this.pos);
    game.stats.chests++;
    game.schedule(0.35, () => game.loot.chestLoot(this.pos.clone().setY(0.7), this.tier, this.hasKey));
  }

  update(dt) {
    if (this.openT < 0) return;
    this.openT += dt;
    const f = Math.min(1, this.openT / 0.5);
    const e = 1 - Math.pow(1 - f, 3);
    this.mesh.userData.lid.rotation.x = -e * 1.9 + Math.sin(f * Math.PI) * 0.1;
    const glow = this.mesh.userData.glow;
    if (glow) glow.material.opacity = Math.max(0, Math.sin(Math.min(1, this.openT / 1.2) * Math.PI)) * 0.9;
  }
}

// ---------------------------------------------------------------- doors & gates
export class Door {
  constructor(game, d, roomCellSide) {
    this.game = game;
    this.isInteractable = true;
    this.cx = d.cx;
    this.cy = d.cy;
    this.kind = d.kind; // wood | locked | boss
    this.axis = d.axis;
    this.locked = d.kind === 'locked';
    this.side = d.side;
    this.hp = 3;
    const pivot = d.kind === 'locked' ? M.makeLockedDoor() : M.makeDoor();
    if (d.kind === 'boss') {
      pivot.children[0].material = game.assets.darkWood;
      pivot.scale.set(1, 1, 1.4);
    }
    this.mesh = pivot;
    const cxw = (d.cx + 0.5) * TILE, czw = (d.cy + 0.5) * TILE;
    // door sits on the room-side boundary of the cell
    const half = TILE / 2;
    const side = d.side;
    let x = cxw, z = czw, rot = 0;
    if (side === 'E') { x = d.cx * TILE + 0.05; z = czw - 0.83; rot = -Math.PI / 2; }
    else if (side === 'W') { x = (d.cx + 1) * TILE - 0.05; z = czw + 0.83; rot = Math.PI / 2; }
    else if (side === 'S') { z = d.cy * TILE + 0.05; x = cxw + 0.83; rot = Math.PI; }
    else { z = (d.cy + 1) * TILE - 0.05; x = cxw - 0.83; rot = 0; }
    void half;
    pivot.position.set(x, 0, z);
    pivot.rotation.y = rot;
    this.baseRot = rot;
    this.openAmt = 0;
    this.target = 0;
    this.open = false;
    this.pos = new THREE.Vector3(cxw, 1.2, czw);
    this.center = new THREE.Vector3(cxw, 1.4, czw);
    game.renderer.scene.add(pivot);
    game.world.blocked[d.cy * game.world.W + d.cx] = 1;
    void roomCellSide;
  }

  label() {
    if (this.open || this.broken) return null;
    if (this.locked) return this.game.player.keys > 0 ? 'Unlock Door (uses key)' : 'Locked — needs a key';
    return 'Open Door';
  }

  interact(game) {
    if (this.open || this.broken) return;
    if (this.locked) {
      if (game.player.keys <= 0) { game.audio.ui('deny'); game.ui.toast('The door is locked. Find a key.', 'neg'); return; }
      game.player.keys--;
      this.locked = false;
      game.audio.unlock(this.pos);
      game.ui.toast('Unlocked!', 'good');
    }
    this.openDoor(game, game.player.pos, false);
  }

  openDoor(game, from, kicked) {
    if (this.open) return;
    this.open = true;
    // swing away from whoever opened it
    const dx = this.center.x - from.x, dz = this.center.z - from.z;
    const away = this.axis === 'x' ? Math.sign(dx) : Math.sign(dz);
    const mult = { E: 1, W: -1, S: 1, N: -1 }[this.side] || 1;
    this.target = 1.75 * (away || 1) * mult;
    this.speed = kicked ? 14 : 4;
    game.world.blocked[this.cy * game.world.W + this.cx] = 0;
    game.world.flowCell = -1;
    game.audio.door(this.pos, kicked);
    if (kicked) {
      game.fx.debris(this.center, 'wood', 6, 4);
      game.fx.dust(this.center, 4, 0x8a8070, 0.6);
      // knock back anyone standing behind
      for (const e of game.level.enemies) {
        if (e.dead) continue;
        if (e.pos.distanceTo(_v.set(this.center.x, 0, this.center.z)) < 2.2) {
          const d = _v.subVectors(e.pos, from).setY(0).normalize().clone();
          e.takeDamage(game, { amount: 8, dir: d, knockback: 12, stagger: 60, point: e.chestPos(), source: 'player' });
        }
      }
    }
  }

  kick(game, from, power) {
    if (this.open) return false;
    if (this.locked) {
      game.audio.wallHit(this.pos);
      game.ui.toast('It won’t budge. Locked.', 'neg');
      return true;
    }
    this.openDoor(game, from, true);
    void power;
    return true;
  }

  // weapon strikes chip the door
  onStrike(game, point) {
    if (this.open) return;
    this.hp--;
    game.audio.woodHit(point, this.hp <= 0);
    game.fx.debris(point, 'wood', 4, 3);
    if (this.hp <= 0 && !this.locked) this.openDoor(game, game.player.pos, true);
  }

  update(dt) {
    const k = 1 - Math.exp(-(this.speed || 4) * dt);
    this.openAmt += (this.target - this.openAmt) * k;
    this.mesh.rotation.y = this.baseRot + this.openAmt;
  }
}

export class Gate {
  constructor(game, g, height) {
    this.game = game;
    this.cx = g.cx;
    this.cy = g.cy;
    this.roomId = g.roomId;
    this.mesh = M.makeGate(height);
    const x = (g.cx + 0.5) * TILE, z = (g.cy + 0.5) * TILE;
    this.mesh.position.set(x, height + 0.2, z);
    if (g.axis === 'x') this.mesh.rotation.y = Math.PI / 2;
    this.height = height;
    this.closed = false;
    this.y = height + 0.2;
    this.pos = new THREE.Vector3(x, 1.5, z);
    game.renderer.scene.add(this.mesh);
  }

  close(game) {
    if (this.closed) return;
    this.closed = true;
    const i = this.cy * game.world.W + this.cx;
    game.world.blocked[i] = 1;
    game.world.flowCell = -1;
    // shove out anything standing in the doorway
    const p = game.player;
    const cx = (this.cx + 0.5) * TILE, cz = (this.cy + 0.5) * TILE;
    if (Math.abs(p.pos.x - cx) < TILE / 2 + 0.4 && Math.abs(p.pos.z - cz) < TILE / 2 + 0.4) game.world.collideCircle(p.pos, p.radius);
    game.audio.gate(this.pos, true);
  }

  open(game) {
    if (!this.closed) return;
    this.closed = false;
    game.world.blocked[this.cy * game.world.W + this.cx] = 0;
    game.world.flowCell = -1;
    game.audio.gate(this.pos, false);
  }

  update(dt) {
    const target = this.closed ? 0 : this.height + 0.2;
    const sp = this.closed ? 14 : 2.5;
    if (Math.abs(this.y - target) > 0.001) {
      const before = this.y;
      this.y += Math.sign(target - this.y) * Math.min(Math.abs(target - this.y), sp * dt);
      if (this.closed && this.y === 0 && before > 0) {
        this.game.fx.dust(this.pos.clone().setY(0.1), 4, 0x8a8070, 0.8);
        this.game.player.addTrauma(0.15);
      }
    }
    this.mesh.position.y = this.y;
  }
}

export class SecretWall {
  constructor(game, s, mats) {
    this.game = game;
    this.cx = s.cx;
    this.cy = s.cy;
    this.roomId = s.roomId;
    const h = 3.0;
    this.mesh = M.makeSecretWall(mats, h);
    this.mesh.position.set((s.cx + 0.5) * TILE, h / 2, (s.cy + 0.5) * TILE);
    this.hp = 3;
    this.broken = false;
    this.pos = this.mesh.position.clone();
    game.renderer.scene.add(this.mesh);
  }

  hit(game, point, power) {
    if (this.broken) return;
    this.hp -= power;
    game.fx.debris(point, 'stone', 6, 3);
    game.fx.dust(point, 3, 0x9a9080, 0.3);
    if (this.hp > 0) {
      game.audio.wallHit(point);
      game.fx.numbers.add(point.clone(), 'hollow...', 'hint');
      return;
    }
    this.break(game);
  }

  reveal() {
    // soul lantern makes cracked walls glow
    this.mesh.material = this.mesh.material.clone();
    this.mesh.material.emissive = new THREE.Color(0x6644aa);
    this.mesh.material.emissiveIntensity = 0.6;
  }

  break(game) {
    if (this.broken) return;
    this.broken = true;
    this.mesh.removeFromParent();
    const i = this.cy * game.world.W + this.cx;
    game.world.blocked[i] = 0;
    game.world.flowCell = -1;
    const c = this.pos;
    game.fx.debris(c, 'stone', 30, 6);
    game.fx.dust(c, 14, 0x9a9080, 1.2);
    game.audio.explosion(c, 0.6);
    game.player.addTrauma(0.3);
    // rubble bodies
    for (let k = 0; k < 8; k++) {
      const s = rand(0.18, 0.4);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), game.level.mats.stone);
      game.renderer.scene.add(mesh);
      const b = new RigidBody({ type: 'box', hx: s / 2, hy: s * 0.35, hz: s / 2 }, { mass: 2, mesh, life: 60, fade: 2, restitution: 0.15 });
      b.pos.copy(c).add(new THREE.Vector3(rand(-0.8, 0.8), rand(-1, 1), rand(-0.8, 0.8)));
      b.vel.set(rand(-3, 3), rand(0, 3), rand(-3, 3));
      b.ang.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
      game.physics.add(b);
    }
    game.audio.secret();
    game.ui.banner('SECRET FOUND', 'A hidden chamber reveals itself');
    game.stats.secrets++;
  }
}

// ---------------------------------------------------------------- traps
export class Trap {
  constructor(game, e) {
    this.game = game;
    this.kind = e.kind;
    this.cx = e.cx;
    this.cy = e.cy;
    this.x = (e.cx + 0.5) * TILE;
    this.z = (e.cy + 0.5) * TILE;
    this.axis = e.axis || 'x';
    this.t = Math.random() * 3;
    this.state = 'idle';
    this.hitSet = new Set();
    const scene = game.renderer.scene;
    switch (this.kind) {
      case 'spikes':
        this.mesh = M.makeSpikeTrap();
        this.mesh.position.set(this.x, 0, this.z);
        scene.add(this.mesh);
        break;
      case 'darts': {
        this.mesh = M.makePressurePlate(game.level.mats);
        this.mesh.position.set(this.x, 0, this.z);
        scene.add(this.mesh);
        // shooters in both walls perpendicular to the passage
        this.shooters = [];
        for (const s of [-1, 1]) {
          const sh = M.makeDartShooter();
          if (this.axis === 'x') { sh.position.set(this.x + 0, 1.2, this.z + s * (TILE / 2 - 0.02)); sh.rotation.y = 0; }
          else { sh.position.set(this.x + s * (TILE / 2 - 0.02), 1.2, this.z); sh.rotation.y = Math.PI / 2; }
          scene.add(sh);
          this.shooters.push({ mesh: sh, side: s });
        }
        break;
      }
      case 'blade': {
        this.mesh = M.makeBlade();
        const ceil = game.world.ceilAt(this.x, this.z);
        this.mesh.position.set(this.x, ceil - 0.05, this.z);
        this.mesh.rotation.y = this.axis === 'x' ? Math.PI / 2 : 0;
        const s = (ceil - 0.05) / 2.6;
        this.mesh.scale.set(1, s, 1);
        scene.add(this.mesh);
        this.pivotH = ceil;
        break;
      }
      case 'flame':
        this.mesh = M.makeFlameVent();
        this.mesh.position.set(this.x, 0, this.z);
        scene.add(this.mesh);
        this.light = game.renderer.addDynamic(new THREE.Vector3(this.x, 1, this.z), 0xff6622, 0, 7, 0.8);
        break;
      default:
    }
  }

  _actorsOnCell(fn) {
    const g = this.game;
    const p = g.player;
    const inCell = (pos, r = 0.2) => Math.abs(pos.x - this.x) < TILE / 2 - 0.1 + r && Math.abs(pos.z - this.z) < TILE / 2 - 0.1 + r;
    if (!p.dead && inCell(p.pos) && p.pos.y < 0.6) fn(p, true);
    for (const e of g.level.enemies) if (!e.dead && !e.flying && inCell(e.pos)) fn(e, false);
    for (const c of g.level.corpses) {
      // spikes skewer corpses for fun
      if (inCell(c.ragdoll.pos[1], 0)) c.ragdoll.impulseAll(new THREE.Vector3(0, 0.5, 0));
    }
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.kind === 'spikes') {
      const sp = this.mesh.userData.spikes;
      if (this.state === 'idle') {
        let trig = false;
        this._actorsOnCell(() => (trig = true));
        if (trig) { this.state = 'armed'; this.t = 0; g.audio.trap({ x: this.x, y: 0, z: this.z }, 'click'); }
        sp.position.y = Math.max(-0.8, sp.position.y - dt * 2);
      } else if (this.state === 'armed') {
        if (this.t > 0.42) {
          this.state = 'up';
          this.t = 0;
          this.hitSet.clear();
          g.audio.trap({ x: this.x, y: 0.3, z: this.z }, 'spikes');
          this._actorsOnCell((a, isPlayer) => this._hurt(a, isPlayer, 18 + g.floor * 6));
          g.fx.dust(new THREE.Vector3(this.x, 0.1, this.z), 3, 0x8a8070, 0.8);
        }
      } else if (this.state === 'up') {
        sp.position.y = Math.min(0, sp.position.y + dt * 14);
        this._actorsOnCell((a, isPlayer) => this._hurt(a, isPlayer, 10 + g.floor * 4));
        if (this.t > 1.2) { this.state = 'idle'; this.t = 0; }
      }
    } else if (this.kind === 'darts') {
      if (this.state === 'idle') {
        let trig = false;
        this._actorsOnCell(() => (trig = true));
        if (trig) {
          this.state = 'cool';
          this.t = 0;
          this.mesh.position.y = -0.03;
          g.audio.trap({ x: this.x, y: 0, z: this.z }, 'click');
          for (const s of this.shooters) {
            const from = s.mesh.position.clone();
            const dir = this.axis === 'x' ? new THREE.Vector3(0, 0, -s.side) : new THREE.Vector3(-s.side, 0, 0);
            for (let k = 0; k < 2; k++) {
              g.schedule(0.1 + k * 0.18, () => {
                const fp = from.clone().add(new THREE.Vector3(0, k * 0.35 - 0.2, 0));
                g.spawnEnemyProjectile('arrow', fp, dir.clone().multiplyScalar(22), 10 + g.floor * 4, null);
              });
            }
          }
        }
      } else if (this.t > 2.5) { this.state = 'idle'; this.mesh.position.y = 0; }
    } else if (this.kind === 'blade') {
      const a = Math.sin(this.t * 2.2) * 1.15;
      this.mesh.rotation.z = a;
      if (Math.abs(Math.cos(this.t * 2.2)) > 0.97 && !this._swish) { this._swish = true; g.audio.trap(this.mesh.position, 'blade'); }
      if (Math.abs(Math.cos(this.t * 2.2)) < 0.9) this._swish = false;
      // blade tip position (swing plane across the corridor)
      const L = this.pivotH - 0.45;
      const off = Math.sin(a) * L;
      const tipY = this.pivotH - Math.cos(a) * L;
      const bx = this.axis === 'x' ? this.x : this.x + off;
      const bz = this.axis === 'x' ? this.z + off : this.z;
      void bx; void bz;
      if (tipY < 1.9 && Math.abs(Math.cos(this.t * 2.2)) > 0.5) {
        const hit = (pos) => {
          const along = this.axis === 'x' ? Math.abs(pos.x - this.x) : Math.abs(pos.z - this.z);
          const across = this.axis === 'x' ? pos.z - this.z : pos.x - this.x;
          return along < 0.6 && Math.abs(across - off) < 0.75;
        };
        const p = g.player;
        if (!p.dead && hit(p.pos) && !this.hitSet.has(p)) {
          this.hitSet.add(p);
          g.schedule(0.8, () => this.hitSet.delete(p));
          this._hurt(p, true, 20 + g.floor * 6, this.axis === 'x' ? new THREE.Vector3(0, 0, Math.sign(Math.cos(this.t * 2.2))) : new THREE.Vector3(Math.sign(Math.cos(this.t * 2.2)), 0, 0));
        }
        for (const e of g.level.enemies) {
          if (e.dead || this.hitSet.has(e) || !hit(e.pos)) continue;
          this.hitSet.add(e);
          g.schedule(0.8, () => this.hitSet.delete(e));
          this._hurt(e, false, 35 + g.floor * 8);
        }
      }
    } else if (this.kind === 'flame') {
      const cycle = this.t % 4;
      const on = cycle > 2.5;
      this.light.intensity = on ? 18 : cycle > 2.0 ? 4 : 0;
      this.mesh.userData.glow.material.color.setHex(cycle > 2.0 ? 0xffaa33 : 0x661a08);
      if (cycle > 2.0 && cycle < 2.5 && Math.random() < 0.3) g.fx.spark(new THREE.Vector3(this.x, 0.15, this.z), new THREE.Vector3(rand(-0.5, 0.5), 2, rand(-0.5, 0.5)), 0xff8833, 0.4, 0.08);
      if (on) {
        for (let i = 0; i < 3; i++) g.fx.fire(new THREE.Vector3(this.x, 0.2 + Math.random() * 2.4, this.z), 1.6, 0.4);
        if (!this._roar) { this._roar = true; g.audio.fire({ x: this.x, y: 1, z: this.z }, true); }
        this._actorsOnCell((a, isPlayer) => {
          if (this.hitSet.has(a)) return;
          this.hitSet.add(a);
          g.schedule(0.5, () => this.hitSet.delete(a));
          this._hurt(a, isPlayer, 8 + g.floor * 3, null, 'fire');
          if (!isPlayer) a.ignite(g, 6 + g.floor * 2, 3);
        });
      } else this._roar = false;
    }
  }

  _hurt(a, isPlayer, dmg, dir = null, type = 'phys') {
    const g = this.game;
    if (isPlayer) {
      if (this.hitSet.has(a) && this.kind === 'spikes') return;
      this.hitSet.add(a);
      a.takeDamage({ amount: dmg, dir: dir || new THREE.Vector3(0, 0, 0), knock: dir ? 6 : 0, unblockable: true, type, source: 'trap' });
    } else {
      if (this.hitSet.has(a) && this.kind === 'spikes') return;
      this.hitSet.add(a);
      a.takeDamage(g, { amount: dmg, dir: dir || new THREE.Vector3(0, 1, 0), knockback: 3, stagger: 40, point: a.chestPos(), source: 'player', type, gore: 1 });
    }
  }

  dispose() {
    if (this.light) this.game.renderer.removeDynamic(this.light);
  }
}

// ---------------------------------------------------------------- shrines & events
const SHRINES = {
  blood: { name: 'Blood Altar', prompt: 'Offer blood (25% max health) for a relic' },
  fortune: { name: 'Statue of Fortune', prompt: 'Pray for a blessing (35 gold)' },
  fountain: { name: 'Healing Fountain', prompt: 'Drink from the fountain' },
  anvil: { name: 'Ancient Anvil', prompt: 'Temper your weapon (+15% damage)' },
  gamble: { name: "Gambler's Idol", prompt: 'Feed the idol gold for a random item' },
  challenge: { name: 'Obelisk of Trials', prompt: 'Accept the challenge: survive the horde' },
};

export class Shrine {
  constructor(game, e) {
    this.game = game;
    this.isInteractable = true;
    this.kind = e.kind;
    this.roomId = e.roomId;
    this.def = SHRINES[e.kind];
    this.mesh = M.makeShrine(e.kind, game.level.mats);
    this.mesh.position.set(e.x, 0, e.z);
    harvestFlames(this.mesh, game.flames);
    this.pos = new THREE.Vector3(e.x, 1.0, e.z);
    this.radius = 1.3;
    this.used = false;
    this.uses = 0;
    game.renderer.scene.add(this.mesh);
    this.light = game.renderer.addLightSource(new THREE.Vector3(e.x, 1.6, e.z), this.mesh.userData.color, 10, 9, 0.3);
    game.level.addObstacle({ type: 'circle', x: e.x, z: e.z, r: e.kind === 'fountain' ? 1.15 : 0.75, h: 1.5 });
    this.flames = this.mesh.userData.flames || [];
  }

  cost() {
    const f = this.game.floor;
    if (this.kind === 'fortune') return 35 + f * 10;
    if (this.kind === 'anvil') return 60 + f * 20 + this.uses * 40;
    if (this.kind === 'gamble') return 50 + f * 15;
    return 0;
  }

  label() {
    if (this.used) return null;
    const c = this.cost();
    let t = this.def.prompt;
    if (this.kind === 'fortune' || this.kind === 'anvil' || this.kind === 'gamble') t = t.replace(/\(.*\)/, '') + ` (${c} gold)`;
    return `${this.def.name}: ${t}`;
  }

  interact(game) {
    if (this.used) return;
    const p = game.player;
    const c = this.cost();
    if (c > 0 && p.gold < c) { game.audio.ui('deny'); game.ui.toast(`Not enough gold (${c} needed)`, 'neg'); return; }
    p.vm.reach();
    switch (this.kind) {
      case 'blood': {
        const cost = Math.round(p.stats.maxHp * 0.25);
        if (p.hp <= cost) { game.audio.ui('deny'); game.ui.toast('You are too weak to offer blood', 'neg'); return; }
        p.hp -= cost;
        game.fx.blood(this.pos.clone().setY(1), UP, 1.5);
        game.audio.gore(this.pos, 1);
        game.loot.dropRelic(this.pos.clone().setY(1.2), 1);
        this.used = true;
        break;
      }
      case 'fortune': {
        p.gold -= c;
        const roll = Math.random();
        if (roll < 0.45) {
          const pool = [['Blessing of Might', { damage: 0.25 }], ['Blessing of Haste', { attackSpeed: 0.2, moveSpeed: 0.15 }], ['Blessing of Iron', { armor: 0.15 }], ['Blessing of Fortune', { luck: 0.5, goldFind: 0.5 }]];
          const [name, stats] = pool[randInt(0, pool.length - 1)];
          p.addBuff('blessing', 240, stats);
          game.ui.banner(name, 'A warm light fills you (4 minutes)');
          game.audio.levelUp();
        } else if (roll < 0.8) {
          game.loot.dropGear(this.pos.clone().setY(1.2), 1);
          game.audio.pickup(2);
        } else {
          p.addBuff('curse', 60, { damageTaken: 0.25 });
          game.ui.banner('The statue weeps', 'You feel vulnerable (1 minute)');
          game.audio.ui('deny');
        }
        this.used = true;
        break;
      }
      case 'fountain': {
        p.hp = p.stats.maxHp;
        game.audio.potion();
        game.fx.magic(p.chestPos(), 0x66ccff, 30, 2);
        game.ui.toast('Fully healed', 'good');
        if (Math.random() < 0.3) { p.addBuff('blessed', 120, { regen: 1.5 }); game.ui.toast('...and blessed with regeneration!', 'buff'); }
        this.used = true;
        break;
      }
      case 'anvil': {
        const w = p.weapon;
        p.gold -= c;
        w.dmg = Math.round(w.dmg * 1.15 + 1);
        w.upgrades = (w.upgrades || 0) + 1;
        this.uses++;
        p.refreshStats();
        game.audio.clang(this.pos, 1, 1.2);
        game.fx.sparks(this.pos.clone().setY(0.9), UP, 30, 0xffaa44, 6);
        game.ui.toast(`${w.name} tempered to +${w.upgrades}!`, 'good');
        if (this.uses >= 3) this.used = true;
        break;
      }
      case 'gamble': {
        p.gold -= c;
        this.uses++;
        game.audio.coin(this.pos);
        if (Math.random() < 0.15) {
          game.ui.toast('The idol laughs at you...', 'neg');
          game.audio.ui('deny');
        } else game.loot.dropGear(this.pos.clone().setY(1.4), Math.random() < 0.25 ? 2 : 1);
        if (this.uses >= 3) this.used = true;
        break;
      }
      case 'challenge': {
        this.used = true;
        game.level.startChallenge(this);
        break;
      }
      default:
    }
    if (this.used) {
      this.mesh.userData.rune.material.opacity = 0.15;
      this.light.intensity = 3;
    }
  }

  update(dt) {
    const t = this.game.time;
    for (const f of this.flames) M.animateFlame(f, t);
    const r = this.mesh.userData.rune;
    r.rotation.z += dt * 0.2;
    if (this.mesh.userData.orb) this.mesh.userData.orb.position.y += Math.sin(t * 2) * 0.002;
    if (!this.used && Math.random() < 0.2) this.game.fx.spark(this.pos.clone().add(new THREE.Vector3(rand(-1.3, 1.3), -0.9, rand(-1.3, 1.3))), new THREE.Vector3(0, rand(0.5, 1.5), 0), this.mesh.userData.color, 1.2, 0.08, { grav: -0.2, floor: false });
  }
}

// ---------------------------------------------------------------- merchant
export class Shop {
  constructor(game, e) {
    this.game = game;
    this.isInteractable = true;
    const room = game.world.rooms[e.roomId ?? game.world.roomOf[e.cy * game.world.W + e.cx]];
    this.room = room;
    // merchant stands against the "back" of the room relative to its centre
    this.merchant = M.makeMerchant();
    const mx = e.x, mz = e.z - 1.6;
    this.merchant.position.set(mx, 0, mz);
    this.merchant.rotation.y = 0;
    harvestFlames(this.merchant, game.flames);
    game.renderer.scene.add(this.merchant);
    this.pos = new THREE.Vector3(mx, 1.6, mz);
    this.radius = 0.8;
    this.flames = this.merchant.userData.flames;
    game.level.addObstacle({ type: 'circle', x: mx, z: mz, r: 0.7, h: 2 });
    // counter
    let counter = M.makeTable();
    counter.position.set(mx, 0, mz + 0.9);
    harvestFlames(counter, game.flames);
    counter = mergeStatic(counter);
    game.renderer.scene.add(counter);
    game.level.addObstacle({ type: 'box', x0: mx - 0.95, z0: mz + 0.4, x1: mx + 0.95, z1: mz + 1.4, h: 1 });
    game.renderer.addLightSource(new THREE.Vector3(mx + 0.5, 2.2, mz + 0.5), 0xffcc77, 14, 10, 0.4);
    // wares on pedestals
    this.wares = [];
    const items = game.loot.shopStock();
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const x = e.x + (i - (n - 1) / 2) * 1.5;
      const z = e.z + 1.6;
      const ped = new Pedestal(game, { x, z, item: items[i].item, price: items[i].price, shop: this });
      this.wares.push(ped);
      game.level.interactables.push(ped);
      game.level.updatables.push(ped);
    }
    this.greeted = false;
  }

  label() {
    return 'Merchant: "Coin for steel, wanderer."';
  }

  interact(game) {
    game.audio.voice(this.pos, 'cultist', 'alert');
    game.ui.toast('"Everything has a price. Look closer at my wares."', 'info');
  }

  update(dt) {
    const g = this.game;
    for (const f of this.flames) M.animateFlame(f, g.time);
    const p = g.player.pos;
    this.merchant.userData.torso.scale.y = 0.9 + Math.sin(g.time * 2) * 0.02;
    if (!this.greeted && p.distanceTo(this.merchant.position) < 7) {
      this.greeted = true;
      g.ui.toast('A merchant hums in the dark...', 'info');
    }
  }
}

// An item displayed on a stone pedestal (shop ware or treasure relic).
export class Pedestal {
  constructor(game, opts) {
    this.game = game;
    this.isInteractable = true;
    this.item = opts.item;
    this.price = opts.price || 0;
    this.shop = opts.shop || null;
    this.mesh = M.makePedestal(game.level.mats);
    this.mesh.position.set(opts.x, 0, opts.z);
    this.mesh.scale.setScalar(this.shop ? 0.85 : 1);
    game.renderer.scene.add(this.mesh);
    this.pos = new THREE.Vector3(opts.x, this.shop ? 1.35 : 1.55, opts.z);
    this.radius = 0.6;
    this.display = game.loot.makeDisplayMesh(this.item);
    this.display.position.copy(this.pos);
    game.renderer.scene.add(this.display);
    this.light = game.renderer.addLightSource(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), game.loot.rarityColor(this.item), 4, 4, 0);
    game.level.addObstacle({ type: 'circle', x: opts.x, z: opts.z, r: 0.42, h: 1.2 });
  }

  label() {
    if (!this.item) return null;
    const name = this.item.name || this.game.loot.itemName(this.item);
    return this.price ? `Buy ${name} — ${this.price} gold` : `Take ${name}`;
  }

  tooltipItem() {
    return this.item;
  }

  interact(game) {
    if (!this.item) return;
    const p = game.player;
    if (this.price) {
      if (p.gold < this.price) { game.audio.ui('deny'); game.ui.toast(`Not enough gold (${this.price})`, 'neg'); return; }
      p.gold -= this.price;
      game.audio.buy();
      game.stats.goldSpent += this.price;
    }
    p.vm.reach();
    const item = this.item;
    this.item = null;
    this.display.removeFromParent();
    this.light.on = false;
    game.loot.give(item, this.pos.clone());
  }

  update(dt) {
    if (!this.item) return;
    const t = this.game.time;
    this.display.rotation.y += dt * 1.2;
    this.display.position.y = this.pos.y + Math.sin(t * 2 + this.pos.x) * 0.05;
  }
}

// ---------------------------------------------------------------- exit
export class Exit {
  constructor(game, e) {
    this.game = game;
    this.isInteractable = true;
    this.mesh = M.makeExitPortal();
    this.mesh.position.set(e.x, 0, e.z);
    this.mesh.visible = false;
    game.renderer.scene.add(this.mesh);
    this.pos = new THREE.Vector3(e.x, 0.8, e.z);
    this.radius = 1.6;
    this.active = false;
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.mesh.visible = true;
    this.light = this.game.renderer.addLightSource(this.pos.clone().setY(1.5), 0x88aaff, 20, 12, 0.2);
    this.game.fx.ring(this.pos, 0x88aaff, 5, 1, 1);
    this.game.audio.secret();
  }

  label() {
    if (!this.active) return null;
    return this.game.floor >= this.game.finalFloor ? 'Enter the light (end your descent)' : `Descend to depth ${this.game.floor + 1}`;
  }

  interact(game) {
    if (!this.active) return;
    game.descend();
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.mesh.userData.ring.rotation.z += dt * 0.5;
    this.mesh.userData.beam.material.opacity = 0.14 + Math.sin(g.time * 3) * 0.04;
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
      g.fx.spark(new THREE.Vector3(this.pos.x + Math.cos(a) * r, 0.1, this.pos.z + Math.sin(a) * r), new THREE.Vector3(0, rand(1.5, 3.5), 0), 0x88aaff, 1.5, 0.1, { grav: -0.5, floor: false });
    }
  }
}
