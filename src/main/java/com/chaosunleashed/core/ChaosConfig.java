package com.chaosunleashed.core;

import com.chaosunleashed.ChaosUnleashed;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.math.MathHelper;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Server-side configuration, stored as JSON in {@code config/chaosunleashed.json}.
 * <p>
 * The config only provides <em>defaults</em> for the on/off toggles: once a world has been created the
 * toggles live in that world's saved data ({@link ChaosWorldData}) and are changed with {@code /chaos} or the
 * Chaos Control Panel. Everything else (frequency, intensity, block damage, radius, performance limits...)
 * is read from this file. Use {@code /chaos reload} to re-read it without restarting.
 */
public final class ChaosConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static ChaosConfig instance = new ChaosConfig();

	/** Per-event settings. */
	public static final class EventSettings {
		/** Whether the event is ON for random triggering in newly created worlds. */
		public boolean enabledByDefault = true;
		/** Probability (0-1) that this event starts on each random check (if it is eligible). */
		public double chance = 0.04;
		/** Warning phase length in seconds (clamped to 10-30). */
		public int warningSeconds = 20;
		/** Active phase length in seconds. Some events end early (all UFOs destroyed, sunrise...). */
		public int durationSeconds = 180;
		/** Aftermath phase length in seconds. */
		public int aftermathSeconds = 10;
		/** Intensity (1-5) used when an event is started without an explicit intensity. */
		public int defaultIntensity = 3;

		public EventSettings() {
		}

		EventSettings(double chance, int warning, int duration, int aftermath) {
			this.chance = chance;
			this.warningSeconds = warning;
			this.durationSeconds = duration;
			this.aftermathSeconds = aftermath;
		}
	}

	// ---------------------------------------------------------------- random scheduling
	/** Default for the master "random events" switch in new worlds. */
	public boolean randomEventsEnabledByDefault = true;
	/** How often (seconds) the scheduler rolls for a random event. */
	public int randomCheckIntervalSeconds = 30;
	/** Minimum time (seconds) between the end of one event and the start of the next random event. */
	public int minCooldownSeconds = 900;
	/** Random events only happen once the world has reached this day (0 = from the start). */
	public int minWorldDay = 1;
	/** Multiplies every event's chance. 2.0 = twice as frequent, 0.5 = half as frequent. */
	public double frequencyMultiplier = 1.0;
	/** Maximum number of events running at the same time (manual starts are refused beyond this). */
	public int maxConcurrentEvents = 1;
	/** Intensity range used for randomly triggered events. */
	public int randomIntensityMin = 1;
	public int randomIntensityMax = 4;

	// ---------------------------------------------------------------- world impact & performance
	/** Master switch for any terrain destruction/conversion done by events (craters, rift conversion...). */
	public boolean blockDamage = true;
	/** Hard limit on how far from its origin an event may affect the world. */
	public int maxRadius = 64;
	/** Maximum number of block changes performed per tick across all events. */
	public int maxBlockChangesPerTick = 48;
	/** Maximum number of entities a single event may have alive at once. */
	public int maxEntitiesPerEvent = 150;

	// ---------------------------------------------------------------- permissions
	/** Permission level needed for /chaos commands that change anything (list/menu are visible to all). */
	public int commandPermissionLevel = 2;
	/** If true, every player may change settings through the Chaos Control Panel block. */
	public boolean allowAllPlayersUseControlPanel = false;
	/** Recipe for the Chaos Control Panel: "diamond", "nether_star" or "disabled". */
	public String controlPanelRecipe = "diamond";

	// ---------------------------------------------------------------- event specific
	/**
	 * What to do when a day-only (Solar Flare, Eclipse) or night-only (Blood Moon) event is started manually at
	 * the wrong time: "skip" fast-forwards time during the warning, "wait" holds the warning until the right time.
	 */
	public String timeOfDayHandling = "skip";
	/** Solar Flare: crops dry out and grass turns to dirt in exposed areas (also needs blockDamage). */
	public boolean solarFlareScorchesTerrain = true;
	/** Solar Flare: redstone signals are forced to 0 (except the Chaos Control Panel output). */
	public boolean solarFlareDisablesRedstone = true;
	/** Dimension Rift: converted terrain reverts to its original blocks once the rift closes. */
	public boolean riftRevertTerrain = false;
	/** Black Hole: hard cap on the radius of the black core (pull radius is 6x this). */
	public double blackHoleMaxCoreRadius = 5.0;
	/** Black Hole: seconds between growth steps. */
	public int blackHoleGrowthIntervalSeconds = 12;
	/** Black Hole: number of beacon blocks within 20 blocks needed to stabilize it. */
	public int blackHoleBeaconsRequired = 4;
	/** Herd Stampede: hard cap on herd size (also limited by maxEntitiesPerEvent). */
	public int stampedeMaxAnimals = 200;
	/** Blood Moon: zombies spawned per player per spawn wave at intensity 3. */
	public int bloodMoonZombiesPerWave = 4;
	/** Kaiju: maximum health (vanilla caps entity health at 1024). */
	public double kaijuHealth = 1024.0;

	// ---------------------------------------------------------------- per event
	public Map<String, EventSettings> events = defaultEvents();

	private static Map<String, EventSettings> defaultEvents() {
		Map<String, EventSettings> map = new LinkedHashMap<>();
		map.put("alien_invasion", new EventSettings(0.03, 20, 240, 15));
		map.put("blood_moon", new EventSettings(0.06, 20, 600, 30));
		map.put("kaiju_attack", new EventSettings(0.02, 25, 240, 15));
		map.put("black_hole", new EventSettings(0.03, 15, 180, 10));
		map.put("solar_flare", new EventSettings(0.04, 15, 120, 10));
		map.put("gravity_flip", new EventSettings(0.04, 15, 60, 8));
		map.put("eclipse", new EventSettings(0.04, 20, 240, 20));
		map.put("dimension_rift", new EventSettings(0.03, 20, 180, 15));
		map.put("herd_stampede", new EventSettings(0.04, 20, 90, 10));
		return map;
	}

	public static ChaosConfig get() {
		return instance;
	}

	public EventSettings event(ChaosEventType type) {
		return this.events.computeIfAbsent(type.id(), id -> {
			EventSettings settings = defaultEvents().get(id);
			return settings != null ? settings : new EventSettings();
		});
	}

	public boolean skipTimeForManualStart() {
		return !"wait".equals(this.timeOfDayHandling.toLowerCase(Locale.ROOT));
	}

	private void validate() {
		this.randomCheckIntervalSeconds = Math.max(1, this.randomCheckIntervalSeconds);
		this.minCooldownSeconds = Math.max(0, this.minCooldownSeconds);
		this.minWorldDay = Math.max(0, this.minWorldDay);
		this.frequencyMultiplier = Math.max(0.0, this.frequencyMultiplier);
		this.maxConcurrentEvents = MathHelper.clamp(this.maxConcurrentEvents, 1, ChaosEventType.values().length);
		this.randomIntensityMin = MathHelper.clamp(this.randomIntensityMin, 1, 5);
		this.randomIntensityMax = MathHelper.clamp(this.randomIntensityMax, this.randomIntensityMin, 5);
		this.maxRadius = MathHelper.clamp(this.maxRadius, 8, 256);
		this.maxBlockChangesPerTick = MathHelper.clamp(this.maxBlockChangesPerTick, 1, 4096);
		this.maxEntitiesPerEvent = MathHelper.clamp(this.maxEntitiesPerEvent, 4, 2000);
		this.commandPermissionLevel = MathHelper.clamp(this.commandPermissionLevel, 0, 4);
		if (this.controlPanelRecipe == null) {
			this.controlPanelRecipe = "diamond";
		}
		if (this.timeOfDayHandling == null) {
			this.timeOfDayHandling = "skip";
		}
		this.blackHoleMaxCoreRadius = MathHelper.clamp(this.blackHoleMaxCoreRadius, 1.0, 12.0);
		this.blackHoleGrowthIntervalSeconds = Math.max(1, this.blackHoleGrowthIntervalSeconds);
		this.blackHoleBeaconsRequired = MathHelper.clamp(this.blackHoleBeaconsRequired, 1, 16);
		this.stampedeMaxAnimals = MathHelper.clamp(this.stampedeMaxAnimals, 10, 1000);
		this.bloodMoonZombiesPerWave = MathHelper.clamp(this.bloodMoonZombiesPerWave, 1, 32);
		this.kaijuHealth = MathHelper.clamp(this.kaijuHealth, 50.0, 1024.0);
		if (this.events == null) {
			this.events = defaultEvents();
		}
		for (ChaosEventType type : ChaosEventType.values()) {
			EventSettings settings = this.event(type);
			settings.chance = MathHelper.clamp(settings.chance, 0.0, 1.0);
			settings.warningSeconds = MathHelper.clamp(settings.warningSeconds, 10, 30);
			settings.durationSeconds = MathHelper.clamp(settings.durationSeconds, 10, 3600);
			settings.aftermathSeconds = MathHelper.clamp(settings.aftermathSeconds, 1, 300);
			settings.defaultIntensity = MathHelper.clamp(settings.defaultIntensity, 1, 5);
		}
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(ChaosUnleashed.MOD_ID + ".json");
	}

	/** Loads the config from disk (creating it with defaults if missing) and writes it back with any new keys. */
	public static synchronized ChaosConfig load() {
		Path path = path();
		ChaosConfig loaded = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
				loaded = GSON.fromJson(reader, ChaosConfig.class);
			} catch (IOException | JsonParseException e) {
				ChaosUnleashed.LOGGER.error("Failed to read {}, using defaults", path, e);
			}
		}
		if (loaded == null) {
			loaded = new ChaosConfig();
		}
		loaded.validate();
		instance = loaded;
		save();
		return loaded;
	}

	public static synchronized void save() {
		Path path = path();
		try {
			Files.createDirectories(path.getParent());
			try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			ChaosUnleashed.LOGGER.error("Failed to write {}", path, e);
		}
	}
}
