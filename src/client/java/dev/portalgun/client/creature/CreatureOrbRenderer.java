package dev.portalgun.client.creature;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.portalgun.PortalGunMod;
import dev.portalgun.creature.CreatureOrb;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;

/** A coloured glowing orb (halo + hot core) facing the camera. */
public class CreatureOrbRenderer extends EntityRenderer<CreatureOrb, CreatureOrbRenderer.State> {
	private static final Identifier GLOW_TEX = PortalGunMod.id("textures/entity/creature/orb_glow.png");
	private static final Identifier CORE_TEX = PortalGunMod.id("textures/entity/creature/orb_core.png");
	private static final RenderType GLOW = RenderTypes.eyes(GLOW_TEX);
	private static final RenderType CORE = RenderTypes.entityTranslucentEmissive(CORE_TEX);

	public CreatureOrbRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	public static class State extends EntityRenderState {
		public float age;
		public int color;
		public float size;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(CreatureOrb orb, State state, float partialTick) {
		super.extractRenderState(orb, state, partialTick);
		state.age = orb.tickCount + partialTick;
		state.color = orb.getColor();
		state.size = orb.getSize();
	}

	@Override
	protected int getBlockLightLevel(CreatureOrb entity, BlockPos pos) {
		return 15;
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.2F, 0.0F);
		poseStack.mulPose(camera.orientation);
		poseStack.mulPose(Axis.ZP.rotationDegrees(state.age * 20.0F));
		float pulse = 1.0F + 0.12F * (float) Math.sin(state.age * 0.8F);
		int rgb = state.color & 0xFFFFFF;
		quad(collector, poseStack, GLOW, state.size * 2.2F * pulse, 0xE0000000 | rgb);
		int core = 0xFF000000 | mixWhite(rgb, 0.6F);
		quad(collector, poseStack, CORE, state.size * 0.9F, core);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	private static int mixWhite(int rgb, float t) {
		int r = (rgb >> 16) & 255;
		int g = (rgb >> 8) & 255;
		int b = rgb & 255;
		r = (int) (r + (255 - r) * t);
		g = (int) (g + (255 - g) * t);
		b = (int) (b + (255 - b) * t);
		return (r << 16) | (g << 8) | b;
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
