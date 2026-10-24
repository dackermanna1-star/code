// Material types, their physical/destruction properties and the global voxel palette.
// Every voxel stores one byte: an index into PALETTE (0 = air). Each palette entry
// references a material type that drives physics, destruction, fire and effects.

export const enum Mat {
  Air = 0, Concrete, Brick, Plaster, Wood, Metal, HeavyMetal, Glass, Dirt, Grass, Gravel, Rock,
  Asphalt, Plastic, Foliage, Rubber, Explosive, Fabric, Light, Bedrock, Rubble, Char, COUNT,
}

export const enum Snd { Soft = 0, Concrete, Metal, Wood, Glass, Dirt }
export const enum Debris { Dust = 0, Chunk, Splinter, Shard, Spark }

export interface MaterialDef {
  name: string;
  /** kg per voxel (one voxel = 1 litre). */
  density: number;
  /** Destruction hardness: 0 very soft .. 4 very hard, 5 indestructible. */
  hardness: number;
  /** Multiplier on explosion carve radius. */
  blast: number;
  friction: number;
  restitution: number;
  /** 0..1 chance-weight of catching fire. */
  flammable: number;
  /** Seconds a burning voxel takes to be consumed. */
  burnTime: number;
  /** Joint strength used by the structural solver (relative units per voxel bond). */
  bond: number;
  sound: Snd;
  debris: Debris;
  transparent: boolean;
}

const M = (name: string, density: number, hardness: number, blast: number, friction: number, restitution: number,
  flammable: number, burnTime: number, bond: number, sound: Snd, debris: Debris, transparent = false): MaterialDef =>
  ({ name, density, hardness, blast, friction, restitution, flammable, burnTime, bond, sound, debris, transparent });

export const MATERIALS: MaterialDef[] = [];
MATERIALS[Mat.Air] = M('air', 0, 0, 0, 0, 0, 0, 0, 0, Snd.Soft, Debris.Dust);
MATERIALS[Mat.Concrete] = M('concrete', 2.4, 2, 0.72, 0.8, 0.05, 0, 0, 1.0, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Brick] = M('brick', 1.9, 2, 0.8, 0.8, 0.05, 0, 0, 0.75, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Plaster] = M('plaster', 1.1, 1, 1.2, 0.7, 0.05, 0, 0, 0.35, Snd.Concrete, Debris.Dust);
MATERIALS[Mat.Wood] = M('wood', 0.6, 1, 1.05, 0.6, 0.15, 1.0, 9, 0.6, Snd.Wood, Debris.Splinter);
MATERIALS[Mat.Metal] = M('metal', 1.0, 3, 0.5, 0.45, 0.15, 0, 0, 2.4, Snd.Metal, Debris.Spark);
MATERIALS[Mat.HeavyMetal] = M('heavy metal', 3.0, 4, 0.28, 0.45, 0.1, 0, 0, 4.0, Snd.Metal, Debris.Spark);
MATERIALS[Mat.Glass] = M('glass', 2.5, 0, 2.2, 0.4, 0.05, 0, 0, 0.15, Snd.Glass, Debris.Shard, true);
MATERIALS[Mat.Dirt] = M('dirt', 1.5, 1, 1.0, 0.9, 0.0, 0, 0, 0.3, Snd.Dirt, Debris.Dust);
MATERIALS[Mat.Grass] = M('grass', 1.4, 1, 1.0, 0.9, 0.0, 0.15, 3, 0.3, Snd.Dirt, Debris.Dust);
MATERIALS[Mat.Gravel] = M('gravel', 1.7, 1, 0.95, 0.9, 0.0, 0, 0, 0.25, Snd.Dirt, Debris.Chunk);
MATERIALS[Mat.Rock] = M('rock', 2.6, 3, 0.55, 0.85, 0.05, 0, 0, 2.0, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Asphalt] = M('asphalt', 2.3, 2, 0.8, 0.9, 0.02, 0.05, 6, 0.8, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Plastic] = M('plastic', 0.9, 1, 1.1, 0.5, 0.25, 0.55, 6, 0.5, Snd.Soft, Debris.Chunk);
MATERIALS[Mat.Foliage] = M('foliage', 0.25, 0, 1.6, 0.8, 0.0, 0.9, 3, 0.1, Snd.Soft, Debris.Dust);
MATERIALS[Mat.Rubber] = M('rubber', 1.2, 2, 0.85, 1.0, 0.45, 0.5, 10, 0.9, Snd.Soft, Debris.Chunk);
MATERIALS[Mat.Explosive] = M('explosive', 1.6, 1, 1.0, 0.5, 0.1, 0.8, 1, 1.5, Snd.Metal, Debris.Spark);
MATERIALS[Mat.Fabric] = M('fabric', 0.4, 1, 1.3, 0.9, 0.0, 1.0, 4, 0.2, Snd.Soft, Debris.Dust);
MATERIALS[Mat.Light] = M('light', 1.0, 0, 1.6, 0.4, 0.05, 0, 0, 0.3, Snd.Glass, Debris.Shard);
MATERIALS[Mat.Bedrock] = M('bedrock', 3.0, 5, 0, 0.9, 0.0, 0, 0, 100, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Rubble] = M('rubble', 1.6, 1, 1.25, 0.95, 0.0, 0, 0, 0.12, Snd.Concrete, Debris.Chunk);
MATERIALS[Mat.Char] = M('char', 0.3, 0, 1.4, 0.8, 0.0, 0.15, 3, 0.1, Snd.Soft, Debris.Dust);

