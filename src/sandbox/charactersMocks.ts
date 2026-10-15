// Sandbox-only mocks for the characters test scene: weapon instances (combat is a stub in Wave 1) and a
// simple drivable-ish vehicle implementing IVehicle (seat transforms, enter/exit) for seated poses.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { IVehicle, IWeaponInstance, VehicleSeat, WeaponDef, ICharacter } from '../core/contracts';
import type { WeaponClass, WeaponSlot } from '../core/types';
import { newEntityId } from '../core/types';
import { registerDebug } from '../core/Debug';
import { Priority } from '../core/Engine';
import type { Character } from '../characters/Character';

let uid = 1000;

const DEFS: Record<string, Partial<WeaponDef>> = {
  ar_m416: { class: 'ar', ammo: 'ammo_556', magSize: 30 },
  ar_akm: { class: 'ar', ammo: 'ammo_762', magSize: 30 },
  smg_ump45: { class: 'smg', ammo: 'ammo_45acp', magSize: 25 },
  sr_kar98k: { class: 'sr', ammo: 'ammo_762', magSize: 5 },
  dmr_sks: { class: 'dmr', ammo: 'ammo_762', magSize: 10 },
  lmg_m249: { class: 'lmg', ammo: 'ammo_556', magSize: 75 },
  sg_s1897: { class: 'sg', ammo: 'ammo_12g', magSize: 5 },
  pistol_p92: { class: 'pistol', ammo: 'ammo_9mm', magSize: 15 },
  melee_pan: { class: 'melee', ammo: null, magSize: 0 },
  throw_frag: { class: 'throwable', ammo: null, magSize: 0 },
};

export function mockWeapon(id: string): IWeaponInstance {
  const d = DEFS[id] ?? { class: 'ar' as WeaponClass, ammo: 'ammo_556', magSize: 30 };
  const def: WeaponDef = {
    id,
    name: id,
    class: d.class!,
    ammo: d.ammo ?? null,
    damage: 40,
    rpm: 600,
    fireModes: ['single', 'auto'],
    magSize: d.magSize ?? 30,
    reloadTime: 2.2,
    reloadTimeEmpty: 2.8,
    muzzleVelocity: 800,
    range: 100,
    attachmentSlots: [],
    model: `assets/weapons/${id}.glb`,
  };
  return { uid: uid++, def, ammoInMag: def.magSize, fireMode: 'auto', attachments: {}, magSize: def.magSize, zeroing: 100 };
}

const SLOT_FOR: Record<WeaponClass, WeaponSlot> = {
  ar: 'primary1', smg: 'primary1', dmr: 'primary1', sr: 'primary1', sg: 'primary1', lmg: 'primary1', pistol: 'pistol', melee: 'melee', throwable: 'throwable',
};

/** Simple mock vehicle: a box with 4 seats; moves in a circle when `driving` is set. */
export class MockVehicle implements IVehicle {
  readonly id = newEntityId();
  readonly kind: string;
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  speedKmh = 0;
  readonly seats: VehicleSeat[];
  health = 1500;
  readonly maxHealth = 1500;
  fuel = 100;
  destroyed = false;
  readonly isBoat = false;
  readonly root = new THREE.Group();
  driving = false;
  private t = 0;
  private readonly seatOffsets = [
    new THREE.Vector3(0.4, 0.85, 0.15),
    new THREE.Vector3(-0.4, 0.85, 0.15),
    new THREE.Vector3(0.4, 0.9, -0.85),
    new THREE.Vector3(-0.4, 0.9, -0.85),
  ];

