package com.jjkshowdown.combat;

import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Hand-to-hand combat: a four-step combo string (launcher/spike finisher), aerial juggling, counters after parries
 * and perfect dodges, and Black Flash — a timing-based critical where cursed energy meets the blow within the
 * "zone" window (shown on the HUD), dealing massive damage and putting the sorcerer in the zone.
 */
public final class ComboSystem {
	private ComboSystem() {
	}

	public record MeleeResult(float amount, int step, int combo, boolean blackFlash, boolean counter) {
	}

	static MeleeResult onMeleeHit(ServerLevel level, LivingEntity attacker, LivingEntity target, float amount) {
		JjkConfig.Combat cfg = JjkConfig.get().combat;
		SorcererState s = Sorcerers.state(attacker);
		long now = level.getGameTime();
		boolean chained = now - s.lastComboHitTick <= cfg.comboWindowTicks;
		if (chained) {
			s.comboCount++;
			s.comboStep = s.comboStep % 4 + 1;
		} else {
			s.comboCount = 1;
			s.comboStep = 1;
		}
		boolean inWindow = now >= s.blackFlashOpen && now <= s.blackFlashClose;
		float mult = switch (s.comboStep) {
			case 2 -> 1.12f;
			case 3 -> 1.25f;
			case 4 -> 1.6f;
			default -> 1.0f;
		};
		boolean counter = s.counterTicks > 0;
		if (counter) {
			mult *= 1.75f;
			s.counterTicks = 0;
		}
		float chance = inWindow ? cfg.blackFlashWindowChance : cfg.blackFlashBaseChance;
		if (s.zoneTicks > 0) chance += 0.12f;
		chance += Math.min(0.2f, s.blackFlashChain * 0.06f);
		if (attacker instanceof SorcererBoss boss) chance *= boss.blackFlashScale();
		boolean blackFlash = attacker.getRandom().nextFloat() < chance;
		if (blackFlash) {
			mult *= cfg.blackFlashMultiplier;
			s.blackFlashChain++;
			s.zoneTicks = 240;
		} else if (!inWindow) {
			s.blackFlashChain = 0;
		}
		s.blackFlashOpen = now + cfg.blackFlashWindowOpenTicks;
		s.blackFlashClose = s.blackFlashOpen + cfg.blackFlashWindowLengthTicks - 1;
		s.lastComboHitTick = now;
		s.dirty = true;
		// fighting builds cursed energy
		CursedEnergy.add(attacker, 6f + (blackFlash ? 120f : 0f));
		return new MeleeResult(amount * mult * cfg.meleeDamageMultiplier, s.comboStep, s.comboCount, blackFlash, counter);
	}

