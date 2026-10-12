package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.events.rift.RiftEntity;
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

/** Draws the Dimension Rift as a huge glowing crack that always faces the viewer. (PLACEHOLDER textures.) */
public class RiftRenderer extends EntityRenderer<RiftEntity, RiftRenderer.State> {
	private static final Identifier VOID = ChaosUnleashed.id("textures/entity/rift/rift_void.png");
	private static final Identifier GLOW = ChaosUnleashed.id("textures/entity/rift/rift_glow.png");
	private static final RenderLayer VOID_LAYER = RenderLayers.entityTranslucent(VOID);
	private static final RenderLayer GLOW_LAYER = RenderLayers.eyes(GLOW);
	private static final int FULL_BRIGHT = 0xF000F0;

	public static class State extends EntityRenderState {
		public float openness;
		public boolean end;
		public float time;
	}

	public RiftRenderer(EntityRendererFactory.Context context) {
		super(context);
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(RiftEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.openness = entity.getOpenness();
		state.end = entity.isEnd();
		state.time = entity.age + tickProgress;
	}

	@Override
	protected boolean canBeCulled(RiftEntity entity) {
		return false;
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		if (state.openness > 0.01F) {
			float flicker = 1.0F + 0.06F * MathHelper.sin(state.time * 0.7F) * MathHelper.sin(state.time * 0.23F);
			float height = 30.0F * (0.35F + 0.65F * state.openness);
			float width = 8.0F * state.openness * flicker;
			int glow = state.end ? 0xFFD070FF : 0xFFFF9040;
			matrices.push();
			matrices.multiply(cameraState.orientation);
			matrices.push();
			matrices.scale(width, height, 1.0F);
			queue.submitCustom(matrices, VOID_LAYER, (entry, consumer) -> quad(entry, consumer, 0xFFFFFFFF));
			queue.submitCustom(matrices, GLOW_LAYER, (entry, consumer) -> quad(entry, consumer, glow));
			matrices.pop();
			matrices.scale(width * 1.8F, height * 1.06F, 1.0F);
			int halo = (glow & 0x00FFFFFF) | ((int) (0x70 * flicker) << 24);
			queue.submitCustom(matrices, GLOW_LAYER, (entry, consumer) -> quad(entry, consumer, halo));
			matrices.pop();
		}
		super.render(state, matrices, queue, cameraState);
	}

	private static void quad(MatrixStack.Entry entry, VertexConsumer consumer, int color) {
		vertex(entry, consumer, -0.5F, -0.5F, 0.0F, 1.0F, color);
		vertex(entry, consumer, 0.5F, -0.5F, 1.0F, 1.0F, color);
		vertex(entry, consumer, 0.5F, 0.5F, 1.0F, 0.0F, color);
		vertex(entry, consumer, -0.5F, 0.5F, 0.0F, 0.0F, color);
	}

	private static void vertex(MatrixStack.Entry entry, VertexConsumer consumer, float x, float y, float u, float v, int color) {
		consumer.vertex(entry, x, y, 0.0F).color(color).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(FULL_BRIGHT).normal(entry, 0.0F, 1.0F, 0.0F);
	}
}
