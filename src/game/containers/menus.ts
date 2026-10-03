/**
 * Concrete container menus with vanilla slot layouts (GUI pixel coordinates) and vanilla
 * shift-click (quickMoveStack) target regions:
 *   InventoryMenu (2x2 crafting, armour, offhand), CraftingMenu (3x3), ChestMenu (1-6 rows; chest,
 *   double chest, barrel, ender chest), DispenserMenu (3x3), HopperMenu (5), FurnaceMenu
 *   (furnace/smoker/blast furnace), BrewingMenu, EnchantmentMenu, AnvilMenu, MerchantMenu.
 */
import type { ItemStack } from '../items/registry';
import { ITEM_BY_NAME } from '../items/registry';
import { ContainerMenu, Slot, FilterSlot, OutputSlot, type MenuHost } from './menu';
import { SimpleContainer, type SlotStorage } from './storage';
import { copyStack, copyWithCount, sameItemSameTags, splitStack } from './stacks';
import { findCraftingRecipe, defaultRemainders, type CraftingGrid, type CraftMatch } from '../crafting/recipes';
import { FURNACE_RECIPE_TYPE, findCookingRecipe, isFuel, rollFurnaceXp, type FurnaceData, type FurnaceKind } from '../crafting/smelting';
import { isBottleSlotItem, isBrewingIngredient, isBrewingFuel, type BrewingData } from '../brewing/brewing';
import { armorSlotOf, enchLevel, isEnchantable } from '../enchant/enchantments';
import { computeOffers, performEnchant, type EnchantOffers } from '../enchant/table';
import { anvilResult, type AnvilResult } from '../enchant/anvil';
import { costA, costB, findOffer, isRequiredItem, outOfStock, type Merchant, type TradeOffer } from './trading';

// ====================================================================================== slots
export type ArmorType = 'head' | 'chest' | 'legs' | 'feet';

export class ArmorSlot extends Slot {
  constructor(storage: SlotStorage, slot: number, x: number, y: number, readonly type: ArmorType) {
    super(storage, slot, x, y);
    this.hint = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' }[type];
  }
  override maxStackSize() {
    return 1;
  }
  override mayPlace(s: ItemStack) {
    return armorSlotOf(s.item) === this.type;
  }
  override mayPickup(player: any) {
    const s = this.item;
    if (s && !player.creative && enchLevel(s, 'binding_curse') > 0) return false;
    return true;
  }
}

/** Crafting output (vanilla ResultSlot): consumes one of each ingredient per take, keeps remainders. */
export class CraftingResultSlot extends Slot {
  removeCount = 0;
  constructor(storage: SlotStorage, slot: number, x: number, y: number, private craft: CraftingHost) {
    super(storage, slot, x, y);
  }
  override mayPlace() {
    return false;
  }
  override remove(n: number): ItemStack | null {
    const s = this.item;
    if (!s) return null;
    this.removeCount += Math.min(n, s.count);
    this.storage.set(this.slot, null);
    return s;
  }
  protected override onQuickCraftAmount(s: ItemStack, n: number) {
    this.removeCount += n;
    this.checkTakeAchievements(s);
  }
  override onSwapCraft(n: number) {
    this.removeCount += n;
  }
  private checkTakeAchievements(s: ItemStack) {
    if (this.removeCount > 0) this.menu.host.emit('craft', { player: this.menu.player, stack: copyWithCount(s, this.removeCount), recipe: this.craft.lastMatch?.recipe.id });
    this.removeCount = 0;
  }
  override onTake(_player: any, s: ItemStack) {
    this.checkTakeAchievements(s);
    this.craft.consumeIngredients();
  }
}

/** Interface the result slot uses to consume the grid. */
export interface CraftingHost {
  lastMatch: CraftMatch | null;
  consumeIngredients(): void;
}

class GridView implements CraftingGrid {
  constructor(readonly st: SlotStorage, readonly width: number, readonly height: number) {}
  get(x: number, y: number) {
    return this.st.get(y * this.width + x);
  }
}

// ====================================================================================== helpers
abstract class CraftingMenuBase extends ContainerMenu implements CraftingHost {
  readonly grid: SimpleContainer;
  readonly result = new SimpleContainer(1);
  lastMatch: CraftMatch | null = null;
  private suspend = false;
  readonly gridView: GridView;

