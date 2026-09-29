// Character appearance description (pure data).

export type HairStyle =
  | 'short'
  | 'buzz'
  | 'spiky'
  | 'bob'
  | 'long'
  | 'ponytail'
  | 'bun'
  | 'afro'
  | 'curly'
  | 'mohawk'
  | 'bald'
  | 'pigtails'
  | 'quiff'
  | 'sidepart';
export type HatStyle = 'none' | 'cap' | 'beanie' | 'cowboy' | 'chef' | 'tophat' | 'beret' | 'bucket' | 'hardhat' | 'headband' | 'bow' | 'visor' | 'crown';
export type GlassesStyle = 'none' | 'round' | 'square' | 'sunglasses' | 'cateye';
export type TopStyle = 'tee' | 'longsleeve' | 'jacket' | 'hoodie' | 'tank' | 'dress' | 'suit' | 'uniform' | 'overalls' | 'labcoat' | 'sweater' | 'jersey';
export type Pattern = 'none' | 'stripes' | 'hstripes' | 'dots' | 'plaid' | 'logo' | 'star';
export type BottomStyle = 'pants' | 'shorts' | 'skirt';
export type FacialHair = 'none' | 'mustache' | 'beard' | 'goatee' | 'stubble';
export type NoseStyle = 'button' | 'round' | 'long' | 'pointy' | 'wide';

export interface Appearance {
  height: number; // scale ~0.82 .. 1.12
  width: number; // 0.85 .. 1.4
  belly: number; // 0 .. 1
  kid?: boolean;
  elderly?: boolean;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  hat: HatStyle;
  hatColor: string;
  glasses: GlassesStyle;
  glassesColor?: string;
  facialHair: FacialHair;
  top: TopStyle;
  topColor: string;
  topColor2: string;
  pattern: Pattern;
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  eyeColor: string;
  eyeSize: number; // 0.85..1.2
  lashes: boolean;
  nose: NoseStyle;
  blush: number; // 0..1
  freckles?: boolean;
  earrings?: string;
  tie?: string;
  bowtie?: string;
  necklace?: string;
  badge?: string; // text printed on jersey/uniform
}

export const SKIN_TONES = ['#ffe0c7', '#f9cfa8', '#f1b88a', '#e0a070', '#c98a5a', '#a86b42', '#8a5431', '#6b3f22'];
export const HAIR_COLORS = ['#1f1a17', '#3b2a20', '#5c3b24', '#8a5a2b', '#c98a3a', '#e8c170', '#b8b2aa', '#e9e4dc', '#b0342c', '#d96b9f', '#4a78c8', '#2f9e8f'];
