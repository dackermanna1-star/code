package dev.juukulius.client.render.player;

import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/**
 * The Royal Guard uniform's 3D pieces that a skin cannot express: Julius's long fringe strand and side locks, the high
 * collar, shoulder pieces, the long white coat (two hinged segments with royal-blue lining) and its front tails, the belt,
 * the scabbard on his left hip (with the hilt when the sword is sheathed) and the royal-blue cuffs.
 * <p>
 * Being a {@link HumanoidModel}, it is posed from the same render state as the player model (including Julius's
 * animations), so every piece stays attached through every swing. Cloth and hair add spring physics on top.
 * <p>
 * The texOffs/addBox values are parsed by {@code tools/gen_textures.py} to paint {@code outfit.png}; keep one box per line.
 */
public class JuliusOutfitModel extends HumanoidModel<AvatarRenderState> {
	public static final int TEXTURE_WIDTH = 128;
	public static final int TEXTURE_HEIGHT = 64;

	private final ModelPart hairStrand;
	private final ModelPart hairSideRight;
	private final ModelPart hairSideLeft;
	private final ModelPart coatUpper;
	private final ModelPart coatLower;
	private final ModelPart flapRight;
	private final ModelPart flapLeft;
	private final ModelPart scabbardHilt;

	public JuliusOutfitModel(ModelPart root) {
		super(root, RenderTypes::entityTranslucent);
		this.hairStrand = this.head.getChild("hair_strand");
		this.hairSideRight = this.head.getChild("hair_side_right");
		this.hairSideLeft = this.head.getChild("hair_side_left");
		this.coatUpper = this.body.getChild("coat_upper");
		this.coatLower = this.coatUpper.getChild("coat_lower");
		this.flapRight = this.body.getChild("flap_right");
		this.flapLeft = this.body.getChild("flap_left");
		this.scabbardHilt = this.body.getChild("scabbard").getChild("scabbard_hilt");
	}

	public static LayerDefinition createLayer(boolean slim) {
		MeshDefinition mesh = HumanoidModel.createMesh(CubeDeformation.NONE, 0.0F);
		PartDefinition root = mesh.getRoot().clearRecursively();
		PartDefinition head = root.getChild("head");
		PartDefinition body = root.getChild("body");
		PartDefinition rightArm = root.getChild("right_arm");
		PartDefinition leftArm = root.getChild("left_arm");

		// Hair
		head.addOrReplaceChild("hair_strand", CubeListBuilder.create().texOffs(0, 0).addBox(-0.5F, 0.0F, -0.5F, 1.0F, 5.0F, 1.0F),
			PartPose.offsetAndRotation(0.25F, -6.6F, -4.65F, -0.08F, 0.0F, 0.0F));
		head.addOrReplaceChild("hair_side_right", CubeListBuilder.create().texOffs(4, 0).addBox(-0.5F, 0.0F, -1.5F, 1.0F, 5.0F, 3.0F),
			PartPose.offset(-4.45F, -6.6F, -1.2F));
		head.addOrReplaceChild("hair_side_left", CubeListBuilder.create().texOffs(12, 0).addBox(-0.5F, 0.0F, -1.5F, 1.0F, 5.0F, 3.0F),
			PartPose.offset(4.45F, -6.6F, -1.2F));
		head.addOrReplaceChild("hair_back", CubeListBuilder.create().texOffs(20, 0).addBox(-4.5F, 0.0F, -0.5F, 9.0F, 3.5F, 1.0F),
			PartPose.offset(0.0F, -3.8F, 4.45F));

		// High collar
		body.addOrReplaceChild("collar_back", CubeListBuilder.create().texOffs(40, 0).addBox(-4.6F, -2.6F, -0.4F, 9.2F, 2.6F, 0.8F),
			PartPose.offset(0.0F, 0.2F, 2.6F));
		body.addOrReplaceChild("collar_right", CubeListBuilder.create().texOffs(60, 0).addBox(-0.4F, -2.6F, -2.4F, 0.8F, 2.6F, 4.8F),
			PartPose.offset(-4.7F, 0.2F, 0.2F));
		body.addOrReplaceChild("collar_left", CubeListBuilder.create().texOffs(72, 0).addBox(-0.4F, -2.6F, -2.4F, 0.8F, 2.6F, 4.8F),
			PartPose.offset(4.7F, 0.2F, 0.2F));

		// Long coat (white outside, royal-blue lining) in two hinged segments, and its two front tails
		PartDefinition coatUpper = body.addOrReplaceChild("coat_upper", CubeListBuilder.create().texOffs(0, 10).addBox(-5.2F, 0.0F, 0.0F, 10.4F, 10.0F, 0.8F),
			PartPose.offset(0.0F, 0.3F, 2.35F));
		coatUpper.addOrReplaceChild("coat_lower", CubeListBuilder.create().texOffs(24, 10).addBox(-5.4F, 0.0F, 0.0F, 10.8F, 11.0F, 0.8F),
			PartPose.offset(0.0F, 10.0F, 0.0F));
		body.addOrReplaceChild("flap_right", CubeListBuilder.create().texOffs(48, 10).addBox(-1.6F, 0.0F, -0.35F, 3.2F, 13.0F, 0.7F),
			PartPose.offset(-2.7F, 7.9F, -2.45F));
		body.addOrReplaceChild("flap_left", CubeListBuilder.create().texOffs(56, 10).addBox(-1.6F, 0.0F, -0.35F, 3.2F, 13.0F, 0.7F),
			PartPose.offset(2.7F, 7.9F, -2.45F));

		// Belt and scabbard (left hip) with the hilt shown while the sword is sheathed
		body.addOrReplaceChild("belt", CubeListBuilder.create().texOffs(64, 10).addBox(-4.35F, 0.0F, -2.35F, 8.7F, 1.4F, 4.7F),
			PartPose.offset(0.0F, 7.4F, 0.0F));
		PartDefinition scabbard = body.addOrReplaceChild("scabbard", CubeListBuilder.create().texOffs(92, 10).addBox(-0.5F, 0.0F, -0.7F, 1.0F, 13.0F, 1.4F),
			PartPose.offsetAndRotation(4.75F, 8.4F, 0.9F, 0.6F, 0.0F, -0.08F));
		PartDefinition hilt = scabbard.addOrReplaceChild("scabbard_hilt", CubeListBuilder.create(), PartPose.ZERO);
		hilt.addOrReplaceChild("hilt_grip", CubeListBuilder.create().texOffs(98, 10).addBox(-0.4F, -3.6F, -0.4F, 0.8F, 3.6F, 0.8F), PartPose.ZERO);
		hilt.addOrReplaceChild("hilt_guard", CubeListBuilder.create().texOffs(102, 10).addBox(-1.7F, -0.7F, -0.45F, 3.4F, 0.7F, 0.9F), PartPose.ZERO);
		hilt.addOrReplaceChild("hilt_pommel", CubeListBuilder.create().texOffs(112, 10).addBox(-0.6F, -4.6F, -0.6F, 1.2F, 1.0F, 1.2F), PartPose.ZERO);

		// Shoulder pieces and royal-blue cuffs
		float armWidth = slim ? 4.0F : 5.0F;
		float cuffWidth = slim ? 3.6F : 4.6F;
		rightArm.addOrReplaceChild("pauldron_right", CubeListBuilder.create().texOffs(0, 26).addBox(slim ? -2.5F : -3.5F, -2.5F, -2.5F, armWidth, 3.0F, 5.0F),
			PartPose.ZERO);
		leftArm.addOrReplaceChild("pauldron_left", CubeListBuilder.create().texOffs(20, 26).addBox(-1.5F, -2.5F, -2.5F, armWidth, 3.0F, 5.0F), PartPose.ZERO);
		rightArm.addOrReplaceChild("cuff_right", CubeListBuilder.create().texOffs(40, 26).addBox(slim ? -2.3F : -3.3F, 6.8F, -2.3F, cuffWidth, 2.4F, 4.6F),
			PartPose.ZERO);
		leftArm.addOrReplaceChild("cuff_left", CubeListBuilder.create().texOffs(60, 26).addBox(-1.3F, 6.8F, -2.3F, cuffWidth, 2.4F, 4.6F), PartPose.ZERO);

		return LayerDefinition.create(mesh, TEXTURE_WIDTH, TEXTURE_HEIGHT);
	}

