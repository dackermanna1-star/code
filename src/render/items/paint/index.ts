/**
 * Painted item sprites: dispatch from an item's `visual` (sprite id + colours) to a painter,
 * variant keys for data-dependent looks (potion colour, dyed leather, compass needle, bow
 * pull ...), and a small cache of painted canvases.
 */
import type { ItemDef } from '../../../game/items/registry';
import { potionColor } from '../../../game/items/items';
import { Painter, type AnyCanvas, type Col, darken } from './kit';
import * as M from './minerals';
import * as F from './food';
import * as G from './gear';
import { book, bottle, bucket, bowl, stick } from './shapes';
import { helicopter } from './vehicles';

type PaintFn = (p: Painter) => void;

const PAINTERS: Record<string, PaintFn> = {
  // minerals & ingredients
  diamond: M.diamond, emerald: M.emerald, lapis: M.lapis, quartz: M.quartz, shard: M.shard, crystals: M.crystals,
  coal: M.coal, raw_ore: M.rawOre, ingot: (p) => M.ingot(p), brick: M.brick, nugget: M.nugget, scrap: M.scrap,
  dust: M.dust, bone_meal: M.boneMeal, flint: M.flint, clay_ball: M.clayBall, string: M.string, feather: M.feather,
  hide: M.hide, rabbit_foot: M.rabbitFoot, bone: M.bone, ball: M.ball, magma_cream: M.magmaCream, rod: M.rod,
  tear: M.tear, membrane: M.membrane, ender_pearl: M.enderPearl, ender_eye: M.enderEye, paper: M.paper,
  nautilus_shell: M.nautilusShell, heart_of_the_sea: M.heartOfTheSea, scute: M.scute, shulker_shell: M.shulkerShell,
  nether_star: M.netherStar, disc_fragment: M.discFragment, honeycomb: M.honeycomb, ink_sac: M.inkSac,
  cocoa_beans: M.cocoaBeans, wheat: M.wheat, egg: M.egg, snowball: M.snowball, fermented_spider_eye: M.fermentedSpiderEye,
  spider_eye: M.spiderEye, fire_charge: M.fireCharge, firework_rocket: M.fireworkRocket, firework_star: M.fireworkStar,
  stick: (p) => stick(p, 2.6, 13.4, 13.4, 2.6, 1.0),
  seeds: M.seeds, nether_wart: M.netherWart, bamboo: M.bamboo, dye: M.dye,
  book: (p) => book(p, p.params.color),
  writable_book: (p) => book(p, p.params.color, { quill: true }),
  written_book: (p) => book(p, p.params.color, { band: 0xd8b040 }),
  enchanted_book: (p) => book(p, p.params.color, { corners: 0xe8c040 }),
  experience_bottle: (p) => M.experienceBottleIcon(p, (pp, c, glow) => bottle(pp, c, 'potion', { glow })),
  bottle: (p) => (p.params.color ? bottle(p, p.params.color, 'lingering', { glow: 0.5 }) : bottle(p, null)),
  potion: (p) => bottle(p, potionColor(p.params.data), 'potion'),
  splash_potion: (p) => bottle(p, potionColor(p.params.data), 'splash'),
  lingering_potion: (p) => bottle(p, potionColor(p.params.data), 'lingering'),
  honey_bottle: F.honeyBottle,
  bucket: (p) => bucket(p, p.params.color || 0xc8c8c8, p.params.color2 || null, { glow: p.params.name === 'lava_bucket' ? 0.9 : 0 }),
  mob_bucket: (p) => bucket(p, 0xc8c8c8, p.params.color, { fish: p.params.color2 }),
  bowl: (p) => bowl(p, null),
  // food
  apple: F.apple, bread: F.bread, cookie: F.cookie, pumpkin_pie: F.pumpkinPie, carrot: F.carrot, potato: F.potato,
  baked_potato: F.bakedPotato, beetroot: F.beetroot, stew: F.stew, melon_slice: F.melonSlice, berries: F.berries,
  dried_kelp: F.driedKelp, steak: F.steak, porkchop: F.porkchop, drumstick: F.drumstick, mutton: F.mutton,
  rabbit_meat: F.rabbitMeat, fish: F.fish, cooked_fish: F.cookedFish, tropical_fish: F.tropicalFish,
  pufferfish: F.pufferfish, rotten_flesh: F.rottenFlesh, chorus_fruit: F.chorusFruit,
  // gear
  sword: G.sword, pickaxe: G.pickaxe, axe: G.axe, shovel: G.shovel, hoe: G.hoe, shears: G.shears, bow: G.bow,
  arrow: G.arrow, tipped_arrow: (p) => { p.params.color = potionColor(p.params.data); G.tippedArrow(p); },
  trident: G.trident, shield: G.shield, flint_and_steel: G.flintAndSteel, fishing_rod: (p) => G.fishingRod(p),
  on_a_stick: G.onAStick, compass: (p) => G.compass(p), recovery_compass: G.recoveryCompass, clock: G.clock,
  map: G.map, spyglass: G.spyglass, brush: G.brush, lead: G.lead, name_tag: G.nameTag, saddle: G.saddle,
  totem: G.totem, elytra: G.elytra, armor_stand: G.armorStand, item_frame: G.itemFrame, painting: G.painting,
  goat_horn: G.goatHorn, minecart: G.minecart, boat: (p) => G.boat(p), chest_boat: G.chestBoat,
  music_disc: G.musicDisc, crossbow: G.crossbow, helmet: G.helmet, chestplate: G.chestplate, leggings: G.leggings,
  boots: G.boots, turtle_helmet: G.turtleHelmet, horse_armor: G.horseArmor, spawn_egg: G.spawnEgg,
  // vehicles
  helicopter,
};

