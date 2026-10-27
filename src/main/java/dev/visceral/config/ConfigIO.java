package dev.visceral.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.visceral.Visceral;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Supplier;
import net.fabricmc.loader.api.FabricLoader;

/** Small JSON (de)serialiser for the config POJOs. Unknown keys are ignored, missing keys keep defaults. */
public final class ConfigIO {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().serializeNulls().create();

	private ConfigIO() {
	}

	public static Path path(String fileName) {
		return FabricLoader.getInstance().getConfigDir().resolve(fileName);
	}

	public static <T> T load(String fileName, Class<T> type, Supplier<T> defaults) {
		Path file = path(fileName);
		T value = null;
		if (Files.exists(file)) {
			try (Reader reader = Files.newBufferedReader(file)) {
				value = GSON.fromJson(reader, type);
			} catch (Exception e) {
				Visceral.LOGGER.error("Failed to read {}, using defaults", file, e);
			}
		}
		if (value == null) value = defaults.get();
		save(fileName, value);
		return value;
	}

	public static void save(String fileName, Object value) {
		Path file = path(fileName);
		try {
			Files.createDirectories(file.getParent());
			try (Writer writer = Files.newBufferedWriter(file)) {
				GSON.toJson(value, writer);
			}
		} catch (IOException e) {
			Visceral.LOGGER.error("Failed to write {}", file, e);
		}
	}
}
