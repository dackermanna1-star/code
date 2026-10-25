package com.godforge.destruction;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.Util;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.TagValueInput;

/**
 * The Worldcutter's signature effect: slices the world along a vertical plane and physically pushes the
 * two halves apart, opening a clean chasm. Terrain within {@code push} blocks of the plane is shifted
 * outward (compressing smoothly to zero displacement at the edge of the push zone), block entities move
 * with their blocks, and the work proceeds slice by slice away from the wielder.
 */
public final class CutJob extends BlockJob {
	private static final BlockState AIR = Blocks.AIR.defaultBlockState();

	/** target column (tx,tz) receives the contents of source column (sx,sz); gap columns become air. */
	private record Mapping(int tx, int tz, int sx, int sz, boolean gap) {
	}

	private static final class Column {
		final int top;
		final BlockState[] states;
		Int2ObjectMap<CompoundTag> blockEntities;

		Column(int top, BlockState[] states) {
			this.top = top;
			this.states = states;
		}
	}

	private final CompletableFuture<List<Mapping[]>> plan;
	private final int yMin;
	private final BlockOps.ChunkCache cache;
	private final Long2ObjectMap<Column> snapshot = new Long2ObjectOpenHashMap<>();
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private List<Mapping[]> slices;
	private int slice;
	private int mapping;
	private int y = Integer.MIN_VALUE;
	private int capturedUpTo = -1;

	/**
	 * @param ox,oz   start of the cut (block coordinates, fractional allowed)
	 * @param yaw     direction of the cut in degrees (Minecraft yaw)
	 * @param length  length of the cut
	 * @param gap     width of the opened chasm
	 * @param depth   how far below {@code originY} the cut reaches
	 */
	public CutJob(ServerLevel level, double ox, double oz, int originY, float yaw, double length, double gap, int depth) {
		super(level);
		double rad = Math.toRadians(yaw);
		double ux = -Math.sin(rad);
		double uz = Math.cos(rad);
		double push = Math.max(14.0, gap * 1.8);
		this.yMin = Math.max(level.getMinY() + 1, originY - depth);
		this.cache = new BlockOps.ChunkCache(level);
		this.plan = CompletableFuture.supplyAsync(() -> buildPlan(ox, oz, ux, uz, length, gap, push), Util.backgroundExecutor());
	}

	private static List<Mapping[]> buildPlan(double ox, double oz, double ux, double uz, double length, double gap, double push) {
		double nx = -uz;
		double nz = ux;
		int sliceCount = (int) Math.ceil(length) + 1;
		List<List<Mapping>> buckets = new ArrayList<>(sliceCount);
		for (int i = 0; i < sliceCount; i++) {
			buckets.add(new ArrayList<>());
		}
		double half = gap / 2.0;
		double compress = 1.0 - half / push;
		double[] xs = {ox + nx * push, ox - nx * push, ox + ux * length + nx * push, ox + ux * length - nx * push};
		double[] zs = {oz + nz * push, oz - nz * push, oz + uz * length + nz * push, oz + uz * length - nz * push};
		int minX = Mth.floor(Math.min(Math.min(xs[0], xs[1]), Math.min(xs[2], xs[3]))) - 1;
		int maxX = Mth.floor(Math.max(Math.max(xs[0], xs[1]), Math.max(xs[2], xs[3]))) + 1;
		int minZ = Mth.floor(Math.min(Math.min(zs[0], zs[1]), Math.min(zs[2], zs[3]))) - 1;
		int maxZ = Mth.floor(Math.max(Math.max(zs[0], zs[1]), Math.max(zs[2], zs[3]))) + 1;
		for (int x = minX; x <= maxX; x++) {
			for (int z = minZ; z <= maxZ; z++) {
				double rx = x + 0.5 - ox;
				double rz = z + 0.5 - oz;
				double t = rx * ux + rz * uz;
				double d = rx * nx + rz * nz;
				if (t < 0 || t > length || Math.abs(d) > push) {
					continue;
				}
				int bucket = Math.min(sliceCount - 1, (int) t);
				double ad = Math.abs(d);
				if (ad < half) {
					buckets.get(bucket).add(new Mapping(x, z, x, z, true));
					continue;
				}
				double source = (ad - half) / compress;
				double shift = ad - source;
				double sign = Math.signum(d);
				int sx = Mth.floor(x + 0.5 - nx * sign * shift);
				int sz = Mth.floor(z + 0.5 - nz * sign * shift);
				if (sx == x && sz == z) {
					continue;
				}
				buckets.get(bucket).add(new Mapping(x, z, sx, sz, false));
			}
		}
		List<Mapping[]> out = new ArrayList<>(sliceCount);
		for (List<Mapping> b : buckets) {
			out.add(b.toArray(new Mapping[0]));
		}
		return out;
	}

