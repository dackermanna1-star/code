import { INGREDIENTS, IngredientId } from '../food/Ingredients';
import { ROSTER, CustomerDef } from '../characters/Roster';
import { Rng } from '../core/math';
import type { Customization } from '../world/Structure';
import type { QualityLevel } from '../core/Engine';

export type UpgradeId =
  | 'grill_size'
  | 'grill_heat'
  | 'smart_meter'
  | 'patty_bell'
  | 'topping_guide'
  | 'fast_printer'
  | 'tip_jar'
  | 'warmer_size';

export type DecorId =
  | 'plants'
  | 'gumball'
  | 'neon_burger'
  | 'string_lights'
  | 'ceiling_fans'
  | 'jukebox'
  | 'photo_wall'
  | 'fish_tank'
  | 'arcade'
  | 'trophy_shelf';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string[];
  costs: number[]; // cost for level 1..n
  ranks: number[]; // min rank for level 1..n
}

export interface DecorDef {
  id: DecorId;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  rank: number;
  comfort: number;
}

export interface CustomOption {
  key: keyof Customization;
  label: string;
  options: { name: string; value: number; cost: number }[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'grill_size', name: 'Bigger Grill', icon: '🔥', desc: ['6 grill spots', '9 grill spots'], costs: [120, 380], ranks: [2, 7] },
  { id: 'grill_heat', name: 'Turbo Burners', icon: '⚡', desc: ['Cooks 20% faster', 'Cooks 40% faster'], costs: [160, 460], ranks: [3, 9] },
  { id: 'smart_meter', name: 'Smart Thermometer', icon: '🌡️', desc: ['Gauges show doneness labels & ticket targets'], costs: [45], ranks: [1] },
  { id: 'patty_bell', name: 'Doneness Chime', icon: '🔔', desc: ['Rings when a side hits a ticket’s doneness'], costs: [110], ranks: [4] },
  { id: 'topping_guide', name: 'Topping Guide', icon: '🧭', desc: ['Highlights the next ingredient to add'], costs: [90], ranks: [3] },
  { id: 'fast_printer', name: 'Express Printer', icon: '🧾', desc: ['Take orders 40% faster'], costs: [120], ranks: [5] },
  { id: 'tip_jar', name: 'Deluxe Tip Jar', icon: '🫙', desc: ['+15% tips', '+30% tips'], costs: [220, 520], ranks: [6, 12] },
  { id: 'warmer_size', name: 'Heated Holding Tray', icon: '♨️', desc: ['Hold 9 cooked patties'], costs: [150], ranks: [6] },
];

export const DECOR: DecorDef[] = [
  { id: 'plants', name: 'Potted Palms', icon: '🌴', desc: 'A little greenery calms hungry nerves.', cost: 40, rank: 1, comfort: 1 },
  { id: 'gumball', name: 'Gumball Machine', icon: '🍬', desc: 'Kids love it. Adults secretly love it more.', cost: 80, rank: 2, comfort: 1 },
  { id: 'neon_burger', name: 'Neon Burger Sign', icon: '🍔', desc: 'A buzzing neon glow for the brick wall.', cost: 120, rank: 3, comfort: 2 },
  { id: 'string_lights', name: 'String Lights', icon: '💡', desc: 'Warm twinkling bulbs across the ceiling.', cost: 150, rank: 4, comfort: 2 },
  { id: 'ceiling_fans', name: 'Ceiling Fans', icon: '🌀', desc: 'A lazy breeze on a busy day.', cost: 190, rank: 5, comfort: 2 },
  { id: 'jukebox', name: 'Retro Jukebox', icon: '🎵', desc: 'Plays golden oldies. Customers wait happily.', cost: 340, rank: 6, comfort: 3 },
  { id: 'photo_wall', name: 'Wall of Fame', icon: '🖼️', desc: 'Framed photos of your best customers.', cost: 160, rank: 7, comfort: 2 },
  { id: 'fish_tank', name: 'Aquarium', icon: '🐠', desc: 'Bubbling tank of cheerful fish.', cost: 320, rank: 9, comfort: 3 },
  { id: 'arcade', name: 'Arcade Cabinet', icon: '🕹️', desc: '"BURGER BLASTER" — high scores welcome.', cost: 420, rank: 11, comfort: 3 },
  { id: 'trophy_shelf', name: 'Trophy Shelf', icon: '🏆', desc: 'Show off your grilling awards.', cost: 280, rank: 13, comfort: 2 },
];

