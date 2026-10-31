import type { ArenaThemeId } from '../core/ids';
import { ARENA_THEMES } from '../core/ids';
import type { Rng } from '../core/rng';
import type { LoopId } from '../audio/types';

/**
 * Arena definitions. Layouts are always mirror-symmetric around x = 0 so that the starting side
 * never confers an advantage (part of the 50/50 fairness guarantee).
 */

export type HazardKind = 'lightning' | 'lava' | 'icicles' | 'voidrift' | 'starfall' | 'none';
export type PropKind = 'pillar' | 'statue' | 'obelisk' | 'crystal' | 'bamboo' | 'lantern' | 'monolith';
export type WeatherKind = 'embers' | 'rain' | 'motes' | 'ash' | 'snow' | 'petals' | 'leaves' | 'sparkles';

export interface ArenaTheme {
  id: ArenaThemeId;
  name: string;
  subtitle: string;
  hazard: HazardKind;
  propKinds: PropKind[];
  weather: WeatherKind;
  ambientLoop: LoopId | null;
  musicMood: 'epic' | 'dark' | 'ethereal' | 'frantic';
  /** Presentation palette (hex). */
  palette: {
    skyTop: string;
    skyMid: string;
    skyHorizon: string;
    /** Sun / moon / celestial body colour. */
    celestial: string;
    /** Far silhouettes (mountains / spires). */
    far: string;
    /** Mid-ground silhouettes (ruins / trees). */
    mid: string;
    ground: string;
    groundEdge: string;
    fog: string;
    /** Light tint applied to props / rim light. */
    ambient: string;
    /** Theme accent (hazard glow, runes, lava...). */
    accent: string;
  };
}

export const THEMES: Record<ArenaThemeId, ArenaTheme> = {
  sanctum: {
    id: 'sanctum', name: 'The Shattered Sanctum', subtitle: 'A temple of fallen gods, frozen at dusk',
    hazard: 'none', propKinds: ['pillar', 'statue', 'pillar'], weather: 'embers', ambientLoop: 'wind', musicMood: 'epic',
    palette: { skyTop: '#1b1033', skyMid: '#7a2f4f', skyHorizon: '#ff9a5a', celestial: '#ffd7a0', far: '#3d1f3f', mid: '#2a1428', ground: '#1a0f16', groundEdge: '#e0905a', fog: '#ff8a5c', ambient: '#ffb98a', accent: '#ffcf7a' },
  },
  stormpeak: {
    id: 'stormpeak', name: 'Stormcrown Peak', subtitle: 'The summit where the sky itself takes sides',
    hazard: 'lightning', propKinds: ['monolith', 'obelisk'], weather: 'rain', ambientLoop: 'rain', musicMood: 'frantic',
    palette: { skyTop: '#05070f', skyMid: '#18233b', skyHorizon: '#3d5375', celestial: '#c9dcff', far: '#121a2b', mid: '#0c1220', ground: '#0a0e16', groundEdge: '#7f9fd4', fog: '#5a7099', ambient: '#9fb8e8', accent: '#bfe3ff' },
  },
  nexus: {
    id: 'nexus', name: 'The Hollow Nexus', subtitle: 'Between worlds, where gravity forgets itself',
    hazard: 'voidrift', propKinds: ['crystal', 'monolith'], weather: 'motes', ambientLoop: 'void_hum', musicMood: 'dark',
    palette: { skyTop: '#020008', skyMid: '#1a0838', skyHorizon: '#4a1a7a', celestial: '#e7c2ff', far: '#14062a', mid: '#0d031d', ground: '#08020f', groundEdge: '#b47aff', fog: '#7a3ad1', ambient: '#c79bff', accent: '#ff6af0' },
  },
  caldera: {
    id: 'caldera', name: 'Caldera of Ash', subtitle: 'A dying volcano that remembers the first war',
    hazard: 'lava', propKinds: ['obelisk', 'pillar'], weather: 'ash', ambientLoop: 'lava', musicMood: 'frantic',
    palette: { skyTop: '#0d0303', skyMid: '#3a0d07', skyHorizon: '#b8320f', celestial: '#ff7a3a', far: '#2a0904', mid: '#1a0503', ground: '#120403', groundEdge: '#ff5a1a', fog: '#ff4a10', ambient: '#ff8a50', accent: '#ffb030' },
  },
  frostveil: {
    id: 'frostveil', name: 'Frostveil Citadel', subtitle: 'An ice fortress beneath a dancing aurora',
    hazard: 'icicles', propKinds: ['crystal', 'statue', 'pillar'], weather: 'snow', ambientLoop: 'wind', musicMood: 'ethereal',
    palette: { skyTop: '#030a1a', skyMid: '#0f2a45', skyHorizon: '#3b7a9a', celestial: '#e8fbff', far: '#1a3550', mid: '#10243a', ground: '#0c1a2a', groundEdge: '#bfefff', fog: '#8fd5ef', ambient: '#cdefff', accent: '#5affc8' },
  },
  celestial: {
    id: 'celestial', name: 'The Celestial Steps', subtitle: 'Marble terraces above an ocean of cloud',
    hazard: 'starfall', propKinds: ['pillar', 'statue', 'obelisk'], weather: 'sparkles', ambientLoop: 'wind', musicMood: 'ethereal',
    palette: { skyTop: '#0f1a3d', skyMid: '#4f5fa8', skyHorizon: '#ffd9a8', celestial: '#fff6dd', far: '#7a7fb5', mid: '#5a5c8f', ground: '#2a2440', groundEdge: '#ffe6b0', fog: '#ffe2c4', ambient: '#fff0d0', accent: '#fff2a8' },
  },
  moonlit: {
    id: 'moonlit', name: 'Moonlit Bamboo Vale', subtitle: 'A silent grove under an enormous moon',
    hazard: 'none', propKinds: ['bamboo', 'lantern', 'statue'], weather: 'petals', ambientLoop: 'wind', musicMood: 'dark',
    palette: { skyTop: '#03060d', skyMid: '#0d1b2e', skyHorizon: '#2c4a63', celestial: '#f4f1de', far: '#0e1d2c', mid: '#08131f', ground: '#060c14', groundEdge: '#9ec3d9', fog: '#3d6680', ambient: '#cfe3f0', accent: '#ff8fb1' },
  },
};

