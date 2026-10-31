// LAST LOOKOUT — rounds in flight. A rifle round is flown for real (drag, gravity, wind, about a
// third of a second to 250 m), swept against the world every physics step. When it reaches a
// person, every dormant (animated) zombie on its line wakes up as a ragdoll and the round is handed
// to the engine's ballistics at that point (penetration through tissue and bone, wounds, the shot
// reaction, the next body behind it).
import { Vec3 } from '../../physics/math.js';
import { WEAPONS, raycastPeople } from '../../game/weapons.js';

const G = 9.81;
// drag: dv/dt = -k |v| v (k per metre: a 7.62 mm round loses ~20% of its speed over 250 m)
const DRAG = { boltAction: 0.00085, marksman: 0.00085, whisper: 0.0006, anvil: 0.00045 };

const _d = new Vec3();
const _a = new Vec3();
const _b = new Vec3();

export class Ballistics {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextShot = 1;
  }

  /**
   * Fire: rifle (catalog entry), ammo id, muzzle origin and direction. weaponKey is the WEAPONS
   * entry for this rifle and ammunition (see TowerGame.weaponKey).
   */
  fire(rifle, ammo, weaponKey, origin, dir) {
    const w = WEAPONS[weaponKey];
    const shot = { id: this.nextShot++, rifle, ammo, weaponKey, origin: origin.clone(), dist: 0, hits: 0, people: new Set(), time: this.game.time };
    const b = { shot, pos: origin.clone(), vel: dir.clone().normalize().scale(w.speed), k: DRAG[w.base || weaponKey] ?? 0.0008, t: 0, alive: true, travelled: 0 };
    this.list.push(b);
    return shot;
  }

  step(dt) {
    const game = this.game;
    for (const b of this.list) {
      if (!b.alive) continue;
      // two sub-steps per frame (a round covers ~14 m in 1/60 s)
      for (let s = 0; s < 2 && b.alive; s++) this.advance(b, dt / 2);
      if (b.t > 2.5 || b.pos.y < -2 || b.travelled > 700) b.alive = false;
    }
    if (this.list.length > 8) this.list = this.list.filter((b) => b.alive);
    else for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);
    void game;
  }

  advance(b, h) {
    const game = this.game, v = b.vel;
    const sp = v.length();
    const W = game.wind;
    // drag against the air (the wind pushes the round sideways)
    const k = b.k * sp;
    v.x += (-k * v.x + W.x * k * 2.2) * h;
    v.y += (-k * v.y - G) * h;
    v.z += (-k * v.z + W.z * k * 2.2) * h;
    _a.copy(b.pos);
    _b.copy(b.pos).addScaled(v, h);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-6) return;
    _d.scale(1 / len);
    // kill cam: the next ~0.1 s of flight ending in a qualifying hit can be taken over
    if (game.killcam && game.killcam.consider(b, _a, _d)) {
      b.alive = false;
      return;
    }
    const hit = this.cast(_a, _d, len, b);
    b.t += h;
    if (!hit) {
      b.pos.copy(_b);
      b.travelled += len;
      return;
    }
    b.alive = false;
    b.pos.copy(_a).addScaled(_d, hit.t);
    b.shot.dist = b.travelled + hit.t;
    this.resolve(b, hit, _a.clone(), _d.clone());
  }

  /** First thing on a segment: a person, a barrel, a static collider or the ground. */
  cast(origin, dir, len, b) {
    const game = this.game, sb = game.sb;
    let best = null;
    const ph = raycastPeople(sb.people, sb.shape, origin, dir, len);
    for (const h of ph) if (!best || h.tIn < best.t) best = { t: h.tIn, person: h.person, body: h.body };
    const bh = game.defences ? game.defences.raycastBarrels(origin, dir, len) : null;
    if (bh && (!best || bh.t < best.t)) best = { t: bh.t, barrel: bh.barrel };
    const wh = sb.world.raycast(origin, dir, len, (body) => !(body.userData && body.userData.ragdoll));
    if (wh && (!best || wh.tIn < best.t)) best = { t: wh.tIn, world: true, ground: !!wh.ground, body: wh.body, normal: wh.normal || null };
    void b;
    return best;
  }

  resolve(b, hit, origin, dir) {
    const game = this.game, sb = game.sb, shot = b.shot;
    const point = origin.clone().addScaled(dir, hit.t);
    if (hit.person) {
      // everyone on the line from here on (a round can go through several) wakes up first
      const ahead = raycastPeople(sb.people, sb.shape, origin, dir, 60);
      for (const h of ahead) {
        const z = h.person.towerZombie;
        if (z && z.animated) game.horde.wake(z, { cause: 'shot' });
      }
      shot.velocityAtHit = b.vel.length();
      const paths = sb.fire(shot.weaponKey, origin, dir, { spreadScale: 0, by: 'player', shot: shot.id });
      game.registerShot(shot, paths, point);
      if (shot.ammo === 'ex') game.explode(point, { radius: 3.2, power: 0.75, by: shot, kind: 'round' });
      return;
    }
    if (hit.barrel) {
      game.defences.detonateBarrel(hit.barrel, shot);
      game.emit({ type: 'impact', point, material: 'metal', dist: point.distanceTo(shot.origin) });
      return;
    }
    const kind = hit.body && hit.body.userData ? hit.body.userData.kind : null;
    const material = hit.ground ? 'dirt' : (hit.body && hit.body.shapes[0] && hit.body.shapes[0].material) || 'concrete';
    game.emit({ type: 'impact', point, normal: hit.normal, material, kind, dist: point.distanceTo(shot.origin), shot });
    if (shot.ammo === 'ex') game.explode(point, { radius: 3.2, power: 0.75, by: shot, kind: 'round' });
    game.registerMiss(shot, point);
  }
}
