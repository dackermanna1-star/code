package com.jjkshowdown.client.render.model;

import com.jjkshowdown.JjkShowdown;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/**
 * Player-layout humanoid (64x64 skins with outer layers) plus a second pair of arms for Sukuna's Heian-era form.
 */
public class SorcererModel extends HumanoidModel<SorcererRenderState> {
	public static final ModelLayerLocation LAYER = new ModelLayerLocation(JjkShowdown.id("sorcerer"), "main");
	private final ModelPart lowerRightArm;
	private final ModelPart lowerLeftArm;

	public SorcererModel(ModelPart root) {
		super(root, RenderTypes::entityTranslucent);
		this.lowerRightArm = root.getChild("lower_right_arm");
		this.lowerLeftArm = root.getChild("lower_left_arm");
	}

	public static LayerDefinition createLayer() {
		MeshDefinition mesh = PlayerModel.createMesh(CubeDeformation.NONE, false);
		PartDefinition root = mesh.getRoot();
		PartDefinition lr = root.addOrReplaceChild("lower_right_arm",
				CubeListBuilder.create().texOffs(40, 16).addBox(-3.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(-4.6F, 7.0F, 0.0F));
		lr.addOrReplaceChild("lower_right_sleeve",
				CubeListBuilder.create().texOffs(40, 32).addBox(-3.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F, new CubeDeformation(0.25F)), PartPose.ZERO);
		PartDefinition ll = root.addOrReplaceChild("lower_left_arm",
				CubeListBuilder.create().texOffs(32, 48).addBox(-1.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(4.6F, 7.0F, 0.0F));
		ll.addOrReplaceChild("lower_left_sleeve",
				CubeListBuilder.create().texOffs(48, 48).addBox(-1.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F, new CubeDeformation(0.25F)), PartPose.ZERO);
		return LayerDefinition.create(mesh, 64, 64);
	}

	@Override
	public void setupAnim(SorcererRenderState s) {
		super.setupAnim(s);
		boolean extra = s.heian;
		lowerRightArm.visible = extra;
		lowerLeftArm.visible = extra;
		if (extra) {
			float swing = Mth.cos(s.walkAnimationPos * 0.6662F) * s.walkAnimationSpeed;
			lowerRightArm.xRot = rightArm.xRot * 0.6f - 0.25f - swing * 0.3f;
			lowerRightArm.yRot = rightArm.yRot * 0.5f;
			lowerRightArm.zRot = 0.35f + Mth.sin(s.ageInTicks * 0.08f) * 0.05f;
			lowerLeftArm.xRot = leftArm.xRot * 0.6f - 0.25f + swing * 0.3f;
			lowerLeftArm.yRot = leftArm.yRot * 0.5f;
			lowerLeftArm.zRot = -0.35f - Mth.sin(s.ageInTicks * 0.08f) * 0.05f;
			lowerRightArm.y = body.y + 7.0f;
			lowerLeftArm.y = body.y + 7.0f;
		}
	}
}
