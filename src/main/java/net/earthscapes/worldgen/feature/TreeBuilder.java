package net.earthscapes.worldgen.feature;

import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectLinkedOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayFIFOQueue;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import net.earthscapes.block.LianaBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.SectionPos;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import org.jspecify.annotations.Nullable;

/**
 * Collects the blocks of a procedurally generated tree (or rock formation) in memory, then writes
 * them in one go: logs first, then leaves with correct {@code distance} values so canopies do not
 * decay, then decorations. Writes outside the chunk region that world generation may touch are
 * skipped instead of tripping the far-chunk guard.
 */
public final class TreeBuilder {
	private final Long2ObjectLinkedOpenHashMap<BlockState> logs = new Long2ObjectLinkedOpenHashMap<>();
	private final LongOpenHashSet roots = new LongOpenHashSet();
	private final Long2ObjectLinkedOpenHashMap<BlockState> leaves = new Long2ObjectLinkedOpenHashMap<>();
	private final Long2ObjectLinkedOpenHashMap<BlockState> decorations = new Long2ObjectLinkedOpenHashMap<>();
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();

	public void log(BlockPos pos, BlockState state) {
		long key = pos.asLong();
		this.logs.put(key, state);
		this.leaves.remove(key);
	}

	public void log(int x, int y, int z, BlockState state) {
		this.log(this.cursor.set(x, y, z), state);
	}

	/** A log that may also displace soil, for buttresses and roots sunk into the ground. */
	public void root(BlockPos pos, BlockState state) {
		this.log(pos, state);
		this.roots.add(pos.asLong());
	}

	public void leaf(BlockPos pos, BlockState state) {
		long key = pos.asLong();
		if (!this.logs.containsKey(key)) {
			this.leaves.putIfAbsent(key, state);
		}
	}

	public void leaf(int x, int y, int z, BlockState state) {
		this.leaf(this.cursor.set(x, y, z), state);
	}

	/** Placed last and only into empty space (vines, epiphytes, fruit). */
	public void decoration(BlockPos pos, BlockState state) {
		this.decorations.putIfAbsent(pos.asLong(), state);
	}

	public boolean hasLog(BlockPos pos) {
		return this.logs.containsKey(pos.asLong());
	}

	public boolean hasLeaf(BlockPos pos) {
		return this.leaves.containsKey(pos.asLong());
	}

	public boolean isOccupied(BlockPos pos) {
		long key = pos.asLong();
		return this.logs.containsKey(key) || this.leaves.containsKey(key) || this.decorations.containsKey(key);
	}

	public Iterable<Long> leafPositions() {
		return this.leaves.keySet();
	}

	public Iterable<Long> logPositions() {
		return this.logs.keySet();
	}

	public int logCount() {
		return this.logs.size();
	}

	public static boolean replaceableByTree(BlockState state) {
		return state.isAir()
			|| state.is(BlockTags.REPLACEABLE_BY_TREES)
			|| state.is(BlockTags.SAPLINGS)
			|| state.getBlock() instanceof LianaBlock
			|| state.canBeReplaced() && !state.getFluidState().is(FluidTags.LAVA);
	}

	public static boolean isSoil(BlockState state) {
		return state.is(BlockTags.DIRT) || state.is(BlockTags.SAND) || state.is(net.earthscapes.block.EsTags.TREE_SOIL);
	}

	/** Region limits: features may only write within one chunk of the chunk being decorated. */
	@Nullable
	private static ChunkPos centre(WorldGenLevel level) {
		return level instanceof WorldGenRegion region ? region.getCenter() : null;
	}

	private static boolean writable(@Nullable ChunkPos centre, long key) {
		if (centre == null) {
			return true;
		}
		int cx = SectionPos.blockToSectionCoord(BlockPos.getX(key));
		int cz = SectionPos.blockToSectionCoord(BlockPos.getZ(key));
		return Math.abs(cx - centre.x) <= 1 && Math.abs(cz - centre.z) <= 1;
	}

	/** Writes everything. Returns the number of log blocks placed. */
	public int place(WorldGenLevel level) {
		ChunkPos centre = centre(level);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		LongOpenHashSet placedLogs = new LongOpenHashSet();
		int minY = level.getMinY();
		int maxY = level.getMaxY();

		for (var entry : this.logs.long2ObjectEntrySet()) {
			long key = entry.getLongKey();
			pos.set(key);
			if (pos.getY() < minY || pos.getY() > maxY || !writable(centre, key)) {
				continue;
			}
			BlockState existing = level.getBlockState(pos);
			boolean ok = replaceableByTree(existing) || existing.is(BlockTags.LOGS) && this.roots.contains(key)
				|| this.roots.contains(key) && (isSoil(existing) || existing.is(BlockTags.BASE_STONE_OVERWORLD) || existing.is(Blocks.GRAVEL));
			if (ok) {
				level.setBlock(pos, entry.getValue(), Block.UPDATE_CLIENTS);
				placedLogs.add(key);
			}
		}

		Long2IntOpenHashMap distance = this.leafDistances(placedLogs);
		for (var entry : this.leaves.long2ObjectEntrySet()) {
			long key = entry.getLongKey();
			pos.set(key);
			if (pos.getY() < minY || pos.getY() > maxY || !writable(centre, key)) {
				continue;
			}
			BlockState existing = level.getBlockState(pos);
			if (!replaceableByTree(existing)) {
				continue;
			}
			BlockState state = entry.getValue();
			if (state.hasProperty(LeavesBlock.DISTANCE)) {
				int d = distance.getOrDefault(key, LeavesBlock.DECAY_DISTANCE);
				state = state.setValue(LeavesBlock.DISTANCE, Math.min(d, LeavesBlock.DECAY_DISTANCE))
					.setValue(LeavesBlock.PERSISTENT, d >= LeavesBlock.DECAY_DISTANCE);
			}
			if (state.hasProperty(BlockStateProperties.WATERLOGGED)) {
				state = state.setValue(BlockStateProperties.WATERLOGGED, existing.getFluidState().is(FluidTags.WATER) && existing.getFluidState().isSource());
			}
			level.setBlock(pos, state, Block.UPDATE_CLIENTS);
		}

		for (var entry : this.decorations.long2ObjectEntrySet()) {
			long key = entry.getLongKey();
			pos.set(key);
			if (pos.getY() < minY || pos.getY() > maxY || !writable(centre, key)) {
				continue;
			}
			BlockState state = entry.getValue();
			if (level.getBlockState(pos).isAir() && state.canSurvive(level, pos)) {
				level.setBlock(pos, state, Block.UPDATE_CLIENTS);
			}
		}
		return placedLogs.size();
	}

	private Long2IntOpenHashMap leafDistances(LongOpenHashSet placedLogs) {
		Long2IntOpenHashMap distance = new Long2IntOpenHashMap();
		LongArrayFIFOQueue queue = new LongArrayFIFOQueue();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (long key : this.leaves.keySet()) {
			pos.set(key);
			for (Direction direction : Direction.values()) {
				if (placedLogs.contains(BlockPos.offset(key, direction))) {
					distance.put(key, 1);
					queue.enqueue(key);
					break;
				}
			}
		}
		while (!queue.isEmpty()) {
			long key = queue.dequeueLong();
			int d = distance.get(key);
			if (d >= LeavesBlock.DECAY_DISTANCE - 1) {
				continue;
			}
			for (Direction direction : Direction.values()) {
				long next = BlockPos.offset(key, direction);
				if (this.leaves.containsKey(next) && !distance.containsKey(next)) {
					distance.put(next, d + 1);
					queue.enqueue(next);
				}
			}
		}
		return distance;
	}
}
