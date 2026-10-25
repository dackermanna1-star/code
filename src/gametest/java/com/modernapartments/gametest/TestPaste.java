package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BlockEntityInit;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Copies a generated buffer straight into the world (no terrain handling) for visual tests. */
final class TestPaste {
	private TestPaste() {
	}

	/** Pastes cells with local y in [0, maxY) at {@code origin}; returns the number of blocks set. */
	static int paste(ServerLevel level, BlockBuffer buf, BlockPos origin, int maxY) {
		int placed = 0;
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
		for (int y = 0; y < Math.min(maxY, buf.sizeY); y++) {
			for (int z = 0; z < buf.sizeZ; z++) {
				for (int x = 0; x < buf.sizeX; x++) {
					int i = buf.index(x, y, z);
					BlockState s = buf.get(i);
					if (s == null) {
						continue;
					}
					p.set(origin.getX() + x, origin.getY() + y, origin.getZ() + z);
					level.setBlock(p, s, Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS);
					placed++;
					BlockEntityInit init = buf.init(i);
					if (init != null) {
						BlockEntity be = level.getBlockEntity(p);
						if (be != null) {
							init.apply(be, level.registryAccess(), level.random);
							be.setChanged();
						}
					}
				}
			}
		}
		return placed;
	}
}
