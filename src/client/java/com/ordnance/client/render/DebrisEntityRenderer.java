package com.ordnance.client.render;

import com.ordnance.entity.DebrisEntity;
import net.minecraft.block.BlockRenderType;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.state.EntityRenderState;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/** Renders flying debris as a scaled, tumbling copy of the block it came from. */
public class DebrisEntityRenderer extends EntityRenderer<DebrisEntity, DebrisEntityRenderer.State> {
	public DebrisEntityRenderer(EntityRendererFactory.Context context) {
		super(context);
		this.shadowRadius = 0.25F;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(DebrisEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.blockState = entity.getBlockState();
		state.scale = entity.getScale();
		state.spinX = MathHelper.lerp(tickProgress, entity.lastSpinX, entity.spinX);
		state.spinY = MathHelper.lerp(tickProgress, entity.lastSpinY, entity.spinY);
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		if (state.blockState.getRenderType() == BlockRenderType.MODEL) {
			float s = state.scale;
			matrices.push();
			matrices.translate(0.0F, s * 0.5F, 0.0F);
			matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(state.spinY));
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(state.spinX));
			matrices.scale(s, s, s);
			matrices.translate(-0.5F, -0.5F, -0.5F);
			queue.submitBlock(matrices, state.blockState, state.light, OverlayTexture.DEFAULT_UV, state.outlineColor);
			matrices.pop();
		}

		super.render(state, matrices, queue, cameraState);
	}

	public static class State extends EntityRenderState {
		public BlockState blockState = Blocks.STONE.getDefaultState();
		public float scale = 0.5F;
		public float spinX;
		public float spinY;
	}
}
