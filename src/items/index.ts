// STUB — replaced by the Items agent.
import type { GameContext } from '../core/GameContext';
import type { IInventory, IItems, ItemStack } from '../core/contracts';
import type { WeaponSlot, EquipmentSlot } from '../core/types';

export async function installItems(ctx: GameContext): Promise<void> {
  const createInventory = (owner: any): IInventory => {
    const items: ItemStack[] = [];
    const inv: IInventory = {
      owner,
      weapons: { primary1: null, primary2: null, pistol: null, melee: null, throwable: null } as Record<WeaponSlot, any>,
      equipment: { helmet: null, vest: null, backpack: null } as Record<EquipmentSlot, any>,
      items,
      capacity: 20,
      used: 0,
      count: (id) => items.filter((s) => s.itemId === id).reduce((a, s) => a + s.count, 0),
      canFit: (_id, n) => n,
      add: (id, n) => { items.push({ itemId: id, count: n }); return n; },
      remove: () => 0,
      setWeapon: (slot, w) => { const prev = inv.weapons[slot]; (inv.weapons as any)[slot] = w; return prev; },
      setEquipment: () => null,
      notifyChanged: () => {},
    };
    return inv;
  };
  const items: IItems = {
    defs: {},
    get: (id) => ({ id, name: id, category: 'misc', weight: 1, maxStack: 1 }),
    createInventory,
    useDuration: () => 5,
    applyUse: () => false,
    canUse: () => false,
    loot: {
      populate() {}, spawnGround: (position, stack) => ({ id: 0, position, stack }), removeGround() {},
      itemsNear: () => [], pickUp: () => false, drop() {}, createDeathBox() {}, spawnAirdrop() {},
    },
  };
  ctx.items = items;
}
