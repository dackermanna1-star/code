package dev.calibercraft.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import dev.calibercraft.CaliberCraft;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Client presentation settings ({@code config/calibercraft/client.json}). Every optional effect can be reduced
 * or disabled here; values are clamped on load and the in-game settings screen edits the same object.
 */
public final class ClientConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static ClientConfig instance = new ClientConfig();

	// HUD
	public boolean hudEnabled = true;
	/** 0 = bottom right, 1 = bottom left, 2 = top right, 3 = top left. */
	public int hudCorner = 0;
	public float hudScale = 1.0f;
	public int hudOffsetX = 0;
	public int hudOffsetY = 0;
	/** High-contrast, text-only ammo display. */
	public boolean simplifiedHud = false;
	public boolean hitMarkers = true;
	public boolean damageNumbers = false;
	/** 0 = dynamic (shows spread), 1 = static dot, 2 = hidden. */
	public int crosshairStyle = 0;

	// Effects
	/** 0 = low, 1 = medium, 2 = high. */
	public int particleQuality = 2;
	public boolean shellCasings = true;
	public int maxCasings = 64;
	public boolean tracers = true;
	public boolean muzzleFlash = true;
	public boolean muzzleLight = true;
	public boolean bulletHoles = true;
	public int maxBulletHoles = 128;
	public float screenShake = 1.0f;
	public float cameraRecoil = 1.0f;
	/** Disables weapon sway, bobbing, inspect flourishes and screen shake. */
	public boolean reducedMotion = false;

	// Controls
	public boolean toggleAim = false;
	public float aimSensitivity = 1.0f;
	public float scopeSensitivity = 1.0f;

	// Audio
	/** Lowers repeated automatic-fire volume slightly over a long burst. */
	public boolean reduceRepeatedSounds = true;
	/** Distant gunshots arrive later than the flash (speed of sound). */
	public boolean soundTravelDelay = true;
	/** Gunshots behind walls are muffled. */
	public boolean soundOcclusion = true;
	public float gunVolume = 1.0f;

	public static ClientConfig get() {
		return instance;
	}

	private static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(CaliberCraft.MOD_ID).resolve("client.json");
	}

	public static void load() {
		Path file = path();
		ClientConfig cfg = new ClientConfig();
		if (Files.exists(file)) {
			try (Reader r = Files.newBufferedReader(file)) {
				ClientConfig read = GSON.fromJson(r, ClientConfig.class);
				if (read != null) {
					cfg = read;
				}
			} catch (IOException | JsonParseException e) {
				CaliberCraft.LOGGER.error("Could not read {} ({}); using defaults", file, e.getMessage());
			}
		}
		cfg.validate();
		instance = cfg;
		save();
	}

	public static void save() {
		Path file = path();
		try {
			Files.createDirectories(file.getParent());
			try (Writer w = Files.newBufferedWriter(file)) {
				GSON.toJson(instance, w);
			}
		} catch (IOException e) {
			CaliberCraft.LOGGER.warn("Could not write {}: {}", file, e.getMessage());
		}
	}

	public void validate() {
		hudCorner = Math.floorMod(hudCorner, 4);
		hudScale = clamp(hudScale, 0.5f, 2.0f);
		hudOffsetX = Math.max(-400, Math.min(400, hudOffsetX));
		hudOffsetY = Math.max(-400, Math.min(400, hudOffsetY));
		crosshairStyle = Math.floorMod(crosshairStyle, 3);
		particleQuality = Math.max(0, Math.min(2, particleQuality));
		maxCasings = Math.max(0, Math.min(512, maxCasings));
		maxBulletHoles = Math.max(0, Math.min(1024, maxBulletHoles));
		screenShake = clamp(screenShake, 0f, 2f);
		cameraRecoil = clamp(cameraRecoil, 0f, 2f);
		aimSensitivity = clamp(aimSensitivity, 0.1f, 2f);
		scopeSensitivity = clamp(scopeSensitivity, 0.1f, 2f);
		gunVolume = clamp(gunVolume, 0f, 2f);
	}

	private static float clamp(float v, float lo, float hi) {
		return Float.isNaN(v) ? lo : Math.max(lo, Math.min(hi, v));
	}

	/** Particle count multiplier for the configured quality. */
	public float particleScale() {
		return switch (particleQuality) {
			case 0 -> 0.35f;
			case 1 -> 0.65f;
			default -> 1.0f;
		};
	}
}
