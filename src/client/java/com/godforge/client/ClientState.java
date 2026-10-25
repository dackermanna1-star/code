package com.godforge.client;

import com.godforge.network.CooldownPayload;
import com.godforge.weapon.WeaponType;
import net.minecraft.client.Minecraft;

/** Client-side mirror of server state the HUD needs (ultimate cooldowns). */
public final class ClientState {
	private static final int[] REMAINING = new int[WeaponType.values().length];
	private static final int[] TOTAL = new int[WeaponType.values().length];
	private static final long[] RECEIVED = new long[WeaponType.values().length];

	private ClientState() {
	}

	public static void onCooldown(CooldownPayload payload) {
		if (payload.weapon() < 0 || payload.weapon() >= REMAINING.length) {
			return;
		}
		REMAINING[payload.weapon()] = payload.remaining();
		TOTAL[payload.weapon()] = Math.max(1, payload.total());
		RECEIVED[payload.weapon()] = now();
	}

	private static long now() {
		Minecraft mc = Minecraft.getInstance();
		return mc.level != null ? mc.level.getGameTime() : 0L;
	}

	/** Remaining ultimate cooldown in ticks, extrapolated from the last server update. */
	public static int remaining(WeaponType type) {
		int i = type.ordinal();
		return (int) Math.max(0, REMAINING[i] - (now() - RECEIVED[i]));
	}

	public static float fraction(WeaponType type) {
		int i = type.ordinal();
		return TOTAL[i] <= 0 ? 0.0F : Math.min(1.0F, remaining(type) / (float) TOTAL[i]);
	}

	public static void reset() {
		java.util.Arrays.fill(REMAINING, 0);
		java.util.Arrays.fill(TOTAL, 0);
	}
}
