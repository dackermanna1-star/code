package com.blademode.gore;

/**
 * One box of a model part as it was drawn: its bounds and its textured faces, in part space
 * (blocks, as after vanilla's division by 16).
 */
public final class Cube {
	public final float x0;
	public final float y0;
	public final float z0;
	public final float x1;
	public final float y1;
	public final float z1;
	/** Faces, packed: for each face {@code count, nx, ny, nz}, then {@code count × (x, y, z, u, v)}. */
	public final float[] faces;

	public Cube(float x0, float y0, float z0, float x1, float y1, float z1, float[] faces) {
		this.x0 = x0;
		this.y0 = y0;
		this.z0 = z0;
		this.x1 = x1;
		this.y1 = y1;
		this.z1 = z1;
		this.faces = faces;
	}

	/** A plain box with all six faces (used by tests and as a fallback). */
	public static Cube box(float x0, float y0, float z0, float x1, float y1, float z1) {
		float[][] quads = {
			{0, -1, 0, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1},
			{0, 1, 0, x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0},
			{0, 0, -1, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0},
			{0, 0, 1, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1},
			{-1, 0, 0, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0},
			{1, 0, 0, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1}
		};
		float[] packed = new float[6 * (4 + 4 * 5)];
		int o = 0;
		for (float[] q : quads) {
			packed[o++] = 4;
			packed[o++] = q[0];
			packed[o++] = q[1];
			packed[o++] = q[2];
			for (int v = 0; v < 4; v++) {
				packed[o++] = q[3 + v * 3];
				packed[o++] = q[4 + v * 3];
				packed[o++] = q[5 + v * 3];
				packed[o++] = v == 1 || v == 2 ? 1 : 0;
				packed[o++] = v >= 2 ? 1 : 0;
			}
		}
		return new Cube(x0, y0, z0, x1, y1, z1, packed);
	}
}