  constructor(host: MenuHost, kind: string, readonly gw: number) {
    super(host, kind);
    this.grid = new SimpleContainer(gw * gw).onChange(() => this.slotsChanged());
    this.gridView = new GridView(this.grid, gw, gw);
  }

  slotsChanged() {
    if (this.suspend) return;
    this.lastMatch = findCraftingRecipe(this.gridView);
    this.result.slots[0] = this.lastMatch ? this.lastMatch.result : null;
    this.result.version++;
  }

  consumeIngredients() {
    const g = this.gridView;
    const match = findCraftingRecipe(g);
    const rem = match?.recipe.remainders?.(g) ?? defaultRemainders(g);
    this.suspend = true;
    try {
      for (let i = 0; i < this.grid.size; i++) {
        let s = this.grid.get(i);
        const r = rem[i];
        if (s) {
          s.count--;
          if (s.count <= 0) {
            this.grid.set(i, null);
            s = null;
          } else this.grid.changed(i);
        }
        if (r) {
          if (!s) this.grid.set(i, r);
          else if (sameItemSameTags(s, r)) {
            s.count += r.count;
            this.grid.changed(i);
          } else this.placeItemBackInInventory(r);
        }
      }
    } finally {
      this.suspend = false;
    }
    this.slotsChanged();
  }

  /** Shift-click on the result: move the crafted stack into the player inventory (vanilla). */
  protected quickMoveResult(index: number, invStart: number, invEnd: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (!this.moveItemStackTo(s, invStart, invEnd, true)) return null;
    slot.onQuickCraft(orig, s);
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === orig.count) return null;
    slot.onTake(this.player, s);
    if (s.count > 0) this.host.drop(copyStack(s));
    return orig;
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot) {
    return !(slot instanceof CraftingResultSlot);
  }

  override removed() {
    super.removed();
    this.result.slots[0] = null;
    this.clearContainer(this.grid);
  }
}

/** Generic quick-move epilogue shared by most menus. */
function finishQuickMove(menu: ContainerMenu, slot: Slot, s: ItemStack, orig: ItemStack, checkSame = true): ItemStack | null {
  if (s.count <= 0) slot.set(null);
  else slot.setChanged();
  if (checkSame && s.count === orig.count) return null;
  slot.onTake(menu.player, s);
  return orig;
}

// ====================================================================================== player inventory
export class InventoryMenu extends CraftingMenuBase {
  static readonly RESULT = 0;
  static readonly GRID = 1;
  static readonly ARMOR = 5;
  static readonly MAIN = 9;
  static readonly HOTBAR = 36;
  static readonly OFFHAND = 45;

  constructor(host: MenuHost) {
    super(host, 'inventory', 2);
    this.title = 'Crafting';
    const inv = this.player.inventory as unknown as SlotStorage;
    this.addSlot(new CraftingResultSlot(this.result, 0, 154, 28, this));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) this.addSlot(new Slot(this.grid, r * 2 + c, 98 + c * 18, 18 + r * 18));
    const types: ArmorType[] = ['head', 'chest', 'legs', 'feet'];
    for (let i = 0; i < 4; i++) this.addSlot(new ArmorSlot(inv, 39 - i, 8, 8 + i * 18, types[i]));
    this.addPlayerInventory(8, 84);
    const off = this.addSlot(new Slot(inv, 40, 77, 62));
    off.hint = 'shield';
  }

  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    if (index === 0) return this.quickMoveResult(0, 9, 45);
    const orig = copyStack(s);
    const eq = equipmentSlotOf(s);
    if (index >= 1 && index < 9) {
      if (!this.moveItemStackTo(s, 9, 45, false)) return null;
    } else if (eq && eq !== 'offhand' && !this.slots[8 - ['feet', 'legs', 'chest', 'head'].indexOf(eq)].hasItem()) {
      const i = 8 - ['feet', 'legs', 'chest', 'head'].indexOf(eq);
      if (!this.moveItemStackTo(s, i, i + 1, false)) return null;
    } else if (eq === 'offhand' && !this.slots[45].hasItem()) {
      if (!this.moveItemStackTo(s, 45, 46, false)) return null;
    } else if (index >= 9 && index < 36) {
      if (!this.moveItemStackTo(s, 36, 45, false)) return null;
    } else if (index >= 36 && index < 45) {
      if (!this.moveItemStackTo(s, 9, 36, false)) return null;
    } else if (!this.moveItemStackTo(s, 9, 45, false)) return null;
    return finishQuickMove(this, slot, s, orig);
  }
}

