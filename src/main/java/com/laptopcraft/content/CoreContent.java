package com.laptopcraft.content;

import com.laptopcraft.registry.ModBlocks;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;

/** Products for the mod's own core items (the laptop itself, etc.). Owned by the core agent. */
public final class CoreContent {
	private CoreContent() {
	}

	public static void addProducts() {
		Catalog.register(Product.emerazon("cubebook_laptop", Categories.ELECTRONICS, "CubeBook Pro Laptop",
				"The laptop you're using right now, but newer. Crisp pixel display, a keyboard with every letter "
						+ "(even Q), CubeOS pre-installed and a battery that never runs out because nobody invented batteries. "
						+ "Buy a second one for your other base!",
				32, ModBlocks.LAPTOP, 1, 48, 1337, "Best Seller"));
	}
}
