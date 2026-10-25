package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.block.ApartmentDoorBlock;
import com.modernapartments.block.KeycardReaderBlock;
import com.modernapartments.block.entity.ElevatorBlockEntity;
import com.modernapartments.block.entity.FixtureBlockEntity;
import com.modernapartments.block.entity.LockBlockEntity;
import com.modernapartments.block.entity.StorageBlockEntity;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;

public final class ModBlockEntities {
	public static BlockEntityType<StorageBlockEntity> STORAGE;
	public static BlockEntityType<FixtureBlockEntity> FIXTURE;
	public static BlockEntityType<LockBlockEntity> LOCK;
	public static BlockEntityType<ElevatorBlockEntity> ELEVATOR;

	private ModBlockEntities() {
	}

	private static <T extends BlockEntity> BlockEntityType<T> register(String id, FabricBlockEntityTypeBuilder.Factory<T> factory, List<Block> blocks) {
		return Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, ModernApartments.id(id),
			FabricBlockEntityTypeBuilder.<T>create(factory, blocks.toArray(Block[]::new)).build());
	}

	public static void init() {
		STORAGE = register("storage", StorageBlockEntity::new, ModBlocks.STORAGE_BLOCKS);
		FIXTURE = register("fixture", FixtureBlockEntity::new, ModBlocks.FIXTURE_BLOCKS);
		List<Block> locks = new ArrayList<>();
		for (Block b : ModBlocks.ALL) {
			if (b instanceof ApartmentDoorBlock || b instanceof KeycardReaderBlock) {
				locks.add(b);
			}
		}
		LOCK = register("lock", LockBlockEntity::new, locks);
		ELEVATOR = register("elevator", ElevatorBlockEntity::new, List.of(ModBlocks.ELEVATOR_FLOOR));
		// the kitchen range is a real smoker
		BlockEntityType.SMOKER.addSupportedBlock(ModBlocks.OVEN_RANGE);
	}
}
