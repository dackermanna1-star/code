// Item definitions and the item simulation (pure logic). Items are held, pocketed, resting
// in the world or flying (thrown/dropped) with simple ballistic physics and bounces.
import { RNG } from '../core/random.js';

// carry: oneHand | twoHand | long | heavy | ball | pocket (small items can be pocketed)
export const ITEMS = {
  mop: { name: 'Mop', carry: 'long', dmg: 8, reach: 0.45, durability: 30, throwDmg: 5, mass: 1.5, value: 2, size: 1.3 },
  broom: { name: 'Broom', carry: 'long', dmg: 7, reach: 0.45, durability: 25, throwDmg: 4, mass: 1.2, value: 2, size: 1.3 },
  bucket: { name: 'Mop Bucket', carry: 'oneHand', dmg: 7, durability: 40, throwDmg: 8, mass: 2, value: 2, size: 0.4 },
  plasticChair: { name: 'Plastic Chair', carry: 'twoHand', dmg: 13, reach: 0.3, durability: 6, breaksInto: 'chairLeg', throwDmg: 12, mass: 4, value: 3, heavy: true, size: 0.9 },
  chairLeg: { name: 'Chair Leg', carry: 'oneHand', dmg: 7, reach: 0.2, durability: 12, throwDmg: 5, mass: 0.6, value: 1, size: 0.5 },
  tray: { name: 'Food Tray', carry: 'twoHand', dmg: 6, durability: 18, throwDmg: 6, mass: 1, value: 2, food: 38, use: 'eat', size: 0.5, mealItem: true },
  book: { name: 'Book', carry: 'oneHand', dmg: 3, durability: 40, throwDmg: 3, mass: 0.6, value: 2, use: 'read', pocket: true, size: 0.25 },
  newspaper: { name: 'Newspaper', carry: 'oneHand', dmg: 1, durability: 10, throwDmg: 1, mass: 0.2, value: 1, use: 'read', pocket: true, size: 0.3 },
  dumbbell: { name: 'Dumbbell', carry: 'heavy', dmg: 15, durability: 999, throwDmg: 14, mass: 9, value: 4, heavy: true, size: 0.4 },
  basketball: { name: 'Basketball', carry: 'ball', dmg: 2, durability: 999, throwDmg: 4, mass: 0.6, value: 3, bouncy: 0.75, size: 0.24 },
  fryingPan: { name: 'Frying Pan', carry: 'oneHand', dmg: 12, durability: 80, throwDmg: 9, mass: 1.6, value: 6, contraband: true, size: 0.5, clang: true },
  ladle: { name: 'Ladle', carry: 'oneHand', dmg: 5, durability: 50, throwDmg: 4, mass: 0.4, value: 2, contraband: true, size: 0.4, pocket: true },
  apple: { name: 'Apple', carry: 'oneHand', dmg: 1, durability: 1, throwDmg: 2, mass: 0.2, value: 2, food: 14, use: 'eat', pocket: true, size: 0.08 },
  snack: { name: 'Snack Cake', carry: 'oneHand', dmg: 1, durability: 1, throwDmg: 1, mass: 0.1, value: 3, food: 20, use: 'eat', pocket: true, size: 0.12 },
  soda: { name: 'Can of Soda', carry: 'oneHand', dmg: 2, durability: 1, throwDmg: 3, mass: 0.35, value: 2, energy: 14, use: 'drink', pocket: true, size: 0.12 },
  coffee: { name: 'Mug of Coffee', carry: 'oneHand', dmg: 4, durability: 2, throwDmg: 6, mass: 0.4, value: 2, energy: 18, use: 'drink', size: 0.12, breaks: true },
  mug: { name: 'Mug', carry: 'oneHand', dmg: 4, durability: 2, throwDmg: 6, mass: 0.4, value: 1, size: 0.12, breaks: true },
  wrench: { name: 'Wrench', carry: 'oneHand', dmg: 13, durability: 999, throwDmg: 10, mass: 1.2, value: 9, contraband: true, size: 0.35, clang: true, pocket: true },
  screwdriver: { name: 'Screwdriver', carry: 'oneHand', dmg: 9, durability: 999, throwDmg: 6, mass: 0.3, value: 7, contraband: true, size: 0.25, pocket: true },
  boltCutters: { name: 'Bolt Cutters', carry: 'long', dmg: 11, durability: 999, throwDmg: 9, mass: 3, value: 30, contraband: true, tool: 'cut', size: 0.8, clang: true },
  keycard: { name: 'Staff Keycard', carry: 'oneHand', dmg: 0, durability: 999, throwDmg: 0, mass: 0.05, value: 45, contraband: true, tool: 'staffAccess', pocket: true, size: 0.08 },
  baton: { name: 'Guard Baton', carry: 'oneHand', dmg: 13, reach: 0.25, durability: 999, throwDmg: 8, mass: 0.9, value: 18, contraband: true, size: 0.55, pocket: true },
  cards: { name: 'Deck of Cards', carry: 'oneHand', dmg: 0, durability: 999, throwDmg: 0, mass: 0.1, value: 4, pocket: true, size: 0.08, gift: true },
  poolCue: { name: 'Pool Cue', carry: 'long', dmg: 9, reach: 0.6, durability: 8, throwDmg: 4, mass: 0.6, value: 3, size: 1.4, breaksInto: 'chairLeg' },
  soap: { name: 'Bar of Soap', carry: 'oneHand', dmg: 1, durability: 999, throwDmg: 2, mass: 0.15, value: 1, pocket: true, size: 0.08, gift: true },
  toiletRoll: { name: 'Toilet Roll', carry: 'oneHand', dmg: 0, durability: 999, throwDmg: 1, mass: 0.1, value: 1, pocket: true, size: 0.12 },
  pillow: { name: 'Pillow', carry: 'twoHand', dmg: 1, durability: 999, throwDmg: 1, mass: 0.5, value: 1, size: 0.5, soft: true },
  hooch: { name: 'Jar of Hooch', carry: 'oneHand', dmg: 4, durability: 2, throwDmg: 6, mass: 0.8, value: 14, contraband: true, use: 'drink', pocket: true, size: 0.15, breaks: true, hooch: true },
  phone: { name: 'Smuggled Phone', carry: 'oneHand', dmg: 1, durability: 999, throwDmg: 2, mass: 0.2, value: 35, contraband: true, pocket: true, size: 0.1, gift: true },
};

