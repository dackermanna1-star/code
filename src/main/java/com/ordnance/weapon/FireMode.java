package com.ordnance.weapon;

import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.util.StringIdentifiable;

/** How a launched round decides to detonate. */
public enum FireMode implements StringIdentifiable {
	/** Detonates on the first hit once armed. */
	IMPACT("impact"),
	/** Bounces and detonates when the time fuse runs out. */
	TIMED("timed");

	public static final Codec<FireMode> CODEC = StringIdentifiable.createCodec(FireMode::values);
	public static final PacketCodec<ByteBuf, FireMode> PACKET_CODEC = PacketCodecs.indexed(i -> values()[Math.floorMod(i, values().length)], Enum::ordinal);

	private final String name;

	FireMode(String name) {
		this.name = name;
	}

	@Override
	public String asString() {
		return this.name;
	}

	public FireMode next() {
		return values()[(this.ordinal() + 1) % values().length];
	}

	public String translationKey() {
		return "fire_mode.ordnance." + this.name;
	}
}
