package com.realweather.weather;

import net.minecraft.nbt.CompoundTag;

/**
 * Complete simulation state of the atmosphere. The server owns the authoritative copy (persisted with the world);
 * clients receive snapshots and interpolate between them.
 */
public final class WeatherState {
	/** Current regime the atmosphere is moving towards. */
	public WeatherType type = WeatherType.CLEAR;
	/** Ticks left in the current regime. Counts down only while weather is advancing. */
	public int remainingTicks = 12000;
	/** Whether the world chooses new regimes on its own. */
	public boolean dynamic = true;
	/** Strength of the current regime in [0, 1], randomized per weather event unless overridden. */
	public float intensity = 0.6F;
	/** Operator override for {@link #intensity}; negative when unset. */
	public float intensityOverride = -1.0F;
	/** Operator override for wind speed in m/s; negative when unset. */
	public float windOverride = -1.0F;
	/** Operator override for wind direction in degrees (0 = north, 90 = east); NaN when unset. */
	public float windDirectionOverride = Float.NaN;

	/** Where the wind is heading in the long run (speed in m/s, direction in radians). */
	public float windTargetSpeed = 3.0F;
	public float windTargetDirection = 0.0F;

	// Smoothed, physically blended parameters.
	public float cloudCover = WeatherType.CLEAR.cloudCover;
	public float precipitation;
	public float storm;
	public float coldSnap;
	public float fog;
	public float windSpeed = 3.0F;
	/** Direction the wind blows towards, radians, 0 = +Z (south), increasing towards +X... see {@link #windX()}. */
	public float windDirection;
	public float gustiness = WeatherType.CLEAR.gustiness;

	/** Seed for gusts and other deterministic noise. */
	public long seed;
	/** Monotonic simulation clock in ticks; drives deterministic gusts on every side. */
	public long simTicks;
	/** Accumulated wind drift of the cloud field, in blocks. */
	public double cloudOffsetX;
	public double cloudOffsetZ;
	/** Transition speed multiplier currently in effect (boosted briefly after commands). */
	public float transitionBoost = 1.0F;

	public float effectiveIntensity() {
		return this.intensityOverride >= 0.0F ? this.intensityOverride : this.intensity;
	}

	/** Unit vector X component of the wind's travel direction. */
	public float windX() {
		return (float) -Math.sin(this.windDirection);
	}

	/** Unit vector Z component of the wind's travel direction. */
	public float windZ() {
		return (float) Math.cos(this.windDirection);
	}

	/**
	 * Gust factor in roughly [0.55, 1.9] at a given time; deterministic so every client computes the same gusts.
	 */
	public static float gustFactor(long seed, double ticks, float gustiness) {
		double t = ticks / 20.0;
		int s = (int) (seed ^ (seed >>> 32));
		double slow = smoothNoise1D(t / 11.0, s);
		double fast = smoothNoise1D(t / 2.7, s + 77);
		double burst = Math.max(0.0, smoothNoise1D(t / 5.3, s + 131) - 0.55) * 2.2;
		double g = (slow - 0.5) * 0.7 + (fast - 0.5) * 0.45 + burst;
		return (float) Math.max(0.45, 1.0 + g * gustiness * 1.6);
	}

	/** Small wobble of the wind direction (radians) that accompanies gusts. */
	public static float gustVeer(long seed, double ticks, float gustiness) {
		double t = ticks / 20.0;
		int s = (int) (seed ^ (seed >>> 32)) + 991;
		return (float) ((smoothNoise1D(t / 7.0, s) - 0.5) * 0.6 * (0.4 + gustiness));
	}

	private static double smoothNoise1D(double x, int seed) {
		double fl = Math.floor(x);
		int i = (int) fl;
		double f = x - fl;
		double u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
		double a = (CloudNoise.hash(i, 0, seed) & 0xFFFFFF) / 16777216.0;
		double b = (CloudNoise.hash(i + 1, 0, seed) & 0xFFFFFF) / 16777216.0;
		return a + (b - a) * u;
	}

