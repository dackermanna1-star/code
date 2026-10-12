import { describe, expect, it } from 'vitest';
import { PixelImage, parseColor, hashString, PixelRng, mixHex } from '../src/render/art/pixels';
import {
  spellIcon,
  spellGlyph,
  spellFrame,
  hasSpellGlyph,
  SPELL_GLYPH_IDS,
  SPELL_ICON_SIZE,
  SpellIconType,
} from '../src/render/art/spellIcons';
import { OUTLINE } from '../src/render/art/glyphKit';
import { wandSprite, wandSpriteInfo, wandPixelsForVoxel, WAND_OUTLINE, WandSpriteStats } from '../src/render/art/wandSprite';
import {
  potionIcon,
  goldIcon,
  heartIcon,
  chestIcon,
  perkIcon,
  refresherIcon,
  orbIcon,
  PERK_ICON_IDS,
} from '../src/render/art/itemIcons';

const P = 'projectile';
const S = 'static';
const M = 'modifier';
const MC = 'multicast';
const MAT = 'material';
const U = 'utility';

const SPELLS: Array<[string, SpellIconType]> = [
  ['LIGHT_BULLET', P],
  ['LIGHT_BULLET_TRIGGER', P],
  ['LIGHT_BULLET_TRIGGER_2', P],
  ['LIGHT_BULLET_TIMER', P],
  ['RUBBER_BALL', P],
  ['SLOW_BULLET', P],
  ['SLOW_BULLET_TRIGGER', P],
  ['SLOW_BULLET_TIMER', P],
  ['SPITTER', P],
  ['SPITTER_TIMER', P],
  ['SPITTER_TIER_2', P],
  ['BUBBLESHOT', P],
  ['ROCKET', P],
  ['BOMB', P],
  ['DYNAMITE', P],
  ['FIREBALL', P],
  ['GRENADE', P],
  ['CHAINSAW', P],
  ['LUMINOUS_DRILL', P],
  ['DIGGER', P],
  ['BLACK_HOLE', P],
  ['LIGHTNING', P],
  ['DEATH_CROSS', P],
  ['ARROW', P],
  ['FLAMETHROWER', P],
  ['FREEZING_GAZE', S],
  ['HEAL_BULLET', P],
  ['TELEPORT_PROJECTILE', U],
  ['TELEPORT_PROJECTILE_SHORT', U],
  ['ACIDSHOT', P],
  ['LASER', P],
  ['CIRCLE_WATER', S],
  ['CIRCLE_OIL', S],
  ['CIRCLE_FIRE', S],
  ['CIRCLE_ACID', S],
  ['SEA_WATER', MAT],
  ['SEA_OIL', MAT],
  ['SEA_LAVA', MAT],
  ['SEA_ACID', MAT],
  ['SEA_FLAMGAS', MAT],
  ['MATERIAL_WATER', MAT],
  ['MATERIAL_OIL', MAT],
  ['MATERIAL_BLOOD', MAT],
  ['MATERIAL_ACID', MAT],
  ['DAMAGE', M],
  ['SPEED', M],
  ['HEAVY_SHOT', M],
  ['MANA_REDUCE', M],
  ['RECHARGE', M],
  ['HOMING', M],
  ['PIERCING_SHOT', M],
  ['EXPLOSIVE_PROJECTILE', M],
  ['FIRE_TRAIL', M],
  ['OIL_TRAIL', M],
  ['WATER_TRAIL', M],
  ['ACID_TRAIL', M],
  ['BOUNCE', M],
  ['LIFETIME', M],
  ['LIFETIME_DOWN', M],
  ['SPREAD_REDUCE', M],
  ['CRITICAL_HIT', M],
  ['ELECTRIC_CHARGE', M],
  ['FREEZE', M],
  ['LIGHT', M],
  ['GRAVITY', M],
  ['GRAVITY_ANTI', M],
  ['BURST_2', MC],
  ['BURST_3', MC],
  ['BURST_4', MC],
  ['SCATTER_2', MC],
  ['SCATTER_3', MC],
  ['SCATTER_4', MC],
  ['I_SHAPE', MC],
  ['T_SHAPE', MC],
  ['Y_SHAPE', MC],
  ['W_SHAPE', MC],
  ['PENTAGON_SHAPE', MC],
  ['HEXAGON_SHAPE', MC],
];

