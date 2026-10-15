// Character simulation integration tests (real Rapier world, real Character + motors, stubbed services):
// steep-slope sliding, prone view clamp, seat sync with a moving vehicle, teleport under low ceilings.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ctx } from '../src/core/GameContext';
import { EventBus } from '../src/core/EventBus';
import { Physics, RAPIER, Layer } from '../src/core/Physics';
import type { IVehicle, VehicleSeat, ICharacter } from '../src/core/contracts';
import { Character } from '../src/characters/Character';
import { PRONE_VIEW_YAW_LIMIT } from '../src/characters/constants';
import '../src/core/events';

const DT = 1 / 60;
let physics: Physics;

function stubContext(): void {
  ctx.events = new EventBus();
  ctx.engine = { simTime: 0 } as unknown as typeof ctx.engine;
  ctx.physics = physics;
  ctx.world = {
    size: 3072,
    seaLevel: -10,
    getHeight: () => 0,
    getWaterHeight: () => null,
    getSurface: () => 'grass',
  } as unknown as typeof ctx.world;
  ctx.items = {
    defs: {},
    createInventory: () => ({
      weapons: { primary1: null, primary2: null, pistol: null, melee: null, throwable: null },
      equipment: { helmet: null, vest: null, backpack: null },
      items: [],
      count: () => 0,
    }),
    canUse: () => false,
  } as unknown as typeof ctx.items;
  ctx.combat = { weaponDefs: {}, updateWeaponHandling: () => ({ recoilPitch: 0, recoilYaw: 0 }) } as unknown as typeof ctx.combat;
  ctx.interactions = { best: () => null } as unknown as typeof ctx.interactions;
}

function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotX = 0): void {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotX);
  physics.addStatic(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    { kind: 'building', surface: 'concrete' },
    Layer.Static,
  );
}

/** Fresh world with a 200 m floor tile at y = 0. */
async function freshWorld(): Promise<void> {
  physics = new Physics();
  await physics.init();
  stubContext();
  box(0, -1, 0, 100, 1, 100);
}

function step(chars: Character[], seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    each?.();
    for (const c of chars) c.fixedUpdate(DT);
    physics.step(DT);
    (ctx.engine as unknown as { simTime: number }).simTime += DT;
  }
}

function spawn(x: number, y: number, z: number, isPlayer = false, yaw = 0): Character {
  return new Character({ name: 'T', teamId: 0, isPlayer, position: new THREE.Vector3(x, y, z), yaw });
}

