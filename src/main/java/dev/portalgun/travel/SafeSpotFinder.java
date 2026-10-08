package dev.portalgun.travel;

import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.Destinations;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.NoiseColumn;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Finds somewhere safe to stand near a target point, building a small platform when there is nowhere. */
public final class SafeSpotFinder {
	/** Sky light a spot under a tree/mushroom crown needs to count as forest floor rather than a cave. */
	private static final int MIN_FLOOR_SKY_LIGHT = 7;

	private SafeSpotFinder() {
	}

	public record Spot(Vec3 pos, boolean builtPlatform) {
	}

	public static Spot find(ServerLevel level, Vec3 near) {
		Identifier dim = level.dimension().identifier();
		ContentSpec.DimensionInfo info = Destinations.info(dim);
		String mode = info != null ? info.arrival : (level.dimensionType().hasCeiling() ? "cave" : "surface");
		int minY = level.getMinY() + 1;
		int maxY = level.getMinY() + level.dimensionType().logicalHeight() - 3;
		int startY = (int) Math.round(near.y);
		if (dim.equals(Identifier.withDefaultNamespace("the_end"))) {
			BlockPos p = ServerLevel.END_SPAWN_POINT;
			buildPlatform(level, p.below(), Blocks.OBSIDIAN.defaultBlockState(), null, false);
			return new Spot(Vec3.atBottomCenterOf(p), true);
		}
		BlockPos center = BlockPos.containing(near.x, Math.max(minY, Math.min(maxY, startY)), near.z);
		boolean cave = "cave".equals(mode);
		boolean voidMode = "void".equals(mode);
		Surface surface = cave ? null : new Surface(level, minY, maxY);
		BlockPos[] cramped = new BlockPos[1];
		// Spiral outward; first good column wins. Void worlds (islands / planetoids in empty space) look much further,
		// but only probe the noise column there, so no chunk is generated unless there is land in it.
		int maxR = voidMode ? 96 : (cave ? 40 : 24);
		int stepR = voidMode ? 6 : (cave ? 4 : 3);
		for (int r = 0; r <= maxR; r += stepR) {
			int steps = r == 0 ? 1 : Math.max(8, voidMode ? r : r * 2);
			for (int i = 0; i < steps; i++) {
				double a = (Math.PI * 2 * i) / steps;
				int x = center.getX() + (int) Math.round(Math.cos(a) * r);
				int z = center.getZ() + (int) Math.round(Math.sin(a) * r);
				// caves: stay near the requested height (never pop out on top of an inverted world's stone sky)
				BlockPos found = cave ? scanCave(level, x, z, center.getY(), Math.max(minY, center.getY() - 64), Math.min(maxY, center.getY() + 12), cramped)
					: surface.scan(x, z, voidMode);
				if (found != null) {
					return new Spot(Vec3.atBottomCenterOf(found), false);
				}
			}
		}
		if (cramped[0] != null) {
			return new Spot(Vec3.atBottomCenterOf(cramped[0]), false);
		}
		if (surface != null && surface.canopyFallback != null) {
			return new Spot(Vec3.atBottomCenterOf(surface.canopyFallback), false);
		}
		// Nothing safe nearby: make a little platform out of the dimension's platform block,
		// or a small islet of its beach/biome block when the arrival point is open water.
		if (!cave && !voidMode) {
			level.getChunk(center.getX() >> 4, center.getZ() >> 4);
			int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, center.getX(), center.getZ());
			BlockPos water = new BlockPos(center.getX(), top - 1, center.getZ());
			if (top > minY && top <= maxY && level.getFluidState(water).is(FluidTags.WATER)) {
				BlockState raft = info != null && info.raft != null ? platformBlock(info.raft) : platformBlock(info != null ? info.platform : "");
				// sand/gravel beaches would drop into the sea: give them a solid footing of the platform block
				BlockState footing = raft.getBlock() instanceof net.minecraft.world.level.block.FallingBlock
					? platformBlock(info != null ? info.platform : "") : raft;
				buildPlatform(level, water, raft, footing, true);
				return new Spot(Vec3.atBottomCenterOf(water.above()), true);
			}
		}
		int y;
		if (voidMode || info == null) {
			y = info != null ? info.arrivalY : Math.max(minY + 4, Math.min(maxY - 4, startY));
		} else {
			y = Math.max(minY + 4, Math.min(maxY - 4, info.arrivalY));
		}
		BlockPos stand = new BlockPos(center.getX(), y, center.getZ());
		BlockState platform = info != null ? platformBlock(info.platform) : Blocks.STONE.defaultBlockState();
		buildPlatform(level, stand.below(), platform, null, false);
		return new Spot(Vec3.atBottomCenterOf(stand), true);
	}

	private static BlockState platformBlock(String id) {
		Identifier rl = Identifier.tryParse(id);
		if (rl != null) {
			Block b = BuiltInRegistries.BLOCK.getValue(rl);
			if (b != Blocks.AIR) {
				return b.defaultBlockState();
			}
		}
		return Blocks.STONE.defaultBlockState();
	}

	/**
	 * A 5x5 rounded pad at floor level with air above. As an islet it gets a ragged edge and a second layer below the
	 * water line so it reads like a little sandbar rather than a debug square.
	 */
	private static void buildPlatform(ServerLevel level, BlockPos floor, BlockState state, @Nullable BlockState footing, boolean islet) {
		long h = floor.asLong() * 0x9E3779B97F4A7C15L;
		int reach = islet ? 3 : 2;
		for (int dx = -reach; dx <= reach; dx++) {
			for (int dz = -reach; dz <= reach; dz++) {
				int d2 = dx * dx + dz * dz;
				boolean core = Math.abs(dx) <= 2 && Math.abs(dz) <= 2 && !(Math.abs(dx) == 2 && Math.abs(dz) == 2);
				if (islet) {
					long bit = (h >>> ((dx + 3) * 7 + (dz + 3)) % 61) & 1L;
					// keep the middle solid, fray the rim: some corners missing, a few blocks poking out
					if (d2 > 9 || (!core && bit == 0) || (core && d2 >= 5 && bit == 0 && (dx + dz & 1) == 0)) {
						continue;
					}
				} else if (!core) {
					continue;
				}
				BlockPos p = floor.offset(dx, 0, dz);
				if (islet) {
					BlockPos under = p.below();
					if (level.getBlockState(under).canBeReplaced() || !level.getFluidState(under).isEmpty()) {
						level.setBlockAndUpdate(under, footing != null ? footing : state);
					}
				}
				if (level.getBlockState(p).canBeReplaced() || !level.getFluidState(p).isEmpty()) {
					level.setBlockAndUpdate(p, state);
				}
				for (int k = 1; k <= 3; k++) {
					BlockPos air = p.above(k);
					BlockState s = level.getBlockState(air);
					if (!s.isAir() && !s.is(Blocks.BEDROCK)) {
						level.setBlockAndUpdate(air, Blocks.AIR.defaultBlockState());
					}
				}
			}
		}
	}

	/** Surface/void column scanner. Uses the pre-feature terrain height to tell real ground from feature tops. */
	private static final class Surface {
		/** Feet may stand at most this far above the noise terrain surface (snow, paths, small rocks). */
		private static final int FEATURE_SLACK = 1;
		/** Deeper than this below the noise surface is a ravine/cave mouth cut by a carver, not ground to arrive on. */
		private static final int CARVED_SLACK = 2;
		private final ServerLevel level;
		private final int minY;
		private final int maxY;
		private final boolean ceiling;
		private final boolean skyLight;
		@Nullable BlockPos canopyFallback;

		Surface(ServerLevel level, int minY, int maxY) {
			this.level = level;
			this.minY = minY;
			this.maxY = maxY;
			this.ceiling = level.dimensionType().hasCeiling();
			this.skyLight = level.dimensionType().hasSkyLight();
		}

		/** Returned for a column whose terrain top is a floating lump (sky blob, arch top) rather than ground. */
		private static final int FLOATING = Integer.MIN_VALUE + 1;

		/**
		 * Top of the terrain before features (trees, giant plants, spires, structures...), Integer.MIN_VALUE if unknown,
		 * or {@link #FLOATING} when (ground worlds only) that top sits on a lump with open air under it.
		 */
		private int baseHeight(int x, int z, boolean voidMode) {
			if (this.ceiling) {
				return Integer.MIN_VALUE;
			}
			try {
				ChunkGenerator gen = this.level.getChunkSource().getGenerator();
				var rs = this.level.getChunkSource().randomState();
				if (voidMode) {
					return gen.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, this.level, rs);
				}
				NoiseColumn col = gen.getBaseColumn(x, z, this.level, rs);
				int top = this.level.getMaxY();
				int y = top;
				while (y > this.minY && col.getBlock(y).isAir()) {
					y--;
				}
				if (y <= this.minY) {
					return Integer.MIN_VALUE;
				}
				int base = y + 1;
				// well above the style's heightmap surface with a gap of open air under it: a floating lump, not ground
				// (an ordinary cave under the surface has its top at the heightmap level and is not rejected)
				double prelim = rs.router().preliminarySurfaceLevel().compute(new net.minecraft.world.level.levelgen.DensityFunction.SinglePointContext(x, 0, z));
				if (base <= prelim + 8) {
					return base;
				}
				int run = 0;
				for (int k = y; k > y - 40 && k > this.minY; k--) {
					if (col.getBlock(k).isAir()) {
						if (++run >= 5) {
							return FLOATING;
						}
					} else {
						run = 0;
					}
				}
				return base;
			} catch (RuntimeException e) {
				return Integer.MIN_VALUE;
			}
		}

		@Nullable BlockPos scan(int x, int z, boolean voidMode) {
			int base = this.baseHeight(x, z, voidMode);
			if (base == FLOATING || voidMode && base != Integer.MIN_VALUE && base <= this.minY + 1) {
				return null; // floating lump, or an empty void column: don't generate the chunk just to find out
			}
			this.level.getChunk(x >> 4, z >> 4);
			int top = this.level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
			if (top <= this.minY) {
				return null;
			}
			BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(x, Math.min(top, this.maxY), z);
			// walk down a little in case the heightmap top is a thin overhang/foliage
			BlockPos elevated = null;
			for (int i = 0; i < 6 && p.getY() > this.minY; i++) {
				if (i > 0 && this.solidNonCanopy(p)) {
					break; // reached the ground (or an overhang) without a spot: never continue into the cave under it
				}
				if (this.dryStandable(p)) {
					boolean canopy = isCanopy(this.level.getBlockState(p.below()));
					if (!canopy && (base == Integer.MIN_VALUE || p.getY() <= base + FEATURE_SLACK && p.getY() >= base - CARVED_SLACK)) {
						return p.immutable();
					}
					if (canopy) {
						elevated = p.immutable();
					}
					break;
				}
				p.move(Direction.DOWN);
			}
			if (base != Integer.MIN_VALUE) {
				// on (or inside) a feature - mushroom/tree crown, spire, boulder, arch, monolith...: stand on the
				// ground beside/below it instead, but only right at terrain level (never down into a cave or ravine)
				int hi = Math.min(this.maxY, base + FEATURE_SLACK);
				int lo = Math.max(this.minY, base - 2);
				for (int y = hi; y >= lo; y--) {
					p.setY(y);
					if (this.dryStandable(p) && !isCanopy(this.level.getBlockState(p.below())) && this.openAbove(p, top)
						&& (!this.skyLight || this.level.getBrightness(LightLayer.SKY, p) >= MIN_FLOOR_SKY_LIGHT)) {
						return p.immutable();
					}
				}
			}
			// no ground reachable in this column (e.g. inside a stem): remember the crown as a last resort
			if (elevated != null && this.canopyFallback == null) {
				this.canopyFallback = elevated;
			}
			return null;
		}

		private boolean solidNonCanopy(BlockPos pos) {
			BlockState st = this.level.getBlockState(pos);
			return !st.getCollisionShape(this.level, pos).isEmpty() && !isCanopy(st);
		}

		/** Nothing solid but crowns/caps between the head and the column top: not under an overhang, arch or spire. */
		private boolean openAbove(BlockPos feet, int top) {
			BlockPos.MutableBlockPos q = new BlockPos.MutableBlockPos(feet.getX(), feet.getY() + 2, feet.getZ());
			for (; q.getY() < top; q.move(Direction.UP)) {
				if (this.solidNonCanopy(q)) {
					return false;
				}
			}
			return true;
		}

		/**
		 * Standable with dry feet and head, not a lily pad / thin slab floating on a fluid, and not at the bottom of a
		 * pit or a crack between spikes: most of the ring around the head must be open.
		 */
		private boolean dryStandable(BlockPos feet) {
			if (!isStandable(this.level, feet) || !this.level.getFluidState(feet).isEmpty() || !this.level.getFluidState(feet.above()).isEmpty()) {
				return false;
			}
			BlockPos floor = feet.below();
			BlockState fs = this.level.getBlockState(floor);
			if (!this.level.getFluidState(floor.below()).isEmpty() && !fs.isCollisionShapeFullBlock(this.level, floor)) {
				return false;
			}
			return isOpen(this.level, feet);
		}
	}

	private static boolean isCanopy(BlockState s) {
		return s.is(BlockTags.LEAVES) || s.is(BlockTags.LOGS) || s.is(Blocks.RED_MUSHROOM_BLOCK) || s.is(Blocks.BROWN_MUSHROOM_BLOCK)
			|| s.is(Blocks.MUSHROOM_STEM) || dev.portalgun.registry.ModBlocks.CANOPY.contains(s.getBlock());
	}

	/** Not at the bottom of a pit, in a crack between spikes or a moss pocket: most of the ring around the head is open. */
	private static boolean isOpen(ServerLevel level, BlockPos feet) {
		BlockPos.MutableBlockPos q = new BlockPos.MutableBlockPos();
		int open = 0;
		for (int r = 1; r <= 2; r++) {
			for (int dx = -r; dx <= r; dx += r) {
				for (int dz = -r; dz <= r; dz += r) {
					if (dx == 0 && dz == 0) {
						continue;
					}
					q.set(feet.getX() + dx, feet.getY() + 1, feet.getZ() + dz);
					if (level.getBlockState(q).getCollisionShape(level, q).isEmpty()) {
						open++;
					}
				}
			}
		}
		return open >= 10; // of 16
	}

	private static @Nullable BlockPos scanCave(ServerLevel level, int x, int z, int startY, int minY, int maxY, BlockPos[] cramped) {
		level.getChunk(x >> 4, z >> 4);
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(x, startY, z);
		for (int d = 0; d < (maxY - minY); d++) {
			int up = startY + d;
			int down = startY - d;
			if (up <= maxY) {
				p.setY(up);
				if (isStandable(level, p)) {
					if (isOpen(level, p) && !isCanopy(level.getBlockState(p.below()))) {
						return p.immutable();
					}
					if (cramped[0] == null) {
						cramped[0] = p.immutable();
					}
				}
			}
			if (down >= minY) {
				p.setY(down);
				if (isStandable(level, p)) {
					if (isOpen(level, p) && !isCanopy(level.getBlockState(p.below()))) {
						return p.immutable();
					}
					if (cramped[0] == null) {
						cramped[0] = p.immutable();
					}
				}
			}
			if (up > maxY && down < minY) {
				break;
			}
		}
		return null;
	}

	/** Feet at pos: solid, harmless floor below and two blocks of breathable space. */
	public static boolean isStandable(ServerLevel level, BlockPos feet) {
		BlockPos below = feet.below();
		BlockState floor = level.getBlockState(below);
		if (floor.getCollisionShape(level, below).isEmpty() || isHazard(floor)) {
			return false;
		}
		return isClear(level, feet) && isClear(level, feet.above());
	}

	private static boolean isClear(ServerLevel level, BlockPos pos) {
		BlockState s = level.getBlockState(pos);
		if (!s.getCollisionShape(level, pos).isEmpty()) {
			return false;
		}
		if (level.getFluidState(pos).is(FluidTags.LAVA) || isHazard(s)) {
			return false;
		}
		return level.getFluidState(pos).isEmpty() || pos.getY() > level.getSeaLevel() - 2;
	}

	private static boolean isHazard(BlockState s) {
		return s.is(dev.portalgun.registry.ModBlocks.HAZARDS) || s.is(Blocks.LAVA) || s.is(Blocks.MAGMA_BLOCK) || s.is(Blocks.CACTUS) || s.is(BlockTags.FIRE)
			|| s.is(Blocks.SWEET_BERRY_BUSH) || s.is(Blocks.POWDER_SNOW) || s.is(Blocks.WITHER_ROSE)
			|| s.is(Blocks.POINTED_DRIPSTONE) || s.is(Blocks.CAMPFIRE) || s.is(Blocks.SOUL_CAMPFIRE);
	}
}
