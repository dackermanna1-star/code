package com.godforge.destruction;

import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.function.DoubleConsumer;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Rolls a ring-shaped wave of real terrain outward: columns rise into a crest as the ring reaches them
 * and settle back once it has passed. The original terrain is fully restored afterwards.
 */
public final class WaveJob extends BlockJob {
	private final BlockPos center;
	private final double maxRadius;
	private final double speed;
	private final double crestWidth;
	private final double maxHeight;
	private final int[] disc;
	private final BlockOps.ChunkCache cache;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private final Long2ObjectMap<int[]> raised = new Long2ObjectOpenHashMap<>();
	private final DoubleConsumer onCrest;
	private double radius;
	private long lastTick = Long.MIN_VALUE;
	private int raiseIndex;
	private int lowerIndex;

	public WaveJob(ServerLevel level, BlockPos center, double maxRadius, double speed, double crestWidth, double maxHeight, DoubleConsumer onCrest) {
		super(level);
		this.center = center;
		this.maxRadius = Math.min(maxRadius, 96);
		this.speed = speed;
		this.crestWidth = crestWidth;
		this.maxHeight = maxHeight;
		this.disc = Shapes.sortedDisc((int) Math.ceil(this.maxRadius));
		this.cache = new BlockOps.ChunkCache(level);
		this.onCrest = onCrest;
		this.radius = 2.0;
	}

	@Override
	public boolean holdsTemporaryBlocks() {
		return true;
	}

	private static double dist(int packed) {
		int dx = Shapes.dx(packed);
		int dz = Shapes.dz(packed);
		return Math.sqrt(dx * dx + dz * dz);
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		long now = this.level.getGameTime();
		if (now != this.lastTick) {
			this.lastTick = now;
			this.radius += this.speed;
			if (this.radius <= this.maxRadius && this.onCrest != null) {
				this.onCrest.accept(this.radius);
			}
		}
		int ops = 0;
		// raise columns the crest has reached
		while (this.raiseIndex < this.disc.length && ops < budget && dist(this.disc[this.raiseIndex]) <= Math.min(this.radius, this.maxRadius)) {
			ops += this.raise(this.disc[this.raiseIndex++]);
		}
		// settle columns the crest has passed
		double settle = this.radius - this.crestWidth;
		while (this.lowerIndex < this.raiseIndex && ops < budget && dist(this.disc[this.lowerIndex]) <= settle) {
			ops += this.lower(this.disc[this.lowerIndex++]);
		}
		// done once the crest has rolled past the edge and every raised column has settled again
		// (the disc is built with a rounded-up radius, so its outermost columns are never raised)
		if (settle > this.maxRadius && this.lowerIndex >= this.raiseIndex) {
			this.finish();
		}
		return ops;
	}

	private int raise(int packed) {
		int x = this.center.getX() + Shapes.dx(packed);
		int z = this.center.getZ() + Shapes.dz(packed);
		LevelChunk chunk = this.cache.chunk(x, z);
		if (chunk == null) {
			return 0;
		}
		int top = chunk.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x & 15, z & 15);
		if (Math.abs(top - this.center.getY()) > 24) {
			return 0;
		}
		this.cursor.set(x, top, z);
		BlockState surface = chunk.getBlockState(this.cursor);
		if (!surface.isSolid() || BlockOps.isProtected(this.level, this.cursor, surface) || surface.hasBlockEntity()) {
			return 0;
		}
		BlockState body = surface.is(Blocks.GRASS_BLOCK) || surface.is(BlockTags.DIRT) ? Blocks.DIRT.defaultBlockState() : surface;
		double d = dist(packed) / this.maxRadius;
		int height = (int) Math.round(1 + this.maxHeight * Math.pow(Math.max(0.0, 1.0 - d), 0.8));
		int[] placed = new int[height];
		int count = 0;
		for (int i = 1; i <= height; i++) {
			this.cursor.set(x, top + i, z);
			if (!BlockOps.inBuildHeight(this.level, top + i)) {
				break;
			}
			BlockState there = chunk.getBlockState(this.cursor);
			if (!there.isAir() && !there.is(BlockTags.REPLACEABLE)) {
				break;
			}
			BlockState state = i == height ? surface : body;
			BlockOps.set(this.level, this.cursor, state);
			placed[count++] = top + i;
		}
		if (count > 0) {
			int[] trimmed = count == placed.length ? placed : java.util.Arrays.copyOf(placed, count);
			this.raised.put(BlockPos.asLong(x, 0, z), trimmed);
		}
		return count + 1;
	}

	private int lower(int packed) {
		int x = this.center.getX() + Shapes.dx(packed);
		int z = this.center.getZ() + Shapes.dz(packed);
		int[] ys = this.raised.remove(BlockPos.asLong(x, 0, z));
		if (ys == null) {
			return 0;
		}
		LevelChunk chunk = this.cache.chunk(x, z);
		if (chunk == null) {
			return 0;
		}
		for (int i = ys.length - 1; i >= 0; i--) {
			this.cursor.set(x, ys[i], z);
			BlockOps.erase(this.level, this.cursor);
		}
		return ys.length;
	}

	@Override
	public void cancel() {
		for (Long2ObjectMap.Entry<int[]> e : this.raised.long2ObjectEntrySet()) {
			int x = BlockPos.getX(e.getLongKey());
			int z = BlockPos.getZ(e.getLongKey());
			for (int y : e.getValue()) {
				this.cursor.set(x, y, z);
				BlockOps.erase(this.level, this.cursor);
			}
		}
		this.raised.clear();
		super.cancel();
	}
}
