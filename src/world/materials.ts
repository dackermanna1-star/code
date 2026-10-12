// MaterialDatabase: every voxel is one of these materials. Properties drive the cellular simulation,
// rendering, destruction and entity interaction. Hot loops use the flat typed-array tables below.

export const enum Kind {
  EMPTY = 0,
  SOLID = 1,
  POWDER = 2,
  LIQUID = 3,
  GAS = 4,
  FIRE = 5,
}

export type Pattern =
  | 'noise'
  | 'blotch'
  | 'dots'
  | 'planks'
  | 'bricks'
  | 'crystal'
  | 'speckle'
  | 'strata'
  | 'plates'
  | 'flat';

export type StainId = 'wet' | 'bloody' | 'oily' | 'slimy' | 'toxic' | 'drunk' | 'berserk' | 'mana' | 'healing' | 'teleport' | 'polymorph';

export interface MaterialDef {
  name: string;
  display: string;
  kind: Kind;
  /** Displacement weight. Heavier liquids/powders sink through lighter ones; lighter gases rise. */
  density: number;
  /**
   * Explosion/dig ray energy consumed per voxel (Noita "hardness" / 1000). Infinity = indestructible.
   * Liquids/gases use 0: blasts throw them around instead of destroying them.
   */
  hardness: number;
  /** Noita "durability" gate: a spell/explosion can only destroy materials with durability <= its max. */
  durability?: number;
  colors: string[];
  pattern?: Pattern;
  alpha?: number; // liquids/gases/glass
  /** Emissive glow strength 0..1 and optional light colour (defaults to first palette colour). */
  glow?: number;
  light?: string;
  // ---- fire ----
  flammability?: number; // probability per exposure tick to catch fire
  burnHp?: number; // initial burn hp (0..127)
  burnDecay?: number; // probability per tick to lose 1 burn hp
  burnProduct?: string; // material left after burning out (default air)
  burnProductChance?: number;
  burnGas?: string; // gas emitted while burning (default smoke)
  explodeOnBurnout?: number; // explosion radius when burned out (gunpowder)
  // ---- thermal ----
  /** Natural temperature (°C) of the material at rest. Defaults to the 20 °C ambient. */
  temperature?: number;
  /** Continuously pushes its temperature into neighbours (lava, fire). */
  heatSource?: boolean;
  conductivity?: number; // 0..1
  meltTemp?: number;
  meltProduct?: string;
  boilTemp?: number;
  boilProduct?: string;
  freezeTemp?: number;
  freezeProduct?: string;
  ignitionTemp?: number;
  // ---- liquid/gas motion ----
  flow?: number; // horizontal search distance per tick
  moveChance?: number; // probability to update per tick (viscosity)
  slide?: number; // powders: chance to slide diagonally (lower = steeper piles)
  lifetime?: number; // gases/fire: initial life (0..127; bit 7 of aux is the burning flag)
  lifeDecay?: number; // probability per tick to lose 1 life (0 = persistent)
  condenseInto?: string; // gas → liquid when life ends
  condenseChance?: number;
  // ---- entities ----
  damage?: number; // contact damage per second (HP)
  damageType?: 'fire' | 'acid' | 'toxic' | 'lava' | 'physical' | 'electric' | 'ice';
  stain?: StainId;
  ignitesEntities?: boolean;
  extinguishes?: boolean;
  electric?: boolean; // conducts electricity
  acidProof?: boolean;
  goldValue?: number; // destroyed voxel → chance to drop gold
  holy?: boolean; // destroying angers the gods
  /** If true, this solid is not collidable (decorative growth such as vines). */
  passable?: boolean;
}