  constructor(kind: string, pos: THREE.Vector3, rotY: number) {
    this.kind = kind;
    this.position.copy(pos);
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.seats = this.seatOffsets.map((_, i) => ({ index: i, occupant: null, canShoot: i > 0 }));
    const mat = new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.6 });
    // Open-top jeep: floor tub, low sides, hood, seats, steering wheel.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 3.8), mat);
    floor.position.y = 0.45;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.1), mat);
    hood.position.set(0, 0.8, 1.35);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 2.6), mat);
    sideL.position.set(0.82, 0.78, -0.55);
    const sideR = sideL.clone();
    sideR.position.x = -0.82;
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 });
    const seats = this.seatOffsets.map((o) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatMat);
      s.position.set(o.x, o.y - 0.12, o.z - 0.05);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.1), seatMat);
      back.position.set(o.x, o.y + 0.15, o.z - 0.32);
      return [s, back];
    }).flat();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    wheel.position.set(0.4, 1.33, 0.57);
    wheel.rotation.x = -0.9;
    this.root.add(floor, hood, sideL, sideR, wheel, ...seats);
    this.root.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.sync();
  }

  private sync(): void {
    this.root.position.copy(this.position);
    this.root.quaternion.copy(this.quaternion);
    this.root.updateMatrixWorld(true);
  }

  tick(dt: number): void {
    if (!this.driving) {
      this.velocity.set(0, 0, 0);
      this.speedKmh = 0;
      return;
    }
    this.t += dt;
    const yawRate = 0.25;
    const speed = 8;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRate * dt);
    this.quaternion.premultiply(q);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
    this.velocity.copy(fwd).multiplyScalar(speed);
    this.position.addScaledVector(this.velocity, dt);
    this.speedKmh = speed * 3.6;
    this.sync();
  }

  getSeatTransform(seat: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    outPos.copy(this.seatOffsets[seat] ?? this.seatOffsets[0]).applyQuaternion(this.quaternion).add(this.position);
    outQuat.copy(this.quaternion);
  }
  enter(c: ICharacter, seat = 0): boolean {
    const s = this.seats.find((x) => x.index === seat && !x.occupant) ?? this.seats.find((x) => !x.occupant);
    if (!s) return false;
    s.occupant = c;
    c.setVehicle(this, s.index);
    return true;
  }
  exit(c: ICharacter): boolean {
    const s = this.seats.find((x) => x.occupant === c);
    if (!s) return false;
    s.occupant = null;
    c.setVehicle(null, -1);
    return true;
  }
  switchSeat(c: ICharacter, seat: number): boolean {
    const cur = this.seats.find((x) => x.occupant === c);
    const next = this.seats[seat];
    if (!cur || !next || next.occupant) return false;
    cur.occupant = null;
    next.occupant = c;
    c.setVehicle(this, seat);
    return true;
  }
  applyDamage(): void {}
  refuel(): void {}
}

export function installSandboxMocks(ctx: GameContext): void {
  const vehicles: MockVehicle[] = [];
  ctx.engine.addSystem({ name: 'mockVehicles', priority: Priority.Vehicles, fixedUpdate: (dt) => vehicles.forEach((v) => v.tick(dt)) });

  registerDebug('giveWeapon', (charId: number, id: string, equip = true) => {
    const c = ctx.characters.byId(charId) as Character | undefined;
    if (!c) return false;
    const w = mockWeapon(id);
    let slot = SLOT_FOR[w.def.class];
    if (slot === 'primary1' && c.inventory.weapons.primary1 && !equip) slot = 'primary2';
    c.inventory.setWeapon(slot, w);
    if (equip) c.equipSlot(slot);
    c.refreshEquipmentVisuals();
    return slot;
  });
  registerDebug('giveGear', (charId: number, helmet = 2, vest = 2, pack = 2) => {
    const c = ctx.characters.byId(charId) as Character | undefined;
    if (!c) return false;
    const eq = c.inventory.equipment as Record<string, { itemId: string; durability: number } | null>;
    eq.helmet = helmet ? { itemId: `helmet_${helmet}`, durability: 100 } : null;
    eq.vest = vest ? { itemId: `vest_${vest}`, durability: 100 } : null;
    eq.backpack = pack ? { itemId: `backpack_${pack}`, durability: 100 } : null;
    c.refreshEquipmentVisuals();
    return true;
  });
  registerDebug('spawnMockVehicle', (x: number, z: number, rotY = 0) => {
    const v = new MockVehicle('vehicle_uaz', new THREE.Vector3(x, 0, z), rotY);
    ctx.scene.add(v.root);
    vehicles.push(v);
    return vehicles.length - 1;
  });
  registerDebug('mockVehicles', vehicles);
  registerDebug('enterVehicle', (charId: number, vi: number, seat = 0) => {
    const c = ctx.characters.byId(charId);
    const v = vehicles[vi];
    return !!(c && v && v.enter(c, seat));
  });
}
