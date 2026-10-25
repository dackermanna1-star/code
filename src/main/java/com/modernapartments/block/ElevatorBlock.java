package com.modernapartments.block;

import com.modernapartments.block.entity.ElevatorBlockEntity;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * Elevator cab floor. Stand on it and jump to ride up one floor, sneak to ride down, or use the
 * cab's floor panel to pick any floor. Cabs on every floor sit in the same vertical column.
 */
public class ElevatorBlock extends Block implements EntityBlock {
	public static final MapCodec<ElevatorBlock> CODEC = simpleCodec(ElevatorBlock::new);

	public ElevatorBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new ElevatorBlockEntity(pos, state);
	}
}
