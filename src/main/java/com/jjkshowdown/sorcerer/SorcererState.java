package com.jjkshowdown.sorcerer;

import com.jjkshowdown.ability.AbilitySlot;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Transient, server-side runtime state of a sorcerer (players and bosses). Never persisted; recreated on load.
 */
public final class SorcererState {
	// --- techniques ---
	public final int[] cooldowns = new int[AbilitySlot.COUNT];
	public final int[] cooldownTotals = new int[AbilitySlot.COUNT];
	public boolean infinity;
	public boolean amplification;
	public AbilitySlot chargingSlot;
	public int chargeTicks;
	/** Channelled ability (held key), e.g. Reverse Cursed Technique. */
	public AbilitySlot channelSlot;
	public int channelTicks;
	/** Mirrors {@code channelSlot == HEAL} for quick checks. */
	public boolean rctActive;
	public int burnoutTicks;
	public int burnoutTotal;
	/** Ticks of reduced regeneration after running dry. */
	public int exhaustedTicks;
	/** Bonus window after Malevolent Shrine where Fuga is empowered. */
	public int empoweredFugaTicks;

	// --- melee / combo ---
	public int comboCount;
	public int comboStep;
	public long lastComboHitTick = -1000;
	public long blackFlashOpen = -1_000_000L;
	public long blackFlashClose = -1_000_000L;
	public int zoneTicks;
	public int blackFlashChain;
	public int counterTicks;

	// --- defence / movement ---
	public boolean blocking;
	public long blockStartTick;
	public int iFrames;
	/** Tick when the current i-frames started (for "perfect dodge" detection). */
	public long dodgeTick = -1000;
	public int dodgeCooldown;
	public int airJumps;
	public boolean airDashUsed;
	public boolean hovering;
	public boolean slamming;
	public int staggerTicks;
	public int juggleTicks;

	// --- presentation / control ---
	public int cinematicLock;
	public CastPose pose = CastPose.NONE;
	public int poseTicks;
	public int poseDuration;
	public int voiceCooldown;

	// --- Infinity held projectiles ---
	public final List<UUID> heldProjectiles = new ArrayList<>();

	// --- sync bookkeeping ---
	public boolean dirty = true;
	public boolean visualDirty = true;
	public int syncTimer;
	public int lastVisualHash;

	public boolean isOnCooldown(AbilitySlot slot) {
		return cooldowns[slot.ordinal()] > 0;
	}

	public void setCooldown(AbilitySlot slot, int ticks) {
		cooldowns[slot.ordinal()] = Math.max(0, ticks);
		cooldownTotals[slot.ordinal()] = Math.max(1, ticks);
		dirty = true;
	}

	public void setPose(CastPose pose, int duration) {
		this.pose = pose;
		this.poseDuration = Math.max(1, duration);
		this.poseTicks = 0;
		this.visualDirty = true;
	}

	public boolean isBurntOut() {
		return burnoutTicks > 0;
	}

	public boolean isStaggered() {
		return staggerTicks > 0;
	}

	public boolean isLocked() {
		return cinematicLock > 0;
	}

	/** A sorcerer that cannot take any voluntary action right now. */
	public boolean isIncapacitated() {
		return staggerTicks > 0 || cinematicLock > 0;
	}

	public void resetCombat() {
		java.util.Arrays.fill(cooldowns, 0);
		chargingSlot = null;
		chargeTicks = 0;
		rctActive = false;
		channelSlot = null;
		channelTicks = 0;
		infinity = false;
		amplification = false;
		burnoutTicks = 0;
		comboCount = 0;
		comboStep = 0;
		blocking = false;
		staggerTicks = 0;
		cinematicLock = 0;
		hovering = false;
		slamming = false;
		pose = CastPose.NONE;
		heldProjectiles.clear();
		dirty = true;
		visualDirty = true;
	}
}
