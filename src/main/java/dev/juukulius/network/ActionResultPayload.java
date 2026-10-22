package dev.juukulius.network;

import dev.juukulius.JuliusMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server → owning client: a request was rejected, so the predicted animation must be cancelled.
 *
 * @param action the rejected {@link ActionRequestPayload.Action} ordinal
 * @param reason {@link DenyReason} ordinal, shown as a short HUD message
 */
public record ActionResultPayload(int action, int reason) implements CustomPacketPayload {
	public static final Type<ActionResultPayload> TYPE = new Type<>(JuliusMod.id("action_result"));
	public static final StreamCodec<ByteBuf, ActionResultPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, ActionResultPayload::action,
		ByteBufCodecs.VAR_INT, ActionResultPayload::reason,
		ActionResultPayload::new
	);

	@Override
	public Type<ActionResultPayload> type() {
		return TYPE;
	}

	public enum DenyReason {
		NOT_TRANSFORMED,
		NO_SWORD,
		COOLDOWN,
		NO_MANA,
		BUSY,
		SPIRITS_RESTING,
		TOO_FAST,
		ULTIMATE_ACTIVE,
		NO_TARGET;

		private static final DenyReason[] VALUES = values();

		public static DenyReason byId(int id) {
			return id >= 0 && id < VALUES.length ? VALUES[id] : BUSY;
		}

		public String translationKey() {
			return "message.julius_juukulius.denied." + this.name().toLowerCase(java.util.Locale.ROOT);
		}
	}
}
