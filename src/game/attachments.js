// Weapon upgrades for zombie survival: attachments bolted onto the gun you hold (or your
// primary) and paint jobs. Bought from the Upgrades page of the buy menu (key 9); they
// stay on that weapon until it's gone.
//
// Slots (one attachment each):
//   muzzle - suppressor (quiet, no flash, zombies hear less of it, a little less recoil and
//            damage) or compensator (much less recoil)
//   optic  - red-dot sight: tighter shots, and right-click aims down the sight (1.3x zoom,
//            much tighter) on guns without a right-click of their own
//   laser  - laser sight: much tighter hip fire, a red dot where you're aiming
//   grip   - vertical foregrip: less recoil, steadier on the move
//   mag    - extended magazine: half again as many rounds
// Skins only change the paint.
// The weapon layer (w.mods) multiplies with its holder's perks (zmods.js: the player layer);
// the forge (zforge.js, Milestone 3.2) folds w.tier / w.round in here too (refresh).
import * as WS from './weaponsys.js';

export const ATTACHMENTS = {
  suppressor: { slot: 'muzzle', name: 'Suppressor', price: 500, text: 'Screws onto the muzzle. Much quieter (the noise no longer draws the zombies to you), no muzzle flash, a little less recoil; 5% less damage.' },
  compensator: { slot: 'muzzle', name: 'Compensator', price: 400, text: 'Muzzle brake that vents the gas upward: about 30% less recoil.' },
  laser: { slot: 'laser', name: 'Laser Sight', price: 350, text: 'Red laser on the rail: 30% tighter hip fire, and a dot on whatever you aim at.' },
  reddot: { slot: 'optic', name: 'Red-Dot Sight', price: 450, text: 'Reflex sight: 15% tighter. Right-click to aim down the sight (1.3x zoom, 40% tighter, a little slower to move) on guns that don\'t use right-click.' },
  foregrip: { slot: 'grip', name: 'Foregrip', price: 300, text: 'Grip under the handguard: about 20% less recoil, 30% steadier while moving.' },
  extmag: { slot: 'mag', name: 'Extended Mag', price: 500, text: 'Half again as many rounds in every magazine (a fresh full one comes with it).' },
};
export const ATTACHMENT_IDS = Object.keys(ATTACHMENTS);

export const SKINS = {
  gold: { name: 'Gold Plated', price: 2000, text: 'Polished 24-carat gold over every metal part.' },
  carbon: { name: 'Carbon Fiber', price: 900, text: 'Black carbon-fibre weave with a clear coat.' },
  desert: { name: 'Desert Storm', price: 600, text: 'Sand and tan camouflage.' },
  woodland: { name: 'Woodland', price: 600, text: 'Green, brown and black camouflage.' },
  arctic: { name: 'Arctic Camo', price: 600, text: 'White and grey winter camouflage.' },
  digital: { name: 'Urban Digital', price: 800, text: 'Blue-grey pixel camouflage.' },
  crimson: { name: 'Crimson Web', price: 1200, text: 'Deep red with a black spider web.' },
  neon: { name: 'Neon Rider', price: 1500, text: 'Black with glowing cyan and magenta stripes.' },
  factory: { name: 'Factory Finish', price: 0, text: 'Strip the paint back to how it came from the factory.' },
};
export const SKIN_IDS = Object.keys(SKINS);

const GUN_KINDS = new Set(['pistol', 'shotgun', 'smg', 'rifle', 'sniper', 'mg']);
const SCOPED = new Set(['aug', 'sg552', 'scout', 'awp', 'g3sg1', 'sg550', 'barrett']);
const BUILT_IN_SILENCER = new Set(['usp', 'm4a1']);
// what each kind of gun can't take
const NO = {
  muzzle: (id) => BUILT_IN_SILENCER.has(id) || id === 'minigun' || id === 'elite',
  optic: (id) => SCOPED.has(id) || id === 'minigun' || id === 'elite',
  grip: (id, def) => def.slot === 2 || id === 'p90' || id === 'elite' || id === 'minigun',
  laser: (id) => id === 'elite',
  mag: () => false,
};

export const isGun = (w) => !!w && GUN_KINDS.has(w.def.kind);

/** null if `att` fits weapon w, else why not. */
export function whyNot(w, att) {
  const a = ATTACHMENTS[att];
  if (!a) return 'Unknown';
  if (!isGun(w)) return 'Not on this weapon';
  if (NO[a.slot](w.id, w.def)) return "Doesn't fit this gun";
  if (w.att?.[a.slot] === att) return 'Already fitted';
  return null;
}

