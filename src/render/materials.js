// Shared materials, rebuilt per dungeon theme.
import * as THREE from 'three';
import {
  makeBrickTexture, makeFloorTexture, makeRockTexture, makeWoodTexture, makeMetalTexture,
  makeClothTexture, makeLavaTexture, makeSplatTexture, makeRadialTexture, makeSmokeTexture, makeRuneTexture,
} from './textures.js';

let shared = null;

// Theme-independent materials & sprites (built once).
export function sharedAssets(envMap = null) {
  if (shared) return shared;
  const wood = makeWoodTexture('#7a5536', 41);
  const darkWood = makeWoodTexture('#4a3220', 42, 3);
  const metal = makeMetalTexture('#9a9a9e', 43);
  const darkMetal = makeMetalTexture('#4a4a50', 44);
  const gold = makeMetalTexture('#d9a540', 45);
  const cloth = makeClothTexture('#7a2525', 46);
  shared = {
    tex: {
      splats: [1, 2, 3, 4].map((s) => makeSplatTexture(100 + s)),
      glow: makeRadialTexture(1, 2.2),
      softGlow: makeRadialTexture(1, 1.2),
      shadow: makeRadialTexture(0.7, 1.4),
      smoke: makeSmokeTexture(),
      rune: makeRuneTexture(),
      lava: makeLavaTexture(),
    },
    wood: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.85 }),
    darkWood: new THREE.MeshStandardMaterial({ map: darkWood.map, normalMap: darkWood.normalMap, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ map: metal.map, normalMap: metal.normalMap, roughness: 0.38, metalness: 0.85, color: 0xb8b8c0 }),
    darkMetal: new THREE.MeshStandardMaterial({ map: darkMetal.map, normalMap: darkMetal.normalMap, roughness: 0.5, metalness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ map: darkMetal.map, roughness: 0.75, metalness: 0.5, color: 0x8a5a40 }),
    gold: new THREE.MeshStandardMaterial({ map: gold.map, normalMap: gold.normalMap, roughness: 0.3, metalness: 1.0, color: 0xffd27a }),
    cloth: new THREE.MeshStandardMaterial({ map: cloth.map, normalMap: cloth.normalMap, roughness: 0.95, side: THREE.DoubleSide }),
    clothBlue: new THREE.MeshStandardMaterial({ map: cloth.map, roughness: 0.95, color: 0x5577cc, side: THREE.DoubleSide }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.7 }),
    candle: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6, emissive: 0x332211 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    clay: new THREE.MeshStandardMaterial({ color: 0x8a6048, roughness: 0.8 }),
    clayDark: new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85 }),
    redBarrel: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, color: 0xd04030, roughness: 0.7 }),
    web: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    paper: new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 0.9 }),
    books: [0x7a2a2a, 0x2a4a7a, 0x2a6a3a, 0x6a5a2a, 0x4a2a5a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
    lava: new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 2.6, roughness: 0.6 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1d4a50, roughness: 0.32, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
  };
  if (envMap) for (const k of ['metal', 'darkMetal', 'gold', 'rust']) { shared[k].envMap = envMap; shared[k].envMapIntensity = k === 'gold' ? 1.2 : 0.8; }
  shared.envMap = envMap;
  shared.lava.emissiveMap = shared.tex.lava.map;
  shared.lava.map = shared.tex.lava.map;
  shared.shadow.alphaMap = null;
  shared.shadow.map = shared.tex.shadow;
  shared.water.normalMap = makeRockTexture({ ceiling: '#808080' }, 77).normalMap;
  shared.water.normalScale = new THREE.Vector2(0.35, 0.35);
  return shared;
}

const themeCache = new Map();

export function themeMaterials(theme) {
  if (themeCache.has(theme.id)) return themeCache.get(theme.id);
  const seed = theme.id.length * 31 + theme.wall.charCodeAt(2);
  const wall = makeBrickTexture(theme, seed);
  const cracked = makeBrickTexture(theme, seed, { cracks: 14 });
  const trim = makeBrickTexture({ ...theme, wall: theme.mortar === '#140806' ? '#3a2420' : theme.floor, moss: null }, seed + 3, { rows: 4, gap: 5 });
  const floor = makeFloorTexture(theme, seed + 1);
  const rock = makeRockTexture(theme, seed + 2);
  const m = {
    wall: new THREE.MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, roughness: 0.92, vertexColors: true }),
    cracked: new THREE.MeshStandardMaterial({ map: cracked.map, normalMap: cracked.normalMap, roughness: 0.92 }),
    trim: new THREE.MeshStandardMaterial({ map: trim.map, normalMap: trim.normalMap, roughness: 0.9, vertexColors: true, color: 0xb0a8a0 }),
    floor: new THREE.MeshStandardMaterial({ map: floor.map, normalMap: floor.normalMap, roughness: 0.82, vertexColors: true }),
    ceiling: new THREE.MeshStandardMaterial({ map: rock.map, normalMap: rock.normalMap, roughness: 0.95, vertexColors: true }),
    stone: new THREE.MeshStandardMaterial({ map: trim.map, normalMap: trim.normalMap, roughness: 0.85, color: 0xc8c0b8 }),
    pitFloor: new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 1 }),
  };
  m.wall.normalScale.set(1.2, 1.2);
  m.floor.normalScale.set(1.1, 1.1);
  themeCache.set(theme.id, m);
  return m;
}
