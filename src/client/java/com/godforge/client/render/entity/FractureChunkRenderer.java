package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.FractureChunkEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.level.block.state.BlockState;

/** A floating fragment of shattered terrain, rendered block by block inside a faint dimensional aura. */
public class FractureChunkRenderer extends EntityRenderer<FractureChunkEntity, GfRenderState> {
	public FractureChunkRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.shadowRadius = 1.0F;
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(FractureChunkEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(FractureChunkEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		int[] dims = entity.dims();
		state.dims = dims;
		BlockState[] blocks = new BlockState[dims[0] * dims[1] * dims[2]];
		for (int y = 0; y < dims[1]; y++) {
			for (int z = 0; z < dims[2]; z++) {
				for (int x = 0; x < dims[0]; x++) {
					blocks[(y * dims[2] + z) * dims[0] + x] = entity.blockAt(x, y, z);
				}
			}
		}
		state.blocks = blocks;
		state.extra = entity.spin();
		state.variant = entity.phase();
		state.progress = entity.life() + partialTick;
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		int w = state.dims[0];
		int h = state.dims[1];
		int d = state.dims[2];
		float t = state.progress;
		float angle = t * state.extra * (state.variant == FractureChunkEntity.PHASE_FALL ? 2.5F : 1.0F);
		poseStack.pushPose();
		poseStack.translate(0.0F, h * 0.5F, 0.0F);
		poseStack.mulPose(Axis.YP.rotationDegrees(angle));
		poseStack.mulPose(Axis.ZP.rotationDegrees(Mth.sin(t * 0.03F) * 12.0F));
		poseStack.mulPose(Axis.XP.rotationDegrees(Mth.cos(t * 0.027F) * 9.0F));
		poseStack.translate(-w * 0.5F, -h * 0.5F, -d * 0.5F);
		for (int y = 0; y < h; y++) {
			for (int z = 0; z < d; z++) {
				for (int x = 0; x < w; x++) {
					BlockState block = state.blocks[(y * d + z) * w + x];
					if (block == null || block.isAir()) {
						continue;
					}
					poseStack.pushPose();
					poseStack.translate(x, y, z);
					collector.submitBlock(poseStack, block, state.lightCoords, OverlayTexture.NO_OVERLAY, state.outlineColor);
					poseStack.popPose();
				}
			}
		}
		float pulse = 0.25F + 0.15F * Mth.sin(t * 0.2F);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_SHOCK), (pose, vc) ->
			FxDraw.texBox(vc, pose, -0.06F, -0.06F, -0.06F, w + 0.06F, h + 0.06F, d + 0.06F, FxDraw.argb(0xD04DFF, pulse))
		);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
