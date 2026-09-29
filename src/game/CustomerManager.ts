import * as THREE from 'three';
import { Customer, CustomerContext } from './Customer';
import { CustomerDef } from '../characters/Roster';
import { NavGrid } from './NavGrid';
import { COUNTER, DOOR, ROOM, SEATS, SPOTS, Seat, TABLE_TOP_Y } from '../world/Layout';
import { pick, rand } from '../core/math';

/**
 * Owns all customer entities: spawning, queueing at the counter, waiting
 * spots, pickup calls, seating and leaving.
 */
export class CustomerManager {
  readonly list: Customer[] = [];
  readonly nav: NavGrid;
  readonly queue: Customer[] = [];
  private waitOccupied: (Customer | null)[] = SPOTS.waiting.map(() => null);
  onChange?: () => void;
  onLeave?: (c: Customer) => void;

  constructor(private scene: THREE.Object3D, private ctx: CustomerContext) {
    this.nav = new NavGrid(ROOM.minX, -1.0, ROOM.maxX, 7.6, 0.2);
    this.buildObstacles();
  }

  private buildObstacles() {
    const n = this.nav;
    // counter + partition
    n.blockRect(COUNTER.minX, -1.6, COUNTER.maxX, COUNTER.z + COUNTER.depth / 2, 0.15);
    n.blockRect(COUNTER.gapMinX, -1.6, ROOM.maxX, COUNTER.z + 0.1, 0.15);
    // front wall except the door
    n.blockRect(ROOM.minX, ROOM.maxZ, DOOR.x - DOOR.width / 2 + 0.05, ROOM.maxZ + 0.3, 0.12);
    n.blockRect(DOOR.x + DOOR.width / 2 - 0.05, ROOM.maxZ, ROOM.maxX, ROOM.maxZ + 0.3, 0.12);
    // side walls
    n.blockRect(ROOM.minX - 0.2, -1.0, ROOM.minX, ROOM.maxZ, 0.15);
    n.blockRect(ROOM.maxX, -1.0, ROOM.maxX + 0.2, ROOM.maxZ, 0.15);
    // 4-tops + chairs
    for (const [tx, tz] of [[-3.3, 2.25], [-3.3, 4.55]]) {
      n.blockCircle(tx, tz, 0.5);
      for (const [dx, dz] of [[0, -0.62], [0, 0.62], [-0.62, 0], [0.62, 0]]) n.blockCircle(tx + dx, tz + dz, 0.2, 0.1);
    }
    for (const [tx, tz] of [[3.2, 1.5], [3.2, 3.85]]) {
      n.blockCircle(tx, tz, 0.4);
      for (const dx of [-0.55, 0.55]) n.blockCircle(tx + dx, tz, 0.2, 0.1);
    }
    for (const bz of [1.2, 2.95, 4.7]) n.blockRect(ROOM.maxX - 1.25, bz - 0.88, ROOM.maxX, bz + 0.88, 0.1);
    // waiting bench, plants, soda fountain, trash
    n.blockRect(ROOM.minX, 0.35, ROOM.minX + 0.62, 4.25, 0.05);
    n.blockCircle(ROOM.minX + 0.45, 4.85, 0.22);
    n.blockCircle(ROOM.minX + 0.45, -0.15, 0.2);
    n.blockRect(4.85, -1.2, 6.45, -0.45, 0.15);
    n.blockRect(ROOM.maxX - 0.65, ROOM.maxZ - 0.7, ROOM.maxX, ROOM.maxZ, 0.1);
  }

