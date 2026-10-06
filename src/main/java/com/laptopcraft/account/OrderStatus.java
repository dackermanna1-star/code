package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import net.minecraft.util.StringRepresentable;

/**
 * Coarse order state stored on the server. Finer UI states ("Preparing", "Shipped",
 * "Out for delivery"...) are derived on the client from placedAt/deliverAt and the game time.
 */
public enum OrderStatus implements StringRepresentable {
	PENDING("pending"),
	DELIVERED("delivered"),
	CANCELLED("cancelled");

	public static final Codec<OrderStatus> CODEC = StringRepresentable.fromEnum(OrderStatus::values);

	private final String id;

	OrderStatus(String id) {
		this.id = id;
	}

	@Override
	public String getSerializedName() {
		return id;
	}
}
