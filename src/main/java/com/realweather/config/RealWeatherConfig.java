package com.realweather.config;

import com.realweather.weather.WeatherType;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Server-side (world simulation) settings, stored in {@code config/realweather-common.json}.
 * On a dedicated server this is the only config that matters for gameplay; clients keep their own visual config.
 */
public final class RealWeatherConfig {
	public static final String FILE = "realweather-common.json";

	private static RealWeatherConfig instance = new RealWeatherConfig();

	public String _comment = "RealWeather simulation settings. Durations are in seconds. See README for details.";

	/** Let the simulator move between weather types on its own (respects the vanilla advance_weather game rule). */
	public boolean dynamicWeather = true;
	/** Multiplier for how fast conditions blend between weather types (1 = natural, higher = faster). */
	public float transitionSpeed = 1.0F;
	/** Transition speed used right after an operator changes the weather with a command. */
	public float commandTransitionSpeed = 4.0F;
	/** Scales every automatically chosen weather duration. */
	public float durationMultiplier = 1.0F;
	/** Minimum/maximum duration (seconds) per weather type when chosen automatically. */
	public Map<String, int[]> durations = defaultDurations();
	/** Relative likelihood of each weather type being chosen next by the dynamic cycle. */
	public Map<String, Float> weights = defaultWeights();
	/** Whether the dynamic cycle may produce snow and blizzards outside cold biomes (rare cold snaps). */
	public boolean dynamicColdSnaps = true;
	/** How far a cold snap lowers biome temperature. 0.75 turns temperate biomes snowy while jungles get cold rain. */
	public float coldSnapStrength = 0.75F;

	/** Global multiplier on precipitation intensity. */
	public float intensityMultiplier = 1.0F;
	/** Global multiplier on wind speed. */
	public float windMultiplier = 1.0F;
	/** Highest wind speed (m/s) the simulator or commands may produce. */
	public float maxWindSpeed = 45.0F;

	/** Accumulate snow layers progressively while it snows. Vanilla's max_snow_accumulation_height=0 also disables it. */
	public boolean snowAccumulation = true;
	public int maxSnowLayers = 3;
	public int maxBlizzardSnowLayers = 6;
	public float snowAccumulationRate = 1.0F;
	/** Let snow bury short grass and ferns (they may grow back after the thaw). Flowers and crops are never covered. */
	public boolean snowCoversPlants = true;
	/** Melt snow that is exposed to the sky in biomes that are normally too warm for snow. */
	public boolean snowMelting = true;
	public float snowMeltRate = 1.0F;
	/** Freeze still water during cold snaps (disabled by default to protect farms). */
	public boolean freezeWaterInColdSnaps = false;
	/** Radius (blocks) around each player in which accumulation and melting are simulated. */
	public int accumulationRadius = 48;

	/** Extra lightning strikes during intense thunderstorms (vanilla strikes always happen). */
	public boolean extraLightning = true;
	/** Purely visual far-away lightning and in-cloud flashes, synchronized to all players. */
	public boolean distantLightning = true;
	public float lightningFrequency = 1.0F;

	/** How often (ticks) the full weather state is pushed to clients. Changes are pushed immediately regardless. */
	public int syncIntervalTicks = 20;

	public static RealWeatherConfig get() {
		return instance;
	}

	public static void load() {
		RealWeatherConfig loaded = ConfigIO.load(FILE, RealWeatherConfig.class, RealWeatherConfig::new);
		loaded.validate();
		instance = loaded;
		ConfigIO.save(FILE, loaded);
	}

	public static void save() {
		ConfigIO.save(FILE, instance);
	}

