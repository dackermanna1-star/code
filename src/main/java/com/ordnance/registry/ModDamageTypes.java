package com.ordnance.registry;

import com.ordnance.Ordnance;
import net.minecraft.entity.Entity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.damage.DamageType;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Data-driven damage types ({@code data/ordnance/damage_type}). They are tagged like their vanilla counterparts, so
 * Blast/Fire/Projectile Protection, Fire Resistance and armor all behave as players expect.
 */
public final class ModDamageTypes {
	public static final RegistryKey<DamageType> BLAST = key("blast");
	public static final RegistryKey<DamageType> SHRAPNEL = key("shrapnel");
	public static final RegistryKey<DamageType> INCINERATED = key("incinerated");
	public static final RegistryKey<DamageType> MISSILE_STRIKE = key("missile_strike");
	public static final RegistryKey<DamageType> BACKBLAST = key("backblast");

	private ModDamageTypes() {
	}

	private static RegistryKey<DamageType> key(String name) {
		return RegistryKey.of(RegistryKeys.DAMAGE_TYPE, Ordnance.id(name));
	}

	public static DamageSource create(World world, RegistryKey<DamageType> key, @Nullable Entity source, @Nullable Entity attacker) {
		return world.getDamageSources().create(key, source, attacker);
	}
}
