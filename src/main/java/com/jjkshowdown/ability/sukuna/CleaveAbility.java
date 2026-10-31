package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Scheduler;
import com.jjkshowdown.util.Targeting;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

import java.util.List;

/**
 * Cleave. A close-range technique that adjusts itself to the target's toughness and cursed energy: the sturdier the
 * target, the deeper the cut. Tap for a single-target flurry; charge for a sweeping cleave of everything in front.
 */
public class CleaveAbility extends Ability {
	public CleaveAbility() {
		super("cleave", CharacterType.SUKUNA, AbilitySlot.SECONDARY, Mode.CHARGE, 1, true, 140f, 100, 20);
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.CLEAVE, 24);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		ctx.state().setPose(CastPose.CLEAVE, 10);
		if (ticks % 3 == 0) Fx.particles(ctx.level(), ModParticles.CE_WISP_RED, Casting.hand(ctx.caster(), true), 2, 0.15, 0.02);
	}

	/** Toughness-adaptive damage. */
	public float cleaveDamage(LivingEntity caster, LivingEntity target, float scale) {
		float base = damage(caster, 7f);
		float toughness = (float) (target.getAttributeValue(Attributes.ARMOR) * 0.8 + target.getAttributeValue(Attributes.ARMOR_TOUGHNESS) * 0.6);
		float hp = Math.min(target.getMaxHealth() * 0.12f, target instanceof SorcererBoss || target instanceof Player ? 9f : 40f);
		if (Sorcerers.isSorcerer(target)) hp *= 0.75f;
		return (base + toughness + hp) * scale;
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity c = ctx.caster();
		Casting.pose(ctx, CastPose.CLEAVE, 14);
		Fx.sound(c, ModSounds.CLEAVE, 1.5f, 1.0f);
		Casting.voice(ctx, VoiceLine.SUKUNA_CLEAVE, 0.3f);
		if (chargeTicks >= maxCharge) {
			List<LivingEntity> hits = Targeting.livingInCone(c, 7.5, 40);
			for (LivingEntity t : hits) flurry(ctx, t, 0.75f);
			Vec3 front = c.getEyePosition().add(ctx.aim().scale(3));
			Fx.particles(ctx.level(), ModParticles.SLASH_RED, front, 8, 2.0, 1.0, 2.0, 0.0);
			return;
		}
		LivingEntity t = ctx.target(6.5);
		if (t == null) {
			List<LivingEntity> cone = Targeting.livingInCone(c, 4.5, 35);
			if (!cone.isEmpty()) t = cone.get(0);
		}
		if (t != null) {
			flurry(ctx, t, 1.0f);
		} else {
			Fx.particles(ctx.level(), ModParticles.SLASH_RED, c.getEyePosition().add(ctx.aim().scale(2.5)), 3, 0.6, 0.0);
		}
	}

	private void flurry(CastContext ctx, LivingEntity t, float scale) {
		LivingEntity c = ctx.caster();
		float total = cleaveDamage(c, t, scale);
		int hits = 4;
		for (int i = 0; i < hits; i++) {
			final int idx = i;
			Scheduler.schedule(i * 2, () -> {
				if (!t.isAlive() || !c.isAlive()) return;
				float part = idx == hits - 1 ? total * 0.4f : total * 0.2f;
				TechniqueDamage.hurt(t, ModDamageTypes.CLEAVE, c, c, part, true);
				Vec3 at = t.getBoundingBox().getCenter();
				Fx.particles(ctx.level(), ModParticles.SLASH_RED, at, 2, 0.35, 0.0);
				Fx.particles(ctx.level(), ModParticles.BLOOD, at, 5, 0.3, 0.15);
				if (idx == hits - 1) {
					TechniqueDamage.knockAway(t, c.position(), 0.6, 0.25);
					Fx.particles(ctx.level(), ModParticles.IMPACT_FLASH, at, 1, 0, 0);
				}
				t.hurtMarked = true;
			});
		}
		Sorcerers.state(t).staggerTicks = Math.max(Sorcerers.state(t).staggerTicks, 10);
	}
}
