package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageType;

/** Data-driven damage types (JSON in data/abyssal_descent/damage_type). */
public final class ModDamageTypes {
	public static final ResourceKey<DamageType> SPIKES = key("spikes");
	public static final ResourceKey<DamageType> SOUL_MAGIC = key("soul_magic");
	public static final ResourceKey<DamageType> SHOCKWAVE = key("shockwave");
	/** Soul fire erupting from the ground: cannot be blocked with a shield, only avoided. */
	public static final ResourceKey<DamageType> SOUL_ERUPTION = key("soul_eruption");
	public static final ResourceKey<DamageType> BLEED = key("bleed");
	public static final ResourceKey<DamageType> CHAIN_LIGHTNING = key("chain_lightning");

	private ModDamageTypes() {
	}

	private static ResourceKey<DamageType> key(String name) {
		return ResourceKey.create(Registries.DAMAGE_TYPE, AbyssalDescent.id(name));
	}
}
