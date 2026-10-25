package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.KineticFistEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;

/** A colossal translucent fist of kinetic energy, built from glowing segments. */
public class KineticFistRenderer extends EntityRenderer<KineticFistEntity, GfRenderState> {
	public KineticFistRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(KineticFistEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(KineticFistEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.yaw = entity.getYRot(partialTick);
		state.pitch = entity.getXRot(partialTick);
		state.progress = entity.age() + partialTick;
	}

	/** Fist geometry in a unit space facing +Z (knuckles forward). */
	private static void fist(VertexConsumer vc, PoseStack.Pose pose, float inflate, int argb) {
		float i = inflate;
		// back of the hand / palm
		FxDraw.texBox(vc, pose, -0.5F - i, -0.42F - i, -0.45F - i, 0.5F + i, 0.42F + i, 0.25F + i, argb);
		// four curled fingers, knuckles leading
		for (int f = 0; f < 4; f++) {
			float x0 = -0.5F + f * 0.25F + 0.01F;
			float x1 = x0 + 0.23F;
			FxDraw.texBox(vc, pose, x0 - i, 0.05F - i, 0.22F - i, x1 + i, 0.42F + i, 0.6F + i, argb);
			FxDraw.texBox(vc, pose, x0 - i, -0.3F - i, 0.3F - i, x1 + i, 0.06F + i, 0.6F + i, argb);
		}
		// thumb folded across the front
		FxDraw.texBox(vc, pose, -0.52F - i, -0.42F - i, 0.12F - i, 0.05F + i, -0.2F + i, 0.5F + i, argb);
		// wrist
		FxDraw.texBox(vc, pose, -0.36F - i, -0.32F - i, -0.95F - i, 0.36F + i, 0.32F + i, -0.42F + i, argb);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float s = state.size;
		float t = state.progress;
		float pulse = 0.85F + 0.15F * Mth.sin(t * 1.4F);
		float fadeIn = Mth.clamp(t / 3.0F, 0.0F, 1.0F);
		poseStack.pushPose();
		poseStack.mulPose(Axis.YP.rotationDegrees(-state.yaw));
		poseStack.mulPose(Axis.XP.rotationDegrees(state.pitch));
		poseStack.mulPose(Axis.ZP.rotationDegrees(Mth.sin(t * 0.3F) * 4.0F));
		poseStack.scale(s, s, s);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FIST), (pose, vc) -> {
			fist(vc, pose, 0.0F, FxDraw.argb(0xBFF6FF, 0.85F * fadeIn));
			fist(vc, pose, 0.06F * pulse, FxDraw.argb(0x2FD6FF, 0.35F * fadeIn));
			fist(vc, pose, 0.16F * pulse, FxDraw.argb(0x1A6BFF, 0.15F * fadeIn));
		});
		poseStack.popPose();
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) ->
			FxDraw.billboard(vc, pose, s * 1.6F * pulse, FxDraw.argb(0x5FF4FF, 0.35F * fadeIn))
		);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
