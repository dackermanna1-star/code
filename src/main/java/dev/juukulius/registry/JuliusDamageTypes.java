package dev.juukulius.registry;

import dev.juukulius.JuliusMod;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageType;

/** Data-driven damage types ({@code data/julius_juukulius/damage_type}). */
public final class JuliusDamageTypes {
	/** Sword combo and heavy strike. */
	public static final ResourceKey<DamageType> SWORD_ART = key("sword_art");
	/** Al Clarista's rainbow wave. */
	public static final ResourceKey<DamageType> AL_CLARISTA = key("al_clarista");
	/** Ia's fire and Ul Gora (tagged as fire). */
	public static final ResourceKey<DamageType> SPIRIT_FIRE = key("spirit_fire");
	/** Water, wind, earth and yang arts. */
	public static final ResourceKey<DamageType> SPIRIT_ART = key("spirit_art");
	/** Nes's yin arts. */
	public static final ResourceKey<DamageType> SPIRIT_YIN = key("spirit_yin");
	/** Al Clauzeria and Al Cranvel's burst. */
	public static final ResourceKey<DamageType> RAINBOW = key("rainbow");

	private JuliusDamageTypes() {
	}

	private static ResourceKey<DamageType> key(String name) {
		return ResourceKey.create(Registries.DAMAGE_TYPE, JuliusMod.id(name));
	}
}