	@Override
	public void setupAnim(AvatarRenderState state) {
		super.setupAnim(state);
		JuliusRenderInfo info = state.getData(JuliusRenderInfo.INFO);
		float hairPitch = info != null ? info.hairPitch : 0.0F;
		float hairRoll = info != null ? info.hairRoll : 0.0F;
		float coatSpring = info != null ? info.coatPitch : 0.0F;
		float coatRoll = info != null ? info.coatRoll : 0.0F;
		float time = info != null ? info.time : 0.0F;

		this.hairStrand.xRot = -0.08F + hairPitch * 0.6F + Mth.sin(time * 1.3F) * 0.03F;
		this.hairStrand.zRot = hairRoll * 0.7F;
		this.hairSideRight.zRot = Math.max(0.0F, hairRoll) * 0.3F;
		this.hairSideLeft.zRot = Math.min(0.0F, hairRoll) * 0.3F;
		this.hairSideRight.xRot = hairPitch * 0.2F;
		this.hairSideLeft.xRot = hairPitch * 0.2F;

		// The coat billows from the same motion data as the vanilla cape, plus a softer spring for the lower hem.
		float legPush = Math.max(0.0F, Math.max(this.rightLeg.xRot, this.leftLeg.xRot)) * 0.55F;
		float capeAngle = (6.0F + state.capeLean / 2.0F + state.capeFlap) * Mth.DEG_TO_RAD;
		this.coatUpper.xRot = Math.max(legPush, capeAngle * 0.7F) + (state.isCrouching ? 0.25F : 0.0F);
		this.coatUpper.zRot = state.capeLean2 * 0.5F * Mth.DEG_TO_RAD + coatRoll * 0.25F;
		this.coatLower.xRot = Mth.clamp(coatSpring * 0.55F + state.capeLean * 0.12F * Mth.DEG_TO_RAD, -0.15F, 0.9F)
			+ Mth.sin(time * 2.0F + state.walkAnimationPos * 0.3F) * 0.03F;
		this.coatLower.zRot = coatRoll * 0.2F;

		// The front tails stay ahead of the legs as they swing forward.
		this.flapRight.xRot = Math.min(0.0F, this.rightLeg.xRot) * 1.05F + Math.max(0.0F, this.rightLeg.xRot) * 0.3F - coatSpring * 0.08F;
		this.flapLeft.xRot = Math.min(0.0F, this.leftLeg.xRot) * 1.05F + Math.max(0.0F, this.leftLeg.xRot) * 0.3F - coatSpring * 0.08F;
		this.flapRight.zRot = 0.04F + Math.max(0.0F, coatRoll) * 0.15F;
		this.flapLeft.zRot = -0.04F + Math.min(0.0F, coatRoll) * 0.15F;

		this.scabbardHilt.visible = info != null && info.swordSheathed;
	}
}