	public void validate() {
		this.transitionSpeed = ConfigIO.clamp(this.transitionSpeed, 0.05F, 50.0F, 1.0F);
		this.commandTransitionSpeed = ConfigIO.clamp(this.commandTransitionSpeed, 0.05F, 50.0F, 4.0F);
		this.durationMultiplier = ConfigIO.clamp(this.durationMultiplier, 0.05F, 100.0F, 1.0F);
		this.coldSnapStrength = ConfigIO.clamp(this.coldSnapStrength, 0.0F, 2.0F, 0.75F);
		this.intensityMultiplier = ConfigIO.clamp(this.intensityMultiplier, 0.0F, 3.0F, 1.0F);
		this.windMultiplier = ConfigIO.clamp(this.windMultiplier, 0.0F, 5.0F, 1.0F);
		this.maxWindSpeed = ConfigIO.clamp(this.maxWindSpeed, 1.0F, 120.0F, 45.0F);
		this.maxSnowLayers = ConfigIO.clamp(this.maxSnowLayers, 1, 8);
		this.maxBlizzardSnowLayers = ConfigIO.clamp(this.maxBlizzardSnowLayers, 1, 8);
		this.snowAccumulationRate = ConfigIO.clamp(this.snowAccumulationRate, 0.0F, 20.0F, 1.0F);
		this.snowMeltRate = ConfigIO.clamp(this.snowMeltRate, 0.0F, 20.0F, 1.0F);
		this.accumulationRadius = ConfigIO.clamp(this.accumulationRadius, 8, 160);
		this.lightningFrequency = ConfigIO.clamp(this.lightningFrequency, 0.0F, 10.0F, 1.0F);
		this.syncIntervalTicks = ConfigIO.clamp(this.syncIntervalTicks, 5, 200);

		Map<String, int[]> fixedDurations = defaultDurations();
		if (this.durations != null) {
			for (Map.Entry<String, int[]> entry : this.durations.entrySet()) {
				int[] range = entry.getValue();
				if (WeatherType.byId(entry.getKey()) != null && range != null && range.length == 2) {
					int min = Math.max(10, Math.min(range[0], range[1]));
					int max = Math.max(min, Math.max(range[0], range[1]));
					fixedDurations.put(entry.getKey(), new int[] {min, max});
				}
			}
		}
		this.durations = fixedDurations;

		Map<String, Float> fixedWeights = defaultWeights();
		if (this.weights != null) {
			for (Map.Entry<String, Float> entry : this.weights.entrySet()) {
				if (WeatherType.byId(entry.getKey()) != null && entry.getValue() != null) {
					fixedWeights.put(entry.getKey(), ConfigIO.clamp(entry.getValue(), 0.0F, 1000.0F, 1.0F));
				}
			}
		}
		this.weights = fixedWeights;
	}

	public int[] durationRange(WeatherType type) {
		int[] range = this.durations.get(type.id());
		return range != null ? range : new int[] {300, 600};
	}

	public float weight(WeatherType type) {
		Float weight = this.weights.get(type.id());
		return weight != null ? weight : 1.0F;
	}

	private static Map<String, int[]> defaultDurations() {
		EnumMap<WeatherType, int[]> map = new EnumMap<>(WeatherType.class);
		map.put(WeatherType.CLEAR, new int[] {600, 1500});
		map.put(WeatherType.OVERCAST, new int[] {300, 720});
		map.put(WeatherType.FOG, new int[] {180, 480});
		map.put(WeatherType.RAIN, new int[] {300, 720});
		map.put(WeatherType.THUNDER, new int[] {180, 480});
		map.put(WeatherType.SNOW, new int[] {360, 840});
		map.put(WeatherType.BLIZZARD, new int[] {180, 360});
		Map<String, int[]> out = new LinkedHashMap<>();
		map.forEach((type, range) -> out.put(type.id(), range));
		return out;
	}

	private static Map<String, Float> defaultWeights() {
		EnumMap<WeatherType, Float> map = new EnumMap<>(WeatherType.class);
		map.put(WeatherType.CLEAR, 40.0F);
		map.put(WeatherType.OVERCAST, 24.0F);
		map.put(WeatherType.FOG, 6.0F);
		map.put(WeatherType.RAIN, 20.0F);
		map.put(WeatherType.THUNDER, 7.0F);
		map.put(WeatherType.SNOW, 2.5F);
		map.put(WeatherType.BLIZZARD, 0.8F);
		Map<String, Float> out = new LinkedHashMap<>();
		map.forEach((type, weight) -> out.put(type.id(), weight));
		return out;
	}
}
