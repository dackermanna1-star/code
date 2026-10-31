package com.jjkshowdown.ability;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;

/**
 * Base class for every technique. Abilities are stateless singletons: per-caster state lives in
 * {@link SorcererState}. The same code path serves players and the rival boss AI.
 */
public abstract class Ability {
	public enum Mode {
		/** Fires on press. */
		INSTANT,
		/** Hold to charge, fires on release (or automatically at full charge if {@link #autoRelease()}). */
		CHARGE,
		/** Active while held. */
		CHANNEL,
		/** Press to switch on/off. */
		TOGGLE
	}

	public final String id;
	public final CharacterType character;
	public final AbilitySlot slot;
	public final Mode mode;
	public final int unlockLevel;
	/** Innate-technique abilities are disabled by burnout and by Domain Amplification. */
	public final boolean technique;
	protected final float baseCost;
	protected final int baseCooldown;
	/** Ticks to reach full charge (CHARGE mode). */
	public final int maxCharge;

	protected Ability(String id, CharacterType character, AbilitySlot slot, Mode mode, int unlockLevel, boolean technique,
			float baseCost, int baseCooldown, int maxCharge) {
		this.id = id;
		this.character = character;
		this.slot = slot;
		this.mode = mode;
		this.unlockLevel = unlockLevel;
		this.technique = technique;
		this.baseCost = baseCost;
		this.baseCooldown = baseCooldown;
		this.maxCharge = maxCharge;
	}

	public Component displayName() {
		return Component.translatable("ability.jjkshowdown." + id);
	}

	public Component description() {
		return Component.translatable("ability.jjkshowdown." + id + ".desc");
	}

	public Identifier icon() {
		return com.jjkshowdown.JjkShowdown.id("textures/gui/icons/" + id + ".png");
	}

	public boolean enabledInConfig() {
		return JjkConfig.get().tuning(id).enabled;
	}

	// ------------------------------------------------------------------------------------------------ scaling

	/** Cursed energy cost (Gojo's Six Eyes make him dramatically more efficient). */
	public float cost(LivingEntity caster) {
		JjkConfig cfg = JjkConfig.get();
		float c = baseCost * cfg.energy.costMultiplier * cfg.tuning(id).cost;
		if (Sorcerers.character(caster) == CharacterType.GOJO) {
			c *= 0.62f - 0.017f * (Mastery.effective(caster) - 1);
		}
		return c;
	}

	public int cooldown(LivingEntity caster) {
		JjkConfig cfg = JjkConfig.get();
		float cd = baseCooldown * cfg.abilities.cooldownMultiplier * cfg.tuning(id).cooldown;
		cd *= 1.0f - 0.025f * (Mastery.effective(caster) - 1);
		if (caster instanceof SorcererBoss boss) cd *= boss.cooldownScale(this);
		return Math.max(0, Math.round(cd));
	}

	/** Scale a base damage value by config, mastery, fingers, zone/counter state and boss difficulty. */
	public float damage(LivingEntity caster, float base) {
		JjkConfig cfg = JjkConfig.get();
		float d = base * cfg.abilities.damageMultiplier * cfg.tuning(id).damage * Mastery.powerMultiplier(caster);
		SorcererState s = Sorcerers.state(caster);
		if (s.zoneTicks > 0) d *= 1.25f;
		if (s.counterTicks > 0) d *= 1.25f;
		if (caster instanceof SorcererBoss boss) {
			d *= boss.damageScale();
			if (slot == AbilitySlot.ULTIMATE) d *= 0.7f;
		}
		return d;
	}

	/** Full-charge duration for this caster (some abilities extend it with mastery). */
	public int maxCharge(LivingEntity caster) {
		return maxCharge;
	}

	/** Should a CHARGE ability fire by itself once fully charged? */
	public boolean autoRelease() {
		return false;
	}

	/** Minimum charge for a release to count; shorter releases fall back to a tap cast (chargeTicks = 0) if allowed. */
	public int minCharge() {
		return 0;
	}

	/** Cost multiplier based on charge progress (CHARGE abilities). */
	public float chargeCostScale(int chargeTicks) {
		return 1.0f;
	}

	// ------------------------------------------------------------------------------------------------ hooks

	/** Extra preconditions. Return a reason component to refuse, or null to allow. */
	public Component checkUse(CastContext ctx) {
		return null;
	}

	/** INSTANT: on press. CHARGE: on release / auto-release. */
	public void cast(CastContext ctx, int chargeTicks) {
	}

	public void onChargeStart(CastContext ctx) {
	}

	public void onChargeTick(CastContext ctx, int ticks) {
	}

	public void onChargeCancel(CastContext ctx) {
	}

	/** CHANNEL: called every tick while held; return false to stop. */
	public boolean channelTick(CastContext ctx, int ticks) {
		return false;
	}

	public void onChannelStop(CastContext ctx, int ticks) {
	}

	/** TOGGLE: state change. */
	public void onToggle(CastContext ctx, boolean on) {
	}

	/** TOGGLE: called every tick while on; return false to switch off. */
	public boolean toggleTick(CastContext ctx) {
		return true;
	}

	public boolean isToggledOn(SorcererState s) {
		return false;
	}

	public void setToggled(SorcererState s, boolean on) {
	}
}
