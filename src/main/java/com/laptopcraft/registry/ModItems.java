package com.laptopcraft.registry;

import net.minecraft.world.item.Item;

/** Core items. The laptop item is registered together with its block by {@link ModBlocks}. */
public final class ModItems {
	/** The CubeBook laptop block item ({@code laptopcraft:laptop}). */
	public static final Item LAPTOP = ModBlocks.LAPTOP.asItem();

	private ModItems() {
	}

	public static void init() {
		// Class loading resolves the fields above.
	}
}
