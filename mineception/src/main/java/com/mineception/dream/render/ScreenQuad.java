package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;

/**
 * The rectangle the live picture is drawn on for a real-world laptop: exactly the screen of the block model
 * ({@link LaptopGeometry}) for the block's facing, pushed a hair in front of the lid.
 */
public final class ScreenQuad {
	/** How far in front of the lid the picture floats, in blocks (keeps it clear of the model's dark screen face). */
	public static final double OFFSET = 1.0 / 512.0;

	private ScreenQuad() {
	}

	/**
	 * The four corners as block-local {x, y, z}, in the order top-left, bottom-left, bottom-right, top-right as seen by
	 * someone looking at the screen; that order is counter-clockwise from the front, so it survives back-face culling.
	 * Their texture coordinates (u right, v down) are (0,0), (0,1), (1,1), (1,0).
	 */
	public static double[][] corners(Face facing) {
		double[][] corners = new double[4][];
		double[][] uv = {{0.0, 0.0}, {0.0, 1.0}, {1.0, 1.0}, {1.0, 0.0}};
		for (int i = 0; i < 4; i++) {
			double[] p = LaptopGeometry.screenPoint(facing, uv[i][0], uv[i][1]);
			corners[i] = new double[]{p[0] + facing.dx * OFFSET, p[1], p[2] + facing.dz * OFFSET};
		}
		return corners;
	}

	/** Texture u of corner {@code i} of {@link #corners}. */
	public static float u(int i) {
		return i >= 2 ? 1.0F : 0.0F;
	}

	/** Texture v of corner {@code i} of {@link #corners}. */
	public static float v(int i) {
		return i == 1 || i == 2 ? 1.0F : 0.0F;
	}
}
