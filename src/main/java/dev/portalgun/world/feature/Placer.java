package dev.portalgun.world.feature;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.Vec3;

/**
 * Safe block access for features: never touches chunks outside the region a feature may write to (reads there return
 * VOID_AIR, writes are dropped), never replaces bedrock/unbreakable/block-entity blocks and fixes up leaves
 * (persistent) and waterlogging. All writes use flags 2|16.
 */
public final class Placer {
	public static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;

	public final WorldGenLevel level;
	public final RandomSource random;
	public final BlockPos origin;
	private final int minChunkX;
	private final int maxChunkX;
	private final int minChunkZ;
	private final int maxChunkZ;
	private final int minY;
	private final int maxY;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	public int placed;

	public Placer(FeaturePlaceContext<?> ctx) {
		this(ctx.level(), ctx.random(), ctx.origin());
	}

	public Placer(WorldGenLevel level, RandomSource random, BlockPos origin) {
		this.level = level;
		this.random = random;
		this.origin = origin;
		ChunkPos center;
		int radius;
		if (level instanceof WorldGenRegion region) {
			center = region.getCenter();
			radius = 1;
		} else {
			center = new ChunkPos(origin);
			radius = 2;
		}
		this.minChunkX = center.x - radius;
		this.maxChunkX = center.x + radius;
		this.minChunkZ = center.z - radius;
		this.maxChunkZ = center.z + radius;
		this.minY = level.getMinY();
		this.maxY = level.getMaxY();
	}

	public boolean inBounds(int x, int y, int z) {
		int cx = x >> 4;
		int cz = z >> 4;
		return y >= this.minY && y <= this.maxY && cx >= this.minChunkX && cx <= this.maxChunkX && cz >= this.minChunkZ && cz <= this.maxChunkZ;
	}

	public boolean inBounds(BlockPos p) {
		return this.inBounds(p.getX(), p.getY(), p.getZ());
	}

	public int minY() {
		return this.minY;
	}

	public int maxY() {
		return this.maxY;
	}

	public BlockState get(int x, int y, int z) {
		if (!this.inBounds(x, y, z)) {
			return Blocks.VOID_AIR.defaultBlockState();
		}
		return this.level.getBlockState(this.cursor.set(x, y, z));
	}

	public BlockState get(BlockPos p) {
		return this.get(p.getX(), p.getY(), p.getZ());
	}

	/** Air, replaceable vegetation, leaves, snow layers and fluids: things a structure may grow through. */
	public static boolean isSoft(BlockState s) {
		if (s.isAir()) {
			return !s.is(Blocks.VOID_AIR);
		}
		if (s.canBeReplaced() || s.is(BlockTags.REPLACEABLE_BY_TREES) || s.is(BlockTags.LEAVES) || s.is(BlockTags.FLOWERS)
			|| s.is(BlockTags.SAPLINGS) || !s.getFluidState().isEmpty() && s.getBlock() instanceof net.minecraft.world.level.block.LiquidBlock) {
			return true;
		}
		// small decorations without collision (our plants, mushrooms, vines...)
		return !s.blocksMotion() && !s.hasBlockEntity() && s.getFluidState().isEmpty();
	}

	public boolean isSoft(int x, int y, int z) {
		return this.inBounds(x, y, z) && isSoft(this.get(x, y, z));
	}

	/** Solid ground: blocks motion, not leaves, not soft. */
	public boolean isSolid(int x, int y, int z) {
		if (!this.inBounds(x, y, z)) {
			return false;
		}
		BlockState s = this.get(x, y, z);
		return s.blocksMotion() && !s.is(BlockTags.LEAVES) && !isSoft(s);
	}

	public boolean isWater(int x, int y, int z) {
		return this.inBounds(x, y, z) && Fluids.WATER.isSame(this.get(x, y, z).getFluidState().getType());
	}

	public boolean isLava(int x, int y, int z) {
		return this.inBounds(x, y, z) && Fluids.LAVA.isSame(this.get(x, y, z).getFluidState().getType());
	}

	public boolean isFluid(int x, int y, int z) {
		return this.inBounds(x, y, z) && !this.get(x, y, z).getFluidState().isEmpty();
	}

	private boolean protectedBlock(BlockState s, BlockPos p) {
		return s.is(Blocks.VOID_AIR) || s.hasBlockEntity() || s.is(BlockTags.FEATURES_CANNOT_REPLACE) || s.getDestroySpeed(this.level, p) < 0;
	}

