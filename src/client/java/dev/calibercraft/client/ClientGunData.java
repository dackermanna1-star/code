package dev.calibercraft.client;

import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.network.ServerSettings;
import dev.calibercraft.network.SyncDataPayload;

/** Data received from the server for this session. */
public final class ClientGunData {
	private static long shotSalt;
	private static ServerSettings settings = ServerSettings.DEFAULT;

	private ClientGunData() {
	}

	public static void accept(SyncDataPayload p) {
		CaliberDataHolder.setClient(p.data());
		shotSalt = p.shotSalt();
		settings = p.settings();
	}

	public static void reset() {
		CaliberDataHolder.setClient(CaliberData.EMPTY);
		settings = ServerSettings.DEFAULT;
	}

	public static CaliberData data() {
		return CaliberDataHolder.client();
	}

	public static long shotSalt() {
		return shotSalt;
	}

	public static ServerSettings settings() {
		return settings;
	}
}
