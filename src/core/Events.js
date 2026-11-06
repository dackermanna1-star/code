// Random world events: helicopter flyovers, supply airdrops, migrating hordes, distant ambience.
import * as THREE from 'three';
import { createEntityMaterial, setEntityLight } from '../render/materials.js';
import { B } from '../world/blocks.js';
import { groundAt } from '../entities/pathfind.js';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createEntityMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

/** Feet y of an open-sky, natural-ground cell at (x, z) (not a roof top, not a tree crown), or -1. */
const GROUND = new Set([B.grass, B.dry_grass, B.asphalt, B.asphalt_cracked, B.dirt, B.forest_floor, B.sidewalk, B.concrete, B.dirt_path, B.gravel, B.sand, B.mud, B.farmland].filter((v) => v !== undefined));
function streetLevel(w, x, z) {
  const top = w.roofY(x, z);
  if (!GROUND.has(w.get(x, top, z))) return -1;
  if (!w.isSolid(x, top - 1, z)) return -1; // flat roof / platform with a room under it
  return top + 1;
}

function compassDir(dx, dz) {
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return dirs[Math.round(((a + 360) % 360) / 45) % 8];
}

export class Events {
  constructor(game) {
    this.game = game;
    this.heli = null;
    this.drops = [];
    this.nextHeli = 2 + Math.random() * 6; // game hours
    this.nextDrop = 20 + Math.random() * 16;
    this.nextHorde = 26 + Math.random() * 20;
    this.nextAmbient = 0.5 + Math.random();
    this.markers = [];
  }

  update(dt, dtH) {
    const g = this.game;
    this.nextHeli -= dtH; this.nextDrop -= dtH; this.nextHorde -= dtH; this.nextAmbient -= dtH;
    if (this.nextHeli <= 0) { this.nextHeli = 14 + Math.random() * 30; if (g.time.day <= 6 && !this.heli) this.startHeli(); }
    if (this.nextDrop <= 0) { this.nextDrop = 30 + Math.random() * 30; if (!g.isNight) this.startDrop(); }
    if (this.nextHorde <= 0) { this.nextHorde = 18 + Math.random() * 20; this.startHorde(); }
    if (this.nextAmbient <= 0) {
      this.nextAmbient = 0.6 + Math.random() * 2.5;
      const p = g.player;
      const a = Math.random() * Math.PI * 2;
      const pos = { x: p.x + Math.cos(a) * 90, y: p.y + 5, z: p.z + Math.sin(a) * 90 };
      const r = Math.random();
      const name = r < 0.35 ? 'distant_gunshot' : r < 0.6 ? 'distant_scream' : g.isNight ? (r < 0.8 ? 'wolf_howl' : 'owl') : 'birds';
      g.audio.play(name, { pos, volume: 0.6, maxDist: 400 });
      if (name === 'distant_gunshot') g.noise(pos.x, pos.y, pos.z, 50, 'distant');
    }
    this.updateHeli(dt);
    this.updateDrops(dt);
  }

  // ---------------------------------------------------------------- helicopter
  startHeli() {
    const g = this.game, p = g.player;
    const a = Math.random() * Math.PI * 2;
    const from = new THREE.Vector3(p.x + Math.cos(a) * 300, 58, p.z + Math.sin(a) * 300);
    const off = (Math.random() - 0.5) * 50;
    const to = new THREE.Vector3(p.x - Math.cos(a) * 300 + Math.sin(a) * off, 58, p.z - Math.sin(a) * 300 - Math.cos(a) * off);
    const root = new THREE.Group();
    const body = 0x2e3a26;
    root.add(box(2.2, 2, 5, body, 0, 0, 0));
    root.add(box(1.8, 1.2, 1.6, 0x1a2228, 0, 0.2, 2.6));
    root.add(box(0.6, 0.6, 5, body, 0, 0.4, -4.8));
    root.add(box(0.2, 1.6, 1, body, 0, 1, -7));
    root.add(box(0.3, 0.3, 4, 0x222222, -1.2, -1.3, 0));
    root.add(box(0.3, 0.3, 4, 0x222222, 1.2, -1.3, 0));
    const rotor = new THREE.Group();
    rotor.add(box(12, 0.08, 0.5, 0x151515));
    rotor.add(box(0.5, 0.08, 12, 0x151515));
    rotor.position.y = 1.3;
    root.add(rotor);
    root.position.copy(from);
    root.lookAt(to.x, 58, to.z);
    g.renderer.scene.add(root);
    this.heli = { root, rotor, from, to, t: 0, len: from.distanceTo(to), sound: g.audio.loop('helicopter', { pos: from, volume: 1.4 }), noiseT: 0 };
    g.ui?.subtitle('You hear a helicopter approaching...', 4);
  }

