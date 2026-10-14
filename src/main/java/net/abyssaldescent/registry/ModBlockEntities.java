package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.block.DartTrapBlockEntity;
import net.abyssaldescent.block.ReliquaryBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.entity.BlockEntityType;

public final class ModBlockEntities {
	public static final BlockEntityType<ReliquaryBlockEntity> RELIQUARY = Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE,
		AbyssalDescent.id("reliquary"), FabricBlockEntityTypeBuilder.create(ReliquaryBlockEntity::new, ModBlocks.RELIQUARY).build());
	public static final BlockEntityType<DartTrapBlockEntity> DART_TRAP = Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE,
		AbyssalDescent.id("dart_trap"), FabricBlockEntityTypeBuilder.create(DartTrapBlockEntity::new, ModBlocks.DART_TRAP).build());

	private ModBlockEntities() {
	}

	public static void init() {
	}
}
