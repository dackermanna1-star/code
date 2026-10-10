package com.blademode.geom;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Context-free block shape helpers shared by the cut engine, physics and rendering. */
public final class BlockGeometry {
	private static final int MAX_BOXES = 8;
	private static final Map<BlockState, List<AABB>> COLLISION = new ConcurrentHashMap<>();
	private static final Map<BlockState, List<AABB>> OUTLINE = new ConcurrentHashMap<>();
	private static final Map<BlockState, PartShape> WHOLE = new ConcurrentHashMap<>();

	private BlockGeometry() {
	}

	public static List<AABB> collisionBoxes(BlockState state) {
		return COLLISION.computeIfAbsent(state, s -> boxes(s.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)));
	}

	public static List<AABB> outlineBoxes(BlockState state) {
		return OUTLINE.computeIfAbsent(state, s -> {
			List<AABB> b = boxes(s.getShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO));
			return b.isEmpty() ? List.of(new AABB(0, 0, 0, 1, 1, 1)) : b;
		});
	}

	private static List<AABB> boxes(VoxelShape shape) {
		if (shape.isEmpty()) {
			return List.of();
		}
		List<AABB> list = shape.toAabbs();
		if (list.size() > MAX_BOXES) {
			return List.of(shape.bounds());
		}
		return List.copyOf(list);
	}

	/** Physical (collision) geometry of a block clipped by the given planes. */
	public static PartShape shape(BlockState state, List<Plane> planes) {
		if (planes.isEmpty()) {
			return WHOLE.computeIfAbsent(state, s -> new PartShape(collisionBoxes(s), List.of()));
		}
		return new PartShape(collisionBoxes(state), planes);
	}

	/** Blocks that carry load: anything with a collision shape that is not a fluid. */
	public static boolean isStructural(BlockState state) {
		return !state.isAir() && !(state.getBlock() instanceof LiquidBlock) && !collisionBoxes(state).isEmpty();
	}

	/** Naturally generated leaves; they hang on their tree but never hold anything up. */
	public static boolean isSoftLeaves(BlockState state) {
		return state.getBlock() instanceof LeavesBlock
			&& state.hasProperty(LeavesBlock.PERSISTENT)
			&& !state.getValue(LeavesBlock.PERSISTENT);
	}

	public static int leafDistance(BlockState state) {
		return state.hasProperty(LeavesBlock.DISTANCE) ? state.getValue(LeavesBlock.DISTANCE) : 7;
	}

	public static boolean isLog(BlockState state) {
		return is(state, BlockTags.LOGS);
	}

	/** Tag check that tolerates tags not being bound yet (e.g. during early loading or in unit tests). */
	private static boolean is(BlockState state, TagKey<Block> tag) {
		try {
			return state.is(tag);
		} catch (IllegalStateException e) {
			return false;
		}
	}

	public static boolean isFullCube(BlockState state) {
		List<AABB> b = collisionBoxes(state);
		if (b.size() != 1) {
			return false;
		}
		AABB a = b.getFirst();
		return a.minX <= 0 && a.minY <= 0 && a.minZ <= 0 && a.maxX >= 1 && a.maxY >= 1 && a.maxZ >= 1;
	}

	/** Rough material density (water = 1) used for piece mass. */
	public static double density(BlockState state) {
		if (state.getBlock() instanceof LeavesBlock) {
			return 0.12;
		}
		if (is(state, BlockTags.LOGS) || is(state, BlockTags.PLANKS) || is(state, BlockTags.WOODEN_SLABS) || is(state, BlockTags.WOODEN_STAIRS)) {
			return 0.6;
		}
		if (is(state, BlockTags.WOOL) || is(state, BlockTags.WOOL_CARPETS)) {
			return 0.25;
		}
		SoundType s = state.getSoundType();
		if (s == SoundType.WOOD || s == SoundType.NETHER_WOOD || s == SoundType.CHERRY_WOOD || s == SoundType.BAMBOO_WOOD || s == SoundType.STEM
			|| s == SoundType.BAMBOO || s == SoundType.SCAFFOLDING) {
			return 0.6;
		}
		if (s == SoundType.GRASS || s == SoundType.AZALEA_LEAVES || s == SoundType.CHERRY_LEAVES || s == SoundType.MOSS || s == SoundType.MOSS_CARPET) {
			return 0.3;
		}
		if (s == SoundType.METAL || s == SoundType.NETHERITE_BLOCK || s == SoundType.COPPER || s == SoundType.ANVIL || s == SoundType.CHAIN) {
			return 7.0;
		}
		if (s == SoundType.SAND || s == SoundType.GRAVEL || s == SoundType.ROOTED_DIRT || s == SoundType.MUD) {
			return 1.6;
		}
		if (s == SoundType.SNOW || s == SoundType.POWDER_SNOW) {
			return 0.4;
		}
		if (s == SoundType.WOOL) {
			return 0.25;
		}
		return 2.3;
	}
}
