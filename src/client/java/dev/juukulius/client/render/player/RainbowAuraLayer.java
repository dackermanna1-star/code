package dev.juukulius.client.render.player;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.ARGB;

/**
 * Al Cranvel: "to the other party, Julius appeared as if he was swallowed alive by a rainbow". A slightly inflated copy of
 * the body drawn with a scrolling, additive rainbow swirl; it follows every animated pose. Also flashes briefly at the
 * height of the transformation.
 */
public class RainbowAuraLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final PlayerModel model;

	public RainbowAuraLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent, PlayerModel model) {
		super(parent);
		this.model = model;
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, AvatarRenderState state, float yRot, float xRot) {
		JuliusRenderInfo info = state.getData(JuliusRenderInfo.INFO);
		if (info == null || info.aura <= 0.01F) {
			return;
		}

		float time = state.ageInTicks;
		float strength = Math.min(1.0F, info.aura);
		int tint = ARGB.colorFromFloat(1.0F, 0.55F * strength, 0.55F * strength, 0.55F * strength);
		collector.order(1).submitModel(this.model, state, poseStack,
			RenderTypes.energySwirl(JuliusTextures.RAINBOW_SWIRL, time * 0.006F % 1.0F, time * 0.012F % 1.0F),
			light, OverlayTexture.NO_OVERLAY, tint, null, state.outlineColor, null);
	}
}
