package dev.portalgun.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.portalgun.PortalGunMod;
import dev.portalgun.entity.PortalEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/**
 * Draws the portal as stacked, independently spinning discs (core swirl, faster spiral arms,
 * counter-rotating foamy rim, additive glow) so it churns like the real thing.
 */
public class PortalRenderer extends EntityRenderer<PortalEntity, PortalRenderer.State> {
	private static final Identifier CORE = PortalGunMod.id("textures/entity/portal/core.png");
	private static final Identifier SWIRL = PortalGunMod.id("textures/entity/portal/swirl.png");
	private static final Identifier RIM = PortalGunMod.id("textures/entity/portal/rim.png");
	private static final Identifier GLOW = PortalGunMod.id("textures/entity/portal/glow.png");
	private static final RenderType CORE_TYPE = RenderTypes.entityTranslucentEmissive(CORE);
	private static final RenderType SWIRL_TYPE = RenderTypes.entityTranslucentEmissive(SWIRL);
	private static final RenderType RIM_TYPE = RenderTypes.entityTranslucentEmissive(RIM);
	private static final RenderType GLOW_TYPE = RenderTypes.eyes(GLOW);
	private static final int SEGMENTS = 40;
	private static final int LIGHT = 0xF000F0;

	public PortalRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.shadowRadius = 0.0F;
	}

	public static class State extends EntityRenderState {
		public Direction facing = Direction.NORTH;
		public float age;
		public float scale;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(PortalEntity portal, State state, float partialTick) {
		super.extractRenderState(portal, state, partialTick);
		state.facing = portal.getFacing();
		state.age = portal.clientAge + partialTick;
		float open = Mth.clamp(state.age / PortalEntity.OPEN_TICKS, 0.0F, 1.0F);
		float scale = easeOutBack(open);
		if (portal.clientCloseAge >= 0) {
			float c = Mth.clamp((portal.clientCloseAge + partialTick) / PortalEntity.CLOSE_TICKS, 0.0F, 1.0F);
			// a little swell, then a quick implosion
			scale *= c < 0.25F ? 1.0F + c * 0.4F : (1.1F) * (1.0F - (c - 0.25F) / 0.75F);
		}
		state.scale = Math.max(0.0F, scale);
	}

	private static float easeOutBack(float t) {
		float c1 = 1.70158F;
		float c3 = c1 + 1;
		float x = t - 1;
		return 1 + c3 * x * x * x + c1 * x * x;
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		if (state.scale <= 0.001F) {
			return;
		}
		poseStack.pushPose();
		switch (state.facing) {
			case UP -> poseStack.mulPose(Axis.XP.rotationDegrees(-90.0F));
			case DOWN -> poseStack.mulPose(Axis.XP.rotationDegrees(90.0F));
			default -> poseStack.mulPose(Axis.YP.rotationDegrees(-state.facing.toYRot()));
		}
		float sx;
		float sy;
		if (state.facing.getAxis() == Direction.Axis.Y) {
			sx = sy = PortalEntity.FLOOR_DIAMETER / 2;
		} else {
			sx = PortalEntity.WIDTH / 2;
			sy = PortalEntity.HEIGHT / 2;
		}
		float s = state.scale;
		float t = state.age;
		float pulse = 1.0F + Mth.sin(t * 0.21F) * 0.025F;
		float wobble = Mth.sin(t * 0.13F) * 0.02F;

		disc(collector, poseStack, GLOW_TYPE, sx * s * 1.45F, sy * s * 1.38F, 0.0F, 0.0F, 0xFF7FDB5A);
		disc(collector, poseStack, CORE_TYPE, sx * s * pulse, sy * s * pulse, -t * 1.6F, 0.001F, 0xFFFFFFFF);
		disc(collector, poseStack, SWIRL_TYPE, sx * s * 0.96F, sy * s * 0.96F, -t * 4.3F, 0.002F, 0xE6FFFFFF);
		disc(collector, poseStack, RIM_TYPE, sx * s * (1.02F + wobble), sy * s * (1.02F - wobble), t * 0.9F, 0.003F, 0xFFFFFFFF);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	/** A double-sided disc made of thin quads; the texture is rotated in UV space so the outline never shears. */
	private static void disc(SubmitNodeCollector collector, PoseStack poseStack, RenderType type, float rx, float ry, float rotDeg, float z, int argb) {
		float rot = rotDeg * Mth.DEG_TO_RAD;
		collector.submitCustomGeometry(poseStack, type, (pose, vc) -> {
			for (int i = 0; i < SEGMENTS; i++) {
				float a0 = (float) (Math.PI * 2 * i / SEGMENTS);
				float a1 = (float) (Math.PI * 2 * (i + 1) / SEGMENTS);
				float x0 = Mth.cos(a0) * rx;
				float y0 = Mth.sin(a0) * ry;
				float x1 = Mth.cos(a1) * rx;
				float y1 = Mth.sin(a1) * ry;
				float u0 = 0.5F + 0.4995F * Mth.cos(a0 + rot);
				float v0 = 0.5F - 0.4995F * Mth.sin(a0 + rot);
				float u1 = 0.5F + 0.4995F * Mth.cos(a1 + rot);
				float v1 = 0.5F - 0.4995F * Mth.sin(a1 + rot);
				// front
				vertex(vc, pose, 0, 0, z, 0.5F, 0.5F, argb, 1);
				vertex(vc, pose, x0, y0, z, u0, v0, argb, 1);
				vertex(vc, pose, x1, y1, z, u1, v1, argb, 1);
				vertex(vc, pose, 0, 0, z, 0.5F, 0.5F, argb, 1);
				// back (mirrored winding so it shows from behind too)
				vertex(vc, pose, 0, 0, -z, 0.5F, 0.5F, argb, -1);
				vertex(vc, pose, x1, y1, -z, u1, v1, argb, -1);
				vertex(vc, pose, x0, y0, -z, u0, v0, argb, -1);
				vertex(vc, pose, 0, 0, -z, 0.5F, 0.5F, argb, -1);
			}
		});
	}

	private static void vertex(VertexConsumer vc, PoseStack.Pose pose, float x, float y, float z, float u, float v, int argb, int normal) {
		vc.addVertex(pose, x, y, z)
			.setColor(argb)
			.setUv(u, v)
			.setOverlay(OverlayTexture.NO_OVERLAY)
			.setLight(LIGHT)
			.setNormal(pose, 0.0F, 0.0F, normal);
	}

	@Override
	protected int getBlockLightLevel(PortalEntity entity, net.minecraft.core.BlockPos pos) {
		return 15;
	}
}