const M: Record<string, MaterialDef> = {
  air: { name: 'air', display: 'Air', kind: Kind.EMPTY, density: 0, hardness: 0, colors: ['#000000'] },
  bedrock: {
    name: 'bedrock', display: 'Extremely dense rock', kind: Kind.SOLID, density: 10, hardness: Infinity, durability: 12,
    colors: ['#18161a', '#1f1c21', '#141216'], pattern: 'blotch', conductivity: 0.2, acidProof: true,
  },
  rock: {
    name: 'rock', display: 'Rock', kind: Kind.SOLID, density: 10, hardness: 100, durability: 10,
    colors: ['#3d3b3f', '#47454a', '#333136', '#28262a', '#56535a'], pattern: 'dots', conductivity: 0.3,
  },
  soil: {
    name: 'soil', display: 'Soil', kind: Kind.SOLID, density: 6, hardness: 2, durability: 10,
    colors: ['#5d4d2b', '#6b5a32', '#4c3f24', '#7a6a3a', '#3e3420', '#857442'], pattern: 'blotch', conductivity: 0.15,
  },
  denserock: {
    name: 'denserock', display: 'Dense rock', kind: Kind.SOLID, density: 10, hardness: 200, durability: 10,
    colors: ['#2a292f', '#323138', '#25242a', '#3b3a42'], pattern: 'dots', conductivity: 0.3,
  },
  coal: {
    name: 'coal', display: 'Coal', kind: Kind.SOLID, density: 6, hardness: 25, durability: 8,
    colors: ['#1c1a19', '#262321', '#302c29', '#151312', '#3a3531'], pattern: 'strata',
    flammability: 0.04, burnHp: 127, burnDecay: 0.08, burnProduct: 'ash', burnProductChance: 0.5,
    ignitionTemp: 420, conductivity: 0.2,
  },
  wood: {
    name: 'wood', display: 'Wood', kind: Kind.SOLID, density: 11, hardness: 2.5, durability: 9,
    colors: ['#8a5a2b', '#7a4e25', '#9a6833', '#6a4220', '#a87538'], pattern: 'planks',
    flammability: 0.22, burnHp: 100, burnDecay: 0.3, burnProduct: 'ash', burnProductChance: 0.12,
    ignitionTemp: 300, conductivity: 0.1,
  },
  brick: {
    name: 'brick', display: 'Brickwork', kind: Kind.SOLID, density: 50, hardness: 4, durability: 8,
    colors: ['#a08a5e', '#937e55', '#ad9768', '#5c4c36'], pattern: 'bricks', conductivity: 0.25,
  },
  templebrick: {
    name: 'templebrick', display: 'Holy mountain brick', kind: Kind.SOLID, density: 10, hardness: 1000, durability: 14,
    colors: ['#4a3d3b', '#544643', '#3f3432', '#2a2221'], pattern: 'bricks', conductivity: 0.1, acidProof: true, holy: true,
  },
  steel: {
    name: 'steel', display: 'Steel', kind: Kind.SOLID, density: 10, hardness: 130, durability: 12,
    colors: ['#646a72', '#717880', '#59606a', '#868d96', '#4a5058'], pattern: 'plates',
    conductivity: 0.9, electric: true, acidProof: true,
  },
  ice: {
    name: 'ice', display: 'Ice', kind: Kind.SOLID, density: 10, hardness: 30, durability: 8,
    colors: ['#a6d6ef', '#94c8e6', '#bfe4f7', '#86bcdc'], pattern: 'crystal', alpha: 0.82,
    meltTemp: 1, meltProduct: 'water', conductivity: 0.4, temperature: -8,
  },
  glass: {
    name: 'glass', display: 'Glass', kind: Kind.SOLID, density: 10, hardness: 30, durability: 8,
    colors: ['#b4dce4', '#a4ced8', '#c8e8ee'], pattern: 'flat', alpha: 0.45, conductivity: 0.3, acidProof: true,
  },
  goldore: {
    name: 'goldore', display: 'Gold', kind: Kind.SOLID, density: 11, hardness: 2, durability: 10,
    colors: ['#d8ae2e', '#f2d052', '#b48e22', '#fff08a', '#8a6a1a'], pattern: 'speckle', glow: 0.12, light: '#ffcc44',
    goldValue: 1, conductivity: 0.8, electric: true,
  },
  crystal: {
    name: 'crystal', display: 'Magic crystal', kind: Kind.SOLID, density: 10, hardness: 50, durability: 10,
    colors: ['#8a6ad8', '#a688f0', '#6c4fb8', '#c8b0ff'], pattern: 'crystal', glow: 0.45, light: '#9a70ff', conductivity: 0.5,
  },
  grass: {
    name: 'grass', display: 'Grass', kind: Kind.SOLID, density: 6, hardness: 1, durability: 6,
    colors: ['#5b7a28', '#6e8f2e', '#48631e', '#86a63a', '#3d5419'], pattern: 'noise',
    flammability: 0.5, burnHp: 30, burnDecay: 0.5, ignitionTemp: 200, conductivity: 0.1,
  },
  fungus: {
    name: 'fungus', display: 'Fungus', kind: Kind.SOLID, density: 6, hardness: 2, durability: 6,
    colors: ['#2d8f7a', '#3bb096', '#1f6a5c', '#7fe0c0', '#c05a9a'], pattern: 'blotch', glow: 0.55, light: '#3fd6b0',
    flammability: 0.15, burnHp: 60, burnDecay: 0.4, ignitionTemp: 250, conductivity: 0.1,
  },
  snowrock: {
    name: 'snowrock', display: 'Packed snow', kind: Kind.SOLID, density: 8, hardness: 12, durability: 8,
    colors: ['#dfe7f0', '#cdd8e5', '#eef3f8', '#b8c6d6'], pattern: 'blotch', meltTemp: 4, meltProduct: 'water', conductivity: 0.2, temperature: -6,
  },
  basalt: {
    name: 'basalt', display: 'Cooled lava', kind: Kind.SOLID, density: 10, hardness: 100, durability: 10,
    colors: ['#2f2828', '#3a3030', '#252020', '#4a3632', '#5a2a1e'], pattern: 'noise', conductivity: 0.35,
  },
  concrete: {
    name: 'concrete', display: 'Concrete', kind: Kind.SOLID, density: 10, hardness: 30, durability: 8,
    colors: ['#6c6a66', '#76736e', '#605e5a', '#83807a'], pattern: 'plates', conductivity: 0.3,
  },
  sandstone: {
    name: 'sandstone', display: 'Sandstone', kind: Kind.SOLID, density: 10, hardness: 19, durability: 10,
    colors: ['#a88a5a', '#b89a66', '#977a4c', '#c4a874'], pattern: 'strata', conductivity: 0.2,
  },
  root: {
    name: 'root', display: 'Root', kind: Kind.SOLID, density: 8, hardness: 3, durability: 9,
    colors: ['#4a3420', '#5a4028', '#3a2818'], pattern: 'planks', flammability: 0.12, burnHp: 80, burnDecay: 0.3,
    ignitionTemp: 300, conductivity: 0.1,
  },
  vine: {
    name: 'vine', display: 'Vine', kind: Kind.SOLID, density: 4, hardness: 0.5, durability: 4,
    colors: ['#3e6a22', '#4f7f2a', '#2f521a'], pattern: 'noise', passable: true,
    flammability: 0.35, burnHp: 20, burnDecay: 0.5, ignitionTemp: 200,
  },
  meat: {
    name: 'meat', display: 'Meat', kind: Kind.SOLID, density: 6, hardness: 5, durability: 9,
    colors: ['#8a3a3a', '#a04848', '#6e2a2a', '#c06060'], pattern: 'noise', flammability: 0.05, burnHp: 40, burnDecay: 0.4,
    ignitionTemp: 400, burnProduct: 'ash', burnProductChance: 0.3,
  },

  lamp: {
    name: 'lamp', display: 'Lantern', kind: Kind.SOLID, density: 8, hardness: 5, durability: 8,
    colors: ['#ffd27a', '#ffc05a', '#ffe6a8'], pattern: 'flat', glow: 1, light: '#ffb85a',
  },
  darksoil: {
    name: 'darksoil', display: 'Coal-rich soil', kind: Kind.SOLID, density: 6, hardness: 2, durability: 10,
    colors: ['#3a3128', '#2e2720', '#443a2f', '#231e19', '#4f4335'], pattern: 'blotch', conductivity: 0.15,
  },
  junglesoil: {
    name: 'junglesoil', display: 'Lush soil', kind: Kind.SOLID, density: 6, hardness: 2, durability: 10,
    colors: ['#3b3a1e', '#47461f', '#2f3018', '#545126', '#28331a'], pattern: 'blotch', conductivity: 0.15,
  },
  skull: {
    name: 'skull', display: 'Bone', kind: Kind.SOLID, density: 6, hardness: 5, durability: 8,
    colors: ['#d8d0b8', '#c4bca4', '#e8e2cc'], pattern: 'noise',
  },

  // ---------------------------------------------------------------- powders
  sand: {
    name: 'sand', display: 'Sand', kind: Kind.POWDER, density: 6, hardness: 0.8, durability: 4,
    colors: ['#c9a86a', '#b8985b', '#d8bb7e', '#a5874e'], pattern: 'noise', slide: 0.75,
    meltTemp: 950, meltProduct: 'glass', conductivity: 0.15,
  },
  snow: {
    name: 'snow', display: 'Snow', kind: Kind.POWDER, density: 5, hardness: 1, durability: 4,
    colors: ['#e9eff6', '#dde6ef', '#f6f9fc', '#c9d5e2'], pattern: 'noise', slide: 0.35,
    meltTemp: 2, meltProduct: 'water', conductivity: 0.2, temperature: -5,
  },
  ash: {
    name: 'ash', display: 'Ash', kind: Kind.POWDER, density: 3, hardness: 0.3, durability: 4,
    colors: ['#58534f', '#6a6460', '#4a4542', '#7a7470'], pattern: 'noise', slide: 0.6,
  },
  gunpowder: {
    name: 'gunpowder', display: 'Gunpowder', kind: Kind.POWDER, density: 7, hardness: 1, durability: 4,
    colors: ['#2b2a2a', '#383636', '#1f1e1e', '#4a4646'], pattern: 'noise', slide: 0.7,
    flammability: 1, burnHp: 4, burnDecay: 1, explodeOnBurnout: 3.2, ignitionTemp: 180,
  },
  gravel: {
    name: 'gravel', display: 'Gravel', kind: Kind.POWDER, density: 7, hardness: 1.5, durability: 6,
    colors: ['#5f574a', '#6f665a', '#4e473c', '#837a6c'], pattern: 'noise', slide: 0.55, conductivity: 0.2,
  },
  dirt: {
    name: 'dirt', display: 'Loose soil', kind: Kind.POWDER, density: 6, hardness: 1, durability: 6,
    colors: ['#5d4d2b', '#6b5a32', '#4c3f24', '#7a6a3a'], pattern: 'noise', slide: 0.5, conductivity: 0.15,
  },
  coalpowder: {
    name: 'coalpowder', display: 'Coal dust', kind: Kind.POWDER, density: 6, hardness: 1, durability: 4,
    colors: ['#1c1a19', '#262321', '#302c29'], pattern: 'noise', slide: 0.6,
    flammability: 0.08, burnHp: 80, burnDecay: 0.15, burnProduct: 'ash', burnProductChance: 0.4, ignitionTemp: 380,
  },
  goldsand: {
    name: 'goldsand', display: 'Gold dust', kind: Kind.POWDER, density: 9, hardness: 8, durability: 12,
    colors: ['#e8c040', '#f6dc6a', '#c09a2a'], pattern: 'speckle', slide: 0.6, glow: 0.1, goldValue: 1,
  },

  // ---------------------------------------------------------------- liquids
  water: {
    name: 'water', display: 'Water', kind: Kind.LIQUID, density: 4.0, hardness: 0, durability: 0,
    colors: ['#3a6fc8', '#3366bb', '#4279d0'], alpha: 0.62, flow: 7, moveChance: 1,
    boilTemp: 100, boilProduct: 'steam', freezeTemp: -1, freezeProduct: 'ice', conductivity: 0.5,
    stain: 'wet', extinguishes: true, electric: true,
  },
  blood: {
    name: 'blood', display: 'Blood', kind: Kind.LIQUID, density: 4.1, hardness: 0, durability: 0,
    colors: ['#8c0c12', '#7a0a10', '#a01418'], alpha: 0.9, flow: 5, moveChance: 1,
    boilTemp: 110, boilProduct: 'steam', freezeTemp: -3, freezeProduct: 'ice', stain: 'bloody', extinguishes: true,
    conductivity: 0.45, electric: true,
  },
  oil: {
    name: 'oil', display: 'Oil', kind: Kind.LIQUID, density: 1.0, hardness: 0, durability: 0,
    colors: ['#2e2620', '#3a3028', '#241e18'], alpha: 0.94, flow: 4, moveChance: 0.85,
    flammability: 0.9, burnHp: 40, burnDecay: 0.35, burnGas: 'smoke', ignitionTemp: 220, stain: 'oily', conductivity: 0.2,
  },
  toxic: {
    name: 'toxic', display: 'Toxic sludge', kind: Kind.LIQUID, density: 3.0, hardness: 0, durability: 0,
    colors: ['#7fcf1c', '#8edc28', '#6cb814'], alpha: 0.88, glow: 0.18, light: '#88e020', flow: 4, moveChance: 0.9,
    boilTemp: 180, boilProduct: 'toxicgas', stain: 'toxic', conductivity: 0.4, electric: true,
  },
  acid: {
    name: 'acid', display: 'Acid', kind: Kind.LIQUID, density: 2.9, hardness: 0, durability: 0,
    colors: ['#c6ef2a', '#b4e01e', '#d8fa50'], alpha: 0.8, glow: 0.3, light: '#d0ff40', flow: 6, moveChance: 1,
    boilTemp: 150, boilProduct: 'acidgas', damage: 9.5, damageType: 'acid', electric: true, conductivity: 0.4, acidProof: true,
  },
  lava: {
    name: 'lava', display: 'Lava', kind: Kind.LIQUID, density: 6.0, hardness: 0, durability: 0,
    colors: ['#ff6a10', '#ff8a1c', '#e8480a', '#ffb43a', '#c83006'], alpha: 1, glow: 1, light: '#ff6a18',
    flow: 2, moveChance: 0.3, temperature: 1150, heatSource: true, conductivity: 0.6, damage: 5.7, damageType: 'lava', electric: true, ignitesEntities: true,
    acidProof: true,
  },
  whiskey: {
    name: 'whiskey', display: 'Whiskey', kind: Kind.LIQUID, density: 3.5, hardness: 0, durability: 0,
    colors: ['#c9873a', '#b8762e', '#d8984a'], alpha: 0.7, flow: 6, moveChance: 1,
    flammability: 0.7, burnHp: 20, burnDecay: 0.5, ignitionTemp: 160, stain: 'drunk', conductivity: 0.4,
  },
  slime: {
    name: 'slime', display: 'Slime', kind: Kind.LIQUID, density: 5.0, hardness: 0, durability: 0,
    colors: ['#d06aa0', '#c05a90', '#e080b4'], alpha: 0.86, flow: 1, moveChance: 0.35, stain: 'slimy', conductivity: 0.3,
  },
  healthium: {
    name: 'healthium', display: 'Healthium', kind: Kind.LIQUID, density: 5.53, hardness: 0, durability: 0,
    colors: ['#f2a6c6', '#ffbcd6', '#e48eb2'], alpha: 0.75, glow: 0.35, light: '#ff9cc8', flow: 5, moveChance: 1,
    stain: 'healing', conductivity: 0.4,
  },
  mana: {
    name: 'mana', display: 'Concentrated mana', kind: Kind.LIQUID, density: 4.92, hardness: 0, durability: 0,
    colors: ['#3a8cff', '#5aa8ff', '#2a6ae8'], alpha: 0.75, glow: 0.6, light: '#4a9cff', flow: 5, moveChance: 1,
    stain: 'mana', conductivity: 0.4,
  },
  teleportatium: {
    name: 'teleportatium', display: 'Teleportatium', kind: Kind.LIQUID, density: 4.21, hardness: 0, durability: 0,
    colors: ['#9a7aff', '#b49aff', '#8060e8'], alpha: 0.72, glow: 0.5, light: '#a088ff', flow: 5, moveChance: 1,
    stain: 'teleport', conductivity: 0.4,
  },
  polymorphine: {
    name: 'polymorphine', display: 'Polymorphine', kind: Kind.LIQUID, density: 4.14, hardness: 0, durability: 0,
    colors: ['#d86ae8', '#e888f4', '#c050d8'], alpha: 0.75, glow: 0.4, light: '#e070ff', flow: 5, moveChance: 1,
    stain: 'polymorph', conductivity: 0.4,
  },
  berserkium: {
    name: 'berserkium', display: 'Berserkium', kind: Kind.LIQUID, density: 2.41, hardness: 0, durability: 0,
    colors: ['#e8603a', '#f47a50', '#d04a28'], alpha: 0.8, glow: 0.2, light: '#ff7040', flow: 5, moveChance: 1,
    stain: 'berserk', conductivity: 0.4,
  },

  // ---------------------------------------------------------------- gases
  smoke: {
    name: 'smoke', display: 'Smoke', kind: Kind.GAS, density: 1.0, hardness: 0, durability: 0,
    colors: ['#2e2c2c', '#3a3737', '#252323'], alpha: 0.5, lifetime: 127, lifeDecay: 0.36,
  },
  steam: {
    name: 'steam', display: 'Steam', kind: Kind.GAS, density: 0.8, hardness: 0, durability: 0,
    colors: ['#d8dce4', '#c8ccd6', '#e8ecf2'], alpha: 0.32, lifetime: 127, lifeDecay: 0.18,
    condenseInto: 'water', condenseChance: 0.35, temperature: 105,
  },
  toxicgas: {
    name: 'toxicgas', display: 'Toxic gas', kind: Kind.GAS, density: 1.6, hardness: 0, durability: 0,
    colors: ['#8cc83c', '#7ab830', '#a0dc50'], alpha: 0.32, lifetime: 127, lifeDecay: 0.28,
    damage: 1.9, damageType: 'toxic',
  },
  flamgas: {
    name: 'flamgas', display: 'Flammable gas', kind: Kind.GAS, density: 1.4, hardness: 0, durability: 0,
    colors: ['#a89a5c', '#b8aa6a', '#988a50'], alpha: 0.18, lifetime: 127, lifeDecay: 0.28,
    flammability: 1, burnHp: 2, burnDecay: 1, ignitionTemp: 150, burnProduct: 'fire', burnProductChance: 1,
  },
  acidgas: {
    name: 'acidgas', display: 'Acid gas', kind: Kind.GAS, density: 1.6, hardness: 0, durability: 0,
    colors: ['#c6ef2a', '#b4e01e'], alpha: 0.25, lifetime: 127, lifeDecay: 0.3,
    condenseInto: 'acid', condenseChance: 0.15, damage: 1.5, damageType: 'acid',
  },
  fire: {
    name: 'fire', display: 'Fire', kind: Kind.FIRE, density: 0.5, hardness: 0, durability: 0,
    colors: ['#ff9a20', '#ffcf40', '#ff6010', '#fff080'], alpha: 0.9, glow: 1, light: '#ff8a28',
    lifetime: 24, lifeDecay: 1, temperature: 750, heatSource: true, damageType: 'fire', ignitesEntities: true,
  },
};

