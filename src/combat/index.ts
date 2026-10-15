// STUB — replaced by the Combat agent.
import type { GameContext } from '../core/GameContext';
import type { ICombat } from '../core/contracts';

export async function installCombat(ctx: GameContext): Promise<void> {
  const combat: ICombat = {
    weaponDefs: {},
    createWeapon: () => { throw new Error('combat stub'); },
    fireProjectile() {},
    applyDamage: () => ({ dealt: 0, knocked: false, killed: false }),
    raycastCharacters: () => null,
    updateWeaponHandling: () => ({ recoilPitch: 0, recoilYaw: 0 }),
    getSpread: () => 0,
    throwGrenade() {},
  };
  ctx.combat = combat;
}
