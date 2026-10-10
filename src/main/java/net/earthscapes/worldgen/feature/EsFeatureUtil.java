package net.earthscapes.worldgen.feature;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;

final class EsFeatureUtil {
	private EsFeatureUtil() {
	}

	/** True when the block under {@code origin} can root a tree and {@code origin} itself is free. */
	static boolean canRoot(WorldGenLevel level, BlockPos origin) {
		BlockState below = level.getBlockState(origin.below());
		BlockState at = level.getBlockState(origin);
		return TreeBuilder.isSoil(below) && (TreeBuilder.replaceableByTree(at));
	}

	/** Like {@link #canRoot} but also accepts a rooting point under shallow water (flooded forests). */
	static boolean canRootFlooded(WorldGenLevel level, BlockPos origin, int maxDepth) {
		if (canRoot(level, origin)) {
			return true;
		}
		BlockPos.MutableBlockPos pos = origin.mutable();
		for (int i = 0; i < maxDepth; i++) {
			if (!level.getFluidState(pos).isEmpty() && TreeBuilder.isSoil(level.getBlockState(pos.below()))) {
				return true;
			}
			pos.move(0, 1, 0);
		}
		return false;
	}

	static int surface(WorldGenLevel level, int x, int z) {
		return level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z);
	}

	static int floor(WorldGenLevel level, int x, int z) {
		return level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, x, z);
	}
}
