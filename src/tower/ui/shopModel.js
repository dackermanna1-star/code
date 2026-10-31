// LAST LOOKOUT — shop view-model: turns the catalog plus the player's shop state into cards
// (name, stats, price, state, action). Pure data, no DOM; tested in Node.

import {
  RIFLES, RIFLE_ORDER, AMMO, AMMO_ORDER, UPGRADES, UPGRADE_ORDER, DEFENCES, DEFENCE_ORDER,
} from '../catalog.js';
import { LAYOUT } from '../level/layout.js';
import { formatCash, groupThousands } from './format.js';

export const SHOP_TABS = [
  { id: 'rifles', label: 'RIFLES', key: '1' },
  { id: 'ammo', label: 'AMMO', key: '2' },
  { id: 'upgrades', label: 'UPGRADES', key: '3' },
  { id: 'defences', label: 'DEFENCES', key: '4' },
];

/**
 * Display figures the catalog does not carry (muzzle energy in kJ, relative penetration 0..1),
 * keyed by round. A rifle entry may override them with `energy` / `pen` fields.
 */
const ROUND_STATS = {
  '7.62×54R': { energy: 3.6, pen: 0.5 },
  '7.62×51': { energy: 3.3, pen: 0.46 },
  '.338 Lapua': { energy: 6.6, pen: 0.74 },
  '.50 BMG': { energy: 17.5, pen: 1 },
};
const AMMO_STATS = {
  fmj: { dmg: 0.5, pen: 0.55, splash: 0 },
  hp: { dmg: 0.85, pen: 0.22, splash: 0 },
  ap: { dmg: 0.55, pen: 1, splash: 0 },
  ex: { dmg: 1, pen: 0.3, splash: 1 },
};
const PLACE_TAG = {
  ground: 'PLACE IN THE FIELD',
  barrel: 'PLACE ON A BARREL SPOT',
  mount: 'FIT TO A LIGHT MOUNT',
  sentry: 'TOWER MOUNT',
  gate: 'INSTANT',
};

const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Fills in defaults so the rest of the UI can trust the shape. Accepts arrays for sets. */
export function normalizeShopState(st = {}) {
  const owned = st.owned || {};
  const rifles = owned.rifles instanceof Set ? owned.rifles : new Set(Array.isArray(owned.rifles) ? owned.rifles : ['m91']);
  return {
    cash: num(st.cash),
    wave: num(st.wave, 1),
    owned: {
      rifles,
      upgrades: owned.upgrades || {},
      ammo: owned.ammo || {},
      defences: owned.defences || {},
    },
    equipped: { rifle: (st.equipped && st.equipped.rifle) || 'm91', ammo: (st.equipped && st.equipped.ammo) || 'fmj' },
    gate: { hp: num(st.gate && st.gate.hp, 1), max: Math.max(1, num(st.gate && st.gate.max, 1)) },
    countdown: st.countdown ?? null,
    nextWave: st.nextWave ?? null,
  };
}

function priced(item, price, cash) {
  item.price = price;
  item.priceText = price > 0 ? formatCash(price) : 'FREE';
  item.affordable = cash >= price;
  if (!item.affordable) item.reason = `NEED ${formatCash(price - cash)}`;
  return item;
}

function base(id, tab, kind, def) {
  return {
    id, tab, kind, name: def.name.toUpperCase(), tag: '', desc: def.desc || '', stats: [], icon: id,
    price: null, priceText: '', status: 'available', action: null, actionLabel: '', enabled: false,
    affordable: true, reason: '', level: null, count: null, secondary: null,
  };
}

function rifleItem(id, st) {
  const r = RIFLES[id];
  const it = base(id, 'rifles', 'rifle', r);
  const rs = ROUND_STATS[r.round] || { energy: 4, pen: 0.5 };
  const energy = num(r.energy, rs.energy), pen = num(r.pen, rs.pen);
  it.tag = `${r.round} · ${r.mag} RDS · ${r.suppressed ? 'SILENT' : r.action === 'semi' ? 'SEMI' : 'BOLT'}`;
  it.stats = [
    { label: 'DAMAGE', value: clamp01(Math.log1p(energy) / Math.log1p(17.5)), text: `${energy.toFixed(1)} kJ` },
    { label: 'PENETRATION', value: clamp01(pen), text: `${Math.round(pen * 10)}/10` },
    { label: 'ZOOM', value: clamp01(r.zoom / 12), text: `${r.zoom}×` },
    { label: 'FIRE RATE', value: clamp01(0.3 / r.cycle), text: `${Math.round(60 / r.cycle)} RPM` },
  ];
  const owned = st.owned.rifles.has(id);
  if (st.equipped.rifle === id) {
    it.status = 'equipped';
    it.actionLabel = 'EQUIPPED';
  } else if (owned) {
    it.status = 'owned';
    it.action = 'equip';
    it.actionLabel = 'EQUIP';
    it.enabled = true;
  } else {
    priced(it, r.price, st.cash);
    it.action = 'buy';
    it.actionLabel = 'BUY';
    it.enabled = it.affordable;
  }
  return it;
}