/** Mob.getEquipmentSlotForItem (armour pieces, elytra, heads, shields). */
export function equipmentSlotOf(s: ItemStack): ArmorType | 'offhand' | null {
  const a = armorSlotOf(s.item);
  if (a) return a;
  if (s.item.name === 'shield') return 'offhand';
  return null;
}

// ====================================================================================== crafting table
export class CraftingMenu extends CraftingMenuBase {
  constructor(host: MenuHost, private valid: () => boolean = () => true) {
    super(host, 'crafting', 3);
    this.title = 'Crafting';
    this.addSlot(new CraftingResultSlot(this.result, 0, 124, 35, this));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.addSlot(new Slot(this.grid, r * 3 + c, 30 + c * 18, 17 + r * 18));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    if (index === 0) return this.quickMoveResult(0, 10, 46);
    const orig = copyStack(s);
    if (index >= 10 && index < 46) {
      if (!this.moveItemStackTo(s, 1, 10, false)) {
        if (index < 37) {
          if (!this.moveItemStackTo(s, 37, 46, false)) return null;
        } else if (!this.moveItemStackTo(s, 10, 37, false)) return null;
      }
    } else if (!this.moveItemStackTo(s, 10, 46, false)) return null;
    return finishQuickMove(this, slot, s, orig);
  }
}