export interface PropDef {
  id: number;
  kind: PropKind;
  /** Centre x of the prop's base. */
  x: number;
  width: number;
  height: number;
  maxHp: number;
}

export interface ArenaDef {
  theme: ArenaThemeId;
  /** Walls at x = ±halfWidth. */
  halfWidth: number;
  /** Highest reachable point (negative y). */
  ceiling: number;
  props: PropDef[];
  /** Seed for procedural presentation (skyline shapes, clouds...). */
  visualSeed: number;
}

const PROP_SIZES: Record<PropKind, { w: [number, number]; h: [number, number]; hp: number }> = {
  pillar: { w: [46, 60], h: [300, 430], hp: 240 },
  statue: { w: [70, 90], h: [210, 270], hp: 200 },
  obelisk: { w: [44, 56], h: [340, 480], hp: 260 },
  crystal: { w: [60, 84], h: [180, 300], hp: 160 },
  bamboo: { w: [18, 26], h: [520, 760], hp: 90 },
  lantern: { w: [40, 52], h: [120, 160], hp: 70 },
  monolith: { w: [80, 110], h: [240, 330], hp: 300 },
};

export const ARENA_HALF_WIDTH = 1300;
export const ARENA_CEILING = -1150;

export function generateArena(rng: Rng, forcedTheme?: ArenaThemeId): ArenaDef {
  const theme = forcedTheme ?? rng.pick(ARENA_THEMES);
  const t = THEMES[theme];
  const props: PropDef[] = [];
  const pairCount = rng.int(1, 3);
  const slots: number[] = [];
  let id = 0;
  for (let i = 0; i < pairCount; i++) {
    // Find a slot that does not overlap existing props.
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Math.round(rng.range(380, 1120));
      if (slots.every((s) => Math.abs(s - x) > 170)) {
        slots.push(x);
        const kind = rng.pick(t.propKinds);
        const size = PROP_SIZES[kind];
        const w = Math.round(rng.range(size.w[0], size.w[1]));
        const h = Math.round(rng.range(size.h[0], size.h[1]));
        // Mirror pair: identical stats on both sides.
        props.push({ id: id++, kind, x: -x, width: w, height: h, maxHp: size.hp });
        props.push({ id: id++, kind, x, width: w, height: h, maxHp: size.hp });
        break;
      }
    }
  }
  return {
    theme,
    halfWidth: ARENA_HALF_WIDTH,
    ceiling: ARENA_CEILING,
    props,
    visualSeed: rng.nextU32(),
  };
}

/** Runtime state of a destructible prop (owned by the Simulation). */
export interface PropState {
  def: PropDef;
  hp: number;
  broken: boolean;
  /** 0 = pristine .. 1 = about to break (drives crack rendering). */
  damage: number;
  /** Tick of the last hit (for flash / wobble). */
  lastHitTick: number;
  /** Direction of the last impact (-1 / 1). */
  lastHitDir: number;
}
