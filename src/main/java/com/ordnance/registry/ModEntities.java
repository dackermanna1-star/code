package com.ordnance.registry;

import com.ordnance.Ordnance;
import com.ordnance.entity.DebrisEntity;
import com.ordnance.entity.GrenadeEntity;
import com.ordnance.entity.HypersonicMissileEntity;
import com.ordnance.entity.LauncherGrenadeEntity;
import com.ordnance.entity.RocketEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;

public final class ModEntities {
	public static final EntityType<GrenadeEntity> GRENADE = register(
		"grenade", EntityType.Builder.<GrenadeEntity>create(GrenadeEntity::new, SpawnGroup.MISC).dropsNothing().dimensions(0.25F, 0.25F).maxTrackingRange(6).trackingTickInterval(2)
	);
	public static final EntityType<LauncherGrenadeEntity> LAUNCHER_GRENADE = register(
		"launcher_grenade",
		EntityType.Builder.<LauncherGrenadeEntity>create(LauncherGrenadeEntity::new, SpawnGroup.MISC).dropsNothing().dimensions(0.2F, 0.2F).maxTrackingRange(8).trackingTickInterval(2)
	);
	public static final EntityType<RocketEntity> ROCKET = register(
		"rocket",
		EntityType.Builder.<RocketEntity>create(RocketEntity::new, SpawnGroup.MISC).dropsNothing().dimensions(0.25F, 0.25F).maxTrackingRange(12).trackingTickInterval(1).makeFireImmune()
	);
	public static final EntityType<HypersonicMissileEntity> HYPERSONIC_MISSILE = register(
		"hypersonic_missile",
		EntityType.Builder.<HypersonicMissileEntity>create(HypersonicMissileEntity::new, SpawnGroup.MISC)
			.dropsNothing()
			.dimensions(0.6F, 0.6F)
			.maxTrackingRange(24)
			.trackingTickInterval(1)
			.makeFireImmune()
			.disableSummon()
	);
	public static final EntityType<DebrisEntity> DEBRIS = register(
		"debris",
		EntityType.Builder.<DebrisEntity>create(DebrisEntity::new, SpawnGroup.MISC)
			.dropsNothing()
			.dimensions(0.45F, 0.45F)
			.maxTrackingRange(6)
			.trackingTickInterval(4)
			.disableSaving()
			.disableSummon()
	);

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		RegistryKey<EntityType<?>> key = RegistryKey.of(RegistryKeys.ENTITY_TYPE, Ordnance.id(name));
		return Registry.register(Registries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
	}
}
