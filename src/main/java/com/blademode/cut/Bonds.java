package com.blademode.cut;

import net.minecraft.core.Direction;
import org.joml.Vector3d;

/** Rules deciding whether two neighbouring block parts are physically joined. */
public final class Bonds {
	/** Minimum shared face area (in block faces) for two parts to hold each other. */
	public static final double MIN_CONTACT = 0.02;

	/** Offsets for edge/corner neighbours (logs of branching trees touch diagonally). */
	public static final int[][] DIAGONALS;

	static {
		int[][] list = new int[20][];
		int k = 0;
		for (int x = -1; x <= 1; x++) {
			for (int y = -1; y <= 1; y++) {
				for (int z = -1; z <= 1; z++) {
					int nonZero = (x != 0 ? 1 : 0) + (y != 0 ? 1 : 0) + (z != 0 ? 1 : 0);
					if (nonZero >= 2) {
						list[k++] = new int[]{x, y, z};
					}
				}
			}
		}
		DIAGONALS = list;
	}

	/** Maps grid coordinates (cell + local) to world coordinates. */
	@FunctionalInterface
	public interface Space {
		Vector3d toWorld(double gx, double gy, double gz);
	}

	private Bonds() {
	}

	/** Bond between {@code a} and {@code b}, where b's cell = a's cell + dir. */
	public static boolean face(PartNode a, PartNode b, Direction dir, Slash slash, Space space) {
		double area;
		if (a.shape.isEmpty() || b.shape.isEmpty()) {
			// Non-solid attachments (torches, flowers...) hang on whatever they touch.
			area = 1.0;
		} else if (a.isWholeFullCube() && b.isWholeFullCube()) {
			area = 1.0;
		} else {
			area = a.shape.contactArea(dir.getStepX(), dir.getStepY(), dir.getStepZ(), b.shape);
		}
		if (area < MIN_CONTACT) {
			return false;
		}
		if (a.side * b.side < 0) {
			// The two touch exactly on the cut plane: severed if the blade passed there.
			Vector3d w = space.toWorld(
				a.cell.getX() + 0.5 + dir.getStepX() * 0.5,
				a.cell.getY() + 0.5 + dir.getStepY() * 0.5,
				a.cell.getZ() + 0.5 + dir.getStepZ() * 0.5);
			return !slash.inSector(w.x, w.y, w.z, 0.0);
		}
		return true;
	}

	/** Edge/corner bond between two log parts. */
	public static boolean diagonal(PartNode a, PartNode b, int dx, int dy, int dz, Slash slash, Space space) {
		if (!a.log || !b.log) {
			return false;
		}
		// Shared edge midpoint / corner in a's local coordinates.
		double qx = dx == 0 ? 0.5 : (dx > 0 ? 1.0 : 0.0);
		double qy = dy == 0 ? 0.5 : (dy > 0 ? 1.0 : 0.0);
		double qz = dz == 0 ? 0.5 : (dz > 0 ? 1.0 : 0.0);
		final double in = 0.08;
		double ax = qx + (0.5 - qx) * in * 2;
		double ay = qy + (0.5 - qy) * in * 2;
		double az = qz + (0.5 - qz) * in * 2;
		if (!a.shape.contains(ax, ay, az, 0.0)) {
			return false;
		}
		double bx = qx - dx;
		double by = qy - dy;
		double bz = qz - dz;
		bx += (0.5 - bx) * in * 2;
		by += (0.5 - by) * in * 2;
		bz += (0.5 - bz) * in * 2;
		if (!b.shape.contains(bx, by, bz, 0.0)) {
			return false;
		}
		if (a.side * b.side < 0) {
			Vector3d w = space.toWorld(a.cell.getX() + qx, a.cell.getY() + qy, a.cell.getZ() + qz);
			return !slash.inSector(w.x, w.y, w.z, 0.0);
		}
		return true;
	}
}
