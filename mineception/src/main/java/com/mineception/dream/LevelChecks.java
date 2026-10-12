package com.mineception.dream;

import java.util.ArrayDeque;

/**
 * Geometry queries about a dream level: where its laptop screen is, whether the spawn can see it and whether it can be
 * walked to. Used by the generator, its tests and the server.
 */
public final class LevelChecks {
	/** How far an avatar can drop in one walking step when checking that a path exists. */
	private static final int MAX_DROP = 3;

	private LevelChecks() {
	}

	/** Centre of the laptop screen in level coordinates, as {x, y, z}. */
	public static double[] screenCenter(MiniWorld w) {
		double[] p = LaptopGeometry.screenPoint(w.laptopFacing, 0.5, 0.5);
		return new double[]{w.laptopX + p[0], w.laptopY + p[1], w.laptopZ + p[2]};
	}

	/** The spawn's eye position, as {x, y, z}. */
	public static double[] spawnEye(MiniWorld w) {
		return new double[]{w.spawnX, w.spawnY + MiniPlayer.EYE_HEIGHT, w.spawnZ};
	}

	/**
	 * Whether every cell crossed by the segment from {@code from} to {@code to} is AIR, apart from the laptop's own cell
	 * (the segment is allowed to end on the screen inside it). Walks the exact sequence of cells the segment passes
	 * through (Amanatides-Woo).
	 */
	public static boolean clearLineOfSight(MiniWorld w, double[] from, double[] to) {
		double dx = to[0] - from[0];
		double dy = to[1] - from[1];
		double dz = to[2] - from[2];
		int x = (int) Math.floor(from[0]);
		int y = (int) Math.floor(from[1]);
		int z = (int) Math.floor(from[2]);
		int endX = (int) Math.floor(to[0]);
		int endY = (int) Math.floor(to[1]);
		int endZ = (int) Math.floor(to[2]);
		int stepX = dx > 0 ? 1 : -1;
		int stepY = dy > 0 ? 1 : -1;
		int stepZ = dz > 0 ? 1 : -1;
		double deltaX = dx == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dx);
		double deltaY = dy == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dy);
		double deltaZ = dz == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dz);
		double maxX = dx == 0 ? Double.POSITIVE_INFINITY : (dx > 0 ? x + 1 - from[0] : from[0] - x) * deltaX;
		double maxY = dy == 0 ? Double.POSITIVE_INFINITY : (dy > 0 ? y + 1 - from[1] : from[1] - y) * deltaY;
		double maxZ = dz == 0 ? Double.POSITIVE_INFINITY : (dz > 0 ? z + 1 - from[2] : from[2] - z) * deltaZ;
		// t runs from 0 at the start to 1 at the end of the segment
		while (true) {
			boolean laptop = x == w.laptopX && y == w.laptopY && z == w.laptopZ;
			if (!laptop && w.get(x, y, z) != MiniBlock.AIR) {
				return false;
			}
			if (x == endX && y == endY && z == endZ) {
				return true;
			}
			double next = Math.min(maxX, Math.min(maxY, maxZ));
			if (next > 1.0) {
				return true;
			}
			if (maxX <= maxY && maxX <= maxZ) {
				x += stepX;
				maxX += deltaX;
			} else if (maxY <= maxZ) {
				y += stepY;
				maxY += deltaY;
			} else {
				z += stepZ;
				maxZ += deltaZ;
			}
		}
	}

	/** True if the spawn eye sees the laptop screen centre with nothing in between. */
	public static boolean spawnSeesScreen(MiniWorld w) {
		return clearLineOfSight(w, spawnEye(w), screenCenter(w));
	}

	/** Cells an avatar's body can be in: anything that is not solid. */
	public static boolean passable(MiniWorld w, int x, int y, int z) {
		return !w.get(x, y, z).solid();
	}

	/** Whether an avatar can stand with its feet in this cell: solid floor below, two free cells for the body. */
	public static boolean canStand(MiniWorld w, int x, int y, int z) {
		return MiniWorld.inBounds(x, y, z) && w.get(x, y - 1, z).solid() && passable(w, x, y, z) && passable(w, x, y + 1, z);
	}

	/**
	 * Whether an avatar can walk from the spawn to a spot right next to the laptop's desk, jumping at most one block up
	 * and dropping at most {@value #MAX_DROP} blocks per step.
	 */
	public static boolean canWalkToLaptop(MiniWorld w) {
		int sx = (int) Math.floor(w.spawnX);
		int sy = (int) Math.floor(w.spawnY);
		int sz = (int) Math.floor(w.spawnZ);
		if (!canStand(w, sx, sy, sz)) {
			return false;
		}
		boolean[] seen = new boolean[MiniWorld.VOLUME];
		ArrayDeque<int[]> queue = new ArrayDeque<>();
		queue.add(new int[]{sx, sy, sz});
		seen[MiniWorld.index(sx, sy, sz)] = true;
		while (!queue.isEmpty()) {
			int[] c = queue.poll();
			if (nextToDesk(w, c[0], c[1], c[2])) {
				return true;
			}
			for (Face face : Face.HORIZONTAL) {
				int nx = c[0] + face.dx;
				int nz = c[2] + face.dz;
				// One block up: needs headroom above the current cell to jump
				if (passable(w, c[0], c[1] + 2, c[2]) && visit(w, seen, queue, nx, c[1] + 1, nz)) {
					continue;
				}
				for (int drop = 0; drop <= MAX_DROP; drop++) {
					int ny = c[1] - drop;
					if (!passable(w, nx, ny, nz) || !passable(w, nx, ny + 1, nz)) {
						break;
					}
					if (visit(w, seen, queue, nx, ny, nz)) {
						break;
					}
				}
			}
		}
		return false;
	}

	private static boolean visit(MiniWorld w, boolean[] seen, ArrayDeque<int[]> queue, int x, int y, int z) {
		if (!canStand(w, x, y, z)) {
			return false;
		}
		int i = MiniWorld.index(x, y, z);
		if (!seen[i]) {
			seen[i] = true;
			queue.add(new int[]{x, y, z});
		}
		return true;
	}

	private static boolean nextToDesk(MiniWorld w, int x, int y, int z) {
		int deskY = w.laptopY - 1;
		return Math.abs(x - w.laptopX) + Math.abs(z - w.laptopZ) == 1 && Math.abs(y - deskY) <= 1;
	}

	/**
	 * Whether the level is sealed: no air cell reachable from the spawn touches the outside of the bounds. True for the
	 * hotel, false for the open levels.
	 */
	public static boolean enclosed(MiniWorld w) {
		int sx = (int) Math.floor(w.spawnX);
		int sy = (int) Math.floor(w.spawnY);
		int sz = (int) Math.floor(w.spawnZ);
		boolean[] seen = new boolean[MiniWorld.VOLUME];
		ArrayDeque<int[]> queue = new ArrayDeque<>();
		queue.add(new int[]{sx, sy, sz});
		seen[MiniWorld.index(sx, sy, sz)] = true;
		while (!queue.isEmpty()) {
			int[] c = queue.poll();
			for (Face face : Face.values()) {
				int nx = c[0] + face.dx;
				int ny = c[1] + face.dy;
				int nz = c[2] + face.dz;
				if (!MiniWorld.inBounds(nx, ny, nz)) {
					return false;
				}
				int i = MiniWorld.index(nx, ny, nz);
				if (!seen[i] && passable(w, nx, ny, nz)) {
					seen[i] = true;
					queue.add(new int[]{nx, ny, nz});
				}
			}
		}
		return true;
	}
}
