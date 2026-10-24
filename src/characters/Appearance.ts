import { Rng } from '../core/math';
import type { Build } from './Rig';

export type HairStyle = 'bald' | 'buzz' | 'short' | 'slick' | 'mohawk' | 'long' | 'ponytail' | 'bun' | 'afro' | 'mullet' | 'balding' | 'bob';
export type FacialHair = 'none' | 'stubble' | 'mustache' | 'handlebar' | 'goatee' | 'beard' | 'bigbeard' | 'chinstrap';
export type TopKind =
  | 'tshirt'
  | 'tank'
  | 'longsleeve'
  | 'flannel'
  | 'leather'
  | 'vest'
  | 'hawaiian'
  | 'apron'
  | 'hoodie'
  | 'blouse'
  | 'security'
  | 'bartender'
  | 'suit'
  | 'crop';
export type BottomKind = 'jeans' | 'pants' | 'shorts' | 'skirt' | 'leather' | 'chef';
export type HatKind = 'none' | 'cap' | 'bandana' | 'cowboy' | 'beanie' | 'chef' | 'helmet';

export type Style =
  | 'patron'
  | 'biker'
  | 'bouncer'
  | 'bartender'
  | 'cook'
  | 'waitress'
  | 'drunk'
  | 'nerd'
  | 'brawler'
  | 'boss'
  | 'punk'
  | 'cowboy'
  | 'woman';

export interface FaceParams {
  eyeSpacing: number; // 0.24..0.34 (distance from center, normalized)
  eyeY: number;
  eyeSize: number;
  browThick: number;
  browTilt: number;
  noseType: number;
  noseSize: number;
  mouthWidth: number;
  lipColor: string;
  wrinkles: number; // 0..1
  jaw: number;
  cheek: number; // blush
  scar: boolean;
  eyeColor: string;
}

export interface Appearance {
  seed: number;
  style: Style;
  female: boolean;
  skin: string;
  skinShade: string;
  hairStyle: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
  top: TopKind;
  topColor: string;
  topColor2: string;
  bottom: BottomKind;
  bottomColor: string;
  shoeColor: string;
  hat: HatKind;
  hatColor: string;
  glasses: 'none' | 'sunglasses' | 'glasses';
  tattoos: number; // 0..1 density
  tattooColor: string;
  belt: boolean;
  print: number; // t-shirt print pattern id
  face: FaceParams;
  build: Build;
  voicePitch: number;
  name: string;
}

const SKINS = ['#f3cfb0', '#ecbf9c', '#e0aa84', '#d39770', '#c3825b', '#a96d48', '#8d5637', '#6f4029', '#f7dcc4', '#d8a47e'];
const HAIR = ['#17100c', '#2d1c12', '#4a2f1c', '#6b4527', '#8e6235', '#b88a4a', '#d8b56a', '#e8d49a', '#8d8a86', '#cfcac2', '#8a2e17', '#1e1e22'];
const SHIRT = ['#2a5aa8', '#a82a2a', '#2f7a3a', '#d8d4c8', '#1b1b1f', '#6a3b8a', '#c8862a', '#2d8a8a', '#8a8a8a', '#e0b030', '#3b4a6b', '#7a2222', '#e8e0d0', '#4f6b3a'];
const DENIM = ['#2d4a7a', '#24395e', '#3e5f91', '#1d2a44', '#4a6a9a'];
const PANTS = ['#2b2b2e', '#4a3b2a', '#6b5a40', '#3a3f4a', '#1c1c1f', '#58503f'];
const LEATHER = ['#1a1714', '#2a1e16', '#3b2a1e', '#161616'];
const FIRST_M = ['Earl', 'Dwayne', 'Buck', 'Hank', 'Rusty', 'Duke', 'Vince', 'Moe', 'Larry', 'Big Jim', 'Snake', 'Tex', 'Otis', 'Clyde', 'Gus', 'Ray', 'Dale', 'Butch', 'Lenny', 'Wade', 'Boone', 'Cletus', 'Frank', 'Sal', 'Tony', 'Marv', 'Bubba', 'Jed', 'Skip', 'Rocco'];
const FIRST_F = ['Darlene', 'Tammy', 'Loretta', 'Peg', 'Roxy', 'Dolly', 'Jolene', 'Bev', 'Candy', 'Trixie', 'Marge', 'Rhonda', 'Lou', 'Vera', 'Gina'];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export { shade };

