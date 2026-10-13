package dev.calibercraft.data;

import net.minecraft.world.level.Level;

/**
 * Side-specific active definition snapshots. The server snapshot is replaced on datapack reload; the client
 * snapshot is replaced when the server syncs. Snapshots are immutable, so readers never see partial state.
 */
public final class CaliberDataHolder {
	private static volatile CaliberData server = CaliberData.EMPTY;
	private static volatile CaliberData client = CaliberData.EMPTY;

	private CaliberDataHolder() {
	}

	public static CaliberData server() {
		return server;
	}

	public static CaliberData client() {
		return client;
	}

	public static CaliberData get(boolean clientSide) {
		return clientSide ? client : server;
	}

	public static CaliberData get(Level level) {
		return get(level.isClientSide());
	}

	public static void setServer(CaliberData data) {
		server = data;
	}

	public static void setClient(CaliberData data) {
		client = data;
	}
}
