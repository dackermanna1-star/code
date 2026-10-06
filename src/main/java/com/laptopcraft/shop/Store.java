package com.laptopcraft.shop;

import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.util.StringRepresentable;

/** The in-game web stores that can take orders. */
public enum Store implements StringRepresentable {
	/** Emerazon — the everything store (clothes, hats, toys, paintings, decor...). */
	EMERAZON("emerazon", "Emerazon"),
	/** Ender Eats — food delivery from restaurants, teleported by Endermen couriers. */
	ENDER_EATS("ender_eats", "Ender Eats");

	public static final Codec<Store> CODEC = StringRepresentable.fromEnum(Store::values);
	public static final StreamCodec<ByteBuf, Store> STREAM_CODEC = ByteBufCodecs.idMapper(i -> values()[Math.floorMod(i, values().length)], Store::ordinal);

	private final String id;
	private final String displayName;

	Store(String id, String displayName) {
		this.id = id;
		this.displayName = displayName;
	}

	public String id() {
		return id;
	}

	public String displayName() {
		return displayName;
	}

	@Override
	public String getSerializedName() {
		return id;
	}
}
