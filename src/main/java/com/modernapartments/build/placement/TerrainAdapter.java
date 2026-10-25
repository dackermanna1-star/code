package com.modernapartments.build.placement;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BlockEntityInit;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/**
 * Copies a building into the world one region at a time and adapts the terrain: foundations down to
 * solid ground, clearing of anything above the building, and a smooth blending ring that slopes the
 * surrounding terrain to the building's ground level. Shared by blueprint placement and world generation,
 * so both produce identical results.
 */
public final class TerrainAdapter {
	public static final int BLEND = 7;
	public static final int CLEAR_ABOVE = 24;
	public static final int MAX_FOUNDATION = 64;
	public static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS;

	private final LevelAccessor level;
	private final BlockBuffer buffer;
	private final PlacementTransform transform;
	private final RandomSource random;
	private final Map<BlockState, BlockState> rotated = new IdentityHashMap<>();
	private final Map<BlockState, Boolean> makesBlockEntity = new IdentityHashMap<>();

	public TerrainAdapter(LevelAccessor level, BlockBuffer buffer, PlacementTransform transform, RandomSource random) {
		this.level = level;
		this.buffer = buffer;
		this.transform = transform;
		this.random = random;
	}

	/** Bounding box including the blending ring and foundation depth. */
	public static BoundingBox fullBox(PlacementTransform t) {
		BoundingBox f = t.footprintBox();
		return new BoundingBox(f.minX() - BLEND, f.minY() - MAX_FOUNDATION, f.minZ() - BLEND,
			f.maxX() + BLEND, f.maxY() + CLEAR_ABOVE, f.maxZ() + BLEND);
	}

	private BlockState rotate(BlockState s) {
		return rotated.computeIfAbsent(s, k -> k.rotate(transform.rotation()));
	}

	/** Whether the block creates a block entity in this state (door upper halves and plain screens do not). */
	private boolean makesBlockEntity(BlockState s) {
		return makesBlockEntity.computeIfAbsent(s, k -> k.getBlock() instanceof EntityBlock e && e.newBlockEntity(BlockPos.ZERO, k) != null);
	}

	/** Foundations, clearing above and terrain blending for the columns inside {@code clip}. */
	public void adaptTerrain(BoundingBox clip) {
		int groundWorldY = transform.worldY(buffer.groundY);
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
		BoundingBox full = fullBox(transform);
		for (int wx = Math.max(clip.minX(), full.minX()); wx <= Math.min(clip.maxX(), full.maxX()); wx++) {
			for (int wz = Math.max(clip.minZ(), full.minZ()); wz <= Math.min(clip.maxZ(), full.maxZ()); wz++) {
				if (transform.inFootprint(wx, wz)) {
					foundation(p, wx, wz);
					clearAbove(p, wx, wz);
				} else {
					blend(p, wx, wz, groundWorldY);
				}
			}
		}
	}

	private void foundation(BlockPos.MutableBlockPos p, int wx, int wz) {
		int lx = transform.localX(wx, wz);
		int lz = transform.localZ(wx, wz);
		BlockState bottom = buffer.get(lx, 0, lz);
		BlockState fill = isSoil(bottom) ? Blocks.DIRT.defaultBlockState() : Blocks.STONE.defaultBlockState();
		int y0 = transform.worldY(0);
		for (int y = y0 - 1; y >= Math.max(level.getMinY(), y0 - MAX_FOUNDATION); y--) {
			p.set(wx, y, wz);
			BlockState s = level.getBlockState(p);
			if (isSolidGround(s)) {
				break;
			}
			level.setBlock(p, fill, FLAGS);
		}
	}

	private void clearAbove(BlockPos.MutableBlockPos p, int wx, int wz) {
		int top = transform.worldY(transform.sizeY());
		for (int y = top; y < Math.min(level.getMaxY(), top + CLEAR_ABOVE); y++) {
			p.set(wx, y, wz);
			if (!level.getBlockState(p).isAir()) {
				level.setBlock(p, Blocks.AIR.defaultBlockState(), FLAGS);
			}
		}
	}