const PERKS = [
  'CRITICAL_HIT',
  'EXTRA_HP',
  'EXTRA_LIFE',
  'SAVING_GRACE',
  'STAINLESS_ARMOUR',
  'PROTECTION_FIRE',
  'PROTECTION_EXPLOSION',
  'PROTECTION_RADIOACTIVITY',
  'PROTECTION_ELECTRICITY',
  'PROTECTION_MELEE',
  'FASTER_LEVITATION',
  'STRONG_LEVITATION',
  'MOVEMENT_FASTER',
  'BREATH_UNDERWATER',
  'REPELLING_CAPE',
  'GOLD_IS_FOREVER',
  'ATTRACT_GOLD',
  'VAMPIRISM',
  'GLASS_CANNON',
  'HOMING_SHOT',
  'UNLIMITED_SPELLS',
  'NO_MORE_SHUFFLE',
  'EDIT_WANDS_EVERYWHERE',
  'EXTRA_PERK',
  'EXTRA_SHOP_ITEM',
  'PEACE_WITH_GODS',
  'EXPLODING_CORPSES',
  'FREEZE_FIELD',
  'OIL_BLOOD',
  'LEGGY_FEET',
];

const outlineRgb = parseColor(OUTLINE);

/** Opaque pixels that are not the outline colour (i.e. actual art). */
function artPixels(img: PixelImage): number {
  let n = 0;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const p = img.get(x, y);
      if (p[3] === 0) continue;
      if (p[0] === outlineRgb[0] && p[1] === outlineRgb[1] && p[2] === outlineRgb[2]) continue;
      n++;
    }
  return n;
}

function distinctColors(img: PixelImage): number {
  const s = new Set<string>();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.isOpaque(x, y)) s.add(img.getHex(x, y)!);
  return s.size;
}

function pixelDiff(a: PixelImage, b: PixelImage): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++;
  return n;
}