/** Order matters only for stable ids. Never reorder existing entries (seed reproducibility). */
const ORDER = [
  'air', 'bedrock', 'rock', 'soil', 'denserock', 'coal', 'wood', 'brick', 'templebrick', 'steel', 'ice', 'glass',
  'goldore', 'crystal', 'grass', 'fungus', 'snowrock', 'basalt', 'concrete', 'sandstone', 'root', 'vine', 'meat',
  'sand', 'snow', 'ash', 'gunpowder', 'gravel', 'goldsand',
  'water', 'blood', 'oil', 'toxic', 'acid', 'lava', 'whiskey', 'slime', 'healthium', 'mana', 'teleportatium',
  'polymorphine', 'berserkium',
  'smoke', 'steam', 'toxicgas', 'flamgas', 'acidgas', 'fire',
  'lamp', 'darksoil', 'junglesoil', 'skull', 'dirt', 'coalpowder',
];

export const MATERIALS: MaterialDef[] = ORDER.map((n) => {
  const d = M[n];
  if (!d) throw new Error('missing material ' + n);
  return d;
});
export const MAT_COUNT = MATERIALS.length;
/** Pseudo-material for voxels in chunks that are not loaded. Behaves as indestructible solid. */
export const UNLOADED = 255;

const ID: Record<string, number> = {};
MATERIALS.forEach((m, i) => (ID[m.name] = i));

