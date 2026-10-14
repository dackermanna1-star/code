package net.abyssaldescent.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.render.state.TelegraphRenderState;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/**
 * Draws attack telegraphs flat on the ground: a crisp outline marks the danger area and an inner fill grows until the
 * moment of impact. Fullbright so it reads in the darkest room.
 */
public class TelegraphRenderer extends EntityRenderer<TelegraphEntity, TelegraphRenderState> {
	private static final RenderType RING = RenderTypes.entityTranslucentEmissive(AbyssalDescent.id("textures/entity/telegraph/ring.png"), false);
	private static final RenderType FILL = RenderTypes.entityTranslucentEmissive(AbyssalDescent.id("textures/entity/telegraph/fill.png"), false);
	private static final RenderType LINE = RenderTypes.entityTranslucentEmissive(AbyssalDescent.id("textures/entity/telegraph/line.png"), false);
	private static final RenderType WHITE = RenderTypes.entityTranslucentEmissive(AbyssalDescent.id("textures/entity/telegraph/white.png"), false);
	private static final int FULLBRIGHT = 0xF000F0;
	private static final float LIFT = 0.03F;

	public TelegraphRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public boolean shouldRender(TelegraphEntity entity, Frustum frustum, double x, double y, double z) {
		return true;
	}

	@Override
	public TelegraphRenderState createRenderState() {
		return new TelegraphRenderState();
	}

	@Override
	public void extractRenderState(TelegraphEntity entity, TelegraphRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.shape = entity.shape();
		state.radius = entity.radius();
		state.width = entity.width();
		state.yaw = entity.getYRot();
		state.color = entity.color();
		state.progress = Mth.clamp((entity.tickCount + partialTick) / Math.max(1.0F, entity.duration()), 0.0F, 1.0F);
	}

