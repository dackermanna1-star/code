package com.mineception.network;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Token bucket per player: up to {@code burst} edits at once, refilled at {@code perSecond} edits per second of game
 * time. Used on the server thread only.
 */
public final class EditRateLimiter {
	private static final double TICKS_PER_SECOND = 20.0;

	private final double burst;
	private final double perTick;
	private final Map<UUID, double[]> buckets = new HashMap<>();

	public EditRateLimiter(int burst, int perSecond) {
		this.burst = burst;
		this.perTick = perSecond / TICKS_PER_SECOND;
	}

	/** Takes one token for the player at the given game time; false if they are editing too fast. */
	public boolean tryAcquire(UUID player, long gameTime) {
		double[] bucket = buckets.computeIfAbsent(player, id -> new double[]{burst, gameTime});
		double elapsed = Math.max(0.0, gameTime - bucket[1]);
		bucket[0] = Math.min(burst, bucket[0] + elapsed * perTick);
		bucket[1] = Math.max(bucket[1], gameTime);
		if (bucket[0] < 1.0) {
			return false;
		}
		bucket[0] -= 1.0;
		return true;
	}

	public void forget(UUID player) {
		buckets.remove(player);
	}
}
