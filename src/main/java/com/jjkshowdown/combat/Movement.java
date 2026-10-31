package com.jjkshowdown.combat;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Mobility and defence: dodges (Gojo blinks, Sukuna dashes) with i-frames, air dashes, double jumps,
 * Gojo's hover, plunging slams with shockwaves, and guarding.
 */
public final class Movement {
	private Movement() {
	}

	public static void handleAction(ServerPlayer p, int action, float x, float z) {
		if (!Sorcerers.isSorcerer(p) || !p.isAlive()) return;
		SorcererState s = Sorcerers.state(p);
		boolean frozen = s.isIncapacitated() || p.hasEffect(ModEffects.INFORMATION_OVERLOAD);
		switch (action) {
			case Payloads.CombatAction.DODGE -> {
				if (!frozen) dodge(p, x, z);
			}
			case Payloads.CombatAction.DOUBLE_JUMP -> {
				if (!frozen) doubleJump(p);
			}
			case Payloads.CombatAction.BLOCK_START -> {
				if (!frozen) startBlock(p);
			}
			case Payloads.CombatAction.BLOCK_END -> stopBlock(p);
			case Payloads.CombatAction.HOVER_START -> {
				if (!frozen && Sorcerers.character(p) == CharacterType.GOJO && !p.onGround() && CursedEnergy.has(p, 20)) {
					s.hovering = true;
					s.visualDirty = true;
				}
			}
			case Payloads.CombatAction.HOVER_END -> {
				s.hovering = false;
				s.visualDirty = true;
			}
			default -> {
			}
		}
	}

	public static void startBlock(LivingEntity e) {
		SorcererState s = Sorcerers.state(e);
		if (s.blocking) return;
		AbilityHandler.interrupt(e);
		s.blocking = true;
		s.blockStartTick = e.level().getGameTime();
		s.setPose(CastPose.BLOCK, 100000);
		s.dirty = s.visualDirty = true;
	}

	public static void stopBlock(LivingEntity e) {
		SorcererState s = Sorcerers.state(e);
		if (!s.blocking) return;
		s.blocking = false;
		if (s.pose == CastPose.BLOCK) s.setPose(CastPose.NONE, 1);
		s.dirty = s.visualDirty = true;
	}

	/**
	 * @param x local strafe input (left positive)
	 * @param z local forward input
	 */
	public static boolean dodge(LivingEntity e, float x, float z) {
		JjkConfig.Combat cfg = JjkConfig.get().combat;
		SorcererState s = Sorcerers.state(e);
		if (s.dodgeCooldown > 0) return false;
		boolean air = !e.onGround();
		if (air && e.getXRot() > 50) return slam(e);
		if (air && s.airDashUsed) return false;
		if (!CursedEnergy.spend(e, 25)) return false;
		if (air) s.airDashUsed = true;
		stopBlock(e);
		float yaw = (float) Math.toRadians(e.getYRot());
		Vec3 fwd = new Vec3(-Math.sin(yaw), 0, Math.cos(yaw));
		Vec3 left = new Vec3(Math.cos(yaw), 0, Math.sin(yaw));
		Vec3 dir = fwd.scale(z).add(left.scale(x));
		if (dir.lengthSqr() < 1.0E-3) dir = fwd.scale(-1);
		dir = dir.normalize();
		ServerLevel level = (ServerLevel) e.level();
		Vec3 from = e.position();
		boolean blinked = false;
		if (Sorcerers.character(e) == CharacterType.GOJO) {
			Vec3 spot = Casting.safeSpot(level, e, from.add(dir.scale(4.5)), from);
			if (spot != null && spot.distanceTo(from) > 1.5) {
				Casting.teleport(level, e, spot, e.getYRot(), e.getXRot());
				Fx.sound(level, from, ModSounds.BLINK, 0.8f, 1.5f);
				Fx.particles(level, ModParticles.CE_WISP_BLUE, from.add(0, 1, 0), 10, 0.25, 0.6, 0.25, 0.02);
				Fx.particles(level, ModParticles.BLUE_SPARK, spot.add(0, 1, 0), 10, 0.25, 0.6, 0.25, 0.05);
				blinked = true;
			}
		}
		if (!blinked) {
			TechniqueDamage.setVelocity(e, dir.scale(air ? 1.25 : 1.55).add(0, air ? 0.22 : 0.12, 0));
			Fx.particles(level, ParticleTypes.CLOUD, from.add(0, 0.2, 0), 8, 0.3, 0.05, 0.3, 0.05);
			Fx.particles(level, Sorcerers.character(e) == CharacterType.SUKUNA ? ModParticles.CE_WISP_RED : ModParticles.CE_WISP_BLUE,
					from.add(0, 1, 0), 6, 0.2, 0.5, 0.2, 0.02);
		}
		Fx.sound(e, ModSounds.DODGE, 1.0f, 0.9f + e.getRandom().nextFloat() * 0.2f);
		s.iFrames = cfg.dodgeIFrames;
		s.dodgeTick = level.getGameTime();
		s.dodgeCooldown = cfg.dodgeCooldownTicks;
		s.dirty = true;
		return true;
	}

