package dev.juukulius.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import dev.juukulius.JuliusMod;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

/**
 * Server-side balance settings ({@code config/julius_juukulius-server.json}). The values that affect client-side
 * prediction (cost and cooldown multipliers) are sent to clients when they join.
 */
public final class JuliusServerConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final String FILE_NAME = "julius_juukulius-server.json";
	private static JuliusServerConfig instance = new JuliusServerConfig();

	/** Multiplies every damage value dealt by sword arts and spirit arts. */
	public double damageMultiplier = 1.0;
	/** Multiplies every mana cost. */
	public double manaCostMultiplier = 1.0;
	/** Multiplies every cooldown. */
	public double cooldownMultiplier = 1.0;
	/** Multiplies mana regeneration. */
	public double manaRegenMultiplier = 1.0;
	/** When false, arts never damage other players (vanilla PvP and team rules always apply as well). */
	public boolean artsDamagePlayers = true;
	/** Grants House Juukulius's sword the first time a player transforms (once per player). */
	public boolean grantSwordOnFirstTransform = true;
	/** Aro cushions falls while the spirits are manifested (costs mana per block fallen). */
	public boolean aroFallCushion = true;

	public static JuliusServerConfig get() {
		return instance;
	}

	/** Used by the client to mirror the values of the server it is connected to. */
	public static void applyFromServer(double manaCost, double cooldown) {
		JuliusServerConfig copy = copy(instance);
		copy.manaCostMultiplier = manaCost;
		copy.cooldownMultiplier = cooldown;
		instance = copy;
	}

	public static void load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve(FILE_NAME);
		JuliusServerConfig loaded = null;
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				loaded = GSON.fromJson(reader, JuliusServerConfig.class);
			} catch (IOException | JsonParseException e) {
				JuliusMod.LOGGER.warn("Could not read {}, using defaults", path, e);
			}
		}

		instance = loaded != null ? loaded.sanitized() : new JuliusServerConfig();
		save(path);
	}

	private static void save(Path path) {
		try {
			Files.createDirectories(path.getParent());
			try (Writer writer = Files.newBufferedWriter(path)) {
				GSON.toJson(instance, writer);
			}
		} catch (IOException e) {
			JuliusMod.LOGGER.warn("Could not write {}", path, e);
		}
	}

	private JuliusServerConfig sanitized() {
		this.damageMultiplier = Mth.clamp(this.damageMultiplier, 0.0, 10.0);
		this.manaCostMultiplier = Mth.clamp(this.manaCostMultiplier, 0.0, 10.0);
		this.cooldownMultiplier = Mth.clamp(this.cooldownMultiplier, 0.05, 10.0);
		this.manaRegenMultiplier = Mth.clamp(this.manaRegenMultiplier, 0.0, 10.0);
		return this;
	}

	private static JuliusServerConfig copy(JuliusServerConfig source) {
		return GSON.fromJson(GSON.toJson(source), JuliusServerConfig.class);
	}
}
