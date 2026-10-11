// Counter-Strike 1.6 combat rules: bullets + wall penetration, hit groups, armor,
// explosions, flashbangs, grenade/C4 numbers and the round economy.
//
// Ported from ReGameDLL_CS (the open-source reimplementation of the CS 1.6 game
// DLL). Where ReGameDLL has `#ifdef REGAMEDLL_FIXES / REGAMEDLL_ADD` branches the
// ORIGINAL (non-fixes) branch is used, because that is what CS 1.6 actually did.
//   cbase.cpp            CBaseEntity::FireBullets3 / FireBullets (buckshot)
//   player.cpp           CBasePlayer::TraceAttack / TakeDamage / IsArmored / AddAccount
//   combat.cpp           RadiusDamage / RadiusFlash
//   basemonster.cpp      CBaseMonster::RadiusDamage (radius = 3.5 x damage)
//   ggrenade.cpp         CGrenade::* (HE / flash / smoke / C4)
//   multiplay_gamerules.cpp, gamerules.h, game.cpp   money + round rules, cvar defaults
//
// Everything is GoldSrc space (X east, Y north, Z up, 1 unit = 1 inch), angles in
// degrees, pitch positive = looking DOWN (see docs/conventions.md).
// DOM-free and dependency-free.

// ---------------------------------------------------------------- small vector kit
const DEG = Math.PI / 180;
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a); return l > 0 ? scale(a, 1 / l) : [0, 0, 0]; };

/**
 * GoldSrc AngleVectors(): [pitch, yaw, roll] in degrees -> { forward, right, up }.
 * Pitch positive looks down (forward.z = -sin(pitch)); `right` points to the right.
 */
export function angleVectors(angles) {
  const p = (angles[0] || 0) * DEG, y = (angles[1] || 0) * DEG, r = (angles[2] || 0) * DEG;
  const sp = Math.sin(p), cp = Math.cos(p), sy = Math.sin(y), cy = Math.cos(y), sr = Math.sin(r), cr = Math.cos(r);
  return {
    forward: [cp * cy, cp * sy, -sp],
    right: [-sr * sp * cy + cr * sy, -sr * sp * sy - cr * cy, -sr * cp],
    up: [cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp],
  };
}

export const VEC = { add, sub, scale, madd, dot, len, norm };

// ---------------------------------------------------------------- hit groups
export const HITGROUP = Object.freeze({
  GENERIC: 0, HEAD: 1, CHEST: 2, STOMACH: 3, LEFTARM: 4, RIGHTARM: 5, LEFTLEG: 6, RIGHTLEG: 7, SHIELD: 8,
});

/** CBasePlayer::TraceAttack multipliers (arms are x1 in CS 1.6). */
export const HITGROUP_DAMAGE_MULT = Object.freeze({
  0: 1, 1: 4, 2: 1, 3: 1.25, 4: 1, 5: 1, 6: 0.75, 7: 0.75, 8: 0,
});

/** Damage after the TraceAttack hit-group multiplier. */
export function applyHitgroup(damage, hitgroup) {
  return damage * (HITGROUP_DAMAGE_MULT[hitgroup] ?? 1);
}

// ---------------------------------------------------------------- armor
export const ARMOR_RATIO = 0.5; // player.h: armor takes 50% of the damage
export const ARMOR_BONUS = 0.5; // each point of armor is worth 1/x points of health

/**
 * Per-weapon armor-penetration factor (CBasePlayer::TakeDamage switch on the
 * attacker's active weapon). The effective ratio is ARMOR_RATIO * factor
 * (e.g. AK-47: 0.5 * 1.55 = 0.775 of the damage goes to health).
 * Weapons not listed (usp, tmp, mp5, ump45, m3, xm1014, grenades, c4...) use 1.0.
 */
export const WEAPON_ARMOR_RATIO = Object.freeze({
  aug: 1.4, m4a1: 1.4, awp: 1.95, g3sg1: 1.65, sg550: 1.45, m249: 1.5, elite: 1.05, deagle: 1.5,
  glock: 1.05, fiveseven: 1.5, p90: 1.5, mac10: 0.95, p228: 1.25, scout: 1.7, knife: 1.7,
  famas: 1.4, sg552: 1.4, galil: 1.55, ak47: 1.55,
});

/** CBasePlayer::ShouldDoLargeFlinch weapon list (big flinch + knockback). */
export const LARGE_FLINCH_WEAPONS = Object.freeze(['scout', 'aug', 'sg550', 'galil', 'famas', 'awp', 'm3', 'm4a1', 'g3sg1', 'deagle', 'sg552', 'ak47']);

/** CBasePlayer::IsArmored: kevlar covers generic/chest/stomach/arms, the head only with a helmet. */
export function isArmored(victim, hitgroup) {
  if (!(victim.armor > 0)) return false;
  switch (hitgroup) {
    case HITGROUP.HEAD: return !!victim.helmet;
    case HITGROUP.GENERIC: case HITGROUP.CHEST: case HITGROUP.STOMACH:
    case HITGROUP.LEFTARM: case HITGROUP.RIGHTARM: return true;
    default: return false;
  }
}

/**
 * CBasePlayer::TraceAttack + CBasePlayer::TakeDamage.
 *
 * victim: { health, armor, helmet, ducking?, speed?, isVIP?, shield? }
 * damage: raw damage as passed to TraceAttack (bullet/knife), i.e. BEFORE the
 *         hit-group multiplier (unless opts.prescaled), or the radius-damage
 *         amount for explosions.
 * opts:   { armorRatio?   weapon factor (WEAPON_ARMOR_RATIO value, default from attackerWeapon or 1),
 *           attackerWeapon?, prescaled?, blast? (HE/C4 path; auto when attackerWeapon is hegrenade/c4),
 *           teammate?, self?, friendlyFire?, random? }
 * Returns new health/armor/helmet plus side effects the game should apply:
 *   victimPunch {x, z} (absolute punchangle values TraceAttack SETS), velocityModifier
 *   (0.5 small / 0.65 large flinch, recovers +0.01 per on-ground frame), knockback (units/s
 *   away from the attacker) and helmetHit (spark instead of blood).
 */
