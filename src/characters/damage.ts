// Environmental damage originating in the Characters module (fall, drown, vehicle bail-out).
// Routed through ctx.combat.applyDamage so armor/knock/kill rules live in one place.
import { ctx } from '../core/GameContext';
import type { DamageInfo, DamageResult } from '../core/types';
import type { Character } from './Character';

/**
 * TEMPORARY FALLBACK (Wave 1): while the combat module is still the stub (no weapon defs, applyDamage is a
 * no-op), apply health damage directly so fall damage / drowning are testable. Remove once combat lands —
 * the real DamageSystem owns health, knock and kill transitions.
 */
function combatIsStub(): boolean {
  const c = ctx.combat;
  return !c || !c.weaponDefs || Object.keys(c.weaponDefs).length === 0;
}

export function applyCharacterDamage(c: Character, info: DamageInfo): DamageResult {
  if (info.amount <= 0 || c.lifeState === 'dead') return { dealt: 0, knocked: false, killed: false };
  if (!combatIsStub()) return ctx.combat.applyDamage(c, info);
  // ── stub fallback ──
  const before = c.health;
  c.applyHealthDelta(-info.amount, info);
  const dealt = before - c.health;
  const killed = c.health <= 0;
  if (killed) c.setLifeState('dead', info);
  const result: DamageResult = { dealt, knocked: false, killed };
  ctx.events.emit('combat:damage', { target: c, info, result });
  return result;
}
