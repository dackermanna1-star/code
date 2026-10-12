// SpellCastingEngine: a faithful port of Noita's data/scripts/gun/gun.lua (deck / hand / discard model).
//
// Mapping to gun.lua:
//   Wand.cast()             _start_shot + _play_permanent_card (Always Casts) + _draw_actions_for_shot + _handle_reload
//   CastSession.drawActions draw_actions(n, instant_reload_if_empty)
//   CastSession.drawAction  draw_action(instant_reload_if_empty)
//   CastSession.playAction  play_action(action)
//   CastSession.addTrigger  add_projectile_trigger_*(): draw_shot(create_shot(n), true) into a fresh shot state
//   Wand.orderDeck          order_deck()          Wand.moveHandToDiscarded  move_hand_to_discarded()
//   Wand.currentReloadTime  current_reload_time   (global recharge accumulator; resets after each reload)
//
// Rules worth knowing (research notes section 1):
//   * The root draws `actionsPerRound` cards and never wraps; spell-initiated draws wrap and force a reload.
//   * A card the wand cannot afford, or with 0 uses, is discarded and the next card is drawn in its place
//     (never causing a wrap). Mana is subtracted at draw time, so trigger payloads are paid up front.
//   * Cast delay = wand castDelay + root-state cast delay changes (payloads ignored); <= 0 becomes 1 frame;
//     not applied at all when the cast produced no projectile. Recharge = max(0, current_reload_time).
//     Both timers run concurrently, so the wait at the end of the deck is max(castDelay, recharge).
//   * Uses are spent only on casts that produced a projectile; a card reaching 0 leaves the cycle.

import { SPELLS } from './spells';
import { defaultShotState } from './shotState';
import type { ActionContext, CastResult, ProjectileSpawn, Shot, ShotState, SpellDef, SpellInstance, WandStats } from './types';

export { defaultShotState, formationAngles, countProjectiles, addEffect } from './shotState';

/** A card in one of the wand's piles (gun.lua action clone). */
export interface DeckCard {
  readonly id: string;
  readonly def: SpellDef;
  /** The live inventory instance: uses are decremented here, so Wand.spells always shows current charges. */
  readonly inst: SpellInstance;
  /** Slot index in Wand.spells (gun.lua deck_index); -1 for Always Cast cards. */
  readonly slot: number;
  /** Always Cast card (permanently_attached): free, unlimited, never enters the discard pile. */
  readonly permanent: boolean;
}

/** Spell types whose play counts as "the cast produced a projectile" (gun.lua got_projectiles). */
const PROJECTILE_TYPES: ReadonlySet<string> = new Set(['projectile', 'static', 'material']);
/** Types that consume a charge even when the cast produced no projectile. */
const ALWAYS_CONSUME_TYPES: ReadonlySet<string> = new Set(['other', 'utility']);

const EPS = 1e-9;

/** Per-cast interpreter state; it is the ActionContext handed to every spell action. */
class CastSession implements ActionContext {
  /** Shot whose state/projectiles spell actions currently modify (root, or a trigger payload). */
  private current: Shot;
  /** gun.lua playing_permanent_card (global for the whole play of an Always Cast card, nested draws included). */
  permanent = false;
  mana: number;
  /** A root draw found the deck empty (gun.lua `reloading`): stop drawing. */
  reloading = false;
  /** A spell-initiated draw wrapped the deck (gun.lua `start_reload`). */
  startReload = false;
  gotProjectiles = false;
  readonly skippedForMana: string[] = [];
  readonly drawn: string[] = [];

  constructor(
    private readonly wand: Wand,
    private readonly rng: () => number,
    root: Shot,
  ) {
    this.current = root;
    this.mana = wand.mana;
  }

  get c(): ShotState {
    return this.current.state;
  }
  set c(state: ShotState) {
    this.current.state = state;
  }

  // ---- ActionContext (arrow properties so actions may destructure them safely)

  readonly random = (): number => this.rng();

  readonly addProjectile = (id: string): void => {
    this.current.projectiles.push({ projectile: id });
  };

  readonly addTrigger = (id: string, kind: 'hit' | 'timer' | 'death', drawCount: number, timerFrames?: number): void => {
    // BeginProjectile: the carrier belongs to the current (outer) shot.
    const payload: Shot = { state: defaultShotState(), projectiles: [] };
    const spawn: ProjectileSpawn = {
      projectile: id,
      trigger: kind === 'timer' ? { kind, timerFrames: timerFrames ?? 0, payload } : { kind, payload },
    };
    this.current.projectiles.push(spawn);
    // draw_shot(create_shot(drawCount), true): the payload is drawn now, into its own fresh shot state.
    const outer = this.current;
    this.current = payload;
    try {
      this.drawActions(drawCount, true);
    } finally {
      this.current = outer;
    }
  };

  readonly addReload = (deltaFrames: number): void => {
    this.wand.currentReloadTime += deltaFrames;
  };

  readonly addMana = (amount: number): void => {
    this.mana += amount;
  };