export function computeDamage(victim, damage, hitgroup = HITGROUP.GENERIC, opts = {}) {
  const random = opts.random || Math.random;
  const wpn = opts.attackerWeapon;
  const blast = opts.blast ?? (wpn === 'hegrenade' || wpn === 'c4');
  const oldArmor = victim.armor > 0 ? victim.armor : 0;
  let health = victim.health ?? 100;
  let armor = oldArmor;
  let helmet = !!victim.helmet && armor > 0;
  const res = {
    health, armor, helmet, damage: 0, damageToHealth: 0, damageToArmor: 0, helmetHit: false,
    killed: false, refused: false, hitgroup, victimPunch: null, velocityModifier: 0, knockback: 0, bleed: false,
  };

  if (blast) {
    // TakeDamage DMG_BLAST/DMG_EXPLOSION branch (hit group forced to GENERIC, no weapon factor,
    // and the "blasts damage armor more" doubling below it is never reached).
    res.hitgroup = HITGROUP.GENERIC;
    if (opts.teammate && !opts.self && !opts.friendlyFire) { res.refused = true; return res; }
    let d = damage;
    let ratio = ARMOR_RATIO;
    if (victim.isVIP) ratio *= 0.5;
    if (armor > 0) {
      let flNew = ratio * d;
      let flArmor = (d - flNew) * ARMOR_BONUS;
      if (flArmor > armor) { flNew = d - armor; armor = 0; } // note: not armor/bonus here (original code)
      else { if (flArmor < 0) flArmor = 1; armor -= flArmor; }
      d = flNew;
      if (armor <= 0) helmet = false; // m_iKevlar = ARMOR_NONE
    }
    const take = Math.trunc(d);
    health -= take;
    Object.assign(res, { health, armor, helmet, damage: d, damageToHealth: take, damageToArmor: oldArmor - armor, killed: health <= 0, bleed: take > 0 });
    return res;
  }

  // ---- TraceAttack: hit-group multiplier, bleeding and the victim's view punch
  let d = opts.prescaled ? damage : applyHitgroup(damage, hitgroup);
  const kevlar = armor > 0;
  let bleed = !(opts.teammate && !opts.friendlyFire);
  if (hitgroup === HITGROUP.HEAD) {
    if (kevlar && victim.helmet) { bleed = false; res.helmetHit = true; }
    if (bleed) {
      let px = d * -0.5; if (px < -12) px = -12;
      let pz = d * (random() * 2 - 1); if (pz < -9) pz = -9; else if (pz > 9) pz = 9;
      res.victimPunch = { x: px, z: pz };
    }
  } else if (hitgroup === HITGROUP.CHEST || hitgroup === HITGROUP.STOMACH) {
    if (kevlar) bleed = false;
    else if (bleed) { let px = d * -0.1; if (px < -4) px = -4; res.victimPunch = { x: px, z: null }; }
  } else if (hitgroup === HITGROUP.LEFTARM || hitgroup === HITGROUP.RIGHTARM) {
    if (kevlar) bleed = false;
  }
  res.bleed = bleed;

  // ---- TakeDamage (bullet / knife path)
  if (opts.teammate && !opts.self) {
    if (!opts.friendlyFire) { res.refused = true; res.victimPunch = null; return res; }
    d *= 0.35; // original: teammates take 35%
  }
  let ratio = ARMOR_RATIO;
  if (victim.isVIP) ratio *= 0.5;
  if (wpn || opts.armorRatio != null) {
    ratio += victim.shield ? 0.2 : 0;
    ratio *= opts.armorRatio ?? WEAPON_ARMOR_RATIO[wpn] ?? 1;
    // flinch / "tagging" (TakeDamageImpulse)
    const large = !victim.ducking && hitgroup !== HITGROUP.LEFTLEG && hitgroup !== HITGROUP.RIGHTLEG && LARGE_FLINCH_WEAPONS.includes(wpn);
    if (large) { res.velocityModifier = 0.65; if ((victim.speed ?? 0) < 300) res.knockback = 170; }
    else res.velocityModifier = 0.5;
  }
  if (armor > 0 && isArmored({ armor, helmet: victim.helmet }, hitgroup)) {
    let flNew = ratio * d;
    let flArmor = (d - flNew) * ARMOR_BONUS;
    if (flArmor > armor) {
      flArmor = armor * (1 / ARMOR_BONUS);
      flNew = d - flArmor;
      armor = 0;
    } else {
      if (flArmor < 0) flArmor = 1;
      armor -= flArmor;
    }
    d = flNew;
    if (armor <= 0) helmet = false;
  }
  // "this cast to INT is critical!!!" - CBaseMonster::TakeDamage(int(flDamage))
  const take = Math.trunc(d);
  health -= take;
  Object.assign(res, { health, armor, helmet, damage: d, damageToHealth: take, damageToArmor: oldArmor - armor, killed: health <= 0 });
  return res;
}

/**
 * CBasePlayer::PreThink "tagging" recovery: while on the ground the velocity
 * modifier creeps back by +0.01 PER FRAME and the velocity is scaled by it.
 * Returns { modifier, velocityScale } (velocityScale = 1 when nothing to do).
 */
export function stepVelocityModifier(modifier, onGround) {
  if (!onGround || modifier >= 1) return { modifier: Math.min(modifier, 1), velocityScale: 1 };
  const m = modifier + 0.01;
  return { modifier: m > 1 ? 1 : m, velocityScale: m };
}

// ---------------------------------------------------------------- bullets
export const BULLET = Object.freeze({
  NONE: 'none', PLAYER_9MM: '9mm', PLAYER_45ACP: '45acp', PLAYER_50AE: '50ae', PLAYER_762MM: '762mm',
  PLAYER_556MM: '556mm', PLAYER_338MAG: '338mag', PLAYER_57MM: '57mm', PLAYER_357SIG: '357sig', PLAYER_BUCKSHOT: 'buckshot',
});

