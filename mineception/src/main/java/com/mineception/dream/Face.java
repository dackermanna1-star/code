package com.mineception.dream;

/** The six faces of a voxel. Horizontal faces double as facings for the laptop screen. */
public enum Face {
	DOWN(0, -1, 0),
	UP(0, 1, 0),
	NORTH(0, 0, -1),
	SOUTH(0, 0, 1),
	WEST(-1, 0, 0),
	EAST(1, 0, 0);

	public final int dx;
	public final int dy;
	public final int dz;

	Face(int dx, int dy, int dz) {
		this.dx = dx;
		this.dy = dy;
		this.dz = dz;
	}

	public boolean horizontal() {
		return dy == 0;
	}

	public Face opposite() {
		return switch (this) {
			case DOWN -> UP;
			case UP -> DOWN;
			case NORTH -> SOUTH;
			case SOUTH -> NORTH;
			case WEST -> EAST;
			case EAST -> WEST;
		};
	}

	/** Horizontal faces in clockwise order seen from above, starting at SOUTH (matches Minecraft's 2D data value order). */
	public static final Face[] HORIZONTAL = {SOUTH, WEST, NORTH, EAST};

	/** Yaw (Minecraft convention: 0 = looking +z/south, 90 = looking -x/west) of a viewer looking along this face's direction. */
	public float yaw() {
		return switch (this) {
			case SOUTH -> 0.0F;
			case WEST -> 90.0F;
			case NORTH -> 180.0F;
			case EAST -> 270.0F;
			default -> 0.0F;
		};
	}

	/** Closest horizontal face for a Minecraft-convention yaw. */
	public static Face fromYaw(float yaw) {
		int i = Math.floorMod(Math.round(yaw / 90.0F), 4);
		return HORIZONTAL[i];
	}
}
