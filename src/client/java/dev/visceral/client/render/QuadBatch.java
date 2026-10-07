package dev.visceral.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.Arrays;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.joml.Vector3f;

/**
 * Collects quads at submit time so they can be written later by a custom geometry callback.
 * Convex polygons are split into quads (with a degenerate last quad when needed).
 */
public final class QuadBatch {
	private static final int FLOATS = 8;
	private float[] data;
	private int[] colors;
	private int[] lights;
	private int vertexCount;

	public QuadBatch(int expectedQuads) {
		int vertices = Math.max(16, expectedQuads * 4);
		this.data = new float[vertices * FLOATS];
		this.colors = new int[vertices];
		this.lights = new int[vertices];
	}

	public int vertexCount() {
		return this.vertexCount;
	}

	/**
	 * Adds a convex polygon whose vertices are laid out as x, y, z, u, v (+ optional extras up to {@code stride}),
	 * with cell-local u/v in [0, 1]. {@code ox, oy, oz} is added to every position.
	 */
	public void polygon(float[] vertices, int stride, float ox, float oy, float oz, int cell, int color, int light, Vector3f normal) {
		int n = vertices.length / stride;
		int i = 1;
		while (i + 1 < n) {
			int last = i + 2 < n ? i + 2 : i + 1;
			this.polyVertex(vertices, 0, stride, ox, oy, oz, cell, color, light, normal);
			this.polyVertex(vertices, i, stride, ox, oy, oz, cell, color, light, normal);
			this.polyVertex(vertices, i + 1, stride, ox, oy, oz, cell, color, light, normal);
			this.polyVertex(vertices, last, stride, ox, oy, oz, cell, color, light, normal);
			i += i + 2 < n ? 2 : 1;
		}
	}

	private void polyVertex(float[] vertices, int index, int stride, float ox, float oy, float oz, int cell, int color, int light, Vector3f normal) {
		int o = index * stride;
		this.vertex(vertices[o] + ox, vertices[o + 1] + oy, vertices[o + 2] + oz, Atlas.u(cell, vertices[o + 3]), Atlas.v(cell, vertices[o + 4]), color, light,
			normal.x, normal.y, normal.z);
	}

	public void vertex(float x, float y, float z, float u, float v, int color, int light, float nx, float ny, float nz) {
		if (this.vertexCount * FLOATS + FLOATS > this.data.length) {
			int capacity = this.colors.length * 2;
			this.data = Arrays.copyOf(this.data, capacity * FLOATS);
			this.colors = Arrays.copyOf(this.colors, capacity);
			this.lights = Arrays.copyOf(this.lights, capacity);
		}
		int o = this.vertexCount * FLOATS;
		this.data[o] = x;
		this.data[o + 1] = y;
		this.data[o + 2] = z;
		this.data[o + 3] = u;
		this.data[o + 4] = v;
		this.data[o + 5] = nx;
		this.data[o + 6] = ny;
		this.data[o + 7] = nz;
		this.colors[this.vertexCount] = color;
		this.lights[this.vertexCount] = light;
		this.vertexCount++;
	}

	public void emit(PoseStack.Pose pose, VertexConsumer consumer) {
		for (int i = 0; i < this.vertexCount; i++) {
			int o = i * FLOATS;
			consumer.addVertex(pose, this.data[o], this.data[o + 1], this.data[o + 2])
				.setColor(this.colors[i])
				.setUv(this.data[o + 3], this.data[o + 4])
				.setOverlay(OverlayTexture.NO_OVERLAY)
				.setLight(this.lights[i])
				.setNormal(pose, this.data[o + 5], this.data[o + 6], this.data[o + 7]);
		}
	}
}
