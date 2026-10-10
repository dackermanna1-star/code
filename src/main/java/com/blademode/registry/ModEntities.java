package com.blademode.registry;

import com.blademode.BladeMode;
import com.blademode.piece.PieceEntity;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final ResourceKey<EntityType<?>> PIECE_KEY = ResourceKey.create(Registries.ENTITY_TYPE, BladeMode.id("piece"));

	public static final EntityType<PieceEntity> PIECE = Registry.register(BuiltInRegistries.ENTITY_TYPE, PIECE_KEY,
		EntityType.Builder.<PieceEntity>of(PieceEntity::new, MobCategory.MISC)
			.sized(0.5F, 0.5F)
			.clientTrackingRange(16)
			.updateInterval(1)
			.fireImmune()
			.noSummon()
			.build(PIECE_KEY));

	private ModEntities() {
	}

	public static void init() {
	}
}
