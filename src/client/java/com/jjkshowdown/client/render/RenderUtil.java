package com.jjkshowdown.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import org.joml.Quaternionf;

/** Geometry helpers for technique visuals. */
public final class RenderUtil {
	public static final int FULL_BRIGHT = 15728880;

	private RenderUtil() {
	}

	public static void vertex(VertexConsumer vc, PoseStack.Pose pose, float x, float y, float z, float u, float v, int color) {
		vc.addVertex(pose, x, y, z).setColor(color).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(FULL_BRIGHT).setNormal(pose, 0, 1, 0);
	}

	/** Camera-facing square of {@code size} with optional roll (radians). */
	public static void billboard(PoseStack ps, SubmitNodeCollector out, RenderType type, Quaternionf cameraOrientation, float size, float roll, int color) {
		ps.pushPose();
		ps.mulPose(cameraOrientation);
		if (roll != 0) ps.mulPose(new Quaternionf().rotateZ(roll));
		float h = size / 2f;
		out.submitCustomGeometry(ps, type, (pose, vc) -> {
			vertex(vc, pose, -h, -h, 0, 0, 1, color);
			vertex(vc, pose, h, -h, 0, 1, 1, color);
			vertex(vc, pose, h, h, 0, 1, 0, color);
			vertex(vc, pose, -h, h, 0, 0, 0, color);
		});
		ps.popPose();
	}

	/** UV sphere (equirectangular texture mapping). */
	public static void sphere(PoseStack ps, SubmitNodeCollector out, RenderType type, float radius, int lat, int lon, int color, float uOffset, boolean upperOnly) {
		out.submitCustomGeometry(ps, type, (pose, vc) -> {
			int latStart = upperOnly ? lat / 2 : 0;
			for (int i = latStart; i < lat; i++) {
				float t0 = (float) i / lat, t1 = (float) (i + 1) / lat;
				float th0 = (float) Math.PI * t0, th1 = (float) Math.PI * t1;
				for (int j = 0; j < lon; j++) {
					float s0 = (float) j / lon, s1 = (float) (j + 1) / lon;
					float ph0 = Mth.TWO_PI * s0, ph1 = Mth.TWO_PI * s1;
					quadSphere(vc, pose, radius, th0, th1, ph0, ph1, s0 + uOffset, s1 + uOffset, 1 - t0, 1 - t1, color);
				}
			}
		});
	}

	private static void quadSphere(VertexConsumer vc, PoseStack.Pose pose, float r, float th0, float th1, float ph0, float ph1, float u0, float u1,
			float v0, float v1, int color) {
		sv(vc, pose, r, th0, ph0, u0, v0, color);
		sv(vc, pose, r, th1, ph0, u0, v1, color);
		sv(vc, pose, r, th1, ph1, u1, v1, color);
		sv(vc, pose, r, th0, ph1, u1, v0, color);
	}

	private static void sv(VertexConsumer vc, PoseStack.Pose pose, float r, float th, float ph, float u, float v, int color) {
		float y = Mth.cos(th) * -r;
		float s = Mth.sin(th) * r;
		vertex(vc, pose, s * Mth.cos(ph), y, s * Mth.sin(ph), u, v, color);
	}

	/** Flat ring on the XZ plane. */
	public static void flatQuad(PoseStack ps, SubmitNodeCollector out, RenderType type, float size, int color) {
		float h = size / 2f;
		out.submitCustomGeometry(ps, type, (pose, vc) -> {
			vertex(vc, pose, -h, 0, -h, 0, 0, color);
			vertex(vc, pose, -h, 0, h, 0, 1, color);
			vertex(vc, pose, h, 0, h, 1, 1, color);
			vertex(vc, pose, h, 0, -h, 1, 0, color);
		});
	}

	public static int argb(float a, int rgb) {
		return (Mth.clamp((int) (a * 255), 0, 255) << 24) | (rgb & 0xFFFFFF);
	}
}
