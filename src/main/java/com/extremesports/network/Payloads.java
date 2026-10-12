package com.extremesports.network;

import com.extremesports.ExtremeSports;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.trick.ComboEntry;
import io.netty.buffer.ByteBuf;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** All custom packets. */
public final class Payloads {
	private Payloads() {
	}

	private static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> payloadType(String name) {
		return new CustomPacketPayload.Type<>(ExtremeSports.id(name));
	}

	// ------------------------------------------------------------------ client -> server

	/** Animation state of the equipment the sender is riding, relayed to other players. */
	public record RiderState(int entityId, int flags, int pack, int trick, int held, int landing) implements CustomPacketPayload {
		public static final Type<RiderState> TYPE = payloadType("rider_state");
		public static final StreamCodec<ByteBuf, RiderState> CODEC = StreamCodec.of(
			(buf, p) -> {
				ByteBufCodecs.VAR_INT.encode(buf, p.entityId);
				buf.writeInt(p.flags);
				buf.writeInt(p.pack);
				buf.writeInt(p.trick);
				buf.writeInt(p.held);
				buf.writeInt(p.landing);
			},
			buf -> new RiderState(ByteBufCodecs.VAR_INT.decode(buf), buf.readInt(), buf.readInt(), buf.readInt(), buf.readInt(), buf.readInt()));

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** A finished combo for server-side validation and scoring. */
	public record Combo(List<ComboEntry> entries, boolean landed) implements CustomPacketPayload {
		public static final Type<Combo> TYPE = payloadType("combo");
		public static final StreamCodec<ByteBuf, Combo> CODEC = StreamCodec.composite(
			ComboEntry.STREAM_CODEC.apply(ByteBufCodecs.list(64)), Combo::entries,
			ByteBufCodecs.BOOL, Combo::landed,
			Combo::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** The rider bailed; the server dismounts them and sends the board rolling. */
	public record Bail(int reason, float vx, float vy, float vz) implements CustomPacketPayload {
		public static final Type<Bail> TYPE = payloadType("bail");
		public static final StreamCodec<ByteBuf, Bail> CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT, Bail::reason,
			ByteBufCodecs.FLOAT, Bail::vx,
			ByteBufCodecs.FLOAT, Bail::vy,
			ByteBufCodecs.FLOAT, Bail::vz,
			Bail::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Apply a workshop configuration to the equipment in an inventory slot. */
	public record WorkshopApply(int slot, EquipmentConfig config) implements CustomPacketPayload {
		public static final Type<WorkshopApply> TYPE = payloadType("workshop_apply");
		public static final StreamCodec<ByteBuf, WorkshopApply> CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT, WorkshopApply::slot,
			EquipmentConfig.STREAM_CODEC, WorkshopApply::config,
			WorkshopApply::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Gameplay settings the server needs to know about. */
	public record Settings(String preset, boolean goofy, boolean autoPickup) implements CustomPacketPayload {
		public static final Type<Settings> TYPE = payloadType("settings");
		public static final StreamCodec<ByteBuf, Settings> CODEC = StreamCodec.composite(
			ByteBufCodecs.stringUtf8(32), Settings::preset,
			ByteBufCodecs.BOOL, Settings::goofy,
			ByteBufCodecs.BOOL, Settings::autoPickup,
			Settings::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Challenge menu actions: start/stop/practice. */
	public record ChallengeAction(String action, String argument) implements CustomPacketPayload {
		public static final Type<ChallengeAction> TYPE = payloadType("challenge_action");
		public static final StreamCodec<ByteBuf, ChallengeAction> CODEC = StreamCodec.composite(
			ByteBufCodecs.stringUtf8(32), ChallengeAction::action,
			ByteBufCodecs.stringUtf8(64), ChallengeAction::argument,
			ChallengeAction::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Quick remount: call your nearest equipment back and hop on. */
	public record Remount() implements CustomPacketPayload {
		public static final Type<Remount> TYPE = payloadType("remount");
		public static final StreamCodec<ByteBuf, Remount> CODEC = StreamCodec.unit(new Remount());

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	// ------------------------------------------------------------------ server -> client

	/** Server-confirmed combo score. */
	public record ComboScored(int total, int multiplier, int base, boolean landed, boolean accepted) implements CustomPacketPayload {
		public static final Type<ComboScored> TYPE = payloadType("combo_scored");
		public static final StreamCodec<ByteBuf, ComboScored> CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT, ComboScored::total,
			ByteBufCodecs.VAR_INT, ComboScored::multiplier,
			ByteBufCodecs.VAR_INT, ComboScored::base,
			ByteBufCodecs.BOOL, ComboScored::landed,
			ByteBufCodecs.BOOL, ComboScored::accepted,
			ComboScored::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** A player bailed: play the tumble animation. */
	public record BailAnim(int playerId, int reason, float vx, float vy, float vz) implements CustomPacketPayload {
		public static final Type<BailAnim> TYPE = payloadType("bail_anim");
		public static final StreamCodec<ByteBuf, BailAnim> CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT, BailAnim::playerId,
			ByteBufCodecs.VAR_INT, BailAnim::reason,
			ByteBufCodecs.FLOAT, BailAnim::vx,
			ByteBufCodecs.FLOAT, BailAnim::vy,
			ByteBufCodecs.FLOAT, BailAnim::vz,
			BailAnim::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record OpenWorkshop(BlockPos pos) implements CustomPacketPayload {
		public static final Type<OpenWorkshop> TYPE = payloadType("open_workshop");
		public static final StreamCodec<ByteBuf, OpenWorkshop> CODEC = StreamCodec.composite(
			BlockPos.STREAM_CODEC, OpenWorkshop::pos,
			OpenWorkshop::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/**
	 * Live challenge state for the HUD.
	 *
	 * @param phase    0 none, 1 countdown, 2 running, 3 finished
	 * @param ticks    countdown ticks, remaining ticks (timed) or elapsed ticks (races)
	 * @param progress challenge-specific progress value (score, best, distance x10, checkpoints passed)
	 * @param target   next medal target or total checkpoints
	 * @param medal    medal earned so far (0 none, 1 bronze, 2 silver, 3 gold)
	 * @param detail   extra text (objective list for BMX challenges, results)
	 */
	public record ChallengeState(String challenge, int phase, int ticks, int progress, int target, int medal, String detail)
		implements CustomPacketPayload {
		public static final Type<ChallengeState> TYPE = payloadType("challenge_state");
		public static final StreamCodec<ByteBuf, ChallengeState> CODEC = StreamCodec.of(
			(buf, p) -> {
				ByteBufCodecs.stringUtf8(32).encode(buf, p.challenge);
				ByteBufCodecs.VAR_INT.encode(buf, p.phase);
				ByteBufCodecs.VAR_INT.encode(buf, p.ticks);
				ByteBufCodecs.VAR_INT.encode(buf, p.progress);
				ByteBufCodecs.VAR_INT.encode(buf, p.target);
				ByteBufCodecs.VAR_INT.encode(buf, p.medal);
				ByteBufCodecs.stringUtf8(512).encode(buf, p.detail);
			},
			buf -> new ChallengeState(ByteBufCodecs.stringUtf8(32).decode(buf), ByteBufCodecs.VAR_INT.decode(buf), ByteBufCodecs.VAR_INT.decode(buf),
				ByteBufCodecs.VAR_INT.decode(buf), ByteBufCodecs.VAR_INT.decode(buf), ByteBufCodecs.VAR_INT.decode(buf), ByteBufCodecs.stringUtf8(512).decode(buf)));

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** A cosmetic or part was unlocked. */
	public record Unlocked(String unlock) implements CustomPacketPayload {
		public static final Type<Unlocked> TYPE = payloadType("unlocked");
		public static final StreamCodec<ByteBuf, Unlocked> CODEC = StreamCodec.composite(
			ByteBufCodecs.stringUtf8(64), Unlocked::unlock,
			Unlocked::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Used so registries can accept RegistryFriendlyByteBuf codecs. */
	@SuppressWarnings("unchecked")
	static <T> StreamCodec<RegistryFriendlyByteBuf, T> widen(StreamCodec<? super RegistryFriendlyByteBuf, T> codec) {
		return (StreamCodec<RegistryFriendlyByteBuf, T>) codec;
	}
}