/** FireBullets3 penetration power (units the bullet jumps through a wall) and max penetration distance. */
export const BULLET_PENETRATION = Object.freeze({
  '9mm': { power: 21, distance: 800 },
  '45acp': { power: 15, distance: 500 },
  '50ae': { power: 30, distance: 1000 },
  '762mm': { power: 39, distance: 5000 },
  '556mm': { power: 35, distance: 4000 },
  '338mag': { power: 45, distance: 8000 },
  '57mm': { power: 30, distance: 2000 },
  '357sig': { power: 25, distance: 800 },
});

/**
 * Material effects in FireBullets3 (CHAR_TEX_*). power: multiplier on the (integer)
 * penetration power, damage: the damage modifier applied after passing the surface.
 * Surfaces not listed (dirt, sand, snow, glass, flesh, slosh) change nothing; an
 * unknown world texture defaults to concrete like TEXTURETYPE_Find().
 */
export const SURFACE_PENETRATION = Object.freeze({
  metal: { power: 0.15, damage: 0.2 },
  concrete: { power: 0.25 },
  grate: { power: 0.5, damage: 0.4 },
  vent: { power: 0.5, damage: 0.45 },
  tile: { power: 0.65, damage: 0.3 },
  computer: { power: 0.4, damage: 0.45 },
  wood: { damage: 0.6 },
});
const KNOWN_SURFACES = new Set(['metal', 'concrete', 'grate', 'vent', 'tile', 'computer', 'wood', 'dirt', 'sand', 'snow', 'glass', 'flesh', 'slosh']);

function isBspHit(tr) { return !tr.entity || tr.solidBsp === true || tr.isBSP === true; }

/**
 * CBaseEntity::FireBullets3 - one bullet with CS wall penetration.
 *
 * opts: { src, forward, right, up (GoldSrc vectors built from v_angle + punchangle),
 *         spread, distance (8192 rifles / 4096 most pistols), penetration (1..3),
 *         bulletType (BULLET.*), damage, rangeModifier, random? (() => [0,1)),
 *         spreadOffset? [x, y] (deterministic override of the two triangular randoms),
 *         ignore? (passed to traceFn as the entity to skip) }
 * traceFn(start, end, ignore) -> { fraction, endpos, normal, entity (player|null for world),
 *         hitgroup, surface, startsolid, allsolid, solidBsp? }
 *   The trace must behave like a GoldSrc hull trace: a trace that STARTS inside solid
 *   ignores that solid until it leaves it (startsolid=true) and reports the next surface;
 *   if it never leaves solid it returns allsolid (treated as "no hit" - fraction 1).
 *   That is why CS 1.6 wall thickness barely matters: the bullet is teleported
 *   `power` units past the entry point and carries on from there.
 * onImpact(hit) is called for every surface/player hit, in order:
 *   { entity, hitgroup, damage (integer damage handed to TraceAttack, BEFORE the hit-group
 *     multiplier; feed it to computeDamage), point, normal, surface, dir (unit), fraction,
 *     penetrated (objects already passed), startsolid, shield }
 * Returns the (unit) direction the bullet travelled, with .spreadX/.spreadY = x*spread, y*spread.
 */
export function fireBullets3(opts, traceFn, onImpact = () => {}) {
  if (opts.bulletType === BULLET.PLAYER_BUCKSHOT || (opts.shots ?? 1) > 1) {
    // Convenience: a shotgun blast handed to fireBullets3 is routed to fireBuckshot. onImpact then
    // gets every pellet (damage = raw pellet damage); the multi-damage sums are in result.buckshot.
    const r = fireBuckshot(opts, traceFn, onImpact);
    const d = r.dirs[0] ? r.dirs[0].slice() : norm(opts.forward);
    d.buckshot = r;
    return d;
  }
  const random = opts.random || Math.random;
  const spread = opts.spread ?? 0;
  let distance = opts.distance ?? 8192;
  let penetration = opts.penetration ?? 1;
  const pen = BULLET_PENETRATION[opts.bulletType] || { power: 0, distance: 0 };
  let power = pen.power; // int iPenetrationPower
  const penDistance = pen.distance;
  let curDamage = Math.trunc(opts.damage ?? 0); // int iCurrentDamage
  const rangeModifier = opts.rangeModifier ?? 1;
  const { forward, right, up } = opts;

  // player shots use the shared random seed: two triangular samples, no circular rejection
  let x, y;
  if (opts.spreadOffset) { x = opts.spreadOffset[0]; y = opts.spreadOffset[1]; }
  else {
    x = (random() - 0.5) + (random() - 0.5);
    y = (random() - 0.5) + (random() - 0.5);
  }
  const dir = [
    forward[0] + x * spread * right[0] + y * spread * up[0],
    forward[1] + x * spread * right[1] + y * spread * up[1],
    forward[2] + x * spread * right[2] + y * spread * up[2],
  ]; // NB: not normalised, exactly like vecDir in the C++
  const unitDir = norm(dir);
  let src = opts.src.slice();
  let end = madd(src, dir, distance);
  let damageModifier = 0.5; // persists across iterations
  const startPenetration = penetration;

  while (penetration !== 0) {
    const tr = traceFn(src, end, opts.ignore) || { fraction: 1 };
    const hit = !tr.allsolid && tr.fraction < 1;
    let surface = tr.entity && !isBspHit(tr) ? 'flesh' : (tr.surface || 'concrete');
    if (!KNOWN_SURFACES.has(surface)) surface = 'concrete';
    const mat = SURFACE_PENETRATION[surface];
    if (mat) {
      if (mat.power != null) power = Math.trunc(power * mat.power);
      if (mat.damage != null) damageModifier = mat.damage;
    }
    if (!hit) break;

    const curPen = penetration;
    penetration--;
    const curDistance = tr.fraction * distance;
    curDamage = Math.trunc(curDamage * Math.pow(rangeModifier, curDistance / 500));
    if (curDistance > penDistance) penetration = 0;

    if (tr.hitgroup === HITGROUP.SHIELD) {
      onImpact({ entity: tr.entity ?? null, hitgroup: HITGROUP.SHIELD, damage: curDamage, point: tr.endpos, normal: tr.normal, surface: 'metal', dir: unitDir, fraction: tr.fraction, penetrated: startPenetration - curPen, startsolid: !!tr.startsolid, shield: true });
      break; // stop on shield hit
    }

    let distanceModifier;
    if (!isBspHit(tr) || !penetration) {
      power = 42;
      damageModifier = 0.75;
      distanceModifier = 0.75;
    } else distanceModifier = 0.5;

    const point = tr.endpos;
    src = madd(point, dir, power);
    distance = (distance - curDistance) * distanceModifier;
    end = madd(src, dir, distance);

    onImpact({
      entity: tr.entity ?? null, hitgroup: tr.entity ? (tr.hitgroup ?? HITGROUP.GENERIC) : HITGROUP.GENERIC,
      damage: curDamage, point, normal: tr.normal, surface, dir: unitDir, fraction: tr.fraction,
      penetrated: startPenetration - curPen, startsolid: !!tr.startsolid, shield: false, brushEnt: tr.brushEnt ?? null,
    });
    curDamage = Math.trunc(curDamage * damageModifier);
  }
  unitDir.spreadX = x * spread;
  unitDir.spreadY = y * spread;
  return unitDir;
}

