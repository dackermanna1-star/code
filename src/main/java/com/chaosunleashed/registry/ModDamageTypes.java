package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.entity.Entity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.damage.DamageType;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/** Data-driven damage types (see data/chaosunleashed/damage_type). */
public final class ModDamageTypes {
	public static final RegistryKey<DamageType> SOLAR_FLARE = key("solar_flare");
	public static final RegistryKey<DamageType> BLACK_HOLE = key("black_hole");
	public static final RegistryKey<DamageType> KAIJU = key("kaiju");
	public static final RegistryKey<DamageType> STAMPEDE = key("stampede");
	public static final RegistryKey<DamageType> PLASMA = key("plasma");

	private ModDamageTypes() {
	}

	private static RegistryKey<DamageType> key(String name) {
		return RegistryKey.of(RegistryKeys.DAMAGE_TYPE, ChaosUnleashed.id(name));
	}

	public static DamageSource of(World world, RegistryKey<DamageType> key) {
		return world.getDamageSources().create(key);
	}

	public static DamageSource of(World world, RegistryKey<DamageType> key, @Nullable Entity source, @Nullable Entity attacker) {
		return world.getDamageSources().create(key, source, attacker);
	}
}
