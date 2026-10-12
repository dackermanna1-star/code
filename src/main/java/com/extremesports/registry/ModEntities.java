package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.sport.SportType;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final EntityType<SportEquipmentEntity> SKATEBOARD = register("skateboard");
	public static final EntityType<SportEquipmentEntity> BMX = register("bmx_bike");
	public static final EntityType<SportEquipmentEntity> SCOOTER = register("kick_scooter");
	public static final EntityType<SportEquipmentEntity> SKATES = register("inline_skates");

	/**
	 * The physical hitbox is deliberately tiny: the analytic ramp surfaces and a separate rider-clearance check
	 * handle everything else, which lets boards ride all the way up quarter-pipe transitions.
	 */
	private static EntityType<SportEquipmentEntity> register(String name) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, ExtremeSports.id(name));
		EntityType<SportEquipmentEntity> type = EntityType.Builder.<SportEquipmentEntity>of(SportEquipmentEntity::new, MobCategory.MISC)
			.sized(0.12F, 0.35F)
			.eyeHeight(0.2F)
			.clientTrackingRange(10)
			.updateInterval(1)
			.noLootTable()
			.build(key);
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
	}

	public static EntityType<SportEquipmentEntity> forSport(SportType sport) {
		return switch (sport) {
			case SKATEBOARD -> SKATEBOARD;
			case BMX -> BMX;
			case SCOOTER -> SCOOTER;
			case SKATES -> SKATES;
		};
	}

	private ModEntities() {
	}

	public static void init() {
	}
}
