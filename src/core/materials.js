// Physical material table (how things weigh, bounce, break and sound) and the
// library of render surfaces built on top of it.
import * as THREE from 'three';
import { getTexture } from '../render/textures.js';

/**
 * Physical materials.
 *  density      kg/m³ of the solid material
 *  friction / restitution
 *  hardness     0..1 — soft things deliver gentler blows to hard things
 *  fracture     impulse (N·s) that breaks a plate `refThick` metres thick
 *  joint        strength of a built joint: N·s per √m² of contact
 *  fragJoint    how strongly freshly cracked fragments still cling together
 *  shock        fraction of a blow passed on through a joint to the next part
 *  fatigue      share of a sub-critical blow that accumulates as damage
 *  pattern      fracture pattern: radial | tempered | wood | chunky | null
 *  minFrag      fragments smaller than this volume (m³) become loose particles
 *  ductile      joints bend before they break
 *  brittle      0..1 — brittle cracks run on from piece to piece instead of the load
 *               being shared out between a piece's joints; crackLen = how far (m)
 */
export const PHYS = {
  glass: {
    name: 'glass', density: 2500, friction: 0.42, restitution: 0.08, hardness: 1.0,
    fracture: 2.4, refThick: 0.006, joint: 70, fragJoint: 5.5, shock: 0.82, fatigue: 0.25,
    pattern: 'radial', minFrag: 2.2e-7, sound: 'glass', chips: 'glass', dust: 0xdfeaf2, brittle: 1, crackLen: 0.14,
  },
  tempered: {
    name: 'tempered', density: 2500, friction: 0.42, restitution: 0.08, hardness: 1.0,
    fracture: 9, refThick: 0.004, joint: 90, fragJoint: 1.2, shock: 0.98, fatigue: 0.1,
    pattern: 'tempered', minFrag: 1.2e-7, sound: 'glass', chips: 'glass', dust: 0xdfeaf2, brittle: 1, crackLen: 2,
  },
  wood: {
    name: 'wood', density: 640, friction: 0.55, restitution: 0.16, hardness: 0.6,
    fracture: 40, refThick: 0.018, joint: 1000, fragJoint: 150, shock: 0.5, fatigue: 0.18,
    pattern: 'wood', minFrag: 1.5e-6, sound: 'wood', chips: 'wood', dust: 0xcdb592,
  },
  metal: {
    name: 'metal', density: 7800, friction: 0.45, restitution: 0.2, hardness: 1.0,
    fracture: Infinity, refThick: 0.002, joint: 2600, fragJoint: 2000, shock: 0.6, fatigue: 0.05,
    pattern: null, minFrag: 1e-6, sound: 'metal', chips: 'metal', dust: 0xb9bcc2, ductile: true,
  },
  plastic: {
    name: 'plastic', density: 1150, friction: 0.42, restitution: 0.28, hardness: 0.5,
    fracture: 10, refThick: 0.003, joint: 420, fragJoint: 45, shock: 0.5, fatigue: 0.2,
    pattern: 'chunky', minFrag: 6e-7, sound: 'plastic', chips: 'plastic', dust: 0x8a8d92,
  },
  ceramic: {
    name: 'ceramic', density: 2300, friction: 0.5, restitution: 0.1, hardness: 0.95,
    fracture: 2.3, refThick: 0.006, joint: 34, fragJoint: 8, shock: 0.88, fatigue: 0.3,
    pattern: 'chunky', minFrag: 3e-7, sound: 'ceramic', chips: 'ceramic', dust: 0xeee6d8, brittle: 1, crackLen: 0.075,
  },
  electronics: {
    name: 'electronics', density: 1850, friction: 0.45, restitution: 0.2, hardness: 0.6,
    fracture: 7, refThick: 0.002, joint: 260, fragJoint: 30, shock: 0.5, fatigue: 0.2,
    pattern: 'chunky', minFrag: 6e-7, sound: 'electronics', chips: 'plastic', dust: 0x5c6b5e, sparks: true,
  },
  concrete: {
    name: 'concrete', density: 2300, friction: 0.7, restitution: 0.05, hardness: 0.9,
    fracture: 170, refThick: 0.1, joint: 900, fragJoint: 260, shock: 0.5, fatigue: 0.2,
    pattern: 'chunky', minFrag: 4e-6, sound: 'concrete', chips: 'concrete', dust: 0xb5b2aa, brittle: 0.4, crackLen: 0.1,
  },
  paper: {
    name: 'paper', density: 720, friction: 0.6, restitution: 0.05, hardness: 0.25,
    fracture: Infinity, refThick: 0.03, joint: 60, fragJoint: 60, shock: 0.3, fatigue: 0,
    pattern: null, minFrag: 1e-6, sound: 'paper', chips: 'paper', dust: 0xe8e2d2,
  },
  fabric: {
    name: 'fabric', density: 160, friction: 0.8, restitution: 0.02, hardness: 0.12,
    fracture: Infinity, refThick: 0.05, joint: 700, fragJoint: 300, shock: 0.25, fatigue: 0,
    pattern: null, minFrag: 1e-6, sound: 'fabric', chips: 'fabric', dust: 0x55595f,
  },
  rubber: {
    name: 'rubber', density: 1100, friction: 0.9, restitution: 0.45, hardness: 0.2,
    fracture: Infinity, refThick: 0.02, joint: 500, fragJoint: 300, shock: 0.25, fatigue: 0,
    pattern: null, minFrag: 1e-6, sound: 'rubber', chips: 'plastic', dust: 0x333333,
  },
};