export function hasPainter(id: string): boolean {
  return id in PAINTERS;
}

/** The painter id for an item (sprite visual id, or model id for modelled items). */
export function painterId(def: ItemDef): string {
  return def.visual.id;
}

/** Data fields that change the painted look, quantised so caches stay small. */
export function spriteVariant(def: ItemDef, data?: Record<string, any>): Record<string, any> | undefined {
  if (!data) return undefined;
  const id = def.visual.id;
  if (id === 'potion' || id === 'splash_potion' || id === 'lingering_potion' || id === 'tipped_arrow') return { potion: data.potion, color: data.color };
  if (def.armor?.material === 'leather' && data.color !== undefined) return { color: data.color };
  if (id === 'compass' || id === 'recovery_compass') return data.angle !== undefined ? { angle: Math.round(data.angle / (Math.PI / 16)) * (Math.PI / 16) } : undefined;
  if (id === 'clock') return data.time !== undefined ? { time: Math.round(data.time * 64) / 64 } : undefined;
  if (id === 'crossbow') return data.charged ? { charged: 1 } : undefined;
  if (id === 'bow') return data.pull ? { pull: Math.round(data.pull * 3) / 3 } : undefined;
  if (id === 'firework_star') return data.color !== undefined ? { color: data.color } : undefined;
  return undefined;
}

export function spriteKey(def: ItemDef, data?: Record<string, any>): string {
  const v = spriteVariant(def, data);
  return v ? `${def.name}|${JSON.stringify(v)}` : def.name;
}

export interface PaintedSprite {
  /** RGBA colour (sRGB, straight alpha), `size`² px. */
  canvas: AnyCanvas;
  /** PBR hints: R metalness, G roughness, B emissive. */
  mat: AnyCanvas;
  size: number;
}

/** Paint an item sprite (no caching). Returns null if no painter exists for the item. */
export function paintSprite(def: ItemDef, data?: Record<string, any>, size = 128): PaintedSprite | null {
  const fn = PAINTERS[def.visual.id];
  if (!fn) return null;
  const v = spriteVariant(def, data);
  const color: Col = def.visual.color ?? 0xb0b0b0;
  const p = new Painter(size, def.name, { color, color2: def.visual.color2 ?? 0, name: def.name, data: v });
  fn(p);
  const flatish = /bottle|potion|splash|lingering|string|lead|fishing_rod|on_a_stick/.test(def.visual.id);
  p.finish({ outline: flatish ? 0.35 : 0.5, rim: 0.32, shadow: 0.3 });
  return { canvas: p.canvas, mat: p.matCanvas, size };
}

const cache = new Map<string, PaintedSprite | null>();
/** Cached painted sprite. */
export function sprite(def: ItemDef, data?: Record<string, any>, size = 128): PaintedSprite | null {
  const key = `${spriteKey(def, data)}@${size}`;
  if (cache.has(key)) return cache.get(key)!;
  const s = paintSprite(def, data, size);
  cache.set(key, s);
  return s;
}

export { darken };
