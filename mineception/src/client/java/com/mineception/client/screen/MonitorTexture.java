package com.mineception.client.screen;

import com.mineception.Mineception;
import com.mojang.blaze3d.platform.NativeImage;
import java.nio.IntBuffer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;
import org.lwjgl.system.MemoryUtil;

/**
 * The picture on the laptop GUI's monitor: an ARGB frame buffer the dream renderer draws into, uploaded to a
 * {@link DynamicTexture} each frame. The texture is recreated when the wanted resolution changes and released when the
 * screen closes.
 */
final class MonitorTexture {
	private static final Identifier ID = Mineception.id("laptop_screen/monitor");

	private @Nullable DynamicTexture texture;
	private int width;
	private int height;
	private int[] pixels = new int[0];

	/** Makes sure the texture and frame buffer have this size. */
	void ensureSize(int width, int height) {
		if (texture != null && width == this.width && height == this.height) {
			return;
		}
		release();
		this.width = width;
		this.height = height;
		pixels = new int[width * height];
		texture = new DynamicTexture(() -> "Mineception laptop monitor", width, height, false);
		Minecraft.getInstance().getTextureManager().register(ID, texture);
	}

	int width() {
		return width;
	}

	int height() {
		return height;
	}

	/** The frame buffer (ARGB, row-major, top row first) to render into before {@link #upload()}. */
	int[] pixels() {
		return pixels;
	}

	Identifier id() {
		return ID;
	}

	boolean ready() {
		return texture != null;
	}

	/** Copies the frame buffer into the texture (forcing it opaque) and sends it to the GPU. */
	void upload() {
		if (texture == null) {
			return;
		}
		NativeImage image = texture.getPixels();
		if (image == null) {
			return;
		}
		int count = width * height;
		IntBuffer target = MemoryUtil.memIntBuffer(image.getPointer(), count);
		for (int i = 0; i < count; i++) {
			int argb = pixels[i];
			// ARGB -> ABGR (NativeImage's in-memory RGBA byte order), always opaque
			target.put(i, 0xFF000000 | (argb & 0x0000FF00) | (argb >> 16 & 0xFF) | (argb & 0xFF) << 16);
		}
		texture.upload();
	}

	void release() {
		if (texture != null) {
			Minecraft.getInstance().getTextureManager().release(ID);
			texture = null;
		}
	}
}