/**
 * Shotgun pellets: CBaseEntity::FireBullets(cShots, ..., BULLET_PLAYER_BUCKSHOT) as used by the
 * original M3 / XM1014. Circular-gaussian cone, no penetration, per-pellet damage
 * int((1 - fraction) * damage) i.e. linear falloff to 0 at `distance` (3000 / 3048).
 * Pellets on the same victim are summed (multi-damage) BEFORE armor is applied.
 *
 * opts: { src, forward, right, up, shots (9 M3 / 6 XM1014), spreadX, spreadY (cone 0.0675 / 0.0725),
 *         distance, damage (20), random?, ignore? }
 * onImpact(hit) per pellet hit (effects): same fields as fireBullets3, damage = raw pellet damage,
 *         scaledDamage = after hit-group multiplier, deferred = true.
 * Returns { dirs: [unit vectors], damage: [{ entity, amount, hitgroup }] } - apply each entry
 *   with computeDamage(victim, amount, hitgroup, { prescaled: true, attackerWeapon }).
 */
export function fireBuckshot(opts, traceFn, onImpact = () => {}) {
  const random = opts.random || Math.random;
  const shots = opts.shots ?? 9;
  const sx = opts.spreadX ?? opts.spread ?? 0, sy = opts.spreadY ?? opts.spread ?? 0;
  const distance = opts.distance ?? 3000;
  const base = opts.damage ?? 20;
  const { forward, right, up, src } = opts;
  const dirs = [];
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (let i = 0; i < shots; i++) {
    let x, y, z;
    do {
      x = (random() - 0.5) + (random() - 0.5);
      y = (random() - 0.5) + (random() - 0.5);
      z = x * x + y * y;
    } while (z > 1);
    const dir = [
      forward[0] + x * sx * right[0] + y * sy * up[0],
      forward[1] + x * sx * right[1] + y * sy * up[1],
      forward[2] + x * sx * right[2] + y * sy * up[2],
    ];
    const unit = norm(dir);
    dirs.push(unit);
    const tr = traceFn(src, madd(src, dir, distance), opts.ignore) || { fraction: 1 };
    if (tr.allsolid || !(tr.fraction < 1)) continue;
    const dmg = Math.trunc((1 - tr.fraction) * base);
    const entity = tr.entity ?? null;
    const hitgroup = entity ? (tr.hitgroup ?? HITGROUP.GENERIC) : HITGROUP.GENERIC;
    const scaled = entity && !isBspHit(tr) ? applyHitgroup(dmg, hitgroup) : dmg;
    onImpact({ entity, hitgroup, damage: dmg, scaledDamage: scaled, point: tr.endpos, normal: tr.normal, surface: entity && !isBspHit(tr) ? 'flesh' : (tr.surface || 'concrete'), dir: unit, fraction: tr.fraction, penetrated: 0, startsolid: !!tr.startsolid, deferred: true, brushEnt: tr.brushEnt ?? null });
    if (entity) { // AddMultiDamage: a different victim flushes the accumulator
      if (!cur || cur.entity !== entity) { flush(); cur = { entity, amount: 0, hitgroup }; }
      cur.amount += scaled;
      cur.hitgroup = hitgroup; // m_LastHitGroup = last pellet
    }
  }
  flush();
  return { dirs, damage: out };
}

/** Dispatch helper: buckshot for shotguns, FireBullets3 otherwise (what ctx.fireBullets receives). */
export function fireShot(opts, traceFn, onImpact) {
  if (opts.bulletType === BULLET.PLAYER_BUCKSHOT || (opts.shots ?? 1) > 1) return fireBuckshot(opts, traceFn, onImpact);
  return fireBullets3(opts, traceFn, onImpact);
}

// ---------------------------------------------------------------- explosions
/**
 * ::RadiusDamage (combat.cpp) as reached through CBaseMonster::RadiusDamage for damage > 80
 * (HE: 100 / 350, C4: 500 / 1750). Linear falloff from vecSrc = center + 1 z to each target's
 * GoldSrc origin (hull centre). CS 1.6 does NOT test line of sight (only Condition Zero did),
 * so HE damage goes through walls; pass visibilityFn(src, target) -> fraction 0..1 / boolean
 * if you want an occlusion multiplier anyway.
 * targets: [{ origin, waterLevel?, takeDamage?, ... }]. Returns [{ target, damage }] (damage > 0);
 * apply with computeDamage(target, damage, HITGROUP.GENERIC, { blast: true, teammate, self, friendlyFire }).
 */
