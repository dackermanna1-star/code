package com.extremesports.block;

import com.extremesports.sport.SurfaceType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/** A full block with a defined riding surface (park concrete, ramp decking, packed dirt). */
public class ParkBlock extends Block implements ParkSurface {
	private final SurfaceType surface;

	public ParkBlock(SurfaceType surface, Properties properties) {
		super(properties);
		this.surface = surface;
	}

	@Override
	public SurfaceType surfaceType(BlockState state) {
		return surface;
	}
}
