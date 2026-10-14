package net.abyssaldescent.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.zone.Zone;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Server-side tuning knobs. Stored as {@code config/abyssal_descent.json}; missing keys are filled with defaults and
 * written back so the file always documents every option. Reload in-game with {@code /abyssal reload}.
 */
public final class AdConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static Values values = new Values();

	private AdConfig() {
	}

	public static Values get() {
		return values;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve(AbyssalDescent.MOD_ID + ".json");
	}

	public static synchronized void load() {
		Path path = path();
		Values loaded = new Values();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
				JsonObject defaults = GSON.toJsonTree(new Values()).getAsJsonObject();
				JsonObject user = JsonParser.parseReader(reader).getAsJsonObject();
				// Deep-merge so new options added in updates appear with their defaults.
				merge(defaults, user);
				loaded = GSON.fromJson(defaults, Values.class);
			} catch (Exception e) {
				AbyssalDescent.LOGGER.error("Failed to read {}, using defaults", path, e);
				loaded = new Values();
			}
		}
		loaded.sanitize();
		values = loaded;
		save();
	}

	public static synchronized void save() {
		try {
			Files.createDirectories(path().getParent());
			try (Writer writer = Files.newBufferedWriter(path(), StandardCharsets.UTF_8)) {
				GSON.toJson(values, writer);
			}
		} catch (IOException e) {
			AbyssalDescent.LOGGER.error("Failed to write config", e);
		}
	}

	private static void merge(JsonObject target, JsonObject source) {
		for (String key : source.keySet()) {
			if (target.has(key) && target.get(key).isJsonObject() && source.get(key).isJsonObject()) {
				merge(target.getAsJsonObject(key), source.getAsJsonObject(key));
			} else if (target.has(key)) {
				target.add(key, source.get(key));
			}
		}
	}

	public static final class Values {
		public Difficulty difficulty = new Difficulty();
		public Loot loot = new Loot();
		public Rules rules = new Rules();
		public Items items = new Items();
		public Client client = new Client();

		void sanitize() {
			difficulty.healthMultiplier = clamp(difficulty.healthMultiplier, 0.1, 10);
			difficulty.damageMultiplier = clamp(difficulty.damageMultiplier, 0.1, 10);
			difficulty.budgetMultiplier = clamp(difficulty.budgetMultiplier, 0.1, 10);
			difficulty.perFloorHealthScaling = clamp(difficulty.perFloorHealthScaling, 0, 0.5);
			difficulty.perFloorDamageScaling = clamp(difficulty.perFloorDamageScaling, 0, 0.5);
			difficulty.partyBudgetScaling = clamp(difficulty.partyBudgetScaling, 0, 2);
			difficulty.eliteChanceBase = clamp(difficulty.eliteChanceBase, 0, 1);
			difficulty.eliteChancePerFloor = clamp(difficulty.eliteChancePerFloor, 0, 0.2);
			rules.deathDurabilityToll = clamp(rules.deathDurabilityToll, 0, 1);
			rules.maxPartySize = (int) clamp(rules.maxPartySize, 1, 16);
			rules.maxActiveRelics = (int) clamp(rules.maxActiveRelics, 0, 9);
			rules.gateAttunementSeconds = (int) clamp(rules.gateAttunementSeconds, 1, 60);
			items.weaponDamageMultiplier = clamp(items.weaponDamageMultiplier, 0.1, 10);
			items.procChanceMultiplier = clamp(items.procChanceMultiplier, 0, 10);
			loot.rarityShiftPerFloor = clamp(loot.rarityShiftPerFloor, 0, 1);
			if (loot.coinsPerEnemy == null || loot.coinsPerEnemy.length != 2) {
				loot.coinsPerEnemy = new int[] {0, 2};
			}
			int coinsMin = (int) clamp(loot.coinsPerEnemy[0], 0, 64);
			int coinsMax = (int) clamp(loot.coinsPerEnemy[1], 0, 64);
			loot.coinsPerEnemy = new int[] {Math.min(coinsMin, coinsMax), Math.max(coinsMin, coinsMax)};
			rules.maxFloor = (int) clamp(rules.maxFloor, 1, Zone.MAX_FLOOR);
			rules.gatePartyRadius = clamp(rules.gatePartyRadius, 1, 32);
			client.cameraShakeScale = clamp(client.cameraShakeScale, 0, 2);
			client.particleDensity = clamp(client.particleDensity, 0, 2);
		}

		private static double clamp(double v, double min, double max) {
			return Math.max(min, Math.min(max, v));
		}
	}

	public static final class Difficulty {
		/** Global multiplier applied to every dungeon enemy's max health. */
		public double healthMultiplier = 1.0;
		/** Global multiplier applied to every dungeon enemy's attack damage. */
		public double damageMultiplier = 1.0;
		/** Multiplier for the threat budget spent on encounter waves. */
		public double budgetMultiplier = 1.0;
		/** Additional enemy health per floor below the first (0.03 = +3% per floor). */
		public double perFloorHealthScaling = 0.03;
		/** Additional enemy damage per floor below the first. */
		public double perFloorDamageScaling = 0.02;
		/** Extra threat budget per additional party member (0.6 = +60% each). */
		public double partyBudgetScaling = 0.6;
		/** Chance that a spawned enemy is an elite on floor 1. */
		public double eliteChanceBase = 0.04;
		/** Additional elite chance per floor. */
		public double eliteChancePerFloor = 0.012;
		/** Enemy health multiplier for bosses per extra party member. */
		public double bossPartyHealthScaling = 0.5;
	}

	public static final class Loot {
		/** Base rarity weights: common, uncommon, rare, epic, legendary. */
		public double[] chestRarityWeights = {52, 30, 13, 4.5, 0.5};
		public double[] treasureRarityWeights = {20, 38, 28, 11, 3};
		public double[] eliteRarityWeights = {30, 38, 22, 8, 2};
		public double[] bossRarityWeights = {0, 10, 45, 35, 10};
		/** How strongly depth pushes weight from lower to higher tiers (per floor). */
		public double rarityShiftPerFloor = 0.06;
		/** Chance that a normal cleared combat room leaves a reliquary. */
		public double combatRoomRewardChance = 0.3;
		/** Ancient coins dropped per enemy (min, max). */
		public int[] coinsPerEnemy = {0, 2};
	}

	public static final class Rules {
		/** Fraction of max durability lost by equipped/held gear when defeated (0 disables). */
		public double deathDurabilityToll = 0.1;
		/** Whether unsecured loot is destroyed on defeat. */
		public boolean loseUnsecuredLootOnDeath = true;
		/** Prevent breaking/placing blocks inside the dungeon (survival players). */
		public boolean protectDungeon = true;
		public int maxPartySize = 4;
		public int maxActiveRelics = 3;
		public int gateAttunementSeconds = 5;
		/** Radius around the Abyssal Gate in which players join the expedition. */
		public double gatePartyRadius = 5.0;
		/**
		 * Highest floor that can be reached. Zones that are not yet implemented are always sealed regardless of this
		 * value.
		 */
		public int maxFloor = 30;
	}

	public static final class Items {
		/** Multiplier for all damage dealt by dungeon weapons: melee hits, arrows and bolts, and their effects. */
		public double weaponDamageMultiplier = 1.0;
		public double procChanceMultiplier = 1.0;
	}

	/** Presentation options; only read on the client. */
	public static final class Client {
		/** Heavy boss impacts shake the camera. */
		public boolean cameraShake = true;
		public double cameraShakeScale = 1.0;
		/** Expedition panel in the top-left corner while inside the depths. */
		public boolean showHud = true;
		/** Ambient sparkles above dropped rare+ loot and trails behind enchanted projectiles. */
		public double particleDensity = 1.0;
		/** Zone boss themes replace the ambient soundtrack during boss fights. */
		public boolean bossMusic = true;
	}
}
