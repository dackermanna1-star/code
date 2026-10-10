package com.blademode.registry;

import com.blademode.BladeMode;
import com.blademode.block.CutBlock;
import com.blademode.block.CutBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.PushReaction;

public final class ModBlocks {
	public static final ResourceKey<Block> CUT_BLOCK_KEY = ResourceKey.create(Registries.BLOCK, BladeMode.id("cut_block"));

	public static final Block CUT_BLOCK = Blocks.register(CUT_BLOCK_KEY, CutBlock::new, BlockBehaviour.Properties.of()
		.strength(2.0F, 6.0F)
		.noOcclusion()
		.dynamicShape()
		.noLootTable()
		.pushReaction(PushReaction.BLOCK)
		.lightLevel(state -> state.getValue(CutBlock.LIGHT))
		.isRedstoneConductor((state, level, pos) -> false)
		.isSuffocating((state, level, pos) -> false)
		.isViewBlocking((state, level, pos) -> false));

	public static final BlockEntityType<CutBlockEntity> CUT_BLOCK_ENTITY = Registry.register(
		BuiltInRegistries.BLOCK_ENTITY_TYPE,
		BladeMode.id("cut_block"),
		FabricBlockEntityTypeBuilder.create(CutBlockEntity::new, CUT_BLOCK).build());

	private ModBlocks() {
	}

	public static void init() {
	}
}
