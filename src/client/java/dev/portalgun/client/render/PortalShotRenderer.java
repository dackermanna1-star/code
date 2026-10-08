package dev.portalgun.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.portalgun.PortalGunMod;
import dev.portalgun.entity.PortalShotEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

/** A bright green energy blob facing the camera. */
public class PortalShotRenderer extends EntityRenderer<PortalShotEntity, PortalShotRenderer.State> {
	private static final RenderType GLOW = RenderTypes.eyes(PortalGunMod.id("textures/entity/portal/glow.png"));
	private static final RenderType CORE = RenderTypes.entityTranslucentEmissive(PortalGunMod.id("textures/entity/portal/core.png"));

	public PortalShotRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	public static class State extends EntityRenderState {
		public float age;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(PortalShotEntity entity, State state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.age = entity.tickCount + partialTick;
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.15F, 0.0F);
		poseStack.mulPose(camera.orientation);
		poseStack.mulPose(Axis.ZP.rotationDegrees(state.age * 25.0F));
		quad(collector, poseStack, GLOW, 0.7F, 0xFF9CF05A);
		quad(collector, poseStack, CORE, 0.32F, 0xFFFFFFFF);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	private static void quad(SubmitNodeCollector collector, PoseStack poseStack, RenderType type, float r, int argb) {
		collector.submitCustomGeometry(poseStack, type, (pose, vc) -> {
			v(vc, pose, -r, -r, 0, 1, argb);
			v(vc, pose, r, -r, 1, 1, argb);
			v(vc, pose, r, r, 1, 0, argb);
			v(vc, pose, -r, r, 0, 0, argb);
		});
	}

	private static void v(VertexConsumer vc, PoseStack.Pose pose, float x, float y, float u, float v, int argb) {
		vc.addVertex(pose, x, y, 0.0F).setColor(argb).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(0xF000F0).setNormal(pose, 0, 1, 0);
	}
}
