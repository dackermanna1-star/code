package dev.overkill.effect;

import dev.overkill.registry.ModParticles;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** Pure marker: the Sunline Rifle reads it when the traced line detonates. Sheds golden sparks. */
public class SunmarkedEffect extends MobEffect {
	public SunmarkedEffect() {
		super(MobEffectCategory.HARMFUL, 0xFFE27A, ModParticles.SUN_SPARK);
	}
}
