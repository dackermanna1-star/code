package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;

/**
 * Procedural stand-in textures for tests that must not depend on the Minecraft jar. Every texture marks its
 * orientation: the top-left quadrant is red, top-right green, bottom-left blue, bottom-right white (all opaque), so a
 * test can tell whether a face was drawn upright and unmirrored. Leaves and glass get see-through holes in a
 * checkerboard, ice and water are half transparent.
 */
final class SyntheticTextures implements TextureSource {
	static final int TOP_LEFT = 0xFFFF0000;
	static final int TOP_RIGHT = 0xFF00FF00;
	static final int BOTTOM_LEFT = 0xFF0000FF;
	static final int BOTTOM_RIGHT = 0xFFFFFFFF;

	@Override
	public int[] texture(MiniBlock block, Face face, Theme theme) {
		if (block.kind == MiniBlock.Kind.AIR || block.kind == MiniBlock.Kind.SPECIAL) {
			return null;
		}
		int[] texture = new int[SIZE * SIZE];
		for (int y = 0; y < SIZE; y++) {
			for (int x = 0; x < SIZE; x++) {
				int color = y < SIZE / 2 ? (x < SIZE / 2 ? TOP_LEFT : TOP_RIGHT) : (x < SIZE / 2 ? BOTTOM_LEFT : BOTTOM_RIGHT);
				if (block.kind == MiniBlock.Kind.CUTOUT && ((x / 2 + y / 2) & 1) == 0) {
					color = 0;
				} else if (block.kind == MiniBlock.Kind.TRANSLUCENT || block.kind == MiniBlock.Kind.LIQUID) {
					color = color & 0xFFFFFF | 0x80000000;
				}
				texture[y * SIZE + x] = color;
			}
		}
		return texture;
	}
}
