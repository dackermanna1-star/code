package com.chaosunleashed.core;

import com.chaosunleashed.registry.ModBlocks;
import com.chaosunleashed.registry.ModTags;
import net.minecraft.block.BlockState;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;

/** Central rules for which blocks events are allowed to destroy or convert. */
public final class BlockSafety {
	private BlockSafety() {
	}

	/**
	 * True if an event may replace the block at {@code pos}. Never touches unbreakable blocks (bedrock, barriers...),
	 * blocks with block entities (chests, furnaces... so player storage is never deleted), anything in the
	 * {@code #chaosunleashed:event_immune} tag, the Chaos Control Panel, or blocks outside the world border.
	 */
	public static boolean canModify(ServerWorld world, BlockPos pos, BlockState state) {
		if (state.isAir()) {
			return false;
		}
		if (!world.getWorldBorder().contains(pos) || world.isOutOfHeightLimit(pos)) {
			return false;
		}
		if (state.hasBlockEntity() || state.isOf(ModBlocks.CHAOS_CONTROL_PANEL) || state.isIn(ModTags.EVENT_IMMUNE)) {
			return false;
		}
		return state.getHardness(world, pos) >= 0.0F;
	}
}