// ---------------------------------------------------------------------------
// Palette

export interface PalEntry {
  name: string;
  mat: Mat;
  /** sRGB 0..255 */
  r: number; g: number; b: number;
  rough: number;
  metal: number;
  /** Emissive intensity (HDR multiplier on albedo). */
  emissive: number;
  /** Density override (kg/voxel) or 0 to use material density. */
  density: number;
}

export const PALETTE: PalEntry[] = [{ name: 'air', mat: Mat.Air, r: 0, g: 0, b: 0, rough: 1, metal: 0, emissive: 0, density: 0 }];
/** For a palette index, how many contiguous shade variants start at it (1 = no variants). */
export const PAL_GROUP = new Uint8Array(256);

interface PalOpts { rough?: number; metal?: number; emissive?: number; density?: number }

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function defaultsFor(mat: Mat): { rough: number; metal: number } {
  switch (mat) {
    case Mat.Metal: return { rough: 0.45, metal: 0.75 };
    case Mat.HeavyMetal: return { rough: 0.5, metal: 0.65 };
    case Mat.Glass: return { rough: 0.05, metal: 0 };
    case Mat.Plastic: return { rough: 0.45, metal: 0 };
    case Mat.Explosive: return { rough: 0.4, metal: 0.4 };
    case Mat.Light: return { rough: 0.3, metal: 0 };
    case Mat.Rubber: return { rough: 0.75, metal: 0 };
    case Mat.Asphalt: return { rough: 0.9, metal: 0 };
    default: return { rough: 0.92, metal: 0 };
  }
}

function pal(name: string, mat: Mat, hex: string, o: PalOpts = {}): number {
  const [r, g, b] = hexToRgb(hex);
  const d = defaultsFor(mat);
  const idx = PALETTE.length;
  if (idx > 255) throw new Error('palette overflow');
  PALETTE.push({ name, mat, r, g, b, rough: o.rough ?? d.rough, metal: o.metal ?? d.metal, emissive: o.emissive ?? 0, density: o.density ?? 0 });
  PAL_GROUP[idx] = 1;
  return idx;
}

/** Allocates contiguous shade variants; returns the first index. */
function group(name: string, mat: Mat, hexes: string[], o: PalOpts = {}): number {
  const first = pal(name, mat, hexes[0], o);
  for (let i = 1; i < hexes.length; i++) pal(name + i, mat, hexes[i], o);
  PAL_GROUP[first] = hexes.length;
  return first;
}

