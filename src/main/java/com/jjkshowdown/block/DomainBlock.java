package com.jjkshowdown.block;

import com.jjkshowdown.world.TerrainJournal;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Temporary, indestructible blocks that make up domain arenas (Unlimited Void barrier and floor, the Malevolent Shrine).
 * They are always journaled and restored when the domain ends. As a failsafe against crashes or lost data, a
 * randomly-ticked domain block that is not tracked by the {@link TerrainJournal} removes itself.
 */
public class DomainBlock extends Block {
	public DomainBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected boolean isRandomlyTicking(BlockState state) {
		return true;
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (!TerrainJournal.get(level).isTracked(pos)) {
			level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
		}
	}
}
