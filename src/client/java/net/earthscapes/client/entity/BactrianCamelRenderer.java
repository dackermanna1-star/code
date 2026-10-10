package net.earthscapes.client.entity;

import net.earthscapes.Earthscapes;
import net.earthscapes.client.model.EsMobLayers;
import net.earthscapes.entity.BactrianCamel;
import net.minecraft.client.model.animal.camel.CamelModel;
import net.minecraft.client.model.animal.camel.CamelSaddleModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.entity.AgeableMobRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.layers.SimpleEquipmentLayer;
import net.minecraft.client.renderer.entity.state.CamelRenderState;
import net.minecraft.client.resources.model.EquipmentClientInfo;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EquipmentSlot;

/** The Bactrian camel: the vanilla camel model and animations on its own two-humped geometry. */
public class BactrianCamelRenderer extends AgeableMobRenderer<BactrianCamel, CamelRenderState, CamelModel> {
	private static final Identifier TEXTURE = Earthscapes.id("textures/entity/bactrian_camel.png");

	public BactrianCamelRenderer(EntityRendererProvider.Context context) {
		super(context, new CamelModel(context.bakeLayer(EsMobLayers.BACTRIAN_CAMEL)), new CamelModel(context.bakeLayer(EsMobLayers.BACTRIAN_CAMEL_BABY)), 0.7F);
		this.addLayer(new SimpleEquipmentLayer<>(this, context.getEquipmentRenderer(), EquipmentClientInfo.LayerType.CAMEL_SADDLE, state -> state.saddle,
			new CamelSaddleModel(context.bakeLayer(ModelLayers.CAMEL_SADDLE)), new CamelSaddleModel(context.bakeLayer(ModelLayers.CAMEL_BABY_SADDLE))));
	}

	@Override
	public Identifier getTextureLocation(CamelRenderState state) {
		return TEXTURE;
	}

	@Override
	public CamelRenderState createRenderState() {
		return new CamelRenderState();
	}

	@Override
	public void extractRenderState(BactrianCamel camel, CamelRenderState state, float partialTick) {
		super.extractRenderState(camel, state, partialTick);
		state.saddle = camel.getItemBySlot(EquipmentSlot.SADDLE).copy();
		state.isRidden = camel.isVehicle();
		state.jumpCooldown = Math.max(camel.getJumpCooldown() - partialTick, 0.0F);
		state.sitAnimationState.copyFrom(camel.sitAnimationState);
		state.sitPoseAnimationState.copyFrom(camel.sitPoseAnimationState);
		state.sitUpAnimationState.copyFrom(camel.sitUpAnimationState);
		state.idleAnimationState.copyFrom(camel.idleAnimationState);
		state.dashAnimationState.copyFrom(camel.dashAnimationState);
	}
}
