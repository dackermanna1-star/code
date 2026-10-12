package com.mineception.client.render;

import com.mineception.Mineception;
import com.mojang.blaze3d.platform.NativeImage;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;

/** A GPU texture showing a laptop's live picture on the real-world block. Render thread only. */
final class ScreenTexture {
	private static final AtomicInteger COUNTER = new AtomicInteger();

	private final Identifier id;
	private final DynamicTexture texture;
	private final int width;
	private final int height;
	private boolean uploaded;

	ScreenTexture(BlockPos pos, int width, int height) {
		this.width = width;
		this.height = height;
		this.id = Mineception.id("dream_screen/" + Long.toHexString(pos.asLong()) + "_" + COUNTER.incrementAndGet());
		this.texture = new DynamicTexture(() -> "Mineception laptop screen at " + pos.toShortString(), width, height, false);
		Minecraft.getInstance().getTextureManager().register(id, texture);
	}

	Identifier id() {
		return id;
	}

	/** Whether a picture has been uploaded yet (until then the block's dark screen shows). */
	boolean hasPicture() {
		return uploaded;
	}

	/** Uploads a picture of exactly this texture's size (ARGB, top row first). */
	void upload(int[] argb) {
		NativeImage pixels = texture.getPixels();
		if (pixels == null) {
			return;
		}
		for (int y = 0; y < height; y++) {
			int row = y * width;
			for (int x = 0; x < width; x++) {
				pixels.setPixel(x, y, argb[row + x] | 0xFF000000);
			}
		}
		texture.upload();
		uploaded = true;
	}

	void release() {
		Minecraft.getInstance().getTextureManager().release(id);
	}
}
