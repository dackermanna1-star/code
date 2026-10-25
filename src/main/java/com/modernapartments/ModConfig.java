package com.modernapartments;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;

/** config/modernapartments.json */
public final class ModConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static ModConfig instance = new ModConfig();

	/** Let complexes generate naturally in new chunks (plains, meadows, savannas, forests...). */
	public boolean naturalGeneration = true;
	/** Server time spent placing blueprint buildings each tick (milliseconds). */
	public int placementMillisPerTick = 25;
	/** Consume blueprints when used in survival mode. */
	public boolean consumeBlueprintsInSurvival = true;

	public static ModConfig get() {
		return instance;
	}

	public static void load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve(ModernApartments.MOD_ID + ".json");
		try {
			if (Files.exists(path)) {
				try (Reader reader = Files.newBufferedReader(path)) {
					ModConfig loaded = GSON.fromJson(reader, ModConfig.class);
					if (loaded != null) {
						instance = loaded;
					}
				}
			}
			try (Writer writer = Files.newBufferedWriter(path)) {
				GSON.toJson(instance, writer);
			}
		} catch (Exception e) {
			ModernApartments.LOGGER.warn("Could not read/write {}: {}", path, e.toString());
		}
	}
}