export function radiusDamage(center, damage, radius, targets, visibilityFn) {
  const src = [center[0], center[1], center[2] + 1];
  const falloff = radius ? damage / radius : 1;
  const out = [];
  for (const target of targets || []) {
    if (!target || target.takeDamage === false || !target.origin) continue;
    const l = len(sub(src, target.origin));
    // UTIL_FindEntityInSphere tests the bounding box; approximate with a 16-unit hull slack
    if (l > radius + (target.radiusSlack ?? 16)) continue;
    let adj = damage - l * falloff;
    if (visibilityFn) {
      const v = visibilityFn(src, target);
      if (v === false) continue;
      if (typeof v === 'number') adj *= v;
    }
    if (adj <= 0) continue; // original clamps to 0 and calls TakeDamage(0): no effect
    out.push({ target, damage: adj });
  }
  return out;
}

/**
 * CGrenade::Explode*: the explosion is moved off the surface below the grenade.
 * Trace from origin+8 down 40 units; if it hits, origin = endpos + normal * (dmg - 24) * 0.6
 * (HE & C4 dmg 100 -> 45.6 units up, flashbang dmg 35 -> 6.6 units).
 * traceFn(start, end) -> { fraction, endpos, normal }.
 */
export function explosionOrigin(origin, traceFn, dmg) {
  const start = [origin[0], origin[1], origin[2] + 8];
  const tr = traceFn(start, [start[0], start[1], start[2] - 40]);
  if (tr && tr.fraction < 1 && tr.normal) return madd(tr.endpos, tr.normal, (dmg - 24) * 0.6);
  return origin.slice();
}

// ---------------------------------------------------------------- grenades & C4 numbers
export const SV_GRAVITY = 800;
export const SV_MAXVELOCITY = 2000;

/** Grenade throw (CHEGrenade/CFlashbang/CSmokeGrenade::WeaponIdle). */
export const GRENADE_THROW = Object.freeze({
  pinPullTime: 0.5,     // m_flTimeWeaponIdle after pulling the pin: earliest release
  speedPerDegree: 6,    // flVel = (90 - pitch') * 6
  maxSpeed: 750,
  forwardOffset: 16,    // vecSrc = eye + forward * 16
  pitchLift: 10,        // pitch' = -10 + pitch * (80/90 up, 100/90 down)
  fuse: 1.5,            // ThrowGrenade(..., 1.5)
  addOwnerVelocity: true,
  nextAttack: 0.5,      // after the throw
});

/**
 * Throw angles/velocity exactly as CS computes them.
 * viewAngles: player v_angle [pitch, yaw, roll]; punch: punchangle.
 * Returns { angles, speed, origin, velocity } (origin/velocity only when eyePos given).
 */
export function grenadeThrow(viewAngles, punch = [0, 0, 0], eyePos = null, playerVelocity = [0, 0, 0]) {
  const ang = [viewAngles[0] + punch[0], viewAngles[1] + punch[1], (viewAngles[2] || 0) + (punch[2] || 0)];
  if (ang[0] < 0) ang[0] = -10 + ang[0] * ((90 - 10) / 90);
  else ang[0] = -10 + ang[0] * ((90 + 10) / 90);
  let speed = (90 - ang[0]) * 6;
  if (speed > 750) speed = 750;
  const out = { angles: ang, speed };
  if (eyePos) {
    const { forward } = angleVectors(ang);
    out.origin = madd(eyePos, forward, 16);
    out.velocity = add(scale(forward, speed), playerVelocity);
  }
  return out;
}

/** HE grenade (CGrenade::ShootTimed2 + Explode3). */
export const HE = Object.freeze({
  fuse: 1.5, gravity: 0.55, friction: 0.7, dmg: 100,
  damage: 100, radius: 350,           // RadiusDamage(100, 100 * 3.5)
  liftOffSurface: (100 - 24) * 0.6,   // 45.6
  damageType: 'explosion',            // DMG_EXPLOSION (team-checked: own team immune unless FF, thrower is not)
});

/** Flashbang (CGrenade::ShootTimed + Explode -> RadiusFlash). */
export const FLASHBANG = Object.freeze({
  fuse: 1.5, gravity: 0.5, friction: 0.8, dmg: 35,
  flashDamage: 4, radius: 1500,       // RadiusFlash(..., 4) with a fixed 1500 radius
  facing: { fadeMul: 3, holdDiv: 1.5, alpha: 255 },   // flDot >= 0
  behind: { fadeMul: 1.75, holdDiv: 3.5, alpha: 200 }, // flDot < 0
  blindDurationMul: 0.33,             // CBasePlayer::Blind(fadeTime * 0.33, ...) - bots / "blind" state
  liftOffSurface: (35 - 24) * 0.6,    // 6.6
  maxFadeTime: 12, maxHoldTime: 4 / 1.5,
});

/** Smoke grenade (CGrenade::ShootSmokeGrenade / SG_TumbleThink / SG_Detonate / SG_Smoke). */
export const SMOKE = Object.freeze({
  fuse: 1.5, gravity: 0.5, friction: 0.8, dmg: 35,
  needsGround: true,                  // only detonates once FL_ONGROUND after the fuse
  groundFrictionPerThink: 0.95,       // SG_TumbleThink, every 0.1 s on the ground
  detonateHop: { xy: 175, zMin: 250, zMax: 350 }, // random velocity kick on detonation
  puffInterval: 1.0, puffCount: 21,   // SG_Smoke events, then the entity is removed
  lightSmokeRadius: 250,              // another already-detonated smoke within 250 -> lighter cloud
  approxVisibleDuration: 25,          // client-side cloud lifetime (cl_dll effect) - approximation
  approxRadius: 115,                  // visual cloud radius - approximation (client-side)
});

