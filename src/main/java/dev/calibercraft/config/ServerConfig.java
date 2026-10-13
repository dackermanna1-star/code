package dev.calibercraft.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import dev.calibercraft.CaliberCraft;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Gameplay configuration ({@code config/calibercraft/server.json}). Values are validated and clamped on load;
 * a malformed file is reported and replaced by defaults (the broken file is kept as {@code .bak}).
 * Per-weapon statistics can be tuned with {@link #weaponOverrides} or with a data pack.
 */
public final class ServerConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static volatile ServerConfig instance = new ServerConfig();

	/** Name shown on the creative tab and in the HUD header. */
	public String displayName = "CaliberCraft Arsenal";
	/** Global damage multiplier for every weapon. */
	public double damageMultiplier = 1.0;
	/** Allow head-hit multipliers. */
	public boolean headshots = true;
	/** Creative-mode players never consume ammunition. */
	public boolean infiniteAmmoCreative = true;
	/** Nobody consumes ammunition (reloads still happen). */
	public boolean infiniteAmmo = false;
	/** Bullets shatter glass blocks/panes (respects build permissions and spawn protection). */
	public boolean bulletsBreakGlass = true;
	/** Bullets may pass through soft/thin blocks and multiple targets. */
	public boolean penetration = true;
	/** Grazing hits on hard surfaces can ricochet. */
	public boolean ricochets = true;
	/** Heat build-up / overheating for weapons that define heat_per_shot. */
	public boolean weaponHeat = true;
	/** Melee bash with the weapon. */
	public boolean meleeBash = true;
	/** Near-miss "whiz" sounds for players a bullet passes. */
	public boolean bulletWhiz = true;
	/** Field customization outside a gunsmith bench: "all", "quick_detach" or "none". */
	public String fieldCustomization = "quick_detach";
	/** Rare/legendary skins consume a Prismatic Finish Kit in survival. */
	public boolean rareSkinsRequireKit = true;
	/** Add weapons, ammunition and attachments to vanilla chest loot. */
	public boolean lootInjection = true;
	/** Upper bound of simultaneously simulated bullets per dimension. */
	public int maxActiveBullets = 4096;
	/** Shots that may arrive back-to-back faster than the cyclic rate (network jitter allowance). */
	public double fireBurstAllowance = 3.0;
	/** Maximum accepted difference (degrees) between the client's aim and the server's view of it. */
	public double maxAimDeviationDegrees = 35.0;
	/** Lowest fraction of the server-computed spread a client may report. */
	public double spreadTolerance = 0.6;
	/** Base distance (blocks) at which an unsuppressed gunshot is audible. */
	public double audibleRange = 192.0;
	/** Per-weapon stat overrides: {"calibercraft:ak": {"damage": 8.0, "rpm": 620}}. */
	public Map<String, Map<String, Double>> weaponOverrides = new LinkedHashMap<>();

	public static ServerConfig get() {
		return instance;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(CaliberCraft.MOD_ID).resolve("server.json");
	}

	public static void load() {
		Path file = path();
		ServerConfig cfg = new ServerConfig();
		if (Files.exists(file)) {
			try (Reader r = Files.newBufferedReader(file)) {
				ServerConfig read = GSON.fromJson(r, ServerConfig.class);
				if (read != null) {
					cfg = read;
				}
			} catch (IOException | JsonParseException e) {
				CaliberCraft.LOGGER.error("Could not read {} ({}); using defaults. The broken file is kept as server.json.bak", file, e.getMessage());
				try {
					Files.copy(file, file.resolveSibling("server.json.bak"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
				} catch (IOException ignored) {
					// best effort
				}
			}
		}
		cfg.validate();
		instance = cfg;
		save(cfg);
	}

	public static void save(ServerConfig cfg) {
		Path file = path();
		try {
			Files.createDirectories(file.getParent());
			try (Writer w = Files.newBufferedWriter(file)) {
				GSON.toJson(cfg, w);
			}
		} catch (IOException e) {
			CaliberCraft.LOGGER.warn("Could not write {}: {}", file, e.getMessage());
		}
	}

	public void validate() {
		if (displayName == null || displayName.isBlank()) {
			displayName = "CaliberCraft Arsenal";
		}
		damageMultiplier = clamp("damageMultiplier", damageMultiplier, 0.0, 100.0, 1.0);
		maxActiveBullets = (int) clamp("maxActiveBullets", maxActiveBullets, 64, 65536, 4096);
		fireBurstAllowance = clamp("fireBurstAllowance", fireBurstAllowance, 1.0, 10.0, 3.0);
		maxAimDeviationDegrees = clamp("maxAimDeviationDegrees", maxAimDeviationDegrees, 1.0, 180.0, 35.0);
		spreadTolerance = clamp("spreadTolerance", spreadTolerance, 0.0, 1.0, 0.6);
		audibleRange = clamp("audibleRange", audibleRange, 16.0, 1024.0, 192.0);
		if (!"all".equals(fieldCustomization) && !"quick_detach".equals(fieldCustomization) && !"none".equals(fieldCustomization)) {
			CaliberCraft.LOGGER.warn("Config fieldCustomization '{}' is invalid; expected all, quick_detach or none", fieldCustomization);
			fieldCustomization = "quick_detach";
		}
		if (weaponOverrides == null) {
			weaponOverrides = new LinkedHashMap<>();
		}
	}

	private static double clamp(String name, double v, double min, double max, double def) {
		if (Double.isNaN(v)) {
			CaliberCraft.LOGGER.warn("Config value {} is not a number; using {}", name, def);
			return def;
		}
		if (v < min || v > max) {
			double c = Math.max(min, Math.min(max, v));
			CaliberCraft.LOGGER.warn("Config value {}={} out of range [{}, {}]; using {}", name, v, min, max, c);
			return c;
		}
		return v;
	}
}
