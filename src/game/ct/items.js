// Chinatown key items: the gas can, the power plug and the blowtorch
// (things 9040-9042). Picking one up sets player.keyItems[i]; the map
// script decides what uses them up (it clears the flag). They are plain
// player fields, so savegames keep them, and like keycards they are lost
// on a new level or a restart after death.

import { SPR } from '../tables.js';
import { CT_KEY_ITEMS } from './info.js';

export const KEY_ITEM = { GAS: 0, PLUG: 1, TORCH: 2 };
export const KEY_ITEM_COUNT = CT_KEY_ITEMS.length;

const BY_SPRITE = new Map(CT_KEY_ITEMS.map((it, i) => [SPR[it.spr], i]));

export function keyItemIndex(mo) {
  const i = BY_SPRITE.get(mo.sprite);
  return i === undefined ? -1 : i;
}

// touchSpecialThing for key items: returns the pickup message, or null when
// `special` is not a key item or the player already carries one like it.
// w.onKeyItem(player, index, special), if set, is told about the pickup.
export function touchKeyItem(w, special, player) {
  const i = keyItemIndex(special);
  if (i < 0 || player.keyItems[i]) return null;
  player.keyItems[i] = true;
  if (w.onKeyItem) w.onKeyItem(player, i, special);
  return CT_KEY_ITEMS[i].message;
}
