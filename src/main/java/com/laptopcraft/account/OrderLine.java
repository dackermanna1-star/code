package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/** One cart line: a catalog product id and how many units. */
public record OrderLine(String productId, int quantity) {
	public static final Codec<OrderLine> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.STRING.fieldOf("product").forGetter(OrderLine::productId),
			Codec.INT.fieldOf("qty").forGetter(OrderLine::quantity)
	).apply(i, OrderLine::new));

	public static final StreamCodec<ByteBuf, OrderLine> STREAM_CODEC = StreamCodec.composite(
			ByteBufCodecs.stringUtf8(128), OrderLine::productId,
			ByteBufCodecs.VAR_INT, OrderLine::quantity,
			OrderLine::new
	);
}
