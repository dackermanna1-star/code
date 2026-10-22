package dev.juukulius.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import dev.juukulius.JuliusMod;
import dev.juukulius.particle.ParticleDensity;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

/** Client-only visual settings ({@code config/julius_juukulius-client.json}), editable in game. */
public final class JuliusClientConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final String FILE_NAME = "julius_juukulius-client.json";
	private static JuliusClientConfig instance = new JuliusClientConfig();

	/** ALL, REDUCED or MINIMAL. */
	public ParticleLevel particles = ParticleLevel.ALL;
	public boolean cameraShake = true;
	/** 0..1, applied on top of the built-in restraint. */
	public double cameraShakeIntensity = 0.7;
	public boolean swordTrails = true;
	public boolean magicCircles = true;
	public boolean showHud = true;
	public HudAnchor hudAnchor = HudAnchor.HOTBAR_RIGHT;
	public double hudScale = 1.0;

	public static JuliusClientConfig get() {
		return instance;
	}

	public static void load() {
		Path path = path();
		JuliusClientConfig loaded = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				loaded = GSON.fromJson(reader, JuliusClientConfig.class);
			} catch (IOException | JsonParseException e) {
				JuliusMod.LOGGER.warn("Could not read {}, using defaults", path, e);
			}
		}

		instance = loaded != null ? loaded.sanitized() : new JuliusClientConfig();
		instance.apply();
		save();
	}

	public static void save() {
		Path path = path();
		try {
			Files.createDirectories(path.getParent());
			try (Writer writer = Files.newBufferedWriter(path)) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			JuliusMod.LOGGER.warn("Could not write {}", path, e);
		}
	}

	public void apply() {
		ParticleDensity.setMultiplier(this.particles.multiplier);
	}

	private JuliusClientConfig sanitized() {
		if (this.particles == null) {
			this.particles = ParticleLevel.ALL;
		}

		if (this.hudAnchor == null) {
			this.hudAnchor = HudAnchor.HOTBAR_RIGHT;
		}

		this.cameraShakeIntensity = Mth.clamp(this.cameraShakeIntensity, 0.0, 1.0);
		this.hudScale = Mth.clamp(this.hudScale, 0.5, 2.0);
		return this;
	}

	private static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(FILE_NAME);
	}

	public enum ParticleLevel {
		ALL(1.0F),
		REDUCED(0.45F),
		MINIMAL(0.15F);

		public final float multiplier;

		ParticleLevel(float multiplier) {
			this.multiplier = multiplier;
		}

		public ParticleLevel next() {
			return values()[(this.ordinal() + 1) % values().length];
		}
	}

	public enum HudAnchor {
		HOTBAR_RIGHT,
		BOTTOM_LEFT,
		TOP_LEFT,
		TOP_RIGHT;

		public HudAnchor next() {
			return values()[(this.ordinal() + 1) % values().length];
		}
	}
}