	static void afterMeleeHit(ServerLevel level, LivingEntity attacker, LivingEntity target, MeleeResult r, boolean applied) {
		if (!applied) return;
		SorcererState as = Sorcerers.state(attacker);
		Vec3 at = target.getBoundingBox().getCenter();
		boolean airborne = !target.onGround();
		Vec3 dir = target.position().subtract(attacker.position());
		dir = new Vec3(dir.x, 0, dir.z);
		dir = dir.lengthSqr() < 1.0E-4 ? attacker.getLookAngle() : dir.normalize();

		// juggle: airborne targets hang in the air while the combo continues
		if (airborne || r.step() == 4) {
			SorcererState ts = Sorcerers.state(target);
			ts.juggleTicks = Math.max(ts.juggleTicks, 14);
		}
		if (r.step() == 4) {
			if (!airborne && !attacker.isShiftKeyDown()) {
				// launcher
				TechniqueDamage.setVelocity(target, dir.scale(0.3).add(0, 0.95, 0));
			} else if (airborne && attacker.getXRot() > 25) {
				// spike
				TechniqueDamage.setVelocity(target, dir.scale(0.4).add(0, -1.6, 0));
			} else {
				TechniqueDamage.setVelocity(target, dir.scale(1.5).add(0, 0.35, 0));
			}
			Fx.sound(target, ModSounds.COMBO_FINISHER, 1.3f, 1.0f);
			Fx.particles(level, ModParticles.IMPACT_FLASH, at, 1, 0, 0);
			Fx.particles(level, ModParticles.SHOCKWAVE, at, 1, 0, 0);
			JjkNetwork.shakeAround(level, at, 16, 0.35f, 8);
		} else {
			if (airborne) {
				TechniqueDamage.setVelocity(target, dir.scale(0.12).add(0, 0.28, 0));
				if (!attacker.onGround()) TechniqueDamage.setVelocity(attacker, new Vec3(attacker.getDeltaMovement().x * 0.5, 0.16, attacker.getDeltaMovement().z * 0.5));
			}
			Fx.sound(target, r.step() == 3 ? ModSounds.PUNCH_HEAVY : ModSounds.PUNCH_LIGHT, 1.0f, 0.9f + attacker.getRandom().nextFloat() * 0.25f);
			Fx.particles(level, attacker instanceof Player || Sorcerers.character(attacker) == CharacterType.GOJO ? ModParticles.BLUE_SPARK : ModParticles.RED_SPARK,
					at, 4, 0.2, 0.08);
		}
		if (r.counter()) {
			SorcererState ts = Sorcerers.state(target);
			ts.staggerTicks = Math.max(ts.staggerTicks, 22);
			Fx.sound(target, ModSounds.COUNTER, 1.3f, 1.0f);
			JjkNetwork.notify(attacker, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.counter"), 0xFFD040);
			TechniqueDamage.knockAway(target, attacker.position(), 1.2, 0.35);
		}
		if (r.blackFlash()) {
			Fx.sound(target, ModSounds.BLACK_FLASH, 2.0f, 1.0f);
			Fx.burst(level, ModParticles.BLACK_FLASH, at, 26, 0.7);
			Fx.particles(level, ModParticles.IMPACT_FLASH, at, 2, 0.2, 0);
			Fx.particles(level, ParticleTypes.SONIC_BOOM, at, 1, 0, 0);
			TechniqueDamage.knockAway(target, attacker.position(), 1.8, 0.45);
			JjkNetwork.screenEffect(attacker, Payloads.ScreenEffect.BLACK_FLASH, 1.0f, 16, 0);
			JjkNetwork.screenEffect(target, Payloads.ScreenEffect.BLACK_FLASH, 0.8f, 12, 0);
			JjkNetwork.shakeAround(level, at, 24, 0.9f, 12);
			JjkNetwork.notify(attacker, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.black_flash"), 0xFF2030);
			Mastery.addXp(attacker, 25);
		}
		if (attacker instanceof ServerPlayer sp) {
			JjkConfig.Combat cfg = JjkConfig.get().combat;
			JjkNetwork.send(sp, new Payloads.ComboEvent(r.combo(), r.step(), cfg.blackFlashWindowOpenTicks, cfg.blackFlashWindowLengthTicks, r.blackFlash()));
			Mastery.addXp(sp, 1.5f);
		}
		as.dirty = true;
		// finishers
		JjkConfig.Combat cfg = JjkConfig.get().combat;
		if (cfg.finishers && attacker instanceof ServerPlayer sp && target.isAlive() && !(target instanceof Player)
				&& (r.step() == 4 || r.counter() || r.blackFlash())
				&& target.getHealth() <= target.getMaxHealth() * cfg.finisherHealthThreshold) {
			if (target instanceof SorcererBoss boss) {
				boss.offerFinisher(sp);
			} else {
				finisher(level, sp, target);
			}
		}
	}

	/** Finishing move on a regular mob: cinematic for sturdy enemies, instant execution for small fry. */
	public static void finisher(ServerLevel level, ServerPlayer player, LivingEntity target) {
		Runnable execute = () -> {
			if (!target.isAlive()) return;
			Vec3 at = target.getBoundingBox().getCenter();
			boolean gojo = Sorcerers.character(player) == CharacterType.GOJO;
			Fx.sound(target, ModSounds.FINISHER, 2.0f, 1.0f);
			Fx.burst(level, gojo ? ModParticles.RED_SPARK : ModParticles.SLASH_RED, at, 40, 0.8);
			Fx.particles(level, ModParticles.IMPACT_FLASH, at, 2, 0.2, 0);
			if (!gojo) Fx.particles(level, ModParticles.BLOOD, at, 30, 0.4, 0.2);
			JjkNetwork.shakeAround(level, at, 20, 0.8f, 12);
			JjkNetwork.screenEffect(player, Payloads.ScreenEffect.IMPACT_FRAME, 1.0f, 6, 0xFFFFFF);
			TechniqueDamage.hurt(target, ModDamageTypes.FINISHER, player, player, target.getMaxHealth() * 4 + 50, true);
			if (target.isAlive()) TechniqueDamage.knockAway(target, player.position(), 2.5, 0.8);
			JjkNetwork.notify(player, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.finisher"), 0xFFD040);
		};
		if (target.getMaxHealth() >= 40 && JjkConfig.get().cinematics.enabled) {
			Cinematics.play(level, CinematicType.FINISHER, player, target, execute);
		} else {
			execute.run();
		}
	}
}