let nextId = 1;
export class ItemManager {
  constructor(world, rng = new RNG(7)) {
    this.world = world;
    this.items = new Map();
    this.rng = rng;
    this.onImpact = null;   // (item, speed, surface) callback for sound/fx
    this.onHitChar = null;  // (item, character) callback when a flying item strikes someone
  }
  spawn(type, x, y, z, opts = {}) {
    const def = ITEMS[type];
    if (!def) throw new Error(`Unknown item ${type}`);
    const it = {
      id: opts.id || `it${nextId++}`, type, def, x, y, z, vx: 0, vy: 0, vz: 0, yaw: opts.yaw ?? this.rng.range(0, Math.PI * 2), spin: 0,
      holder: null, pocketOf: null, resting: true, durability: def.durability, thrownBy: null, airTime: 0, hitSet: null,
      home: opts.home || null, view: null, filled: def.mealItem ? opts.filled ?? true : false, spawnedAt: opts.time || 0,
    };
    this.items.set(it.id, it);
    return it;
  }
  remove(it) { this.items.delete(it.id); if (it.view) it.view.dispose(); it.removed = true; }
  /** Release an item into the world with a velocity (drop or throw). */
  release(it, x, y, z, vx = 0, vy = 0, vz = 0, thrower = null) {
    it.holder = null; it.pocketOf = null;
    it.x = x; it.y = y; it.z = z; it.vx = vx; it.vy = vy; it.vz = vz;
    it.resting = false; it.thrownBy = thrower; it.airTime = 0; it.hitSet = new Set(thrower ? [thrower.id] : []);
    it.spin = Math.hypot(vx, vz) * 3;
  }
  update(dt, characters) {
    for (const it of this.items.values()) {
      if (it.holder || it.pocketOf || it.resting) continue;
      it.airTime += dt;
      it.vy -= 18 * dt;
      const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, nz = it.z + it.vz * dt;
      const r = Math.max(0.08, Math.min(0.3, it.def.size * 0.35));
      const res = this.world.colliders.resolveCircle(nx, nz, r, ny - r, ny + r, (b) => b.kind !== 'fence' || ny < 3.6);
      it.x = res.x; it.z = res.z; it.y = ny;
      const bounce = it.def.bouncy || 0.25;
      if (res.hit) {
        const dot = it.vx * res.nx + it.vz * res.nz;
        if (dot < 0) {
          const speed = Math.hypot(it.vx, it.vz);
          it.vx -= (1 + bounce) * dot * res.nx; it.vz -= (1 + bounce) * dot * res.nz;
          it.vx *= 0.7; it.vz *= 0.7;
          if (speed > 2 && this.onImpact) this.onImpact(it, speed, 'wall');
        }
      }
      // Furniture tops act as surfaces (tables, counters) for items falling onto them.
      let ground = 0;
      const tops = this.world.colliders.query(it.x - 0.05, it.z - 0.05, it.x + 0.05, it.z + 0.05, this._q || (this._q = []));
      for (const b of tops) if (b.kind === 'furniture' && b.maxY < 1.3 && b.maxY <= it.y + 0.05 - it.vy * dt) ground = Math.max(ground, b.maxY);
      const half = Math.min(0.15, it.def.size * 0.15);
      if (it.y - half <= ground) {
        it.y = ground + half;
        if (it.vy < -2.5 && this.onImpact) this.onImpact(it, -it.vy, 'floor');
        if (it.vy < -1.2) { it.vy = -it.vy * bounce; it.vx *= 0.65; it.vz *= 0.65; }
        else { it.vy = 0; it.vx *= Math.max(0, 1 - 9 * dt); it.vz *= Math.max(0, 1 - 9 * dt); }
        if (Math.hypot(it.vx, it.vz) < 0.15 && Math.abs(it.vy) < 0.3) { it.resting = true; it.vx = it.vz = it.vy = 0; it.thrownBy = null; it.hitSet = null; }
      }
      it.yaw += it.spin * dt; it.spin *= Math.max(0, 1 - 2 * dt);
      // Flying items hit characters
      if (it.thrownBy && it.hitSet && Math.hypot(it.vx, it.vz) > 4) {
        for (const c of characters) {
          if (it.hitSet.has(c.id) || c.isDown) continue;
          if (Math.hypot(c.x - it.x, c.z - it.z) < c.radius + r + 0.08 && it.y > c.y + 0.2 && it.y < c.y + 2.0) {
            it.hitSet.add(c.id);
            if (this.onHitChar) this.onHitChar(it, c);
            it.vx *= -0.3; it.vz *= -0.3;
          }
        }
      }
      if (it.y < -5) { it.y = 0.1; it.resting = true; }
    }
  }
  /** Free (not held/pocketed) items within radius of a point. */
  near(x, z, radius) {
    const out = [];
    for (const it of this.items.values()) {
      if (it.holder || it.pocketOf) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d <= radius) out.push({ item: it, d });
    }
    return out;
  }
}