  /** gun.lua draw_actions(how_many, instant_reload_if_empty). */
  readonly drawActions = (n: number, wrap: boolean): void => {
    // SPECIAL RULE: a permanently attached card calling draw_actions(1) draws nothing extra.
    if (this.permanent && n === 1) return;
    for (let i = 0; i < n; i++) {
      const ok = this.drawAction(wrap);
      if (!ok) {
        // Skip unaffordable / spent cards: keep drawing until one plays or the deck runs out (no wrap).
        while (this.wand.deck.length > 0) {
          if (this.drawAction(wrap)) break;
        }
      }
      if (this.reloading) return;
    }
  };

  /** gun.lua draw_action(). Returns false when the drawn card could not be played. */
  private drawAction(instantReloadIfEmpty: boolean): boolean {
    const w = this.wand;
    if (w.deck.length <= 0) {
      if (instantReloadIfEmpty) {
        w.moveDiscardedToDeck();
        w.orderDeck(this.rng);
        this.startReload = true;
      } else {
        this.reloading = true;
        return true;
      }
    }
    const card = w.deck.shift();
    if (!card) return true; // wrapped into an empty deck: nothing to play
    const cost = Math.max(0, card.def.mana); // negative mana (Add Mana) is refunded by the action itself
    if (cost > this.mana) {
      this.skippedForMana.push(card.id);
      w.discarded.push(card);
      return false;
    }
    if (card.inst.uses === 0) {
      w.discarded.push(card);
      return false;
    }
    this.mana -= cost;
    this.playAction(card);
    return true;
  }

  /** gun.lua play_action(). */
  playAction(card: DeckCard): void {
    this.wand.hand.push(card);
    this.drawn.push(card.id);
    card.def.action(this);
    if (PROJECTILE_TYPES.has(card.def.type)) this.gotProjectiles = true;
  }

  /** gun.lua _play_permanent_card(): an Always Cast, played at the front of the root shot for free. */
  playPermanentCard(id: string): void {
    const def = SPELLS[id];
    if (!def) return;
    this.permanent = true;
    try {
      this.playAction({ id, def, inst: { id, uses: -1 }, slot: -1, permanent: true });
    } finally {
      this.permanent = false;
    }
  }
}

export class Wand {
  stats: WandStats;
  /** Inventory slots (null = empty). Call refreshDeck() after editing. */
  spells: (SpellInstance | null)[];
  /** Always Cast spell ids, played at the front of every cast. */
  alwaysCast: string[];
  mana: number;
  /** Frames until the cast delay has elapsed. */
  castDelayTimer = 0;
  /** Frames until the recharge (reload) has finished. */
  reloadTimer = 0;
  /** gun.lua current_reload_time: recharge accumulated over the current cycle (spells add to it). */
  currentReloadTime: number;

  /** gun.lua piles. Exposed for UI/debugging; treat as read-only outside this module. */
  deck: DeckCard[] = [];
  hand: DeckCard[] = [];
  discarded: DeckCard[] = [];
  private firstShot = true;

  constructor(stats: WandStats, spells: (SpellInstance | null)[], alwaysCast: string[] = []) {
    this.stats = stats;
    this.spells = spells;
    this.alwaysCast = alwaysCast;
    this.mana = stats.manaMax;
    this.currentReloadTime = stats.rechargeTime;
    this.refreshDeck();
  }

  get capacity(): number {
    return this.stats.capacity;
  }

  /** Advance timers and regenerate mana (call for every wand, held or not). */
  tick(frames: number, manaRateMult = 1): void {
    if (frames <= 0) return;
    this.castDelayTimer = Math.max(0, this.castDelayTimer - frames);
    this.reloadTimer = Math.max(0, this.reloadTimer - frames);
    if (this.mana < this.stats.manaMax) {
      const regen = (this.stats.manaChargeSpeed * manaRateMult * frames) / 60;
      this.mana = Math.min(this.stats.manaMax, this.mana + regen);
    }
  }

  isReady(): boolean {
    return this.castDelayTimer <= EPS && this.reloadTimer <= EPS;
  }

  /** Frames until the wand can cast again (max of the two concurrent timers). */
  get waitFrames(): number {
    return Math.max(this.castDelayTimer, this.reloadTimer);
  }

