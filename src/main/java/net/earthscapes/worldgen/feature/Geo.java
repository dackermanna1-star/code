package net.earthscapes.worldgen.feature;

import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/** Geometry helpers for procedural trees and rocks. */
public final class Geo {
	private Geo() {
	}

	/**
	 * Visits a face-connected (6-connected) voxel line between two points, so that logs and leaves
	 * traced along it never touch only by an edge or corner.
	 */
	public static void line(Vec3 from, Vec3 to, Consumer<BlockPos> visitor) {
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos(Mth.floor(from.x), Mth.floor(from.y), Mth.floor(from.z));
		int endX = Mth.floor(to.x);
		int endY = Mth.floor(to.y);
		int endZ = Mth.floor(to.z);
		double dx = to.x - from.x;
		double dy = to.y - from.y;
		double dz = to.z - from.z;
		int stepX = Integer.signum(endX - pos.getX());
		int stepY = Integer.signum(endY - pos.getY());
		int stepZ = Integer.signum(endZ - pos.getZ());
		double tDeltaX = stepX == 0 ? Double.MAX_VALUE : Math.abs(1.0 / dx);
		double tDeltaY = stepY == 0 ? Double.MAX_VALUE : Math.abs(1.0 / dy);
		double tDeltaZ = stepZ == 0 ? Double.MAX_VALUE : Math.abs(1.0 / dz);
		double tMaxX = stepX == 0 ? Double.MAX_VALUE : tDeltaX * (stepX > 0 ? Mth.floor(from.x) + 1 - from.x : from.x - Mth.floor(from.x));
		double tMaxY = stepY == 0 ? Double.MAX_VALUE : tDeltaY * (stepY > 0 ? Mth.floor(from.y) + 1 - from.y : from.y - Mth.floor(from.y));
		double tMaxZ = stepZ == 0 ? Double.MAX_VALUE : tDeltaZ * (stepZ > 0 ? Mth.floor(from.z) + 1 - from.z : from.z - Mth.floor(from.z));
		visitor.accept(pos.immutable());
		int guard = 0;
		while ((pos.getX() != endX || pos.getY() != endY || pos.getZ() != endZ) && guard++ < 512) {
			if (tMaxX < tMaxY && tMaxX < tMaxZ) {
				pos.move(stepX, 0, 0);
				tMaxX += tDeltaX;
			} else if (tMaxY < tMaxZ) {
				pos.move(0, stepY, 0);
				tMaxY += tDeltaY;
			} else {
				pos.move(0, 0, stepZ);
				tMaxZ += tDeltaZ;
			}
			visitor.accept(pos.immutable());
		}
	}

	/** Log state oriented along the dominant axis of a direction vector. */
	public static BlockState oriented(BlockState log, Vec3 direction) {
		if (!log.hasProperty(RotatedPillarBlock.AXIS)) {
			return log;
		}
		double ax = Math.abs(direction.x);
		double ay = Math.abs(direction.y);
		double az = Math.abs(direction.z);
		Direction.Axis axis = ay >= ax && ay >= az ? Direction.Axis.Y : ax >= az ? Direction.Axis.X : Direction.Axis.Z;
		return log.setValue(RotatedPillarBlock.AXIS, axis);
	}

	public static BlockState axis(BlockState log, Direction.Axis axis) {
		return log.hasProperty(RotatedPillarBlock.AXIS) ? log.setValue(RotatedPillarBlock.AXIS, axis) : log;
	}

	public static double range(RandomSource random, double min, double max) {
		return min + random.nextDouble() * (max - min);
	}

	public static Vec3 centre(BlockPos pos) {
		return new Vec3(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5);
	}

	/** Cheap smooth 2D value noise for ragged canopy and rock outlines, seeded per feature. */
	public static final class Noise2 {
		private final long seed;
		private final double scale;

		public Noise2(RandomSource random, double scale) {
			this(random.nextLong(), scale);
		}

		public Noise2(long seed, double scale) {
			this.seed = seed;
			this.scale = scale;
		}

		private double lattice(int x, int z) {
			long h = this.seed ^ (x * 0x9E3779B97F4A7C15L) ^ (z * 0xC2B2AE3D27D4EB4FL);
			h ^= h >>> 33;
			h *= 0xFF51AFD7ED558CCDL;
			h ^= h >>> 33;
			h *= 0xC4CEB9FE1A85EC53L;
			h ^= h >>> 33;
			return ((h >>> 11) * 0x1.0p-53) * 2.0 - 1.0;
		}

		/** Value in [-1, 1]. */
		public double sample(double x, double z) {
			double fx = x / this.scale;
			double fz = z / this.scale;
			int x0 = Mth.floor(fx);
			int z0 = Mth.floor(fz);
			double tx = fx - x0;
			double tz = fz - z0;
			tx = tx * tx * (3.0 - 2.0 * tx);
			tz = tz * tz * (3.0 - 2.0 * tz);
			double a = Mth.lerp(tx, this.lattice(x0, z0), this.lattice(x0 + 1, z0));
			double b = Mth.lerp(tx, this.lattice(x0, z0 + 1), this.lattice(x0 + 1, z0 + 1));
			return Mth.lerp(tz, a, b);
		}

		public double sample(double x, double y, double z) {
			return 0.5 * (this.sample(x + y * 0.71, z - y * 0.37) + this.sample(z + y * 1.13, x + y * 0.53));
		}
	}
}
