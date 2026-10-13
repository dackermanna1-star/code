package dev.calibercraft.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.calibercraft.CaliberCraft;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Bullet streaks: a short glowing segment that travels from the muzzle to the impact point at (visually capped)
 * bullet speed. Purely cosmetic and capped in number.
 */
public final class TracerRenderer {
	private static final Identifier TEXTURE = CaliberCraft.id("textures/effect/tracer.png");
	private static final int MAX = 256;
	private static final List<Tracer> TRACERS = new ArrayList<>();

	private static final class Tracer {
		final Vec3 start;
		final Vec3 dir;
		final double length;
		final double speed;
		final double streak;
		final float width;
		final int color;
		float age;

		Tracer(Vec3 start, Vec3 end, double speed, float width, int color) {
			this.start = start;
			Vec3 d = end.subtract(start);
			this.length = d.length();
			this.dir = length > 1e-6 ? d.scale(1 / length) : new Vec3(0, 0, 1);
			this.speed = speed;
			this.streak = Math.min(6.0, Math.max(1.5, speed * 0.35));
			this.width = width;
			this.color = color;
		}
	}

	private TracerRenderer() {
	}

	public static void add(Vec3 start, Vec3 end, double speed, float width, int color) {
		if (TRACERS.size() >= MAX) {
			TRACERS.removeFirst();
		}
		TRACERS.add(new Tracer(start, end, Math.min(speed, 24.0), width, color));
	}

	public static void clear() {
		TRACERS.clear();
	}

	/** Advances every tracer by {@code dt} ticks (called per frame). */
	public static void advance(float dt) {
		Iterator<Tracer> it = TRACERS.iterator();
		while (it.hasNext()) {
			Tracer t = it.next();
			t.age += dt;
			if (t.age * t.speed - t.streak > t.length || t.age > 40) {
				it.remove();
			}
		}
	}

	public static void render(WorldRenderContext ctx) {
		if (TRACERS.isEmpty()) {
			return;
		}
		Vec3 cam = ctx.worldState().cameraRenderState.pos;
		PoseStack poses = ctx.matrices();
		MultiBufferSource consumers = ctx.consumers();
		RenderType type = RenderTypes.eyes(TEXTURE);
		VertexConsumer vc = consumers.getBuffer(type);
		PoseStack.Pose pose = poses.last();
		for (Tracer t : TRACERS) {
			double head = Math.min(t.length, t.age * t.speed);
			double tail = Math.max(0, head - t.streak);
			if (head <= tail) {
				continue;
			}
			Vec3 a = t.start.add(t.dir.scale(tail)).subtract(cam);
			Vec3 b = t.start.add(t.dir.scale(head)).subtract(cam);
			Vector3f seg = new Vector3f((float) (b.x - a.x), (float) (b.y - a.y), (float) (b.z - a.z));
			Vector3f mid = new Vector3f((float) (a.x + b.x) / 2, (float) (a.y + b.y) / 2, (float) (a.z + b.z) / 2);
			Vector3f side = seg.cross(mid, new Vector3f());
			if (side.lengthSquared() < 1e-8) {
				continue;
			}
			side.normalize().mul(t.width);
			int r = (t.color >> 16) & 0xFF;
			int g = (t.color >> 8) & 0xFF;
			int bl = t.color & 0xFF;
			quad(vc, pose, a, b, side, r, g, bl);
		}
		if (consumers instanceof MultiBufferSource.BufferSource bs) {
			bs.endBatch(type);
		}
	}

	private static void quad(VertexConsumer vc, PoseStack.Pose pose, Vec3 a, Vec3 b, Vector3f s, int r, int g, int bl) {
		vertex(vc, pose, a.x - s.x, a.y - s.y, a.z - s.z, 0, 1, r, g, bl, 40);
		vertex(vc, pose, a.x + s.x, a.y + s.y, a.z + s.z, 1, 1, r, g, bl, 40);
		vertex(vc, pose, b.x + s.x, b.y + s.y, b.z + s.z, 1, 0, r, g, bl, 230);
		vertex(vc, pose, b.x - s.x, b.y - s.y, b.z - s.z, 0, 0, r, g, bl, 230);
	}

	private static void vertex(VertexConsumer vc, PoseStack.Pose pose, double x, double y, double z, float u, float v, int r, int g, int b, int a) {
		vc.addVertex(pose, (float) x, (float) y, (float) z).setColor(r, g, b, a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY)
			.setLight(0xF000F0).setNormal(pose, 0, 1, 0);
	}

}