	private void blend(BlockPos.MutableBlockPos p, int wx, int wz, int groundY) {
		BoundingBox f = transform.footprintBox();
		int dx = wx < f.minX() ? f.minX() - wx : Math.max(0, wx - f.maxX());
		int dz = wz < f.minZ() ? f.minZ() - wz : Math.max(0, wz - f.maxZ());
		double dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > BLEND || dist <= 0) {
			return;
		}
		int surface = surfaceY(p, wx, wz);
		if (surface == Integer.MIN_VALUE) {
			return;
		}
		double t = Mth.smoothstep(Mth.clamp(dist / (BLEND + 1.0), 0.0, 1.0));
		int target = (int) Math.round(Mth.lerp(t, groundY, surface));
		if (target == surface) {
			return;
		}
		p.set(wx, surface, wz);
		BlockState topState = level.getBlockState(p);
		BlockState top = topMaterial(topState);
		BlockState under = top.is(Blocks.SAND) || top.is(Blocks.RED_SAND) ? top : Blocks.DIRT.defaultBlockState();
		if (target > surface) {
			for (int y = surface; y < target; y++) {
				p.set(wx, y, wz);
				level.setBlock(p, under, FLAGS);
			}
			p.set(wx, target, wz);
			level.setBlock(p, top, FLAGS);
			p.set(wx, target + 1, wz);
			if (!level.getBlockState(p).isAir() && level.getBlockState(p).canBeReplaced()) {
				level.setBlock(p, Blocks.AIR.defaultBlockState(), FLAGS);
			}
		} else {
			for (int y = surface + CLEAR_ABOVE / 2; y > target; y--) {
				p.set(wx, y, wz);
				BlockState s = level.getBlockState(p);
				if (y <= surface || isVegetation(s)) {
					if (!s.isAir()) {
						level.setBlock(p, Blocks.AIR.defaultBlockState(), FLAGS);
					}
				}
			}
			p.set(wx, target, wz);
			level.setBlock(p, top, FLAGS);
		}
	}

	private int surfaceY(BlockPos.MutableBlockPos p, int wx, int wz) {
		int y = level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, wx, wz) - 1;
		if (y <= level.getMinY()) {
			y = level.getHeight(Heightmap.Types.OCEAN_FLOOR, wx, wz) - 1;
		}
		for (; y > level.getMinY(); y--) {
			p.set(wx, y, wz);
			BlockState s = level.getBlockState(p);
			if (isSolidGround(s) && !isVegetation(s)) {
				return y;
			}
		}
		return Integer.MIN_VALUE;
	}

	private static BlockState topMaterial(BlockState s) {
		if (s.is(Blocks.SAND) || s.is(Blocks.RED_SAND) || s.is(Blocks.PODZOL) || s.is(Blocks.MYCELIUM)
			|| s.is(Blocks.SNOW_BLOCK) || s.is(Blocks.COARSE_DIRT)) {
			return s;
		}
		return Blocks.GRASS_BLOCK.defaultBlockState();
	}

	private static boolean isSoil(BlockState s) {
		return s != null && (s.is(BlockTags.DIRT) || s.is(Blocks.SAND) || s.is(Blocks.GRAVEL) || s.is(BlockTags.SAND));
	}

	private static boolean isVegetation(BlockState s) {
		return s.is(BlockTags.LOGS) || s.is(BlockTags.LEAVES) || s.is(BlockTags.REPLACEABLE_BY_TREES)
			|| s.is(BlockTags.FLOWERS) || s.is(Blocks.SNOW) || s.is(Blocks.BAMBOO) || s.is(Blocks.CACTUS)
			|| s.is(Blocks.SUGAR_CANE) || s.is(Blocks.VINE);
	}

	private static boolean isSolidGround(BlockState s) {
		return !s.isAir() && s.getFluidState().isEmpty() && !s.canBeReplaced() && !isVegetation(s);
	}

	/**
	 * Copies buffer cells whose world position lies in {@code clip} and whose local y is in [y0, y1).
	 * {@code onBlockEntity} receives every placed block entity that has an initializer.
	 */
	public int placeBlocks(BoundingBox clip, int y0, int y1, Consumer<BlockPos> onPlaced) {
		int placed = 0;
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
		BoundingBox f = transform.footprintBox();
		int minX = Math.max(clip.minX(), f.minX());
		int maxX = Math.min(clip.maxX(), f.maxX());
		int minZ = Math.max(clip.minZ(), f.minZ());
		int maxZ = Math.min(clip.maxZ(), f.maxZ());
		for (int y = Math.max(0, y0); y < Math.min(buffer.sizeY, y1); y++) {
			int wy = transform.worldY(y);
			if (wy < Math.max(clip.minY(), level.getMinY()) || wy > Math.min(clip.maxY(), level.getMaxY())) {
				continue;
			}
			for (int wx = minX; wx <= maxX; wx++) {
				for (int wz = minZ; wz <= maxZ; wz++) {
					int lx = transform.localX(wx, wz);
					int lz = transform.localZ(wx, wz);
					int index = buffer.index(lx, y, lz);
					BlockState s = buffer.get(index);
					if (s == null) {
						continue;
					}
					BlockState world = rotate(s);
					p.set(wx, wy, wz);
					BlockState existing = level.getBlockState(p);
					if (existing == world && !world.hasBlockEntity()) {
						continue;
					}
					if (existing.hasBlockEntity()) {
						level.setBlock(p, Blocks.AIR.defaultBlockState(), FLAGS);
					}
					level.setBlock(p, world, FLAGS);
					if (!(level instanceof Level) && world.hasBlockEntity() && !makesBlockEntity(world)) {
						// a generating chunk marks every block-entity block for one; drop the mark where none is made
						level.getChunk(p).removeBlockEntity(p);
					}
					placed++;
					BlockEntityInit init = buffer.init(index);
					if (init != null) {
						BlockEntity be = level.getBlockEntity(p);
						if (be != null) {
							init.apply(be, level.registryAccess(), random);
							be.setChanged();
						}
					}
					if (onPlaced != null) {
						onPlaced.accept(p);
					}
				}
			}
		}
		return placed;
	}
}
