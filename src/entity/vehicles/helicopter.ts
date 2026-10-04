/**
 * Helicopter entity: wraps the HeliBody flight model (heliPhysics.ts) and the procedural model
 * (heliModel.ts).
 *
 *  - Right-click: sit in the pilot seat (the engine starts and spools up). Shift while landed:
 *    climb out next to it. While seated the player is carried at the seat, the hand is hidden,
 *    and `updateCamera` drives the camera (cockpit view or a terrain-aware chase/orbit cam).
 *  - Hull health (40). Punching it repeatedly breaks it back into the item; crash impacts, rotor
 *    strikes, explosions and lava damage it, very hard crashes (or 0 health from them) make it
 *    explode. Water: it floods (engine flame-out), ejects the pilot and sinks.
 *  - Effects at 20 TPS: rotor downwash (dust / leaves / spray by surface), exhaust smoke,
 *    damage smoke and fire, rotor-strike sparks; leaves in the rotor disc are chopped.
 *  - Saved with position, attitude, velocity and health.
 *
 * Events: `vehicleMount` / `vehicleDismount {entity, player}`, `helicopterHit {entity, source,
 * amount}`, `helicopterImpact {entity, speed, kind, pos}`, `helicopterRotorStrike {entity, pos,
 * soft}`, `helicopterSplash {entity, speed}`, `helicopterBroken / helicopterDestroyed {entity,
 * pos, cause}`.
 */
import * as THREE from 'three';
import { Entity, type DamageSource } from '../entity';
import { registerEntity } from '../manager';
import { AABB, boxCollides } from '../../physics/aabb';
import { BLOCKS, T_FULL_CUBE, T_SOLID } from '../../world/blocks/registry';
import { HeliBody, HELI, HELI_WEIGHT, impactDamage, probePenetration, surfaceBelow, wrapPi } from './heliPhysics';
import { HeliVisual, PILOT_EYE, type HeliVisualState } from './heliModel';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const rnd = Math.random;

const DUSTY = /sand|gravel|dirt|mud|clay|snow|soul|path|farmland|podzol|mycelium|powder|terracotta/;
const LEAFY = /grass_block|moss|leaves|hay|fern/;

export class HelicopterEntity extends Entity {
  readonly type = 'helicopter';
  readonly body: HeliBody;
  readonly quat: THREE.Quaternion;
  readonly prevQuat = new THREE.Quaternion();
  health = 40;
  maxHealth = 40;
  /** Hit wobble (ticks). */
  hurtTime = 0;
  pilot: any = null;
  visual: HeliVisual | null = null;
  /** Interaction raycasts target this entity (it is not a LivingEntity). */
  readonly targetable = true;
  readonly isVehicle = true;
  destroyed = false;
  asleep = false;
  /** Ticks to show the "land to exit" hint. */
  exitHint = 0;
  /** Camera orbit / free-look yaw offset and smoothed chase yaw. */
  orbit = 0;
  private camYaw = 0;
  private camInit = false;
  private camDist = 13;
  private lastVel = new THREE.Vector3();
  private sleepTicks = 0;
  private strikeCooldown = 0;
  private recentImpact = 0;
  private visualTime = Math.random() * 10;

  constructor() {
    super();
    this.width = HELI.boxHalf * 2;
    this.height = HELI.boxMaxY;
    this.eyeHeight = 1.7;
    this.mass = HELI.mass;
    this.body = new HeliBody(this.pos, this.vel, this.box);
    this.quat = this.body.quat;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.prevQuat.copy(this.quat);
    this.lastVel.copy(this.vel);
    if (game?.renderer && !this.visual) {
      try {
        this.visual = new HeliVisual(game.renderer);
        this.model = this.visual.root;
        game.entities?.forwardScene?.add(this.visual.forward);
      } catch (e) {
        console.warn('helicopter model failed', e);
      }
    }
  }

  override updateBox() {
    if (!this.body) { super.updateBox(); return; }
    this.body.c.set(this.pos.x, this.pos.y + HELI.com.y, this.pos.z);
    this.body.updateBox();
  }

  setHeading(yaw: number) {
    this.body.setHeading(yaw);
    this.prevQuat.copy(this.quat);
    this.yaw = this.prevYaw = yaw;
  }

  get rpm() { return this.body.rpm; }
  get onGroundGear() { return this.body.contacts >= 2; }

