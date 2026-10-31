package com.jjkshowdown.client.render.entity;

import com.jjkshowdown.entity.FlyingDebrisEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;

/** Tumbling chunk of terrain. */
public class DebrisRenderer extends EntityRenderer<FlyingDebrisEntity, DebrisRenderer.State> {
	public static class State extends EntityRenderState {
		BlockState block = Blocks.STONE.defaultBlockState();
		float sx, sy, sz;
	}

	public DebrisRenderer(EntityRendererProvider.Context ctx) {
		super(ctx);
		this.shadowRadius = 0.3f;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(FlyingDebrisEntity e, State s, float partial) {
		super.extractRenderState(e, s, partial);
		s.block = e.blockState();
		s.sx = e.spinX;
		s.sy = e.spinY;
		s.sz = e.spinZ;
	}

	@Override
	public void submit(State s, PoseStack ps, SubmitNodeCollector out, CameraRenderState cam) {
		if (s.block.getRenderShape() != RenderShape.MODEL) return;
		ps.pushPose();
		float t = s.ageInTicks;
		ps.translate(0, 0.4, 0);
		ps.mulPose(Axis.XP.rotationDegrees(t * s.sx));
		ps.mulPose(Axis.YP.rotationDegrees(t * s.sy));
		ps.mulPose(Axis.ZP.rotationDegrees(t * s.sz));
		ps.scale(0.8f, 0.8f, 0.8f);
		ps.translate(-0.5, -0.5, -0.5);
		out.submitBlock(ps, s.block, s.lightCoords, OverlayTexture.NO_OVERLAY, s.outlineColor);
		ps.popPose();
		super.submit(s, ps, out, cam);
	}
}
