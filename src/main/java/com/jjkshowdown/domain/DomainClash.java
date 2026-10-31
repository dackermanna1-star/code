package com.jjkshowdown.domain;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * A domain clash: two domains fight for control of the same space. A tug-of-war meter moves according to each
 * domain's refinement (energy, mastery, configuration) and the casters' focus (mashing the domain key; the AI
 * simulates this based on difficulty). Malevolent Shrine additionally erodes Unlimited Void's barrier from outside.
 */
public final class DomainClash {
	final DomainEntity a;
	final DomainEntity b;
	float balance;
	int ticks;
	float inputA;
	float inputB;
	boolean done;

	DomainClash(DomainEntity a, DomainEntity b) {
		this.a = a;
		this.b = b;
	}

	public static float strength(DomainEntity d) {
		LivingEntity o = d.owner();
		float s = d.domainType().refinement * JjkConfig.get().domains.strengthMultiplier;
		if (o != null) {
			s *= 0.55f + 0.45f * CursedEnergy.ratio(o);
			s *= 1.0f + 0.04f * Mastery.effective(o);
			if (o instanceof SorcererBoss boss) s *= boss.clashScale();
			if (Sorcerers.character(o) == CharacterType.SUKUNA) s *= 1.0f + 0.01f * Sorcerers.data(o).fingers();
		}
		return s;
	}

	public static float strengthRatio(DomainEntity self, DomainEntity other) {
		return Mth.clamp(strength(self) / Math.max(0.01f, strength(other)), 0.4f, 2.5f);
	}

	boolean involves(LivingEntity e) {
		return a.owner() == e || b.owner() == e;
	}

	void input(LivingEntity who) {
		if (a.owner() == who) inputA = Math.min(inputA + 1f, 8f);
		else if (b.owner() == who) inputB = Math.min(inputB + 1f, 8f);
	}

	void tick(ServerLevel level) {
		if (done) return;
		ticks++;
		simulateAi(a, true);
		simulateAi(b, false);
		float delta = (strength(a) - strength(b)) * 0.0022f + (inputA - inputB) * 0.0032f;
		inputA *= 0.88f;
		inputB *= 0.88f;
		balance = Mth.clamp(balance + delta, -1f, 1f);

		LivingEntity oa = a.owner(), ob = b.owner();
		if (oa != null && ob != null) {
			Vec3 mid = oa.getEyePosition().lerp(ob.getEyePosition(), 0.5 + balance * 0.35);
			Fx.particles(level, a.domainType() == DomainType.UNLIMITED_VOID ? ModParticles.BLUE_SPARK : ModParticles.RED_SPARK, mid, 6, 0.5, 0.15);
			Fx.particles(level, b.domainType() == DomainType.UNLIMITED_VOID ? ModParticles.BLUE_SPARK : ModParticles.RED_SPARK, mid, 6, 0.5, 0.15);
			if (ticks % 10 == 0) Fx.particles(level, ModParticles.IMPACT_FLASH, mid, 1, 0.1, 0);
			if (ticks % 4 == 0) {
				JjkNetwork.shakeAround(level, mid, 40, 0.25f, 5);
			}
		}
		if (ticks % 60 == 1) Fx.sound(level, a.position(), ModSounds.CLASH, 3.0f, 1.0f);
		if (ticks % 2 == 0) sync(level, true);

		DomainEntity winner = null, loser = null;
		if (balance >= 1f || (b.domainType().hasBarrier && b.integrity() <= 0f)) {
			winner = a;
			loser = b;
		} else if (balance <= -1f || (a.domainType().hasBarrier && a.integrity() <= 0f)) {
			winner = b;
			loser = a;
		} else if (ticks >= JjkConfig.get().domains.clashMaxTicks) {
			if (Math.abs(balance) < 0.05f) {
				end(level, null, null);
				return;
			}
			winner = balance > 0 ? a : b;
			loser = balance > 0 ? b : a;
		}
		if (winner != null) end(level, winner, loser);
	}

	private void simulateAi(DomainEntity d, boolean sideA) {
		if (!(d.owner() instanceof SorcererBoss boss)) return;
		float rate = boss.clashInputRate(); // presses per second
		if (boss.getRandom().nextFloat() < rate / 20f) {
			if (sideA) inputA = Math.min(inputA + 1f, 8f);
			else inputB = Math.min(inputB + 1f, 8f);
		}
	}

	void end(ServerLevel level, DomainEntity winner, DomainEntity loser) {
		if (done) return;
		done = true;
		sync(level, false);
		if (winner == null) {
			a.leaveClash(false);
			b.leaveClash(false);
			return;
		}
		LivingEntity wo = winner.owner();
		LivingEntity lo = loser.owner();
		winner.leaveClash(true);
		loser.leaveClash(false);
		Fx.sound(level, winner.position(), ModSounds.CLASH_WIN, 3.0f, 1.0f);
		if (wo != null) {
			Mastery.addXp(wo, 150);
			JjkNetwork.notify(wo, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.clash_won"), winner.domainType().color);
			if (Sorcerers.character(wo) == CharacterType.SUKUNA && Sorcerers.character(lo) == CharacterType.GOJO) {
				JjkNetwork.voice(wo, VoiceLine.SUKUNA_STAND_PROUD);
			} else if (Sorcerers.character(wo) == CharacterType.GOJO) {
				JjkNetwork.voice(wo, VoiceLine.GOJO_NAH_ID_WIN);
			}
		}
		if (lo != null) {
			JjkNetwork.notify(lo, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.clash_lost"), 0xAAAAAA);
			JjkNetwork.screenEffect(lo, Payloads.ScreenEffect.FLASH, 1.0f, 20, 0xFFFFFF);
		}
	}

	void sync(ServerLevel level, boolean active) {
		LivingEntity oa = a.owner();
		float integrity = a.domainType().hasBarrier ? a.integrity() : b.domainType().hasBarrier ? b.integrity() : 1f;
		Payloads.Clash p = new Payloads.Clash(a.getId(), b.getId(), balance, integrity,
				Math.max(0, JjkConfig.get().domains.clashMaxTicks - ticks), active,
				a.domainType().owner.ordinal(), b.domainType().owner.ordinal());
		Vec3 center = oa != null ? oa.position() : a.position();
		JjkNetwork.sendAround(level, center, Math.max(a.radius(), b.radius()) + 48, p);
	}
}
