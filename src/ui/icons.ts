// Cached data-URL icons for the DOM UI.
import { spellIcon } from '../render/art/spellIcons';
import { wandSprite } from '../render/art/wandSprite';
import { potionIcon, perkIcon, goldIcon, heartIcon } from '../render/art/itemIcons';
import { SPELLS } from '../magic/spells';
import type { WandStats } from '../magic/types';
import { Potion, potionMain, potionTotal } from '../game/inventory';
import { MATERIALS } from '../world/materials';

const cache = new Map<string, string>();

function cached(key: string, make: () => string): string {
  let v = cache.get(key);
  if (!v) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

export function spellIconUrl(id: string): string {
  const def = SPELLS[id];
  return cached('s:' + id, () => spellIcon(id, def ? def.type : 'other').toDataURL(3));
}

export function wandIconUrl(stats: WandStats): string {
  return cached(`w:${stats.spriteSeed}:${stats.capacity}:${stats.actionsPerRound}:${stats.castDelay}:${stats.shuffle}`, () => wandSprite(stats.spriteSeed, stats).toDataURL(2));
}

export function potionIconUrl(p: Potion): string {
  const m = potionMain(p);
  const fill = Math.round((potionTotal(p) / p.capacity) * 8) / 8;
  const hex = m !== null ? MATERIALS[m].colors[0] : null;
  return cached(`p:${hex}:${fill}`, () => potionIcon(hex, fill).toDataURL(3));
}

export function perkIconUrl(id: string): string {
  return cached('k:' + id, () => perkIcon(id).toDataURL(3));
}

export function goldIconUrl(): string {
  return cached('gold', () => goldIcon().toDataURL(2));
}

export function heartIconUrl(): string {
  return cached('heart', () => heartIcon('max').toDataURL(2));
}
