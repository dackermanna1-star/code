package dev.overkill.effect;

import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/** Lingering burns: damage every second (faster at higher levels), sheds embers. */
public class SearingEffect extends MobEffect {
	public SearingEffect() {
		super(MobEffectCategory.HARMFUL, 0xFF6A1A, ModParticles.EMBER);
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		int interval = Math.max(5, 20 >> amplifier);
		return duration % interval == 0;
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		entity.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SEARING, null, null), 1.0F + amplifier);
		return true;
	}
}
