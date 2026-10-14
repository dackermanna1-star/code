package net.abyssaldescent.world;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.ChunkPos;

/**
 * Maps expedition slots and floors to world space inside the dungeon dimension.
 *
 * <pre>
 *   x: [slot * SLOT_SPACING, (slot + 1) * SLOT_SPACING)   one expedition per slot, slots are never reused
 *   z: [floor * FLOOR_SPACING, (floor + 1) * FLOOR_SPACING) one floor per band, floors 1..30
 * </pre>
 *
 * Inside a band the room grid starts at {@link #gridOriginX}/{@link #gridOriginZ}; the strip north of the grid is
 * reserved for boss arenas.
 */
public final class DungeonCoords {
	public static final int SLOT_SPACING = 1024;
	public static final int FLOOR_SPACING = 512;
	public static final int GRID_OFFSET_X = 256;
	public static final int GRID_OFFSET_Z = 176;
	/** Y of the walkable surface in every room (the floor block sits at FLOOR_Y - 1). */
	public static final int FLOOR_Y = 64;
	public static final int MAX_SLOT = 29_000;

	private DungeonCoords() {
	}

	public static int slotOf(int blockX) {
		return Math.floorDiv(blockX, SLOT_SPACING);
	}

	public static int floorOf(int blockZ) {
		return Math.floorDiv(blockZ, FLOOR_SPACING);
	}

	public static int slotOfChunk(ChunkPos pos) {
		return slotOf(pos.getMinBlockX());
	}

	public static int floorOfChunk(ChunkPos pos) {
		return floorOf(pos.getMinBlockZ());
	}

	public static int slotOriginX(int slot) {
		return slot * SLOT_SPACING;
	}

	public static int floorOriginZ(int floor) {
		return floor * FLOOR_SPACING;
	}

	public static int gridOriginX(int slot) {
		return slotOriginX(slot) + GRID_OFFSET_X;
	}

	public static int gridOriginZ(int floor) {
		return floorOriginZ(floor) + GRID_OFFSET_Z;
	}

	public static boolean isInFloorBand(BlockPos pos, int slot, int floor) {
		return slotOf(pos.getX()) == slot && floorOf(pos.getZ()) == floor;
	}
}
