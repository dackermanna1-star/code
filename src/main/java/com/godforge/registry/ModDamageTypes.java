package com.godforge.registry;

import com.godforge.Godforge;
import com.godforge.weapon.WeaponType;
import java.util.EnumMap;
import java.util.Map;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import org.jspecify.annotations.Nullable;

/** Damage types are data-driven (see {@code data/godforge/damage_type}); this class only holds their keys. */
public final class ModDamageTypes {
	private static final Map<WeaponType, ResourceKey<DamageType>> KEYS = new EnumMap<>(WeaponType.class);

	static {
		for (WeaponType type : WeaponType.values()) {
			KEYS.put(type, ResourceKey.create(Registries.DAMAGE_TYPE, Godforge.id(type.id())));
		}
	}

	private ModDamageTypes() {
	}

	public static ResourceKey<DamageType> key(WeaponType type) {
		return KEYS.get(type);
	}

	public static DamageSource source(ServerLevel level, WeaponType type, @Nullable Entity direct, @Nullable Entity causing) {
		return new DamageSource(level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).getOrThrow(key(type)), direct, causing);
	}
}
