/**
 * Opponent model: what one fighter has learned about the other's habits during this fight.
 *
 * All statistics are exponentially-decayed counts (recent behaviour matters more), with Laplace
 * smoothing so early estimates stay humble. The learning rate scales with the fighter's
 * adaptivity trait — a Tactician picks up on patterns far faster than a Berserker.
 */

export class Habit<K extends string> {
  private counts = new Map<K, number>();
  private total = 0;
  constructor(private keys: readonly K[], private decay: number) {}

  observe(k: K, weight = 1): void {
    // Decay everything slightly, then add.
    for (const key of this.keys) this.counts.set(key, (this.counts.get(key) ?? 0) * this.decay);
    this.total = this.total * this.decay + weight;
    this.counts.set(k, (this.counts.get(k) ?? 0) + weight);
  }

  /** Smoothed probability estimate. */
  p(k: K, prior = 1): number {
    const n = this.keys.length;
    return ((this.counts.get(k) ?? 0) + prior / n) / (this.total + prior);
  }

  /** Raw (decayed) evidence mass. */
  get n(): number {
    return this.total;
  }

  /** Most likely key and its probability. */
  top(): [K, number] {
    let best = this.keys[0], bp = -1;
    for (const k of this.keys) {
      const p = this.p(k);
      if (p > bp) {
        bp = p;
        best = k;
      }
    }
    return [best, bp];
  }
}

export type DefResponse = 'block' | 'parry' | 'dodge' | 'jump' | 'attack' | 'vanish' | 'hit';
export type TeleportPlace = 'behind' | 'above' | 'away' | 'front';
export type WakeOption = 'neutral' | 'rollF' | 'rollB' | 'tech';
export type OpenerKind = 'poke' | 'thrust' | 'heavy' | 'sweep' | 'throw' | 'jumpin' | 'teleport' | 'projectile' | 'ability';
export type StruggleInput = 'push' | 'hold' | 'slip';

export class OpponentModel {
  /** How the opponent responds when I attack them up close. */
  defense: Habit<DefResponse>;
  /** When blocking, low or high? */
  blockHeight: Habit<'low' | 'high'>;
  /** Where they reappear after teleporting. */
  teleport: Habit<TeleportPlace>;
  /** Wake-up choices. */
  wake: Habit<WakeOption>;
  /** What they open exchanges with. */
  opener: Habit<OpenerKind>;
  /** Blade-lock / struggle inputs. */
  struggle: Habit<StruggleInput>;
  /** Did they attack when I stood at the edge of their range? */
  edgeAggression: Habit<'attack' | 'wait'>;
  /** Did they respond to my projectiles by blocking, jumping, dodging, reflecting or getting hit? */
  vsProjectile: Habit<'block' | 'jump' | 'dodge' | 'reflect' | 'cut' | 'hit'>;
  /** Combo hit count at which they burst (moving average). */
  burstAt = 0;
  burstSeen = 0;
  /** Times we've seen specific abilities. */
  seenAbility = new Map<string, number>();
  /** Opponent's feint frequency on their heavies. */
  feints: Habit<'feint' | 'commit'>;
  /** Bigram of opponent action categories for next-action prediction. */
  private bigram = new Map<string, Habit<OpenerKind>>();
  private lastCat: OpenerKind | null = null;
  /** Throw attempts per close-range exchange. */
  throwRate: Habit<'throw' | 'strike'>;

  constructor(public learningRate: number) {
    const d = 1 - 0.03 * (0.4 + learningRate);
    this.defense = new Habit(['block', 'parry', 'dodge', 'jump', 'attack', 'vanish', 'hit'], d);
    this.blockHeight = new Habit(['low', 'high'], d);
    this.teleport = new Habit(['behind', 'above', 'away', 'front'], d);
    this.wake = new Habit(['neutral', 'rollF', 'rollB', 'tech'], d);
    this.opener = new Habit(['poke', 'thrust', 'heavy', 'sweep', 'throw', 'jumpin', 'teleport', 'projectile', 'ability'], d);
    this.struggle = new Habit(['push', 'hold', 'slip'], d);
    this.edgeAggression = new Habit(['attack', 'wait'], d);
    this.vsProjectile = new Habit(['block', 'jump', 'dodge', 'reflect', 'cut', 'hit'], d);
    this.feints = new Habit(['feint', 'commit'], d);
    this.throwRate = new Habit(['throw', 'strike'], d);
  }

  /** Evidence weight: how much a fighter trusts the model (grows with observations & adaptivity). */
  confidence(h: { n: number }): number {
    return Math.min(1, h.n / (6 - 3 * this.learningRate)) * (0.4 + 0.6 * this.learningRate);
  }

  observeAction(cat: OpenerKind): void {
    if (this.lastCat) {
      let h = this.bigram.get(this.lastCat);
      if (!h) {
        h = new Habit(['poke', 'thrust', 'heavy', 'sweep', 'throw', 'jumpin', 'teleport', 'projectile', 'ability'], 0.95);
        this.bigram.set(this.lastCat, h);
      }
      h.observe(cat);
    }
    this.lastCat = cat;
  }

  /** Predict the opponent's next action category from their last one. */
  predictNext(): [OpenerKind, number] | null {
    if (!this.lastCat) return null;
    const h = this.bigram.get(this.lastCat);
    if (!h || h.n < 2) return null;
    return h.top();
  }

  sawAbility(id: string): void {
    this.seenAbility.set(id, (this.seenAbility.get(id) ?? 0) + 1);
  }

  seen(id: string): number {
    return this.seenAbility.get(id) ?? 0;
  }

  observeBurst(combo: number): void {
    this.burstSeen++;
    this.burstAt = this.burstAt === 0 ? combo : this.burstAt * 0.6 + combo * 0.4;
  }
}

/** Per-plan reward memory (multiplicative-weights style). */
export class TacticMemory {
  private value = new Map<string, number>();
  private uses = new Map<string, number>();
  constructor(private lr: number) {}
  update(plan: string, reward: number): void {
    const v = this.value.get(plan) ?? 0;
    const n = (this.uses.get(plan) ?? 0) + 1;
    this.uses.set(plan, n);
    this.value.set(plan, v + (reward - v) * Math.max(this.lr, 1 / n));
  }
  get(plan: string): number {
    return this.value.get(plan) ?? 0;
  }
  count(plan: string): number {
    return this.uses.get(plan) ?? 0;
  }
}