export function matId(name: string): number {
  const id = ID[name];
  if (id === undefined) throw new Error('Unknown material ' + name);
  return id;
}
export function matDef(id: number): MaterialDef {
  return MATERIALS[id] ?? MATERIALS[1];
}

// Named ids for hot code paths
export const AIR = 0;
export const BEDROCK = matId('bedrock');
export const ROCK = matId('rock');
export const SOIL = matId('soil');
export const DENSEROCK = matId('denserock');
export const COAL = matId('coal');
export const WOOD = matId('wood');
export const BRICK = matId('brick');
export const TEMPLEBRICK = matId('templebrick');
export const STEEL = matId('steel');
export const ICE = matId('ice');
export const GLASS = matId('glass');
export const GOLDORE = matId('goldore');
export const CRYSTAL = matId('crystal');
export const GRASS = matId('grass');
export const FUNGUS = matId('fungus');
export const SNOWROCK = matId('snowrock');
export const BASALT = matId('basalt');
export const CONCRETE = matId('concrete');
export const SANDSTONE = matId('sandstone');
export const ROOT = matId('root');
export const VINE = matId('vine');
export const MEAT = matId('meat');
export const SAND = matId('sand');
export const SNOW = matId('snow');
export const ASH = matId('ash');
export const GUNPOWDER = matId('gunpowder');
export const GRAVEL = matId('gravel');
export const GOLDSAND = matId('goldsand');
export const WATER = matId('water');
export const BLOOD = matId('blood');
export const OIL = matId('oil');
export const TOXIC = matId('toxic');
export const ACID = matId('acid');
export const LAVA = matId('lava');
export const WHISKEY = matId('whiskey');
export const SLIME = matId('slime');
export const HEALTHIUM = matId('healthium');
export const MANA = matId('mana');
export const TELEPORTATIUM = matId('teleportatium');
export const POLYMORPHINE = matId('polymorphine');
export const BERSERKIUM = matId('berserkium');
export const SMOKE = matId('smoke');
export const STEAM = matId('steam');
export const TOXICGAS = matId('toxicgas');
export const FLAMGAS = matId('flamgas');
export const ACIDGAS = matId('acidgas');
export const FIRE = matId('fire');
export const LAMP = matId('lamp');
export const DARKSOIL = matId('darksoil');
export const JUNGLESOIL = matId('junglesoil');
export const SKULL = matId('skull');
export const DIRT = matId('dirt');
export const COALPOWDER = matId('coalpowder');

