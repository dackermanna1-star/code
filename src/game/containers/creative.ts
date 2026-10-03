/**
 * Creative inventory model: item tabs (by category) with a 9x5 infinite item grid + the hotbar,
 * search, and vanilla creative click rules (CreativeModeInventoryScreen.slotClicked):
 * display items are infinite, clicking with a different item deletes the cursor stack,
 * shift-click picks a full stack, shift-click on the hotbar deletes. The "Survival Inventory"
 * tab uses the normal InventoryMenu plus a destroy-item slot (handled by the screen).
 */
import { ITEMS, ITEM_BY_NAME, type ItemDef, type ItemStack } from '../items/registry';
import { BLOCK_BY_NAME } from '../../world/blocks/registry';
import { ContainerMenu, Slot, OUTSIDE, type ClickType, type MenuHost } from './menu';
import { SimpleContainer } from './storage';
import { ArmorSlot } from './menus';
import { armorSlotOf } from '../enchant/enchantments';
import { copyWithCount, sameItemSameTags, displayName } from './stacks';
import { POTIONS, POTION_ITEMS, potionDisplayName } from '../brewing/potions';
import { ENCHANTMENTS } from '../enchant/enchantments';

export type CreativeTabId = 'building' | 'colored' | 'natural' | 'functional' | 'redstone' | 'tools' | 'combat' | 'food' | 'ingredients' | 'spawn_eggs' | 'search' | 'inventory';

export interface CreativeTab {
  id: CreativeTabId;
  name: string;
  /** Item id used as the tab icon (first existing). */
  icon: string[];
  row: 'top' | 'bottom';
}

export const CREATIVE_TABS: CreativeTab[] = [
  { id: 'building', name: 'Building Blocks', icon: ['bricks'], row: 'top' },
  { id: 'colored', name: 'Colored Blocks', icon: ['cyan_wool'], row: 'top' },
  { id: 'natural', name: 'Natural Blocks', icon: ['grass_block'], row: 'top' },
  { id: 'functional', name: 'Functional Blocks', icon: ['crafting_table'], row: 'top' },
  { id: 'redstone', name: 'Redstone Blocks', icon: ['redstone', 'redstone_torch'], row: 'top' },
  { id: 'search', name: 'Search Items', icon: ['compass', 'spyglass', 'glass'], row: 'top' },
  { id: 'tools', name: 'Tools & Utilities', icon: ['diamond_pickaxe'], row: 'bottom' },
  { id: 'combat', name: 'Combat', icon: ['netherite_sword', 'diamond_sword'], row: 'bottom' },
  { id: 'food', name: 'Food & Drinks', icon: ['golden_apple', 'apple', 'cake'], row: 'bottom' },
  { id: 'ingredients', name: 'Ingredients', icon: ['iron_ingot', 'stick'], row: 'bottom' },
  { id: 'spawn_eggs', name: 'Spawn Eggs', icon: ['pig_spawn_egg', 'spawner'], row: 'bottom' },
  { id: 'inventory', name: 'Survival Inventory', icon: ['chest'], row: 'bottom' },
];

const COLORED = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(wool|carpet|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|stained_glass_pane|bed|candle|banner|shulker_box)$/;
const HIDDEN = new Set(['air', 'cave_air', 'barrier', 'moving_piston', 'piston_head', 'infested_stone', 'lit_furnace', 'lit_smoker', 'lit_blast_furnace']);

export function creativeTabOf(it: ItemDef): CreativeTabId | null {
  if (HIDDEN.has(it.name)) return null;
  if (COLORED.test(it.name) || it.name === 'terracotta') return 'colored';
  switch (it.category) {
    case 'building': return it.block ? 'building' : 'ingredients';
    case 'natural': return 'natural';
    case 'functional': return 'functional';
    case 'redstone': return 'redstone';
    case 'transport': return 'tools';
    case 'tools': return 'tools';
    case 'combat': return 'combat';
    case 'food': return 'food';
    case 'brewing': return 'food';
    case 'spawn_eggs': return 'spawn_eggs';
    default: return 'ingredients';
  }
}

