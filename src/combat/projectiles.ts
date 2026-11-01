import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from './fighter';
import { buildMesh, Weapon } from './weapons';
import { makeHit } from './types';
import { DIFFICULTY } from '../core/settings';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

interface Flying {
  group: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  t: number;
  owner: Fighter;
  damage: number;
  bleed: number;
  venom: boolean;
  done: boolean;
}

/**
 * Thrown blades (Viper's knives): straight, fast flights with a spin. They read as red attacks
 * (dodge them; a raised guard eats one at a cost), stick into whoever they hit, and a knife that
 * misses clatters to the floor as a real weapon - pick it up and use it.
 */
export class Projectiles {
  list: Flying[] = [];
  constructor(public game: Game) {}

  /** Throw a knife from `from` at `at` (a point on the target, aimed at release). */
  throwKnife(owner: Fighter, from: THREE.Vector3, at: THREE.Vector3, speed: number, damage: number, bleed: number, venom: boolean) {
    const m = buildMesh('knife');
    this.game.scene.add(m.group);
    const vel = _v.subVectors(at, from).normalize().multiplyScalar(speed).clone();
    m.group.position.copy(from);
    this.list.push({ group: m.group, pos: from.clone(), vel, spin: 26, t: 0, owner, damage, bleed, venom, done: false });
    this.game.audio.play('whoosh_light', { pos: from, vol: 0.9, pitch: 1.25 });
  }

  /** Seconds until a knife thrown from `from` at `speed` reaches `at`. */
  static flightTime(from: THREE.Vector3, at: THREE.Vector3, speed: number) {
    return from.distanceTo(at) / speed;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.player;
    for (const k of this.list) {
      if (k.done) continue;
      k.t += dt;
      k.vel.y -= 2.0 * dt; // a slight drop
      k.pos.addScaledVector(k.vel, dt);
      // blade first, tumbling end over end
      k.group.position.copy(k.pos);
      const dir = _c.copy(k.vel).normalize();
      k.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      k.group.rotateX(k.t * k.spin);
      // the player
      if (p.alive) {
        p.bodyPoint('chest', _v);
        if (_v.distanceTo(k.pos) < 0.42 || (Math.abs(k.pos.y - 1.0) < 0.75 && Math.hypot(k.pos.x - p.x, k.pos.z - p.z) < 0.3)) {
          const mods = DIFFICULTY[g.settings.difficulty] ?? DIFFICULTY.fighter;
          const h = makeHit({ dir: _c.set(k.vel.x, 0, k.vel.z).normalize().clone(), point: k.pos.clone(), damage: k.damage * mods.damage, strength: 0.6, kind: 'blade', region: 'chest', attacker: k.owner, bleed: k.bleed, venom: k.venom });
          const res = p.takeHit(h);
          if (res !== 'dodged' && res !== 'ignored') {
            g.combat.feedback(k.owner, p, h, res);
            this.finish(k, res === 'blocked');
            continue;
          }
        }
      }
      // walls, crates, the floor
      const [cx, cz] = g.arena.collide(k.pos.x, k.pos.z, 0.05, false);
      if (cx !== k.pos.x || cz !== k.pos.z || k.pos.y < 0.06 || k.t > 2.5) {
        g.audio.play('metal_hit', { pos: k.pos, vol: 0.5, pitch: 1.4 });
        g.fx.sparks(k.pos.clone(), k.vel.clone().negate().normalize(), 6);
        this.finish(k, true);
      }
    }
    if (this.list.some((k) => k.done)) this.list = this.list.filter((k) => !k.done);
  }

  /** A knife that hit the floor, a wall or a guard stays as a weapon; one in the body is gone. */
  private finish(k: Flying, drop: boolean) {
    k.done = true;
    k.group.removeFromParent();
    if (!drop) return;
    const w = new Weapon(this.game, 'knife');
    this.game.scene.add(w.group);
    w.group.position.copy(k.pos).setY(Math.max(0.12, k.pos.y));
    w.drop(new THREE.Vector3(k.vel.x * 0.15, 1.2, k.vel.z * 0.15), 9);
  }
}
