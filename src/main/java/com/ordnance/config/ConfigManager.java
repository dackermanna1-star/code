package com.ordnance.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.ordnance.Ordnance;
import com.ordnance.explosion.ExplosionProfile;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.math.MathHelper;

/** Loads, validates and saves {@link OrdnanceConfig}. Missing keys are filled with defaults and written back. */
public final class ConfigManager {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static final String FILE_NAME = "ordnance.json";
	private static volatile OrdnanceConfig config = createDefault();

	private ConfigManager() {
	}

	public static OrdnanceConfig get() {
		return config;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(FILE_NAME);
	}

	/** Loads the config from disk, creating it when absent. Returns false if the file could not be parsed. */
	public static boolean load() {
		Path path = path();
		OrdnanceConfig loaded = null;
		boolean ok = true;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
				loaded = GSON.fromJson(reader, OrdnanceConfig.class);
			} catch (IOException | JsonParseException e) {
				Ordnance.LOGGER.error("Could not read {}, using defaults: {}", path, e.getMessage());
				ok = false;
			}
		}

		if (loaded == null) {
			loaded = createDefault();
		}

		fillDefaults(loaded);
		validate(loaded);
		config = loaded;
		if (ok) {
			save();
		}

		return ok;
	}

	public static void save() {
		Path path = path();
		try {
			Files.createDirectories(path.getParent());
			try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
				GSON.toJson(config, writer);
			}
		} catch (IOException e) {
			Ordnance.LOGGER.error("Could not write {}: {}", path, e.getMessage());
		}
	}

	private static OrdnanceConfig createDefault() {
		OrdnanceConfig cfg = new OrdnanceConfig();
		fillDefaults(cfg);
		return cfg;
	}

	/** Gson leaves fields absent from the file at their initializer values; nested objects may still be null. */
	private static void fillDefaults(OrdnanceConfig cfg) {
		if (cfg.general == null) cfg.general = new OrdnanceConfig.General();
		if (cfg.explosions == null) cfg.explosions = new OrdnanceConfig.Explosions();
		if (cfg.fire == null) cfg.fire = new OrdnanceConfig.Fire();
		if (cfg.visuals == null) cfg.visuals = new OrdnanceConfig.Visuals();
		if (cfg.weapons == null) cfg.weapons = new OrdnanceConfig.Weapons();
		OrdnanceConfig.Weapons w = cfg.weapons;
		if (w.grenades == null) w.grenades = new OrdnanceConfig.Grenades();
		if (w.rpg7 == null) w.rpg7 = new OrdnanceConfig.Rpg();
		if (w.grenadeLauncher == null) w.grenadeLauncher = new OrdnanceConfig.GrenadeLauncher();
		if (w.flamethrower == null) w.flamethrower = new OrdnanceConfig.Flamethrower();
		if (w.missileStrike == null) w.missileStrike = new OrdnanceConfig.MissileStrike();
		if (cfg.warheads == null) cfg.warheads = new java.util.LinkedHashMap<>();
		for (ExplosionProfile profile : ExplosionProfile.values()) {
			if (profile.isConfigurable()) {
				cfg.warheads.computeIfAbsent(profile.key(), k -> profile.defaults());
			}
		}
	}

	private static void validate(OrdnanceConfig cfg) {
		OrdnanceConfig.Explosions e = cfg.explosions;
		e.blockDamageMultiplier = clamp(e.blockDamageMultiplier, 0.0F, 4.0F);
		e.entityDamageMultiplier = clamp(e.entityDamageMultiplier, 0.0F, 10.0F);
		e.blastRadiusMultiplier = clamp(e.blastRadiusMultiplier, 0.1F, 4.0F);
		e.knockbackMultiplier = clamp(e.knockbackMultiplier, 0.0F, 5.0F);
		e.debrisMultiplier = clamp(e.debrisMultiplier, 0.0F, 4.0F);
		e.maxDebrisPerExplosion = MathHelper.clamp(e.maxDebrisPerExplosion, 0, 256);
		e.maxActiveDebris = MathHelper.clamp(e.maxActiveDebris, 0, 2000);
		e.rubbleChance = clamp(e.rubbleChance, 0.0F, 1.0F);
		e.blastWaveSpeed = clamp(e.blastWaveSpeed, 0.5F, 64.0F);
		e.maxBlocksPerExplosion = MathHelper.clamp(e.maxBlocksPerExplosion, 0, 100000);

		OrdnanceConfig.Fire f = cfg.fire;
		f.spreadSpeedMultiplier = clamp(f.spreadSpeedMultiplier, 0.1F, 8.0F);
		f.charChance = clamp(f.charChance, 0.0F, 1.0F);
		f.ashChance = clamp(f.ashChance, 0.0F, 1.0F);
		f.emberJumpChance = clamp(f.emberJumpChance, 0.0F, 1.0F);
		f.emberJumpRange = MathHelper.clamp(f.emberJumpRange, 1, 16);
		f.burningFuelTicks = MathHelper.clamp(f.burningFuelTicks, 20, 6000);

		OrdnanceConfig.Visuals v = cfg.visuals;
		v.particleMultiplier = clamp(v.particleMultiplier, 0.0F, 3.0F);
		v.maxActiveParticles = MathHelper.clamp(v.maxActiveParticles, 256, 14000);
		v.lodDistance = clamp(v.lodDistance, 8.0F, 512.0F);
		v.screenShake = clamp(v.screenShake, 0.0F, 3.0F);
		v.heatDistortionStrength = clamp(v.heatDistortionStrength, 0.0F, 2.0F);
		v.lingeringSmokeMultiplier = clamp(v.lingeringSmokeMultiplier, 0.0F, 4.0F);
		v.recoil = clamp(v.recoil, 0.0F, 3.0F);

		OrdnanceConfig.Weapons w = cfg.weapons;
		w.grenades.fuseTicks = MathHelper.clamp(w.grenades.fuseTicks, 10, 400);
		w.grenades.throwSpeed = clamp(w.grenades.throwSpeed, 0.2F, 4.0F);
		w.grenades.bounciness = clamp(w.grenades.bounciness, 0.0F, 0.95F);
		w.grenades.smokeDurationTicks = MathHelper.clamp(w.grenades.smokeDurationTicks, 20, 6000);
		w.rpg7.reloadTicks = MathHelper.clamp(w.rpg7.reloadTicks, 1, 400);
		w.rpg7.cooldownTicks = MathHelper.clamp(w.rpg7.cooldownTicks, 0, 400);
		w.rpg7.maxSpeed = clamp(w.rpg7.maxSpeed, 0.5F, 10.0F);
		w.rpg7.selfDestructTicks = MathHelper.clamp(w.rpg7.selfDestructTicks, 10, 1200);
		w.grenadeLauncher.magazineSize = MathHelper.clamp(w.grenadeLauncher.magazineSize, 1, 64);
		w.grenadeLauncher.reloadTicksPerRound = MathHelper.clamp(w.grenadeLauncher.reloadTicksPerRound, 1, 200);
		w.grenadeLauncher.cooldownTicks = MathHelper.clamp(w.grenadeLauncher.cooldownTicks, 0, 200);
		w.grenadeLauncher.timedFuseTicks = MathHelper.clamp(w.grenadeLauncher.timedFuseTicks, 5, 400);
		w.flamethrower.maxFuel = MathHelper.clamp(w.flamethrower.maxFuel, 1, 100000);
		w.flamethrower.fuelPerCanister = MathHelper.clamp(w.flamethrower.fuelPerCanister, 1, 100000);
		w.flamethrower.refuelTicks = MathHelper.clamp(w.flamethrower.refuelTicks, 1, 400);
		w.flamethrower.range = clamp(w.flamethrower.range, 0.25F, 3.0F);
		w.flamethrower.puddleChance = clamp(w.flamethrower.puddleChance, 0.0F, 1.0F);
		w.missileStrike.maxRange = MathHelper.clamp(w.missileStrike.maxRange, 16, 512);
		w.missileStrike.lockTicks = MathHelper.clamp(w.missileStrike.lockTicks, 1, 400);
		w.missileStrike.countdownTicks = MathHelper.clamp(w.missileStrike.countdownTicks, 0, 1200);
		w.missileStrike.missileSpeed = clamp(w.missileStrike.missileSpeed, 1.0F, 30.0F);

		for (OrdnanceConfig.Warhead warhead : cfg.warheads.values()) {
			if (warhead == null) continue;
			warhead.power = clamp(warhead.power, 0.0F, 32.0F);
			warhead.radius = clamp(warhead.radius, 0.0F, 96.0F);
			warhead.fragments = MathHelper.clamp(warhead.fragments, 0, 1000);
			warhead.fireChance = clamp(warhead.fireChance, 0.0F, 1.0F);
			warhead.craterRadius = clamp(warhead.craterRadius, 0.0F, 32.0F);
			warhead.craterDepth = clamp(warhead.craterDepth, 0.0F, 24.0F);
			warhead.debris = MathHelper.clamp(warhead.debris, 0, 256);
			warhead.visualScale = clamp(warhead.visualScale, 0.1F, 16.0F);
		}
		cfg.warheads.values().removeIf(java.util.Objects::isNull);
		for (ExplosionProfile profile : ExplosionProfile.values()) {
			if (profile.isConfigurable()) {
				cfg.warheads.computeIfAbsent(profile.key(), k -> profile.defaults());
			}
		}
	}

	private static float clamp(float value, float min, float max) {
		return Float.isNaN(value) ? min : MathHelper.clamp(value, min, max);
	}
}
