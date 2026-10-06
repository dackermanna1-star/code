package com.laptopcraft.shop;

import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.util.StringRepresentable;

/**
 * Shipping speed chosen at checkout. Fees and times are computed by
 * {@link Catalog#deliveryFee} and {@link Catalog#deliverySeconds} so client and server agree.
 */
public enum DeliveryOption implements StringRepresentable {
	STANDARD("standard"),
	EXPRESS("express");

	public static final Codec<DeliveryOption> CODEC = StringRepresentable.fromEnum(DeliveryOption::values);
	public static final StreamCodec<ByteBuf, DeliveryOption> STREAM_CODEC = ByteBufCodecs.idMapper(i -> values()[Math.floorMod(i, values().length)], DeliveryOption::ordinal);

	private final String id;

	DeliveryOption(String id) {
		this.id = id;
	}

	@Override
	public String getSerializedName() {
		return id;
	}
}
