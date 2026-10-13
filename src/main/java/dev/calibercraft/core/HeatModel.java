package dev.calibercraft.core;

/**
 * Lazily-decaying weapon heat: the stack stores heat + the time of the last shot, current heat is derived from game
 * time, so nothing has to tick. Cooling starts {@link #COOL_DELAY} ticks after the last shot.
 */
public final class HeatModel {
	/** Overheat lockout releases below this level. */
	public static final float RECOVER_THRESHOLD = 0.35f;
	/** Ticks after the last shot before the barrel starts cooling (sustained fire never cools). */
	public static final int COOL_DELAY = 10;

	private HeatModel() {
	}

	public static float current(GunState s, long now, double cooling) {
		long dt = Math.max(0, now - s.heatTime() - COOL_DELAY);
		return (float) Math.max(0.0, s.heat() - dt * cooling);
	}

	public static boolean locked(GunState s, long now, double cooling) {
		return s.overheated() && current(s, now, cooling) > RECOVER_THRESHOLD;
	}

	public static GunState afterShot(GunState s, long now, double perShot, double cooling) {
		if (perShot <= 0) {
			return s;
		}
		float h = current(s, now, cooling) + (float) perShot;
		boolean over = h >= 1.0f || locked(s, now, cooling);
		return s.withHeat(h, now, over);
	}
}
