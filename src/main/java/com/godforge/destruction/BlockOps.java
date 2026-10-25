package com.godforge.destruction;

import com.godforge.Godforge;
import com.godforge.config.GodforgeConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;

/** Low-level helpers shared by all jobs: protection rules and fast block writes. */
public final class BlockOps {
	/** Blocks that no Godforge weapon may ever alter (extend via datapack). */
	public static final TagKey<Block> INDESTRUCTIBLE = TagKey.create(Registries.BLOCK, Godforge.id("indestructible"));

	/** Send to clients, but skip neighbour/shape updates, drops, block-entity side effects and onPlace. */
	public static final int FAST = Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS;
	/** Like {@link #FAST} but runs onPlace (needed for fire so it can tick and spread). */
	public static final int FAST_PLACE = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS;

	private static final BlockState AIR = Blocks.AIR.defaultBlockState();

	private BlockOps() {
	}

	/** Small per-job cache so repeated lookups in the same chunk skip the chunk map. */
	public static final class ChunkCache {
		private final ServerLevel level;
		private long key = Long.MIN_VALUE;
		private LevelChunk chunk;

		public ChunkCache(ServerLevel level) {
			this.level = level;
		}

		/** Returns the loaded chunk containing the position, or null if it is not loaded (never loads chunks). */
		public LevelChunk chunk(int x, int z) {
			int cx = x >> 4;
			int cz = z >> 4;
			long k = ((long) cx << 32) ^ (cz & 0xFFFFFFFFL);
			if (k != this.key) {
				this.key = k;
				this.chunk = this.level.getChunkSource().getChunkNow(cx, cz);
			}
			return this.chunk;
		}

		public BlockState get(BlockPos pos) {
			LevelChunk c = this.chunk(pos.getX(), pos.getZ());
			return c == null ? null : c.getBlockState(pos);
		}
	}

	public static boolean inBuildHeight(ServerLevel level, int y) {
		return y > level.getMinY() && y < level.getMaxY();
	}

	/** True if the block must not be changed by any weapon. Air is never protected. */
	public static boolean isProtected(ServerLevel level, BlockPos pos, BlockState state) {
		if (state.isAir()) {
			return false;
		}
		if (state.is(INDESTRUCTIBLE) || state.getDestroySpeed(level, pos) < 0.0F) {
			return true;
		}
		return state.hasBlockEntity() && !GodforgeConfig.get().general.destroyBlockEntities;
	}

	/** Writes a block state without neighbour updates. Returns true if the world changed. */
	public static boolean set(ServerLevel level, BlockPos pos, BlockState state) {
		return level.setBlock(pos, state, FAST);
	}

	public static boolean erase(ServerLevel level, BlockPos pos) {
		return level.setBlock(pos, AIR, FAST);
	}

	public static boolean isWithinBorder(ServerLevel level, BlockPos pos) {
		return level.getWorldBorder().isWithinBounds(pos);
	}
}
