// Items lying in the world: drops, floor loot from the generator, notes. Rendered as small billboards.
import * as THREE from 'three';
import { getItemDef, createItem } from '../items/items.js';
import { getItemIcon } from '../items/icons.js';
import { generateLoot } from '../items/loot.js';
import { createEntityMaterial, setEntityLight } from '../render/materials.js';
import { makeRng, hash32 } from '../core/rng.js';
import { SOLID } from '../world/blocks.js';

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
        this.add(createItem('note', { data: { noteId: n.noteId } }), n.x + 0.5, n.y + 0.05, n.z + 0.5, { settled: true });
      });
    }
    w.floorLoot.forEach((f, i) => {
      if (this.rolled.has(i)) return;
      if (Math.abs(f.x - p.x) > 70 || Math.abs(f.z - p.z) > 70) return;
      this.rolled.add(i);
      const rng = makeRng(hash32(w.seed, i, 777));
      if (rng.next() > (f.chance ?? 1)) return;
      const stacks = generateLoot(f.loot, rng, { scavenging: p.skillLevel('scavenging'), day: g.time.day, size: 3 });
      stacks.slice(0, 3).forEach((s) => this.add(s, f.x + 0.5 + rng.range(-0.3, 0.3), f.y + 0.02, f.z + 0.5 + rng.range(-0.3, 0.3), { settled: false }));
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
    for (const it of this.items) {
      const dx = it.x - p.x, dz = it.z - p.z;
      const near = dx * dx + dz * dz < 45 * 45;
      if (!it.settled) {
        it.vy -= 18 * dt;
        let ny = it.y + it.vy * dt;
        if (SOLID[w.get(Math.floor(it.x), Math.floor(ny), Math.floor(it.z))]) {
          ny = Math.floor(ny) + 1.02;
          // partial blocks (tables): rest on top of their box roughly
          it.vy = 0; it.settled = true;
        }
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
