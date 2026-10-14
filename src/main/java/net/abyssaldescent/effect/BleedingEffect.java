package net.abyssaldescent.effect;

import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/** Damage over time that ignores armour; each tick drips visibly from the victim. */
public class BleedingEffect extends MobEffect {
	public BleedingEffect() {
		super(MobEffectCategory.HARMFUL, 0x8E0F1C);
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		entity.hurtServer(level, level.damageSources().source(ModDamageTypes.BLEED), 1.0F + amplifier * 0.5F);
		level.sendParticles(ModParticles.BLEED_DRIP, entity.getX(), entity.getY() + entity.getBbHeight() * 0.6, entity.getZ(), 3, 0.2, 0.2, 0.2, 0.0);
		return true;
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		return duration % 20 == 0;
	}
}
