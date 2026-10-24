import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import type { Prop, PropSystem } from '../world/Props';
import { WEAPONS, type WeaponDef } from './WeaponDefs';
import type { PlayerWeapon, Player } from '../player/Player';
import type { Character, HeldItem } from '../characters/Character';
import { P } from '../characters/Rig';
import { rand } from '../core/math';
import { PROPS } from '../world/PropDefs';

const D2R = Math.PI / 180;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** First-person base orientation: weapon length axis (+Y) tilted forward out of the fist. */
const FP_BASE = new THREE.Euler(-78 * D2R, 0, 14 * D2R);
/** Third-person: weapon +Y along the hand's forward (+Z of the forearm bone). */
const TP_BASE = new THREE.Euler(90 * D2R, 0, 0);

function gripObject(sys: PropSystem, prop: Prop, base: THREE.Euler): THREE.Object3D {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  const mesh = sys.makeMesh(prop);
  mesh.castShadow = false;
  const grip = prop.def.grip ?? [0, 0, 0];
  mesh.position.set(-grip[0], -grip[1], -grip[2]);
  const gr = prop.def.gripRot ?? [0, 0, 0];
  inner.rotation.set(gr[0] * D2R, gr[1] * D2R, gr[2] * D2R);
  inner.add(mesh);
  g.rotation.copy(base);
  g.add(inner);
  return g;
}

/** Adapter exposing a held prop as the player's weapon. */
class HeldPlayerWeapon implements PlayerWeapon {
  readonly def: WeaponDef;
  durability: number;
  constructor(
    public prop: Prop,
    public fpObject: THREE.Object3D,
    private sys: WeaponSystem,
    public carryOnly = false,
  ) {
    this.def = prop.weapon ?? WEAPONS.plank;
    this.durability = prop.durability;
  }
  get id() {
    return this.def.id;
  }
  get name() {
    return this.carryOnly ? this.prop.def.name : this.def.name;
  }
  get damage() {
    return this.def.damage;
  }
  get force() {
    return this.def.force;
  }
  get reach() {
    return this.def.reach;
  }
  get speed() {
    return this.def.speed;
  }
  get type() {
    return this.def.type;
  }
  get twoHanded() {
    return this.def.twoHanded;
  }
  get heavy() {
    return this.def.heavy;
  }
  get moves() {
    return this.def.moves;
  }
  get arc() {
    return this.def.arc;
  }
  get arcPitch() {
    return this.def.arcPitch;
  }
  get dismember() {
    return this.def.dismember;
  }
  get bleed() {
    return this.def.bleed;
  }
  get carve() {
    return this.def.carve;
  }
  get stun() {
    return this.def.stun;
  }
  get cleave() {
    return this.def.cleave;
  }
  get maxDurability() {
    return this.def.durability;
  }
  onHit(point: THREE.Vector3, dir: THREE.Vector3, hard: boolean): boolean {
    events.emit('impact', { pos: point.clone(), normal: dir.clone().negate(), material: this.prop.def.material, strength: hard ? 1 : 0.6, otherMaterial: 'flesh' });
    this.durability -= hard ? 1 : 0.5;
    this.prop.durability = this.durability;
    if (this.durability <= 0) {
      this.sys.breakPlayerWeapon(this, point, dir);
      return true;
    }
    return false;
  }
}

/** Glue between props and the hands of the player / NPCs. */
export class WeaponSystem {
  constructor(private props: PropSystem) {
    ctx.weapons = this;
    ctx.services.weapons = this;
  }

  // ------------------------------------------------------------------ player
  playerPickUp(player: Player, prop: Prop): boolean {
    if (player.weapon || player.grabbed || player.carryingBody) return false;
    const def = prop.def;
    const carryOnly = !def.weapon && !!def.carry;
    if (!def.weapon && !carryOnly) return false;
    this.props.take(prop, player);
    const obj = carryOnly ? this.carryObject(prop) : gripObject(this.props, prop, FP_BASE);
    player.vm.handR.add(obj);
    if (carryOnly) {
      // big furniture held in front with both hands (viewmodel space)
      player.vm.root.add(obj);
      obj.position.set(0, -0.32, -0.95);
    }
    const w = new HeldPlayerWeapon(prop, obj, this, carryOnly);
    player.weapon = w;
    player.vm.play('pickup');
    events.emit('impact', { pos: player.position.clone(), normal: new THREE.Vector3(0, 1, 0), material: prop.def.material, strength: 0.15 });
    return true;
  }

