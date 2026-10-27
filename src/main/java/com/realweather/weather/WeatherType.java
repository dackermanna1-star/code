package com.realweather.weather;

import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * The large-scale weather regimes the simulator moves between.
 *
 * <p>Each type defines the targets the smoothed atmospheric parameters drift towards. The actual values
 * seen in the world are always interpolated, so switching types never produces an abrupt change.
 */
public enum WeatherType {
	//            cloud  precip storm  cold  fog   wind m/s gust  vanilla rain/thunder
	CLEAR(        0.22F, 0.00F, 0.00F, 0.0F, 0.00F, 3.0F,   0.30F, false, false),
	OVERCAST(     0.88F, 0.00F, 0.00F, 0.0F, 0.12F, 5.0F,   0.35F, false, false),
	FOG(          0.55F, 0.00F, 0.00F, 0.0F, 1.00F, 0.8F,   0.15F, false, false),
	RAIN(         0.96F, 0.62F, 0.12F, 0.0F, 0.28F, 6.5F,   0.40F, true, false),
	THUNDER(      1.00F, 0.92F, 1.00F, 0.0F, 0.38F, 11.0F,  0.65F, true, true),
	SNOW(         0.95F, 0.58F, 0.00F, 1.0F, 0.32F, 4.0F,   0.35F, true, false),
	BLIZZARD(     1.00F, 1.00F, 0.25F, 1.0F, 0.95F, 17.0F,  0.55F, true, false);

	private static final WeatherType[] VALUES = values();

	public final float cloudCover;
	public final float precipitation;
	public final float storm;
	public final float coldSnap;
	public final float fog;
	public final float baseWind;
	public final float gustiness;
	public final boolean vanillaRaining;
	public final boolean vanillaThundering;

	WeatherType(float cloudCover, float precipitation, float storm, float coldSnap, float fog, float baseWind, float gustiness,
			boolean vanillaRaining, boolean vanillaThundering) {
		this.cloudCover = cloudCover;
		this.precipitation = precipitation;
		this.storm = storm;
		this.coldSnap = coldSnap;
		this.fog = fog;
		this.baseWind = baseWind;
		this.gustiness = gustiness;
		this.vanillaRaining = vanillaRaining;
		this.vanillaThundering = vanillaThundering;
	}

	public String id() {
		return this.name().toLowerCase(Locale.ROOT);
	}

	public String translationKey() {
		return "realweather.weather." + this.id();
	}

	public boolean hasPrecipitation() {
		return this.precipitation > 0.0F;
	}

	public static WeatherType byOrdinal(int ordinal) {
		return ordinal >= 0 && ordinal < VALUES.length ? VALUES[ordinal] : CLEAR;
	}

	public static @Nullable WeatherType byId(String id) {
		for (WeatherType type : VALUES) {
			if (type.id().equals(id)) {
				return type;
			}
		}
		return null;
	}
}
