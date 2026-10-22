package dev.juukulius.network;

import dev.juukulius.JuliusMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server → tracking clients: play an action animation on an entity.
 *
 * @param entityId  the animated player
 * @param animation {@link dev.juukulius.animation.JuliusAnim} ordinal
 * @param speed     playback speed (Al Cranvel speeds up swordplay)
 * @param correction true when sent to the animated player itself to override a mispredicted animation
 */
public record AnimationPayload(int entityId, int animation, float speed, boolean correction) implements CustomPacketPayload {
	public static final Type<AnimationPayload> TYPE = new Type<>(JuliusMod.id("animation"));
	public static final StreamCodec<ByteBuf, AnimationPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, AnimationPayload::entityId,
		ByteBufCodecs.VAR_INT, AnimationPayload::animation,
		ByteBufCodecs.FLOAT, AnimationPayload::speed,
		ByteBufCodecs.BOOL, AnimationPayload::correction,
		AnimationPayload::new
	);

	@Override
	public Type<AnimationPayload> type() {
		return TYPE;
	}
}
