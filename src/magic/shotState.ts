// Shot-state helpers shared by the spell table (stat reflection) and the casting engine.
// Kept separate from casting.ts so spells.ts can use them without a circular import.

import type { EffectTag, Shot, ShotState } from './types';

/** gun.lua reset_modifiers(): the neutral shot state every shot (root or payload) starts from. */
export function defaultShotState(): ShotState {
  return {
    fireRateWait: 0,
    spread: 0,
    speedMult: 1,
    damageProjectile: 0,
    damageExplosion: 0,
    damageFire: 0,
    damageElectric: 0,
    damageIce: 0,
    damageSlice: 0,
    damageHealing: 0,
    critChance: 0,
    explosionRadius: 0,
    lifetimeAdd: 0,
    bounces: 0,
    gravityAdd: 0,
    knockback: 0,
    recoil: 0,
    patternDegrees: 0,
    extra: [],
    trailMaterial: null,
    trailChance: 0,
    friendlyFire: false,
    homing: 0,
    piercing: false,
    lightRadiusAdd: 0,
  };
}

/** Adds an effect tag once (stacking strength lives in the numeric fields). */
export function addEffect(c: ShotState, tag: EffectTag): void {
  if (!c.extra.includes(tag)) c.extra.push(tag);
}

/**
 * Angles (degrees, 0 = aim direction) for `count` projectiles under ShotState.patternDegrees.
 * patternDegrees is Noita's `pattern_degrees`, i.e. a HALF-angle:
 *   - >= 180: full circle, evenly spaced, first projectile straight ahead
 *     (Behind Your Back 2 -> 0,180; Pentagon/Hexagon -> 72/60 degree steps)
 *   - otherwise: evenly from -P to +P (Above and Below 90 -> -90,0,90; Bifurcated 45 -> -45,45)
 * The ProjectileSystem should use this for formation spells; wand/shot spread is applied on top.
 */
export function formationAngles(patternDegrees: number, count: number): number[] {
  const out: number[] = [];
  if (count <= 0) return out;
  const p = patternDegrees;
  if (count === 1 || p <= 0) {
    for (let i = 0; i < count; i++) out.push(0);
    return out;
  }
  if (p >= 180) {
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
      let a = i * step;
      if (a > 180) a -= 360;
      out.push(a);
    }
    return out;
  }
  const step = (2 * p) / (count - 1);
  for (let i = 0; i < count; i++) out.push(-p + i * step);
  return out;
}

/** Number of projectiles in a shot; with `includePayloads`, trigger payloads are counted recursively. */
export function countProjectiles(shot: Shot, includePayloads = true): number {
  let n = 0;
  for (const p of shot.projectiles) {
    n++;
    if (includePayloads && p.trigger) n += countProjectiles(p.trigger.payload, true);
  }
  return n;
}
