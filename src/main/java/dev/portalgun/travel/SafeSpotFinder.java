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
import net.minecraft.world.level.LightLayer;
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
			buildPlatform(level, p.below(), Blocks.OBSIDIAN.defaultBlockState());
			return new Spot(Vec3.atBottomCenterOf(p), true);
		}
		BlockPos center = BlockPos.containing(near.x, Math.max(minY, Math.min(maxY, startY)), near.z);
		BlockPos[] canopyFallback = new BlockPos[1];
		// Spiral outward over a few chunks; first good column wins.
		for (int r = 0; r <= 24; r += 3) {
			int steps = r == 0 ? 1 : Math.max(8, r * 2);
			for (int i = 0; i < steps; i++) {
				double a = (Math.PI * 2 * i) / steps;
				int x = center.getX() + (int) Math.round(Math.cos(a) * r);
				int z = center.getZ() + (int) Math.round(Math.sin(a) * r);
				BlockPos found = "cave".equals(mode)
					? scanCave(level, x, z, center.getY(), minY, maxY)
					: scanSurface(level, x, z, minY, maxY, canopyFallback);
				if (found != null) {
					return new Spot(Vec3.atBottomCenterOf(found), false);
				}
			}
		}
		if (canopyFallback[0] != null) {
			return new Spot(Vec3.atBottomCenterOf(canopyFallback[0]), false);
		}
		// Nothing safe nearby: make a little platform out of the dimension's platform block.
		int y;
		if ("void".equals(mode) || info == null) {
			y = info != null ? info.arrivalY : Math.max(minY + 4, Math.min(maxY - 4, startY));
		} else {
			y = Math.max(minY + 4, Math.min(maxY - 4, info.arrivalY));
		}
		BlockPos stand = new BlockPos(center.getX(), y, center.getZ());
		BlockState platform = info != null ? platformBlock(info.platform) : Blocks.STONE.defaultBlockState();
		buildPlatform(level, stand.below(), platform);
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

	private static void buildPlatform(ServerLevel level, BlockPos floor, BlockState state) {
		for (int dx = -2; dx <= 2; dx++) {
			for (int dz = -2; dz <= 2; dz++) {
				if (Math.abs(dx) == 2 && Math.abs(dz) == 2) {
					continue;
				}
				BlockPos p = floor.offset(dx, 0, dz);
				if (level.getBlockState(p).canBeReplaced() || !level.getFluidState(p).isEmpty()) {
					level.setBlockAndUpdate(p, state);
				}
				for (int h = 1; h <= 3; h++) {
					BlockPos air = p.above(h);
					BlockState s = level.getBlockState(air);
					if (!s.isAir() && !s.is(Blocks.BEDROCK)) {
						level.setBlockAndUpdate(air, Blocks.AIR.defaultBlockState());
					}
				}
			}
		}
	}

	private static @Nullable BlockPos scanSurface(ServerLevel level, int x, int z, int minY, int maxY, BlockPos[] canopyFallback) {
		level.getChunk(x >> 4, z >> 4);
		int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
		if (top <= minY) {
			return null;
		}
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(x, Math.min(top, maxY), z);
		// walk down a little in case the heightmap top is a thin overhang/foliage
		BlockPos canopyTop = null;
		for (int i = 0; i < 6 && p.getY() > minY; i++) {
			if (isStandable(level, p)) {
				if (!isCanopy(level.getBlockState(p.below()))) {
					return p.immutable();
				}
				canopyTop = p.immutable();
				break;
			}
			p.move(Direction.DOWN);
		}
		if (canopyTop == null) {
			return null;
		}
		// standing on a giant mushroom / tree crown: prefer the ground underneath it
		// (stop at the first solid non-canopy block - that is the ground; never drop into caves below it)
		p.move(Direction.DOWN);
		for (int i = 0; i < 48 && p.getY() > minY; i++) {
			p.move(Direction.DOWN);
			BlockState s = level.getBlockState(p);
			if (!s.getCollisionShape(level, p).isEmpty() && !isCanopy(s)) {
				BlockPos feet = p.above();
				// open forest floor only: open air under the crown can also lead down into a ravine or cave mouth
				if (isStandable(level, feet) && level.getBrightness(LightLayer.SKY, feet) >= MIN_FLOOR_SKY_LIGHT) {
					return feet;
				}
				break;
			}
		}
		// no ground reachable in this column (e.g. inside a stem): remember the crown as a last resort
		if (canopyFallback[0] == null) {
			canopyFallback[0] = canopyTop;
		}
		return null;
	}

	private static boolean isCanopy(BlockState s) {
		return s.is(BlockTags.LEAVES) || s.is(BlockTags.LOGS) || s.is(Blocks.RED_MUSHROOM_BLOCK) || s.is(Blocks.BROWN_MUSHROOM_BLOCK)
			|| s.is(Blocks.MUSHROOM_STEM) || dev.portalgun.registry.ModBlocks.CANOPY.contains(s.getBlock());
	}

	private static @Nullable BlockPos scanCave(ServerLevel level, int x, int z, int startY, int minY, int maxY) {
		level.getChunk(x >> 4, z >> 4);
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(x, startY, z);
		for (int d = 0; d < (maxY - minY); d++) {
			int up = startY + d;
			int down = startY - d;
			if (up <= maxY) {
				p.setY(up);
				if (isStandable(level, p)) {
					return p.immutable();
				}
			}
			if (down >= minY) {
				p.setY(down);
				if (isStandable(level, p)) {
					return p.immutable();
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
