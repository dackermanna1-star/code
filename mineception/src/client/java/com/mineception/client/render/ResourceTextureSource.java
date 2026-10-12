package com.mineception.client.render;

import com.mineception.Mineception;
import com.mineception.dream.render.BlockTextures;
import com.mineception.dream.render.ImageTextureSource;
import com.mojang.blaze3d.platform.NativeImage;
import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;

/**
 * Block textures for the dream raycaster, read from the active resource packs (so texture packs show up inside the
 * laptops too). Cleared on every resource reload.
 */
final class ResourceTextureSource extends ImageTextureSource {
	@Override
	protected BlockTextures.RawImage loadImage(String name) {
		Identifier id = Identifier.withDefaultNamespace("textures/block/" + name + ".png");
		Optional<Resource> resource = Minecraft.getInstance().getResourceManager().getResource(id);
		if (resource.isEmpty()) {
			Mineception.LOGGER.warn("Dream texture {} is missing", id);
			return null;
		}
		try (InputStream in = resource.get().open(); NativeImage image = NativeImage.read(in)) {
			return new BlockTextures.RawImage(image.getPixels(), image.getWidth(), image.getHeight());
		} catch (IOException | RuntimeException e) {
			Mineception.LOGGER.warn("Could not read dream texture {}", id, e);
			return null;
		}
	}
}
