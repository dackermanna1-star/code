package com.jjkshowdown.ability.shared;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.util.Fx;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;

/**
 * Reverse Cursed Technique: multiply negative energy into positive energy to heal. Channelling it also repairs
 * the brain after a domain, recovering from technique burnout three times faster.
 */
public class ReverseCursedTechniqueAbility extends Ability {
	public ReverseCursedTechniqueAbility(CharacterType c) {
		super("reverse_cursed_technique", c, AbilitySlot.HEAL, Mode.CHANNEL, 3, false, 7f, 30, 0);
	}

	@Override
	public Component checkUse(CastContext ctx) {
		LivingEntity c = ctx.caster();
		if (c.getHealth() >= c.getMaxHealth() && !ctx.state().isBurntOut()) return Component.translatable("message.jjkshowdown.full_health");
		return null;
	}

	@Override
	public boolean channelTick(CastContext ctx, int ticks) {
		LivingEntity c = ctx.caster();
		SorcererState s = ctx.state();
		Casting.pose(ctx, CastPose.RCT, 6);
		if (s.burnoutTicks > 0) s.burnoutTicks = Math.max(0, s.burnoutTicks - 2);
		if (ticks % 2 == 0) {
			boolean needsHeal = c.getHealth() < c.getMaxHealth();
			if (!needsHeal && s.burnoutTicks <= 0) return false;
			if (!CursedEnergy.spend(c, cost(c))) return false;
			if (needsHeal) {
				float amount = (character == CharacterType.GOJO ? 1.0f : 0.9f) * (1.0f + 0.05f * Mastery.effective(c));
				c.heal(amount);
			}
			Fx.particles(ctx.level(), ModParticles.RCT_GLOW, c.position().add(0, 1, 0), 3, 0.35, 0.6, 0.35, 0.01);
		}
		if (ticks % 20 == 1) Fx.sound(c, ModSounds.RCT, 0.7f, 1.0f);
		return true;
	}
}
