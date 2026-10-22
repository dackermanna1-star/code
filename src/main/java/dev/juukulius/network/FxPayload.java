package dev.juukulius.network;

import dev.juukulius.JuliusMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/**
 * Server → nearby clients: spawn a visual effect. Purely cosmetic; clients scale particle counts by their own settings.
 *
 * @param fx       {@link FxType} ordinal
 * @param entityId entity the effect follows (or -1)
 * @param pos      world position
 * @param dir      direction (look vector, impact normal...)
 * @param color    RGB tint
 * @param power    effect-specific magnitude (radius, charge, intensity)
 */
public record FxPayload(int fx, int entityId, Vec3 pos, Vec3 dir, int color, float power) implements CustomPacketPayload {
	public static final Type<FxPayload> TYPE = new Type<>(JuliusMod.id("fx"));
	public static final StreamCodec<ByteBuf, FxPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, FxPayload::fx,
		ByteBufCodecs.VAR_INT, FxPayload::entityId,
		Vec3.STREAM_CODEC, FxPayload::pos,
		Vec3.STREAM_CODEC, FxPayload::dir,
		ByteBufCodecs.INT, FxPayload::color,
		ByteBufCodecs.FLOAT, FxPayload::power,
		FxPayload::new
	);

	public FxType fxType() {
		return FxType.byId(this.fx);
	}

	@Override
	public Type<FxPayload> type() {
		return TYPE;
	}
}
