package com.laptopcraft.account;

import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Store;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;

/**
 * A placed order (immutable snapshot; the server replaces it with a copy when the status changes).
 *
 * @param id           per-player increasing order number
 * @param store        where it was bought
 * @param restaurantId Ender Eats restaurant id, empty for Emerazon
 * @param lines        what was bought
 * @param subtotal     sum of line prices (emeralds)
 * @param fee          delivery fee
 * @param tip          courier tip (Ender Eats)
 * @param total        subtotal + fee + tip, i.e. what was charged (0 if free in creative)
 * @param option       chosen delivery speed
 * @param placedAt     overworld game time when placed
 * @param deliverAt    overworld game time when it will be / was delivered
 * @param status       coarse state
 * @param destination  human-readable delivery address, e.g. "Laptop at 12, 64, -30" or "Follow me"
 */
public record Order(
		long id,
		Store store,
		String restaurantId,
		List<OrderLine> lines,
		int subtotal,
		int fee,
		int tip,
		int total,
		DeliveryOption option,
		long placedAt,
		long deliverAt,
		OrderStatus status,
		String destination
) {
	public static final Codec<Order> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.LONG.fieldOf("id").forGetter(Order::id),
			Store.CODEC.fieldOf("store").forGetter(Order::store),
			Codec.STRING.optionalFieldOf("restaurant", "").forGetter(Order::restaurantId),
			OrderLine.CODEC.listOf().fieldOf("lines").forGetter(Order::lines),
			Codec.INT.fieldOf("subtotal").forGetter(Order::subtotal),
			Codec.INT.fieldOf("fee").forGetter(Order::fee),
			Codec.INT.fieldOf("tip").forGetter(Order::tip),
			Codec.INT.fieldOf("total").forGetter(Order::total),
			DeliveryOption.CODEC.fieldOf("option").forGetter(Order::option),
			Codec.LONG.fieldOf("placed_at").forGetter(Order::placedAt),
			Codec.LONG.fieldOf("deliver_at").forGetter(Order::deliverAt),
			OrderStatus.CODEC.fieldOf("status").forGetter(Order::status),
			Codec.STRING.optionalFieldOf("destination", "").forGetter(Order::destination)
	).apply(i, Order::new));

	public Order withStatus(OrderStatus newStatus) {
		return new Order(id, store, restaurantId, lines, subtotal, fee, tip, total, option, placedAt, deliverAt, newStatus, destination);
	}

	/** 0..1 progress of the delivery at the given game time. */
	public float progress(long gameTime) {
		if (status == OrderStatus.DELIVERED) {
			return 1f;
		}
		long span = Math.max(1, deliverAt - placedAt);
		return Math.max(0f, Math.min(1f, (gameTime - placedAt) / (float) span));
	}
}
