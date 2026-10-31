package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.entity.projectile.RedEntity;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** Cursed Technique Reversal: Red. Point-blank it detonates instantly with devastating knockback. */
public class RedAbility extends Ability {
	public RedAbility() {
		super("red", CharacterType.GOJO, AbilitySlot.SECONDARY, Mode.CHARGE, 2, true, 170f, 110, 30);
	}

	@Override
	public float chargeCostScale(int chargeTicks) {
		return 0.7f + 0.6f * Math.min(1f, chargeTicks / (float) maxCharge);
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.POINT, maxCharge + 10);
		Fx.sound(ctx.caster(), ModSounds.RED_CHARGE, 1.0f, 1.0f);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		Vec3 tip = Casting.hand(ctx.caster(), true).add(ctx.aim().scale(0.5));
		Fx.particles(ctx.level(), ModParticles.RED_SPARK, tip, 1 + ticks / 10, 0.05 + ticks * 0.004, 0.01);
		ctx.state().setPose(CastPose.POINT, 12);
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity caster = ctx.caster();
		float f = Math.min(1f, chargeTicks / (float) maxCharge);
		float dmg = damage(caster, 9f + 10f * f);
		RedEntity red = RedEntity.create(ctx.level(), caster, f, dmg);
		LivingEntity close = ctx.target(3.8);
		Casting.pose(ctx, CastPose.POINT, 14);
		Fx.sound(caster, ModSounds.RED_FIRE, 1.5f, 1.0f);
		if (f > 0.6f) Casting.voice(ctx, VoiceLine.GOJO_RED, 0.8f);
		if (close != null && close.distanceTo(caster) < 3.8) {
			// point-blank Red: instant detonation
			red.setPos(close.getX(), close.getY() + close.getBbHeight() * 0.5, close.getZ());
			ctx.level().addFreshEntity(red);
			red.setDamage(dmg * 1.25f);
			red.detonate(ctx.level(), close.getBoundingBox().getCenter().add(ctx.aim().scale(-0.4)));
			return;
		}
		Vec3 from = ctx.eye().add(ctx.aim().scale(0.8)).add(0, -0.15, 0);
		red.launch(from, ctx.aim(), 2.3 + f * 0.9);
		ctx.level().addFreshEntity(red);
	}
}
