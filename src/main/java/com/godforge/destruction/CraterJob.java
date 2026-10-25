package com.godforge.destruction;

import com.godforge.util.Noise;
import java.util.concurrent.CompletableFuture;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Carves a noisy ellipsoid crater outward from its centre, optionally lining the walls with a material
 * palette and igniting the surface around the rim afterwards.
 */
public final class CraterJob extends BlockJob {
	private final BlockPos center;
	private final double radius;
	private final double vertical;
	private final double noise;
	private final Palette lining;
	private final double liningDepth;
	private final float fireChance;
	private final long seed;
	private final double maxRadius;
	private final CompletableFuture<int[]> shape;
	private final BlockOps.ChunkCache cache;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private final RandomSource random;
	private int[] offsets;
	private int index;
	private int fireAttempts = -1;

	private CraterJob(Builder b) {
		super(b.level);
		this.center = b.center;
		this.radius = Math.min(b.radius, Shapes.MAX_RADIUS / (1.0 + b.noise) - 1.0);
		this.vertical = Mth.clamp(b.vertical, 0.2, 1.5);
		this.noise = b.noise;
		this.lining = b.lining;
		this.liningDepth = b.liningDepth;
		this.fireChance = b.fireChance;
		this.seed = b.seed;
		this.maxRadius = this.radius * (1.0 + this.noise) + 0.5;
		this.shape = Shapes.sortedSphere((int) Math.ceil(this.maxRadius * Math.max(1.0, this.vertical)));
		this.cache = new BlockOps.ChunkCache(b.level);
		this.random = RandomSource.create(b.seed);
	}

	public static Builder builder(ServerLevel level, BlockPos center, double radius) {
		return new Builder(level, center, radius);
	}

	@Override
	protected boolean isReady() {
		return this.shape.isDone();
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		if (this.offsets == null) {
			this.offsets = this.shape.join();
		}
		int ops = 0;
		int checks = 0;
		double sphereLimitSq = this.maxRadius * Math.max(1.0, this.vertical);
		sphereLimitSq *= sphereLimitSq;
		while (this.index < this.offsets.length && ops < budget) {
			if ((++checks & 255) == 0 && System.nanoTime() > deadlineNanos) {
				return ops;
			}
			int packed = this.offsets[this.index++];
			int dx = Shapes.dx(packed);
			int dy = Shapes.dy(packed);
			int dz = Shapes.dz(packed);
			if (dx * dx + dy * dy + dz * dz > sphereLimitSq) {
				this.index = this.offsets.length;
				break;
			}
			double ey = dy / this.vertical;
			double dist = Math.sqrt(dx * dx + ey * ey + dz * dz);
			if (dist > this.maxRadius) {
				continue;
			}
			double rEff = this.radius * (1.0 + this.noise * Noise.direction(this.seed, dx, ey, dz, 2.2));
			if (dist > rEff) {
				continue;
			}
			int x = this.center.getX() + dx;
			int y = this.center.getY() + dy;
			int z = this.center.getZ() + dz;
			if (!BlockOps.inBuildHeight(this.level, y)) {
				continue;
			}
			LevelChunk chunk = this.cache.chunk(x, z);
			if (chunk == null) {
				continue;
			}
			this.cursor.set(x, y, z);
			BlockState state = chunk.getBlockState(this.cursor);
			if (state.isAir() || BlockOps.isProtected(this.level, this.cursor, state)) {
				continue;
			}
			if (this.lining != Palette.NONE && dist > rEff - this.liningDepth && state.isSolid()) {
				BlockState lined = this.lining.pick(state, this.cursor, this.seed);
				if (lined != null) {
					BlockOps.set(this.level, this.cursor, lined);
				}
			} else {
				BlockOps.erase(this.level, this.cursor);
			}
			ops++;
		}
		if (this.index >= this.offsets.length) {
			ops += this.firePass(Math.max(16, budget - ops));
		}
		return ops;
	}

	private int firePass(int budget) {
		if (this.fireChance <= 0.0F || !com.godforge.config.GodforgeConfig.get().general.startFires) {
			this.finish();
			return 0;
		}
		if (this.fireAttempts < 0) {
			this.fireAttempts = (int) (this.radius * this.radius * 0.6 * this.fireChance) + 4;
		}
		int ops = 0;
		while (this.fireAttempts > 0 && ops < budget) {
			this.fireAttempts--;
			ops++;
			double angle = this.random.nextDouble() * Math.PI * 2;
			double dist = Math.sqrt(this.random.nextDouble()) * this.radius * 1.35;
			int x = Mth.floor(this.center.getX() + 0.5 + Math.cos(angle) * dist);
			int z = Mth.floor(this.center.getZ() + 0.5 + Math.sin(angle) * dist);
			if (this.cache.chunk(x, z) == null) {
				continue;
			}
			int y = this.level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
			if (Math.abs(y - this.center.getY()) > this.radius * 1.5) {
				continue;
			}
			this.cursor.set(x, y, z);
			if (this.level.getBlockState(this.cursor).isAir()) {
				BlockState fire = BaseFireBlock.getState(this.level, this.cursor);
				if (fire.canSurvive(this.level, this.cursor)) {
					this.level.setBlock(this.cursor, fire, BlockOps.FAST_PLACE);
				}
			}
		}
		if (this.fireAttempts <= 0) {
			this.finish();
		}
		return ops;
	}

	public static final class Builder {
		private final ServerLevel level;
		private final BlockPos center;
		private final double radius;
		private double vertical = 0.65;
		private double noise = 0.18;
		private Palette lining = Palette.NONE;
		private double liningDepth = 1.6;
		private float fireChance;
		private long seed;

		private Builder(ServerLevel level, BlockPos center, double radius) {
			this.level = level;
			this.center = center;
			this.radius = Math.max(1.0, radius);
			this.seed = level.getRandom().nextLong();
		}

		public Builder vertical(double factor) {
			this.vertical = factor;
			return this;
		}

		public Builder noise(double amplitude) {
			this.noise = Mth.clamp(amplitude, 0.0, 0.6);
			return this;
		}

		public Builder lining(Palette palette, double depth) {
			this.lining = palette;
			this.liningDepth = depth;
			return this;
		}

		public Builder fire(float chance) {
			this.fireChance = chance;
			return this;
		}

		public Builder seed(long seed) {
			this.seed = seed;
			return this;
		}

		public CraterJob build() {
			return new CraterJob(this);
		}

		public boolean submit() {
			return DestructionManager.submit(this.build());
		}

		public boolean submit(int delayTicks) {
			return DestructionManager.submit(this.build().delayed(delayTicks));
		}
	}
}