  /** Block an extra obstacle (decor). */
  blockDecor(x: number, z: number, r: number) {
    this.nav.blockCircle(x, z, r);
  }

  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const outsideFrom = from.z > ROOM.maxZ + 0.2;
    const outsideTo = to.z > ROOM.maxZ + 0.2;
    if (outsideFrom && outsideTo) return [to.clone()];
    if (outsideFrom) return [SPOTS.outsideDoor.clone(), new THREE.Vector3(DOOR.x, 0, ROOM.maxZ - 0.6), ...this.nav.find(new THREE.Vector3(DOOR.x, 0, ROOM.maxZ - 0.6), to)];
    if (outsideTo) {
      const inner = new THREE.Vector3(DOOR.x, 0, ROOM.maxZ - 0.6);
      return [...this.nav.find(from, inner), SPOTS.outsideDoor.clone(), to.clone()];
    }
    return this.nav.find(from, to);
  }

  spawn(def: CustomerDef): Customer {
    const c = new Customer(def, this.ctx);
    const left = Math.random() < 0.5;
    const start = (left ? SPOTS.spawnLeft : SPOTS.spawnRight).clone();
    start.z += rand(-0.3, 0.3);
    c.place(start, left ? Math.PI / 2 : -Math.PI / 2);
    this.scene.add(c.root);
    this.list.push(c);
    c.state = 'outside';
    c.walk([SPOTS.outsideDoor.clone().setX(SPOTS.outsideDoor.x + (left ? -0.4 : 0.4))], () => this.enterQueue(c));
    this.onChange?.();
    return c;
  }

  private enterQueue(c: Customer) {
    this.queue.push(c);
    c.state = 'toQueue';
    this.refreshQueue();
  }

  /** Move everyone in the queue to their slot (first = order spot). */
  refreshQueue() {
    this.queue.forEach((c, i) => {
      const target = i === 0 ? SPOTS.order : SPOTS.queue[Math.min(i - 1, SPOTS.queue.length - 1)];
      if (c.queueSlot === i && (c.state === 'queued' || c.state === 'atCounter')) return;
      c.queueSlot = i;
      c.state = 'toQueue';
      c.goTo(
        target,
        () => {
          if (i === 0) {
            c.state = 'atCounter';
            if (!c.arrivedAt) c.arrivedAt = this.ctx.now();
            c.lookAt = new THREE.Vector3(-1.0, 1.5, -2.2);
            c.gesture('wave', 1.6);
            c.setExpression('happy');
            this.onChange?.();
          } else {
            c.state = 'queued';
            if (!c.arrivedAt) c.arrivedAt = this.ctx.now() + 8; // being in line is more forgiving
          }
        },
        Math.PI,
      );
    });
    this.onChange?.();
  }

  get atCounter(): Customer | null {
    const c = this.queue[0];
    return c && c.state === 'atCounter' ? c : null;
  }

  /** After ordering, move the customer to a waiting spot. */
  sendToWait(c: Customer) {
    const qi = this.queue.indexOf(c);
    if (qi >= 0) this.queue.splice(qi, 1);
    c.queueSlot = -1;
    // prefer bench seats, then standing spots
    let idx = this.waitOccupied.findIndex((o, i) => !o && SPOTS.waiting[i].sit);
    if (idx < 0) idx = this.waitOccupied.findIndex((o) => !o);
    c.state = 'toWait';
    c.lookAt = null;
    if (idx < 0) {
      // crowded: hang around the lobby
      const p = new THREE.Vector3(rand(-2.5, 1.5), 0, rand(0.6, 1.4));
      c.goTo(p, () => (c.state = 'waiting'), Math.PI);
    } else {
      this.waitOccupied[idx] = c;
      c.waitSpot = idx;
      const spot = SPOTS.waiting[idx];
      c.goTo(
        spot.pos,
        () => {
          c.state = 'waiting';
          if (spot.sit) {
            c.anim.sit = 1;
            c.anim.seatHeight = 0.48;
          }
          this.onChange?.();
        },
        spot.face,
      );
    }
    this.refreshQueue();
  }

  private freeWait(c: Customer) {
    if (c.waitSpot >= 0) this.waitOccupied[c.waitSpot] = null;
    c.waitSpot = -1;
  }

  /** Call a waiting customer to the pickup counter. */
  callToPickup(c: Customer): Promise<void> {
    this.freeWait(c);
    c.state = 'toPickup';
    c.anim.sit = 0;
    c.lookAt = null;
    c.setExpression('hungry');
    return new Promise((resolve) => {
      c.goTo(
        SPOTS.pickup,
        () => {
          c.state = 'atPickup';
          c.lookAt = new THREE.Vector3(2.2, 1.45, -2.3);
          resolve();
        },
        Math.PI,
      );
    });
  }

  /** Take the tray to a table, eat, then leave. */
  goEat(c: Customer, tray: THREE.Object3D) {
    const free = SEATS.filter((s) => !s.occupied);
    if (!free.length) {
      this.leave(c);
      return;
    }
    const seat = pick(free);
    seat.occupied = true;
    c.seat = seat;
    c.state = 'toSeat';
    c.lookAt = null;
    c.gesture('hold');
    c.goTo(
      seat.pos,
      () => this.sitAndEat(c, seat, tray),
      seat.face,
    );
  }

  private sitAndEat(c: Customer, seat: Seat, tray: THREE.Object3D) {
    c.anim.sit = 1;
    c.anim.seatHeight = 0.47;
    // put the tray on the table
    const world = new THREE.Vector3();
    tray.getWorldPosition(world);
    this.scene.attach(tray);
    tray.position.set(seat.table.x, TABLE_TOP_Y + 0.004, seat.table.z);
    tray.rotation.set(0, seat.face, 0);
    c.tray = tray;
    // burger into hands
    if (c.burger) {
      c.model.rig.chest.add(c.burger.group);
      c.burger.group.position.set(0, c.model.dims.torso * 0.62, 0.23);
      c.burger.group.rotation.set(0.25, 0, 0);
      c.burger.group.scale.setScalar(0.95);
    }
    c.startEating(rand(12, 18));
    c.onDoneEating = () => {
      if (c.burger) {
        c.burger.dispose();
        c.burger = null;
      }
      c.gesture('rubBelly', 2);
      c.setExpression('content');
      this.ctx.emote(c, 'heart');
      this.ctx.later(1.8, () => this.leave(c));
    };
  }

  leave(c: Customer) {
    this.freeWait(c);
    if (c.seat) {
      const seat = c.seat;
      const tray = c.tray;
      c.seat = null;
      c.tray = null;
      // tray lingers on the table for a moment, then gets bussed
      this.ctx.later(9, () => {
        tray?.removeFromParent();
        seat.occupied = false;
      });
    }
    c.state = 'leaving';
    c.anim.sit = 0;
    c.lookAt = null;
    c.anim.setGesture('none');
    const out = (Math.random() < 0.5 ? SPOTS.spawnLeft : SPOTS.spawnRight).clone();
    c.goTo(out, () => {
      c.state = 'gone';
    });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.update(dt);
      if (c.state === 'gone') {
        this.list.splice(i, 1);
        this.onLeave?.(c);
        c.dispose();
        this.onChange?.();
      }
    }
  }

  get inRestaurant(): number {
    return this.list.filter((c) => c.state !== 'gone' && c.state !== 'leaving').length;
  }

  clear() {
    for (const c of this.list) c.dispose();
    this.list.length = 0;
    this.queue.length = 0;
    this.waitOccupied.fill(null);
    for (const s of SEATS) s.occupied = false;
  }
}