  cast(rng: () => number): CastResult {
    if (!this.isReady()) {
      return {
        fired: false, root: { state: defaultShotState(), projectiles: [] }, castDelayFrames: 0, reloadFrames: 0,
        reloaded: false, manaSpent: 0, skippedForMana: [], drawn: [], producedProjectile: false,
      };
    }

    // ---- _start_shot
    if (this.mana > this.stats.manaMax) this.mana = this.stats.manaMax;
    const manaAtStart = this.mana;
    const root: Shot = { state: defaultShotState(), projectiles: [] };
    // ConfigGunActionInfo_Copy(state_from_game, c): the root state starts with the wand's cast delay, which is
    // why Chainsaw (c.fire_rate_wait = 0) also cancels the wand's own cast delay. Spread/speed stay additive
    // and the ProjectileSystem combines them with the wand stats.
    root.state.fireRateWait = this.stats.castDelay;
    if (this.firstShot) {
      this.orderDeck(rng);
      this.currentReloadTime = this.stats.rechargeTime;
      this.firstShot = false;
    }
    const s = new CastSession(this, rng, root);

    // ---- Always Casts, then the root draw (draw_shot(root_shot, false))
    for (const id of this.alwaysCast) s.playPermanentCard(id);
    s.drawActions(this.stats.actionsPerRound, false);

    // ---- _handle_reload
    this.moveHandToDiscarded(s.gotProjectiles);
    let reloaded = false;
    let reloadFrames = 0;
    if (this.deck.length === 0 || s.startReload) {
      this.moveDiscardedToDeck();
      this.orderDeck(rng);
      reloadFrames = Math.max(0, this.currentReloadTime);
      this.currentReloadTime = this.stats.rechargeTime;
      this.reloadTimer = reloadFrames;
      reloaded = true;
    }

    this.mana = s.mana;
    const totalCastDelay = root.state.fireRateWait;
    // Report the root state's own contribution (cast delay = wand castDelay + root.state.fireRateWait).
    root.state.fireRateWait = totalCastDelay - this.stats.castDelay;
    let castDelayFrames = 0;
    if (s.gotProjectiles) {
      castDelayFrames = Math.max(1, totalCastDelay);
      this.castDelayTimer = castDelayFrames;
    }

    return {
      fired: true,
      root,
      castDelayFrames,
      reloadFrames,
      reloaded,
      manaSpent: manaAtStart - this.mana,
      skippedForMana: s.skippedForMana,
      drawn: s.drawn,
      producedProjectile: s.gotProjectiles,
    };
  }

  /** Rebuild the deck from the slots in slot order (gun.lua _clear_deck + _add_card_to_deck). */
  refreshDeck(): void {
    this.deck = [];
    this.hand = [];
    this.discarded = [];
    this.spells.forEach((inst, slot) => {
      if (!inst) return;
      const def = SPELLS[inst.id];
      if (!def) return;
      this.deck.push({ id: inst.id, def, inst, slot, permanent: false });
    });
    this.firstShot = true; // order_deck() (shuffle) runs at the next cast start
  }

  /** Spell Refresher: restore every spell's charges and rebuild the deck. */
  refreshCharges(): void {
    for (const inst of this.spells) {
      if (!inst) continue;
      const def = SPELLS[inst.id];
      if (def) inst.uses = def.maxUses;
    }
    this.refreshDeck();
  }

  /** Upcoming draw order (spell ids). Before the first cast this is slot order (a shuffle wand shuffles then). */
  deckPreview(): string[] {
    return this.deck.map((c) => c.id);
  }

  /** Deep copy including deck state (useful to preview casts without touching the real wand). */
  clone(): Wand {
    const spells = this.spells.map((s) => (s ? { ...s } : null));
    const w = new Wand({ ...this.stats }, spells, [...this.alwaysCast]);
    w.mana = this.mana;
    w.castDelayTimer = this.castDelayTimer;
    w.reloadTimer = this.reloadTimer;
    w.currentReloadTime = this.currentReloadTime;
    w.firstShot = this.firstShot;
    const instMap = new Map<SpellInstance, SpellInstance>();
    this.spells.forEach((s, i) => {
      const t = spells[i];
      if (s && t) instMap.set(s, t);
    });
    const copy = (c: DeckCard): DeckCard => ({ ...c, inst: instMap.get(c.inst) ?? { ...c.inst } });
    w.deck = this.deck.map(copy);
    w.hand = this.hand.map(copy);
    w.discarded = this.discarded.map(copy);
    return w;
  }

  // ---- gun.lua helpers (public for CastSession; not part of the gameplay API)

  /** order_deck(): shuffle (Noita's pick-random-remaining loop) or sort by slot. */
  orderDeck(rng: () => number): void {
    if (this.stats.shuffle) {
      const src = this.deck;
      const out: DeckCard[] = [];
      for (let i = src.length; i >= 1; i--) {
        const idx = Math.min(i - 1, Math.floor(rng() * i));
        out.push(src.splice(idx, 1)[0]);
      }
      this.deck = out;
    } else {
      this.deck.sort((a, b) => a.slot - b.slot);
    }
  }

  moveDiscardedToDeck(): void {
    for (const c of this.discarded) this.deck.push(c);
    this.discarded = [];
  }

  /** move_hand_to_discarded(): spend charges (only if the cast produced a projectile) and recycle the hand. */
  private moveHandToDiscarded(gotProjectiles: boolean): void {
    for (const card of this.hand) {
      if (gotProjectiles || ALWAYS_CONSUME_TYPES.has(card.def.type)) {
        if (card.inst.uses > 0) card.inst.uses -= 1;
      }
      if (card.inst.uses !== 0 && !card.permanent) this.discarded.push(card);
    }
    this.hand = [];
  }
}
