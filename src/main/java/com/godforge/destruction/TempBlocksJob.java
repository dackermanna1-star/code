package com.godforge.destruction;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;

/**
 * Places temporary blocks (glowing fissures, light sources ...) and restores the originals after a delay.
 * On shutdown or cancellation everything is restored immediately so no temporary block outlives its effect.
 */
public final class TempBlocksJob extends BlockJob {
	private record Entry(BlockPos pos, BlockState placed, BlockState[] original) {
	}

	private final List<Entry> entries = new ArrayList<>();
	private final BlockOps.ChunkCache cache;
	private final int holdTicks;
	private final boolean onlyReplaceAir;
	private int placeIndex;
	private int revertIndex;
	private long revertAt = -1;

	/**
	 * @param holdTicks      how long the temporary blocks stay before being reverted
	 * @param onlyReplaceAir true to only use empty space (light sources), false to overwrite terrain
	 */
	public TempBlocksJob(ServerLevel level, int holdTicks, boolean onlyReplaceAir) {
		super(level);
		this.cache = new BlockOps.ChunkCache(level);
		this.holdTicks = holdTicks;
		this.onlyReplaceAir = onlyReplaceAir;
	}

	public TempBlocksJob add(BlockPos pos, BlockState state) {
		this.entries.add(new Entry(pos.immutable(), state, new BlockState[1]));
		return this;
	}

	public int size() {
		return this.entries.size();
	}

	@Override
	public boolean holdsTemporaryBlocks() {
		return true;
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		int ops = 0;
		while (this.placeIndex < this.entries.size() && ops < budget) {
			Entry entry = this.entries.get(this.placeIndex++);
			LevelChunk chunk = this.cache.chunk(entry.pos.getX(), entry.pos.getZ());
			if (chunk == null || !BlockOps.inBuildHeight(this.level, entry.pos.getY())) {
				continue;
			}
			BlockState current = chunk.getBlockState(entry.pos);
			if (BlockOps.isProtected(this.level, entry.pos, current) || current.hasBlockEntity() || (this.onlyReplaceAir && !current.isAir())) {
				continue;
			}
			entry.original[0] = current;
			BlockOps.set(this.level, entry.pos, entry.placed);
			ops++;
		}
		if (this.placeIndex < this.entries.size()) {
			return ops;
		}
		if (this.revertAt < 0) {
			this.revertAt = this.level.getGameTime() + this.holdTicks;
		}
		if (this.level.getGameTime() < this.revertAt) {
			return ops;
		}
		while (this.revertIndex < this.entries.size() && ops < budget) {
			this.restore(this.entries.get(this.revertIndex++));
			ops++;
		}
		if (this.revertIndex >= this.entries.size()) {
			this.finish();
		}
		return ops;
	}

	private void restore(Entry entry) {
		BlockState original = entry.original[0];
		if (original == null) {
			return;
		}
		LevelChunk chunk = this.cache.chunk(entry.pos.getX(), entry.pos.getZ());
		if (chunk != null && chunk.getBlockState(entry.pos) == entry.placed) {
			BlockOps.set(this.level, entry.pos, original);
		}
		entry.original[0] = null;
	}

	@Override
	public void cancel() {
		for (int i = this.revertIndex; i < this.placeIndex; i++) {
			this.restore(this.entries.get(i));
		}
		super.cancel();
	}
}
