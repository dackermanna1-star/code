// Items lying in the world: drops, floor loot from the generator, notes. Rendered as small billboards.
import * as THREE from 'three';
import { getItemDef, createItem } from '../items/items.js';
import { getItemIcon } from '../items/icons.js';
import { generateLoot } from '../items/loot.js';
import { createEntityMaterial, setEntityLight } from '../render/materials.js';
import { makeRng, hash32 } from '../core/rng.js';
import { SOLID, BLOCKS, getCollisionBoxes } from '../world/blocks.js';

/** Top of the collision box (if any) above/around the point inside its cell (under a table top counts as on it). */
function boxTopAt(w, x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const id = w.get(bx, by, bz);
  if (!SOLID[id]) return null;
  const boxes = getCollisionBoxes(id, BLOCKS[id].render === 'cube' ? 0 : w.getMeta(bx, by, bz));
  if (!boxes) return null;
  const fx = x - bx, fy = y - by, fz = z - bz;
  let top = null;
  for (const b of boxes) if (fx >= b[0] - 0.02 && fx <= b[3] + 0.02 && fz >= b[2] - 0.02 && fz <= b[5] + 0.02 && fy < b[4]) top = Math.max(top ?? -1, by + b[4]);
  return top;
}
/** Highest supporting surface at (x, z) between y and yMin (box accurate: tables, counters, beds). */
function supportBelow(w, x, y, z, yMin) {
  const bx = Math.floor(x), bz = Math.floor(z);
  const fx = x - bx, fz = z - bz;
  for (let cy = Math.floor(y); cy >= Math.floor(yMin); cy--) {
    const id = w.get(bx, cy, bz);
    if (!SOLID[id]) continue;
    const boxes = getCollisionBoxes(id, BLOCKS[id].render === 'cube' ? 0 : w.getMeta(bx, cy, bz));
    if (!boxes) continue;
    let top = -Infinity;
    for (const b of boxes) if (fx >= b[0] && fx <= b[3] && fz >= b[2] && fz <= b[5] && cy + b[4] <= y + 0.05) top = Math.max(top, cy + b[4]);
    if (top > -Infinity) return top;
  }
  return null;
}

const texCache = new Map();
function iconTexture(id) {
  let t = texCache.get(id);
  if (!t) {
    t = new THREE.CanvasTexture(getItemIcon(id));
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(id, t);
  }
  return t;
}
const PLANE = new THREE.PlaneGeometry(0.42, 0.42);

export class GroundItems {
  constructor(game) {
    this.game = game;
    this.items = []; // {stack, x, y, z, vy, mesh, rot}
    this.rolled = new Set(); // floorLoot indices already rolled
    this.notesPlaced = false;
    this.checkT = 0;
  }

  add(stack, x, y, z, o = {}) {
    const w = this.game.world, p = this.game.player;
    if (w && !o.raw) {
      // never spawn inside a wall (dropping while facing one): fall back to the player's column
      const id = w.get(Math.floor(x), Math.floor(y), Math.floor(z));
      if ((o.vy || 0) > 0 && SOLID[id] && BLOCKS[id].render === 'cube' && p && Math.hypot(p.x - x, p.z - z) < 2.5) { x = p.x; z = p.z; y = Math.max(y, p.y + 0.3); }
      // resting inside furniture (notes on desks, loot on tables): lift onto its top surface
      for (let k = 0; k < 2; k++) { const top = boxTopAt(w, x, y, z); if (top === null) break; y = top + 0.02; }
    }
    const it = { stack, x, y, z, vy: o.vy ?? 0, rot: Math.random() * Math.PI * 2, mesh: null, settled: !!o.settled };
    this.items.push(it);
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    if (it.mesh) this.disposeMesh(it);
  }

  disposeMesh(it) {
    this.game.renderer.scene.remove(it.mesh);
    it.mesh.material.dispose();
    it.mesh = null;
  }

  near(x, y, z, r) {
    return this.items.filter((it) => (it.x - x) ** 2 + (it.z - z) ** 2 < r * r && Math.abs(it.y - y) < 2.2);
  }

  /** Drop a stack at the player's feet (scatter a little). */
  dropAt(stack, x, y, z) {
    return this.add(stack, x + (Math.random() - 0.5) * 0.6, y + 0.4, z + (Math.random() - 0.5) * 0.6, { vy: 1 });
  }

