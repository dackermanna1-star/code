// Simulated players. The original game was multiplayer; to keep this
// recreation self-contained, other "players" are driven by simple AI brains
// that walk, jump obstacles, use tools and chat like 2008 players did.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { GROUP } from './Part.js';

export const CHAT_LINES = {
  greet: ['hi', 'hello', 'hey guys', 'sup', 'hi everyone', 'yo', 'hi :)', 'hello!!'],
  idle: ['lol', 'this game is cool', 'anyone want to be friends?', 'brb', 'k im back', 'wow', 'haha', 'XD', 'cool', 'how do u do that', 'lag...', 'im so laggy', 'nice', 'who wants to team?', 'follow me', 'this place is awesome', 'add me as a friend', 'w00t', 'pwned', 'ok', 'lol noob', 'im not a noob', 'i have builders club', 'can someone give me tix', 'i got 100 tix today'],
  win: ['YES', 'i won!', 'w00t!!', 'gg', 'yay', 'pwned'],
  die: ['noooo', 'aww', 'oof', 'lol i died', 'not fair', 'lag', 'that was lag'],
  bye: ['bye', 'gtg', 'cya'],
};
export const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class BotBrain {
  constructor(game, player, opts = {}) {
    this.game = game;
    this.player = player;
    this.target = null;
    this.thinkTimer = Math.random();
    this.chatTimer = 8 + Math.random() * 30;
    this.chattiness = opts.chattiness ?? 1;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.wanderCenter = opts.wanderCenter || null;
    this.wanderRadius = opts.wanderRadius || 40;
    this.arriveRadius = 2;
    this.jumpCooldown = 0;
    this.speedScale = opts.speedScale ?? 1;
  }

  get ch() { return this.player.character; }
  get world() { return this.game.world; }

  say(text) { this.game.chat(this.player, text); }

  update(dt) {
    const ch = this.ch;
    if (!ch || !ch.alive) return;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.thinkTimer = 0.25 + Math.random() * 0.25; this.think(); }
    this.chatTimer -= dt * this.chattiness;
    if (this.chatTimer <= 0) {
      this.chatTimer = 25 + Math.random() * 60;
      this.idleChat();
    }
    this.jumpCooldown -= dt;
    this.steer(dt);
  }

  idleChat() { if (Math.random() < 0.6) this.say(pick(CHAT_LINES.idle)); }

  /** Override: decide what to do (set this.target etc.). */
  think() {
    if (!this.target || this.reached()) {
      const c = this.wanderCenter || this.ch.rootPosition;
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.wanderRadius;
      this.target = new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      if (Math.random() < 0.3) this.target = null; // stand around for a bit
    }
  }

  reached() {
    if (!this.target) return true;
    const p = this.ch.rootPosition;
    return Math.hypot(this.target.x - p.x, this.target.z - p.z) < this.arriveRadius;
  }

  ray(from, to) {
    const r = new CANNON.RaycastResult();
    this.world.physics.raycastClosest(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), { collisionFilterMask: GROUP.WORLD | GROUP.DYNAMIC, skipBackfaces: true }, r);
    return r.hasHit ? r : null;
  }

  steer(dt) {
    const ch = this.ch;
    ch.input.jump = false;
    if (!this.target) { ch.input.move.set(0, 0, 0); return; }
    const p = ch.rootPosition;
    const d = new THREE.Vector3(this.target.x - p.x, 0, this.target.z - p.z);
    const dist = d.length();
    if (dist < this.arriveRadius * 0.5) { ch.input.move.set(0, 0, 0); return; }
    d.normalize();
    ch.input.move.copy(d).multiplyScalar(this.speedScale);
    const feet = p.y - 3;
    // obstacle ahead at knee height -> jump
    const knee = this.ray(new THREE.Vector3(p.x, feet + 1.4, p.z), new THREE.Vector3(p.x + d.x * 2.6, feet + 1.4, p.z + d.z * 2.6));
    if (knee && ch.grounded && this.jumpCooldown <= 0) {
      const head = this.ray(new THREE.Vector3(p.x, feet + 6.5, p.z), new THREE.Vector3(p.x + d.x * 3, feet + 6.5, p.z + d.z * 3));
      if (!head) { ch.input.jump = true; this.jumpCooldown = 0.4; }
    }
    // gap ahead -> jump if the target is beyond it (and we mean to cross)
    if (ch.grounded && this.jumpCooldown <= 0 && this.jumpGaps !== false) {
      const ahead = new THREE.Vector3(p.x + d.x * 2.2, feet + 0.5, p.z + d.z * 2.2);
      const ground = this.ray(ahead, ahead.clone().add(new THREE.Vector3(0, -6, 0)));
      if (!ground && dist > 3) {
        if (this.allowGapJumps) { ch.input.jump = true; this.jumpCooldown = 0.5; }
        else if (!this.dontAvoidEdges) { ch.input.move.set(0, 0, 0); this.target = null; }
      }
    }
    // stuck detection
    if (p.distanceTo(this.lastPos) < 0.05 * dt * 60) this.stuckTimer += dt; else this.stuckTimer = 0;
    this.lastPos.copy(p);
    if (this.stuckTimer > 1.2) {
      this.stuckTimer = 0;
      if (ch.grounded) ch.input.jump = true;
      if (Math.random() < 0.5) this.target = null;
    }
  }

  /** Face and use the equipped tool at a point. */
  useToolAt(point) {
    const ch = this.ch;
    if (ch.tool) ch.tool.activate(point.clone());
  }

  equipFirst(name) {
    const i = this.player.backpack.findIndex((t) => !name || t.name === name);
    if (i >= 0 && this.player.equipped !== i) this.game.equip(this.player, i);
  }
}

