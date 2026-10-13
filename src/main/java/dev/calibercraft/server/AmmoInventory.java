package dev.calibercraft.server;

import dev.calibercraft.config.ServerConfig;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/** Reserve ammunition = loose ammunition items in the player's inventory. */
public final class AmmoInventory {
	public static final int INFINITE = 9999;

	private AmmoInventory() {
	}

	public static boolean infinite(Player p) {
		ServerConfig c = ServerConfig.get();
		return c.infiniteAmmo || (p.isCreative() && c.infiniteAmmoCreative);
	}

	public static int count(Player p, Item item) {
		if (infinite(p)) {
			return INFINITE;
		}
		return countRaw(p, item);
	}

	public static int countRaw(Player p, Item item) {
		Inventory inv = p.getInventory();
		int n = 0;
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack s = inv.getItem(i);
			if (s.is(item)) {
				n += s.getCount();
			}
		}
		return n;
	}

	/** Removes up to {@code amount} items, returning how many were removed (infinite players lose nothing). */
	public static int take(Player p, Item item, int amount) {
		if (amount <= 0) {
			return 0;
		}
		if (infinite(p)) {
			return amount;
		}
		Inventory inv = p.getInventory();
		int left = amount;
		for (int i = 0; i < inv.getContainerSize() && left > 0; i++) {
			ItemStack s = inv.getItem(i);
			if (s.is(item)) {
				int t = Math.min(left, s.getCount());
				s.shrink(t);
				left -= t;
			}
		}
		if (left != amount) {
			inv.setChanged();
		}
		return amount - left;
	}

	/** Gives items back (inventory first, then dropped at the player's feet). Infinite players get nothing back. */
	public static void give(Player p, Item item, int amount) {
		if (amount <= 0 || infinite(p)) {
			return;
		}
		int max = item.getDefaultMaxStackSize();
		while (amount > 0) {
			int n = Math.min(max, amount);
			ItemStack s = new ItemStack(item, n);
			if (!p.getInventory().add(s) && !s.isEmpty()) {
				p.drop(s, false);
			}
			amount -= n;
		}
	}
}
