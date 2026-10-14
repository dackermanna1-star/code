package net.abyssaldescent.effect;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/** Steady healing over time (stronger and slower than Regeneration, meant to be drunk between fights). */
public class MendingEffect extends MobEffect {
	public MendingEffect() {
		super(MobEffectCategory.BENEFICIAL, 0x7FE0B5);
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		if (entity.getHealth() < entity.getMaxHealth()) {
			entity.heal(1.0F + amplifier);
		}
		return true;
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		return duration % 30 == 0;
	}
}