// ------------------------------------------------------------------ flat lookup tables (256 entries)
const N = 256;
export const KIND = new Uint8Array(N);
export const DENSITY = new Float32Array(N);
export const HARDNESS = new Float32Array(N);
export const DURABILITY = new Uint8Array(N);
/** Powder form a solid erodes into at the edge of big blasts (Bomb behaviour). 0 = none. */
export const POWDER_FORM = new Uint8Array(N);
export const FLAMMABILITY = new Float32Array(N);
export const BURN_HP = new Uint8Array(N);
export const BURN_DECAY = new Float32Array(N);
export const BURN_PRODUCT = new Uint8Array(N);
export const BURN_PRODUCT_CHANCE = new Float32Array(N);
export const BURN_GAS = new Uint8Array(N);
export const EXPLODE_ON_BURNOUT = new Float32Array(N);
export const BASE_TEMP = new Float32Array(N); // natural temperature °C
export const HEAT_SOURCE = new Uint8Array(N);
export const CONDUCTIVITY = new Float32Array(N);
export const MELT_TEMP = new Float32Array(N);
export const MELT_PRODUCT = new Uint8Array(N);
export const BOIL_TEMP = new Float32Array(N);
export const BOIL_PRODUCT = new Uint8Array(N);
export const FREEZE_TEMP = new Float32Array(N);
export const FREEZE_PRODUCT = new Uint8Array(N);
export const IGNITION_TEMP = new Float32Array(N);
export const FLOW = new Uint8Array(N);
export const MOVE_CHANCE = new Float32Array(N);
export const SLIDE = new Float32Array(N);
export const LIFETIME = new Uint8Array(N);
export const LIFE_DECAY = new Float32Array(N);
export const CONDENSE_INTO = new Uint8Array(N);
export const CONDENSE_CHANCE = new Float32Array(N);
export const EXTINGUISHES = new Uint8Array(N);
export const ELECTRIC = new Uint8Array(N);
export const ACID_PROOF = new Uint8Array(N);
export const GLOW = new Float32Array(N);
/** 1 if an entity collides with this material. */
export const SOLID_COLLIDE = new Uint8Array(N);
/** 1 if this material hides faces behind it (opaque mesh layer). */
export const OPAQUE = new Uint8Array(N);
/** 1 if the material can be dissolved / damaged at all. */
export const DESTRUCTIBLE = new Uint8Array(N);

