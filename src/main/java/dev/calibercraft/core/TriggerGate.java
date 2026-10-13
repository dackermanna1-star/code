package dev.calibercraft.core;

/**
 * Enforces fire-mode semantics on the server using the client's trigger-pull counter: semi-auto accepts
 * one shot per pull, burst at most {@code burstCount} per pull, automatic any number.
 */
public final class TriggerGate {
	private int lastPull = Integer.MIN_VALUE;
	private int shotsThisPull;

	public boolean accept(FireMode mode, int pullId, int burstCount) {
		if (pullId != lastPull) {
			lastPull = pullId;
			shotsThisPull = 0;
		}
		int limit = switch (mode) {
			case SEMI -> 1;
			case BURST -> Math.max(1, burstCount);
			case AUTO -> Integer.MAX_VALUE;
		};
		if (shotsThisPull >= limit) {
			return false;
		}
		shotsThisPull++;
		return true;
	}
}
