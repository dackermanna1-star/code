package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.fabricmc.fabric.api.registry.FabricBrewingRecipeRegistryBuilder;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.Potions;

public final class ModPotions {
	public static final Holder<Potion> MENDING = register("mending", new MobEffectInstance(ModEffects.MENDING, 20 * 45));
	public static final Holder<Potion> STRONG_MENDING = register("strong_mending", new MobEffectInstance(ModEffects.MENDING, 20 * 30, 1));
	public static final Holder<Potion> WARDING = register("warding", new MobEffectInstance(ModEffects.WARDING, 20 * 60));
	public static final Holder<Potion> BLOODRAGE = register("bloodrage", new MobEffectInstance(ModEffects.BLOODRAGE, 20 * 45));
	public static final Holder<Potion> SOULWARD = register("soulward", new MobEffectInstance(ModEffects.SOULWARD, 20 * 90));

	private ModPotions() {
	}

	private static Holder<Potion> register(String name, MobEffectInstance effect) {
		return Registry.registerForHolder(BuiltInRegistries.POTION, AbyssalDescent.id(name), new Potion(AbyssalDescent.MOD_ID + "." + name, effect));
	}

	public static void init() {
		FabricBrewingRecipeRegistryBuilder.BUILD.register(builder -> {
			builder.addMix(Potions.AWKWARD, Items.GLOW_BERRIES, MENDING);
			builder.addMix(MENDING, Items.GLOWSTONE_DUST, STRONG_MENDING);
			builder.addMix(Potions.AWKWARD, ModItems.ANCIENT_BONE, WARDING);
			builder.addMix(Potions.AWKWARD, ModItems.GHOUL_FANG, BLOODRAGE);
			builder.addMix(Potions.AWKWARD, ModItems.SOUL_DUST, SOULWARD);
		});
	}
}
