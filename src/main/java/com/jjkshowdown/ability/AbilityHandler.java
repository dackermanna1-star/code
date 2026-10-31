package com.jjkshowdown.ability;

import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.jetbrains.annotations.Nullable;

/**
 * Validates and drives every technique for players (packets) and bosses (AI calls) alike:
 * unlocks, config, cursed energy, cooldowns, burnout, Domain Amplification exclusivity, paralysis, cinematics.
 */
public final class AbilityHandler {
	private AbilityHandler() {
	}

	/** Packet entry point. */
	public static void handleInput(ServerPlayer player, AbilitySlot slot, boolean pressed) {
		if (!player.isAlive() || player.isSpectator()) return;
		if (slot == AbilitySlot.DOMAIN && pressed && DomainManager.clashInput(player)) return;
		if (pressed) press(player, slot);
		else release(player, slot);
	}

	@Nullable
	private static Component blockReason(LivingEntity caster, SorcererState s, Ability a) {
		if (!a.enabledInConfig()) return Component.translatable("message.jjkshowdown.disabled");
		if (!Mastery.isUnlocked(caster, a)) return Component.translatable("message.jjkshowdown.locked", a.unlockLevel);
		// only a domain can answer a domain: expansion is the one action possible inside Unlimited Void
		if (caster.hasEffect(ModEffects.INFORMATION_OVERLOAD) && a.slot != AbilitySlot.DOMAIN) return Component.translatable("message.jjkshowdown.overloaded");
		if (s.isLocked()) return Component.empty();
		if (s.isStaggered()) return Component.translatable("message.jjkshowdown.staggered");
		if (a.technique && s.isBurntOut()) return Component.translatable("message.jjkshowdown.burnout", (s.burnoutTicks + 19) / 20);
		if (s.blocking && a.mode != Ability.Mode.TOGGLE) return Component.empty();
		return null;
	}

	private static void refuse(LivingEntity caster, Component reason) {
		if (reason != null && !reason.getString().isEmpty() && caster instanceof ServerPlayer p) {
			JjkNetwork.notify(p, Payloads.Notify.WARN, reason, 0xFF6060);
		}
	}

	public static boolean press(LivingEntity caster, AbilitySlot slot) {
		CharacterType c = Sorcerers.character(caster);
		if (!c.isSorcerer()) return false;
		Ability a = Abilities.get(c, slot);
		if (a == null) return false;
		SorcererState s = Sorcerers.state(caster);
		CastContext ctx = CastContext.of(caster);

		// toggles can always be switched off
		if (a.mode == Ability.Mode.TOGGLE && a.isToggledOn(s)) {
			a.setToggled(s, false);
			a.onToggle(ctx, false);
			s.dirty = s.visualDirty = true;
			return true;
		}
		Component reason = blockReason(caster, s, a);
		if (reason != null) {
			refuse(caster, reason);
			return false;
		}
		if (s.chargingSlot != null || s.channelSlot != null) return false; // one thing at a time
		if (s.isOnCooldown(slot)) {
			refuse(caster, Component.translatable("message.jjkshowdown.cooldown", a.displayName(), String.format("%.1f", s.cooldowns[slot.ordinal()] / 20f)));
			return false;
		}
		Component extra = a.checkUse(ctx);
		if (extra != null) {
			refuse(caster, extra);
			return false;
		}
		// Domain Amplification and the innate technique are mutually exclusive: casting drops the amplification
		if (a.technique && s.amplification) {
			Ability da = Abilities.get(c, AbilitySlot.TOGGLE);
			s.amplification = false;
			if (da != null) da.onToggle(ctx, false);
		}
		float cost = a.cost(caster);
		switch (a.mode) {
			case TOGGLE -> {
				if (!CursedEnergy.spend(caster, cost)) {
					refuse(caster, Component.translatable("message.jjkshowdown.no_energy"));
					return false;
				}
				a.setToggled(s, true);
				a.onToggle(ctx, true);
				s.setCooldown(slot, a.cooldown(caster));
			}
			case INSTANT -> {
				if (!CursedEnergy.spend(caster, cost)) {
					refuse(caster, Component.translatable("message.jjkshowdown.no_energy"));
					return false;
				}
				s.setCooldown(slot, a.cooldown(caster));
				a.cast(ctx, 0);
			}
			case CHARGE -> {
				if (!CursedEnergy.has(caster, cost * a.chargeCostScale(0))) {
					refuse(caster, Component.translatable("message.jjkshowdown.no_energy"));
					return false;
				}
				s.chargingSlot = slot;
				s.chargeTicks = 0;
				a.onChargeStart(ctx);
			}
			case CHANNEL -> {
				if (!CursedEnergy.has(caster, cost)) {
					refuse(caster, Component.translatable("message.jjkshowdown.no_energy"));
					return false;
				}
				s.channelSlot = slot;
				s.channelTicks = 0;
				s.rctActive = slot == AbilitySlot.HEAL;
			}
		}
		s.dirty = s.visualDirty = true;
		return true;
	}

