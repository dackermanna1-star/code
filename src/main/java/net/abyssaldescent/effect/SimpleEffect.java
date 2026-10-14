package net.abyssaldescent.effect;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** Effects whose behaviour lives in attribute modifiers or in the combat damage hooks. */
public class SimpleEffect extends MobEffect {
	public SimpleEffect(MobEffectCategory category, int color) {
		super(category, color);
	}
}
