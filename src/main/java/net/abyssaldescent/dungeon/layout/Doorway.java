package net.abyssaldescent.dungeon.layout;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;

/**
 * An opening in a room wall. {@code (x, z)} is the centre of the opening in the wall plane and {@code facing} points
 * out of the room.
 */
public record Doorway(int x, int z, Direction facing, int width, int height, int targetRoom, boolean secret) {
	public static final int WIDTH = 3;
	public static final int HEIGHT = 4;

	/** Calls {@code consumer} for every block of the opening (in the wall plane). */
	public void forEachOpeningBlock(int floorY, java.util.function.Consumer<BlockPos> consumer) {
		int half = width / 2;
		for (int dy = 0; dy < height; dy++) {
			for (int d = -half; d <= half; d++) {
				if (facing.getAxis() == Direction.Axis.Z) {
					consumer.accept(new BlockPos(x + d, floorY + dy, z));
				} else {
					consumer.accept(new BlockPos(x, floorY + dy, z + d));
				}
			}
		}
	}

	/** True if the wall column at (wx, wz) belongs to this opening or its frame (one block on each side). */
	public boolean coversWallColumn(int wx, int wz, int margin) {
		int half = width / 2 + margin;
		if (facing.getAxis() == Direction.Axis.Z) {
			return wz == z && Math.abs(wx - x) <= half;
		}
		return wx == x && Math.abs(wz - z) <= half;
	}
}
