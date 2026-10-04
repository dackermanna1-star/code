/**
 * M1 Abrams entity: wraps the TankBody driving model (tankPhysics.ts) and the procedural model
 * (tankModel.ts).
 *
 *  - Right-click: climb into the commander's hatch (the AGT1500 spools up). Shift at low speed:
 *    climb out. W/S drive / reverse, A/D steer (pivot turns at a standstill), Space brake,
 *    mouse aims the stabilised turret and gun, left click fires the 120 mm main gun (6 s reload),
 *    hold right click for the coaxial machine gun, C zooms, F5 switches between the gunner's
 *    sight and the chase camera.
 *  - Hull health 400: hits, explosions, hard crashes and lava damage it; at 0 it brews up (ammo
 *    cook-off), throws the turret and remains as a burning wreck for a while.
 *  - Crushes soft blocks (trees, fences, glass, plants…) and anything living in its path.
 *  - Saved with position, attitude, turret / gun and health.
 *
 * Events: `vehicleMount` / `vehicleDismount`, `tankFire {entity, pos, dir, kind}` (kind 'main' or
 * 'coax'), `tankHit {entity, source, amount}`, `tankWallHit {entity, speed, pos}`,
 * `tankCrush {entity, x, y, z, state}`, `tankDestroyed {entity, pos}`.
 */
import * as THREE from 'three';
import { Entity, type DamageSource } from '../entity';
import { registerEntity } from '../manager';
import { AABB, boxCollides } from '../../physics/aabb';
import { T_FULL_CUBE, T_SOLID } from '../../world/blocks/registry';
import { SetFlags } from '../../world/world';
import { TankBody, TANK, wrapPi } from './tankPhysics';
import { TankVisual, type TankVisualState } from './tankModel';
import { surfaceBelow } from './heliPhysics';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Gunner's primary sight (turret frame). */
const SIGHT = new THREE.Vector3(0.77, 1.02, -1.75);

export class TankEntity extends Entity {
  readonly type = 'tank';
  readonly body: TankBody;
  readonly quat: THREE.Quaternion;
  readonly prevQuat = new THREE.Quaternion();
  health = TANK.maxHealth;
  maxHealth = TANK.maxHealth;
  hurtTime = 0;
  pilot: any = null;
  visual: TankVisual | null = null;
  readonly targetable = true;
  readonly isVehicle = true;
  destroyed = false;
  /** Burning-wreck lifetime after a brew-up (ticks). */
  wreckTicks = 0;
  /** World-space aim (stabilised); the camera looks along it. */
  aimYaw = 0;
  aimPitch = 0;
  /** Main gun: reload remaining (s), rounds left (creative: unlimited). */
  reload = 0;
  rounds = 42;
  /** Barrel recoil travel (m) and its rate. */
  recoil = 0;
  private prevRecoil = 0;
  private coaxT = 0;
  private fireWas = false;
  private fireReq = false;
  private coaxHeld = false;
  private prevTurret = 0;
  private prevGun = 0;
  private camDist = 11;
  private shake = 0;
  private visualTime = 0;

  constructor() {
    super();
    this.width = TANK.halfWidth * 2;
    this.height = TANK.roofY + 0.2;
    this.eyeHeight = 2.4;
    this.mass = TANK.mass;
    this.body = new TankBody(this.pos, this.vel);
    this.quat = this.body.quat;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.prevQuat.copy(this.quat);
    if (game?.renderer && !this.visual) {
      try {
        this.visual = new TankVisual();
        this.model = this.visual.root;
      } catch (e) {
        console.warn('tank model failed', e);
      }
    }
  }

  setHeading(yaw: number) {
    this.body.setHeading(yaw);
    this.prevQuat.copy(this.quat);
    this.yaw = this.prevYaw = yaw;
    this.aimYaw = yaw;
  }

  // ------------------------------------------------------------------ seating
  interact(player: any): boolean {
    if (this.destroyed || this.removed || player.vehicle || player.spectator || this.pilot) return false;
    this.mount(player);
    return true;
  }

  mount(player: any) {
    this.pilot = player;
    this.passenger = player;
    player.vehicle = this;
    player.sprinting = player.sneaking = player.flying = false;
    this.aimYaw = wrapPi(this.body.yaw + this.body.turretYaw);
    this.aimPitch = this.body.gun;
    this.body.driven = true;
    this.body.engineOn = true;
    this.placeRiders();
    player.prevPos.copy(player.pos);
    this.game.events.emit('vehicleMount', { entity: this, player });
  }

