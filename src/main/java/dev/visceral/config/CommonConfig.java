package dev.visceral.config;

/**
 * Gameplay settings. These are authoritative on the server (integrated or dedicated) and the
 * subset that affects client prediction/visuals is synced to clients on join.
 * Stored in {@code config/visceral-common.json}.
 */
public final class CommonConfig {
	public static final String FILE = "visceral-common.json";
	private static CommonConfig instance = new CommonConfig();

	public static CommonConfig get() {
		return instance;
	}

	public static void load() {
		instance = ConfigIO.load(FILE, CommonConfig.class, CommonConfig::new);
		instance.clamp();
	}

	public static void save() {
		ConfigIO.save(FILE, instance);
	}

	// --- Melee ---------------------------------------------------------------------------------
	/** Replace vanilla instant left-click attacks with timed, weapon-specific swings. */
	public boolean meleeOverhaul = true;
	/** Our timed attacks bypass the vanilla 10-tick hurt cooldown (pacing comes from the swing timeline). */
	public boolean ignoreHurtCooldown = true;
	/** Global multiplier on swing durations (higher = slower, heavier). */
	public float attackTimeScale = 1.0f;
	public float meleeDamageMultiplier = 1.0f;
	/** Multiplier on the physical force our attacks transfer (stagger/knockdown power). */
	public float meleeForceMultiplier = 1.0f;
	public float kickDamage = 2.0f;
	public float kickForce = 2.2f;
	public int kickCooldownTicks = 14;
	public float stompDamage = 5.0f;
	public boolean finishers = true;
	/** Finishers kill outright when the target is below this fraction of max health. */
	public float finisherExecuteThreshold = 0.25f;
	public float openingDamageBonus = 0.3f;
	public boolean regionalDamage = true;
	public float headDamageMultiplier = 1.4f;
	public float limbDamageMultiplier = 0.85f;

	// --- Mob behaviour -------------------------------------------------------------------------
	/** Mobs telegraph melee attacks with a short wind-up that can be interrupted (e.g. by a kick). */
	public boolean mobWindups = true;
	public int mobWindupTicks = 7;

	// --- Physical reactions --------------------------------------------------------------------
	public boolean physicalReactions = true;
	public boolean knockdownsAffectPlayers = true;
	/** Effective force needed to stagger / knock down an average humanoid. */
	public float staggerThreshold = 0.9f;
	public float knockdownThreshold = 2.6f;
	public int minDownedTicks = 30;
	public int maxDownedTicks = 120;
	public float wallSlamDamage = 2.0f;
	public boolean crawling = true;
	public boolean failedGetUpAttempts = true;
	/** Players (who cannot crawl) recover this much faster than mobs. */
	public float playerDownedTimeMultiplier = 0.6f;

	// --- Wounds & blood ------------------------------------------------------------------------
	public boolean wounds = true;
	public int maxWoundsPerEntity = 14;
	public boolean bleeding = true;
	public float bleedDamage = 0.5f;
	public boolean woundEffects = true;
	/** Server-side cap for gore: 0 = none, 1 = wounds and blood, 2 = dismemberment allowed. */
	public int maxGoreLevel = 2;

	private void clamp() {
		attackTimeScale = clamp(attackTimeScale, 0.5f, 2.0f);
		meleeDamageMultiplier = clamp(meleeDamageMultiplier, 0f, 10f);
		meleeForceMultiplier = clamp(meleeForceMultiplier, 0f, 5f);
		mobWindupTicks = Math.max(0, Math.min(20, mobWindupTicks));
		minDownedTicks = Math.max(5, minDownedTicks);
		maxDownedTicks = Math.max(minDownedTicks, maxDownedTicks);
		maxWoundsPerEntity = Math.max(0, Math.min(32, maxWoundsPerEntity));
		maxGoreLevel = Math.max(0, Math.min(2, maxGoreLevel));
		finisherExecuteThreshold = clamp(finisherExecuteThreshold, 0f, 1f);
	}

	private static float clamp(float v, float lo, float hi) {
		return Math.max(lo, Math.min(hi, v));
	}
}
