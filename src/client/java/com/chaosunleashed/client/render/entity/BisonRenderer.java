package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.model.BisonModel;
import com.chaosunleashed.client.render.ChaosModelLayers;
import com.chaosunleashed.events.stampede.BisonEntity;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.state.LivingEntityRenderState;
import net.minecraft.util.Identifier;

public class BisonRenderer extends MobEntityRenderer<BisonEntity, LivingEntityRenderState, BisonModel> {
	private static final Identifier TEXTURE = ChaosUnleashed.id("textures/entity/bison/bison.png");

	public BisonRenderer(EntityRendererFactory.Context context) {
		super(context, new BisonModel(context.getPart(ChaosModelLayers.BISON)), 0.8F);
	}

	@Override
	public LivingEntityRenderState createRenderState() {
		return new LivingEntityRenderState();
	}

	@Override
	public Identifier getTexture(LivingEntityRenderState state) {
		return TEXTURE;
	}
}
