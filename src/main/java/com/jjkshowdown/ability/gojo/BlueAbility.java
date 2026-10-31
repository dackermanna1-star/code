package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.entity.projectile.BlueEntity;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Cursed Technique Lapse: Blue. Tap for a quick singularity at the crosshair, hold for maximum output.
 * Cast while sneaking for "Blue movement": the singularity yanks Gojo across the battlefield.
 */
public class BlueAbility extends Ability {
	public BlueAbility() {
		super("blue", CharacterType.GOJO, AbilitySlot.PRIMARY, Mode.CHARGE, 1, true, 120f, 70, 30);
	}

	@Override
	public float chargeCostScale(int chargeTicks) {
		return 0.6f + 0.6f * Math.min(1f, chargeTicks / (float) maxCharge);
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.PALM_OUT, maxCharge + 10);
		Fx.sound(ctx.caster(), ModSounds.BLUE_CAST, 0.5f, 1.6f);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		if (ticks % 2 == 0) {
			Vec3 h = Casting.hand(ctx.caster(), true);
			Fx.particles(ctx.level(), ModParticles.BLUE_SPARK, h, 2 + ticks / 8, 0.15 + ticks * 0.01, 0.02);
		}
		ctx.state().setPose(CastPose.PALM_OUT, 12);
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity caster = ctx.caster();
		float f = Math.min(1f, chargeTicks / (float) maxCharge);
		boolean movement = caster.isShiftKeyDown();
		double range = movement ? 26 : 16 + 12 * f;
		Vec3 point;
		LivingEntity target = movement ? null : ctx.target(range);
		if (target != null) {
			point = target.getBoundingBox().getCenter();
		} else {
			point = Targeting.blockAimPoint(caster, ctx.eye(), ctx.aim(), range);
			point = point.subtract(ctx.aim().scale(0.6));
		}
		BlueEntity blue = BlueEntity.create(ctx.level(), caster, point, f, damage(caster, 2.2f + 2.4f * f), movement);
		if (!movement && target == null) blue.setDrift(ctx.aim().scale(0.12));
		ctx.level().addFreshEntity(blue);
		Casting.pose(ctx, CastPose.PALM_OUT, 12);
		Fx.sound(ctx.caster(), ModSounds.BLUE_CAST, 1.4f, movement ? 1.4f : 1.0f);
		if (f > 0.5f || caster.getRandom().nextFloat() < 0.15f) Casting.voice(ctx, VoiceLine.GOJO_BLUE, 0.7f);
	}
}
