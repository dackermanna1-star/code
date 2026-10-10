package net.earthscapes.client.entity;

import net.earthscapes.Earthscapes;
import net.earthscapes.entity.WildHorse;
import net.minecraft.client.model.animal.equine.EquineSaddleModel;
import net.minecraft.client.model.animal.equine.HorseModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.entity.AbstractHorseRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.layers.SimpleEquipmentLayer;
import net.minecraft.client.renderer.entity.state.EquineRenderState;
import net.minecraft.client.resources.model.EquipmentClientInfo;
import net.minecraft.resources.Identifier;

/** Zebra and Przewalski's horse: the vanilla horse model and animations on their own geometry and coats. */
public class WildHorseRenderer extends AbstractHorseRenderer<WildHorse, EquineRenderState, HorseModel> {
	private final Identifier texture;

	public WildHorseRenderer(EntityRendererProvider.Context context, ModelLayerLocation adult, ModelLayerLocation baby, String texture) {
		super(context, new HorseModel(context.bakeLayer(adult)), new HorseModel(context.bakeLayer(baby)));
		this.texture = Earthscapes.id("textures/entity/" + texture + ".png");
		this.addLayer(new SimpleEquipmentLayer<>(this, context.getEquipmentRenderer(), EquipmentClientInfo.LayerType.HORSE_SADDLE, state -> state.saddle,
			new EquineSaddleModel(context.bakeLayer(ModelLayers.HORSE_SADDLE)), new EquineSaddleModel(context.bakeLayer(ModelLayers.HORSE_BABY_SADDLE)), 2));
	}

	@Override
	public Identifier getTextureLocation(EquineRenderState state) {
		return this.texture;
	}

	@Override
	public EquineRenderState createRenderState() {
		return new EquineRenderState();
	}
}
