package dev.juukulius.network;

import dev.juukulius.JuliusMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → client on join: balance multipliers the client needs for accurate input prediction. */
public record ServerRulesPayload(double manaCostMultiplier, double cooldownMultiplier) implements CustomPacketPayload {
	public static final Type<ServerRulesPayload> TYPE = new Type<>(JuliusMod.id("server_rules"));
	public static final StreamCodec<ByteBuf, ServerRulesPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.DOUBLE, ServerRulesPayload::manaCostMultiplier,
		ByteBufCodecs.DOUBLE, ServerRulesPayload::cooldownMultiplier,
		ServerRulesPayload::new
	);

	@Override
	public Type<ServerRulesPayload> type() {
		return TYPE;
	}
}