  /** Roll generator floor loot / notes that are close to the player. */
  rollNearby() {
    const g = this.game, w = g.world, p = g.player;
    if (!this.notesPlaced) {
      this.notesPlaced = true;
      w.notes.forEach((n, i) => {
        if (this.rolled.has('n' + i)) return;
        this.rolled.add('n' + i);
        // generator positions are continuous world coordinates (cell centres), not cell corners
        this.add(createItem('note', { data: { noteId: n.noteId } }), n.x, n.y + 0.05, n.z, { settled: false });
      });
    }
    w.floorLoot.forEach((f, i) => {
      if (this.rolled.has(i)) return;
      if (Math.abs(f.x - p.x) > 70 || Math.abs(f.z - p.z) > 70) return;
      this.rolled.add(i);
      const rng = makeRng(hash32(w.seed, i, 777));
      if (rng.next() > (f.chance ?? 1)) return;
      const stacks = generateLoot(f.loot, rng, { scavenging: p.skillLevel('scavenging'), day: g.time.day, size: 3 });
      // f.x / f.z are continuous coordinates (normally a cell centre): scatter inside that cell only
      const cx = Math.floor(f.x), cz = Math.floor(f.z);
      const jit = (v, c) => Math.min(c + 0.82, Math.max(c + 0.18, v + rng.range(-0.28, 0.28)));
      stacks.slice(0, 3).forEach((s) => this.add(s, jit(f.x, cx), f.y + 0.02, jit(f.z, cz), { settled: false }));
    });
  }

  /** Container descriptor for the inventory "Ground" panel. */
  floorDesc() {
    const p = this.game.player;
    const near = this.near(p.x, p.y, p.z, 2.3).sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2)).slice(0, 18);
    const slots = near.map((it) => it.stack);
    while (slots.length < Math.max(12, near.length + 4)) slots.push(null);
    const desc = {
      key: 'floor', name: 'Ground', kind: 'floor', slots,
      onChange: () => {
        // removed stacks -> remove entities; new stacks -> drop at feet
        const present = new Set(desc.slots.filter(Boolean));
        for (const it of near) if (!present.has(it.stack)) this.remove(it);
        const known = new Set(near.map((it) => it.stack));
        for (const s of desc.slots) if (s && !known.has(s)) { const it = this.dropAt(s, p.x, p.y, p.z); near.push(it); known.add(s); }
      },
    };
    return desc;
  }

  update(dt) {
    const g = this.game, w = g.world, cam = g.renderer.camera;
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 1.5; this.rollNearby(); }
    const p = g.player;
    const t = g.clock;
    this.supportT = (this.supportT || 0) - dt;
    const checkSupport = this.supportT <= 0;
    if (checkSupport) this.supportT = 1;
    for (const it of this.items) {
      const dx = it.x - p.x, dz = it.z - p.z;
      const near = dx * dx + dz * dz < 45 * 45;
      // the table / crate under a resting item was broken: let it fall again
      if (checkSupport && it.settled && near && it.y > 0.1 && supportBelow(w, it.x, it.y, it.z, it.y - 0.1) === null) { it.settled = false; it.vy = 0; }
      if (!it.settled) {
        it.vy -= 18 * dt;
        let ny = it.y + it.vy * dt;
        if (it.vy <= 0) {
          // land on the real top of whatever is below (floor, table, counter, bed)
          const top = supportBelow(w, it.x, it.y, it.z, ny - 1);
          if (top !== null && ny <= top + 0.02) { ny = top + 0.02; it.vy = 0; it.settled = true; }
        } else if (SOLID[w.get(Math.floor(it.x), Math.floor(ny + 0.3), Math.floor(it.z))]) { it.vy = 0; ny = it.y; }
        if (ny < 0) { ny = 0; it.settled = true; }
        it.y = ny;
      }
      if (near && !it.mesh) {
        const mat = createEntityMaterial({ map: iconTexture(it.stack.id), alphaTest: 0.5, side: THREE.DoubleSide });
        it.mesh = new THREE.Mesh(PLANE, mat);
        g.renderer.scene.add(it.mesh);
        it.lightT = 0;
      } else if (!near && it.mesh) this.disposeMesh(it);
      if (it.mesh) {
        const bob = Math.sin(t * 2 + it.rot) * 0.04;
        it.mesh.position.set(it.x, it.y + 0.24 + bob, it.z);
        it.mesh.rotation.y = Math.atan2(cam.position.x - it.x, cam.position.z - it.z);
        it.lightT -= dt;
        if (it.lightT <= 0) {
          it.lightT = 0.5;
          const x = Math.floor(it.x), y = Math.floor(it.y + 0.3), z = Math.floor(it.z);
          setEntityLight(it.mesh.material, w.skyAt(x, y, z) / 15, w.blockLightAt(x, y, z) / 15);
        }
      }
    }
  }

  clear() {
    for (const it of this.items) if (it.mesh) this.disposeMesh(it);
    this.items = [];
  }

  toJSON() {
    return { items: this.items.map((it) => ({ s: it.stack, x: it.x, y: it.y, z: it.z })), rolled: [...this.rolled] };
  }
  load(d) {
    this.clear();
    if (!d) return;
    this.rolled = new Set(d.rolled || []);
    this.notesPlaced = this.rolled.has('notesDone') || false;
    for (const i of d.items || []) this.add(i.s, i.x, i.y, i.z, { settled: true });
    this.notesPlaced = true; // notes already in saved items
  }
}