/** Fights nearby enemies with whatever tool it holds (brickbattle style). */
export class FighterBrain extends BotBrain {
  constructor(game, player, opts = {}) {
    super(game, player, opts);
    this.aggro = opts.aggro ?? 60;
    this.enemy = null;
    this.fireTimer = 0;
  }
  findEnemy() {
    let best = null, bd = this.aggro;
    for (const other of this.game.players) {
      if (other === this.player || !other.character || !other.character.alive) continue;
      if (this.player.team && other.team === this.player.team) continue;
      if (other.character.forceField) continue;
      const d = other.character.rootPosition.distanceTo(this.ch.rootPosition);
      if (d < bd) { bd = d; best = other; }
    }
    return best;
  }
  think() {
    this.enemy = this.findEnemy();
    if (this.enemy) {
      const e = this.enemy.character.rootPosition;
      const tool = this.ch.tool;
      const ranged = tool && tool.name !== 'Sword';
      if (ranged) {
        // keep some distance, strafe
        const p = this.ch.rootPosition;
        const away = p.clone().sub(e).setY(0).normalize();
        const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
        this.target = e.clone().addScaledVector(away, 25).addScaledVector(side, 10);
      } else {
        this.target = e.clone();
        this.arriveRadius = 1;
      }
    } else {
      super.think();
    }
  }
  update(dt) {
    super.update(dt);
    if (!this.enemy || !this.ch || !this.ch.alive) return;
    const ec = this.enemy.character;
    if (!ec || !ec.alive) { this.enemy = null; return; }
    this.fireTimer -= dt;
    const dist = ec.rootPosition.distanceTo(this.ch.rootPosition);
    const tool = this.ch.tool;
    if (!tool) return;
    if (tool.name === 'Sword') {
      if (dist < 6 && this.fireTimer <= 0) {
        this.useToolAt(ec.rootPosition);
        if (Math.random() < 0.4) this.game.world.delay(0.1, () => this.useToolAt(ec.rootPosition));
        this.fireTimer = 0.35 + Math.random() * 0.4;
      }
    } else if (dist < this.aggro && this.fireTimer <= 0) {
      // lead the target a little, with human-ish inaccuracy
      const lead = ec.rootPosition.clone().add(new THREE.Vector3(ec.body.velocity.x, 0, ec.body.velocity.z).multiplyScalar(dist / 120));
      lead.x += (Math.random() - 0.5) * 3; lead.y += (Math.random() - 0.5) * 2; lead.z += (Math.random() - 0.5) * 3;
      this.useToolAt(lead);
      this.fireTimer = 0.5 + Math.random() * 0.8;
    }
  }
}
