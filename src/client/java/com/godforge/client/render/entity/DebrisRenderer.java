package com.godforge.client.render.entity;

import com.godforge.entity.FlyingDebrisEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;

/** A tumbling chunk of real terrain. */
public class DebrisRenderer extends EntityRenderer<FlyingDebrisEntity, GfRenderState> {
	public DebrisRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.shadowRadius = 0.3F;
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	public void extractRenderState(FlyingDebrisEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.block = entity.blockState();
		state.size = entity.scale();
		state.seed = entity.getId();
		state.progress = entity.life() + partialTick;
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.progress;
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.5F * state.size, 0.0F);
		poseStack.mulPose(Axis.YP.rotationDegrees(t * (7.0F + state.seed % 9)));
		poseStack.mulPose(Axis.XP.rotationDegrees(t * (11.0F + state.seed % 7)));
		poseStack.scale(state.size, state.size, state.size);
		poseStack.translate(-0.5F, -0.5F, -0.5F);
		collector.submitBlock(poseStack, state.block, state.lightCoords, OverlayTexture.NO_OVERLAY, state.outlineColor);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
