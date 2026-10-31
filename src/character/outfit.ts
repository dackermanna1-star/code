/** Appearance description for procedural characters. */
export type HairStyle = 'bald' | 'buzz' | 'short' | 'mohawk' | 'long' | 'ponytail' | 'slick' | 'topknot';
export type TopKind = 'bare' | 'tank' | 'tshirt' | 'longsleeve' | 'hoodie' | 'jacket' | 'gi' | 'vest' | 'tracktop';
export type BottomKind = 'jeans' | 'cargo' | 'track' | 'gi' | 'shorts';
export type HeadWear = 'none' | 'cap' | 'beanie' | 'bandana' | 'hood' | 'balaclava' | 'headband' | 'mask' | 'helmet';
export type Extra = 'belt' | 'kneepads' | 'shoulderpads' | 'chestarmor' | 'chain' | 'sash' | 'bracers';

export interface Outfit {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  facial: 'none' | 'stubble' | 'beard' | 'goatee' | 'mustache';
  top: TopKind;
  topColor: string;
  topColor2: string;
  topPattern: 'plain' | 'stripes' | 'logo' | 'camo' | 'flannel' | 'number' | 'panel';
  bottom: BottomKind;
  bottomColor: string;
  shoes: 'sneakers' | 'boots' | 'barefoot' | 'wraps' | 'slippers';
  shoeColor: string;
  hands: 'bare' | 'wraps' | 'gloves' | 'fingerless';
  handColor: string;
  head: HeadWear;
  headColor: string;
  extras: Extra[];
  extraColor: string;
  eyes: string;
  scar: boolean;
  tattoo: boolean;
  brow: number; // -1 calm .. 1 angry
  seed: number;
}

export const SKIN_TONES = ['#f1c7a6', '#e0ac85', '#c98e66', '#a8714d', '#8a5638', '#6b3f28', '#4e2c1c', '#d9a07a'];
export const HAIR_COLORS = ['#141010', '#1f1612', '#2c1d14', '#4a3020', '#6e4b2e', '#8c8c8c', '#b9a27a', '#3a2a1e'];

export function defaultOutfit(): Outfit {
  return {
    skin: '#c98e66', hair: '#141010', hairStyle: 'short', facial: 'none',
    top: 'tshirt', topColor: '#555555', topColor2: '#222222', topPattern: 'plain',
    bottom: 'jeans', bottomColor: '#2b3a55', shoes: 'sneakers', shoeColor: '#dddddd',
    hands: 'bare', handColor: '#444444', head: 'none', headColor: '#222222',
    extras: [], extraColor: '#333333', eyes: '#3b2a1a', scar: false, tattoo: false, brow: 0.6, seed: 1,
  };
}

export const sleeveLength = (top: TopKind) => {
  switch (top) {
    case 'bare': case 'tank': case 'vest': return 0;
    case 'tshirt': return 0.42;
    case 'longsleeve': case 'hoodie': case 'jacket': case 'tracktop': return 0.97;
    case 'gi': return 0.85;
  }
};
export const torsoCovered = (top: TopKind) => top !== 'bare';
