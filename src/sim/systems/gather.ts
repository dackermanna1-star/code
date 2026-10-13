import { tryItemDef } from '../../shared/data/items';
import { dirFromAngles } from '../../shared/math';
import { B, blockDef, type BlockDef } from '../../shared/world/blocks';
import { raycastVoxels } from '../../shared/world/raycast';
import type { Game } from '../game';
import type { Player } from '../player';
import { Corpse } from './entities';

interface BlockDamage {
  dmg: number;
  at: number;
}

const HAND = { damage: 4, interval: 0.55, range: 2.2 };

/**
 * Melee swings: hits creatures/players, harvests carcasses, damages
 * structures and deployables, and gathers terrain. Gathering pays out
 * resources per hit in proportion to damage dealt (Rust style), with a
 * finishing bonus for proper tools and whole-tree felling.
 */
export class Gather {
  private damage = new Map<string, BlockDamage>();
  stats = { blocksBroken: 0, swings: 0 };

  constructor(private game: Game) {}

  swing(p: Player, yaw: number, pitch: number) {
    const held = p.held();
    const def = held ? tryItemDef(held.id) : undefined;
    if (def && (def.key === 'hammer' || def.key === 'building_plan')) return;
    const w = def?.weapon;
    if (w && w.kind !== 'melee') return;
    const interval = w?.interval ?? HAND.interval;
    const now = this.game.now;
    if (now - p.lastSwing < interval * 0.85) return;
    p.lastSwing = now;
    p.yaw = yaw;
    p.pitch = pitch;
    this.stats.swings++;
    const range = w?.range ?? HAND.range;
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const rewind = Math.min(0.3, p.rtt / 2 + 0.1);
    const ent = this.game.combat.rayEntity(p, ex, ey, ez, d.x, d.y, d.z, range, (e) => e.kind === 'p' || e.kind === 'a' || (e instanceof Corpse && !!e.species), rewind);
    const blk = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, range);
    this.game.survival.exert(p, 0.4);
    if (ent && (!blk || ent.dist < blk.dist)) {
      if (ent.e instanceof Corpse) this.harvestCarcass(p, ent.e);
      else this.game.combat.melee(p, ent, w?.damage ?? HAND.damage, w?.damageType ?? 'melee', w?.bleedChance ?? 0);
      if (held) this.game.combat.wearItem(p, held);
      return;
    }
    if (!blk) return;
    const bd = blockDef(blk.id);
    const meleeDamage = w?.damage ?? HAND.damage;
    if (bd.structureTier !== undefined || bd.door) {
      const piece = this.game.building.pieceAt(blk.x, blk.y, blk.z);
      if (piece) {
        const eff = this.game.building.damagePiece(piece, meleeDamage, 'melee', p);
        this.game.fx(eff > 0 ? 'hitstruct' : 'clang', blk.x + 0.5, blk.y + 0.5, blk.z + 0.5, 30, { s: bd.sound });
        if (eff > 0) p.link?.send({ t: 'hitmark', structure: true });
        if (held) this.game.combat.wearItem(p, held);
      }
      return;
    }
    if (bd.deployable) {
      const t = this.game.tiles.at(blk.x, blk.y, blk.z);
      if (t) {
        this.game.tiles.damage(t, meleeDamage, 'melee', p);
        this.game.fx('hitstruct', blk.x + 0.5, blk.y + 0.5, blk.z + 0.5, 30, { s: bd.sound });
        if (held) this.game.combat.wearItem(p, held);
      }
      return;
    }
    this.gatherBlock(p, blk.x, blk.y, blk.z, bd);
  }

  private gatherBlock(p: Player, x: number, y: number, z: number, bd: BlockDef) {
    if (!Number.isFinite(bd.hardness)) {
      this.game.fx('clang', x + 0.5, y + 0.5, z + 0.5, 20, { s: bd.sound });
      return;
    }
    if (this.game.building.isBlocked(p, x + 0.5, y + 0.5, z + 0.5)) {
      this.game.msg(p, 'Building blocked — this land is claimed', 'error');
      return;
    }
    const held = p.held();
    const tool = held ? tryItemDef(held.id)?.tool : undefined;
    let dmg: number, gatherMult: number;
    if (tool) {
      dmg = tool.damage * (tool.effective[bd.tool] ?? tool.effective.any ?? 0.3);
      gatherMult = tool.gather[bd.gather] ?? 0.3;
    } else {
      const soft = bd.gather === 'plant' || bd.gather === 'soil' || bd.tool === 'any';
      dmg = HAND.damage * (soft ? 1 : 0.35);
      gatherMult = bd.gather === 'plant' ? 1 : 0.3;
    }
    const key = `${x},${y},${z}`;
    const st = this.damage.get(key) ?? { dmg: 0, at: 0 };
    const prev = st.dmg / bd.hardness;
    st.dmg = Math.min(bd.hardness, st.dmg + dmg);
    st.at = this.game.now;
    const frac = st.dmg / bd.hardness;
    const rate = this.game.config.gatherRate;
    for (const yld of bd.yields ?? []) {
      const total = yld.fixed ? yld.amount : yld.amount * gatherMult * rate;
      const n = Math.floor(total * frac + 1e-9) - Math.floor(total * prev + 1e-9);
      if (n > 0) this.giveGathered(p, yld.item, n);
    }
    if (held) this.game.combat.wearItem(p, held);
    if (frac >= 1) {
      this.damage.delete(key);
      this.breakBlock(x, y, z);
      // Finishing bonus for proper tools on stone and ore.
      if (tool && held?.id !== 'rock' && (bd.gather === 'ore' || bd.gather === 'stone')) {
        for (const yld of bd.yields ?? []) {
          const bonus = Math.floor(yld.amount * gatherMult * rate * 0.2);
          if (bonus > 0) this.giveGathered(p, yld.item, bonus);
        }
      }
      if (bd.tree === 'log') this.fellTree(p, x, y, z, bd, gatherMult * rate);
      this.stats.blocksBroken++;
      this.game.fx('break', x + 0.5, y + 0.5, z + 0.5, 30, { s: bd.sound, a: bd.id });
    } else {
      this.damage.set(key, st);
      this.game.fx('hitblock', x + 0.5, y + 0.5, z + 0.5, 30, { s: bd.sound, a: Math.round(frac * 100) / 100 });
    }
  }

  private giveGathered(p: Player, item: string, n: number) {
    this.game.entities.give(p, item, n);
    p.link?.send({ t: 'gather', item, n });
  }

  /** Remove a block and anything that needed it for support. */
  breakBlock(x: number, y: number, z: number) {
    const w = this.game.world;
    w.set(x, y, z, B.air);
    this.game.tiles.checkSupport(x, y + 1, z);
  }

  /** Breaking the base log fells the whole tree; remaining logs pay out at 50%. */
  private fellTree(p: Player, x: number, y: number, z: number, bd: BlockDef, mult: number) {
    const w = this.game.world;
    const below = blockDef(w.getBlock(x, y - 1, z));
    if (below.tree === 'log') return; // not the base
    const logId = bd.id;
    const leafId = logId === B.oak_log ? B.oak_leaves : logId === B.pine_log ? B.pine_leaves : B.birch_leaves;
    const logs: Array<[number, number, number]> = [];
    const seen = new Set<string>();
    const stack: Array<[number, number, number]> = [[x, y + 1, z]];
    while (stack.length && logs.length < 48) {
      const [cx, cy, cz] = stack.pop()!;
      const k = `${cx},${cy},${cz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(cx - x) > 2 || Math.abs(cz - z) > 2 || cy - y > 24) continue;
      if (w.getBlock(cx, cy, cz) !== logId) continue;
      logs.push([cx, cy, cz]);
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) stack.push([cx + dx, cy + dy, cz + dz]);
    }
    if (!logs.length) return;
    let leaves = 0;
    for (const [lx, ly, lz] of logs) {
      w.set(lx, ly, lz, B.air);
      for (let dy = -2; dy <= 2; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (w.getBlock(lx + dx, ly + dy, lz + dz) === leafId) {
          w.set(lx + dx, ly + dy, lz + dz, B.air);
          leaves++;
        }
      }
    }
    for (const yld of bd.yields ?? []) {
      const n = Math.floor(yld.amount * mult * 0.5 * logs.length);
      if (n > 0) this.giveGathered(p, yld.item, n);
    }
    this.game.fx('treefall', x + 0.5, y + 2, z + 0.5, 60, { a: logs.length + leaves });
  }

  private harvestCarcass(p: Player, c: Corpse) {
    const held = p.held();
    const tool = held ? tryItemDef(held.id)?.tool : undefined;
    const dmg = tool ? tool.damage : HAND.damage;
    const mult = tool ? Math.max(tool.gather.wood ?? 0.5, 0.5) : 0.3;
    const total = c.harvestHp || 1;
    const before = (c as Corpse & { harvested?: number }).harvested ?? 0;
    const after = Math.min(total, before + dmg);
    (c as Corpse & { harvested?: number }).harvested = after;
    for (const [item, amount] of c.harvest) {
      const t = amount * mult * this.game.config.gatherRate * (tool ? 1.3 : 1);
      const n = Math.floor((t * after) / total) - Math.floor((t * before) / total);
      if (n > 0) this.giveGathered(p, item, n);
    }
    if (held) this.game.combat.wearItem(p, held);
    this.game.fx('hitflesh', c.x, c.y + 0.4, c.z, 25);
    if (after >= total) this.game.entities.remove(c);
  }

  /** Forget stale partial damage (blocks heal if left alone). */
  cleanup() {
    const now = this.game.now;
    for (const [k, v] of this.damage) if (now - v.at > 30) this.damage.delete(k);
  }
}
