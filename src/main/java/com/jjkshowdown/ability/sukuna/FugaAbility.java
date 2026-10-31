package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.entity.projectile.FugaEntity;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Divine Flame "Open" — Fuga. Draw the flame arrow (hold at least one second) and loose it. Within ten seconds after
 * Malevolent Shrine it is empowered: bigger inferno, half the cost and cooldown.
 */
public class FugaAbility extends Ability {
	public FugaAbility() {
		super("fuga", CharacterType.SUKUNA, AbilitySlot.TERTIARY, Mode.CHARGE, 4, true, 380f, 400, 30);
	}

	@Override
	public int minCharge() {
		return 20;
	}

	@Override
	public float cost(LivingEntity caster) {
		float c = super.cost(caster);
		return com.jjkshowdown.sorcerer.Sorcerers.state(caster).empoweredFugaTicks > 0 ? c * 0.5f : c;
	}

	@Override
	public int cooldown(LivingEntity caster) {
		int c = super.cooldown(caster);
		return com.jjkshowdown.sorcerer.Sorcerers.state(caster).empoweredFugaTicks > 0 ? c / 2 : c;
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.BOW_DRAW, 40);
		Fx.sound(ctx.caster(), ModSounds.FUGA_CHARGE, 1.5f, 1.0f);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		ctx.state().setPose(CastPose.BOW_DRAW, 12);
		LivingEntity c = ctx.caster();
		Vec3 front = c.getEyePosition().add(ctx.aim().scale(0.9)).add(0, -0.2, 0);
		Fx.particles(ctx.level(), ParticleTypes.FLAME, front, 2 + ticks / 6, 0.25, 0.02);
		if (ticks % 2 == 0) Fx.particles(ctx.level(), ModParticles.FUGA_FLAME, front, 2, 0.1, 0.01);
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity c = ctx.caster();
		boolean empowered = ctx.state().empoweredFugaTicks > 0;
		FugaEntity f = FugaEntity.create(ctx.level(), c, damage(c, empowered ? 42f : 28f), empowered);
		f.launch(ctx.eye().add(ctx.aim().scale(1.0)).add(0, -0.15, 0), ctx.aim(), 2.1);
		ctx.level().addFreshEntity(f);
		Casting.pose(ctx, CastPose.BOW_DRAW, 8);
		Fx.sound(c, ModSounds.FUGA_FIRE, 2.0f, 1.0f);
		Casting.voice(ctx, VoiceLine.SUKUNA_FUGA, 0.9f);
		ctx.state().empoweredFugaTicks = 0;
	}
}