for (let i = 0; i < N; i++) {
  BASE_TEMP[i] = 20;
  MELT_TEMP[i] = Infinity;
  BOIL_TEMP[i] = Infinity;
  IGNITION_TEMP[i] = Infinity;
  FREEZE_TEMP[i] = -Infinity;
}

MATERIALS.forEach((m, i) => {
  KIND[i] = m.kind;
  DENSITY[i] = m.density;
  HARDNESS[i] = m.hardness;
  DURABILITY[i] = m.hardness === Infinity ? 255 : (m.durability ?? 0);
  FLAMMABILITY[i] = m.flammability ?? 0;
  BURN_HP[i] = m.burnHp ?? 0;
  BURN_DECAY[i] = m.burnDecay ?? 0;
  BURN_PRODUCT[i] = m.burnProduct ? ID[m.burnProduct] : AIR;
  BURN_PRODUCT_CHANCE[i] = m.burnProduct ? (m.burnProductChance ?? 1) : 0;
  BURN_GAS[i] = ID[m.burnGas ?? 'smoke'];
  EXPLODE_ON_BURNOUT[i] = m.explodeOnBurnout ?? 0;
  if (m.temperature !== undefined) BASE_TEMP[i] = m.temperature;
  HEAT_SOURCE[i] = m.heatSource ? 1 : 0;
  CONDUCTIVITY[i] = m.conductivity ?? 0.2;
  if (m.meltTemp !== undefined) {
    MELT_TEMP[i] = m.meltTemp;
    MELT_PRODUCT[i] = ID[m.meltProduct!];
  }
  if (m.boilTemp !== undefined) {
    BOIL_TEMP[i] = m.boilTemp;
    BOIL_PRODUCT[i] = ID[m.boilProduct!];
  }
  if (m.freezeTemp !== undefined) {
    FREEZE_TEMP[i] = m.freezeTemp;
    FREEZE_PRODUCT[i] = ID[m.freezeProduct!];
  }
  if (m.ignitionTemp !== undefined) IGNITION_TEMP[i] = m.ignitionTemp;
  FLOW[i] = m.flow ?? 0;
  MOVE_CHANCE[i] = m.moveChance ?? 1;
  SLIDE[i] = m.slide ?? 0.6;
  LIFETIME[i] = m.lifetime ?? 0;
  LIFE_DECAY[i] = m.lifeDecay ?? 0;
  if (m.condenseInto) {
    CONDENSE_INTO[i] = ID[m.condenseInto];
    CONDENSE_CHANCE[i] = m.condenseChance ?? 0;
  }
  EXTINGUISHES[i] = m.extinguishes ? 1 : 0;
  ELECTRIC[i] = m.electric ? 1 : 0;
  ACID_PROOF[i] = m.acidProof ? 1 : 0;
  GLOW[i] = m.glow ?? 0;
  SOLID_COLLIDE[i] = (m.kind === Kind.SOLID && !m.passable) || m.kind === Kind.POWDER ? 1 : 0;
  OPAQUE[i] = (m.kind === Kind.SOLID || m.kind === Kind.POWDER) && (m.alpha === undefined || m.alpha >= 1) ? 1 : 0;
  DESTRUCTIBLE[i] = m.hardness !== Infinity ? 1 : 0;
});
// The "unloaded" pseudo material: solid wall that nothing can enter.
KIND[UNLOADED] = Kind.SOLID;
DURABILITY[UNLOADED] = 255;
HARDNESS[UNLOADED] = Infinity;
SOLID_COLLIDE[UNLOADED] = 1;
OPAQUE[UNLOADED] = 1;
DENSITY[UNLOADED] = 100;
ACID_PROOF[UNLOADED] = 1;

for (const [a, b] of [
  ['rock', 'gravel'], ['denserock', 'gravel'], ['basalt', 'gravel'], ['soil', 'dirt'], ['darksoil', 'dirt'],
  ['junglesoil', 'dirt'], ['snowrock', 'snow'], ['ice', 'snow'], ['coal', 'coalpowder'], ['sandstone', 'sand'],
  ['concrete', 'gravel'], ['goldore', 'goldsand'],
]) POWDER_FORM[ID[a]] = ID[b];

export function isFlammable(id: number): boolean {
  return FLAMMABILITY[id] > 0;
}
