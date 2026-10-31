package com.jjkshowdown.sorcerer;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.combat.Movement;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.projectile.TechniqueProjectile;
import com.jjkshowdown.network.ServerSync;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.util.Fx;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

import java.util.Iterator;
import java.util.UUID;

/**
 * Per-tick server logic for every living entity that carries sorcerer state: full sorcerer simulation for
 * Gojo/Sukuna (players and bosses), and lightweight status timers (stagger, juggle) for anything they hit.
 * Invoked from a {@code LivingEntity#tick} mixin.
 */
public final class SorcererTicker {
	private SorcererTicker() {
	}

	public static void tick(LivingEntity e) {
		if (!(e.level() instanceof ServerLevel level)) return;
		SorcererState s = Sorcerers.peekState(e);
		CharacterType c = Sorcerers.character(e);
		if (s == null && !c.isSorcerer()) return;
		if (s == null) s = Sorcerers.state(e);
		tickTimers(e, s);
		boolean frozen = s.cinematicLock > 0 || e.hasEffect(ModEffects.INFORMATION_OVERLOAD);
		SorcererStats.tickTransient(e, s, frozen);
		if (!c.isSorcerer()) {
			// players who are not (or no longer) sorcerers still need their client told so
			if (e instanceof net.minecraft.server.level.ServerPlayer) ServerSync.tick(e, s);
			return;
		}

		// cursed energy
		SorcererData d = Sorcerers.data(e);
		float max = CursedEnergy.max(e);
		if (d.energy < 0) d.energy = max;
		if (d.energy < max && s.channelSlot == null) {
			d.energy = Math.min(max, d.energy + CursedEnergy.regenPerTick(e, s));
			if (e.tickCount % 5 == 0) s.dirty = true;
		} else if (d.energy > max) {
			d.energy = max;
		}

		// air state
		if (e.onGround()) {
			if (s.slamming) Movement.slamImpact(e);
			s.airJumps = 0;
			s.airDashUsed = false;
			if (s.hovering) {
				s.hovering = false;
				s.visualDirty = true;
			}
		} else if (s.hovering) {
			if (!CursedEnergy.spend(e, CursedEnergy.max(e) * 0.0012f + 0.4f)) {
				s.hovering = false;
				s.visualDirty = true;
			} else {
				Vec3 v = e.getDeltaMovement();
				if (v.y < -0.05) {
					e.setDeltaMovement(v.x, -0.05, v.z);
					e.hurtMarked = true;
				}
				e.fallDistance = 0;
				if (e.tickCount % 3 == 0) Fx.particles(level, ModParticles.BLUE_SPARK, e.position(), 1, 0.2, 0.0);
			}
		}

		if (c == CharacterType.GOJO) {
			if (s.infinity) tickInfinity(level, e, s);
			releaseHeld(level, e, s);
		}
		AbilityHandler.tick(e, s);

		// auras
		if (e.tickCount % 2 == 0) {
			if (s.zoneTicks > 0) Fx.particles(level, ModParticles.BLACK_FLASH, e.position().add(0, 1, 0), 1, 0.35, 0.6, 0.35, 0.01);
			if (s.amplification) Fx.particles(level, ModParticles.CE_WISP_RED, e.position().add(0, 1, 0), 1, 0.3, 0.6, 0.3, 0.01);
		}
		ServerSync.tick(e, s);
	}

	private static void tickTimers(LivingEntity e, SorcererState s) {
		for (int i = 0; i < AbilitySlot.COUNT; i++) {
			if (s.cooldowns[i] > 0 && --s.cooldowns[i] % 10 == 0) s.dirty = true;
		}
		if (s.burnoutTicks > 0) {
			s.burnoutTicks--;
			if (s.burnoutTicks % 20 == 0) s.dirty = true;
			if (s.burnoutTicks == 0) s.visualDirty = true;
		}
		if (s.staggerTicks > 0 && --s.staggerTicks == 0) s.dirty = true;
		if (s.iFrames > 0) s.iFrames--;
		if (s.dodgeCooldown > 0) s.dodgeCooldown--;
		if (s.counterTicks > 0 && --s.counterTicks == 0) s.dirty = true;
		if (s.zoneTicks > 0 && --s.zoneTicks == 0) s.visualDirty = true;
		if (s.exhaustedTicks > 0) s.exhaustedTicks--;
		if (s.juggleTicks > 0) s.juggleTicks--;
		if (s.voiceCooldown > 0) s.voiceCooldown--;
		if (s.cinematicLock > 0 && --s.cinematicLock == 0) s.dirty = true;
		if (s.empoweredFugaTicks > 0) s.empoweredFugaTicks--;
		if (s.pose != CastPose.NONE && ++s.poseTicks >= s.poseDuration) {
			s.pose = CastPose.NONE;
			s.poseTicks = 0;
			s.visualDirty = true;
		}
		if (s.comboCount > 0 && e.level().getGameTime() - s.lastComboHitTick > JjkConfig.get().combat.comboWindowTicks) {
			s.comboCount = 0;
			s.comboStep = 0;
			s.dirty = true;
		}
	}

	/** Infinity: projectiles slow asymptotically and hang in the air; approaching bodies can never close the gap. */
	private static void tickInfinity(ServerLevel level, LivingEntity gojo, SorcererState s) {
		Vec3 center = gojo.getBoundingBox().getCenter();
		AABB box = gojo.getBoundingBox().inflate(4.0);
		for (Projectile p : level.getEntitiesOfClass(Projectile.class, box, p -> p.getOwner() != gojo && !(p instanceof TechniqueProjectile))) {
			Vec3 to = center.subtract(p.position());
			double dist = to.length();
			if (dist > 3.4) continue;
			Vec3 v = p.getDeltaMovement();
			boolean held = s.heldProjectiles.contains(p.getUUID());
			if (held || v.dot(to) > 0) {
				double k = Math.max(0.0, (dist - 1.0) / 2.4) * 0.25;
				p.setDeltaMovement(v.scale(k));
				p.setNoGravity(true);
				p.hurtMarked = true;
				if (!held) {
					s.heldProjectiles.add(p.getUUID());
					Fx.particles(level, ModParticles.BLUE_SPARK, p.position(), 4, 0.1, 0.01);
				}
			}
		}
		for (LivingEntity le : level.getEntitiesOfClass(LivingEntity.class, gojo.getBoundingBox().inflate(1.3),
				x -> x != gojo && x.isAlive() && !Sorcerers.hasAmplification(x) && !x.isSpectator())) {
			Vec3 away = le.position().subtract(gojo.position());
			away = new Vec3(away.x, 0, away.z);
			if (away.lengthSqr() < 1.0E-4) away = new Vec3(1, 0, 0);
			away = away.normalize();
			Vec3 v = le.getDeltaMovement();
			double toward = -v.dot(away);
			if (toward > 0) v = v.add(away.scale(toward));
			le.setDeltaMovement(v.add(away.scale(0.05)));
			le.hurtMarked = true;
		}
	}

	private static void releaseHeld(ServerLevel level, LivingEntity gojo, SorcererState s) {
		if (s.heldProjectiles.isEmpty()) return;
		Iterator<UUID> it = s.heldProjectiles.iterator();
		while (it.hasNext()) {
			Entity p = level.getEntity(it.next());
			if (p == null || p.isRemoved()) {
				it.remove();
			} else if (!s.infinity || p.distanceTo(gojo) > 4.5) {
				p.setNoGravity(false);
				it.remove();
			}
		}
	}
}
