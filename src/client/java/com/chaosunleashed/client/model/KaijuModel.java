package com.chaosunleashed.client.model;

import com.chaosunleashed.client.render.entity.KaijuRenderer;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.EntityModel;
import net.minecraft.util.math.MathHelper;

/**
 * Kaiju (PLACEHOLDER model): a bipedal dinosaur-like monster with back spikes and a long tail, modelled ~74 px
 * tall and scaled 20x by the renderer (~92 blocks). Texture: 128x128.
 */
public class KaijuModel extends EntityModel<KaijuRenderer.State> {
	private final ModelPart body;
	private final ModelPart head;
	private final ModelPart jaw;
	private final ModelPart leftLeg;
	private final ModelPart rightLeg;
	private final ModelPart leftShin;
	private final ModelPart rightShin;
	private final ModelPart leftArm;
	private final ModelPart rightArm;
	private final ModelPart tail;
	private final ModelPart tail2;
	private final ModelPart tail3;

	public KaijuModel(ModelPart root) {
		super(root);
		this.body = root.getChild("body");
		this.head = root.getChild("head");
		this.jaw = this.head.getChild("jaw");
		this.leftLeg = root.getChild("left_leg");
		this.rightLeg = root.getChild("right_leg");
		this.leftShin = this.leftLeg.getChild("shin");
		this.rightShin = this.rightLeg.getChild("shin");
		this.leftArm = root.getChild("left_arm");
		this.rightArm = root.getChild("right_arm");
		this.tail = root.getChild("tail");
		this.tail2 = this.tail.getChild("tail2");
		this.tail3 = this.tail2.getChild("tail3");
	}

	public static TexturedModelData getTexturedModelData() {
		ModelData data = new ModelData();
		ModelPartData root = data.getRoot();
		root.addChild("body", ModelPartBuilder.create()
				.uv(0, 0).cuboid(-10.0F, -26.0F, -8.0F, 20.0F, 30.0F, 16.0F)
				.uv(104, 78).cuboid(-1.0F, -30.0F, 6.0F, 2.0F, 6.0F, 4.0F)
				.uv(104, 78).cuboid(-1.0F, -22.0F, 7.0F, 2.0F, 6.0F, 4.0F)
				.uv(104, 78).cuboid(-1.0F, -14.0F, 7.0F, 2.0F, 6.0F, 4.0F)
				.uv(104, 78).cuboid(-1.0F, -6.0F, 7.0F, 2.0F, 6.0F, 4.0F),
			ModelTransform.of(0.0F, -14.0F, 2.0F, 0.2F, 0.0F, 0.0F));
		ModelPartData head = root.addChild("head", ModelPartBuilder.create()
				.uv(72, 0).cuboid(-6.0F, -10.0F, -16.0F, 12.0F, 10.0F, 16.0F),
			ModelTransform.origin(0.0F, -40.0F, -6.0F));
		head.addChild("jaw", ModelPartBuilder.create().uv(72, 26).cuboid(-5.0F, 0.0F, -14.0F, 10.0F, 3.0F, 14.0F),
			ModelTransform.origin(0.0F, 0.0F, -2.0F));
		ModelPartBuilder thigh = ModelPartBuilder.create().uv(0, 46).cuboid(-5.0F, 0.0F, -6.0F, 10.0F, 16.0F, 12.0F);
		ModelPartBuilder shin = ModelPartBuilder.create()
			.uv(44, 46).cuboid(-4.0F, 0.0F, -5.0F, 8.0F, 20.0F, 9.0F)
			.uv(78, 46).cuboid(-5.0F, 18.0F, -9.0F, 10.0F, 2.0F, 14.0F);
		ModelPartData leftLeg = root.addChild("left_leg", thigh, ModelTransform.origin(7.0F, -12.0F, 2.0F));
		leftLeg.addChild("shin", shin, ModelTransform.origin(0.0F, 16.0F, 0.0F));
		ModelPartData rightLeg = root.addChild("right_leg", thigh, ModelTransform.origin(-7.0F, -12.0F, 2.0F));
		rightLeg.addChild("shin", shin, ModelTransform.origin(0.0F, 16.0F, 0.0F));
		ModelPartBuilder arm = ModelPartBuilder.create().uv(78, 62).cuboid(-2.0F, 0.0F, -2.0F, 4.0F, 12.0F, 4.0F);
		root.addChild("left_arm", arm, ModelTransform.of(11.0F, -34.0F, -4.0F, -0.6F, 0.0F, 0.0F));
		root.addChild("right_arm", arm, ModelTransform.of(-11.0F, -34.0F, -4.0F, -0.6F, 0.0F, 0.0F));
		ModelPartData tail = root.addChild("tail", ModelPartBuilder.create().uv(0, 77).cuboid(-6.0F, -6.0F, 0.0F, 12.0F, 12.0F, 16.0F),
			ModelTransform.of(0.0F, -14.0F, 9.0F, 0.35F, 0.0F, 0.0F));
		ModelPartData tail2 = tail.addChild("tail2", ModelPartBuilder.create().uv(56, 78).cuboid(-4.0F, -4.0F, 0.0F, 8.0F, 8.0F, 16.0F),
			ModelTransform.of(0.0F, 0.0F, 15.0F, 0.15F, 0.0F, 0.0F));
		tail2.addChild("tail3", ModelPartBuilder.create().uv(0, 105).cuboid(-2.0F, -2.0F, 0.0F, 4.0F, 4.0F, 14.0F),
			ModelTransform.of(0.0F, 0.0F, 15.0F, 0.1F, 0.0F, 0.0F));
		return TexturedModelData.of(data, 128, 128);
	}

	@Override
	public void setAngles(KaijuRenderer.State state) {
		super.setAngles(state);
		float walk = state.walking ? 1.0F : 0.0F;
		float phase = state.age * 0.092F;
		float swing = MathHelper.sin(phase) * 0.35F * walk;
		this.leftLeg.pitch = swing;
		this.rightLeg.pitch = -swing;
		this.leftShin.pitch = Math.max(0.0F, -MathHelper.cos(phase)) * 0.3F * walk;
		this.rightShin.pitch = Math.max(0.0F, MathHelper.cos(phase)) * 0.3F * walk;
		this.leftArm.pitch = -0.6F - swing * 0.4F;
		this.rightArm.pitch = -0.6F + swing * 0.4F;
		this.body.roll = MathHelper.sin(phase) * 0.03F * walk;
		this.tail.yaw = MathHelper.sin(phase * 0.5F) * 0.18F;
		this.tail2.yaw = MathHelper.sin(phase * 0.5F - 0.6F) * 0.2F;
		this.tail3.yaw = MathHelper.sin(phase * 0.5F - 1.2F) * 0.25F;
		float roar = state.roarProgress;
		this.head.pitch = -0.35F * roar + MathHelper.sin(phase * 2.0F) * 0.03F * walk;
		this.head.yaw = MathHelper.sin(state.age * 0.02F) * 0.15F;
		this.jaw.pitch = Math.max(0.7F * roar, state.beaming ? 0.5F : 0.05F);
	}
}
