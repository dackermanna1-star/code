// Damage accounting for the HUD "repair bill" (docs/ARCHITECTURE.md §4, brief item 9).
// Per assembly: fraction = clamp(brokenVolume/initialVolume + 0.8·brokenBonds/initialBonds
// + 0.5·min(1, 4·dentVolume/initialVolume), 0, 1). Increases are converted to dollars
// (value × Δfraction) and emitted as `damage` events.
// brokenVolume counts every bit of material once (Part.counted): what a fracture breaks out of
// a part, fracture fragments breaking away, pieces lost off the balcony — debris breaking again
// adds nothing. brokenBonds counts blueprint bonds only (Bond.original), matching initialBonds;
// bonds created between fracture cells at runtime don't inflate the share.

import type { Assembly } from "./types.ts";
import type { World } from "./world.ts";

/** Fraction increments below this are accumulated until they add up (no event spam). */
const MIN_REPORT = 0.002;

export class Accounting {
  private readonly w: World;
  private readonly dirty = new Set<Assembly>();
  totalValue = 0;
  valueDestroyed = 0;

  constructor(w: World) {
    this.w = w;
  }

  register(asm: Assembly): void {
    this.totalValue += asm.value;
  }

  unregister(asm: Assembly): void {
    this.totalValue = Math.max(0, this.totalValue - asm.value);
    this.dirty.delete(asm);
  }

  markDirty(asm: Assembly): void {
    if (asm.alive) this.dirty.add(asm);
  }

  static fraction(asm: Assembly): number {
    const vol = asm.initialVolume > 0 ? asm.brokenVolume / asm.initialVolume : 0;
    const bonds = asm.initialBonds > 0 ? asm.brokenBonds / asm.initialBonds : 0;
    const dents = asm.initialVolume > 0 ? Math.min(1, (4 * asm.dentVolume) / asm.initialVolume) : 0;
    const f = vol + 0.8 * bonds + 0.5 * dents;
    return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
  }

  update(): void {
    if (!this.dirty.size) return;
    for (const asm of this.dirty) {
      const f = Math.max(asm.fraction, Accounting.fraction(asm));
      asm.fraction = f;
      const delta = f - asm.reported;
      // small increments accumulate in (fraction - reported) until they are worth reporting
      if (delta <= 0 || (delta < MIN_REPORT && f < 1)) {
        this.dirty.delete(asm);
        continue;
      }
      const valueLost = asm.value * delta;
      asm.reported = f;
      this.valueDestroyed += valueLost;
      this.w.events.emit("damage", { assembly: asm.name, type: asm.type, valueLost, fraction: f });
      this.dirty.delete(asm);
    }
  }
}
