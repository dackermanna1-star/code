package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.RiftSlashEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;

/** A crescent of severed space: a curved ribbon of white light with violet edges. */
public class RiftSlashRenderer extends EntityRenderer<RiftSlashEntity, GfRenderState> {
	public RiftSlashRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(RiftSlashEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(RiftSlashEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.yaw = entity.getYRot(partialTick);
		state.pitch = entity.getXRot(partialTick);
		state.progress = Mth.clamp((entity.age() + partialTick) / 24.0F, 0.0F, 1.0F);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float width = state.size;
		float fade = 1.0F - state.progress * state.progress;
		poseStack.pushPose();
		poseStack.mulPose(Axis.YP.rotationDegrees(-state.yaw));
		poseStack.mulPose(Axis.XP.rotationDegrees(-state.pitch));
		int segments = 24;
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			for (int layer = 0; layer < 3; layer++) {
				float thickness = new float[]{0.18F, 0.5F, 1.1F}[layer];
				int color = new int[]{0xFFFFFF, 0xD9C8FF, 0x7A4DFF}[layer];
				float alpha = new float[]{1.0F, 0.6F, 0.25F}[layer] * fade;
				for (int i = 0; i < segments; i++) {
					float s0 = (float) i / segments * 2.0F - 1.0F;
					float s1 = (float) (i + 1) / segments * 2.0F - 1.0F;
					// crescent: the middle leads, the tips trail behind and taper
					float x0 = s0 * width * 0.5F;
					float x1 = s1 * width * 0.5F;
					float z0 = (1.0F - s0 * s0) * 1.4F;
					float z1 = (1.0F - s1 * s1) * 1.4F;
					float h0 = thickness * (1.0F - Math.abs(s0) * 0.85F);
					float h1 = thickness * (1.0F - Math.abs(s1) * 0.85F);
					int c0 = FxDraw.argb(color, alpha * (1.0F - Math.abs(s0) * 0.5F));
					int c1 = FxDraw.argb(color, alpha * (1.0F - Math.abs(s1) * 0.5F));
					FxDraw.cv(vc, pose, x0, -h0, z0, c0);
					FxDraw.cv(vc, pose, x1, -h1, z1, c1);
					FxDraw.cv(vc, pose, x1, h1, z1, c1);
					FxDraw.cv(vc, pose, x0, h0, z0, c0);
					// a flat sheet so the slash also reads from above
					FxDraw.cv(vc, pose, x0, 0, z0 - h0, c0);
					FxDraw.cv(vc, pose, x1, 0, z1 - h1, c1);
					FxDraw.cv(vc, pose, x1, 0, z1 + h1 * 0.3F, c1);
					FxDraw.cv(vc, pose, x0, 0, z0 + h0 * 0.3F, c0);
				}
			}
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
