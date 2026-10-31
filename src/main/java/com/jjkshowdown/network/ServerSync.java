package com.jjkshowdown.network;

import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererData;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

import java.util.Objects;

/** Pushes sorcerer state to clients: full HUD state to the owner, compact visual state to everyone tracking. */
public final class ServerSync {
	private ServerSync() {
	}

	public static void tick(LivingEntity e, SorcererState s) {
		if (e instanceof ServerPlayer p) {
			s.syncTimer++;
			if ((s.dirty && s.syncTimer >= 2) || s.syncTimer >= 10) {
				sendFull(p, s);
				s.dirty = false;
				s.syncTimer = 0;
			}
		}
		int hash = visualHash(e, s);
		if (s.visualDirty || hash != s.lastVisualHash) {
			s.visualDirty = false;
			s.lastVisualHash = hash;
			JjkNetwork.sendTracking(e, visual(e, s));
		}
	}

	public static int visualFlags(LivingEntity e, SorcererState s) {
		int f = 0;
		if (s.infinity) f |= Payloads.SorcererSync.F_INFINITY;
		if (s.amplification) f |= Payloads.SorcererSync.F_AMPLIFICATION;
		if (s.blocking) f |= Payloads.SorcererSync.F_BLOCKING;
		if (s.rctActive) f |= Payloads.SorcererSync.F_RCT;
		if (s.hovering) f |= Payloads.SorcererSync.F_HOVER;
		if (s.zoneTicks > 0) f |= Payloads.SorcererSync.F_ZONE;
		if (s.counterTicks > 0) f |= Payloads.SorcererSync.F_COUNTER;
		if (s.burnoutTicks > 0) f |= Payloads.SorcererSync.F_BURNOUT;
		if (e.hasEffect(ModEffects.INFORMATION_OVERLOAD)) f |= Payloads.SorcererSync.F_OVERLOADED;
		if (s.cinematicLock > 0) f |= Payloads.SorcererSync.F_LOCKED;
		return f;
	}

	private static int visualHash(LivingEntity e, SorcererState s) {
		return Objects.hash(Sorcerers.character(e), visualFlags(e, s), s.pose, s.chargingSlot);
	}

	public static Payloads.EntityVisual visual(LivingEntity e, SorcererState s) {
		return new Payloads.EntityVisual(e.getId(), Sorcerers.character(e).ordinal(), visualFlags(e, s), s.pose.ordinal(), s.poseTicks,
				s.poseDuration, s.chargingSlot == null ? -1 : s.chargingSlot.ordinal());
	}

	public static void sendFull(ServerPlayer p, SorcererState s) {
		SorcererData d = Sorcerers.data(p);
		CharacterType c = d.character();
		int flags = visualFlags(p, s);
		if (DomainManager.isInsideAnyDomain(p)) flags |= Payloads.SorcererSync.F_IN_DOMAIN;
		if (p.isCreative() && JjkConfig.get().progression.creativeUnlocksAll) flags |= Payloads.SorcererSync.F_CREATIVE_UNLOCK;
		int unlocked = 0;
		for (AbilitySlot slot : AbilitySlot.values()) {
			Ability a = Abilities.get(c, slot);
			if (a != null && a.enabledInConfig() && Mastery.isUnlocked(p, a)) unlocked |= 1 << slot.ordinal();
		}
		int chargeMax = 0;
		if (s.chargingSlot != null) {
			Ability a = Abilities.get(c, s.chargingSlot);
			if (a != null) chargeMax = a.maxCharge(p);
		}
		long now = p.level().getGameTime();
		int comboTicks = s.comboCount > 0 ? (int) Math.max(0, JjkConfig.get().combat.comboWindowTicks - (now - s.lastComboHitTick)) : 0;
		JjkNetwork.send(p, new Payloads.SorcererSync(c.ordinal(), d.mastery(), d.xp(), Mastery.xpToNext(d.mastery()), CursedEnergy.get(p), CursedEnergy.max(p),
				d.fingers(), flags, s.burnoutTicks, s.burnoutTotal, s.chargingSlot == null ? -1 : s.chargingSlot.ordinal(), s.chargeTicks, chargeMax,
				s.comboCount, comboTicks, s.staggerTicks, unlocked, s.cooldowns.clone(), s.cooldownTotals.clone(), s.counterTicks, s.zoneTicks));
	}

	/** Send the current visual state of {@code e} to one player (start of tracking). */
	public static void sendVisualTo(ServerPlayer to, LivingEntity e) {
		SorcererState s = Sorcerers.peekState(e);
		if (s == null && !Sorcerers.isSorcerer(e)) return;
		JjkNetwork.send(to, visual(e, s != null ? s : Sorcerers.state(e)));
	}

	public static boolean isPlayer(LivingEntity e) {
		return e instanceof Player;
	}
}
