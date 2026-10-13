package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.util.Optional;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.Identifier;

/**
 * Persistent ammunition/action state stored on a weapon ItemStack (data component).
 * Transient state (reload progress, trigger timing) deliberately lives elsewhere so the stack only
 * changes when ammunition actually changes.
 *
 * @param rounds     rounds in the magazine / tube / cylinder
 * @param chambered  whether a round sits in the chamber (unused for {@link ActionType#DOUBLE_ACTION})
 * @param loadedAmmo ammunition type currently loaded
 * @param selectedAmmo ammunition type the next reload will load
 * @param fireMode   index into the weapon's fire-mode list
 * @param lastSeq    sequence number of the last shot the server processed (client prediction)
 * @param heat       heat level at {@code heatTime}
 * @param heatTime   game time at which {@code heat} was recorded (heat decays lazily)
 * @param overheated latched overheat lockout
 */
public record GunState(int rounds, boolean chambered, Optional<Identifier> loadedAmmo, Optional<Identifier> selectedAmmo,
		int fireMode, int lastSeq, float heat, long heatTime, boolean overheated) {
	public static final GunState EMPTY = new GunState(0, false, Optional.empty(), Optional.empty(), 0, 0, 0f, 0L, false);

	public static final Codec<GunState> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.optionalFieldOf("rounds", 0).forGetter(GunState::rounds),
		Codec.BOOL.optionalFieldOf("chambered", false).forGetter(GunState::chambered),
		Identifier.CODEC.optionalFieldOf("loaded_ammo").forGetter(GunState::loadedAmmo),
		Identifier.CODEC.optionalFieldOf("selected_ammo").forGetter(GunState::selectedAmmo),
		Codec.INT.optionalFieldOf("fire_mode", 0).forGetter(GunState::fireMode),
		Codec.INT.optionalFieldOf("last_seq", 0).forGetter(GunState::lastSeq),
		Codec.FLOAT.optionalFieldOf("heat", 0f).forGetter(GunState::heat),
		Codec.LONG.optionalFieldOf("heat_time", 0L).forGetter(GunState::heatTime),
		Codec.BOOL.optionalFieldOf("overheated", false).forGetter(GunState::overheated)
	).apply(i, GunState::new));

	public static final StreamCodec<ByteBuf, GunState> STREAM_CODEC = new StreamCodec<>() {
		@Override
		public GunState decode(ByteBuf buf) {
			int rounds = ByteBufCodecs.VAR_INT.decode(buf);
			boolean chambered = ByteBufCodecs.BOOL.decode(buf);
			Optional<Identifier> loaded = ByteBufCodecs.optional(Identifier.STREAM_CODEC).decode(buf);
			Optional<Identifier> selected = ByteBufCodecs.optional(Identifier.STREAM_CODEC).decode(buf);
			int mode = ByteBufCodecs.VAR_INT.decode(buf);
			int seq = ByteBufCodecs.VAR_INT.decode(buf);
			float heat = ByteBufCodecs.FLOAT.decode(buf);
			long heatTime = ByteBufCodecs.VAR_LONG.decode(buf);
			boolean overheated = ByteBufCodecs.BOOL.decode(buf);
			return new GunState(rounds, chambered, loaded, selected, mode, seq, heat, heatTime, overheated);
		}

		@Override
		public void encode(ByteBuf buf, GunState s) {
			ByteBufCodecs.VAR_INT.encode(buf, s.rounds);
			ByteBufCodecs.BOOL.encode(buf, s.chambered);
			ByteBufCodecs.optional(Identifier.STREAM_CODEC).encode(buf, s.loadedAmmo);
			ByteBufCodecs.optional(Identifier.STREAM_CODEC).encode(buf, s.selectedAmmo);
			ByteBufCodecs.VAR_INT.encode(buf, s.fireMode);
			ByteBufCodecs.VAR_INT.encode(buf, s.lastSeq);
			ByteBufCodecs.FLOAT.encode(buf, s.heat);
			ByteBufCodecs.VAR_LONG.encode(buf, s.heatTime);
			ByteBufCodecs.BOOL.encode(buf, s.overheated);
		}
	};

	public GunState {
		rounds = Math.max(0, rounds);
		heat = Math.max(0f, Math.min(1.5f, heat));
	}

	public int total() {
		return rounds + (chambered ? 1 : 0);
	}

	public GunState withRounds(int r) {
		return new GunState(r, chambered, loadedAmmo, selectedAmmo, fireMode, lastSeq, heat, heatTime, overheated);
	}

	public GunState withChambered(boolean c) {
		return new GunState(rounds, c, loadedAmmo, selectedAmmo, fireMode, lastSeq, heat, heatTime, overheated);
	}

	public GunState withLoadedAmmo(Optional<Identifier> a) {
		return new GunState(rounds, chambered, a, selectedAmmo, fireMode, lastSeq, heat, heatTime, overheated);
	}

	public GunState withSelectedAmmo(Optional<Identifier> a) {
		return new GunState(rounds, chambered, loadedAmmo, a, fireMode, lastSeq, heat, heatTime, overheated);
	}

	public GunState withFireMode(int m) {
		return new GunState(rounds, chambered, loadedAmmo, selectedAmmo, m, lastSeq, heat, heatTime, overheated);
	}

	public GunState withLastSeq(int seq) {
		return new GunState(rounds, chambered, loadedAmmo, selectedAmmo, fireMode, seq, heat, heatTime, overheated);
	}

	public GunState withHeat(float h, long time, boolean over) {
		return new GunState(rounds, chambered, loadedAmmo, selectedAmmo, fireMode, lastSeq, h, time, over);
	}
}
