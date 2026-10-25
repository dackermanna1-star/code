package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.ArtificialSunEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;

/** An enormous artificial star: boiling plasma surface, corona, rotating flares; swells before it erupts. */
public class ArtificialSunRenderer extends EntityRenderer<ArtificialSunEntity, GfRenderState> {
	public ArtificialSunRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(ArtificialSunEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(ArtificialSunEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.progress = entity.growth(partialTick);
		state.extra = entity.eruption(partialTick);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float growth = state.progress;
		float erupt = state.extra;
		float swell = 1.0F + erupt * erupt * 0.8F;
		float r = state.size * (0.15F + 0.85F * (1.0F - (1.0F - growth) * (1.0F - growth))) * swell;
		float boil = 0.92F + 0.08F * Mth.sin(t * 0.7F) + 0.04F * Mth.sin(t * 2.3F);
		poseStack.pushPose();
		poseStack.mulPose(Axis.YP.rotation(t * 0.01F));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_PLASMA), (pose, vc) -> {
			FxDraw.texSphere(vc, pose, r, 24, 36, FxDraw.argb(0xFFC23A, 1.0F), 3.0F, t * 0.004F, t * 0.002F);
			FxDraw.texSphere(vc, pose, r * 1.04F, 24, 36, FxDraw.argb(0xFF6A14, 0.7F), 4.0F, -t * 0.003F, -t * 0.001F);
			FxDraw.texSphere(vc, pose, r * 1.12F * boil, 20, 30, FxDraw.argb(0xFF3A0A, 0.35F), 2.0F, t * 0.002F, 0.0F);
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
			FxDraw.colorSphere(vc, pose, r * 0.9F, 18, 28, FxDraw.argb(0xFFF8E0, 0.85F + erupt * 0.15F))
		);
		poseStack.popPose();
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 4.5F * boil, FxDraw.argb(0xFF6A14, 0.45F));
			FxDraw.billboard(vc, pose, r * 2.6F, FxDraw.argb(0xFFD27A, 0.6F));
			FxDraw.billboard(vc, pose, r * 8.0F * (0.6F + erupt), FxDraw.argb(0xFFF4D0, 0.25F + erupt * 0.6F));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 5.0F * boil, t * 0.01F, FxDraw.argb(0xFFF2B0, 0.6F));
			FxDraw.billboard(vc, pose, r * 3.5F, -t * 0.015F + 0.6F, FxDraw.argb(0xFF9A3A, 0.5F));
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
