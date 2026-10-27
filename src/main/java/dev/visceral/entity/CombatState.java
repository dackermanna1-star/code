package dev.visceral.entity;

import dev.visceral.combat.AttackDef;
import dev.visceral.state.PhysState;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import net.minecraft.world.entity.LivingEntity;
import org.jspecify.annotations.Nullable;

/**
 * Per-entity combat/physics state. Created lazily on first relevance. On the server this is
 * authoritative; on clients the synced fields ({@link #state} etc.) mirror the server.
 */
public final class CombatState {
	// ---- Synced -------------------------------------------------------------------------------
	public PhysState state = PhysState.STANDING;
	public int stateTicks;
	public int stateDuration;
	/** Horizontal unit direction the body is being pushed/falling towards (world). */
	public float dirX, dirZ;
	public float force;
	public boolean crawling;
	public boolean failedAttempt;

	// ---- Server: balance ----------------------------------------------------------------------
	/** 1 = perfectly balanced, 0 = about to fall. Regenerates over time. */
	public float balance = 1f;
	/** Accumulated imbalance vector (world, horizontal). Decays as the entity steps to catch itself. */
	public double imbX, imbZ;
	public int knockdowns;
	public int stepCooldown;
	/** Ticks of vulnerability after a whiffed/interrupted attack or a stagger. */
	public int openingTicks;
	public long lastImpactTime;

	// ---- Server: mob wind-up ------------------------------------------------------------------
	public int windupTicks;
	public @Nullable LivingEntity windupTarget;

	// ---- Server: player attacks ---------------------------------------------------------------
	public @Nullable AttackDef attack;
	public int attackTick;
	public float attackScale = 1f;
	public int comboStep;
	public int attackTargetHint = -1;
	public final IntOpenHashSet attackHits = new IntOpenHashSet();
	public @Nullable AttackDef queuedAttack;
	public int queuedTargetHint = -1;
	public int kickCooldown;
	public float prevSweepProgress;

	// ---- Server: misc -------------------------------------------------------------------------
	public int bleedTimer;
	public int healTimer;
	public int crawlAttackCooldown;

	public void setState(PhysState newState, int duration) {
		this.state = newState;
		this.stateTicks = 0;
		this.stateDuration = duration;
	}

	public boolean isAttacking() {
		return attack != null;
	}

	public boolean inWindup() {
		return windupTicks > 0;
	}
}
