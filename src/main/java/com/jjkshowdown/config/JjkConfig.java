package com.jjkshowdown.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.jjkshowdown.JjkShowdown;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Mth;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Server-authoritative gameplay configuration ({@code config/jjkshowdown/common.json}).
 * <p>
 * In single player this file is shared by the integrated server, and the in-game config screen edits it directly.
 * On dedicated servers the admin edits the file and runs {@code /jjk config reload}.
 */
public final class JjkConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static final Path PATH = FabricLoader.getInstance().getConfigDir().resolve("jjkshowdown").resolve("common.json");
	private static JjkConfig instance = new JjkConfig();

	/** All ability ids, so per-ability tuning entries are always present in the file. */
	public static final List<String> ABILITY_IDS = List.of(
			"infinity", "blue", "red", "blink", "hollow_purple", "unlimited_void",
			"dismantle", "cleave", "fuga", "world_slash", "domain_amplification", "malevolent_shrine",
			"reverse_cursed_technique");

	public String difficulty = "NORMAL";
	public Progression progression = new Progression();
	public Energy energy = new Energy();
	public Abilities abilities = new Abilities();
	public Combat combat = new Combat();
	public Domains domains = new Domains();
	public Destruction destruction = new Destruction();
	public Ai ai = new Ai();
	public Qte qte = new Qte();
	public Cinematics cinematics = new Cinematics();
	public Characters characters = new Characters();

	public static final class Progression {
		/** PROGRESSIVE: abilities unlock with mastery. UNLOCKED: everything available at max mastery. */
		public String mode = "PROGRESSIVE";
		public float xpMultiplier = 1.0f;
		/** Creative-mode players get every ability regardless of mastery. */
		public boolean creativeUnlocksAll = true;
		public int startingMastery = 1;
	}

	public static final class Energy {
		public float maxMultiplier = 1.0f;
		public float regenMultiplier = 1.0f;
		public float costMultiplier = 1.0f;
	}

	public static final class Abilities {
		public float damageMultiplier = 1.0f;
		public float cooldownMultiplier = 1.0f;
		public Map<String, AbilityTuning> perAbility = new LinkedHashMap<>();
	}

	public static final class AbilityTuning {
		public boolean enabled = true;
		public float damage = 1.0f;
		public float cooldown = 1.0f;
		public float cost = 1.0f;
	}

	public static final class Combat {
		public int comboWindowTicks = 25;
		public int parryWindowTicks = 5;
		public int dodgeIFrames = 7;
		public int dodgeCooldownTicks = 16;
		public float blockDamageReduction = 0.7f;
		public float blackFlashBaseChance = 0.03f;
		public float blackFlashWindowChance = 0.45f;
		public float blackFlashMultiplier = 2.5f;
		public int blackFlashWindowOpenTicks = 7;
		public int blackFlashWindowLengthTicks = 3;
		public boolean doubleJump = true;
		public float finisherHealthThreshold = 0.2f;
		public boolean finishers = true;
		public float meleeDamageMultiplier = 1.0f;
		public float fallDamageReduction = 0.8f;
	}

	public static final class Domains {
		public float strengthMultiplier = 1.0f;
		public int unlimitedVoidRadius = 16;
		public int malevolentShrineRadius = 26;
		public int durationTicks = 400;
		public int burnoutTicks = 600;
		public boolean transformTerrain = true;
		public boolean clashes = true;
		public int clashMaxTicks = 320;
		public float sureHitDamageMultiplier = 1.0f;
	}

	public static final class Destruction {
		public boolean enabled = true;
		/** Restore every block the mod destroyed after a delay (domain arenas are always restored). */
		public boolean restoreTerrain = true;
		public int restoreDelayTicks = 1200;
		public int restoreBlocksPerTick = 600;
		public float maxBlockHardness = 50.0f;
		/** Maximum blocks a single technique may destroy in one tick. */
		public int blocksPerTickBudget = 1500;
		public boolean flyingDebris = true;
		/** Rival bosses respect the mobGriefing game rule unless this is true. */
		public boolean bossIgnoresMobGriefing = false;
		public boolean fuGaPlacesFire = true;
	}

	public static final class Ai {
		public float aggressionMultiplier = 1.0f;
		public float reactionMultiplier = 1.0f;
		public float bossHealthMultiplier = 1.0f;
		public float bossDamageMultiplier = 1.0f;
		public boolean bossDomains = true;
		public boolean bossUltimates = true;
		public boolean bossPhaseTwo = true;
		public boolean bossVoiceLines = true;
	}

	public static final class Qte {
		public boolean enabled = true;
		public float timingMultiplier = 1.0f;
		/** Outcome used when QTEs are disabled for a player: SUCCESS, PARTIAL or FAIL. */
		public String autoOutcome = "PARTIAL";
	}

	public static final class Cinematics {
		public boolean enabled = true;
		public boolean allowSkip = true;
		/** Freeze the participants while a cinematic plays (prevents cheap hits). */
		public boolean freezeParticipants = true;
		public float lengthMultiplier = 1.0f;
	}

	public static final class Characters {
		public boolean allowSwitching = true;
		public boolean promptOnFirstJoin = true;
		public float healthBonus = 20.0f;
		public float speedBonus = 0.12f;
		public boolean sixEyesSeeThroughWalls = true;
	}

	// ------------------------------------------------------------------------------------------------

	public static JjkConfig get() {
		return instance;
	}

	public Difficulty difficultyPreset() {
		return Difficulty.byName(difficulty);
	}

	public AbilityTuning tuning(String abilityId) {
		AbilityTuning t = abilities.perAbility.get(abilityId);
		if (t == null) {
			t = new AbilityTuning();
			abilities.perAbility.put(abilityId, t);
		}
		return t;
	}

	public boolean progressionUnlocked() {
		return "UNLOCKED".equalsIgnoreCase(progression.mode);
	}

	public static synchronized void load() {
		JjkConfig loaded = null;
		if (Files.exists(PATH)) {
			try (Reader r = Files.newBufferedReader(PATH, StandardCharsets.UTF_8)) {
				loaded = GSON.fromJson(r, JjkConfig.class);
			} catch (Exception e) {
				JjkShowdown.LOGGER.error("Failed to read {}, using defaults (the broken file is kept as .bak)", PATH, e);
				try {
					Files.copy(PATH, PATH.resolveSibling("common.json.bak"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
				} catch (IOException ignored) {
				}
			}
		}
		if (loaded == null) loaded = new JjkConfig();
		loaded.validate();
		instance = loaded;
		save();
	}

	public static synchronized void save() {
		try {
			Files.createDirectories(PATH.getParent());
			try (Writer w = Files.newBufferedWriter(PATH, StandardCharsets.UTF_8)) {
				GSON.toJson(instance, w);
			}
		} catch (IOException e) {
			JjkShowdown.LOGGER.error("Failed to write {}", PATH, e);
		}
	}

	/** Replace the active config (used by the config screen) and persist it. */
	public static synchronized void apply(JjkConfig cfg) {
		cfg.validate();
		instance = cfg;
		save();
	}

	public JjkConfig copy() {
		return GSON.fromJson(GSON.toJson(this), JjkConfig.class);
	}

	/** Fill nulls and clamp every value to a sane range so a hand-edited file can never crash the game. */
	public void validate() {
		if (difficulty == null) difficulty = "NORMAL";
		difficulty = Difficulty.byName(difficulty).name();
		if (progression == null) progression = new Progression();
		if (energy == null) energy = new Energy();
		if (abilities == null) abilities = new Abilities();
		if (abilities.perAbility == null) abilities.perAbility = new LinkedHashMap<>();
		if (combat == null) combat = new Combat();
		if (domains == null) domains = new Domains();
		if (destruction == null) destruction = new Destruction();
		if (ai == null) ai = new Ai();
		if (qte == null) qte = new Qte();
		if (cinematics == null) cinematics = new Cinematics();
		if (characters == null) characters = new Characters();

		if (progression.mode == null || !(progression.mode.equalsIgnoreCase("PROGRESSIVE") || progression.mode.equalsIgnoreCase("UNLOCKED"))) {
			progression.mode = "PROGRESSIVE";
		}
		progression.mode = progression.mode.toUpperCase();
		progression.xpMultiplier = Mth.clamp(progression.xpMultiplier, 0f, 100f);
		progression.startingMastery = Mth.clamp(progression.startingMastery, 1, 10);

		energy.maxMultiplier = Mth.clamp(energy.maxMultiplier, 0.1f, 20f);
		energy.regenMultiplier = Mth.clamp(energy.regenMultiplier, 0f, 20f);
		energy.costMultiplier = Mth.clamp(energy.costMultiplier, 0f, 10f);

		abilities.damageMultiplier = Mth.clamp(abilities.damageMultiplier, 0f, 50f);
		abilities.cooldownMultiplier = Mth.clamp(abilities.cooldownMultiplier, 0f, 10f);
		for (String id : ABILITY_IDS) {
			AbilityTuning t = abilities.perAbility.computeIfAbsent(id, k -> new AbilityTuning());
			t.damage = Mth.clamp(t.damage, 0f, 50f);
			t.cooldown = Mth.clamp(t.cooldown, 0f, 10f);
			t.cost = Mth.clamp(t.cost, 0f, 10f);
		}
		abilities.perAbility.values().removeIf(java.util.Objects::isNull);

		combat.comboWindowTicks = Mth.clamp(combat.comboWindowTicks, 5, 100);
		combat.parryWindowTicks = Mth.clamp(combat.parryWindowTicks, 0, 20);
		combat.dodgeIFrames = Mth.clamp(combat.dodgeIFrames, 0, 30);
		combat.dodgeCooldownTicks = Mth.clamp(combat.dodgeCooldownTicks, 0, 200);
		combat.blockDamageReduction = Mth.clamp(combat.blockDamageReduction, 0f, 1f);
		combat.blackFlashBaseChance = Mth.clamp(combat.blackFlashBaseChance, 0f, 1f);
		combat.blackFlashWindowChance = Mth.clamp(combat.blackFlashWindowChance, 0f, 1f);
		combat.blackFlashMultiplier = Mth.clamp(combat.blackFlashMultiplier, 1f, 10f);
		combat.blackFlashWindowOpenTicks = Mth.clamp(combat.blackFlashWindowOpenTicks, 1, 40);
		combat.blackFlashWindowLengthTicks = Mth.clamp(combat.blackFlashWindowLengthTicks, 1, 20);
		combat.finisherHealthThreshold = Mth.clamp(combat.finisherHealthThreshold, 0f, 1f);
		combat.meleeDamageMultiplier = Mth.clamp(combat.meleeDamageMultiplier, 0f, 20f);
		combat.fallDamageReduction = Mth.clamp(combat.fallDamageReduction, 0f, 1f);

		domains.strengthMultiplier = Mth.clamp(domains.strengthMultiplier, 0.1f, 10f);
		domains.unlimitedVoidRadius = Mth.clamp(domains.unlimitedVoidRadius, 6, 40);
		domains.malevolentShrineRadius = Mth.clamp(domains.malevolentShrineRadius, 8, 64);
		domains.durationTicks = Mth.clamp(domains.durationTicks, 60, 6000);
		domains.burnoutTicks = Mth.clamp(domains.burnoutTicks, 0, 12000);
		domains.clashMaxTicks = Mth.clamp(domains.clashMaxTicks, 60, 2400);
		domains.sureHitDamageMultiplier = Mth.clamp(domains.sureHitDamageMultiplier, 0f, 20f);

		destruction.restoreDelayTicks = Mth.clamp(destruction.restoreDelayTicks, 0, 72000);
		destruction.restoreBlocksPerTick = Mth.clamp(destruction.restoreBlocksPerTick, 16, 20000);
		destruction.maxBlockHardness = Mth.clamp(destruction.maxBlockHardness, 0f, 1200f);
		destruction.blocksPerTickBudget = Mth.clamp(destruction.blocksPerTickBudget, 0, 20000);

		ai.aggressionMultiplier = Mth.clamp(ai.aggressionMultiplier, 0f, 5f);
		ai.reactionMultiplier = Mth.clamp(ai.reactionMultiplier, 0.1f, 5f);
		ai.bossHealthMultiplier = Mth.clamp(ai.bossHealthMultiplier, 0.05f, 50f);
		ai.bossDamageMultiplier = Mth.clamp(ai.bossDamageMultiplier, 0f, 50f);

		qte.timingMultiplier = Mth.clamp(qte.timingMultiplier, 0.25f, 4f);
		if (qte.autoOutcome == null) qte.autoOutcome = "PARTIAL";
		qte.autoOutcome = qte.autoOutcome.toUpperCase();
		if (!List.of("SUCCESS", "PARTIAL", "FAIL").contains(qte.autoOutcome)) qte.autoOutcome = "PARTIAL";

		cinematics.lengthMultiplier = Mth.clamp(cinematics.lengthMultiplier, 0.25f, 3f);

		characters.healthBonus = Mth.clamp(characters.healthBonus, 0f, 200f);
		characters.speedBonus = Mth.clamp(characters.speedBonus, 0f, 1f);
	}
}
