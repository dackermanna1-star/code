package dev.juukulius.client.render.player;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.ARGB;

/** Renders the uniform pieces of {@link JuliusOutfitModel}, fading them in and out during the transformation. */
public class JuliusOutfitLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final JuliusOutfitModel model;

	public JuliusOutfitLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent, JuliusOutfitModel model) {
		super(parent);
		this.model = model;
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, AvatarRenderState state, float yRot, float xRot) {
		JuliusRenderInfo info = state.getData(JuliusRenderInfo.INFO);
		if (info == null || info.outfit <= 0.001F || state.isInvisible) {
			return;
		}

		int tint = ARGB.colorFromFloat(info.outfit, 1.0F, 1.0F, 1.0F);
		collector.submitModel(this.model, state, poseStack, RenderTypes.entityTranslucent(JuliusTextures.OUTFIT), light,
			LivingEntityRenderer.getOverlayCoords(state, 0.0F), tint, null, state.outlineColor, null);
	}
}
