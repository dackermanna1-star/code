// Catalogue integrity checks (run from preview.html?validate).
import { ITEMS, CATEGORIES, RARITY } from './items/registry.js';
import { HANDLERS } from './items/behaviors/index.js';
import { STORES, RESTAURANTS } from './shop/stores.js';
import { RECIPES } from './world/cooking.js';
import { SERIES, CARD_SETS } from './items/behaviors/toys.js';
import { GAMES } from './games/index.js';
import './games/all.js';

export function validate() {
  const p = [];
  const ids = new Set(Object.keys(ITEMS));
  for (const d of Object.values(ITEMS)) {
    const u = d.use;
    if (!CATEGORIES[d.category]) p.push(`${d.id}: unknown category ${d.category}`);
    if (!RARITY[d.rarity]) p.push(`${d.id}: unknown rarity ${d.rarity}`);
    for (const s of d.stores) if (!STORES[s]) p.push(`${d.id}: unknown store ${s}`);
    if (d.restaurant && !RESTAURANTS[d.restaurant]) p.push(`${d.id}: unknown restaurant ${d.restaurant}`);
    if (d.restaurant && RESTAURANTS[d.restaurant] && !d.stores.includes(RESTAURANTS[d.restaurant].store)) p.push(`${d.id}: restaurant ${d.restaurant} belongs to ${RESTAURANTS[d.restaurant].store} but item not sold there`);
    const obtainable = Object.values(SERIES).some((x) => x.items.includes(d.id)) || Object.values(ITEMS).some((o) => o.use?.produces === d.id || o.use?.leftover === d.id || o.use?.recipes?.some?.((r) => r.makes === d.id)) || RECIPES.some((r) => r.makes === d.id);
    if (!d.hidden && !d.stores.length && d.category !== 'package' && !obtainable) p.push(`${d.id}: not hidden but sold nowhere`);
    if (!u && !d.hidden && d.category !== 'package') p.push(`${d.id}: no use (purely decorative)`);
    if (u && !HANDLERS[u.type]) p.push(`${d.id}: no behavior handler for type '${u.type}'`);
    if (u?.leftover && !ids.has(u.leftover)) p.push(`${d.id}: leftover ${u.leftover} missing`);
    if (u?.produces && !ids.has(u.produces)) p.push(`${d.id}: produces ${u.produces} missing`);
    if (u?.type === 'station') for (const r of u.recipes || []) { if (r.makes && !ids.has(r.makes)) p.push(`${d.id}: station makes missing ${r.makes}`); for (const n of r.needs || []) if (!ids.has(n)) p.push(`${d.id}: station needs missing ${n}`); }
    if (u?.type === 'game' && !GAMES[u.game]) p.push(`${d.id}: game ${u.game} not implemented`);
    if (['console', 'handheld'].includes(u?.type)) for (const g of u.bundled || []) if (!GAMES[g]) p.push(`${d.id}: bundled game ${g} missing`);
    if (['arcade', 'vr', 'boardgame'].includes(u?.type) && u.game && !GAMES[u.game]) p.push(`${d.id}: game ${u.game} missing`);
    if (u?.type === 'blindbox' && !SERIES[u.series]) p.push(`${d.id}: series ${u.series} missing`);
    if (u?.type === 'cardpack' && !CARD_SETS[u.set]) p.push(`${d.id}: card set ${u.set} missing`);
    if (u?.type === 'cookbook') for (const r of u.recipes || []) if (!RECIPES.some((x) => x.id === r)) p.push(`${d.id}: cookbook recipe ${r} missing`);
    if (u?.type === 'wear' && !['top', 'bottom', 'shoes', 'hat', 'glasses', 'accessory'].includes(u.slot)) p.push(`${d.id}: bad wear slot ${u.slot}`);
    if (typeof d.price !== 'number' || d.price < 0) p.push(`${d.id}: bad price`);
  }
  for (const r of RECIPES) { if (!ids.has(r.makes)) p.push(`recipe ${r.id}: makes missing ${r.makes}`); for (const i of r.ingredients) if (!ids.has(i)) p.push(`recipe ${r.id}: ingredient missing ${i}`); }
  for (const [sid, s] of Object.entries(SERIES)) for (const i of s.items) if (!ids.has(i)) p.push(`series ${sid}: item missing ${i}`);
  for (const [id, r] of Object.entries(RESTAURANTS)) if (!Object.values(ITEMS).some((d) => d.restaurant === id)) p.push(`restaurant ${id}: has no menu items`);
  for (const sid of Object.keys(STORES)) { const n = Object.values(ITEMS).filter((d) => d.stores.includes(sid) && !d.hidden).length; if (n < 3) p.push(`store ${sid}: only ${n} items`); }
  const counts = {};
  for (const d of Object.values(ITEMS)) if (!d.hidden) counts[d.category] = (counts[d.category] || 0) + 1;
  return { problems: p, total: ids.size, visible: Object.values(ITEMS).filter((d) => !d.hidden).length, counts, games: Object.keys(GAMES).length, recipes: RECIPES.length, series: Object.keys(SERIES).length, cardSets: Object.keys(CARD_SETS).length };
}