	/** Places a block, replacing anything except protected blocks. */
	public boolean set(int x, int y, int z, BlockState state) {
		if (!this.inBounds(x, y, z)) {
			return false;
		}
		BlockPos p = this.cursor.set(x, y, z);
		BlockState old = this.level.getBlockState(p);
		if (this.protectedBlock(old, p)) {
			return false;
		}
		BlockState s = this.adjust(state, old);
		this.level.setBlock(p, s, FLAGS);
		this.placed++;
		return true;
	}

	public boolean set(BlockPos p, BlockState state) {
		return this.set(p.getX(), p.getY(), p.getZ(), state);
	}

	/** Places a block only where nothing solid is in the way. */
	public boolean setSoft(int x, int y, int z, BlockState state) {
		if (!this.inBounds(x, y, z)) {
			return false;
		}
		BlockState old = this.get(x, y, z);
		if (!isSoft(old)) {
			return false;
		}
		return this.set(x, y, z, state);
	}

	public boolean setSoft(BlockPos p, BlockState state) {
		return this.setSoft(p.getX(), p.getY(), p.getZ(), state);
	}

	/** Places a block only into air (not into fluids or plants). */
	public boolean setAir(int x, int y, int z, BlockState state) {
		if (!this.inBounds(x, y, z)) {
			return false;
		}
		BlockState old = this.get(x, y, z);
		if (!old.isAir() || old.is(Blocks.VOID_AIR)) {
			return false;
		}
		return this.set(x, y, z, state);
	}

	/** Places a decoration block (plant, cluster...) if it can survive there. */
	public boolean setDecoration(int x, int y, int z, BlockState state) {
		// canSurvive reads the neighbours, so all of them must be inside the region too
		if (!this.inBounds(x, y, z) || !this.inBounds(x, y - 1, z) || !this.inBounds(x, y + 1, z) || !this.inBounds(x - 1, y, z - 1)
			|| !this.inBounds(x + 1, y, z + 1)) {
			return false;
		}
		BlockState old = this.get(x, y, z);
		if (!(old.isAir() || old.canBeReplaced() && old.getFluidState().isEmpty() || old.is(Blocks.WATER))) {
			return false;
		}
		BlockPos p = new BlockPos(x, y, z);
		BlockState s = this.adjust(state, old);
		if (!s.canSurvive(this.level, p)) {
			return false;
		}
		if (s.getBlock() instanceof net.minecraft.world.level.block.DoublePlantBlock) {
			if (!this.get(x, y + 1, z).isAir() || !this.inBounds(x, y + 1, z)) {
				return false;
			}
			net.minecraft.world.level.block.DoublePlantBlock.placeAt(this.level, s, p, FLAGS);
			this.placed += 2;
			return true;
		}
		this.level.setBlock(p, s, FLAGS);
		this.placed++;
		return true;
	}

	/** Leaves placed by features are persistent (they are not connected to logs); fluids waterlog the block. */
	public BlockState adjust(BlockState state, BlockState old) {
		BlockState s = state;
		if (s.getBlock() instanceof LeavesBlock && s.hasProperty(LeavesBlock.PERSISTENT)) {
			s = s.setValue(LeavesBlock.PERSISTENT, true);
		}
		if (s.hasProperty(BlockStateProperties.WATERLOGGED)) {
			s = s.setValue(BlockStateProperties.WATERLOGGED, old.getFluidState().getType() == Fluids.WATER && old.getFluidState().isSource());
		}
		return s;
	}

	/** First solid block at or below startY within maxDepth, or Integer.MIN_VALUE. */
	public int groundBelow(int x, int startY, int z, int maxDepth) {
		for (int y = startY; y >= startY - maxDepth && y >= this.minY; y--) {
			if (this.isSolid(x, y, z)) {
				return y;
			}
		}
		return Integer.MIN_VALUE;
	}

	/** First solid block at or above startY within maxHeight, or Integer.MAX_VALUE. */
	public int ceilingAbove(int x, int startY, int z, int maxHeight) {
		for (int y = startY; y <= startY + maxHeight && y <= this.maxY; y++) {
			if (this.isSolid(x, y, z)) {
				return y;
			}
		}
		return Integer.MAX_VALUE;
	}

	/** Extends a column of {@code state} downward from {@code fromY} through soft blocks until it meets the ground. */
	public void fillDown(int x, int fromY, int z, BlockState state, int maxDepth) {
		for (int y = fromY; y > fromY - maxDepth && y >= this.minY; y--) {
			if (!this.inBounds(x, y, z) || this.isSolid(x, y, z)) {
				return;
			}
			this.set(x, y, z, state);
		}
	}

