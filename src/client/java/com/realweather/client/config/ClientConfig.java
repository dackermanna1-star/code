package com.realweather.client.config;

import com.realweather.config.ConfigIO;
import java.util.Locale;

/**
 * Visual and audio settings, stored per player in {@code config/realweather-client.json}.
 * Every effect can be disabled individually; {@link #quality} scales the expensive ones.
 */
public final class ClientConfig {
	public static final String FILE = "realweather-client.json";

	private static ClientConfig instance = new ClientConfig();

	public enum Quality {
		LOW(8, 0.45F, 18, 1, false, 0.5F),
		MEDIUM(11, 0.7F, 28, 1, true, 0.75F),
		HIGH(14, 1.0F, 44, 2, true, 1.0F),
		ULTRA(18, 1.35F, 72, 3, true, 1.3F);

		public final int precipitationRadius;
		public final float particleScale;
		public final int cloudSteps;
		public final int cloudLightSteps;
		public final boolean rainCurtains;
		public final float precipitationLayers;

		Quality(int precipitationRadius, float particleScale, int cloudSteps, int cloudLightSteps, boolean rainCurtains, float precipitationLayers) {
			this.precipitationRadius = precipitationRadius;
			this.particleScale = particleScale;
			this.cloudSteps = cloudSteps;
			this.cloudLightSteps = cloudLightSteps;
			this.rainCurtains = rainCurtains;
			this.precipitationLayers = precipitationLayers;
		}
	}

	public String _comment = "RealWeather client settings. quality: low, medium, high, ultra. Use /realweather in game to change them.";

	public String quality = "high";

	// Precipitation
	public boolean customPrecipitation = true;
	/** 0 = choose from quality. */
	public int precipitationRadius = 0;
	public float precipitationDensity = 1.0F;
	public boolean rainCurtains = true;

	// Particles
	public float particleDensity = 1.0F;
	public boolean splashes = true;
	public boolean ripples = true;
	public boolean snowflakes = true;
	public boolean windDebris = true;

	// Sky
	public boolean volumetricClouds = true;
	/** 0 = choose from quality. */
	public int cloudSteps = 0;
	public boolean cloudShadows = true;
	public boolean weatherFog = true;
	public float fogStrength = 1.0F;
	public boolean skyEffects = true;

	// Lightning
	public boolean customLightning = true;
	public float flashBrightness = 1.0F;
	public boolean realisticThunderDelay = true;

	// Terrain shader effects (vanilla renderer only; Sodium/Iris replace the terrain shader)
	public boolean foliageSway = true;
	public float swayStrength = 1.0F;
	public boolean wetSurfaces = true;
	public float wetnessStrength = 1.0F;

	// Audio
	public boolean ambientSounds = true;
	public float rainVolume = 1.0F;
	public float windVolume = 1.0F;
	public float thunderVolume = 1.0F;
	public boolean replaceVanillaRainSounds = true;

	public boolean debugOverlay = false;

	public static ClientConfig get() {
		return instance;
	}

	public static void load() {
		ClientConfig loaded = ConfigIO.load(FILE, ClientConfig.class, ClientConfig::new);
		loaded.validate();
		instance = loaded;
		ConfigIO.save(FILE, loaded);
	}

	public static void save() {
		instance.validate();
		ConfigIO.save(FILE, instance);
	}

	public void validate() {
		if (this.quality == null || parseQuality(this.quality) == null) {
			this.quality = "high";
		}
		this.precipitationRadius = this.precipitationRadius <= 0 ? 0 : ConfigIO.clamp(this.precipitationRadius, 4, 32);
		this.precipitationDensity = ConfigIO.clamp(this.precipitationDensity, 0.0F, 3.0F, 1.0F);
		this.particleDensity = ConfigIO.clamp(this.particleDensity, 0.0F, 4.0F, 1.0F);
		this.cloudSteps = this.cloudSteps <= 0 ? 0 : ConfigIO.clamp(this.cloudSteps, 8, 128);
		this.fogStrength = ConfigIO.clamp(this.fogStrength, 0.0F, 3.0F, 1.0F);
		this.flashBrightness = ConfigIO.clamp(this.flashBrightness, 0.0F, 2.0F, 1.0F);
		this.swayStrength = ConfigIO.clamp(this.swayStrength, 0.0F, 3.0F, 1.0F);
		this.wetnessStrength = ConfigIO.clamp(this.wetnessStrength, 0.0F, 2.0F, 1.0F);
		this.rainVolume = ConfigIO.clamp(this.rainVolume, 0.0F, 2.0F, 1.0F);
		this.windVolume = ConfigIO.clamp(this.windVolume, 0.0F, 2.0F, 1.0F);
		this.thunderVolume = ConfigIO.clamp(this.thunderVolume, 0.0F, 2.0F, 1.0F);
	}

	public Quality qualityPreset() {
		Quality quality = parseQuality(this.quality);
		return quality != null ? quality : Quality.HIGH;
	}

	public int effectivePrecipitationRadius() {
		return this.precipitationRadius > 0 ? this.precipitationRadius : this.qualityPreset().precipitationRadius;
	}

	public int effectiveCloudSteps() {
		return this.cloudSteps > 0 ? this.cloudSteps : this.qualityPreset().cloudSteps;
	}

	public float effectiveParticleScale() {
		return this.particleDensity * this.qualityPreset().particleScale;
	}

	public static Quality parseQuality(String value) {
		try {
			return Quality.valueOf(value.toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException | NullPointerException e) {
			return null;
		}
	}
}
