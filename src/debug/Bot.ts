import type { Game } from '../game/Game';
import { DONENESS, Doneness, PattyId, isPatty } from '../food/Ingredients';

/**
 * Debug autopilot used by the automated playtests: takes orders, grills to
 * the right doneness, builds tickets and serves. `skill` < 1 adds mistakes.
 */
export class Bot {
  private t = 0;
  private assigned = new Map<number, Doneness>(); // grill slot index -> target
  private lastAdd = 0;
  enabled = true;

  constructor(private g: Game, private skill = 1) {
    g.engine.onUpdate((dt) => this.tick(dt), 5);
  }

  private tick(dt: number) {
    if (!this.enabled || (this.g.state !== 'day' && this.g.state !== 'closing')) return;
    this.t += dt;
    const g = this.g;
    // 1) orders
    if (g.customers.atCounter && !g.stations.order.taking) g.stations.order.takeOrder();
    // 2) grill
    const grill = g.stations.grill;
    const st = grill.botPatties();
    const needs: { kind: PattyId; doneness: Doneness }[] = [];
    for (const o of g.orders.open) {
      if (o.status !== 'waiting' && o.status !== 'building') continue;
      for (const l of o.layers) if (l.doneness && isPatty(l.id)) needs.push({ kind: l.id as PattyId, doneness: l.doneness });
    }
    // subtract what's already cooking or waiting in the warmer
    const supply = new Map<string, number>();
    for (const p of st) supply.set(p.kind + (p.target ?? ''), (supply.get(p.kind + (p.target ?? '')) ?? 0) + 1);
    for (const w of g.warmer.items) if (w) supply.set(w.kind + (w.target ?? ''), (supply.get(w.kind + (w.target ?? '')) ?? 0) + 1);
    // patties still needed by orders already partially built are ignored for simplicity
    for (const n of needs) {
      const key = n.kind + n.doneness;
      if ((supply.get(key) ?? 0) > 0) {
        supply.set(key, (supply.get(key) ?? 0) - 1);
        continue;
      }
      if (grill.botPlace(n.kind, n.doneness)) supply.set(key, 0);
      break;
    }
    for (const p of st) {
      if (p.busy || !p.target) continue;
      const tgt = DONENESS[p.target].target + (this.skill < 1 ? (Math.random() - 0.5) * 0.2 * (1 - this.skill) : 0);
      const down = p.flipped ? p.b : p.a;
      const up = p.flipped ? p.a : p.b;
      if (down >= tgt && up < tgt - 0.05) grill.flip(p);
      else if (down >= tgt && up >= tgt - 0.05) grill.botMoveToWarmer(p);
    }
    // 3) build
    const build = g.stations.build;
    const order = g.orders.activeBuild;
    if (order && build.stack && !build.stack.complete && this.t - this.lastAdd > 0.7) {
      const stack = build.stack;
      let next: string;
      if (!stack.hasBottom) next = order.bun;
      else {
        const idx = stack.layerCount;
        next = idx < order.layers.length ? order.layers[idx].id : order.bun;
      }
      const layer = stack.hasBottom ? order.layers[stack.layerCount] : undefined;
      if (build.botAdd(next as any, layer?.doneness)) this.lastAdd = this.t;
    }
    // 4) serve
    if (!g.stations.serve.serving) {
      const r = g.orders.ready.find((x) => g.stations.serve.canServe(x));
      if (r) g.stations.serve.serve(r.order.id);
    }
  }
}