function ammoItem(id, st) {
  const a = AMMO[id];
  const it = base(id, 'ammo', 'ammo', a);
  const s = AMMO_STATS[id] || { dmg: 0.5, pen: 0.5, splash: 0 };
  it.stats = [
    { label: 'WOUNDING', value: s.dmg, text: '' },
    { label: 'PENETRATION', value: s.pen, text: '' },
    { label: 'BLAST', value: s.splash, text: '' },
  ];
  const infinite = !Number.isFinite(a.pack);
  const count = infinite ? Infinity : num(st.owned.ammo[id]);
  it.count = count;
  it.tag = infinite ? 'STANDARD ISSUE · UNLIMITED' : `PACK OF ${a.pack} · ${count} IN STOCK`;
  const equipped = st.equipped.ammo === id;
  if (infinite) {
    it.status = equipped ? 'equipped' : 'owned';
    it.action = equipped ? null : 'equip';
    it.actionLabel = equipped ? 'LOADED' : 'LOAD';
    it.enabled = !equipped;
    return it;
  }
  priced(it, a.price, st.cash);
  it.action = 'buy';
  it.actionLabel = `BUY ×${a.pack}`;
  it.enabled = it.affordable;
  it.status = equipped ? 'equipped' : count > 0 ? 'owned' : 'available';
  if (count > 0) it.secondary = { action: 'equip', label: equipped ? 'LOADED' : 'LOAD', enabled: !equipped };
  return it;
}

/** Short text for what one upgrade level does. */
export function upgradeEffect(level) {
  if (!level) return '';
  const parts = [];
  if (level.zoom) parts.push(`ZOOM ×${level.zoom}`);
  if (level.sway) parts.push(`SWAY −${Math.round((1 - level.sway) * 100)}%`);
  if (level.hold) parts.push(`HOLD ${level.hold} S`);
  if (level.cycle) parts.push(`CYCLE −${Math.round((1 - level.cycle) * 100)}%`);
  if (level.mag) parts.push(`MAG +${Math.round((level.mag - 1) * 100)}%`);
  if (level.focus) parts.push(`FOCUS ×${level.focus}`);
  return parts.join(' · ') || 'UNLOCK';
}

function upgradeItem(id, st) {
  const u = UPGRADES[id];
  const it = base(id, 'upgrades', 'upgrade', u);
  const max = u.levels.length;
  const lv = Math.max(0, Math.min(max, Math.floor(num(st.owned.upgrades[id]))));
  it.level = { cur: lv, max };
  if (lv >= max) {
    it.status = 'maxed';
    it.actionLabel = max > 1 ? 'MAXED' : 'INSTALLED';
    it.tag = max > 1 ? `LEVEL ${lv}/${max} · ${upgradeEffect(u.levels[max - 1])}` : 'INSTALLED';
    return it;
  }
  const next = u.levels[lv];
  it.tag = max > 1 ? `LEVEL ${lv}/${max} · NEXT ${upgradeEffect(next)}` : upgradeEffect(next);
  priced(it, next.price, st.cash);
  it.action = lv === 0 ? 'buy' : 'upgrade';
  it.actionLabel = lv === 0 ? 'BUY' : `UPGRADE`;
  it.enabled = it.affordable;
  it.status = lv > 0 ? 'owned' : 'available';
  return it;
}

/** How many of a placeable defence the level has room for (Infinity: no limit). */
export function defenceLimit(id) {
  const d = DEFENCES[id];
  if (!d) return 0;
  if (d.place === 'barrel') return (LAYOUT.barrelSpots || []).length || Infinity;
  if (d.place === 'mount') return (LAYOUT.floodlightMounts || []).length || Infinity;
  if (d.place === 'sentry') return 1;
  if (d.once) return 1;
  return Infinity;
}

