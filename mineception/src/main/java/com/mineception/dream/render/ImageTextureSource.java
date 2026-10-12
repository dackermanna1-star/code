package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A {@link TextureSource} that builds face textures from decoded vanilla images using the {@link BlockTextures} rules,
 * caching both the images and the finished textures. Thread-safe. Subclasses only decode images: the client reads
 * them from the active resource packs, the offline preview straight from the Minecraft jar.
 */
public abstract class ImageTextureSource implements TextureSource {
	private static final int[] MISSING = new int[0];
	private static final BlockTextures.RawImage NO_IMAGE = new BlockTextures.RawImage(new int[1], 1, 1);

	private final ConcurrentHashMap<String, BlockTextures.RawImage> images = new ConcurrentHashMap<>();
	private final ConcurrentHashMap<Integer, int[]> textures = new ConcurrentHashMap<>();

	/**
	 * Decodes a vanilla block texture by name (e.g. "grass_block_side" for textures/block/grass_block_side.png).
	 * Returns null if it does not exist.
	 */
	protected abstract BlockTextures.RawImage loadImage(String name);

	@Override
	public int[] texture(MiniBlock block, Face face, Theme theme) {
		int key = (theme.ordinal() * 256 + block.id) * 6 + face.ordinal();
		int[] texture = textures.computeIfAbsent(key, k -> {
			int[] built = BlockTextures.compose(block, face, theme, this::image);
			return built == null ? MISSING : built;
		});
		return texture == MISSING ? null : texture;
	}

	private BlockTextures.RawImage image(String name) {
		BlockTextures.RawImage image = images.computeIfAbsent(name, n -> {
			BlockTextures.RawImage loaded = loadImage(n);
			return loaded == null ? NO_IMAGE : loaded;
		});
		return image == NO_IMAGE ? null : image;
	}

	/** Forgets every cached image and texture (after a resource reload). */
	public void clear() {
		images.clear();
		textures.clear();
	}
}
