package com.laptopcraft.shop;

import java.util.function.Function;
import net.minecraft.core.HolderLookup;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ItemLike;

/**
 * Something that can be bought from a {@link Store}. Products are defined in common code and are
 * therefore identical on client (for display) and server (authoritative price + delivery).
 *
 * @param id           unique id, lowercase [a-z0-9_/.-], e.g. "hoodie_red" or "pizza_margherita"
 * @param store        which site sells it
 * @param category     display category (see {@link Categories}); for Ender Eats a menu section
 * @param name         display name
 * @param description  one or two sentences of marketing copy shown on the product page
 * @param price        price in emeralds (>= 0)
 * @param stackFactory builds the delivered stack (count included). Gets registry access because
 *                     some stacks (e.g. paintings) reference data-driven registries.
 * @param rating       average review score in tenths of a star, 0..50 (e.g. 46 = 4.6 stars)
 * @param reviews      number of reviews (flavor)
 * @param badge        optional badge text such as "Best Seller", "New", "Deal" — empty for none
 * @param restaurantId for {@link Store#ENDER_EATS}: the {@link Restaurant#id()} whose menu it is on; empty otherwise
 */
public record Product(
		String id,
		Store store,
		String category,
		String name,
		String description,
		int price,
		Function<HolderLookup.Provider, ItemStack> stackFactory,
		int rating,
		int reviews,
		String badge,
		String restaurantId
) {
	/** Creates the stack delivered for one unit of this product. */
	public ItemStack createStack(HolderLookup.Provider registries) {
		return stackFactory.apply(registries);
	}

	/** Emerazon product delivering {@code count} of a simple item. */
	public static Product emerazon(String id, String category, String name, String description, int price, ItemLike item, int count, int rating, int reviews, String badge) {
		Item it = item.asItem();
		return new Product(id, Store.EMERAZON, category, name, description, price, r -> new ItemStack(it, count), rating, reviews, badge, "");
	}

	/** Emerazon product with a custom stack factory. */
	public static Product emerazon(String id, String category, String name, String description, int price,
			Function<HolderLookup.Provider, ItemStack> factory, int rating, int reviews, String badge) {
		return new Product(id, Store.EMERAZON, category, name, description, price, factory, rating, reviews, badge, "");
	}

	/** Ender Eats menu item delivering {@code count} of a simple item. */
	public static Product menuItem(String id, String restaurantId, String section, String name, String description, int price, ItemLike item, int count, int rating, int reviews, String badge) {
		Item it = item.asItem();
		return new Product(id, Store.ENDER_EATS, section, name, description, price, r -> new ItemStack(it, count), rating, reviews, badge, restaurantId);
	}
}
