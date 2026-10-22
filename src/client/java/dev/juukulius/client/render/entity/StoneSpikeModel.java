package dev.juukulius.client.render.entity;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.rendertype.RenderTypes;

/** A jagged stone spire: stacked, tapering, slightly twisted blocks with two shards at its foot. Points up (−Y in model space). */
public class StoneSpikeModel extends EntityModel<StoneSpikeRenderState> {
	private final ModelPart spire;

	public StoneSpikeModel(ModelPart root) {
		super(root, RenderTypes::entityCutoutNoCull);
		this.spire = root.getChild("spire");
	}

	public static LayerDefinition createLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition spire = root.addOrReplaceChild("spire", CubeListBuilder.create(), PartPose.offset(0.0F, 24.0F, 0.0F));
		spire.addOrReplaceChild("base", CubeListBuilder.create().texOffs(0, 0).addBox(-3.5F, -6.0F, -3.5F, 7.0F, 6.0F, 7.0F),
			PartPose.rotation(0.0F, 0.2F, 0.0F));
		spire.addOrReplaceChild("middle", CubeListBuilder.create().texOffs(0, 13).addBox(-2.5F, -7.0F, -2.5F, 5.0F, 7.0F, 5.0F),
			PartPose.offsetAndRotation(0.2F, -6.0F, -0.1F, 0.05F, 0.6F, -0.04F));
		spire.addOrReplaceChild("upper", CubeListBuilder.create().texOffs(20, 13).addBox(-1.5F, -7.0F, -1.5F, 3.0F, 7.0F, 3.0F),
			PartPose.offsetAndRotation(-0.1F, -12.8F, 0.2F, -0.06F, 1.1F, 0.05F));
		spire.addOrReplaceChild("tip", CubeListBuilder.create().texOffs(28, 0).addBox(-0.5F, -4.0F, -0.5F, 1.0F, 4.0F, 1.0F),
			PartPose.offsetAndRotation(0.1F, -19.5F, 0.0F, 0.08F, 0.4F, -0.05F));
		spire.addOrReplaceChild("shard_a", CubeListBuilder.create().texOffs(0, 25).addBox(-1.0F, -4.0F, -1.0F, 2.0F, 4.0F, 2.0F),
			PartPose.offsetAndRotation(3.8F, 0.0F, 1.5F, 0.3F, 0.5F, 0.45F));
		spire.addOrReplaceChild("shard_b", CubeListBuilder.create().texOffs(8, 25).addBox(-1.0F, -3.0F, -1.0F, 2.0F, 3.0F, 2.0F),
			PartPose.offsetAndRotation(-3.6F, 0.0F, -1.8F, -0.35F, 0.9F, -0.4F));
		return LayerDefinition.create(mesh, 48, 32);
	}

	@Override
	public void setupAnim(StoneSpikeRenderState state) {
		super.setupAnim(state);
		this.spire.yRot = state.spin * ((float) Math.PI / 180.0F);
	}
}
