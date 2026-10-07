package dev.visceral.registry;

import dev.visceral.Visceral;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageType;

/** Data driven damage types, defined in {@code data/visceral/damage_type}. */
public final class VisceralDamageTypes {
	public static final ResourceKey<DamageType> BLEEDING = ResourceKey.create(Registries.DAMAGE_TYPE, Visceral.id("bleeding"));

	private VisceralDamageTypes() {
	}

	public static void init() {
	}
}
