package com.extremesports.physics;

import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Samples the analytic riding surface of ramp blocks.
 */
public final class SurfaceSampler {
	private static final double EPS = 0.04;

	/** Result of a ramp sample: world-space surface height and normal. */
	public record RampHit(double height, Vec3 normal, BlockPos pos, BlockState state, SurfaceProvider provider) {
		/** Slope angle in degrees (0 = flat). */
		public double slopeDegrees() {
			return Math.toDegrees(Math.acos(Mth.clamp(normal.y, -1.0, 1.0)));
		}
	}

	private SurfaceSampler() {
	}

	/**
	 * Finds the highest ramp surface under (x, z) whose height lies within [y - maxDown, y + maxUp].
	 */
	public static @Nullable RampHit sample(BlockGetter level, double x, double y, double z, double maxUp, double maxDown) {
		int bx = Mth.floor(x);
		int bz = Mth.floor(z);
		int by = Mth.floor(y);
		RampHit best = null;
		BlockPos.MutableBlockPos mutable = new BlockPos.MutableBlockPos();
		for (int dy = 1; dy >= -2; dy--) {
			mutable.set(bx, by + dy, bz);
			BlockState state = level.getBlockState(mutable);
			if (!(state.getBlock() instanceof SurfaceProvider provider)) {
				continue;
			}
			double lx = x - bx;
			double lz = z - bz;
			double h = provider.surfaceHeight(state, lx, lz);
			if (Double.isNaN(h)) {
				continue;
			}
			double world = mutable.getY() + h;
			if (world > y + maxUp || world < y - maxDown) {
				continue;
			}
			if (best == null || world > best.height) {
				best = new RampHit(world, normalAt(provider, state, lx, lz), mutable.immutable(), state, provider);
			}
		}
		return best;
	}

	/** Surface normal from central differences inside the block (one-sided at the block edge). */
	public static Vec3 normalAt(SurfaceProvider provider, BlockState state, double lx, double lz) {
		double x0 = Math.max(0.0, lx - EPS);
		double x1 = Math.min(1.0, lx + EPS);
		double z0 = Math.max(0.0, lz - EPS);
		double z1 = Math.min(1.0, lz + EPS);
		double hx0 = provider.surfaceHeight(state, x0, lz);
		double hx1 = provider.surfaceHeight(state, x1, lz);
		double hz0 = provider.surfaceHeight(state, lx, z0);
		double hz1 = provider.surfaceHeight(state, lx, z1);
		double dhdx = Double.isNaN(hx0) || Double.isNaN(hx1) ? 0.0 : (hx1 - hx0) / (x1 - x0);
		double dhdz = Double.isNaN(hz0) || Double.isNaN(hz1) ? 0.0 : (hz1 - hz0) / (z1 - z0);
		return new Vec3(-dhdx, 1.0, -dhdz).normalize();
	}
}