/** Planted bomb (CC4 + CGrenade::ShootSatchelCharge / C4Think / Explode2 / Defuse). */
export const C4 = Object.freeze({
  armTime: 3.0,           // C4_ARMING_ON_TIME
  armPollInterval: 0.3,   // PrimaryAttack re-checks every 0.3 s -> plant completes after 3.0..3.3 s
  dropAnimLead: 0.75,     // placement anim starts 0.75 s before arming completes
  cancelDelay: 1.0, leaveZoneDelay: 1.5, notInZoneDelay: 1.0,
  timer: 45,              // mp_c4timer default (clamped 10..90)
  bombRadius: 500,        // info_map_parameters default (m_flBombRadius)
  damage: 500,            // RadiusDamage(bombRadius, bombRadius * 3.5)
  radius: 1750,
  dmg: 100, liftOffSurface: (100 - 24) * 0.6,
  defuseTime: 10, defuseTimeKit: 5, defuseHoldRefresh: 0.5, // +use must keep refreshing within 0.5 s
  beepInterval: 1.4,
  beepWaves: [
    { sound: 'c4_beep1', attenuation: 1.5 }, { sound: 'c4_beep2', attenuation: 1.0 },
    { sound: 'c4_beep3', attenuation: 0.8 }, { sound: 'c4_beep4', attenuation: 0.5 },
    { sound: 'c4_beep5', attenuation: 0.2 },
  ],
  thinkInterval: 0.12,
  frags: 3,               // planter (on explosion) / defuser get 3 frags
  damageType: 'blast',    // DMG_BLAST: hurts everybody, both teams
});

/**
 * C4 beep "wave" schedule (C4Think): the first wave starts at plant time, the
 * interval starts at int(timer / 4) seconds and shrinks by 10% each wave.
 * Returns { wave (0..4), sound, attenuation } for time t after planting.
 */
export function c4BeepWave(sincePlant, timer = C4.timer) {
  let interval = Math.trunc(timer / 4);
  let next = 0, wave = -1;
  while (sincePlant >= next && wave < 4) { wave++; next += interval; interval *= 0.9; }
  const w = C4.beepWaves[Math.max(0, wave)];
  return { wave: Math.max(0, wave), sound: w.sound, attenuation: w.attenuation };
}

/**
 * RadiusFlash (combat.cpp). players: [{ origin, viewOffset (0,0,17 standing / 12 ducked; eye =
 * origin + viewOffset), viewAngles, waterLevel?, blind?: { startTime, holdTime, fadeTime, alpha } }]
 * traceFn(start, end, ignoreEntity) -> { fraction, endpos, entity, startsolid }.
 * Returns [{ target, fadeTime, holdTime, alpha, blindDuration, facing }] for UTIL_ScreenFade
 * (white, hold `holdTime` at `alpha`, then fade out over `fadeTime`).
 */
export function radiusFlash(center, players, traceFn, { time = 0, random = Math.random } = {}) {
  const src = [center[0], center[1], center[2] + 1];
  const falloff = FLASHBANG.flashDamage / FLASHBANG.radius;
  const out = [];
  for (const p of players || []) {
    if (!p || p.alive === false) continue;
    if (len(sub(p.origin, src)) > FLASHBANG.radius + 16) continue;
    const vo = p.viewOffset || [0, 0, 17];
    // BodyTarget(): Center() + view_ofs * RANDOM_FLOAT(0.5, 1.1)
    const r = 0.5 + 0.6 * random();
    const spot = madd(p.origin, vo, r);
    const tr = traceFn(src, spot, null) || { fraction: 1, endpos: spot };
    if (tr.fraction !== 1 && tr.entity !== p) continue;
    const tr2 = traceFn(spot, src, p) || { fraction: 1 };
    if (!(tr2.fraction >= 1)) continue;
    let endpos = tr.fraction === 1 || !tr.endpos ? spot : tr.endpos;
    if (tr.startsolid) endpos = src;
    let adj = FLASHBANG.flashDamage - len(sub(src, endpos)) * falloff;
    if (adj < 0) adj = 0;
    const eye = add(p.origin, vo);
    const { forward } = angleVectors(p.viewAngles || [0, 0, 0]);
    const facing = dot(sub(src, eye), forward) >= 0;
    const k = facing ? FLASHBANG.facing : FLASHBANG.behind;
    let alpha = k.alpha;
    let fadeTime = adj * k.fadeMul;
    let holdTime = adj / k.holdDiv;
    const b = p.blind;
    if (b) {
      const curHold = b.startTime + b.holdTime - time;
      if (curHold > 0 && alpha === 255) holdTime += curHold;
      if (b.startTime && b.fadeTime && b.startTime + b.fadeTime + b.holdTime > time) {
        if (b.fadeTime > fadeTime) fadeTime = b.fadeTime;
        if (b.alpha >= alpha) alpha = b.alpha;
      }
    }
    out.push({ target: p, fadeTime, holdTime, alpha, blindDuration: fadeTime * FLASHBANG.blindDurationMul, facing, strength: adj });
  }
  return out;
}

/**
 * Thrown grenade state + MOVETYPE_BOUNCE physics (engine SV_Physics_Toss, approximated from the
 * HLDS/ReHLDS implementation) + the CGrenade touch/think functions.
 */
export function createGrenade(type, origin, velocity, time, owner = null) {
  const c = type === 'hegrenade' ? HE : type === 'flashbang' ? FLASHBANG : SMOKE;
  return {
    type, owner, origin: origin.slice(), velocity: velocity.slice(), gravity: c.gravity, friction: c.friction,
    dmg: c.dmg, dmgtime: time + c.fuse, nextThink: time + 0.1, detonateAt: 0, onGround: false,
    bounceCount: 0, detonated: false, removed: false,
  };
}

function clipVelocity(v, n, overbounce) {
  const backoff = dot(v, n) * overbounce;
  const o = [v[0] - n[0] * backoff, v[1] - n[1] * backoff, v[2] - n[2] * backoff];
  for (let i = 0; i < 3; i++) if (o[i] > -0.1 && o[i] < 0.1) o[i] = 0;
  return o;
}

/**
 * Advance one server frame. traceFn(start, end) -> { fraction, endpos, normal, allsolid, entity }.
 * onBounce(g, speed) is called for the bounce sound (first 5 airborne bounces).
 * Returns 'explode' (HE / flash), 'smoke' (smoke detonated, starts the cloud) or null.
 * NOTE: as in GoldSrc the ground friction (x0.8 per touch) is applied per FRAME - run at the
 * server tick rate (~100 Hz) for CS-like rolling distances.
 */
