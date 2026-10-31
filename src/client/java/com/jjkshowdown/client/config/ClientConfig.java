package com.jjkshowdown.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.util.ParticleDensity;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Per-player presentation settings ({@code config/jjkshowdown/client.json}). */
public final class ClientConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path PATH = FabricLoader.getInstance().getConfigDir().resolve("jjkshowdown").resolve("client.json");
	private static ClientConfig instance = new ClientConfig();

	public enum ParticleQuality {
		LOW(0.3f), MEDIUM(0.6f), HIGH(1.0f), ULTRA(1.6f);

		public final float factor;

		ParticleQuality(float factor) {
			this.factor = factor;
		}
	}

	public String particleQuality = "HIGH";
	public float screenShake = 1.0f;
	public boolean screenFlashes = true;
	public boolean cinematics = true;
	public boolean autoSkipCinematics = false;
	public boolean letterbox = true;
	public boolean quickTimeEvents = true;
	public boolean voiceLines = true;
	public boolean subtitles = true;
	public boolean music = true;
	public boolean characterSkins = true;
	public boolean sixEyesOutlines = true;
	public boolean domainAtmosphere = true;
	public boolean callouts = true;
	public float hudScale = 1.0f;
	/** CENTER: action bar above the hearts; LEFT / RIGHT: panel in a bottom corner. */
	public String hudLayout = "CENTER";
	public boolean doubleTapDodge = false;

	public static ClientConfig get() {
		return instance;
	}

	public ParticleQuality quality() {
		try {
			return ParticleQuality.valueOf(particleQuality.toUpperCase());
		} catch (Exception e) {
			return ParticleQuality.HIGH;
		}
	}

	public static void load() {
		ClientConfig c = null;
		if (Files.exists(PATH)) {
			try (Reader r = Files.newBufferedReader(PATH, StandardCharsets.UTF_8)) {
				c = GSON.fromJson(r, ClientConfig.class);
			} catch (Exception e) {
				JjkShowdown.LOGGER.error("Failed to read {}, using defaults", PATH, e);
			}
		}
		instance = c == null ? new ClientConfig() : c;
		instance.validate();
		save();
	}

	public static void save() {
		try {
			Files.createDirectories(PATH.getParent());
			try (Writer w = Files.newBufferedWriter(PATH, StandardCharsets.UTF_8)) {
				GSON.toJson(instance, w);
			}
		} catch (Exception e) {
			JjkShowdown.LOGGER.error("Failed to write {}", PATH, e);
		}
	}

	public void validate() {
		if (particleQuality == null) particleQuality = "HIGH";
		particleQuality = quality().name();
		screenShake = Mth.clamp(screenShake, 0f, 2f);
		hudScale = Mth.clamp(hudScale, 0.5f, 2f);
		if (hudLayout == null || !(hudLayout.equals("CENTER") || hudLayout.equals("LEFT") || hudLayout.equals("RIGHT"))) hudLayout = "CENTER";
		ParticleDensity.factor = quality().factor;
	}

	public ClientConfig copy() {
		return GSON.fromJson(GSON.toJson(this), ClientConfig.class);
	}

	public static void apply(ClientConfig c) {
		c.validate();
		instance = c;
		save();
	}
}
