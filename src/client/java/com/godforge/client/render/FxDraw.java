package com.godforge.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Geometry helpers for effect rendering. "Tex" methods emit NEW_ENTITY vertices (for {@link GfRenderTypes#glow});
 * "color" methods emit POSITION_COLOR vertices (for {@link GfRenderTypes#additive}/{@link GfRenderTypes#solid}).
 */
public final class FxDraw {
	private FxDraw() {
	}

	public static int argb(int rgb, float alpha) {
		return ARGB.color(Mth.clamp((int) (alpha * 255.0F), 0, 255), rgb);
	}

	public static int lerpColor(int a, int b, float t) {
		return ARGB.srgbLerp(Mth.clamp(t, 0.0F, 1.0F), a, b);
	}

	// ------------------------------------------------------------------ textured (NEW_ENTITY)

	public static void tv(VertexConsumer vc, PoseStack.Pose pose, float x, float y, float z, float u, float v, int argb) {
		vc.addVertex(pose, x, y, z).setColor(argb).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(LightTexture.FULL_BRIGHT).setNormal(pose, 0.0F, 1.0F, 0.0F);
	}

	/** Quad in the local XY plane (apply the camera orientation first for a billboard). */
	public static void billboard(VertexConsumer vc, PoseStack.Pose pose, float size, int argb) {
		tv(vc, pose, -size, -size, 0, 0, 1, argb);
		tv(vc, pose, size, -size, 0, 1, 1, argb);
		tv(vc, pose, size, size, 0, 1, 0, argb);
		tv(vc, pose, -size, size, 0, 0, 0, argb);
	}

	/** Billboard rotated by {@code angle} radians around its normal. */
	public static void billboard(VertexConsumer vc, PoseStack.Pose pose, float size, float angle, int argb) {
		float c = Mth.cos(angle) * size;
		float s = Mth.sin(angle) * size;
		tv(vc, pose, -c + s, -s - c, 0, 0, 1, argb);
		tv(vc, pose, c + s, s - c, 0, 1, 1, argb);
		tv(vc, pose, c - s, s + c, 0, 1, 0, argb);
		tv(vc, pose, -c - s, -s + c, 0, 0, 0, argb);
	}

	/** Quad in the local XZ plane (ground decals, flat rings). */
	public static void flat(VertexConsumer vc, PoseStack.Pose pose, float size, float angle, int argb) {
		float c = Mth.cos(angle) * size;
		float s = Mth.sin(angle) * size;
		tv(vc, pose, -c + s, 0, -s - c, 0, 1, argb);
		tv(vc, pose, c + s, 0, s - c, 1, 1, argb);
		tv(vc, pose, c - s, 0, s + c, 1, 0, argb);
		tv(vc, pose, -c - s, 0, -s + c, 0, 0, argb);
	}

	/** UV sphere; u wraps around the equator ({@code uScale} times) and is offset by {@code uOffset}. */
	public static void texSphere(VertexConsumer vc, PoseStack.Pose pose, float r, int rings, int segments, int argb, float uScale, float uOffset, float vOffset) {
		for (int i = 0; i < rings; i++) {
			float t0 = (float) Math.PI * i / rings;
			float t1 = (float) Math.PI * (i + 1) / rings;
			float y0 = Mth.cos(t0) * r;
			float y1 = Mth.cos(t1) * r;
			float r0 = Mth.sin(t0) * r;
			float r1 = Mth.sin(t1) * r;
			for (int j = 0; j < segments; j++) {
				float p0 = Mth.TWO_PI * j / segments;
				float p1 = Mth.TWO_PI * (j + 1) / segments;
				float u0 = uOffset + uScale * j / segments;
				float u1 = uOffset + uScale * (j + 1) / segments;
				float v0 = vOffset + (float) i / rings;
				float v1 = vOffset + (float) (i + 1) / rings;
				tv(vc, pose, Mth.cos(p0) * r0, y0, Mth.sin(p0) * r0, u0, v0, argb);
				tv(vc, pose, Mth.cos(p1) * r0, y0, Mth.sin(p1) * r0, u1, v0, argb);
				tv(vc, pose, Mth.cos(p1) * r1, y1, Mth.sin(p1) * r1, u1, v1, argb);
				tv(vc, pose, Mth.cos(p0) * r1, y1, Mth.sin(p0) * r1, u0, v1, argb);
			}
		}
	}

	/** Lumpy rock: a sphere whose radius is perturbed by deterministic noise (for asteroids). */
	public static void rockSphere(VertexConsumer vc, PoseStack.Pose pose, float r, int rings, int segments, int argb, long seed, float roughness, int light) {
		float[][] radius = new float[rings + 1][segments + 1];
		for (int i = 0; i <= rings; i++) {
			for (int j = 0; j <= segments; j++) {
				int jj = j % segments;
				long h = seed * 31 + (long) i * 7919 + (i == 0 || i == rings ? 0 : jj) * 104729L;
				h ^= h >>> 17;
				h *= 0x9E3779B97F4A7C15L;
				float n = ((h >>> 40) & 0xFFFF) / 65535.0F;
				radius[i][j] = r * (1.0F - roughness * 0.5F + roughness * n);
			}
		}
		for (int i = 0; i < rings; i++) {
			float t0 = (float) Math.PI * i / rings;
			float t1 = (float) Math.PI * (i + 1) / rings;
			for (int j = 0; j < segments; j++) {
				float p0 = Mth.TWO_PI * j / segments;
				float p1 = Mth.TWO_PI * (j + 1) / segments;
				float u0 = (float) j / segments;
				float u1 = (float) (j + 1) / segments;
				float v0 = (float) i / rings;
				float v1 = (float) (i + 1) / rings;
				rockVertex(vc, pose, t0, p0, radius[i][j], u0, v0, argb, light);
				rockVertex(vc, pose, t0, p1, radius[i][j + 1], u1, v0, argb, light);
				rockVertex(vc, pose, t1, p1, radius[i + 1][j + 1], u1, v1, argb, light);
				rockVertex(vc, pose, t1, p0, radius[i + 1][j], u0, v1, argb, light);
			}
		}
	}

	private static void rockVertex(VertexConsumer vc, PoseStack.Pose pose, float theta, float phi, float r, float u, float v, int argb, int light) {
		float nx = Mth.sin(theta) * Mth.cos(phi);
		float ny = Mth.cos(theta);
		float nz = Mth.sin(theta) * Mth.sin(phi);
		vc.addVertex(pose, nx * r, ny * r, nz * r).setColor(argb).setUv(u * 2.0F, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(pose, nx, ny, nz);
	}

	/** Textured box (each face uses the full texture). */
	public static void texBox(VertexConsumer vc, PoseStack.Pose pose, float x0, float y0, float z0, float x1, float y1, float z1, int argb) {
		// -Z
		tv(vc, pose, x0, y0, z0, 0, 1, argb);
		tv(vc, pose, x0, y1, z0, 0, 0, argb);
		tv(vc, pose, x1, y1, z0, 1, 0, argb);
		tv(vc, pose, x1, y0, z0, 1, 1, argb);
		// +Z
		tv(vc, pose, x0, y0, z1, 0, 1, argb);
		tv(vc, pose, x1, y0, z1, 1, 1, argb);
		tv(vc, pose, x1, y1, z1, 1, 0, argb);
		tv(vc, pose, x0, y1, z1, 0, 0, argb);
		// -X
		tv(vc, pose, x0, y0, z0, 0, 1, argb);
		tv(vc, pose, x0, y0, z1, 1, 1, argb);
		tv(vc, pose, x0, y1, z1, 1, 0, argb);
		tv(vc, pose, x0, y1, z0, 0, 0, argb);
		// +X
		tv(vc, pose, x1, y0, z0, 0, 1, argb);
		tv(vc, pose, x1, y1, z0, 0, 0, argb);
		tv(vc, pose, x1, y1, z1, 1, 0, argb);
		tv(vc, pose, x1, y0, z1, 1, 1, argb);
		// -Y
		tv(vc, pose, x0, y0, z0, 0, 0, argb);
		tv(vc, pose, x1, y0, z0, 1, 0, argb);
		tv(vc, pose, x1, y0, z1, 1, 1, argb);
		tv(vc, pose, x0, y0, z1, 0, 1, argb);
		// +Y
		tv(vc, pose, x0, y1, z0, 0, 0, argb);
		tv(vc, pose, x0, y1, z1, 0, 1, argb);
		tv(vc, pose, x1, y1, z1, 1, 1, argb);
		tv(vc, pose, x1, y1, z0, 1, 0, argb);
	}

	/** Textured annulus in the XZ plane; u runs around, v from inner (0) to outer (1). */
	public static void texRing(VertexConsumer vc, PoseStack.Pose pose, float inner, float outer, int segments, float uOffset, int innerArgb, int outerArgb) {
		for (int j = 0; j < segments; j++) {
			float p0 = Mth.TWO_PI * j / segments;
			float p1 = Mth.TWO_PI * (j + 1) / segments;
			float u0 = uOffset + (float) j / segments * 4.0F;
			float u1 = uOffset + (float) (j + 1) / segments * 4.0F;
			tv(vc, pose, Mth.cos(p0) * inner, 0, Mth.sin(p0) * inner, u0, 0, innerArgb);
			tv(vc, pose, Mth.cos(p0) * outer, 0, Mth.sin(p0) * outer, u0, 1, outerArgb);
			tv(vc, pose, Mth.cos(p1) * outer, 0, Mth.sin(p1) * outer, u1, 1, outerArgb);
			tv(vc, pose, Mth.cos(p1) * inner, 0, Mth.sin(p1) * inner, u1, 0, innerArgb);
		}
	}

	// ------------------------------------------------------------------ colour (POSITION_COLOR)

	public static void cv(VertexConsumer vc, PoseStack.Pose pose, float x, float y, float z, int argb) {
		vc.addVertex(pose, x, y, z).setColor(argb);
	}

	public static void colorSphere(VertexConsumer vc, PoseStack.Pose pose, float r, int rings, int segments, int argb) {
		for (int i = 0; i < rings; i++) {
			float t0 = (float) Math.PI * i / rings;
			float t1 = (float) Math.PI * (i + 1) / rings;
			float y0 = Mth.cos(t0) * r;
			float y1 = Mth.cos(t1) * r;
			float r0 = Mth.sin(t0) * r;
			float r1 = Mth.sin(t1) * r;
			for (int j = 0; j < segments; j++) {
				float p0 = Mth.TWO_PI * j / segments;
				float p1 = Mth.TWO_PI * (j + 1) / segments;
				cv(vc, pose, Mth.cos(p0) * r0, y0, Mth.sin(p0) * r0, argb);
				cv(vc, pose, Mth.cos(p1) * r0, y0, Mth.sin(p1) * r0, argb);
				cv(vc, pose, Mth.cos(p1) * r1, y1, Mth.sin(p1) * r1, argb);
				cv(vc, pose, Mth.cos(p0) * r1, y1, Mth.sin(p0) * r1, argb);
			}
		}
	}

	/** Flat annulus in the XZ plane with a colour gradient from inner to outer edge. */
	public static void colorRing(VertexConsumer vc, PoseStack.Pose pose, float inner, float outer, float y, int segments, int innerArgb, int outerArgb) {
		for (int j = 0; j < segments; j++) {
			float p0 = Mth.TWO_PI * j / segments;
			float p1 = Mth.TWO_PI * (j + 1) / segments;
			cv(vc, pose, Mth.cos(p0) * inner, y, Mth.sin(p0) * inner, innerArgb);
			cv(vc, pose, Mth.cos(p0) * outer, y, Mth.sin(p0) * outer, outerArgb);
			cv(vc, pose, Mth.cos(p1) * outer, y, Mth.sin(p1) * outer, outerArgb);
			cv(vc, pose, Mth.cos(p1) * inner, y, Mth.sin(p1) * inner, innerArgb);
		}
	}

	/** Vertical cylinder wall of radius r between y0 and y1. */
	public static void colorWall(VertexConsumer vc, PoseStack.Pose pose, float r, float y0, float y1, int segments, int bottomArgb, int topArgb) {
		for (int j = 0; j < segments; j++) {
			float p0 = Mth.TWO_PI * j / segments;
			float p1 = Mth.TWO_PI * (j + 1) / segments;
			cv(vc, pose, Mth.cos(p0) * r, y0, Mth.sin(p0) * r, bottomArgb);
			cv(vc, pose, Mth.cos(p1) * r, y0, Mth.sin(p1) * r, bottomArgb);
			cv(vc, pose, Mth.cos(p1) * r, y1, Mth.sin(p1) * r, topArgb);
			cv(vc, pose, Mth.cos(p0) * r, y1, Mth.sin(p0) * r, topArgb);
		}
	}

	/** Cylinder between two points (relative to the pose origin). */
	public static void colorBeam(VertexConsumer vc, PoseStack.Pose pose, Vec3 a, Vec3 b, float radius, int sides, int argbA, int argbB) {
		Vec3 axis = b.subtract(a);
		double len = axis.length();
		if (len < 1.0E-4) {
			return;
		}
		Vec3 dir = axis.scale(1.0 / len);
		Vec3 ref = Math.abs(dir.y) < 0.95 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
		Vec3 u = dir.cross(ref).normalize();
		Vec3 v = dir.cross(u).normalize();
		for (int i = 0; i < sides; i++) {
			double t0 = Math.PI * 2 * i / sides;
			double t1 = Math.PI * 2 * (i + 1) / sides;
			Vec3 o0 = u.scale(Math.cos(t0) * radius).add(v.scale(Math.sin(t0) * radius));
			Vec3 o1 = u.scale(Math.cos(t1) * radius).add(v.scale(Math.sin(t1) * radius));
			cv(vc, pose, (float) (a.x + o0.x), (float) (a.y + o0.y), (float) (a.z + o0.z), argbA);
			cv(vc, pose, (float) (a.x + o1.x), (float) (a.y + o1.y), (float) (a.z + o1.z), argbA);
			cv(vc, pose, (float) (b.x + o1.x), (float) (b.y + o1.y), (float) (b.z + o1.z), argbB);
			cv(vc, pose, (float) (b.x + o0.x), (float) (b.y + o0.y), (float) (b.z + o0.z), argbB);
		}
	}

	/** Flat strip between two points that always faces the camera (camera position relative to pose origin). */
	public static void colorStrip(VertexConsumer vc, PoseStack.Pose pose, Vec3 a, Vec3 b, Vec3 camera, float width, int argbA, int argbB) {
		Vec3 axis = b.subtract(a);
		Vec3 toCam = camera.subtract(a.add(b).scale(0.5));
		Vec3 side = axis.cross(toCam);
		if (side.lengthSqr() < 1.0E-8) {
			return;
		}
		side = side.normalize().scale(width * 0.5);
		cv(vc, pose, (float) (a.x - side.x), (float) (a.y - side.y), (float) (a.z - side.z), argbA);
		cv(vc, pose, (float) (a.x + side.x), (float) (a.y + side.y), (float) (a.z + side.z), argbA);
		cv(vc, pose, (float) (b.x + side.x), (float) (b.y + side.y), (float) (b.z + side.z), argbB);
		cv(vc, pose, (float) (b.x - side.x), (float) (b.y - side.y), (float) (b.z - side.z), argbB);
	}

	/** Textured camera-facing strip (beam texture runs along the length). */
	public static void texStrip(VertexConsumer vc, PoseStack.Pose pose, Vec3 a, Vec3 b, Vec3 camera, float width, float vScroll, float vRepeat, int argbA, int argbB) {
		Vec3 axis = b.subtract(a);
		Vec3 toCam = camera.subtract(a.add(b).scale(0.5));
		Vec3 side = axis.cross(toCam);
		if (side.lengthSqr() < 1.0E-8) {
			return;
		}
		side = side.normalize().scale(width * 0.5);
		tv(vc, pose, (float) (a.x - side.x), (float) (a.y - side.y), (float) (a.z - side.z), 0, vScroll, argbA);
		tv(vc, pose, (float) (a.x + side.x), (float) (a.y + side.y), (float) (a.z + side.z), 1, vScroll, argbA);
		tv(vc, pose, (float) (b.x + side.x), (float) (b.y + side.y), (float) (b.z + side.z), 1, vScroll + vRepeat, argbB);
		tv(vc, pose, (float) (b.x - side.x), (float) (b.y - side.y), (float) (b.z - side.z), 0, vScroll + vRepeat, argbB);
	}

	public static Vector3f vec(Vec3 v) {
		return new Vector3f((float) v.x, (float) v.y, (float) v.z);
	}
}
