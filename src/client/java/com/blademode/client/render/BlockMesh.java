package com.blademode.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.Arrays;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.ARGB;

/**
 * Pre-built quads (triangles are stored as degenerate quads) for one render layer.
 * Each vertex: position, uv, normal (floats), colour, light group, emission and a cap flag.
 */
public final class BlockMesh {
	static final int FLOATS = 8;

	float[] data = new float[64 * FLOATS];
	int[] colors = new int[64];
	int[] groups = new int[64];
	byte[] flags = new byte[64];
	int count;

	public boolean isEmpty() {
		return this.count == 0;
	}

	public int vertexCount() {
		return this.count;
	}

	void vertex(float x, float y, float z, float u, float v, float nx, float ny, float nz, int color, int group, int emission, boolean cap) {
		if (this.count == this.colors.length) {
			int n = this.count * 2;
			this.data = Arrays.copyOf(this.data, n * FLOATS);
			this.colors = Arrays.copyOf(this.colors, n);
			this.groups = Arrays.copyOf(this.groups, n);
			this.flags = Arrays.copyOf(this.flags, n);
		}
		int o = this.count * FLOATS;
		this.data[o] = x;
		this.data[o + 1] = y;
		this.data[o + 2] = z;
		this.data[o + 3] = u;
		this.data[o + 4] = v;
		this.data[o + 5] = nx;
		this.data[o + 6] = ny;
		this.data[o + 7] = nz;
		this.colors[this.count] = color;
		this.groups[this.count] = group;
		this.flags[this.count] = (byte) ((emission & 15) | (cap ? 16 : 0));
		this.count++;
	}

	/**
	 * Emits all vertices.
	 *
	 * @param lights packed light per group
	 * @param glow   0..1 strength of the hot-cut glow on cap faces
	 */
	public void emit(PoseStack.Pose pose, VertexConsumer consumer, int[] lights, float glow) {
		int hot = ARGB.color(255, 255, 140, 40);
		for (int i = 0; i < this.count; i++) {
			int o = i * FLOATS;
			int color = this.colors[i];
			int light = lights[Math.min(this.groups[i], lights.length - 1)];
			int flag = this.flags[i];
			int emission = flag & 15;
			if (emission > 0) {
				light = LightTexture.pack(Math.max(LightTexture.block(light), emission), LightTexture.sky(light));
			}
			if ((flag & 16) != 0 && glow > 0.0F) {
				color = ARGB.srgbLerp(Math.min(1.0F, glow * 1.2F), color, hot);
				if (glow > 0.15F) {
					light = LightTexture.FULL_BRIGHT;
				}
			}
			consumer.addVertex(pose, this.data[o], this.data[o + 1], this.data[o + 2])
				.setColor(color)
				.setUv(this.data[o + 3], this.data[o + 4])
				.setOverlay(OverlayTexture.NO_OVERLAY)
				.setLight(light)
				.setNormal(pose, this.data[o + 5], this.data[o + 6], this.data[o + 7]);
		}
	}
}
