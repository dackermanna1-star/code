// STUB — replaced by the pixel-art icon generator. Keep the exported API.
import { getItemDef } from './items.js';

const cache = new Map();
/** 16x16 canvas icon for an item id (or def). Cached. */
export function getItemIcon(idOrDef) {
  const def = typeof idOrDef === 'string' ? getItemDef(idOrDef) : idOrDef;
  if (cache.has(def.id)) return cache.get(def.id);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = def.icon?.color || '#999';
  g.fillRect(3, 3, 10, 10);
  g.strokeStyle = '#222';
  g.strokeRect(3.5, 3.5, 9, 9);
  cache.set(def.id, c);
  return c;
}
const urlCache = new Map();
/** data URL of the icon (for <img> / CSS). Cached. */
export function getItemIconURL(idOrDef) {
  const def = typeof idOrDef === 'string' ? getItemDef(idOrDef) : idOrDef;
  if (!urlCache.has(def.id)) urlCache.set(def.id, getItemIcon(def).toDataURL());
  return urlCache.get(def.id);
}