/** All display stacks of a tab (potion/arrow/book variants expanded like vanilla). */
export function creativeItems(tab: CreativeTabId): ItemStack[] {
  const out: ItemStack[] = [];
  for (const it of ITEMS) {
    if (creativeTabOf(it) !== tab) continue;
    if (it.block && BLOCK_BY_NAME.get(it.block)?.shape === 'air') continue;
    if ((POTION_ITEMS as readonly string[]).includes(it.name) || it.name === 'tipped_arrow') {
      for (const p of POTIONS) {
        if (it.name === 'tipped_arrow' && !p.effects.length) continue;
        out.push({ item: it, count: 1, damage: 0, data: { potion: p.id } });
      }
      continue;
    }
    if (it.name === 'enchanted_book') {
      for (const e of ENCHANTMENTS) for (let l = 1; l <= e.maxLevel; l++) out.push({ item: it, count: 1, damage: 0, ench: { [e.id]: l } });
      continue;
    }
    out.push({ item: it, count: 1, damage: 0 });
  }
  return out;
}

/** Search across every tab (display name / id substring, vanilla-like). */
export function creativeSearch(query: string): ItemStack[] {
  const q = query.trim().toLowerCase();
  const all: ItemStack[] = [];
  for (const t of CREATIVE_TABS) if (t.id !== 'search' && t.id !== 'inventory') all.push(...creativeItems(t.id));
  if (!q) return all;
  return all.filter((s) => {
    const n = (s.data?.potion ? potionDisplayName(s.item.name, s.data.potion) : displayName(s)).toLowerCase();
    return n.includes(q) || s.item.name.includes(q.replace(/ /g, '_'));
  });
}

/** Infinite display slot: never changes when taken from. */
export class DisplaySlot extends Slot {
  override mayPlace() {
    return false;
  }
}

/**
 * Creative menu. Item tabs: 45 display slots (0..44) + 9 hotbar slots (45..53).
 * Survival inventory tab: armour 54..57 (head..feet), offhand 58, main 59..85, hotbar 86..94
 * (positions of vanilla's creative inventory tab). Slots of the inactive tab are hidden.
 */
