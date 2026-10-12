package com.chaosunleashed.client.model;

import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.EntityModelPartNames;
import net.minecraft.client.render.entity.model.QuadrupedEntityModel;
import net.minecraft.client.render.entity.state.LivingEntityRenderState;

/** Bison: a cow-sized quadruped with a big shoulder hump, low-hanging head, horns and a beard. 64x64 texture. */
public class BisonModel extends QuadrupedEntityModel<LivingEntityRenderState> {
	public BisonModel(ModelPart root) {
		super(root);
	}

	public static TexturedModelData getTexturedModelData() {
		ModelData data = new ModelData();
		ModelPartData root = data.getRoot();
		root.addChild(EntityModelPartNames.HEAD, ModelPartBuilder.create()
				.uv(0, 42).cuboid(-4.0F, -2.0F, -8.0F, 8.0F, 9.0F, 8.0F)
				.uv(48, 42).cuboid(-7.0F, -1.0F, -5.0F, 3.0F, 2.0F, 2.0F)
				.uv(48, 42).cuboid(4.0F, -1.0F, -5.0F, 3.0F, 2.0F, 2.0F)
				.uv(48, 46).cuboid(-7.0F, -3.0F, -5.0F, 1.0F, 2.0F, 2.0F)
				.uv(48, 46).cuboid(6.0F, -3.0F, -5.0F, 1.0F, 2.0F, 2.0F)
				.uv(42, 29).cuboid(-2.0F, 7.0F, -7.0F, 4.0F, 3.0F, 2.0F),
			ModelTransform.origin(0.0F, 8.0F, -9.0F));
		root.addChild(EntityModelPartNames.BODY, ModelPartBuilder.create()
				.uv(0, 0).cuboid(-7.0F, 3.0F, -9.0F, 14.0F, 11.0F, 18.0F)
				.uv(0, 29).cuboid(-6.0F, 0.0F, -9.0F, 12.0F, 4.0F, 9.0F),
			ModelTransform.NONE);
		ModelPartBuilder leg = ModelPartBuilder.create().uv(32, 42).cuboid(-2.0F, 0.0F, -2.0F, 4.0F, 10.0F, 4.0F);
		ModelPartBuilder mirrored = ModelPartBuilder.create().mirrored().uv(32, 42).cuboid(-2.0F, 0.0F, -2.0F, 4.0F, 10.0F, 4.0F);
		root.addChild(EntityModelPartNames.RIGHT_HIND_LEG, leg, ModelTransform.origin(-4.0F, 14.0F, 6.0F));
		root.addChild(EntityModelPartNames.LEFT_HIND_LEG, mirrored, ModelTransform.origin(4.0F, 14.0F, 6.0F));
		root.addChild(EntityModelPartNames.RIGHT_FRONT_LEG, leg, ModelTransform.origin(-4.0F, 14.0F, -6.0F));
		root.addChild(EntityModelPartNames.LEFT_FRONT_LEG, mirrored, ModelTransform.origin(4.0F, 14.0F, -6.0F));
		return TexturedModelData.of(data, 64, 64);
	}
}
