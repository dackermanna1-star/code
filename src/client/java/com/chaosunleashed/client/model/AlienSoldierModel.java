package com.chaosunleashed.client.model;

import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.BipedEntityModel;
import net.minecraft.client.render.entity.model.EntityModelPartNames;
import net.minecraft.client.render.entity.state.BipedEntityRenderState;

/** Alien Soldier (PLACEHOLDER model): huge head, thin body and long arms. Texture: 64x64. */
public class AlienSoldierModel extends BipedEntityModel<BipedEntityRenderState> {
	public AlienSoldierModel(ModelPart root) {
		super(root);
	}

	public static TexturedModelData getTexturedModelData() {
		ModelData data = new ModelData();
		ModelPartData root = data.getRoot();
		ModelPartData head = root.addChild(EntityModelPartNames.HEAD,
			ModelPartBuilder.create().uv(0, 0).cuboid(-5.0F, -10.0F, -5.0F, 10.0F, 10.0F, 10.0F), ModelTransform.origin(0.0F, 0.0F, 0.0F));
		head.addChild(EntityModelPartNames.HAT, ModelPartBuilder.create(), ModelTransform.NONE);
		root.addChild(EntityModelPartNames.BODY,
			ModelPartBuilder.create().uv(40, 0).cuboid(-3.0F, 0.0F, -2.0F, 6.0F, 12.0F, 4.0F), ModelTransform.origin(0.0F, 0.0F, 0.0F));
		root.addChild(EntityModelPartNames.RIGHT_ARM,
			ModelPartBuilder.create().uv(0, 20).cuboid(-2.0F, -2.0F, -1.5F, 3.0F, 14.0F, 3.0F), ModelTransform.origin(-4.0F, 2.0F, 0.0F));
		root.addChild(EntityModelPartNames.LEFT_ARM,
			ModelPartBuilder.create().uv(0, 20).mirrored().cuboid(-1.0F, -2.0F, -1.5F, 3.0F, 14.0F, 3.0F), ModelTransform.origin(4.0F, 2.0F, 0.0F));
		root.addChild(EntityModelPartNames.RIGHT_LEG,
			ModelPartBuilder.create().uv(12, 20).cuboid(-1.5F, 0.0F, -1.5F, 3.0F, 12.0F, 3.0F), ModelTransform.origin(-1.6F, 12.0F, 0.0F));
		root.addChild(EntityModelPartNames.LEFT_LEG,
			ModelPartBuilder.create().uv(12, 20).mirrored().cuboid(-1.5F, 0.0F, -1.5F, 3.0F, 12.0F, 3.0F), ModelTransform.origin(1.6F, 12.0F, 0.0F));
		return TexturedModelData.of(data, 64, 64);
	}
}
