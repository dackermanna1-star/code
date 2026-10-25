package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.TargetMarkerEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/** Rotating holographic rings and a pillar of light marking a strike zone. */
public class TargetMarkerRenderer extends EntityRenderer<TargetMarkerEntity, GfRenderState> {
	public TargetMarkerRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(TargetMarkerEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(TargetMarkerEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.color = entity.color();
		state.progress = entity.progress(partialTick);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float fadeIn = Mth.clamp(t / 10.0F, 0.0F, 1.0F);
		float fadeOut = state.progress > 0.85F ? (1.0F - state.progress) / 0.15F : 1.0F;
		float alpha = fadeIn * fadeOut * (0.7F + 0.3F * Mth.sin(t * 0.3F));
		float r = Math.max(2.0F, state.size);
		int c = state.color;
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.15F, 0.0F);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_RING), (pose, vc) -> {
			FxDraw.flat(vc, pose, r, t * 0.02F, FxDraw.argb(c, alpha));
			FxDraw.flat(vc, pose, r * 0.7F, -t * 0.035F, FxDraw.argb(c, alpha * 0.7F));
			FxDraw.flat(vc, pose, r * 0.25F, t * 0.08F, FxDraw.argb(0xFFFFFF, alpha));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			// crosshair spokes
			for (int i = 0; i < 4; i++) {
				float ang = t * 0.02F + i * Mth.HALF_PI;
				float cs = Mth.cos(ang);
				float sn = Mth.sin(ang);
				Vec3 inner = new Vec3(cs * r * 0.3F, 0, sn * r * 0.3F);
				Vec3 outer = new Vec3(cs * r * 1.15F, 0, sn * r * 1.15F);
				FxDraw.colorStrip(vc, pose, inner, outer, new Vec3(0, 100, 0), 0.25F + r * 0.01F, FxDraw.argb(c, alpha), FxDraw.argb(c, 0.0F));
			}
			FxDraw.colorBeam(vc, pose, Vec3.ZERO, new Vec3(0, 160, 0), 0.3F + r * 0.02F, 10, FxDraw.argb(c, alpha * 0.85F), FxDraw.argb(c, 0.0F));
			FxDraw.colorBeam(vc, pose, Vec3.ZERO, new Vec3(0, 60, 0), 0.9F + r * 0.04F, 12, FxDraw.argb(c, alpha * 0.2F), FxDraw.argb(c, 0.0F));
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