  // ------------------------------------------------------------------ seating
  interact(player: any): boolean {
    if (this.destroyed || this.removed || player.vehicle || player.spectator) return false;
    if (this.pilot) return false;
    if (this.body.waterDepth > 0.45) {
      this.game.events.emit('chat', { text: 'The helicopter is flooded.', color: '#f88' });
      return true;
    }
    this.mount(player);
    return true;
  }

  mount(player: any) {
    this.pilot = player;
    this.passenger = player;
    player.vehicle = this;
    player.sprinting = false;
    player.sneaking = false;
    player.flying = false;
    player.pitch = -0.08;
    this.orbit = 0;
    this.camInit = false;
    this.body.piloted = true;
    this.body.engineOn = true;
    this.body.headingTarget = this.body.heading();
    this.asleep = false;
    this.sleepTicks = 0;
    this.placeRiders();
    player.prevPos.copy(player.pos);
    this.game.events.emit('vehicleMount', { entity: this, player });
  }

  /** Leave the pilot seat. `eject`: thrown out where it is (crash, water, death). */
  dismount(eject = false) {
    const p = this.pilot;
    if (!p) return;
    this.pilot = null;
    this.passenger = null;
    p.vehicle = null;
    this.body.piloted = false;
    this.body.engineOn = false;
    this.orbit = 0;
    const yaw = this.body.heading();
    let placed = false;
    if (!eject) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      // pilot door (right), left side, front, behind the cabin
      const spots: [number, number][] = [[1.75, -0.35], [-1.75, -0.35], [0, -3.1], [1.6, 1.4], [-1.6, 1.4]];
      const box = new AABB();
      for (const [lx, lz] of spots) {
        const x = this.pos.x + lx * cos + lz * sin, z = this.pos.z - lx * sin + lz * cos;
        const top = surfaceBelow(this.world, x, z, this.pos.y + 1.2, 1.4, 4);
        if (top === -Infinity) continue;
        box.set(x - 0.3, top + 0.01, z - 0.3, x + 0.3, top + 1.8, z + 0.3);
        if (boxCollides(this.world, box)) continue;
        p.setPos(x, top + 0.01, z);
        placed = true;
        break;
      }
      if (!placed) p.setPos(this.pos.x, this.pos.y + HELI.boxMaxY + 0.1, this.pos.z);
      p.vel.set(this.vel.x * 0.5, 0, this.vel.z * 0.5);
    } else {
      this.body.toWorld(PILOT_EYE, _v);
      p.setPos(_v.x + Math.cos(yaw) * 0.6, _v.y - p.eyeHeight, _v.z - Math.sin(yaw) * 0.6);
      p.vel.copy(this.vel);
    }
    p.fallDistance = 0;
    p.yaw = p.prevYaw = yaw;
    p.pitch = p.prevPitch = 0;
    this.game.events.emit('vehicleDismount', { entity: this, player: p, eject });
  }

  canExit(): boolean {
    const b = this.body;
    return (b.contacts >= 2 && this.vel.length() < 4) || b.waterDepth > 0.15 || (this.pilot?.creative && this.vel.length() < 1.5);
  }

  /** Per physics step from Game.applyPlayerIntent: keyboard → controls. */
  pilotInput(inp: any, active: boolean) {
    const i = this.body.input;
    const d = (a: string) => active && inp.isDown(a);
    i.up = d('jump');
    i.down = d('sneak');
    i.fwd = (d('forward') ? 1 : 0) - (d('back') ? 1 : 0);
    i.right = (d('right') ? 1 : 0) - (d('left') ? 1 : 0);
    i.pedal = (d('yawLeft') ? 1 : 0) - (d('yawRight') ? 1 : 0);
  }

  /**
   * Mouse look from Game.handleFrameInput (radians, same sign as the player's yaw/pitch). Mouse X
   * works the pedals in flight; on the ground with the lever down it orbits the camera instead.
   */
  onMouse(dyaw: number, dpitch: number) {
    const p = this.pilot;
    if (!p) return;
    p.pitch = Math.max(-1.35, Math.min(1.2, p.pitch + dpitch));
    const b = this.body;
    const parked = b.contacts >= 2 && !b.input.up && b.collective < 0.3;
    if (parked) this.orbit = wrapPi(this.orbit + dyaw);
    else b.input.mouseYaw += dyaw;
  }

  private placeRiders() {
    const p = this.pilot;
    if (!p) return;
    this.body.toWorld(PILOT_EYE, _v);
    p.prevPos.copy(p.pos);
    p.pos.set(_v.x, _v.y - p.eyeHeight, _v.z);
    p.vel.copy(this.vel);
    p.updateBox();
    p.fallDistance = 0;
    p.onGround = false;
    p.yaw = this.yaw + (this.game?.cameraCtl?.perspective === 'first' ? this.orbit : 0);
  }

  // ------------------------------------------------------------------ physics
  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.prevYaw = this.yaw;
    if (this.destroyed) return;
    // external impulses (explosions, knockback) act on our real mass
    if (!this.vel.equals(this.lastVel)) {
      _v.subVectors(this.vel, this.lastVel);
      this.vel.copy(this.lastVel).addScaledVector(_v, Math.min(1, (70 / HELI.mass) * 4));
      this.asleep = false;
    }
    const b = this.body;
    b.piloted = !!this.pilot && !this.pilot.dead;
    if (b.waterDepth > 0.3) b.engineOn = false;
    if (this.asleep) {
      this.lastVel.copy(this.vel);
      this.placeRiders();
      return;
    }
    const ev = b.step(this.world, dt);
    this.lastVel.copy(this.vel);
    this.yaw = b.heading();
    this.onGround = b.contacts >= 2;
    this.inWater = b.waterDepth > 0;
    this.inLava = b.inLava;
    this.recentImpact = Math.max(0, this.recentImpact - dt * 30);
    if (ev.impacts.length) this.handleImpacts();
    if (ev.splash > 0) this.game.events.emit('helicopterSplash', { entity: this, speed: ev.splash });
    if (!this.removed) this.placeRiders();
  }

  private handleImpacts() {
    let worst = 0, dmg = 0;
    let catastrophic = false;
    for (const im of this.body.events.impacts) {
      const gear = im.kind === 'skid';
      const d = impactDamage(im.speed, gear) * (im.kind === 'probe' ? 0.8 : 1);
      dmg = Math.max(dmg, d);
      if (im.speed > worst) worst = im.speed;
      if ((gear && im.speed >= 17) || (!gear && im.speed >= 14.5)) catastrophic = true;
      if (im.speed > 2.5) this.game.events.emit('helicopterImpact', { entity: this, speed: im.speed, kind: im.kind, pos: new THREE.Vector3(im.x, im.y, im.z) });
    }
    if (catastrophic) {
      this.destroy('crash');
      return;
    }
    const apply = dmg - this.recentImpact;
    this.recentImpact = Math.max(this.recentImpact, dmg);
    if (apply > 0.01) {
      const p = this.pilot;
      if (p && apply >= 5) p.hurt?.({ type: 'fall', bypassArmor: true }, Math.round(apply * 0.25));
      this.damageHull(apply, 'crash');
    }
    void worst;
  }

  // ------------------------------------------------------------------ damage
  override hurt(src: DamageSource, amount: number): boolean {
    if (this.destroyed || this.removed || amount <= 0) return false;
    if (src.attacker && src.attacker === this.pilot) return false;
    let dmg = amount;
    const byPlayer = src.type === 'player';
    if (byPlayer) dmg = Math.max(1, amount) * 5.5 * ((src.attacker as any)?.creative ? 3 : 1);
    this.asleep = false;
    this.hurtTime = 10;
    if (src.dir) {
      // rock it a little (like a boat)
      this.body.angVel.z += (rnd() - 0.5) * 0.4;
      this.body.angVel.x += (rnd() - 0.5) * 0.25;
    }
    this.game.events.emit('helicopterHit', { entity: this, source: src, amount: dmg });
    if (byPlayer && !this.pilot && this.health - dmg <= 0) {
      this.breakToItem();
      return true;
    }
    this.damageHull(dmg, src.explosion ? 'explosion' : byPlayer ? 'hit' : src.fire ? 'fire' : 'crash');
    return true;
  }

  damageHull(amount: number, cause: 'crash' | 'explosion' | 'fire' | 'hit') {
    if (this.destroyed || amount <= 0) return;
    this.health -= amount;
    this.hurtTime = Math.max(this.hurtTime, 6);
    this.asleep = false;
    if (this.health <= 0) {
      this.health = 0;
      if (cause === 'hit' && !this.pilot) this.breakToItem();
      else this.destroy(cause);
    }
  }

  breakToItem() {
    if (this.destroyed) return;
    this.destroyed = true;
    const g = this.game as any;
    const c = this.body.c.clone();
    this.remove();
    // the vehicle system drops the item
    g.events.emit('helicopterBroken', { entity: this, pos: c, cause: 'hit' });
  }

  destroy(cause: string) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    const g = this.game as any;
    const c = this.body.c.clone();
    if (this.pilot) this.dismount(true);
    this.remove();
    g.events.emit('helicopterDestroyed', { entity: this, pos: c, cause });
    const ex = g.explosions;
    if (ex?.explode) {
      try {
        ex.explode(c, 3.2, { source: this, fire: true, breakBlocks: g.gamerules?.mobGriefing !== false });
      } catch (e) {
        console.warn('helicopter explosion failed', e);
      }
    } else g.events.emit('explosion', { pos: c, power: 3.2 });
  }

  override remove() {
    if (this.pilot) this.dismount(this.destroyed);
    super.remove();
    if (this.visual) {
      this.visual.root.visible = false;
      this.visual.dispose();
      this.visual = null;
    }
  }

  // ------------------------------------------------------------------ 20 TPS
  override tick() {
    super.tick();
    if (this.destroyed) return;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.exitHint > 0) this.exitHint--;
    const g = this.game as any;
    const b = this.body;
    const p = this.pilot;
    if (p) {
      if (p.dead || p.removed) this.dismount(true);
      else if (p === g.player && g.input?.wasPressedTick?.('sneak')) {
        if (this.canExit()) this.dismount();
        else if (b.agl - HELI.hub.y < 4) this.exitHint = 50; // (higher up, Shift just descends)
      }
    }
    // flooded: engine flame-out, the crew climbs out
    if (b.waterDepth > 0.5 && this.pilot) {
      this.dismount(true);
      g.events.emit('chat', { text: 'Ditched! The helicopter is sinking.', color: '#8cf' });
    }
    if (b.inLava) this.damageHull(2, 'fire');
    if (this.pos.y < -64) {
      if (this.pilot) this.dismount(true);
      this.remove();
    }
    if (this.removed) return;
    // dynamic rollover: the spinning rotor digs into the ground
    _v.set(0, 1, 0).applyQuaternion(this.quat);
    if (b.contacts >= 1 && _v.y < 0.5 && b.rpm > 0.35) {
      this.destroy('rollover');
      return;
    }
    this.checkRotorStrikes();
    if (this.removed) return;
    this.effects();
    this.updateSleep();
  }

  private checkRotorStrikes() {
    const b = this.body;
    if (b.rpm < 0.12) return;
    if (this.strikeCooldown > 0) { this.strikeCooldown--; return; }
    const g = this.game as any;
    const w = this.world;
    let chopped = 0;
    const test = (lx: number, ly: number, lz: number): boolean => {
      _v2.set(lx, ly, lz);
      b.toWorld(_v2, _v);
      const st = w.getBlock(Math.floor(_v.x), Math.floor(_v.y), Math.floor(_v.z));
      if (!st || !T_SOLID[st >>> 4]) return false;
      if (!T_FULL_CUBE[st >>> 4] && probePenetration(w, _v, _v2) <= 0) return false;
      const def = BLOCKS[st >>> 4];
      const soft = def.tags.includes('leaves') || (def.hardness >= 0 && def.hardness <= 0.25);
      const pos = _v.clone();
      if (soft) {
        if (chopped < 3 && g.gamerules?.mobGriefing !== false && g.breakBlock) {
          g.breakBlock(Math.floor(_v.x), Math.floor(_v.y), Math.floor(_v.z), false);
          chopped++;
        }
        b.rpm = Math.max(0, b.rpm - 0.012);
        g.events.emit('helicopterRotorStrike', { entity: this, pos, soft: true, state: st });
        return false;
      }
      const dmg = 5 + 18 * b.rpm * b.rpm;
      b.rpm *= 0.45;
      b.angVel.x += (rnd() - 0.5) * 1.2;
      b.angVel.y += (rnd() - 0.5) * 1.6;
      this.strikeCooldown = 8;
      g.events.emit('helicopterRotorStrike', { entity: this, pos, soft: false, state: st });
      this.damageHull(dmg, 'crash');
      return true;
    };
    const R = HELI.rotorRadius, H = HELI.hub;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 ? R * 0.97 : R * 0.68;
      if (test(H.x + Math.cos(a) * r, H.y + 0.04 * r * b.rpm, H.z + Math.sin(a) * r) || this.removed) return;
    }
    const T = HELI.tailHub, tr = HELI.tailRadius * 0.95;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      if (test(T.x, T.y + Math.cos(a) * tr, T.z + Math.sin(a) * tr) || this.removed) return;
    }
  }

  /** Downwash, exhaust and damage smoke (20 TPS). */
  private effects() {
    const g = this.game as any;
    const P = g.particles;
    if (!P || !g.player) return;
    const b = this.body;
    if (g.player.pos.distanceToSquared(this.pos) > 110 * 110) return;
    const R = HELI.rotorRadius;
    // ---- rotor downwash
    if (b.rpm > 0.3 && b.agl < 2.4 * R && b.groundY > -Infinity) {
      const load = b.thrust / HELI_WEIGHT;
      const k = Math.min(1.6, Math.max(0.15, load) * b.rpm) * (1 - b.agl / (2.4 * R));
      if (k > 0.05) {
        b.toWorld(HELI.hub, _c);
        const gy = b.groundY;
        const n = Math.floor(k * 6 + rnd());
        const st = b.groundState;
        const name = st ? BLOCKS[st >>> 4].name : '';
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, rad = 0.8 + rnd() * R * 0.95;
          const x = _c.x + Math.cos(a) * rad, z = _c.z + Math.sin(a) * rad;
          const sp = (4 + rnd() * 8) * k;
          const vx = Math.cos(a) * sp + this.vel.x * 0.3, vz = Math.sin(a) * sp + this.vel.z * 0.3;
          if (b.overWater) {
            P.emit('splash', [x, gy + 0.05, z], { vel: [vx * 0.5, 2 + rnd() * 3 * k, vz * 0.5], count: 1, exact: true });
            if (rnd() < 0.6) P.emit('steam', [x, gy + 0.25, z], { vel: [vx, 0.4 + rnd(), vz], color: [0.8, 0.84, 0.88], size: 1 + k, life: 0.7, count: 1, exact: true });
          } else if (st) {
            const dusty = DUSTY.test(name);
            if (dusty || rnd() < 0.55) P.emit('dust', [x, gy + 0.12, z], { state: st, vel: [vx, 0.3 + rnd() * 1.2 * k, vz], size: (dusty ? 1.3 : 0.9) + k * 0.7, count: 1, exact: true });
            if (LEAFY.test(name) && rnd() < 0.5) P.crumb?.(this.leafState(st), x, gy + 0.15, z, vx * 0.6, 1.5 + rnd() * 3, vz * 0.6, 0.75);
          }
        }
        if (b.overWater && this.age % 5 === 0) P.emit('ripple', [_c.x, gy + 0.02, _c.z], { size: 3 + 6 * k, count: 1, exact: true });
      }
    }
    // ---- exhaust: dark puffs at light-off, then a faint heat haze
    if (b.n1 > 0.08) {
      const lightoff = b.engineOn && b.n1 > 0.18 && b.n1 < 0.62;
      for (const side of [-1, 1]) {
        if (!lightoff && rnd() > 0.5) continue;
        _v2.set(side * 0.25, 2.47, 1.93);
        b.toWorld(_v2, _v);
        _v2.set(side * 0.25, 0.6, 0.75).normalize().applyQuaternion(this.quat).multiplyScalar(lightoff ? 2.5 : 3.5);
        P.emit('smoke', [_v.x, _v.y, _v.z], {
          vel: [_v2.x + this.vel.x, _v2.y + this.vel.y, _v2.z + this.vel.z], count: 1, exact: true,
          color: lightoff ? [0.1, 0.1, 0.105] : [0.5, 0.5, 0.52], size: lightoff ? 0.9 : 0.45, life: lightoff ? 1 : 0.35,
        });
      }
    }
    // ---- damage smoke / fire from the engine bay
    const hp = this.health / this.maxHealth;
    if (hp < 0.5 && rnd() < (0.5 - hp) * 2.6) {
      _v2.set(0, 2.3, 1.0);
      b.toWorld(_v2, _v);
      P.emit('large_smoke', [_v.x, _v.y, _v.z], { vel: [this.vel.x * 0.4, 1.5, this.vel.z * 0.4], count: 1, exact: true });
      if (hp < 0.2 && rnd() < 0.6) P.emit('flame', [_v.x, _v.y, _v.z], { spread: 0.25, vel: [0, 0.6, 0], count: 2, exact: true });
    }
  }

  private leafCache = new Map<number, number>();
  private leafState(ground: number): number {
    let s = this.leafCache.get(ground);
    if (s === undefined) {
      const name = BLOCKS[ground >>> 4].name;
      const leaf = name.includes('leaves') ? name : 'oak_leaves';
      const def = BLOCKS.find((d) => d.name === leaf);
      s = def ? def.id << 4 : ground;
      this.leafCache.set(ground, s);
    }
    return s;
  }

  private updateSleep() {
    const b = this.body;
    if (this.pilot || b.rpm > 0.005 || b.n1 > 0.005 || b.contacts < 3 || this.vel.lengthSq() > 0.004 || b.angVel.lengthSq() > 0.0005 || b.waterDepth > 0 || this.hurtTime > 0) {
      this.sleepTicks = 0;
      this.asleep = false;
      return;
    }
    if (++this.sleepTicks > 40) this.asleep = true;
    // re-check support now and then (blocks broken under the skids)
    if (this.asleep && this.age % 20 === 0) {
      for (const s of HELI.skids) {
        b.toWorld(s, _v);
        if (surfaceBelow(this.world, _v.x, _v.z, _v.y + 0.02, 0.3, 1) === -Infinity) { this.asleep = false; this.sleepTicks = 0; break; }
      }
    }
  }

  // ------------------------------------------------------------------ rendering
  renderCom(alpha: number, out: THREE.Vector3) {
    return out.copy(this.prevPos).lerp(this.pos, alpha).setY(out.y + HELI.com.y);
  }
  renderQuat(alpha: number, out: THREE.Quaternion) {
    return out.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }

  override updateVisual(alpha: number, dt: number) {
    const v = this.visual;
    if (!v) return;
    const g = this.game as any;
    this.visualTime += dt;
    const com = this.renderCom(alpha, _c);
    const q = this.renderQuat(alpha, _q);
    const cam = g?.cameraCtl?.camera?.position as THREE.Vector3 | undefined;
    const local = !!this.pilot && this.pilot === g?.player;
    const fp = local && g.cameraCtl?.perspective === 'first';
    const b = this.body;
    const st = visState;
    st.com = com;
    st.quat = q;
    st.dt = dt;
    st.time = this.visualTime;
    st.rpm = b.rpm;
    st.n1 = b.n1;
    st.collective = b.collective;
    st.stickX = b.stickX;
    st.stickY = b.stickY;
    st.discX = b.discX;
    st.discZ = b.discZ;
    st.pedal = b.pedalPos;
    st.load = b.thrust / HELI_WEIGHT;
    st.compression = b.compression;
    st.vel = this.vel;
    st.powered = b.n1 > 0.05 || (!!this.pilot && b.engineOn);
    st.piloted = !!this.pilot;
    st.showPilot = !!this.pilot && !fp;
    st.light = this.world.getLight(Math.floor(com.x), Math.floor(com.y + 0.4), Math.floor(com.z));
    st.hurt = this.hurtTime > 0 ? Math.min(1, (this.hurtTime - alpha) / 10) : 0;
    st.altitude = com.y;
    st.airspeed = this.vel.length();
    st.vspeed = this.vel.y;
    st.heading = b.heading(q);
    st.roll = -b.rollAngle(q);
    st.camDist = cam ? cam.distanceTo(com) : 0;
    v.update(st);
  }

  /**
   * Vehicle camera (CameraController delegates here while the player is seated). First person:
   * the pilot's eye, attached to the airframe (it banks with it) with mouse look. Third person:
   * a smoothed chase / orbit camera behind (or in front of) the helicopter that is pulled in
   * front of terrain.
   */
  updateCamera(ctl: any, alpha: number, dt: number): boolean {
    const p = this.pilot;
    if (!p) return false;
    const cam: THREE.PerspectiveCamera = ctl.camera;
    const com = this.renderCom(alpha, _c);
    const q = this.renderQuat(alpha, _q);
    const b = this.body;
    // airframe vibration (rotor 4/rev buzz, stronger at low rotor speed / in transition)
    const vib = (b.rpm > 0.05 ? 0.0025 + 0.004 * (1 - b.rpm) + 0.003 * Math.max(0, 1 - Math.abs(Math.hypot(this.vel.x, this.vel.z) - 7) / 3) : 0) + p.cameraShake.length() * 0.05;
    const t = this.visualTime;
    if (ctl.perspective === 'first') {
      // free look turns back to the front once flying
      if (!(b.contacts >= 2 && b.collective < 0.3)) this.orbit *= Math.exp(-dt * 1.5);
      _v.copy(PILOT_EYE).sub(HELI.com).applyQuaternion(q).add(com);
      _v.y += Math.sin(t * 113) * vib;
      _v.x += Math.sin(t * 97) * vib * 0.6;
      cam.position.copy(_v);
      _e.set(p.pitch, this.orbit, 0, 'YXZ');
      _q2.setFromEuler(_e);
      cam.quaternion.copy(q).multiply(_q2);
      ctl.eyeWorld.copy(_v);
    } else {
      if (!(b.contacts >= 2 && b.collective < 0.3)) this.orbit *= Math.exp(-dt * 0.8);
      _v.set(0, 0, -1).applyQuaternion(q);
      const heading = Math.atan2(-_v.x, -_v.z);
      const want = heading + this.orbit;
      if (!this.camInit) { this.camYaw = want; this.camInit = true; }
      this.camYaw += wrapPi(want - this.camYaw) * (1 - Math.exp(-dt * 3.5));
      const front = ctl.perspective === 'third_front';
      const yaw = this.camYaw + (front ? Math.PI : 0);
      const elev = Math.max(-0.3, Math.min(1.25, 0.26 - p.pitch));
      const dir = _v2.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
      const target = _v.copy(com);
      target.y += 1.1;
      const want2 = 13.5;
      const free = this.clearDistance(target, dir, want2);
      // pull in quickly, ease back out
      this.camDist = free < this.camDist ? free : this.camDist + (free - this.camDist) * (1 - Math.exp(-dt * 2));
      cam.position.copy(target).addScaledVector(dir, this.camDist);
      cam.position.y += Math.sin(t * 113) * vib * 0.5;
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      ctl.eyeWorld.copy(cam.position);
    }
    const spd = this.vel.length();
    ctl.vehicleFov = 1 + Math.min(0.1, spd / 400);
    return true;
  }

  /** Distance along `dir` from `from` that stays out of solid blocks (camera collision). */
  private clearDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    const w = this.world;
    const step = 0.25;
    for (let d = 0.5; d <= max; d += step) {
      const x = from.x + dir.x * d, y = from.y + dir.y * d, z = from.z + dir.z * d;
      const st = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (st && T_SOLID[st >>> 4] && T_FULL_CUBE[st >>> 4]) return Math.max(1.2, d - 0.45);
    }
    return max;
  }

  // ------------------------------------------------------------------ persistence
  override serialize() {
    return { ...super.serialize(), q: this.quat.toArray(), hp: this.health, w: this.body.angVel.toArray() };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    if (Array.isArray(o.q)) this.quat.fromArray(o.q).normalize();
    else this.quat.setFromAxisAngle(_v.set(0, 1, 0), o.yaw ?? 0);
    this.prevQuat.copy(this.quat);
    if (Array.isArray(o.w)) this.body.angVel.fromArray(o.w);
    this.health = Math.max(1, Math.min(this.maxHealth, o.hp ?? this.maxHealth));
    this.body.headingTarget = this.body.heading();
    this.yaw = this.prevYaw = this.body.heading();
    this.lastVel.copy(this.vel);
  }
}

const visState: HeliVisualState = {
  com: new THREE.Vector3(), quat: new THREE.Quaternion(), dt: 0, time: 0, rpm: 0, n1: 0, collective: 0, stickX: 0, stickY: 0, discX: 0, discZ: 0, pedal: 0,
  load: 0, compression: [0, 0, 0, 0], vel: new THREE.Vector3(), powered: false, piloted: false, showPilot: false, light: 0, hurt: 0,
  altitude: 0, airspeed: 0, vspeed: 0, heading: 0, roll: 0, camDist: 0,
};

registerEntity('helicopter', HelicopterEntity, 'misc');
