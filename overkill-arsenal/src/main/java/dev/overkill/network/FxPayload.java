package dev.overkill.network;

import dev.overkill.OverkillArsenal;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/**
 * One packet that describes a whole visual effect (a beam, a crater blast, an arc...). The client
 * expands it into hundreds of particles, which is far cheaper than streaming particle packets.
 *
 * @param kind  one of {@link FxKind}
 * @param a     primary position (start / centre)
 * @param b     secondary vector (end point / direction / entry point, depending on kind)
 * @param scale size or power of the effect
 * @param seed  random seed so every client draws the same jagged arc
 */
public record FxPayload(int kind, Vec3 a, Vec3 b, float scale, int seed) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<FxPayload> TYPE = new CustomPacketPayload.Type<>(OverkillArsenal.id("fx"));
	public static final StreamCodec<RegistryFriendlyByteBuf, FxPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, FxPayload::kind,
		Vec3.STREAM_CODEC, FxPayload::a,
		Vec3.STREAM_CODEC, FxPayload::b,
		ByteBufCodecs.FLOAT, FxPayload::scale,
		ByteBufCodecs.VAR_INT, FxPayload::seed,
		FxPayload::new
	);

	@Override
	public CustomPacketPayload.Type<FxPayload> type() {
		return TYPE;
	}
}
