package com.laptopcraft.registry;

import com.laptopcraft.block.LaptopBlockEntity;
import com.laptopcraft.block.PackageBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;

/** Block entity types for the laptop and the delivery packages. */
public final class ModBlockEntities {
	public static final BlockEntityType<LaptopBlockEntity> LAPTOP = register("laptop",
			FabricBlockEntityTypeBuilder.create(LaptopBlockEntity::new, ModBlocks.LAPTOP));
	/** Shared by the Emerazon box and the Ender Eats bag. */
	public static final BlockEntityType<PackageBlockEntity> PACKAGE = register("package",
			FabricBlockEntityTypeBuilder.create(PackageBlockEntity::new, ModBlocks.EMERAZON_BOX, ModBlocks.ENDER_EATS_BAG));

	private ModBlockEntities() {
	}

	private static <T extends BlockEntity> BlockEntityType<T> register(String name, FabricBlockEntityTypeBuilder<T> builder) {
		return Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, Reg.id(name), builder.build());
	}

	public static void init() {
		// Class loading registers the fields above.
	}
}
