package net.abyssaldescent.dungeon.run;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Snapshot of the expedition state shown in the client HUD. Synced to the owning player through a data attachment.
 *
 * @param objective see {@link Objective}
 * @param countdown descent countdown in ticks (0 = none)
 */
public record RunHud(int floor, int roomsCleared, int roomsTotal, int objective, int unsecured, int countdown, int partyAlive) {
	public static final RunHud NONE = new RunHud(0, 0, 0, 0, 0, 0, 0);

	public static final StreamCodec<ByteBuf, RunHud> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, RunHud::floor,
		ByteBufCodecs.VAR_INT, RunHud::roomsCleared,
		ByteBufCodecs.VAR_INT, RunHud::roomsTotal,
		ByteBufCodecs.VAR_INT, RunHud::objective,
		ByteBufCodecs.VAR_INT, RunHud::unsecured,
		ByteBufCodecs.VAR_INT, RunHud::countdown,
		ByteBufCodecs.VAR_INT, RunHud::partyAlive,
		RunHud::new
	);

	public boolean active() {
		return floor > 0;
	}

	public enum Objective {
		EXPLORE,
		CLEAR_ROOM,
		FIND_EXIT,
		DESCEND,
		BOSS,
		EXTRACT;

		public static Objective byId(int id) {
			Objective[] values = values();
			return values[Math.max(0, Math.min(values.length - 1, id))];
		}
	}
}
