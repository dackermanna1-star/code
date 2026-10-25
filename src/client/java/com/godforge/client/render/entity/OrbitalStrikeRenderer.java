package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.OrbitalStrikeEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;

/** The bombardment zone: a burning red perimeter and a sweeping targeting ring. */
public class OrbitalStrikeRenderer extends EntityRenderer<OrbitalStrikeEntity, GfRenderState> {
	public OrbitalStrikeRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(OrbitalStrikeEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(OrbitalStrikeEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.progress = entity.progress(partialTick);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float r = state.size;
		float alpha = Mth.clamp(t / 20.0F, 0.0F, 1.0F) * Mth.clamp((1.0F - state.progress) * 8.0F, 0.0F, 1.0F);
		float sweep = (t * 0.05F) % 1.0F;
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.3F, 0.0F);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			FxDraw.colorRing(vc, pose, r - 1.2F, r, 0.0F, 128, FxDraw.argb(0xFF2A2A, 0.0F), FxDraw.argb(0xFF2A2A, 0.9F * alpha));
			FxDraw.colorWall(vc, pose, r, 0.0F, 6.0F, 128, FxDraw.argb(0xFF2A2A, 0.45F * alpha), FxDraw.argb(0xFF2A2A, 0.0F));
			float sr = r * sweep;
			FxDraw.colorRing(vc, pose, Math.max(0.0F, sr - 2.0F), sr, 0.05F, 96, FxDraw.argb(0x3DFF7A, 0.0F), FxDraw.argb(0x3DFF7A, 0.6F * alpha * (1.0F - sweep)));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_RING), (pose, vc) ->
			FxDraw.flat(vc, pose, r * 0.18F, -t * 0.05F, FxDraw.argb(0xFF2A2A, alpha))
		);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
