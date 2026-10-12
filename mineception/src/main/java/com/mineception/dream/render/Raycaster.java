package com.mineception.dream.render;

import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniWorld;

/**
 * Software voxel renderer that draws a dream level the way Minecraft would, using the real block textures.
 *
 * <p>PLACEHOLDER (scaffold): draws only a sky gradient. The public signatures are the contract used by the client and
 * must stay. Must be thread-safe for concurrent calls on different output buffers.
 */
public final class Raycaster {
	private final TextureSource textures;

	public Raycaster(TextureSource textures) {
		this.textures = textures;
	}

	public TextureSource textures() {
		return textures;
	}

	/**
	 * Renders {@code world} as seen by {@code camera} into {@code out} (ARGB, row-major, top row first,
	 * {@code width * height} pixels).
	 *
	 * @param gameTime    real-world game time in ticks (drives time of day, weather and animated textures)
	 * @param partialTick fraction of the current tick
	 * @param child       what this level's laptop screen shows (the next level down), or null for "no signal" static
	 * @param highlight   block to outline (the one the player is looking at), or null
	 */
	public void render(MiniWorld world, Camera camera, long gameTime, float partialTick, ScreenImage child, MiniHit highlight,
					   int[] out, int width, int height) {
		int top = world.theme.skyDayTop;
		int bottom = world.theme.skyDayHorizon;
		for (int py = 0; py < height; py++) {
			float t = height <= 1 ? 0.0F : (float) py / (height - 1);
			int color = lerpColor(top, bottom, t);
			for (int px = 0; px < width; px++) {
				out[py * width + px] = color;
			}
		}
	}

	static int lerpColor(int a, int b, float t) {
		int ar = a >> 16 & 0xFF;
		int ag = a >> 8 & 0xFF;
		int ab = a & 0xFF;
		int r = (int) (ar + ((b >> 16 & 0xFF) - ar) * t);
		int g = (int) (ag + ((b >> 8 & 0xFF) - ag) * t);
		int bl = (int) (ab + ((b & 0xFF) - ab) * t);
		return 0xFF000000 | r << 16 | g << 8 | bl;
	}
}
