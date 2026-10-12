package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.events.kaiju.KaijuWeakPointEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.state.EntityRenderState;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;

/** A pulsing glowing orb that marks each Kaiju weak point. */
public class KaijuWeakPointRenderer extends EntityRenderer<KaijuWeakPointEntity, KaijuWeakPointRenderer.State> {
	private static final RenderLayer LAYER = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/kaiju/weak_point.png"));

	public static class State extends EntityRenderState {
		public float size;
		public float time;
	}

	public KaijuWeakPointRenderer(EntityRendererFactory.Context context) {
		super(context);
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(KaijuWeakPointEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.size = entity.getSize();
		state.time = entity.age + tickProgress;
	}

	@Override
	protected boolean canBeCulled(KaijuWeakPointEntity entity) {
		return false;
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		float pulse = 1.0F + 0.15F * MathHelper.sin(state.time * 0.25F);
		float size = state.size * 1.4F * pulse;
		matrices.push();
		matrices.translate(0.0F, state.size / 2.0F, 0.0F);
		matrices.multiply(cameraState.orientation);
		matrices.scale(size, size, 1.0F);
		queue.submitCustom(matrices, LAYER, (entry, consumer) -> {
			vertex(entry, consumer, -0.5F, -0.5F, 0.0F, 1.0F);
			vertex(entry, consumer, 0.5F, -0.5F, 1.0F, 1.0F);
			vertex(entry, consumer, 0.5F, 0.5F, 1.0F, 0.0F);
			vertex(entry, consumer, -0.5F, 0.5F, 0.0F, 0.0F);
		});
		matrices.pop();
		super.render(state, matrices, queue, cameraState);
	}

	private static void vertex(MatrixStack.Entry entry, VertexConsumer consumer, float x, float y, float u, float v) {
		consumer.vertex(entry, x, y, 0.0F).color(0xFFFFFFFF).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(0xF000F0).normal(entry, 0.0F, 1.0F, 0.0F);
	}
}
