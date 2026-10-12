package com.chaosunleashed.core;

import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import org.jetbrains.annotations.Nullable;

/** Finding safe spots to spawn event mobs around players. */
public final class SpawnHelper {
	private SpawnHelper() {
	}

	/** A random surface position {@code minDist..maxDist} blocks from {@code center} with 2 free blocks and solid ground. */
	@Nullable
	public static BlockPos findSurfaceSpawn(ServerWorld world, BlockPos center, int minDist, int maxDist, Random random) {
		for (int attempt = 0; attempt < 12; attempt++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			double distance = MathHelper.nextDouble(random, minDist, maxDist);
			int x = center.getX() + MathHelper.floor(Math.cos(angle) * distance);
			int z = center.getZ() + MathHelper.floor(Math.sin(angle) * distance);
			BlockPos pos = surfaceSpawnAt(world, x, z);
			if (pos != null) {
				return pos;
			}
		}
		return null;
	}

	@Nullable
	public static BlockPos surfaceSpawnAt(ServerWorld world, int x, int z) {
		if (!world.isChunkLoaded(x >> 4, z >> 4)) {
			return null;
		}
		BlockPos top = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
		if (world.isOutOfHeightLimit(top) || !world.getWorldBorder().contains(top)) {
			return null;
		}
		BlockPos below = top.down();
		if (!world.getBlockState(below).isSideSolidFullSquare(world, below, Direction.UP)) {
			return null;
		}
		if (!world.getBlockState(top).getCollisionShape(world, top).isEmpty() || !world.getBlockState(top.up()).getCollisionShape(world, top.up()).isEmpty()) {
			return null;
		}
		if (!world.getFluidState(top).isEmpty()) {
			return null;
		}
		return top;
	}
}
