// Static dead bodies placed by the world generator (dead survivors, soldiers). Lootable.
import { createCorpseVisual } from './zombie/ZombieModel.js';
import { generateLoot } from '../items/loot.js';
import { makeRng, hash32 } from '../core/rng.js';

export class Corpses {
  constructor(game) {
    this.game = game;
    this.list = game.world.corpses.map((c, i) => ({ ...c, idx: i, visual: null, items: null }));
    this.t = 0;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.7;
    const g = this.game, p = g.player, w = g.world;
    for (const c of this.list) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 70 && !c.visual) {
        c.visual = createCorpseVisual({ outfit: c.outfit || 'civilian', seed: hash32(c.idx, 31) });
        // generator positions are continuous world coordinates (cell centres), not cell corners
        c.visual.root.position.set(c.x, c.y, c.z);
        c.visual.root.rotation.y = c.yaw || 0;
        g.renderer.scene.add(c.visual.root);
        const x = Math.floor(c.x), y = Math.floor(c.y + 0.5), z = Math.floor(c.z);
        c.visual.setLight(w.skyAt(x, y, z) / 15, w.blockLightAt(x, y, z) / 15);
        if (!c.blooded) { c.blooded = true; g.fx?.bloodPool?.({ x: c.x, y: c.y + 0.02, z: c.z }, 1.1); }
      } else if (d > 95 && c.visual) {
        g.renderer.scene.remove(c.visual.root);
        c.visual.dispose();
        c.visual = null;
      }
    }
  }

  near(x, y, z, r) {
    return this.list.filter((c) => Math.hypot(c.x - x, c.z - z) < r && Math.abs(c.y - y) < 2);
  }

  desc(c) {
    if (!c.items) {
      const g = this.game;
      c.items = new Array(8).fill(null);
      const stacks = generateLoot(c.loot || 'corpse_civilian', makeRng(hash32(g.world.seed, c.idx, 1313)), { scavenging: g.player.skillLevel('scavenging'), day: g.time.day, size: 8 });
      stacks.slice(0, 8).forEach((s, i) => { c.items[i] = s; });
    }
    const label = { military: 'Dead Soldier', police: 'Dead Officer', survivor: 'Dead Survivor' }[c.outfit] || 'Corpse';
    return { key: 'corpse:' + c.idx, name: label, kind: 'corpse', slots: c.items };
  }

  clear() {
    for (const c of this.list) if (c.visual) { this.game.renderer.scene.remove(c.visual.root); c.visual.dispose(); c.visual = null; }
  }

  toJSON() { return this.list.filter((c) => c.items).map((c) => ({ i: c.idx, items: c.items })); }
  load(arr) { for (const d of arr || []) if (this.list[d.i]) this.list[d.i].items = d.items; }
}