export function makeAppearance(style: Style, seed: number): Appearance {
  const r = new Rng(seed);
  let female = style === 'waitress' || style === 'woman' ? true : style === 'patron' || style === 'punk' || style === 'drunk' || style === 'nerd' ? r.chance(0.22) : false;
  if (style === 'bartender') female = r.chance(0.3);
  const skin = r.pick(SKINS);
  let hairColor = r.pick(HAIR);
  const age = r.next();
  if (age > 0.82) hairColor = r.pick(['#8d8a86', '#cfcac2', '#a8a29a']);

  let hairStyle: HairStyle;
  if (female) hairStyle = r.pick(['long', 'ponytail', 'bun', 'bob', 'long', 'afro'] as HairStyle[]);
  else hairStyle = r.pick(['bald', 'buzz', 'short', 'slick', 'short', 'balding', 'mullet', 'long', 'afro'] as HairStyle[]);

  let facialHair: FacialHair = 'none';
  if (!female) facialHair = r.pick(['none', 'none', 'stubble', 'mustache', 'goatee', 'beard', 'handlebar', 'chinstrap', 'bigbeard'] as FacialHair[]);

  let top: TopKind = r.pick(['tshirt', 'tshirt', 'longsleeve', 'flannel', 'hawaiian', 'hoodie', 'tank'] as TopKind[]);
  if (female) top = r.pick(['blouse', 'crop', 'tshirt', 'tank', 'leather'] as TopKind[]);
  let topColor = r.pick(SHIRT);
  let topColor2 = r.pick(SHIRT);
  let bottom: BottomKind = r.pick(['jeans', 'jeans', 'pants', 'jeans', 'shorts'] as BottomKind[]);
  if (female) bottom = r.pick(['jeans', 'skirt', 'jeans', 'leather'] as BottomKind[]);
  let bottomColor = bottom === 'jeans' ? r.pick(DENIM) : bottom === 'leather' ? r.pick(LEATHER) : r.pick(PANTS);
  let shoeColor = r.pick(['#1a1412', '#3b2416', '#5a3a1f', '#e8e4dc', '#222']);
  let hat: HatKind = r.chance(0.15) ? r.pick(['cap', 'beanie', 'cowboy', 'bandana'] as HatKind[]) : 'none';
  let hatColor = r.pick(SHIRT);
  let glasses: Appearance['glasses'] = r.chance(0.1) ? 'glasses' : r.chance(0.07) ? 'sunglasses' : 'none';
  let tattoos = r.chance(0.25) ? r.range(0.2, 0.7) : 0;
  const build: Build = {
    height: r.range(0.93, 1.07),
    bulk: r.range(0.92, 1.15),
    belly: r.chance(0.3) ? r.range(1.1, 1.4) : 1,
    headScale: r.range(0.96, 1.05),
  };
  if (female) {
    build.height *= 0.94;
    build.bulk *= 0.88;
    build.belly = 1;
  }

  switch (style) {
    case 'biker':
      top = r.pick(['vest', 'leather', 'vest', 'tank', 'flannel'] as TopKind[]);
      topColor = r.pick(LEATHER);
      topColor2 = r.pick(['#d8d4c8', '#1b1b1f', '#7a2222', '#3b4a6b']);
      bottom = r.pick(['jeans', 'leather', 'jeans'] as BottomKind[]);
      bottomColor = bottom === 'jeans' ? r.pick(DENIM) : r.pick(LEATHER);
      shoeColor = r.pick(['#1a1412', '#2a1a10']);
      facialHair = r.pick(['beard', 'bigbeard', 'handlebar', 'goatee', 'beard'] as FacialHair[]);
      hairStyle = r.pick(['bald', 'long', 'buzz', 'mullet', 'slick', 'long'] as HairStyle[]);
      hat = r.chance(0.35) ? r.pick(['bandana', 'cap', 'helmet'] as HatKind[]) : 'none';
      hatColor = r.pick(['#1b1b1f', '#7a2222', '#2a3a6a', '#d8d4c8']);
      tattoos = r.range(0.4, 1);
      glasses = r.chance(0.3) ? 'sunglasses' : 'none';
      build.bulk = r.range(1.05, 1.3);
      build.belly = r.chance(0.5) ? r.range(1.1, 1.45) : 1;
      build.height = r.range(0.98, 1.1);
      break;
    case 'bouncer':
      top = 'security';
      topColor = '#121214';
      topColor2 = '#e8e0c0';
      bottom = 'pants';
      bottomColor = '#18181b';
      shoeColor = '#0e0e0e';
      hairStyle = r.pick(['bald', 'buzz', 'bald'] as HairStyle[]);
      facialHair = r.pick(['none', 'goatee', 'stubble'] as FacialHair[]);
      hat = 'none';
      glasses = r.chance(0.35) ? 'sunglasses' : 'none';
      build.bulk = r.range(1.3, 1.45);
      build.height = r.range(1.08, 1.15);
      build.belly = 1;
      build.headScale = 1.04;
      break;
    case 'bartender':
      top = 'bartender';
      topColor = '#efece4';
      topColor2 = '#1d1d22';
      bottom = 'pants';
      bottomColor = '#1d1d22';
      shoeColor = '#0e0e0e';
      hat = 'none';
      glasses = 'none';
      break;
    case 'cook':
      top = 'apron';
      topColor = '#e9e6dd';
      topColor2 = '#f4f2ec';
      bottom = 'chef';
      bottomColor = '#3a3a3e';
      hat = r.chance(0.6) ? 'chef' : 'bandana';
      hatColor = hat === 'chef' ? '#f4f2ec' : '#7a2222';
      build.belly = r.range(1.1, 1.5);
      break;
    case 'waitress':
      top = 'blouse';
      topColor = r.pick(['#d8d4c8', '#e04a6a', '#2a5aa8']);
      topColor2 = '#f4f2ec';
      bottom = 'skirt';
      bottomColor = '#1d1d22';
      hat = 'none';
      break;
    case 'drunk':
      top = r.pick(['hawaiian', 'tshirt', 'longsleeve'] as TopKind[]);
      build.belly = r.range(1.2, 1.5);
      glasses = 'none';
      break;
    case 'nerd':
      top = r.pick(['longsleeve', 'suit', 'hoodie'] as TopKind[]);
      topColor = r.pick(['#d8d4c8', '#3b4a6b', '#6a7a8a', '#e8e0d0']);
      topColor2 = r.pick(['#7a2222', '#2a3a6a']);
      bottom = 'pants';
      bottomColor = r.pick(['#4a3b2a', '#6b5a40', '#2b2b2e']);
      glasses = 'glasses';
      facialHair = r.pick(['none', 'none', 'stubble'] as FacialHair[]);
      build.bulk = r.range(0.85, 0.95);
      tattoos = 0;
      break;
    case 'brawler':
      top = r.pick(['tank', 'tshirt'] as TopKind[]);
      topColor = r.pick(['#e8e0d0', '#1b1b1f', '#7a2222']);
      bottom = 'jeans';
      hairStyle = r.pick(['buzz', 'short', 'bald'] as HairStyle[]);
      facialHair = r.pick(['stubble', 'goatee', 'none'] as FacialHair[]);
      build.bulk = r.range(1.15, 1.3);
      tattoos = r.range(0.2, 0.8);
      break;
    case 'boss':
      top = 'leather';
      topColor = '#0f0d0c';
      topColor2 = '#7a1010';
      bottom = 'leather';
      bottomColor = '#121010';
      facialHair = 'bigbeard';
      hairColor = r.pick(['#cfcac2', '#8d8a86', '#17100c']);
      hairStyle = r.pick(['slick', 'long', 'bald'] as HairStyle[]);
      glasses = 'sunglasses';
      hat = 'none';
      tattoos = 1;
      build.bulk = 1.48;
      build.height = 1.18;
      build.belly = 1.35;
      build.headScale = 1.06;
      break;
    case 'punk':
      top = r.pick(['leather', 'tank', 'tshirt'] as TopKind[]);
      topColor = r.pick(['#1b1b1f', '#7a2222']);
      bottom = r.pick(['jeans', 'leather'] as BottomKind[]);
      bottomColor = bottom === 'jeans' ? '#1d2a44' : '#141414';
      hairStyle = 'mohawk';
      hairColor = r.pick(['#d02a8a', '#2ad04a', '#e0d020', '#2a7ae0', '#e03020']);
      tattoos = r.range(0.4, 1);
      break;
    case 'cowboy':
      top = r.pick(['flannel', 'longsleeve'] as TopKind[]);
      hat = 'cowboy';
      hatColor = r.pick(['#6b4527', '#3b2416', '#c8a878', '#1a1412']);
      bottom = 'jeans';
      facialHair = r.pick(['mustache', 'handlebar', 'stubble', 'beard'] as FacialHair[]);
      shoeColor = '#5a3a1f';
      break;
    case 'woman':
    case 'patron':
      break;
  }
  if (female) facialHair = 'none';

  const face: FaceParams = {
    eyeSpacing: r.range(0.17, 0.21),
    eyeY: r.range(0.45, 0.5),
    eyeSize: r.range(0.85, 1.15) * (female ? 1.1 : 1),
    browThick: r.range(0.8, 1.4) * (female ? 0.7 : 1),
    browTilt: r.range(-0.15, 0.15),
    noseType: r.int(0, 3),
    noseSize: r.range(0.85, 1.25),
    mouthWidth: r.range(0.16, 0.24),
    lipColor: female ? r.pick(['#b8303a', '#9a2030', '#c84a5a', '#8a3a3a']) : shade(skin, -0.28),
    wrinkles: age > 0.55 ? (age - 0.55) / 0.45 : 0,
    jaw: r.range(0, 1),
    cheek: r.range(0, 1) * (style === 'drunk' ? 1 : 0.4),
    scar: r.chance(style === 'biker' || style === 'brawler' ? 0.35 : 0.06),
    eyeColor: r.pick(['#3a2a1a', '#2a4a7a', '#3a5a3a', '#1a1410', '#5a3a1a']),
  };

  const name = female ? r.pick(FIRST_F) : r.pick(FIRST_M);
  return {
    seed,
    style,
    female,
    skin,
    skinShade: shade(skin, -0.18),
    hairStyle,
    hairColor,
    facialHair,
    top,
    topColor,
    topColor2,
    bottom,
    bottomColor,
    shoeColor,
    hat,
    hatColor,
    glasses,
    tattoos,
    tattooColor: r.pick(['#2a3a5a', '#1a2a3a', '#3a2a4a', '#2a4a3a']),
    belt: r.chance(0.6),
    print: r.int(0, 5),
    face,
    build,
    voicePitch: female ? r.range(1.5, 1.9) : style === 'bouncer' || style === 'boss' ? r.range(0.7, 0.85) : r.range(0.85, 1.15),
    name,
  };
}
