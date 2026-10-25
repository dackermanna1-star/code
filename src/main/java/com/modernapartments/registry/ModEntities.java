package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.entity.SeatEntity;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static EntityType<SeatEntity> SEAT;

	private ModEntities() {
	}

	public static void init() {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, ModernApartments.id("seat"));
		SEAT = Registry.register(BuiltInRegistries.ENTITY_TYPE, key,
			EntityType.Builder.<SeatEntity>of(SeatEntity::new, MobCategory.MISC)
				.sized(0.25F, 0.25F)
				.noSummon()
				.noLootTable()
				.clientTrackingRange(10)
				.updateInterval(20)
				.build(key));
	}
}
