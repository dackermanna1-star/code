package net.abyssaldescent.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.entity.projectile.SoulBoltEntity;
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
import net.minecraft.util.Mth;

/** Fullbright billboard orb that gently pulses. */
public class SoulBoltRenderer extends EntityRenderer<SoulBoltEntity, EntityRenderState> {
	private static final Identifier TEXTURE = AbyssalDescent.id("textures/entity/soul_bolt.png");
	private static final RenderType TYPE = RenderTypes.entityTranslucentEmissive(TEXTURE);

	public SoulBoltRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	protected int getBlockLightLevel(SoulBoltEntity entity, BlockPos pos) {
		return 15;
	}

	@Override
	public void submit(EntityRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		poseStack.pushPose();
		float pulse = 0.85F + 0.15F * Mth.sin(state.ageInTicks * 0.8F);
		poseStack.translate(0.0F, 0.175F, 0.0F);
		poseStack.scale(0.9F * pulse, 0.9F * pulse, 0.9F * pulse);
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, TYPE, (pose, consumer) -> {
			vertex(consumer, pose, state.lightCoords, -0.5F, -0.5F, 0, 1);
			vertex(consumer, pose, state.lightCoords, 0.5F, -0.5F, 1, 1);
			vertex(consumer, pose, state.lightCoords, 0.5F, 0.5F, 1, 0);
			vertex(consumer, pose, state.lightCoords, -0.5F, 0.5F, 0, 0);
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	private static void vertex(VertexConsumer consumer, PoseStack.Pose pose, int light, float x, float y, int u, int v) {
		consumer.addVertex(pose, x, y, 0.0F).setColor(-1).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light)
			.setNormal(pose, 0.0F, 1.0F, 0.0F);
	}

	@Override
	public EntityRenderState createRenderState() {
		return new EntityRenderState();
	}
}
