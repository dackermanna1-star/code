package dev.visceral;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Plain JSON config stored in {@code config/visceral.json}. Unknown/missing keys fall back to the
 * defaults below and the file is rewritten so new options show up after updates.
 */
public final class VisceralConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static VisceralConfig instance = new VisceralConfig();

	// ---------------------------------------------------------------- gameplay (server side)
	/** Master switch for wounds being recorded on entities. */
	public boolean wounds = true;
	/** Cuts, gashes, punctures, bites and claw marks make the victim bleed (damage over time). */
	public boolean bleedingDamage = true;
	/** Health removed per bleeding pulse. */
	public float bleedDamagePerPulse = 1.0F;
	/** Scales how long bleeding lasts. */
	public float bleedDurationMultiplier = 1.0F;
	/** Whether bleeding can deliver the killing blow (false = stops at half a heart). */
	public boolean bleedingCanKill = true;
	/** Players take wounds and bleed too. */
	public boolean playersBleed = true;
	/** Upper bound of wounds tracked per entity; the oldest ones heal first. */
	public int maxWoundsPerEntity = 24;
	/** Wounds on living entities fully heal after this many seconds. */
	public int woundHealSeconds = 600;
	/** Override the blood type of any entity, e.g. {"minecraft:pig": "green"}. */
	public Map<String, String> bloodTypeOverrides = new LinkedHashMap<>();

	// ---------------------------------------------------------------- visuals (client side)
	/** Multiplier for the amount of blood particles (0 disables spray). */
	public float bloodAmount = 1.0F;
	/** Render wounds (cuts, bruises, punctures...) on entity models. */
	public boolean woundDecals = true;
	/** Blood stains on blocks. */
	public boolean worldStains = true;
	/** Blood pools under bleeding and dead creatures. */
	public boolean bloodPools = true;
	/** Maximum number of stain/pool decals kept in the world. */
	public int maxStains = 2500;
	/** Seconds a stain stays before fading away. */
	public int stainLifetimeSeconds = 900;
	/** Rain slowly washes away blood exposed to the sky. */
	public boolean rainWashesBlood = true;
	/** Replace the vanilla death animation with physics ragdolls. */
	public boolean ragdolls = true;
	/** Ragdoll other players (and yourself, visible after respawning or in third person). */
	public boolean ragdollPlayers = true;
	/** Seconds a corpse stays before sinking into the ground. */
	public int ragdollLifetimeSeconds = 45;
	/** Maximum simultaneous ragdolls; the oldest despawns first. */
	public int maxRagdolls = 32;
	/** Scales the push corpses receive from the killing blow and explosions. */
	public float ragdollImpulseScale = 1.0F;
	/** Gravity used by the ragdoll simulation in blocks/s^2 (vanilla mobs fall at roughly 32). */
	public float ragdollGravity = 22.0F;
	/** Players and mobs shove corpses when walking into them. */
	public boolean ragdollEntityPushing = true;
	/** Brief blood splatter on the screen edges when you get hurt by something sharp. */
	public boolean screenBlood = true;

	public static VisceralConfig get() {
		return instance;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(Visceral.MOD_ID + ".json");
	}

	public static void load() {
		Path path = path();
		VisceralConfig loaded = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				loaded = GSON.fromJson(reader, VisceralConfig.class);
			} catch (IOException | JsonParseException e) {
				Visceral.LOGGER.error("Failed to read {}, using defaults", path, e);
			}
		}
		instance = loaded != null ? loaded.sanitized() : new VisceralConfig();
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
			Visceral.LOGGER.error("Failed to write {}", path, e);
		}
	}

	private VisceralConfig sanitized() {
		if (this.bloodTypeOverrides == null) {
			this.bloodTypeOverrides = new LinkedHashMap<>();
		}
		this.bleedDamagePerPulse = Math.max(0.0F, this.bleedDamagePerPulse);
		this.bleedDurationMultiplier = Math.max(0.0F, this.bleedDurationMultiplier);
		this.maxWoundsPerEntity = clamp(this.maxWoundsPerEntity, 0, 64);
		this.woundHealSeconds = Math.max(10, this.woundHealSeconds);
		this.bloodAmount = Math.max(0.0F, Math.min(this.bloodAmount, 5.0F));
		this.maxStains = clamp(this.maxStains, 0, 20000);
		this.stainLifetimeSeconds = Math.max(5, this.stainLifetimeSeconds);
		this.ragdollLifetimeSeconds = Math.max(3, this.ragdollLifetimeSeconds);
		this.maxRagdolls = clamp(this.maxRagdolls, 0, 256);
		this.ragdollImpulseScale = Math.max(0.0F, Math.min(this.ragdollImpulseScale, 10.0F));
		this.ragdollGravity = Math.max(1.0F, Math.min(this.ragdollGravity, 100.0F));
		return this;
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}
}