	public static boolean doubleJump(LivingEntity e) {
		if (!JjkConfig.get().combat.doubleJump || e.onGround()) return false;
		SorcererState s = Sorcerers.state(e);
		int max = Sorcerers.character(e) == CharacterType.GOJO ? 2 : 1;
		if (s.airJumps >= max || !CursedEnergy.spend(e, 20)) return false;
		s.airJumps++;
		Vec3 v = e.getDeltaMovement();
		TechniqueDamage.setVelocity(e, new Vec3(v.x * 1.1, Sorcerers.character(e) == CharacterType.SUKUNA ? 0.85 : 0.75, v.z * 1.1));
		e.fallDistance = 0;
		ServerLevel level = (ServerLevel) e.level();
		Fx.ring(level, ParticleTypes.CLOUD, e.position(), 0.6, 12, 0.12);
		Fx.sound(e, ModSounds.DOUBLE_JUMP, 0.9f, 1.0f + s.airJumps * 0.1f);
		return true;
	}

	public static boolean slam(LivingEntity e) {
		SorcererState s = Sorcerers.state(e);
		if (s.slamming || !CursedEnergy.spend(e, 30)) return false;
		s.slamming = true;
		Vec3 look = e.getLookAngle();
		TechniqueDamage.setVelocity(e, new Vec3(look.x * 0.6, -2.6, look.z * 0.6));
		Fx.sound(e, ModSounds.DODGE, 1.2f, 0.6f);
		s.dodgeCooldown = JjkConfig.get().combat.dodgeCooldownTicks;
		return true;
	}

	/** Called when a slamming sorcerer lands. */
	public static void slamImpact(LivingEntity e) {
		SorcererState s = Sorcerers.state(e);
		s.slamming = false;
		ServerLevel level = (ServerLevel) e.level();
		Vec3 at = e.position();
		float base = (float) e.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.ATTACK_DAMAGE);
		for (LivingEntity t : Targeting.livingInRadius(e, at, 4.5)) {
			double d = t.position().distanceTo(at);
			float f = (float) Math.max(0.35, 1 - d / 5.0);
			TechniqueDamage.hurt(t, ModDamageTypes.SLAM, e, e, (6f + base) * f, true);
			TechniqueDamage.setVelocity(t, t.position().subtract(at).normalize().scale(0.8 * f).add(0, 0.75 * f + 0.2, 0));
		}
		Destruction.carveSphere(level, at.add(0, -0.8, 0), 2.2, e, 3f, 0.6f, null);
		Fx.ring(level, ParticleTypes.CLOUD, at.add(0, 0.1, 0), 1.0, 28, 0.45);
		Fx.particles(level, ModParticles.SHOCKWAVE, at.add(0, 0.1, 0), 1, 0, 0);
		Fx.particles(level, ModParticles.IMPACT_FLASH, at.add(0, 0.5, 0), 1, 0, 0);
		Fx.sound(e, ModSounds.SLAM, 2.0f, 1.0f);
		JjkNetwork.shakeAround(level, at, 24, 1.0f, 14);
		e.fallDistance = 0;
	}
}
