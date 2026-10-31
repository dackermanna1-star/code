package com.jjkshowdown.client.render.entity;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.client.render.RenderUtil;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainType;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/**
 * Domain visuals beyond the physical arena: the expanding starry bubble of Unlimited Void, parallax stars on its
 * inner barrier, the crimson boundary of Malevolent Shrine, clash damage on barriers, and the collapse.
 */
public class DomainRenderer extends EntityRenderer<DomainEntity, TechniqueRenderState> {
	private static final Identifier STARS = JjkShowdown.id("textures/entity/technique/void_stars.png");
	private static final Identifier GLOW = JjkShowdown.id("textures/entity/technique/glow.png");
	private static final Identifier RING = JjkShowdown.id("textures/entity/technique/ring.png");
	private static final Identifier SLASH_RED = JjkShowdown.id("textures/entity/technique/slash_red.png");

	public DomainRenderer(EntityRendererProvider.Context ctx) {
		super(ctx);
	}

	@Override
	public TechniqueRenderState createRenderState() {
		return new TechniqueRenderState();
	}

	@Override
	public boolean shouldRender(DomainEntity e, Frustum frustum, double x, double y, double z) {
		return e.distanceToSqr(x, y, z) < 320 * 320;
	}

	@Override
	public void extractRenderState(DomainEntity e, TechniqueRenderState s, float partial) {
		super.extractRenderState(e, s, partial);
		s.domainType = e.domainType().ordinal();
		s.radius = e.radius();
		s.phase = e.phase();
		s.progress = e.formProgress(partial);
		s.collapse = e.collapseProgress(partial);
		s.integrity = e.integrity();
		s.clashing = e.clashWith() >= 0;
	}

	@Override
	public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
		float t = s.ageInTicks;
		DomainType type = DomainType.byOrdinal(s.domainType);
		float r = s.radius;
		if (type == DomainType.UNLIMITED_VOID) {
			if (s.phase == DomainEntity.PHASE_FORMING) {
				float rr = r * s.progress;
				ps.pushPose();
				ps.mulPose(Axis.YP.rotationDegrees(t * 0.6f));
				RenderUtil.sphere(ps, out, JjkRenderTypes.additive(STARS), rr, 16, 32, RenderUtil.argb(0.9f, 0xFFFFFF), 0, true);
				RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), rr * 1.02f, 12, 24, RenderUtil.argb(0.25f, 0x9FE8FF), 0, true);
				ps.popPose();
			} else if (s.phase == DomainEntity.PHASE_COLLAPSING) {
				float c = s.collapse;
				RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), r * (1f + c * 0.4f), 12, 24, RenderUtil.argb(0.7f * (1 - c), 0xFFFFFF), 0, true);
			} else {
				// parallax starfield just inside the barrier
				ps.pushPose();
				ps.mulPose(Axis.YP.rotationDegrees(t * 0.15f));
				RenderUtil.sphere(ps, out, JjkRenderTypes.additive(STARS), r - 1.3f, 16, 32, RenderUtil.argb(0.55f, 0xFFFFFF), 0, true);
				ps.popPose();
				ps.pushPose();
				ps.mulPose(Axis.YP.rotationDegrees(-t * 0.35f));
				RenderUtil.sphere(ps, out, JjkRenderTypes.additive(STARS), r * 0.6f, 12, 24, RenderUtil.argb(0.18f, 0xB0E0FF), 0.5f, true);
				ps.popPose();
				if (s.clashing && s.integrity < 1f) {
					renderCuts(ps, out, r + 0.6f, t, 1f - s.integrity);
				}
			}
		} else {
			float rr = r * s.progress;
			float fade = s.phase == DomainEntity.PHASE_COLLAPSING ? 1f - s.collapse : 1f;
			ps.pushPose();
			ps.translate(0, 0.08, 0);
			float pulse = 0.75f + 0.25f * Mth.sin(t * 0.25f);
			RenderUtil.flatQuad(ps, out, JjkRenderTypes.additive(RING), rr * 2.05f, RenderUtil.argb(0.9f * fade * pulse, 0xFF1028));
			RenderUtil.flatQuad(ps, out, JjkRenderTypes.additive(GLOW), rr * 2f, RenderUtil.argb(0.22f * fade, 0xC00010));
			ps.popPose();
			RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), rr, 12, 24, RenderUtil.argb(0.08f * fade, 0xFF2030), 0, true);
		}
		super.submit(s, ps, out, cam);
	}

	/** Red cuts carved into a barrier from outside (Malevolent Shrine eroding Unlimited Void). */
	private void renderCuts(PoseStack ps, SubmitNodeCollector out, float radius, float t, float damage) {
		int count = 8 + (int) (damage * 60);
		RandomSource rnd = RandomSource.create(1234L + (long) (t / 3));
		for (int i = 0; i < count; i++) {
			double u = rnd.nextDouble();
			double v = rnd.nextDouble() * Math.PI * 2;
			Vec3 n = new Vec3(Math.sqrt(1 - u * u) * Math.cos(v), u, Math.sqrt(1 - u * u) * Math.sin(v));
			Vec3 tangent = n.cross(new Vec3(0, 1, 0));
			if (tangent.lengthSqr() < 1.0E-4) tangent = new Vec3(1, 0, 0);
			tangent = tangent.normalize();
			double roll = rnd.nextDouble() * Math.PI;
			Vec3 bit = n.cross(tangent).normalize();
			Vec3 dir = tangent.scale(Math.cos(roll)).add(bit.scale(Math.sin(roll)));
			ps.pushPose();
			Vec3 p = n.scale(radius);
			ps.translate(p.x, p.y, p.z);
			BladeRenderers.plane(ps, out, JjkRenderTypes.additive(SLASH_RED), dir, n.cross(dir).normalize(), 1.6f + rnd.nextFloat() * 2.5f, 0.25f, 0.25f,
					RenderUtil.argb(0.9f, 0xFFFFFF));
			ps.popPose();
		}
	}
}
