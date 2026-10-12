package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;

/**
 * Supplies block face textures to the raycaster. The client implementation reads the real Minecraft textures from the
 * active resource packs; tests and the offline preview read them from the Minecraft jar.
 */
public interface TextureSource {
	/** Width and height of every texture. */
	int SIZE = 16;

	/**
	 * A SIZE x SIZE ARGB texture (row-major, top row first) for one face of a block, already tinted for the level's
	 * theme (grass, leaves and water colours). Alpha 0 marks see-through pixels of cutout blocks. Null if missing.
	 */
	int[] texture(MiniBlock block, Face face, Theme theme);
}
