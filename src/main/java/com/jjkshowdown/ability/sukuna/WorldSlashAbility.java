package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.entity.projectile.WorldSlashEntity;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * The World-Cutting Slash ("Dismantle" aimed at the world itself). Requires the full incantation —
 * "Scale of the Dragon. Recoil. Twin Meteors." — and the hand gesture. Ignores Infinity.
 */
public class WorldSlashAbility extends Ability {
	public static final int INCANTATION = 60;

	public WorldSlashAbility() {
		super("world_slash", CharacterType.SUKUNA, AbilitySlot.ULTIMATE, Mode.CHARGE, 7, true, 700f, 1200, INCANTATION);
	}

	@Override
	public boolean autoRelease() {
		return true;
	}

	@Override
	public int minCharge() {
		return INCANTATION;
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.WORLD_SLASH, INCANTATION + 10);
		Casting.voice(ctx, VoiceLine.SUKUNA_INCANTATION, 1.0f);
		Fx.sound(ctx.caster(), ModSounds.WORLD_SLASH_CHARGE, 2.0f, 1.0f);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		ctx.state().setPose(CastPose.WORLD_SLASH, 12);
		LivingEntity c = ctx.caster();
		if (ticks % 2 == 0) {
			Fx.particles(ctx.level(), ModParticles.CE_WISP_RED, c.position().add(0, 1, 0), 3, 0.5, 0.8, 0.5, 0.02);
			Fx.particles(ctx.level(), ModParticles.SLASH, c.position().add(0, c.getBbHeight() + 0.9, 0), 1, 0.25, 0);
		}
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity caster = ctx.caster();
		LivingEntity target = ctx.target(56);
		// the cut is committed when the incantation completes: dodging (QTE) moves you out of its plane
		Vec3 lockedAim = ctx.aim();
		Runnable slash = () -> {
			if (!caster.isAlive()) return;
			CastContext now = CastContext.of(caster);
			Vec3 f = lockedAim;
			Vec3 side = f.cross(new Vec3(0, 1, 0));
			if (side.lengthSqr() < 1.0E-4) side = new Vec3(1, 0, 0);
			side = side.normalize();
			Vec3 up = side.cross(f).normalize();
			double roll = Math.toRadians(caster.getRandom().nextFloat() * 70 - 35);
			Vec3 edge = side.scale(Math.cos(roll)).add(up.scale(Math.sin(roll)));
			WorldSlashEntity w = WorldSlashEntity.create(now.level(), caster, now.eye(), f, edge, damage(caster, 40f), 56f, 9f);
			now.level().addFreshEntity(w);
			now.state().setPose(CastPose.SLASH, 16);
			Fx.sound(now.level(), caster.position(), ModSounds.WORLD_SLASH, 4.0f, 1.0f);
			Casting.voice(caster, now.state(), VoiceLine.SUKUNA_WORLD_SLASH, 1.0f);
			if (caster instanceof SorcererBoss boss) boss.onUltimateLaunched(this, w);
		};
		if (caster instanceof SorcererBoss boss && target instanceof net.minecraft.server.level.ServerPlayer) {
			// the boss lets the target react (QTE) before the cut lands
			boss.telegraphUltimate(this, slash);
		} else {
			Cinematics.play(ctx.level(), CinematicType.WORLD_SLASH, caster, target, slash);
		}
	}
}