// ---------------------------------------------------------------------------
// Render surfaces
// ---------------------------------------------------------------------------

const SURF = {
  // woods
  oak: { phys: 'wood', tex: 'wood_oak', bump: 'wood_bump', bumpScale: 0.6, rough: 0.58, scale: 0.6, int: 'woodraw' },
  walnut: { phys: 'wood', tex: 'wood_walnut', bump: 'wood_bump', bumpScale: 0.6, rough: 0.5, scale: 0.6, int: 'woodraw_dark' },
  pine: { phys: 'wood', tex: 'wood_pine', bump: 'wood_bump', bumpScale: 0.5, rough: 0.62, scale: 0.6, int: 'woodraw' },
  whitewood: { phys: 'wood', tex: 'wood_white', bump: 'wood_bump', bumpScale: 0.25, rough: 0.42, scale: 0.6, int: 'woodraw' },
  hardboard: { phys: 'wood', color: 0x8a6a4c, bump: 'noise_bump', bumpScale: 0.25, rough: 0.82, scale: 0.3, int: 'woodraw_dark' },
  woodraw: { phys: 'wood', tex: 'wood_raw', bump: 'wood_bump', bumpScale: 1.6, rough: 0.92, scale: 0.35 },
  woodraw_dark: { phys: 'wood', tex: 'wood_raw', color: 0xb89b7c, bump: 'wood_bump', bumpScale: 1.6, rough: 0.92, scale: 0.35 },
  // glass
  glass: { phys: 'glass', glass: true, color: 0xcfe9e2, opacity: 0.26, int: 'glass_edge' },
  glass_tinted: { phys: 'tempered', glass: true, color: 0x39424a, opacity: 0.42, int: 'glass_edge_dark' },
  glass_porthole: { phys: 'glass', glass: true, color: 0xb9d4e2, opacity: 0.3, int: 'glass_edge' },
  glass_edge: { phys: 'glass', glass: true, color: 0x9fdcc2, opacity: 0.62, rough: 0.25 },
  glass_edge_dark: { phys: 'tempered', glass: true, color: 0x8fbfb2, opacity: 0.7, rough: 0.3 },
  glass_dead: { phys: 'glass', color: 0x050608, rough: 0.08, metal: 0.0, int: 'glass_edge' },
  // metals
  steel: { phys: 'metal', tex: 'metal_brushed', bump: 'brushed_bump', bumpScale: 0.15, rough: 0.36, metal: 1, scale: 0.4 },
  chrome: { phys: 'metal', color: 0xe8eaee, rough: 0.12, metal: 1 },
  aluminium: { phys: 'metal', tex: 'metal_brushed', color: 0xc9ccd2, bump: 'brushed_bump', bumpScale: 0.08, rough: 0.42, metal: 0.95, scale: 0.4 },
  enamel: { phys: 'metal', tex: 'metal_enamel', rough: 0.24, metal: 0.12, scale: 0.5 },
  darksteel: { phys: 'metal', tex: 'metal_dark', bump: 'noise_bump', bumpScale: 0.12, rough: 0.5, metal: 0.75, scale: 0.4 },
  brass: { phys: 'metal', color: 0xc9a14a, rough: 0.28, metal: 1 },
  blacksteel: { phys: 'metal', color: 0x1b1c1f, rough: 0.45, metal: 0.8 },
  // plastics
  plastic_black: { phys: 'plastic', tex: 'plastic_dark', bump: 'noise_bump', bumpScale: 0.2, rough: 0.55, scale: 0.25, int: 'plastic_black_int' },
  plastic_black_int: { phys: 'plastic', color: 0x2c2d31, rough: 0.9 },
  plastic_grey: { phys: 'plastic', tex: 'plastic_light', bump: 'noise_bump', bumpScale: 0.2, rough: 0.5, scale: 0.25, int: 'plastic_grey_int' },
  plastic_grey_int: { phys: 'plastic', color: 0xd4d6da, rough: 0.9 },
  plastic_white: { phys: 'plastic', color: 0xf1f1ee, rough: 0.38, int: 'plastic_grey_int' },
  plastic_gloss: { phys: 'plastic', color: 0x0b0c0e, rough: 0.16, int: 'plastic_black_int' },
  rubber: { phys: 'rubber', tex: 'rubber', bump: 'noise_bump', bumpScale: 0.2, rough: 0.95, scale: 0.2 },
  // ceramics
  ceramic_vase: { phys: 'ceramic', tex: 'ceramic_vase', rough: 0.14, int: 'ceramic_raw', alt: 'ceramic_inner' },
  ceramic_inner: { phys: 'ceramic', color: 0xe9e4d8, rough: 0.5 },
  ceramic_raw: { phys: 'ceramic', tex: 'ceramic_raw', bump: 'noise_bump', bumpScale: 0.5, rough: 0.95, scale: 0.12 },
  ceramic_white: { phys: 'ceramic', color: 0xf4f2ec, rough: 0.14, int: 'ceramic_raw', alt: 'ceramic_white_in' },
  ceramic_white_in: { phys: 'ceramic', color: 0xf0eee8, rough: 0.2 },
  ceramic_blue: { phys: 'ceramic', color: 0x2c4f8f, rough: 0.14, int: 'ceramic_raw', alt: 'ceramic_inner' },
  terracotta: { phys: 'ceramic', color: 0xb5613c, rough: 0.8, int: 'ceramic_raw', alt: 'terracotta' },
  // electronics
  pcb_green: { phys: 'electronics', tex: 'pcb_green', rough: 0.55, metal: 0.15, fit: true, int: 'pcb_int' },
  pcb_blue: { phys: 'electronics', tex: 'pcb_blue', rough: 0.55, metal: 0.15, fit: true, int: 'pcb_int' },
  pcb_int: { phys: 'electronics', color: 0xb9a36a, rough: 0.9 },
  // misc
  concrete: { phys: 'concrete', tex: 'concrete', bump: 'noise_bump', bumpScale: 0.8, rough: 0.95, scale: 0.4 },
  fabric: { phys: 'fabric', tex: 'fabric', bump: 'fabric_bump', bumpScale: 0.8, rough: 0.98, scale: 0.18 },
  foam: { phys: 'fabric', color: 0xd9c98a, rough: 1.0 },
  paper: { phys: 'paper', tex: 'book_pages', rough: 0.9, scale: 0.05 },
  cardboard: { phys: 'paper', color: 0xb08a5a, rough: 0.9 },
  leaf: { phys: 'fabric', color: 0x3f7a3a, rough: 0.8 },
  soil: { phys: 'concrete', color: 0x3a2a1e, rough: 1.0 },
};