	public static void release(LivingEntity caster, AbilitySlot slot) {
		SorcererState s = Sorcerers.state(caster);
		CharacterType c = Sorcerers.character(caster);
		Ability a = Abilities.get(c, slot);
		if (a == null) return;
		if (s.chargingSlot == slot) {
			finishCharge(caster, s, a);
		} else if (s.channelSlot == slot) {
			stopChannel(caster, s, a);
		}
	}

	private static void finishCharge(LivingEntity caster, SorcererState s, Ability a) {
		CastContext ctx = CastContext.of(caster);
		int ticks = s.chargeTicks;
		s.chargingSlot = null;
		s.chargeTicks = 0;
		s.dirty = s.visualDirty = true;
		if (ticks < a.minCharge()) {
			a.onChargeCancel(ctx);
			refuse(caster, Component.translatable("message.jjkshowdown.charge_more", a.displayName()));
			s.setPose(com.jjkshowdown.sorcerer.CastPose.NONE, 1);
			return;
		}
		float cost = a.cost(caster) * a.chargeCostScale(ticks);
		if (!CursedEnergy.spend(caster, cost)) {
			// spend what is left for a weakened cast rather than failing silently
			if (CursedEnergy.get(caster) < cost * 0.5f) {
				refuse(caster, Component.translatable("message.jjkshowdown.no_energy"));
				a.onChargeCancel(ctx);
				return;
			}
			CursedEnergy.drain(caster, cost);
			ticks = Math.min(ticks, a.minCharge() + (a.maxCharge(caster) - a.minCharge()) / 2);
		}
		s.setCooldown(a.slot, a.cooldown(caster));
		a.cast(ctx, ticks);
	}

	private static void stopChannel(LivingEntity caster, SorcererState s, Ability a) {
		int ticks = s.channelTicks;
		s.channelSlot = null;
		s.channelTicks = 0;
		s.rctActive = false;
		s.setCooldown(a.slot, a.cooldown(caster));
		a.onChannelStop(CastContext.of(caster), ticks);
		s.dirty = s.visualDirty = true;
	}

	/** Cancel any charge/channel (stagger, death, cinematic). */
	public static void interrupt(LivingEntity caster) {
		SorcererState s = Sorcerers.state(caster);
		CharacterType c = Sorcerers.character(caster);
		if (s.chargingSlot != null) {
			Ability a = Abilities.get(c, s.chargingSlot);
			s.chargingSlot = null;
			s.chargeTicks = 0;
			if (a != null) a.onChargeCancel(CastContext.of(caster));
		}
		if (s.channelSlot != null) {
			Ability a = Abilities.get(c, s.channelSlot);
			if (a != null) stopChannel(caster, s, a);
		}
		s.dirty = s.visualDirty = true;
	}

	/** Per-tick driver for charges, channels and toggles. */
	public static void tick(LivingEntity caster, SorcererState s) {
		CharacterType c = Sorcerers.character(caster);
		if (!c.isSorcerer()) return;
		boolean overloaded = caster.hasEffect(ModEffects.INFORMATION_OVERLOAD);
		if ((overloaded || s.isStaggered()) && (s.chargingSlot != null || s.channelSlot != null)) {
			interrupt(caster);
		}
		if (s.chargingSlot != null) {
			Ability a = Abilities.get(c, s.chargingSlot);
			if (a == null) {
				s.chargingSlot = null;
			} else if (!s.isLocked()) {
				s.chargeTicks++;
				a.onChargeTick(CastContext.of(caster), s.chargeTicks);
				if (a.autoRelease() && s.chargeTicks >= a.maxCharge(caster)) finishCharge(caster, s, a);
				if (s.chargeTicks % 5 == 0) s.dirty = true;
			}
		}
		if (s.channelSlot != null) {
			Ability a = Abilities.get(c, s.channelSlot);
			if (a == null || !a.channelTick(CastContext.of(caster), ++s.channelTicks)) {
				if (a != null) stopChannel(caster, s, a);
				else s.channelSlot = null;
			}
		}
		// toggles
		for (AbilitySlot slot : new AbilitySlot[]{AbilitySlot.TOGGLE}) {
			Ability a = Abilities.get(c, slot);
			if (a == null || a.mode != Ability.Mode.TOGGLE || !a.isToggledOn(s)) continue;
			boolean keep = !(a.technique && s.isBurntOut()) && !overloaded && a.toggleTick(CastContext.of(caster));
			if (!keep) {
				a.setToggled(s, false);
				a.onToggle(CastContext.of(caster), false);
				s.dirty = s.visualDirty = true;
				if (caster instanceof Player) refuse(caster, Component.translatable("message.jjkshowdown.toggle_dropped", a.displayName()));
			}
		}
	}
}
