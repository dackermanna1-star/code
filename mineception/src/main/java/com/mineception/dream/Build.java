package com.mineception.dream;

/** Small block-placing helpers shared by the level generators. Boxes are inclusive and corner order does not matter. */
final class Build {
	private Build() {
	}

	static void fill(MiniWorld w, int x0, int y0, int z0, int x1, int y1, int z1, MiniBlock block) {
		for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
					w.set(x, y, z, block);
				}
			}
		}
	}

	/** Fills only the cells that are currently air. */
	static void fillAir(MiniWorld w, int x0, int y0, int z0, int x1, int y1, int z1, MiniBlock block) {
		for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
					if (w.get(x, y, z) == MiniBlock.AIR) {
						w.set(x, y, z, block);
					}
				}
			}
		}
	}

	static void column(MiniWorld w, int x, int y0, int y1, int z, MiniBlock block) {
		fill(w, x, y0, z, x, y1, z, block);
	}

	static void setIfAir(MiniWorld w, int x, int y, int z, MiniBlock block) {
		if (w.get(x, y, z) == MiniBlock.AIR) {
			w.set(x, y, z, block);
		}
	}

	/** Highest y holding a solid block in a column, or -1. */
	static int top(MiniWorld w, int x, int z) {
		for (int y = MiniWorld.SY - 1; y >= 0; y--) {
			if (w.get(x, y, z).solid()) {
				return y;
			}
		}
		return -1;
	}

	static boolean inside(int x, int z) {
		return x >= 0 && z >= 0 && x < MiniWorld.SX && z < MiniWorld.SZ;
	}

	static int clamp(int v, int min, int max) {
		return Math.max(min, Math.min(max, v));
	}

	/** Leaves blob: a rough sphere of {@code block} that only replaces air. */
	static void blob(MiniWorld w, DreamRandom r, double cx, double cy, double cz, double radius, MiniBlock block) {
		int r0 = (int) Math.ceil(radius);
		for (int y = (int) Math.floor(cy - r0); y <= (int) Math.ceil(cy + r0); y++) {
			for (int z = (int) Math.floor(cz - r0); z <= (int) Math.ceil(cz + r0); z++) {
				for (int x = (int) Math.floor(cx - r0); x <= (int) Math.ceil(cx + r0); x++) {
					double dx = x + 0.5 - cx;
					double dy = y + 0.5 - cy;
					double dz = z + 0.5 - cz;
					double d = dx * dx + dy * dy * 1.3 + dz * dz;
					double edge = radius * radius;
					if (d <= edge * 0.55 || d <= edge && r.chance(0.6)) {
						setIfAir(w, x, y, z, block);
					}
				}
			}
		}
	}
}
