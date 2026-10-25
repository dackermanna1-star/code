package com.godforge.util;

import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * World access that never loads or generates chunks. Vanilla's {@code getBlockState}, {@code setBlock} and
 * {@code clip} synchronously load any chunk they touch, which turns a 500-block beam or a far-flung shockwave
 * into a server freeze; abilities use these helpers whenever a position may lie outside the loaded world.
 */
public final class Loaded {
	private Loaded() {
	}

	public static @Nullable LevelChunk chunk(Level level, int blockX, int blockZ) {
		return level.getChunkSource().getChunkNow(SectionPos.blockToSectionCoord(blockX), SectionPos.blockToSectionCoord(blockZ));
	}

	public static boolean at(Level level, BlockPos pos) {
		return level.isInValidBounds(pos) && chunk(level, pos.getX(), pos.getZ()) != null;
	}

	/** The block at {@code pos}, or null when its chunk isn't loaded. */
	public static @Nullable BlockState state(Level level, BlockPos pos) {
		if (!level.isInValidBounds(pos)) {
			return null;
		}
		LevelChunk chunk = chunk(level, pos.getX(), pos.getZ());
		return chunk == null ? null : chunk.getBlockState(pos);
	}

	/**
	 * Shortens the segment {@code from -> to} so it stops just before the first unloaded chunk it would enter
	 * (walks the chunk grid exactly, so no chunk the segment touches is skipped).
	 */
	public static Vec3 clampRay(Level level, Vec3 from, Vec3 to) {
		int cx = SectionPos.blockToSectionCoord(Mth.floor(from.x));
		int cz = SectionPos.blockToSectionCoord(Mth.floor(from.z));
		if (level.getChunkSource().getChunkNow(cx, cz) == null) {
			return from;
		}
		double dx = to.x - from.x;
		double dz = to.z - from.z;
		int endX = SectionPos.blockToSectionCoord(Mth.floor(to.x));
		int endZ = SectionPos.blockToSectionCoord(Mth.floor(to.z));
		int stepX = dx > 0 ? 1 : -1;
		int stepZ = dz > 0 ? 1 : -1;
		double deltaX = dx == 0 ? Double.POSITIVE_INFINITY : 16.0 / Math.abs(dx);
		double deltaZ = dz == 0 ? Double.POSITIVE_INFINITY : 16.0 / Math.abs(dz);
		double nextX = dx == 0 ? Double.POSITIVE_INFINITY : (dx > 0 ? (cx + 1) * 16.0 - from.x : from.x - cx * 16.0) / Math.abs(dx);
		double nextZ = dz == 0 ? Double.POSITIVE_INFINITY : (dz > 0 ? (cz + 1) * 16.0 - from.z : from.z - cz * 16.0) / Math.abs(dz);
		double margin = 0.01 / Math.max(1.0E-6, Math.sqrt(dx * dx + dz * dz));
		while (cx != endX || cz != endZ) {
			double t;
			if (nextX < nextZ) {
				t = nextX;
				nextX += deltaX;
				cx += stepX;
			} else {
				t = nextZ;
				nextZ += deltaZ;
				cz += stepZ;
			}
			if (t >= 1.0) {
				break;
			}
			if (level.getChunkSource().getChunkNow(cx, cz) == null) {
				return from.lerp(to, Math.max(0.0, t - margin));
			}
		}
		return to;
	}

	/** {@link Level#clip} limited to loaded chunks; a ray cut short by unloaded terrain reports a miss at the cut. */
	public static BlockHitResult clip(Level level, Vec3 from, Vec3 to, ClipContext.Block block, ClipContext.Fluid fluid, Entity entity) {
		return level.clip(new ClipContext(from, clampRay(level, from, to), block, fluid, entity));
	}
}