  private carryObject(prop: Prop): THREE.Object3D {
    const g = new THREE.Group();
    const mesh = this.props.makeMesh(prop);
    mesh.castShadow = false;
    // center the prop in view
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    mesh.position.set(-c.x, -c.y, -c.z);
    const size = bb.getSize(new THREE.Vector3());
    const s = Math.min(1, 1.1 / Math.max(size.x, size.y, size.z));
    g.scale.setScalar(s);
    g.add(mesh);
    return g;
  }

  /** Detach the player's weapon visuals and return the prop to the world. */
  playerRelease(player: Player, mode: 'drop' | 'throw'): Prop | null {
    const w = player.weapon as HeldPlayerWeapon | null;
    if (!w) return null;
    player.weapon = null;
    w.fpObject.removeFromParent();
    const prop = w.prop;
    const eye = player.eye(new THREE.Vector3());
    const dir = player.aimDir(new THREE.Vector3());
    const pos = eye.clone().addScaledVector(dir, 0.55);
    pos.y -= 0.15;
    // keep it out of walls
    const wall = ctx.physics.raycast(eye, dir, 0.7);
    if (wall) pos.copy(eye).addScaledVector(dir, Math.max(0.1, wall.toi - 0.2));
    const yaw = player.ctrl.yaw;
    const rot = new THREE.Quaternion().setFromEuler(_e.set(player.ctrl.pitch, yaw, 0, 'YXZ'));
    if (!w.carryOnly && prop.def.weapon) {
      // weapon points forward along the throw
      rot.multiply(_q.setFromEuler(_e.set(-90 * D2R, 0, 0)));
    }
    let vel: THREE.Vector3;
    let ang: THREE.Vector3;
    if (mode === 'throw') {
      const wdef = prop.weapon;
      const speed = w.carryOnly ? Math.max(6, 16 - prop.def.mass * 0.3) : (wdef?.throwSpeed ?? 14) * (player.raging ? 1.3 : 1);
      vel = dir.clone().multiplyScalar(speed);
      vel.y += w.carryOnly ? 2.2 : 1.2;
      vel.add(player.ctrl.body.linvel() as any);
      const spin = wdef?.sticks ? 0 : rand(6, 14);
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      ang = right.multiplyScalar(-spin);
      if (wdef?.sticks) {
        // blades fly point-first
        ang.set(0, 0, 0);
      }
      player.stats.thrown++;
      events.emit('vocal', { who: player, kind: 'effort', pos: player.position, pitch: 1 });
      player.vm.play(w.carryOnly || prop.def.mass > 3 ? 'throwHeavy' : 'throw');
      ctx.player.camFx.kick(-0.5, 0, 0);
    } else {
      vel = dir.clone().multiplyScalar(1.5);
      ang = new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2));
    }
    this.props.release(prop, pos, rot, vel, ang, mode === 'throw' ? player : undefined);
    return prop;
  }

  breakPlayerWeapon(w: HeldPlayerWeapon, point: THREE.Vector3, dir: THREE.Vector3): void {
    const player = ctx.player;
    if (player.weapon !== w) return;
    player.weapon = null;
    w.fpObject.removeFromParent();
    const prop = w.prop;
    const brokenInto = w.def.brokenInto;
    // effects at the hand
    prop.currPos.copy(point);
    prop.lastVel.set(0, 0, 0);
    this.props.breakProp(prop, dir, 20);
    player.stats.objectsBroken++;
    // a broken bottle / chair leg remains in hand
    if (brokenInto) {
      const pieceDef = Object.values(PROPS).find((p) => p.weapon === brokenInto);
      if (pieceDef) {
        const np = this.props.spawn(pieceDef.id, point.clone(), 0, prop.variant);
        this.playerPickUp(player, np);
        player.vm.stop();
      }
    }
  }

  /** Player drinks the held item. */
  playerDrink(player: Player): boolean {
    const w = player.weapon as HeldPlayerWeapon | null;
    if (!w || !w.prop.def.interact || w.prop.def.interact !== 'drink' || !w.prop.full) return false;
    player.startDrink(w.prop.def.heal ?? 10, () => {
      w.prop.full = false;
      events.emit('vocal', { who: player, kind: 'laugh', pos: player.position, pitch: 1 });
    });
    return true;
  }

  // ------------------------------------------------------------------ NPCs
  characterPickUp(ch: Character, prop: Prop): boolean {
    if (ch.weapon || prop.state !== 'free' || !prop.def.weapon) return false;
    this.props.take(prop, ch);
    const obj = gripObject(this.props, prop, TP_BASE);
    obj.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    ch.model.attachHeld(obj);
    const w = prop.weapon!;
    const item: HeldItem & { prop: Prop; def: WeaponDef; durability: number } = {
      weaponId: w.id,
      twoHanded: w.twoHanded,
      object3d: obj,
      prop,
      def: w,
      durability: prop.durability,
    };
    ch.weapon = item;
    prop.reservedBy = null;
    return true;
  }

  dropFromCharacter(chAny: unknown, itemAny: unknown, vel?: THREE.Vector3): void {
    const ch = chAny as Character;
    const item = itemAny as HeldItem & { prop: Prop };
    if (!item?.prop) return;
    ch.model.attachHeld(null);
    ch.model.updateMatrices();
    const pos = ch.model.gripWorld(new THREE.Vector3());
    const rot = ch.model.worldQuatOfBone(P.LARM_R, new THREE.Quaternion());
    const v = vel ? vel.clone().multiplyScalar(0.6) : new THREE.Vector3(rand(-1, 1), 1.5, rand(-1, 1));
    this.props.release(item.prop, pos, rot, v, new THREE.Vector3(rand(-5, 5), rand(-5, 5), rand(-5, 5)));
  }

  /** NPC throws whatever it holds toward a target point. */
  characterThrow(ch: Character, target: THREE.Vector3): void {
    const item = ch.weapon as (HeldItem & { prop: Prop; def: WeaponDef }) | null;
    if (!item) return;
    ch.weapon = null;
    ch.model.attachHeld(null);
    ch.model.updateMatrices();
    const pos = ch.model.gripWorld(new THREE.Vector3());
    const d = _v.subVectors(target, pos);
    const dist = d.length();
    const speed = item.def.throwSpeed * 0.85;
    const t = dist / speed;
    const vel = d.clone().multiplyScalar(1 / Math.max(t, 0.05));
    vel.y += 0.5 * 15 * t; // gravity compensation
    // aim error
    vel.x += rand(-0.8, 0.8);
    vel.z += rand(-0.8, 0.8);
    const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const ang = item.def.sticks ? new THREE.Vector3() : new THREE.Vector3(rand(-10, 10), rand(-3, 3), rand(-10, 10));
    this.props.release(item.prop, pos, rot, vel, ang, ch);
  }

  /** NPC weapon took a hit: wear it down. Returns true if it broke. */
  characterWeaponHit(ch: Character, point: THREE.Vector3, dir: THREE.Vector3): boolean {
    const item = ch.weapon as (HeldItem & { prop: Prop; def: WeaponDef; durability: number }) | null;
    if (!item) return false;
    item.durability -= 1;
    events.emit('impact', { pos: point.clone(), normal: dir.clone().negate(), material: item.prop.def.material, strength: 0.8, otherMaterial: 'flesh' });
    if (item.durability > 0) return false;
    ch.weapon = null;
    ch.model.attachHeld(null);
    item.prop.currPos.copy(point);
    item.prop.lastVel.set(0, 0, 0);
    this.props.breakProp(item.prop, dir, 20);
    if (item.def.brokenInto) {
      const pieceDef = Object.values(PROPS).find((p) => p.weapon === item.def.brokenInto);
      if (pieceDef) {
        const np = this.props.spawn(pieceDef.id, point.clone(), 0, item.prop.variant);
        this.characterPickUp(ch, np);
      }
    }
    return true;
  }
}
