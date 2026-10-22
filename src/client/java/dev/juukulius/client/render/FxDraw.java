package dev.juukulius.client.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.util.Mth;
import org.joml.Matrix4f;
import org.joml.Quaternionfc;
import org.joml.Vector3f;

/**
 * Geometry helpers for POSITION_TEX_COLOR effect geometry (glow and veil render types). All coordinates are relative to
 * the camera position, matching the world render pose stack.
 */
public final class FxDraw {
	private static final Vector3f TMP_A = new Vector3f();
	private static final Vector3f TMP_B = new Vector3f();
	private static final Vector3f TMP_C = new Vector3f();
	private static final Vector3f TMP_D = new Vector3f();

	private FxDraw() {
	}

	public static int argb(float alpha, int rgb) {
		int a = Mth.clamp((int) (alpha * 255.0F), 0, 255);
		return a << 24 | (rgb & 0xFFFFFF);
	}

	public static int scaleRgb(int rgb, float factor) {
		int r = Mth.clamp((int) (((rgb >> 16) & 0xFF) * factor), 0, 255);
		int g = Mth.clamp((int) (((rgb >> 8) & 0xFF) * factor), 0, 255);
		int b = Mth.clamp((int) ((rgb & 0xFF) * factor), 0, 255);
		return r << 16 | g << 8 | b;
	}

	public static int lerpRgb(float t, int from, int to) {
		int r = (int) Mth.lerp(t, (from >> 16) & 0xFF, (to >> 16) & 0xFF);
		int g = (int) Mth.lerp(t, (from >> 8) & 0xFF, (to >> 8) & 0xFF);
		int b = (int) Mth.lerp(t, from & 0xFF, to & 0xFF);
		return r << 16 | g << 8 | b;
	}

	/** Rainbow colour for a hue in [0, 1). Saturated but slightly soft so layered glows stay elegant. */
	public static int rainbow(float hue) {
		return Mth.hsvToRgb(hue - Mth.floor(hue), 0.78F, 1.0F) & 0xFFFFFF;
	}

	private static void vertex(VertexConsumer consumer, Matrix4f matrix, Vector3f position, float u, float v, int color) {
		consumer.addVertex(matrix, position.x, position.y, position.z).setUv(u, v).setColor(color);
	}

	/** Quad from four corners (counter-clockwise), full texture. */
	public static void quad(VertexConsumer consumer, Matrix4f matrix, Vector3f a, Vector3f b, Vector3f c, Vector3f d, int color) {
		quad(consumer, matrix, a, b, c, d, 0.0F, 0.0F, 1.0F, 1.0F, color);
	}

	public static void quad(VertexConsumer consumer, Matrix4f matrix, Vector3f a, Vector3f b, Vector3f c, Vector3f d, float u0, float v0, float u1, float v1,
		int color) {
		vertex(consumer, matrix, a, u0, v1, color);
		vertex(consumer, matrix, b, u1, v1, color);
		vertex(consumer, matrix, c, u1, v0, color);
		vertex(consumer, matrix, d, u0, v0, color);
	}

	/** Quad with independent colours per edge (a-b edge uses colorBottom, c-d edge uses colorTop). */
	public static void gradientQuad(VertexConsumer consumer, Matrix4f matrix, Vector3f a, Vector3f b, Vector3f c, Vector3f d, float u0, float v0, float u1,
		float v1, int colorBottom, int colorTop) {
		vertex(consumer, matrix, a, u0, v1, colorBottom);
		vertex(consumer, matrix, b, u1, v1, colorBottom);
		vertex(consumer, matrix, c, u1, v0, colorTop);
		vertex(consumer, matrix, d, u0, v0, colorTop);
	}

	/** Quad with its own colour at every corner (a, b, c, d counter-clockwise; a-b is the v1 edge). */
	public static void cornerQuad(VertexConsumer consumer, Matrix4f matrix, Vector3f a, Vector3f b, Vector3f c, Vector3f d, float u0, float v0, float u1,
		float v1, int colorA, int colorB, int colorC, int colorD) {
		vertex(consumer, matrix, a, u0, v1, colorA);
		vertex(consumer, matrix, b, u1, v1, colorB);
		vertex(consumer, matrix, c, u1, v0, colorC);
		vertex(consumer, matrix, d, u0, v0, colorD);
	}

	/** Camera-facing sprite. */
	public static void billboard(VertexConsumer consumer, Matrix4f matrix, Quaternionfc cameraRotation, float x, float y, float z, float size, float roll,
		int color) {
		float cos = Mth.cos(roll);
		float sin = Mth.sin(roll);
		corner(cameraRotation, -1.0F, -1.0F, cos, sin, size, x, y, z, TMP_A);
		corner(cameraRotation, 1.0F, -1.0F, cos, sin, size, x, y, z, TMP_B);
		corner(cameraRotation, 1.0F, 1.0F, cos, sin, size, x, y, z, TMP_C);
		corner(cameraRotation, -1.0F, 1.0F, cos, sin, size, x, y, z, TMP_D);
		vertex(consumer, matrix, TMP_A, 1.0F, 1.0F, color);
		vertex(consumer, matrix, TMP_B, 0.0F, 1.0F, color);
		vertex(consumer, matrix, TMP_C, 0.0F, 0.0F, color);
		vertex(consumer, matrix, TMP_D, 1.0F, 0.0F, color);
	}