  updateHeli(dt) {
    const h = this.heli;
    if (!h) return;
    const g = this.game;
    h.t += dt * 20;
    const k = h.t / h.len;
    h.root.position.lerpVectors(h.from, h.to, k);
    h.rotor.rotation.y += dt * 25;
    h.sound?.setPos(h.root.position);
    h.root.traverse((o) => { if (o.material) setEntityLight(o.material, 1, 0); });
    h.noiseT -= dt;
    if (h.noiseT <= 0) {
      h.noiseT = 1.5;
      const pos = h.root.position;
      g.noise(pos.x, 22, pos.z, 75, 'helicopter');
    }
    if (g.isNight) {
      const pos = h.root.position;
      const gy = g.world.roofY(Math.floor(pos.x), Math.floor(pos.z));
      g.addFlashLight(new THREE.Vector3(pos.x, gy + 3, pos.z), 0xe8f0ff, 3, 16, 0);
    }
    if (k >= 1) {
      h.sound?.stop();
      g.renderer.scene.remove(h.root);
      this.heli = null;
    }
  }

  // ---------------------------------------------------------------- airdrop
  startDrop() {
    const g = this.game, p = g.player, w = g.world;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 100;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (x < 20 || z < 20 || x > w.SX - 20 || z > w.SZ - 20) continue;
      const top = w.roofY(x, z);
      const id = w.get(x, top, z);
      if (![B.grass, B.dry_grass, B.asphalt, B.dirt, B.forest_floor, B.sidewalk, B.concrete, B.dirt_path, B.gravel].includes(id)) continue;
      if (w.get(x, top + 1, z) !== 0 && w.get(x, top + 1, z) !== B.tall_grass) continue;
      // real ground only (a flat concrete roof has a room under it): the crate must be reachable
      if (!w.isSolid(x, top - 1, z) || !w.isSolid(x, top - 2, z)) continue;
      const root = new THREE.Group();
      const crate = box(1, 1, 1, 0x4a5a32);
      root.add(crate);
      const chute = box(3.2, 0.3, 3.2, 0xd8d8cc, 0, 4, 0);
      root.add(chute);
      root.add(box(0.05, 3.5, 0.05, 0xaaaaaa, 1.4, 2.2, 1.4));
      root.add(box(0.05, 3.5, 0.05, 0xaaaaaa, -1.4, 2.2, -1.4));
      root.position.set(x + 0.5, 75, z + 0.5);
      g.renderer.scene.add(root);
      const drop = { root, chute, x, z, ground: top + 1, landed: false, t: 0, noiseT: 0 };
      this.drops.push(drop);
      const dir = compassDir(x - p.x, z - p.z);
      g.ui?.toast(`A supply drop is falling to the ${dir}!`, 'good');
      g.ui?.subtitle(`[Radio] "...supply drop inbound, grid ${Math.floor(x / 10)}-${Math.floor(z / 10)}... any survivors..."`, 6);
      this.markers.push({ x, z, label: 'Supply Drop', type: 'airdrop', drop });
      return;
    }
  }

  updateDrops(dt) {
    const g = this.game, w = g.world;
    for (const d of this.drops) {
      d.t += dt;
      if (!d.landed) {
        d.root.position.y -= dt * 3.2;
        d.root.rotation.y += dt * 0.3;
        d.root.traverse((o) => { if (o.material) setEntityLight(o.material, 1, 0); });
        if (d.root.position.y <= d.ground + 0.5) {
          d.landed = true;
          g.renderer.scene.remove(d.root);
          this.placeCrate(d);
          d.smoke = g.fx?.smoke?.(new THREE.Vector3(d.x + 0.5, d.ground + 1, d.z + 0.5), { color: 0xc03028, duration: 300, radius: 1.2 });
          g.audio.play('land_hard', { pos: { x: d.x, y: d.ground, z: d.z }, volume: 1.5 });
          d.noiseLeft = 60;
        }
      } else if (d.noiseLeft > 0) {
        d.noiseLeft -= dt;
        d.noiseT -= dt;
        if (d.noiseT <= 0) { d.noiseT = 5; g.noise(d.x, d.ground, d.z, 70, 'airdrop'); }
      }
    }
    // drop the map marker once the crate has been emptied (or destroyed)
    this.markerT = (this.markerT || 0) - dt;
    if (this.markerT <= 0) {
      this.markerT = 2;
      for (let i = this.markers.length - 1; i >= 0; i--) {
        const m = this.markers[i], d = m.drop;
        if (!d || !d.landed) continue;
        const c = w.get(d.x, d.ground, d.z) === B.crate_military ? w.getContainer(d.x, d.ground, d.z) : null;
        if (!c || (c.items && c.items.every((s) => !s))) {
          this.markers.splice(i, 1);
          const di = this.drops.indexOf(d);
          if (di >= 0) this.drops.splice(di, 1);
        }
      }
    }
  }

  /** Put the landed crate in the world and register its loot (keeps loot already rolled / taken). */
  placeCrate(d) {
    const w = this.game.world;
    if (w.get(d.x, d.ground, d.z) !== B.crate_military) w.setBlock(d.x, d.ground, d.z, B.crate_military, 0);
    const c = w.containers.get(w.idx(d.x, d.ground, d.z));
    if (!c || !c.items) w.addContainer(d.x, d.ground, d.z, 'airdrop', { name: 'Supply Drop', size: 12 });
    else c.name = 'Supply Drop';
  }

  // ---------------------------------------------------------------- horde
  startHorde() {
    const g = this.game, p = g.player, w = g.world;
    if (g.time.day < 2) return;
    const a = Math.random() * Math.PI * 2;
    const cx = p.x + Math.cos(a) * 100, cz = p.z + Math.sin(a) * 100;
    const tx = p.x - Math.cos(a) * 60 + (Math.random() - 0.5) * 30, tz = p.z - Math.sin(a) * 60 + (Math.random() - 0.5) * 30;
    const n = 16 + Math.floor(Math.random() * 14) + Math.min(10, g.time.day * 2);
    let placed = 0;
    for (let i = 0; i < n * 4 && placed < n; i++) {
      const x = Math.floor(cx + (Math.random() - 0.5) * 16), z = Math.floor(cz + (Math.random() - 0.5) * 16);
      if (x < 2 || z < 2 || x > w.SX - 3 || z > w.SZ - 3) continue;
      // the horde walks the streets and fields: never spawn on roofs or in tree crowns
      const sy = streetLevel(w, x, z);
      if (sy < 0) continue;
      const y = groundAt(w, x, sy, z);
      if (y < 0) continue;
      const zb = g.zombies.spawn(x + 0.5, y, z + 0.5);
      zb.target = { x: tx + (Math.random() - 0.5) * 10, y: p.y, z: tz + (Math.random() - 0.5) * 10 };
      zb.setState('investigate');
      placed++;
    }
    if (placed) g.ui?.subtitle('A chorus of groans rises in the distance...', 4);
  }

  toJSON() {
    // a crate still falling is saved as landed (it would have landed by the time you come back)
    const drops = this.drops.map((d) => ({ x: d.x, z: d.z, ground: d.ground }));
    return { nextHeli: this.nextHeli, nextDrop: this.nextDrop, nextHorde: this.nextHorde, drops };
  }
  load(d) {
    if (!d) return;
    Object.assign(this, { nextHeli: d.nextHeli ?? this.nextHeli, nextDrop: d.nextDrop ?? this.nextDrop, nextHorde: d.nextHorde ?? this.nextHorde });
    for (const s of d.drops || []) {
      const drop = { root: null, chute: null, x: s.x, z: s.z, ground: s.ground, landed: true, t: 0, noiseT: 0, noiseLeft: 0 };
      this.placeCrate(drop);
      this.drops.push(drop);
      this.markers.push({ x: s.x, z: s.z, label: 'Supply Drop', type: 'airdrop', drop });
    }
  }
}