export const P = {
  // --- ground
  asphalt: group('asphalt', Mat.Asphalt, ['#3b3b3d', '#363638', '#414043', '#39383b']),
  asphaltPatch: group('asphalt patch', Mat.Asphalt, ['#47464a', '#4c4b4e']),
  lineWhite: group('line white', Mat.Asphalt, ['#c9c8c0', '#bdbcb4']),
  lineYellow: group('line yellow', Mat.Asphalt, ['#c9a227', '#bf9a25']),
  gravel: group('gravel', Mat.Gravel, ['#7d7870', '#6e6a63', '#8a857c', '#75716a']),
  ballast: group('ballast', Mat.Gravel, ['#5f5c58', '#6a6661', '#55524e']),
  dirt: group('dirt', Mat.Dirt, ['#5e4a36', '#6b5440', '#574330', '#634e39']),
  dirtDark: group('dirt dark', Mat.Dirt, ['#45362a', '#4d3c2e']),
  mud: group('mud', Mat.Dirt, ['#4a3b2c', '#43352a']),
  sand: group('sand', Mat.Dirt, ['#b09c75', '#a69270']),
  grass: group('grass', Mat.Grass, ['#4f6b2e', '#5a7533', '#46612a', '#53702f']),
  grassDry: group('grass dry', Mat.Grass, ['#7d7a45', '#72703f']),
  rock: group('rock', Mat.Rock, ['#6f6f6f', '#5f5e5c', '#787672']),
  bedrock: pal('bedrock', Mat.Bedrock, '#2b2b2e'),
  coal: group('coal', Mat.Gravel, ['#1f1f21', '#262628', '#1a1a1c']),
  // --- concrete
  concrete: group('concrete', Mat.Concrete, ['#8e8c86', '#888680', '#93918b']),
  concreteMid: group('concrete mid', Mat.Concrete, ['#7e7c76', '#787670']),
  concreteDark: group('concrete dark', Mat.Concrete, ['#77756f', '#6f6d68']),
  concreteStain: group('concrete stain', Mat.Concrete, ['#66635d', '#5c5953']),
  concreteFloor: group('concrete floor', Mat.Concrete, ['#7d817b', '#787c76']),
  epoxyFloor: group('epoxy floor', Mat.Concrete, ['#5f7068', '#5b6b63'], { rough: 0.5 }),
  concreteYellow: pal('concrete safety yellow', Mat.Concrete, '#c99f2c'),
  cinder: group('cinder block', Mat.Concrete, ['#a3a19a', '#9a9891', '#a8a69f']),
  concreteBlue: pal('concrete painted blue', Mat.Concrete, '#4a6a8a'),
  // --- brick
  brick: group('brick', Mat.Brick, ['#8e3b2c', '#9a4432', '#7f3326', '#a24c37', '#87382a']),
  brickDark: group('brick dark', Mat.Brick, ['#5e2a22', '#673026']),
  brickYellow: group('brick yellow', Mat.Brick, ['#b58e55', '#a98450']),
  mortar: group('mortar', Mat.Brick, ['#a59f92', '#9b9588']),
  sootBrick: group('soot brick', Mat.Brick, ['#3a2a26', '#2f2522']),
  // --- plaster / paint
  plaster: group('plaster white', Mat.Plaster, ['#d8d5cc', '#d2cfc6']),
  plasterBeige: group('plaster beige', Mat.Plaster, ['#cdbf9f', '#c6b898']),
  plasterGrey: pal('plaster grey', Mat.Plaster, '#b9b9b4'),
  plasterBlue: pal('plaster blue', Mat.Plaster, '#8d9aa6'),
  plasterGreen: pal('plaster green', Mat.Plaster, '#9fae95'),
  ceiling: pal('ceiling tile', Mat.Plaster, '#e2e0d8'),
  // --- wood
  plank: group('plank', Mat.Wood, ['#9b7247', '#8a643d', '#a37a4d']),
  woodDark: group('wood dark', Mat.Wood, ['#5c3f25', '#664629']),
  pallet: group('pallet wood', Mat.Wood, ['#b08a5a', '#a07b4c', '#b89463']),
  plywood: group('plywood', Mat.Wood, ['#c19a62', '#b8925b']),
  bark: group('bark', Mat.Wood, ['#4e3826', '#5a4130', '#46321f']),
  crate: group('crate wood', Mat.Wood, ['#a5814f', '#9a7747']),
  woodPainted: pal('wood painted green', Mat.Wood, '#4b6343'),
  // --- metal
  steel: group('steel', Mat.Metal, ['#7a7d80', '#73767a', '#808386']),
  steelDark: group('steel dark', Mat.Metal, ['#4a4c4f', '#525457']),
  rust: group('rust', Mat.Metal, ['#8a4b2a', '#7a4127', '#9a5a33', '#6e3d24'], { rough: 0.85, metal: 0.3 }),
  galv: group('galvanized', Mat.Metal, ['#a4a8aa', '#959a9d', '#9ca0a3'], { density: 0.6 }),
  alu: pal('aluminum', Mat.Metal, '#b8bcbf', { density: 0.8, rough: 0.35 }),
  sheetGrey: group('sheet grey', Mat.Metal, ['#8e9397', '#868b8f'], { density: 0.5 }),
  sheetBlue: group('sheet blue', Mat.Metal, ['#3d5f86', '#395a7f'], { density: 0.5, rough: 0.6, metal: 0.3 }),
  sheetWhite: group('sheet white', Mat.Metal, ['#cfd0cb', '#c6c7c2'], { density: 0.5, rough: 0.6, metal: 0.3 }),
  sheetGreen: group('sheet green', Mat.Metal, ['#5a7a62', '#557459'], { density: 0.5, rough: 0.6, metal: 0.3 }),
  sheetRust: group('sheet rust', Mat.Metal, ['#7e4a2c', '#8c5532'], { density: 0.5, rough: 0.85, metal: 0.25 }),
  paintBlue: pal('metal blue', Mat.Metal, '#2f5a8a', { rough: 0.55, metal: 0.35 }),
  paintRed: pal('metal red', Mat.Metal, '#a32a22', { rough: 0.55, metal: 0.35 }),
  paintYellow: group('metal yellow', Mat.Metal, ['#d9a521', '#cf9c1f'], { rough: 0.55, metal: 0.35 }),
  paintGreen: pal('metal green', Mat.Metal, '#3d6b45', { rough: 0.55, metal: 0.35 }),
  paintOrange: pal('metal orange', Mat.Metal, '#d0661f', { rough: 0.55, metal: 0.35 }),
  paintWhite: pal('metal white', Mat.Metal, '#d6d6d0', { rough: 0.55, metal: 0.3 }),
  paintBlack: pal('metal black', Mat.Metal, '#222325', { rough: 0.55, metal: 0.4 }),
  paintGreyBlue: pal('metal grey blue', Mat.Metal, '#59687a', { rough: 0.55, metal: 0.35 }),
  paintDarkGreen: pal('metal dark green', Mat.Metal, '#2e4a35', { rough: 0.55, metal: 0.35 }),
  contRed: group('container red', Mat.Metal, ['#8f2f24', '#852b21'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contBlue: group('container blue', Mat.Metal, ['#2b4f7c', '#284973'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contGreen: group('container green', Mat.Metal, ['#3f6b4b', '#3a6345'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contOrange: group('container orange', Mat.Metal, ['#c8642a', '#bd5e27'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contGrey: group('container grey', Mat.Metal, ['#8a8f92', '#83888b'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contMaroon: group('container maroon', Mat.Metal, ['#6b2a2a', '#632727'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  contWhite: group('container white', Mat.Metal, ['#cfcfc8', '#c5c5be'], { density: 0.6, rough: 0.6, metal: 0.3 }),
  railSteel: pal('rail steel', Mat.Metal, '#6a625a', { rough: 0.35, metal: 0.8 }),
  carRed: pal('car red', Mat.Metal, '#8e1c1c', { density: 0.45, rough: 0.25, metal: 0.5 }),
  carBlue: pal('car blue', Mat.Metal, '#1f3d6e', { density: 0.45, rough: 0.25, metal: 0.5 }),
  carWhite: pal('car white', Mat.Metal, '#d9d9d4', { density: 0.45, rough: 0.25, metal: 0.4 }),
  carBlack: pal('car black', Mat.Metal, '#1b1c1e', { density: 0.45, rough: 0.25, metal: 0.5 }),
  carSilver: pal('car silver', Mat.Metal, '#9ea3a8', { density: 0.45, rough: 0.25, metal: 0.7 }),
  carGreen: pal('car green', Mat.Metal, '#2f4f3a', { density: 0.45, rough: 0.3, metal: 0.45 }),
  carYellow: pal('car yellow', Mat.Metal, '#d6a419', { density: 0.45, rough: 0.3, metal: 0.4 }),
  truckOrange: pal('truck orange', Mat.Metal, '#c9581c', { density: 0.5, rough: 0.35, metal: 0.4 }),
  chrome: pal('chrome', Mat.Metal, '#c8ccd0', { rough: 0.15, metal: 0.95 }),
  copper: pal('copper', Mat.Metal, '#b06a3a', { rough: 0.4, metal: 0.9 }),
  grate: pal('grate', Mat.Metal, '#5d6064', { density: 0.4 }),
  shutter: group('shutter', Mat.Metal, ['#8e9397', '#83888c'], { density: 0.35 }),
  // --- heavy metal (machines)
  machineGreen: group('machine green', Mat.HeavyMetal, ['#4f6656', '#4a6051']),
  machineGrey: group('machine grey', Mat.HeavyMetal, ['#6b7075', '#656a6f']),
  machineBlue: group('machine blue', Mat.HeavyMetal, ['#3c5a78', '#385470']),
  machineOrange: pal('machine orange', Mat.HeavyMetal, '#b5612a'),
  machineYellow: pal('machine yellow', Mat.HeavyMetal, '#c99a22'),
  castIron: group('cast iron', Mat.HeavyMetal, ['#303234', '#36383a']),
  heavySteel: pal('heavy steel', Mat.HeavyMetal, '#55585c'),
  // --- glass
  glass: pal('window glass', Mat.Glass, '#a9c9d2'),
  glassDark: pal('dark glass', Mat.Glass, '#5d7d88'),
  glassFrost: pal('frosted glass', Mat.Glass, '#cad9da', { rough: 0.3 }),
  glassGreen: pal('green glass', Mat.Glass, '#7aa58a'),
  // --- plastic / rubber / fabric
  plasticWhite: pal('plastic white', Mat.Plastic, '#d8d8d2'),
  plasticBlack: pal('plastic black', Mat.Plastic, '#262626'),
  plasticBlue: pal('plastic blue', Mat.Plastic, '#2552a0'),
  plasticOrange: pal('plastic orange', Mat.Plastic, '#e0601a'),
  plasticRed: pal('plastic red', Mat.Plastic, '#b02a2a'),
  plasticGreen: pal('plastic green', Mat.Plastic, '#3a7a3a'),
  plasticYellow: pal('plastic yellow', Mat.Plastic, '#d8b830'),
  plasticGrey: pal('plastic grey', Mat.Plastic, '#808080'),
  ibcWhite: pal('ibc white', Mat.Plastic, '#e2e2da', { rough: 0.6 }),
  rubber: group('rubber', Mat.Rubber, ['#1e1e1f', '#2a2a2b']),
  tarpBlue: pal('tarp blue', Mat.Fabric, '#2d5d9a'),
  tarpGreen: pal('tarp green', Mat.Fabric, '#4a6a3a'),
  carpet: group('carpet', Mat.Fabric, ['#5f6266', '#595c60']),
  carpetBlue: pal('carpet blue', Mat.Fabric, '#3e4c66'),
  seat: pal('seat fabric', Mat.Fabric, '#4a4a52'),
  cardboard: group('cardboard', Mat.Fabric, ['#b08d5f', '#a6845a'], { density: 0.15 }),
  paper: pal('paper', Mat.Fabric, '#e8e6dc', { density: 0.3 }),
  // --- foliage
  leaves: group('leaves', Mat.Foliage, ['#3e5f24', '#4a6d2b', '#355220', '#44662a']),
  leavesYellow: group('leaves yellow', Mat.Foliage, ['#6f7a2a', '#7d8030']),
  bush: group('bush', Mat.Foliage, ['#3f5a28', '#365024']),
  // --- explosives
  propane: pal('propane tank', Mat.Explosive, '#d4d4cc'),
  fuelRed: pal('fuel barrel red', Mat.Explosive, '#b52a1e'),
  gasRed: pal('gas cylinder red', Mat.Explosive, '#a01e1e'),
  gasBlue: pal('gas cylinder blue', Mat.Explosive, '#22447a'),
  gasYellow: pal('gas cylinder yellow', Mat.Explosive, '#d6b020'),
  tnt: pal('tnt', Mat.Explosive, '#9a1a14'),
  gasWhite: pal('gas tank white', Mat.Explosive, '#e0e0da'),
  oilTank: pal('transformer oil', Mat.Explosive, '#8d9398'),
  fuelTank: pal('fuel tank', Mat.Explosive, '#cfcfc8'),
  // --- emissive lights
  lampWarm: pal('lamp warm', Mat.Light, '#ffd9a0', { emissive: 7 }),
  lampCool: pal('lamp cool', Mat.Light, '#e2f0ff', { emissive: 7 }),
  lampRed: pal('lamp red', Mat.Light, '#ff3a26', { emissive: 5 }),
  lampGreen: pal('lamp green', Mat.Light, '#46ff6a', { emissive: 4 }),
  lampOrange: pal('lamp orange', Mat.Light, '#ffa030', { emissive: 6 }),
  screen: pal('screen', Mat.Light, '#6ab0ff', { emissive: 1.6 }),
  // --- debris & burnt
  rubbleConcrete: group('rubble concrete', Mat.Rubble, ['#8a8780', '#7f7c75', '#94918a']),
  rubbleBrick: group('rubble brick', Mat.Rubble, ['#7a4636', '#6e3f31']),
  rubbleDirt: group('rubble dirt', Mat.Rubble, ['#5a4836', '#524231']),
  rubbleWood: group('rubble wood', Mat.Rubble, ['#7a5a3a', '#6d5034']),
  scrap: group('scrap metal', Mat.Rubble, ['#5f5f60', '#6f5244']),
  scrapMix: group('scrap mixed', Mat.Rubble, ['#7e4a2c', '#6b3f28', '#55585c', '#2f4a6e', '#8e2a24', '#1e1e1f', '#9a9d9f']),
  char: group('char', Mat.Char, ['#1c1a18', '#262220', '#2e2925']),
  ash: pal('ash', Mat.Char, '#4a4744'),
};

export const PALETTE_SIZE = PALETTE.length;

// Fast lookup tables -------------------------------------------------------
export const PAL_MAT = new Uint8Array(256);
export const PAL_TRANSPARENT = new Uint8Array(256);
export const PAL_DENSITY = new Float32Array(256);
export const PAL_HARD = new Uint8Array(256);
export const PAL_BLAST = new Float32Array(256);
export const PAL_FLAMMABLE = new Float32Array(256);
export const PAL_BOND = new Float32Array(256);
export const PAL_FRICTION = new Float32Array(256);
export const PAL_RESTITUTION = new Float32Array(256);
/** Palette index a voxel turns into when charred by fire (0 = no change). */
export const PAL_CHAR = new Uint8Array(256);
/** Palette index for loose rubble produced from this voxel. */
export const PAL_RUBBLE = new Uint8Array(256);

for (let i = 0; i < 256; i++) {
  const e = PALETTE[i] ?? PALETTE[0];
  const m = MATERIALS[e.mat];
  PAL_MAT[i] = e.mat;
  PAL_TRANSPARENT[i] = m.transparent ? 1 : 0;
  PAL_DENSITY[i] = e.density > 0 ? e.density : m.density;
  PAL_HARD[i] = i === 0 ? 0 : m.hardness;
  PAL_BLAST[i] = m.blast;
  PAL_FLAMMABLE[i] = m.flammable;
  PAL_BOND[i] = m.bond;
  PAL_FRICTION[i] = m.friction;
  PAL_RESTITUTION[i] = m.restitution;
}

for (let i = 1; i < PALETTE_SIZE; i++) {
  const mat = PALETTE[i].mat;
  switch (mat) {
    case Mat.Wood: case Mat.Fabric: case Mat.Foliage: case Mat.Plastic: case Mat.Grass:
      PAL_CHAR[i] = P.char + (i % 3); break;
    case Mat.Rubber: PAL_CHAR[i] = P.char; break;
    default: PAL_CHAR[i] = 0;
  }
  switch (mat) {
    case Mat.Concrete: case Mat.Asphalt: case Mat.Plaster: case Mat.Rock: PAL_RUBBLE[i] = P.rubbleConcrete + (i % 3); break;
    case Mat.Brick: PAL_RUBBLE[i] = P.rubbleBrick + (i % 2); break;
    case Mat.Dirt: case Mat.Grass: case Mat.Gravel: PAL_RUBBLE[i] = P.rubbleDirt + (i % 2); break;
    case Mat.Wood: PAL_RUBBLE[i] = P.rubbleWood + (i % 2); break;
    case Mat.Metal: case Mat.HeavyMetal: PAL_RUBBLE[i] = P.scrap + (i % 2); break;
    default: PAL_RUBBLE[i] = 0;
  }
}

/**
 * Procedural surface pattern used by the shader for each palette entry:
 * 0 none, 1 brick, 2 planks, 3 corrugated, 4 concrete, 5 asphalt, 6 grass, 7 dirt, 8 tiles, 9 rust, 10 foliage, 11 container
 */
export const PAL_PATTERN = new Uint8Array(256);
for (let i = 1; i < PALETTE_SIZE; i++) {
  const e = PALETTE[i];
  const n = e.name;
  let pt = 0;
  switch (e.mat) {
    case Mat.Brick: pt = n.startsWith('mortar') ? 4 : 1; break;
    case Mat.Wood: pt = n.startsWith('bark') ? 7 : 2; break;
    case Mat.Concrete: pt = n.startsWith('epoxy') ? 0 : 4; break;
    case Mat.Asphalt: pt = n.startsWith('line') ? 4 : 5; break;
    case Mat.Grass: pt = 6; break;
    case Mat.Dirt: case Mat.Gravel: case Mat.Rubble: case Mat.Rock: pt = 7; break;
    case Mat.Foliage: pt = 10; break;
    case Mat.Plaster: pt = n.startsWith('ceiling') ? 8 : 0; break;
    case Mat.Metal:
      if (n.startsWith('galv') || n.startsWith('sheet')) pt = 3;
      else if (n.startsWith('container')) pt = 11;
      else if (n.startsWith('rust') || n.startsWith('steel') || n.startsWith('rail')) pt = 9;
      break;
    case Mat.HeavyMetal: pt = n.startsWith('cast') ? 9 : 0; break;
  }
  PAL_PATTERN[i] = pt;
}

/** Palette entries that never carry structural load (doors, shutters...). Glass/lamps/foliage are excluded by material. */
export const PAL_NOLOAD = new Uint8Array(256);
for (let i = 0; i < PAL_GROUP[P.shutter]; i++) PAL_NOLOAD[P.shutter + i] = 1;

/** Pick a shade variant of a palette group deterministically from a hash. */
export function variant(base: number, h: number): number {
  const n = PAL_GROUP[base];
  return n > 1 ? base + (h % n) : base;
}

export function matOf(p: number): MaterialDef { return MATERIALS[PAL_MAT[p]]; }

/** sRGB (0..255) -> linear float */
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
