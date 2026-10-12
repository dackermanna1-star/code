package com.extremesports.client;

import com.extremesports.ExtremeSports;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.PhysicsPreset;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.mojang.serialization.JsonOps;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Client settings persisted to config/extremesports.json, plus saved workshop presets.
 */
public final class ClientConfig {
	public enum SteeringMode {
		KEYBOARD,
		MOUSE
	}

	public enum SpeedUnit {
		KMH,
		MPH,
		BLOCKS
	}

	public static final class SavedPreset {
		public String name = "Preset";
		public String kind = "skateboard";
		public JsonElement config;
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static ClientConfig instance = new ClientConfig();

	public String preset = PhysicsPreset.BALANCED.id();
	public boolean goofy = false;
	public boolean autoPickup = true;
	public SteeringMode steering = SteeringMode.KEYBOARD;
	public boolean autoThirdPerson = true;
	public float cameraShake = 1.0F;
	public float cameraBob = 1.0F;
	public float fovEffect = 1.0F;
	public boolean reducedMotion = false;
	public boolean hudEnabled = true;
	public float hudScale = 1.0F;
	public SpeedUnit speedUnit = SpeedUnit.KMH;
	public boolean showTips = true;
	public float rollVolume = 1.0F;
	public List<SavedPreset> presets = new ArrayList<>();

	public static ClientConfig get() {
		return instance;
	}

	private static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve("extremesports.json");
	}

	public static void load() {
		Path path = path();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				ClientConfig loaded = GSON.fromJson(reader, ClientConfig.class);
				if (loaded != null) {
					instance = loaded;
				}
			} catch (IOException | RuntimeException e) {
				ExtremeSports.LOGGER.warn("Could not read client config, using defaults", e);
			}
		}
		if (instance.presets == null) {
			instance.presets = new ArrayList<>();
		}
		if (instance.steering == null) {
			instance.steering = SteeringMode.KEYBOARD;
		}
		if (instance.speedUnit == null) {
			instance.speedUnit = SpeedUnit.KMH;
		}
	}

	public static void save() {
		try {
			Files.createDirectories(path().getParent());
			try (Writer writer = Files.newBufferedWriter(path())) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			ExtremeSports.LOGGER.warn("Could not save client config", e);
		}
	}

	public PhysicsPreset physicsPreset() {
		return PhysicsPreset.byId(preset);
	}

	/** Effective intensity of a motion effect after the reduced-motion toggle. */
	public float motion(float value) {
		return reducedMotion ? 0.0F : value;
	}

	public void savePreset(String name, String kind, EquipmentConfig config) {
		SavedPreset preset = new SavedPreset();
		preset.name = name;
		preset.kind = kind;
		preset.config = EquipmentConfig.CODEC.encodeStart(JsonOps.INSTANCE, config).result().orElse(null);
		presets.removeIf(existing -> existing.name.equals(name) && existing.kind.equals(kind));
		presets.add(preset);
		save();
	}

	public static EquipmentConfig decode(SavedPreset preset) {
		if (preset.config == null) {
			return EquipmentConfig.EMPTY;
		}
		return EquipmentConfig.CODEC.parse(JsonOps.INSTANCE, preset.config).result().orElse(EquipmentConfig.EMPTY);
	}
}