// ====================================================================================== chest-like
export class ChestMenu extends ContainerMenu {
  readonly containerSize: number;
  constructor(host: MenuHost, kind: string, readonly storage: SlotStorage, readonly rows: number, title: string, private valid: () => boolean = () => true, private onClose?: () => void) {
    super(host, kind);
    this.title = title;
    this.containerSize = rows * 9;
    const off = (rows - 4) * 18;
    for (let r = 0; r < rows; r++) for (let c = 0; c < 9; c++) this.addSlot(new Slot(storage, r * 9 + c, 8 + c * 18, 18 + r * 18));
    this.addPlayerInventory(8, 103 + off);
    this.height = 114 + rows * 18;
  }
  override stillValid() {
    return this.valid();
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    const n = this.containerSize;
    if (index < n) {
      if (!this.moveItemStackTo(s, n, this.slots.length, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, n, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return orig;
  }
  override removed() {
    super.removed();
    this.onClose?.();
  }
}

export class DispenserMenu extends ContainerMenu {
  constructor(host: MenuHost, kind: 'dispenser' | 'dropper', readonly storage: SlotStorage, title: string, private valid: () => boolean = () => true, private onClose?: () => void) {
    super(host, kind);
    this.title = title;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.addSlot(new Slot(storage, r * 3 + c, 62 + c * 18, 17 + r * 18));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index < 9) {
      if (!this.moveItemStackTo(s, 9, 45, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, 9, false)) return null;
    return finishQuickMove(this, slot, s, orig);
  }
  override removed() {
    super.removed();
    this.onClose?.();
  }
}

export class HopperMenu extends ContainerMenu {
  constructor(host: MenuHost, readonly storage: SlotStorage, title: string, private valid: () => boolean = () => true, private onClose?: () => void) {
    super(host, 'hopper');
    this.title = title;
    for (let i = 0; i < 5; i++) this.addSlot(new Slot(storage, i, 44 + i * 18, 20));
    this.addPlayerInventory(8, 51);
    this.height = 133;
  }
  override stillValid() {
    return this.valid();
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index < 5) {
      if (!this.moveItemStackTo(s, 5, this.slots.length, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, 5, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return orig;
  }
  override removed() {
    super.removed();
    this.onClose?.();
  }
}

// ====================================================================================== furnace
export class FurnaceResultSlot extends Slot {
  removeCount = 0;
  constructor(storage: SlotStorage, slot: number, x: number, y: number, private fm: FurnaceMenu) {
    super(storage, slot, x, y);
  }
  override mayPlace() {
    return false;
  }
  override remove(n: number) {
    const s = this.item;
    if (s) this.removeCount += Math.min(n, s.count);
    return super.remove(n);
  }
  protected override onQuickCraftAmount(_s: ItemStack, n: number) {
    this.removeCount += n;
    this.award();
  }
  override onTake(player: any, s: ItemStack) {
    this.award(s);
    super.onTake(player, s);
  }
  private award(s?: ItemStack) {
    const d = this.fm.data;
    const xp = rollFurnaceXp(d.xp);
    d.xp = 0;
    this.fm.onXp?.(xp);
    if (this.removeCount > 0 || s) this.fm.host.emit('furnaceTake', { player: this.fm.player, stack: s ? copyStack(s) : null, count: this.removeCount, xp, kind: this.fm.kind });
    this.removeCount = 0;
  }
}

export class FurnaceMenu extends ContainerMenu {
  /** Award XP (spawn orbs / give the player XP). */
  onXp: ((xp: number) => void) | null = null;
  constructor(host: MenuHost, readonly furnaceKind: FurnaceKind, readonly storage: SlotStorage, readonly data: FurnaceData, title: string, private valid: () => boolean = () => true) {
    super(host, furnaceKind);
    this.title = title;
    this.addSlot(new Slot(storage, 0, 56, 17));
    const fuel = this.addSlot(new FilterSlot(storage, 1, 56, 53, (s) => isFuel(s) || s.item.name === 'bucket', 64, 'fuel'));
    fuel.maxStackFor = (s: ItemStack) => (s.item.name === 'bucket' ? 1 : Math.min(64, s.item.maxStack));
    this.addSlot(new FurnaceResultSlot(storage, 2, 116, 35, this));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  canSmelt(s: ItemStack) {
    return !!findCookingRecipe(FURNACE_RECIPE_TYPE[this.furnaceKind], s);
  }
  /** 0..1 fuel left (flame), 0..1 cook progress (arrow). */
  get burnProgress() {
    const d = this.data;
    return d.burn > 0 && d.burnMax > 0 ? Math.min(1, d.burn / d.burnMax) : 0;
  }
  get cookProgress() {
    const d = this.data;
    return d.cookMax > 0 ? Math.min(1, d.cook / d.cookMax) : 0;
  }
  get lit() {
    return this.data.burn > 0;
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot) {
    return !(slot instanceof FurnaceResultSlot);
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(orig, s);
    } else if (index !== 1 && index !== 0) {
      if (this.canSmelt(s)) {
        if (!this.moveItemStackTo(s, 0, 1, false)) return null;
      } else if (isFuel(s)) {
        if (!this.moveItemStackTo(s, 1, 2, false)) return null;
      } else if (index >= 3 && index < 30) {
        if (!this.moveItemStackTo(s, 30, 39, false)) return null;
      } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    return finishQuickMove(this, slot, s, orig);
  }
}

// ====================================================================================== brewing
export class BrewingMenu extends ContainerMenu {
  constructor(host: MenuHost, readonly storage: SlotStorage, readonly data: BrewingData, title: string, private valid: () => boolean = () => true) {
    super(host, 'brewing_stand');
    this.title = title;
    const bottlePos: [number, number][] = [[56, 51], [79, 58], [102, 51]];
    bottlePos.forEach(([x, y], i) => this.addSlot(new FilterSlot(storage, i, x, y, isBottleSlotItem, 1, 'bottle')));
    this.addSlot(new FilterSlot(storage, 3, 79, 17, isBrewingIngredient, 64));
    this.addSlot(new FilterSlot(storage, 4, 17, 17, isBrewingFuel, 64, 'blaze_powder'));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  get fuel() {
    return this.data.fuel;
  }
  get brewProgress() {
    return this.data.brewTime > 0 ? 1 - this.data.brewTime / 400 : 0;
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if ((index < 0 || index > 2) && index !== 3 && index !== 4) {
      if (isBrewingFuel(orig)) {
        if (this.moveItemStackTo(s, 4, 5, false) || (isBrewingIngredient(s) && !this.moveItemStackTo(s, 3, 4, false))) return null;
      } else if (isBrewingIngredient(s)) {
        if (!this.moveItemStackTo(s, 3, 4, false)) return null;
      } else if (isBottleSlotItem(orig) && orig.count === 1) {
        if (!this.moveItemStackTo(s, 0, 3, false)) return null;
      } else if (index >= 5 && index < 32) {
        if (!this.moveItemStackTo(s, 32, 41, false)) return null;
      } else if (index >= 32 && index < 41) {
        if (!this.moveItemStackTo(s, 5, 32, false)) return null;
      } else if (!this.moveItemStackTo(s, 5, 41, false)) return null;
    } else {
      if (!this.moveItemStackTo(s, 5, 41, true)) return null;
      slot.onQuickCraft(orig, s);
    }
    return finishQuickMove(this, slot, s, orig);
  }
}

// ====================================================================================== enchanting
export class EnchantmentMenu extends ContainerMenu {
  readonly inputs = new SimpleContainer(2);
  offers: EnchantOffers = { costs: [0, 0, 0], clues: [null, null, null] };
  /** Bumped when offers change (UI). */
  offersVersion = 0;
  constructor(host: MenuHost, private bookshelves: () => number, title = 'Enchant', private valid: () => boolean = () => true) {
    super(host, 'enchanting_table');
    this.title = title;
    this.inputs.onChange(() => this.slotsChanged());
    const item = this.addSlot(new FilterSlot(this.inputs, 0, 15, 47, () => true, 1));
    item.maxStackFor = () => 1;
    this.addSlot(new FilterSlot(this.inputs, 1, 35, 47, (s) => s.item.name === 'lapis_lazuli', 64, 'lapis'));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  get seed() {
    return (this.player as any).xpSeed | 0;
  }
  slotsChanged() {
    const s = this.inputs.get(0);
    if (s && isEnchantable(s)) this.offers = computeOffers(s.item, this.bookshelves(), this.seed);
    else this.offers = { costs: [0, 0, 0], clues: [null, null, null] };
    this.offersVersion++;
  }
  /** Lapis in the slot. */
  get lapis() {
    return this.inputs.get(1)?.count ?? 0;
  }
  /** Can option `i` be clicked by the player (UI state). */
  canEnchant(i: number): boolean {
    const p: any = this.player;
    const cost = this.offers.costs[i];
    if (cost <= 0 || !this.inputs.get(0)) return false;
    if (p.creative) return true;
    return this.lapis >= i + 1 && p.xpLevel >= cost && p.xpLevel >= i + 1;
  }
  override clickMenuButton(id: number): boolean {
    if (id < 0 || id > 2) return false;
    const p: any = this.player;
    const stack = this.inputs.get(0);
    const lapis = this.inputs.get(1);
    const n = id + 1;
    if ((!lapis || lapis.count < n) && !p.creative) return false;
    const cost = this.offers.costs[id];
    if (cost <= 0 || !stack || ((p.xpLevel < n || p.xpLevel < cost) && !p.creative)) return false;
    const result = performEnchant(stack, id, cost, this.seed);
    if (!result) return false;
    // onEnchantmentPerformed: take levels and reseed (Player.addLevels reseeds xpSeed)
    if (p.addLevels) p.addLevels(-n);
    else {
      p.xpLevel = Math.max(0, p.xpLevel - n);
      p.xpSeed = Math.floor(Math.random() * 1e9);
    }
    this.inputs.slots[0] = result;
    if (!p.creative && lapis) {
      lapis.count -= n;
      if (lapis.count <= 0) this.inputs.slots[1] = null;
    }
    this.inputs.changed();
    this.host.emit('enchant', { player: p, stack: copyStack(result), level: cost, cost: n });
    return true;
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index === 0 || index === 1) {
      if (!this.moveItemStackTo(s, 2, 38, true)) return null;
    } else if (s.item.name === 'lapis_lazuli') {
      if (!this.moveItemStackTo(s, 1, 2, true)) return null;
    } else {
      if (this.slots[0].hasItem() || !this.slots[0].mayPlace(s)) return null;
      const one = copyWithCount(s, 1);
      s.count--;
      this.slots[0].set(one);
    }
    return finishQuickMove(this, slot, s, orig);
  }
  override removed() {
    super.removed();
    this.clearContainer(this.inputs);
  }
}

// ====================================================================================== anvil
export class AnvilResultSlot extends Slot {
  constructor(storage: SlotStorage, slot: number, x: number, y: number, private am: AnvilMenu) {
    super(storage, slot, x, y);
  }
  override mayPlace() {
    return false;
  }
  override mayPickup(player: any) {
    const c = this.am.state.cost;
    return (player.creative || player.xpLevel >= c) && c > 0;
  }
  override onTake(player: any, s: ItemStack) {
    const am = this.am;
    if (!player.creative) player.xpLevel = Math.max(0, player.xpLevel - am.state.cost);
    am.inputs.slots[0] = null;
    const right = am.inputs.slots[1];
    if (am.state.repairItemCount > 0 && right && right.count > am.state.repairItemCount) right.count -= am.state.repairItemCount;
    else am.inputs.slots[1] = null;
    const cost = am.state.cost;
    am.inputs.changed();
    am.onUsed?.(player);
    am.host.emit('anvilUse', { player, stack: copyStack(s), cost });
    super.onTake(player, s);
  }
}

export class AnvilMenu extends ContainerMenu {
  readonly inputs = new SimpleContainer(2);
  readonly output = new SimpleContainer(1);
  /** Rename text (undefined = not edited). */
  itemName: string | undefined = undefined;
  state: AnvilResult = { result: null, cost: 0, repairItemCount: 0, tooExpensive: false };
  stateVersion = 0;
  /** Anvil use side effects (damage the anvil block). */
  onUsed: ((player: any) => void) | null = null;
  constructor(host: MenuHost, title = 'Repair & Name', private valid: () => boolean = () => true) {
    super(host, 'anvil');
    this.title = title;
    this.inputs.onChange(() => this.createResult());
    this.addSlot(new Slot(this.inputs, 0, 27, 47));
    this.addSlot(new Slot(this.inputs, 1, 76, 47));
    this.addSlot(new AnvilResultSlot(this.output, 0, 134, 47, this));
    this.addPlayerInventory(8, 84);
  }
  override stillValid() {
    return this.valid();
  }
  setItemName(name: string) {
    this.itemName = name;
    this.createResult();
  }
  createResult() {
    this.state = anvilResult(this.inputs.get(0), this.inputs.get(1), this.itemName, !!(this.player as any).creative);
    this.output.slots[0] = this.state.result;
    this.output.version++;
    this.stateVersion++;
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot) {
    return !(slot instanceof AnvilResultSlot);
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(orig, s);
      const r = finishQuickMove(this, slot, s, orig);
      if (r && s.count > 0) this.host.drop(copyStack(s)); // result slot is rebuilt after the take
      return r;
    } else if (index === 0 || index === 1) {
      if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    } else if (index >= 3 && index < 39) {
      const k = this.slots[0].hasItem() && !this.slots[1].hasItem() ? 1 : 0;
      if (!this.moveItemStackTo(s, k, 2, false)) {
        if (index < 30) {
          if (!this.moveItemStackTo(s, 30, 39, false)) return null;
        } else if (!this.moveItemStackTo(s, 3, 30, false)) return null;
      }
    }
    return finishQuickMove(this, slot, s, orig);
  }
  override removed() {
    super.removed();
    this.clearContainer(this.inputs);
  }
}

// ====================================================================================== merchant
export class MerchantResultSlot extends Slot {
  constructor(storage: SlotStorage, slot: number, x: number, y: number, private mm: MerchantMenu) {
    super(storage, slot, x, y);
  }
  override mayPlace() {
    return false;
  }
  override remove(n: number) {
    const s = this.item;
    if (!s) return null;
    this.storage.set(this.slot, null);
    void n;
    return s;
  }
  override onTake(player: any, s: ItemStack) {
    this.mm.completeTrade(player, s);
  }
}

export class MerchantMenu extends ContainerMenu {
  readonly payment = new SimpleContainer(2);
  readonly output = new SimpleContainer(1);
  selected = -1;
  activeOffer: TradeOffer | null = null;
  offersVersion = 0;
  constructor(host: MenuHost, readonly merchant: Merchant, title?: string, private valid: () => boolean = () => true) {
    super(host, 'merchant');
    this.title = title ?? merchant.merchantName ?? 'Villager';
    this.width = 276;
    this.payment.onChange(() => this.updateSellItem());
    this.addSlot(new Slot(this.payment, 0, 136, 37));
    this.addSlot(new Slot(this.payment, 1, 162, 37));
    this.addSlot(new MerchantResultSlot(this.output, 0, 220, 37, this));
    this.addPlayerInventory(108, 84);
  }
  get offers(): TradeOffer[] {
    return this.merchant.getOffers(this.player) ?? [];
  }
  override stillValid() {
    return this.valid() && !this.merchant.removed;
  }
  updateSellItem() {
    const a = this.payment.get(0), b = this.payment.get(1);
    const found = a || b ? findOffer(this.offers, a, b, this.selected) : null;
    this.activeOffer = found?.offer ?? null;
    if (found && !outOfStock(found.offer)) {
      const sell = found.offer.sell;
      const def = typeof sell.item === 'string' ? ITEM_BY_NAME.get(sell.item) : sell.item;
      this.output.slots[0] = def ? { item: def, count: sell.count, damage: sell.damage ?? 0, ench: sell.ench ? { ...sell.ench } : undefined, data: sell.data ? JSON.parse(JSON.stringify(sell.data)) : undefined } : null;
    } else this.output.slots[0] = null;
    this.output.version++;
  }
  completeTrade(player: any, s: ItemStack) {
    const offer = this.activeOffer;
    if (!offer) return;
    let a = this.payment.get(0), b = this.payment.get(1);
    let swapped = false;
    if (!a && b) {
      a = b;
      b = null;
      swapped = true;
    }
    const ca = costA(offer), cb = costB(offer);
    if (a && ca) a.count -= ca.count;
    if (b && cb) b.count -= cb.count;
    if (swapped) {
      this.payment.slots[0] = null;
      this.payment.slots[1] = a && a.count > 0 ? a : null;
    } else {
      this.payment.slots[0] = a && a.count > 0 ? a : null;
      this.payment.slots[1] = b && b.count > 0 ? b : null;
    }
    offer.uses++;
    try {
      this.merchant.onTrade(offer, player);
    } catch (e) {
      console.warn('merchant.onTrade failed', e);
    }
    if (offer.rewardExp !== false) this.host.emit('tradeXp', { player, amount: 3 + Math.floor(Math.random() * 4) });
    this.host.emit('trade', { player, merchant: this.merchant, offer, stack: copyStack(s) });
    this.offersVersion++;
    this.payment.changed();
  }
  /** Select an offer: return payment to the inventory, then fill it from the inventory (MerchantMenu.tryMoveItems). */
  override clickMenuButton(index: number): boolean {
    const offers = this.offers;
    if (index < 0 || index >= offers.length) return false;
    this.selected = index;
    const o = offers[index];
    for (let i = 0; i < 2; i++) {
      const s = this.payment.get(i);
      if (!s) continue;
      const left = this.player.inventory.add(s);
      if (left > 0) {
        s.count = left;
        this.payment.changed(i);
        return true;
      }
      this.payment.slots[i] = null;
    }
    this.payment.changed();
    if (!outOfStock(o)) {
      this.fillPayment(0, costA(o));
      this.fillPayment(1, costB(o));
    }
    this.updateSellItem();
    this.offersVersion++;
    return true;
  }
  /** MerchantMenu.moveFromInventoryToPaymentSlot: fill the slot (up to a full stack) with matching items. */
  private fillPayment(slot: number, want: ItemStack | null) {
    if (!want) return;
    const inv = this.player.inventory;
    for (let i = 0; i < 36; i++) {
      const s = inv.get(i);
      if (!s || !isRequiredItem(s, want)) continue;
      const cur = this.payment.get(slot);
      if (cur && !sameItemSameTags(cur, s)) continue;
      const room = Math.min(64, s.item.maxStack) - (cur?.count ?? 0);
      if (room <= 0) break;
      const moved = splitStack(s, Math.min(room, s.count));
      if (s.count <= 0) inv.set(i, null);
      else inv.changed();
      if (cur) {
        cur.count += moved.count;
        this.payment.changed(slot);
      } else this.payment.set(slot, moved);
    }
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot) {
    return !(slot instanceof MerchantResultSlot);
  }
  override quickMoveStack(index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const orig = copyStack(s);
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(orig, s);
      const r = finishQuickMove(this, slot, s, orig);
      if (r && s.count > 0) this.host.drop(copyStack(s)); // the output is rebuilt after the trade
      return r;
    } else if (index !== 0 && index !== 1) {
      if (index >= 3 && index < 30) {
        if (!this.moveItemStackTo(s, 30, 39, false)) return null;
      } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    return finishQuickMove(this, slot, s, orig);
  }
  override removed() {
    super.removed();
    this.clearContainer(this.payment);
    this.merchant.onTradingClosed?.(this.player);
  }
}

export { OutputSlot };
