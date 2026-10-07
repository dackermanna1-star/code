package dev.visceral.registry;

import dev.visceral.Visceral;
import dev.visceral.effect.BleedingEffect;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

public final class VisceralEffects {
	public static final Holder<MobEffect> BLEEDING = Registry.registerForHolder(
		BuiltInRegistries.MOB_EFFECT, Visceral.id("bleeding"), new BleedingEffect(MobEffectCategory.HARMFUL, 0x8A0303)
	);

	private VisceralEffects() {
	}

	public static void init() {
	}
}