function defenceItem(id, st) {
  const d = DEFENCES[id];
  const it = base(id, 'defences', 'defence', d);
  const count = num(st.owned.defences[id]);
  const limit = defenceLimit(id);
  it.count = count;
  it.tag = PLACE_TAG[d.place] || '';
  if (d.place === 'gate') {
    if (id === 'repair' || d.amount) {
      const g = st.gate;
      it.stats = [{ label: 'GATE', value: clamp01(g.hp / g.max), text: `${Math.round((100 * g.hp) / g.max)}%` }];
      it.tag = `+${Math.round(num(d.amount, 0.25) * 100)}% GATE · INSTANT`;
      priced(it, d.price, st.cash);
      it.action = 'repair';
      it.actionLabel = 'REPAIR';
      if (g.hp >= g.max) {
        it.enabled = false;
        it.reason = 'GATE INTACT';
        it.status = 'maxed';
      } else it.enabled = it.affordable;
      return it;
    }
    if (count >= 1) {
      it.status = 'maxed';
      it.actionLabel = 'INSTALLED';
      it.tag = 'INSTALLED';
      return it;
    }
    it.tag = `GATE ×${num(d.maxHp, 1)} HP · INSTANT`;
    priced(it, d.price, st.cash);
    it.action = 'buy';
    it.actionLabel = 'INSTALL';
    it.enabled = it.affordable;
    return it;
  }
  if (d.place === 'sentry' && count >= 1) {
    it.status = 'owned';
    it.tag = `MOUNTED · REFILL ${d.ammo} RDS`;
    priced(it, num(d.refill, d.price), st.cash);
    it.action = 'refill';
    it.actionLabel = 'REFILL';
    it.enabled = it.affordable;
    return it;
  }
  if (Number.isFinite(limit)) it.tag += ` · ${count}/${limit}`;
  else if (count > 0) it.tag += ` · ${count} PLACED`;
  if (count >= limit) {
    it.status = 'maxed';
    it.actionLabel = 'ALL PLACED';
    return it;
  }
  priced(it, d.price, st.cash);
  it.action = 'place';
  it.actionLabel = 'PLACE';
  it.enabled = it.affordable;
  it.status = count > 0 ? 'owned' : 'available';
  return it;
}

/** Cards of one shop tab, in catalog order. */
export function shopItems(tab, state) {
  const st = state && state.owned && state.owned.rifles instanceof Set ? state : normalizeShopState(state);
  switch (tab) {
    case 'rifles': return RIFLE_ORDER.filter((id) => RIFLES[id]).map((id) => rifleItem(id, st));
    case 'ammo': return AMMO_ORDER.filter((id) => AMMO[id]).map((id) => ammoItem(id, st));
    case 'upgrades': return UPGRADE_ORDER.filter((id) => UPGRADES[id]).map((id) => upgradeItem(id, st));
    case 'defences': return DEFENCE_ORDER.filter((id) => DEFENCES[id]).map((id) => defenceItem(id, st));
    default: return [];
  }
}

/** Number of cards in each tab the player can act on right now (for the tab badges). */
export function tabBadges(state) {
  const st = normalizeShopState(state);
  const out = {};
  for (const t of SHOP_TABS) out[t.id] = shopItems(t.id, st).filter((i) => i.enabled && i.action !== 'equip').length;
  return out;
}

/**
 * Grid keyboard navigation: index in a list of `count` cards laid out in `cols` columns.
 * dir: 'left' | 'right' | 'up' | 'down' | 'home' | 'end'.
 */
export function moveSelection(index, count, cols, dir) {
  if (count <= 0) return 0;
  const c = Math.max(1, cols | 0);
  let i = Math.max(0, Math.min(count - 1, index | 0));
  if (dir === 'left') i = Math.max(0, i - 1);
  else if (dir === 'right') i = Math.min(count - 1, i + 1);
  else if (dir === 'up') i = i - c >= 0 ? i - c : i;
  else if (dir === 'down') {
    if (i + c < count) i += c;
    else if (Math.floor((count - 1) / c) > Math.floor(i / c)) i = count - 1; // short last row
  } else if (dir === 'home') i = 0;
  else if (dir === 'end') i = count - 1;
  return i;
}

/** The handler call a card's action maps to: ['onPlace', id] or ['onShopBuy', id, info]. */
export function actionCall(item, which = 'primary') {
  const a = which === 'secondary' ? item.secondary && item.secondary.action : item.action;
  if (!a) return null;
  if (a === 'place') return ['onPlace', item.id];
  return ['onShopBuy', item.id, { kind: item.kind, action: a, tab: item.tab }];
}

export { groupThousands };
