package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.events.blackhole.BlackHoleEntity;
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
import net.minecraft.util.math.RotationAxis;

/**
 * Black hole: a camera-facing black disc (looks like a sphere from every angle), a glowing tilted accretion disk
 * spinning around it, and a faint purple halo. (PLACEHOLDER textures.)
 */
public class BlackHoleRenderer extends EntityRenderer<BlackHoleEntity, BlackHoleRenderer.State> {
	private static final Identifier CORE = ChaosUnleashed.id("textures/entity/black_hole/core.png");
	private static final Identifier DISK = ChaosUnleashed.id("textures/entity/black_hole/accretion_disk.png");
	private static final Identifier HALO = ChaosUnleashed.id("textures/entity/black_hole/halo.png");
	private static final RenderLayer CORE_LAYER = RenderLayers.entityTranslucent(CORE);
	private static final RenderLayer DISK_LAYER = RenderLayers.eyes(DISK);
	private static final RenderLayer HALO_LAYER = RenderLayers.eyes(HALO);
	private static final int FULL_BRIGHT = 0xF000F0;

	public static class State extends EntityRenderState {
		public float radius;
		public float time;
	}

	public BlackHoleRenderer(EntityRendererFactory.Context context) {
		super(context);
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(BlackHoleEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.radius = entity.getRadius();
		state.time = entity.age + tickProgress;
	}

	@Override
	protected boolean canBeCulled(BlackHoleEntity entity) {
		return false;
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		float r = state.radius;
		if (r > 0.02F) {
			// Halo
			matrices.push();
			matrices.multiply(cameraState.orientation);
			float pulse = 1.0F + 0.06F * MathHelper.sin(state.time * 0.2F);
			matrices.scale(r * 5.0F * pulse, r * 5.0F * pulse, 1.0F);
			queue.submitCustom(matrices, HALO_LAYER, (entry, consumer) -> quad(entry, consumer, 0xA0B070FF));
			matrices.pop();

			// Accretion disk: tilted, spinning, visible from above and below.
			matrices.push();
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(70.0F));
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(state.time * 4.0F));
			matrices.scale(r * 4.2F, r * 4.2F, 1.0F);
			queue.submitCustom(matrices, DISK_LAYER, (entry, consumer) -> {
				quad(entry, consumer, 0xFFFFFFFF);
				quadBack(entry, consumer, 0xFFFFFFFF);
			});
			matrices.pop();

			// Event horizon
			matrices.push();
			matrices.multiply(cameraState.orientation);
			matrices.scale(r * 2.2F, r * 2.2F, 1.0F);
			queue.submitCustom(matrices, CORE_LAYER, (entry, consumer) -> quad(entry, consumer, 0xFFFFFFFF));
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

	private static void quadBack(MatrixStack.Entry entry, VertexConsumer consumer, int color) {
		vertex(entry, consumer, -0.5F, 0.5F, 0.0F, 0.0F, color);
		vertex(entry, consumer, 0.5F, 0.5F, 1.0F, 0.0F, color);
		vertex(entry, consumer, 0.5F, -0.5F, 1.0F, 1.0F, color);
		vertex(entry, consumer, -0.5F, -0.5F, 0.0F, 1.0F, color);
	}

	private static void vertex(MatrixStack.Entry entry, VertexConsumer consumer, float x, float y, float u, float v, int color) {
		consumer.vertex(entry, x, y, 0.0F).color(color).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(FULL_BRIGHT).normal(entry, 0.0F, 1.0F, 0.0F);
	}
}