export const CUSTOM_OPTIONS: CustomOption[] = [
  {
    key: 'wallColor',
    label: 'Wall Paint',
    options: [
      { name: 'Buttercream', value: 0xf3e3c4, cost: 0 },
      { name: 'Mint Shake', value: 0xc9ecd9, cost: 50 },
      { name: 'Strawberry', value: 0xf6c9cf, cost: 50 },
      { name: 'Sky Soda', value: 0xc6def2, cost: 50 },
      { name: 'Lavender', value: 0xdccfee, cost: 60 },
      { name: 'Mustard', value: 0xf1d27a, cost: 60 },
    ],
  },
  {
    key: 'accentColor',
    label: 'Wainscoting',
    options: [
      { name: 'Teal', value: 0x2bb3a5, cost: 0 },
      { name: 'Cherry', value: 0xc4262e, cost: 50 },
      { name: 'Navy', value: 0x243b6b, cost: 50 },
      { name: 'Forest', value: 0x2e6b45, cost: 50 },
      { name: 'Charcoal', value: 0x2b2b30, cost: 60 },
    ],
  },
  {
    key: 'floorB',
    label: 'Floor Tiles',
    options: [
      { name: 'Classic Black', value: 0x202027, cost: 0 },
      { name: 'Cherry Red', value: 0xa3232b, cost: 80 },
      { name: 'Teal', value: 0x1f7f78, cost: 80 },
      { name: 'Royal Blue', value: 0x28448f, cost: 80 },
      { name: 'Mocha', value: 0x5a3b2a, cost: 90 },
    ],
  },
  {
    key: 'boothColor',
    label: 'Upholstery',
    options: [
      { name: 'Diner Red', value: 0xc4262e, cost: 0 },
      { name: 'Aqua', value: 0x2aa6a0, cost: 60 },
      { name: 'Sunflower', value: 0xe8a820, cost: 60 },
      { name: 'Plum', value: 0x7a3a8a, cost: 60 },
      { name: 'Midnight', value: 0x2a3550, cost: 70 },
    ],
  },
  {
    key: 'counterColor',
    label: 'Countertops',
    options: [
      { name: 'Vanilla', value: 0xf1e6cf, cost: 0 },
      { name: 'Seafoam', value: 0xcfe9e0, cost: 60 },
      { name: 'Bubblegum', value: 0xf6d3dc, cost: 60 },
      { name: 'Slate', value: 0x9aa3ad, cost: 70 },
    ],
  },
];

export interface CustomerRecord {
  visits: number;
  best: number;
  stars: number; // accumulated stars (loyalty)
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: QualityLevel | 'auto';
  shake: boolean;
  motion: boolean;
  hints: boolean;
}

export interface SaveData {
  version: 1;
  day: number;
  money: number;
  xp: number;
  ratings: number[];
  upgrades: Partial<Record<UpgradeId, number>>;
  decor: DecorId[];
  custom: Partial<Customization>;
  owned: string[]; // customization options owned "key:value"
  customers: Record<string, CustomerRecord>;
  stats: { served: number; perfect: number; tips: number; burnt: number; bestDay: number; totalEarned: number };
  settings: Settings;
  tutorialDone: boolean;
  seenUnlocks: string[];
}

const KEY = 'sizzle-and-stack-save-v1';

export function pointsForRank(r: number): number {
  const k = r - 1;
  return 260 * k + 55 * k * k;
}

export const MAX_RANK = 20;

export function rankFromXp(xp: number): number {
  let r = 1;
  while (r < MAX_RANK && xp >= pointsForRank(r + 1)) r++;
  return r;
}

export const RANK_TITLES = [
  '',
  'Fry Rookie',
  'Bun Wrangler',
  'Patty Flipper',
  'Grill Cadet',
  'Sauce Slinger',
  'Stack Artist',
  'Sizzle Specialist',
  'Line Cook',
  'Grill Sergeant',
  'Burger Baron',
  'Flame Tamer',
  'Topping Tactician',
  'Sous Chef',
  'Char Champion',
  'Master Stacker',
  'Head Chef',
  'Burger Virtuoso',
  'Grill Legend',
  'Sizzle Sage',
  'Burger Monarch',
];

export function defaultSave(): SaveData {
  return {
    version: 1,
    day: 1,
    money: 25,
    xp: 0,
    ratings: [],
    upgrades: {},
    decor: [],
    custom: {},
    owned: [],
    customers: {},
    stats: { served: 0, perfect: 0, tips: 0, burnt: 0, bestDay: 0, totalEarned: 0 },
    settings: { master: 0.85, music: 0.6, sfx: 0.9, quality: 'auto', shake: true, motion: true, hints: true },
    tutorialDone: false,
    seenUnlocks: [],
  };
}

export class Progression {
  data: SaveData;
  onChange?: () => void;

