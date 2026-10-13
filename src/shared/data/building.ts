import type { DamageType } from './damage';

/**
 * Building tiers, piece types and raid-relevant numbers. All values are
 * design data — see docs/DESIGN.md §Raid economy for the reasoning and the
 * resulting raid-cost table (tests/raid-economy.test.ts keeps it honest).
 */

export interface TierDef {
  key: string;
  name: string;
  /** Max HP of a full-size piece at this tier. */
  hp: number;
  /** Cost of a full-size piece (scaled by piece costMult). */
  cost: Array<[string, number]>;
  /** Hours for an un-maintained piece to decay from full HP to zero. */
  decayHours: number;
  /** Fraction of incoming damage applied, per damage type. Missing = 0 (immune). */
  damageMult: Partial<Record<DamageType, number>>;
}

export const TIERS: TierDef[] = [
  { key: 'twig', name: 'Twig', hp: 10, cost: [['wood', 50]], decayHours: 1,
    damageMult: { melee: 1, bullet: 1, arrow: 1, explosive: 1, decay: 1, animal: 1 } },
  { key: 'wood', name: 'Wood', hp: 250, cost: [['wood', 200]], decayHours: 3,
    damageMult: { melee: 0.6, bullet: 0.08, arrow: 0.03, explosive: 1, decay: 1 } },
  { key: 'stone', name: 'Stone', hp: 500, cost: [['stone', 300]], decayHours: 5,
    damageMult: { melee: 0.02, bullet: 0.01, explosive: 1, decay: 1 } },
  { key: 'metal', name: 'Sheet Metal', hp: 1000, cost: [['metal_frag', 200]], decayHours: 8,
    damageMult: { melee: 0.008, bullet: 0.005, explosive: 1, decay: 1 } },
  { key: 'armored', name: 'Armored', hp: 2000, cost: [['hq_metal', 25]], decayHours: 12,
    damageMult: { melee: 0.004, bullet: 0.002, explosive: 1, decay: 1 } },
];

export type PieceType = 'foundation' | 'floor' | 'wall' | 'doorway' | 'window' | 'half_wall' | 'stairs' | 'door';
export const BUILD_PIECES: PieceType[] = ['foundation', 'floor', 'wall', 'doorway', 'window', 'half_wall', 'stairs'];

export interface PieceDef {
  name: string;
  costMult: number;
  hpMult: number;
}

export const PIECES: Record<PieceType, PieceDef> = {
  foundation: { name: 'Foundation', costMult: 1, hpMult: 1 },
  floor: { name: 'Floor', costMult: 0.5, hpMult: 1 },
  wall: { name: 'Wall', costMult: 1, hpMult: 1 },
  doorway: { name: 'Doorway', costMult: 0.7, hpMult: 1 },
  window: { name: 'Window', costMult: 0.7, hpMult: 1 },
  half_wall: { name: 'Half Wall', costMult: 0.5, hpMult: 0.5 },
  stairs: { name: 'Stairs', costMult: 1, hpMult: 1 },
  door: { name: 'Door', costMult: 0, hpMult: 1 },
};

export interface DoorDef {
  item: string;
  name: string;
  hp: number;
  damageMult: Partial<Record<DamageType, number>>;
}

export const DOORS: DoorDef[] = [
  // Wooden doors take double explosive damage (mirrors the researched Rust behaviour, docs/RESEARCH.md §3).
  { item: 'wooden_door', name: 'Wooden Door', hp: 200, damageMult: { melee: 0.6, bullet: 0.08, arrow: 0.03, explosive: 2, decay: 1 } },
  { item: 'metal_door', name: 'Sheet Metal Door', hp: 250, damageMult: { melee: 0.02, bullet: 0.01, explosive: 1, decay: 1 } },
  { item: 'armored_door', name: 'Armored Door', hp: 1000, damageMult: { melee: 0.004, bullet: 0.002, explosive: 1, decay: 1 } },
];

/** Piece cost scaled by type. */
export function pieceCost(type: PieceType, tier: number): Array<[string, number]> {
  const mult = PIECES[type].costMult;
  return TIERS[tier].cost.map(([k, n]) => [k, Math.max(1, Math.round(n * mult))] as [string, number]);
}

export function pieceMaxHp(type: PieceType, tier: number): number {
  return Math.round(TIERS[tier].hp * PIECES[type].hpMult);
}

/**
 * Upkeep brackets: fraction of a piece's build cost charged per 24h, by
 * total piece count of the building (progressive, so large compounds pay
 * proportionally more — see docs/RESEARCH.md §2).
 */
export const UPKEEP_BRACKETS: Array<{ upTo: number; fraction: number }> = [
  { upTo: 15, fraction: 0.1 },
  { upTo: 50, fraction: 0.15 },
  { upTo: 125, fraction: 0.2 },
  { upTo: Infinity, fraction: 0.33 },
];

/** Building privilege extends this many building cells (x4 blocks) beyond the outermost piece. */
export const PRIVILEGE_CELLS = 3;
/** Vertical privilege margin in blocks above/below the building's extent. */
export const PRIVILEGE_VERTICAL = 16;

/** Minimum stability for a piece to stand. */
export const MIN_STABILITY = 0.3;
