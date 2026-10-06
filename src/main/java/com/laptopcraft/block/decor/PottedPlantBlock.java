package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/** A big potted house plant: the leaves can be selected but you only bump into the pot. */
public class PottedPlantBlock extends FacingDecorBlock {
	public static final MapCodec<PottedPlantBlock> CODEC = simpleCodec(PottedPlantBlock::new);
	private static final VoxelShape OUTLINE = Block.box(2, 0, 2, 14, 15, 14);
	private static final VoxelShape POT = Block.box(4, 0, 4, 12, 6.5, 12);

	public PottedPlantBlock(BlockBehaviour.Properties properties) {
		super(properties, OUTLINE);
	}

	@Override
	protected MapCodec<? extends PottedPlantBlock> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return POT;
	}
}
