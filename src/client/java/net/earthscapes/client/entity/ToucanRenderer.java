package net.earthscapes.client.entity;

import net.earthscapes.Earthscapes;
import net.earthscapes.client.model.EsMobLayers;
import net.earthscapes.entity.Toucan;
import net.minecraft.client.model.animal.parrot.ParrotModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.state.ParrotRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/** The toco toucan: the vanilla parrot model and animations on its own geometry with the huge bill. */
public class ToucanRenderer extends MobRenderer<Toucan, ParrotRenderState, ParrotModel> {
	private static final Identifier TEXTURE = Earthscapes.id("textures/entity/toucan.png");

	public ToucanRenderer(EntityRendererProvider.Context context) {
		super(context, new ParrotModel(context.bakeLayer(EsMobLayers.TOUCAN)), 0.3F);
	}

	@Override
	public Identifier getTextureLocation(ParrotRenderState state) {
		return TEXTURE;
	}

	@Override
	public ParrotRenderState createRenderState() {
		return new ParrotRenderState();
	}

	@Override
	public void extractRenderState(Toucan toucan, ParrotRenderState state, float partialTick) {
		super.extractRenderState(toucan, state, partialTick);
		state.variant = toucan.getVariant();
		float flap = Mth.lerp(partialTick, toucan.oFlap, toucan.flap);
		float flapSpeed = Mth.lerp(partialTick, toucan.oFlapSpeed, toucan.flapSpeed);
		state.flapAngle = (Mth.sin(flap) + 1.0F) * flapSpeed;
		state.pose = ParrotModel.getPose(toucan);
	}
}