describe('Character simulation', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it('slides off a 60° slope instead of standing on it', async () => {
    await freshWorld();
    // 8 m long slab tilted 60° about X, rising toward -Z.
    const a = (60 * Math.PI) / 180;
    box(0, Math.sin(a) * 4 - 0.2 * Math.cos(a), -Math.cos(a) * 4, 2, 0.2, 4, a);
    const c = spawn(0, Math.sin(a) * 4 + 0.6, -Math.cos(a) * 4);
    const y0 = c.position.y;
    step([c], 3);
    expect(c.position.y).toBeLessThan(y0 - 2);
    expect(c.position.y).toBeLessThan(0.3);
    expect(Number.isFinite(c.position.x + c.position.z)).toBe(true);
  });

  it('still walks up a 40° ramp', async () => {
    await freshWorld();
    const a = (40 * Math.PI) / 180;
    box(0, Math.sin(a) * 4 - 0.2 * Math.cos(a), -Math.cos(a) * 4 - 1, 2, 0.2, 4, a);
    const c = spawn(0, 0.02, 1);
    step([c], 0.3);
    c.intent.moveY = 1;
    let maxY = 0;
    step([c], 3, () => (maxY = Math.max(maxY, c.position.y)));
    expect(maxY).toBeGreaterThan(3.5);
  });

  it('keeps the prone view within the body lead limit (player intent too)', async () => {
    await freshWorld();
    const c = spawn(0, 0.02, 0, true, 0);
    step([c], 0.2);
    expect(c.requestStance('prone')).toBe(true);
    step([c], 1.0);
    c.intent.yaw = Math.PI; // look straight behind
    step([c], DT);
    const off = Math.abs(Math.atan2(Math.sin(c.yaw - c.bodyYaw), Math.cos(c.yaw - c.bodyYaw)));
    expect(off).toBeLessThanOrEqual(PRONE_VIEW_YAW_LIMIT + 1e-6);
    const offIntent = Math.abs(Math.atan2(Math.sin(c.intent.yaw - c.bodyYaw), Math.cos(c.intent.yaw - c.bodyYaw)));
    expect(offIntent).toBeLessThanOrEqual(PRONE_VIEW_YAW_LIMIT + 1e-6);
    // The body keeps turning toward the view: after a few seconds it faces backwards.
    for (let i = 0; i < 4 * 60; i++) {
      c.intent.yaw = Math.PI;
      step([c], DT);
    }
    expect(Math.abs(Math.atan2(Math.sin(c.bodyYaw - Math.PI), Math.cos(c.bodyYaw - Math.PI)))).toBeLessThan(0.05);
  });

  it('ducks when teleported under a low ceiling instead of popping on top of it', async () => {
    await freshWorld();
    box(0, 0.85 + 0.15, -10, 3, 0.15, 3); // 0.85 m clearance
    box(10, 1.4 + 0.15, -10, 3, 0.15, 3); // 1.4 m clearance
    const c = spawn(0, 0.02, 10);
    step([c], 0.3);
    c.teleport(new THREE.Vector3(0, 0.02, -10));
    step([c], 0.5);
    expect(c.stance).toBe('prone');
    expect(c.position.y).toBeLessThan(0.2);
    c.teleport(new THREE.Vector3(10, 0.02, 10));
    step([c], 0.2);
    expect(c.requestStance('stand')).toBe(true);
    step([c], 0.5);
    c.teleport(new THREE.Vector3(10, 0.02, -10));
    step([c], 0.5);
    expect(c.stance).toBe('crouch');
    expect(c.position.y).toBeLessThan(0.2);
  });

  it('revived under a low table stays prone instead of popping on top of it', async () => {
    await freshWorld();
    box(0, 1.05 + 0.05, -6, 1.5, 0.05, 1.5); // table top 1.05–1.15 m: a knocked body (1.0 m) fits, a crouch does not
    const c = spawn(0, 0.02, 0);
    step([c], 0.3);
    c.setLifeState('knocked');
    c.intent.moveY = 1;
    step([c], 6.5); // crawl 0.9 m/s under the table
    c.intent.moveY = 0;
    expect(c.position.z).toBeLessThan(-5);
    c.setLifeState('alive');
    step([c], 0.5);
    expect(c.stance).toBe('prone');
    expect(c.position.y).toBeLessThan(0.2);
  });

  it('seated position and hitboxes follow a moving vehicle within the tick', async () => {
    await freshWorld();
    const seats: VehicleSeat[] = [{ index: 0, occupant: null, canShoot: false }];
    const v = {
      id: 999,
      kind: 'vehicle_test',
      position: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(0, 0, 30),
      speedKmh: 108,
      seats,
      health: 1000,
      maxHealth: 1000,
      fuel: 100,
      destroyed: false,
      isBoat: false,
      root: new THREE.Group(),
      getSeatTransform(_s: number, p: THREE.Vector3, q: THREE.Quaternion) {
        p.set(0.4, 0.9, 0.2).applyQuaternion(this.quaternion).add(this.position);
        q.copy(this.quaternion);
      },
      enter(c: ICharacter) {
        seats[0].occupant = c;
        c.setVehicle(this as unknown as IVehicle, 0);
        return true;
      },
      exit(c: ICharacter) {
        seats[0].occupant = null;
        c.setVehicle(null, -1);
        return true;
      },
      switchSeat: () => false,
      applyDamage() {},
      refuel() {},
    };
    const c = spawn(2, 0.02, 0);
    step([c], 0.2);
    v.enter(c);
    const seat = new THREE.Vector3();
    const q = new THREE.Quaternion();
    let maxErr = 0;
    for (let i = 0; i < 60; i++) {
      c.fixedUpdate(DT); // characters (20)
      v.position.addScaledVector(v.velocity, DT); // vehicles (25)
      c.syncSeat(); // characterSeats (26)
      v.getSeatTransform(0, seat, q); // combat (30) would ray-test now
      const pelvis = c.getHitboxes().find((h) => h.zone === 'pelvis')!;
      maxErr = Math.max(maxErr, pelvis.a.clone().lerp(pelvis.b, 0.5).distanceTo(seat));
      physics.step(DT);
    }
    expect(maxErr).toBeLessThan(0.3);
    expect(c.position.z).toBeGreaterThan(25);
    v.exit(c);
    expect(c.mode).toBe('ground');
  });

  it("turns the player's view with the vehicle (bots keep their absolute aim)", async () => {
    await freshWorld();
    const mk = () => {
      const seats: VehicleSeat[] = [{ index: 0, occupant: null, canShoot: true }];
      return {
        id: 998, kind: 'vehicle_test', position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(),
        speedKmh: 0, seats, health: 1, maxHealth: 1, fuel: 100, destroyed: false, isBoat: false, root: new THREE.Group(),
        getSeatTransform(_s: number, p: THREE.Vector3, q: THREE.Quaternion) {
          p.set(0.4, 0.9, 0.2).applyQuaternion(this.quaternion).add(this.position);
          q.copy(this.quaternion);
        },
        enter(c: ICharacter) { seats[0].occupant = c; c.setVehicle(this as unknown as IVehicle, 0); return true; },
        exit(c: ICharacter) { seats[0].occupant = null; c.setVehicle(null, -1); return true; },
        switchSeat: () => false, applyDamage() {}, refuel() {},
      };
    };
    const vp = mk(), vb = mk();
    vb.position.set(10, 0, 0);
    const player = spawn(2, 0.02, 0, true, 0.3);
    const bot = spawn(12, 0.02, 0, false, 0.3);
    step([player, bot], 0.2);
    vp.enter(player);
    vb.enter(bot);
    step([player, bot], DT);
    const y0 = player.intent.yaw, b0 = bot.intent.yaw;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5 / 60);
    for (let i = 0; i < 60; i++) {
      vp.quaternion.premultiply(turn);
      vb.quaternion.premultiply(turn);
      player.fixedUpdate(DT);
      bot.fixedUpdate(DT);
      player.syncSeat();
      bot.syncSeat();
    }
    expect(player.intent.yaw - y0).toBeCloseTo(0.5, 2);
    expect(bot.intent.yaw).toBe(b0);
  });
});
