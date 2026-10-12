package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.model.UfoModel;
import com.chaosunleashed.client.render.ChaosModelLayers;
import com.chaosunleashed.events.alien.UfoEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.state.LivingEntityRenderState;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/** Renders the UFO (scaled up 2x), its glowing lights and the green tractor beam. */
public class UfoRenderer extends MobEntityRenderer<UfoEntity, UfoRenderer.State, UfoModel> {
	private static final Identifier TEXTURE = ChaosUnleashed.id("textures/entity/ufo/ufo.png");
	private static final RenderLayer GLOW = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/ufo/ufo_glow.png"));
	private static final RenderLayer BEAM = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/ufo/beam.png"));
	private static final int FULL_BRIGHT = 0xF000F0;

	public static class State extends LivingEntityRenderState {
		public boolean beaming;
		public float beamLength;
		public boolean crashing;
	}

	public UfoRenderer(EntityRendererFactory.Context context) {
		super(context, new UfoModel(context.getPart(ChaosModelLayers.UFO)), 2.0F);
		this.addFeature(new EyesFeatureRenderer<>(this) {
			@Override
			public RenderLayer getEyesTexture() {
				return GLOW;
			}
		});
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(UfoEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		state.beaming = entity.isBeaming();
		state.beamLength = entity.getBeamLength();
		state.crashing = entity.isCrashing();
	}

	@Override
	protected boolean canBeCulled(UfoEntity entity) {
		return false;
	}

	@Override
	protected void scale(State state, MatrixStack matrices) {
		matrices.scale(2.0F, 2.0F, 2.0F);
	}

	@Override
	protected void setupTransforms(State state, MatrixStack matrices, float bodyYaw, float baseHeight) {
		super.setupTransforms(state, matrices, bodyYaw, baseHeight);
		if (state.crashing) {
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(35.0F));
		} else {
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(MathHelper.sin(state.age * 0.05F) * 4.0F));
		}
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		if (state.beaming && state.beamLength > 0.5F && !state.crashing) {
			float length = state.beamLength;
			matrices.push();
			matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(state.age * 3.0F));
			queue.submitCustom(matrices, BEAM, (entry, consumer) -> beam(entry, consumer, length, state.age));
			matrices.pop();
		}
		super.render(state, matrices, queue, cameraState);
	}

	/** A tapered, double-sided square tube of light from the saucer down to the ground. */
	private static void beam(MatrixStack.Entry entry, VertexConsumer consumer, float length, float age) {
		float top = 1.0F;
		float bottom = 2.6F;
		int topColor = 0xC060FF90;
		int bottomColor = 0x2030FF60;
		float scroll = age * 0.03F;
		float[][] corners = {{-1, -1}, {1, -1}, {1, 1}, {-1, 1}};
		for (int i = 0; i < 4; i++) {
			float[] a = corners[i];
			float[] b = corners[(i + 1) % 4];
			// outward-facing
			vertex(entry, consumer, a[0] * top, 0.0F, a[1] * top, 0.0F, scroll, topColor);
			vertex(entry, consumer, a[0] * bottom, -length, a[1] * bottom, 0.0F, scroll + length * 0.1F, bottomColor);
			vertex(entry, consumer, b[0] * bottom, -length, b[1] * bottom, 1.0F, scroll + length * 0.1F, bottomColor);
			vertex(entry, consumer, b[0] * top, 0.0F, b[1] * top, 1.0F, scroll, topColor);
			// inward-facing
			vertex(entry, consumer, b[0] * top, 0.0F, b[1] * top, 1.0F, scroll, topColor);
			vertex(entry, consumer, b[0] * bottom, -length, b[1] * bottom, 1.0F, scroll + length * 0.1F, bottomColor);
			vertex(entry, consumer, a[0] * bottom, -length, a[1] * bottom, 0.0F, scroll + length * 0.1F, bottomColor);
			vertex(entry, consumer, a[0] * top, 0.0F, a[1] * top, 0.0F, scroll, topColor);
		}
	}

	private static void vertex(MatrixStack.Entry entry, VertexConsumer consumer, float x, float y, float z, float u, float v, int color) {
		consumer.vertex(entry, x, y, z).color(color).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(FULL_BRIGHT).normal(entry, 0.0F, 1.0F, 0.0F);
	}

	@Override
	public Identifier getTexture(State state) {
		return TEXTURE;
	}

	@Override
	protected boolean hasLabel(UfoEntity entity, double distance) {
		return false;
	}
}
