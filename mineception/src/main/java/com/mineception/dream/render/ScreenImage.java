package com.mineception.dream.render;

/**
 * A rendered picture: ARGB pixels, row-major with the top row first. Used for what a laptop screen shows.
 */
public record ScreenImage(int[] pixels, int width, int height) {
	public ScreenImage {
		if (pixels.length < width * height) {
			throw new IllegalArgumentException("pixel buffer too small for " + width + "x" + height);
		}
	}

	public static ScreenImage create(int width, int height) {
		return new ScreenImage(new int[width * height], width, height);
	}

	/** Nearest-neighbour sample at normalized coordinates (u right, v down, 0..1). */
	public int sample(double u, double v) {
		int x = Math.min(width - 1, Math.max(0, (int) (u * width)));
		int y = Math.min(height - 1, Math.max(0, (int) (v * height)));
		return pixels[y * width + x];
	}
}