export class CreativeMenu extends ContainerMenu {
  readonly display = new SimpleContainer(45);
  items: ItemStack[] = [];
  /** First visible row. */
  scrollRow = 0;
  tab: CreativeTabId = 'building';
  static readonly INV_START = 54;
  constructor(host: MenuHost) {
    super(host, 'creative');
    this.width = 195;
    this.height = 136;
    const inv = this.player.inventory as any;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) this.addSlot(new DisplaySlot(this.display, r * 9 + c, 9 + c * 18, 18 + r * 18));
    for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c, 9 + c * 18, 112));
    const types = ['head', 'chest', 'legs', 'feet'] as const;
    const hints = ['helmet', 'chestplate', 'leggings', 'boots'];
    for (let k = 0; k < 4; k++) {
      const s = this.addSlot(new ArmorSlot(inv, 39 - k, 54 + Math.floor(k / 2) * 54, 6 + (k % 2) * 27, types[k]));
      s.hint = hints[k];
    }
    const off = this.addSlot(new Slot(inv, 40, 35, 20));
    off.hint = 'shield';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, 9 + r * 9 + c, 9 + c * 18, 54 + r * 18));
    for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c, 9 + c * 18, 112));
    this.setTab('building');
  }
  setTab(tab: CreativeTabId) {
    this.tab = tab;
    const inv = tab === 'inventory';
    this.slots.forEach((s, i) => (s.hidden = inv ? i < CreativeMenu.INV_START : i >= CreativeMenu.INV_START));
    if (!inv && tab !== 'search') this.setItems(creativeItems(tab));
  }
  get rows() {
    return Math.ceil(this.items.length / 9);
  }
  get maxScroll() {
    return Math.max(0, this.rows - 5);
  }
  setItems(items: ItemStack[]) {
    this.items = items;
    this.scrollRow = 0;
    this.refresh();
  }
  scrollTo(row: number) {
    this.scrollRow = Math.max(0, Math.min(this.maxScroll, Math.round(row)));
    this.refresh();
  }
  refresh() {
    for (let i = 0; i < 45; i++) {
      const s = this.items[this.scrollRow * 9 + i];
      this.display.slots[i] = s ? { ...s, ench: s.ench ? { ...s.ench } : undefined, data: s.data ? { ...s.data } : undefined } : null;
    }
    this.display.version++;
  }
  isDisplay(slotId: number) {
    return slotId >= 0 && slotId < 45 && this.tab !== 'inventory';
  }
  override canDragTo(slot: Slot) {
    return !(slot instanceof DisplaySlot);
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot) {
    return !(slot instanceof DisplaySlot);
  }
  override quickMoveStack(index: number): ItemStack | null {
    // vanilla ItemPickerMenu: shift-clicking a hotbar slot deletes its item
    if (index >= 45 && index < 54) {
      this.slots[index].set(null);
      return null;
    }
    if (index < CreativeMenu.INV_START) return null;
    // survival inventory tab (InventoryMenu rules)
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const orig = copyWithCount(s, s.count);
    const armor = armorSlotOf(s.item);
    const armorIdx = armor ? 54 + ['head', 'chest', 'legs', 'feet'].indexOf(armor) : -1;
    let ok: boolean;
    if (index < 59) ok = this.moveItemStackTo(s, 59, 95, false);
    else if (armorIdx >= 0 && !this.slots[armorIdx].hasItem()) ok = this.moveItemStackTo(s, armorIdx, armorIdx + 1, false);
    else if (index < 86) ok = this.moveItemStackTo(s, 86, 95, false);
    else ok = this.moveItemStackTo(s, 59, 86, false);
    if (!ok) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return s.count === orig.count ? null : orig;
  }
  /** Destroy-item slot: delete the cursor stack; shift = clear the whole inventory. */
  destroy(shift: boolean) {
    if (shift) {
      const inv = this.player.inventory;
      for (let i = 0; i < inv.size; i++) inv.slots[i] = null;
      inv.changed();
    }
    this.setCarried(null);
  }
  override clicked(slotId: number, button: number, type: ClickType) {
    const shift = type === 'quick_move';
    if (type !== 'quick_craft' && slotId === OUTSIDE) {
      const c = this.getCarried();
      if (c) {
        if (button === 0) {
          this.host.drop(c);
          this.setCarried(null);
        } else if (button === 1) {
          this.host.drop(copyWithCount(c, 1));
          c.count--;
          this.setCarried(c.count > 0 ? c : null);
        }
      }
      this.carriedVersion++;
      return;
    }
    if (type !== 'quick_craft' && this.isDisplay(slotId)) {
      const shown = this.slots[slotId].item;
      const carried = this.getCarried();
      if (type === 'swap') {
        if (shown && (button < 9 || button === 40)) this.player.inventory.set(button, copyWithCount(shown, shown.item.maxStack));
        return;
      }
      if (type === 'clone') {
        if (!carried && shown) this.setCarried(copyWithCount(shown, shown.item.maxStack));
        return;
      }
      if (type === 'throw') {
        if (shown) this.host.drop(copyWithCount(shown, button === 0 ? 1 : shown.item.maxStack));
        return;
      }
      if (type === 'pickup_all') return;
      if (carried && shown && sameItemSameTags(carried, shown)) {
        if (button === 0) {
          if (shift) carried.count = carried.item.maxStack;
          else if (carried.count < carried.item.maxStack) carried.count++;
        } else carried.count--;
        this.setCarried(carried.count > 0 ? carried : null);
      } else if (shown && !carried) {
        this.setCarried(copyWithCount(shown, shift ? shown.item.maxStack : shown.count));
      } else if (button === 0) {
        this.setCarried(null);
      } else if (carried) {
        carried.count--;
        this.setCarried(carried.count > 0 ? carried : null);
      }
      return;
    }
    super.clicked(slotId, button, type);
  }
}

export function creativeTabIcon(tab: CreativeTab): ItemStack | null {
  for (const n of tab.icon) {
    const it = ITEM_BY_NAME.get(n);
    if (it) return { item: it, count: 1, damage: 0 };
  }
  const first = tab.id === 'search' || tab.id === 'inventory' ? null : creativeItems(tab.id)[0];
  return first ?? null;
}
