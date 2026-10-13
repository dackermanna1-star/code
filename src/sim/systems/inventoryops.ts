import type { C2S, ContainerRef } from '../../shared/net/protocol';
import { moveItem, quickMove, type Container } from '../../shared/sim/inventory';
import type { Game } from '../game';
import type { Player } from '../player';

type InvMsg = Extract<C2S, { t: 'inv' }>;

/**
 * Validated inventory operations. The client only *requests* moves; the
 * server resolves container references against what the player may access
 * right now (own inventory + the currently open, in-range, unlocked loot).
 */
export class InventoryOps {
  constructor(private game: Game) {}

  private resolve(p: Player, ref: ContainerRef): Container | null {
    switch (ref) {
      case 'main': return p.inv.main;
      case 'belt': return p.inv.belt;
      case 'wear': return p.inv.wear;
      case 'loot': return this.game.tiles.lootContainer(p);
      default: return null;
    }
  }

  handle(p: Player, m: InvMsg) {
    if (!Array.isArray(m.from) || m.from.length !== 2) return;
    const src = this.resolve(p, m.from[0]);
    const si = Math.floor(Number(m.from[1]));
    if (!src || !(si >= 0 && si < src.size)) return;
    let res: { ok: boolean; error?: string } = { ok: true };
    if (m.op === 'move') {
      if (!Array.isArray(m.to) || m.to.length !== 2) return;
      const dst = this.resolve(p, m.to[0]);
      const di = Math.floor(Number(m.to[1]));
      if (!dst || !(di >= 0 && di < dst.size)) return;
      const n = m.n === undefined ? undefined : Math.floor(Number(m.n));
      res = moveItem(src, si, dst, di, n);
    } else if (m.op === 'quick') {
      const loot = this.game.tiles.lootContainer(p);
      let targets: Container[];
      if (src === loot) targets = [p.inv.main, p.inv.belt];
      else if (src === p.inv.wear) targets = [p.inv.main, p.inv.belt];
      else if (loot) targets = [loot];
      else if (src === p.inv.main) targets = [p.inv.belt];
      else targets = [p.inv.main];
      // clothing goes to wear slots first when quick-moved from bags
      const s = src.get(si);
      if (s && src !== p.inv.wear && !loot && p.inv.wear.accepts(s, p.inv.wear.slots.findIndex((_, i) => p.inv.wear.accepts(s, i)))) targets = [p.inv.wear, ...targets];
      res = quickMove(src, si, targets);
    } else if (m.op === 'drop') {
      const s = src.get(si);
      if (!s) return;
      const req = m.n === undefined ? s.n : Math.floor(Number(m.n));
      if (!Number.isFinite(req) || req < 1) return;
      const n = Math.min(s.n, req);
      const stack = { ...s, n };
      s.n -= n;
      if (s.n <= 0) src.slots[si] = null;
      src.touch();
      const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
      this.game.entities.dropItem(stack, p.x + fwdX * 0.8, p.y + 1.2, p.z + fwdZ * 0.8);
    }
    if (!res.ok && res.error) this.game.msg(p, res.error, 'error');
    if (src === p.inv.wear || m.op === 'move') p.ver++;
  }

  replicate(p: Player) {
    const view = this.game.tiles.lootView(p);
    const sig = `${p.inv.main.rev}:${p.inv.belt.rev}:${p.inv.wear.rev}:${p.sel}:${view ? JSON.stringify(view) : '-'}`;
    if (sig === p.invSig) return;
    p.invSig = sig;
    p.link?.send({ t: 'inv', main: p.inv.main.toJSON(), belt: p.inv.belt.toJSON(), wear: p.inv.wear.toJSON(), sel: p.sel, loot: view });
  }
}