	@Override
	protected boolean isReady() {
		return this.plan.isDone();
	}

	/** Fraction of slices completed, for syncing visuals. */
	public float progress() {
		return this.slices == null || this.slices.isEmpty() ? 0.0F : (float) this.slice / this.slices.size();
	}

	private static long key(int x, int z) {
		return BlockPos.asLong(x, 0, z);
	}

	private Column capture(int x, int z) {
		long k = key(x, z);
		Column existing = this.snapshot.get(k);
		if (existing != null) {
			return existing;
		}
		LevelChunk chunk = this.cache.chunk(x, z);
		if (chunk == null) {
			Column empty = new Column(this.yMin - 1, new BlockState[0]);
			this.snapshot.put(k, empty);
			return empty;
		}
		int top = Math.max(this.yMin - 1, chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x & 15, z & 15));
		BlockState[] states = new BlockState[Math.max(0, top - this.yMin + 1)];
		Column column = new Column(top, states);
		for (int yy = this.yMin; yy <= top; yy++) {
			this.cursor.set(x, yy, z);
			BlockState state = chunk.getBlockState(this.cursor);
			states[yy - this.yMin] = state;
			if (state.hasBlockEntity()) {
				BlockEntity be = chunk.getBlockEntity(this.cursor);
				if (be != null) {
					if (column.blockEntities == null) {
						column.blockEntities = new Int2ObjectOpenHashMap<>();
					}
					column.blockEntities.put(yy, be.saveWithoutMetadata(this.level.registryAccess()));
				}
			}
		}
		this.snapshot.put(k, column);
		return column;
	}

	private BlockState stateAt(Column column, int yy) {
		int i = yy - this.yMin;
		return i >= 0 && i < column.states.length ? column.states[i] : AIR;
	}

	private void captureSlice(int s) {
		if (s >= this.slices.size() || s <= this.capturedUpTo) {
			return;
		}
		for (Mapping m : this.slices.get(s)) {
			this.capture(m.tx, m.tz);
		}
		this.capturedUpTo = s;
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		if (this.slices == null) {
			this.slices = this.plan.join();
		}
		int ops = 0;
		int checks = 0;
		while (this.slice < this.slices.size() && ops < budget) {
			if ((++checks & 255) == 0 && System.nanoTime() > deadlineNanos) {
				return ops;
			}
			// originals of this slice and the next must be safe before anything here is modified
			this.captureSlice(this.slice);
			this.captureSlice(this.slice + 1);
			Mapping[] maps = this.slices.get(this.slice);
			if (this.mapping >= maps.length) {
				this.slice++;
				this.mapping = 0;
				this.y = Integer.MIN_VALUE;
				// free memory of columns that can no longer be read (two slices behind)
				if (this.slice >= 3) {
					for (Mapping m : this.slices.get(this.slice - 3)) {
						this.snapshot.remove(key(m.tx, m.tz));
					}
				}
				continue;
			}
			Mapping m = maps[this.mapping];
			Column target = this.capture(m.tx, m.tz);
			Column source = m.gap ? null : this.capture(m.sx, m.sz);
			int top = Math.max(target.top, source == null ? Integer.MIN_VALUE : source.top);
			if (this.y == Integer.MIN_VALUE) {
				this.y = this.yMin;
			}
			LevelChunk chunk = this.cache.chunk(m.tx, m.tz);
			if (chunk == null) {
				this.mapping++;
				this.y = Integer.MIN_VALUE;
				continue;
			}
			while (this.y <= top && ops < budget) {
				int yy = this.y++;
				ops++;
				BlockState original = this.stateAt(target, yy);
				this.cursor.set(m.tx, yy, m.tz);
				if (BlockOps.isProtected(this.level, this.cursor, original)) {
					continue;
				}
				BlockState next = source == null ? AIR : this.stateAt(source, yy);
				if (source != null && BlockOps.isProtected(this.level, this.cursor, next)) {
					next = AIR; // never duplicate bedrock-like blocks into new places
				}
				BlockState current = chunk.getBlockState(this.cursor);
				if (current == next) {
					continue;
				}
				BlockOps.set(this.level, this.cursor, next);
				if (source != null && next.hasBlockEntity() && source.blockEntities != null) {
					CompoundTag tag = source.blockEntities.get(yy);
					BlockEntity be = chunk.getBlockEntity(this.cursor);
					if (tag != null && be != null) {
						be.loadWithComponents(TagValueInput.create(ProblemReporter.DISCARDING, this.level.registryAccess(), tag));
						be.setChanged();
					}
				}
			}
			if (this.y > top) {
				this.mapping++;
				this.y = Integer.MIN_VALUE;
			}
		}
		if (this.slice >= this.slices.size()) {
			this.snapshot.clear();
			this.finish();
		}
		return ops;
	}
}