	public void copyFrom(WeatherState other) {
		this.type = other.type;
		this.remainingTicks = other.remainingTicks;
		this.dynamic = other.dynamic;
		this.intensity = other.intensity;
		this.intensityOverride = other.intensityOverride;
		this.windOverride = other.windOverride;
		this.windDirectionOverride = other.windDirectionOverride;
		this.windTargetSpeed = other.windTargetSpeed;
		this.windTargetDirection = other.windTargetDirection;
		this.cloudCover = other.cloudCover;
		this.precipitation = other.precipitation;
		this.storm = other.storm;
		this.coldSnap = other.coldSnap;
		this.fog = other.fog;
		this.windSpeed = other.windSpeed;
		this.windDirection = other.windDirection;
		this.gustiness = other.gustiness;
		this.seed = other.seed;
		this.simTicks = other.simTicks;
		this.cloudOffsetX = other.cloudOffsetX;
		this.cloudOffsetZ = other.cloudOffsetZ;
		this.transitionBoost = other.transitionBoost;
	}

	public CompoundTag save(CompoundTag tag) {
		tag.putString("type", this.type.id());
		tag.putInt("remaining", this.remainingTicks);
		tag.putBoolean("dynamic", this.dynamic);
		tag.putFloat("intensity", this.intensity);
		tag.putFloat("intensityOverride", this.intensityOverride);
		tag.putFloat("windOverride", this.windOverride);
		tag.putFloat("windDirectionOverride", this.windDirectionOverride);
		tag.putFloat("windTargetSpeed", this.windTargetSpeed);
		tag.putFloat("windTargetDirection", this.windTargetDirection);
		tag.putFloat("cloudCover", this.cloudCover);
		tag.putFloat("precipitation", this.precipitation);
		tag.putFloat("storm", this.storm);
		tag.putFloat("coldSnap", this.coldSnap);
		tag.putFloat("fog", this.fog);
		tag.putFloat("windSpeed", this.windSpeed);
		tag.putFloat("windDirection", this.windDirection);
		tag.putFloat("gustiness", this.gustiness);
		tag.putLong("seed", this.seed);
		tag.putLong("simTicks", this.simTicks);
		tag.putDouble("cloudOffsetX", this.cloudOffsetX);
		tag.putDouble("cloudOffsetZ", this.cloudOffsetZ);
		return tag;
	}

	public void load(CompoundTag tag) {
		WeatherType loaded = WeatherType.byId(tag.getStringOr("type", "clear"));
		this.type = loaded != null ? loaded : WeatherType.CLEAR;
		this.remainingTicks = Math.max(0, tag.getIntOr("remaining", 12000));
		this.dynamic = tag.getBooleanOr("dynamic", true);
		this.intensity = finite(tag.getFloatOr("intensity", 0.6F), 0.6F);
		this.intensityOverride = finite(tag.getFloatOr("intensityOverride", -1.0F), -1.0F);
		this.windOverride = finite(tag.getFloatOr("windOverride", -1.0F), -1.0F);
		this.windDirectionOverride = tag.getFloatOr("windDirectionOverride", Float.NaN);
		this.windTargetSpeed = finite(tag.getFloatOr("windTargetSpeed", 3.0F), 3.0F);
		this.windTargetDirection = finite(tag.getFloatOr("windTargetDirection", 0.0F), 0.0F);
		this.cloudCover = finite(tag.getFloatOr("cloudCover", this.type.cloudCover), this.type.cloudCover);
		this.precipitation = finite(tag.getFloatOr("precipitation", 0.0F), 0.0F);
		this.storm = finite(tag.getFloatOr("storm", 0.0F), 0.0F);
		this.coldSnap = finite(tag.getFloatOr("coldSnap", 0.0F), 0.0F);
		this.fog = finite(tag.getFloatOr("fog", 0.0F), 0.0F);
		this.windSpeed = finite(tag.getFloatOr("windSpeed", 3.0F), 3.0F);
		this.windDirection = finite(tag.getFloatOr("windDirection", 0.0F), 0.0F);
		this.gustiness = finite(tag.getFloatOr("gustiness", this.type.gustiness), this.type.gustiness);
		this.seed = tag.getLongOr("seed", 0L);
		this.simTicks = Math.max(0L, tag.getLongOr("simTicks", 0L));
		this.cloudOffsetX = CloudNoise.wrap(tag.getDoubleOr("cloudOffsetX", 0.0));
		this.cloudOffsetZ = CloudNoise.wrap(tag.getDoubleOr("cloudOffsetZ", 0.0));
	}

	private static float finite(float value, float fallback) {
		return Float.isFinite(value) ? value : fallback;
	}
}
