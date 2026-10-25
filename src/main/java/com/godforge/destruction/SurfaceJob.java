package com.godforge.destruction;

import com.godforge.config.GodforgeConfig;
import com.godforge.util.Noise;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;
import org.jspecify.annotations.Nullable;

/**
 * Transforms the top layers of terrain in a disc, spreading outward from the centre
 * (scorching, wasteland conversion, dimensional bleeding ...).
 */
public final class SurfaceJob extends BlockJob {
	@FunctionalInterface
	public interface Transformer {
		/** @return the new state, or null to leave the block alone */
		@Nullable BlockState apply(BlockState state, BlockPos pos, int layer);
	}

	private final BlockPos center;
	private final double radius;
	private final int layers;
	private final int maxVertical;
	private final float fireChance;
	private final double edgeNoise;
	private final long seed;
	private final Transformer transformer;
	private final int[] disc;
	private final BlockOps.ChunkCache cache;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private int index;

	public SurfaceJob(ServerLevel level, BlockPos center, double radius, int layers, int maxVertical, float fireChance, double edgeNoise, Transformer transformer) {
		super(level);
		this.center = center;
		this.radius = radius;
		this.layers = Math.max(1, layers);
		this.maxVertical = maxVertical;
		this.fireChance = GodforgeConfig.get().general.startFires ? fireChance : 0.0F;
		this.edgeNoise = edgeNoise;
		this.seed = level.getRandom().nextLong();
		this.transformer = transformer;
		this.disc = Shapes.sortedDisc((int) Math.ceil(radius * (1.0 + edgeNoise)));
		this.cache = new BlockOps.ChunkCache(level);
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		int ops = 0;
		int checks = 0;
		while (this.index < this.disc.length && ops < budget) {
			if ((++checks & 127) == 0 && System.nanoTime() > deadlineNanos) {
				return ops;
			}
			int packed = this.disc[this.index++];
			int dx = Shapes.dx(packed);
			int dz = Shapes.dz(packed);
			double dist = Math.sqrt(dx * dx + dz * dz);
			double limit = this.radius * (1.0 + this.edgeNoise * Noise.direction(this.seed, dx, 0, dz, 3.0));
			if (dist > limit) {
				continue;
			}
			int x = this.center.getX() + dx;
			int z = this.center.getZ() + dz;
			LevelChunk chunk = this.cache.chunk(x, z);
			if (chunk == null) {
				continue;
			}
			int top = chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x & 15, z & 15);
			if (Math.abs(top - this.center.getY()) > this.maxVertical) {
				continue;
			}
			boolean convertedTop = false;
			for (int layer = 0; layer < this.layers; layer++) {
				int y = top - layer;
				if (!BlockOps.inBuildHeight(this.level, y)) {
					break;
				}
				this.cursor.set(x, y, z);
				BlockState state = chunk.getBlockState(this.cursor);
				if (BlockOps.isProtected(this.level, this.cursor, state)) {
					continue;
				}
				BlockState next = this.transformer.apply(state, this.cursor, layer);
				if (next != null && next != state) {
					BlockOps.set(this.level, this.cursor, next);
					ops++;
					if (layer <= 1 && next.isSolid()) {
						convertedTop = true;
					}
				}
			}
			ops++;
			if (convertedTop && this.fireChance > 0.0F && Noise.hash01(this.seed + 3, x, top, z) < this.fireChance) {
				this.cursor.set(x, top + 1, z);
				if (chunk.getBlockState(this.cursor).isAir()) {
					BlockState fire = BaseFireBlock.getState(this.level, this.cursor);
					if (fire.canSurvive(this.level, this.cursor)) {
						this.level.setBlock(this.cursor, fire, BlockOps.FAST_PLACE);
					}
				}
			}
		}
		if (this.index >= this.disc.length) {
			this.finish();
		}
		return ops;
	}
}