const cache = new Map();

function tex(name) {
  try {
    return getTexture(name);
  } catch (e) {
    console.warn('missing texture', name, e);
    return null;
  }
}

function makeMaterial(d) {
  if (d.glass) {
    return new THREE.MeshStandardMaterial({
      color: d.color,
      transparent: true,
      opacity: d.opacity,
      roughness: d.rough ?? 0.03,
      metalness: 0,
      envMapIntensity: 1.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  const m = new THREE.MeshStandardMaterial({
    color: d.color ?? 0xffffff,
    roughness: d.rough ?? 0.6,
    metalness: d.metal ?? 0,
  });
  if (d.tex) m.map = tex(d.tex);
  if (d.bump) {
    m.bumpMap = tex(d.bump);
    m.bumpScale = d.bumpScale ?? 0.5;
  }
  return m;
}

/**
 * Look up a surface: returns { name, phys, mats:[exterior, interior, alt], scale, fit }.
 */
export function surface(name) {
  let s = cache.get(name);
  if (s) return s;
  const d = SURF[name];
  if (!d) throw new Error('unknown surface: ' + name);
  const ext = makeMaterial(d);
  ext.name = name;
  const mats = [ext];
  s = { name, phys: PHYS[d.phys], mats, scale: d.scale ?? 0.5, fit: !!d.fit, glass: !!d.glass };
  cache.set(name, s);
  const int = d.int ? surface(d.int).mats[0] : ext;
  mats.push(int);
  mats.push(d.alt ? (d.alt === name ? ext : surface(d.alt).mats[0]) : ext);
  return s;
}

/** A tinted variant of a surface (books, decorations…). Cached by colour. */
export function tinted(name, color, extra) {
  const key = name + '#' + color.toString(16) + (extra ? JSON.stringify(extra) : '');
  let s = cache.get(key);
  if (s) return s;
  const base = surface(name);
  const ext = base.mats[0].clone();
  ext.color = new THREE.Color(color);
  if (extra) Object.assign(ext, extra);
  s = { ...base, name: key, mats: [ext, base.mats[1] === base.mats[0] ? ext : base.mats[1], base.mats[2] === base.mats[0] ? ext : base.mats[2]] };
  cache.set(key, s);
  return s;
}

/** Book cover material: tinted cover texture. */
export function bookSurface(color) {
  const key = 'book#' + color.toString(16);
  let s = cache.get(key);
  if (s) return s;
  const cover = new THREE.MeshStandardMaterial({ color, roughness: 0.62, map: tex('book_cover') });
  const pages = surface('paper').mats[0];
  s = { name: key, phys: PHYS.paper, mats: [cover, pages, pages], scale: 1, fit: false };
  cache.set(key, s);
  return s;
}

/**
 * Per-instance emissive screen material set (each display owns its own so it
 * can flicker and lose power independently).
 */
export function makeScreenMaterials(imageName, brightness = 1.0) {
  const img = tex(imageName);
  const live = new THREE.MeshStandardMaterial({
    color: 0x050506, roughness: 0.12, metalness: 0,
    emissive: 0xffffff, emissiveMap: img, emissiveIntensity: brightness,
  });
  const glitch = new THREE.MeshStandardMaterial({
    color: 0x050506, roughness: 0.14, metalness: 0,
    emissive: 0xffffff, emissiveMap: tex('screen_glitch'), emissiveIntensity: brightness * 1.1,
  });
  const dead = surface('glass_dead').mats[0];
  const edge = surface('glass_edge').mats[0];
  const backlight = new THREE.MeshStandardMaterial({
    color: 0xe8ecf2, roughness: 0.7, emissive: 0xdfe8ff, emissiveIntensity: brightness * 0.75,
  });
  return { live, glitch, dead, edge, backlight, brightness };
}

export function surfaceNames() {
  return Object.keys(SURF);
}
