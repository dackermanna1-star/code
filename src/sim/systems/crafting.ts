import { itemDef } from '../../shared/data/items';
import { recipe } from '../../shared/data/recipes';
import { addToAny, makeStack, removeAll, type ItemStack } from '../../shared/sim/inventory';
import type { Game } from '../game';
import type { Player } from '../player';

export const MAX_QUEUE = 8;

/**
 * Server-side crafting queue. Ingredients are taken when a job is queued
 * (atomically), refunded on cancel or death; outputs go to the inventory or
 * drop at the player's feet if full.
 */
export class Crafting {
  constructor(private game: Game) {}

  /** Why a player can't craft `id` right now, or null. */
  check(p: Player, id: string, qty: number): string | null {
    const r = recipe(id);
    if (!r) return 'Unknown recipe';
    if (!r.known && !p.blueprints.has(id)) return 'Blueprint not learned — research it at a Research Table';
    if (r.bench > 0) {
      const tier = this.game.tiles.benchTierNear(p.x, p.y, p.z);
      if (tier < r.bench) return `Requires a Workbench Level ${r.bench} nearby`;
    }
    if (p.craftQueue.length >= MAX_QUEUE) return 'Crafting queue is full';
    const need = r.ing.map(([k, n]) => [k, n * qty] as [string, number]);
    const inv = p.inv.all();
    for (const [k, n] of need) {
      let have = 0;
      for (const c of inv) for (const s of c.slots) if (s?.id === k) have += s.n;
      if (have < n) return `Missing ${n - have} ${itemDef(k).name}`;
    }
    return null;
  }

  request(p: Player, id: string, qty: number) {
    qty = Math.max(1, Math.min(100, Math.floor(qty)));
    const err = this.check(p, id, qty);
    if (err) return this.game.msg(p, err, 'error');
    const r = recipe(id)!;
    const need = r.ing.map(([k, n]) => [k, n * qty] as [string, number]);
    if (!removeAll(p.inv.all(), need)) return this.game.msg(p, 'Missing ingredients', 'error');
    const time = r.time / Math.max(0.01, this.game.config.craftSpeed);
    p.craftQueue.push({ id, n: qty, total: qty, left: time, ing: r.ing });
  }

  cancel(p: Player, idx: number) {
    const job = p.craftQueue[idx];
    if (!job) return;
    p.craftQueue.splice(idx, 1);
    for (const [k, n] of job.ing) this.game.entities.give(p, k, n * job.n);
  }

  /**
   * On death everything queued is refunded into the inventory (it then goes
   * into the corpse). Returns refunds that did not fit, which the caller must
   * put in the corpse or on the ground — nothing is ever destroyed.
   */
  cancelAll(p: Player): ItemStack[] {
    const overflow: ItemStack[] = [];
    while (p.craftQueue.length) {
      const job = p.craftQueue.pop()!;
      for (const [k, n] of job.ing) {
        const left = addToAny(p.inv.all(), makeStack(k, n * job.n));
        if (left > 0) overflow.push(makeStack(k, left));
      }
    }
    return overflow;
  }

  tick(dt: number) {
    for (const p of this.game.players.values()) {
      if (!p.alive || !p.craftQueue.length) continue;
      const job = p.craftQueue[0];
      job.left -= dt;
      if (job.left > 0) continue;
      const r = recipe(job.id)!;
      this.game.entities.give(p, r.out, r.count);
      this.game.fx('crafted', p.x, p.y + 1, p.z, 10);
      job.n--;
      if (job.n > 0) job.left = r.time / Math.max(0.01, this.game.config.craftSpeed);
      else p.craftQueue.shift();
    }
  }

  replicate(p: Player) {
    const sig = p.craftQueue.map((j) => `${j.id}:${j.n}:${Math.ceil(j.left)}`).join('|');
    if (sig === p.craftSig) return;
    p.craftSig = sig;
    p.link?.send({ t: 'craftq', q: p.craftQueue.map((j) => ({ id: j.id, n: j.n, left: j.left, total: recipe(j.id)!.time / this.game.config.craftSpeed })) });
  }
}