	/** Filled sphere (fluids/soft blocks replaced; solid ones too when force). */
	public void sphere(double cx, double cy, double cz, double r, BlockState state, boolean force) {
		int r0 = (int) Math.ceil(r);
		double r2 = r * r;
		int bx = (int) Math.floor(cx);
		int by = (int) Math.floor(cy);
		int bz = (int) Math.floor(cz);
		for (int dx = -r0; dx <= r0; dx++) {
			for (int dy = -r0; dy <= r0; dy++) {
				for (int dz = -r0; dz <= r0; dz++) {
					int x = bx + dx;
					int y = by + dy;
					int z = bz + dz;
					double ex = x + 0.5 - cx;
					double ey = y + 0.5 - cy;
					double ez = z + 0.5 - cz;
					if (ex * ex + ey * ey + ez * ez <= r2) {
						if (force) {
							this.set(x, y, z, state);
						} else {
							this.setSoft(x, y, z, state);
						}
					}
				}
			}
		}
	}

	/** A tube of spheres from a to b with radius ra..rb. Pillar blocks are aligned with the tube's dominant axis. */
	public void tube(Vec3 a, Vec3 b, double ra, double rb, BlockState state, boolean force) {
		Vec3 d = b.subtract(a);
		double len = d.length();
		BlockState s = alignAxis(state, d);
		int steps = Math.max(1, (int) Math.ceil(len / 0.5));
		for (int i = 0; i <= steps; i++) {
			double t = (double) i / steps;
			double r = ra + (rb - ra) * t;
			double x = a.x + d.x * t;
			double y = a.y + d.y * t;
			double z = a.z + d.z * t;
			if (r < 0.75) {
				int bx = (int) Math.floor(x);
				int by = (int) Math.floor(y);
				int bz = (int) Math.floor(z);
				if (force) {
					this.set(bx, by, bz, s);
				} else {
					this.setSoft(bx, by, bz, s);
				}
			} else {
				this.sphere(x, y, z, r, s, force);
			}
		}
	}

	/** Pillar blocks (axis property) turned to the closest axis of a direction. */
	public static BlockState alignAxis(BlockState state, Vec3 dir) {
		if (!state.hasProperty(BlockStateProperties.AXIS)) {
			return state;
		}
		double ax = Math.abs(dir.x);
		double ay = Math.abs(dir.y);
		double az = Math.abs(dir.z);
		Direction.Axis axis = ay >= ax && ay >= az ? Direction.Axis.Y : (ax >= az ? Direction.Axis.X : Direction.Axis.Z);
		return state.setValue(BlockStateProperties.AXIS, axis);
	}

	public static BlockState withAxis(BlockState state, Direction.Axis axis) {
		return state.hasProperty(BlockStateProperties.AXIS) ? state.setValue(BlockStateProperties.AXIS, axis) : state;
	}

	/**
	 * Fills the candidate cells with water sources, after repeatedly discarding candidates that would leak (a side or
	 * the floor that is neither solid, water nor another surviving candidate).
	 */
	public int placeContainedWater(java.util.Collection<BlockPos> candidates) {
		java.util.Set<BlockPos> set = new java.util.HashSet<>();
		for (BlockPos c : candidates) {
			if (this.inBounds(c) && this.get(c).isAir()) {
				set.add(c.immutable());
			}
		}
		boolean changed = true;
		while (changed && !set.isEmpty()) {
			changed = false;
			java.util.Iterator<BlockPos> it = set.iterator();
			while (it.hasNext()) {
				BlockPos c = it.next();
				boolean leaks = false;
				for (Direction d : new Direction[] {Direction.DOWN, Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST}) {
					BlockPos n = c.relative(d);
					if (!set.contains(n) && !this.isSolid(n.getX(), n.getY(), n.getZ()) && !this.isWater(n.getX(), n.getY(), n.getZ())) {
						leaks = true;
						break;
					}
				}
				if (leaks) {
					it.remove();
					changed = true;
				}
			}
		}
		for (BlockPos c : set) {
			this.set(c, Blocks.WATER.defaultBlockState());
		}
		return set.size();
	}

	/** Places a water source only where it is enclosed (solid or water below and on all four sides). */
	public boolean setContainedWater(int x, int y, int z) {
		if (!this.isSolid(x, y - 1, z) && !this.isWater(x, y - 1, z)) {
			return false;
		}
		for (Direction d : Direction.Plane.HORIZONTAL) {
			int nx = x + d.getStepX();
			int nz = z + d.getStepZ();
			if (!this.isSolid(nx, y, nz) && !this.isWater(nx, y, nz)) {
				return false;
			}
		}
		return this.set(x, y, z, Blocks.WATER.defaultBlockState());
	}

	public double nextRange(double lo, double hi) {
		return lo + this.random.nextDouble() * (hi - lo);
	}
}
