package net.earthscapes.client.entity;

import net.earthscapes.Earthscapes;
import net.earthscapes.client.model.EsMobLayers;
import net.earthscapes.entity.RiverDolphin;
import net.minecraft.client.model.animal.dolphin.DolphinModel;
import net.minecraft.client.renderer.entity.AgeableMobRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.layers.DolphinCarryingItemLayer;
import net.minecraft.client.renderer.entity.state.DolphinRenderState;
import net.minecraft.client.renderer.entity.state.HoldingEntityRenderState;
import net.minecraft.resources.Identifier;

/** The Amazon river dolphin: the vanilla dolphin model and animations on its own long-beaked geometry. */
public class RiverDolphinRenderer extends AgeableMobRenderer<RiverDolphin, DolphinRenderState, DolphinModel> {
	private static final Identifier TEXTURE = Earthscapes.id("textures/entity/river_dolphin.png");

	public RiverDolphinRenderer(EntityRendererProvider.Context context) {
		super(context, new DolphinModel(context.bakeLayer(EsMobLayers.RIVER_DOLPHIN)), new DolphinModel(context.bakeLayer(EsMobLayers.RIVER_DOLPHIN_BABY)),
			0.6F);
		this.addLayer(new DolphinCarryingItemLayer(this));
	}

	@Override
	public Identifier getTextureLocation(DolphinRenderState state) {
		return TEXTURE;
	}

	@Override
	public DolphinRenderState createRenderState() {
		return new DolphinRenderState();
	}

	@Override
	public void extractRenderState(RiverDolphin dolphin, DolphinRenderState state, float partialTick) {
		super.extractRenderState(dolphin, state, partialTick);
		HoldingEntityRenderState.extractHoldingEntityRenderState(dolphin, state, this.itemModelResolver);
		state.isMoving = dolphin.getDeltaMovement().horizontalDistanceSqr() > 1.0E-7;
	}
}
