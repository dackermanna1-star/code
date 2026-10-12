package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.events.alien.AlienSoldierEntity;
import com.chaosunleashed.events.alien.PlasmaBoltEntity;
import com.chaosunleashed.events.alien.UfoEntity;
import com.chaosunleashed.events.blackhole.BlackHoleEntity;
import com.chaosunleashed.events.blackhole.StabilizerCoreEntity;
import com.chaosunleashed.events.eclipse.ShadeStalkerEntity;
import com.chaosunleashed.events.kaiju.KaijuEntity;
import com.chaosunleashed.events.kaiju.KaijuWeakPointEntity;
import com.chaosunleashed.events.rift.RiftEntity;
import com.chaosunleashed.events.stampede.BisonEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;

public final class ModEntities {
	public static final EntityType<ShadeStalkerEntity> SHADE_STALKER = register("shade_stalker",
		EntityType.Builder.create(ShadeStalkerEntity::new, SpawnGroup.MONSTER)
			.dimensions(0.6F, 2.6F)
			.eyeHeight(2.3F)
			.maxTrackingRange(8));

	public static final EntityType<BisonEntity> BISON = register("bison",
		EntityType.Builder.create(BisonEntity::new, SpawnGroup.CREATURE)
			.dimensions(1.3F, 1.6F)
			.eyeHeight(1.2F)
			.maxTrackingRange(10));

	public static final EntityType<RiftEntity> DIMENSION_RIFT = register("dimension_rift",
		EntityType.Builder.<RiftEntity>create(RiftEntity::new, SpawnGroup.MISC)
			.dimensions(4.0F, 4.0F)
			.maxTrackingRange(16)
			.trackingTickInterval(10)
			.disableSaving()
			.disableSummon()
			.makeFireImmune());

	public static final EntityType<BlackHoleEntity> BLACK_HOLE = register("black_hole",
		EntityType.Builder.<BlackHoleEntity>create(BlackHoleEntity::new, SpawnGroup.MISC)
			.dimensions(1.0F, 1.0F)
			.maxTrackingRange(16)
			.trackingTickInterval(5)
			.disableSaving()
			.disableSummon()
			.makeFireImmune());

	public static final EntityType<StabilizerCoreEntity> STABILIZER_CORE = register("stabilizer_core",
		EntityType.Builder.<StabilizerCoreEntity>create(StabilizerCoreEntity::new, SpawnGroup.MISC)
			.dimensions(0.25F, 0.25F)
			.maxTrackingRange(8)
			.trackingTickInterval(10));

	public static final EntityType<UfoEntity> UFO = register("ufo",
		EntityType.Builder.create(UfoEntity::new, SpawnGroup.MISC)
			.dimensions(5.0F, 1.6F)
			.eyeHeight(0.8F)
			.maxTrackingRange(16)
			.trackingTickInterval(2)
			.disableSaving()
			.disableSummon()
			.makeFireImmune());

	public static final EntityType<AlienSoldierEntity> ALIEN_SOLDIER = register("alien_soldier",
		EntityType.Builder.create(AlienSoldierEntity::new, SpawnGroup.MONSTER)
			.dimensions(0.6F, 1.9F)
			.eyeHeight(1.6F)
			.maxTrackingRange(8));

	public static final EntityType<PlasmaBoltEntity> PLASMA_BOLT = register("plasma_bolt",
		EntityType.Builder.<PlasmaBoltEntity>create(PlasmaBoltEntity::new, SpawnGroup.MISC)
			.dimensions(0.3125F, 0.3125F)
			.maxTrackingRange(8)
			.trackingTickInterval(5)
			.disableSaving()
			.makeFireImmune());

	public static final EntityType<KaijuEntity> KAIJU = register("kaiju",
		EntityType.Builder.create(KaijuEntity::new, SpawnGroup.MISC)
			.dimensions(20.0F, 92.0F)
			.eyeHeight(84.0F)
			.maxTrackingRange(32)
			.trackingTickInterval(1)
			.disableSaving()
			.disableSummon()
			.makeFireImmune());

	public static final EntityType<KaijuWeakPointEntity> KAIJU_WEAK_POINT = register("kaiju_weak_point",
		EntityType.Builder.<KaijuWeakPointEntity>create(KaijuWeakPointEntity::new, SpawnGroup.MISC)
			.dimensions(3.0F, 3.0F)
			.maxTrackingRange(32)
			.trackingTickInterval(1)
			.disableSaving()
			.disableSummon()
			.makeFireImmune());

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		RegistryKey<EntityType<?>> key = RegistryKey.of(RegistryKeys.ENTITY_TYPE, ChaosUnleashed.id(name));
		return Registry.register(Registries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
		FabricDefaultAttributeRegistry.register(SHADE_STALKER, ShadeStalkerEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(BISON, BisonEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(UFO, UfoEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(ALIEN_SOLDIER, AlienSoldierEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(KAIJU, KaijuEntity.createAttributes());
	}
}
