package com.godforge.client;

import com.godforge.Godforge;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

/** Per-player visual preferences, stored in {@code config/godforge-client.json}. */
public final class ClientConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static ClientConfig instance = new ClientConfig();

	/** Multiplier for camera shake (0 disables it). */
	public double screenShake = 1.0;
	/** Multiplier for full-screen flashes (0 disables them). */
	public double flashes = 1.0;
	/** Multiplier for client particle counts. */
	public double particles = 1.0;
	/** View warping near singularities, rifts and cuts. */
	public boolean distortion = true;
	/** Weapon status display above the hotbar. */
	public boolean hud = true;

	public static ClientConfig get() {
		return instance;
	}

	private static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(Godforge.MOD_ID + "-client.json");
	}

	public static void load() {
		Path path = path();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				ClientConfig loaded = GSON.fromJson(reader, ClientConfig.class);
				if (loaded != null) {
					instance = loaded;
				}
			} catch (IOException | JsonParseException e) {
				Godforge.LOGGER.error("Failed to read {}", path, e);
			}
		}
		instance.sanitize();
		save();
	}

	public static void save() {
		try {
			Files.createDirectories(path().getParent());
			try (Writer writer = Files.newBufferedWriter(path())) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			Godforge.LOGGER.error("Failed to write {}", path(), e);
		}
	}

	private void sanitize() {
		this.screenShake = Mth.clamp(this.screenShake, 0.0, 2.0);
		this.flashes = Mth.clamp(this.flashes, 0.0, 1.0);
		this.particles = Mth.clamp(this.particles, 0.1, 2.0);
	}

	/** Scales a particle count by the user's density preference. */
	public static int count(int base) {
		return Math.max(1, (int) Math.round(base * instance.particles));
	}
}
