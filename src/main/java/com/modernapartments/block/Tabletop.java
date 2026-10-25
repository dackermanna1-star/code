package com.modernapartments.block;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Computes how far a tabletop item must sink to rest on the surface below it. */
public final class Tabletop {
	private Tabletop() {
	}

	/** Drop in pixels for an item resting on {@code below} (0 for full-height or no surface). */
	public static int dropOnto(BlockState below, BlockGetter level, BlockPos belowPos) {
		if (below == null || below.isAir()) {
			return 0;
		}
		VoxelShape shape = below.getShape(level, belowPos);
		if (shape.isEmpty()) {
			return 0;
		}
		double top = shape.max(Direction.Axis.Y);
		if (top >= 0.999 || top < 0.2) {
			return 0;
		}
		return Mth.clamp((int) Math.round((1.0 - top) * 16.0), 0, 12);
	}

	/** Same, for structure generation where only the block state is known. */
	public static int dropOnto(BlockState below) {
		return dropOnto(below, EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
	}

	public static BlockState withDrop(BlockState state, int drop) {
		return state.hasProperty(ModProperties.DROP) ? state.setValue(ModProperties.DROP, Mth.clamp(drop, 0, 12)) : state;
	}
}
