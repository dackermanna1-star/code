package net.abyssaldescent.client.render;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.entity.merchant.DelverMerchant;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.resources.Identifier;

public class DelverMerchantRenderer extends HumanoidMobRenderer<DelverMerchant, HumanoidRenderState, HumanoidModel<HumanoidRenderState>> {
	private static final Identifier TEXTURE = AbyssalDescent.id("textures/entity/delver_merchant.png");

	public DelverMerchantRenderer(EntityRendererProvider.Context context) {
		super(context, new HumanoidModel<>(context.bakeLayer(ModModelLayers.DELVER_MERCHANT)), 0.5F);
	}

	@Override
	public Identifier getTextureLocation(HumanoidRenderState state) {
		return TEXTURE;
	}

	@Override
	public HumanoidRenderState createRenderState() {
		return new HumanoidRenderState();
	}
}
