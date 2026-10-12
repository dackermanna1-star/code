package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.model.AlienSoldierModel;
import com.chaosunleashed.client.render.ChaosModelLayers;
import com.chaosunleashed.events.alien.AlienSoldierEntity;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.entity.BipedEntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.state.BipedEntityRenderState;
import net.minecraft.util.Identifier;

public class AlienSoldierRenderer extends BipedEntityRenderer<AlienSoldierEntity, BipedEntityRenderState, AlienSoldierModel> {
	private static final Identifier TEXTURE = ChaosUnleashed.id("textures/entity/alien_soldier/alien_soldier.png");
	private static final RenderLayer EYES = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/alien_soldier/alien_soldier_glow.png"));

	public AlienSoldierRenderer(EntityRendererFactory.Context context) {
		super(context, new AlienSoldierModel(context.getPart(ChaosModelLayers.ALIEN_SOLDIER)), 0.5F);
		this.addFeature(new EyesFeatureRenderer<>(this) {
			@Override
			public RenderLayer getEyesTexture() {
				return EYES;
			}
		});
	}

	@Override
	public BipedEntityRenderState createRenderState() {
		return new BipedEntityRenderState();
	}

	@Override
	public Identifier getTexture(BipedEntityRenderState state) {
		return TEXTURE;
	}
}