  constructor() {
    this.data = Progression.load() ?? defaultSave();
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== 1) return null;
      const def = defaultSave();
      return { ...def, ...d, stats: { ...def.stats, ...d.stats }, settings: { ...def.settings, ...d.settings } };
    } catch {
      return null;
    }
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable */
    }
  }

  reset() {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }

  get rank(): number {
    return rankFromXp(this.data.xp);
  }

  get rankTitle(): string {
    return RANK_TITLES[this.rank] ?? 'Legend';
  }

  rankProgress(): { rank: number; into: number; need: number; frac: number } {
    const r = this.rank;
    const lo = pointsForRank(r);
    const hi = pointsForRank(r + 1);
    if (r >= MAX_RANK) return { rank: r, into: 1, need: 1, frac: 1 };
    return { rank: r, into: this.data.xp - lo, need: hi - lo, frac: (this.data.xp - lo) / (hi - lo) };
  }

  level(id: UpgradeId): number {
    return this.data.upgrades[id] ?? 0;
  }

  get grillSlots(): number {
    return [4, 6, 9][this.level('grill_size')];
  }
  get warmerSlots(): number {
    return this.level('warmer_size') ? 9 : 6;
  }
  get heat(): number {
    return [1, 1.2, 1.4][this.level('grill_heat')];
  }
  get tipMultiplier(): number {
    const jar = [1, 1.15, 1.3][this.level('tip_jar')];
    return jar * (0.9 + this.reputation * 0.06);
  }

  get comfortPoints(): number {
    return this.data.decor.reduce((s, id) => s + (DECOR.find((d) => d.id === id)?.comfort ?? 0), 0);
  }
  /** 0..1 */
  get comfort(): number {
    return Math.min(1, this.comfortPoints / 18);
  }

  /** 0..5 stars from recent ratings. */
  get reputation(): number {
    const r = this.data.ratings;
    if (!r.length) return 3;
    const avg = r.reduce((a, b) => a + b, 0) / r.length;
    return Math.max(0, Math.min(5, (avg - 40) / 12));
  }

  addRating(total: number) {
    this.data.ratings.push(total);
    if (this.data.ratings.length > 25) this.data.ratings.shift();
  }

  /** Returns list of things unlocked by reaching `rank` (for celebration). */
  unlocksAt(rank: number): { ingredients: IngredientId[]; customers: CustomerDef[]; upgrades: UpgradeDef[]; decor: DecorDef[] } {
    return {
      ingredients: (Object.keys(INGREDIENTS) as IngredientId[]).filter((id) => INGREDIENTS[id].unlockRank === rank),
      customers: ROSTER.filter((c) => c.unlockRank === rank && !c.special),
      upgrades: UPGRADES.filter((u) => u.ranks.includes(rank)),
      decor: DECOR.filter((d) => d.rank === rank),
    };
  }

  customersForRank(): CustomerDef[] {
    return ROSTER.filter((c) => c.unlockRank <= this.rank && !c.special);
  }

  /** Customers visiting on a given day (deterministic per day). */
  scheduleDay(day: number): { def: CustomerDef; at: number }[] {
    const rng = new Rng(`day${day}`);
    const pool = this.customersForRank();
    const count = day === 1 ? 3 : day === 2 ? 4 : Math.min(12, 4 + Math.floor(day / 2) + Math.round(this.reputation >= 4 ? 1 : 0));
    const chosen: CustomerDef[] = [];
    const bag = [...pool];
    for (let i = 0; i < count; i++) {
      if (!bag.length) bag.push(...pool);
      const idx = Math.floor(rng.next() * bag.length);
      chosen.push(bag.splice(idx, 1)[0]);
    }
    // specials
    const critic = ROSTER.find((c) => c.special === 'critic')!;
    if (day >= 5 && day % 5 === 0 && this.rank >= critic.unlockRank) chosen.push(critic);
    const vip = ROSTER.find((c) => c.special === 'vip')!;
    if (this.rank >= vip.unlockRank && day % 4 === 2) chosen.push(vip);
    // arrival times: first quickly, then spaced; later days are busier
    const gap = Math.max(14, 34 - day * 1.6);
    let t = 3;
    return chosen.map((def, i) => {
      const at = t;
      t += gap * rng.range(0.7, 1.3) * (i < 2 ? 1.25 : 1);
      return { def, at };
    });
  }

  record(customerId: string, total: number, stars: number) {
    const r = this.data.customers[customerId] ?? { visits: 0, best: 0, stars: 0 };
    r.visits++;
    r.best = Math.max(r.best, total);
    r.stars += stars;
    this.data.customers[customerId] = r;
  }
}
