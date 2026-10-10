package com.blademode.piece;

/** Collision geometry of the world, one block cell at a time (block-local coordinates). */
public interface CellSource {
	CellCache.Cell get(int x, int y, int z);

	/** True if the world point is strictly inside solid geometry. */
	default boolean solidAt(double x, double y, double z) {
		int cx = (int) Math.floor(x);
		int cy = (int) Math.floor(y);
		int cz = (int) Math.floor(z);
		CellCache.Cell c = this.get(cx, cy, cz);
		if (c.full) {
			return true;
		}
		return !c.isEmpty() && c.regionAt(x - cx, y - cy, z - cz, 1.0E-6) >= 0;
	}
}
