package com.jjkshowdown.client.render.entity;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.client.render.RenderUtil;
import com.jjkshowdown.entity.projectile.BlueEntity;
import com.jjkshowdown.entity.projectile.HollowPurpleEntity;
import com.jjkshowdown.entity.projectile.RedEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/** Blue, Red and Hollow Purple: layered additive billboards and volume spheres. */
public final class OrbRenderers {
	static final Identifier GLOW = JjkShowdown.id("textures/entity/technique/glow.png");
	static final Identifier BLUE = JjkShowdown.id("textures/entity/technique/blue_orb.png");
	static final Identifier RED = JjkShowdown.id("textures/entity/technique/red_orb.png");
	static final Identifier PURPLE = JjkShowdown.id("textures/entity/technique/purple_orb.png");
	static final Identifier RIPPLE = JjkShowdown.id("textures/entity/technique/infinity_ripple.png");
	static final Identifier RING = JjkShowdown.id("textures/entity/technique/ring.png");

	private OrbRenderers() {
	}

	public static final class Blue extends TechniqueRenderer<BlueEntity> {
		public Blue(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float t = s.ageInTicks;
			float grow = Mth.clamp(t / 6f, 0f, 1f);
			float sz = s.scale * grow;
			float pulse = 1f + 0.08f * Mth.sin(t * 0.9f);
			ps.pushPose();
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, sz * 5.5f * pulse, 0, RenderUtil.argb(0.55f, 0x2A6CFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(RIPPLE), cam.orientation, sz * 7f, -t * 0.05f, RenderUtil.argb(0.5f, 0x8FD8FF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(BLUE), cam.orientation, sz * 3.2f, t * 0.35f, RenderUtil.argb(1f, 0xFFFFFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(BLUE), cam.orientation, sz * 2.4f, -t * 0.5f, RenderUtil.argb(0.8f, 0xB0E0FF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, sz * 1.1f, 0, RenderUtil.argb(1f, 0xFFFFFF));
			// singularity core: dark sphere swallowing light
			RenderUtil.sphere(ps, out, JjkRenderTypes.translucentGlow(GLOW), sz * 0.35f, 8, 12, RenderUtil.argb(0.85f, 0x000010), 0, false);
			ps.popPose();
			super.submit(s, ps, out, cam);
		}
	}

	public static final class Red extends TechniqueRenderer<RedEntity> {
		public Red(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float t = s.ageInTicks;
			float sz = s.scale;
			float flicker = 0.85f + 0.15f * Mth.sin(t * 2.3f);
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, sz * 5f * flicker, 0, RenderUtil.argb(0.65f, 0xFF2010));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(RED), cam.orientation, sz * 2.8f, t * 0.6f, RenderUtil.argb(1f, 0xFFFFFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(RED), cam.orientation, sz * 2.0f, -t * 0.9f, RenderUtil.argb(0.9f, 0xFFC0A0));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, sz * 0.9f, 0, RenderUtil.argb(1f, 0xFFFFFF));
			super.submit(s, ps, out, cam);
		}
	}

	public static final class Purple extends TechniqueRenderer<HollowPurpleEntity> {
		public Purple(EntityRendererProvider.Context ctx) {
			super(ctx);
		}

		@Override
		public void submit(TechniqueRenderState s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
			float t = s.ageInTicks;
			float r = s.scale * Mth.clamp(t / 5f, 0.2f, 1f);
			float pulse = 1f + 0.06f * Mth.sin(t * 1.3f);
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, r * 7f * pulse, 0, RenderUtil.argb(0.6f, 0x7A20FF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, r * 4.2f, 0, RenderUtil.argb(0.7f, 0xD050FF));
			ps.pushPose();
			ps.mulPose(com.mojang.math.Axis.YP.rotationDegrees(t * 9f));
			ps.mulPose(com.mojang.math.Axis.XP.rotationDegrees(t * 5f));
			RenderUtil.sphere(ps, out, JjkRenderTypes.additive(PURPLE), r * 1.02f, 12, 18, RenderUtil.argb(0.9f, 0xFFFFFF), t * 0.01f, false);
			ps.popPose();
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(PURPLE), cam.orientation, r * 2.6f, t * 0.25f, RenderUtil.argb(1f, 0xFFFFFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(PURPLE), cam.orientation, r * 2.3f, -t * 0.4f, RenderUtil.argb(0.8f, 0xFFB0FF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(GLOW), cam.orientation, r * 1.4f, 0, RenderUtil.argb(1f, 0xFFFFFF));
			RenderUtil.billboard(ps, out, JjkRenderTypes.additive(RING), cam.orientation, r * 3.4f * (1f + (t % 10) / 10f), 0,
					RenderUtil.argb(0.6f * (1f - (t % 10) / 10f), 0xE0B0FF));
			super.submit(s, ps, out, cam);
		}
	}
}
