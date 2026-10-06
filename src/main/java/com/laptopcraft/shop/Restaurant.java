package com.laptopcraft.shop;

import net.minecraft.world.item.Item;

/**
 * An Ender Eats restaurant. Its menu is every {@link Product} with {@code store == ENDER_EATS}
 * and a matching {@link Product#restaurantId()}.
 *
 * @param id          unique id, e.g. "pigstep_pizza"
 * @param name        display name, e.g. "Pigstep Pizza"
 * @param cuisine     short cuisine label, e.g. "Pizza · Italian"
 * @param tagline     one-line slogan
 * @param accentColor ARGB brand color used for the restaurant banner
 * @param iconItem    item rendered as the restaurant's logo
 * @param rating      tenths of a star, 0..50
 * @param etaSeconds  standard delivery time in seconds
 * @param deliveryFee standard delivery fee in emeralds
 */
public record Restaurant(
		String id,
		String name,
		String cuisine,
		String tagline,
		int accentColor,
		Item iconItem,
		int rating,
		int etaSeconds,
		int deliveryFee
) {
}
