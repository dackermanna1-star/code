package com.extremesports.physics;

import java.util.List;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Implemented by skatepark blocks that define an analytic riding surface (ramps) and/or grind lines.
 * Equipment entities ignore the block collision of ride-through blocks and follow the analytic surface instead,
 * which gives smooth transitions without stair-stepping.
 */
public interface SurfaceProvider {
	/**
	 * Height of the riding surface above the block's bottom at block-local coordinates in [0,1],
	 * or {@link Double#NaN} when this block has no ramp surface.
	 */
	default double surfaceHeight(BlockState state, double localX, double localZ) {
		return Double.NaN;
	}

	/** Whether equipment entities ignore this block's collision shape. */
	default boolean isRideThrough(BlockState state) {
		return false;
	}

	/** Adds world-space grind segments provided by this block. */
	default void addGrindSegments(BlockGetter level, BlockState state, BlockPos pos, List<GrindSegment> out) {
	}

	/** Steepest point at the ramp's top edge, used for vert assist (degrees). */
	default float lipAngle(BlockState state) {
		return 0.0F;
	}
}