/** The weapon upgrades go on: the gun in hand, else the primary, else the pistol. */
export function upgradeTarget(p) {
  if (isGun(p.active)) return p.active;
  return [p.weapons[1], p.weapons[2]].find(isGun) || null;
}
/** Skins go on whatever's in hand (if it's a weapon with a view model worth painting). */
export function skinTarget(p) {
  const a = p.active;
  if (a && a.def.slot !== 4 && a.def.kind !== 'c4') return a;
  return upgradeTarget(p);
}

/**
 * Recompute the stat multipliers from w.att (call after any change). m.reload / m.handling
 * are reload / draw time multipliers (weaponsys reloadK / drawK; the forge's tiers).
 */
export function refresh(w) {
  const att = w.att || {};
  const has = (id) => Object.values(att).includes(id);
  const m = { spread: 1, moveSpread: 1, hip: 1, ads: 0.6, recoil: 1, damage: 1, clip: w.def.clip, reload: 1, handling: 1, suppressed: false, laser: false, optic: false };
  if (has('suppressor')) { m.suppressed = true; m.recoil *= 0.92; m.damage *= 0.95; }
  if (has('compensator')) m.recoil *= 0.72;
  if (has('foregrip')) { m.recoil *= 0.8; m.moveSpread *= 0.7; }
  if (has('laser')) { m.laser = true; m.hip = 0.7; }
  if (has('reddot')) { m.optic = true; m.spread *= 0.85; }
  if (has('extmag') && w.def.clip > 0) m.clip = Math.round(w.def.clip * 1.5);
  w.mods = m;
  w.clipMax = m.clip;
  w.zmRev = -1; // (its holder's magazine perks fold in again: zmods.js weapon)
  return m;
}

/** Bolt `att` onto w (no checks). */
export function fit(w, att) {
  const a = ATTACHMENTS[att];
  w.att = { ...(w.att || {}), [a.slot]: att };
  refresh(w);
  if (att === 'extmag') w.clip = Math.max(w.clip, w.clipMax); // the bigger magazine comes loaded
}

/** Buy `item` ('att_<id>', 'skin_<id>'; the forge's 'tier_<n>' / 'round_<id>': zforge.js) for p. Returns true if bought. */
export function buyUpgrade(game, p, item, pay, say) {
  const [kind, id] = item.split('_');
  if (kind === 'tier' || kind === 'round') return !!game.zombies?.forge?.buy(p, item, pay, say);
  if (kind === 'att') {
    const w = upgradeTarget(p);
    if (!w) { say('Get a gun first!'); return false; }
    const why = whyNot(w, id);
    if (why) { say(`${why} (${w.def.shortName || w.def.name})`); return false; }
    if (!pay(ATTACHMENTS[id].price)) return false;
    fit(w, id);
    game.onLoadoutChanged?.(p, w);
    game.sound?.play('attach_fit', { pos: p.isLocal ? null : p.eyePos(), volume: 0.8 });
    if (p.isLocal) game.hud?.centerPrint?.(`${ATTACHMENTS[id].name} fitted to the ${w.def.shortName || w.def.name}`, 2);
    return true;
  }
  if (kind === 'skin') {
    const w = skinTarget(p), s = SKINS[id];
    if (!w || !s) return false;
    if ((w.skin || 'factory') === id) { say('It already looks like that!'); return false; }
    if (!pay(s.price)) return false;
    w.skin = id === 'factory' ? null : id;
    game.onLoadoutChanged?.(p, w);
    game.sound?.play('attach_fit', { pos: p.isLocal ? null : p.eyePos(), volume: 0.5 });
    if (p.isLocal) game.hud?.centerPrint?.(`${s.name}: ${w.def.shortName || w.def.name}`, 2);
    return true;
  }
  return false;
}

/** For the buy menu: { off, note } for an upgrade item. */
export function menuState(p, item) {
  const [kind, id] = item.split('_');
  if (kind === 'att') {
    const w = upgradeTarget(p);
    if (!w) return { off: true, note: 'no gun' };
    const why = whyNot(w, id);
    if (why === 'Already fitted') return { off: true, note: 'fitted' };
    if (why) return { off: true, note: 'n/a' };
    const cur = w.att?.[ATTACHMENTS[id].slot];
    return { off: false, note: cur ? 'swap' : null };
  }
  if (kind === 'skin') {
    const w = skinTarget(p);
    if (!w) return { off: true, note: 'no weapon' };
    if ((w.skin || 'factory') === id) return { off: true, note: 'current' };
    return { off: false, note: null };
  }
  if (kind === 'perk') return p.secondWind ? { off: true, note: 'owned' } : { off: false, note: null }; // (Second Wind, zdowned.js)
  return { off: false, note: null };
}

/** Name of the weapon the upgrades page works on (title of the page). */
export function targetName(p, skins = false) {
  const w = skins ? skinTarget(p) : upgradeTarget(p);
  return w ? (WS.WEAPON_DEFS[w.id]?.shortName || w.def.name) : null;
}
