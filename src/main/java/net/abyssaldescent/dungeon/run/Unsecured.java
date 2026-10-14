package net.abyssaldescent.dungeon.run;

import java.util.ArrayList;
import java.util.List;
import java.util.function.ToIntFunction;
import java.util.stream.Collectors;
import net.abyssaldescent.registry.ModComponents;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;

/**
 * Helpers for the unsecured-loot tag: applying, securing (extraction) and purging (defeat). Each one covers the
 * inventory, the cursor and the 2x2 crafting grid, plus the bundles (or other item containers) inside any of those, at
 * any depth. Slots of other open menus (merchant payment slots) are not scanned: close the menu first so it hands its
 * items back to the inventory.
 */
public final class Unsecured {
	/** Bundles nest; vanilla's weight rules stop well before this, it only guards against hand-made data. */
	private static final int MAX_DEPTH = 16;

	private Unsecured() {
	}

	public static void tag(ItemStack stack, long runId) {
		if (!stack.isEmpty()) {
			stack.set(ModComponents.UNSECURED, runId);
		}
	}

	public static boolean isUnsecured(ItemStack stack) {
		return stack.has(ModComponents.UNSECURED);
	}

	/** Removes the tag from every item the player carries (bundles included). Returns the number of stacks secured. */
	public static int secureAll(Player player) {
		int count = 0;
		for (Container container : containers(player)) {
			for (int i = 0; i < container.getContainerSize(); i++) {
				ItemStack stack = container.getItem(i);
				int secured = secure(stack, 0);
				if (secured > 0) {
					container.setItem(i, stack);
					count += secured;
				}
			}
		}
		for (AbstractContainerMenu menu : menus(player)) {
			ItemStack carried = menu.getCarried();
			int secured = secure(carried, 0);
			if (secured > 0) {
				menu.setCarried(carried);
				count += secured;
			}
		}
		broadcast(player);
		return count;
	}

	/** Destroys every unsecured stack the player carries. Returns the number of stacks lost. */
	public static int purgeAll(Player player) {
		int count = 0;
		for (Container container : containers(player)) {
			for (int i = 0; i < container.getContainerSize(); i++) {
				ItemStack stack = container.getItem(i);
				if (stack.isEmpty()) {
					continue;
				}
				if (isUnsecured(stack)) {
					container.setItem(i, ItemStack.EMPTY);
					count++;
					continue;
				}
				int purged = purgeContents(stack, 0);
				if (purged > 0) {
					container.setItem(i, stack);
					count += purged;
				}
			}
		}
		for (AbstractContainerMenu menu : menus(player)) {
			ItemStack carried = menu.getCarried();
			if (isUnsecured(carried)) {
				menu.setCarried(ItemStack.EMPTY);
				count++;
			} else {
				count += purgeContents(carried, 0);
			}
		}
		broadcast(player);
		return count;
	}

	/** Unsecured stacks the player carries, counting those inside bundles: what {@link #secureAll} would secure. */
	public static int countUnsecured(Player player) {
		int count = 0;
		for (Container container : containers(player)) {
			for (int i = 0; i < container.getContainerSize(); i++) {
				count += count(container.getItem(i), 0);
			}
		}
		for (AbstractContainerMenu menu : menus(player)) {
			count += count(menu.getCarried(), 0);
		}
		return count;
	}

	/** The inventory and the 2x2 crafting grid, which keeps its items while the inventory screen is open. */
	private static List<Container> containers(Player player) {
		// The ender chest counts: loot stashed there mid-run is still unsecured and shares the run's fate.
		return List.of(player.getInventory(), player.inventoryMenu.getCraftSlots(), player.getEnderChestInventory());
	}

	/** Menus whose cursor can hold a stack: the open one and, if that is another menu, the inventory's own. */
	private static List<AbstractContainerMenu> menus(Player player) {
		return player.containerMenu == player.inventoryMenu ? List.of(player.inventoryMenu) : List.of(player.containerMenu, player.inventoryMenu);
	}

	private static void broadcast(Player player) {
		player.inventoryMenu.broadcastChanges();
		if (player.containerMenu != player.inventoryMenu) {
			player.containerMenu.broadcastChanges();
		}
	}

	private static int count(ItemStack stack, int depth) {
		if (stack.isEmpty()) {
			return 0;
		}
		int count = isUnsecured(stack) ? 1 : 0;
		if (depth < MAX_DEPTH) {
			for (ItemStack inner : contents(stack)) {
				count += count(inner, depth + 1);
			}
		}
		return count;
	}

	/** Removes the tag from {@code stack} and everything nested in it. Returns the number of stacks secured. */
	private static int secure(ItemStack stack, int depth) {
		if (stack.isEmpty()) {
			return 0;
		}
		int count = 0;
		if (isUnsecured(stack)) {
			stack.remove(ModComponents.UNSECURED);
			count++;
		}
		return count + editContents(stack, depth, inner -> secure(inner, depth + 1));
	}

	/** Destroys the unsecured stacks nested in {@code stack} (a tagged stack takes its contents with it). */
	private static int purgeContents(ItemStack stack, int depth) {
		return editContents(stack, depth, inner -> {
			if (isUnsecured(inner)) {
				inner.setCount(0);
				return 1;
			}
			return purgeContents(inner, depth + 1);
		});
	}

	/**
	 * Runs {@code edit} on copies of the stacks inside {@code stack}'s bundle or container contents and writes them back
	 * if it reported any change (an edit may empty a stack to remove it). Returns the sum of {@code edit}'s results.
	 */
	private static int editContents(ItemStack stack, int depth, ToIntFunction<ItemStack> edit) {
		if (depth >= MAX_DEPTH) {
			return 0;
		}
		int count = 0;
		BundleContents bundle = stack.get(DataComponents.BUNDLE_CONTENTS);
		if (bundle != null && !bundle.isEmpty()) {
			int changed = 0;
			List<ItemStack> kept = new ArrayList<>();
			for (ItemStack inner : bundle.itemsCopy()) {
				changed += edit.applyAsInt(inner);
				if (!inner.isEmpty()) {
					kept.add(inner);
				}
			}
			if (changed > 0) {
				stack.set(DataComponents.BUNDLE_CONTENTS, new BundleContents(kept));
				count += changed;
			}
		}
		ItemContainerContents container = stack.get(DataComponents.CONTAINER);
		if (container != null) {
			int changed = 0;
			// Every slot, empty ones included, so the remaining items keep their positions.
			List<ItemStack> items = container.stream().collect(Collectors.toCollection(ArrayList::new));
			for (ItemStack inner : items) {
				if (!inner.isEmpty()) {
					changed += edit.applyAsInt(inner);
				}
			}
			if (changed > 0) {
				stack.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(items));
				count += changed;
			}
		}
		return count;
	}

	private static List<ItemStack> contents(ItemStack stack) {
		List<ItemStack> list = new ArrayList<>();
		BundleContents bundle = stack.get(DataComponents.BUNDLE_CONTENTS);
		if (bundle != null) {
			bundle.items().forEach(list::add);
		}
		ItemContainerContents container = stack.get(DataComponents.CONTAINER);
		if (container != null) {
			container.nonEmptyItems().forEach(list::add);
		}
		return list;
	}
}
