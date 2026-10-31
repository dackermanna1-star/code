package com.jjkshowdown.config;

/**
 * Difficulty presets. Every value here is multiplied with the matching fine-grained option in {@link JjkConfig},
 * so presets give a sensible baseline and the individual sliders still work on top of them.
 */
public enum Difficulty {
	EASY(0.6f, 0.75f, 0.75f, 14, 0.15f, 0.10f, 0.65f, 1.40f, 2.0f, 1.5f),
	NORMAL(1.0f, 1.0f, 1.0f, 9, 0.35f, 0.25f, 1.0f, 1.0f, 3.5f, 1.0f),
	HARD(1.35f, 1.3f, 1.15f, 6, 0.55f, 0.40f, 1.3f, 0.80f, 5.0f, 0.8f),
	NIGHTMARE(1.8f, 1.7f, 1.35f, 3, 0.75f, 0.60f, 1.65f, 0.60f, 7.0f, 0.6f);

	/** Damage dealt by rival bosses. */
	public final float bossDamage;
	/** Max health of rival bosses. */
	public final float bossHealth;
	/** Damage taken by players from all mod sources. */
	public final float playerDamageTaken;
	/** Ticks between AI decisions (lower = faster reactions). */
	public final int aiDecisionTicks;
	/** Chance that the AI reacts to an incoming technique with a dodge. */
	public final float aiDodgeChance;
	/** Chance that the AI blocks/parries an incoming melee hit. */
	public final float aiBlockChance;
	/** How eagerly the AI chooses offensive options. */
	public final float aiAggression;
	/** Multiplier on QTE windows (bigger = easier). */
	public final float qteWindow;
	/** Simulated button presses per second for the AI during a domain clash. */
	public final float aiClashRate;
	/** Multiplier on AI ultimate/domain cooldowns. */
	public final float aiUltimateCooldown;

	Difficulty(float bossDamage, float bossHealth, float playerDamageTaken, int aiDecisionTicks, float aiDodgeChance,
			float aiBlockChance, float aiAggression, float qteWindow, float aiClashRate, float aiUltimateCooldown) {
		this.bossDamage = bossDamage;
		this.bossHealth = bossHealth;
		this.playerDamageTaken = playerDamageTaken;
		this.aiDecisionTicks = aiDecisionTicks;
		this.aiDodgeChance = aiDodgeChance;
		this.aiBlockChance = aiBlockChance;
		this.aiAggression = aiAggression;
		this.qteWindow = qteWindow;
		this.aiClashRate = aiClashRate;
		this.aiUltimateCooldown = aiUltimateCooldown;
	}

	public static Difficulty byName(String s) {
		for (Difficulty d : values()) {
			if (d.name().equalsIgnoreCase(s)) return d;
		}
		return NORMAL;
	}
}
