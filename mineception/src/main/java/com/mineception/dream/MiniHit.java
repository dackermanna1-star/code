package com.mineception.dream;

/**
 * The block an avatar is looking at.
 *
 * @param x        cell x
 * @param y        cell y
 * @param z        cell z
 * @param face     face of the cell that was hit (a new block would go on this side)
 * @param block    the block in the cell
 * @param distance distance from the eye to the hit point in blocks
 */
public record MiniHit(int x, int y, int z, Face face, MiniBlock block, double distance) {
	public int placeX() {
		return x + face.dx;
	}

	public int placeY() {
		return y + face.dy;
	}

	public int placeZ() {
		return z + face.dz;
	}

	public boolean isLaptop() {
		return block == MiniBlock.LAPTOP;
	}
}