  dismount(eject = false) {
    const p = this.pilot;
    if (!p) return;
    this.pilot = null;
    this.passenger = null;
    p.vehicle = null;
    this.body.driven = false;
    this.body.input.throttle = this.body.input.steer = 0;
    const yaw = this.body.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let placed = false;
    if (!eject) {
      // beside the hull (left, right), behind, in front; else on the turret roof
      const spots: [number, number][] = [[-2.6, 0], [2.6, 0], [0, 5], [0, -5.2], [-2.6, 2.5], [2.6, 2.5]];
      const box = new AABB();
      for (const [lx, lz] of spots) {
        const x = this.pos.x + lx * cos + lz * sin, z = this.pos.z - lx * sin + lz * cos;
        const top = surfaceBelow(this.world, x, z, this.pos.y + 2, 1.5, 5);
        if (top === -Infinity) continue;
        box.set(x - 0.3, top + 0.01, z - 0.3, x + 0.3, top + 1.8, z + 0.3);
        if (boxCollides(this.world, box)) continue;
        p.setPos(x, top + 0.01, z);
        placed = true;
        break;
      }
    }
    if (!placed) p.setPos(this.pos.x, this.pos.y + TANK.roofY + 0.4, this.pos.z);
    p.vel.set(this.vel.x * 0.5, eject ? 6 : 0, this.vel.z * 0.5);
    p.fallDistance = 0;
    p.yaw = p.prevYaw = this.aimYaw;
    p.pitch = p.prevPitch = 0;
    this.game.events.emit('vehicleDismount', { entity: this, player: p, eject });
  }

  canExit() {
    return Math.abs(this.body.speed) < 2.5 || this.pilot?.creative;
  }

  pilotInput(inp: any, active: boolean) {
    const i = this.body.input;
    const d = (a: string) => active && inp.isDown(a);
    i.throttle = (d('forward') ? 1 : 0) - (d('back') ? 1 : 0);
    i.steer = (d('right') ? 1 : 0) - (d('left') ? 1 : 0);
    i.brake = d('jump');
    const fire = d('attack');
    if (fire && !this.fireWas) this.fireReq = true;
    this.fireWas = fire;
    this.coaxHeld = d('use');
  }

  onMouse(dyaw: number, dpitch: number) {
    const zoom = this.game?.input?.isDown?.('zoom') ? 0.35 : 1;
    this.aimYaw = wrapPi(this.aimYaw + dyaw * (this.game?.cameraCtl?.perspective === 'first' ? 0.55 : 1) * zoom);
    this.aimPitch = Math.max(-0.35, Math.min(0.6, this.aimPitch + dpitch * zoom));
  }

  private placeRiders() {
    const p = this.pilot;
    if (!p) return;
    // commander's hatch on the turret roof (the player's box rides inside the turret)
    _v.set(0.72, 0.3, 0.55).applyAxisAngle(_v2.set(0, 1, 0), this.body.turretYaw).add(TANK.turretPos).applyQuaternion(this.quat).add(this.pos);
    p.prevPos.copy(p.pos);
    p.pos.set(_v.x, _v.y, _v.z);
    p.vel.copy(this.vel);
    p.updateBox();
    p.fallDistance = 0;
    p.onGround = false;
    p.yaw = this.aimYaw;
    p.pitch = this.aimPitch;
  }

