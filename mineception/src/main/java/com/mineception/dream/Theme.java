package com.mineception.dream;

/**
 * The four dream levels. Each level has its own look, weather and time dilation: the deeper you go, the faster time
 * runs, until Limbo where the sun never moves.
 */
public enum Theme {
	CITY(1, "city", 0xFF7FA5D6, 0xFFC6D6E8, 0xFF0B1020, 0xFF1C2638, 0xFF8FA0B5, 30.0F, 0xFF79C05A, 0xFF59AE30, 0xFF3F76E4,
		1, 24000, -1.0F, Weather.RAIN, false),
	HOTEL(2, "hotel", 0xFF6C8CC0, 0xFFE8D2B0, 0xFF0B1020, 0xFF2A2030, 0xFFE0C9A6, 40.0F, 0xFF79C05A, 0xFF59AE30, 0xFF3F76E4,
		20, 1200, -1.0F, Weather.NONE, true),
	FORTRESS(3, "fortress", 0xFF9DB4D0, 0xFFE6EEF6, 0xFF101828, 0xFF2A3446, 0xFFDCE6F0, 32.0F, 0xFF80B497, 0xFF60A17B, 0xFF3D57D6,
		400, 600, -1.0F, Weather.SNOW, false),
	LIMBO(4, "limbo", 0xFF3E4A6A, 0xFFE09A5C, 0xFF3E4A6A, 0xFFE09A5C, 0xFF9C7C70, 22.0F, 0xFF8EB971, 0xFF71A74D, 0xFF2E6E8C,
		-1, 0, 0.47F, Weather.NONE, false);

	public enum Weather {
		NONE,
		RAIN,
		SNOW
	}

	public static final int DEPTHS = 4;

	/** Dream level, 1 (just below the real world) to 4 (Limbo). */
	public final int depth;
	public final String key;
	public final int skyDayTop;
	public final int skyDayHorizon;
	public final int skyNightTop;
	public final int skyNightHorizon;
	public final int fogColor;
	/** Distance in blocks at which fog fully hides the world. */
	public final float fogDistance;
	public final int grassTint;
	public final int foliageTint;
	public final int waterTint;
	/** How much faster time runs than in the real world, for display; -1 means time has stopped (Limbo). */
	public final int timeScale;
	/** Length of a full day/night cycle in real-world ticks; 0 means a fixed time of day. */
	public final int dayLengthTicks;
	/** Fixed time of day used when dayLengthTicks is 0, else -1. */
	public final float fixedTimeOfDay;
	public final Weather weather;
	/** Indoor levels are lit by their lamps rather than the sky. */
	public final boolean indoor;

	Theme(int depth, String key, int skyDayTop, int skyDayHorizon, int skyNightTop, int skyNightHorizon, int fogColor, float fogDistance,
		  int grassTint, int foliageTint, int waterTint, int timeScale, int dayLengthTicks, float fixedTimeOfDay, Weather weather, boolean indoor) {
		this.depth = depth;
		this.key = key;
		this.skyDayTop = skyDayTop;
		this.skyDayHorizon = skyDayHorizon;
		this.skyNightTop = skyNightTop;
		this.skyNightHorizon = skyNightHorizon;
		this.fogColor = fogColor;
		this.fogDistance = fogDistance;
		this.grassTint = grassTint;
		this.foliageTint = foliageTint;
		this.waterTint = waterTint;
		this.timeScale = timeScale;
		this.dayLengthTicks = dayLengthTicks;
		this.fixedTimeOfDay = fixedTimeOfDay;
		this.weather = weather;
		this.indoor = indoor;
	}

	public static Theme forDepth(int depth) {
		for (Theme theme : values()) {
			if (theme.depth == depth) {
				return theme;
			}
		}
		throw new IllegalArgumentException("No dream level at depth " + depth);
	}

	/** Translation key of the level name, e.g. "dream.mineception.city". */
	public String translationKey() {
		return "dream.mineception." + key;
	}

	/**
	 * Time of day in [0, 1): 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight.
	 *
	 * @param gameTime the real world's game time in ticks (shared by all clients, so levels look the same for everyone)
	 */
	public float timeOfDay(long gameTime, float partialTick) {
		if (dayLengthTicks <= 0) {
			return fixedTimeOfDay;
		}
		double t = (gameTime % dayLengthTicks + partialTick) / dayLengthTicks;
		// Start each cycle in the morning so a freshly opened level is bright
		return (float) ((t + 0.1) % 1.0);
	}

	/** Daylight factor in [0, 1] for a time of day (1 at noon, 0 at midnight, smooth at dawn and dusk). */
	public static float daylight(float timeOfDay) {
		double sunHeight = Math.sin(timeOfDay * Math.PI * 2.0);
		return (float) Math.max(0.0, Math.min(1.0, sunHeight * 2.5 + 0.5));
	}

	public boolean deepest() {
		return depth == DEPTHS;
	}
}
