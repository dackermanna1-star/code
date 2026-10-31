package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.entity.projectile.HollowPurpleEntity;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.util.Fx;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Hollow Technique: Purple. Converge Blue and Red into imaginary mass. Hold to charge (2s); with mastery 9+ keep
 * holding through the full incantation for the 200% output. Fires at the end of its cinematic.
 */
public class HollowPurpleAbility extends Ability {
	public static final int FULL = 40;
	public static final int INCANTATION = 100;

	public HollowPurpleAbility() {
		super("hollow_purple", CharacterType.GOJO, AbilitySlot.ULTIMATE, Mode.CHARGE, 6, true, 620f, 900, INCANTATION);
	}

	@Override
	public int maxCharge(LivingEntity caster) {
		return Mastery.effective(caster) >= 9 ? INCANTATION : FULL;
	}

	@Override
	public boolean autoRelease() {
		return true;
	}

	@Override
	public int minCharge() {
		return FULL;
	}

	@Override
	public float chargeCostScale(int chargeTicks) {
		return chargeTicks >= INCANTATION ? 1.35f : 1.0f;
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.PURPLE_CHARGE, INCANTATION + 10);
		Fx.sound(ctx.caster(), ModSounds.PURPLE_CHARGE, 1.6f, 1.0f);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		ctx.state().setPose(CastPose.PURPLE_CHARGE, 14);
		LivingEntity c = ctx.caster();
		float f = Math.min(1f, ticks / (float) FULL);
		Vec3 left = Casting.hand(c, false), right = Casting.hand(c, true);
		Vec3 mid = left.lerp(right, 0.5).add(c.getLookAngle().scale(0.4));
		Vec3 l = left.lerp(mid, f), r = right.lerp(mid, f);
		if (ticks % 2 == 0) {
			Fx.particles(ctx.level(), ModParticles.BLUE_SPARK, l, 3, 0.12, 0.01);
			Fx.particles(ctx.level(), ModParticles.RED_SPARK, r, 3, 0.12, 0.01);
		}
		if (ticks >= FULL && ticks % 3 == 0) Fx.particles(ctx.level(), ModParticles.PURPLE_SPARK, mid, 4, 0.3, 0.03);
		if (ticks == FULL && maxCharge(c) > FULL) {
			Casting.voice(ctx, VoiceLine.GOJO_PURPLE_INCANTATION, 1.0f);
			Fx.sound(c, ModSounds.PURPLE_CHARGE, 1.8f, 0.8f);
		}
		if (ticks == FULL) JjkNetwork.shakeAround(ctx.level(), c.position(), 32, 0.25f, 10);
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity caster = ctx.caster();
		boolean max = chargeTicks >= INCANTATION;
		Casting.pose(ctx, CastPose.PURPLE_CHARGE, 80);
		LivingEntity target = ctx.target(64);
		Runnable fire = () -> {
			if (!caster.isAlive()) return;
			CastContext now = CastContext.of(caster);
			Vec3 aim = now.aim();
			float radius = max ? 4.4f : 2.7f;
			HollowPurpleEntity p = HollowPurpleEntity.create(now.level(), caster, radius, damage(caster, max ? 95f : 48f), max ? 95 : 75);
			p.launch(now.eye().add(aim.scale(radius + 0.6)).add(0, -0.4, 0), aim, max ? 1.35 : 1.55);
			now.level().addFreshEntity(p);
			now.state().setPose(CastPose.PURPLE_FIRE, 20);
			Fx.sound(now.level(), caster.position(), ModSounds.PURPLE_FIRE, 4.0f, max ? 0.8f : 1.0f);
			JjkNetwork.shakeAround(now.level(), caster.position(), 96, max ? 1.8f : 1.2f, 30);
			JjkNetwork.flashAround(now.level(), caster.position(), 64, 0.7f, 12, 0xB060FF);
			Casting.voice(caster, now.state(), VoiceLine.GOJO_PURPLE, 1.0f);
			if (caster instanceof SorcererBoss boss) boss.onUltimateLaunched(this, p);
		};
		Cinematics.play(ctx.level(), max ? CinematicType.HOLLOW_PURPLE_200 : CinematicType.HOLLOW_PURPLE, caster, target, fire);
	}
}
