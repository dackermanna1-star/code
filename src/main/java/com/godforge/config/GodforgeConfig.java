package com.godforge.config;

import com.godforge.Godforge;
import com.godforge.weapon.WeaponType;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

/**
 * Server-side (authoritative) configuration, stored in {@code config/godforge.json}.
 * Every value is clamped by {@link #sanitize()} so a hand-edited file can never push the server past safe limits.
 */
public final class GodforgeConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static volatile GodforgeConfig instance = new GodforgeConfig();

	public General general = new General();
	public Performance performance = new Performance();
	public Permissions permissions = new Permissions();
	public Map<String, WeaponTuning> weapons = defaultWeapons();

	public static GodforgeConfig get() {
		return instance;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(Godforge.MOD_ID + ".json");
	}

	public static synchronized void load() {
		Path path = path();
		GodforgeConfig loaded = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				loaded = GSON.fromJson(reader, GodforgeConfig.class);
			} catch (IOException | JsonParseException e) {
				Godforge.LOGGER.error("Failed to read {}, using defaults (the broken file is left untouched)", path, e);
				instance = new GodforgeConfig().sanitize();
				return;
			}
		}
		if (loaded == null) {
			loaded = new GodforgeConfig();
		}
		instance = loaded.sanitize();
		save();
	}

	public static synchronized void save() {
		try {
			Files.createDirectories(path().getParent());
			try (Writer writer = Files.newBufferedWriter(path())) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			Godforge.LOGGER.error("Failed to write {}", path(), e);
		}
	}

	public WeaponTuning tuning(WeaponType type) {
		WeaponTuning tuning = this.weapons.get(type.id());
		return tuning != null ? tuning : WeaponTuning.defaults(type);
	}

	private GodforgeConfig sanitize() {
		if (this.general == null) this.general = new General();
		if (this.performance == null) this.performance = new Performance();
		if (this.permissions == null) this.permissions = new Permissions();
		if (this.weapons == null) this.weapons = defaultWeapons();
		this.general.sanitize();
		this.performance.sanitize();
		this.permissions.sanitize();
		Map<String, WeaponTuning> fixed = new LinkedHashMap<>();
		for (WeaponType type : WeaponType.values()) {
			WeaponTuning tuning = this.weapons.get(type.id());
			if (tuning == null) {
				tuning = WeaponTuning.defaults(type);
			}
			tuning.sanitize(type);
			fixed.put(type.id(), tuning);
		}
		this.weapons = fixed;
		return this;
	}

	private static Map<String, WeaponTuning> defaultWeapons() {
		Map<String, WeaponTuning> map = new LinkedHashMap<>();
		for (WeaponType type : WeaponType.values()) {
			map.put(type.id(), WeaponTuning.defaults(type));
		}
		return map;
	}

	public static final class General {
		/** Master switch for every block-changing effect. Entities are still damaged when false. */
		public boolean terrainDestruction = true;
		/** Skip destruction inside spawn protection / outside the world border (vanilla rules). */
		public boolean respectSpawnProtection = true;
		/** When true, terrain destruction follows the mobGriefing game rule. */
		public boolean followMobGriefingRule = false;
		/** When false, blocks with block entities (chests, furnaces, spawners...) are never touched. */
		public boolean destroyBlockEntities = true;
		/** Whether abilities may start fires. */
		public boolean startFires = true;
		/** Whether flying debris re-lands as blocks (false = debris shatters into particles). */
		public boolean debrisPlacesBlocks = true;
		/** Lets the wielder be hurt by their own attacks. */
		public boolean damageOwner = false;
		/** Creative-mode players ignore every cooldown. */
		public boolean creativeBypassCooldowns = true;
		/** Global multipliers. */
		public double destructionScale = 1.0;
		public double damageScale = 1.0;
		/** Extra multiplier for damage dealt to other players (pvp game rule is always respected). */
		public double playerDamageScale = 1.0;

		void sanitize() {
			this.destructionScale = Mth.clamp(this.destructionScale, 0.1, 3.0);
			this.damageScale = Mth.clamp(this.damageScale, 0.0, 100.0);
			this.playerDamageScale = Mth.clamp(this.playerDamageScale, 0.0, 10.0);
		}
	}

	public static final class Performance {
		/** Hard cap of block changes applied per server tick across all running effects. */
		public int maxBlockChangesPerTick = 12000;
		/** Time budget (milliseconds per tick) for applying block changes. */
		public int maxMillisPerTick = 16;
		/** Maximum number of concurrently running destruction jobs; extra requests are rejected. */
		public int maxActiveJobs = 96;
		/** Maximum number of blocks a single job may affect (bigger shapes are clipped). */
		public int maxBlocksPerJob = 2_500_000;
		/** Maximum flying debris entities alive at once (per server). */
		public int maxDebrisEntities = 280;
		/** Maximum debris spawned by a single impact. */
		public int maxDebrisPerEvent = 60;
		/** Maximum fracture chunks (Reality Breaker) alive at once. */
		public int maxFractureChunks = 160;
		/** Maximum black holes / artificial suns / orbital barrages active per server. */
		public int maxSingularities = 4;
		public int maxArtificialSuns = 2;
		public int maxOrbitalBarrages = 3;
		/** Radius (blocks) in which players receive visual/audio effect packets. */
		public int effectRange = 320;

		void sanitize() {
			this.maxBlockChangesPerTick = Mth.clamp(this.maxBlockChangesPerTick, 100, 200_000);
			this.maxMillisPerTick = Mth.clamp(this.maxMillisPerTick, 1, 45);
			this.maxActiveJobs = Mth.clamp(this.maxActiveJobs, 1, 1000);
			this.maxBlocksPerJob = Mth.clamp(this.maxBlocksPerJob, 1000, 20_000_000);
			this.maxDebrisEntities = Mth.clamp(this.maxDebrisEntities, 0, 2000);
			this.maxDebrisPerEvent = Mth.clamp(this.maxDebrisPerEvent, 0, 400);
			this.maxFractureChunks = Mth.clamp(this.maxFractureChunks, 0, 1000);
			this.maxSingularities = Mth.clamp(this.maxSingularities, 0, 64);
			this.maxArtificialSuns = Mth.clamp(this.maxArtificialSuns, 0, 16);
			this.maxOrbitalBarrages = Mth.clamp(this.maxOrbitalBarrages, 0, 16);
			this.effectRange = Mth.clamp(this.effectRange, 32, 1024);
		}
	}

	public static final class Permissions {
		/** Permission level (0-4) needed to use any weapon ability. 0 = everyone. */
		public int useLevel = 0;
		/** Permission level (0-4) needed to unleash ultimate abilities. */
		public int ultimateLevel = 0;
		/** Permission level (0-4) needed for /godforge admin sub-commands. */
		public int adminLevel = 2;
		/** Per-weapon kill switch. */
		public Map<String, Boolean> enabled = defaultEnabled();

		private static Map<String, Boolean> defaultEnabled() {
			Map<String, Boolean> map = new LinkedHashMap<>();
			for (WeaponType type : WeaponType.values()) {
				map.put(type.id(), true);
			}
			return map;
		}

		public boolean isEnabled(WeaponType type) {
			return this.enabled.getOrDefault(type.id(), true);
		}

		void sanitize() {
			this.useLevel = Mth.clamp(this.useLevel, 0, 4);
			this.ultimateLevel = Mth.clamp(this.ultimateLevel, 0, 4);
			this.adminLevel = Mth.clamp(this.adminLevel, 0, 4);
			if (this.enabled == null) {
				this.enabled = defaultEnabled();
			}
			for (WeaponType type : WeaponType.values()) {
				this.enabled.putIfAbsent(type.id(), true);
			}
		}
	}

	/** Numbers every weapon shares; weapon-specific limits live in {@link #extra}. */
	public static final class WeaponTuning {
		public double damage;
		public int cooldownTicks;
		public int ultimateCooldownTicks;
		public double sizeScale = 1.0;
		public Map<String, Double> extra = new LinkedHashMap<>();

		public double extra(String key, double fallback) {
			Double value = this.extra.get(key);
			return value != null ? value : fallback;
		}

		static WeaponTuning defaults(WeaponType type) {
			WeaponTuning t = new WeaponTuning();
			EnumMap<WeaponType, double[]> base = new EnumMap<>(WeaponType.class);
			// damage, cooldown, ultimate cooldown
			base.put(WeaponType.WORLDCUTTER, new double[]{30, 14, 600});
			base.put(WeaponType.LASER_BEAM, new double[]{9, 10, 500});
			base.put(WeaponType.ORB_ERASER, new double[]{60, 30, 500});
			base.put(WeaponType.ASTEROID_GUN, new double[]{60, 60, 900});
			base.put(WeaponType.BLACK_HOLE, new double[]{8, 100, 1200});
			base.put(WeaponType.REALITY_BREAKER, new double[]{26, 50, 900});
			base.put(WeaponType.STARFALL_BOW, new double[]{22, 6, 900});
			base.put(WeaponType.GODFIST, new double[]{24, 24, 600});
			base.put(WeaponType.SUNFORGE, new double[]{20, 10, 1200});
			base.put(WeaponType.PLANET_CRACKER, new double[]{70, 70, 1200});
			double[] v = base.get(type);
			t.damage = v[0];
			t.cooldownTicks = (int) v[1];
			t.ultimateCooldownTicks = (int) v[2];
			switch (type) {
				case WORLDCUTTER -> {
					t.extra.put("cutLength", 256.0);
					t.extra.put("cutGap", 24.0);
					t.extra.put("cutDepth", 96.0);
					t.extra.put("meleeBonus", 20.0);
				}
				case LASER_BEAM -> {
					t.extra.put("maxRange", 512.0);
					t.extra.put("maxWidth", 6.0);
					t.extra.put("maxBlocksPerTick", 900.0);
				}
				case ORB_ERASER -> {
					t.extra.put("maxRadius", 9.0);
					t.extra.put("maxSpeed", 100.0);
					t.extra.put("maxRange", 640.0);
				}
				case ASTEROID_GUN -> {
					t.extra.put("maxCraterRadius", 16.0);
					t.extra.put("ultimateCraterRadius", 34.0);
					t.extra.put("targetRange", 384.0);
				}
				case BLACK_HOLE -> {
					t.extra.put("lifetimeTicks", 240.0);
					t.extra.put("pullRadius", 26.0);
					t.extra.put("ultimatePullRadius", 64.0);
				}
				case REALITY_BREAKER -> {
					t.extra.put("fractureRadius", 11.0);
					t.extra.put("collapseNodes", 16.0);
				}
				case STARFALL_BOW -> {
					t.extra.put("showerStars", 28.0);
					t.extra.put("judgmentRadius", 30.0);
				}
				case GODFIST -> {
					t.extra.put("launchPower", 5.5);
					t.extra.put("shockwaveRadius", 18.0);
					t.extra.put("slamRadius", 26.0);
				}
				case SUNFORGE -> {
					t.extra.put("maxOrbiters", 6.0);
					t.extra.put("coreRadius", 9.0);
					t.extra.put("sunRadius", 42.0);
				}
				case PLANET_CRACKER -> {
					t.extra.put("craterRadius", 14.0);
					t.extra.put("barrageRadius", 52.0);
					t.extra.put("barrageStrikes", 44.0);
				}
			}
			return t;
		}

		void sanitize(WeaponType type) {
			WeaponTuning d = defaults(type);
			if (this.extra == null) {
				this.extra = new LinkedHashMap<>();
			}
			for (Map.Entry<String, Double> e : d.extra.entrySet()) {
				this.extra.putIfAbsent(e.getKey(), e.getValue());
				double value = this.extra.get(e.getKey());
				if (!Double.isFinite(value)) {
					value = e.getValue();
				}
				// never allow more than 4x the default for any size-like limit
				this.extra.put(e.getKey(), Mth.clamp(value, 0.0, e.getValue() * 4.0));
			}
			this.damage = Mth.clamp(this.damage, 0.0, 100000.0);
			this.cooldownTicks = Mth.clamp(this.cooldownTicks, 0, 20 * 600);
			this.ultimateCooldownTicks = Mth.clamp(this.ultimateCooldownTicks, 0, 20 * 3600);
			this.sizeScale = Mth.clamp(this.sizeScale, 0.1, 3.0);
		}
	}
}
