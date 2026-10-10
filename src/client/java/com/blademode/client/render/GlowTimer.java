package com.blademode.client.render;

/** Fresh cut faces glow hot orange for a moment, then cool down. */
public final class GlowTimer {
	private static final float GLOW_TICKS = 50.0F;

	private GlowTimer() {
	}

	public static float glow(long cutTime, long now, float partialTick) {
		float age = (float) (now - cutTime) + partialTick;
		if (age < 0 || age > GLOW_TICKS) {
			return 0.0F;
		}
		float t = 1.0F - age / GLOW_TICKS;
		return t * t;
	}
}
