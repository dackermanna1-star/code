package dev.juukulius.network;

import dev.juukulius.JuliusMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client → server: the player pressed a Julius control. The server validates everything (transformation, sword,
 * cooldown, mana, action lock, timing) before anything happens.
 *
 * @param action   which control
 * @param argument spirit index for {@link Action#SELECT_SPIRIT}, predicted combo step for {@link Action#SWING},
 *                 1 for the sneaking variant of {@link Action#SPIRIT_ART} / {@link Action#SWORD_SPECIAL}
 */
public record ActionRequestPayload(Action action, int argument) implements CustomPacketPayload {
	public static final Type<ActionRequestPayload> TYPE = new Type<>(JuliusMod.id("action"));
	public static final StreamCodec<ByteBuf, ActionRequestPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.idMapper(Action::byId, Action::ordinal), ActionRequestPayload::action,
		ByteBufCodecs.VAR_INT, ActionRequestPayload::argument,
		ActionRequestPayload::new
	);

	@Override
	public Type<ActionRequestPayload> type() {
		return TYPE;
	}

	public enum Action {
		TRANSFORM,
		SELECT_SPIRIT,
		TOGGLE_SPIRITS,
		SPIRIT_ART,
		SWING,
		SWORD_SPECIAL,
		ULTIMATE;

		private static final Action[] VALUES = values();

		public static Action byId(int id) {
			return id >= 0 && id < VALUES.length ? VALUES[id] : TRANSFORM;
		}
	}
}