  // ------------------------------------------------------------------ physics
  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.prevYaw = this.yaw;
    this.prevTurret = this.body.turretYaw;
    this.prevGun = this.body.gun;
    this.prevRecoil = this.recoil;
    const b = this.body;
    b.driven = !!this.pilot && !this.pilot.dead && !this.destroyed;
    if (this.destroyed) b.engineOn = false;
    b.input.aimYaw = this.aimYaw;
    b.input.aimPitch = this.aimPitch;
    const ev = b.step(this.world, dt);
    this.yaw = b.yaw;
    this.onGround = b.contacts > 3;
    this.inWater = b.waterDepth > 0;
    this.inLava = b.inLava;
    this.updateBox();
    // recoil: fast kick back, slower run-out
    this.recoil = Math.max(0, this.recoil - dt * (this.recoil > 0.3 ? 0.9 : 0.55));
    if (this.reload > 0) this.reload = Math.max(0, this.reload - dt);
    this.shake *= Math.exp(-dt * 5);
    const g = this.game as any;
    for (const c of ev.crushed) {
      const st = this.world.getBlock(c.x, c.y, c.z);
      if (!st) continue;
      this.world.setBlock(c.x, c.y, c.z, 0, SetFlags.ALL);
      g.events?.emit('tankCrush', { entity: this, x: c.x, y: c.y, z: c.z, state: st });
    }
    for (const h of ev.wallHits) {
      if (h.speed > 2) g.events?.emit('tankWallHit', { entity: this, speed: h.speed, pos: new THREE.Vector3(h.x, h.y, h.z) });
      if (h.speed > 7) this.damageHull((h.speed - 7) * 6, 'crash');
      this.shake = Math.max(this.shake, Math.min(1, h.speed / 10));
    }
    if (ev.landing > 9) this.damageHull((ev.landing - 9) * 10, 'crash');
    if (ev.landing > 3) this.shake = Math.max(this.shake, Math.min(1.2, ev.landing / 8));
    if (!this.destroyed) {
      this.crushEntities();
      if (this.fireReq) this.fireMain();
      this.fireReq = false;
      if (this.coaxHeld && b.driven) {
        this.coaxT -= dt;
        if (this.coaxT <= 0) {
          this.coaxT = 0.09;
          this.fireCoax();
        }
      }
    }
    if (!this.removed) this.placeRiders();
  }

  /** Living things inside the hull footprint get crushed (moving) or shoved aside. */
  private crushEntities() {
    const b = this.body;
    const moving = Math.abs(b.speed) > 1.2 || Math.abs(b.yawRate) > 0.15;
    const ents = this.game.entities?.list ?? [];
    const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
    for (const e of ents) {
      if (e === this || e === this.pilot || e.removed || (e as any).dead || (e as any).isVehicle) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 30) continue;
      if (e.pos.y > this.pos.y + TANK.roofY || e.pos.y + e.height < this.pos.y + 0.1) continue;
      // hull frame
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const hw = TANK.halfWidth + e.width / 2, hl = TANK.halfLength + e.width / 2;
      if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      // standing on the deck: ride along
      if (e.pos.y > this.pos.y + TANK.deckY - 0.3) continue;
      if (moving && typeof (e as any).hurt === 'function') {
        (e as any).hurt({ type: 'crush', attacker: this.pilot, direct: this, point: e.pos.clone().setY(e.pos.y + 0.5), dir: new THREE.Vector3(-sin * Math.sign(b.speed || 1), 0, -cos * Math.sign(b.speed || 1)), impulse: 6 } as any, 40);
      }
      // push out sideways
      const push = Math.sign(lx || 1) * (hw - Math.abs(lx) + 0.05);
      e.pos.x += push * cos;
      e.pos.z += -push * sin;
      e.updateBox();
    }
  }

  private fireMain() {
    if (this.reload > 0) return;
    const creative = this.pilot?.creative;
    if (!creative && this.rounds <= 0) {
      this.game.events.emit('chat', { text: 'Out of main gun ammunition.', color: '#f88' });
      return;
    }
    if (!creative) this.rounds--;
    this.reload = TANK.reload;
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    this.body.muzzle(pos, dir, 0);
    this.recoil = 0.42;
    this.body.recoil();
    this.shake = 1.4;
    this.game.events.emit('tankFire', { entity: this, pos, dir, kind: 'main', shooter: this.pilot });
  }

  private fireCoax() {
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    this.body.muzzle(pos, dir, 0);
    // coax sits beside the main gun in the mantlet
    _v.set(0.32, -0.05, 0).applyAxisAngle(_v2.set(0, 1, 0), this.body.turretYaw).applyQuaternion(this.quat);
    pos.addScaledVector(dir, -(TANK.barrelLength - 0.7)).add(_v);
    dir.x += (Math.random() - 0.5) * 0.006;
    dir.y += (Math.random() - 0.5) * 0.006;
    dir.normalize();
    this.shake = Math.max(this.shake, 0.08);
    this.game.events.emit('tankFire', { entity: this, pos, dir, kind: 'coax', shooter: this.pilot });
  }

  // ------------------------------------------------------------------ damage
  override hurt(src: DamageSource, amount: number): boolean {
    if (this.destroyed || this.removed || amount <= 0) return false;
    if (src.attacker && src.attacker === this.pilot && (src as any).direct === this) return false;
    let dmg = amount;
    const byPlayer = src.type === 'player';
    if (byPlayer) dmg = Math.max(1, amount) * ((src.attacker as any)?.creative ? 4 : 0.6);
    if ((src as any).explosion || src.type === 'explosion') dmg *= 1.4;
    this.hurtTime = 10;
    this.game.events.emit('tankHit', { entity: this, source: src, amount: dmg });
    if (byPlayer && !this.pilot && (src.attacker as any)?.creative && this.health - dmg <= 0) {
      this.breakToItem();
      return true;
    }
    this.damageHull(dmg, byPlayer ? 'hit' : 'explosion');
    return true;
  }

  damageHull(amount: number, _cause: string) {
    if (this.destroyed || amount <= 0) return;
    this.health -= amount;
    this.hurtTime = Math.max(this.hurtTime, 6);
    if (this.health <= 0) this.brewUp();
  }

  breakToItem() {
    if (this.destroyed) return;
    this.destroyed = true;
    const c = this.pos.clone().setY(this.pos.y + 1);
    this.remove();
    this.game.events.emit('tankBroken', { entity: this, pos: c });
  }

  /** Ammunition cook-off: crew bails out, turret flies, the wreck burns. */
  brewUp() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.wreckTicks = 20 * 90;
    if (this.pilot) this.dismount(true);
    this.body.engineOn = false;
    const c = this.body.toWorld(_v.set(0, 1.5, 0), new THREE.Vector3());
    this.game.events.emit('tankDestroyed', { entity: this, pos: c });
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
    if (this.hurtTime > 0) this.hurtTime--;
    const g = this.game as any;
    const p = this.pilot;
    if (p) {
      if (p.dead || p.removed) this.dismount(true);
      else if (p === g.player && g.input?.wasPressedTick?.('sneak')) {
        if (this.canExit()) this.dismount();
        else g.events.emit('chat', { text: 'Slow down to climb out.', color: '#ffd27a' });
      }
    }
    if (this.body.inLava) this.damageHull(4, 'fire');
    if (this.body.waterDepth > 2.3 && this.pilot) {
      this.dismount(true);
      g.events.emit('chat', { text: 'The tank flooded and stalled!', color: '#8cf' });
    }
    if (this.destroyed) {
      if (--this.wreckTicks <= 0) this.remove();
    }
    if (this.pos.y < -64) this.remove();
  }

  // ------------------------------------------------------------------ rendering
  renderPosQ(alpha: number, outPos: THREE.Vector3, outQ: THREE.Quaternion) {
    outPos.copy(this.prevPos).lerp(this.pos, alpha);
    outQ.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }

  override updateVisual(alpha: number, dt: number) {
    const v = this.visual;
    if (!v) return;
    const g = this.game as any;
    this.visualTime += dt;
    this.renderPosQ(alpha, _p, _q);
    const local = !!this.pilot && this.pilot === g?.player;
    const cam = g?.cameraCtl?.camera?.position as THREE.Vector3 | undefined;
    const st = visState;
    st.pos = _p;
    st.quat = _q;
    st.turretYaw = this.prevTurret + wrapPi(this.body.turretYaw - this.prevTurret) * alpha;
    st.gun = this.prevGun + (this.body.gun - this.prevGun) * alpha;
    st.recoil = this.prevRecoil + (this.recoil - this.prevRecoil) * alpha;
    st.compression = this.body.compression;
    st.trackL = this.body.trackL;
    st.trackR = this.body.trackR;
    st.light = this.world.getLight(Math.floor(_p.x), Math.floor(_p.y + 2.6), Math.floor(_p.z));
    st.hurt = this.hurtTime > 0 ? Math.min(1, (this.hurtTime - alpha) / 10) : 0;
    st.engine = this.body.spool;
    st.crewed = !!this.pilot;
    st.hideCrew = local && g.cameraCtl?.perspective === 'first';
    st.destroyed = this.destroyed;
    st.camDist = cam ? cam.distanceTo(_p) : 0;
    st.time = this.visualTime;
    v.update(st);
  }

  /** Gunner's sight (first person) or a chase camera orbiting the turret along the aim. */
  updateCamera(ctl: any, alpha: number, dt: number): boolean {
    const p = this.pilot;
    if (!p) return false;
    const cam: THREE.PerspectiveCamera = ctl.camera;
    this.renderPosQ(alpha, _p, _q);
    const sh = this.shake + (Math.abs(this.body.speed) > 0.5 ? 0.04 + Math.abs(this.body.speed) * 0.004 : 0.015) * (this.body.spool > 0.05 ? 1 : 0);
    const t = this.visualTime;
    const jx = Math.sin(t * 61) * sh * 0.012, jy = Math.sin(t * 47 + 1) * sh * 0.012;
    const zoom = this.game.input?.isDown?.('zoom');
    if (ctl.perspective === 'first') {
      const ty = this.prevTurret + wrapPi(this.body.turretYaw - this.prevTurret) * alpha;
      _v.copy(SIGHT).applyAxisAngle(_v2.set(0, 1, 0), ty).add(TANK.turretPos).applyQuaternion(_q).add(_p);
      cam.position.copy(_v);
      _e.set(this.aimPitch + jy, this.aimYaw + jx, 0, 'YXZ');
      cam.quaternion.setFromEuler(_e);
      ctl.eyeWorld.copy(_v);
      ctl.vehicleFov = zoom ? 0.18 : 0.55;
    } else {
      const ty = this.prevTurret + wrapPi(this.body.turretYaw - this.prevTurret) * alpha;
      const target = _v.copy(TANK.turretPos).applyQuaternion(_q).add(_p);
      target.y += 1.6;
      void ty;
      const front = ctl.perspective === 'third_front';
      const yaw = this.aimYaw + (front ? Math.PI : 0);
      const pitch = Math.max(-0.5, Math.min(0.7, -this.aimPitch + 0.2));
      const dir = _v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const want = zoom ? 6 : 11.5;
      const free = this.clearDistance(target, dir, want);
      this.camDist = free < this.camDist ? free : this.camDist + (free - this.camDist) * (1 - Math.exp(-dt * 2.5));
      cam.position.copy(target).addScaledVector(dir, this.camDist);
      cam.position.x += jx * 3;
      cam.position.y += jy * 3;
      // look along the aim (screen centre = aim direction)
      _e.set(this.aimPitch - 0.08, this.aimYaw + (front ? Math.PI : 0), 0, 'YXZ');
      _q2.setFromEuler(_e);
      cam.quaternion.copy(_q2);
      ctl.eyeWorld.copy(cam.position);
      ctl.vehicleFov = zoom ? 0.5 : 1;
    }
    return true;
  }

  private clearDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    const w = this.world;
    for (let d = 0.5; d <= max; d += 0.25) {
      const st = w.getBlock(Math.floor(from.x + dir.x * d), Math.floor(from.y + dir.y * d), Math.floor(from.z + dir.z * d));
      if (st && T_SOLID[st >>> 4] && T_FULL_CUBE[st >>> 4]) return Math.max(1.5, d - 0.45);
    }
    return max;
  }

  /** Where the gun currently points (for the HUD's gun cross). */
  gunLine(outPos: THREE.Vector3, outDir: THREE.Vector3) {
    return this.body.muzzle(outPos, outDir, 0);
  }

  // ------------------------------------------------------------------ persistence
  override serialize() {
    const b = this.body;
    return { ...super.serialize(), hy: b.yaw, hp: this.health, tr: b.turretYaw, gn: b.gun, rd: this.rounds, wr: this.destroyed ? this.wreckTicks : 0 };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    const b = this.body;
    b.setHeading(o.hy ?? o.yaw ?? 0);
    b.turretYaw = o.tr ?? 0;
    b.gun = o.gn ?? 0;
    this.prevQuat.copy(this.quat);
    this.aimYaw = b.yaw + b.turretYaw;
    this.health = Math.max(1, Math.min(this.maxHealth, o.hp ?? this.maxHealth));
    this.rounds = o.rd ?? 42;
    if (o.wr > 0) {
      this.destroyed = true;
      this.health = 0;
      this.wreckTicks = o.wr;
    }
  }
}

const visState: TankVisualState = {
  pos: new THREE.Vector3(), quat: new THREE.Quaternion(), turretYaw: 0, gun: 0, recoil: 0, compression: [], trackL: 0, trackR: 0,
  light: 0, hurt: 0, engine: 0, crewed: false, hideCrew: false, destroyed: false, camDist: 0, time: 0,
};

registerEntity('tank', TankEntity, 'misc');