export function updateGrenade(g, time, dt, traceFn, onBounce = () => {}) {
  if (g.removed) return null;
  // ---- SV_Physics_Toss
  if (g.velocity[2] > 0) g.onGround = false;
  if (!(g.onGround && g.velocity[0] === 0 && g.velocity[1] === 0 && g.velocity[2] === 0)) {
    for (let i = 0; i < 3; i++) g.velocity[i] = Math.max(-SV_MAXVELOCITY, Math.min(SV_MAXVELOCITY, g.velocity[i]));
    g.velocity[2] -= g.gravity * SV_GRAVITY * dt;
    const move = scale(g.velocity, dt);
    let tr = traceFn(g.origin, add(g.origin, move)) || { fraction: 1 };
    if (tr.allsolid) { g.velocity = [0, 0, 0]; }
    else {
      if (tr.fraction > 0) g.origin = (tr.fraction < 1 ? tr.endpos : add(g.origin, move)).slice();
      if (tr.fraction < 1) {
        // CGrenade::BounceTouch (runs before the velocity clip)
        if (g.onGround) g.velocity = scale(g.velocity, 0.8);
        else {
          if (g.bounceCount < 5) onBounce(g, len(g.velocity));
          if (g.bounceCount >= 10) { g.onGround = true; g.velocity = [0, 0, 0]; }
          g.bounceCount++;
        }
        const n = tr.normal || [0, 0, 1];
        g.velocity = clipVelocity(g.velocity, n, 2 - g.friction);
        if (n[2] > 0.7) {
          if (g.velocity[2] < SV_GRAVITY * dt) { g.onGround = true; g.velocity[2] = 0; }
          if (dot(g.velocity, g.velocity) < 900) { g.onGround = true; g.velocity = [0, 0, 0]; }
          else {
            const m2 = scale(g.velocity, (1 - tr.fraction) * dt * 0.9);
            tr = traceFn(g.origin, add(g.origin, m2)) || { fraction: 1 };
            if (!tr.allsolid && tr.fraction > 0) g.origin = (tr.fraction < 1 ? tr.endpos : add(g.origin, m2)).slice();
          }
        }
      }
    }
  }
  // ---- thinks (every 0.1 s)
  const now = time + 1e-6; // think times are quantised to frames; avoid float drift
  if (g.detonated) {
    // SG_Smoke: one puff event per second, 21 of them, then the entity is removed
    if (g.type === 'smokegrenade' && now >= g.nextThink) { g.nextThink = time + SMOKE.puffInterval; if (++g.puffs > SMOKE.puffCount) g.removed = true; }
    return null;
  }
  if (g.detonateAt && now >= g.detonateAt) {
    g.detonated = true;
    if (g.type === 'smokegrenade') {
      // SG_Detonate: random hop, then puffs start 0.1 s later
      g.velocity = smokeDetonateKick(g.random || Math.random);
      g.onGround = false;
      g.puffs = 0;
      g.nextThink = time + 0.1;
      return 'smoke';
    }
    g.removed = true;
    return 'explode';
  }
  if (now >= g.nextThink) {
    g.nextThink = time + 0.1;
    if (g.type === 'smokegrenade') {
      if (g.onGround) g.velocity = scale(g.velocity, SMOKE.groundFrictionPerThink);
      if (g.dmgtime <= now && g.onGround) g.detonateAt = g.nextThink; // SetThink(SG_Detonate)
    } else if (g.dmgtime <= now) {
      g.detonateAt = g.nextThink; // TumbleThink -> SetThink(Detonate / Detonate3): ~1.6 s after the throw
    }
  }
  return null;
}

/** Velocity kick a smoke grenade gets when it detonates (SG_Detonate). */
export function smokeDetonateKick(random = Math.random) {
  return [-175 + 350 * random(), -175 + 350 * random(), 250 + 100 * random()];
}

// ---------------------------------------------------------------- money & round rules
/**
 * Numbers straight from game.cpp (cvar defaults), multiplay_gamerules.cpp / gamerules.h
 * (RewardAccount) and player.cpp. Times are seconds unless named *Minutes.
 */
