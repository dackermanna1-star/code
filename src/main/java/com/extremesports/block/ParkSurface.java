package com.extremesports.block;

import com.extremesports.sport.SurfaceType;
import net.minecraft.world.level.block.state.BlockState;

/** Blocks that report their riding surface material directly. */
public interface ParkSurface {
	SurfaceType surfaceType(BlockState state);
}
