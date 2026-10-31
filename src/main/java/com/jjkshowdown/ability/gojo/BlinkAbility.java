package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Instant movement by contracting the space in between (a Blue/Infinity application). Targeting an enemy
 * places Gojo directly behind them, facing their back.
 */
public class BlinkAbility extends Ability {
	public BlinkAbility() {
		super("blink", CharacterType.GOJO, AbilitySlot.TERTIARY, Mode.INSTANT, 1, true, 35f, 22, 0);
	}

	@Override
	public Component checkUse(CastContext ctx) {
		return destination(ctx) == null ? Component.translatable("message.jjkshowdown.no_space") : null;
	}

	private Vec3 destination(CastContext ctx) {
		LivingEntity caster = ctx.caster();
		LivingEntity target = ctx.target(26);
		if (target != null) {
			Vec3 behind = target.position().subtract(target.getLookAngle().multiply(1, 0, 1).normalize().scale(1.6));
			Vec3 spot = Casting.safeSpot(ctx.level(), caster, behind, target.position());
			if (spot != null) return spot;
		}
		Vec3 aim = Targeting.blockAimPoint(caster, ctx.eye(), ctx.aim(), 20);
		Vec3 feet = aim.subtract(ctx.aim().scale(0.8)).subtract(0, caster.getEyeHeight() * 0.5, 0);
		return Casting.safeSpot(ctx.level(), caster, feet, caster.position());
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity caster = ctx.caster();
		Vec3 dest = destination(ctx);
		if (dest == null) return;
		Vec3 from = caster.position();
		LivingEntity target = ctx.target(26);
		float yaw = caster.getYRot(), pitch = caster.getXRot();
		if (target != null && target.position().distanceTo(dest) < 3) {
			yaw = Casting.yawTowards(dest, target.position());
			pitch = Casting.pitchTowards(dest.add(0, caster.getEyeHeight(), 0), target.getEyePosition());
		}
		Fx.particles(ctx.level(), ModParticles.CE_WISP_BLUE, from.add(0, 1, 0), 14, 0.3, 0.6, 0.3, 0.02);
		Casting.teleport(ctx.level(), caster, dest, yaw, pitch);
		Fx.particles(ctx.level(), ModParticles.BLUE_SPARK, dest.add(0, 1, 0), 18, 0.3, 0.6, 0.3, 0.08);
		Fx.sound(ctx.level(), from, ModSounds.BLINK, 1.0f, 1.3f);
		Fx.sound(ctx.level(), dest, ModSounds.BLINK, 1.0f, 1.0f);
		ctx.state().iFrames = Math.max(ctx.state().iFrames, 3);
		ctx.state().dodgeTick = ctx.level().getGameTime();
	}
}
