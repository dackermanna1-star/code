package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → shooter: corrections and state the client cannot predict. */
public record GunFeedbackPayload(Kind kind, int value) implements CustomPacketPayload {
	public static final Type<GunFeedbackPayload> TYPE = new Type<>(CaliberCraft.id("gun_feedback"));
	public static final StreamCodec<ByteBuf, GunFeedbackPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT.map(i -> Kind.values()[Math.floorMod(i, Kind.values().length)], Kind::ordinal), GunFeedbackPayload::kind,
		ByteBufCodecs.VAR_INT, GunFeedbackPayload::value,
		GunFeedbackPayload::new);

	public enum Kind {
		/** The reload request was rejected (no reserve ammunition / full). */
		RELOAD_DENIED,
		/** The server started a reload (value = ReloadRunner.Kind ordinal); lets the client resync its animation. */
		RELOAD_STARTED,
		/** The server cancelled the current reload/cycle (weapon switch, death...). */
		RELOAD_CANCELLED,
		/** The server started a manual cycle (bolt/pump/charge). */
		CYCLE_STARTED,
		/** Shot rejected; value = sequence number. The stack's last_seq is updated as well. */
		SHOT_REJECTED,
		/** Weapon overheated. */
		OVERHEATED,
		/** Customization result: value 0 = ok, 1 = missing item, 2 = incompatible, 3 = needs bench, 4 = needs kit. */
		GUNSMITH_RESULT
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
