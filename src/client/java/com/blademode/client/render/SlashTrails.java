package com.blademode.client.render;

import com.blademode.net.SlashFxPayload;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3d;

/** The bright arc left in the air by a slash, fading out over a fraction of a second. */
public final class SlashTrails {
	private static final long LIFETIME_MS = 350;
	private static final List<Trail> TRAILS = new ArrayList<>();

	private record Trail(Vec3 eye, Vector3d r1, Vector3d r2, float reach, long start) {
	}

	private SlashTrails() {
	}

	public static void add(SlashFxPayload fx) {
		Vector3d a = new Vector3d(fx.dirA().x, fx.dirA().y, fx.dirA().z).normalize();
		Vector3d b = new Vector3d(fx.dirB().x, fx.dirB().y, fx.dirB().z).normalize();
		synchronized (TRAILS) {
			TRAILS.add(new Trail(fx.eye(), a, b, fx.reach(), System.currentTimeMillis()));
		}
	}

	public static void render(WorldRenderContext context) {
		List<Trail> live;
		long now = System.currentTimeMillis();
		synchronized (TRAILS) {
			Iterator<Trail> it = TRAILS.iterator();
			while (it.hasNext()) {
				if (now - it.next().start > LIFETIME_MS) {
					it.remove();
				}
			}
			if (TRAILS.isEmpty()) {
				return;
			}
			live = new ArrayList<>(TRAILS);
		}
		Vec3 cam = Minecraft.getInstance().gameRenderer.getMainCamera().position();
		PoseStack poseStack = context.matrices();
		for (Trail t : live) {
			float age = (now - t.start) / (float) LIFETIME_MS;
			float fade = (1.0F - age) * (1.0F - age);
			poseStack.pushPose();
			poseStack.translate(t.eye.x - cam.x, t.eye.y - cam.y, t.eye.z - cam.z);
			context.commandQueue().submitCustomGeometry(poseStack, RenderTypes.lightning(), (pose, consumer) -> emit(pose.pose(), consumer, t, fade, age));
			poseStack.popPose();
		}
	}

	private static void emit(Matrix4f m, VertexConsumer c, Trail t, float fade, float age) {
		final int segments = 24;
		// A band near the blade's reach that sweeps outward as it fades.
		float inner = 1.2F + age * 1.5F;
		float outer = Math.min(t.reach, 14.0F) * (0.55F + 0.45F * age);
		Vector3d prev = null;
		for (int i = 0; i <= segments; i++) {
			double s = i / (double) segments;
			Vector3d d = new Vector3d(t.r1).mul(1 - s).fma(s, t.r2).normalize();
			if (prev != null) {
				// Brightest where the stroke ended (r2), like a trailing edge.
				float edge = (float) s;
				int aIn = (int) (40 * fade * edge);
				int aOut = (int) (200 * fade * (0.25F + 0.75F * edge));
				quad(m, c, prev, d, inner, outer, aIn, aOut);
			}
			prev = d;
		}
	}

	private static void quad(Matrix4f m, VertexConsumer c, Vector3d a, Vector3d b, float r0, float r1, int alphaIn, int alphaOut) {
		float ax0 = (float) (a.x * r0), ay0 = (float) (a.y * r0), az0 = (float) (a.z * r0);
		float ax1 = (float) (a.x * r1), ay1 = (float) (a.y * r1), az1 = (float) (a.z * r1);
		float bx0 = (float) (b.x * r0), by0 = (float) (b.y * r0), bz0 = (float) (b.z * r0);
		float bx1 = (float) (b.x * r1), by1 = (float) (b.y * r1), bz1 = (float) (b.z * r1);
		// Front and back so it shows from both sides.
		c.addVertex(m, ax0, ay0, az0).setColor(150, 220, 255, alphaIn);
		c.addVertex(m, ax1, ay1, az1).setColor(235, 250, 255, alphaOut);
		c.addVertex(m, bx1, by1, bz1).setColor(235, 250, 255, alphaOut);
		c.addVertex(m, bx0, by0, bz0).setColor(150, 220, 255, alphaIn);
		c.addVertex(m, bx0, by0, bz0).setColor(150, 220, 255, alphaIn);
		c.addVertex(m, bx1, by1, bz1).setColor(235, 250, 255, alphaOut);
		c.addVertex(m, ax1, ay1, az1).setColor(235, 250, 255, alphaOut);
		c.addVertex(m, ax0, ay0, az0).setColor(150, 220, 255, alphaIn);
	}
}
