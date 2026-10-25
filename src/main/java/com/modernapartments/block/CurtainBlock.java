package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.BlockHitResult;

/** Curtains and blinds; opening one opens the whole connected window treatment. */
public class CurtainBlock extends FurnitureBlock {
	public static final MapCodec<CurtainBlock> CODEC = simpleCodec(CurtainBlock::new);

	public CurtainBlock(Properties properties) {
		super(properties, true);
		this.registerDefaultState(this.defaultBlockState().setValue(BlockStateProperties.OPEN, true));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(BlockStateProperties.OPEN);
	}

	@Override
	protected String shapeKey(BlockState state) {
		return state.getValue(BlockStateProperties.OPEN) ? "open" : "closed";
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			boolean open = !state.getValue(BlockStateProperties.OPEN);
			Direction facing = state.getValue(FACING);
			Set<BlockPos> seen = new HashSet<>();
			ArrayDeque<BlockPos> queue = new ArrayDeque<>();
			queue.add(pos);
			seen.add(pos);
			while (!queue.isEmpty() && seen.size() < 48) {
				BlockPos p = queue.poll();
				BlockState s = level.getBlockState(p);
				level.setBlock(p, s.setValue(BlockStateProperties.OPEN, open), Block.UPDATE_CLIENTS);
				for (Direction d : new Direction[] {Direction.UP, Direction.DOWN, facing.getClockWise(), facing.getCounterClockWise()}) {
					BlockPos n = p.relative(d);
					BlockState ns = level.getBlockState(n);
					if (!seen.contains(n) && ns.is(this) && ns.getValue(FACING) == facing) {
						seen.add(n);
						queue.add(n);
					}
				}
			}
			level.playSound(null, pos, SoundEvents.WOOL_PLACE, SoundSource.BLOCKS, 0.7F, open ? 1.3F : 1.0F);
		}
		return InteractionResult.SUCCESS;
	}
}
