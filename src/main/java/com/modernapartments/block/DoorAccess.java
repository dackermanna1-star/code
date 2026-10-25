package com.modernapartments.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/** Helpers shared by intercoms and keycard readers that control nearby doors. */
public final class DoorAccess {
	private DoorAccess() {
	}

	public interface DoorVisitor {
		void visit(ApartmentDoorBlock door, BlockState state, BlockPos lowerPos);
	}

	/** Visits the lower half of every apartment door within {@code radius} blocks. */
	public static int forEachDoor(Level level, BlockPos center, int radius, DoorVisitor visitor) {
		int count = 0;
		for (BlockPos p : BlockPos.betweenClosed(center.offset(-radius, -2, -radius), center.offset(radius, 1, radius))) {
			BlockState s = level.getBlockState(p);
			if (s.getBlock() instanceof ApartmentDoorBlock door && s.getValue(ApartmentDoorBlock.HALF) == DoubleBlockHalf.LOWER) {
				visitor.visit(door, s, p.immutable());
				count++;
			}
		}
		return count;
	}

	public static int release(Level level, BlockPos center, int radius, int ticks) {
		return forEachDoor(level, center, radius, (door, state, pos) -> door.release(level, state, pos, ticks));
	}
}
