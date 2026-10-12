// ReactionSystem registry: centralised material reactions (after Noita's materials.xml <Reaction> table).
// A reaction fires when a "reactive" cell inspects a neighbour and the pair matches.
import { MATERIALS, matId, KIND, Kind, ACID_PROOF, DURABILITY, AIR } from '../world/materials';

export interface ReactionDef {
  a: string; // initiating material
  b: string; // neighbour
  ra: string; // a becomes
  rb: string; // b becomes
  prob: number; // probability per contact check (per tick)
  /** Temperature change applied to both resulting cells (°C). */
  heat?: number;
  /** Event emitted (for sound/visual feedback). */
  event?: 'sizzle' | 'steam' | 'hiss' | 'convert' | 'corrode';
  note?: string;
}

/** Recognisable Noita reactions. Rates are probabilities per contact check per tick. */
export const REACTIONS: ReactionDef[] = [
  { a: 'lava', b: 'water', ra: 'basalt', rb: 'steam', prob: 0.6, event: 'steam', note: '[lava] + water -> rock + steam (80)' },
  { a: 'lava', b: 'blood', ra: 'basalt', rb: 'steam', prob: 0.45, event: 'steam' },
  { a: 'lava', b: 'toxic', ra: 'basalt', rb: 'toxicgas', prob: 0.5, event: 'steam', note: '[lava] + [radioactive] -> toxic rock + toxic gas' },
  { a: 'lava', b: 'snow', ra: 'lava', rb: 'water', prob: 0.5, event: 'hiss' },
  { a: 'lava', b: 'snowrock', ra: 'lava', rb: 'water', prob: 0.25, event: 'hiss' },
  { a: 'lava', b: 'ice', ra: 'lava', rb: 'water', prob: 0.35, event: 'hiss' },
  { a: 'lava', b: 'slime', ra: 'basalt', rb: 'steam', prob: 0.3, event: 'steam' },
  { a: 'fire', b: 'water', ra: 'air', rb: 'steam', prob: 0.2, event: 'hiss', note: '[fire] + water -> steam (20)' },
  { a: 'fire', b: 'blood', ra: 'air', rb: 'steam', prob: 0.15, event: 'hiss' },
  { a: 'fire', b: 'snow', ra: 'air', rb: 'water', prob: 0.6, event: 'hiss', note: '[fire] + snow -> water (80)' },
  { a: 'fire', b: 'ice', ra: 'fire', rb: 'water', prob: 0.3, event: 'hiss', note: '[fire] + ice -> water (40)' },
  { a: 'fire', b: 'slime', ra: 'air', rb: 'steam', prob: 0.4 },
  { a: 'water', b: 'toxic', ra: 'water', rb: 'water', prob: 0.04, event: 'convert', note: 'water purifies toxic sludge (13)' },
  { a: 'snow', b: 'toxic', ra: 'water', rb: 'water', prob: 0.1, event: 'convert' },
  { a: 'water', b: 'slime', ra: 'water', rb: 'water', prob: 0.01, event: 'convert', note: 'water washes slime away' },
  { a: 'blood', b: 'toxic', ra: 'slime', rb: 'smoke', prob: 0.05, event: 'convert', note: 'blood + poison -> slime + smoke (10)' },
  { a: 'mana', b: 'water', ra: 'mana', rb: 'mana', prob: 0.08, event: 'convert', note: 'Concentrated Mana converts water (25)' },
  { a: 'teleportatium', b: 'whiskey', ra: 'teleportatium', rb: 'teleportatium', prob: 0.05, event: 'convert' },
  { a: 'polymorphine', b: 'toxic', ra: 'polymorphine', rb: 'polymorphine', prob: 0.05, event: 'convert' },
  { a: 'acid', b: 'air', ra: 'flamgas', rb: 'air', prob: 0.0015, note: 'acid slowly fumes (acid + air -> flammable gas)' },
  { a: 'steam', b: 'ice', ra: 'water', rb: 'ice', prob: 0.05 },
  { a: 'steam', b: 'snowrock', ra: 'water', rb: 'snowrock', prob: 0.03 },
];

export const REACT = new Int16Array(256 * 256).fill(-1);
/** 1 if the material initiates reactions (inspects neighbours each tick while awake). */
export const REACTIVE = new Uint8Array(256);
/** Acid-like materials corrode any non acid-proof solid/powder (handled generically). */
export const CORRODES = new Uint8Array(256);
/** Probability that a corroding cell is used up per dissolved voxel (gameplay deviation: Noita acid is never consumed). */
export const CORRODE_CONSUME = 0.12;

export function buildReactions(): void {
  REACT.fill(-1);
  REACTIVE.fill(0);
  REACTIONS.forEach((r, i) => {
    const a = matId(r.a), b = matId(r.b);
    REACT[a * 256 + b] = i;
    REACTIVE[a] = 1;
  });
  CORRODES[matId('acid')] = 1;
  REACTIVE[matId('acid')] = 1;
}
buildReactions();

export const RA = new Uint8Array(REACTIONS.length);
export const RB = new Uint8Array(REACTIONS.length);
export const RPROB = new Float32Array(REACTIONS.length);
REACTIONS.forEach((r, i) => {
  RA[i] = matId(r.ra);
  RB[i] = matId(r.rb);
  RPROB[i] = r.prob;
});

export function canCorrode(target: number): boolean {
  if (target === AIR || ACID_PROOF[target]) return false;
  const k = KIND[target];
  return (k === Kind.SOLID || k === Kind.POWDER) && DURABILITY[target] <= 12;
}

export function describeReactions(): string[] {
  return REACTIONS.map((r) => `${r.a} + ${r.b} -> ${r.ra} + ${r.rb} (p=${r.prob})`);
}

void MATERIALS;
