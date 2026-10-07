package com.laptopcraft.client.web.kit;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Product;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;

/** Shared drawing + shop helpers for the in-game web sites. */
public final class Kit {
	private static final Map<String, ItemStack> STACKS = new HashMap<>();
	private static Object stackOwner;

	private Kit() {
	}

	/** Display stack for a product (cached per world). */
	public static ItemStack stack(Product p) {
		Minecraft mc = Minecraft.getInstance();
		Object owner = mc.level;
		if (owner != stackOwner) {
			STACKS.clear();
			stackOwner = owner;
		}
		return STACKS.computeIfAbsent(p.id(), id -> {
			HolderLookup.Provider regs = mc.level != null ? mc.level.registryAccess() : null;
			try {
				ItemStack s = p.createStack(regs);
				return s == null ? ItemStack.EMPTY : s;
			} catch (RuntimeException e) {
				return ItemStack.EMPTY;
			}
		});
	}

	/** Five stars, rating in tenths (0..50). Returns width. */
	public static int stars(GuiGraphics g, int x, int y, int rating, int on, int off) {
		for (int i = 0; i < 5; i++) {
			int sx = x + i * 8;
			int fill = rating - i * 10;
			Gfx.text(g, "★", sx, y, off);
			if (fill >= 8) {
				Gfx.text(g, "★", sx, y, on);
			} else if (fill >= 3) {
				Gfx.scissor(g, sx, y - 1, 4, 10);
				Gfx.text(g, "★", sx, y, on);
				Gfx.endScissor(g);
			}
		}
		return 40;
	}

	/** Upper-case first letter for avatar circles ("?" for empty names). */
	public static String initial(String name) {
		return name == null || name.isBlank() ? "?" : name.strip().substring(0, 1).toUpperCase(java.util.Locale.ROOT);
	}

	public static String rating(int rating) {
		return (rating / 10) + "." + (rating % 10);
	}

	/** Deterministic pseudo random in [0,1) from a string + salt. */
	public static double rand(String key, int salt) {
		long h = key.hashCode() * 0x9E3779B97F4A7C15L + salt * 0xC2B2AE3D27D4EB4FL;
		h ^= (h >>> 31);
		h *= 0xBF58476D1CE4E5B9L;
		h ^= (h >>> 29);
		return (h >>> 11) * 0x1.0p-53;
	}

	public static <T> T pick(List<T> list, String key, int salt) {
		return list.get((int) (rand(key, salt) * list.size()));
	}

	// ---------------------------------------------------------------- carts (stored in site state)

	/** Reads a cart ("cart" list of {id, qty}) from a site state compound. */
	public static List<OrderLine> readCart(CompoundTag state) {
		List<OrderLine> out = new ArrayList<>();
		ListTag list = state.getListOrEmpty("cart");
		for (Tag t : list) {
			if (t instanceof CompoundTag c) {
				String id = c.getStringOr("id", "");
				int qty = c.getIntOr("qty", 0);
				if (qty > 0 && Catalog.get(id).isPresent()) {
					out.add(new OrderLine(id, Math.min(qty, Catalog.MAX_UNITS_PER_LINE)));
				}
			}
		}
		return out;
	}

	public static void writeCart(CompoundTag state, List<OrderLine> cart) {
		ListTag list = new ListTag();
		for (OrderLine l : cart) {
			CompoundTag c = new CompoundTag();
			c.putString("id", l.productId());
			c.putInt("qty", l.quantity());
			list.add(c);
		}
		state.put("cart", list);
	}

	public static List<OrderLine> addToCart(List<OrderLine> cart, String id, int qty) {
		List<OrderLine> out = new ArrayList<>();
		boolean found = false;
		for (OrderLine l : cart) {
			if (l.productId().equals(id)) {
				out.add(new OrderLine(id, Math.min(Catalog.MAX_UNITS_PER_LINE, l.quantity() + qty)));
				found = true;
			} else {
				out.add(l);
			}
		}
		if (!found && out.size() < Catalog.MAX_ORDER_LINES) {
			out.add(new OrderLine(id, Math.min(Catalog.MAX_UNITS_PER_LINE, qty)));
		}
		return out;
	}

	public static List<OrderLine> setQty(List<OrderLine> cart, String id, int qty) {
		List<OrderLine> out = new ArrayList<>();
		for (OrderLine l : cart) {
			if (!l.productId().equals(id)) {
				out.add(l);
			} else if (qty > 0) {
				out.add(new OrderLine(id, Math.min(Catalog.MAX_UNITS_PER_LINE, qty)));
			}
		}
		return out;
	}

	public static int subtotal(List<OrderLine> cart) {
		int sum = 0;
		for (OrderLine l : cart) {
			sum += Catalog.get(l.productId()).map(Product::price).orElse(0) * l.quantity();
		}
		return sum;
	}

	public static int units(List<OrderLine> cart) {
		return cart.stream().mapToInt(OrderLine::quantity).sum();
	}

	/** Newest order id in a snapshot (or -1). */
	public static long newestOrderId(AccountSnapshot s) {
		return s.orders().stream().mapToLong(Order::id).max().orElse(-1);
	}

	/** Seconds left until delivery (0 when due/delivered). */
	public static int secondsLeft(Order o, long gameTime) {
		return (int) Math.max(0, (o.deliverAt() - gameTime + 19) / 20);
	}

	/** "Day N, HH:MM" from an absolute game time. */
	public static String when(long gameTime) {
		long day = gameTime / 24000 + 1;
		long t = (gameTime + 6000) % 24000;
		long hh = t / 1000;
		long mm = (t % 1000) * 60 / 1000;
		return String.format("Day %d, %02d:%02d", day, hh, mm);
	}

	public static String duration(int seconds) {
		return seconds >= 60 ? (seconds / 60) + "m " + (seconds % 60) + "s" : seconds + "s";
	}
}