	private static void corner(Quaternionfc rotation, float dx, float dy, float cos, float sin, float size, float x, float y, float z, Vector3f out) {
		out.set(dx * cos - dy * sin, dx * sin + dy * cos, 0.0F).mul(size).rotate(rotation).add(x, y, z);
	}

	/**
	 * A flat textured square centred on {@code center}, spanned by {@code axisU} and {@code axisV} (half extents).
	 * Used for magic circles and ground rings.
	 */
	public static void plane(VertexConsumer consumer, Matrix4f matrix, Vector3f center, Vector3f axisU, Vector3f axisV, int color) {
		TMP_A.set(center).sub(axisU).sub(axisV);
		TMP_B.set(center).add(axisU).sub(axisV);
		TMP_C.set(center).add(axisU).add(axisV);
		TMP_D.set(center).sub(axisU).add(axisV);
		quad(consumer, matrix, TMP_A, TMP_B, TMP_C, TMP_D, color);
	}

	/** Annulus in the plane spanned by unit vectors {@code u} and {@code v}; texture u wraps around, v goes inner → outer. */
	public static void ring(VertexConsumer consumer, Matrix4f matrix, Vector3f center, Vector3f u, Vector3f v, float innerRadius, float outerRadius,
		int segments, float uRepeat, int innerColor, int outerColor) {
		for (int i = 0; i < segments; i++) {
			float a0 = Mth.TWO_PI * i / segments;
			float a1 = Mth.TWO_PI * (i + 1) / segments;
			float c0 = Mth.cos(a0);
			float s0 = Mth.sin(a0);
			float c1 = Mth.cos(a1);
			float s1 = Mth.sin(a1);
			TMP_A.set(u).mul(c0 * innerRadius).add(v.x * s0 * innerRadius, v.y * s0 * innerRadius, v.z * s0 * innerRadius).add(center);
			TMP_B.set(u).mul(c1 * innerRadius).add(v.x * s1 * innerRadius, v.y * s1 * innerRadius, v.z * s1 * innerRadius).add(center);
			TMP_C.set(u).mul(c1 * outerRadius).add(v.x * s1 * outerRadius, v.y * s1 * outerRadius, v.z * s1 * outerRadius).add(center);
			TMP_D.set(u).mul(c0 * outerRadius).add(v.x * s0 * outerRadius, v.y * s0 * outerRadius, v.z * s0 * outerRadius).add(center);
			float tu0 = uRepeat * i / segments;
			float tu1 = uRepeat * (i + 1) / segments;
			vertex(consumer, matrix, TMP_A, tu0, 1.0F, innerColor);
			vertex(consumer, matrix, TMP_B, tu1, 1.0F, innerColor);
			vertex(consumer, matrix, TMP_C, tu1, 0.0F, outerColor);
			vertex(consumer, matrix, TMP_D, tu0, 0.0F, outerColor);
		}
	}

	/** A cylinder-like band of height {@code height} around an axis (for vortex walls and pillars). */
	public static void band(VertexConsumer consumer, Matrix4f matrix, Vector3f base, float radiusBottom, float radiusTop, float height, int segments,
		float uOffset, float uRepeat, int bottomColor, int topColor) {
		for (int i = 0; i < segments; i++) {
			float a0 = Mth.TWO_PI * i / segments;
			float a1 = Mth.TWO_PI * (i + 1) / segments;
			TMP_A.set(base.x + Mth.cos(a0) * radiusBottom, base.y, base.z + Mth.sin(a0) * radiusBottom);
			TMP_B.set(base.x + Mth.cos(a1) * radiusBottom, base.y, base.z + Mth.sin(a1) * radiusBottom);
			TMP_C.set(base.x + Mth.cos(a1) * radiusTop, base.y + height, base.z + Mth.sin(a1) * radiusTop);
			TMP_D.set(base.x + Mth.cos(a0) * radiusTop, base.y + height, base.z + Mth.sin(a0) * radiusTop);
			float u0 = uOffset + uRepeat * i / segments;
			float u1 = uOffset + uRepeat * (i + 1) / segments;
			vertex(consumer, matrix, TMP_A, u0, 1.0F, bottomColor);
			vertex(consumer, matrix, TMP_B, u1, 1.0F, bottomColor);
			vertex(consumer, matrix, TMP_C, u1, 0.0F, topColor);
			vertex(consumer, matrix, TMP_D, u0, 0.0F, topColor);
		}
	}

	/** Builds an orthonormal basis (u, v) perpendicular to {@code normal}. */
	public static void basis(Vector3f normal, Vector3f outU, Vector3f outV) {
		Vector3f n = new Vector3f(normal).normalize();
		Vector3f helper = Math.abs(n.y) < 0.95F ? new Vector3f(0.0F, 1.0F, 0.0F) : new Vector3f(1.0F, 0.0F, 0.0F);
		outU.set(helper).cross(n).normalize();
		outV.set(n).cross(outU).normalize();
	}
}