export const RULES = Object.freeze({
  // cvars
  startMoney: 800,                 // mp_startmoney
  maxMoney: 16000,                 // hard clamp in AddAccount
  roundTime: 300, roundTimeMinutes: 5, roundTimeMin: 60, roundTimeMax: 540, // mp_roundtime 5 (1..9 min)
  freezeTime: 6,                   // mp_freezetime (0..60)
  buyTime: 90, buyTimeMinutes: 1.5, buyTimeMin: 15, // mp_buytime, counted from the END of freeze time
  c4Timer: 45, c4TimerMin: 10, c4TimerMax: 90,     // mp_c4timer
  roundRestartDelay: 5,            // mp_round_restart_delay
  friendlyFire: false,             // mp_friendlyfire 0
  teamDamageMult: 0.35,            // bullets/knife on teammates when FF is on
  autoKickTeamKills: 3,

  // kills
  killReward: 300,                 // REWARD_KILLED_ENEMY (any weapon, no knife bonus in 1.6)
  vipKillReward: 2500,
  teamKillMoney: -3300,            // PAYBACK_FOR_KILLED_TEAMMATES (signed)
  teamKillPenalty: 3300,           // same, as a positive amount to deduct

  // round end rewards (RewardAccount)
  reward: Object.freeze({
    ctsWinElimination: 3250,       // Round_Cts on a bomb map uses RR_BOMB_DEFUSED (3000 = REWARD_CTS_WIN elsewhere)
    tsWinElimination: 3250,        // Round_Ts on a bomb map uses RR_BOMB_EXPLODED (3000 = REWARD_TERRORISTS_WIN elsewhere)
    ctsWinNoBombMap: 3000, tsWinNoBombMap: 3000,
    targetBombed: 3500,            // REWARD_TARGET_BOMB (T)
    bombDefused: 3250,             // REWARD_BOMB_DEFUSED (CT)
    bombPlantedTeam: 800,          // REWARD_BOMB_PLANTED - Ts get it on top of the loss bonus when the bomb is defused
    targetSaved: 3250,             // REWARD_TARGET_BOMB_SAVED (CT, time ran out)
    planter: 0, defuser: 0,        // no individual money for planting/defusing in 1.6 (3 frags instead)
    // hostage maps (hostage.cpp / multiplay_gamerules.cpp)
    allHostagesRescued: 2500,      // REWARD_ALL_HOSTAGES_RESCUED (CT team)
    hostageNotRescued: 3250,       // REWARD_HOSTAGE_NOT_RESCUED (T team, time ran out)
    rescuedHostageTeam: 750,       // REWARD_RESCUED_HOSTAGE: CT team, per rescued hostage, next round
    rescuedHostage: 1000,          // REWARD_TAKEN_HOSTAGE: the rescuer, per hostage
    tookHostage: 150,              // REWARD_TOOK_HOSTAGE: first CT to use a hostage
    tookHostageTeam: 100,          // REWARD_TOOK_HOSTAGE_ACC: CT team when a hostage is first used
    hostageHeldT: 150,             // RR_TOOK_HOSTAGE: Ts per hostage still held at round restart (max 2000)
    hostageDamagePerHp: -20,       // CHostage::TakeDamage: -20 x damage; killing: 20 x (-25 - damage)
  }),
  // flat aliases used by rounds.js
  rewardElimination: 3250, rewardTimeout: 3250, rewardBombExploded: 3500, rewardBombDefused: 3250,
  rewardPlantedLost: 800, rewardPlant: 0, rewardDefuse: 0,

  // loss bonus (RestartRound)
  lossBonus: Object.freeze({ default: 1400, min: 1500, max: 3000, add: 500 }),
  lossBonusBase: 1400, lossBonusStep: 500,
  lossBonusMax: 3400,              // effective cap: the "< 3000" check happens before +500
  lossBonusProgression: Object.freeze([1400, 1900, 2400, 2900, 3400]),

  // bomb / defuse
  c4ArmTime: 3.0, defuseTime: 10, defuseTimeKit: 5,
  bombRadius: 500, bombDamage: 500, bombDamageRadius: 1750,
  ctCantWinByEliminationWhileBombTicking: true,
  frags: Object.freeze({ kill: 1, teamKill: -1, suicide: -1, bombExploded: 3, bombDefused: 3 }),

  // spawn / items
  spawn: Object.freeze({
    health: 100,
    CT: Object.freeze({ weapons: ['knife', 'usp'], reserve: { usp: 24 } }),
    T: Object.freeze({ weapons: ['knife', 'glock'], reserve: { glock: 40 } }),
  }),
  equipment: Object.freeze({
    kevlar: 650, assaultSuit: 1000, helmetUpgrade: 350, // ASSAULTSUIT_PRICE / HELMET_PRICE when vest is full
    flashbang: 200, hegrenade: 300, smokegrenade: 300, defuseKit: 200, nightVision: 1250, shield: 2200,
  }),
  grenadeLimits: Object.freeze({ hegrenade: 1, flashbang: 2, smokegrenade: 1 }),

  // speeds (ResetMaxSpeed)
  freezeMaxSpeed: 1, vipMaxSpeed: 227, noWeaponMaxSpeed: 240, observerMaxSpeed: 900,
  plantingMaxSpeed: 1, defusingMaxSpeed: 1,
});

/** CBasePlayer::AddAccount (original): clamp to 0..16000. */
export function addAccount(money, amount) {
  const m = money + amount;
  return m > RULES.maxMoney ? RULES.maxMoney : m < 0 ? 0 : m;
}

/** Fresh match economy state (m_iLoserBonus / m_iNumConsecutive*Loses). */
export function createEconomy() {
  return { loserBonus: RULES.lossBonus.default, consecutiveCTLoses: 0, consecutiveTLoses: 0 };
}

/**
 * Money at the end of a round = reward added when the round terminates + the loss-bonus
 * bookkeeping done in RestartRound. Each living or dead player of a team gets the same amount.
 *   winner: 'T' | 'CT' | null (draw)
 *   reason: 'elimination' | 'target_bombed' | 'bomb_defused' | 'target_saved' | 'draw'
 *   mapHasBombTarget: de_ maps (changes elimination rewards to 3250)
 *   completeReset: game commencing / restart -> nobody gets anything and streaks reset
 * Returns { T, CT } and mutates eco.
 */
export function roundEndMoney(eco, { winner, reason, mapHasBombTarget = true, completeReset = false }) {
  const R = RULES.reward;
  let T = 0, CT = 0;
  if (winner === 'CT') {
    if (reason === 'bomb_defused') { CT += R.bombDefused; T += R.bombPlantedTeam; }
    else if (reason === 'target_saved') CT += R.targetSaved;
    else if (reason === 'hostages_rescued') CT += R.allHostagesRescued;
    else CT += mapHasBombTarget ? R.ctsWinElimination : R.ctsWinNoBombMap;
  } else if (winner === 'T') {
    if (reason === 'target_bombed') T += R.targetBombed;
    else if (reason === 'hostages_not_rescued') T += R.hostageNotRescued;
    else T += mapHasBombTarget ? R.tsWinElimination : R.tsWinNoBombMap;
  }
  const LB = RULES.lossBonus;
  if (winner === 'T') {
    if (eco.consecutiveTLoses > 1) eco.loserBonus = LB.min;
    eco.consecutiveTLoses = 0;
    eco.consecutiveCTLoses++;
  } else if (winner === 'CT') {
    if (eco.consecutiveCTLoses > 1) eco.loserBonus = LB.min;
    eco.consecutiveCTLoses = 0;
    eco.consecutiveTLoses++;
  }
  if (eco.consecutiveTLoses > 1 && eco.loserBonus < LB.max) eco.loserBonus += LB.add;
  else if (eco.consecutiveCTLoses > 1 && eco.loserBonus < LB.max) eco.loserBonus += LB.add;
  if (winner === 'T') CT += eco.loserBonus;
  else if (winner === 'CT') T += eco.loserBonus;
  if (completeReset) {
    T = CT = 0;
    eco.consecutiveCTLoses = eco.consecutiveTLoses = 0;
    eco.loserBonus = LB.default;
  }
  return { T, CT };
}
