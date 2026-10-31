package com.jjkshowdown.client.render.entity;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.client.render.RenderUtil;
import com.jjkshowdown.entity.projectile.DismantleEntity;
import com.jjkshowdown.entity.projectile.FugaEntity;
import com.jjkshowdown.entity.projectile.WorldSlashEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/** Dismantle slashes, the World-Cutting Slash and Fuga's flame arrow. */
public final class BladeRenderers {
	static final Identifier SLASH = JjkShowdown.id("textures/entity/technique/slash.png");
	static final Identifier WORLD = JjkShowdown.id("textures/entity/technique/world_slash.png");
	static final Identifier FUGA = JjkShowdown.id("textures/entity/technique/fuga_arrow.png");

	private BladeRenderers() {
	}

	/** Quad spanned by two world-space axes, centred on the origin of the pose. */
	static void plane(PoseStack ps, SubmitNodeCollector out, RenderType type, Vec3 axisU, Vec3 axisV, float halfU, float lenV, float vStart, int color) {
		Vec3 a = axisU.scale(-halfU), b = axisU.scale(halfU);
		Vec3 back = axisV.scale(-lenV);
		Vec3 front = axisV.scale(vStart);
		out.submitCustomGeometry(ps, type, (pose, vc) -> {
			RenderUtil.vertex(vc, pose, (float) (a.x + front.x), (float) (a.y + front.y), (float) (a.z + front.z), 0, 0, color);
			RenderUtil.vertex(vc, pose, (float) (b.x + front.x), (float) (b.y + front.y), (float) (b.z + front.z), 1, 0, color);
			RenderUtil.vertex(vc, pose, (float) (b.x + back.x), (float) (b.y + back.y), (float) (b.z + back.z), 1, 1, color);
			RenderUtil.vertex(vc, pose, (float) (a.x + back.x), (float) (a.y + back.y), (float) (a.z + back.z), 0, 1, color);
		});
	}

	public static final class Dismantle extends TechniqueRenderer<DismantleEntity> {
		public Dismantle(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void extractRenderState(DismantleEntity e, TechniqueRenderState s, float partial) {
			super.extractRenderState(e, s, partial);
			s.edge = e.edge();
			s.forward = e.getDeltaMovement().lengthSqr() > 1.0E-6 ? e.getDeltaMovement().normalize() : e.getLookAngle();
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float fade = Mth.clamp(1f - s.ageInTicks / 14f, 0.2f, 1f);
			plane(ps, out, JjkRenderTypes.additive(SLASH), s.edge, s.forward, s.scale * 0.5f, 2.2f, 0.4f, RenderUtil.argb(fade, 0xFFFFFF));
			plane(ps, out, JjkRenderTypes.additive(SLASH), s.edge, s.forward, s.scale * 0.45f, 1.4f, 0.2f, RenderUtil.argb(fade * 0.6f, 0xD8E8FF));
			super.submit(s, ps, out, cam);
		}
	}

	public static final class WorldSlash extends TechniqueRenderer<WorldSlashEntity> {
		public WorldSlash(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void extractRenderState(WorldSlashEntity e, TechniqueRenderState s, float partial) {
			super.extractRenderState(e, s, partial);
			s.edge = e.edge();
			s.forward = e.forward();
			s.radius = e.length();
			s.scale = e.halfWidth();
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float t = s.ageInTicks;
			float prop = Mth.clamp(t / WorldSlashEntity.PROPAGATE_TICKS, 0f, 1f);
			float fade = Mth.clamp(1f - (t - WorldSlashEntity.PROPAGATE_TICKS) / (WorldSlashEntity.LIFE - WorldSlashEntity.PROPAGATE_TICKS), 0f, 1f);
			float len = s.radius * prop;
			// the cut plane itself: barely visible shimmer
			ps.pushPose();
			Vec3 mid = s.forward.scale(len * 0.5);
			ps.translate(mid.x, mid.y, mid.z);
			plane(ps, out, JjkRenderTypes.additive(OrbRenderers.GLOW), s.edge, s.forward, s.scale, len * 0.5f, len * 0.5f, RenderUtil.argb(0.10f * fade, 0xC8F0FF));
			ps.popPose();
			// the advancing cutting edge
			ps.pushPose();
			Vec3 front = s.forward.scale(len);
			ps.translate(front.x, front.y, front.z);
			Vec3 n = s.forward.cross(s.edge).normalize();
			plane(ps, out, JjkRenderTypes.additive(WORLD), s.edge, n, s.scale, 0.35f, 0.35f, RenderUtil.argb(fade, 0xFFFFFF));
			plane(ps, out, JjkRenderTypes.additive(WORLD), s.edge, s.forward, s.scale, 0.35f, 0.35f, RenderUtil.argb(fade, 0xFFFFFF));
			ps.popPose();
			// the line where space was severed, lingering along the whole cut
			for (int i = 0; i < 4; i++) {
				float off = (i - 1.5f) * 0.02f;
				ps.pushPose();
				Vec3 m = s.forward.scale(len * 0.5).add(s.forward.cross(s.edge).normalize().scale(off));
				ps.translate(m.x, m.y, m.z);
				plane(ps, out, JjkRenderTypes.additive(WORLD), s.forward, s.edge, len * 0.5f, 0.08f, 0.08f, RenderUtil.argb(fade * 0.9f, 0xFFFFFF));
				ps.popPose();
			}
			super.submit(s, ps, out, cam);
		}
	}

	public static final class Fuga extends TechniqueRenderer<FugaEntity> {
		public Fuga(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void extractRenderState(FugaEntity e, TechniqueRenderState s, float partial) {
			super.extractRenderState(e, s, partial);
			s.forward = e.getDeltaMovement().lengthSqr() > 1.0E-6 ? e.getDeltaMovement().normalize() : e.getLookAngle();
			Vec3 side = s.forward.cross(new Vec3(0, 1, 0));
			s.edge = side.lengthSqr() < 1.0E-4 ? new Vec3(1, 0, 0) : side.normalize();
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float sz = s.scale;
			float flick = 0.85f + 0.15f * Mth.sin(s.ageInTicks * 3.1f);
			Vec3 up = s.edge.cross(s.forward).normalize();
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(OrbRenderers.GLOW), cam.orientation, 3.2f * sz * flick, 0, RenderUtil.argb(0.7f, 0xFF7020));
			plane(ps, out, JjkRenderTypes.additive(FUGA), s.forward, s.edge, 1.4f * sz, 0.18f * sz, 0.18f * sz, RenderUtil.argb(1f, 0xFFFFFF));
			plane(ps, out, JjkRenderTypes.additive(FUGA), s.forward, up, 1.4f * sz, 0.18f * sz, 0.18f * sz, RenderUtil.argb(1f, 0xFFFFFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(OrbRenderers.GLOW), cam.orientation, 0.9f * sz, 0, RenderUtil.argb(1f, 0xFFF0C0));
			super.submit(s, ps, out, cam);
		}
	}
}
