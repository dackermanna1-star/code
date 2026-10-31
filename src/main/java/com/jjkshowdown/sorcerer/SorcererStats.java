package com.jjkshowdown.sorcerer;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.config.JjkConfig;
import net.minecraft.core.Holder;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;

/**
 * Permanent character bonuses for players (bosses define their own base attributes) and transient
 * state modifiers (blocking slow, stagger, freezes, juggling, hovering) that are applied to any sorcerer.
 * Using attributes means client-side player movement respects the server state automatically.
 */
public final class SorcererStats {
	private static final Identifier HEALTH = JjkShowdown.id("character_health");
	private static final Identifier DAMAGE = JjkShowdown.id("character_damage");
	private static final Identifier SPEED = JjkShowdown.id("character_speed");
	private static final Identifier ARMOR = JjkShowdown.id("character_armor");
	private static final Identifier KNOCKBACK = JjkShowdown.id("character_knockback");
	private static final Identifier SAFE_FALL = JjkShowdown.id("character_safe_fall");
	private static final Identifier STEP = JjkShowdown.id("character_step");
	private static final Identifier JUMP = JjkShowdown.id("character_jump");

	public static final Identifier FREEZE_SPEED = JjkShowdown.id("freeze_speed");
	public static final Identifier FREEZE_JUMP = JjkShowdown.id("freeze_jump");
	public static final Identifier BLOCK_SLOW = JjkShowdown.id("block_slow");
	public static final Identifier JUGGLE_GRAVITY = JjkShowdown.id("juggle_gravity");
	public static final Identifier HOVER_GRAVITY = JjkShowdown.id("hover_gravity");
	public static final Identifier RCT_SLOW = JjkShowdown.id("rct_slow");

	private SorcererStats() {
	}

	/** (Re)apply permanent character modifiers to a player. Safe to call any time. */
	public static void apply(LivingEntity e) {
		if (!(e instanceof Player)) return;
		CharacterType c = Sorcerers.data(e).character();
		JjkConfig.Characters cfg = JjkConfig.get().characters;
		int mastery = Mastery.effective(e);
		if (!c.isSorcerer()) {
			remove(e, Attributes.MAX_HEALTH, HEALTH);
			remove(e, Attributes.ATTACK_DAMAGE, DAMAGE);
			remove(e, Attributes.MOVEMENT_SPEED, SPEED);
			remove(e, Attributes.ARMOR, ARMOR);
			remove(e, Attributes.KNOCKBACK_RESISTANCE, KNOCKBACK);
			remove(e, Attributes.SAFE_FALL_DISTANCE, SAFE_FALL);
			remove(e, Attributes.STEP_HEIGHT, STEP);
			remove(e, Attributes.JUMP_STRENGTH, JUMP);
			if (e.getHealth() > e.getMaxHealth()) e.setHealth(e.getMaxHealth());
			return;
		}
		float masteryScale = 0.6f + 0.04f * mastery;
		set(e, Attributes.MAX_HEALTH, HEALTH, cfg.healthBonus * masteryScale, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.ATTACK_DAMAGE, DAMAGE, (c == CharacterType.SUKUNA ? 3.5 : 2.5) + 0.35 * mastery, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.MOVEMENT_SPEED, SPEED, cfg.speedBonus + (c == CharacterType.GOJO ? 0.03 : 0.0), AttributeModifier.Operation.ADD_MULTIPLIED_BASE);
		set(e, Attributes.ARMOR, ARMOR, c == CharacterType.SUKUNA ? 6 : 3, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.KNOCKBACK_RESISTANCE, KNOCKBACK, 0.3, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.SAFE_FALL_DISTANCE, SAFE_FALL, 6, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.STEP_HEIGHT, STEP, 0.45, AttributeModifier.Operation.ADD_VALUE);
		set(e, Attributes.JUMP_STRENGTH, JUMP, 0.12, AttributeModifier.Operation.ADD_VALUE);
		if (e.getHealth() > e.getMaxHealth()) e.setHealth(e.getMaxHealth());
	}

	/** Per-tick transient modifiers reflecting the runtime state. */
	public static void tickTransient(LivingEntity e, SorcererState s, boolean frozen) {
		toggle(e, Attributes.MOVEMENT_SPEED, FREEZE_SPEED, frozen || s.isStaggered(), s.isStaggered() && !frozen ? -0.85 : -1.0,
				AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(e, Attributes.JUMP_STRENGTH, FREEZE_JUMP, frozen || s.isStaggered(), -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(e, Attributes.MOVEMENT_SPEED, BLOCK_SLOW, s.blocking, -0.55, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(e, Attributes.MOVEMENT_SPEED, RCT_SLOW, s.rctActive, -0.4, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(e, Attributes.GRAVITY, JUGGLE_GRAVITY, s.juggleTicks > 0, -0.75, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(e, Attributes.GRAVITY, HOVER_GRAVITY, s.hovering, -0.92, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
	}

	/** Remove every transient modifier (on death/character reset). */
	public static void clearTransient(LivingEntity e) {
		remove(e, Attributes.MOVEMENT_SPEED, FREEZE_SPEED);
		remove(e, Attributes.JUMP_STRENGTH, FREEZE_JUMP);
		remove(e, Attributes.MOVEMENT_SPEED, BLOCK_SLOW);
		remove(e, Attributes.MOVEMENT_SPEED, RCT_SLOW);
		remove(e, Attributes.GRAVITY, JUGGLE_GRAVITY);
		remove(e, Attributes.GRAVITY, HOVER_GRAVITY);
	}

	private static void toggle(LivingEntity e, Holder<Attribute> attr, Identifier id, boolean on, double amount, AttributeModifier.Operation op) {
		AttributeInstance inst = e.getAttribute(attr);
		if (inst == null) return;
		boolean has = inst.hasModifier(id);
		if (on && !has) {
			inst.addTransientModifier(new AttributeModifier(id, amount, op));
		} else if (on) {
			AttributeModifier cur = inst.getModifier(id);
			if (cur != null && cur.amount() != amount) inst.addOrUpdateTransientModifier(new AttributeModifier(id, amount, op));
		} else if (has) {
			inst.removeModifier(id);
		}
	}

	private static void set(LivingEntity e, Holder<Attribute> attr, Identifier id, double amount, AttributeModifier.Operation op) {
		AttributeInstance inst = e.getAttribute(attr);
		if (inst != null) inst.addOrUpdateTransientModifier(new AttributeModifier(id, amount, op));
	}

	private static void remove(LivingEntity e, Holder<Attribute> attr, Identifier id) {
		AttributeInstance inst = e.getAttribute(attr);
		if (inst != null) inst.removeModifier(id);
	}
}