	@Override
	public void submit(TelegraphRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		int rgb = state.color & 0xFFFFFF;
		int baseAlpha = state.color >>> 24;
		float fadeIn = Math.min(1.0F, state.progress * 6.0F);
		poseStack.pushPose();
		poseStack.translate(0.0F, LIFT, 0.0F);
		switch (state.shape) {
			case CIRCLE -> {
				float r = state.radius;
				quad(collector, poseStack, RING, -r, -r, r, r, ARGB.color((int) (baseAlpha * fadeIn), rgb), 0, 0, 1, 1);
				float f = r * easeOut(state.progress);
				quad(collector, poseStack, FILL, -f, -f, f, f, ARGB.color((int) (baseAlpha * 0.75F), rgb), 0, 0, 1, 1);
			}
			case ZONE -> {
				float r = state.radius;
				float pulse = 0.55F + 0.25F * Mth.sin(state.ageInTicks * 0.3F);
				quad(collector, poseStack, FILL, -r, -r, r, r, ARGB.color((int) (baseAlpha * pulse), rgb), 0, 0, 1, 1);
				quad(collector, poseStack, RING, -r, -r, r, r, ARGB.color((int) (baseAlpha * 0.8F), rgb), 0, 0, 1, 1);
			}
			case LINE -> {
				poseStack.mulPose(Axis.YP.rotationDegrees(-state.yaw));
				float hw = state.width / 2.0F;
				float len = state.radius;
				float repeat = Math.max(1.0F, len / Math.max(0.5F, state.width));
				quad(collector, poseStack, LINE, -hw, 0, hw, len, ARGB.color((int) (baseAlpha * 0.55F * fadeIn), rgb), 0, 0, 1, repeat);
				float fill = len * easeOut(state.progress);
				quad(collector, poseStack, WHITE, -hw, 0, hw, fill, ARGB.color((int) (baseAlpha * 0.45F), rgb), 0, 0, 1, 1);
				// Bright leading edge of the fill.
				quad(collector, poseStack, WHITE, -hw, Math.max(0, fill - 0.12F), hw, fill, ARGB.color(Math.min(255, (int) (baseAlpha * 1.2F)), rgb), 0, 0, 1,
					1);
			}
			case CONE -> {
				poseStack.mulPose(Axis.YP.rotationDegrees(-state.yaw));
				cone(collector, poseStack, state.radius, state.width, ARGB.color((int) (baseAlpha * 0.35F * fadeIn), rgb), 1.0F);
				cone(collector, poseStack, state.radius * easeOut(state.progress), state.width, ARGB.color((int) (baseAlpha * 0.55F), rgb), 1.0F);
				coneEdge(collector, poseStack, state.radius, state.width, ARGB.color((int) (baseAlpha * fadeIn), rgb));
			}
		}
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	private static float easeOut(float t) {
		return 1.0F - (1.0F - t) * (1.0F - t);
	}

	/** Axis-aligned ground quad (both windings so culling never hides it). */
	private static void quad(SubmitNodeCollector collector, PoseStack poseStack, RenderType type, float x0, float z0, float x1, float z1, int color,
		float u0, float v0, float u1, float v1) {
		collector.submitCustomGeometry(poseStack, type, (pose, c) -> {
			vertex(c, pose, x0, z0, u0, v0, color);
			vertex(c, pose, x0, z1, u0, v1, color);
			vertex(c, pose, x1, z1, u1, v1, color);
			vertex(c, pose, x1, z0, u1, v0, color);
			vertex(c, pose, x1, z0, u1, v0, color);
			vertex(c, pose, x1, z1, u1, v1, color);
			vertex(c, pose, x0, z1, u0, v1, color);
			vertex(c, pose, x0, z0, u0, v0, color);
		});
	}

	private static void cone(SubmitNodeCollector collector, PoseStack poseStack, float radius, float angle, int color, float alphaScale) {
		int segments = 16;
		float half = angle * Mth.DEG_TO_RAD / 2.0F;
		collector.submitCustomGeometry(poseStack, WHITE, (pose, c) -> {
			for (int i = 0; i < segments; i++) {
				float a0 = -half + angle * Mth.DEG_TO_RAD * i / segments;
				float a1 = -half + angle * Mth.DEG_TO_RAD * (i + 1) / segments;
				float x0 = Mth.sin(a0) * radius;
				float z0 = Mth.cos(a0) * radius;
				float x1 = Mth.sin(a1) * radius;
				float z1 = Mth.cos(a1) * radius;
				vertex(c, pose, 0, 0, 0, 0, color);
				vertex(c, pose, x0, z0, 0, 1, color);
				vertex(c, pose, x1, z1, 1, 1, color);
				vertex(c, pose, 0, 0, 1, 0, color);
				vertex(c, pose, 0, 0, 1, 0, color);
				vertex(c, pose, x1, z1, 1, 1, color);
				vertex(c, pose, x0, z0, 0, 1, color);
				vertex(c, pose, 0, 0, 0, 0, color);
			}
		});
	}

	private static void coneEdge(SubmitNodeCollector collector, PoseStack poseStack, float radius, float angle, int color) {
		int segments = 16;
		float half = angle * Mth.DEG_TO_RAD / 2.0F;
		float t = 0.12F;
		collector.submitCustomGeometry(poseStack, WHITE, (pose, c) -> {
			for (int i = 0; i < segments; i++) {
				float a0 = -half + angle * Mth.DEG_TO_RAD * i / segments;
				float a1 = -half + angle * Mth.DEG_TO_RAD * (i + 1) / segments;
				float xo0 = Mth.sin(a0) * radius;
				float zo0 = Mth.cos(a0) * radius;
				float xo1 = Mth.sin(a1) * radius;
				float zo1 = Mth.cos(a1) * radius;
				float xi0 = Mth.sin(a0) * (radius - t);
				float zi0 = Mth.cos(a0) * (radius - t);
				float xi1 = Mth.sin(a1) * (radius - t);
				float zi1 = Mth.cos(a1) * (radius - t);
				vertex(c, pose, xi0, zi0, 0, 0, color);
				vertex(c, pose, xo0, zo0, 0, 1, color);
				vertex(c, pose, xo1, zo1, 1, 1, color);
				vertex(c, pose, xi1, zi1, 1, 0, color);
				vertex(c, pose, xi1, zi1, 1, 0, color);
				vertex(c, pose, xo1, zo1, 1, 1, color);
				vertex(c, pose, xo0, zo0, 0, 1, color);
				vertex(c, pose, xi0, zi0, 0, 0, color);
			}
		});
	}

	private static void vertex(VertexConsumer c, PoseStack.Pose pose, float x, float z, float u, float v, int color) {
		c.addVertex(pose, x, 0.0F, z).setColor(color).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(FULLBRIGHT)
			.setNormal(pose, 0.0F, 1.0F, 0.0F);
	}
}
