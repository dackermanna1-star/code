package dev.juukulius.client.render.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.client.render.player.JuliusModelLayers;
import dev.juukulius.entity.StoneSpikeEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;

/** Iku's spire erupting out of the ground and sinking back. */
public class StoneSpikeRenderer extends EntityRenderer<StoneSpikeEntity, StoneSpikeRenderState> {
	private final StoneSpikeModel model;

	public StoneSpikeRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.model = new StoneSpikeModel(context.bakeLayer(JuliusModelLayers.STONE_SPIKE));
		this.shadowRadius = 0.4F;
	}

	@Override
	public StoneSpikeRenderState createRenderState() {
		return new StoneSpikeRenderState();
	}

	@Override
	public void extractRenderState(StoneSpikeEntity entity, StoneSpikeRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.spin = entity.spin();
		state.extension = entity.extension(partialTick);
	}

	@Override
	public void submit(StoneSpikeRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		if (state.extension > 0.01F) {
			poseStack.pushPose();
			// Rise from below the surface: the hidden part stays under the ground while erupting or sinking.
			poseStack.translate(0.0F, -1.55F * state.size * (1.0F - state.extension), 0.0F);
			poseStack.scale(state.size, state.size, state.size);
			poseStack.scale(-1.0F, -1.0F, 1.0F);
			poseStack.translate(0.0F, -1.501F, 0.0F);
			collector.submitModel(this.model, state, poseStack, this.model.renderType(JuliusTextures.STONE_SPIKE), state.lightCoords, OverlayTexture.NO_OVERLAY,
				state.outlineColor, null);
			poseStack.popPose();
		}

		super.submit(state, poseStack, collector, camera);
	}
}
