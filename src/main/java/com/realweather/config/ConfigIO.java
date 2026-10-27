package com.realweather.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.realweather.RealWeather;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.Supplier;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Tiny JSON (de)serializer for config objects. Unknown keys are ignored and missing keys keep their defaults,
 * so configs survive mod updates. A broken file is backed up and replaced instead of crashing the game.
 */
public final class ConfigIO {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().serializeSpecialFloatingPointValues().create();

	private ConfigIO() {
	}

	public static Path path(String fileName) {
		return FabricLoader.getInstance().getConfigDir().resolve(fileName);
	}

	public static <T> T load(String fileName, Class<T> type, Supplier<T> defaults) {
		Path path = path(fileName);
		T config = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
				config = GSON.fromJson(reader, type);
			} catch (IOException | JsonParseException e) {
				RealWeather.LOGGER.error("Failed to read {}, a backup is kept and defaults are used", path, e);
				try {
					Files.copy(path, path.resolveSibling(fileName + ".broken"), StandardCopyOption.REPLACE_EXISTING);
				} catch (IOException ignored) {
					// Best effort only.
				}
			}
		}
		if (config == null) {
			config = defaults.get();
		}
		save(fileName, config);
		return config;
	}

	public static void save(String fileName, Object config) {
		Path path = path(fileName);
		try {
			Files.createDirectories(path.getParent());
			Path tmp = path.resolveSibling(fileName + ".tmp");
			try (Writer writer = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
				GSON.toJson(config, writer);
			}
			Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			RealWeather.LOGGER.error("Failed to write {}", path, e);
		}
	}

	public static float clamp(float value, float min, float max, float fallback) {
		if (Float.isNaN(value) || Float.isInfinite(value)) {
			return fallback;
		}
		return Math.max(min, Math.min(max, value));
	}

	public static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}
}