describe('PixelImage', () => {
  it('sets, gets and parses colours', () => {
    const img = new PixelImage(4, 3);
    img.set(1, 2, '#ff8000');
    expect(img.get(1, 2)).toEqual([255, 128, 0, 255]);
    expect(img.getHex(1, 2)).toBe('#ff8000');
    expect(img.getHex(0, 0)).toBeNull();
    img.set(2, 2, [1, 2, 3, 4]);
    expect(img.get(2, 2)).toEqual([1, 2, 3, 4]);
    img.set(-1, 0, '#fff'); // ignored
    img.set(9, 9, '#fff');
    expect(img.countOpaque()).toBe(2);
    expect(parseColor('#abc')).toEqual([170, 187, 204, 255]);
    expect(parseColor('#11223344')).toEqual([17, 34, 51, 68]);
    expect(() => parseColor('#zzz')).toThrow();
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('draws rects, lines and circles', () => {
    const img = new PixelImage(10, 10);
    img.fillRect(8, 8, 5, 5, '#fff');
    expect(img.countOpaque()).toBe(4); // clipped
    img.clear().line(0, 0, 9, 9, '#f00');
    expect(img.countOpaque()).toBe(10);
    expect(img.getHex(9, 9)).toBe('#ff0000');
    img.clear().circle(4.5, 4.5, 3, '#0f0');
    const filled = img.countOpaque();
    // symmetric around the centre
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) expect(img.isOpaque(x, y)).toBe(img.isOpaque(9 - x, 9 - y));
    img.clear().circle(4.5, 4.5, 3, '#0f0', false);
    expect(img.countOpaque()).toBeLessThan(filled);
    expect(img.countOpaque()).toBeGreaterThan(10);
  });

  it('outlines opaque pixels with a 1px ring', () => {
    const img = new PixelImage(5, 5);
    img.set(2, 2, '#ffffff');
    img.outline('#000000');
    expect(img.countOpaque()).toBe(5);
    expect(img.getHex(2, 1)).toBe('#000000');
    expect(img.getHex(2, 2)).toBe('#ffffff');
    expect(img.isOpaque(1, 1)).toBe(false);
    img.outline('#000000', true);
    expect(img.isOpaque(0, 0)).toBe(false);
    expect(img.isOpaque(1, 1)).toBe(true);
  });

  it('blits with alpha and fails cleanly without a DOM', () => {
    const a = new PixelImage(2, 1, '#000000');
    const b = new PixelImage(2, 1);
    b.set(0, 0, [255, 255, 255, 128]);
    a.blit(b);
    expect(a.get(0, 0)[0]).toBeGreaterThan(120);
    expect(a.get(0, 0)[0]).toBeLessThan(136);
    expect(a.get(1, 0)).toEqual([0, 0, 0, 255]);
    expect(() => a.toCanvas(2)).toThrow(/DOM/);
  });

  it('has a deterministic seeded RNG', () => {
    const r1 = new PixelRng(42);
    const r2 = new PixelRng(42);
    const s1 = Array.from({ length: 8 }, () => r1.next());
    const s2 = Array.from({ length: 8 }, () => r2.next());
    expect(s1).toEqual(s2);
    for (const v of s1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new PixelRng('abc').next()).toBe(new PixelRng(hashString('abc')).next());
  });
});

describe('spell icons', () => {
  it('has a hand-designed glyph for every listed spell', () => {
    for (const [id] of SPELLS) expect(hasSpellGlyph(id), id).toBe(true);
    expect(SPELL_GLYPH_IDS.length).toBeGreaterThanOrEqual(SPELLS.length);
  });

  it.each(SPELLS)('%s renders a framed 20x20 icon with a solid glyph', (id, type) => {
    const icon = spellIcon(id, type);
    expect(icon.w).toBe(SPELL_ICON_SIZE);
    expect(icon.h).toBe(SPELL_ICON_SIZE);
    expect(icon.countOpaque()).toBe(SPELL_ICON_SIZE * SPELL_ICON_SIZE);
    const glyph = spellGlyph(id, type);
    const n = artPixels(glyph);
    expect(n, `${id} glyph pixels`).toBeGreaterThanOrEqual(24);
    expect(n, `${id} glyph pixels`).toBeLessThanOrEqual(235);
    expect(distinctColors(glyph), `${id} colours`).toBeGreaterThanOrEqual(3);
    // the glyph actually shows on the card
    expect(pixelDiff(icon, spellFrame(type))).toBeGreaterThanOrEqual(n);
    // deterministic
    expect(spellIcon(id, type).equals(icon)).toBe(true);
  });

  it('gives every listed spell a visibly different glyph', () => {
    const glyphs = SPELLS.map(([id, type]) => [id, spellGlyph(id, type)] as const);
    let min = Infinity;
    let pair = '';
    for (let i = 0; i < glyphs.length; i++)
      for (let j = i + 1; j < glyphs.length; j++) {
        const d = pixelDiff(glyphs[i][1], glyphs[j][1]);
        if (d < min) {
          min = d;
          pair = `${glyphs[i][0]} vs ${glyphs[j][0]}`;
        }
      }
    expect(min, `closest pair: ${pair}`).toBeGreaterThanOrEqual(16);
  });

  it('colours the frame by spell type', () => {
    const types: SpellIconType[] = ['projectile', 'static', 'modifier', 'multicast', 'material', 'utility', 'passive', 'other'];
    const frames = types.map((t) => spellFrame(t).getHex(10, 0));
    expect(new Set(frames).size).toBe(types.length);
    // same glyph, different frame
    expect(spellIcon('LIGHT_BULLET', 'projectile').equals(spellIcon('LIGHT_BULLET', 'modifier'))).toBe(false);
  });

  it('falls back to a deterministic seeded glyph for unknown ids', () => {
    const a = spellIcon('SOME_FUTURE_SPELL', 'projectile');
    const b = spellIcon('SOME_FUTURE_SPELL', 'projectile');
    const c = spellIcon('ANOTHER_FUTURE_SPELL', 'projectile');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    for (const t of ['modifier', 'utility', 'passive', 'other'] as const)
      expect(artPixels(spellGlyph('MYSTERY_' + t, t))).toBeGreaterThan(12);
  });
});

describe('perk icons', () => {
  it('has a custom emblem for every listed perk', () => {
    for (const id of PERKS) expect(PERK_ICON_IDS, id).toContain(id);
  });

  it.each(PERKS)('%s renders a 16x16 emblem', (id) => {
    const img = perkIcon(id);
    expect(img.w).toBe(16);
    expect(img.h).toBe(16);
    const n = artPixels(img);
    expect(n, `${id} pixels`).toBeGreaterThanOrEqual(30);
    expect(n, `${id} pixels`).toBeLessThanOrEqual(230);
    expect(distinctColors(img)).toBeGreaterThanOrEqual(3);
    expect(perkIcon(id).equals(img)).toBe(true);
  });

  it('gives every perk a visibly different emblem', () => {
    const imgs = PERKS.map((id) => [id, perkIcon(id)] as const);
    let min = Infinity;
    let pair = '';
    for (let i = 0; i < imgs.length; i++)
      for (let j = i + 1; j < imgs.length; j++) {
        const d = pixelDiff(imgs[i][1], imgs[j][1]);
        if (d < min) {
          min = d;
          pair = `${imgs[i][0]} vs ${imgs[j][0]}`;
        }
      }
    expect(min, `closest pair: ${pair}`).toBeGreaterThanOrEqual(40);
  });

  it('falls back to a deterministic generic badge', () => {
    expect(perkIcon('NEW_PERK').equals(perkIcon('NEW_PERK'))).toBe(true);
    expect(perkIcon('NEW_PERK').equals(perkIcon('OTHER_NEW_PERK'))).toBe(false);
    expect(artPixels(perkIcon('NEW_PERK'))).toBeGreaterThan(40);
  });
});

describe('item icons', () => {
  it('fills potions according to the level', () => {
    const empty = potionIcon(null, 1);
    expect(empty.w).toBe(16);
    expect(potionIcon('#3a7ae8', 0).equals(empty)).toBe(true);
    const counts = [0.1, 0.4, 0.7, 1].map((f) => pixelDiff(potionIcon('#3a7ae8', f), empty));
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    expect(potionIcon('#3a7ae8', 0.5).equals(potionIcon('#c01e1e', 0.5))).toBe(false);
  });

  it('renders the pickups', () => {
    const icons = [goldIcon(), heartIcon('max'), heartIcon('full'), chestIcon(), refresherIcon(), orbIcon()];
    for (const img of icons) {
      expect(img.w).toBe(16);
      expect(artPixels(img)).toBeGreaterThan(40);
    }
    expect(heartIcon('max').equals(heartIcon('full'))).toBe(false);
  });
});

describe('wand sprites', () => {
  const base: WandSpriteStats = { capacity: 4, actionsPerRound: 1, castDelay: 10, shuffle: false, manaMax: 300 };

  function nonOutlineRuns(img: PixelImage, x: number): number {
    const out = parseColor(WAND_OUTLINE);
    let runs = 0;
    let inRun = false;
    for (let y = 0; y < img.h; y++) {
      const p = img.get(x, y);
      const art = p[3] > 0 && !(p[0] === out[0] && p[1] === out[1] && p[2] === out[2]);
      if (art && !inRun) runs++;
      inRun = art;
    }
    return runs;
  }

  it('stays within the size limits, transparent around a dark outline', () => {
    const r = new PixelRng(7);
    for (let i = 0; i < 150; i++) {
      const stats: WandSpriteStats = {
        capacity: r.int(1, 26),
        actionsPerRound: r.int(1, 3),
        castDelay: r.int(-20, 60),
        shuffle: r.chance(0.5),
        manaMax: r.int(50, 2000),
      };
      const img = wandSprite(r.int(0, 1e9), stats);
      expect(img.w).toBeGreaterThanOrEqual(20);
      expect(img.w).toBeLessThanOrEqual(28);
      expect(img.h).toBeGreaterThanOrEqual(6);
      expect(img.h).toBeLessThanOrEqual(10);
      expect(img.isOpaque(0, 0) || img.isOpaque(img.w - 1, img.h - 1)).toBe(false);
      // every art pixel is enclosed: its transparent neighbours were all turned into outline
      const out = parseColor(WAND_OUTLINE);
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          const p = img.get(x, y);
          if (p[3] === 0 || (p[0] === out[0] && p[1] === out[1] && p[2] === out[2])) continue;
          expect(x > 0 && y > 0 && x < img.w - 1 && y < img.h - 1).toBe(true);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            expect(img.isOpaque(x + dx, y + dy)).toBe(true);
        }
    }
  });

  it('is deterministic and varies with the seed', () => {
    expect(wandSprite(123, base).equals(wandSprite(123, base))).toBe(true);
    const looks = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const info = wandSpriteInfo(s, base);
      looks.add(info.material);
      looks.add(info.gemColor);
    }
    expect(looks.size).toBeGreaterThan(6);
  });

  it('gets longer with capacity', () => {
    for (let seed = 0; seed < 20; seed++) {
      let prev = 0;
      for (let cap = 1; cap <= 14; cap++) {
        const w = wandSprite(seed, { ...base, capacity: cap }).w;
        expect(w).toBeGreaterThanOrEqual(prev);
        prev = w;
      }
      expect(wandSprite(seed, { ...base, capacity: 10 }).w).toBeGreaterThan(wandSprite(seed, { ...base, capacity: 2 }).w);
    }
  });

  it('gets thicker with cast delay', () => {
    const avgThickness = (castDelay: number) => {
      let sum = 0;
      let n = 0;
      for (let seed = 0; seed < 40; seed++) {
        const img = wandSprite(seed, { ...base, castDelay });
        for (let x = 10; x < img.w - 8; x++) {
          for (let y = 0; y < img.h; y++) if (img.isOpaque(x, y)) sum++;
          n++;
        }
      }
      return sum / n;
    };
    const thin = avgThickness(0);
    const mid = avgThickness(12);
    const thick = avgThickness(40);
    expect(mid).toBeGreaterThan(thin);
    expect(thick).toBeGreaterThan(mid);
  });

  it('uses a different gem for shuffle wands and two prongs for multicast wands', () => {
    for (let seed = 0; seed < 25; seed++) {
      const a = wandSprite(seed, base);
      const b = wandSprite(seed, { ...base, shuffle: true });
      expect(a.equals(b)).toBe(false);
      const single = wandSprite(seed, base);
      const multi = wandSprite(seed, { ...base, actionsPerRound: 2 });
      expect(nonOutlineRuns(single, single.w - 2)).toBe(1);
      expect(nonOutlineRuns(multi, multi.w - 2)).toBe(2);
    }
  });

  it('flattens to voxel colours', () => {
    const info = wandSpriteInfo(99, { ...base, actionsPerRound: 2, manaMax: 1200 });
    const v = wandPixelsForVoxel(info.img);
    expect(v.w).toBe(info.img.w);
    expect(v.h).toBe(info.img.h);
    expect(v.colors.length).toBe(v.w * v.h);
    expect(v.colors[0]).toBeNull();
    const filled = v.colors.filter((c) => c !== null);
    expect(filled.length).toBe(info.img.countOpaque());
    for (const c of filled) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    // row-major, top row first
    const { x, y } = info.tip;
    expect(v.colors[y * v.w + x]).toBe(info.img.getHex(x, y));
    expect(info.img.isOpaque(info.grip.x, info.grip.y)).toBe(true);
  });
});
