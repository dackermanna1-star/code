// The hotel's materials (physically based, so the flashlight rakes across
// embossed wallpaper, wood grain and grout). userData.tile is how many
// studs one repeat of the texture covers.
import * as THREE from 'three';
import * as T from './textures.js';

let M = null;
let ENV = null;

/** A dim, warm environment for the metals to reflect (not used to light anything). */
function envMap(renderer) {
  if (ENV || !renderer) return ENV;
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x050403);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.6, 8, 6), new THREE.MeshBasicMaterial({ color: i % 4 ? 0x6a4a28 : 0x2a3448 }));
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2;
    m.position.set(Math.cos(a) * 8 * Math.cos(e), Math.sin(e) * 8, Math.sin(a) * 8 * Math.cos(e)); s.add(m);
  }
  ENV = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return ENV;
}

function std(o) {
  const { tile, bump, bumpScale, ...rest } = o;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true, ...rest });
  if (bump) { m.bumpMap = bump; m.bumpScale = bumpScale ?? 1; }
  m.userData.tile = tile ?? 4;
  return m;
}
const withBump = (tex, o = {}) => ({ map: tex, bump: T.bumpOf(tex.uuid, tex, o), bumpScale: o.scale ?? 0.8 });

let R = null;
export function materials(renderer) {
  if (M && R === renderer) return M;
  if (R !== renderer) ENV = null;
  R = renderer;
  const env = envMap(renderer);
  M = {};
  // walls
  M.wallGreen = std({ ...withBump(T.damask('green', '#1c3328', '#2c4e3c', 1, { sheen: 'rgba(160,140,80,0.25)' }), { scale: 0.5 }), roughness: 0.82, tile: 7 });
  M.wallRose = std({ ...withBump(T.damask('rose', '#4e3230', '#644240', 2), { scale: 0.5 }), tile: 7 });
  M.wallBurgundy = std({ map: T.stripes('burg', '#3a171b', '#461d22', '#7a5a32', 3), tile: 6 });
  M.wallBlue = std({ map: T.stripes('blue', '#232e38', '#2a3642', '#5a6a78', 4), tile: 6 });
  M.wallChild = std({ map: T.stripes('child', '#3e4c5a', '#475666', null, 5, { n: 8, dots: '#b8a060' }), tile: 5 });
  M.wallCream = std({ map: T.marble('lobbyWall', '#cfc2a4', 'rgba(130,100,60,0.35)', 6), roughness: 0.55, tile: 8 });
  M.wallPlaster = std({ map: T.plaster('wall', '#9a9480', 7, { stains: 4 }), tile: 12 });
  M.brickPaint = std({ ...withBump(T.brick('paint', '#7e9078', '#4e5a4c', 8), { scale: 1.2 }), tile: 10 });
  M.brickRed = std({ ...withBump(T.brick('red', '#5e2e22', '#34302c', 9), { scale: 1.4 }), tile: 10 });
  M.subway = std({ ...withBump(T.tiles('subway', '#d8d4c8', '#7a756a', 8, 10, { brick: true }), { scale: 0.6 }), roughness: 0.35, tile: 4 });
  M.concreteWall = std({ map: T.concrete('wall', '#6e6e66', 11), tile: 14 });
  M.stairWall = std({ map: T.concrete('stair', '#5a6258', 12, { stains: 8 }), tile: 14 });
  // trims and wood
  M.panel = std({ ...withBump(T.panels('dark', '#341c0e', 13), { scale: 1.2 }), roughness: 0.55, tile: [4, 4.2] });
  M.woodDark = std({ map: T.wood('dark', '#341a0c', 14), roughness: 0.5, tile: 4 });
  M.woodMid = std({ map: T.wood('mid', '#5e3a1e', 15), roughness: 0.55, tile: 4 });
  M.woodLight = std({ map: T.wood('light', '#8e6640', 16), roughness: 0.6, tile: 4 });
  M.charred = std({ map: T.wood('charred', '#16110d', 17), roughness: 1, tile: 4 });
  M.trim = M.woodDark;
  M.crown = std({ map: T.plaster('crown', '#b4ab96', 18, { stains: 1, cracks: 2 }), roughness: 0.8, tile: 8 });
  // floors
  M.planks = std({ ...withBump(T.planks('oak', '#5a3c22', 19), { scale: 0.6 }), roughness: 0.6, tile: 10 });
  M.parquet = std({ ...withBump(T.parquet('ball', '#6e4628', 20), { scale: 0.5 }), roughness: 0.42, tile: 8 });
  M.runner = std({ map: T.runner('red', '#4a0e10', '#1a0606', '#9a7430', 21), roughness: 0.95, tile: 8 });
  M.carpetGreen = std({ map: T.carpet('green', '#283222', '#3a4630', 22), roughness: 0.95, tile: 6 });
  M.carpetRed = std({ map: T.carpet('red', '#43171a', '#5e2620', 23), roughness: 0.95, tile: 6 });
  M.marbleFloor = std({ map: T.marbleChecker(24), roughness: 0.22, tile: 6, envMap: env, envMapIntensity: 0.4 });
  M.marbleWhite = std({ map: T.marble('white', '#e2dccf', 'rgba(110,100,90,0.45)', 25), roughness: 0.25, tile: 6, envMap: env, envMapIntensity: 0.35 });
  M.marbleBlack = std({ map: T.marble('black', '#1a1817', 'rgba(210,200,180,0.28)', 26), roughness: 0.22, tile: 6, envMap: env, envMapIntensity: 0.4 });
  M.tileFloor = std({ ...withBump(T.tiles('bath', '#d4d0c6', '#4a4640', 4, 27, { checker: '#262626' }), { scale: 0.5 }), roughness: 0.3, tile: 3 });
  M.hexFloor = std({ map: T.hexTiles(28), roughness: 0.35, tile: 4 });
  M.concrete = std({ ...withBump(T.concrete('floor', '#5e5e5a', 29), { scale: 0.5 }), tile: 14 });
  // ceilings
  M.ceiling = std({ ...withBump(T.plaster('ceil', '#a8a090', 30, { stains: 6 }), { scale: 0.4 }), roughness: 0.95, tile: 16 });
  M.ceilingDark = std({ map: T.plaster('ceilDark', '#5e5a50', 31, { stains: 8 }), roughness: 0.95, tile: 16 });
  // metals
  M.brass = std({ color: 0xb08a3a, metalness: 0.9, roughness: 0.35, envMap: env, envMapIntensity: 1 });
  M.gold = std({ color: 0xa47a28, metalness: 0.85, roughness: 0.38, envMap: env, envMapIntensity: 1 });
  M.iron = std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.55, envMap: env, envMapIntensity: 0.5 });
  M.steel = std({ map: T.metal('steel', '#8a8c90', 32), metalness: 0.75, roughness: 0.42, envMap: env, envMapIntensity: 0.8, tile: 4 });
  M.rust = std({ map: T.metal('rust', '#5e5246', 33, { rust: 6 }), metalness: 0.5, roughness: 0.8, envMap: env, envMapIntensity: 0.3, tile: 4 });
  M.chrome = std({ color: 0xc8ccd0, metalness: 1, roughness: 0.15, envMap: env, envMapIntensity: 1.2 });
  M.pipe = std({ color: 0x4a4440, metalness: 0.6, roughness: 0.6, envMap: env, envMapIntensity: 0.4 });
  // fabrics
  M.velvetRed = std({ map: T.fabric('velvetRed', '#4e0c10', 34), roughness: 0.95, tile: 3 });
  M.velvetGreen = std({ map: T.fabric('velvetGreen', '#1a3222', 35), roughness: 0.95, tile: 3 });
  M.bedspread = std({ map: T.fabric('bedspread', '#40121a', 36, { motif: '#7a5a2a' }), roughness: 0.95, tile: 3 });
  M.linen = std({ map: T.fabric('linen', '#cfc8b8', 37, { weave: true }), roughness: 0.95, tile: 3 });
  M.curtain = std({ map: T.fabric('curtain', '#3e080c', 38), roughness: 0.95, tile: 4, side: THREE.DoubleSide });
  M.cloth = std({ map: T.fabric('cloth', '#ccc4b4', 39, { weave: true }), roughness: 0.95, tile: 4, side: THREE.DoubleSide });
  M.sheet = std({ map: T.fabric('sheet', '#bcb8ac', 40, { mottle: 0.3 }), roughness: 1, tile: 5, side: THREE.DoubleSide });
  M.leather = std({ color: 0x2a1408, roughness: 0.6 });
  M.black = std({ color: 0x111111, roughness: 0.8 });
  M.rubber = std({ color: 0x161616, roughness: 0.9 });
  // ceramics, glass, paper
  M.porcelain = std({ color: 0xe6e2da, roughness: 0.22, envMap: env, envMapIntensity: 0.5 });
  M.glass = std({ color: 0x8aa0a8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, envMap: env, envMapIntensity: 1, depthWrite: false });
  M.mirror = std({ color: 0x2a3036, roughness: 0.05, metalness: 1, envMap: env, envMapIntensity: 0.8 });
  M.bottle = std({ color: 0x2a4a2a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6, envMap: env, envMapIntensity: 1 });
  M.paper = std({ map: T.paper(1), roughness: 0.95, tile: [1, 1] });
  M.cardboard = std({ map: T.cardboard(1), roughness: 0.95, tile: 3 });
  M.books = std({ map: T.bookSpines(1), roughness: 0.8, tile: [4, 2] });
  M.cubbies = std({ map: T.keyCubbies(), roughness: 0.6, tile: [1, 1] });
  M.pegboard = std({ map: T.pegboard(), roughness: 0.8, tile: [1, 1] });
  M.stained = new THREE.MeshStandardMaterial({ map: T.stainedGlass(), emissiveMap: T.stainedGlass(), emissive: 0xffffff, emissiveIntensity: 0.08, roughness: 0.4 });
  // the storm outside
  M.window = new THREE.MeshStandardMaterial({ map: T.nightWindow(), emissiveMap: T.nightWindow(), emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.2 });
  M.rain = new THREE.MeshBasicMaterial({ map: T.rainStreaks(), transparent: true, opacity: 0.7, depthWrite: false });
  M.rain.map.repeat.set(2, 1);
  // odds and ends
  M.leaf = std({ color: 0x1c3418, roughness: 0.75, side: THREE.DoubleSide });
  M.lacquer = std({ color: 0x070707, roughness: 0.16, metalness: 0.25, envMap: env, envMapIntensity: 1 });
  M.water = std({ color: 0x090706, roughness: 0.03, metalness: 0.7, envMap: env, envMapIntensity: 1.4 });
  M.keys = std({ map: T.pianoKeys(), roughness: 0.35, tile: [1, 1] });
  M.gauge = std({ map: T.gauge(), roughness: 0.3, tile: [1, 1] });
  M.wax = std({ color: 0xd8ccb0, roughness: 0.6 });
  M.rope = std({ color: 0x6a5a40, roughness: 1 });
  M.skin = std({ color: 0x8a8278, roughness: 0.7 });
  // what the floors sound like underfoot
  for (const [k, s] of Object.entries({ planks: 'wood', parquet: 'wood', runner: 'carpet', carpetGreen: 'carpet', carpetRed: 'carpet', marbleFloor: 'marble', marbleWhite: 'marble', marbleBlack: 'marble', tileFloor: 'tile', hexFloor: 'tile', concrete: 'concrete', charred: 'wood', woodDark: 'wood', woodMid: 'wood', steel: 'metal', iron: 'metal', rust: 'metal' })) M[k].userData.surface = s;
  return M;
}

/** A material showing a texture as-is (signs, paintings, decals). Cached per texture. */
const flatCache = new Map();
export function flat(tex, o = {}) {
  const key = tex.uuid + (o.transparent ? 't' : '') + (o.emissive ?? '') + (o.rough ?? '');
  let m = flatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, transparent: !!o.transparent, alphaTest: o.transparent ? 0.05 : 0, depthWrite: !o.transparent, vertexColors: true, polygonOffset: !!o.decal, polygonOffsetFactor: o.decal ? -2 : 0 });
    if (o.emissive) { m.emissiveMap = tex; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = o.emissive; }
    m.userData.tile = [1, 1];
    flatCache.set(key, m);
  }
  return m;
}
