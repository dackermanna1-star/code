package dev.juukulius.combat;

import dev.juukulius.config.JuliusServerConfig;

/**
 * Shared timing and balance rules. The client uses the timings to predict animations without waiting for the server,
 * the server uses the same numbers (plus a small latency tolerance) to validate every request.
 */
public final class CombatRules {
	private CombatRules() {
	}

	// ---------------------------------------------------------------- mana
	public static final float MAX_MANA = 100.0F;
	/** Mana per tick while untransformed: the spirits rest in their crystals (10/s). */
	public static final float REGEN_UNTRANSFORMED = 0.5F;
	/** Mana per tick while transformed with spirits manifested (5/s). */
	public static final float REGEN_TRANSFORMED = 0.25F;
	/** Mana per tick while transformed but with the spirits dismissed (8/s). */
	public static final float REGEN_SPIRITS_RESTING = 0.4F;
	/** Regeneration pauses for this many ticks after any mana is spent. */
	public static final int REGEN_DELAY_TICKS = 20;
	/** Every enemy struck by a sword-combo hit restores this much mana. */
	public static final float MANA_PER_SWORD_HIT = 2.0F;
	/** Mana restored on respawn. */
	public static final float MANA_AFTER_DEATH = 50.0F;

	// ---------------------------------------------------------------- transformation
	public static final int TRANSFORM_COOLDOWN = 40;
	public static final int TRANSFORM_LOCK = 24;
	public static final int REVERT_LOCK = 14;
	public static final int SPIRIT_TOGGLE_COOLDOWN = 16;
	public static final int SPIRIT_TOGGLE_LOCK = 10;

	// ---------------------------------------------------------------- Al Cranvel
	public static final int ULTIMATE_MIN_MANA = 60;
	public static final int ULTIMATE_DURATION = 400;
	public static final int ULTIMATE_END_LOCK = 16;
	public static final float ULTIMATE_COST_MULTIPLIER = 0.5F;
	public static final float ULTIMATE_COOLDOWN_RATE = 1.6F;
	public static final float ULTIMATE_SPEED = 1.3F;
	public static final float ULTIMATE_DAMAGE_MULTIPLIER = 1.5F;

	// ---------------------------------------------------------------- sword
	/** Three-hit combo: total length, impact tick, earliest tick to chain, last tick to chain. */
	public static final ComboStep[] COMBO = {
		new ComboStep(1, 8, 3, 4, 15, 6.0F, 0.32F, 3.4, 78.0),
		new ComboStep(2, 8, 3, 4, 15, 6.5F, 0.32F, 3.4, 78.0),
		new ComboStep(3, 13, 5, 99, 0, 9.0F, 0.95F, 3.9, 50.0)
	};
	/** Extra recovery after the finisher before a new combo may start. */
	public static final int FINISHER_RECOVERY = 2;
	/** Requests may arrive this many ticks early because of network jitter. */
	public static final int INPUT_TOLERANCE = 2;

	public static final int HEAVY_IMPACT_TICK = 7;
	public static final float HEAVY_DAMAGE = 14.0F;
	public static final float HEAVY_KNOCKBACK = 1.7F;
	public static final double HEAVY_REACH = 4.6;

	public static final int CHARGE_MIN_TICKS = 8;
	public static final int CHARGE_FULL_TICKS = 30;
	public static final float WAVE_MIN_DAMAGE = 7.0F;
	public static final float WAVE_MAX_DAMAGE = 17.0F;
	public static final int WAVE_EXTRA_COST = 15;

	public static int scaled(int ticks, float speed) {
		return Math.max(1, Math.round(ticks / speed));
	}

	public static float chargeProgress(int ticksUsed) {
		if (ticksUsed < CHARGE_MIN_TICKS) {
			return 0.0F;
		}

		return Math.min(1.0F, (ticksUsed - CHARGE_MIN_TICKS) / (float) (CHARGE_FULL_TICKS - CHARGE_MIN_TICKS));
	}

	/** Mana cost after Al Cranvel and server config are applied. */
	public static float cost(Ability ability, boolean ultimateActive) {
		float cost = ability.manaCost * (float) JuliusServerConfig.get().manaCostMultiplier;
		if (ultimateActive && ability != Ability.AL_CRANVEL) {
			cost *= ULTIMATE_COST_MULTIPLIER;
		}

		return cost;
	}

	public static int cooldown(Ability ability) {
		return Math.max(1, Math.round(ability.cooldownTicks * (float) JuliusServerConfig.get().cooldownMultiplier));
	}

	public record ComboStep(int step, int totalTicks, int impactTick, int chainFrom, int chainUntil, float damage, float knockback,
		double reach, double halfAngleDegrees) {
	}
}
