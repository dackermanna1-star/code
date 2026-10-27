package com.realweather.weather;

import com.realweather.config.RealWeatherConfig;
import java.util.function.ToDoubleFunction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;

/**
 * Local climate queries shared by the server simulation and the client renderer, so both sides agree on
 * where it rains, where it snows and how heavily.
 */
public final class Climate {
	/** Vanilla's rain/snow threshold. */
	public static final float SNOW_TEMPERATURE = 0.15F;
	/** Above the snow threshold but this cold, precipitation is rendered as a rain/snow mix. */
	public static final float SLEET_TEMPERATURE = 0.22F;

	public enum Precipitation {
		NONE,
		RAIN,
		SLEET,
		SNOW;

		public boolean isSnowy() {
			return this == SNOW || this == SLEET;
		}
	}

	private static volatile ToDoubleFunction<Level> clientColdSnap = level -> 0.0;
	private static volatile float clientColdSnapStrength = -1.0F;

	private Climate() {
	}

	/** Installed by the client so client-side levels use the synced cold snap. */
	public static void setClientColdSnapSource(ToDoubleFunction<Level> source) {
		clientColdSnap = source;
	}

	/** The server's cold snap strength, synced so clients compute exactly the same precipitation types. */
	public static void setClientColdSnapStrength(float strength) {
		clientColdSnapStrength = strength;
	}

	/** Current cold snap amount for a level (0 = none, 1 = full). */
	public static float coldSnapFor(Level level) {
		if (!level.canHaveWeather()) {
			return 0.0F;
		}
		if (level instanceof ServerLevel) {
			WeatherSimulator simulator = WeatherSimulator.get();
			return simulator != null ? simulator.state().coldSnap : 0.0F;
		}
		return (float) clientColdSnap.applyAsDouble(level);
	}

	/** Vanilla's height-adjusted biome temperature. */
	public static float biomeTemperature(Level level, Biome biome, BlockPos pos) {
		return biome.getTemperature(pos, level.getSeaLevel());
	}

	public static float coldSnapOffset(float coldSnap) {
		float strength = clientColdSnapStrength >= 0.0F && WeatherSimulator.get() == null ? clientColdSnapStrength : RealWeatherConfig.get().coldSnapStrength;
		return coldSnap * strength;
	}

	public static float effectiveTemperature(Level level, Biome biome, BlockPos pos, float coldSnap) {
		return biomeTemperature(level, biome, pos) - coldSnapOffset(coldSnap);
	}

	public static Precipitation precipitationAt(Level level, BlockPos pos, float coldSnap) {
		if (!level.getChunkSource().hasChunk(SectionPos.blockToSectionCoord(pos.getX()), SectionPos.blockToSectionCoord(pos.getZ()))) {
			return Precipitation.NONE;
		}
		return precipitationFor(level, level.getBiome(pos).value(), pos, coldSnap);
	}

	public static Precipitation precipitationFor(Level level, Biome biome, BlockPos pos, float coldSnap) {
		if (!biome.hasPrecipitation()) {
			return Precipitation.NONE;
		}
		float temperature = effectiveTemperature(level, biome, pos, coldSnap);
		if (temperature < SNOW_TEMPERATURE) {
			return Precipitation.SNOW;
		}
		return temperature < SLEET_TEMPERATURE ? Precipitation.SLEET : Precipitation.RAIN;
	}

	/** Biome humidity (vanilla "downfall"), 0 = arid, 1 = very wet. */
	public static float humidity(Biome biome) {
		return Mth.clamp(biome.climateSettings.downfall(), 0.0F, 1.0F);
	}

	/**
	 * Local precipitation strength multiplier: wetter biomes get heavier precipitation and rain bands follow
	 * the thickest parts of the moving cloud field.
	 */
	public static float localIntensity(Biome biome, double noiseX, double noiseZ, float cloudCover) {
		float humidity = humidity(biome);
		float cells = CloudNoise.coverageAt(noiseX, noiseZ, Math.max(cloudCover, 0.75F));
		return (0.62F + 0.5F * humidity) * (0.55F + 0.6F * cells);
	}

	/** Wind gets stronger with altitude and weaker in deep valleys and below sea level. */
	public static float windAltitudeFactor(double y, int seaLevel) {
		double above = y - seaLevel;
		if (above >= 0.0) {
			return (float) (1.0 + Math.min(above / 140.0, 1.3) * 0.75);
		}
		return (float) Math.max(0.35, 1.0 + above / 60.0);
	}
}
