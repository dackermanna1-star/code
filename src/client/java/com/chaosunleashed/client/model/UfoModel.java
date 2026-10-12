package com.chaosunleashed.client.model;

import com.chaosunleashed.client.render.entity.UfoRenderer;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.EntityModel;

/**
 * Flying saucer (PLACEHOLDER model): two stacked octagonal discs (box + 45° rotated box), a glass dome, a beam
 * emitter underneath and a ring of lights that spins. Designed at half scale; the renderer scales it by 2.
 * Texture: 256x128.
 */
public class UfoModel extends EntityModel<UfoRenderer.State> {
	private final ModelPart lights;

	public UfoModel(ModelPart root) {
		super(root);
		this.lights = root.getChild("lights");
	}

	public static TexturedModelData getTexturedModelData() {
		ModelData data = new ModelData();
		ModelPartData root = data.getRoot();
		ModelTransform rotated = ModelTransform.of(0.0F, 0.0F, 0.0F, 0.0F, (float) (Math.PI / 4), 0.0F);
		root.addChild("rim", ModelPartBuilder.create().uv(0, 0).cuboid(-20.0F, 16.0F, -20.0F, 40.0F, 3.0F, 40.0F), ModelTransform.NONE);
		root.addChild("rim_rotated", ModelPartBuilder.create().uv(0, 0).cuboid(-20.0F, 16.01F, -20.0F, 40.0F, 3.0F, 40.0F), rotated);
		root.addChild("top", ModelPartBuilder.create().uv(0, 43).cuboid(-12.0F, 13.0F, -12.0F, 24.0F, 3.0F, 24.0F), ModelTransform.NONE);
		root.addChild("top_rotated", ModelPartBuilder.create().uv(0, 43).cuboid(-12.0F, 13.01F, -12.0F, 24.0F, 3.0F, 24.0F), rotated);
		root.addChild("dome", ModelPartBuilder.create().uv(96, 43).cuboid(-6.0F, 7.0F, -6.0F, 12.0F, 6.0F, 12.0F), ModelTransform.NONE);
		root.addChild("bottom", ModelPartBuilder.create().uv(0, 70).cuboid(-10.0F, 19.0F, -10.0F, 20.0F, 2.0F, 20.0F), ModelTransform.NONE);
		root.addChild("bottom_rotated", ModelPartBuilder.create().uv(0, 70).cuboid(-10.0F, 19.01F, -10.0F, 20.0F, 2.0F, 20.0F), rotated);
		root.addChild("emitter", ModelPartBuilder.create().uv(80, 70).cuboid(-3.0F, 21.0F, -3.0F, 6.0F, 1.0F, 6.0F), ModelTransform.NONE);
		ModelPartBuilder lights = ModelPartBuilder.create();
		for (int i = 0; i < 8; i++) {
			double angle = i * Math.PI / 4.0;
			float x = (float) (Math.cos(angle) * 18.5);
			float z = (float) (Math.sin(angle) * 18.5);
			lights.uv(144, 43).cuboid(x - 1.0F, 17.0F, z - 1.0F, 2.0F, 2.0F, 2.0F);
		}
		root.addChild("lights", lights, ModelTransform.NONE);
		return TexturedModelData.of(data, 256, 128);
	}

	@Override
	public void setAngles(UfoRenderer.State state) {
		super.setAngles(state);
		this.lights.yaw = -state.age * 0.12F;
	}
}
